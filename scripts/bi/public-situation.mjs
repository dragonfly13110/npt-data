import { PUBLIC_POWERBI_DATASETS, readPowerbiPage } from './datasets.mjs';

const text = (value) => (typeof value === 'string' ? value : null);
const number = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
const listText = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').join(' • ')
    : text(value);
const districtNames = {
  7301: 'เมืองนครปฐม',
  7302: 'กำแพงแสน',
  7303: 'นครชัยศรี',
  7304: 'ดอนตูม',
  7305: 'บางเลน',
  7306: 'สามพราน',
  7307: 'พุทธมณฑล',
};

const waterTypes = {
  station_code: 'text',
  station_name: 'text',
  district_code: 'text',
  district: 'text',
  latitude: 'number',
  longitude: 'number',
  observed_at: 'text',
  water_level: 'number',
  unit: 'text',
  source: 'text',
  freshness: 'text',
  bank_msl: 'number',
  status_label: 'text',
  status_color: 'text',
  quality_flag: 'text',
};

// These flat fields are the public contract. Never publish raw AI JSON or station payloads.
export const PUBLIC_SITUATION_DATASETS = {
  public_water_advice: {
    title: 'บทวิเคราะห์ประกอบการติดตามน้ำ AI',
    types: {
      district_code: 'text',
      district: 'text',
      horizon: 'text',
      summary: 'text',
      recommended_checks: 'text',
      uncertainties: 'text',
      source_status: 'text',
      generated_at: 'text',
      evidence_type: 'text',
    },
  },
  public_disease_reports: {
    title: 'รอบวิเคราะห์โรคพืช AI',
    types: {
      forecast_date: 'text',
      summary: 'text',
      report_status: 'text',
      watch_count: 'number',
      source_updated_at: 'text',
    },
  },
  public_disease_watch: {
    title: 'โรคและแมลงที่ควรเฝ้าระวัง',
    types: {
      forecast_date: 'text',
      crop: 'text',
      disease_name: 'text',
      threat_type: 'text',
      risk_level: 'text',
      symptoms: 'text',
      monitoring_actions: 'text',
      reasoning: 'text',
      evidence_type: 'text',
      source_updated_at: 'text',
      source_page: 'text',
    },
  },
  public_weather: {
    title: 'ข้อมูลอากาศที่ระบบเก็บ',
    types: {
      date: 'text',
      temperature_avg_c: 'number',
      temperature_min_c: 'number',
      temperature_max_c: 'number',
      rain_mm: 'number',
      source_updated_at: 'text',
      area_scope: 'text',
    },
  },
  public_water: {
    title: 'ระดับน้ำรายสถานี',
    types: waterTypes,
  },
  public_water_history: {
    title: 'ประวัติระดับน้ำรายสถานี',
    types: waterTypes,
  },
  public_rain_forecast: {
    title: 'ฝนคาดการณ์รายอำเภอ',
    types: {
      district_code: 'text',
      district: 'text',
      forecast_at: 'text',
      rain_mm: 'number',
      unit: 'text',
      source: 'text',
      interval: 'text',
      evidence_type: 'text',
    },
  },
  public_hotspots: {
    title: 'จุดความร้อนที่ดาวเทียมตรวจพบ',
    types: {
      id: 'text',
      district: 'text',
      district_code: 'text',
      subdistrict: 'text',
      acq_date: 'text',
      acq_time: 'text',
      latitude: 'number',
      longitude: 'number',
      satellite: 'text',
      instrument: 'text',
      confidence: 'text',
      frp: 'number',
      land_use: 'text',
      source: 'text',
      updated_at: 'text',
    },
  },
};

export function flattenDiseaseForecasts(reports) {
  return reports.flatMap((report) => {
    if (String(report.summary || '').startsWith('Pending AI analysis'))
      return [];
    if (!text(report.summary)?.trim() || !Array.isArray(report.details))
      throw new Error('Incomplete disease report');
    return report.details.map((detail) => {
      if (!detail || !text(detail.name) || !text(detail.target_crop))
        throw new Error('Invalid disease watch');
      return {
        forecast_date: report.forecast_date,
        crop: detail.target_crop,
        disease_name: detail.name,
        threat_type: text(detail.type),
        risk_level: text(detail.risk_level),
        symptoms: listText(detail.symptoms_to_watch),
        monitoring_actions: listText(detail.monitoring_actions),
        reasoning: text(detail.description),
        evidence_type: 'AI เฝ้าระวัง',
        source_updated_at: text(report.updated_at),
        source_page:
          'https://npt-dashboard.netlify.app/public/disease-forecast',
      };
    });
  });
}

function genuineWaterRow(row) {
  // These NPT-* rows are fixed supplementary values in the web adapter, not sensor observations.
  return (
    String(row.provinceCode) === '73' &&
    row.variable === 'WaterLevel' &&
    row.stationCode &&
    !String(row.stationCode).startsWith('NPT-')
  );
}

function flattenWaterRow(row, now) {
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(row.observedAt || '');
  const age = explicitZone ? now.getTime() - Date.parse(row.observedAt) : NaN;
  const definitelyOld =
    /^\d{4}-\d{2}-\d{2}/.test(row.observedAt || '') &&
    row.observedAt.slice(0, 10) <
      new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const freshness =
    Number.isFinite(age) && age >= 0
      ? age > 48 * 3600000
        ? 'ข้อมูลเก่า'
        : 'ภายใน 48 ชั่วโมง'
      : definitelyOld
        ? 'ข้อมูลเก่า'
        : 'ตรวจสอบเวลาต้นทาง';
  const bank = /MSL/i.test(row.unit || '') ? number(row.minBankMsl) : null;
  const value = number(row.value);
  const status =
    value === null
      ? ['ไม่มีค่าตรวจวัด', '#94a3b8']
      : freshness === 'ข้อมูลเก่า'
        ? ['ข้อมูลเก่า', '#94a3b8']
        : bank !== null
          ? value > bank
            ? ['สูงกว่าตลิ่ง', '#d94841']
            : ['ไม่สูงกว่าตลิ่ง', '#31865b']
          : ['ไม่มีเกณฑ์ตลิ่ง', '#2984b4'];
  return {
    station_code: String(row.stationCode),
    station_name: text(row.stationName),
    district_code: text(row.amphoeCode),
    district: districtNames[row.amphoeCode] || text(row.amphoeName),
    latitude: number(row.latitude),
    longitude: number(row.longitude),
    observed_at: text(row.observedAt),
    water_level: value,
    unit: text(row.unit),
    source: text(row.source),
    freshness,
    bank_msl: bank,
    status_label: status[0],
    status_color: status[1],
    quality_flag: text(row.qualityFlag),
  };
}

export function flattenWaterHistory(payload, now = new Date()) {
  const rows = [
    ...(payload.historical || []),
    ...(payload.observed || []),
  ].filter(genuineWaterRow);
  return [
    ...new Map(
      rows.map((row) => [
        [row.source, row.stationCode, row.observedAt, row.unit].join('|'),
        flattenWaterRow(row, now),
      ])
    ).values(),
  ];
}

export function mergeWaterHistory(previous, current) {
  for (const snapshot of [previous, current]) {
    if (
      snapshot.schemaVersion !== 1 ||
      snapshot.table !== 'public_water_history' ||
      !Array.isArray(snapshot.data) ||
      snapshot.count !== snapshot.data.length
    )
      throw new Error('Invalid water history snapshot');
  }
  const rows = [...previous.data, ...current.data]
    .map((row) =>
      Object.fromEntries(
        Object.entries(waterTypes).map(([key, type]) => {
          const value = row[key] ?? null;
          if (
            value !== null &&
            (typeof value !== (type === 'text' ? 'string' : 'number') ||
              (type === 'number' && !Number.isFinite(value)))
          )
            throw new Error('Invalid water history field');
          return [key, value];
        })
      )
    )
    .filter((row) => row.source && row.station_code && row.observed_at);
  const data = [
    ...new Map(
      rows.map((row) => [
        [row.source, row.station_code, row.observed_at, row.unit].join('|'),
        row,
      ])
    ).values(),
  ];
  return {
    ...current,
    status: data.length ? 'ready' : 'empty',
    count: data.length,
    data,
  };
}

export function flattenWaterSituation(payload, now = new Date()) {
  const stations = new Map();
  for (const row of payload.observed || []) {
    if (!genuineWaterRow(row)) continue;
    const previous = stations.get(row.stationCode);
    // Source timestamps are retained verbatim; do not silently invent a time zone.
    const zoned = (value) =>
      /(?:Z|[+-]\d{2}:\d{2})$/.test(value || '') &&
      Number.isFinite(Date.parse(value));
    const newer =
      previous && zoned(row.observedAt) && zoned(previous.observedAt)
        ? Date.parse(row.observedAt) > Date.parse(previous.observedAt)
        : String(row.observedAt || '') > String(previous?.observedAt || '');
    if (!previous || newer) stations.set(row.stationCode, row);
  }
  return [...stations.values()].map((row) => flattenWaterRow(row, now));
}

export function flattenRainForecast(payload) {
  return (payload.forecast || [])
    .filter(
      (row) =>
        String(row.provinceCode) === '73' &&
        ['Rainfall', 'ForecastRain'].includes(row.variable)
    )
    .map((row) => ({
      district_code: text(row.amphoeCode),
      district: districtNames[row.amphoeCode] || null,
      forecast_at: text(row.observedAt),
      rain_mm: number(row.value),
      unit: text(row.unit),
      source: text(row.forecastSource) || text(row.source),
      interval: text(row.interval),
      evidence_type: 'พยากรณ์',
    }));
}

async function readAll(client, definition) {
  const rows = [];
  let expected;
  let offset = 0;
  do {
    const page = await readPowerbiPage(client, {
      definition,
      offset,
      limit: 1000,
    });
    if (
      page.count > 100000 ||
      (expected !== undefined && expected !== page.count)
    )
      throw new Error('Changing public source');
    expected = page.count;
    rows.push(...page.data);
    offset = page.nextOffset;
  } while (offset !== null);
  if (rows.length !== expected) throw new Error('Incomplete public source');
  return rows;
}

export function flattenWaterAdvice(report) {
  if (report === null) return [];
  if (!Array.isArray(report?.analysis?.districtAnalyses))
    throw new Error('Invalid public water analysis');
  return report.analysis.districtAnalyses
    .filter((row) => Object.hasOwn(districtNames, row.areaCode))
    .map((row) => ({
      district_code: row.areaCode,
      district: districtNames[row.areaCode],
      horizon: text(row.horizon),
      summary: text(row.summary),
      recommended_checks: listText(row.recommendedChecks),
      uncertainties: listText(row.uncertainties),
      source_status: text(report.sourceStatus),
      generated_at: text(report.generatedAt),
      evidence_type: 'AI วิเคราะห์ประกอบการติดตาม ไม่ใช่การยืนยันเหตุ',
    }));
}

export async function collectPublicSituation(
  client,
  fetchedAt,
  fetcher = fetch
) {
  const now = new Date(fetchedAt);
  const cutoff = new Date(now.getTime() - 90 * 86400000)
    .toISOString()
    .slice(0, 10);
  const reports = await readAll(client, {
    table: 'ai_disease_forecasts',
    key: 'forecast_date',
    columns: ['forecast_date', 'summary', 'details', 'updated_at'],
  });
  const weather = await readAll(client, PUBLIC_POWERBI_DATASETS.daily_weather);
  const hotspots = await readAll(client, {
    ...PUBLIC_POWERBI_DATASETS.fire_hotspots,
    columns: Object.keys(
      PUBLIC_SITUATION_DATASETS.public_hotspots.types
    ).filter((column) => column !== 'district_code'),
  });
  const response = await fetcher(
    'https://npt-dashboard.netlify.app/api/public-risk-map-current',
    { signal: AbortSignal.timeout(60000) }
  );
  if (!response.ok) throw new Error('Public water service unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload.observed) || !Array.isArray(payload.forecast))
    throw new Error('Invalid public water response');
  const adviceResponse = await fetcher(
    'https://npt-dashboard.netlify.app/api/public-risk-map-ai-latest',
    { signal: AbortSignal.timeout(60000) }
  );
  if (!adviceResponse.ok) throw new Error('Public water analysis unavailable');
  const advice = (await adviceResponse.json()).data;
  const data = {
    public_water_advice: flattenWaterAdvice(advice),
    public_disease_watch: flattenDiseaseForecasts(reports),
    public_disease_reports: reports.map((row) => ({
      forecast_date: row.forecast_date,
      summary: text(row.summary),
      report_status: String(row.summary || '').startsWith('Pending AI analysis')
        ? 'pending'
        : 'complete',
      watch_count: String(row.summary || '').startsWith('Pending AI analysis')
        ? null
        : row.details.length,
      source_updated_at: text(row.updated_at),
    })),
    public_weather: weather
      .filter((row) => row.date >= cutoff)
      .map((row) => ({
        date: row.date,
        temperature_avg_c: number(row.tavg),
        temperature_min_c: number(row.tmin),
        temperature_max_c: number(row.tmax),
        rain_mm: number(row.prcp),
        source_updated_at: text(row.updated_at),
        area_scope:
          'ข้อมูลชุดจังหวัดจาก Open-Meteo มีทั้งย้อนหลังและคาดการณ์ ไม่ใช่สถานีตรวจวัดหรือรายแปลง',
      })),
    public_hotspots: hotspots.map((row) => ({
      ...Object.fromEntries(
        Object.entries(PUBLIC_SITUATION_DATASETS.public_hotspots.types).map(
          ([key, type]) => [
            key,
            type === 'number'
              ? number(row[key])
              : row[key] == null
                ? null
                : String(row[key]),
          ]
        )
      ),
      district_code:
        Object.keys(districtNames).find(
          (code) => districtNames[code] === row.district
        ) || null,
    })),
    public_water: flattenWaterSituation(payload, now),
    public_water_history: flattenWaterHistory(payload, now),
    public_rain_forecast: flattenRainForecast(payload),
  };
  return Object.fromEntries(
    Object.entries(data).map(([table, rows]) => [
      table,
      {
        schemaVersion: 1,
        table,
        status: rows.length ? 'ready' : 'empty',
        fetchedAt,
        count: rows.length,
        data: rows,
      },
    ])
  );
}
