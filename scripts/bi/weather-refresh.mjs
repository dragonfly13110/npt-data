/**
 * Shared Open-Meteo daily weather fetcher and snapshot merger for Nakhon Pathom.
 * Keeps both Supabase sync (Netlify) and static Power BI JSON feeds current.
 */
export const NPT_WEATHER_COORDS = Object.freeze({
  lat: 13.8196,
  lon: 100.0602,
});

const DAILY_VARIABLES =
  'temperature_2m_max,temperature_2m_min,temperature_2m_mean,rain_sum,wind_speed_10m_max';

export function formatBangkokISODate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function getBangkokISODateDaysAgo(daysAgo = 0, now = new Date()) {
  return formatBangkokISODate(new Date(now.getTime() - daysAgo * 86400000));
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalizes an Open-Meteo `daily` payload into rows keyed by ISO date.
 * @param {any} daily
 * @param {Map<string, any>} targetMap
 * @param {string} updatedAt
 */
export function collectOpenMeteoSeries(daily, targetMap, updatedAt) {
  const times = Array.isArray(daily?.time) ? daily.time : [];
  for (let idx = 0; idx < times.length; idx += 1) {
    const time = times[idx];
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(time)) {
      continue;
    }
    const tavg = finiteOrNull(daily.temperature_2m_mean?.[idx]);
    if (tavg === null) continue;

    targetMap.set(time, {
      date: time,
      tavg,
      tmin: finiteOrNull(daily.temperature_2m_min?.[idx]),
      tmax: finiteOrNull(daily.temperature_2m_max?.[idx]),
      prcp: finiteOrNull(daily.rain_sum?.[idx]) ?? 0,
      wspd: finiteOrNull(daily.wind_speed_10m_max?.[idx]),
      pres: null,
      updated_at: updatedAt,
    });
  }
}

async function fetchJsonWithTimeout(url, fetcher, timeoutMs = 20000) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Fetches Nakhon Pathom daily weather from Open-Meteo Archive and Forecast APIs,
 * letting Forecast overwrite trailing archive lag up to the current Bangkok date.
 * @param {{
 *   fetcher?: typeof fetch,
 *   now?: Date,
 *   lookbackDays?: number,
 *   pastDays?: number,
 *   forecastDays?: number,
 *   fetchedAt?: string,
 *   lat?: number,
 *   lon?: number,
 * }} [options]
 */
export async function fetchOpenMeteoDailyWeather({
  fetcher = fetch,
  now = new Date(),
  lookbackDays = 90,
  pastDays = 30,
  forecastDays = 1,
  fetchedAt = now.toISOString(),
  lat = NPT_WEATHER_COORDS.lat,
  lon = NPT_WEATHER_COORDS.lon,
} = {}) {
  const startDate = getBangkokISODateDaysAgo(lookbackDays, now);
  const endDate = getBangkokISODateDaysAgo(0, now);

  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=${DAILY_VARIABLES}&timezone=Asia%2FBangkok`;
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${DAILY_VARIABLES}&timezone=Asia%2FBangkok&past_days=${pastDays}&forecast_days=${forecastDays}`;

  const [archiveRes, forecastRes] = await Promise.allSettled([
    fetchJsonWithTimeout(archiveUrl, fetcher),
    fetchJsonWithTimeout(forecastUrl, fetcher),
  ]);

  if (archiveRes.status === 'rejected' && forecastRes.status === 'rejected') {
    const archiveErr = archiveRes.reason?.message || archiveRes.reason;
    const forecastErr = forecastRes.reason?.message || forecastRes.reason;
    throw new Error(
      `Open-Meteo weather fetch failed: archive=${archiveErr}; forecast=${forecastErr}`
    );
  }

  const merged = new Map();
  if (archiveRes.status === 'fulfilled') {
    collectOpenMeteoSeries(archiveRes.value?.daily, merged, fetchedAt);
  }
  if (forecastRes.status === 'fulfilled') {
    collectOpenMeteoSeries(forecastRes.value?.daily, merged, fetchedAt);
  }

  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Merges existing Supabase daily_weather rows with fresh Open-Meteo records,
 * retaining historical rows/IDs/pressure values while updating recent dates.
 * @param {{ existingRows?: any[], freshRows?: any[], fetchedAt?: string }} [options]
 */
export function mergeDailyWeatherRows({
  existingRows = [],
  freshRows = [],
  fetchedAt = new Date().toISOString(),
} = {}) {
  const byDate = new Map();
  for (const row of existingRows) {
    if (row?.date) byDate.set(row.date, { ...row });
  }
  for (const row of freshRows) {
    if (!row?.date) continue;
    const prev = byDate.get(row.date);
    byDate.set(row.date, {
      id: prev?.id || `open-meteo-${row.date}`,
      date: row.date,
      tavg: row.tavg,
      tmin: row.tmin,
      tmax: row.tmax,
      prcp: row.prcp ?? 0,
      wspd: row.wspd,
      pres: prev?.pres ?? row.pres ?? null,
      updated_at: row.updated_at || fetchedAt,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Refreshes a `daily_weather` BI snapshot table in place using Open-Meteo data.
 * @param {any} tableSnapshot
 * @param {any} [options]
 */
export async function refreshDailyWeatherSnapshot(tableSnapshot, options = {}) {
  const fetchedAt =
    options.fetchedAt || tableSnapshot?.fetchedAt || new Date().toISOString();
  const freshRows = await fetchOpenMeteoDailyWeather({
    ...options,
    fetchedAt,
  });
  if (!freshRows.length) return tableSnapshot;

  const merged = mergeDailyWeatherRows({
    existingRows: tableSnapshot?.data || [],
    freshRows,
    fetchedAt,
  });
  return {
    ...tableSnapshot,
    status: merged.length ? 'ready' : 'empty',
    count: merged.length,
    data: merged,
  };
}
