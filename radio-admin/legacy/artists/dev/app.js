(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const SONG_STATS_URL = `${API_ROOT}/admin/stats/songs?limit=500`;
  const UPLOAD_PRESIGN_URL = `${API_ROOT}/admin/uploads/presign`;
  const STANDARD_ADMIN_TOKEN_KEY = 'stashbox_admin_token_dev';
  const LEGACY_ADMIN_TOKEN_KEY = 'stashbox-radio-admin-token-dev';
  const ACCOUNT_TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK_ART = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const state = { artists: [], selected: null, access: [], mode: '', search: '', performance: new Map() };
  const el = id => document.getElementById(id);

  function accountTokens() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function adminToken() {
    return localStorage.getItem(STANDARD_ADMIN_TOKEN_KEY)
      || localStorage.getItem(LEGACY_ADMIN_TOKEN_KEY)
      || '';
  }

  function saveAdminToken(value) {
    const token = String(value || '').trim();
    if (!token) return;
    localStorage.setItem(STANDARD_ADMIN_TOKEN_KEY, token);
    localStorage.setItem(LEGACY_ADMIN_TOKEN_KEY, token);
  }

  function clearAdminToken() {
    localStorage.removeItem(STANDARD_ADMIN_TOKEN_KEY);
    localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  }

  function headers(json = false) {
    const result = {};
    const admin = adminToken();
    if (admin) {
      result['x-admin-token'] = admin;
    } else {
      const tokens = accountTokens();
      if (tokens.accessToken) result.Authorization = `Bearer ${tokens.accessToken}`;
      if (tokens.idToken) result['X-Cognito-Id-Token'] = tokens.idToken;
    }
    if (json) result['Content-Type'] = 'application/json';
    return result;
  }

  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        ...options,
        headers: {
          ...headers(Boolean(options.body)),
          ...(options.headers || {})
        }
      });
    } catch (_) {
      throw new Error('Could not reach the Stashbox Radio DEV API from this browser.');
    }
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  function show(message, error = false) {
    const box = el('message');
    box.textContent = message;
    box.classList.toggle('hidden', !message);
    box.classList.toggle('error', error);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[c]));
  }

  function fill(id, value = '') { el(id).value = value ?? ''; }
  function checked(id, value) { el(id).checked = Boolean(value); }
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; }
  function normalizeArtistName(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function slugify(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist'; }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(number(totalSeconds)));
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function performanceForArtist(artist) {
    return state.performance.get(normalizeArtistName(artist?.name)) || { total_likes: 0, total_shares: 0, total_listening_seconds: 0 };
  }

  function aggregatePerformance(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = normalizeArtistName(row.artist);
      if (!key) return;
      const current = map.get(key) || { total_likes: 0, total_shares: 0, total_listening_seconds: 0 };
      current.total_likes += number(row.likes ?? row.total_likes ?? row.like_count);
      current.total_shares += number(row.shares ?? row.total_shares ?? row.share_count);
      current.total_listening_seconds += number(row.total_seconds_played ?? row.total_seconds);
      map.set(key, current);
    });
    return map;
  }

  async function loadPerformanceStats() {
    try {
      const data = await api(SONG_STATS_URL);
      state.performance = aggregatePerformance(data.songs || []);
    } catch (error) {
      console.warn('[Artist CMS] performance stats unavailable', error);
      state.performance = new Map();
    }
  }

  function renderStats() {
    const published = state.artists.filter(artist => artist.status === 'published').length;
    const totals = state.artists.reduce((summary, artist) => {
      const performance = performanceForArtist(artist);
      summary.followers += number(artist.follower_count);
      summary.likes += number(performance.total_likes);
      summary.shares += number(performance.total_shares);
      summary.seconds += number(performance.total_listening_seconds);
      return summary;
    }, { followers: 0, likes: 0, shares: 0, seconds: 0 });
    const cards = [
      ['Accessible Artists', state.artists.length],
      ['Published', published],
      ['Total Followers', totals.followers],
      ['Total Likes', totals.likes],
      ['Total Shares', totals.shares],
      ['Total Listening Time', formatDuration(totals.seconds), true]
    ];
    el('stats').innerHTML = cards.map(([label, value, formatted]) => `<div class="stat">${escapeHtml(label)}<strong>${formatted ? escapeHtml(value) : Number(value).toLocaleString()}</strong></div>`).join('');
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

  function setUploadStatus(kind, message = '', error = false) {
    const status = el(`${kind}ImageStatus`);
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function renderImagePreview(kind, url = '', dimensions = null) {
    const preview = el(`${kind}ImagePreview`);
    const dimension = el(`${kind}ImageDimensions`);
    preview.innerHTML = '';
    if (!url) {
      preview.innerHTML = `<span>No ${kind} image</span>`;
      dimension.textContent = '';
      return;
    }
    const image = new Image();
    image.alt = `${kind === 'profile' ? 'Profile' : 'Banner'} preview`;
    image.src = url;
    image.onload = () => { dimension.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`; };
    image.onerror = () => { preview.innerHTML = '<span>Image preview unavailable</span>'; dimension.textContent = ''; };
    preview.appendChild(image);
    if (dimensions) dimension.textContent = `${dimensions.width} × ${dimensions.height} px`;
  }

  function populateForm(artist = {}) {
    state.selected = artist.id ? artist : null;
    el('editorTitle').textContent = artist.id ? artist.name : 'New Artist';
    fill('artistId', artist.id); fill('name', artist.name); fill('artistKey', artist.artist_key); fill('slug', artist.slug); fill('sortName', artist.sort_name);
    fill('status', artist.status || 'draft'); fill('location', artist.location); fill('profileImageUrl', artist.profile_image_url); fill('bannerImageUrl', artist.banner_image_url);
    fill('bio', artist.bio); fill('websiteUrl', artist.website_url); fill('merchUrl', artist.merch_url); fill('spotifyUrl', artist.spotify_url); fill('appleMusicUrl', artist.apple_music_url);
    fill('youtubeUrl', artist.youtube_url); fill('instagramUrl', artist.instagram_url); fill('xUrl', artist.x_url); fill('facebookUrl', artist.facebook_url); fill('notes', artist.notes);
    checked('verified', artist.verified); checked('featured', artist.featured);
    renderImagePreview('profile', artist.profile_image_url || '');
    renderImagePreview('banner', artist.banner_image_url || '');
    setUploadStatus('profile'); setUploadStatus('banner');
    const performance = performanceForArtist(artist);
    el('followerCount').textContent = Number(artist.follower_count || 0).toLocaleString();
    el('artistLikes').textContent = number(performance.total_likes).toLocaleString();
    el('artistShares').textContent = number(performance.total_shares).toLocaleString();
    el('artistListeningTime').textContent = formatDuration(performance.total_listening_seconds);
    const publicLink = el('publicProfileLink');
    if (artist.slug) {
      publicLink.href = `/radio/artists/dev/?artist=${encodeURIComponent(artist.slug)}`;
      publicLink.classList.remove('hidden');
    } else {
      publicLink.classList.add('hidden');
    }
    setEditorVisible(true);
    renderList();
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

  async function readImageDimensions(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('The selected image could not be read.'));
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function validateImage(file) {
    if (!file) return 'Choose an image first.';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use a JPG, PNG, or WEBP image.';
    if (file.size > MAX_IMAGE_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }

  async function uploadArtistImage(kind, file) {
    const validationError = validateImage(file);
    if (validationError) {
      setUploadStatus(kind, validationError, true);
      return;
    }
    if (!adminToken()) {
      setUploadStatus(kind, 'Image uploads require the saved DEV admin token.', true);
      return;
    }
    const artistName = el('name').value.trim();
    const artistKey = slugify(el('artistKey').value || el('slug').value || artistName);
    if (!artistName) {
      setUploadStatus(kind, 'Enter the artist name before uploading.', true);
      return;
    }
    const dimensions = await readImageDimensions(file);
    const recommended = kind === 'profile'
      ? { width: 1200, height: 1200 }
      : { width: 1920, height: 1080 };
    const isBelowRecommendation = dimensions.width < recommended.width || dimensions.height < recommended.height;

    setUploadStatus(kind, 'Requesting secure upload URL…');
    let presign;
    try {
      presign = await api(UPLOAD_PRESIGN_URL, {
        method: 'POST',
        body: JSON.stringify({
          song_key: `artist-${artistKey}-${kind}`,
          song_name: `${artistName} ${kind} image`,
          artist: artistName,
          purpose: 'artwork',
          filename: file.name,
          content_type: file.type
        })
      });
    } catch (error) {
      throw new Error(`Upload authorization failed: ${error.message}`);
    }

    const uploadUrl = presign.upload_url;
    const publicUrl = presign.public_url;
    if (!uploadUrl || !publicUrl) throw new Error('Upload authorization did not return the required URLs.');

    setUploadStatus(kind, 'Uploading image to DEV storage…');
    let uploadResponse;
    try {
      uploadResponse = await fetch(uploadUrl, {
        method: presign.method || 'PUT',
        mode: 'cors',
        credentials: 'omit',
        headers: presign.headers || { 'Content-Type': file.type },
        body: file
      });
    } catch (_) {
      throw new Error('The DEV storage upload was blocked before the file reached S3.');
    }
    if (!uploadResponse.ok) throw new Error(`DEV storage upload failed with status ${uploadResponse.status}.`);

    fill(`${kind}ImageUrl`, publicUrl);
    renderImagePreview(kind, publicUrl, dimensions);
    const warning = isBelowRecommendation
      ? ' Uploaded successfully, but the image is smaller than the recommended dimensions.'
      : ' Uploaded successfully.';
    setUploadStatus(kind, `${dimensions.width} × ${dimensions.height} px.${warning} Click Save Artist.`);
  }

  function clearArtistImage(kind) {
    fill(`${kind}ImageUrl`, '');
    el(`${kind}ImageFile`).value = '';
    renderImagePreview(kind, '');
    setUploadStatus(kind, 'Image removed from the profile form. Click Save Artist to confirm.');
  }

  function bindImageControls(kind) {
    const fileInput = el(`${kind}ImageFile`);
    el(`upload${kind[0].toUpperCase()}${kind.slice(1)}Image`).addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      uploadArtistImage(kind, file).catch(error => setUploadStatus(kind, error.message, true));
    });
    el(`delete${kind[0].toUpperCase()}${kind.slice(1)}Image`).addEventListener('click', () => clearArtistImage(kind));
  }

  async function loadArtists() {
    show('Loading artists…');
    const [data] = await Promise.all([api(ARTISTS_URL), loadPerformanceStats()]);
    state.artists = data.artists || [];
    state.mode = data.mode || '';
    show(`Loaded ${state.artists.length} artist profiles using ${state.mode === 'platform_admin' ? 'administrator' : 'assigned artist'} access.`);
    renderStats();
    renderList();
    if (state.selected?.artist_key) {
      const matching = state.artists.find(a => a.artist_key === state.selected.artist_key);
      if (matching) await selectArtist(matching.artist_key);
    }
  }

  async function selectArtist(key) {
    show('Loading artist profile…');
    const data = await api(`${ARTISTS_URL}/${encodeURIComponent(key)}`);
    state.selected = data.artist;
    populateForm(data.artist);
    await loadAccess();
    show(`Editing ${data.artist.name}. Catalog and performance are controlled by Song CMS.`);
  }

  async function loadAccess() {
    if (!state.selected) return;
    try {
      const data = await api(`${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}/access`);
      state.access = data.access || [];
      el('accessList').innerHTML = state.access.length
        ? state.access.map(row => `<div class="access-row"><div><strong>${escapeHtml(row.display_name || row.email || row.user_id)}</strong><span>${escapeHtml(row.email || '')}</span></div><div><strong>${escapeHtml(row.access_level)}</strong><span>${escapeHtml(row.status)}</span></div></div>`).join('')
        : '<p class="copy">No delegated access assignments yet.</p>';
    } catch (error) {
      state.access = [];
      el('accessList').innerHTML = `<p class="copy">Access assignments are visible only to Stashbox administrators. ${escapeHtml(error.message)}</p>`;
    }
  }

  el('adminToken').value = adminToken();
  el('saveToken').addEventListener('click', () => {
    saveAdminToken(el('adminToken').value);
    loadArtists().catch(error => show(error.message, true));
  });
  el('clearToken').addEventListener('click', () => {
    clearAdminToken();
    el('adminToken').value = '';
    loadArtists().catch(error => show(error.message, true));
  });
  el('newArtist').addEventListener('click', () => {
    state.access = [];
    populateForm({ status: 'draft' });
    el('accessList').innerHTML = '';
  });
  el('cancelEdit').addEventListener('click', () => {
    state.selected = null;
    setEditorVisible(false);
    el('editorTitle').textContent = 'Select an Artist';
    renderList();
  });
  el('search').addEventListener('input', event => {
    state.search = event.target.value;
    renderList();
  });
  el('artistList').addEventListener('click', event => {
    const button = event.target.closest('[data-artist]');
    if (button) selectArtist(button.dataset.artist).catch(error => show(error.message, true));
  });
  el('artistForm').addEventListener('submit', async event => {
    event.preventDefault();
    show('Saving artist…');
    try {
      const url = state.selected?.artist_key
        ? `${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}`
        : ARTISTS_URL;
      const data = await api(url, {
        method: state.selected ? 'PATCH' : 'POST',
        body: JSON.stringify(payload())
      });
      state.selected = data.artist;
      await loadArtists();
      await selectArtist(data.artist.artist_key);
      show(`${data.artist.name} saved.`);
    } catch (error) {
      show(error.message, true);
    }
  });
  el('grantAccess').addEventListener('click', async () => {
    if (!state.selected) return;
    show('Granting artist access…');
    try {
      await api(`${ARTISTS_URL}/${encodeURIComponent(state.selected.artist_key)}/access`, {
        method: 'POST',
        body: JSON.stringify({
          email: el('accessEmail').value,
          role: el('accessRole').value,
          access_level: el('accessLevel').value,
          status: 'approved'
        })
      });
      el('accessEmail').value = '';
      await loadAccess();
      show('Artist access granted.');
    } catch (error) {
      show(error.message, true);
    }
  });

  bindImageControls('profile');
  bindImageControls('banner');
  setEditorVisible(false);
  loadArtists().catch(error => show(`${error.message} Save the DEV admin token or sign in with an assigned account.`, true));
})();
