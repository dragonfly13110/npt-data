import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectPrices, safeRows } from './market-outbreaks.mjs';
import { ALLOWED_PRODUCTS, CATEGORY_NAMES, parseDitPriceHtml } from './dit-prices.mjs';

const table = 'public_agricultural_prices';
export const PRICE_SOURCES = ['สศก. / NABC', 'ตลาดไท', 'ตลาดสี่มุมเมือง', 'กรมการค้าภายใน'];
const day = date => new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const get = async (url, options = {}) => {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw Error(`HTTP ${r.status}: ${new URL(url).hostname}`);
  return r;
};
const amount = n => n === null || n === undefined || n === '' ? null : Number(n);
export function priceRow(row) {
  for (const key of ['source_name','source_product_id','product_name','grade','unit','price_type']) assert(typeof row[key] === 'string' && row[key].trim(), `Missing ${key}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(row.data_date) && !Number.isNaN(Date.parse(row.data_date)), 'Invalid price date');
  const low = amount(row.price_min), high = amount(row.price_max);
  assert((low === null || (Number.isFinite(low) && low >= 0)) && high !== null && Number.isFinite(high) && high >= (low ?? 0), 'Invalid price range');
  assert(/^https:\/\//.test(row.source_url), 'Missing source URL');
  return safeRows(table, [{ ...row, price_min: low, price_max: high,
    series_key: JSON.stringify([row.source_name,row.source_product_id,row.grade,row.market_name,row.province,row.unit,row.price_type]),
  }])[0];
}

export function parseTalaadThai(html, now) {
  const data = JSON.parse(html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || 'null');
  const items = data?.props?.pageProps?.productsPriceTrending?.data;
  assert(Array.isArray(items) && items.length > 0, 'Missing Talaad Thai public price section');
  return items.flatMap(item => {
    const record = item.pricingData?.latestPriceDiffProductSnapShot?.data;
    if (!record?.current?.date || !item.unit || !item.title?.th) return [];
    return [record.prev,record.current].filter(p=>p?.date && p.minPrice!=null && p.maxPrice!=null).map(p=>priceRow({
      data_date: p.date.slice(0,10), product_category: item.categories?.map(c=>c.title?.th).filter(Boolean).join(' / ') || 'สินค้ายอดนิยม',
      product_name: item.title.th, source_name: 'ตลาดไท', source_product_id: String(item.id), grade: 'ตามชื่อสินค้าต้นทาง',
      market_name: 'ตลาดไท', province: 'ปทุมธานี', unit: 'บาท/' + item.unit, price_type: 'ราคาขายส่งอ้างอิงตลาด',
      day_price: null, price_min: p.minPrice, price_max: p.maxPrice,
      source_url: 'https://www.talaadthai.com/products/' + item.slug,
      spatial_scope: 'ช่วงราคาของตลาดไท · เฉพาะสินค้ายอดนิยมที่หน้าเว็บเปิดเผย · วันที่ตามรอบราคาต้นทาง', collected_at: now.toISOString(),
    }));
  });
}

export function parseSimummuang(items, now, rejected = []) {
  return items.filter(p=>p.isActive && p.price?.action_date && p.th?.name && p.prod_unit_id?.th?.name && !/สังฆภัณฑ์/.test(p.prod_category_id?.th?.name || '')).flatMap(p=>
    [['small','เล็ก'],['medium','กลาง'],['large','ใหญ่']].flatMap(([size,grade])=>{
      const range=p.price[size];
      // The public feed uses 0–0 for sizes without a quoted price.
      if (!range || (Number(range.min)===0 && Number(range.max)===0)) return [];
      if(range.min==null || range.max==null || !Number.isFinite(Number(range.min)) || !Number.isFinite(Number(range.max)) || Number(range.min)<0 || Number(range.max)<=0 || Number(range.min)>Number(range.max)){
        rejected.push({product:p.th.name,grade,reason:'ช่วงราคาไม่ครบ ติดลบ หรือต่ำสุดสูงกว่าสูงสุด'});return [];
      }
      return [priceRow({data_date:day(p.price.action_date), product_category:p.prod_category_id?.th?.name || 'ไม่ระบุหมวด',
        product_name:p.th.name, source_name:'ตลาดสี่มุมเมือง', source_product_id:p._id, grade,
        market_name:'ตลาดสี่มุมเมือง', province:'ปทุมธานี', unit:'บาท/'+p.prod_unit_id.th.name,
        price_type:'ราคาขายส่งอ้างอิงตลาด', day_price:null, price_min:Number(range.min)===0 ? null : range.min,price_max:range.max,
        source_url:'https://www.simummuangmarket.com/pricing', spatial_scope:'ช่วงราคาตามขนาด · วันบันทึกราคาเวลาไทย · ต่ำสุดเป็น 0 อ่านว่าไม่ระบุ · 0–0 ไม่มีราคาเสนอ',collected_at:now.toISOString(),
      })];
    }));
}

async function simummuang(now, rejected) {
  const items=[],ids=new Set(); let expected;
  for(let page=1;page<=30;page++){
    const body=await (await get(`https://api.simummuangmarket.com/api/app/products?page=${page}&limit=100`)).json(), batch=body.data;
    assert(body.statusCode===200 && Array.isArray(batch?.data) && Number.isSafeInteger(batch.total), 'Invalid market pagination');
    expected ??= batch.total; assert.equal(batch.total,expected,'Market changed during pagination');
    for(const item of batch.data){assert(!ids.has(item._id),'Duplicate market item'); ids.add(item._id);items.push(item);}
    if(items.length===expected) return parseSimummuang(items,now,rejected);
    assert(items.length<expected && batch.data.length>0 && page<30, 'Incomplete market pagination');
  }
}

async function dit(now) {
  const from=new Date(now.getTime()-30*86400000);
  const be=d=>{const [y,m,day]=dayString(d).split('-');return `${day}/${m}/${Number(y)+543}`;};
  const dayString=day;
  const rows=[];
  for(const [group,allowed] of Object.entries(ALLOWED_PRODUCTS)){
    const products=await (await get(`https://pricelist.dit.go.th/getdata.php?ID=${group}&TYPE=product`)).json();
    assert(Array.isArray(products),'Missing DIT product list');
    const selected=products.filter(p=>allowed.includes(String(p.product_id)));
    for(let i=0;i<selected.length;i+=4) rows.push(...(await Promise.all(selected.slice(i,i+4).map(async p=>{
      const url='https://pricelist.dit.go.th/main_price.php?seltime=day';
      const html=await (await get(url,{method:'POST',body:new URLSearchParams({day1:be(from),day2:be(now),protype:'2',progroup:group,proname:p.product_id})})).text();
      const parsed=parseDitPriceHtml(html,{id:p.product_id,productName:p.product_name});
      if(!parsed) return [];
      assert(parsed.priceType==='wholesale' && parsed.unit, 'Unknown DIT scope/unit');
      return parsed.series.map(point=>priceRow({data_date:point.date,product_category:CATEGORY_NAMES[group],product_name:p.product_name,
        source_name:'กรมการค้าภายใน',source_product_id:String(p.product_id),grade:'ตามชื่อสินค้าต้นทาง',
        market_name:'ชุดสำรวจราคาขายส่ง กรมการค้าภายใน',province:parsed.scopeName,unit:'บาท/'+parsed.unit,
        price_type:'ราคาขายส่งจากชุดสำรวจ',day_price:point.value,price_min:point.min ?? point.value,price_max:point.max ?? point.value,
        source_url:url,spatial_scope:parsed.scopeName ? 'ขอบเขตตามชื่อสินค้าต้นทาง: '+parsed.scopeName : 'ต้นทางไม่ระบุจังหวัดรายจุด · ไม่ใช่ราคาเฉลี่ยนครปฐม', collected_at:now.toISOString(),
      }));
    }))).flat());
  }
  return rows;
}

export function mergePriceHistory(previous, fresh, now) {
  const cutoff=day(new Date(now.getTime()-90*86400000)), latest=day(now), map=new Map();
  for(const raw of [...previous,...fresh]){
    if(raw.price_min==null && raw.price_max==null && raw.day_price==null) continue;
    const source=raw.source_name || PRICE_SOURCES[0];
    const r=priceRow({...raw,source_name:source,source_product_id:raw.source_product_id||raw.product_name,grade:raw.grade||'ตามชื่อสินค้าต้นทาง',price_min:raw.price_min??raw.day_price,price_max:raw.price_max??raw.day_price});
    if(r.data_date>=cutoff && r.data_date<=latest)map.set(JSON.stringify([r.series_key,r.data_date]),r);
  }
  return [...map.values()].sort((a,b)=>b.data_date.localeCompare(a.data_date)||a.series_key.localeCompare(b.series_key));
}

export function boundPriceHistory(input) {
  let data=input;
  const latestBySource=new Map(PRICE_SOURCES.map(name=>[name,data.filter(r=>r.source_name===name).map(r=>r.data_date).sort().at(-1)]));
  const history={maxDays:90,maxBytes:10*1024*1024,trimmedForSize:false};
  while(Buffer.byteLength(JSON.stringify(data,null,2))>9*1024*1024){
    const oldest=data.filter(r=>r.data_date!==latestBySource.get(r.source_name)).map(r=>r.data_date).sort()[0];
    assert(oldest,'Latest source batch exceeds snapshot limit');
    data=data.filter(r=>r.data_date!==oldest||r.data_date===latestBySource.get(r.source_name));history.trimmedForSize=true;
  }
  return {data,history};
}

export async function collectMultiMarket(previous={},now=new Date()) {
  const rejected=[];
  const collectors=[()=>collectPrices(now),async()=>parseTalaadThai(await(await get('https://www.talaadthai.com/products')).text(),now),()=>simummuang(now,rejected),()=>dit(now)];
  const results=await Promise.allSettled(collectors.map(fn=>fn()));
  const sources=results.map((r,i)=>{
    const success=r.status==='fulfilled' && r.value.length>0;
    return {name:PRICE_SOURCES[i],status:success?'ready':'retained',fetchedAt:success?now.toISOString():previous.sources?.find(s=>s.name===PRICE_SOURCES[i])?.fetchedAt || null,rows:success?r.value.length:0,error:success?null:r.status==='rejected'?r.reason.message:'No price records'};
  });
  const fresh=results.flatMap((r,i)=>sources[i].status==='ready'?r.value:[]);
  assert(fresh.length || previous.data?.length,'All price sources unavailable; keep previous file');
  const {data,history}=boundPriceHistory(mergePriceHistory(previous.data||[],fresh,now));
  for(const source of sources){const rows=data.filter(r=>r.source_name===source.name);source.retainedRows=rows.length;source.latestDate=rows.map(r=>r.data_date).sort().at(-1)||null;}
  return {schemaVersion:1,table,status:'ready',count:data.length,fetchedAt:now.toISOString(),sources,history,qualityRejected:{source:'ตลาดสี่มุมเมือง',count:rejected.length,items:rejected},data};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const index=process.argv.indexOf('--output');
  const output=index>=0?process.argv[index+1]:'output/bi-pages';
  const file=path.join(output,table+'.json');
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  const snapshot=await collectMultiMarket(previous);
  assert(Buffer.byteLength(JSON.stringify(snapshot,null,2)+'\n')<=snapshot.history.maxBytes,'Price snapshot exceeds 10 MiB');
  fs.mkdirSync(output,{recursive:true}); fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
  const manifestFile=path.join(output,'manifest.json');
  if(fs.existsSync(manifestFile)){
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),bytes=fs.readFileSync(file);
    const entry=manifest.tables.find(t=>t.table===table);
    assert(entry,'Missing price manifest entry');
    Object.assign(entry,{title:'ราคาสินค้าเกษตร 4 แหล่ง · แยกราคาเดี่ยวและช่วงราคา',count:snapshot.count,fetchedAt:snapshot.fetchedAt,dataAsOf:snapshot.data[0]?.data_date,scope:'สินค้า เกรด ตลาด หน่วย และประเภทราคาแยกกัน · ดูสถานะแต่ละแหล่ง',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  }
  console.log(JSON.stringify({rows:snapshot.count,sources:snapshot.sources},null,2));
}
