import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { flattenSoilWater, flattenFlood } from './agro-environment.mjs';

const districts = [{ district_code: '7301', district: 'เมืองนครปฐม' }];
const weather = [
  {
    timezone: 'Asia/Bangkok',
    latitude: 13.8,
    longitude: 100.1,
    hourly_units: { soil_moisture_9_to_27cm: 'm³/m³' },
    daily_units: { et0_fao_evapotranspiration: 'mm' },
    daily: {
      time: ['2026-10-20'],
      et0_fao_evapotranspiration: [null],
      precipitation_sum: [1],
    },
    hourly: {
      time: Array.from(
        { length: 24 },
        (_, i) => '2026-10-20T' + String(i).padStart(2, '0') + ':00'
      ),
      soil_moisture_9_to_27cm: Array(24).fill(0.3),
    },
  },
];
const row = flattenSoilWater(weather, districts, '2026-10-20')[0];
assert(Math.abs(row.soil_moisture_m3m3 - 0.3) < 1e-12);
assert.equal(row.et0_mm, null);
weather[0].hourly.soil_moisture_9_to_27cm[0] = null;
assert.equal(
  flattenSoilWater(weather, districts, '2026-10-20')[0].soil_moisture_m3m3,
  null
);
assert.equal(
  flattenFlood(
    { items: [], numberReturned: 0, numberMatched: 0 },
    districts,
    '7days',
    'now'
  )[0].flood_rai,
  null
);
assert.throws(() =>
  flattenFlood(
    { items: [], numberReturned: 0, numberMatched: 2 },
    districts,
    '7days',
    'now'
  )
);
const flood = flattenFlood(
  {
    items: [
      {
        provinceCode: 73,
        amphoeCode: 7301,
        tambonCode: 730101,
        flood: 3200,
        rice: 1600,
      },
    ],
    numberReturned: 1,
    numberMatched: 1,
  },
  districts,
  '7days',
  'now'
)[0];
assert.equal(flood.flood_rai, 2);
assert.equal(flood.source_date, null);
assert.match(flood.source_status, /ไม่ระบุวันภาพ/);
execFileSync(
  process.env.PYTHON || 'python',
  [fileURLToPath(new URL('./ndvi-image-stats.py', import.meta.url)), '--check'],
  { stdio: 'inherit' }
);
console.log(
  'Weather units/completeness, missing values, flood pagination/date and NDVI checks passed.'
);
