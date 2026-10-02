(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const ARTISTS_URL = `${env.apiBase}/radio/admin/artists`;
  const SONG_STATS_URL = `${env.apiBase}/admin/stats/songs?limit=500`;
  const DEV_MEDIA_BUCKET = 'stashbox-radio-media-dev-us-east-1';
  const PROD_MEDIA_BUCKET = 'stashbox-radio-media-prod-us-east-1';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  const els = {
    token: document.getElementById('adminToken'), saveToken: document.getElementById('saveToken'), clearToken: document.getElementById('clearToken'), tokenStatus: document.getElementById('tokenStatus'), refresh: document.getElementById('refreshArtists'), message: document.getElementById('artistMessage'), stats: document.getElementById('artistStats'), search: document.getElementById('artistSearch'), count: document.getElementById('artistCount'), body: document.getElementById('artistsBody'),
    newArtist: document.getElementById('newArtist'), editorCard: document.getElementById('artistEditorCard'), editorHeading: document.getElementById('artistEditorHeading'), editor: document.getElementById('artistEditor'),
    name: document.getElementById('artistName'), key: document.getElementById('artistKey'), slug: document.getElementById('artistSlug'), sortName: document.getElementById('artistSortName'), status: document.getElementById('artistStatus'), location: document.getElementById('artistLocation'), profileImageUrl: document.getElementById('profileImageUrl'), bannerImageUrl: document.getElementById('bannerImageUrl'), verticalBannerImageUrl: document.getElementById('verticalBannerImageUrl'), bio: document.getElementById('artistBio'), websiteUrl: document.getElementById('websiteUrl'), merchUrl: document.getElementById('merchUrl'), spotifyUrl: document.getElementById('spotifyUrl'), appleMusicUrl: document.getElementById('appleMusicUrl'), youtubeUrl: document.getElementById('youtubeUrl'), instagramUrl: document.getElementById('instagramUrl'), xUrl: document.getElementById('xUrl'), facebookUrl: document.getElementById('facebookUrl'), notes: document.getElementById('artistNotes'), verified: document.getElementById('artistVerified'), featured: document.getElementById('artistFeatured'), saveArtist: document.getElementById('saveArtist'), cancelArtist: document.getElementById('cancelArtist'),
    profileImageFile: document.getElementById('profileImageFile'), uploadProfileImage: document.getElementById('uploadProfileImage'), deleteProfileImage: document.getElementById('deleteProfileImage'), profileImageStatus: document.getElementById('profileImageStatus'),
    bannerImageFile: document.getElementById('bannerImageFile'), uploadBannerImage: document.getElementById('uploadBannerImage'), deleteBannerImage: document.getElementById('deleteBannerImage'), bannerImageStatus: document.getElementById('bannerImageStatus'),
    verticalBannerImageFile: document.getElementById('verticalBannerImageFile'), uploadVerticalBannerImage: document.getElementById('uploadVerticalBannerImage'), deleteVerticalBannerImage: document.getElementById('deleteVerticalBannerImage'), verticalBannerImageStatus: document.getElementById('verticalBannerImageStatus'),
    accessCard: document.getElementById('artistAccessCard'), accessMessage: document.getElementById('artistAccessMessage'), accessList: document.getElementById('artistAccessList'), accessEmail: document.getElementById('accessEmail'), accessRole: document.getElementById('accessRole'), accessLevel: document.getElementById('accessLevel'), grantAccess: document.getElementById('grantAccess')
  };

  const mediaConfig = {
    profile: { url: els.profileImageUrl, file: els.profileImageFile, upload: els.uploadProfileImage, remove: els.deleteProfileImage, status: els.profileImageStatus, purpose: 'profile_image', payload: 'profile_image_url', response: 'profile_image_url', label: 'profile image' },
    banner: { url: els.bannerImageUrl, file: els.bannerImageFile, upload: els.uploadBannerImage, remove: els.deleteBannerImage, status: els.bannerImageStatus, purpose: 'horizontal_banner', payload: 'horizontal_banner_image_url', response: 'horizontal_banner_image_url', label: 'horizontal banner' },
    verticalBanner: { url: els.verticalBannerImageUrl, file: els.verticalBannerImageFile, upload: els.uploadVerticalBannerImage, remove: els.deleteVerticalBannerImage, status: els.verticalBannerImageStatus, purpose: 'vertical_banner', payload: 'vertical_banner_image_url', response: 'vertical_banner_image_url', label: 'vertical banner' }
  };

  let artists = [];
  let performance = new Map();
  let selectedKey = '';
  let editorLoadSequence = 0;
  let accessLoadSequence = 0;
  let accessAssignments = [];

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
      if (!artistBoundary) throw new Error('Blocked write outside the DEV Artist API boundary.');
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
    if (!response.ok || body?.success === false) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
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
      els.message.textContent = `Loaded ${artists.length} DEV artist profile${artists.length === 1 ? '' : 's'}. Metadata, profile-media, and delegated-access writes are DEV-only.`;
    } catch (error) {
      artists = []; performance = new Map(); els.stats.innerHTML = ''; els.body.innerHTML = '<tr><td colspan="9" class="muted">DEV Artist load failed.</td></tr>'; els.count.textContent = ''; els.message.textContent = `DEV Artist load failed: ${error.message}`;
    } finally { els.refresh.disabled = false; updateTokenStatus(); }
  }

  function setMediaStatus(kind, message) {
    const config = mediaConfig[kind];
    if (config?.status) config.status.textContent = message;
  }

  function resetMediaStatuses() {
    setMediaStatus('profile', selectedKey ? 'Recommended: 1200 × 1200 px · ready for DEV upload.' : 'Save the artist before uploading profile media.');
    setMediaStatus('banner', selectedKey ? 'Recommended: 1920 × 1080 px · ready for DEV upload.' : 'Save the artist before uploading profile media.');
    setMediaStatus('verticalBanner', selectedKey ? 'Recommended: 1080 × 1920 px · ready for DEV upload.' : 'Save the artist before uploading profile media.');
  }

  function applyMedia(media = {}) {
    els.profileImageUrl.value = media.profile_image_url || '';
    els.bannerImageUrl.value = media.horizontal_banner_image_url || media.banner_image_url || '';
    els.verticalBannerImageUrl.value = media.vertical_banner_image_url || '';
  }

  function fillEditor(artist = {}) {
    els.name.value = artist.name || ''; els.key.value = artist.artist_key || ''; els.slug.value = artist.slug || ''; els.sortName.value = artist.sort_name || ''; els.status.value = artist.status || 'draft'; els.location.value = artist.location || ''; els.profileImageUrl.value = artist.profile_image_url || ''; els.bannerImageUrl.value = artist.banner_image_url || artist.horizontal_banner_image_url || ''; els.verticalBannerImageUrl.value = artist.vertical_banner_image_url || artist.verticalBannerImageUrl || ''; els.bio.value = artist.bio || ''; els.websiteUrl.value = artist.website_url || ''; els.merchUrl.value = artist.merch_url || ''; els.spotifyUrl.value = artist.spotify_url || ''; els.appleMusicUrl.value = artist.apple_music_url || ''; els.youtubeUrl.value = artist.youtube_url || ''; els.instagramUrl.value = artist.instagram_url || ''; els.xUrl.value = artist.x_url || ''; els.facebookUrl.value = artist.facebook_url || ''; els.notes.value = artist.notes || ''; els.verified.checked = Boolean(artist.verified); els.featured.checked = Boolean(artist.featured);
    Object.values(mediaConfig).forEach(config => { if (config.file) config.file.value = ''; });
    resetMediaStatuses();
  }

  function setEditorLoading(loading) {
    els.editor.querySelectorAll('input:not([readonly]), select, textarea').forEach(control => { control.disabled = Boolean(loading); });
    els.saveArtist.disabled = Boolean(loading);
    const mediaDisabled = Boolean(loading) || !selectedKey;
    Object.values(mediaConfig).forEach(config => {
      config.file.disabled = mediaDisabled;
      config.upload.disabled = mediaDisabled;
      config.remove.disabled = mediaDisabled;
    });
    els.cancelArtist.disabled = false;
  }

  function showSavedArtistInEditor(artist = {}, fallbackKey = '') {
    const key = String(artist.artist_key || fallbackKey || '').trim();
    if (!key) { closeEditor(); return; }
    selectedKey = key;
    fillEditor({ ...artist, artist_key: key });
    setEditorLoading(false);
    els.key.disabled = true;
    els.editorHeading.textContent = `Edit DEV Artist: ${artist.name || key}`;
    els.saveArtist.textContent = 'Save DEV Artist Changes';
    els.editorCard.classList.remove('hidden');
    resetMediaStatuses();
  }

  function mediaUrl(key) { return `${ARTISTS_URL}/${encodeURIComponent(key)}/media`; }
  function mediaPresignUrl(key) { return `${mediaUrl(key)}/presign`; }
  function accessUrl(key) { return `${ARTISTS_URL}/${encodeURIComponent(key)}/access`; }

  async function readMedia(key) {
    const result = await apiRequest(`${mediaUrl(key)}?verify=${Date.now()}`);
    return result?.media || {};
  }

  function renderAccess() {
    if (!els.accessList) return;
    if (!accessAssignments.length) {
      els.accessList.innerHTML = '<p class="muted">No delegated DEV access assignments yet.</p>';
      return;
    }
    els.accessList.innerHTML = `<table><thead><tr><th>Account</th><th>Access Level</th><th>Status</th></tr></thead><tbody>${accessAssignments.map(row => `<tr><td><strong>${escapeHtml(row.display_name || row.email || row.user_id || 'Account')}</strong><br><span class="muted">${escapeHtml(row.email || '')}</span></td><td>${escapeHtml(row.access_level || 'viewer')}</td><td>${escapeHtml(row.status || 'pending')}</td></tr>`).join('')}</tbody></table>`;
  }

  async function loadAccess(key) {
    const requestedKey = String(key || '').trim();
    const loadSequence = ++accessLoadSequence;
    if (!requestedKey) {
      accessAssignments = [];
      els.accessCard.classList.add('hidden');
      return;
    }
    els.accessCard.classList.remove('hidden');
    els.grantAccess.disabled = true;
    els.accessMessage.textContent = `Loading DEV access assignments for ${requestedKey}…`;
    try {
      const result = await apiRequest(accessUrl(requestedKey));
      if (loadSequence !== accessLoadSequence || selectedKey !== requestedKey) return;
      accessAssignments = Array.isArray(result?.access) ? result.access : [];
      renderAccess();
      els.accessMessage.textContent = `Loaded ${accessAssignments.length} DEV access assignment${accessAssignments.length === 1 ? '' : 's'}.`;
    } catch (error) {
      if (loadSequence !== accessLoadSequence || selectedKey !== requestedKey) return;
      accessAssignments = [];
      renderAccess();
      els.accessMessage.textContent = `DEV access load failed: ${error.message}`;
    } finally {
      if (loadSequence === accessLoadSequence && selectedKey === requestedKey) els.grantAccess.disabled = false;
    }
  }

  async function openEditor(key = '') {
    const requestedKey = String(key || '');
    const loadSequence = ++editorLoadSequence;
    selectedKey = requestedKey;
    if (!requestedKey) {
      accessLoadSequence += 1;
      accessAssignments = [];
      els.accessCard.classList.add('hidden');
      fillEditor({ status: 'draft' });
      setEditorLoading(false);
      els.key.disabled = false;
      els.editorHeading.textContent = 'New DEV Artist';
      els.saveArtist.textContent = 'Create DEV Artist';
      els.editorCard.classList.remove('hidden');
      resetMediaStatuses();
      return;
    }

    els.editorCard.classList.remove('hidden');
    els.accessCard.classList.remove('hidden');
    els.editorHeading.textContent = `Loading DEV Artist: ${requestedKey}`;
    els.message.textContent = `Loading DEV artist ${requestedKey}…`;
    setEditorLoading(true);
    try {
      const [data, media] = await Promise.all([
        apiRequest(`${ARTISTS_URL}/${encodeURIComponent(requestedKey)}`),
        readMedia(requestedKey)
      ]);
      if (loadSequence !== editorLoadSequence || selectedKey !== requestedKey) return;
      const artist = data?.artist || artists.find(item => String(item.artist_key) === requestedKey) || {};
      showSavedArtistInEditor(artist, requestedKey);
      applyMedia(media);
      Object.keys(mediaConfig).forEach(kind => setMediaStatus(kind, 'Profile media loaded and verified from DEV RDS.'));
      els.message.textContent = `Editing DEV artist ${requestedKey}.`;
      loadAccess(requestedKey);
    } catch (error) {
      if (loadSequence !== editorLoadSequence || selectedKey !== requestedKey) return;
      setEditorLoading(false);
      els.key.disabled = true;
      els.message.textContent = `DEV Artist load failed: ${error.message}`;
    }
  }

  function closeEditor() {
    editorLoadSequence += 1;
    accessLoadSequence += 1;
    selectedKey = '';
    accessAssignments = [];
    setEditorLoading(false);
    els.key.disabled = false;
    els.accessCard.classList.add('hidden');
    els.editorCard.classList.add('hidden');
  }

  function payload() {
    const data = {
      name: String(els.name.value || '').trim(), artist_key: String(els.key.value || selectedKey || '').trim(), slug: String(els.slug.value || '').trim(), sort_name: String(els.sortName.value || '').trim(), status: els.status.value || 'draft', location: String(els.location.value || '').trim(), profile_image_url: String(els.profileImageUrl.value || '').trim(), banner_image_url: String(els.bannerImageUrl.value || '').trim(), vertical_banner_image_url: String(els.verticalBannerImageUrl.value || '').trim(), bio: String(els.bio.value || '').trim(), website_url: String(els.websiteUrl.value || '').trim(), merch_url: String(els.merchUrl.value || '').trim(), spotify_url: String(els.spotifyUrl.value || '').trim(), apple_music_url: String(els.appleMusicUrl.value || '').trim(), youtube_url: String(els.youtubeUrl.value || '').trim(), instagram_url: String(els.instagramUrl.value || '').trim(), x_url: String(els.xUrl.value || '').trim(), facebook_url: String(els.facebookUrl.value || '').trim(), notes: String(els.notes.value || '').trim(), verified: Boolean(els.verified.checked), featured: Boolean(els.featured.checked)
    };
    if (!data.name) throw new Error('Artist Name is required.');
    if (!data.artist_key) throw new Error('Artist Key is required.');
    return data;
  }

  function validateImage(file) {
    if (!file) return 'Choose an image first.';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use a JPG, PNG, or WEBP image.';
    if (file.size > MAX_IMAGE_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }

  function assertDevMediaTarget(uploadUrl, publicUrl) {
    const joined = `${uploadUrl || ''} ${publicUrl || ''}`;
    if (joined.includes(PROD_MEDIA_BUCKET) || joined.includes('prod-v2')) {
      throw new Error('Blocked Artist upload because DEV presign returned a PROD media target.');
    }
    if (!joined.includes(DEV_MEDIA_BUCKET)) {
      throw new Error('Blocked Artist upload because DEV presign did not return the expected DEV media bucket.');
    }
  }

  async function persistAndVerifyMedia(kind, url) {
    const config = mediaConfig[kind];
    if (!selectedKey) throw new Error('Select an existing artist first.');
    const result = await apiRequest(mediaUrl(selectedKey), {
      method: 'PATCH',
      body: JSON.stringify({ [config.payload]: String(url || '').trim() })
    });
    const returned = String(result?.media?.[config.response] || '').trim();
    if (returned !== String(url || '').trim()) throw new Error(`The DEV API returned a different ${config.label} URL after saving.`);
    const fresh = await readMedia(selectedKey);
    const verified = String(fresh?.[config.response] || '').trim();
    if (verified !== String(url || '').trim()) throw new Error(`The ${config.label} did not survive a fresh DEV RDS read-back.`);
    applyMedia(fresh);
    return verified;
  }

  async function uploadArtistMedia(kind) {
    const config = mediaConfig[kind];
    if (!selectedKey) { setMediaStatus(kind, 'Save and select the artist before uploading profile media.'); return; }
    const file = config.file.files?.[0];
    const validationError = validateImage(file);
    if (validationError) { setMediaStatus(kind, validationError); return; }

    config.upload.disabled = true;
    config.remove.disabled = true;
    setMediaStatus(kind, 'Requesting secure DEV artist upload URL…');
    try {
      const presign = await apiRequest(mediaPresignUrl(selectedKey), {
        method: 'POST',
        body: JSON.stringify({ purpose: config.purpose, filename: file.name, content_type: file.type, size_bytes: file.size })
      });
      const uploadUrl = presign.upload_url || presign.uploadUrl;
      const publicUrl = presign.public_url || presign.publicUrl;
      if (!uploadUrl || !publicUrl) throw new Error('DEV media presign did not return upload_url and public_url.');
      assertDevMediaTarget(uploadUrl, publicUrl);

      setMediaStatus(kind, 'Uploading image to DEV media storage…');
      const put = await fetch(uploadUrl, {
        method: presign.method || 'PUT',
        mode: 'cors',
        credentials: 'omit',
        headers: presign.headers || { 'Content-Type': file.type },
        body: file
      });
      if (!put.ok) throw new Error(`DEV storage upload failed with status ${put.status}.`);

      config.url.value = publicUrl;
      setMediaStatus(kind, 'Upload complete. Saving and verifying DEV RDS…');
      await persistAndVerifyMedia(kind, publicUrl);
      setMediaStatus(kind, `DEV ${config.label} uploaded, saved, and verified.`);
    } catch (error) {
      setMediaStatus(kind, error.message || String(error));
    } finally {
      config.upload.disabled = false;
      config.remove.disabled = false;
    }
  }

  async function removeArtistMedia(kind) {
    const config = mediaConfig[kind];
    if (!selectedKey) { setMediaStatus(kind, 'Select an existing artist first.'); return; }
    config.upload.disabled = true;
    config.remove.disabled = true;
    setMediaStatus(kind, `Removing DEV ${config.label}…`);
    try {
      await persistAndVerifyMedia(kind, '');
      config.file.value = '';
      setMediaStatus(kind, `DEV ${config.label} removal verified in RDS.`);
    } catch (error) {
      setMediaStatus(kind, error.message || String(error));
    } finally {
      config.upload.disabled = false;
      config.remove.disabled = false;
    }
  }

  async function grantArtistAccess() {
    if (!selectedKey) return;
    const email = String(els.accessEmail.value || '').trim().toLowerCase();
    if (!email) { els.accessMessage.textContent = 'Account email is required.'; return; }
    els.grantAccess.disabled = true;
    els.accessMessage.textContent = `Granting DEV access to ${email}…`;
    try {
      const result = await apiRequest(accessUrl(selectedKey), {
        method: 'POST',
        body: JSON.stringify({
          email,
          role: els.accessRole.value,
          access_level: els.accessLevel.value,
          status: 'approved'
        })
      });
      accessAssignments = Array.isArray(result?.access) ? result.access : [];
      renderAccess();
      els.accessEmail.value = '';
      els.accessMessage.textContent = `DEV artist access granted to ${email}.`;
    } catch (error) {
      els.accessMessage.textContent = `DEV access grant failed: ${error.message}`;
    } finally {
      els.grantAccess.disabled = false;
    }
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
      els.message.textContent = isCreate ? 'DEV artist created. Media and access controls are now enabled.' : 'DEV artist metadata saved.';
      loadAccess(savedKey);
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
  els.uploadProfileImage.addEventListener('click', () => uploadArtistMedia('profile'));
  els.uploadBannerImage.addEventListener('click', () => uploadArtistMedia('banner'));
  els.uploadVerticalBannerImage.addEventListener('click', () => uploadArtistMedia('verticalBanner'));
  els.deleteProfileImage.addEventListener('click', () => removeArtistMedia('profile'));
  els.deleteBannerImage.addEventListener('click', () => removeArtistMedia('banner'));
  els.deleteVerticalBannerImage.addEventListener('click', () => removeArtistMedia('verticalBanner'));
  els.grantAccess.addEventListener('click', grantArtistAccess);
  els.body.addEventListener('click', event => { const button = event.target.closest('.edit-artist'); if (button) openEditor(button.dataset.artistKey); });

  updateTokenStatus();
  if (getToken()) load();
})();
