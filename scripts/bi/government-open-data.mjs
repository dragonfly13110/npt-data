import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const GOV_DATASET='land-use-plant';
export const GOV_RESOURCE='f1549971-1dda-4f89-97fd-4e53d55e70a0';
export const GOV_PAGE='a100000000000000000f';
export const GOV_CATALOG='https://data.go.th/dataset/'+GOV_DATASET;
const districts=['เมืองนครปฐม','กำแพงแสน','นครชัยศรี','ดอนตูม','บางเลน','สามพราน','พุทธมณฑล'];
const crops=['ข้าว','พืชไร่','ไม้ผลไม้ยืนต้น','พืชผัก','ไม้ดอกไม้ประดับ','สมุนไพร/เครื่องเทศ'];
export function validateLandUse(records,total){
  assert(Array.isArray(records)&&records.length===total&&total>0&&total<=1000,'Incomplete data.go.th records');
  const keys=new Set();
  for(const r of records){
    assert(Number.isInteger(r['ปี'])&&r['ปี']>=2500&&r['ปี']<=2700,'Invalid reference year');
    assert(districts.includes(r['อำเภอ'])&&crops.includes(r['ลักษณะการเกษตร']),'Unexpected district/crop');
    assert(typeof r['พื้นที่เพาะปลูก (ไร่)']==='number'&&Number.isFinite(r['พื้นที่เพาะปลูก (ไร่)'])&&r['พื้นที่เพาะปลูก (ไร่)']>=0,'Invalid area');
    const key=JSON.stringify([r['ปี'],r['อำเภอ'],r['ลักษณะการเกษตร']]);assert(!keys.has(key),'Duplicate land-use identity');keys.add(key);
  }
  for(const y of new Set(records.map(r=>r['ปี'])))assert.equal(records.filter(r=>r['ปี']===y).length,42,'Expected 7 districts × 6 land-use classes per year');
  return records;
}
export async function collectGovernmentData(){
  const metadataUrl='https://data.go.th/api/3/action/package_show?id='+GOV_DATASET;
  const apiUrl='https://data.go.th/api/3/action/datastore_search?'+new URLSearchParams({resource_id:GOV_RESOURCE,limit:'1000'});
  const read=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(r.ok,'data.go.th HTTP '+r.status);const s=await r.text();const json=JSON.parse(s);assert(json.success,'data.go.th API failure');return {raw:s,result:json.result};};
  const [metadata,data]=await Promise.all([read(metadataUrl),read(apiUrl)]);
  assert(metadata.result.resources.some(r=>r.id===GOV_RESOURCE),'Resource is no longer part of dataset');
  validateLandUse(data.result.records,data.result.total);
  return {checkedAt:new Date().toISOString(),catalogUrl:GOV_CATALOG,metadataUrl,apiUrl,datasetId:metadata.result.id,resourceId:GOV_RESOURCE,title:metadata.result.title,
    owner:metadata.result.organization.title,originalProducer:metadata.result.data_source,license:metadata.result.license_title,licenseDetails:metadata.result.license_id_other,
    metadataModified:metadata.result.metadata_modified,resourceModified:metadata.result.resources.find(r=>r.id===GOV_RESOURCE).last_modified,
    responseSha256:createHash('sha256').update(data.raw).digest('hex'),count:data.result.total,years:[...new Set(data.result.records.map(r=>r['ปี']))],
    areaRai:data.result.records.reduce((n,r)=>n+r['พื้นที่เพาะปลูก (ไร่)'],0),records:data.result.records};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const proof=await collectGovernmentData();
  fs.mkdirSync('powerbi/npt-data-center/data',{recursive:true});fs.writeFileSync('powerbi/npt-data-center/data/data-go-th-provenance.json',JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({...proof,records:undefined},null,2));
}
