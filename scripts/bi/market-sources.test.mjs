import assert from 'node:assert/strict';
import {
  PRICE_SOURCES,
  normalizeUnit,
  normalizeNptProduct,
  parseSimummuang,
  mergePriceHistory,
  priceRow,
  boundPriceHistory,
  isAgriculturalProduct,
  resolveSourceStatus,
} from './market-sources.mjs';
import { parseDitPriceHtml } from './dit-prices.mjs';
import { validateLandUse } from './government-open-data.mjs';

const now = new Date('2026-10-22T05:00:00Z');

// 1. Sources: strictly 3 sources (no ตลาดไท)
assert.deepEqual(PRICE_SOURCES, [
  'สศก. / NABC',
  'กรมการค้าภายใน',
  'ตลาดสี่มุมเมือง',
]);

// 2. Unit normalization + DIT retail unit bug fix (P13082/P13084/P13087/P13088)
assert.equal(normalizeUnit('บาท/กิโลกรัม'), 'บาท/กก.');
assert.equal(normalizeUnit('บาท/ลูก'), 'บาท/ผล');
assert.equal(normalizeUnit('บาท/กก.'), 'บาท/กก.');

const retailCorianderHtml = `
  <h2>ประเภท : ขายปลีก สินค้า : ผักสด ผักชี คละ (บาท/กก.) บาท/กก.</h2>
  <script>[[1794528000000, 120.5]]</script>
`;
const parsedRetail = parseDitPriceHtml(retailCorianderHtml, {
  id: 'P13082',
  productName: 'ผักชี คละ (บาท/กก.)\n',
});
assert.equal(parsedRetail.priceType, 'retail');
assert.equal(parsedRetail.unit, 'กก.');
assert.equal(parsedRetail.productName, 'ผักชี คละ (บาท/กก.)');

// 3. Strictly plant crops + orchids/ornamentals grown in Nakhon Pathom (no livestock/fish/processed/foreign flowers)
for (const sample of [
  {
    source_name: 'สศก. / NABC',
    product_category: 'ข้าวเปลือกเจ้า',
    product_name: 'ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%',
  },
  {
    source_name: 'สศก. / NABC',
    product_category: 'อ้อยโรงงาน',
    product_name: 'อ้อยโรงงานสด',
  },
  {
    source_name: 'สศก. / NABC',
    product_category: 'มะพร้าว',
    product_name: 'มะพร้าวน้ำหอม',
  },
  {
    source_name: 'กรมการค้าภายใน',
    source_product_id: 'P14035',
    product_category: 'ผลไม้-ขายปลีก',
    product_name: 'ส้มโอ ขาวน้ำผึ้ง ใหญ่',
  },
  {
    source_name: 'กรมการค้าภายใน',
    source_product_id: 'W13001',
    product_category: 'ผัก',
    product_name: 'ผักคะน้า',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผัก',
    product_name: 'ใบกะเพรา',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผัก',
    product_name: 'กุ้ยช่ายเขียว',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผลไม้',
    product_name: 'ฝรั่งกิมจู',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'กล้วยไม้หวายขาว',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'กล้วยไม้บอมโจ',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'บัวหลวงสีขาว',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'ใบตอง',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'ต้นเตย',
  },
]) {
  assert(isAgriculturalProduct(sample), `Should admit ${sample.product_name}`);
}

for (const rejected of [
  { source_name: 'ตลาดไท', product_category: 'ผัก', product_name: 'ผักคะน้า' },
  {
    source_name: 'สศก. / NABC',
    product_category: 'สุกร',
    product_name: 'สุกรพันธุ์ผสม น้ำหนัก 100 กก. ขึ้นไป',
  },
  {
    source_name: 'สศก. / NABC',
    product_category: 'ไก่',
    product_name: 'ไก่รุ่นพันธุ์เนื้อ',
  },
  {
    source_name: 'สศก. / NABC',
    product_category: 'กุ้งขาว',
    product_name: 'กุ้งขาวแวนนาไม ขนาด 50 ตัว/กก.',
  },
  {
    source_name: 'สศก. / NABC',
    product_category: 'ปาล์มน้ำมัน',
    product_name: 'ผลปาล์มน้ำมันทั้งทะลาย',
  },
  {
    source_name: 'สศก. / NABC',
    product_category: 'ยางพารา',
    product_name: 'น้ำยางพาราสด',
  },
  {
    source_name: 'กรมการค้าภายใน',
    source_product_id: 'W15047',
    product_category: 'เครื่องเทศ/ของแห้ง',
    product_name: 'หอมหัวใหญ่ (หอมภาคเหนือ) เบอร์ 0-1',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ของสด ของชำ',
    product_name: 'หมึกกระดอง',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ของสด ของชำ',
    product_name: 'หัวหมูสด',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ของสด ของชำ',
    product_name: 'ไข่ไก่ เบอร์1',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผลไม้',
    product_name: 'แอปเปิ้ลฟูจิ จีน',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผลไม้',
    product_name: 'สับปะรดภูแล',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'ธูป',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'บาตร',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'ดอกไม้จันทน์',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'กุหลาบจีน',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'มัม มาเลย์',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'เบญจมาสเชียงใหม่',
  },
  {
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผัก',
    product_name: 'จิ้งหรีด',
  },
]) {
  assert(
    !isAgriculturalProduct(rejected),
    `Should reject ${rejected.source_name}:${rejected.product_name}`
  );
}

// 4. Unified product naming preserves upstream grade while aligning matching commodities
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผัก',
    product_name: 'ผักชีไทย',
    grade: 'กลาง',
    unit: 'บาท/กิโลกรัม',
  }),
  {
    product_category: 'ผักและสมุนไพร',
    product_name: 'ผักชี',
    grade: 'ผักชีไทย (กลาง)',
    unit: 'บาท/กก.',
  }
);
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'กรมการค้าภายใน',
    source_product_id: 'P14011',
    product_category: 'ผลไม้-ขายปลีก',
    product_name: 'ฝรั่งกิมจู คัด',
    grade: 'ตามชื่อสินค้าต้นทาง',
    unit: 'บาท/กก.',
  }),
  {
    product_category: 'ผลไม้',
    product_name: 'ฝรั่งกิมจู',
    grade: 'คัด',
    unit: 'บาท/กก.',
  }
);
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ผลไม้',
    product_name: 'ส้มโอขาวน้ำผึ้ง',
    grade: 'ใหญ่',
    unit: 'บาท/กิโลกรัม',
  }),
  {
    product_category: 'ผลไม้',
    product_name: 'ส้มโอขาวน้ำผึ้ง (น้ำหนัก กก.)',
    grade: 'ใหญ่',
    unit: 'บาท/กก.',
  }
);
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'สศก. / NABC',
    product_category: 'มะนาว',
    product_name: 'มะนาว ผลขนาดกลาง',
    grade: 'กลาง',
    unit: 'บาท/ร้อยผล',
  }),
  {
    product_category: 'ผักและสมุนไพร',
    product_name: 'มะนาว (รายร้อยผล)',
    grade: 'ผลขนาดกลาง',
    unit: 'บาท/ร้อยผล',
  }
);
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'สศก. / NABC',
    source_product_id: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
    product_category: 'ข้าวเปลือกเจ้า',
    product_name: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
    grade: 'ตามชื่อสินค้าต้นทาง',
    unit: 'บาท/ตัน',
  }),
  {
    product_category: 'ข้าวและธัญพืช',
    product_name: 'ข้าวเปลือกหอมมะลิ',
    grade: 'พันธุ์ขาวดอกมะลิ 105',
    unit: 'บาท/ตัน',
  }
);
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'พืชไร่',
    product_name: 'มันสำปะหลัง',
    grade: 'ใหญ่',
    unit: 'บาท/กิโลกรัม',
  }),
  {
    product_category: 'พืชไร่',
    product_name: 'มันสำปะหลัง (ตลาดผักสด)',
    grade: 'ใหญ่',
    unit: 'บาท/กก.',
  }
);
assert.deepEqual(
  normalizeNptProduct({
    source_name: 'ตลาดสี่มุมเมือง',
    product_category: 'ดอกไม้ สังฆภัณฑ์',
    product_name: 'กล้วยไม้บอมโจ',
    grade: 'กลาง',
    unit: 'บาท/กำ',
  }),
  {
    product_category: 'ไม้ดอกไม้ประดับ',
    product_name: 'กล้วยไม้บอมโจ',
    grade: 'กลาง',
    unit: 'บาท/กำ',
  }
);

// 5. Simummuang item parsing + zero-min & invalid-range quarantine
const item = {
  _id: 'one',
  isActive: true,
  th: { name: 'ผักชีไทย' },
  prod_unit_id: { th: { name: 'กิโลกรัม' } },
  prod_category_id: { th: { name: 'ผัก' } },
  price: {
    action_date: '2026-10-21T17:20:00Z',
    small: { min: 0, max: 0 },
    medium: { min: 0, max: 60 },
    large: { min: 70, max: 50 },
  },
};
const rejectedRows = [];
const rows = parseSimummuang([item], now, rejectedRows);
assert.equal(rows.length, 1);
assert.equal(rows[0].data_date, '2026-10-22');
assert.equal(rows[0].product_name, 'ผักชี');
assert.equal(rows[0].unit, 'บาท/กก.');
assert.equal(rows[0].price_min, null);
assert.equal(rows[0].price_max, 60);
assert.equal(rejectedRows.length, 1);

// 6. History merging filters out excluded legacy sources (e.g., ตลาดไท or livestock)
const ditRow = priceRow({
  data_date: '2026-10-21',
  product_category: 'ผลไม้',
  product_name: 'ฝรั่งกิมจู',
  source_name: 'กรมการค้าภายใน',
  source_product_id: 'P14011',
  grade: 'คัด',
  market_name: 'ชุดสำรวจราคาขายปลีก กรมการค้าภายใน',
  province: null,
  unit: 'บาท/กก.',
  price_type: 'ราคาขายปลีกจากชุดสำรวจ',
  day_price: 45,
  price_min: 40,
  price_max: 50,
  source_url: 'https://pricelist.dit.go.th/main_price.php?seltime=day',
  spatial_scope: 'ทดสอบ',
  collected_at: now.toISOString(),
});
const oldTalaadThai = { ...ditRow, source_name: 'ตลาดไท', market_name: 'ตลาดไท' };
const changed = { ...rows[0], price_max: 65 };
const merged = mergePriceHistory([rows[0], oldTalaadThai, ditRow], [changed], now);
assert.equal(merged.length, 2);
assert(!merged.some((r) => r.source_name === 'ตลาดไท'));
assert.equal(
  merged.find((r) => r.source_name === 'ตลาดสี่มุมเมือง').price_max,
  65
);
assert.throws(() => priceRow({ ...changed, data_date: '2026-02-30' }));
assert.throws(() => priceRow({ ...changed, price_min: -1 }));
assert.throws(() => priceRow({ ...changed, price_min: 80 }));

// 7. History size bound retains latest date per active source
const bulky = [
  ...Array.from({ length: 1000 }, (_, i) => ({
    ...changed,
    data_date: i === 0 ? '2026-10-22' : '2026-10-21',
    spatial_scope: 'a'.repeat(10000),
  })),
  ditRow,
];
const bounded = boundPriceHistory(bulky);
assert(bounded.history.trimmedForSize);
assert(bounded.data.some((r) => r.source_name === 'กรมการค้าภายใน'));
assert(
  bounded.data.some(
    (r) => r.source_name === 'ตลาดสี่มุมเมือง' && r.data_date === '2026-10-22'
  )
);
assert(
  Buffer.byteLength(JSON.stringify(bounded.data, null, 2)) < 9 * 1024 * 1024
);

// 8. Land-use validation & source status preservation
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

const prevNabcReady = {
  name: 'สศก. / NABC',
  status: 'ready',
  fetchedAt: '2026-11-13T07:05:00.000Z',
  rows: 4110,
  error: null,
};
const rejected403 = {
  status: 'rejected',
  reason: new Error('Public source agriapi.nabc.go.th returned 403'),
};
const keptSameDay = resolveSourceStatus({
  name: 'สศก. / NABC',
  result: rejected403,
  previousSource: prevNabcReady,
  now: new Date('2026-11-13T10:17:00.000Z'),
});
assert.equal(keptSameDay.status, 'ready');
assert.equal(keptSameDay.rows, 4110);
assert.equal(keptSameDay.error, null);
const expiredNextMorning = resolveSourceStatus({
  name: 'สศก. / NABC',
  result: rejected403,
  previousSource: prevNabcReady,
  now: new Date('2026-11-14T02:17:00.000Z'),
});
assert.equal(expiredNextMorning.status, 'retained');
assert.equal(expiredNextMorning.rows, 0);
assert.match(expiredNextMorning.error, /403/);
console.log('All curated NPT agricultural price & orchid tests passed');
