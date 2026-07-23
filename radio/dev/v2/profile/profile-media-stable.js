(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MAX_BYTES = 10 * 1024 * 1024;
  const mobile = window.matchMedia('(max-width: 699px)');
  const app = document.getElementById('profileApp');
  if (!app) return;

  const config = {
    avatar: { purpose:'profile_image', input:'avatar_url', label:'Profile Photo', help:'1:1 square · recommended 1200 × 1200', preview:'square', ratio:1, recommended:[1200,1200] },
    horizontal: { purpose:'horizontal_banner', input:'banner_url', label:'Horizontal Banner', help:'16:9 desktop · recommended 1920 × 1080', preview:'horizontal', ratio:16/9, recommended:[1920,1080] },
    vertical: { purpose:'vertical_banner', input:'vertical_banner_url', label:'Vertical Banner', help:'9:16 mobile · recommended 1080 × 1920', preview:'vertical', ratio:9/16, recommended:[1080,1920] }
  };

  let preferences = null;
  let scheduled = false;
  const clean = value => String(value ?? '').trim();

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }
  function headers(json=false) {
    const value = tokens();
    return {
      ...(json ? { 'Content-Type':'application/json' } : {}),
      ...(value.accessToken ? { Authorization:`Bearer ${value.accessToken}` } : {}),
      ...(value.idToken ? { 'X-Cognito-Id-Token':value.idToken } : {})
    };
  }
  async function parse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error:text }; }
    if (!response.ok || body?.success === false) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }
  async function getPreferences(force=false) {
    if (preferences && !force) return preferences;
    const body = await fetch(`${API}/radio/me/preferences?media_verify=${Date.now()}`,{cache:'no-store',credentials:'omit',headers:headers(false)}).then(parse);
    preferences = body.preferences || {};
    return preferences;
  }
  function settings() { return preferences?.settings && typeof preferences.settings === 'object' ? preferences.settings : {}; }
  function input(kind) { return document.querySelector(`form[data-form="account"] [name="${config[kind].input}"]`); }
  function value(kind) { return clean(input(kind)?.value || settings()[config[kind].input]); }
  function card(kind) { return document.querySelector(`.profile-media-card[data-profile-media-kind="${kind}"]`); }
  function status(kind,message='',error=false) {
    const node = card(kind)?.querySelector('[data-profile-media-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error',error);
  }
  function setValue(kind,url) {
    const node = input(kind);
    if (node) node.value = url || '';
    preferences = preferences || {};
    preferences.settings = { ...settings(), [config[kind].input]:url || '' };
    render(kind,url || '');
    applyBanner();
  }
  function render(kind,url='') {
    const node = card(kind)?.querySelector('[data-profile-media-preview]');
    if (!node) return;
    node.innerHTML = '';
    if (!url) { node.textContent = `No ${config[kind].label.toLowerCase()} uploaded`; return; }
    const image = new Image();
    image.alt = `${config[kind].label} preview`;
    image.src = url;
    image.onerror = () => { node.textContent = 'Image preview unavailable'; };
    node.appendChild(image);
  }
  function markup(kind) {
    const item = config[kind];
    return `<article class="profile-media-card" data-profile-media-kind="${kind}"><div class="profile-media-card-head"><strong>${item.label}</strong><span>${item.help}</span></div><div class="profile-media-preview ${item.preview}" data-profile-media-preview>No ${item.label.toLowerCase()} uploaded</div><div class="profile-media-controls"><button type="button" data-profile-media-choose="${kind}">Upload / Replace</button><button type="button" class="secondary" data-profile-media-clear="${kind}">Remove</button></div><input class="profile-media-file" type="file" accept="image/jpeg,image/png,image/webp" data-profile-media-file="${kind}"><p class="profile-media-status" data-profile-media-status aria-live="polite"></p></article>`;
  }
  function enhance() {
    scheduled = false;
    const form = document.querySelector('form[data-form="account"]');
    if (!form || form.dataset.mediaUploadsReady === 'true') return;
    const avatar = form.querySelector('[name="avatar_url"]');
    const horizontal = form.querySelector('[name="banner_url"]');
    if (!avatar || !horizontal) return;
    form.dataset.mediaUploadsReady = 'true';
    avatar.type='hidden'; horizontal.type='hidden';
    avatar.closest('label')?.classList.add('profile-url-source');
    horizontal.closest('label')?.classList.add('profile-url-source');
    let vertical = form.querySelector('[name="vertical_banner_url"]');
    if (!vertical) { vertical=document.createElement('input'); vertical.type='hidden'; vertical.name='vertical_banner_url'; vertical.value=clean(settings().vertical_banner_url); form.appendChild(vertical); }
    const editor = document.createElement('section');
    editor.className='profile-media-editor';
    editor.innerHTML=`<div class="profile-media-editor-head"><strong>Profile Images</strong><span>Upload all three formats directly to Stashbox storage.</span></div><div class="profile-media-upload-grid">${markup('avatar')}${markup('horizontal')}${markup('vertical')}</div>`;
    const email = [...form.querySelectorAll('label')].find(label => label.textContent.includes('Sign-in Email'));
    if (email) email.before(editor); else form.querySelector('.profile-form-actions')?.before(editor);
    render('avatar',avatar.value || settings().avatar_url || '');
    render('horizontal',horizontal.value || settings().banner_url || '');
    render('vertical',vertical.value || settings().vertical_banner_url || '');
  }
  function queue() { if (scheduled) return; scheduled=true; requestAnimationFrame(enhance); }

  async function dimensions(file) {
    const url=URL.createObjectURL(file);
    try { return await new Promise((resolve,reject) => { const image=new Image(); image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight}); image.onerror=()=>reject(new Error('The image could not be read.')); image.src=url; }); }
    finally { URL.revokeObjectURL(url); }
  }
  function validate(file) {
    if (!file) return 'Choose an image first.';
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return 'Use a JPG, PNG, or WEBP image.';
    if (file.size > MAX_BYTES) return 'Image must be 10 MB or smaller.';
    return '';
  }
  function note(kind,size) {
    const item=config[kind], notes=[];
    if (size.width < item.recommended[0] || size.height < item.recommended[1]) notes.push(`below ${item.recommended[0]} × ${item.recommended[1]}`);
    if (Math.abs(size.width/Math.max(1,size.height)-item.ratio) > .18) notes.push('outside the recommended ratio');
    return notes.length ? ` Warning: ${notes.join(' and ')}.` : '';
  }
  async function saveSettingsPatch(patch) {
    const current = await getPreferences();
    const body = {
      autoplay_enabled: current.autoplay_enabled !== false,
      explicit_content_enabled: current.explicit_content_enabled !== false,
      default_view_mode: current.default_view_mode || 'visual',
      preferred_genres: current.preferred_genres || [],
      preferred_artists: current.preferred_artists || [],
      settings: { ...(current.settings || {}), ...patch },
      in_app_enabled: current.in_app_enabled !== false,
      browser_push_enabled: Boolean(current.browser_push_enabled),
      email_enabled: Boolean(current.email_enabled),
      notification_categories: current.notification_categories || [],
      notification_artist_keys: current.notification_artist_keys || []
    };
    const response = await fetch(`${API}/radio/me/preferences`,{method:'PATCH',cache:'no-store',credentials:'omit',headers:headers(true),body:JSON.stringify(body)}).then(parse);
    preferences = response.preferences || body;
    return preferences;
  }
  async function verifySaved(kind, expectedUrl) {
    const fresh = await getPreferences(true);
    const actual = clean(fresh?.settings?.[config[kind].input]);
    if (actual !== clean(expectedUrl)) {
      throw new Error(`${config[kind].label} was uploaded, but the RDS read-back did not match the saved URL.`);
    }
    setValue(kind, actual);
    return actual;
  }
  async function upload(kind,file) {
    const error=validate(file);
    if (error) return status(kind,error,true);
    if (!tokens().accessToken) throw new Error('Your session expired. Log in again.');
    const size=await dimensions(file);
    status(kind,'Requesting secure upload URL…');
    const presign=await fetch(`${API}/radio/me/media/presign`,{method:'POST',cache:'no-store',credentials:'omit',headers:headers(true),body:JSON.stringify({purpose:config[kind].purpose,filename:file.name,content_type:file.type,size_bytes:file.size})}).then(parse);
    if (!presign.upload_url || !presign.public_url) throw new Error('Upload authorization did not return the required URLs.');
    status(kind,'Uploading image to S3…');
    const put=await fetch(presign.upload_url,{method:presign.method || 'PUT',mode:'cors',credentials:'omit',headers:presign.headers || {'Content-Type':file.type},body:file});
    if (!put.ok) throw new Error(`Image upload failed with status ${put.status}.`);
    setValue(kind,presign.public_url);
    status(kind,'Image uploaded to S3. Saving and checking RDS…');
    await saveSettingsPatch({ [config[kind].input]:presign.public_url });
    await verifySaved(kind,presign.public_url);
    status(kind,`${size.width} × ${size.height} px uploaded to S3 and verified in RDS.${note(kind,size)}`);
  }
  async function clear(kind) {
    setValue(kind,'');
    status(kind,'Removing image from your profile…');
    await saveSettingsPatch({ [config[kind].input]:'' });
    await verifySaved(kind,'');
    status(kind,'Image removal verified in RDS.');
  }
  function applyBanner() {
    const hero=document.querySelector('#profileApp .profile-hero');
    if (!hero) return;
    const horizontal=clean(settings().banner_url), vertical=clean(settings().vertical_banner_url);
    const selected=mobile.matches && vertical ? vertical : horizontal;
    if (selected) hero.style.setProperty('--profile-banner',`url(${JSON.stringify(selected)})`);
  }

  document.addEventListener('click',event => {
    const choose=event.target.closest('[data-profile-media-choose]');
    if (choose) { event.preventDefault(); card(choose.dataset.profileMediaChoose)?.querySelector('[data-profile-media-file]')?.click(); return; }
    const remove=event.target.closest('[data-profile-media-clear]');
    if (remove) { event.preventDefault(); clear(remove.dataset.profileMediaClear).catch(error => status(remove.dataset.profileMediaClear,error.message,true)); }
  });
  document.addEventListener('change',event => {
    const fileInput=event.target.closest('[data-profile-media-file]');
    if (!fileInput) return;
    const kind=fileInput.dataset.profileMediaFile, file=fileInput.files?.[0];
    if (file) upload(kind,file).catch(error => status(kind,error.message,true));
  });
  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change',applyBanner);
  getPreferences(true).then(() => { queue(); applyBanner(); }).catch(() => queue());
  queue();
})();
