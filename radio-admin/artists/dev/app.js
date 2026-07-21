(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const ADMIN_TOKEN_KEY = 'stashbox-radio-admin-token-dev';
  const ACCOUNT_TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const state = { artists: [], selected: null, songs: [], access: [], mode: '', search: '' };
  const el = id => document.getElementById(id);

  function accountTokens() { try { return JSON.parse(localStorage.getItem(ACCOUNT_TOKEN_KEY) || 'null') || {}; } catch (_) { return {}; } }
  function headers(json = false) {
    const result = {};
    const admin = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
    const tokens = accountTokens();
    if (admin) result['x-admin-token'] = admin;
    if (tokens.accessToken) result.Authorization = `Bearer ${tokens.accessToken}`;
    if (tokens.idToken) result['X-Cognito-Id-Token'] = tokens.idToken;
    if (json) result['Content-Type'] = 'application/json';
    return result;
  }
  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }
  function show(message, error = false) { const box = el('message'); box.textContent = message; box.classList.toggle('hidden', !message); box.classList.toggle('error', error); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function fill(id, value = '') { el(id).value = value ?? ''; }
  function checked(id, value) { el(id).checked = Boolean(value); }

  function renderStats() {
    const totalFollowers = state.artists.reduce((sum, artist) => sum + Number(artist.follower_count || 0), 0);
    const totalSongs = state.artists.reduce((sum, artist) => sum + Number(artist.song_count || 0), 0);
    const published = state.artists.filter(artist => artist.status === 'published').length;
    el('stats').innerHTML = [
      ['Accessible Artists', state.artists.length], ['Published', published], ['Total Followers', totalFollowers], ['Assigned Songs', totalSongs]
    ].map(([label, value]) => `<div class="stat">${escapeHtml(label)}<strong>${Number(value).toLocaleString()}</strong></div>`).join('');
  }
  function renderList() {
    const query = state.search.toLowerCase();
    const rows = state.artists.filter(a => !query || `${a.name} ${a.artist_key} ${a.slug}`.toLowerCase().includes(query));
    el('artistList').innerHTML = rows.length ? rows.map(artist => `
      <button class="artist-item ${state.selected?.id === artist.id ? 'active' : ''}" type="button" data-artist="${escapeHtml(artist.artist_key)}">
        <img class="artist-thumb" src="${escapeHtml(artist.profile_image_url || FALLBACK_ART)}" alt="" onerror="this.src='${FALLBACK_ART}'">
        <span class="artist-copy"><strong>${escapeHtml(artist.name)}</strong><span>${escapeHtml(artist.artist_key)} · ${escapeHtml(artist.status || '')}</span></span>
        <span class="count-pill">${Number(artist.follower_count || 0).toLocaleString()} followers</span>
      </button>`).join('') : '<div class="empty">No artists match this search.</div>';
  }
  function setEditorVisible(visible) {
    el('artistForm').classList.toggle('hidden', !visible);
    el('emptyEditor').classList.toggle('hidden', visible);
    el('artistTools').classList.toggle('hidden', !visible || !state.selected?.id);
  }
  function populateForm(artist = {}) {
    state.selected = artist.id ? artist : null;
    el('editorTitle').textContent = artist.id ? artist.name : 'New Artist';
    fill('artistId', artist.id); fill('name', artist.name); fill('artistKey', artist.artist_key); fill('slug', artist.slug); fill('sortName', artist.sort_name);
    fill('status', artist.status || 'draft'); fill('location', artist.location); fill('profileImageUrl', artist.profile_image_url); fill('bannerImageUrl', artist.banner_image_url);
    fill('bio', artist.bio); fill('websiteUrl', artist.website_url); fill('merchUrl', artist.merch_url); fill('spotifyUrl', artist.spotify_url); fill('appleMusicUrl', artist.apple_music_url);
    fill('youtubeUrl', artist.youtube_url); fill('instagramUrl', artist.instagram_url); fill('xUrl', artist.x_url); fill('facebookUrl', artist.facebook_url); fill('notes', artist.notes);
    checked('verified', artist.verified); checked('featured', artist.featured);
    el('followerCount').textContent = Number(artist.follower_count || 0).toLocaleString();
    el('songCount').textContent = `${Number(artist.song_count || 0)} songs`;
    const publicLink = el('publicProfileLink');
    if (artist.slug) { publicLink.href = `/radio/artists/dev/?artist=${encodeURIComponent(artist.slug)}`; publicLink.classList.remove('hidden'); } else publicLink.classList.add('hidden');
    setEditorVisible(true); renderList();
  }
  function payload() {
    return {
      name: el('name').value, artist_key: el('artistKey').value, slug: el('slug').value, sort_name: el('sortName').value,
      status: el('status').value, location: el('location').value, profile_image_url: el('profileImageUrl').value, banner_image_url: el('bannerImageUrl').value,
      bio: el('bio').value, website_url: el('websiteUrl').value, merch_url: el('merchUrl').value, spotify_url: el('spotifyUrl').value,
      apple_music_url: el('appleMusicUrl').value, youtube_url: el('youtubeUrl').value, instagram_url: el('instagramUrl').value,
      x_url: el('xUrl').value, facebook_url: el('facebookUrl').value, notes: el('notes').value, verified: el('verified').checked, featured: el('featured').checked
    };
  }
  async function loadArtists() {
    show('Loading artists…');
    const data = await api(ARTISTS_URL);
    state.artists = data.artists || []; state.mode = data.mode || '';
    show(`Loaded ${state.artists.length} artist profiles using ${state.mode === 'platform_admin' ? 'administrator' : 'assigned artist'} access.`);
    renderStats(); renderList();
    if (state.selected?.artist_key) {
      const matching = state.artists.find(a => a.artist_key === state.selected.artist_key);
      if (matching) await selectArtist(matching.artist_key);
    }
  }
  async function selectArtist(key) {
    show('Loading artist profile…');
    const data = await api(`${ARTISTS_URL}/${encodeURIComponent(key)}`);
    state.selected = data.artist; state.songs = data.songs || [];
    populateForm(data.artist);
    el('songKeys').value = state.songs.map(song => song.song_key).join('\n');
    await loadAccess();
    show(`Editing ${data.artist.name}.`);
  }
  async function loadAccess() {
    if (!state.selected) return;
    try {
      const data = await api(`${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}/access`);
      state.access = data.access || [];
      el('accessList').innerHTML = state.access.length ? state.access.map(row => `<div class="access-row"><div><strong>${escapeHtml(row.display_name || row.email || row.user_id)}</strong><span>${escapeHtml(row.email || '')}</span></div><div><strong>${escapeHtml(row.access_level)}</strong><span>${escapeHtml(row.status)}</span></div></div>`).join('') : '<p class="copy">No delegated access assignments yet.</p>';
    } catch (error) {
      state.access = []; el('accessList').innerHTML = `<p class="copy">Access assignments are visible only to Stashbox administrators. ${escapeHtml(error.message)}</p>`;
    }
  }

  el('adminToken').value = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  el('saveToken').addEventListener('click', () => { localStorage.setItem(ADMIN_TOKEN_KEY, el('adminToken').value.trim()); loadArtists().catch(error => show(error.message, true)); });
  el('clearToken').addEventListener('click', () => { localStorage.removeItem(ADMIN_TOKEN_KEY); el('adminToken').value = ''; loadArtists().catch(error => show(error.message, true)); });
  el('newArtist').addEventListener('click', () => { state.songs = []; state.access = []; populateForm({ status: 'draft' }); el('songKeys').value = ''; el('accessList').innerHTML = ''; });
  el('cancelEdit').addEventListener('click', () => { state.selected = null; setEditorVisible(false); el('editorTitle').textContent = 'Select an Artist'; renderList(); });
  el('search').addEventListener('input', event => { state.search = event.target.value; renderList(); });
  el('artistList').addEventListener('click', event => { const button = event.target.closest('[data-artist]'); if (button) selectArtist(button.dataset.artist).catch(error => show(error.message, true)); });
  el('artistForm').addEventListener('submit', async event => {
    event.preventDefault(); show('Saving artist…');
    try {
      const url = state.selected?.artist_key ? `${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}` : ARTISTS_URL;
      const data = await api(url, { method: state.selected ? 'PATCH' : 'POST', body: JSON.stringify(payload()) });
      state.selected = data.artist; await loadArtists(); await selectArtist(data.artist.artist_key); show(`${data.artist.name} saved.`);
    } catch (error) { show(error.message, true); }
  });
  el('saveSongs').addEventListener('click', async () => {
    if (!state.selected) return; show('Saving song assignments…');
    try {
      const songKeys = el('songKeys').value.split(/[,\n]/).map(v => v.trim()).filter(Boolean);
      const data = await api(`${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}/songs`, { method: 'PUT', body: JSON.stringify({ song_keys: songKeys, replace: true, artist_role: 'primary' }) });
      state.songs = data.songs || []; state.selected.song_count = state.songs.length; el('songCount').textContent = `${state.songs.length} songs`; show('Song assignments saved.');
    } catch (error) { show(error.message, true); }
  });
  el('grantAccess').addEventListener('click', async () => {
    if (!state.selected) return; show('Granting artist access…');
    try {
      await api(`${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}/access`, { method: 'POST', body: JSON.stringify({ email: el('accessEmail').value, role: el('accessRole').value, access_level: el('accessLevel').value, status: 'approved' }) });
      el('accessEmail').value = ''; await loadAccess(); show('Artist access granted.');
    } catch (error) { show(error.message, true); }
  });

  setEditorVisible(false);
  loadArtists().catch(error => show(`${error.message} Save the DEV admin token or sign in with an assigned account.`, true));
})();
