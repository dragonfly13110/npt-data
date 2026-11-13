import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectPrices, safeRows } from './market-outbreaks.mjs';
import {
  ALLOWED_PRODUCTS,
  CATEGORY_NAMES,
  DIT_SERIES_GROUPS,
  DIT_SOURCE_URL,
  parseDitPriceHtml,
} from './dit-prices.mjs';

const table = 'public_agricultural_prices';
export const PRICE_SOURCES = [
  'สศก. / NABC',
  'กรมการค้าภายใน',
  'ตลาดสี่มุมเมือง',
];

const NABC_CROPS = new Set([
  'ข้าวเปลือกเจ้า',
  'ข้าวหอมมะลิ',
  'ข้าวโพดเลี้ยงสัตว์',
  'มันสำปะหลัง',
  'อ้อยโรงงาน',
  'มะพร้าว',
  'มะนาว',
]);

const DIT_PRODUCTS = new Set(Object.values(ALLOWED_PRODUCTS).flat());

const UNIT_ALIASES = new Map([
  ['บาท/กิโลกรัม', 'บาท/กก.'],
  ['บาท/ลูก', 'บาท/ผล'],
  ['บาท/ร้อยละ', 'บาท/ร้อยดอก'],
  ['บาท/กก', 'บาท/กก.'],
]);

export function normalizeUnit(unit) {
  const clean = String(unit || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return clean;
  if (UNIT_ALIASES.has(clean)) return UNIT_ALIASES.get(clean);
  if (/^บาท\/กก\./.test(clean)) return 'บาท/กก.';
  return clean;
}

const cleanName = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const formatGrade = (qualifier, rawGrade) => {
  const g = cleanName(rawGrade);
  const raw = g && g !== 'ตามชื่อสินค้าต้นทาง' ? g : '';
  if (!qualifier) return raw || 'ตามชื่อสินค้าต้นทาง';
  if (!raw) return qualifier;
  if (raw === qualifier || raw.startsWith(`${qualifier} (`)) return raw;
  return `${qualifier} (${raw})`;
};

const DIT_NORMALIZATION = {
  W13001: { category: 'ผักและสมุนไพร', productName: 'ผักคะน้า', grade: 'ขายส่งมาตรฐาน' },
  P13001: { category: 'ผักและสมุนไพร', productName: 'ผักคะน้า', grade: 'คละ' },
  W13002: { category: 'ผักและสมุนไพร', productName: 'ผักบุ้งจีน', grade: 'ขายส่งมาตรฐาน' },
  P13003: { category: 'ผักและสมุนไพร', productName: 'ผักบุ้งจีน', grade: 'คละ' },
  W13003: { category: 'ผักและสมุนไพร', productName: 'ผักกวางตุ้ง', grade: 'ขายส่งมาตรฐาน' },
  P13005: { category: 'ผักและสมุนไพร', productName: 'ผักกวางตุ้ง', grade: 'คละ' },
  W13009: { category: 'ผักและสมุนไพร', productName: 'มะเขือเทศสีดา', grade: 'ขายส่งมาตรฐาน' },
  P13017: { category: 'ผักและสมุนไพร', productName: 'มะเขือเทศสีดา', grade: 'คละ' },
  W13011: { category: 'ผักและสมุนไพร', productName: 'มะเขือเปราะ / เจ้าพระยา', grade: 'เจ้าพระยา' },
  P13021: { category: 'ผักและสมุนไพร', productName: 'มะเขือเปราะ / เจ้าพระยา', grade: 'เจ้าพระยา' },
  W13012: { category: 'ผักและสมุนไพร', productName: 'ถั่วฝักยาว', grade: 'ขายส่งมาตรฐาน' },
  P13022: { category: 'ผักและสมุนไพร', productName: 'ถั่วฝักยาว', grade: 'คละ' },
  W13013: { category: 'ผักและสมุนไพร', productName: 'แตงกวา', grade: 'ขายส่งมาตรฐาน' },
  P13024: { category: 'ผักและสมุนไพร', productName: 'แตงกวา', grade: 'คละ' },
  W13014: { category: 'ผักและสมุนไพร', productName: 'ฟักเขียว', grade: 'ขายส่งมาตรฐาน' },
  P13026: { category: 'ผักและสมุนไพร', productName: 'ฟักเขียว', grade: 'คละ' },
  W13016: { category: 'ผักและสมุนไพร', productName: 'หน่อไม้ฝรั่ง', grade: 'ขายส่งมาตรฐาน' },
  P13030: { category: 'ผักและสมุนไพร', productName: 'หน่อไม้ฝรั่ง', grade: 'คละ' },
  W13017: { category: 'ผักและสมุนไพร', productName: 'ข้าวโพดฝักอ่อน', grade: 'ขายส่งมาตรฐาน' },
  P13032: { category: 'ผักและสมุนไพร', productName: 'ข้าวโพดฝักอ่อน', grade: 'ขายปลีกมาตรฐาน' },
  W13018: { category: 'ผักและสมุนไพร', productName: 'ผักชี', grade: 'ขายส่งมาตรฐาน' },
  P13082: { category: 'ผักและสมุนไพร', productName: 'ผักชี', grade: 'คละ' },
  W13019: { category: 'ผักและสมุนไพร', productName: 'ต้นหอม', grade: 'ขายส่งมาตรฐาน' },
  P13084: { category: 'ผักและสมุนไพร', productName: 'ต้นหอม', grade: 'คละ' },
  W13021: { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูจินดา', grade: 'สีแดง' },
  P13087: { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูจินดา', grade: 'สีแดง' },
  W13022: { category: 'ผักและสมุนไพร', productName: 'ขึ้นฉ่าย', grade: 'ขายส่งมาตรฐาน' },
  P13088: { category: 'ผักและสมุนไพร', productName: 'ขึ้นฉ่าย', grade: 'คละ' },
  W13023: { category: 'ผักและสมุนไพร', productName: 'ผักกะเฉด', grade: 'ขายส่ง 1 กำ' },
  P13041: { category: 'ผักและสมุนไพร', productName: 'ผักกะเฉด', grade: 'ขายปลีก 1 กำ' },
  W13024: { category: 'ผักและสมุนไพร', productName: 'ผักบุ้งไทย (10 กำ)', grade: 'มัด 10 กำ' },
  P13090: { category: 'ผักและสมุนไพร', productName: 'ผักบุ้งไทย (10 กำ)', grade: 'มัด 10 กำ' },
  W13025: { category: 'ผักและสมุนไพร', productName: 'มะนาว', grade: 'เบอร์ 1-2' },
  P13043: { category: 'ผักและสมุนไพร', productName: 'มะนาว', grade: 'เบอร์ 1-2' },
  W13026: { category: 'ผักและสมุนไพร', productName: 'มะนาว', grade: 'เบอร์ 3-4' },
  P13044: { category: 'ผักและสมุนไพร', productName: 'มะนาว', grade: 'เบอร์ 3-4' },
  W13029: { category: 'ผักและสมุนไพร', productName: 'กระชายขาว', grade: 'ขายส่งมาตรฐาน' },
  P13059: { category: 'ผักและสมุนไพร', productName: 'กระชายขาว', grade: 'คละ' },
  W13030: { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูสวน', grade: 'เม็ดกลาง' },
  P13091: { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูสวน', grade: 'เม็ดกลาง' },
  W13031: { category: 'ผักและสมุนไพร', productName: 'มะละกอดิบ (แขกดำดำเนิน)', grade: 'แขกดำดำเนิน' },
  P13092: { category: 'ผักและสมุนไพร', productName: 'มะละกอดิบ (แขกดำดำเนิน)', grade: 'แขกดำดำเนิน คละ' },
  W14006: { category: 'ผลไม้', productName: 'มะละกอแขกดำ', grade: 'สุก/มาตรฐาน' },
  P14004: { category: 'ผลไม้', productName: 'มะละกอแขกดำ', grade: 'สุก/มาตรฐาน' },
  W14009: { category: 'ผลไม้', productName: 'กล้วยน้ำว้า', grade: 'มาตรฐาน' },
  P14007: { category: 'ผลไม้', productName: 'กล้วยน้ำว้า', grade: 'มาตรฐาน' },
  W14012: { category: 'ผลไม้', productName: 'ฝรั่งกิมจู', grade: 'คละ' },
  P14010: { category: 'ผลไม้', productName: 'ฝรั่งกิมจู', grade: 'คละ' },
  W14013: { category: 'ผลไม้', productName: 'ฝรั่งกิมจู', grade: 'คัด' },
  P14011: { category: 'ผลไม้', productName: 'ฝรั่งกิมจู', grade: 'คัด' },
  W14024: { category: 'ผลไม้', productName: 'มะม่วงน้ำดอกไม้', grade: 'เบอร์ 0' },
  P14012: { category: 'ผลไม้', productName: 'มะม่วงน้ำดอกไม้', grade: 'เบอร์ 0' },
  W14026: { category: 'ผลไม้', productName: 'มะม่วงเขียวเสวย', grade: 'เบอร์ 0' },
  P14014: { category: 'ผลไม้', productName: 'มะม่วงเขียวเสวย', grade: 'เบอร์ 0' },
  W14032: { category: 'ผลไม้', productName: 'ลำไยอีดอ', grade: 'มาตรฐาน' },
  P14030: { category: 'ผลไม้', productName: 'ลำไยอีดอ', grade: 'มาตรฐาน' },
  W14033: { category: 'ผลไม้', productName: 'มะละกอฮอลแลนด์', grade: 'มาตรฐาน' },
  P14033: { category: 'ผลไม้', productName: 'มะละกอฮอลแลนด์', grade: 'มาตรฐาน' },
  W14034: { category: 'ผลไม้', productName: 'กล้วยหอมทอง ใหญ่ (14 ผล)', grade: 'ใหญ่ 14 ผล' },
  P14034: { category: 'ผลไม้', productName: 'กล้วยหอมทอง ใหญ่ (14 ผล)', grade: 'ใหญ่ 14 ผล' },
  W14035: { category: 'ผลไม้', productName: 'ส้มโอ ขาวน้ำผึ้ง (ใหญ่)', grade: 'ใหญ่' },
  P14035: { category: 'ผลไม้', productName: 'ส้มโอ ขาวน้ำผึ้ง (ใหญ่)', grade: 'ใหญ่' },
  W14036: { category: 'ผลไม้', productName: 'ส้มโอ ขาวน้ำผึ้ง (เล็ก)', grade: 'เล็ก' },
  P14036: { category: 'ผลไม้', productName: 'ส้มโอ ขาวน้ำผึ้ง (เล็ก)', grade: 'เล็ก' },
  W16031: { category: 'พืชไร่', productName: 'มันสำปะหลัง', grade: 'เชื้อแป้ง 25% (DIT นครราชสีมา)' },
  W16042: { category: 'พืชไร่', productName: 'ข้าวโพดเลี้ยงสัตว์', grade: 'ความชื้น <=30% (เพชรบูรณ์)' },
  W16045: { category: 'พืชไร่', productName: 'ข้าวโพดเลี้ยงสัตว์', grade: 'ความชื้น <=14.5% (กทม./ปริมณฑล)' },
  R11058: { category: 'ข้าวและธัญพืช', productName: 'ข้าวเปลือกปทุมธานี', grade: 'ข้าวเปลือกหอมปทุมธานี' },
  R11057: { category: 'ข้าวและธัญพืช', productName: 'ข้าวเปลือกเจ้า', grade: 'ข้าวเปลือกเจ้าทั่วไป' },
  R11055: { category: 'ข้าวและธัญพืช', productName: 'ข้าวเปลือกหอมมะลิ', grade: 'ข้าวเปลือกหอมมะลิ' },
  R11037: { category: 'ข้าวและธัญพืช', productName: 'ข้าวสารหอมปทุมธานี', grade: 'ข้าวสาร 100%' },
  R11029: { category: 'ข้าวและธัญพืช', productName: 'ข้าวสารหอมมะลิ 100% ชั้น 1', grade: 'ชั้น 1' },
  R11007: { category: 'ข้าวและธัญพืช', productName: 'ข้าวสารขาว 5%', grade: '5%' },
};

// Curated Nakhon Pathom plants + Thai orchids/local ornamentals sold at Simummuang
const SIMUMMUANG_VEG_MAP = new Map([
  ['ผักชีไทย', { category: 'ผักและสมุนไพร', productName: 'ผักชี', qualifier: 'ผักชีไทย' }],
  ['ต้นหอม', { category: 'ผักและสมุนไพร', productName: 'ต้นหอม' }],
  ['ขึ้นฉ่าย/ตั้งโอ๋ ดิน', { category: 'ผักและสมุนไพร', productName: 'ขึ้นฉ่าย', qualifier: 'ขึ้นฉ่ายดิน' }],
  ['ขึ้นฉ่าย/ตั้งโอ๋ ล้าง', { category: 'ผักและสมุนไพร', productName: 'ขึ้นฉ่าย', qualifier: 'ขึ้นฉ่ายล้าง' }],
  ['ต้นคะน้า', { category: 'ผักและสมุนไพร', productName: 'ผักคะน้า', qualifier: 'ต้นคะน้า' }],
  ['ยอดคะน้า', { category: 'ผักและสมุนไพร', productName: 'ผักคะน้า', qualifier: 'ยอดคะน้า' }],
  ['ผักบุ้งจีน', { category: 'ผักและสมุนไพร', productName: 'ผักบุ้งจีน' }],
  ['ผักบุ้งไทย', { category: 'ผักและสมุนไพร', productName: 'ผักบุ้งไทย (สี่มุมเมือง กก.)' }],
  ['กวางตุ้งใบ', { category: 'ผักและสมุนไพร', productName: 'ผักกวางตุ้ง', qualifier: 'กวางตุ้งใบ' }],
  ['กวางตุ้งดอก', { category: 'ผักและสมุนไพร', productName: 'ผักกวางตุ้ง', qualifier: 'กวางตุ้งดอก' }],
  ['ถั่วฝักยาว เนื้อ', { category: 'ผักและสมุนไพร', productName: 'ถั่วฝักยาว', qualifier: 'พันธุ์เนื้อ' }],
  ['ถั่วฝักยาว เกษตร', { category: 'ผักและสมุนไพร', productName: 'ถั่วฝักยาว', qualifier: 'เกษตร' }],
  ['แตงกวา', { category: 'ผักและสมุนไพร', productName: 'แตงกวา' }],
  ['แตงร้าน', { category: 'ผักและสมุนไพร', productName: 'แตงร้าน' }],
  ['ฟักเขียวอ่อน', { category: 'ผักและสมุนไพร', productName: 'ฟักเขียว', qualifier: 'ฟักเขียวอ่อน' }],
  ['ฟักเขียวแก่', { category: 'ผักและสมุนไพร', productName: 'ฟักเขียว', qualifier: 'ฟักเขียวแก่' }],
  ['หน่อไม้ฝรั่งเขียว', { category: 'ผักและสมุนไพร', productName: 'หน่อไม้ฝรั่ง', qualifier: 'หน่อไม้ฝรั่งเขียว' }],
  ['ข้าวโพดอ่อน', { category: 'ผักและสมุนไพร', productName: 'ข้าวโพดฝักอ่อน', qualifier: 'ทั้งเปลือก' }],
  ['ข้าวโพดอ่อน ปอกเปลือก', { category: 'ผักและสมุนไพร', productName: 'ข้าวโพดฝักอ่อน', qualifier: 'ปอกเปลือก' }],
  ['พริกจินดาแดง', { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูจินดา', qualifier: 'จินดาแดง' }],
  ['พริกจินดาเขียว', { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูจินดา', qualifier: 'จินดาเขียว' }],
  ['มะนาว', { category: 'ผักและสมุนไพร', productName: 'มะนาว' }],
  ['มะเขือเทศสีดา', { category: 'ผักและสมุนไพร', productName: 'มะเขือเทศสีดา' }],
  ['มะเขือเปราะ', { category: 'ผักและสมุนไพร', productName: 'มะเขือเปราะ / เจ้าพระยา', qualifier: 'มะเขือเปราะ' }],
  ['มะเขือยาว', { category: 'ผักและสมุนไพร', productName: 'มะเขือยาว' }],
  ['มะเขือพวง', { category: 'ผักและสมุนไพร', productName: 'มะเขือพวง' }],
  ['กระชายหัว', { category: 'ผักและสมุนไพร', productName: 'กระชายขาว', qualifier: 'กระชายหัว' }],
  ['มะละกอดิบ', { category: 'ผักและสมุนไพร', productName: 'มะละกอดิบ (แขกดำดำเนิน)', qualifier: 'มะละกอดิบ' }],
  ['ใบกะเพรา', { category: 'ผักและสมุนไพร', productName: 'ใบกะเพรา' }],
  ['ใบโหระพา', { category: 'ผักและสมุนไพร', productName: 'ใบโหระพา' }],
  ['ใบแมงลัก', { category: 'ผักและสมุนไพร', productName: 'ใบแมงลัก' }],
  ['ใบสะระแหน่', { category: 'ผักและสมุนไพร', productName: 'ใบสะระแหน่' }],
  ['ใบมะกรูด', { category: 'ผักและสมุนไพร', productName: 'ใบมะกรูด' }],
  ['ต้นตะไคร้', { category: 'ผักและสมุนไพร', productName: 'ตะไคร้', qualifier: 'ต้นตะไคร้' }],
  ['ข่าอ่อน', { category: 'ผักและสมุนไพร', productName: 'ข่า', qualifier: 'ข่าอ่อน' }],
  ['ข่าแก่', { category: 'ผักและสมุนไพร', productName: 'ข่า', qualifier: 'ข่าแก่' }],
  ['ผักชีฝรั่ง', { category: 'ผักและสมุนไพร', productName: 'ผักชีฝรั่ง' }],
  ['ชะอม', { category: 'ผักและสมุนไพร', productName: 'ชะอม' }],
  ['กุ้ยช่ายเขียว', { category: 'ผักและสมุนไพร', productName: 'กุยช่าย', qualifier: 'กุ้ยช่ายเขียว' }],
  ['กุ้ยช่ายขาว', { category: 'ผักและสมุนไพร', productName: 'กุยช่าย', qualifier: 'กุ้ยช่ายขาว' }],
  ['กุ้ยช่ายดอก', { category: 'ผักและสมุนไพร', productName: 'กุยช่าย', qualifier: 'กุ้ยช่ายดอก' }],
  ['บวบเหลี่ยม', { category: 'ผักและสมุนไพร', productName: 'บวบเหลี่ยม' }],
  ['บวบหอม', { category: 'ผักและสมุนไพร', productName: 'บวบหอม' }],
  ['พริกชี้ฟ้าแดง', { category: 'ผักและสมุนไพร', productName: 'พริกชี้ฟ้า', qualifier: 'ชี้ฟ้าแดง' }],
  ['พริกชี้ฟ้าเขียว', { category: 'ผักและสมุนไพร', productName: 'พริกชี้ฟ้า', qualifier: 'ชี้ฟ้าเขียว' }],
  ['กระเจี๊ยบเขียว', { category: 'ผักและสมุนไพร', productName: 'กระเจี๊ยบเขียว' }],
  ['กรีนโอ๊ค', { category: 'ผักและสมุนไพร', productName: 'ผักสลัด กรีนโอ๊ค' }],
  ['เรดโอ๊ค', { category: 'ผักและสมุนไพร', productName: 'ผักสลัด เรดโอ๊ค' }],
  ['บัตเตอร์เฮด', { category: 'ผักและสมุนไพร', productName: 'ผักสลัด บัตเตอร์เฮด' }],
  ['สลัดคอส', { category: 'ผักและสมุนไพร', productName: 'ผักสลัด กรีนคอส' }],
  ['กรีนคอส', { category: 'ผักและสมุนไพร', productName: 'ผักสลัด กรีนคอส' }],
  ['ใบบัวบก', { category: 'ผักและสมุนไพร', productName: 'ใบบัวบก' }],
  ['ใบเตย', { category: 'ผักและสมุนไพร', productName: 'ใบเตย' }],
  ['ใบชะพลู', { category: 'ผักและสมุนไพร', productName: 'ใบชะพลู' }],
  ['ดอกอัญชัน', { category: 'ผักและสมุนไพร', productName: 'ดอกอัญชัน' }],
  ['มะระจีน', { category: 'ผักและสมุนไพร', productName: 'มะระจีน' }],
  ['เห็ดฟาง', { category: 'ผักและสมุนไพร', productName: 'เห็ดฟาง' }],
  ['ผักกาดหอม', { category: 'ผักและสมุนไพร', productName: 'ผักกาดหอม' }],
]);

const SIMUMMUANG_FRUIT_MAP = new Map([
  ['ฝรั่งกิมจู', { category: 'ผลไม้', productName: 'ฝรั่งกิมจู' }],
  ['ฝรั่งแป้นสีทอง', { category: 'ผลไม้', productName: 'ฝรั่งแป้นสีทอง' }],
  ['ฝรั่งหงเป่าสือ', { category: 'ผลไม้', productName: 'ฝรั่งหงเป่าสือ' }],
  ['ส้มโอขาวน้ำผึ้ง', { category: 'ผลไม้', productName: 'ส้มโอขาวน้ำผึ้ง (น้ำหนัก กก.)' }],
  ['ส้มโอทองดี', { category: 'ผลไม้', productName: 'ส้มโอทองดี (น้ำหนัก กก.)' }],
  ['มะพร้าวน้ำหอม', { category: 'ผลไม้', productName: 'มะพร้าวน้ำหอม' }],
  ['กล้วยน้ำว้า', { category: 'ผลไม้', productName: 'กล้วยน้ำว้า' }],
  ['กล้วยไข่', { category: 'ผลไม้', productName: 'กล้วยไข่' }],
  ['กล้วยหอมทอง', { category: 'ผลไม้', productName: 'กล้วยหอมทอง (เข่ง)' }],
  ['มะละกอแขกดำ', { category: 'ผลไม้', productName: 'มะละกอแขกดำ' }],
  ['มะละกอฮอลแลนด์', { category: 'ผลไม้', productName: 'มะละกอฮอลแลนด์' }],
  ['มะม่วงน้ำดอกไม้ สุก', { category: 'ผลไม้', productName: 'มะม่วงน้ำดอกไม้', qualifier: 'สุก' }],
  ['มะม่วงน้ำดอกไม้ ดิบ', { category: 'ผลไม้', productName: 'มะม่วงน้ำดอกไม้', qualifier: 'ดิบ' }],
  ['มะม่วงฟ้าสามพราน', { category: 'ผลไม้', productName: 'มะม่วงฟ้าสามพราน' }],
  ['มะม่วงแก้ว', { category: 'ผลไม้', productName: 'มะม่วงแก้ว' }],
  ['ชมพู่ทับทิมจันทร์', { category: 'ผลไม้', productName: 'ชมพู่ทับทิมจันทร์' }],
  ['ลำไยอีดอ', { category: 'ผลไม้', productName: 'ลำไยอีดอ' }],
  ['ขนุนทองประเสริฐ', { category: 'ผลไม้', productName: 'ขนุนทองประเสริฐ' }],
]);

const SIMUMMUANG_FIELD_MAP = new Map([
  ['มันสำปะหลัง', { category: 'พืชไร่', productName: 'มันสำปะหลัง (ตลาดผักสด)' }],
  ['มันเทศ (มันแดง)', { category: 'พืชไร่', productName: 'มันเทศ', qualifier: 'มันแดง' }],
  ['มันเทศ (มันม่วง)', { category: 'พืชไร่', productName: 'มันเทศ', qualifier: 'มันม่วง' }],
  ['ฟักทอง เกษตร', { category: 'พืชไร่', productName: 'ฟักทอง', qualifier: 'พันธุ์เกษตร' }],
  ['ฟักทอง ทองอำไพ', { category: 'พืชไร่', productName: 'ฟักทอง', qualifier: 'ทองอำไพ' }],
  ['ฟักทองทองสยาม', { category: 'พืชไร่', productName: 'ฟักทอง', qualifier: 'ทองสยาม' }],
  ['ฟักทองลาย', { category: 'พืชไร่', productName: 'ฟักทอง', qualifier: 'ฟักทองลาย' }],
  ['ข้าวโพดหวานสีเหลือง', { category: 'พืชไร่', productName: 'ข้าวโพดหวาน' }],
  ['ข้าวโพดข้าวเหนียวขาวดำ', { category: 'พืชไร่', productName: 'ข้าวโพดข้าวเหนียว' }],
]);

const SIMUMMUANG_DRY_MAP = new Map([
  ['กระเจี๊ยบเขียว', { category: 'ผักและสมุนไพร', productName: 'กระเจี๊ยบเขียว' }],
  ['พริกขี้หนูแห้ง', { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูแห้ง' }],
  ['พริกจินดาแห้ง', { category: 'ผักและสมุนไพร', productName: 'พริกขี้หนูแห้ง', qualifier: 'จินดาแห้ง' }],
]);

const SIMUMMUANG_FLOWER_ALLOW = new Set([
  'บัวหลวงสีขาว',
  'บัวหลวงสีแดง',
  'ดาวเรือง (ตัดกิ่ง)',
  'ดาวเรืองจัดพวง',
  'มะลิ',
  'มะลิจัดพวง',
  'รัก',
  'จำปี',
  'บานไม่รู้โรย',
  'กุหลาบมอญช่อ',
  'ต้นเตย',
  'ไม้กำเตย',
  'ใบตอง',
  'ใบหมากเขียว',
  'ใบทางหมาก',
  'ใบพลูจีบ',
  'ใบหมากผู้หมากเมีย',
  'ต้นกวนอิมเขียว',
  'ต้นกวนอิมลาย',
]);

const isThaiOrchidOrFlower = (name) => {
  const n = cleanName(name);
  if (!n || /ปลอม|พลาสติก|เชียงใหม่|จีน|มาเลย์|ฮอลแลนด์|ต่างประเทศ/.test(n))
    return false;
  return /^กล้วยไม้/.test(n) || SIMUMMUANG_FLOWER_ALLOW.has(n);
};

function simummuangSpec(category, name) {
  const n = cleanName(name),
    c = cleanName(category);
  if (!n) return null;
  if (c === 'ผัก' || c === 'ผักและสมุนไพร') return SIMUMMUANG_VEG_MAP.get(n) || null;
  if (c === 'ผลไม้') return SIMUMMUANG_FRUIT_MAP.get(n) || null;
  if (c === 'พืชไร่') return SIMUMMUANG_FIELD_MAP.get(n) || null;
  if (c === 'ของแห้ง ของดอง') return SIMUMMUANG_DRY_MAP.get(n) || null;
  if (c === 'ดอกไม้ สังฆภัณฑ์' || c === 'ไม้ดอกไม้ประดับ') {
    return isThaiOrchidOrFlower(n)
      ? { category: 'ไม้ดอกไม้ประดับ', productName: n }
      : null;
  }
  return null;
}

// Idempotent post-normalization mapping across all 3 sources + tests
export function normalizeNptProduct(row) {
  const source = cleanName(row.source_name || PRICE_SOURCES[0]);
  const rawName = cleanName(row.product_name);
  const rawCat = cleanName(row.product_category);
  const rawId = cleanName(row.source_product_id);
  const unit = normalizeUnit(row.unit);
  let category = rawCat;
  let productName = rawName;
  let grade = cleanName(row.grade) || 'ตามชื่อสินค้าต้นทาง';

  if (source === 'สศก. / NABC') {
    if (
      rawCat === 'ข้าวหอมมะลิ' ||
      /หอมมะลิ/.test(rawName) ||
      /หอมมะลิ/.test(rawId)
    ) {
      category = 'ข้าวและธัญพืช';
      productName = 'ข้าวเปลือกหอมมะลิ';
      grade =
        rawName.includes('105') || rawId.includes('105')
          ? 'พันธุ์ขาวดอกมะลิ 105'
          : grade;
    } else if (rawCat === 'ข้าวเปลือกเจ้า' || /^ข้าวเปลือกเจ้า/.test(rawName)) {
      category = 'ข้าวและธัญพืช';
      productName = 'ข้าวเปลือกเจ้า';
      const tail = cleanName(rawName.replace(/^ข้าวเปลือกเจ้า/, ''));
      grade = tail || grade;
    } else if (rawCat === 'ข้าวโพดเลี้ยงสัตว์' || /^ข้าวโพดเลี้ยงสัตว์/.test(rawName)) {
      category = 'พืชไร่';
      productName = 'ข้าวโพดเลี้ยงสัตว์';
      const tail = cleanName(rawName.replace(/^ข้าวโพดเลี้ยงสัตว์/, ''));
      grade = tail || grade;
    } else if (rawCat === 'มันสำปะหลัง' || /มันสำปะหลัง/.test(rawName)) {
      category = 'พืชไร่';
      productName = 'มันสำปะหลัง';
      const tail = cleanName(rawName.replace(/^หัวมันสำปะหลังสด/, ''));
      grade = tail || grade;
    } else if (rawCat === 'อ้อยโรงงาน') {
      category = 'พืชไร่';
      productName = 'อ้อยโรงงาน';
    } else if (rawCat === 'มะพร้าว') {
      category = 'ผลไม้';
      if (/^มะพร้าวน้ำหอม/.test(rawName)) {
        productName = 'มะพร้าวน้ำหอม';
      } else {
        productName = 'มะพร้าวผลแห้ง (รายร้อยผล)';
        const tail = cleanName(rawName.replace(/^มะพร้าวผลแห้ง/, ''));
        grade = tail || grade;
      }
    } else if (rawCat === 'มะนาว' || /^มะนาว/.test(rawName)) {
      category = 'ผักและสมุนไพร';
      productName = 'มะนาว (รายร้อยผล)';
      const tail = cleanName(
        rawName.replace(/^มะนาว\s*(?:\(รายร้อยผล\))?/, '')
      );
      grade = tail || grade;
    }
  } else if (source === 'กรมการค้าภายใน') {
    const spec = DIT_NORMALIZATION[rawId];
    if (spec) {
      category = spec.category;
      productName = spec.productName;
      grade = spec.grade;
    }
  } else if (source === 'ตลาดสี่มุมเมือง') {
    const spec = simummuangSpec(rawCat, rawName);
    if (spec) {
      category = spec.category;
      productName = spec.productName;
      grade = formatGrade(spec.qualifier, grade);
    } else {
      // Idempotency when already normalized on previous snapshot reload
      category =
        rawCat === 'ดอกไม้ สังฆภัณฑ์' ? 'ไม้ดอกไม้ประดับ' : rawCat;
    }
  }

  return {
    product_category: category || 'อื่นๆ',
    product_name: productName,
    grade,
    unit,
  };
}

// Keep quick validation matching normalized OR raw names safely during mergePriceHistory
const NORMALIZED_SMM_NAMES = new Set([
  ...[...SIMUMMUANG_VEG_MAP.values()].map((s) => s.productName),
  ...[...SIMUMMUANG_FRUIT_MAP.values()].map((s) => s.productName),
  ...[...SIMUMMUANG_FIELD_MAP.values()].map((s) => s.productName),
  ...[...SIMUMMUANG_DRY_MAP.values()].map((s) => s.productName),
]);
const ALLOWED_RAW_OR_NORMALIZED_CATEGORIES = new Set([
  'ข้าวและธัญพืช',
  'พืชไร่',
  'ผักและสมุนไพร',
  'ผลไม้',
  'ไม้ดอกไม้ประดับ',
]);

export function isAgriculturalProduct(row) {
  const source = cleanName(row.source_name || PRICE_SOURCES[0]);
  const name = cleanName(row.product_name);
  const category = cleanName(row.product_category);
  if (!name) return false;
  switch (source) {
    case 'สศก. / NABC':
      return (
        NABC_CROPS.has(category) ||
        (ALLOWED_RAW_OR_NORMALIZED_CATEGORIES.has(category) &&
          !/กุ้ง|ไก่|สุกร|หมู|ไข่|ยาง|ปาล์ม|ทุเรียน|มังคุด|เงาะ|ลิ้นจี่|ลำไย|สับปะรด|มันฝรั่ง/.test(
            name
          ))
      );
    case 'กรมการค้าภายใน':
      return DIT_PRODUCTS.has(cleanName(row.source_product_id));
    case 'ตลาดสี่มุมเมือง':
      if (simummuangSpec(category, name) !== null) return true;
      if (ALLOWED_RAW_OR_NORMALIZED_CATEGORIES.has(category)) {
        return NORMALIZED_SMM_NAMES.has(name) || isThaiOrchidOrFlower(name);
      }
      return false;
    default:
      return false;
  }
}

const day = (date) =>
  new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const get = async (url, options = {}) => {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw Error(`HTTP ${r.status}: ${new URL(url).hostname}`);
  return r;
};
const amount = (n) =>
  n === null || n === undefined || n === '' ? null : Number(n);

export function priceRow(row) {
  for (const key of [
    'source_name',
    'source_product_id',
    'product_name',
    'grade',
    'unit',
    'price_type',
  ])
    assert(typeof row[key] === 'string' && row[key].trim(), `Missing ${key}`);
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(row.data_date) &&
      !Number.isNaN(Date.parse(row.data_date)) &&
      new Date(row.data_date).toISOString().slice(0, 10) === row.data_date,
    'Invalid price date'
  );
  const low = amount(row.price_min),
    high = amount(row.price_max);
  assert(
    (low === null || (Number.isFinite(low) && low >= 0)) &&
      high !== null &&
      Number.isFinite(high) &&
      high >= (low ?? 0),
    'Invalid price range'
  );
  assert(/^https:\/\//.test(row.source_url), 'Missing source URL');
  return safeRows(table, [
    {
      ...row,
      price_min: low,
      price_max: high,
      series_key: JSON.stringify([
        row.source_name,
        row.source_product_id,
        row.grade,
        row.market_name,
        row.province,
        row.unit,
        row.price_type,
      ]),
    },
  ])[0];
}

export function parseSimummuang(items, now, rejected = []) {
  return items
    .filter(
      (p) =>
        p.isActive &&
        p.price?.action_date &&
        p.th?.name &&
        p.prod_unit_id?.th?.name &&
        isAgriculturalProduct({
          source_name: 'ตลาดสี่มุมเมือง',
          product_category: p.prod_category_id?.th?.name,
          product_name: p.th.name,
        })
    )
    .flatMap((p) =>
      [
        ['small', 'เล็ก'],
        ['medium', 'กลาง'],
        ['large', 'ใหญ่'],
      ].flatMap(([size, rawGrade]) => {
        const range = p.price[size];
        if (!range || (Number(range.min) === 0 && Number(range.max) === 0))
          return [];
        if (
          range.min == null ||
          range.max == null ||
          !Number.isFinite(Number(range.min)) ||
          !Number.isFinite(Number(range.max)) ||
          Number(range.min) < 0 ||
          Number(range.max) <= 0 ||
          Number(range.min) > Number(range.max)
        ) {
          rejected.push({
            product: cleanName(p.th.name),
            grade: rawGrade,
            reason: 'ช่วงราคาไม่ครบ ติดลบ หรือต่ำสุดสูงกว่าสูงสุด',
          });
          return [];
        }
        const norm = normalizeNptProduct({
          source_name: 'ตลาดสี่มุมเมือง',
          product_category: p.prod_category_id?.th?.name || 'ไม่ระบุหมวด',
          product_name: p.th.name,
          grade: rawGrade,
          unit: 'บาท/' + p.prod_unit_id.th.name,
        });
        return [
          priceRow({
            data_date: day(p.price.action_date),
            product_category: norm.product_category,
            product_name: norm.product_name,
            source_name: 'ตลาดสี่มุมเมือง',
            source_product_id: p._id,
            grade: norm.grade,
            market_name: 'ตลาดสี่มุมเมือง',
            province: 'ปทุมธานี',
            unit: norm.unit,
            price_type: 'ราคาขายส่งอ้างอิงตลาด',
            day_price: null,
            price_min: Number(range.min) === 0 ? null : range.min,
            price_max: range.max,
            source_url: 'https://www.simummuangmarket.com/pricing',
            spatial_scope:
              'ตลาดเอกชนทางเลือก (เฉพาะพืช/กล้วยไม้ที่ปลูกในนครปฐม) · ต่ำสุด 0 อ่านว่าไม่ระบุ',
            collected_at: now.toISOString(),
          }),
        ];
      })
    );
}

async function simummuang(now, rejected) {
  const items = [],
    ids = new Set();
  let expected;
  for (let page = 1; page <= 30; page++) {
    const body = await (
        await get(
          `https://api.simummuangmarket.com/api/app/products?page=${page}&limit=100`
        )
      ).json(),
      batch = body.data;
    assert(
      body.statusCode === 200 &&
        Array.isArray(batch?.data) &&
        Number.isSafeInteger(batch.total),
      'Invalid market pagination'
    );
    expected ??= batch.total;
    assert.equal(batch.total, expected, 'Market changed during pagination');
    for (const item of batch.data) {
      assert(!ids.has(item._id), 'Duplicate market item');
      ids.add(item._id);
      items.push(item);
    }
    if (items.length === expected) return parseSimummuang(items, now, rejected);
    assert(
      items.length < expected && batch.data.length > 0 && page < 30,
      'Incomplete market pagination'
    );
  }
}

async function dit(now) {
  const from = new Date(now.getTime() - 45 * 86400000);
  const be = (d) => {
    const [y, m, dPart] = day(d).split('-');
    return `${dPart}/${m}/${Number(y) + 543}`;
  };
  const rows = [];
  for (const cfg of DIT_SERIES_GROUPS) {
    const allowed = ALLOWED_PRODUCTS[cfg.group] || [];
    if (!allowed.length) continue;
    const products = await (
      await get(
        `https://pricelist.dit.go.th/getdata.php?ID=${cfg.group}&TYPE=product`
      )
    ).json();
    assert(Array.isArray(products), `Missing DIT product list: ${cfg.group}`);
    const selected = products.filter((p) =>
      allowed.includes(String(p.product_id))
    );
    for (let i = 0; i < selected.length; i += 6) {
      rows.push(
        ...(
          await Promise.all(
            selected.slice(i, i + 6).map(async (p) => {
              const html = await (
                await get(DIT_SOURCE_URL, {
                  method: 'POST',
                  body: new URLSearchParams({
                    day1: be(from),
                    day2: be(now),
                    protype: cfg.protype,
                    progroup: cfg.group,
                    proname: p.product_id,
                  }),
                })
              ).text();
              const parsed = parseDitPriceHtml(html, {
                id: p.product_id,
                productName: p.product_name,
              });
              if (!parsed) return [];
              assert(
                parsed.priceType === cfg.priceType && parsed.unit,
                `Unknown DIT scope/unit for ${p.product_id}`
              );
              const norm = normalizeNptProduct({
                source_name: 'กรมการค้าภายใน',
                source_product_id: String(p.product_id),
                product_category: cfg.category || CATEGORY_NAMES[cfg.group],
                product_name: parsed.productName,
                grade: 'ตามชื่อสินค้าต้นทาง',
                unit: 'บาท/' + parsed.unit,
              });
              return parsed.series.map((point) =>
                priceRow({
                  data_date: point.date,
                  product_category: norm.product_category,
                  product_name: norm.product_name,
                  source_name: 'กรมการค้าภายใน',
                  source_product_id: String(p.product_id),
                  grade: norm.grade,
                  market_name: cfg.marketName,
                  province: parsed.scopeName,
                  unit: norm.unit,
                  price_type: cfg.priceTypeLabel,
                  day_price: point.value,
                  price_min: point.min ?? point.value,
                  price_max: point.max ?? point.value,
                  source_url: DIT_SOURCE_URL,
                  spatial_scope: parsed.scopeName
                    ? 'มาตรฐานรัฐ (กรมการค้าภายใน) · ' + parsed.scopeName
                    : 'มาตรฐานรัฐ (กรมการค้าภายใน) · อ้างอิงกลางทุกวันทำการ จ.-ศ.',
                  collected_at: now.toISOString(),
                })
              );
            })
          )
        ).flat()
      );
    }
  }
  return rows;
}

async function nabcNpt(now) {
  const rows = await collectPrices(now);
  return rows
    .filter((r) => isAgriculturalProduct({ ...r, source_name: 'สศก. / NABC' }))
    .map((r) => {
      const norm = normalizeNptProduct({
        ...r,
        source_name: 'สศก. / NABC',
      });
      return priceRow({
        ...r,
        source_name: 'สศก. / NABC',
        product_category: norm.product_category,
        product_name: norm.product_name,
        grade: norm.grade,
        unit: norm.unit,
      });
    });
}

export function mergePriceHistory(previous, fresh, now) {
  const cutoff = day(new Date(now.getTime() - 90 * 86400000)),
    latest = day(now),
    map = new Map();
  const input = [...previous, ...fresh].filter(isAgriculturalProduct);
  const sourceDates = new Map();
  for (const row of input) {
    const source = row.source_name || PRICE_SOURCES[0];
    if (
      row.data_date <= latest &&
      row.data_date > (sourceDates.get(source) || '')
    )
      sourceDates.set(source, row.data_date);
  }
  for (const raw of input) {
    if (raw.price_min == null && raw.price_max == null && raw.day_price == null)
      continue;
    const source = raw.source_name || PRICE_SOURCES[0];
    const norm = normalizeNptProduct({ ...raw, source_name: source });
    const r = priceRow({
      ...raw,
      source_name: source,
      source_product_id: raw.source_product_id || raw.product_name,
      product_category: norm.product_category,
      product_name: norm.product_name,
      grade: norm.grade,
      unit: norm.unit,
      price_min: raw.price_min ?? raw.day_price,
      price_max: raw.price_max ?? raw.day_price,
    });
    if (
      (r.data_date >= cutoff || r.data_date === sourceDates.get(source)) &&
      r.data_date <= latest
    )
      map.set(JSON.stringify([r.series_key, r.data_date]), r);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.data_date.localeCompare(a.data_date) ||
      a.series_key.localeCompare(b.series_key)
  );
}

export function boundPriceHistory(input) {
  let data = input;
  const latestBySource = new Map(
    PRICE_SOURCES.map((name) => [
      name,
      data
        .filter((r) => r.source_name === name)
        .map((r) => r.data_date)
        .sort()
        .at(-1),
    ])
  );
  const history = {
    maxDays: 90,
    maxBytes: 10 * 1024 * 1024,
    trimmedForSize: false,
  };
  while (Buffer.byteLength(JSON.stringify(data, null, 2)) > 9 * 1024 * 1024) {
    const oldest = data
      .filter((r) => r.data_date !== latestBySource.get(r.source_name))
      .map((r) => r.data_date)
      .sort()[0];
    assert(oldest, 'Latest source batch exceeds snapshot limit');
    data = data.filter(
      (r) =>
        r.data_date !== oldest ||
        r.data_date === latestBySource.get(r.source_name)
    );
    history.trimmedForSize = true;
  }
  return { data, history };
}

/** Resolve status metadata while preserving recent local sync success when a remote runner cannot reach the upstream API. */
export function resolveSourceStatus({ name, result, previousSource, now }) {
  const success = result.status === 'fulfilled' && result.value.length > 0;
  if (success) {
    return {
      name,
      status: 'ready',
      fetchedAt: now.toISOString(),
      rows: result.value.length,
      error: null,
    };
  }
  const prevTime = previousSource?.fetchedAt
    ? Date.parse(previousSource.fetchedAt)
    : Number.NaN;
  const ageMs = Number.isFinite(prevTime) ? now.getTime() - prevTime : Infinity;
  const freshLocalSync =
    previousSource?.status === 'ready' &&
    previousSource?.rows > 0 &&
    Number.isFinite(prevTime) &&
    ageMs >= 0 &&
    (day(previousSource.fetchedAt) === day(now) || ageMs <= 12 * 3600 * 1000);
  if (freshLocalSync) {
    return {
      name,
      status: 'ready',
      fetchedAt: previousSource.fetchedAt,
      rows: previousSource.rows,
      error: null,
    };
  }
  return {
    name,
    status: 'retained',
    fetchedAt: previousSource?.fetchedAt || null,
    rows: 0,
    error:
      result.status === 'rejected' ? result.reason.message : 'No price records',
  };
}

export async function collectMultiMarket(previous = {}, now = new Date()) {
  const rejected = [];
  const collectors = [
    () => nabcNpt(now),
    () => dit(now),
    () => simummuang(now, rejected),
  ];
  const results = await Promise.allSettled(
    collectors.map(async (fn) => (await fn()).filter(isAgriculturalProduct))
  );
  const sources = results.map((result, i) =>
    resolveSourceStatus({
      name: PRICE_SOURCES[i],
      result,
      previousSource: previous.sources?.find(
        (s) => s.name === PRICE_SOURCES[i]
      ),
      now,
    })
  );
  const fresh = results.flatMap((r) =>
    r.status === 'fulfilled' && r.value.length > 0 ? r.value : []
  );
  assert(
    fresh.length || previous.data?.length,
    'All price sources unavailable; keep previous file'
  );
  const { data, history } = boundPriceHistory(
    mergePriceHistory(previous.data || [], fresh, now)
  );
  for (const source of sources) {
    const rows = data.filter((r) => r.source_name === source.name);
    source.retainedRows = rows.length;
    source.latestDate =
      rows
        .map((r) => r.data_date)
        .sort()
        .at(-1) || null;
  }
  return {
    schemaVersion: 1,
    table,
    productScope:
      'เฉพาะพืชผลและไม้ดอกไม้ประดับที่ปลูกและซื้อขายในจังหวัดนครปฐม: มาตรฐานรัฐ (สศก./NABC รับซื้อ + กรมการค้าภายใน ขายส่ง-ปลีก) และตลาดเอกชนทางเลือก (สี่มุมเมือง)',
    status: 'ready',
    count: data.length,
    fetchedAt: now.toISOString(),
    sources,
    history,
    qualityRejected: {
      source: 'ตลาดสี่มุมเมือง',
      count: rejected.length,
      items: rejected,
    },
    data,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.indexOf('--output');
  const output = index >= 0 ? process.argv[index + 1] : 'output/bi-pages';
  const file = path.join(output, table + '.json');
  const previous = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  const snapshot = await collectMultiMarket(previous);
  assert(
    Buffer.byteLength(JSON.stringify(snapshot, null, 2) + '\n') <=
      snapshot.history.maxBytes,
    'Price snapshot exceeds 10 MiB'
  );
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
  const manifestFile = path.join(output, 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')),
      bytes = fs.readFileSync(file);
    const entry = manifest.tables.find((t) => t.table === table);
    assert(entry, 'Missing price manifest entry');
    Object.assign(entry, {
      title: 'ราคาพืชเกษตรและไม้ดอกนครปฐม · มาตรฐานรัฐ + เอกชนทางเลือก',
      count: snapshot.count,
      fetchedAt: snapshot.fetchedAt,
      dataAsOf: snapshot.data[0]?.data_date,
      dataAsOfLabel: snapshot.data[0]?.data_date,
      scope: 'รับซื้อ (สศก.) · ขายส่ง/ปลีก (กรมการค้าภายใน) · เอกชนทางเลือก (สี่มุมเมือง)',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(
    JSON.stringify({ rows: snapshot.count, sources: snapshot.sources }, null, 2)
  );
}
