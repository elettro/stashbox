import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEV='https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD='https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION='us-east-1';
const REPORT='radio/docs/diagnostics/DEV_TO_PROD_VEC_PROMOTION_V2_LATEST.json';
const RETRYABLE=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync('radio/docs/diagnostics',{recursive:true});

const result={started_at:new Date().toISOString(),version:2,policy:'content-only; no deletes; no users/listens/likes/shares/playlists/analytics',preflight:{},folders:{dev:0,prod_before:0,created:0,reused:0,failed:[]},folder_assets:{examined:0,created:0,reused:0,failed:[]},direct_assets:{examined:0,created:0,reused:0,failed:[]},recipes:{found_dev:0,saved_prod:0,failed:[]},verification:{},fatal_error:null};

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
      if(response.ok){if(pause) await sleep(220); return data;}
      const e=new Error(`${method} ${url} -> HTTP ${response.status}: ${data.error||data.message||text.slice(0,300)}`); e.status=response.status; throw e;
    }catch(e){
      last=e; const status=Number(e?.status||0);
      if((status && !RETRYABLE.has(status))||n===attempts) throw e;
      await sleep(Math.min(12000,750*(2**(n-1))));
    }
  }
  throw last;
}

const arr=(body,keys=[])=>{if(Array.isArray(body))return body; for(const k of keys){if(Array.isArray(body?.[k]))return body[k]} if(Array.isArray(body?.data))return body.data; return []};
const songs=b=>arr(b,['songs','items']);
const folders=b=>arr(b,['folders','items']);
const assets=b=>arr(b,['assets','items','results']);
const key=s=>String(s?.song_key||s?.songKey||'').trim();
const fid=f=>String(f?.id||'').trim();
const aid=a=>String(a?.id||a?.asset_id||'').trim();
const aurl=a=>String(a?.public_url||a?.publicUrl||a?.url||a?.asset_url||'').trim();
const identity=f=>String(f?.folder_slug||f?.folder_name||f?.folderName||'').trim().toLowerCase();
const recipe=b=>!b||b.found===false?null:(b.recipe||b.data?.recipe||null);

function folderPayload(f){return {
  folder_name:f.folder_name||f.folderName||'',folder_type:f.folder_type||f.folderType||'general',description:f.description||'',status:f.status||'active',priority:f.priority||'medium',notes:f.notes||'',
  relevant_artists:Array.isArray(f.relevant_artists)?f.relevant_artists:[],relevant_genres:Array.isArray(f.relevant_genres)?f.relevant_genres:[],relevant_moods:Array.isArray(f.relevant_moods)?f.relevant_moods:[],relevant_songs:Array.isArray(f.relevant_songs)?f.relevant_songs:[]
}}
function directPayload(songKey,a){return {song_key:songKey,asset_type:a.asset_type||a.type||'image',file_name:a.file_name||a.filename||'',s3_key:a.s3_key||a.key||'',public_url:aurl(a),thumbnail_url:a.thumbnail_url||a.thumbnailUrl||aurl(a),content_type:a.content_type||a.contentType||'',size_bytes:a.size_bytes||a.sizeBytes||null,width:a.width||null,height:a.height||null,ratio_label:a.ratio_label||a.ratioLabel||'',caption:a.caption||'',alt_text:a.alt_text||a.altText||'',notes:a.notes||''}}
function remap(v,fmap,amap){
  if(Array.isArray(v)) return v.map(x=>remap(x,fmap,amap));
  if(v&&typeof v==='object'){const out={}; for(const [k,x] of Object.entries(v)){if((k==='folder_id'||k==='folderId')&&typeof x==='string'&&fmap.has(x))out[k]=fmap.get(x); else out[k]=remap(x,fmap,amap)} return out}
  if(typeof v==='string'){if(fmap.has(v))return fmap.get(v); if(amap.has(v))return amap.get(v)}
  return v;
}
function write(){result.finished_at=new Date().toISOString(); const failures=result.folders.failed.length+result.folder_assets.failed.length+result.direct_assets.failed.length+result.recipes.failed.length; result.ok=!result.fatal_error&&failures===0; fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+'\n')}

try{
  const devToken=token('stashbox-radio-api-dev-v2');
  const prodToken=token('stashbox-radio-api-prod-v2');

  // Guarded serial preflight. No writes occur until all four reads succeed.
  const devSongs=songs(await req(`${DEV}/radio/songs`));
  const prodSongs=songs(await req(`${PROD}/radio/songs`));
  const devFolders=folders(await req(`${DEV}/radio/admin/visuals/folders`,{admin:devToken}));
  const prodFolders=folders(await req(`${PROD}/radio/admin/visuals/folders`,{admin:prodToken}));
  result.preflight={dev_songs:devSongs.length,prod_songs:prodSongs.length,dev_folders:devFolders.length,prod_folders:prodFolders.length};
  if(!devSongs.length||!prodSongs.length||!devFolders.length) throw new Error(`Preflight refused writes: ${JSON.stringify(result.preflight)}`);

  result.folders.dev=devFolders.length; result.folders.prod_before=prodFolders.length;
  const prodKeys=new Set(prodSongs.map(key).filter(Boolean).map(x=>x.toLowerCase()));
  const folderMap=new Map(); const assetMap=new Map();
  const prodFolderByIdentity=new Map(prodFolders.map(f=>[identity(f),f]));

  // Folders
  for(const df of devFolders){
    const did=fid(df); if(!did) continue;
    try{
      let pf=prodFolderByIdentity.get(identity(df));
      if(pf){
        const pid=fid(pf); await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(pid)}`,{method:'PUT',admin:prodToken,body:folderPayload(df)}); folderMap.set(did,pid); result.folders.reused++;
      }else{
        const b=await req(`${PROD}/radio/admin/visuals/folders`,{method:'POST',admin:prodToken,body:folderPayload(df)}); pf=b.folder||b.data?.folder||b.data||b; const pid=fid(pf); if(!pid)throw new Error('create returned no folder id'); folderMap.set(did,pid); prodFolderByIdentity.set(identity(df),pf); result.folders.created++;
      }
    }catch(e){result.folders.failed.push({dev_folder_id:did,name:df.folder_name||'',error:e.message})}
  }

  // Folder assets, preserving ids when the API permits it.
  for(const df of devFolders){
    const did=fid(df),pid=folderMap.get(did); if(!did||!pid)continue;
    try{
      const da=assets(await req(`${DEV}/radio/admin/visuals/folders/${encodeURIComponent(did)}/assets`,{admin:devToken}));
      const pa=assets(await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(pid)}/assets`,{admin:prodToken}));
      result.folder_assets.examined+=da.length;
      const byId=new Map(pa.map(a=>[aid(a),a]).filter(([x])=>x)); const byUrl=new Map(pa.map(a=>[aurl(a),a]).filter(([x])=>x));
      for(const d of da){
        const didAsset=aid(d),url=aurl(d); if(!didAsset||!url)continue;
        try{
          const existing=byId.get(didAsset)||byUrl.get(url);
          if(existing){assetMap.set(didAsset,aid(existing));result.folder_assets.reused++;continue}
          const b=await req(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(pid)}/assets`,{method:'POST',admin:prodToken,body:{...d,id:didAsset,folder_id:pid}});
          const p=b.asset||b.data?.asset||b.data||b; const newId=aid(p)||didAsset; assetMap.set(didAsset,newId); byId.set(newId,p); byUrl.set(url,p); result.folder_assets.created++;
        }catch(e){result.folder_assets.failed.push({folder_id:did,asset_id:didAsset,url,error:e.message})}
      }
    }catch(e){result.folder_assets.failed.push({folder_id:did,asset_id:null,error:e.message})}
  }

  // Direct song assets
  for(const s of devSongs){
    const sk=key(s); if(!sk||!prodKeys.has(sk.toLowerCase()))continue; const enc=encodeURIComponent(sk);
    try{
      const da=assets(await req(`${DEV}/radio/admin/vec/song-assets?song_key=${enc}`,{admin:devToken}));
      const pa=assets(await req(`${PROD}/radio/admin/vec/song-assets?song_key=${enc}`,{admin:prodToken}));
      result.direct_assets.examined+=da.length; const byUrl=new Map(pa.map(a=>[aurl(a),a]).filter(([x])=>x));
      for(const d of da){const oldId=aid(d),url=aurl(d); if(!oldId||!url)continue; try{const existing=byUrl.get(url); if(existing){assetMap.set(oldId,aid(existing));result.direct_assets.reused++;continue} const b=await req(`${PROD}/radio/admin/vec/song-assets`,{method:'POST',admin:prodToken,body:directPayload(sk,d)}); const p=b.asset||b.data?.asset||b.data||b; const newId=aid(p); if(!newId)throw new Error('create returned no asset id'); assetMap.set(oldId,newId); byUrl.set(url,p); result.direct_assets.created++}catch(e){result.direct_assets.failed.push({song_key:sk,asset_id:oldId,url,error:e.message})}}
    }catch(e){result.direct_assets.failed.push({song_key:sk,asset_id:null,error:e.message})}
  }

  // Recipes: DEV controls VEC behavior; PROD prepared artwork remains authoritative.
  for(const s of devSongs){
    const sk=key(s); if(!sk||!prodKeys.has(sk.toLowerCase()))continue; const enc=encodeURIComponent(sk);
    try{
      const dr=recipe(await req(`${DEV}/radio/vec/recipe?song_key=${enc}`)); if(!dr)continue; result.recipes.found_dev++;
      let pr={}; try{pr=recipe(await req(`${PROD}/radio/vec/recipe?song_key=${enc}`))||{}}catch{}
      const merged={...pr,...dr};
      if(pr.prepared_artwork_images&&!dr.prepared_artwork_images)merged.prepared_artwork_images=pr.prepared_artwork_images;
      if(pr.prepared_artwork_updated_at&&!dr.prepared_artwork_updated_at)merged.prepared_artwork_updated_at=pr.prepared_artwork_updated_at;
      const mapped=remap(merged,folderMap,assetMap);
      await req(`${PROD}/radio/admin/vec/recipe`,{method:'PUT',admin:prodToken,body:{song_key:sk,recipe:mapped}}); result.recipes.saved_prod++;
    }catch(e){result.recipes.failed.push({song_key:sk,error:e.message})}
  }

  const after=folders(await req(`${PROD}/radio/admin/visuals/folders`,{admin:prodToken}));
  const samples=[];
  for(const s of devSongs.slice(0,15)){const sk=key(s); if(!sk)continue; try{const r=recipe(await req(`${PROD}/radio/vec/recipe?song_key=${encodeURIComponent(sk)}`)); samples.push({song_key:sk,found:Boolean(r),visual_mode:r?.visual_mode||'',folder_count:Array.isArray(r?.folders)?r.folders.length:0,direct_clip_count:Array.isArray(r?.song_assets?.active_clip_ids)?r.song_assets.active_clip_ids.length:0,prepared_artwork_count:r?.prepared_artwork_images?Object.values(r.prepared_artwork_images).filter(Boolean).length:0})}catch(e){samples.push({song_key:sk,error:e.message})}}
  result.verification={prod_folders_after:after.length,expected_dev_folders:devFolders.length,folder_map_count:folderMap.size,asset_map_count:assetMap.size,samples};
}catch(e){result.fatal_error=e?.stack||e?.message||String(e)}finally{write();console.log(JSON.stringify(result,null,2))}
if(!result.ok)process.exit(2);
