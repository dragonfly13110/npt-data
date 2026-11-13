export const DIT_SOURCE_URL = 'https://pricelist.dit.go.th/main_price.php?seltime=day';

// Active daily wholesale (protype=2) & retail (protype=1) series for Nakhon Pathom crops
export const DIT_SERIES_GROUPS = [
  {
    group: 'W13000',
    protype: '2',
    category: 'ผักและสมุนไพร',
    priceType: 'wholesale',
    priceTypeLabel: 'ราคาขายส่งจากชุดสำรวจ',
    marketName: 'ชุดสำรวจราคาขายส่ง กรมการค้าภายใน',
  },
  {
    group: 'P13000',
    protype: '1',
    category: 'ผักและสมุนไพร',
    priceType: 'retail',
    priceTypeLabel: 'ราคาขายปลีกจากชุดสำรวจ',
    marketName: 'ชุดสำรวจราคาขายปลีก กรมการค้าภายใน',
  },
  {
    group: 'W14000',
    protype: '2',
    category: 'ผลไม้',
    priceType: 'wholesale',
    priceTypeLabel: 'ราคาขายส่งจากชุดสำรวจ',
    marketName: 'ชุดสำรวจราคาขายส่ง กรมการค้าภายใน',
  },
  {
    group: 'P14000',
    protype: '1',
    category: 'ผลไม้',
    priceType: 'retail',
    priceTypeLabel: 'ราคาขายปลีกจากชุดสำรวจ',
    marketName: 'ชุดสำรวจราคาขายปลีก กรมการค้าภายใน',
  },
  {
    group: 'W16000',
    protype: '2',
    category: 'พืชไร่',
    priceType: 'wholesale',
    priceTypeLabel: 'ราคาขายส่งจากชุดสำรวจ',
    marketName: 'ชุดสำรวจราคาขายส่ง กรมการค้าภายใน',
  },
  {
    group: 'R11000',
    protype: '2',
    category: 'ข้าวและธัญพืช',
    priceType: 'wholesale',
    priceTypeLabel: 'ราคาขายส่งจากชุดสำรวจ',
    marketName: 'ชุดสำรวจราคาขายส่ง กรมการค้าภายใน',
  },
];

// Curated active daily economic crops grown in Nakhon Pathom (excluding inactive IDs)
export const ALLOWED_PRODUCTS = {
  W13000: [
    'W13001', // ผักคะน้า
    'W13002', // ผักบุ้งจีน
    'W13003', // ผักกวางตุ้ง
    'W13009', // มะเขือเทศสีดา
    'W13011', // มะเขือเจ้าพระยา
    'W13012', // ถั่วฝักยาว
    'W13013', // แตงกวา
    'W13014', // ฟักเขียว
    'W13016', // หน่อไม้ฝรั่ง
    'W13017', // ข้าวโพดฝักอ่อน
    'W13018', // ผักชี
    'W13019', // ต้นหอม
    'W13021', // พริกขี้หนูจินดา (แดง)
    'W13022', // ขึ้นฉ่าย
    'W13023', // ผักกะเฉด 1 กำ
    'W13024', // ผักบุ้งไทย 10 กำ
    'W13025', // มะนาว เบอร์ 1-2
    'W13026', // มะนาว เบอร์ 3-4
    'W13029', // กระชายขาว
    'W13030', // พริกขี้หนูสวน (เม็ดกลาง)
    'W13031', // มะละกอ พันธุ์แขกดำดำเนิน
  ],
  P13000: [
    'P13001', // ผักคะน้า คละ
    'P13003', // ผักบุ้งจีน คละ
    'P13005', // ผักกวางตุ้ง คละ
    'P13017', // มะเขือเทศสีดา คละ
    'P13021', // มะเขือเจ้าพระยา
    'P13022', // ถั่วฝักยาว คละ
    'P13024', // แตงกวา คละ
    'P13026', // ฟักเขียว คละ
    'P13030', // หน่อไม้ฝรั่ง คละ
    'P13032', // ข้าวโพดฝักอ่อน
    'P13041', // ผักกะเฉด
    'P13043', // มะนาว เบอร์ 1-2
    'P13044', // มะนาว เบอร์ 3-4
    'P13059', // กระชายขาว คละ
    'P13082', // ผักชี คละ (บาท/กก.)
    'P13084', // ต้นหอม คละ (บาท/กก.)
    'P13087', // พริกขี้หนูจินดา (แดง) (บาท/กก.)
    'P13088', // ขึ้นฉ่าย คละ (บาท/กก.)
    'P13090', // ผักบุ้งไทย (10 กำ)
    'P13091', // พริกขี้หนูสวน (เม็ดกลาง)
    'P13092', // มะละกอ (พันธุ์แขกดำดำเนิน) คละ
  ],
  W14000: [
    'W14006', // มะละกอแขกดำ
    'W14009', // กล้วยน้ำว้า
    'W14012', // ฝรั่งกิมจู คละ
    'W14013', // ฝรั่งกิมจู คัด
    'W14024', // มะม่วงน้ำดอกไม้ เบอร์ 0
    'W14026', // มะม่วงเขียวเสวย เบอร์ 0
    'W14032', // ลำไย อีดอ
    'W14033', // มะละกอฮอลแลนด์
    'W14034', // กล้วยหอมทอง ใหญ่ (14 ผล)
    'W14035', // ส้มโอ ขาวน้ำผึ้ง ใหญ่
    'W14036', // ส้มโอ ขาวน้ำผึ้ง เล็ก
  ],
  P14000: [
    'P14004', // มะละกอแขกดำ
    'P14007', // กล้วยน้ำว้า
    'P14010', // ฝรั่งกิมจู คละ
    'P14011', // ฝรั่งกิมจู คัด
    'P14012', // มะม่วงน้ำดอกไม้ เบอร์ 0
    'P14014', // มะม่วงเขียวเสวย เบอร์ 0
    'P14030', // ลำไย อีดอ
    'P14033', // มะละกอฮอลแลนด์
    'P14034', // กล้วยหอมทอง ใหญ่ (14 ผล)
    'P14035', // ส้มโอ ขาวน้ำผึ้ง ใหญ่
    'P14036', // ส้มโอ ขาวน้ำผึ้ง เล็ก
  ],
  W16000: [
    'W16031', // มันสำปะหลัง ราคาเกษตรกรขายได้ (นครราชสีมา แป้ง 25%)
    'W16042', // ข้าวโพดเลี้ยงสัตว์ เมล็ด ความชื้นไม่เกิน 30%
    'W16045', // ข้าวโพดโรงงานอาหารสัตว์ เมล็ดความชื้นไม่เกิน 14.5%
  ],
  R11000: [
    'R11058', // ข้าวเปลือกปทุมธานี
    'R11057', // ข้าวเปลือกเจ้า
    'R11055', // ข้าวเปลือกหอมมะลิ
    'R11037', // ข้าวหอมปทุมธานี
    'R11029', // ข้าวหอมมะลิ 100% ชั้น 1
    'R11007', // ข้าวขาว 5%
  ],
};

export const CATEGORY_NAMES = {
  W13000: 'ผักและสมุนไพร',
  P13000: 'ผักและสมุนไพร',
  W14000: 'ผลไม้',
  P14000: 'ผลไม้',
  W16000: 'พืชไร่',
  R11000: 'ข้าวและธัญพืช',
};

export const MAPPING = {
  3: 'W13000',
  4: 'W14000',
  7: 'W16000',
  10: 'R11000',
};

function numeric(value) {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function thaiDateFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function reportTypeFromLabel(label) {
  if (/ขายส่ง/.test(label)) return 'wholesale';
  if (/ขายปลีก/.test(label)) return 'retail';
  if (/เกษตรกร/.test(label)) return 'farm_gate';
  return null;
}

export function parseDitPriceHtml(
  html,
  { id, productName, sourceUrl = DIT_SOURCE_URL } = {}
) {
  const avgPoints = [];
  const avgRegex = /\[(\d{13}),\s*([\d,.]+)\]/g;
  let match;
  while ((match = avgRegex.exec(html)) !== null) {
    const timestamp = Number(match[1]);
    const value = numeric(match[2]);
    if (value !== null) avgPoints.push({ timestamp, value });
  }
  if (!avgPoints.length) return null;

  const rangePoints = [];
  const rangeRegex = /\[(\d{13}),\s*([\d,.]+),\s*([\d,.]+)\]/g;
  while ((match = rangeRegex.exec(html)) !== null) {
    const min = numeric(match[2]);
    const max = numeric(match[3]);
    if (min !== null && max !== null) {
      rangePoints.push({ timestamp: Number(match[1]), min, max });
    }
  }

  const headerText =
    html
      .match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || '';
  const reportTypeLabel =
    headerText.match(/ประเภท\s*:\s*([^\s]+)(?:\s+สินค้า|$)/)?.[1] || null;
  // Use greedy .* before บาท/ so names ending with (บาท/กก.) extract the final unit cleanly.
  const unit = headerText.match(/.*บาท\/(.+)$/)?.[1]?.trim() || null;
  const cleanName = String(productName || '').replace(/\s+/g, ' ').trim() || null;
  const series = avgPoints.map((point) => {
    const range = rangePoints.find(
      (item) => item.timestamp === point.timestamp
    );
    return {
      timestamp: point.timestamp,
      date: thaiDateFromTimestamp(point.timestamp),
      value: point.value,
      min: range?.min ?? null,
      max: range?.max ?? null,
    };
  });
  const latest = series.at(-1);
  const scopeMatch = String(cleanName || '').match(/\(([^)]+)\)/);
  const scopeName = scopeMatch?.[1]?.trim() || null;
  const priceType = reportTypeFromLabel(reportTypeLabel || '');
  return {
    id: String(id || ''),
    productName: cleanName,
    product_name: cleanName,
    priceType,
    reportTypeLabel,
    spatialScope: scopeName ? 'product_label' : null,
    scopeName,
    unit,
    series,
    price_range:
      latest?.min != null && latest?.max != null
        ? `${latest.min} - ${latest.max}`
        : latest?.value != null
          ? String(latest.value)
          : null,
    day_price: latest?.value ?? null,
    avg_price: latest?.value != null ? String(latest.value) : null,
    data_date: latest?.date || null,
    source: 'MOC',
    sourceUrl,
  };
}
