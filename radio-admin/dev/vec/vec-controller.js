(function () {
  const SONGS_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/songs';
  const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';

  const DEFAULT_ARTWORK_RULES = {
    startWithArtwork: true,
    startDurationSeconds: 4,
    endWithArtwork: true,
    endDurationSeconds: 4,
    rePresentArtwork: true,
    repeatEverySeconds: 60,
  };

  const DURATION_OPTIONS = [2, 3, 4, 5, 8, 10];
  const REPEAT_OPTIONS = [30, 45, 60, 90, 120];
  const SONG_CONTEXT_FIELDS = [
    'song_key',
    'song_name',
    'display_title',
    'artist',
    'album_name',
    'genre',
    'secondary_genre',
    'mood',
    'languages',
    'song_artwork_url',
    'audio_url',
    'video_link',
    'public_visibility',
  ];

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[char]));
  }

  function getFirstString(source, fields) {
    for (const field of fields) {
      const value = clean(source?.[field]);
      if (value) return value;
    }
    return '';
  }

  function secondsLabel(value) {
    return `${value} seconds`;
  }

  function onOffLabel(value) {
    return value ? 'ON' : 'OFF';
  }

  function optionMarkup(values, selectedValue) {
    return values
      .map((value) => `<option value="${value}"${value === selectedValue ? ' selected' : ''}>${secondsLabel(value)}</option>`)
      .join('');
  }

  function normalizeSongsResponse(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.songs)) return data.songs;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.body)) return data.body;
    if (typeof data?.body === 'string') {
      try {
        return normalizeSongsResponse(JSON.parse(data.body));
      } catch {
        return [];
      }
    }
    return [];
  }

  async function fetchSongs() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    if (!token) throw new Error('Save an admin token in the dev admin first.');

    const response = await fetch(SONGS_API_URL, { headers: { 'x-admin-token': token } });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok) {
      throw new Error(data?.error || data?.message || response.statusText || 'Could not load songs.');
    }
    return normalizeSongsResponse(data);
  }

  function getSongKey(song) {
    return getFirstString(song, ['song_key', 'key', 'slug', 'id', 'track_id', 'track_key']);
  }

  function getSongTitle(song) {
    return getFirstString(song, ['display_title', 'song_name', 'title', 'name']) || 'Untitled song';
  }

  function getArtworkUrl(songContext) {
    return getFirstString(songContext, ['song_artwork_url', 'artwork_url', 'cover_art_url', 'imageUrl']);
  }

  function createSongContext(song) {
    if (!song) return null;
    const context = {};
    SONG_CONTEXT_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(song, field)) context[field] = song[field];
    });
    context.song_key = clean(context.song_key) || getSongKey(song);
    context.display_title = clean(context.display_title) || getSongTitle(song);
    context.song_name = clean(context.song_name || song.song_name || song.title || song.name);
    context.artist = clean(context.artist);
    return context;
  }

  function sortSongs(songList) {
    return [...songList].sort((a, b) => {
      const bDate = Date.parse(b.updated_at || b.updatedAt || b.created_at || b.createdAt || '');
      const aDate = Date.parse(a.updated_at || a.updatedAt || a.created_at || a.createdAt || '');
      if (!Number.isNaN(bDate) && !Number.isNaN(aDate) && bDate !== aDate) return bDate - aDate;
      return getSongTitle(a).localeCompare(getSongTitle(b), undefined, { sensitivity: 'base' });
    });
  }

  function renderReadonlyToggle(label, value, name) {
    return `
      <label class="vec-field vec-toggle-field">
        <span>${label}</span>
        <button class="vec-toggle is-on" type="button" disabled aria-pressed="${value}" name="${name}">${onOffLabel(value)}</button>
      </label>
    `;
  }

  function renderReadonlySelect(label, name, value, options) {
    return `
      <label class="vec-field">
        <span>${label}</span>
        <select name="${name}" class="vec-select" disabled>
          ${optionMarkup(options, value)}
        </select>
      </label>
    `;
  }

  function renderPreview(songContext) {
    if (!songContext) {
      return '<span class="vec-preview-badge">Preview Mode</span><p>Select a song to preview its visual experience.</p>';
    }
    const title = songContext.display_title || songContext.song_name || 'Untitled song';
    const artworkUrl = getArtworkUrl(songContext);
    const genre = clean(songContext.genre);
    return `
      <span class="vec-preview-badge">Preview Mode</span>
      <div class="vec-preview-song">
        ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(title)} official artwork" />` : '<div class="vec-artwork-fallback" aria-label="No artwork available">No artwork</div>'}
        <div class="vec-preview-meta">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(songContext.artist || 'Artist unavailable')}</span>
          ${genre ? `<em>${escapeHtml(genre)}</em>` : ''}
        </div>
      </div>
    `;
  }

  function renderArtworkStatus(songContext) {
    const artworkUrl = getArtworkUrl(songContext);
    if (!songContext) return '<p class="vec-artwork-status">Select a song to inspect official artwork.</p>';
    return `
      <div class="vec-artwork-status ${artworkUrl ? 'has-artwork' : ''}">
        ${artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" alt="Official artwork thumbnail" />` : '<span class="vec-artwork-dot" aria-hidden="true"></span>'}
        <strong>${artworkUrl ? 'Artwork available' : 'No artwork available'}</strong>
      </div>
    `;
  }

  function renderSummary(songContext, artworkRules) {
    const title = songContext ? (songContext.display_title || songContext.song_name || 'Untitled song') : 'None';
    const artist = songContext?.artist || '—';
    const songKey = songContext?.song_key || '—';
    const artworkStatus = songContext && getArtworkUrl(songContext) ? 'Artwork available' : 'No artwork available';
    return `
      <p class="vec-empty-state">${songContext ? `Selected song context loaded for ${escapeHtml(title)}.` : 'No song selected yet.'}</p>
      <div class="vec-summary-grid">
        <div class="vec-summary-card"><strong>Selected song</strong><span>${escapeHtml(title)}</span></div>
        <div class="vec-summary-card"><strong>Artist</strong><span>${escapeHtml(artist)}</span></div>
        <div class="vec-summary-card"><strong>Song key</strong><span>${escapeHtml(songKey)}</span></div>
        <div class="vec-summary-card"><strong>Official artwork</strong><span>${artworkStatus}</span></div>
        <div class="vec-summary-card"><strong>Selected folders</strong><span>0 folders</span></div>
        <div class="vec-summary-card"><strong>Selected images</strong><span>0 images</span></div>
        <div class="vec-summary-card"><strong>Selected clips</strong><span>0 clips</span></div>
        <div class="vec-summary-card"><strong>Artwork rules</strong><span>Start ${onOffLabel(artworkRules.startWithArtwork)} · ${secondsLabel(artworkRules.startDurationSeconds)} · End ${onOffLabel(artworkRules.endWithArtwork)} · ${secondsLabel(artworkRules.endDurationSeconds)} · Re-present ${onOffLabel(artworkRules.rePresentArtwork)} every ${secondsLabel(artworkRules.repeatEverySeconds)}</span></div>
        <div class="vec-summary-card"><strong>Shuffle mode</strong><span>Randomize · avoid repeats</span></div>
      </div>`;
  }

  function initVecController(container, options = {}) {
    if (!container) return null;
    const initialSongContext = options.songContext ? createSongContext(options.songContext) : null;
    const state = { mode: options.mode || 'lab', songKey: options.songKey || initialSongContext?.song_key || '', songs: [], songContext: initialSongContext, artworkRules: { ...DEFAULT_ARTWORK_RULES, ...(options.artworkRules || {}) } };

    container.innerHTML = `
      <section class="card vec-section" aria-labelledby="songSelectorHeading">
        <div class="panel-header vec-section-header"><div><p class="eyebrow">Song</p><h2 id="songSelectorHeading">Select Song</h2><p class="vec-copy">Select a song to simulate the song context for this VEC Lab.</p></div></div>
        <label class="vec-label" for="songSelect">Song</label>
        <select id="songSelect" class="vec-select" data-vec-song-select><option value="">Loading songs...</option></select>
        <p class="vec-microcopy" data-vec-song-status>Loading real Songs CMS data from the existing dev admin songs API.</p>
      </section>
      <section class="card vec-section" aria-labelledby="vecPreviewHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Preview</p><h2 id="vecPreviewHeading">VEC Preview</h2><p class="vec-copy">Preview only — does not count plays, ads, skips, or stats.</p></div></div><div class="vec-preview-window" aria-label="Visual experience preview placeholder" data-vec-preview></div><div class="vec-button-row" aria-label="Preview controls"><button type="button" disabled>Play Preview</button><button type="button" disabled>Pause</button><button type="button" disabled>Restart</button><button type="button" disabled>Next Visual</button></div></section>
      <section class="card vec-section" aria-labelledby="artworkControllerHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Artwork</p><h2 id="artworkControllerHeading">Official Song Artwork Controller</h2><p class="vec-copy">Plan how the official song artwork anchors the visual experience at the start, end, and throughout playback.</p></div></div><div data-vec-artwork-status></div><div class="vec-control-grid" role="group" aria-label="Official song artwork controller">${renderReadonlyToggle('Start with artwork', state.artworkRules.startWithArtwork, 'start_with_artwork')}${renderReadonlySelect('Start duration', 'start_artwork_duration_seconds', state.artworkRules.startDurationSeconds, DURATION_OPTIONS)}${renderReadonlyToggle('End with artwork', state.artworkRules.endWithArtwork, 'end_with_artwork')}${renderReadonlySelect('End duration', 'end_artwork_duration_seconds', state.artworkRules.endDurationSeconds, DURATION_OPTIONS)}${renderReadonlyToggle('Re-present artwork', state.artworkRules.rePresentArtwork, 're_present_artwork')}${renderReadonlySelect('Repeat every', 'repeat_artwork_every_seconds', state.artworkRules.repeatEverySeconds, REPEAT_OPTIONS)}</div></section>
      <section class="card vec-section" aria-labelledby="songAssetsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Song Assets</p><h2 id="songAssetsHeading">Song-Only Visual Assets</h2><p class="vec-copy">Assets uploaded here will apply only to the selected song.</p></div></div><div class="vec-two-column"><article class="vec-placeholder-panel"><h3>Image upload placeholder</h3><p>Song-specific still image upload wiring will come later.</p></article><article class="vec-placeholder-panel"><h3>Video clip upload placeholder</h3><p>Song-specific clip upload wiring will come later.</p></article></div><div class="vec-thumbnail-grid" aria-label="Empty thumbnail grid placeholder"><p>No song-only visual assets yet.</p></div></section>
      <section class="card vec-section" aria-labelledby="folderCardsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Folders</p><h2 id="folderCardsHeading">Visual Folders</h2><p class="vec-copy">Select reusable Visual Library folders to include in this song’s VEC recipe.</p></div></div><div class="vec-folder-grid">${['Folder name placeholder', 'Folder name placeholder', 'Folder name placeholder'].map((name) => `<article class="vec-folder-card"><div><h3>${name}</h3><p>Image count placeholder · Video count placeholder</p></div><button type="button" class="vec-toggle is-off" disabled aria-pressed="false">OFF</button></article>`).join('')}</div></section>
      <section class="card vec-section" aria-labelledby="shuffleSettingsHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Shuffle</p><h2 id="shuffleSettingsHeading">Controlled Shuffle Settings</h2><p class="vec-copy">Set basic rules for how selected visuals should rotate during the song.</p></div></div><div class="vec-control-grid" role="group" aria-label="Controlled shuffle settings"><label class="vec-field"><span>Order mode</span><select class="vec-select" disabled><option>Manual Order</option><option selected>Randomize</option><option>Newest First</option></select></label><label class="vec-field"><span>Max assets from same folder in a row</span><input type="text" value="1" readonly disabled /></label><label class="vec-field"><span>Max assets per folder per play</span><input type="text" value="All" readonly disabled /></label><label class="vec-field"><span>Avoid repeating same asset</span><button class="vec-toggle is-on" type="button" disabled aria-pressed="true">ON</button></label></div></section>
      <section class="card vec-section" aria-labelledby="recipeSummaryHeading"><div class="panel-header vec-section-header"><div><p class="eyebrow">Recipe</p><h2 id="recipeSummaryHeading">Recipe Summary</h2></div></div><div data-vec-summary></div></section>
      <section class="card vec-section vec-save-panel" aria-labelledby="vecSaveHeading"><div><p class="eyebrow">Save / Reset</p><h2 id="vecSaveHeading">Save / Reset</h2><p class="vec-copy">Recipe saving will be wired in a later PR.</p></div><div class="vec-button-row"><button type="button" disabled>Save VEC Recipe</button><button type="button" disabled>Reset Unsaved Changes</button></div></section>`;

    const elements = {
      select: container.querySelector('[data-vec-song-select]'),
      status: container.querySelector('[data-vec-song-status]'),
      preview: container.querySelector('[data-vec-preview]'),
      artworkStatus: container.querySelector('[data-vec-artwork-status]'),
      summary: container.querySelector('[data-vec-summary]'),
    };

    function renderDynamic() {
      elements.preview.innerHTML = renderPreview(state.songContext);
      elements.artworkStatus.innerHTML = renderArtworkStatus(state.songContext);
      elements.summary.innerHTML = renderSummary(state.songContext, state.artworkRules);
    }

    function setSongContext(songOrContext) {
      state.songContext = createSongContext(songOrContext);
      state.songKey = state.songContext?.song_key || '';
      if (elements.select && elements.select.value !== state.songKey) elements.select.value = state.songKey;
      renderDynamic();
      return state.songContext;
    }

    elements.select.addEventListener('change', () => {
      const selected = state.songs.find((song) => getSongKey(song) === elements.select.value);
      setSongContext(selected || null);
    });

    renderDynamic();
    container.dataset.vecMode = state.mode;

    if (state.mode === 'lab') {
      fetchSongs().then((songList) => {
        state.songs = sortSongs(songList).filter((song) => getSongKey(song));
        elements.select.innerHTML = `<option value="">Select a song...</option>${state.songs.map((song) => {
          const songKey = getSongKey(song);
          const artist = clean(song.artist);
          const label = `${getSongTitle(song)}${artist ? ` — ${artist}` : ''}`;
          return `<option value="${escapeHtml(songKey)}">${escapeHtml(label)}</option>`;
        }).join('')}`;
        elements.select.disabled = false;
        elements.status.textContent = `Loaded ${state.songs.length} song${state.songs.length === 1 ? '' : 's'} from the existing dev Songs CMS API.`;
        if (state.songKey) {
          const initialSong = state.songs.find((song) => getSongKey(song) === state.songKey);
          if (initialSong) setSongContext(initialSong);
        }
      }).catch((error) => {
        elements.select.innerHTML = '<option value="">Songs unavailable</option>';
        elements.select.disabled = true;
        elements.status.textContent = error.message;
      });
    } else {
      elements.select.disabled = true;
      elements.status.textContent = 'Embedded mode receives song context from its parent page.';
    }

    return { state, setSongContext, getSongContext: () => state.songContext };
  }

  window.StashboxVecController = { initVecController, DEFAULT_ARTWORK_RULES };
})();
