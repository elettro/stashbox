import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEV='https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD='https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION='us-east-1';
const V3='radio/docs/diagnostics/DEV_TO_PROD_VEC_PROMOTION_V3_LATEST.json';
const REPORT='radio/docs/diagnostics/DEV_TO_PROD_VEC_PROMOTION_V4_LATEST.json';
const RETRYABLE=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const result={started_at:new Date().toISOString(),version:4,scope:'targeted recovery for V3 folder-asset failures',preflight:{},targets:0,created:0,reused:0,failed:[],asset_map:{},recipes:{found_dev:0,saved_prod:0,failed:[]},verification:{},fatal_error:null};

function token(fn){
  const raw=execFileSync('aws',['lambda','get-function-configuration','--function-name',fn,'--region',REGION,'--output','json'],{encoding:'utf8'});
  const vars=JSON.parse(raw)?.Environment?.Variables||{};
  const value=String(vars.ADMIN_TOKEN||vars.RADIO_ADMIN_TOKEN||'').trim();
  if(!value) throw new Error(`Missing admin token for ${fn}`);
  return value;
}
async function req(url,{method='GET',admin='',body,attempts=5}={}){
  let last;
  for(let n=1;n<=attempts;n++){
    try{
      const headers={Accept:'application/json'}; if(admin)headers['x-admin-token']=admin; if(body!==undefined)headers['Content-Type']='application/json';
      const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
      if(response.ok){await sleep(250);return data}
      const e=new Error(`${method} ${url} -> HTTP ${response.status}: ${data.error||data.message||text.slice(0,300)}`);e.status=response.status;throw e;
    }catch(e){last=e;const s=Number(e?.status||0);if((s&&!RETRYABLE.has(s))||n===attempts)throw e;await sleep(Math.min(8000,750*(2**(n-1))))}
  }
  throw last;
}
const arr=(b,keys=[])=>{if(Array.isArray(b))return b;for(const k of keys){if(Array.isArray(b?.[k]))return b[k]}if(Array.isArray(b?.data))return b.data;return []};
const folders=b=>arr(b,['folders','items']);
const assets=b=>arr(b,['assets','items','results']);
const songs=b=>arr(b,['songs','items']);
const fid=f=>String(f?.id||'').trim();
const aid=a=>String(a?.id||a?.asset_id||'').trim();
const aurl=a=>String(a?.public_url||a?.publicUrl||a?.url||a?.asset_url||'').trim();
const key=s=>String(s?.song_key||s?.songKey||'').trim();
const identity=f=>String(f?.folder_slug||f?.folder_name||f?.folderName||'').trim().toLowerCase();
const recipe=b=>!b||b.found===false?null:(b.recipe||b.data?.recipe||null);
function objectKey(a){const direct=String(a?.s3_key||a?.key||a?.object_key||a?.objectKey||'').trim();if(direct)return direct.replace(/^\/+/, '');try{return decodeURIComponent(new URL(aurl(a)).pathname).replace(/^\/+/, '')}catch{return ''}}
function fileName(a){const n=String(a?.file_name||a?.filename||'').trim();if(n)return n;const k=objectKey(a);return k?path.posix.basename(k):''}
function assetType(a){if(a?.asset_type==='clip'||a?.type==='clip')return 'clip';const u=(fileName(a)||aurl(a)).toLowerCase();return u.endsWith('.mp4')?'clip':'image'}
function payload(a){const url=aurl(a),s3=objectKey(a),type=assetType(a);return {asset_type:type,file_name:fileName(a),s3_key:s3,public_url:url,thumbnail_url:a.thumbnail_url||a.thumbnailUrl||url,content_type:a.content_type||a.contentType||(type==='clip'?'video/mp4':''),size_bytes:a.size_bytes||a.sizeBytes||null,width:a.width||null,height:a.height||null,ratio_label:a.ratio_label||a.ratioLabel||'',caption:a.caption||'',alt_text:a.alt_text||a.altText||'',notes:a.notes||'',shopify_product_urls:a.shopify_product_urls||a.shopifyProductUrls||[]}}
function remap(v,fmap,amap){if(Array.isArray(v))return v.map(x=>remap(x,fmap,amap));if(v&&typeof v==='object'){const o={};for(const[k,x]of Object.entries(v)){if((k==='folder_id'||k==='folderId')&&typeof x==='string'&&fmap.has(x))o[k]=fmap.get(x);else o[k]=remap(x,fmap,amap)}return o}if(typeof v==='string'){if(fmap.has(v))return fmap.get(v);if(amap.has(v))return amap.get(v)}return v}
function write(){result.finished_at=new Date().toISOString();result.ok=!result.fatal_error&&!result.failed.length&&!result.recipes.failed.length&&result.verification.remaining_failed_urls===0;fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+'\n')}

try{
  const prior=JSON.parse(fs.readFileSync(V3,'utf8'));
  const failures=prior?.folder_assets?.failed||[];
  result.targets=failures.length;
  if(!failures.length) throw new Error('V3 report contains no folder-asset failures to repair.');
  const devToken=token('stashbox-radio-api-dev-v2'),prodToken=token('stashbox-radio-api-prod-v2');
  const devFolders=folders(await req(`${DEV}/radio/admin/visuals/folders`,{admin:devToken}));
  const prodFolders=folders(await req(`${PROD}/radio/admin/visuals/folders`,{admin:prodToken}));
  const devSongs=songs(await req(`${DEV}/radio/songs`));
  result.preflight={dev_folders:devFolders.length,prod_folders:prodFolders.length,dev_songs:devSongs.length};
  const prodByIdentity=new Map(prodFolders.map(f=>[identity(f),f]));
  const devById=new Map(devFolders.map(f=>[fid(f),f]));
  const folderMap=new Map();
  for(const df of devFolders){const pf=prodByIdentity.get(identity(df));if(fid(df)&&fid(pf))folderMap.set(fid(df),fid(pf))}
  const amap=new Map();
  const grouped=new Map();
  for(const f of failures){const list=grouped.get(f.folder_id)||[];list.push(f);grouped.set(f.folder_id,list)}

  for(const [devFolderId,items] of grouped){
    const df=devById.get(devFolderId),prodFolderId=folderMap.get(devFolderId);
    if(!df||!prodFolderId){for(const item of items)result.failed.push({...item,error:'folder mapping missing in v4'});continue}
    const devAssets=assets(await req(`${DEV}/radio/admin/visuals/folders/${encodeURIComponent(devFolderId)}/assets`,{admin:devToken}));
    const prodAssets=assets(await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodFolderId)}/assets`,{admin:prodToken}));
    const devByAssetId=new Map(devAssets.map(a=>[aid(a),a]));
    const prodByUrl=new Map(prodAssets.map(a=>[aurl(a),a]).filter(([u])=>u));
    for(const item of items){
      const source=devByAssetId.get(item.asset_id);if(!source){result.failed.push({...item,error:'source asset missing in DEV'});continue}
      const url=aurl(source);const existing=prodByUrl.get(url);
      if(existing){amap.set(item.asset_id,aid(existing));result.asset_map[item.asset_id]=aid(existing);result.reused++;continue}
      try{
        // Deliberately omit the DEV UUID. PROD generates a fresh id to avoid cross-folder/global PK collisions.
        const b=await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodFolderId)}/assets`,{method:'POST',admin:prodToken,body:payload(source)});
        const created=b.asset||b.data?.asset||b.data||b;const newId=aid(created);if(!newId)throw new Error('create returned no PROD asset id');
        amap.set(item.asset_id,newId);result.asset_map[item.asset_id]=newId;result.created++;prodByUrl.set(url,created);
      }catch(e){result.failed.push({...item,error:e.message})}
    }
  }

  // Re-save recipes once so any explicit references to the seven DEV UUIDs are remapped to fresh PROD UUIDs.
  const prodSongs=songs(await req(`${PROD}/radio/songs`));const prodKeys=new Set(prodSongs.map(key).map(x=>x.toLowerCase()));
  for(const s of devSongs){const sk=key(s);if(!sk||!prodKeys.has(sk.toLowerCase()))continue;const enc=encodeURIComponent(sk);try{const dr=recipe(await req(`${DEV}/radio/vec/recipe?song_key=${enc}`));if(!dr)continue;result.recipes.found_dev++;let pr={};try{pr=recipe(await req(`${PROD}/radio/vec/recipe?song_key=${enc}`))||{}}catch{}const merged={...pr,...dr};if(pr.prepared_artwork_images&&!dr.prepared_artwork_images)merged.prepared_artwork_images=pr.prepared_artwork_images;if(pr.prepared_artwork_updated_at&&!dr.prepared_artwork_updated_at)merged.prepared_artwork_updated_at=pr.prepared_artwork_updated_at;await req(`${PROD}/radio/admin/vec/recipe`,{method:'PUT',admin:prodToken,body:{song_key:sk,recipe:remap(merged,folderMap,amap)}});result.recipes.saved_prod++}catch(e){result.recipes.failed.push({song_key:sk,error:e.message})}}

  let remaining=0;const checks=[];
  for(const [devFolderId,items] of grouped){const prodFolderId=folderMap.get(devFolderId);if(!prodFolderId)continue;const pa=assets(await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodFolderId)}/assets`,{admin:prodToken}));const urls=new Set(pa.map(aurl));for(const item of items){const ok=urls.has(item.url);if(!ok)remaining++;checks.push({asset_id:item.asset_id,url:item.url,present_in_prod:ok,prod_asset_id:result.asset_map[item.asset_id]||''})}}
  result.verification={remaining_failed_urls:remaining,checks,prod_folder_count:prodFolders.length,folder_map_count:folderMap.size};
}catch(e){result.fatal_error=e?.stack||e?.message||String(e)}finally{write();console.log(JSON.stringify(result,null,2))}
if(!result.ok)process.exit(2);
