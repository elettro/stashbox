(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');
  const ADS_URL = `${env.apiBase}/admin/ads`;
  const SETTINGS_URL = `${env.apiBase}/admin/ad-settings`;

  const els = {
    token: document.getElementById('adminToken'),
    saveToken: document.getElementById('saveToken'),
    clearToken: document.getElementById('clearToken'),
    tokenStatus: document.getElementById('tokenStatus'),
    refresh: document.getElementById('refreshAds'),
    message: document.getElementById('adsMessage'),
    settings: document.getElementById('settingsGrid'),
    search: document.getElementById('adSearch'),
    count: document.getElementById('adCount'),
    body: document.getElementById('adsBody')
  };

  let ads = [];

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

  async function getJson(url) {
    if (!url.startsWith(env.apiBase)) throw new Error('Blocked non-DEV Ads request.');
    const token = getToken();
    if (!token) throw new Error('Save a DEV admin token first.');
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-admin-token': token, 'accept': 'application/json' },
      cache: 'no-store'
    });
    const text = await response.text();
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
    }
    if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    if (typeof body.body === 'string') {
      try { return JSON.parse(body.body); } catch {}
    }
    return body;
  }

  function normalizeAds(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.ads)) return payload.ads;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  function normalizeSettings(payload) {
    return payload?.settings && typeof payload.settings === 'object' ? payload.settings : (payload || {});
  }

  function yesNo(value) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' ? 'Yes' : 'No';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function renderSettings(settings) {
    const rows = [
      ['Ads enabled', yesNo(settings.ads_enabled)],
      ['Break method', settings.break_method || '—'],
      ['Ads per break', settings.ads_per_break ?? '—'],
      ['Target ad seconds', settings.target_ad_seconds ?? '—'],
      ['Break interval', settings.break_interval ?? '—']
    ];
    els.settings.innerHTML = rows.map(([label, value]) => `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function renderAds() {
    const query = String(els.search.value || '').trim().toLowerCase();
    const filtered = query ? ads.filter(ad => [
      ad.internal_title, ad.description, ad.ad_type, ad.artist_targeting,
      ad.genre_targeting, ad.mood_targeting, ad.song_targeting, ad.ad_ratio_label
    ].join(' ').toLowerCase().includes(query)) : ads;

    els.count.textContent = `${filtered.length.toLocaleString()} of ${ads.length.toLocaleString()} DEV RDS ads shown`;
    if (!filtered.length) {
      els.body.innerHTML = '<tr><td colspan="10" class="muted">No matching DEV RDS ads.</td></tr>';
      return;
    }

    els.body.innerHTML = filtered.map(ad => {
      const video = String(ad.video_url || '').trim();
      return `<tr>
        <td>${escapeHtml(ad.internal_title || ad.public_title || 'Untitled')}</td>
        <td>${escapeHtml(ad.ad_type || '—')}</td>
        <td>${escapeHtml(ad.ad_ratio_label || ad.ad_ratio || '—')}</td>
        <td>${escapeHtml(yesNo(ad.active))}</td>
        <td>${escapeHtml(yesNo(ad.hidden))}</td>
        <td>${escapeHtml(ad.frequency || '—')}</td>
        <td>${escapeHtml(ad.views ?? 0)}</td>
        <td>${escapeHtml(ad.clicks ?? 0)}</td>
        <td>${escapeHtml(ad.skips ?? 0)}</td>
        <td>${/^https?:\/\//i.test(video) ? `<a href="${escapeHtml(video)}" target="_blank" rel="noopener">Open</a>` : '—'}</td>
      </tr>`;
    }).join('');
  }

  async function load() {
    els.refresh.disabled = true;
    els.message.textContent = 'Loading real DEV Ads RDS data…';
    try {
      const [adsPayload, settingsPayload] = await Promise.all([getJson(ADS_URL), getJson(SETTINGS_URL)]);
      ads = normalizeAds(adsPayload);
      renderSettings(normalizeSettings(settingsPayload));
      renderAds();
      els.message.textContent = `Loaded ${ads.length} DEV ad record${ads.length === 1 ? '' : 's'} from RDS. No browser fallback used.`;
    } catch (error) {
      ads = [];
      els.body.innerHTML = '<tr><td colspan="10" class="muted">DEV RDS load failed. No browser fallback is shown.</td></tr>';
      els.settings.innerHTML = '';
      els.count.textContent = '';
      els.message.textContent = `DEV Ads RDS load failed: ${error.message}`;
    } finally {
      els.refresh.disabled = false;
      updateTokenStatus();
    }
  }

  els.saveToken.addEventListener('click', () => {
    const token = String(els.token.value || '').trim();
    if (token) localStorage.setItem(env.tokenStorageKey, token);
    else localStorage.removeItem(env.tokenStorageKey);
    updateTokenStatus();
    load();
  });
  els.clearToken.addEventListener('click', () => {
    localStorage.removeItem(env.tokenStorageKey);
    els.token.value = '';
    updateTokenStatus();
  });
  els.refresh.addEventListener('click', load);
  els.search.addEventListener('input', renderAds);

  updateTokenStatus();
  if (getToken()) load();
})();
