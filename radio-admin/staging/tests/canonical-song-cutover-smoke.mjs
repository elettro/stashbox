import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const PROD = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2/radio/songs';
const DEV = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/songs';
const entryFiles = [
  'radio/index.html',
  'radio/desktop/index.html',
  'radio/dev/v2/index.html',
  'radio/dev/v2/desktop/index.html'
];

for (const file of entryFiles) {
  const html = await fs.readFile(file, 'utf8');
  const canonicalIndex = html.indexOf('/radio/canonical-song-source.js');
  const bootIndex = html.indexOf('v2-boot-guard.js');
  if (canonicalIndex < 0 || bootIndex < 0 || canonicalIndex > bootIndex) {
    throw new Error(`Canonical song guard is not installed before v2-boot-guard in ${file}`);
  }
}

let prodHits = 0;
let devHits = 0;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route(`${PROD}**`, async route => {
  prodHits += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ songs: [{ song_key: 'canonical-prod-song', song_name: 'Canonical', artist: 'Stashbox', audio_url: 'https://example.test/song.mp3' }] })
  });
});
await page.route(`${DEV}**`, async route => {
  devHits += 1;
  await route.fulfill({ status: 599, body: 'DEV catalog must not be reached' });
});

try {
  await page.goto('http://127.0.0.1:4173/radio-admin/staging/', { waitUntil: 'domcontentloaded' });
  await page.setContent('<div id="v2App"><div data-v2-boot-status></div></div>');
  await page.addScriptTag({ url: 'http://127.0.0.1:4173/radio/canonical-song-source.js' });

  const devRequested = await page.evaluate(async url => {
    const response = await fetch(url);
    return { body: await response.json(), source: response.headers.get('x-stashbox-catalog-source') };
  }, DEV);
  if (devRequested.body?.songs?.[0]?.song_key !== 'canonical-prod-song') throw new Error('DEV request did not receive canonical PROD catalog.');
  if (devRequested.source !== 'canonical-prod-api') throw new Error(`Unexpected catalog source: ${devRequested.source}`);
  if (devHits !== 0 || prodHits !== 1) throw new Error(`DEV request routing wrong: prodHits=${prodHits}, devHits=${devHits}`);

  const prodRequested = await page.evaluate(async url => (await fetch(url)).json(), PROD);
  if (prodRequested?.songs?.[0]?.song_key !== 'canonical-prod-song') throw new Error('PROD request did not receive canonical PROD catalog.');
  if (devHits !== 0 || prodHits !== 2) throw new Error(`PROD request routing wrong: prodHits=${prodHits}, devHits=${devHits}`);

  const blockedWrite = await page.evaluate(async url => {
    try { await fetch(url, { method: 'POST' }); return ''; }
    catch (error) { return error?.message || String(error); }
  }, DEV);
  if (!blockedWrite.includes('Blocked non-read song catalog request')) throw new Error(`Non-read catalog request was not blocked: ${blockedWrite}`);
  if (devHits !== 0 || prodHits !== 2) throw new Error('Blocked write still reached a catalog endpoint.');

  console.log(JSON.stringify({ pass: true, prodHits, devHits, blockedWrite, entryFiles }, null, 2));
} finally {
  await browser.close();
}
