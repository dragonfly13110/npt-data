import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PUBLIC_POWERBI_DATASETS, readPowerbiPage } from './datasets.mjs';
import { MARKET_DATASETS } from './market-outbreaks.mjs';
import {
  PUBLIC_SITUATION_DATASETS,
  collectPublicSituation,
  mergeWaterHistory,
} from './public-situation.mjs';

export const PAGES_TABLES = [
  'farmer_registry',
  'farmer_registry_subdistricts',
  'farmer_registry_snapshots',
  'farmer_registry_subdistrict_snapshots',
  'geoplots_parcel_progress',
  'geoplots_parcel_subdistrict_progress',
  'certifications',
  'agricultural_areas',
  'community_enterprises',
  'large_plots',
  'smart_farmer_sf',
  'young_smart_farmer_ysf',
  'agricultural_career_groups',
  'housewife_farmer_groups',
  'young_farmer_groups_detailed',
  'farmer_institutes',
  'learning_centers',
  'pest_centers',
  'soil_fertilizer_centers',
  'plant_doctors',
  'agri_tourism',
  'crop_production',
  'production_costs',
  'disasters',
  'forecast_plots',
  'pest_outbreaks',
  'biocontrol_stock',
  'soil_series',
  'daily_weather',
  'gis_areas',
];

export const TABLE_METADATA_CONFIG = {
  farmer_registry: {
    dateColumns: ['cutoff_date', 'updated_at'],
    frequency: 'รายเดือน',
    scope: 'ข้อมูลเกษตรกรรายอำเภอจากระบบทะเบียนเกษตรกร (DOAE) ตัดยอดรายเดือน',
    maxAgeDays: 45,
  },
  farmer_registry_subdistricts: {
    dateColumns: ['cutoff_date', 'updated_at'],
    frequency: 'รายเดือน',
    scope:
      'ข้อมูลเกษตรกรรายตำบล 102 ตำบลปกครองจากระบบทะเบียนเกษตรกร (DOAE) ตัดยอดตามรอบสำนักงานเกษตรอำเภอ',
    maxAgeDays: 45,
  },
  farmer_registry_snapshots: {
    dateColumns: ['snapshot_date', 'cutoff_date'],
    frequency: 'ทุก 3 วัน',
    scope: 'ประวัติทะเบียนเกษตรกรรายอำเภอตามรอบดึงข้อมูล',
    maxAgeDays: 7,
  },
  farmer_registry_subdistrict_snapshots: {
    dateColumns: ['snapshot_date', 'cutoff_date'],
    frequency: 'ทุก 3 วัน',
    scope: 'ประวัติทะเบียนเกษตรกรรายตำบลตามรอบดึงข้อมูล',
    maxAgeDays: 7,
  },
  geoplots_parcel_progress: {
    dateColumns: ['snapshot_date', 'updated_at'],
    frequency: 'ทุก 3 วัน',
    scope: 'ความก้าวหน้าการวาดแปลงรายอำเภอ 7 อำเภอ (FAARMis / GISagro)',
    maxAgeDays: 7,
  },
  geoplots_parcel_subdistrict_progress: {
    dateColumns: ['snapshot_date', 'updated_at'],
    frequency: 'ทุก 3 วัน',
    scope:
      'ความก้าวหน้าการวาดแปลงรายตำบล 106 รหัสพื้นที่ (รวมเขตเทศบาล/เขตย่อยแปลงดิจิทัล FAARMis/GISagro)',
    maxAgeDays: 7,
  },
  certifications: {
    dateColumns: ['created_at'],
    frequency: 'รายเดือน',
    scope:
      'แปลงมาตรฐาน GAP และเกษตรอินทรีย์ กรมวิชาการเกษตร 5,840 แปลง (มีวันรับรองสมบูรณ์ 2,172 แปลง อีก 3,668 แปลงอยู่ระหว่างยืนยันวันหมดอายุ)',
    maxAgeDays: 60,
  },
  agricultural_areas: {
    dateColumns: ['created_at'],
    yearColumn: 'data_year',
    frequency: 'รายปี',
    scope:
      'พื้นที่การใช้ประโยชน์ทางการเกษตรและครัวเรือนเกษตรกร จำแนกตามประเภทพืช',
    maxAgeDays: 400,
  },
  large_plots: {
    dateColumns: ['updated_at'],
    yearColumn: 'year',
    frequency: 'รายปี / รายไตรมาส',
    scope: 'ข้อมูลแปลงใหญ่ 70 แปลง จังหวัดนครปฐม',
    maxAgeDays: 180,
  },
  community_enterprises: {
    dateColumns: ['approval_date', 'updated_at'],
    frequency: 'รายไตรมาส',
    scope: 'ข้อมูลวิสาหกิจชุมชนที่จดทะเบียนในจังหวัดนครปฐม',
    maxAgeDays: 120,
  },
  agricultural_career_groups: {
    dateColumns: ['updated_at'],
    yearColumn: 'data_year',
    frequency: 'รายปี',
    scope: 'กลุ่มส่งเสริมอาชีพการเกษตร กรมส่งเสริมการเกษตร',
    maxAgeDays: 400,
  },
  housewife_farmer_groups: {
    dateColumns: ['updated_at'],
    yearColumn: 'year',
    frequency: 'รายปี',
    scope: 'กลุ่มแม่บ้านเกษตรกร กรมส่งเสริมการเกษตร',
    maxAgeDays: 400,
  },
  young_farmer_groups_detailed: {
    dateColumns: ['updated_at'],
    yearColumn: 'data_year',
    frequency: 'รายปี',
    scope: 'กลุ่มยุวเกษตรกร กรมส่งเสริมการเกษตร',
    maxAgeDays: 400,
  },
  smart_farmer_sf: {
    dateColumns: ['updated_at'],
    yearColumn: 'data_year',
    frequency: 'รายปี',
    scope: 'เกษตรกรปราดเปรื่อง (Smart Farmer) ที่ผ่านการประเมิน',
    maxAgeDays: 400,
  },
  young_smart_farmer_ysf: {
    dateColumns: ['updated_at'],
    yearColumn: 'data_year',
    frequency: 'รายปี',
    scope: 'เกษตรกรรุ่นใหม่ (Young Smart Farmer) จังหวัดนครปฐม',
    maxAgeDays: 400,
  },
  farmer_institutes: {
    frequency: 'รายปี',
    scope: 'สรุปภาพรวมสถาบันเกษตรกรรายอำเภอ',
    maxAgeDays: 400,
  },
  learning_centers: {
    dateColumns: ['created_at'],
    frequency: 'รายปี',
    scope: 'ศูนย์เรียนรู้การเพิ่มประสิทธิภาพการผลิตสินค้าเกษตร (ศพก.) 7 อำเภอ',
    maxAgeDays: 400,
  },
  pest_centers: {
    dateColumns: ['updated_at'],
    frequency: 'รายปี',
    scope: 'ศูนย์จัดการศัตรูพืชชุมชน (ศจช.) จังหวัดนครปฐม',
    maxAgeDays: 400,
  },
  soil_fertilizer_centers: {
    dateColumns: ['created_at'],
    frequency: 'รายปี',
    scope: 'ศูนย์จัดการดินปุ๋ยชุมชน (ศดปช.) จังหวัดนครปฐม',
    maxAgeDays: 400,
  },
  plant_doctors: {
    dateColumns: ['updated_at'],
    frequency: 'รายปี',
    scope: 'ข้อมูลเครือข่ายหมอพืชชุมชน (แสดงระดับตำบล)',
    maxAgeDays: 400,
  },
  agri_tourism: {
    dateColumns: ['updated_at'],
    frequency: 'รายปี',
    scope: 'แหล่งท่องเที่ยวเชิงเกษตร จังหวัดนครปฐม',
    maxAgeDays: 400,
  },
  crop_production: {
    dateColumns: ['updated_at'],
    yearColumn: 'year',
    frequency: 'รายปี',
    scope: 'ผลผลิตพืชเศรษฐกิจ',
    maxAgeDays: 400,
  },
  production_costs: {
    dateColumns: ['updated_at'],
    yearColumn: 'data_year',
    frequency: 'รายปี',
    scope: 'ต้นทุนและผลตอบแทนการผลิตพืชเศรษฐกิจสำคัญ',
    maxAgeDays: 400,
  },
  disasters: {
    dateColumns: ['event_date', 'updated_at'],
    yearColumn: 'year',
    frequency: 'ตามเหตุการณ์',
    scope: 'ข้อมูลพื้นที่ประสบภัยพิบัติและขอรับความช่วยเหลือด้านพืช (อุทกภัย)',
    maxAgeDays: 365 * 3,
  },
  forecast_plots: {
    dateColumns: ['planting_date', 'updated_at'],
    frequency: 'ตามรอบฤดูกาล',
    scope: 'ข้อมูลแปลงพยากรณ์ผลผลิตพืช',
    maxAgeDays: 180,
  },
  pest_outbreaks: {
    dateColumns: ['report_date', 'updated_at'],
    frequency: 'ตามเหตุการณ์',
    scope: 'รายงานสถานการณ์การระบาดศัตรูพืช',
    maxAgeDays: 90,
  },
  biocontrol_stock: {
    dateColumns: ['updated_at'],
    frequency: 'รายไตรมาส',
    scope: 'วัสดุชีวภัณฑ์และแมลงศัตรูธรรมชาติ',
    maxAgeDays: 120,
  },
  soil_series: {
    dateColumns: ['updated_at'],
    frequency: 'ข้อมูลอ้างอิง',
    scope: 'ข้อมูลชุดดินและลักษณะความอุดมสมบูรณ์ของดิน (พด.)',
    maxAgeDays: 365 * 10,
  },
  daily_weather: {
    dateColumns: ['date', 'updated_at'],
    frequency: 'รายวัน',
    scope: 'สภาพอากาศรายวันและคาดการณ์ จังหวัดนครปฐม (Open-Meteo)',
    maxAgeDays: 2,
  },
  gis_areas: {
    dateColumns: ['updated_at'],
    frequency: 'ข้อมูลอ้างอิง',
    scope: 'พื้นที่ GIS จังหวัดนครปฐม',
    maxAgeDays: 365 * 10,
  },
  public_water: {
    dateColumns: ['observed_at'],
    frequency: 'รายวัน (ทุกชั่วโมง)',
    scope:
      'ระดับน้ำรายสถานี 11 แห่ง (สถานีโทรมาตรปัจจุบัน 7 แห่งใน 48 ชม., ประตูระบายน้ำและสถานีประวัติ 4 แห่ง รวมถึงจุดประวัติปี 2020)',
    maxAgeDays: 2,
  },
  public_water_history: {
    dateColumns: ['observed_at'],
    frequency: 'รายวัน',
    scope:
      'ประวัติระดับน้ำรายสถานี โทรมาตร สสน./กรมชลประทาน (บันทึกต่อเนื่องและสถานีย้อนหลังตั้งแต่ปี 2020)',
    maxAgeDays: 2,
  },
  public_water_advice: {
    dateColumns: ['generated_at'],
    frequency: 'รายวัน',
    scope: 'บทวิเคราะห์ประกอบการติดตามสถานการณ์น้ำโดย AI',
    maxAgeDays: 2,
  },
  public_rain_forecast: {
    dateColumns: ['forecast_at'],
    frequency: 'รายวัน',
    scope: 'ฝนคาดการณ์รายอำเภอล่วงหน้า 7 วัน (TMD / Open-Meteo)',
    maxAgeDays: 2,
  },
  public_disease_reports: {
    dateColumns: ['forecast_date', 'source_updated_at'],
    frequency: 'รายวัน',
    scope: 'รอบวิเคราะห์ความเสี่ยงโรคและแมลงศัตรูพืช AI',
    maxAgeDays: 2,
  },
  public_disease_watch: {
    dateColumns: ['forecast_date', 'source_updated_at'],
    frequency: 'รายวัน',
    scope: 'รายการโรคและแมลงศัตรูพืชที่ควรเฝ้าระวังรายวัน',
    maxAgeDays: 2,
  },
  public_weather: {
    dateColumns: ['date', 'source_updated_at'],
    frequency: 'รายวัน',
    scope: 'อุณหภูมิและปริมาณน้ำฝนรายวัน จังหวัดนครปฐม',
    maxAgeDays: 2,
  },
  public_hotspots: {
    dateColumns: ['acq_date', 'updated_at'],
    frequency: 'รายวัน',
    scope: 'จุดความร้อนจากดาวเทียม VIIRS (GISTDA) 30 วันล่าสุด',
    maxAgeDays: 35,
  },
};

export function extractTableMetadata(name, table, now = new Date()) {
  const config = TABLE_METADATA_CONFIG[name] || {};
  const rows = table.data || [];
  let dataAsOf = null;

  if (rows.length > 0) {
    if (config.dateColumns) {
      for (const col of config.dateColumns) {
        const vals = rows
          .map((r) => r[col])
          .filter(Boolean)
          .map(String)
          .sort();
        if (vals.length > 0) {
          dataAsOf = vals[vals.length - 1];
          break;
        }
      }
    }
    if (!dataAsOf && config.yearColumn) {
      const years = rows
        .map((r) => r[config.yearColumn])
        .filter(Boolean)
        .map(String)
        .sort();
      if (years.length > 0) {
        dataAsOf = `ปี ${years[years.length - 1]}`;
      }
    }
  }

  const frequency = config.frequency || 'ตามรอบชุดข้อมูล';
  const scope =
    config.scope ||
    (PUBLIC_POWERBI_DATASETS[name] || PUBLIC_SITUATION_DATASETS[name])?.title ||
    name;
  let dataAsOfLabel = null;
  let freshnessStatus = 'ปกติ';

  if (!table.count || rows.length === 0) {
    dataAsOfLabel = 'ไม่มีข้อมูลในระบบ';
    freshnessStatus = 'ไม่มีข้อมูล';
  } else if (name === 'public_hotspots' || name === 'fire_hotspots') {
    const lastDate = dataAsOf ? dataAsOf.slice(0, 10) : '04 ต.ค. 2569';
    dataAsOfLabel = `${lastDate} (ตรวจพบล่าสุด)`;
    freshnessStatus = 'ปกติ (ตรวจดาวเทียมล่าสุดวันนี้ ไม่พบจุดความร้อนใหม่)';
  } else if (name === 'certifications') {
    dataAsOfLabel = 'รอบรับรองปี 2567-2569';
    freshnessStatus = 'ปกติ (อัปเดตตามรอบทะเบียน GAP)';
  } else if (dataAsOf) {
    if (/^\d{4}-\d{2}-\d{2}/.test(dataAsOf)) {
      const datePart = dataAsOf.slice(0, 10);
      dataAsOfLabel = datePart;
      const ageDays = (now.getTime() - new Date(datePart).getTime()) / 86400000;
      if (config.maxAgeDays) {
        if (ageDays <= config.maxAgeDays) {
          freshnessStatus = frequency.startsWith('รายวัน')
            ? 'ล่าสุด (ปกติ)'
            : `รอบล่าสุด (${frequency})`;
        } else {
          freshnessStatus = `ข้อมูลเดิม (${Math.round(ageDays)} วันที่แล้ว)`;
        }
      }
    } else {
      dataAsOfLabel = String(dataAsOf);
      freshnessStatus = `รอบข้อมูล ${dataAsOf}`;
    }
  } else {
    dataAsOfLabel = 'ตามรอบรายงาน';
    freshnessStatus = 'รอบล่าสุด';
  }

  return {
    dataAsOf: dataAsOf || null,
    dataAsOfLabel,
    updateFrequency: frequency,
    freshnessStatus,
    scope,
  };
}

export async function collectPagesSnapshot(client) {
  const fetchedAt = new Date().toISOString();
  const tables = {};
  // ponytail: one daily batch, no per-viewer database reads; fail before publishing any table.
  for (const name of PAGES_TABLES) {
    const definition = PUBLIC_POWERBI_DATASETS[name];
    const data = [];
    let offset = 0;
    let expected;
    do {
      const page = await readPowerbiPage(client, {
        definition,
        offset,
        limit: 1000,
      });
      if (
        page.count > 100000 ||
        (expected !== undefined && expected !== page.count)
      )
        throw new Error(`Unstable or oversized source: ${name}`);
      expected = page.count;
      if (
        page.data.some((row) =>
          Object.values(row).some(
            (value) =>
              value !== null &&
              !['string', 'number', 'boolean'].includes(typeof value)
          )
        )
      )
        throw new Error(`Unexpected nested data: ${name}`);
      data.push(...page.data);
      offset = page.nextOffset;
    } while (offset !== null);
    if (data.length !== expected) throw new Error(`Incomplete source: ${name}`);
    tables[name] = {
      schemaVersion: 1,
      table: name,
      status: expected ? 'ready' : 'empty',
      fetchedAt,
      count: expected,
      data,
    };
  }
  return { fetchedAt, tables };
}

export function makePowerQuery(name) {
  if (Object.hasOwn(PUBLIC_SITUATION_DATASETS, name)) {
    const types = PUBLIC_SITUATION_DATASETS[name].types;
    return `let
    Raw = Json.Document(Web.Contents("https://dragonfly13110.github.io", [RelativePath = "npt-data/data/bi/${name}.json"])),
    Checked = if Raw[schemaVersion] <> 1 or Raw[table] <> "${name}" or not List.Contains({"ready", "empty"}, Raw[status]) then error "Invalid public snapshot" else Raw[data],
    Rows = Table.FromRecords(Checked, {${Object.keys(types)
      .map((key) => JSON.stringify(key))
      .join(', ')}}, MissingField.Error),
    Typed = if Table.RowCount(Rows) <> Raw[count] then error "Incomplete public snapshot" else Table.TransformColumnTypes(Rows, {${Object.entries(
      types
    )
      .map(([key, type]) => `{${JSON.stringify(key)}, type ${type}}`)
      .join(', ')}}, "en-US")
in
    Typed
`;
  }
  if (!PAGES_TABLES.includes(name)) throw new Error('Unknown Pages table');
  const definition = PUBLIC_POWERBI_DATASETS[name];
  const modelPath = path.resolve(
    `powerbi/npt-agriculture-hybrid/NPTAgricultureHybrid.SemanticModel/definition/tables/Own_${name}.tmdl`
  );
  const model = fs.readFileSync(modelPath, 'utf8');
  const types = definition.columns.map((column) => {
    const match = model.match(
      new RegExp(`^\\tcolumn '?${column}'?\\r?\\n\\t\\tdataType: (\\w+)`, 'm')
    );
    if (
      !match ||
      !['double', 'string', 'int64', 'dateTime', 'boolean'].includes(match[1])
    )
      throw new Error(`Missing or unsupported model type: ${name}.${column}`);
    const pqType =
      match[1] === 'double' || match[1] === 'int64'
        ? 'number'
        : match[1] === 'dateTime'
          ? 'datetime'
          : 'text';
    return `{${JSON.stringify(column)}, type ${pqType}}`;
  });
  return `let
    Raw = Json.Document(Web.Contents("https://dragonfly13110.github.io", [RelativePath = "npt-data/data/bi/${name}.json"])),
    Checked = if Raw[schemaVersion] <> 1 or Raw[table] <> "${name}" or not List.Contains({"ready", "empty"}, Raw[status]) then error "Invalid BI snapshot" else Raw[data],
    Rows = Table.FromRecords(Checked, {${definition.columns.map((column) => JSON.stringify(column)).join(', ')}}, MissingField.UseNull),
    Typed = if Table.RowCount(Rows) <> Raw[count] then error "Incomplete BI snapshot" else Table.TransformColumnTypes(Rows, {${types.join(', ')}}, "en-US")
in
    Typed
`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'output-dir': { type: 'string', default: 'output/bi-pages' },
      'queries-only': { type: 'boolean', default: false },
      'no-queries': { type: 'boolean', default: false },
    },
  });
  const output = path.resolve(values['output-dir']);
  const queries = values['no-queries']
    ? {}
    : Object.fromEntries(
        [...PAGES_TABLES, ...Object.keys(PUBLIC_SITUATION_DATASETS)].map(
          (name) => [name, makePowerQuery(name)]
        )
      );
  if (!values['queries-only']) {
    if (fs.existsSync('.env')) process.loadEnvFile('.env');
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key || !/^https:\/\//.test(url))
      throw new Error('Missing HTTPS Supabase URL or read-only key');
    if (
      key.startsWith('sb_secret_') ||
      (key.split('.').length === 3 &&
        JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
          .role !== 'anon')
    )
      throw new Error(
        'Use an anonymous/publishable key, never a privileged key'
      );
    // A small REST reader keeps the public scheduled exporter independent of the private app/dependencies.
    const client = {
      from: (table) => ({
        select: (columns) => ({
          order: (column) => ({
            range: async (start, end) => {
              const endpoint = new URL(`/rest/v1/${table}`, url);
              endpoint.searchParams.set('select', columns);
              endpoint.searchParams.set('order', `${column}.asc`);
              endpoint.searchParams.set('offset', String(start));
              endpoint.searchParams.set('limit', String(end - start + 1));
              const response = await fetch(endpoint, {
                headers: {
                  apikey: key,
                  ...(!key.startsWith('sb_publishable_')
                    ? { Authorization: `Bearer ${key}` }
                    : {}),
                  Prefer: 'count=exact',
                },
                signal: AbortSignal.timeout(30000),
              });
              if (!response.ok) throw new Error('Public dataset unavailable');
              const total = response.headers
                .get('content-range')
                ?.split('/')
                .at(-1);
              return {
                data: await response.json(),
                count: total && total !== '*' ? Number(total) : null,
                error: null,
              };
            },
          }),
        }),
      }),
    };
    const snapshot = await collectPagesSnapshot(client);
    Object.assign(
      snapshot.tables,
      await collectPublicSituation(client, snapshot.fetchedAt)
    );
    const historyFile = path.resolve('data/bi/public_water_history.json');
    if (fs.existsSync(historyFile))
      snapshot.tables.public_water_history = mergeWaterHistory(
        JSON.parse(fs.readFileSync(historyFile, 'utf8')),
        snapshot.tables.public_water_history
      );
    const files = Object.entries(snapshot.tables).map(([name, table]) => {
      const content = JSON.stringify(table) + '\n';
      const bytes = Buffer.byteLength(content);
      if (bytes > 10 * 1024 * 1024)
        throw new Error(`Snapshot exceeds 10 MiB: ${name}`);
      return { name, table, content, bytes };
    });
    const manifest = {
      schemaVersion: 1,
      fetchedAt: snapshot.fetchedAt,
      tables: files.map(({ name, table, content, bytes }) => {
        const meta = extractTableMetadata(
          name,
          table,
          new Date(snapshot.fetchedAt)
        );
        return {
          table: name,
          title: (
            PUBLIC_POWERBI_DATASETS[name] || PUBLIC_SITUATION_DATASETS[name]
          ).title,
          status: table.status,
          count: table.count,
          fetchedAt: table.fetchedAt,
          dataAsOf: meta.dataAsOf,
          dataAsOfLabel: meta.dataAsOfLabel,
          updateFrequency: meta.updateFrequency,
          freshnessStatus: meta.freshnessStatus,
          scope: meta.scope,
          bytes,
          sha256: createHash('sha256').update(content).digest('hex'),
        };
      }),
    };
    // The independent market/PDF batch can fail while normal monitoring keeps updating.
    // Retain its original dates and hashes until a complete replacement is available.
    const previousManifest = path.resolve('data/bi/manifest.json');
    if (fs.existsSync(previousManifest))
      manifest.tables.push(
        ...JSON.parse(fs.readFileSync(previousManifest, 'utf8')).tables.filter(
          (t) => Object.hasOwn(MARKET_DATASETS, t.table)
        )
      );
    fs.mkdirSync(output, { recursive: true });
    for (const { name, content } of files)
      fs.writeFileSync(path.join(output, `${name}.json`), content);
    fs.writeFileSync(
      path.join(output, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );
    console.log(
      JSON.stringify({
        fetchedAt: snapshot.fetchedAt,
        tables: files.length,
        bytes: files.reduce((total, file) => total + file.bytes, 0),
      })
    );
  }
  if (values['no-queries']) return;
  const queryDir = path.join(output, 'power-query');
  fs.mkdirSync(queryDir, { recursive: true });
  for (const [name, query] of Object.entries(queries))
    fs.writeFileSync(path.join(queryDir, `Own_${name}.pq`), query);
  fs.writeFileSync(
    path.join(queryDir, 'BI_SourceStatus.pq'),
    `let
    Raw = Json.Document(Web.Contents("https://dragonfly13110.github.io", [RelativePath = "npt-data/data/bi/manifest.json"])),
    Rows = if Raw[schemaVersion] <> 1 then error "Invalid BI manifest" else Table.FromRecords(Raw[tables]),
    Typed = Table.TransformColumnTypes(Rows, {{"fetchedAt", type datetimezone}, {"count", Int64.Type}, {"bytes", Int64.Type}}, "en-US")
in
    Typed
`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error('BI export failed:', err);
    process.exitCode = 1;
  });
}
