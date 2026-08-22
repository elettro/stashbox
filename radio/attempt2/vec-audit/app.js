(() => {
  'use strict';

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const ADMIN_TOKEN_KEY = 'stashbox_admin_token_dev';
  const CONCURRENCY = 4;
  const state = { results: [], running: false, mode: 'public', adminToken: '' };

  const $ = selector => document.querySelector(selector);
  const ui = {
    run: $('[data-run]'), copy: $('[data-copy-zero]'), export: $('[data-export]'), mode: $('[data-mode]'), status: $('[data-status]'),
    total: $('[data-total]'), covered: $('[data-covered]'), zero: $('[data-zero]'), artwork: $('[data-artwork]'), errors: $('[data-errors]'),
    progressCard: $('[data-progress-card]'), progress: $('[data-progress]'), progressLabel: $('[data-progress-label]'), progressCount: $('[data-progress-count]'),
    search: $('[data-search]'), filter: $('[data-filter]'), sort: $('[data-sort]'), empty: $('[data-empty]'), tableWrap: $('[data-table-wrap]'), results: $('[data-results]')
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();
  const unique = values => [...new Set(values.filter(Boolean))];
  const array = value => Array.isArray(value) ? value : [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  }

  function unwrap(value) {
    if (typeof value?.body === 'string') {
      try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
    }
    return value;
  }

  function rows(value, keys) {
    value = unwrap(value);
    if (Array.isArray(value)) return value;
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
    if (value?.data && value.data !== value) return rows(value.data, keys);
    return [];
  }

  function recipeFrom(value) {
    value = unwrap(value) || {};
    return value.recipe || value.vec_recipe || value.data?.recipe || value.data || value;
  }

  function recipeFound(body, recipe) {
    body = unwrap(body) || {};
    if (body.found === false) return false;
    if (body.recipe || body.vec_recipe || body.data?.recipe) return true;
    return Boolean(recipe && typeof recipe === 'object' && ['visual_mode', 'folders', 'song_assets', 'borrowed_song_assets', 'artwork', 'shuffle'].some(key => key in recipe));
  }

  function songKey(song) { return clean(song.song_key || song.songKey || song.key || song.id); }
  function songTitle(song) { return clean(song.display_title || song.song_name || song.title || songKey(song) || 'Untitled Song'); }
  function songArtist(song) { return clean(song.artist || song.artist_name || 'Stashbox'); }

  function assetId(asset) { return clean(asset.id || asset.asset_id || asset.assetId || asset.s3_key || asset.key || asset.public_url || asset.url); }
  function assetUrl(asset) { return clean(asset.public_url || asset.url || asset.asset_url || asset.src || asset.file_url || asset.s3_url || asset.video_url || asset.clip_url || asset.media_url || asset.source_url); }
  function assetIsVideo(asset) {
    const type = lower(asset.asset_type || asset.type || asset.media_type || asset.content_type || asset.mime_type || asset.asset_kind || asset.file_type);
    return ['clip', 'video', 'video_clip', 'video-clip'].includes(type) || type.startsWith('video/') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }
  function assetActive(asset) {
    const status = lower(asset.status || 'active');
    return !['hidden', 'deleted', 'archived', 'inactive', 'disabled'].includes(status) && asset.hidden !== true && asset.deleted !== true && asset.active !== false;
  }

  function normalizeAssets(body) {
    const direct = rows(body, ['assets', 'items', 'results']);
    const clips = rows(body, ['clips']);
    const images = rows(body, ['images']);
    return [...direct, ...clips, ...images].filter(asset => asset && typeof asset === 'object');
  }

  function idSet(section, fields) {
    return new Set(fields.flatMap(field => array(section?.[field])).map(clean).filter(Boolean));
  }

  function selectGreenlitVideos(assets, section = {}) {
    const activeClips = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const activeImages = idSet(section, ['active_image_ids', 'activeImageIds']);
    const excludedClips = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    const explicitSelection = activeClips.size > 0 || activeImages.size > 0;
    return assets.filter(asset => {
      if (!assetActive(asset) || !assetIsVideo(asset) || !assetUrl(asset)) return false;
      const id = assetId(asset);
      const url = assetUrl(asset);
      if (excludedClips.has(id) || excludedClips.has(url)) return false;
      return !explicitSelection || activeClips.has(id) || activeClips.has(url);
    });
  }

  function selectedVideoIds(section = {}) {
    const active = idSet(section, ['active_clip_ids', 'activeClipIds']);
    const excluded = idSet(section, ['excluded_clip_ids', 'excludedClipIds']);
    return [...active].filter(id => !excluded.has(id));
  }

  function folderRecipes(recipe) {
    return [recipe?.folders, recipe?.approved_folders, recipe?.selected_folders, recipe?.visual_folders].find(Array.isArray) || [];
  }

  function borrowedRecipes(recipe) {
    const candidate = [recipe?.borrowed_song_assets, recipe?.borrowed_sources, recipe?.borrowedSongs, recipe?.borrowed_songs].find(value => Array.isArray(value) || Array.isArray(value?.sources) || Array.isArray(value?.songs));
    return Array.isArray(candidate) ? candidate : candidate?.sources || candidate?.songs || [];
  }

  function endpoints() {
    const admin = state.mode === 'admin';
    return {
      songs: admin ? `${API}/admin/songs` : `${API}/radio/songs`,
      recipe: key => `${API}/${admin ? 'admin' : 'radio'}/vec/recipe?song_key=${encodeURIComponent(key)}`,
      songAssets: key => `${API}/${admin ? 'admin' : 'radio'}/vec/song-assets?song_key=${encodeURIComponent(key)}`,
      folderAssets: id => `${API}/${admin ? 'admin' : 'radio'}/visuals/folders/${encodeURIComponent(id)}/assets`
    };
  }

  async function getJson(url) {
    const headers = state.mode === 'admin' ? { 'x-admin-token': state.adminToken } : {};
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', headers });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { message: text }; }
    if (!response.ok) {
      const error = new Error(body.error || body.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return unwrap(body);
  }

  async function auditSong(song) {
    const key = songKey(song);
    const title = songTitle(song);
    const artist = songArtist(song);
    const ep = endpoints();
    const errors = [];
    let recipeBody = {};
    let directBody = {};

    const [recipeResult, directResult] = await Promise.allSettled([getJson(ep.recipe(key)), getJson(ep.songAssets(key))]);
    if (recipeResult.status === 'fulfilled') recipeBody = recipeResult.value; else errors.push(`Recipe: ${recipeResult.reason.message}`);
    if (directResult.status === 'fulfilled') directBody = directResult.value; else errors.push(`Song assets: ${directResult.reason.message}`);

    const recipe = recipeFrom(recipeBody);
    const found = recipeFound(recipeBody, recipe);
    const artworkOnly = lower(recipe.visual_mode || recipe.visualMode) === 'artwork_only';
    const sources = [];
    const clips = [];
    const missingIds = [];

    if (!artworkOnly) {
      const directAssets = normalizeAssets(directBody);
      const directSection = recipe.song_assets || recipe.songAssets || {};
      const selectedDirect = selectGreenlitVideos(directAssets, directSection);
      clips.push(...selectedDirect.map(asset => ({ ...asset, source: 'Song assets' })));
      if (selectedDirect.length || selectedVideoIds(directSection).length) sources.push(`Song assets (${selectedDirect.length})`);
      const directIds = new Set(directAssets.map(assetId));
      selectedVideoIds(directSection).filter(id => !directIds.has(id)).forEach(id => missingIds.push(`song:${id}`));

      const folders = folderRecipes(recipe).filter(folder => folder?.enabled !== false && lower(folder?.status) !== 'hidden');
      const folderResults = await Promise.all(folders.map(async folder => {
        const id = clean(folder.folder_id || folder.visual_folder_id || folder.id);
        if (!id) return { id: '', clips: [], error: 'Approved folder has no ID.' };
        try {
          const body = await getJson(ep.folderAssets(id));
          const assets = normalizeAssets(body);
          const selected = selectGreenlitVideos(assets, folder);
          const assetIds = new Set(assets.map(assetId));
          selectedVideoIds(folder).filter(assetIdValue => !assetIds.has(assetIdValue)).forEach(assetIdValue => missingIds.push(`folder:${id}:${assetIdValue}`));
          return { id, name: clean(folder.folder_name || body.folder_name || id), clips: selected };
        } catch (error) {
          return { id, clips: [], error: error.message };
        }
      }));
      folderResults.forEach(result => {
        if (result.error) errors.push(`Folder ${result.id || '?'}: ${result.error}`);
        if (result.id) sources.push(`${result.name || result.id} (${result.clips.length})`);
        clips.push(...result.clips.map(asset => ({ ...asset, source: result.name || result.id })));
      });

      const borrowed = borrowedRecipes(recipe).filter(source => source?.enabled !== false);
      const borrowedResults = await Promise.all(borrowed.map(async source => {
        const sourceKey = clean(source.source_song_key || source.song_key || source.key || source.id);
        if (!sourceKey || sourceKey === key) return { key: sourceKey, clips: [] };
        try {
          const body = await getJson(ep.songAssets(sourceKey));
          const assets = normalizeAssets(body);
          const selected = selectGreenlitVideos(assets, source);
          const assetIds = new Set(assets.map(assetId));
          selectedVideoIds(source).filter(id => !assetIds.has(id)).forEach(id => missingIds.push(`borrowed:${sourceKey}:${id}`));
          return { key: sourceKey, clips: selected };
        } catch (error) {
          return { key: sourceKey, clips: [], error: error.message };
        }
      }));
      borrowedResults.forEach(result => {
        if (result.error) errors.push(`Borrowed ${result.key || '?'}: ${result.error}`);
        if (result.key) sources.push(`Borrowed ${result.key} (${result.clips.length})`);
        clips.push(...result.clips.map(asset => ({ ...asset, source: `Borrowed ${result.key}` })));
      });
    }

    const seen = new Set();
    const uniqueClips = clips.filter(asset => {
      const signature = lower(assetUrl(asset) || assetId(asset));
      if (!signature || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });

    let status = 'covered';
    let reason = `${uniqueClips.length} greenlit VEC video${uniqueClips.length === 1 ? '' : 's'} found.`;
    if (artworkOnly) { status = 'artwork_only'; reason = 'Recipe is intentionally set to Artwork Only.'; }
    else if (!uniqueClips.length) {
      status = errors.length ? 'error' : 'zero';
      if (!found && !normalizeAssets(directBody).length) reason = 'No VEC recipe and no direct video assets.';
      else if (folderRecipes(recipe).length && sources.length) reason = 'Approved sources exist, but none currently resolve to a greenlit video.';
      else if (missingIds.length) reason = 'Recipe selects video IDs that are missing from the returned asset records.';
      else reason = 'No active, included, non-excluded VEC videos were found.';
    }
    if (missingIds.length) reason += ` Missing selected IDs: ${missingIds.length}.`;
    if (errors.length) reason += ` Audit errors: ${errors.join(' | ')}`;

    return { key, title, artist, status, reason, videoCount: uniqueClips.length, sourceCount: sources.length, sources: unique(sources), missingIds: unique(missingIds), errors, recipeFound: found, artworkOnly };
  }

  async function mapLimit(items, limit, worker, onProgress) {
    const output = new Array(items.length);
    let cursor = 0;
    let completed = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try { output[index] = await worker(items[index], index); }
        catch (error) { output[index] = { key: songKey(items[index]), title: songTitle(items[index]), artist: songArtist(items[index]), status: 'error', reason: error.message, videoCount: 0, sourceCount: 0, sources: [], missingIds: [], errors: [error.message] }; }
        completed += 1;
        onProgress?.(completed, items.length, output[index]);
      }
    });
    await Promise.all(runners);
    return output;
  }

  function detectMode() {
    try { state.adminToken = clean(localStorage.getItem(ADMIN_TOKEN_KEY)); } catch (_) { state.adminToken = ''; }
    state.mode = state.adminToken ? 'admin' : 'public';
    ui.mode.textContent = state.mode === 'admin' ? 'Admin catalog audit' : 'Public catalog audit';
  }

  function totals() {
    return {
      total: state.results.length,
      covered: state.results.filter(row => row.status === 'covered').length,
      zero: state.results.filter(row => row.status === 'zero' || row.status === 'error').length,
      artwork: state.results.filter(row => row.status === 'artwork_only').length,
      errors: state.results.filter(row => row.errors.length).length
    };
  }

  function updateSummary() {
    const count = totals();
    ui.total.textContent = count.total;
    ui.covered.textContent = count.covered;
    ui.zero.textContent = count.zero;
    ui.artwork.textContent = count.artwork;
    ui.errors.textContent = count.errors;
  }

  function statusLabel(status) {
    return ({ covered: 'Covered', zero: 'Zero Videos', artwork_only: 'Artwork Only', error: 'Audit Error' })[status] || status;
  }

  function visibleResults() {
    const query = lower(ui.search.value);
    const filter = ui.filter.value;
    const sort = ui.sort.value;
    let rowsValue = state.results.filter(row => {
      const matchFilter = filter === 'all' || (filter === 'zero' ? ['zero', 'error'].includes(row.status) : row.status === filter);
      const haystack = lower([row.title, row.artist, row.key, row.reason, ...row.sources].join(' '));
      return matchFilter && (!query || haystack.includes(query));
    });
    rowsValue.sort((a, b) => {
      if (sort === 'artist') return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
      if (sort === 'video_count_desc') return b.videoCount - a.videoCount || a.title.localeCompare(b.title);
      if (sort === 'video_count_asc') return a.videoCount - b.videoCount || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
    return rowsValue;
  }

  function render() {
    const rowsValue = visibleResults();
    ui.empty.hidden = state.results.length > 0;
    ui.tableWrap.hidden = state.results.length === 0;
    ui.results.innerHTML = rowsValue.map(row => `<tr>
      <td><div class="song-cell"><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.artist)}</span><code>${escapeHtml(row.key)}</code></div></td>
      <td><span class="status ${escapeHtml(row.status)}">${escapeHtml(statusLabel(row.status))}</span></td>
      <td><span class="count">${row.videoCount}</span></td>
      <td><div class="sources">${row.sources.length ? row.sources.map(source => `<span class="source-pill">${escapeHtml(source)}</span>`).join('') : '<span class="source-pill">None</span>'}</div></td>
      <td><div class="notes">${escapeHtml(row.reason)}${row.missingIds.length ? `<small>${escapeHtml(row.missingIds.join(', '))}</small>` : ''}</div></td>
    </tr>`).join('');
    if (state.results.length && !rowsValue.length) ui.results.innerHTML = '<tr><td colspan="5">No songs match the current filter.</td></tr>';
  }

  function toast(message) {
    let node = document.querySelector('.toast');
    if (!node) { node = document.createElement('div'); node.className = 'toast'; document.body.appendChild(node); }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node.timer);
    node.timer = setTimeout(() => node.classList.remove('show'), 1800);
  }

  function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
  function exportCsv() {
    const header = ['song_key', 'title', 'artist', 'status', 'greenlit_video_count', 'approved_sources', 'reason', 'missing_selected_ids', 'audit_errors'];
    const lines = [header.map(csvCell).join(',')];
    state.results.forEach(row => lines.push([row.key, row.title, row.artist, row.status, row.videoCount, row.sources.join(' | '), row.reason, row.missingIds.join(' | '), row.errors.join(' | ')].map(csvCell).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stashbox-vec-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyZeroList() {
    const zeroRows = state.results.filter(row => ['zero', 'error'].includes(row.status));
    const text = zeroRows.map(row => `${row.title} — ${row.artist} [${row.key}] — ${row.reason}`).join('\n');
    await navigator.clipboard.writeText(text || 'No songs with zero greenlit VEC videos.');
    toast('Zero-video list copied.');
  }

  async function runAudit() {
    if (state.running) return;
    state.running = true;
    detectMode();
    ui.run.disabled = true;
    ui.copy.disabled = true;
    ui.export.disabled = true;
    ui.progressCard.hidden = false;
    ui.status.textContent = 'Loading the DEV song catalog…';
    ui.progress.value = 0;
    state.results = [];
    updateSummary();
    render();

    try {
      let songs;
      try {
        const body = await getJson(endpoints().songs);
        songs = rows(body, ['songs', 'items', 'data']);
      } catch (error) {
        if (state.mode === 'admin') {
          state.mode = 'public';
          ui.mode.textContent = 'Public catalog audit (admin token was rejected)';
          const body = await getJson(endpoints().songs);
          songs = rows(body, ['songs', 'items', 'data']);
        } else throw error;
      }

      songs = songs.filter(song => songKey(song));
      ui.progress.max = Math.max(1, songs.length);
      ui.progressLabel.textContent = 'Auditing recipes and approved VEC sources…';
      ui.progressCount.textContent = `0 / ${songs.length}`;

      state.results = await mapLimit(songs, CONCURRENCY, auditSong, (completed, total, row) => {
        ui.progress.value = completed;
        ui.progressCount.textContent = `${completed} / ${total}`;
        ui.status.textContent = `Checked ${row.title}`;
      });

      updateSummary();
      ui.filter.value = 'zero';
      render();
      const count = totals();
      ui.status.textContent = `Audit complete. ${count.zero} songs have zero greenlit videos or unresolved audit errors.`;
      ui.copy.disabled = false;
      ui.export.disabled = false;
    } catch (error) {
      ui.status.textContent = `Audit failed: ${error.message}`;
      ui.empty.innerHTML = `<strong>Audit failed.</strong><span>${escapeHtml(error.message)}</span>`;
      ui.empty.hidden = false;
      ui.tableWrap.hidden = true;
    } finally {
      state.running = false;
      ui.run.disabled = false;
    }
  }

  ui.run.addEventListener('click', runAudit);
  ui.copy.addEventListener('click', () => copyZeroList().catch(error => toast(error.message)));
  ui.export.addEventListener('click', exportCsv);
  ui.search.addEventListener('input', render);
  ui.filter.addEventListener('change', render);
  ui.sort.addEventListener('change', render);

  detectMode();
  runAudit();
})();