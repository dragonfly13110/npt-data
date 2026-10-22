import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MARKET_DATASETS = {
  public_agricultural_prices: {
    title: 'ราคาสินค้าเกษตร ณ ตลาดสำคัญ สศก.',
    types: {
      data_date: 'text',
      product_category: 'text',
      product_name: 'text',
      market_name: 'text',
      province: 'text',
      day_price: 'number',
      unit: 'text',
      price_type: 'text',
      series_key: 'text',
      source_url: 'text',
      spatial_scope: 'text',
      source_name: 'text',
      source_product_id: 'text',
      grade: 'text',
      price_min: 'number',
      price_max: 'number',
      collected_at: 'text',
    },
  },
  public_outbreak_reports: {
    title: 'เอกสารรายงานการระบาดศัตรูพืช กรมส่งเสริมการเกษตร',
    types: {
      report_id: 'text',
      report_group: 'text',
      report_date: 'text',
      title: 'text',
      published_at: 'text',
      source_modified_at: 'text',
      source_url: 'text',
      report_url: 'text',
      spatial_scope: 'text',
    },
  },
  public_reported_outbreaks: {
    title: 'พื้นที่ระบาดตามรายงานส่วนกลาง รวมจังหวัดที่รายงาน',
    types: {
      report_id: 'text',
      report_group: 'text',
      report_date: 'text',
      crop: 'text',
      pest_name: 'text',
      reported_area_rai: 'number',
      previous_area_rai: 'number',
      reported_province_count: 'number',
      npt_mention: 'text',
      source_section: 'text',
      source_url: 'text',
      spatial_scope: 'text',
      evidence_type: 'text',
    },
  },
};
const api = 'https://agriapi.nabc.go.th/api/';
const groupNames = { 8: 'พืชไร่', 9: 'ไม้ยืนต้น', 10: 'ข้าว', 11: 'ไม้ผล' };
const months = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
const clean = (s) =>
  String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&#(?:8211|8212);/g, '-')
    .replace(/&amp;/g, '&')
    .trim();
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
};
const cutoffDate = (now) =>
  new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);

export function reportDate(title) {
  const match = clean(title).match(/วันที่\s*(\d{1,2})\s+([ก-๙]+)\s+(\d{4})/);
  const month = months.indexOf(match?.[2]) + 1;
  if (!match || !month || Number(match[3]) < 2500)
    throw new Error('Unrecognized DOAE report date');
  const value = `${Number(match[3]) - 543}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  if (new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error('Invalid report date');
  return value;
}

async function response(url) {
  const result = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!result.ok)
    throw new Error(
      `Public source ${new URL(url).hostname} returned ${result.status}`
    );
  return result;
}

export function safeRows(name, rows) {
  const types = MARKET_DATASETS[name].types;
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(types).map(([key, type]) => {
        const value = row[key] ?? null;
        if (
          value !== null &&
          (typeof value !== (type === 'number' ? 'number' : 'string') ||
            (type === 'number' && !Number.isFinite(value)))
        )
          throw new Error(`Invalid ${name}.${key}`);
        return [key, value];
      })
    )
  );
}

export async function collectPrices(now = new Date()) {
  const categories = await (
    await response(api + 'daily-prices/categories')
  ).json();
  assert(
    categories.success &&
      Array.isArray(categories.data) &&
      categories.data.length > 0 &&
      categories.data.length <= 30,
    'Invalid price categories'
  );
  const rows = [],
    keys = new Set(),
    cutoff = cutoffDate(now);
  for (const category of categories.data) {
    let previousDate = '9999-99-99';
    for (let page = 1; page <= 30; page++) {
      const query = new URLSearchParams({
        product_category: category,
        page: String(page),
        limit: '1000',
      });
      const url = api + 'daily-prices/category?' + query;
      const result = await (await response(url)).json();
      assert(
        result.success &&
          Array.isArray(result.data) &&
          Number.isSafeInteger(result.pagination?.total),
        'Invalid price response'
      );
      let older = false;
      for (const row of result.data) {
        assert(
          /^\d{4}-\d{2}-\d{2}$/.test(row.data_date) &&
            row.data_date <= previousDate,
          'Price dates must be descending'
        );
        previousDate = row.data_date;
        if (row.data_date < cutoff) {
          older = true;
          continue;
        }
        assert(
          row.data_date <= now.toISOString().slice(0, 10),
          'Future price record'
        );
        assert(
          row.product_category === category && row.product_name && row.unit,
          'Incomplete price identity'
        );
        const value = row.day_price;
        const price = value === null || value === '' ? null : Number(value);
        assert(
          price === null || (Number.isFinite(price) && price >= 0),
          'Invalid source price'
        );
        // Never average across products, grades, markets, provinces or units.
        const series_key = JSON.stringify([
          row.product_name,
          row.market_name,
          row.province,
          row.unit,
        ]);
        const key = JSON.stringify([row.data_date, series_key]);
        assert(!keys.has(key), 'Duplicate price identity');
        keys.add(key);
        rows.push({
          ...row,
          day_price: price,
          source_name: 'สศก. / NABC',
          source_product_id: row.product_name,
          grade: 'ตามชื่อสินค้าต้นทาง',
          price_min: price,
          price_max: price,
          collected_at: now.toISOString(),
          series_key,
          price_type: 'ราคารับซื้อรายวัน ณ ตลาดสำคัญ',
          source_url: url,
          spatial_scope:
            row.market_name && row.province
              ? 'ราคาตามจังหวัดและตลาดที่ระบุ ไม่ใช่ราคาเฉลี่ยนครปฐม'
              : 'ต้นทางไม่ระบุตลาดหรือจังหวัด ดูในตารางเท่านั้น',
        });
      }
      if (
        older ||
        result.pagination.offset + result.data.length >= result.pagination.total
      )
        break;
      assert(
        result.data.length > 0 && page < 30,
        'Incomplete price pagination'
      );
    }
  }
  assert(rows.length > 0, 'No prices; retain previous snapshot');
  return safeRows('public_agricultural_prices', rows);
}

export async function collectReports(now = new Date()) {
  const reports = [],
    jobs = [];
  const cache = path.join(os.tmpdir(), 'npt-bi-outbreaks');
  fs.mkdirSync(cache, { recursive: true });
  for (const [group, label] of Object.entries(groupNames)) {
    const query = new URLSearchParams({
      categories: group,
      per_page: '8',
      _fields: 'id,title,link,date,modified,content',
    });
    const posts = await (
      await response('https://ppsf.doae.go.th/wp-json/wp/v2/posts?' + query)
    ).json();
    assert(
      Array.isArray(posts) && posts.length > 0,
      'Missing DOAE report category'
    );
    let count = 0;
    const seenDates = new Set();
    for (const post of posts.toSorted((a, b) =>
      b.modified.localeCompare(a.modified)
    )) {
      assert(
        Number.isSafeInteger(post.id) &&
          post.id > 0 &&
          post.id < 1e9 &&
          /^https:\/\/ppsf\.doae\.go\.th\//.test(post.link),
        'Invalid official report identity'
      );
      const title = clean(post.title.rendered),
        report_date = reportDate(title);
      if (report_date < cutoffDate(now)) continue;
      if (seenDates.has(report_date)) continue;
      seenDates.add(report_date);
      assert(
        report_date <= now.toISOString().slice(0, 10),
        'Future outbreak report'
      );
      const links = [
        ...post.content.rendered.matchAll(/href="([^"]+\.pdf)"/g),
      ].map((m) => m[1]);
      assert(
        links.length > 0 &&
          /^https:\/\/ppsf\.doae\.go\.th\/wp-content\/uploads\//.test(links[0]),
        'No allowlisted official PDF'
      );
      const record = {
        report_id: String(post.id),
        report_group: label,
        report_date,
        title,
        published_at: post.date,
        source_modified_at: post.modified,
        source_url: links[0],
        report_url: post.link,
        spatial_scope: 'รายงานส่วนกลาง รวมจังหวัดที่รายงาน ระดับประเทศ',
      };
      reports.push(record);
      count++;
      const file = path.join(cache, String(post.id) + '.pdf');
      const bytes = Buffer.from(
        await (await response(record.source_url)).arrayBuffer()
      );
      assert(
        bytes.length < 8 * 1024 * 1024 &&
          bytes.subarray(0, 5).toString() === '%PDF-',
        'Invalid DOAE PDF'
      );
      fs.writeFileSync(file, bytes);
      jobs.push({
        file,
        report_id: post.id,
        group_id: Number(group),
        report_date,
      });
    }
    assert(count > 0, 'No recent DOAE reports; retain previous snapshot');
  }
  let parsed = [];
  if (jobs.length) {
    const jobFile = path.join(cache, 'jobs.json');
    write(jobFile, jobs);
    parsed = JSON.parse(
      execFileSync(
        process.env.BI_PYTHON || 'python',
        [
          fileURLToPath(new URL('./extract-outbreaks.py', import.meta.url)),
          jobFile,
        ],
        {
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024,
          timeout: 180000,
          env: { ...process.env, PYTHONUTF8: '1' },
        }
      )
    );
  }
  const rows = reports.flatMap((report) => {
    const parts = parsed.filter((r) => r.report_id === report.report_id);
    assert(parts.length > 0, 'Incomplete parsed report');
    return parts.map((r) => ({
      ...r,
      report_id: report.report_id,
      report_group: report.report_group,
      report_date: report.report_date,
      source_url: report.source_url,
      spatial_scope: report.spatial_scope,
      evidence_type:
        'รายงานกรมส่งเสริมการเกษตร ตัวเลขรวมตามหัวข้อ ไม่ใช่ผล AI หรือพื้นที่นครปฐม',
    }));
  });
  return {
    public_outbreak_reports: safeRows('public_outbreak_reports', reports),
    public_reported_outbreaks: safeRows('public_reported_outbreaks', rows),
  };
}

export async function collectMarketOutbreaks(now = new Date(), { reportsOnly = false } = {}) {
  const prices = reportsOnly ? null : await collectPrices(now);
  const reports = await collectReports(now);
  return Object.fromEntries(
    Object.entries({ ...(prices ? { public_agricultural_prices: prices } : {}), ...reports }).map(
      ([name, data]) => [
        name,
        {
          schemaVersion: 1,
          table: name,
          status: data.length ? 'ready' : 'empty',
          count: data.length,
          fetchedAt: now.toISOString(),
          data,
        },
      ]
    )
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--check')) {
    assert.equal(
      reportDate('สถานการณ์การระบาดศัตรูข้าว วันที่ 23 กันยายน 2569'),
      '2026-09-23'
    );
    assert.equal(
      safeRows('public_agricultural_prices', [
        { data_date: '2026-10-09', day_price: null, phone: 'private' },
      ])[0].phone,
      undefined
    );
    console.log(
      'Market/outbreak date, null and public allowlist checks passed'
    );
  } else {
    const outputIndex = process.argv.indexOf('--output');
    const output = path.resolve(
      outputIndex >= 0 ? process.argv[outputIndex + 1] : 'output/bi-pages'
    );
    const tables = await collectMarketOutbreaks(new Date(), { reportsOnly: process.argv.includes('--reports-only') });
    for (const table of Object.values(tables))
      assert(
        Buffer.byteLength(JSON.stringify(table, null, 2) + '\n') <=
          10 * 1024 * 1024,
        'Snapshot exceeds 10 MiB'
      );
    // Write only after every source and every PDF has passed validation.
    for (const [name, table] of Object.entries(tables))
      write(path.join(output, name + '.json'), table);
    const manifestFile = path.join(output, 'manifest.json');
    if (fs.existsSync(manifestFile)) {
      const manifest = read(manifestFile);
      manifest.tables = manifest.tables.filter(
        (t) => !Object.hasOwn(tables, t.table)
      );
      for (const [name, table] of Object.entries(tables)) {
        const content = fs.readFileSync(path.join(output, name + '.json'));
        const column =
          name === 'public_agricultural_prices' ? 'data_date' : 'report_date';
        const dataAsOf = table.data
          .map((r) => r[column])
          .sort()
          .at(-1);
        manifest.tables.push({
          table: name,
          title: MARKET_DATASETS[name].title,
          status: table.status,
          count: table.count,
          fetchedAt: table.fetchedAt,
          dataAsOf,
          dataAsOfLabel: dataAsOf,
          updateFrequency:
            name === 'public_agricultural_prices'
              ? 'ตรวจต้นทางรายวัน'
              : 'ตรวจเอกสารรายวัน เผยแพร่ตามรอบกรมฯ',
          freshnessStatus: 'ตรวจวันที่ต้นทาง ไม่ใช่วันดึงสำเนา',
          scope:
            name === 'public_agricultural_prices'
              ? 'แยกสินค้า ตลาด จังหวัด และหน่วย'
              : 'รายงานส่วนกลาง รวมจังหวัดที่รายงาน',
          bytes: content.length,
          sha256: createHash('sha256').update(content).digest('hex'),
        });
      }
      write(manifestFile, manifest);
    }
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(tables).map(([name, table]) => [
            name,
            {
              rows: table.count,
              latest: table.data
                .map((r) => r.data_date || r.report_date)
                .sort()
                .at(-1),
            },
          ])
        )
      )
    );
  }
}
