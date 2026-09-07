(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const ADS_URL = `${env.apiBase}/admin/ads`;
  const SETTINGS_URL = `${env.apiBase}/admin/ad-settings`;
  const UPLOAD_PRESIGN_URL = `${env.apiBase}/admin/uploads/presign`;
  const DEV_MEDIA_BUCKET = 'stashbox-radio-media-dev-us-east-1';
  const PROD_MEDIA_BUCKET = 'stashbox-radio-media-prod-us-east-1';

  const els = {
    token: document.getElementById('adminToken'), saveToken: document.getElementById('saveToken'), clearToken: document.getElementById('clearToken'), tokenStatus: document.getElementById('tokenStatus'),
    refresh: document.getElementById('refreshAds'), message: document.getElementById('adsMessage'), settings: document.getElementById('settingsGrid'), search: document.getElementById('adSearch'), count: document.getElementById('adCount'), body: document.getElementById('adsBody'),
    adsEnabled: document.getElementById('adsEnabled'), breakMethod: document.getElementById('breakMethod'), adsPerBreak: document.getElementById('adsPerBreak'), targetAdSeconds: document.getElementById('targetAdSeconds'), breakInterval: document.getElementById('breakInterval'), saveAdSettings: document.getElementById('saveAdSettings'),
    newAd: document.getElementById('newAd'), editorCard: document.getElementById('adEditorCard'), editorHeading: document.getElementById('adEditorHeading'), editor: document.getElementById('adEditor'),
    title: document.getElementById('adTitle'), type: document.getElementById('adType'), description: document.getElementById('adDescription'), videoUrl: document.getElementById('adVideoUrl'), videoFile: document.getElementById('adVideoFile'), uploadVideo: document.getElementById('uploadAdVideo'), uploadStatus: document.getElementById('adVideoUploadStatus'), clickUrl: document.getElementById('adClickUrl'), ratio: document.getElementById('adRatio'), frequency: document.getElementById('adFrequency'), skipSeconds: document.getElementById('adSkipSeconds'), startDate: document.getElementById('adStartDate'), endDate: document.getElementById('adEndDate'), noSkipping: document.getElementById('adNoSkipping'), active: document.getElementById('adActive'), hidden: document.getElementById('adHidden'), genre: document.getElementById('adGenreTargeting'), mood: document.getElementById('adMoodTargeting'), artist: document.getElementById('adArtistTargeting'), song: document.getElementById('adSongTargeting'), notes: document.getElementById('adNotes'), saveAd: document.getElementById('saveAd'), cancelAd: document.getElementById('cancelAd'), deleteAd: document.getElementById('deleteAd')
  };

  let ads = [];
  let settings = defaultSettings();
  let selectedId = '';

  function defaultSettings() {
    return { ads_enabled: true, break_method: 'count', ads_per_break: 1, target_ad_seconds: 30, break_interval: 1 };
  }

  function getToken() {
    const current = localStorage.getItem(env.tokenStorageKey);
    if (current) return String(current).trim();
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
    const allowed = url === ADS_URL || url.startsWith(`${ADS_URL}/`) || url === SETTINGS_URL || url === UPLOAD_PRESIGN_URL;
    if (!url.startsWith(env.apiBase) || !allowed) throw new Error('Blocked request outside the DEV Ads API boundary.');
    if (!['GET', 'HEAD'].includes(method)) migration.assertWriteAllowed('dev', 'ads');
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
      cache: method === 'GET' ? 'no-store' : undefined
    });
    const text = await response.text();
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
    }
    if (typeof body?.body === 'string') {
      try { body = JSON.parse(body.body); } catch {}
    }
    if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    return body;
  }

  function normalizeAds(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.ads)) return payload.ads;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  function normalizeSettings(payload) {
    const source = payload?.settings && typeof payload.settings === 'object' ? payload.settings : (payload || {});
    const defaults = defaultSettings();
    return {
      ads_enabled: Object.prototype.hasOwnProperty.call(source, 'ads_enabled') ? Boolean(source.ads_enabled) : defaults.ads_enabled,
      break_method: ['count', 'seconds'].includes(source.break_method) ? source.break_method : defaults.break_method,
      ads_per_break: [1,2,3,4,5].includes(Number(source.ads_per_break)) ? Number(source.ads_per_break) : defaults.ads_per_break,
      target_ad_seconds: [15,30,45,60,90].includes(Number(source.target_ad_seconds)) ? Number(source.target_ad_seconds) : defaults.target_ad_seconds,
      break_interval: [1,2,3].includes(Number(source.break_interval)) ? Number(source.break_interval) : defaults.break_interval
    };
  }

  function yesNo(value) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' ? 'Yes' : 'No';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function renderSettings() {
    els.adsEnabled.value = String(settings.ads_enabled);
    els.breakMethod.value = settings.break_method;
    els.adsPerBreak.value = String(settings.ads_per_break);
    els.targetAdSeconds.value = String(settings.target_ad_seconds);
    els.breakInterval.value = String(settings.break_interval);
    const rows = [
      ['Ads enabled', yesNo(settings.ads_enabled)], ['Break method', settings.break_method], ['Ads per break', settings.ads_per_break], ['Target ad seconds', settings.target_ad_seconds], ['Break interval', settings.break_interval]
    ];
    els.settings.innerHTML = rows.map(([label, value]) => `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function renderAds() {
    const query = String(els.search.value || '').trim().toLowerCase();
    const filtered = query ? ads.filter(ad => [ad.internal_title, ad.description, ad.ad_type, ad.artist_targeting, ad.genre_targeting, ad.mood_targeting, ad.song_targeting, ad.ad_ratio_label].join(' ').toLowerCase().includes(query)) : ads;
    els.count.textContent = `${filtered.length.toLocaleString()} of ${ads.length.toLocaleString()} DEV RDS ads shown`;
    if (!filtered.length) {
      els.body.innerHTML = '<tr><td colspan="11" class="muted">No matching DEV RDS ads.</td></tr>';
      return;
    }
    els.body.innerHTML = filtered.map(ad => {
      const video = String(ad.video_url || '').trim();
      return `<tr>
        <td><button class="secondary edit-ad" type="button" data-ad-id="${escapeHtml(ad.id || '')}">Edit</button></td>
        <td>${escapeHtml(ad.internal_title || ad.public_title || 'Untitled')}</td><td>${escapeHtml(ad.ad_type || '—')}</td><td>${escapeHtml(ad.ad_ratio_label || ad.ad_ratio || '—')}</td><td>${escapeHtml(yesNo(ad.active))}</td><td>${escapeHtml(yesNo(ad.hidden))}</td><td>${escapeHtml(ad.frequency || '—')}</td><td>${escapeHtml(ad.views ?? 0)}</td><td>${escapeHtml(ad.clicks ?? 0)}</td><td>${escapeHtml(ad.skips ?? 0)}</td><td>${/^https?:\/\//i.test(video) ? `<a href="${escapeHtml(video)}" target="_blank" rel="noopener">Open</a>` : '—'}</td>
      </tr>`;
    }).join('');
  }

  async function load() {
    els.refresh.disabled = true;
    els.message.textContent = 'Loading authoritative DEV Ads RDS data…';
    try {
      const [adsPayload, settingsPayload] = await Promise.all([apiRequest(ADS_URL), apiRequest(SETTINGS_URL)]);
      ads = normalizeAds(adsPayload);
      settings = normalizeSettings(settingsPayload);
      renderSettings();
      renderAds();
      els.message.textContent = `Loaded ${ads.length} DEV ad record${ads.length === 1 ? '' : 's'} from RDS. No browser fallback used.`;
    } catch (error) {
      ads = [];
      els.body.innerHTML = '<tr><td colspan="11" class="muted">DEV RDS load failed. No browser fallback is shown.</td></tr>';
      els.settings.innerHTML = '';
      els.count.textContent = '';
      els.message.textContent = `DEV Ads RDS load failed: ${error.message}`;
    } finally {
      els.refresh.disabled = false;
      updateTokenStatus();
    }
  }

  async function saveSettings() {
    settings = normalizeSettings({
      ads_enabled: els.adsEnabled.value === 'true', break_method: els.breakMethod.value, ads_per_break: Number(els.adsPerBreak.value), target_ad_seconds: Number(els.targetAdSeconds.value), break_interval: Number(els.breakInterval.value)
    });
    els.saveAdSettings.disabled = true;
    els.message.textContent = 'Saving DEV ad settings…';
    try {
      const result = await apiRequest(SETTINGS_URL, { method: 'PUT', body: JSON.stringify(settings) });
      settings = normalizeSettings(result?.settings || settings);
      renderSettings();
      els.message.textContent = 'DEV ad settings saved to RDS.';
    } catch (error) {
      els.message.textContent = `DEV ad settings save failed: ${error.message}`;
    } finally {
      els.saveAdSettings.disabled = false;
    }
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function setUploadStatus(message) {
    if (els.uploadStatus) els.uploadStatus.textContent = message;
  }

  function fileExtension(file) {
    return String(file?.name || '').split('.').pop().toLowerCase();
  }

  function videoContentType(file) {
    const extension = fileExtension(file);
    const type = String(file?.type || '').toLowerCase();
    if (type && !(extension === 'm4v' && type === 'video/x-m4v')) return type;
    return ({ mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', m4v:'application/octet-stream' })[extension] || 'application/octet-stream';
  }

  function validateVideoFile(file) {
    if (!file) return 'Select a video file first.';
    const extension = fileExtension(file);
    const type = videoContentType(file);
    if (!new Set(['mp4','webm','mov','m4v']).has(extension)) return 'Use an MP4, WEBM, MOV, or M4V file.';
    if (!new Set(['video/mp4','video/webm','video/quicktime','application/octet-stream']).has(type)) return 'Unsupported video MIME type.';
    return '';
  }

  function normalizePresign(data) {
    if (typeof data?.body === 'string') {
      try { return JSON.parse(data.body); } catch { return data; }
    }
    return data || {};
  }

  function assertDevUploadTargets(uploadUrl, publicUrl) {
    const upload = String(uploadUrl || '');
    const publicTarget = String(publicUrl || '');
    if (!/^https:\/\//i.test(upload) || !/^https:\/\//i.test(publicTarget)) throw new Error('DEV presign response did not return secure upload/public URLs.');
    const combined = `${upload}\n${publicTarget}`.toLowerCase();
    if (combined.includes(PROD_MEDIA_BUCKET.toLowerCase()) || combined.includes('/prod-v2') || combined.includes('je3zud66nb.execute-api')) {
      throw new Error('Blocked Ads upload because DEV presign returned a PROD media target.');
    }
    if (!upload.toLowerCase().includes(DEV_MEDIA_BUCKET.toLowerCase())) {
      throw new Error('Blocked Ads upload because the signed upload target is not the known DEV media bucket.');
    }
  }

  async function uploadAdVideo() {
    const file = els.videoFile?.files?.[0];
    const validationError = validateVideoFile(file);
    if (validationError) { setUploadStatus(validationError); return; }
    els.uploadVideo.disabled = true;
    setUploadStatus('Requesting DEV upload authorization…');
    try {
      const contentType = videoContentType(file);
      const presign = normalizePresign(await apiRequest(UPLOAD_PRESIGN_URL, {
        method: 'POST',
        body: JSON.stringify({ purpose: 'ad_video', filename: file.name, contentType })
      }));
      const uploadUrl = presign.uploadUrl || presign.upload_url;
      const publicUrl = presign.publicUrl || presign.public_url;
      assertDevUploadTargets(uploadUrl, publicUrl);
      setUploadStatus('Uploading video to DEV media storage…');
      const uploadResponse = await fetch(uploadUrl, {
        method: presign.method || 'PUT',
        headers: presign.headers || { 'Content-Type': contentType },
        body: file
      });
      if (!uploadResponse.ok) throw new Error(`DEV storage upload failed with status ${uploadResponse.status}.`);
      els.videoUrl.value = publicUrl;
      setUploadStatus('DEV ad video uploaded. Save the ad to persist this URL.');
    } catch (error) {
      setUploadStatus(`DEV ad video upload failed: ${error.message}`);
    } finally {
      els.uploadVideo.disabled = false;
    }
  }

  function openEditor(id = '') {
    selectedId = String(id || '');
    const ad = selectedId ? ads.find(item => String(item.id) === selectedId) : null;
    els.editorHeading.textContent = ad ? `Edit DEV Ad: ${ad.internal_title || ad.public_title || selectedId}` : 'New DEV Ad';
    els.title.value = ad?.internal_title || ad?.public_title || '';
    els.type.value = ad?.ad_type || 'Stashbox Radio Branding';
    els.description.value = ad?.description || '';
    els.videoUrl.value = ad?.video_url || '';
    if (els.videoFile) els.videoFile.value = '';
    setUploadStatus('MP4, WEBM, MOV, or M4V. DEV presign + storage only.');
    els.clickUrl.value = ad?.click_url || ad?.click_video_url || '';
    els.ratio.value = ad?.ad_ratio_label || ad?.ad_ratio || 'Auto Detect';
    els.frequency.value = ad?.frequency || 'Medium';
    els.skipSeconds.value = Number.isFinite(Number(ad?.skip_after_seconds)) ? Number(ad.skip_after_seconds) : 5;
    els.startDate.value = String(ad?.start_date || today()).slice(0,10);
    els.endDate.value = ad?.end_date ? String(ad.end_date).slice(0,10) : '';
    els.noSkipping.checked = Boolean(ad?.no_skipping);
    els.active.checked = Boolean(ad?.active);
    els.hidden.checked = Boolean(ad?.hidden);
    els.genre.value = ad?.genre_targeting || '';
    els.mood.value = ad?.mood_targeting || '';
    els.artist.value = ad?.artist_targeting || '';
    els.song.value = ad?.song_targeting || '';
    els.notes.value = ad?.notes || '';
    els.saveAd.textContent = ad ? 'Save DEV Ad Changes' : 'Create DEV Ad';
    els.deleteAd.classList.toggle('hidden', !ad);
    els.editorCard.classList.remove('hidden');
    els.editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeEditor() {
    selectedId = '';
    els.editorCard.classList.add('hidden');
  }

  function collectAdPayload() {
    const payload = {
      internal_title: String(els.title.value || '').trim(), description: String(els.description.value || '').trim(), ad_type: els.type.value,
      video_url: String(els.videoUrl.value || '').trim(), click_url: String(els.clickUrl.value || '').trim(), ad_ratio_label: els.ratio.value,
      video_width: null, video_height: null, frequency: els.frequency.value, skip_after_seconds: Number(els.skipSeconds.value || 5), no_skipping: Boolean(els.noSkipping.checked),
      active: Boolean(els.active.checked) && !Boolean(els.hidden.checked), hidden: Boolean(els.hidden.checked), genre_targeting: String(els.genre.value || '').trim(), mood_targeting: String(els.mood.value || '').trim(), artist_targeting: String(els.artist.value || '').trim(), song_targeting: String(els.song.value || '').trim(), start_date: els.startDate.value || today(), end_date: els.endDate.value || null, notes: String(els.notes.value || '').trim()
    };
    if (!payload.internal_title) throw new Error('Public Title is required.');
    if (!payload.ad_type) throw new Error('Ad Type is required.');
    if (!payload.video_url) throw new Error('Video URL is required.');
    if (els.active.checked && els.hidden.checked) throw new Error('Hidden and Active cannot both be true.');
    if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) throw new Error('End Date cannot be before Start Date.');
    return payload;
  }

  async function saveAd(event) {
    event.preventDefault();
    let payload;
    try { payload = collectAdPayload(); }
    catch (error) { els.message.textContent = error.message; return; }
    const isCreate = !selectedId;
    const url = isCreate ? ADS_URL : `${ADS_URL}/${encodeURIComponent(selectedId)}`;
    els.saveAd.disabled = true;
    els.message.textContent = isCreate ? 'Creating DEV ad in RDS…' : `Saving DEV ad ${selectedId}…`;
    try {
      const result = await apiRequest(url, { method: isCreate ? 'POST' : 'PUT', body: JSON.stringify(payload) });
      const returned = result?.ad || payload;
      const returnedId = String(returned.id || selectedId || '');
      els.message.textContent = isCreate ? 'DEV ad created in RDS.' : 'DEV ad updated in RDS.';
      await load();
      if (returnedId && ads.some(item => String(item.id) === returnedId)) openEditor(returnedId);
      else closeEditor();
    } catch (error) {
      els.message.textContent = `DEV ad save failed: ${error.message}`;
    } finally {
      els.saveAd.disabled = false;
    }
  }

  async function deleteSelectedAd() {
    if (!selectedId) return;
    const ad = ads.find(item => String(item.id) === selectedId);
    if (!window.confirm(`Delete DEV ad “${ad?.internal_title || selectedId}”?`)) return;
    els.deleteAd.disabled = true;
    els.message.textContent = `Deleting DEV ad ${selectedId}…`;
    try {
      await apiRequest(`${ADS_URL}/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
      closeEditor();
      await load();
      els.message.textContent = 'DEV ad deleted from RDS.';
    } catch (error) {
      els.message.textContent = `DEV ad delete failed: ${error.message}`;
    } finally {
      els.deleteAd.disabled = false;
    }
  }

  els.saveToken.addEventListener('click', () => { const token = String(els.token.value || '').trim(); if (token) localStorage.setItem(env.tokenStorageKey, token); else localStorage.removeItem(env.tokenStorageKey); updateTokenStatus(); load(); });
  els.clearToken.addEventListener('click', () => { localStorage.removeItem(env.tokenStorageKey); els.token.value = ''; updateTokenStatus(); });
  els.refresh.addEventListener('click', load);
  els.search.addEventListener('input', renderAds);
  els.saveAdSettings.addEventListener('click', saveSettings);
  els.newAd.addEventListener('click', () => openEditor());
  els.cancelAd.addEventListener('click', closeEditor);
  els.deleteAd.addEventListener('click', deleteSelectedAd);
  els.uploadVideo.addEventListener('click', uploadAdVideo);
  els.editor.addEventListener('submit', saveAd);
  els.body.addEventListener('click', event => { const button = event.target.closest('.edit-ad'); if (button) openEditor(button.dataset.adId); });

  updateTokenStatus();
  renderSettings();
  if (getToken()) load();
})();
