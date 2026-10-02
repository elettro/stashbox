(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required');
  const env = migration.getEnvironment('dev');

  const configs = {
    audio: {
      purpose: 'audio',
      inputId: 'audioFileInput',
      buttonId: 'uploadAudioButton',
      statusId: 'audioUploadStatus',
      extensions: ['wav', 'mp3', 'm4a', 'flac', 'aiff', 'aif'],
      mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/aiff', 'audio/x-aiff'],
      multiple: false,
      assetType: null
    },
    visualImages: {
      purpose: 'visual_image',
      inputId: 'visualImageInput',
      buttonId: 'uploadVisualImagesButton',
      statusId: 'visualImageStatus',
      extensions: ['jpg', 'jpeg', 'png', 'webp'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      multiple: true,
      assetType: 'image'
    },
    visualClips: {
      purpose: 'visual_clip',
      inputId: 'visualClipInput',
      buttonId: 'uploadVisualClipsButton',
      statusId: 'visualClipStatus',
      extensions: ['mp4', 'webm', 'mov'],
      mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      multiple: true,
      assetType: 'clip'
    }
  };

  const els = {
    message: document.getElementById('mediaMessage'),
    songsBody: document.getElementById('songsBody'),
    newSong: document.getElementById('newSongButton')
  };

  function getStoredToken() {
    const current = localStorage.getItem(env.tokenStorageKey);
    if (current) return current;
    for (const key of env.legacyTokenStorageKeys || []) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return '';
  }

  function currentSongKey() {
    const input = document.getElementById('field-song_key');
    if (!input || !input.disabled) return '';
    return String(input.value || '').trim();
  }

  function currentField(name) {
    return String(document.getElementById(`field-${name}`)?.value || '').trim();
  }

  function setEnabledState() {
    const enabled = Boolean(currentSongKey());
    for (const config of Object.values(configs)) {
      const input = document.getElementById(config.inputId);
      const button = document.getElementById(config.buttonId);
      if (input) input.disabled = !enabled;
      if (button) button.disabled = !enabled;
    }
    if (!enabled) els.message.textContent = 'Choose Edit on an existing DEV song before uploading media.';
  }

  function extensionOf(file) {
    return String(file?.name || '').split('.').pop().toLowerCase();
  }

  function contentType(file, config) {
    if (config.mimeTypes.includes(file.type)) return file.type;
    const ext = extensionOf(file);
    const map = {
      wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', aiff: 'audio/aiff', aif: 'audio/aiff',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime'
    };
    return map[ext] || file.type || 'application/octet-stream';
  }

  function validateFile(file, config) {
    if (!file) throw new Error('Choose a file first.');
    const ext = extensionOf(file);
    const mime = contentType(file, config);
    if (!config.extensions.includes(ext) && !config.mimeTypes.includes(mime)) {
      throw new Error(`Unsupported file type: ${file.name}`);
    }
  }

  async function presign(file, config) {
    const token = getStoredToken();
    const key = currentSongKey();
    if (!token) throw new Error('No DEV admin token found.');
    if (!key) throw new Error('Select an existing DEV song first.');

    migration.assertWriteAllowed('dev', `song-media-${config.purpose}`);
    const url = `${env.apiBase}/admin/uploads/presign`;
    if (url !== `${env.apiBase}/admin/uploads/presign`) throw new Error('Blocked non-DEV presign route.');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-admin-token': token,
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        song_key: key,
        song_name: currentField('song_name') || currentField('display_title') || key,
        artist: currentField('artist'),
        purpose: config.purpose,
        filename: file.name,
        content_type: contentType(file, config)
      })
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (_) { payload = text; }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object'
        ? (payload.error || payload.message || JSON.stringify(payload))
        : (payload || response.statusText);
      throw new Error(`${response.status}: ${detail}`);
    }
    return payload || {};
  }

  async function uploadOne(file, config) {
    validateFile(file, config);
    const signed = await presign(file, config);
    const uploadUrl = String(signed.upload_url || signed.uploadUrl || '').trim();
    const publicUrl = String(signed.public_url || signed.publicUrl || '').trim();
    const objectKey = String(signed.key || signed.object_key || signed.objectKey || '').trim();
    if (!uploadUrl || !publicUrl) throw new Error('DEV presign response is missing upload_url or public_url.');
    const parsed = new URL(uploadUrl);
    if (parsed.protocol !== 'https:') throw new Error('Blocked non-HTTPS upload URL.');

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType(file, config) },
      body: file
    });
    if (!put.ok) throw new Error(`Storage upload failed with status ${put.status}.`);

    return {
      url: publicUrl,
      key: objectKey || keyFromUrl(publicUrl)
    };
  }

  function keyFromUrl(url) {
    try { return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')); }
    catch (_) { return ''; }
  }

  function readVisualAssets() {
    const input = document.getElementById('field-visual_assets');
    const raw = String(input?.value || '').trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return raw.split(/\r?\n/).map(url => url.trim()).filter(Boolean).map(url => ({
        type: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'clip' : 'image',
        url,
        source: 'song',
        key: keyFromUrl(url)
      }));
    }
  }

  function appendVisualAssets(uploaded, assetType) {
    const input = document.getElementById('field-visual_assets');
    if (!input) throw new Error('Visual Assets field is missing from the migrated editor.');
    const existing = readVisualAssets();
    const next = [...existing];
    for (const item of uploaded) {
      if (next.some(asset => String(asset?.url || '') === item.url)) continue;
      next.push({ type: assetType, url: item.url, source: 'song', key: item.key || keyFromUrl(item.url) });
    }
    input.value = JSON.stringify(next, null, 2);
    return next;
  }

  async function handleUpload(configName) {
    const config = configs[configName];
    const input = document.getElementById(config.inputId);
    const button = document.getElementById(config.buttonId);
    const status = document.getElementById(config.statusId);
    const files = Array.from(input?.files || []);
    if (!files.length) {
      status.textContent = 'Choose a file first.';
      return;
    }
    if (!config.multiple && files.length > 1) files.splice(1);

    button.disabled = true;
    status.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'} to DEV…`;
    try {
      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        status.textContent = `Uploading ${index + 1} of ${files.length}: ${files[index].name}`;
        uploaded.push(await uploadOne(files[index], config));
      }

      if (configName === 'audio') {
        const audioField = document.getElementById('field-audio_url');
        if (!audioField) throw new Error('Audio URL field is missing from the migrated editor.');
        audioField.value = uploaded[0].url;
        status.textContent = 'Audio uploaded to DEV. Click Save DEV Changes to persist the URL.';
      } else {
        const assets = appendVisualAssets(uploaded, config.assetType);
        status.textContent = `${uploaded.length} ${config.assetType} upload${uploaded.length === 1 ? '' : 's'} added. ${assets.length} total visual assets in editor. Click Save DEV Changes.`;
      }
      els.message.textContent = 'DEV media upload complete. Song metadata is not persisted until you click Save DEV Changes.';
      input.value = '';
    } catch (error) {
      status.textContent = `Upload failed: ${error.message}`;
    } finally {
      button.disabled = !currentSongKey();
    }
  }

  document.getElementById(configs.audio.buttonId).addEventListener('click', () => handleUpload('audio'));
  document.getElementById(configs.visualImages.buttonId).addEventListener('click', () => handleUpload('visualImages'));
  document.getElementById(configs.visualClips.buttonId).addEventListener('click', () => handleUpload('visualClips'));

  els.songsBody.addEventListener('click', event => {
    if (event.target.closest('.edit-song')) window.setTimeout(() => {
      setEnabledState();
      els.message.textContent = `DEV media uploads enabled for ${currentSongKey()}.`;
    }, 0);
  });
  els.newSong.addEventListener('click', () => window.setTimeout(setEnabledState, 0));

  setEnabledState();
})();
