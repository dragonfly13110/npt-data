import assert from 'node:assert/strict';
import {
  formatBangkokISODate,
  getBangkokISODateDaysAgo,
  fetchOpenMeteoDailyWeather,
  mergeDailyWeatherRows,
  refreshDailyWeatherSnapshot,
} from './weather-refresh.mjs';

// 22:00 UTC on 2026-11-12 is already 05:00 on 2026-11-13 in Asia/Bangkok.
const utcNight = new Date('2026-11-12T22:00:00Z');
assert.equal(formatBangkokISODate(utcNight), '2026-11-13');
assert.equal(getBangkokISODateDaysAgo(1, utcNight), '2026-11-12');

// Forecast overrides archive lag and tolerates archive failure cleanly.
const partialFetcher = async (url) => {
  if (url.includes('archive-api.open-meteo.com')) {
    return { ok: false, status: 503, json: async () => ({}) };
  }
  return {
    ok: true,
    json: async () => ({
      daily: {
        time: ['2026-11-08', '2026-11-12', '2026-11-13'],
        temperature_2m_mean: [26.5, 26.3, 26.8],
        temperature_2m_min: [23.6, 23.3, 24.2],
        temperature_2m_max: [31.2, 30.4, 30.9],
        rain_sum: [0.5, null, 0.8],
        wind_speed_10m_max: [11.9, 17.8, 14.8],
      },
    }),
  };
};

const partialRows = await fetchOpenMeteoDailyWeather({
  fetcher: partialFetcher,
  now: utcNight,
  fetchedAt: '2026-11-12T22:00:00.000Z',
});
assert.deepEqual(
  partialRows.map((r) => [r.date, r.prcp]),
  [
    ['2026-11-08', 0.5],
    ['2026-11-12', 0],
    ['2026-11-13', 0.8],
  ]
);

// Throws only when both archive and forecast fail.
await assert.rejects(
  () =>
    fetchOpenMeteoDailyWeather({
      fetcher: async () => ({ ok: false, status: 502, json: async () => ({}) }),
      now: utcNight,
    }),
  /Open-Meteo weather fetch failed/
);

// Empty time series returns [] cleanly without throwing.
const emptyRows = await fetchOpenMeteoDailyWeather({
  fetcher: async () => ({
    ok: true,
    json: async () => ({ daily: { time: [] } }),
  }),
  now: utcNight,
});
assert.deepEqual(emptyRows, []);

// Merging preserves historical IDs & pressure values while filling new dates sorted ascending.
const merged = mergeDailyWeatherRows({
  existingRows: [
    {
      id: 'uuid-nov7',
      date: '2026-11-07',
      tavg: 25.9,
      tmin: 24.4,
      tmax: 30,
      prcp: 7.3,
      wspd: 11.5,
      pres: 1011,
      updated_at: '2026-11-06T22:00:58Z',
    },
    {
      id: 'uuid-jan1',
      date: '2026-01-01',
      tavg: 25,
      tmin: 21,
      tmax: 30,
      prcp: 0,
      wspd: 8,
      pres: null,
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  freshRows: [
    {
      date: '2026-11-07',
      tavg: 25.5,
      tmin: 23.8,
      tmax: 29.7,
      prcp: 10.1,
      wspd: 13.6,
      pres: null,
      updated_at: '2026-11-13T07:00:00Z',
    },
    ...partialRows,
  ],
  fetchedAt: '2026-11-13T07:00:00Z',
});
assert.equal(merged.length, 5);
assert.equal(merged[0].date, '2026-01-01');
assert.equal(merged[1].id, 'uuid-nov7');
assert.equal(merged[1].pres, 1011);
assert.equal(merged[1].prcp, 10.1);
assert.equal(merged[4].id, 'open-meteo-2026-11-13');
assert.equal(merged[4].prcp, 0.8);

const refreshedSnapshot = await refreshDailyWeatherSnapshot(
  {
    schemaVersion: 1,
    table: 'daily_weather',
    status: 'ready',
    fetchedAt: '2026-11-13T07:00:00Z',
    count: 1,
    data: [merged[0]],
  },
  { fetcher: partialFetcher, now: utcNight }
);
assert.equal(refreshedSnapshot.count, 4);
assert.equal(refreshedSnapshot.data.at(-1).date, '2026-11-13');

console.log('weather-refresh tests passed');
