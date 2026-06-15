(function () {
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

  function initVecController(container, options = {}) {
    if (!container) return null;

    const mode = options.mode || 'lab';
    const songKey = options.songKey || '';
    const artworkRules = { ...DEFAULT_ARTWORK_RULES, ...(options.artworkRules || {}) };

    container.innerHTML = `
      <section class="card vec-section" aria-labelledby="songSelectorHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Song</p>
            <h2 id="songSelectorHeading">Select Song</h2>
            <p class="vec-copy">Select a song to simulate the song context for this VEC Lab.</p>
          </div>
        </div>
        <label class="vec-label" for="songSelect">Song</label>
        <select id="songSelect" class="vec-select" disabled data-vec-song-select>
          <option selected>${songKey ? 'Song context supplied' : 'Select a song...'}</option>
        </select>
        <p class="vec-microcopy">Standalone lab selector only. Embedded mode will receive the current song from the song form.</p>
      </section>

      <section class="card vec-section" aria-labelledby="vecPreviewHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Preview</p>
            <h2 id="vecPreviewHeading">VEC Preview</h2>
            <p class="vec-copy">Preview only — does not count plays, ads, skips, or stats.</p>
          </div>
        </div>
        <div class="vec-preview-window" aria-label="Visual experience preview placeholder">
          <span class="vec-preview-badge">Preview Mode</span>
          <p>Select a song to preview its visual experience.</p>
        </div>
        <div class="vec-button-row" aria-label="Preview controls">
          <button type="button" disabled>Play Preview</button>
          <button type="button" disabled>Pause</button>
          <button type="button" disabled>Restart</button>
          <button type="button" disabled>Next Visual</button>
        </div>
      </section>

      <section class="card vec-section" aria-labelledby="artworkControllerHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Artwork</p>
            <h2 id="artworkControllerHeading">Official Song Artwork Controller</h2>
            <p class="vec-copy">Plan how the official song artwork anchors the visual experience at the start, end, and throughout playback.</p>
          </div>
        </div>
        <div class="vec-control-grid" role="group" aria-label="Official song artwork controller">
          ${renderReadonlyToggle('Start with artwork', artworkRules.startWithArtwork, 'start_with_artwork')}
          ${renderReadonlySelect('Start duration', 'start_artwork_duration_seconds', artworkRules.startDurationSeconds, DURATION_OPTIONS)}
          ${renderReadonlyToggle('End with artwork', artworkRules.endWithArtwork, 'end_with_artwork')}
          ${renderReadonlySelect('End duration', 'end_artwork_duration_seconds', artworkRules.endDurationSeconds, DURATION_OPTIONS)}
          ${renderReadonlyToggle('Re-present artwork', artworkRules.rePresentArtwork, 're_present_artwork')}
          ${renderReadonlySelect('Repeat every', 'repeat_artwork_every_seconds', artworkRules.repeatEverySeconds, REPEAT_OPTIONS)}
        </div>
      </section>

      <section class="card vec-section" aria-labelledby="songAssetsHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Song Assets</p>
            <h2 id="songAssetsHeading">Song-Only Visual Assets</h2>
            <p class="vec-copy">Assets uploaded here will apply only to the selected song.</p>
          </div>
        </div>
        <div class="vec-two-column">
          <article class="vec-placeholder-panel"><h3>Image upload placeholder</h3><p>Song-specific still image upload wiring will come later.</p></article>
          <article class="vec-placeholder-panel"><h3>Video clip upload placeholder</h3><p>Song-specific clip upload wiring will come later.</p></article>
        </div>
        <div class="vec-thumbnail-grid" aria-label="Empty thumbnail grid placeholder"><p>No song-only visual assets yet.</p></div>
      </section>

      <section class="card vec-section" aria-labelledby="folderCardsHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Folders</p>
            <h2 id="folderCardsHeading">Visual Folders</h2>
            <p class="vec-copy">Select reusable Visual Library folders to include in this song’s VEC recipe.</p>
          </div>
        </div>
        <div class="vec-folder-grid">
          ${['Folder name placeholder', 'Folder name placeholder', 'Folder name placeholder'].map((name, index) => `
            <article class="vec-folder-card">
              <div><h3>${name}</h3><p>Image count placeholder · Video count placeholder</p></div>
              <button type="button" class="vec-toggle is-off" disabled aria-pressed="false">OFF</button>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="card vec-section" aria-labelledby="shuffleSettingsHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Shuffle</p>
            <h2 id="shuffleSettingsHeading">Controlled Shuffle Settings</h2>
            <p class="vec-copy">Set basic rules for how selected visuals should rotate during the song.</p>
          </div>
        </div>
        <div class="vec-control-grid" role="group" aria-label="Controlled shuffle settings">
          <label class="vec-field"><span>Order mode</span><select class="vec-select" disabled><option>Manual Order</option><option selected>Randomize</option><option>Newest First</option></select></label>
          <label class="vec-field"><span>Max assets from same folder in a row</span><input type="text" value="1" readonly disabled /></label>
          <label class="vec-field"><span>Max assets per folder per play</span><input type="text" value="All" readonly disabled /></label>
          <label class="vec-field"><span>Avoid repeating same asset</span><button class="vec-toggle is-on" type="button" disabled aria-pressed="true">ON</button></label>
        </div>
      </section>

      <section class="card vec-section" aria-labelledby="recipeSummaryHeading">
        <div class="panel-header vec-section-header">
          <div>
            <p class="eyebrow">Recipe</p>
            <h2 id="recipeSummaryHeading">Recipe Summary</h2>
          </div>
        </div>
        <p class="vec-empty-state">No song selected yet.</p>
        <div class="vec-summary-grid">
          <div class="vec-summary-card"><strong>Selected song</strong><span>${songKey || 'None'}</span></div>
          <div class="vec-summary-card"><strong>Selected folders</strong><span>0 folders</span></div>
          <div class="vec-summary-card"><strong>Selected images</strong><span>0 images</span></div>
          <div class="vec-summary-card"><strong>Selected clips</strong><span>0 clips</span></div>
          <div class="vec-summary-card"><strong>Artwork rules</strong><span>Start ${onOffLabel(artworkRules.startWithArtwork)} · ${secondsLabel(artworkRules.startDurationSeconds)} · End ${onOffLabel(artworkRules.endWithArtwork)} · ${secondsLabel(artworkRules.endDurationSeconds)} · Re-present ${onOffLabel(artworkRules.rePresentArtwork)} every ${secondsLabel(artworkRules.repeatEverySeconds)}</span></div>
          <div class="vec-summary-card"><strong>Shuffle mode</strong><span>Randomize · avoid repeats</span></div>
        </div>
      </section>

      <section class="card vec-section vec-save-panel" aria-labelledby="vecSaveHeading">
        <div>
          <p class="eyebrow">Save / Reset</p>
          <h2 id="vecSaveHeading">Save / Reset</h2>
          <p class="vec-copy">Recipe saving will be wired in a later PR.</p>
        </div>
        <div class="vec-button-row">
          <button type="button" disabled>Save VEC Recipe</button>
          <button type="button" disabled>Reset Unsaved Changes</button>
        </div>
      </section>
    `;

    container.dataset.vecMode = mode;
    return { mode, songKey, artworkRules };
  }

  window.StashboxVecController = { initVecController, DEFAULT_ARTWORK_RULES };
})();
