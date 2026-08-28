(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const ARTISTS_URL = `${env.apiBase}/radio/admin/artists`;
  const SONG_STATS_URL = `${env.apiBase}/admin/stats/songs?limit=500`;

  const els = {
    token: document.getElementById('adminToken'), saveToken: document.getElementById('saveToken'), clearToken: document.getElementById('clearToken'), tokenStatus: document.getElementById('tokenStatus'), refresh: document.getElementById('refreshArtists'), message: document.getElementById('artistMessage'), stats: document.getElementById('artistStats'), search: document.getElementById('artistSearch'), count: document.getElementById('artistCount'), body: document.getElementById('artistsBody'),
    newArtist: document.getElementById('newArtist'), editorCard: document.getElementById('artistEditorCard'), editorHeading: document.getElementById('artistEditorHeading'), editor: document.getElementById('artistEditor'),
    name: document.getElementById('artistName'), key: document.getElementById('artistKey'), slug: document.getElementById('artistSlug'), sortName: document.getElementById('artistSortName'), status: document.getElementById('artistStatus'), location: document.getElementById('artistLocation'), profileImageUrl: document.getElementById('profileImageUrl'), bannerImageUrl: document.getElementById('bannerImageUrl'), bio: document.getElementById('artistBio'), websiteUrl: document.getElementById('websiteUrl'), merchUrl: document.getElementById('merchUrl'), spotifyUrl: document.getElementById('spotifyUrl'), appleMusicUrl: document.getElementById('appleMusicUrl'), youtubeUrl: document.getElementById('youtubeUrl'), instagramUrl: document.getElementById('instagramUrl'), xUrl: document.getElementById('xUrl'), facebookUrl: document.getElementById('facebookUrl'), notes: document.getElementById('artistNotes'), verified: document.getElementById('artistVerified'), featured: document.getElementById('artistFeatured'), saveArtist: document.getElementById('saveArtist'), cancelArtist: document.getElementById('cancelArtist')
  };

  let artists = [];
  let performance = new Map();
  let selectedKey = '';

  function getToken() {
    const direct = localStorage.getItem(env.tokenStorageKey);
    if (direct) return String(direct).trim();
    for (const key of env.legacyTokenStorageKeys || []) {
      const value = localStorage.getItem(key);
      if (value) return String(value).trim();
    }
    return '';
  }

  function updateTokenStatus() {
    const token = getToken();
    els.token.value = token;
    els.tokenStatus.textContent = token ? 'DEV admin token available.' : 'No DEV admin token saved.';
  }

  async function apiRequest(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const artistBoundary = url === ARTISTS_URL || url.startsWith(`${ARTISTS_URL}/`);
    const statsBoundary = url === SONG_STATS_URL;
    if (!url.startsWith(env.apiBase) || (!artistBoundary && !statsBoundary)) throw new Error('Blocked request outside the DEV Artist API boundary.');
    if (!['GET', 'HEAD'].includes(method)) {
      if (!artistBoundary) throw new Error('Blocked write outside the DEV Artist profile API boundary.');
      migration.assertWriteAllowed('dev', 'artists');
    }
    const token = getToken();
    if (!token) throw new Error('Save a DEV admin token first.');
    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        'x-admin-token': token,
        'accept': 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      cache: method === 'GET' ? 'no-store' : undefined,
      credentials: 'omit'
    });
    const text = await response.text();
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { error: text }; }
    }
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch {}
    }
    if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    return body;
  }

  function normName(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function number(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
  function aggregatePerformance(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = normName(row.artist); if (!key) continue;
      const current = map.get(key) || { likes: 0, shares: 0, seconds: 0 };
      current.likes += number(row.likes ?? row.total_likes ?? row.like_count);
      current.shares += number(row.shares ?? row.total_shares ?? row.share_count);
      current.seconds += number(row.total_seconds_played ?? row.total_seconds);
      map.set(key, current);
    }
    return map;
  }
  function performanceFor(artist) { return performance.get(normName(artist?.name)) || { likes: 0, shares: 0, seconds: 0 }; }
  function listening(seconds) {
    const total = Math.max(0, Math.round(number(seconds)));
    if (total >= 86400) return `${Math.floor(total / 86400)}d ${Math.floor((total % 86400) / 3600)}h`;
    if (total >= 3600) return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
    if (total >= 60) return `${Math.floor(total / 60)}m ${total % 60}s`;
    return `${total}s`;
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }

  function renderStats() {
    const totals = artists.reduce((acc, artist) => {
      const p = performanceFor(artist); acc.followers += number(artist.follower_count); acc.likes += p.likes; acc.shares += p.shares; acc.seconds += p.seconds; return acc;
    }, { followers: 0, likes: 0, shares: 0, seconds: 0 });
    const cards = [['Artists', artists.length.toLocaleString()], ['Published', artists.filter(a => a.status === 'published').length.toLocaleString()], ['Followers', totals.followers.toLocaleString()], ['Likes', totals.likes.toLocaleString()], ['Shares', totals.shares.toLocaleString()], ['Listening', listening(totals.seconds)]];
    els.stats.innerHTML = cards.map(([label, value]) => `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function renderArtists() {
    const q = String(els.search.value || '').trim().toLowerCase();
    const rows = q ? artists.filter(a => `${a.name || ''} ${a.artist_key || ''} ${a.slug || ''} ${a.status || ''}`.toLowerCase().includes(q)) : artists;
    els.count.textContent = `${rows.length.toLocaleString()} of ${artists.length.toLocaleString()} DEV artists shown`;
    if (!rows.length) { els.body.innerHTML = '<tr><td colspan="9" class="muted">No matching DEV artists.</td></tr>'; return; }
    els.body.innerHTML = rows.map(artist => {
      const p = performanceFor(artist); const image = String(artist.profile_image_url || '').trim(); const key = String(artist.artist_key || '');
      return `<tr><td><button class="secondary edit-artist" type="button" data-artist-key="${escapeHtml(key)}">Edit</button></td><td>${escapeHtml(artist.name || 'Untitled')}</td><td><code>${escapeHtml(key)}</code></td><td>${escapeHtml(artist.status || '—')}</td><td>${number(artist.follower_count).toLocaleString()}</td><td>${p.likes.toLocaleString()}</td><td>${p.shares.toLocaleString()}</td><td>${escapeHtml(listening(p.seconds))}</td><td>${/^https?:\/\//i.test(image) ? `<a href="${escapeHtml(image)}" target="_blank" rel="noopener">Open</a>` : '—'}</td></tr>`;
    }).join('');
  }

  async function load() {
    els.refresh.disabled = true; els.message.textContent = 'Loading DEV artist profiles…';
    try {
      const [artistData, songData] = await Promise.all([apiRequest(ARTISTS_URL), apiRequest(SONG_STATS_URL)]);
      artists = Array.isArray(artistData?.artists) ? artistData.artists : [];
      performance = aggregatePerformance(songData?.songs || []);
      renderStats(); renderArtists();
      els.message.textContent = `Loaded ${artists.length} DEV artist profile${artists.length === 1 ? '' : 's'}. Metadata writes are DEV-only.`;
    } catch (error) {
      artists = []; performance = new Map(); els.stats.innerHTML = ''; els.body.innerHTML = '<tr><td colspan="9" class="muted">DEV Artist load failed.</td></tr>'; els.count.textContent = ''; els.message.textContent = `DEV Artist load failed: ${error.message}`;
    } finally { els.refresh.disabled = false; updateTokenStatus(); }
  }

  function fillEditor(artist = {}) {
    els.name.value = artist.name || ''; els.key.value = artist.artist_key || ''; els.slug.value = artist.slug || ''; els.sortName.value = artist.sort_name || ''; els.status.value = artist.status || 'draft'; els.location.value = artist.location || ''; els.profileImageUrl.value = artist.profile_image_url || ''; els.bannerImageUrl.value = artist.banner_image_url || ''; els.bio.value = artist.bio || ''; els.websiteUrl.value = artist.website_url || ''; els.merchUrl.value = artist.merch_url || ''; els.spotifyUrl.value = artist.spotify_url || ''; els.appleMusicUrl.value = artist.apple_music_url || ''; els.youtubeUrl.value = artist.youtube_url || ''; els.instagramUrl.value = artist.instagram_url || ''; els.xUrl.value = artist.x_url || ''; els.facebookUrl.value = artist.facebook_url || ''; els.notes.value = artist.notes || ''; els.verified.checked = Boolean(artist.verified); els.featured.checked = Boolean(artist.featured);
  }

  function showSavedArtistInEditor(artist = {}, fallbackKey = '') {
    const key = String(artist.artist_key || fallbackKey || '').trim();
    if (!key) { closeEditor(); return; }
    selectedKey = key;
    fillEditor({ ...artist, artist_key: key });
    els.key.disabled = true;
    els.editorHeading.textContent = `Edit DEV Artist: ${artist.name || key}`;
    els.saveArtist.textContent = 'Save DEV Artist Changes';
    els.editorCard.classList.remove('hidden');
  }

  async function openEditor(key = '') {
    selectedKey = String(key || '');
    if (!selectedKey) {
      fillEditor({ status: 'draft' });
      els.key.disabled = false;
      els.editorHeading.textContent = 'New DEV Artist';
      els.saveArtist.textContent = 'Create DEV Artist';
      els.editorCard.classList.remove('hidden');
      return;
    }
    els.message.textContent = `Loading DEV artist ${selectedKey}…`;
    try {
      const data = await apiRequest(`${ARTISTS_URL}/${encodeURIComponent(selectedKey)}`);
      const artist = data?.artist || artists.find(item => String(item.artist_key) === selectedKey) || {};
      showSavedArtistInEditor(artist, selectedKey);
      els.message.textContent = `Editing DEV artist ${selectedKey}.`;
    } catch (error) {
      els.message.textContent = `DEV Artist load failed: ${error.message}`;
    }
  }

  function closeEditor() { selectedKey = ''; els.key.disabled = false; els.editorCard.classList.add('hidden'); }

  function payload() {
    const data = {
      name: String(els.name.value || '').trim(), artist_key: String(els.key.value || selectedKey || '').trim(), slug: String(els.slug.value || '').trim(), sort_name: String(els.sortName.value || '').trim(), status: els.status.value || 'draft', location: String(els.location.value || '').trim(), profile_image_url: String(els.profileImageUrl.value || '').trim(), banner_image_url: String(els.bannerImageUrl.value || '').trim(), bio: String(els.bio.value || '').trim(), website_url: String(els.websiteUrl.value || '').trim(), merch_url: String(els.merchUrl.value || '').trim(), spotify_url: String(els.spotifyUrl.value || '').trim(), apple_music_url: String(els.appleMusicUrl.value || '').trim(), youtube_url: String(els.youtubeUrl.value || '').trim(), instagram_url: String(els.instagramUrl.value || '').trim(), x_url: String(els.xUrl.value || '').trim(), facebook_url: String(els.facebookUrl.value || '').trim(), notes: String(els.notes.value || '').trim(), verified: Boolean(els.verified.checked), featured: Boolean(els.featured.checked)
    };
    if (!data.name) throw new Error('Artist Name is required.');
    if (!data.artist_key) throw new Error('Artist Key is required.');
    return data;
  }

  async function saveArtist(event) {
    event.preventDefault();
    let data;
    try { data = payload(); } catch (error) { els.message.textContent = error.message; return; }
    const isCreate = !selectedKey;
    const url = isCreate ? ARTISTS_URL : `${ARTISTS_URL}/${encodeURIComponent(selectedKey)}`;
    els.saveArtist.disabled = true;
    els.message.textContent = isCreate ? 'Creating DEV artist…' : `Saving DEV artist ${selectedKey}…`;
    try {
      const result = await apiRequest(url, { method: isCreate ? 'POST' : 'PATCH', body: JSON.stringify(data) });
      const saved = result?.artist || data;
      const savedKey = String(saved.artist_key || data.artist_key || selectedKey);
      showSavedArtistInEditor(saved, savedKey);
      await load();
      els.message.textContent = isCreate ? 'DEV artist created.' : 'DEV artist metadata saved.';
    } catch (error) {
      els.message.textContent = `DEV Artist save failed: ${error.message}`;
    } finally { els.saveArtist.disabled = false; }
  }

  els.saveToken.addEventListener('click', () => { const value = String(els.token.value || '').trim(); if (value) localStorage.setItem(env.tokenStorageKey, value); else localStorage.removeItem(env.tokenStorageKey); updateTokenStatus(); load(); });
  els.clearToken.addEventListener('click', () => { localStorage.removeItem(env.tokenStorageKey); els.token.value = ''; updateTokenStatus(); });
  els.refresh.addEventListener('click', load);
  els.search.addEventListener('input', renderArtists);
  els.newArtist.addEventListener('click', () => openEditor());
  els.cancelArtist.addEventListener('click', closeEditor);
  els.editor.addEventListener('submit', saveArtist);
  els.body.addEventListener('click', event => { const button = event.target.closest('.edit-artist'); if (button) openEditor(button.dataset.artistKey); });

  updateTokenStatus();
  if (getToken()) load();
})();
