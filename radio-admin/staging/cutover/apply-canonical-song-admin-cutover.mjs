import fs from 'node:fs/promises';

const apply = process.argv.includes('--apply');
const files = {
  songs: 'radio-admin/staging/songs/songs.js',
  media: 'radio-admin/staging/songs/media.js',
  artwork: 'radio-admin/staging/songs/artwork.js',
  html: 'radio-admin/staging/songs/index.html'
};

const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing expected ${label}: ${from}`);
  return source.replaceAll(from, to);
}

function transformSongs(source) {
  let next = source;
  next = replaceRequired(next, "const env = migration.getEnvironment('dev');", "const env = migration.getCanonicalSongEnvironment();", 'Song CMS environment');
  next = replaceRequired(next, "migration.assertWriteAllowed('dev', 'songs');", "migration.assertCanonicalSongWriteApproved('songs');", 'Song CMS write guard');
  next = replaceRequired(next, 'No DEV admin token found. Save one on the staging Dashboard first.', 'No canonical PROD admin token found. Save the separate PROD token before editing the LIVE catalog.', 'Song CMS token message');
  next = replaceRequired(next, 'Blocked request outside the DEV Song CMS API boundary.', 'Blocked request outside the canonical PROD Song CMS API boundary.', 'Song CMS API boundary message');
  next = next.replaceAll('Create DEV Song', 'Create LIVE Song');
  next = next.replaceAll('Create a song in the DEV catalog. PROD writes remain blocked.', 'Create a song in the canonical LIVE catalog. Production writes remain locked until explicitly approved.');
  next = next.replaceAll('Create in DEV', 'Create LIVE Song');
  next = next.replaceAll('DEV write guard active. PROD writes are blocked.', 'Canonical LIVE Song CMS selected. Production writes are currently locked.');
  next = next.replaceAll('Edit DEV Song:', 'Edit LIVE Song:');
  next = next.replaceAll('Saving updates the selected DEV song only.', 'Saving updates the selected canonical LIVE song only.');
  next = next.replaceAll('Save DEV Changes', 'Save LIVE Changes');
  next = next.replaceAll('Editing DEV song key:', 'Editing LIVE song key:');
  next = next.replaceAll('Generated DEV song key:', 'Generated LIVE song key:');
  next = next.replaceAll('Creating DEV song…', 'Creating LIVE song…');
  next = next.replaceAll('Saving DEV song ', 'Saving LIVE song ');
  next = next.replaceAll('DEV song created:', 'LIVE song created:');
  next = next.replaceAll('DEV song saved:', 'LIVE song saved:');
  next = next.replaceAll('DEV save failed:', 'LIVE save blocked/failed:');
  next = next.replaceAll('Loading DEV songs…', 'Loading canonical LIVE songs…');
  next = next.replaceAll('DEV Song CMS', 'Canonical LIVE Song CMS');
  return next;
}

function addProdBucketGuard(source, marker, label) {
  if (source.includes(PROD_BUCKET)) return source;
  const guard = `${marker}\n    const allowedProdBucket = '${PROD_BUCKET}';\n    if (!parsed.hostname.includes(allowedProdBucket)) throw new Error('Blocked canonical Song CMS upload outside PROD media bucket.');`;
  if (!source.includes(marker)) throw new Error(`Missing ${label} upload URL marker.`);
  return source.replace(marker, guard);
}

function transformMedia(source) {
  let next = source;
  next = replaceRequired(next, "const env = migration.getEnvironment('dev');", "const env = migration.getCanonicalSongEnvironment();", 'media environment');
  next = replaceRequired(next, "migration.assertWriteAllowed('dev', `song-media-${config.purpose}`);", "migration.assertCanonicalSongWriteApproved(`song-media-${config.purpose}`);", 'media write guard');
  next = next.replaceAll('No DEV admin token found.', 'No canonical PROD admin token found.');
  next = next.replaceAll('Select an existing DEV song first.', 'Select an existing LIVE song first.');
  next = next.replaceAll('Blocked non-DEV presign route.', 'Blocked non-canonical presign route.');
  next = next.replaceAll('DEV presign response is missing upload_url or public_url.', 'Canonical PROD presign response is missing upload_url or public_url.');
  next = addProdBucketGuard(next, "    if (parsed.protocol !== 'https:') throw new Error('Blocked non-HTTPS upload URL.');", 'media');
  next = next.replaceAll('Choose Edit on an existing DEV song before uploading media.', 'Choose Edit on an existing LIVE song before uploading media.');
  next = next.replaceAll('Save DEV Changes', 'Save LIVE Changes');
  next = next.replaceAll('Uploading ${files.length} file${files.length === 1 ? \'\' : \'s\'} to DEV…', 'Uploading ${files.length} file${files.length === 1 ? \'\' : \'s\'} to LIVE media…');
  next = next.replaceAll('Audio uploaded to DEV.', 'Audio uploaded to PROD media.');
  next = next.replaceAll('DEV media upload complete.', 'LIVE media upload complete.');
  next = next.replaceAll('DEV media uploads enabled for', 'LIVE media uploads enabled for');
  return next;
}

function transformArtwork(source) {
  let next = source;
  next = replaceRequired(next, "const env = migration.getEnvironment('dev');", "const env = migration.getCanonicalSongEnvironment();", 'artwork environment');
  next = replaceRequired(next, "migration.assertWriteAllowed('dev', 'song-artwork');", "migration.assertCanonicalSongWriteApproved('song-artwork');", 'artwork write guard');
  next = next.replaceAll('No DEV admin token found.', 'No canonical PROD admin token found.');
  next = next.replaceAll('Blocked request outside the DEV artwork API boundary.', 'Blocked request outside the canonical PROD artwork API boundary.');
  next = next.replaceAll('Save or select an existing DEV song before managing artwork.', 'Save or select an existing LIVE song before managing artwork.');
  next = next.replaceAll('Loading DEV artwork for', 'Loading LIVE artwork for');
  next = next.replaceAll('DEV artwork loaded for', 'LIVE artwork loaded for');
  next = next.replaceAll('Unable to load DEV artwork:', 'Unable to load LIVE artwork:');
  next = next.replaceAll('Select an existing DEV song first.', 'Select an existing LIVE song first.');
  next = next.replaceAll('Requesting DEV upload authorization…', 'Requesting PROD upload authorization…');
  next = next.replaceAll('DEV presign response is missing upload_url or public_url.', 'Canonical PROD presign response is missing upload_url or public_url.');
  next = addProdBucketGuard(next, "      if (parsedUpload.protocol !== 'https:') throw new Error('Blocked non-HTTPS upload URL.');", 'artwork');
  next = next.replaceAll('Uploading image to DEV media storage…', 'Uploading image to PROD media storage…');
  next = next.replaceAll('Attaching image to DEV song…', 'Attaching image to LIVE song…');
  next = next.replaceAll('uploaded to DEV.', 'uploaded to LIVE.');
  next = next.replaceAll('DEV artwork updated for', 'LIVE artwork updated for');
  next = next.replaceAll('Save the new DEV song before uploading artwork.', 'Save the new LIVE song before uploading artwork.');
  next = next.replaceAll('Upload to DEV', 'Upload to LIVE');
  return next;
}

function transformHtml(source) {
  return source
    .replaceAll('DEV SONG CMS', 'CANONICAL LIVE SONG CMS')
    .replaceAll('DEV catalog', 'canonical LIVE catalog')
    .replaceAll('DEV songs', 'LIVE songs')
    .replaceAll('DEV-only', 'LIVE-catalog')
    .replaceAll('PROD locked', 'PROD writes locked');
}

const originals = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await fs.readFile(file, 'utf8')])));
const transformed = {
  songs: transformSongs(originals.songs),
  media: transformMedia(originals.media),
  artwork: transformArtwork(originals.artwork),
  html: transformHtml(originals.html)
};

const summary = Object.entries(files).map(([key, file]) => ({ file, changed: originals[key] !== transformed[key] }));
if (!apply) {
  console.log(JSON.stringify({ apply: false, prodBucket: PROD_BUCKET, summary }, null, 2));
  process.exit(0);
}

for (const [key, file] of Object.entries(files)) await fs.writeFile(file, transformed[key]);
console.log(JSON.stringify({ apply: true, prodBucket: PROD_BUCKET, summary }, null, 2));
