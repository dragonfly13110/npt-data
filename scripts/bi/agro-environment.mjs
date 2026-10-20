import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const AGRO_DATASETS = {
  public_soil_water: {
    title: 'ความชื้นดินและ ET₀ จากแบบจำลอง',
    types: {
      district_code: 'text',
      district: 'text',
      date: 'text',
      period_type: 'text',
      soil_moisture_m3m3: 'number',
      et0_mm: 'number',
      rain_mm: 'number',
      latitude: 'number',
      longitude: 'number',
      source: 'text',
    },
  },
  public_ndvi_classes: {
    title: 'ช่วงค่า NDVI จากภาพ NPT แยกอำเภอ',
    types: {
      district_code: 'text',
      district: 'text',
      observed_at: 'text',
      class_order: 'number',
      ndvi_class: 'text',
      pixel_count: 'number',
      valid_pixels: 'number',
      district_pixels: 'number',
      source: 'text',
    },
  },
  public_flood_monitor: {
    title: 'พื้นที่น้ำท่วมที่ GISTDA รายงาน',
    types: {
      district_code: 'text',
      district: 'text',
      period: 'text',
      flood_rai: 'number',
      rice_rai: 'number',
      source_status: 'text',
      source_date: 'text',
      fetched_at: 'text',
      source: 'text',
    },
  },
};
const base = 'https://npt-dashboard.netlify.app';
const number = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const directory = path.dirname(fileURLToPath(import.meta.url));

async function json(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw Error('Source HTTP ' + response.status);
  return response.json();
}

export function flattenSoilWater(payload, districts, today) {
  assert(
    Array.isArray(payload) && payload.length === districts.length,
    'Incomplete weather locations'
  );
  return payload.flatMap((p, i) => {
    assert(
      p.timezone === 'Asia/Bangkok' &&
        Array.isArray(p.daily?.time) &&
        Array.isArray(p.hourly?.time),
      'Invalid weather schema'
    );
    assert.equal(p.hourly_units?.soil_moisture_9_to_27cm, 'm³/m³');
    assert.equal(p.daily_units?.et0_fao_evapotranspiration, 'mm');
    for (const key of ['et0_fao_evapotranspiration', 'precipitation_sum'])
      assert.equal(p.daily[key]?.length, p.daily.time.length);
    assert.equal(
      p.hourly.soil_moisture_9_to_27cm?.length,
      p.hourly.time.length
    );
    return p.daily.time.map((date, index) => {
      const values = p.hourly.time.flatMap((t, j) =>
        t.startsWith(date) &&
        number(p.hourly.soil_moisture_9_to_27cm[j]) !== null
          ? [p.hourly.soil_moisture_9_to_27cm[j]]
          : []
      );
      assert(
        values.every((v) => v >= 0 && v <= 1),
        'Invalid soil moisture'
      );
      return {
        ...districts[i],
        date,
        period_type:
          date >= today ? 'คาดการณ์จากแบบจำลอง' : 'ย้อนหลังจากแบบจำลอง',
        soil_moisture_m3m3:
          values.length === 24 ? values.reduce((a, b) => a + b, 0) / 24 : null,
        et0_mm: number(p.daily.et0_fao_evapotranspiration[index]),
        rain_mm: number(p.daily.precipitation_sum[index]),
        latitude: number(p.latitude),
        longitude: number(p.longitude),
        source: 'Open-Meteo · ค่าที่จุดอ้างอิงอำเภอ ไม่ใช่ค่าเฉลี่ยทั้งอำเภอ',
      };
    });
  });
}

export function flattenFlood(payload, districts, period, fetchedAt) {
  assert(Array.isArray(payload.items), 'Invalid flood schema');
  assert.equal(
    payload.numberReturned,
    payload.items.length,
    'Truncated flood response'
  );
  assert.equal(
    payload.numberMatched,
    payload.items.length,
    'Paginated flood response'
  );
  const rows = payload.items.filter((r) => Number(r.provinceCode) === 73);
  assert.equal(
    new Set(rows.map((r) => r.tambonCode)).size,
    rows.length,
    'Duplicate flood tambons'
  );
  return districts.map(({ district_code, district }) => {
    const group = rows.filter((r) => String(r.amphoeCode) === district_code);
    // ponytail: reuse the square-metres-to-rai interpretation of NPT's existing GISTDA archiver.
    const sum = (key) =>
      group.length && group.every((r) => number(r[key]) !== null && r[key] >= 0)
        ? group.reduce((total, r) => total + r[key], 0) / 1600
        : null;
    return {
      district_code,
      district,
      period,
      flood_rai: sum('flood'),
      rice_rai: sum('rice'),
      source_status: group.length
        ? 'เชื่อม API ได้ · ต้นทางไม่ระบุวันภาพ'
        : 'ไม่พบรายการอำเภอในผลตอบกลับ · ไม่แทนด้วยศูนย์',
      source_date: null,
      fetched_at: fetchedAt,
      source: 'GISTDA Disaster Platform · /resources/flood/' + period,
    };
  });
}

export async function collectAgroEnvironment({
  districtsGeo,
  fetcher = fetch,
  now = new Date(),
}) {
  const districts = districtsGeo.features.map((f) => {
    const coords = f.geometry.coordinates.flat(Infinity);
    const xs = coords.filter((_, i) => i % 2 === 0),
      ys = coords.filter((_, i) => i % 2 === 1);
    return {
      district_code: String(f.properties.amp_code),
      district: f.properties.amp_th,
      lat: (Math.min(...ys) + Math.max(...ys)) / 2,
      lon: (Math.min(...xs) + Math.max(...xs)) / 2,
    };
  });
  assert.equal(new Set(districts.map((d) => d.district_code)).size, 7);
  const areas = districts.map(({ district_code, district }) => ({
    district_code,
    district,
  }));
  const fetchedAt = now.toISOString();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
  }).format(now);
  const weather = new URL('https://api.open-meteo.com/v1/forecast');
  weather.search = new URLSearchParams({
    latitude: districts.map((d) => d.lat).join(','),
    longitude: districts.map((d) => d.lon).join(','),
    hourly: 'soil_moisture_9_to_27cm',
    daily: 'et0_fao_evapotranspiration,precipitation_sum',
    past_days: '7',
    forecast_days: '7',
    timezone: 'Asia/Bangkok',
  });
  const data = {
    public_soil_water: flattenSoilWater(
      await json(weather, fetcher),
      areas,
      today
    ),
  };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'npt-ndvi-'));
  try {
    const history = await json(
      base + '/api/public-satellite-ndvi-history?days=90&limit=4',
      fetcher
    );
    assert(
      history.status === 'ok' &&
        Array.isArray(history.scenes) &&
        history.scenes.length,
      'NDVI history unavailable'
    );
    data.public_ndvi_classes = [];
    for (const scene of history.scenes) {
      assert(
        Number.isFinite(Date.parse(scene.datetime)),
        'Missing NDVI acquisition date'
      );
      const response = await fetcher(
        base +
          '/api/public-satellite-ndvi?width=768&height=768&acquiredAt=' +
          encodeURIComponent(scene.datetime),
        { signal: AbortSignal.timeout(45000) }
      );
      assert(
        response.ok &&
          response.headers.get('content-type')?.includes('image/png'),
        'NDVI raster unavailable'
      );
      const bbox = response.headers
        .get('x-satellite-bbox')
        ?.split(',')
        .map(Number);
      assert(
        bbox?.length === 4 && bbox.every(Number.isFinite),
        'Missing raster georeference'
      );
      assert.equal(
        response.headers.get('x-satellite-acquired-at'),
        scene.datetime,
        'NDVI scene mismatch'
      );
      fs.writeFileSync(
        path.join(scratch, 'image.png'),
        Buffer.from(await response.arrayBuffer())
      );
      fs.writeFileSync(
        path.join(scratch, 'config.json'),
        JSON.stringify({ bbox, districts: districtsGeo })
      );
      const stats = JSON.parse(
        execFileSync(
          process.env.PYTHON || 'python',
          [
            path.join(directory, 'ndvi-image-stats.py'),
            path.join(scratch, 'image.png'),
            path.join(scratch, 'config.json'),
          ],
          { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
        )
      );
      data.public_ndvi_classes.push(
        ...stats.map((r) => ({
          ...r,
          observed_at: scene.datetime,
          source:
            'Copernicus Sentinel-2 L2A ผ่านภาพ NPT · ช่วงค่า ไม่ใช่ NDVI เฉลี่ยหรือพื้นที่พืช',
        }))
      );
    }
  } finally {
    assert(
      path.resolve(scratch).startsWith(path.join(os.tmpdir(), 'npt-ndvi-'))
    );
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  data.public_flood_monitor = [];
  for (const period of ['1day', '7days', '30days']) {
    const payload = await json(
      'https://disaster.gistda.or.th/app-api/proxy/resources/flood/' + period,
      fetcher
    );
    data.public_flood_monitor.push(
      ...flattenFlood(payload, areas, period, fetchedAt)
    );
  }
  return Object.fromEntries(
    Object.entries(data).map(([name, rows]) => {
      const types = AGRO_DATASETS[name].types;
      for (const row of rows) {
        assert.deepEqual(
          Object.keys(row).sort(),
          Object.keys(types).sort(),
          'Public field allowlist mismatch'
        );
        assert(
          Object.entries(types).every(
            ([key, type]) =>
              row[key] === null ||
              typeof row[key] === (type === 'number' ? 'number' : 'string')
          ),
          'Unexpected source type'
        );
      }
      return [
        name,
        {
          schemaVersion: 1,
          table: name,
          status: rows.length ? 'ready' : 'empty',
          count: rows.length,
          fetchedAt,
          data: rows,
        },
      ];
    })
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = path.resolve(
    process.argv.includes('--output')
      ? process.argv[process.argv.indexOf('--output') + 1]
      : 'output/bi-pages'
  );
  const geoPath = process.argv.includes('--districts')
    ? process.argv[process.argv.indexOf('--districts') + 1]
    : 'src/data/nakhon_pathom_districts.json';
  const tables = await collectAgroEnvironment({ districtsGeo: read(geoPath) });
  fs.mkdirSync(output, { recursive: true });
  const manifestFile = path.join(output, 'manifest.json');
  const manifest = fs.existsSync(manifestFile)
    ? read(manifestFile)
    : { schemaVersion: 1, tables: [] };
  for (const [name, table] of Object.entries(tables)) {
    const text = JSON.stringify(table) + '\n';
    assert(Buffer.byteLength(text) < 10 * 1024 * 1024);
    fs.writeFileSync(path.join(output, name + '.json'), text);
    const dates = table.data
      .map((r) => r.observed_at || r.date || r.source_date)
      .filter(Boolean)
      .sort();
    manifest.tables = manifest.tables.filter((t) => t.table !== name);
    manifest.tables.push({
      table: name,
      title: AGRO_DATASETS[name].title,
      count: table.count,
      status: table.status,
      fetchedAt: table.fetchedAt,
      dataAsOf: dates.at(-1) || null,
      dataAsOfLabel: dates.at(-1) || 'ต้นทางไม่ระบุวันข้อมูล',
      updateFrequency: 'ตรวจต้นทางตามรอบส่งออก',
      freshnessStatus:
        name === 'public_flood_monitor'
          ? 'ไม่ระบุวันภาพ · วันดึงไม่ใช่วันข้อมูล'
          : 'ตรวจวันข้อมูลและข้อจำกัดในหน้า BI',
      scope: 'ข้อมูลสรุปนครปฐม ไม่มีข้อมูลรายบุคคล',
      bytes: Buffer.byteLength(text),
      sha256: createHash('sha256').update(text).digest('hex'),
    });
  }
  manifest.fetchedAt = new Date().toISOString();
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(tables).map(([name, t]) => [name, t.count])
      )
    )
  );
}
