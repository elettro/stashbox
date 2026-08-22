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

function walk(root) {
  const out=[];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const p=path.join(root,entry.name);
    if (entry.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
function hashBuffer(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

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

function transformText(text, rel) {
  for (const [from,to] of replacements) text=text.replaceAll(from,to);
  if (rel.endsWith('index.html')) text=text.replace(/<meta name="robots" content="noindex,nofollow">\s*/g,'');
  if (rel === 'index.html') {
    text=text.replace('<title>Stashbox Radio DEV V2</title>','<title>Stashbox Radio | Attempt 2 Candidate</title>');
    text=text.replace('https://stashbox.com/radio/attempt2/','https://stashbox.com/radio/');
  }
  if (rel === 'desktop/index.html') {
    text=text.replace('<title>Stashbox Radio DEV V2</title>','<title>Stashbox Radio | Attempt 2 Candidate</title>');
    if (!text.includes('rel="canonical"')) text=text.replace('</title>','</title>\n  <link rel="canonical" href="https://stashbox.com/radio/">');
  }
  return text;
}

execFileSync('git',['fetch','origin',SOURCE_SHA],{stdio:'inherit'});
fs.rmSync(TARGET_ROOT,{recursive:true,force:true});
const tar='/tmp/radio-attempt2-source.tar';
const extracted='/tmp/radio-attempt2-src';
fs.rmSync(extracted,{recursive:true,force:true});
fs.mkdirSync(extracted,{recursive:true});
execFileSync('git',['archive','--format=tar','-o',tar,SOURCE_SHA,SOURCE_ROOT],{stdio:'inherit'});
execFileSync('tar',['-xf',tar,'-C',extracted],{stdio:'inherit'});
const extractedRoot=path.join(extracted,SOURCE_ROOT);
fs.cpSync(extractedRoot,TARGET_ROOT,{recursive:true});

for (const p of walk(TARGET_ROOT)) {
  const rel=path.relative(TARGET_ROOT,p).replaceAll('\\','/');
  if (!textSuffixes.has(path.extname(p).toLowerCase())) continue;
  let text;
  try { text=fs.readFileSync(p,'utf8'); } catch { continue; }
  fs.writeFileSync(p,transformText(text,rel));
}

const sourceFiles=walk(extractedRoot).map(p=>path.relative(extractedRoot,p).replaceAll('\\','/')).sort();
const targetFiles=walk(TARGET_ROOT).map(p=>path.relative(TARGET_ROOT,p).replaceAll('\\','/')).sort();
const missing=sourceFiles.filter(x=>!targetFiles.includes(x));
const extra=targetFiles.filter(x=>!sourceFiles.includes(x));
const mismatches=[];
for (const rel of sourceFiles.filter(x=>targetFiles.includes(x))) {
  const sourcePath=path.join(extractedRoot,rel);
  const targetPath=path.join(TARGET_ROOT,rel);
  if (textSuffixes.has(path.extname(rel).toLowerCase())) {
    const expected=transformText(fs.readFileSync(sourcePath,'utf8'),rel);
    const actual=fs.readFileSync(targetPath,'utf8');
    if (expected!==actual) mismatches.push(rel);
  } else if (hashBuffer(fs.readFileSync(sourcePath))!==hashBuffer(fs.readFileSync(targetPath))) {
    mismatches.push(rel);
  }
}

const forbidden=[];
for (const p of walk(TARGET_ROOT)) {
  if (!textSuffixes.has(path.extname(p).toLowerCase())) continue;
  let text=''; try { text=fs.readFileSync(p,'utf8'); } catch { continue; }
  for (const token of [DEV_API,'d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev','/radio/dev/v2/','stashbox_radio_dev_cognito_tokens','stashbox-radio-rds-dev-session-id']) {
    if (text.includes(token)) forbidden.push({file:path.relative(TARGET_ROOT,p).replaceAll('\\','/'),token});
  }
}

const report={source_sha:SOURCE_SHA,source_root:SOURCE_ROOT,target_root:TARGET_ROOT,source_file_count:sourceFiles.length,target_file_count:targetFiles.length,missing,extra,mismatches,forbidden,ok:missing.length===0&&extra.length===0&&mismatches.length===0&&forbidden.length===0,generated_at:new Date().toISOString()};
fs.mkdirSync('radio/docs/diagnostics',{recursive:true});
fs.writeFileSync('radio/docs/diagnostics/ATTEMPT2_FRONTEND_MIRROR.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (!report.ok) process.exit(2);
