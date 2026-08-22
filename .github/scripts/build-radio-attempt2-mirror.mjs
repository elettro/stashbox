import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SOURCE_SHA = process.env.SOURCE_SHA || '6d9b9e3947c06ab64e71f378050da57356a32177';
const SOURCE_ROOT = 'radio/dev/v2';
const TARGET_ROOT = 'radio/attempt2';
const DEV_API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const textSuffixes = new Set(['.html','.htm','.js','.mjs','.cjs','.css','.json','.md','.txt','.webmanifest','.xml','.sh','.yml','.yaml']);

function sh(cmd, args=[]) { return execFileSync(cmd, args, { encoding:'utf8', stdio:['ignore','pipe','inherit'] }); }
function walk(root) {
  const out=[];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const p=path.join(root,entry.name);
    if (entry.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
function hashFile(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function normalizeForCompare(text) {
  return text
    .replaceAll(PROD_API, DEV_API)
    .replaceAll('/radio/attempt2/', '/radio/dev/v2/')
    .replaceAll('radio/attempt2/', 'radio/dev/v2/')
    .replaceAll('/radio/', '/radio/dev/')
    .replaceAll('stashbox_radio_prod_cognito_tokens','stashbox_radio_dev_cognito_tokens')
    .replaceAll('stashbox-radio-rds-prod-session-id','stashbox-radio-rds-dev-session-id')
    .replaceAll('stashbox-radio-offline-prod','stashbox-radio-offline');
}

sh('git',['fetch','origin',SOURCE_SHA]);
sh('git',['archive','--format=tar',SOURCE_SHA, SOURCE_ROOT]);
fs.rmSync(TARGET_ROOT,{recursive:true,force:true});
fs.mkdirSync(TARGET_ROOT,{recursive:true});
const tar='/tmp/radio-attempt2-source.tar';
execFileSync('git',['archive','--format=tar','-o',tar,SOURCE_SHA,SOURCE_ROOT]);
fs.mkdirSync('/tmp/radio-attempt2-src',{recursive:true});
fs.rmSync('/tmp/radio-attempt2-src',{recursive:true,force:true});
fs.mkdirSync('/tmp/radio-attempt2-src',{recursive:true});
execFileSync('tar',['-xf',tar,'-C','/tmp/radio-attempt2-src']);
fs.cpSync(`/tmp/radio-attempt2-src/${SOURCE_ROOT}`,TARGET_ROOT,{recursive:true});

const replacements = [
  [DEV_API, PROD_API],
  ['d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev','je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2'],
  ['/radio/dev/v2/','/radio/attempt2/'],
  ['radio/dev/v2/','radio/attempt2/'],
  ['/radio/dev/','/radio/'],
  ['radio/dev/','radio/'],
  ['stashbox_radio_dev_cognito_tokens','stashbox_radio_prod_cognito_tokens'],
  ['stashbox-radio-rds-dev-session-id','stashbox-radio-rds-prod-session-id'],
  ['stashbox-radio-offline','stashbox-radio-offline-prod']
];

for (const p of walk(TARGET_ROOT)) {
  if (!textSuffixes.has(path.extname(p).toLowerCase())) continue;
  let text;
  try { text=fs.readFileSync(p,'utf8'); } catch { continue; }
  for (const [a,b] of replacements) text=text.replaceAll(a,b);
  if (p.endsWith('index.html')) text=text.replace(/<meta name="robots" content="noindex,nofollow">\s*/g,'');
  fs.writeFileSync(p,text);
}

const publicIndex=path.join(TARGET_ROOT,'index.html');
if (fs.existsSync(publicIndex)) {
  let t=fs.readFileSync(publicIndex,'utf8');
  t=t.replace('<title>Stashbox Radio DEV V2</title>','<title>Stashbox Radio | Attempt 2 Candidate</title>');
  t=t.replace('https://stashbox.com/radio/attempt2/','https://stashbox.com/radio/');
  fs.writeFileSync(publicIndex,t);
}
const desktopIndex=path.join(TARGET_ROOT,'desktop','index.html');
if (fs.existsSync(desktopIndex)) {
  let t=fs.readFileSync(desktopIndex,'utf8');
  t=t.replace('<title>Stashbox Radio DEV V2</title>','<title>Stashbox Radio | Attempt 2 Candidate</title>');
  if (!t.includes('rel="canonical"')) t=t.replace('</title>','</title>\n  <link rel="canonical" href="https://stashbox.com/radio/">');
  fs.writeFileSync(desktopIndex,t);
}

const sourceFiles=walk(`/tmp/radio-attempt2-src/${SOURCE_ROOT}`).map(p=>path.relative(`/tmp/radio-attempt2-src/${SOURCE_ROOT}`,p)).sort();
const targetFiles=walk(TARGET_ROOT).map(p=>path.relative(TARGET_ROOT,p)).sort();
const missing=sourceFiles.filter(x=>!targetFiles.includes(x));
const extra=targetFiles.filter(x=>!sourceFiles.includes(x));
const mismatches=[];
for (const rel of sourceFiles.filter(x=>targetFiles.includes(x))) {
  const s=path.join(`/tmp/radio-attempt2-src/${SOURCE_ROOT}`,rel);
  const t=path.join(TARGET_ROOT,rel);
  if (textSuffixes.has(path.extname(rel).toLowerCase())) {
    let a=fs.readFileSync(s,'utf8'); let b=fs.readFileSync(t,'utf8');
    b=normalizeForCompare(b);
    a=a.replace(/<meta name="robots" content="noindex,nofollow">\s*/g,'');
    b=b.replace(/<meta name="robots" content="noindex,nofollow">\s*/g,'');
    a=a.replace('<title>Stashbox Radio DEV V2</title>','<title>Stashbox Radio | Attempt 2 Candidate</title>');
    if (rel==='index.html') a=a.replace('https://stashbox.com/radio/dev/v2/','https://stashbox.com/radio/');
    if (rel==='desktop/index.html' && !a.includes('rel="canonical"')) a=a.replace('</title>','</title>\n  <link rel="canonical" href="https://stashbox.com/radio/">');
    if (a!==b) mismatches.push(rel);
  } else if (hashFile(s)!==hashFile(t)) mismatches.push(rel);
}
const report={source_sha:SOURCE_SHA,source_root:SOURCE_ROOT,target_root:TARGET_ROOT,source_file_count:sourceFiles.length,target_file_count:targetFiles.length,missing,extra,mismatches,ok:missing.length===0&&extra.length===0&&mismatches.length===0,generated_at:new Date().toISOString()};
fs.mkdirSync('radio/docs/diagnostics',{recursive:true});
fs.writeFileSync('radio/docs/diagnostics/ATTEMPT2_FRONTEND_MIRROR.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (!report.ok) process.exit(2);
