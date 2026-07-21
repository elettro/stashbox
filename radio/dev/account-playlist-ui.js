(() => {
  const STYLE_ID = 'stashbox-account-playlist-ui';
  const PLAY_EVENT = 'stashbox:playlist-play';
  let scanQueued = false;

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value || ''));
    return String(value || '').replace(/["\\]/g, '\\$&');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radio-playlist-summary-row {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto auto !important;
        align-items: center !important;
        gap: 12px !important;
      }

      .radio-playlist-summary-row > .radio-account-list-copy {
        min-width: 0;
      }

      .radio-playlist-list-playback-actions {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex: 0 0 auto;
      }

      .radio-playlist-list-playback-actions button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 82px;
        height: 38px;
        min-height: 38px;
        margin: 0;
        padding: 0 13px;
        border-radius: 999px;
        font-weight: 900;
        white-space: nowrap;
      }

      .radio-playlist-summary-play {
        border-color: #f0a500 !important;
        background: #f0a500 !important;
        color: #161009 !important;
      }

      .radio-playlist-summary-shuffle {
        border-color: rgba(240, 165, 0, .62) !important;
        background: rgba(240, 165, 0, .08) !important;
        color: #ffd064 !important;
      }

      .radio-playlist-list-playback-actions button:disabled {
        opacity: .42;
        cursor: not-allowed;
      }

      .radio-playlist-list-playback-actions button[data-playlist-loading='true'] {
        cursor: wait;
        opacity: .75;
      }

      .radio-playlist-detail {
        display: grid;
        gap: 14px;
        margin-top: 6px;
      }

      .radio-playlist-detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 16px;
        border: 1px solid rgba(240, 165, 0, .28);
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(240, 165, 0, .09), rgba(255, 255, 255, .025));
      }

      .radio-playlist-detail-header > div:first-child {
        min-width: 0;
      }

      .radio-playlist-detail-kicker {
        margin: 0 0 5px;
        color: #f0a500;
        font: 800 11px/1 Karla, Arial, sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      .radio-playlist-detail-header .radio-account-section-title {
        margin: 0;
        color: #fff;
        font-size: 22px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .radio-playlist-detail-count {
        display: block;
        margin-top: 5px;
        color: #aaa;
        font: 600 13px/1.2 Karla, Arial, sans-serif;
      }

      .radio-playlist-playback-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 9px;
        flex: 0 0 auto;
      }

      .radio-playlist-playback-actions button {
        min-width: 94px;
        height: 40px;
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 15px;
      }

      .radio-playlist-shuffle-button {
        border-color: rgba(240, 165, 0, .5) !important;
        color: #ffd064 !important;
        background: rgba(240, 165, 0, .08) !important;
      }

      .radio-playlist-track-list {
        display: grid;
        gap: 9px;
      }

      .radio-playlist-track {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        align-items: center;
        gap: 13px;
        min-width: 0;
        padding: 9px 13px 9px 9px;
        border: 1px solid rgba(255, 255, 255, .13);
        border-radius: 13px;
        background: linear-gradient(135deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, .018));
        transition: border-color .16s ease, background .16s ease, transform .16s ease;
      }

      .radio-playlist-track:hover {
        border-color: rgba(240, 165, 0, .38);
        background: linear-gradient(135deg, rgba(240, 165, 0, .065), rgba(255, 255, 255, .025));
        transform: translateY(-1px);
      }

      .radio-playlist-track-artwork {
        position: relative;
        width: 64px;
        height: 64px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, .14);
        border-radius: 10px;
        background: #090909;
      }

      .radio-playlist-track-artwork img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .radio-playlist-track-artwork span {
        position: absolute;
        left: 5px;
        bottom: 5px;
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 999px;
        color: #111;
        background: #f0a500;
        font: 900 10px/1 Karla, Arial, sans-serif;
        box-shadow: 0 2px 7px rgba(0, 0, 0, .45);
      }

      .radio-playlist-track-copy {
        min-width: 0;
      }

      .radio-playlist-track-copy strong,
      .radio-playlist-track-copy span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .radio-playlist-track-copy strong {
        color: #fff;
        font: 800 16px/1.2 Karla, Arial, sans-serif;
      }

      .radio-playlist-track-copy span {
        margin-top: 6px;
        color: #aeb5bd;
        font: 600 13px/1.2 Karla, Arial, sans-serif;
      }

      @media (max-width: 760px) {
        .radio-playlist-summary-row {
          grid-template-columns: minmax(0, 1fr) !important;
          align-items: stretch !important;
        }

        .radio-playlist-list-playback-actions,
        .radio-playlist-summary-row > .radio-account-list-actions {
          width: 100%;
          justify-content: flex-start;
        }

        .radio-playlist-list-playback-actions button {
          flex: 1 1 0;
          min-width: 0;
        }
      }

      @media (max-width: 620px) {
        .radio-playlist-detail-header {
          align-items: flex-start;
          flex-direction: column;
          padding: 14px;
        }

        .radio-playlist-playback-actions {
          width: 100%;
          justify-content: stretch;
        }

        .radio-playlist-playback-actions button {
          flex: 1 1 0;
          min-width: 0;
        }

        .radio-playlist-track {
          grid-template-columns: 56px minmax(0, 1fr);
          gap: 11px;
        }

        .radio-playlist-track-artwork {
          width: 56px;
          height: 56px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function playlistIsEmpty(row) {
    const countText = String(row.querySelector('.radio-account-list-copy span')?.textContent || '').trim();
    return /^0\s+songs?\b/i.test(countText);
  }

  function createPlaybackButton(playlistId, mode, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = mode === 'shuffle'
      ? 'radio-playlist-summary-shuffle'
      : 'radio-playlist-summary-play';
    button.dataset.summaryPlaylist = playlistId;
    button.dataset.summaryMode = mode;
    button.disabled = disabled;
    button.innerHTML = mode === 'shuffle'
      ? '<span aria-hidden="true">⇄</span> Shuffle'
      : '<span aria-hidden="true">▶</span> Play';
    return button;
  }

  function enhancePlaylistRows() {
    document.querySelectorAll('.radio-account-content [data-open-playlist]').forEach(openButton => {
      const row = openButton.closest('.radio-account-list-item');
      const playlistId = String(openButton.dataset.openPlaylist || '').trim();
      if (!row || !playlistId || row.querySelector('.radio-playlist-list-playback-actions')) return;

      row.classList.add('radio-playlist-summary-row');
      const playback = document.createElement('div');
      playback.className = 'radio-playlist-list-playback-actions';
      playback.setAttribute('aria-label', 'Playlist playback controls');
      const disabled = playlistIsEmpty(row);
      playback.append(
        createPlaybackButton(playlistId, 'ordered', disabled),
        createPlaybackButton(playlistId, 'shuffle', disabled)
      );

      const actions = row.querySelector('.radio-account-list-actions');
      if (actions) row.insertBefore(playback, actions);
      else row.appendChild(playback);
    });
  }

  function queueEnhance() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      enhancePlaylistRows();
    });
  }

  function detailControlSelector(playlistId, mode) {
    const attribute = mode === 'shuffle' ? 'data-shuffle-playlist' : 'data-play-playlist';
    return `[${attribute}="${cssEscape(playlistId)}"]`;
  }

  function waitForDetailControl(playlistId, mode, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const selector = detailControlSelector(playlistId, mode);
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const control = document.querySelector(selector);
        if (!control) return;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(control);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error('The playlist could not be loaded for playback.'));
      }, timeoutMs);
    });
  }

  async function startPlaylistFromSummary(button) {
    const playlistId = String(button.dataset.summaryPlaylist || '').trim();
    const mode = button.dataset.summaryMode === 'shuffle' ? 'shuffle' : 'ordered';
    if (!playlistId || button.disabled) return;

    const row = button.closest('.radio-playlist-summary-row');
    const openButton = row?.querySelector(`[data-open-playlist="${cssEscape(playlistId)}"]`);
    if (!openButton) return;

    const originalMarkup = button.innerHTML;
    row.querySelectorAll('.radio-playlist-list-playback-actions button').forEach(control => {
      control.disabled = true;
      control.dataset.playlistLoading = 'true';
    });
    button.textContent = 'Loading…';

    try {
      const existing = document.querySelector(detailControlSelector(playlistId, mode));
      if (existing) {
        existing.click();
        return;
      }
      openButton.click();
      const detailControl = await waitForDetailControl(playlistId, mode);
      detailControl.click();
    } catch (error) {
      console.error('[playlists] summary playback failed', error);
      button.title = error.message || 'Playlist playback failed.';
      button.innerHTML = originalMarkup;
      row.querySelectorAll('.radio-playlist-list-playback-actions button').forEach(control => {
        control.disabled = playlistIsEmpty(row);
        delete control.dataset.playlistLoading;
      });
    }
  }

  function scrollPlayerIntoView() {
    window.setTimeout(() => {
      const player = document.querySelector('.player-info, .player-media, .media-window, .player-shell');
      player?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, 80);
  }

  injectStyles();
  queueEnhance();

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-summary-playlist]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    startPlaylistFromSummary(button);
  }, true);

  window.addEventListener(PLAY_EVENT, scrollPlayerIntoView);
  new MutationObserver(queueEnhance).observe(document.body, { childList: true, subtree: true });
})();
