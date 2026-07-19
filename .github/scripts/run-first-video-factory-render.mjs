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

const key = encodeURIComponent(song.song_key);
const admin = await request(`/admin/songs/${key}/visual-settings`);
const player = await request(`/radio/songs/${key}/visual-settings`);
const folders = Array.isArray(admin?.folders) ? admin.folders : [];
const folderMappings = Array.isArray(admin?.folder_mappings) ? admin.folder_mappings : [];

console.log('DUB_VEC_DIAGNOSTIC=' + JSON.stringify({
  song: {
    song_key: song.song_key,
    title: song.display_title || song.song_name,
    artist: song.artist
  },
  order_mode: admin?.order_mode,
  folder_mappings: folderMappings,
  asset_mapping_count: Array.isArray(admin?.asset_mappings) ? admin.asset_mappings.length : 0,
  admin_eligible_asset_count: Array.isArray(admin?.eligible_assets) ? admin.eligible_assets.length : 0,
  player_eligible_asset_count: Array.isArray(player?.eligible_assets) ? player.eligible_assets.length : 0,
  fallback: player?.fallback,
  included_folders: folders.filter(folder => folder.inclusion_state === 'included').map(folder => ({
    id: folder.id,
    folder_name: folder.folder_name || folder.name,
    status: folder.status,
    inclusion_state: folder.inclusion_state,
    clip_count: folder.clip_count,
    image_count: folder.image_count,
    asset_count: Array.isArray(folder.assets) ? folder.assets.length : 0
  })),
  folders_with_clips: folders.filter(folder => Number(folder.clip_count || 0) > 0).map(folder => ({
    id: folder.id,
    folder_name: folder.folder_name || folder.name,
    status: folder.status,
    inclusion_state: folder.inclusion_state,
    clip_count: folder.clip_count,
    image_count: folder.image_count,
    relevant_songs: folder.relevant_songs,
    song_matches: folder.song_matches,
    matches: folder.matches
  })).slice(0, 50)
}));
