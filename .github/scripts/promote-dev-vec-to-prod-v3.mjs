import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEV='https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD='https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION='us-east-1';
const REPORT='radio/docs/diagnostics/DEV_TO_PROD_VEC_PROMOTION_V3_LATEST.json';
const RETRYABLE=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync('radio/docs/diagnostics',{recursive:true});

const result={
  started_at:new Date().toISOString(),version:3,
  policy:'content-only recovery; no deletes; no users/listens/likes/shares/playlists/analytics',
  preflight:{},folders:{mapped:0,missing:[]},
  folder_assets:{examined:0,created:0,reused:0,skipped:0,failed:[]},
  direct_assets:{examined:0,created:0,reused:0,skipped:0,failed:[]},
  recipes:{found_dev:0,saved_prod:0,failed:[]},verification:{},fatal_error:null
};

function token(fn){
  const raw=execFileSync('aws',['lambda','get-function-configuration','--function-name',fn,'--region',REGION,'--output','json'],{encoding:'utf8'});
  const vars=JSON.parse(raw)?.Environment?.Variables||{};
  const value=String(vars.ADMIN_TOKEN||vars.RADIO_ADMIN_TOKEN||'').trim();
  if(!value) throw new Error(`Missing admin token for ${fn}`);
  return value;
}

async function req(url,{method='GET',admin='',body,attempts=7,pause=true}={}){
  let last;
  for(let n=1;n<=attempts;n++){
    try{
      const headers={Accept:'application/json'};
      if(admin) headers['x-admin-token']=admin;
      if(body!==undefined) headers['Content-Type']='application/json';
      const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text();
      let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
      if(response.ok){if(pause) await sleep(250); return data;}
      const e=new Error(`${method} ${url} -> HTTP ${response.status}: ${data.error||data.message||text.slice(0,300)}`); e.status=response.status; throw e;
    }catch(e){
      last=e; const status=Number(e?.status||0);
      if((status&&!RETRYABLE.has(status))||n===attempts) throw e;
      await sleep(Math.min(12000,750*(2**(n-1))));
    }
  }
  throw last;
}

const arr=(body,keys=[])=>{if(Array.isArray(body))return body;for(const k of keys){if(Array.isArray(body?.[k]))return body[k]}if(Array.isArray(body?.data))return body.data;return []};
const songs=b=>arr(b,['songs','items']);
const folders=b=>arr(b,['folders','items']);
const assets=b=>arr(b,['assets','items','results']);
const key=s=>String(s?.song_key||s?.songKey||'').trim();
const fid=f=>String(f?.id||'').trim();
const aid=a=>String(a?.id||a?.asset_id||'').trim();
const aurl=a=>String(a?.public_url||a?.publicUrl||a?.url||a?.asset_url||'').trim();
const identity=f=>String(f?.folder_slug||f?.folder_name||f?.folderName||'').trim().toLowerCase();
const recipe=b=>!b||b.found===false?null:(b.recipe||b.data?.recipe||null);

function objectKey(a){
  const direct=String(a?.s3_key||a?.key||a?.object_key||a?.objectKey||'').trim();
  if(direct) return direct.replace(/^\/+/, '');
  const url=aurl(a); if(!url) return '';
  try{return decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '')}catch{return ''}
}
function inferType(a){
  if(a?.asset_type||a?.type) return a.asset_type||a.type;
  const u=aurl(a).toLowerCase();
  return /\.(mp4|mov|webm|m4v)(?:$|\?)/.test(u)?'video':'image';
}
function fileName(a){
  const named=String(a?.file_name||a?.filename||'').trim(); if(named) return named;
  const k=objectKey(a); return k?path.posix.basename(k):'';
}
function assetPayload(a,{id='',folderId='',songKey=''}={}){
  const url=aurl(a),s3=objectKey(a);
  const out={
    asset_type:inferType(a),file_name:fileName(a),s3_key:s3,public_url:url,
    thumbnail_url:a.thumbnail_url||a.thumbnailUrl||url,
    content_type:a.content_type||a.contentType||'',size_bytes:a.size_bytes||a.sizeBytes||null,
    width:a.width||null,height:a.height||null,ratio_label:a.ratio_label||a.ratioLabel||'',
    caption:a.caption||'',alt_text:a.alt_text||a.altText||'',notes:a.notes||''
  };
  if(id) out.id=id;
  if(folderId) out.folder_id=folderId;
  if(songKey) out.song_key=songKey;
  return out;
}
function remap(v,fmap,amap){
  if(Array.isArray(v)) return v.map(x=>remap(x,fmap,amap));
  if(v&&typeof v==='object'){
    const out={};
    for(const [k,x] of Object.entries(v)){
      if((k==='folder_id'||k==='folderId')&&typeof x==='string'&&fmap.has(x)) out[k]=fmap.get(x);
      else out[k]=remap(x,fmap,amap);
    }
    return out;
  }
  if(typeof v==='string'){if(fmap.has(v))return fmap.get(v);if(amap.has(v))return amap.get(v)}
  return v;
}
function write(){
  result.finished_at=new Date().toISOString();
  const failures=result.folders.missing.length+result.folder_assets.failed.length+result.direct_assets.failed.length+result.recipes.failed.length;
  result.ok=!result.fatal_error&&failures===0;
  fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+'\n');
}

try{
  const devToken=token('stashbox-radio-api-dev-v2');
  const prodToken=token('stashbox-radio-api-prod-v2');

  const devSongs=songs(await req(`${DEV}/radio/songs`));
  const prodSongs=songs(await req(`${PROD}/radio/songs`));
  const devFolders=folders(await req(`${DEV}/radio/admin/visuals/folders`,{admin:devToken}));
  const prodFolders=folders(await req(`${PROD}/radio/admin/visuals/folders`,{admin:prodToken}));
  result.preflight={dev_songs:devSongs.length,prod_songs:prodSongs.length,dev_folders:devFolders.length,prod_folders:prodFolders.length};
  if(!devSongs.length||!prodSongs.length||!devFolders.length||!prodFolders.length) throw new Error(`Preflight refused writes: ${JSON.stringify(result.preflight)}`);

  const prodKeys=new Set(prodSongs.map(key).filter(Boolean).map(x=>x.toLowerCase()));
  const prodByIdentity=new Map(prodFolders.map(f=>[identity(f),f]));
  const folderMap=new Map(),assetMap=new Map();
  for(const df of devFolders){
    const did=fid(df),pf=prodByIdentity.get(identity(df)),pid=fid(pf||{});
    if(did&&pid){folderMap.set(did,pid);result.folders.mapped++}
    else result.folders.missing.push({dev_folder_id:did,name:df.folder_name||df.folderName||''});
  }

  // Recover folder assets. Existing CloudFront URLs are authoritative; derive missing S3 keys from URL paths.
  for(const df of devFolders){
    const did=fid(df),pid=folderMap.get(did); if(!did||!pid) continue;
    try{
      const da=assets(await req(`${DEV}/radio/admin/visuals/folders/${encodeURIComponent(did)}/assets`,{admin:devToken}));
      const pa=assets(await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(pid)}/assets`,{admin:prodToken}));
      result.folder_assets.examined+=da.length;
      const byId=new Map(pa.map(a=>[aid(a),a]).filter(([x])=>x));
      const byUrl=new Map(pa.map(a=>[aurl(a),a]).filter(([x])=>x));
      for(const d of da){
        const oldId=aid(d),url=aurl(d),s3=objectKey(d);
        if(!oldId||!url||!s3){result.folder_assets.skipped++;result.folder_assets.failed.push({folder_id:did,asset_id:oldId,url,error:'missing id/public_url/derived s3_key'});continue}
        try{
          const existing=byId.get(oldId)||byUrl.get(url);
          if(existing){assetMap.set(oldId,aid(existing));result.folder_assets.reused++;continue}
          const payload=assetPayload(d,{id:oldId,folderId:pid});
          const b=await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(pid)}/assets`,{method:'POST',admin:prodToken,body:payload});
          const p=b.asset||b.data?.asset||b.data||b; const newId=aid(p)||oldId;
          assetMap.set(oldId,newId);byId.set(newId,p);byUrl.set(url,p);result.folder_assets.created++;
        }catch(e){result.folder_assets.failed.push({folder_id:did,asset_id:oldId,url,s3_key:s3,error:e.message})}
      }
    }catch(e){result.folder_assets.failed.push({folder_id:did,asset_id:null,error:e.message})}
  }

  // Recover Direct Only assets with the same derived-key fallback.
  for(const s of devSongs){
    const sk=key(s); if(!sk||!prodKeys.has(sk.toLowerCase())) continue;
    const enc=encodeURIComponent(sk);
    try{
      const da=assets(await req(`${DEV}/radio/admin/vec/song-assets?song_key=${enc}`,{admin:devToken}));
      const pa=assets(await req(`${PROD}/radio/admin/vec/song-assets?song_key=${enc}`,{admin:prodToken}));
      result.direct_assets.examined+=da.length;
      const byUrl=new Map(pa.map(a=>[aurl(a),a]).filter(([x])=>x));
      for(const d of da){
        const oldId=aid(d),url=aurl(d),s3=objectKey(d);
        if(!oldId||!url||!s3){result.direct_assets.skipped++;result.direct_assets.failed.push({song_key:sk,asset_id:oldId,url,error:'missing id/public_url/derived s3_key'});continue}
        try{
          const existing=byUrl.get(url);
          if(existing){assetMap.set(oldId,aid(existing));result.direct_assets.reused++;continue}
          const payload=assetPayload(d,{songKey:sk});
          const b=await req(`${PROD}/radio/admin/vec/song-assets`,{method:'POST',admin:prodToken,body:payload});
          const p=b.asset||b.data?.asset||b.data||b; const newId=aid(p);
          if(!newId) throw new Error('create returned no asset id');
          assetMap.set(oldId,newId);byUrl.set(url,p);result.direct_assets.created++;
        }catch(e){result.direct_assets.failed.push({song_key:sk,asset_id:oldId,url,s3_key:s3,error:e.message})}
      }
    }catch(e){result.direct_assets.failed.push({song_key:sk,asset_id:null,error:e.message})}
  }

  // Re-save DEV recipes after all folder and asset ids are mapped. Preserve PROD prepared artwork when DEV lacks it.
  for(const s of devSongs){
    const sk=key(s); if(!sk||!prodKeys.has(sk.toLowerCase())) continue;
    const enc=encodeURIComponent(sk);
    try{
      const dr=recipe(await req(`${DEV}/radio/vec/recipe?song_key=${enc}`)); if(!dr) continue;
      result.recipes.found_dev++;
      let pr={}; try{pr=recipe(await req(`${PROD}/radio/vec/recipe?song_key=${enc}`))||{}}catch{}
      const merged={...pr,...dr};
      if(pr.prepared_artwork_images&&!dr.prepared_artwork_images) merged.prepared_artwork_images=pr.prepared_artwork_images;
      if(pr.prepared_artwork_updated_at&&!dr.prepared_artwork_updated_at) merged.prepared_artwork_updated_at=pr.prepared_artwork_updated_at;
      await req(`${PROD}/radio/admin/vec/recipe`,{method:'PUT',admin:prodToken,body:{song_key:sk,recipe:remap(merged,folderMap,assetMap)}});
      result.recipes.saved_prod++;
    }catch(e){result.recipes.failed.push({song_key:sk,error:e.message})}
  }

  const after=folders(await req(`${PROD}/radio/admin/visuals/folders`,{admin:prodToken}));
  const samples=[];
  for(const s of devSongs.slice(0,20)){
    const sk=key(s); if(!sk)continue;
    try{
      const r=recipe(await req(`${PROD}/radio/vec/recipe?song_key=${encodeURIComponent(sk)}`));
      samples.push({song_key:sk,found:Boolean(r),visual_mode:r?.visual_mode||'',folder_count:Array.isArray(r?.folders)?r.folders.length:0,direct_clip_count:Array.isArray(r?.song_assets?.active_clip_ids)?r.song_assets.active_clip_ids.length:0,prepared_artwork_count:r?.prepared_artwork_images?Object.values(r.prepared_artwork_images).filter(Boolean).length:0});
    }catch(e){samples.push({song_key:sk,error:e.message})}
  }
  result.verification={prod_folders_after:after.length,expected_dev_folders:devFolders.length,folder_map_count:folderMap.size,asset_map_count:assetMap.size,samples};
}catch(e){result.fatal_error=e?.stack||e?.message||String(e)}finally{write();console.log(JSON.stringify(result,null,2))}
if(!result.ok) process.exit(2);
