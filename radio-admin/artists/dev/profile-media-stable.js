(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ARTISTS_URL = `${API_ROOT}/radio/admin/artists`;
  const LEGACY_PRESIGN_URL = `${API_ROOT}/admin/uploads/presign`;
  const ADMIN_KEYS = ['stashbox_admin_token_dev', 'stashbox-radio-admin-token-dev'];
  const ACCOUNT_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MAX_BYTES = 10 * 1024 * 1024;
  const originalFetch = window.fetch.bind(window);

  const configs = {
    profile: { hidden:'profileImageUrl', file:'profileImageFile', upload:'uploadProfileImage', remove:'deleteProfileImage', preview:'profileImagePreview', dimensions:'profileImageDimensions', status:'profileImageStatus', purpose:'profile_image', label:'profile image', recommended:[1200,1200], ratio:1 },
    banner: { hidden:'bannerImageUrl', file:'bannerImageFile', upload:'uploadBannerImage', remove:'deleteBannerImage', preview:'bannerImagePreview', dimensions:'bannerImageDimensions', status:'bannerImageStatus', purpose:'horizontal_banner', label:'horizontal banner', recommended:[1920,1080], ratio:16/9 },
    verticalBanner: { hidden:'verticalBannerImageUrl', file:'verticalBannerImageFile', upload:'uploadVerticalBannerImage', remove:'deleteVerticalBannerImage', preview:'verticalBannerImagePreview', dimensions:'verticalBannerImageDimensions', status:'verticalBannerImageStatus', purpose:'vertical_banner', label:'vertical banner', recommended:[1080,1920], ratio:9/16 }
  };

  const el = id => document.getElementById(id);
  const clean = value => String(value ?? '').trim();
  const slug = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'artist';

  function adminToken() {
    for (const key of ADMIN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return '';
  }
  function accountTokens() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }
  function headers(json = false) {
    const result = {};
    const admin = adminToken();
    if (admin) result['x-admin-token'] = admin;
    else {
      const tokens = accountTokens();
      if (tokens.accessToken) result.Authorization = `Bearer ${tokens.accessToken}`;
      if (tokens.idToken) result['X-Cognito-Id-Token'] = tokens.idToken;
    }
    if (json) result['Content-Type'] = 'application/json';
    return result;
  }
  async function parse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error:text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }
  function key() { return slug(el('artistKey')?.value || el('slug')?.value || el('name')?.value); }
  function existing() { return Boolean(clean(el('artistId')?.value)); }
  function setStatus(kind, message='', error=false) {
    const node = el(configs[kind].status);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', error);
  }
  function setValue(kind, value='') { if (el(configs[kind].hidden)) el(configs[kind].hidden).value = value; }
  function render(kind, url='', dimensions=null) {
    const config = configs[kind];
    const preview = el(config.preview);
    const pill = el(config.dimensions);
    if (!preview || !pill) return;
    preview.innerHTML = '';
    if (!url) { preview.innerHTML = `<span>No ${config.label}</span>`; pill.textContent=''; return; }
    const image = new Image();
    image.alt = `${config.label} preview`;
    image.src = url;
    image.onload = () => { pill.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`; };
    image.onerror = () => { preview.innerHTML='<span>Image preview unavailable</span>'; pill.textContent=''; };
    preview.appendChild(image);
    if (dimensions) pill.textContent = `${dimensions.width} × ${dimensions.height} px`;
  }
  async function dimensions(file) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve,reject) => {
        const image = new Image();
        image.onload = () => resolve({ width:image.naturalWidth, height:image.naturalHeight });
        image.onerror = () => reject(new Error('The selected image could not be read.'));
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  function validate(file) {
    if (!file) return 'Choose an image first.';
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return 'Use a JPG, PNG, or WEBP image.';
    if (file.size > MAX_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }
  function warning(config, size) {
    const notes = [];
    if (size.width < config.recommended[0] || size.height < config.recommended[1]) notes.push(`smaller than ${config.recommended[0]} × ${config.recommended[1]}`);
    if (Math.abs(size.width / Math.max(1,size.height) - config.ratio) > .18) notes.push('outside the recommended aspect ratio');
    return notes.length ? ` Warning: ${notes.join(' and ')}.` : '';
  }

  async function presign(kind, file) {
    const config = configs[kind];
    const artistKey = key();
    const artistName = clean(el('name')?.value);
    if (!artistName) throw new Error('Enter the artist name before uploading.');
    if (existing()) {
      const response = await originalFetch(`${ARTISTS_URL}/${encodeURIComponent(artistKey)}/media/presign`, { method:'POST', cache:'no-store', credentials:'omit', headers:headers(true), body:JSON.stringify({ purpose:config.purpose, filename:file.name, content_type:file.type, size_bytes:file.size }) });
      if (response.ok) return parse(response);
      if (![404,405].includes(response.status)) return parse(response);
    }
    const response = await originalFetch(LEGACY_PRESIGN_URL, { method:'POST', cache:'no-store', credentials:'omit', headers:headers(true), body:JSON.stringify({ song_key:`artist-${artistKey}-${config.purpose}`, song_name:`${artistName} ${config.label}`, artist:artistName, purpose:'artwork', filename:file.name, content_type:file.type }) });
    return parse(response);
  }

  async function saveVertical(url) {
    if (!existing()) return;
    const response = await originalFetch(`${ARTISTS_URL}/${encodeURIComponent(key())}/media`, { method:'PATCH', cache:'no-store', credentials:'omit', headers:headers(true), body:JSON.stringify({ vertical_banner_image_url:url }) });
    return parse(response);
  }

  async function upload(kind, file) {
    const config = configs[kind];
    const error = validate(file);
    if (error) return setStatus(kind,error,true);
    const size = await dimensions(file);
    setStatus(kind,'Requesting secure upload URL…');
    const auth = await presign(kind,file);
    if (!auth.upload_url || !auth.public_url) throw new Error('Upload authorization did not return the required URLs.');
    setStatus(kind,'Uploading image to S3…');
    const uploaded = await originalFetch(auth.upload_url,{method:auth.method || 'PUT',mode:'cors',credentials:'omit',headers:auth.headers || {'Content-Type':file.type},body:file});
    if (!uploaded.ok) throw new Error(`S3 upload failed with status ${uploaded.status}.`);
    setValue(kind,auth.public_url);
    render(kind,auth.public_url,size);
    if (kind === 'verticalBanner' && existing()) {
      setStatus(kind,'Image uploaded. Saving vertical banner to artist profile…');
      await saveVertical(auth.public_url);
      setStatus(kind,`${size.width} × ${size.height} px uploaded and saved.${warning(config,size)}`);
    } else {
      setStatus(kind,`${size.width} × ${size.height} px uploaded.${warning(config,size)} Click Save Artist.`);
    }
  }

  async function loadVertical(artistKey) {
    if (!artistKey) return;
    try {
      const response = await originalFetch(`${ARTISTS_URL}/${encodeURIComponent(artistKey)}/media`,{cache:'no-store',credentials:'omit',headers:headers(false)});
      const body = await parse(response);
      const url = clean(body.media?.vertical_banner_image_url);
      setValue('verticalBanner',url);
      render('verticalBanner',url);
      setStatus('verticalBanner');
    } catch (error) {
      setStatus('verticalBanner',error.message,true);
    }
  }

  function isArtistRead(url,method) {
    return method === 'GET' && url.startsWith(`${ARTISTS_URL}/`) && !url.includes('/access') && !url.includes('/media') && !url.includes('/songs');
  }
  function isArtistWrite(url,method) {
    if (!['POST','PATCH','PUT'].includes(method)) return false;
    if (url === ARTISTS_URL) return true;
    return url.startsWith(`${ARTISTS_URL}/`) && !url.includes('/access') && !url.includes('/media') && !url.includes('/songs');
  }

  window.fetch = async (input,init={}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let nextInit = init;
    if (isArtistWrite(url,method) && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        body.profile_image_url = clean(el('profileImageUrl')?.value);
        body.banner_image_url = clean(el('bannerImageUrl')?.value);
        body.vertical_banner_image_url = clean(el('verticalBannerImageUrl')?.value);
        nextInit = { ...init, body:JSON.stringify(body) };
      } catch (_) {}
    }
    const response = await originalFetch(input,nextInit);
    if (response.ok && isArtistRead(url,method)) {
      response.clone().json().then(body => {
        const artistKey = body.artist?.artist_key;
        const direct = clean(body.artist?.vertical_banner_image_url);
        if (direct) { setValue('verticalBanner',direct); render('verticalBanner',direct); }
        else if (artistKey) loadVertical(artistKey);
      }).catch(() => {});
    }
    if (response.ok && isArtistWrite(url,method)) {
      response.clone().json().then(async body => {
        const artistKey = body.artist?.artist_key;
        const vertical = clean(el('verticalBannerImageUrl')?.value);
        if (artistKey && vertical) {
          try { await saveVertical(vertical); setStatus('verticalBanner','Vertical banner saved.'); }
          catch (error) { setStatus('verticalBanner',`Artist saved, but vertical banner save failed: ${error.message}`,true); }
        }
      }).catch(() => {});
    }
    return response;
  };

  document.addEventListener('click',event => {
    const button = event.target.closest('button[id]');
    if (!button) return;
    const kind = Object.entries(configs).find(([,config]) => config.upload === button.id)?.[0];
    if (kind) { event.preventDefault(); event.stopImmediatePropagation(); el(configs[kind].file)?.click(); return; }
    const removeKind = Object.entries(configs).find(([,config]) => config.remove === button.id)?.[0];
    if (removeKind) {
      event.preventDefault(); event.stopImmediatePropagation();
      setValue(removeKind,''); render(removeKind,''); setStatus(removeKind,'Image removed. Click Save Artist to confirm.');
      if (removeKind === 'verticalBanner' && existing()) saveVertical('').then(() => setStatus(removeKind,'Vertical banner removed.')).catch(error => setStatus(removeKind,error.message,true));
    }
  },true);

  document.addEventListener('change',event => {
    const kind = Object.entries(configs).find(([,config]) => config.file === event.target.id)?.[0];
    if (!kind) return;
    event.stopImmediatePropagation();
    const file = event.target.files?.[0];
    if (file) upload(kind,file).catch(error => setStatus(kind,error.message,true));
  },true);
})();
