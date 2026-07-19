const api = String(process.env.API_BASE || '').replace(/\/+$/, '');
const token = String(process.env.ADMIN_TOKEN || '').trim();
if (!api) throw new Error('API_BASE is missing.');
if (!token) throw new Error('STASHBOX_DEV_ADMIN_TOKEN is missing.');

async function request(pathname) {
  const response = await fetch(`${api}${pathname}`, {
    headers: { accept: 'application/json', 'x-admin-token': token }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${body?.error || text || 'Unknown error'}`);
  return body;
}

const songsBody = await request('/admin/songs');
const songs = Array.isArray(songsBody?.songs) ? songsBody.songs : Array.isArray(songsBody) ? songsBody : [];
const song = songs.find(item => /dub\s*reggae\s*0?1/i.test(`${item.song_key || ''} ${item.display_title || ''} ${item.song_name || ''}`));
if (!song) throw new Error('DUB REGGAE 01 was not found.');

const songKey = encodeURIComponent(song.song_key);
const vecRecipe = await request(`/admin/vec/recipe?song_key=${songKey}`);
const visualSettings = await request(`/admin/songs/${songKey}/visual-settings`);

console.log('DUB_VEC_RECIPE=' + JSON.stringify({
  song: {
    song_key: song.song_key,
    title: song.display_title || song.song_name,
    artist: song.artist
  },
  found: vecRecipe?.found,
  recipe: vecRecipe?.recipe,
  source_controller: {
    folder_mapping_count: Array.isArray(visualSettings?.folder_mappings) ? visualSettings.folder_mappings.length : 0,
    eligible_asset_count: Array.isArray(visualSettings?.eligible_assets) ? visualSettings.eligible_assets.length : 0,
    fallback: visualSettings?.fallback
  }
}));
