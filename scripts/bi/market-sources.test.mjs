import assert from 'node:assert/strict';
import {
  parseSimummuang,
  parseTalaadThai,
  mergePriceHistory,
  priceRow,
  boundPriceHistory,
} from './market-sources.mjs';
import { validateLandUse } from './government-open-data.mjs';
const now = new Date('2026-10-22T05:00:00Z');
const item = {
  _id: 'one',
  isActive: true,
  th: { name: 'ผักชี' },
  prod_unit_id: { th: { name: 'กิโลกรัม' } },
  prod_category_id: { th: { name: 'ผัก' } },
  price: {
    action_date: '2026-10-21T17:20:00Z',
    small: { min: 0, max: 0 },
    medium: { min: 0, max: 60 },
    large: { min: 70, max: 50 },
  },
};
const rejected = [],
  rows = parseSimummuang([item], now, rejected);
assert.equal(rows.length, 1);
assert.equal(rows[0].data_date, '2026-10-22');
assert.equal(rows[0].price_min, null);
assert.equal(rows[0].price_max, 60);
assert.equal(rejected.length, 1);
assert.equal(rows[0].day_price, null);
assert(!('images' in rows[0]));
const json = {
  props: {
    pageProps: {
      productsPriceTrending: {
        data: [
          {
            id: 1,
            title: { th: 'มะนาว 400 ลูก' },
            unit: 'กระสอบ',
            slug: 'lime',
            pricingData: {
              latestPriceDiffProductSnapShot: {
                data: {
                  prev: {
                    date: '2026-10-20T23:59:59.999Z',
                    minPrice: 100,
                    maxPrice: 120,
                  },
                  current: {
                    date: '2026-10-21T23:59:59.999Z',
                    minPrice: 110,
                    maxPrice: 130,
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
};
const thai = parseTalaadThai(
  '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify(json) +
    '</script>',
  now
);
assert.deepEqual(
  thai.map((r) => r.data_date),
  ['2026-10-20', '2026-10-21']
);
assert.equal(thai[0].unit, 'บาท/กระสอบ');
const changed = { ...rows[0], price_max: 65 };
const merged = mergePriceHistory([rows[0], ...thai], [changed], now);
assert.equal(merged.length, 3);
assert.equal(
  merged.find((r) => r.source_name === 'ตลาดสี่มุมเมือง').price_max,
  65
);
assert.equal(mergePriceHistory(merged, [], now).length, 3);
const another = { ...changed, grade: 'ใหญ่' };
assert.equal(mergePriceHistory([changed], [another], now).length, 2);
assert.throws(() => priceRow({ ...changed, price_min: -1 }));
assert.throws(() => priceRow({ ...changed, price_min: 80 }));
assert.throws(() => parseTalaadThai('<html>unavailable</html>', now));
const bulky = [
  ...Array.from({ length: 1000 }, (_, i) => ({
    ...changed,
    data_date: i === 0 ? '2026-10-22' : '2026-10-21',
    spatial_scope: 'a'.repeat(10000),
  })),
  ...thai,
];
const bounded = boundPriceHistory(bulky);
assert(bounded.history.trimmedForSize);
assert(bounded.data.some((r) => r.source_name === 'ตลาดไท'));
assert(
  bounded.data.some(
    (r) => r.source_name === 'ตลาดสี่มุมเมือง' && r.data_date === '2026-10-22'
  )
);
assert(
  Buffer.byteLength(JSON.stringify(bounded.data, null, 2)) < 9 * 1024 * 1024
);
const districts = [
    'เมืองนครปฐม',
    'กำแพงแสน',
    'นครชัยศรี',
    'ดอนตูม',
    'บางเลน',
    'สามพราน',
    'พุทธมณฑล',
  ],
  crops = [
    'ข้าว',
    'พืชไร่',
    'ไม้ผลไม้ยืนต้น',
    'พืชผัก',
    'ไม้ดอกไม้ประดับ',
    'สมุนไพร/เครื่องเทศ',
  ];
const records = districts.flatMap((d) =>
  crops.map((c) => ({
    ปี: 2568,
    อำเภอ: d,
    ลักษณะการเกษตร: c,
    'พื้นที่เพาะปลูก (ไร่)': 0,
  }))
);
assert.equal(validateLandUse(records, 42).length, 42);
assert.throws(() => validateLandUse(records.slice(1), 42));
assert.throws(() => validateLandUse([...records.slice(1), records[1]], 42));
console.log(
  'Multi-market dates, ranges, quarantine, source identity, history, and data.go.th completeness checks passed'
);
