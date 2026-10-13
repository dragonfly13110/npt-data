import assert from 'node:assert/strict';
import { collectPagesSnapshot } from './pages.mjs';
import { flattenDiseaseForecasts, flattenWaterSituation, flattenRainForecast } from './public-situation.mjs';

const result = { data: [{ id: 'one', phone: 'private' }], count: 1, error: null };
const client = { from: () => ({ select: () => ({ order: () => ({ range: async () => result }) }) }) };
const snapshot = await collectPagesSnapshot(client);
assert.equal(snapshot.tables.farmer_registry.data[0].phone, undefined);
assert.equal(snapshot.tables.farmer_registry.data[0].household_count, null);
result.data = [];
await assert.rejects(collectPagesSnapshot(client));
assert.equal(flattenDiseaseForecasts([{ forecast_date: '2026-10-13', summary: 'Pending AI analysis', details: [] }]).length, 0);
assert.throws(() => flattenDiseaseForecasts([{ forecast_date: '2026-10-13', summary: 'รายงาน', details: null }]));
const water = flattenWaterSituation({ observed: [{ provinceCode: '73', stationCode: 'one', variable: 'WaterLevel', value: null, observedAt: '2026-10-01T00:00:00+07:00' }] }, new Date('2026-10-13T00:00:00+07:00'));
assert.equal(water[0].water_level, null);
assert.equal(water[0].freshness, 'ข้อมูลเก่า');
assert.equal(flattenRainForecast({ forecast: [{ provinceCode: '73', variable: 'ForecastRain', value: null }] })[0].rain_mm, null);
console.log('Public BI privacy, failed-source, AI and missing-value checks passed');
