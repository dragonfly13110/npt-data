const MAPPING = {
  3: 'W13000', // ผัก
  4: 'W14000', // ผลไม้
  5: 'W15000', // ของแห้ง
  7: 'W16000', // พืชไร่
  10: 'R11000', // ข้าว
};

const CATEGORY_NAMES = {
  W13000: 'ผัก',
  W14000: 'ผลไม้-ค่าส่ง',
  W15000: 'เครื่องเทศ/ของแห้ง',
  W16000: 'พืชไร่-ธัญพืช',
  R11000: 'ข้าวสาร',
};

// Filter to focus on key economic crops in Nakhon Pathom
const ALLOWED_PRODUCTS = {
  W13000: [
    // ผัก
    'W13001', // ผักคะน้า
    'W13002', // ผักบุ้งจีน
    'W13003', // ผักกวางตุ้ง
    'W13018', // ผักชี
    'W13019', // ต้นหอม
    'W13009', // มะเขือเทศสีดา
    'W13010', // มะเขือเทศผลใหญ่
    'W13013', // แตงกวา
    'W13016', // หน่อไม้ฝรั่ง
    'W13017', // ข้าวโพดฝักอ่อน
    'W13021', // พริกขี้หนูจินดา (แดง)
    'W13025', // มะนาว เบอร์ 1-2
  ],
  W14000: [
    // ผลไม้
    'W14004', // ส้มโอ ขาวทองดี ใหญ่
    'W14035', // ส้มโอ ขาวน้ำผึ้ง ใหญ่
    'W14013', // ฝรั่งกิมจู คัด
    'W14009', // กล้วยน้ำว้า
    'W14008', // กล้วยหอมทอง ใหญ่
    'W14006', // มะละกอแขกดำ
    'W14033', // มะละกอฮอลแลนด์
    'W14024', // มะม่วงน้ำดอกไม้ เบอร์ 0
    'W14026', // มะม่วงเขียวเสวย เบอร์ 0
  ],
  W15000: [
    // ของแห้ง
    'W15001', // กระเทียมแห้ง มัดจุก หัวใหญ่
    'W15016', // หอมแดงศรีสะเกษ มัดจุก หัวใหญ่
    'W15047', // หอมหัวใหญ่ (หอมภาคเหนือ) เบอร์ 0-1
    'W15041', // พริกขี้หนูแห้ง อย่างดี
  ],
  W16000: [
    // พืชไร่
    'W16031', // มันสำปะหลัง
    'W16042', // ข้าวโพดเลี้ยงสัตว์ เมล็ด
    'W16045', // ข้าวโพดโรงงานอาหารสัตว์
  ],
  R11000: [
    // ข้าว
    'R11029', // ข้าวหอมมะลิ 100% ชั้น 1
    'R11037', // ข้าวหอมปทุมธานี
    'R11007', // ข้าวขาว 5%
    'R11018', // ข้าวสารเหนียว กข.6
  ],
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
  {
    id,
    productName,
    sourceUrl = 'https://pricelist.dit.go.th/main_price.php?seltime=day',
  } = {}
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
  const unit = headerText.match(/บาท\/(.+)$/)?.[1]?.trim() || null;
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
  const scopeMatch = String(productName || '').match(/\(([^)]+)\)/);
  const scopeName = scopeMatch?.[1]?.trim() || null;
  const priceType = reportTypeFromLabel(reportTypeLabel || '');
  return {
    id: String(id || ''),
    productName: productName || null,
    product_name: productName || null,
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

export { ALLOWED_PRODUCTS, CATEGORY_NAMES, MAPPING };
