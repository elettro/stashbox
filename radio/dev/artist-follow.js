(() => {
  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const PENDING_KEY = 'stashbox_radio_dev_pending_artist_follow';
  const STYLE_ID = 'stashbox-artist-follow-style';
  let catalogPromise = null;
  let currentArtistKey = '';
  let processingPending = false;

  function clean(value) { return String(value ?? '').trim(); }
  function tokens() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; } catch (_) { return {}; } }
  function isLoggedIn() { return Boolean(tokens().accessToken); }
  function authHeaders(json = false) {
    const token = tokens();
    const headers = json ? { 'Content-Type': 'application/json' } : {};
    if (token.accessToken) headers.Authorization = `Bearer ${token.accessToken}`;
    if (token.idToken) headers['X-Cognito-Id-Token'] = token.idToken;
    return headers;
  }
  async function api(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options, headers: { ...authHeaders(Boolean(options.body)), ...(options.headers || {}) } });
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .artist-follow-control{display:inline-flex;align-items:center;gap:7px;margin-left:9px;vertical-align:middle;white-space:nowrap}
      .artist-profile-link{color:#ffd064;text-decoration:none;font-weight:800;border-bottom:1px solid transparent}
      .artist-profile-link:hover{border-bottom-color:#ffd064}
      .artist-follow-button{height:29px;min-height:29px;padding:0 11px;border:1px solid #f0a500;border-radius:999px;background:#f0a500;color:#171008;font:900 11px/1 Karla,Arial,sans-serif;cursor:pointer}
      .artist-follow-button.following{background:transparent;color:#ffd064}
      .artist-follow-button:disabled{opacity:.55;cursor:wait}
      .artist-follower-count{color:#aeb5bd;font:700 11px/1 Karla,Arial,sans-serif}
      @media(max-width:700px){.artist-follow-control{display:flex;margin:7px 0 0;flex-wrap:wrap}.artist-follower-count{font-size:10px}}
    `;
    document.head.appendChild(style);
  }
  async function catalog() {
    if (!catalogPromise) catalogPromise = api(`${API_ROOT}/radio/artists?limit=500`).then(data => data.artists || []).catch(error => { console.warn('[artist follow] catalog unavailable', error); return []; });
    return catalogPromise;
  }
  function normalizeName(value) { return clean(value).toLowerCase().replace(/\s+/g, ' '); }
  async function findArtist(name) {
    const artists = await catalog();
    const target = normalizeName(name);
    return artists.find(artist => normalizeName(artist.name) === target)
      || artists.find(artist => target.startsWith(`${normalizeName(artist.name)} `))
      || null;
  }
  function countLabel(count) { const value = Number(count || 0); return `${value.toLocaleString()} follower${value === 1 ? '' : 's'}`; }
  function renderControl(meta, artist) {
    let control = meta.querySelector('.artist-follow-control');
    if (!control) {
      control = document.createElement('span');
      control.className = 'artist-follow-control';
      meta.appendChild(control);
    }
    control.dataset.artistKey = artist.artist_key;
    control.innerHTML = `
      <a class="artist-profile-link" href="/radio/artists/dev/?artist=${encodeURIComponent(artist.slug || artist.artist_key)}" title="Open ${clean(artist.name)} artist profile">Artist Profile</a>
      <button class="artist-follow-button ${artist.is_following ? 'following' : ''}" type="button">${artist.is_following ? 'Following' : 'Follow'}</button>
      <span class="artist-follower-count">${countLabel(artist.follower_count)}</span>`;
    const button = control.querySelector('.artist-follow-button');
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); toggleFollow(control, artist).catch(error => { console.warn('[artist follow] action failed', error); button.disabled = false; button.textContent = artist.is_following ? 'Following' : 'Follow'; }); });
  }
  async function loadArtistDetail(artist) {
    try {
      const data = await api(`${API_ROOT}/radio/artists/${encodeURIComponent(artist.artist_key)}`);
      return data.artist || artist;
    } catch (_) {
      return artist;
    }
  }
  async function toggleFollow(control, artist, forceFollow = false) {
    const button = control.querySelector('.artist-follow-button');
    if (!isLoggedIn()) {
      sessionStorage.setItem(PENDING_KEY, artist.artist_key);
      window.StashboxRadioAccount?.open?.('login');
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    const shouldFollow = forceFollow || !artist.is_following;
    const data = await api(`${API_ROOT}/radio/me/follows/${encodeURIComponent(artist.artist_key)}`, {
      method: shouldFollow ? 'POST' : 'DELETE',
      body: shouldFollow ? JSON.stringify({ notifications_enabled: true }) : undefined
    });
    const updated = data.artist;
    renderControl(control.closest('.meta'), updated);
    sessionStorage.removeItem(PENDING_KEY);
  }
  async function scan() {
    injectStyle();
    const meta = document.querySelector('.player-info .meta');
    const artistNode = meta?.querySelector(':scope > strong');
    const artistName = clean(artistNode?.textContent);
    if (!meta || !artistName) return;
    const artist = await findArtist(artistName);
    if (!artist) { meta.querySelector('.artist-follow-control')?.remove(); currentArtistKey = ''; return; }
    if (currentArtistKey === artist.artist_key && meta.querySelector(`.artist-follow-control[data-artist-key="${CSS.escape(artist.artist_key)}"]`)) return;
    currentArtistKey = artist.artist_key;
    renderControl(meta, await loadArtistDetail(artist));
  }
  async function processPending() {
    if (processingPending || !isLoggedIn()) return;
    const pending = clean(sessionStorage.getItem(PENDING_KEY));
    if (!pending) return;
    processingPending = true;
    try {
      const data = await api(`${API_ROOT}/radio/artists/${encodeURIComponent(pending)}`);
      const artist = data.artist;
      if (!artist.is_following) await api(`${API_ROOT}/radio/me/follows/${encodeURIComponent(pending)}`, { method: 'POST', body: JSON.stringify({ notifications_enabled: true }) });
      sessionStorage.removeItem(PENDING_KEY);
      currentArtistKey = '';
      await scan();
    } catch (error) {
      console.warn('[artist follow] pending follow failed', error);
    } finally {
      processingPending = false;
    }
  }
  let queued = false;
  function queueScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan().catch(error => console.warn('[artist follow] scan failed', error)); processPending(); });
  }
  injectStyle();
  queueScan();
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setInterval(processPending, 1500);
})();
