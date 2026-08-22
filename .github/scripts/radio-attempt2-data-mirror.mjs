import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEV='https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD='https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const REGION='us-east-1';
const DEV_FUNCTION='stashbox-radio-api-dev-v2';
const PROD_FUNCTION='stashbox-radio-api-prod-v2';
const APPLY=String(process.env.APPLY||'').toLowerCase()==='true' || process.env.APPLY==='1';
const REPORT='radio/docs/diagnostics/ATTEMPT2_DATA_MIRROR.json';
const BACKUP='radio/docs/diagnostics/ATTEMPT2_PROD_DATA_BACKUP.json';
const RETRYABLE=new Set([408,425,429,500,502,503,504]);

fs.mkdirSync('radio/docs/diagnostics',{recursive:true});
const report={started_at:new Date().toISOString(),mode:APPLY?'apply':'preflight',source:'TRUE DEV radio_dev',target:'PROD radio',song_actions:{create:[],update:[],archive:[],failures:[]},artwork:{songs:0,ratios:0,failures:[]},media:{copied:0,reused:0,external:0,failures:[]},vec:{folders_created:0,folders_updated:0,folder_assets_created:0,folder_assets_reused:0,direct_assets_created:0,direct_assets_reused:0,recipes_saved:0,settings_saved:0,failures:[]},parity:{},fatal_error:null};

function lambdaConfig(name){
  const raw=execFileSync('aws',['lambda','get-function-configuration','--function-name',name,'--region',REGION,'--output','json'],{encoding:'utf8'});
  const vars=JSON.parse(raw)?.Environment?.Variables||{};
  const token=String(vars.ADMIN_TOKEN||vars.RADIO_ADMIN_TOKEN||'').trim();
  if(!token) throw new Error(`Missing admin token on ${name}`);
  return {token,bucket:String(vars.UPLOAD_BUCKET||vars.UPLOAD_BUCKET_NAME||vars.RADIO_UPLOAD_BUCKET||vars.S3_BUCKET||vars.MEDIA_BUCKET||'').trim(),region:String(vars.UPLOAD_REGION||vars.UPLOAD_BUCKET_REGION||vars.S3_BUCKET_REGION||vars.RADIO_UPLOAD_BUCKET_REGION||vars.AWS_REGION||REGION).trim(),publicBase:String(vars.UPLOAD_PUBLIC_BASE_URL||vars.MEDIA_PUBLIC_BASE_URL||vars.RADIO_MEDIA_PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'')};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,{method='GET',token='',body,attempts=6}={}){
  let last;
  for(let i=1;i<=attempts;i++){
    try{
      const headers={Accept:'application/json'}; if(token) headers['x-admin-token']=token; if(body!==undefined) headers['Content-Type']='application/json';
      const res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const text=await res.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
      if(res.ok) return data;
      const e=new Error(`${method} ${url} -> ${res.status}: ${data.error||data.message||text.slice(0,300)}`); e.status=res.status; throw e;
    }catch(e){last=e; const status=Number(e?.status||0); if((status&&!RETRYABLE.has(status))||i===attempts) throw e; await sleep(Math.min(8000,500*(2**(i-1))));}
  }
  throw last;
}
const rows=(body,key)=>Array.isArray(body)?body:(body?.[key]||body?.items||body?.data||[]);
const songKey=s=>String(s?.song_key||s?.songKey||'').trim();
const norm=v=>String(v??'').trim().toLowerCase();
const assetId=a=>String(a?.id||a?.asset_id||'').trim();
const assetUrl=a=>String(a?.public_url||a?.publicUrl||a?.url||'').trim();
const folderIdentity=f=>norm(f?.folder_slug||f?.folder_name||f?.folderName);
const unwrapRecipe=b=>!b||b.found===false?null:(b.recipe||b.data?.recipe||null);
const omit=(obj,keys)=>Object.fromEntries(Object.entries(obj||{}).filter(([k])=>!keys.has(k)));
const canonical=v=>JSON.stringify(v,Object.keys(v||{}).sort());

const SONG_FIELDS=['song_name','display_title','artist','album_name','genre','internal_version_name','languages','secondary_genre','release_format','song_origin','audio_url','song_artwork_url','video_link','enhanced_visuals_enabled','shuffle_visuals','visual_assets','visual_still_duration_seconds','public_track_note','show_public_note','public_video_note','video_setlist','public_visibility','exclusive','explicit','live_recording','featured','specific_product_urls','spotify_url','apple_music_url','youtube_music_url','official_song_page_url','shop_url','mood_tags','internal_notes'];
const ART_FIELDS=['song_artwork_url','song_artwork_16x9_url','song_artwork_9x16_url','song_artwork_3x4_url','song_artwork_4x5_url','song_artwork_21x9_url'];

function sourceKeyForUrl(url,cfg){
  if(!url||!cfg.bucket) return '';
  try{
    if(cfg.publicBase&&url.startsWith(cfg.publicBase+'/')) return decodeURIComponent(url.slice(cfg.publicBase.length+1));
    const u=new URL(url); const host=u.hostname.toLowerCase();
    if(host===`${cfg.bucket}.s3.${cfg.region}.amazonaws.com`.toLowerCase()||host===`${cfg.bucket}.s3.amazonaws.com`.toLowerCase()) return decodeURIComponent(u.pathname.replace(/^\//,''));
    if(host==='s3.amazonaws.com'&&u.pathname.startsWith(`/${cfg.bucket}/`)) return decodeURIComponent(u.pathname.slice(cfg.bucket.length+2));
  }catch{}
  return '';
}
function publicUrl(cfg,key){return cfg.publicBase?`${cfg.publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`:`https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;}
function s3Head(bucket,key){try{execFileSync('aws',['s3api','head-object','--bucket',bucket,'--key',key,'--region',REGION],{stdio:'ignore'});return true;}catch{return false;}}
async function mirrorMedia(url,devCfg,prodCfg){
  if(!url) return {url:'',key:'',kind:'empty'};
  const key=sourceKeyForUrl(url,devCfg);
  if(!key||!devCfg.bucket||!prodCfg.bucket){report.media.external++;return {url,key:'',kind:'external'};}
  if(devCfg.bucket===prodCfg.bucket){report.media.reused++;return {url,key,kind:'shared'};}
  const target=publicUrl(prodCfg,key);
  if(!APPLY) return {url:target,key,kind:s3Head(prodCfg.bucket,key)?'reused':'planned-copy'};
  try{
    if(!s3Head(prodCfg.bucket,key)){
      execFileSync('aws',['s3api','copy-object','--bucket',prodCfg.bucket,'--copy-source',`${devCfg.bucket}/${key}`,'--key',key,'--metadata-directive','COPY','--region',REGION],{stdio:'ignore'});
      report.media.copied++;
    }else report.media.reused++;
    return {url:target,key,kind:'prod'};
  }catch(e){report.media.failures.push({url,key,error:e.message});throw e;}
}
async function mirrorVisualAssets(list,devCfg,prodCfg){
  const out=[];
  for(const a of Array.isArray(list)?list:[]){
    const m=await mirrorMedia(String(a?.url||a?.src||''),devCfg,prodCfg);
    out.push({...a,url:m.url||a?.url||a?.src||'',src:m.url||a?.src||a?.url||'',key:m.key||a?.key||a?.object_key||''});
  }
  return out;
}
function songPayload(song){return Object.fromEntries(SONG_FIELDS.filter(f=>Object.prototype.hasOwnProperty.call(song,f)).map(f=>[f,song[f]]));}
function folderPayload(f){return {folder_name:f.folder_name||f.folderName||'',folder_type:f.folder_type||f.folderType||'general',description:f.description||'',status:f.status||'active',priority:f.priority||'medium',notes:f.notes||'',relevant_artists:Array.isArray(f.relevant_artists)?f.relevant_artists:[],relevant_genres:Array.isArray(f.relevant_genres)?f.relevant_genres:[],relevant_moods:Array.isArray(f.relevant_moods)?f.relevant_moods:[],relevant_songs:Array.isArray(f.relevant_songs)?f.relevant_songs:[]};}
function deepRemap(value,folderMap,assetMap){
  if(Array.isArray(value)) return value.map(x=>deepRemap(x,folderMap,assetMap));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[(k),(k==='folder_id'||k==='folderId')&&typeof v==='string'&&folderMap.has(v)?folderMap.get(v):deepRemap(v,folderMap,assetMap)]));
  if(typeof value==='string'){if(folderMap.has(value))return folderMap.get(value);if(assetMap.has(value))return assetMap.get(value);} return value;
}
function recipeComparable(recipe){
  const clean=JSON.parse(JSON.stringify(recipe||{})); delete clean.updated_at; delete clean.prepared_artwork_updated_at; return clean;
}

async function snapshot(api,token){
  const songs=rows(await request(`${api}/admin/songs`,{token}),'songs');
  const folders=rows(await request(`${api}/radio/admin/visuals/folders`,{token}),'folders');
  const folderAssets={};
  for(const f of folders){const id=String(f.id||''); if(!id)continue; folderAssets[id]=rows(await request(`${api}/radio/admin/visuals/folders/${encodeURIComponent(id)}/assets`,{token}),'assets');}
  const perSong={};
  for(const s of songs){const key=songKey(s);if(!key)continue;const enc=encodeURIComponent(key);const entry={};
    try{entry.artwork=(await request(`${api}/radio/admin/songs/${enc}/artwork-images`,{token})).media||{};}catch(e){entry.artwork_error=e.message;}
    try{entry.recipe=unwrapRecipe(await request(`${api}/radio/vec/recipe?song_key=${enc}`));}catch(e){entry.recipe_error=e.message;}
    try{entry.direct=rows(await request(`${api}/radio/admin/vec/song-assets?song_key=${enc}`,{token}),'assets');}catch(e){entry.direct=[];entry.direct_error=e.message;}
    try{entry.settings=await request(`${api}/radio/admin/songs/${enc}/visual-settings`,{token});}catch(e){entry.settings=null;entry.settings_error=e.message;}
    perSong[key]=entry;
  }
  return {songs,folders,folderAssets,perSong};
}

async function main(){
  const devCfg=lambdaConfig(DEV_FUNCTION), prodCfg=lambdaConfig(PROD_FUNCTION);
  const dev=await snapshot(DEV,devCfg.token); const prod=await snapshot(PROD,prodCfg.token);
  const devByKey=new Map(dev.songs.map(s=>[norm(songKey(s)),s]).filter(([k])=>k));
  const prodByKey=new Map(prod.songs.map(s=>[norm(songKey(s)),s]).filter(([k])=>k));
  report.preflight={dev_song_count:dev.songs.length,prod_song_count:prod.songs.length,dev_folder_count:dev.folders.length,prod_folder_count:prod.folders.length,missing_song_keys:[...devByKey.keys()].filter(k=>!prodByKey.has(k)),prod_only_visible:prod.songs.filter(s=>norm(s.public_visibility||'visible')==='visible'&&!devByKey.has(norm(songKey(s)))).map(songKey)};
  if(!APPLY){fs.writeFileSync(REPORT,JSON.stringify({...report,ok:true,finished_at:new Date().toISOString()},null,2)+'\n');console.log(JSON.stringify(report,null,2));return;}

  fs.writeFileSync(BACKUP,JSON.stringify({created_at:new Date().toISOString(),source:'production before Attempt 2 apply',data:prod},null,2)+'\n');

  // Songs first. Preserve production engagement fields by sending only editable DEV content fields.
  for(const devSong of dev.songs){
    const key=songKey(devSong); if(!key)continue; const lk=norm(key); const exists=prodByKey.has(lk);
    try{
      const body=songPayload(devSong);
      const audio=await mirrorMedia(String(body.audio_url||''),devCfg,prodCfg); if(body.audio_url) body.audio_url=audio.url;
      const video=await mirrorMedia(String(body.video_link||''),devCfg,prodCfg); if(body.video_link&&video.kind!=='external') body.video_link=video.url;
      body.visual_assets=await mirrorVisualAssets(body.visual_assets,devCfg,prodCfg);
      const one=await mirrorMedia(String(body.song_artwork_url||''),devCfg,prodCfg); if(body.song_artwork_url) body.song_artwork_url=one.url;
      if(exists){report.song_actions.update.push(key);await request(`${PROD}/admin/songs/${encodeURIComponent(key)}`,{method:'PUT',token:prodCfg.token,body});}
      else{report.song_actions.create.push(key);await request(`${PROD}/admin/songs`,{method:'POST',token:prodCfg.token,body:{song_key:key,...body}});prodByKey.set(lk,{song_key:key,...body});}
    }catch(e){report.song_actions.failures.push({song_key:key,error:e.message});}
  }
  for(const p of prod.songs){const key=songKey(p);if(!key||devByKey.has(norm(key))||norm(p.public_visibility)==='hidden')continue;try{report.song_actions.archive.push(key);await request(`${PROD}/admin/songs/${encodeURIComponent(key)}`,{method:'PUT',token:prodCfg.token,body:{public_visibility:'hidden'}});}catch(e){report.song_actions.failures.push({song_key:key,archive:true,error:e.message});}}

  // Canonical six-ratio artwork, physically copied when it originates in the DEV upload bucket.
  for(const s of dev.songs){const key=songKey(s);if(!key)continue;const media=dev.perSong[key]?.artwork||{};const patch={};
    for(const field of ART_FIELDS){const url=String(media[field]||(field==='song_artwork_url'?media.song_artwork_1x1_url:'')||'').trim();if(!url)continue;try{const m=await mirrorMedia(url,devCfg,prodCfg);patch[field]=m.url;report.artwork.ratios++;}catch(e){report.artwork.failures.push({song_key:key,field,error:e.message});}}
    if(Object.keys(patch).length){report.artwork.songs++;try{await request(`${PROD}/radio/admin/songs/${encodeURIComponent(key)}/artwork-images`,{method:'PATCH',token:prodCfg.token,body:patch});}catch(e){report.artwork.failures.push({song_key:key,error:e.message});}}
  }

  // VEC folders and assets. Keep unused PROD rows intact; DEV recipes/settings define eligibility.
  const prodFolderByIdentity=new Map(prod.folders.map(f=>[folderIdentity(f),f])); const folderMap=new Map(); const assetMap=new Map();
  for(const f of dev.folders){const devId=String(f.id||'');if(!devId)continue;const identity=folderIdentity(f);try{let pf=prodFolderByIdentity.get(identity);if(pf){await request(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(String(pf.id))}`,{method:'PUT',token:prodCfg.token,body:folderPayload(f)});report.vec.folders_updated++;}else{const c=await request(`${PROD}/radio/admin/visuals/folders`,{method:'POST',token:prodCfg.token,body:folderPayload(f)});pf=c.folder||c.data?.folder||c.data||c;report.vec.folders_created++;prodFolderByIdentity.set(identity,pf);}const prodId=String(pf.id||'');if(!prodId)throw new Error('No PROD folder id');folderMap.set(devId,prodId);
      const devAssets=dev.folderAssets[devId]||[];const prodAssets=prod.folderAssets[prodId]||rows(await request(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodId)}/assets`,{token:prodCfg.token}),'assets');const byId=new Map(prodAssets.map(a=>[assetId(a),a]).filter(([id])=>id));const byUrl=new Map(prodAssets.map(a=>[assetUrl(a),a]).filter(([u])=>u));
      for(const a of devAssets){const did=assetId(a);if(!did)continue;const m=await mirrorMedia(assetUrl(a),devCfg,prodCfg);let existing=byId.get(did)||byUrl.get(m.url);if(existing){assetMap.set(did,assetId(existing));report.vec.folder_assets_reused++;continue;}const thumb=await mirrorMedia(String(a.thumbnail_url||a.thumbnailUrl||assetUrl(a)),devCfg,prodCfg);const payload={...a,id:did,folder_id:prodId,public_url:m.url,url:m.url,s3_key:m.key||a.s3_key||a.key||'',thumbnail_url:thumb.url||m.url};const c=await request(`${PROD}/radio/admin/visuals/folders/${encodeURIComponent(prodId)}/assets`,{method:'POST',token:prodCfg.token,body:payload});const pa=c.asset||c.data?.asset||c.data||c;assetMap.set(did,assetId(pa)||did);report.vec.folder_assets_created++;}
    }catch(e){report.vec.failures.push({folder:f.folder_name||devId,error:e.message});}}

  // Direct-only assets.
  for(const s of dev.songs){const key=songKey(s);if(!key)continue;const devDirect=dev.perSong[key]?.direct||[];let prodDirect=[];try{prodDirect=rows(await request(`${PROD}/radio/admin/vec/song-assets?song_key=${encodeURIComponent(key)}`,{token:prodCfg.token}),'assets');}catch{}const byUrl=new Map(prodDirect.map(a=>[assetUrl(a),a]).filter(([u])=>u));
    for(const a of devDirect){const did=assetId(a);if(!did)continue;try{const m=await mirrorMedia(assetUrl(a),devCfg,prodCfg);const ex=byUrl.get(m.url);if(ex){assetMap.set(did,assetId(ex));report.vec.direct_assets_reused++;continue;}const thumb=await mirrorMedia(String(a.thumbnail_url||a.thumbnailUrl||assetUrl(a)),devCfg,prodCfg);const c=await request(`${PROD}/radio/admin/vec/song-assets`,{method:'POST',token:prodCfg.token,body:{song_key:key,asset_type:a.asset_type||a.type||'image',file_name:a.file_name||a.filename||'',s3_key:m.key||a.s3_key||a.key||'',public_url:m.url,thumbnail_url:thumb.url||m.url,content_type:a.content_type||'',size_bytes:a.size_bytes||null,width:a.width||null,height:a.height||null,ratio_label:a.ratio_label||'',caption:a.caption||'',alt_text:a.alt_text||'',notes:a.notes||''}});const pa=c.asset||c.data?.asset||c.data||c;assetMap.set(did,assetId(pa));report.vec.direct_assets_created++;}catch(e){report.vec.failures.push({song_key:key,asset_id:did,error:e.message});}}
  }

  // Exact DEV recipes and explicit visual settings remapped to PROD IDs.
  for(const s of dev.songs){const key=songKey(s);if(!key)continue;const recipe=dev.perSong[key]?.recipe;try{if(recipe){await request(`${PROD}/radio/admin/vec/recipe`,{method:'PUT',token:prodCfg.token,body:{song_key:key,recipe:deepRemap(recipe,folderMap,assetMap)}});report.vec.recipes_saved++;}const settings=dev.perSong[key]?.settings;if(settings){const body={order_mode:settings.order_mode,folder_mappings:deepRemap(settings.folder_mappings||[],folderMap,assetMap),asset_mappings:deepRemap(settings.asset_mappings||[],folderMap,assetMap)};await request(`${PROD}/radio/admin/songs/${encodeURIComponent(key)}/visual-settings`,{method:'PUT',token:prodCfg.token,body});report.vec.settings_saved++;}}catch(e){report.vec.failures.push({song_key:key,stage:'recipe/settings',error:e.message});}}

  // Verification from fresh public/admin reads.
  const fresh=await snapshot(PROD,prodCfg.token);const freshVisible=new Set(fresh.songs.filter(s=>norm(s.public_visibility||'visible')==='visible').map(s=>norm(songKey(s))).filter(Boolean));const devVisible=new Set(dev.songs.filter(s=>norm(s.public_visibility||'visible')==='visible').map(s=>norm(songKey(s))).filter(Boolean));
  const missingVisible=[...devVisible].filter(k=>!freshVisible.has(k));const extraVisible=[...freshVisible].filter(k=>!devVisible.has(k));const artworkMismatch=[];const recipeMismatch=[];
  for(const s of dev.songs){const key=songKey(s);if(!key)continue;const da=dev.perSong[key]?.artwork||{},pa=fresh.perSong[key]?.artwork||{};for(const field of ART_FIELDS){if(!String(da[field]||(field==='song_artwork_url'?da.song_artwork_1x1_url:'')||'').trim())continue;if(!String(pa[field]||(field==='song_artwork_url'?pa.song_artwork_1x1_url:'')||'').trim())artworkMismatch.push({song_key:key,field,reason:'missing'});}const dr=dev.perSong[key]?.recipe,pr=fresh.perSong[key]?.recipe;if(Boolean(dr)!==Boolean(pr))recipeMismatch.push({song_key:key,reason:'presence'});else if(dr&&pr){const mapped=deepRemap(dr,folderMap,assetMap);if(JSON.stringify(recipeComparable(mapped))!==JSON.stringify(recipeComparable(pr)))recipeMismatch.push({song_key:key,reason:'content'});}}
  report.parity={dev_visible_count:devVisible.size,prod_visible_count:freshVisible.size,missing_visible:missingVisible,extra_visible:extraVisible,artwork_mismatches:artworkMismatch,recipe_mismatches:recipeMismatch,folder_map_count:folderMap.size,asset_map_count:assetMap.size};
}

try{await main();}catch(e){report.fatal_error=e?.stack||e?.message||String(e);}finally{report.finished_at=new Date().toISOString();const failures=report.song_actions.failures.length+report.artwork.failures.length+report.media.failures.length+report.vec.failures.length;const parityBad=(report.parity.missing_visible?.length||0)+(report.parity.extra_visible?.length||0)+(report.parity.artwork_mismatches?.length||0)+(report.parity.recipe_mismatches?.length||0);report.ok=!report.fatal_error&&failures===0&&(!APPLY||parityBad===0);fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
if(!report.ok)process.exit(2);
