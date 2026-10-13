// Public business fields only. Never add contact data, custom_fields or raw JSON.
const definitions = [
  [
    'agricultural_areas',
    'พื้นที่เกษตรและประเภทพืช',
    'district,total_area_rai,agri_crop_area_rai,farmer_households,rice_in_season_rai,rice_off_season_rai,field_crops_rai,horticulture_rai,fruit_trees_rai,vegetables_rai,flowers_rai,herbs_spices_rai,created_at',
  ],
  [
    'farmer_registry',
    'ทะเบียนเกษตรกรรายอำเภอ',
    'district,data_year,household_count,net_total_households,target,farm_area_rai,total_updated_households,total_updated_plots,total_updated_area_rai,cancelled_households,cutoff_date,updated_at',
  ],
  [
    'farmer_registry_subdistricts',
    'ทะเบียนเกษตรกรรายตำบล',
    'district,subdistrict,data_year,household_count,net_total_households,target,farm_area_rai,total_updated_households,total_updated_plots,total_updated_area_rai,cancelled_households,cutoff_date,updated_at',
  ],
  [
    'farmer_registry_snapshots',
    'ประวัติทะเบียนเกษตรกรรายอำเภอ',
    'district,snapshot_date,data_year,household_count,net_total_households,target,farm_area_rai,total_updated_households,total_updated_plots,total_updated_area_rai,cutoff_date',
  ],
  [
    'farmer_registry_subdistrict_snapshots',
    'ประวัติทะเบียนเกษตรกรรายตำบล',
    'district,subdistrict,snapshot_date,data_year,household_count,net_total_households,target,farm_area_rai,total_updated_households,total_updated_plots,total_updated_area_rai,cutoff_date',
  ],
  [
    'community_enterprises',
    'วิสาหกิจชุมชน',
    'enterprise_name,product_type,district,subdistrict,member_count,level,approval_date,enterprise_type,updated_at',
  ],
  [
    'large_plots',
    'แปลงใหญ่',
    'plot_name,commodity,commodity_group,secondary_commodity,district,subdistrict,member_count,area_rai,year,agency,updated_at',
  ],
  [
    'smart_farmer_sf',
    'เกษตรกรปราดเปรื่อง',
    'data_year,district,farmer_status,agricultural_activity,production_standard,production_area,updated_at',
  ],
  [
    'young_smart_farmer_ysf',
    'เกษตรกรรุ่นใหม่',
    'data_year,district,farmer_status,agricultural_activity,production_standard,farm_area_rai,main_activity_type',
  ],
  [
    'agricultural_career_groups',
    'กลุ่มส่งเสริมอาชีพ',
    'data_year,group_name,district,subdistrict,member_count,activity,main_activity,production_standard,potential_level,updated_at',
  ],
  [
    'housewife_farmer_groups',
    'กลุ่มแม่บ้านเกษตรกร',
    'year,group_name,district,subdistrict,member_count,activity,production_standard,potential_level,model_group,updated_at',
  ],
  [
    'young_farmer_groups_detailed',
    'กลุ่มยุวเกษตรกร',
    'data_year,group_name,district,subdistrict,member_count,activity,potential_level,model_group,updated_at',
  ],
  [
    'farmer_institutes',
    'สถาบันเกษตรกร',
    'district,housewives_groups,young_farmer_groups,career_promotion_groups,village_farmers_count,total_groups,community_enterprise_groups,smart_farmer_count,young_smart_farmer_count',
  ],
  [
    'learning_centers',
    'ศูนย์เรียนรู้การเพิ่มประสิทธิภาพการผลิตสินค้าเกษตร',
    'name,featured_product,district,subdistrict,network_centers_count,knowledge_course,created_at',
  ],
  [
    'pest_centers',
    'ศูนย์จัดการศัตรูพืชชุมชน',
    'center_name,district,subdistrict,member_count,established_year_th,grade_level,main_crop_type,updated_at',
  ],
  [
    'soil_fertilizer_centers',
    'ศูนย์จัดการดินปุ๋ยชุมชน',
    'center_name,district,subdistrict,member_count,established_year_th,grade_level,main_crop_type,group_type,created_at',
  ],
  [
    'plant_doctors',
    'หมอพืชชุมชน (ไม่แสดงชื่อบุคคล)',
    'district,subdistrict,province,updated_at',
  ],
  [
    'agri_tourism',
    'แหล่งท่องเที่ยวเกษตร',
    'spot_name,district,spot_type,updated_at',
  ],
  [
    'certifications',
    'การรับรองมาตรฐานพืช',
    'crop_name,plot_type,plot_district,plot_subdistrict,area_rai,production_volume_kg,cert_date,exp_date,created_at',
  ],
  [
    'crop_production',
    'ผลผลิตพืช',
    'crop_name,district,planted_area,production_ton,harvest_period,year,updated_at',
  ],
  [
    'production_costs',
    'ต้นทุนการผลิตพืช',
    'data_year,crop_name,yield_kg_per_rai,revenue_baht_per_rai,seed_cost_baht,fertilizer_cost_baht,pesticide_cost_baht,service_cost_baht,equipment_cost_baht,fuel_cost_baht,repair_depreciation_cost_baht,packaging_cost_baht,other_cost_baht,total_cost_baht,updated_at',
  ],
  [
    'disasters',
    'อุทกภัยและพื้นที่เสียหาย',
    'disaster_type,district,subdistrict,year,activity_group,crop_type,variety,planted_area_rai,affected_area_rai,affected_households,damaged_area,affected_farmers,event_date,updated_at',
  ],
  [
    'forecast_plots',
    'แปลงพยากรณ์',
    'district,subdistrict,crop_type,variety,planted_area_rai,planting_date,plot_type,crop_status,updated_at',
  ],
  [
    'pest_outbreaks',
    'การระบาดศัตรูพืช',
    'pest_name,affected_crop,district,outbreak_area,severity,report_date,updated_at',
  ],
  [
    'biocontrol_stock',
    'วัสดุชีวภัณฑ์',
    'product_name,source,quantity_kg,period,status,updated_at',
  ],
  [
    'soil_series',
    'ชุดดินและพื้นที่',
    'soil_series_name,soil_series_code,soil_group,texture,fertility,ph_top,district,district_code,area_rai,production_year_be,source,updated_at',
  ],
  [
    'fire_hotspots',
    'จุดความร้อน',
    'district,subdistrict,acq_date,acq_time,satellite,instrument,confidence,frp,land_use,source,updated_at',
  ],
  [
    'daily_weather',
    'สภาพอากาศรายวัน',
    'date,tavg,tmin,tmax,prcp,wspd,pres,updated_at',
  ],
  [
    'geoplots_parcel_progress',
    'ความก้าวหน้าวาดแปลงรายอำเภอ',
    'district_code,district,target_plots,drawn_plots,remaining_target_plots,progress_percent,snapshot_date,updated_at',
    'district_code',
  ],
  [
    'geoplots_parcel_subdistrict_progress',
    'ความก้าวหน้าวาดแปลงรายตำบล',
    'subdistrict_code,subdistrict,district_code,district,target_plots,drawn_plots,progress_percent,snapshot_date,updated_at',
    'subdistrict_code',
  ],
  [
    'gis_areas',
    'พื้นที่ GIS',
    'area_name,district,area_type,area_rai,updated_at',
  ],
];

export const PUBLIC_POWERBI_DATASETS = Object.fromEntries(
  definitions.map(([table, title, selection, key = 'id']) => [
    table,
    {
      table,
      title,
      key,
      columns: [...new Set([key, ...selection.split(',')])],
    },
  ])
);

export function parsePowerbiPage(params) {
  const table = params.get('table');
  const definition =
    Object.hasOwn(PUBLIC_POWERBI_DATASETS, table) &&
    PUBLIC_POWERBI_DATASETS[table];
  if (!definition) throw new Error('Unknown public dataset');
  const integer = (name, fallback, max, min) => {
    const raw = params.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${name}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid ${name}`);
    return value;
  };
  return {
    definition,
    offset: integer('offset', 0, 1000000, 0),
    limit: integer('limit', 1000, 1000, 1),
  };
}

export async function readPowerbiPage(client, { definition, offset, limit }) {
  const { data, error, count } = await client
    .from(definition.table)
    .select(definition.columns.join(','), { count: 'exact' })
    .order(definition.key, { ascending: true })
    .range(offset, offset + limit - 1);
  if (error || !Array.isArray(data) || !Number.isSafeInteger(count))
    throw new Error('Public dataset unavailable');
  if (!data.length && offset < count)
    throw new Error('Public dataset incomplete');
  // Select and output allowlists both apply, even if a database response gains fields.
  const rows = data.map((row) =>
    Object.fromEntries(
      definition.columns.map((column) => [column, row[column] ?? null])
    )
  );
  return {
    schemaVersion: 1,
    table: definition.table,
    status: count === 0 ? 'empty' : 'ready',
    data: rows,
    count,
    offset,
    limit,
    nextOffset: offset + rows.length < count ? offset + rows.length : null,
    fetchedAt: new Date().toISOString(),
  };
}
