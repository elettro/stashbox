(() => {
  const SONGS_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/songs';
  const PLAY_EVENT = 'stashbox:account-song-play';
  const FALLBACK_ARTWORK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const STYLE_ID = 'stashbox-account-song-lists-style';
  let songsPromise = null;
  let scanQueued = false;

  function clean(value) {
    return String(value || '').trim();
  }

  function normalizeArtwork(value) {
    const url = clean(value);
    return url ? url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\?dl=[01]/, '') : '';
  }

  function normalizeSong(row) {
    return {
      song_key: clean(row?.song_key || row?.songKey || row?.id),
      song_id: clean(row?.song_id || row?.songId || row?.id),
      title: clean(row?.display_title || row?.title || row?.song_name),
      artist: clean(row?.artist || row?.artist_name || 'Stashbox'),
      artwork: normalizeArtwork(row?.resolved_artwork_url || row?.song_artwork_url || row?.artwork_url || row?.cover_art_url || row?.image_url)
    };
  }

  async function loadSongs() {
    if (songsPromise) return songsPromise;
    songsPromise = fetch(SONGS_URL, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Song catalog unavailable.')))
      .then(body => (Array.isArray(body?.songs) ? body.songs : []).map(normalizeSong))
      .catch(error => {
        console.warn('[account song lists] unable to load artwork catalog', error);
        return [];
      });
    return songsPromise;
  }

  function findSong(songs, title, artist) {
    const titleKey = clean(title).toLowerCase();
    const artistKey = clean(artist).toLowerCase();
    return songs.find(song => song.title.toLowerCase() === titleKey && (!artistKey || song.artist.toLowerCase() === artistKey))
      || songs.find(song => song.title.toLowerCase() === titleKey)
      || null;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radio-account-song-row {
        grid-template-columns: 62px minmax(0, 1fr) auto !important;
        align-items: center !important;
        gap: 13px !important;
        cursor: pointer;
        transition: border-color .16s ease, background .16s ease, transform .16s ease;
      }
      .radio-account-song-row:hover,
      .radio-account-song-row:focus-visible {
        border-color: rgba(240, 165, 0, .48) !important;
        background: linear-gradient(135deg, rgba(240, 165, 0, .08), rgba(255, 255, 255, .025)) !important;
        transform: translateY(-1px);
        outline: none;
      }
      .radio-account-song-thumb {
        width: 62px;
        height: 62px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 10px;
        background: #090909;
      }
      .radio-account-song-thumb img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .radio-account-song-row .radio-account-list-copy {
        min-width: 0;
      }
      .radio-account-song-row .radio-account-list-copy strong,
      .radio-account-song-row .radio-account-list-copy span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .radio-account-song-play-hint {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 68px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid rgba(240,165,0,.5);
        border-radius: 999px;
        color: #ffd064;
        background: rgba(240,165,0,.08);
        font: 800 12px/1 Karla, Arial, sans-serif;
        pointer-events: none;
      }
      .radio-account-song-row .radio-account-list-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      @media (max-width: 620px) {
        .radio-account-song-row {
          grid-template-columns: 54px minmax(0, 1fr) !important;
        }
        .radio-account-song-thumb {
          width: 54px;
          height: 54px;
        }
        .radio-account-song-row .radio-account-list-actions,
        .radio-account-song-play-hint {
          grid-column: 2;
          justify-self: start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function sectionSource(panel) {
    const heading = clean(panel?.querySelector('.radio-account-section-title')?.textContent).toLowerCase();
    if (heading.includes('favorite')) return 'favorites';
    if (heading.includes('history')) return 'history';
    return '';
  }

  async function enhanceRows() {
    scanQueued = false;
    injectStyle();
    const songs = await loadSongs();
    document.querySelectorAll('.radio-account-panel').forEach(panel => {
      const source = sectionSource(panel);
      if (!source) return;
      panel.querySelectorAll('.radio-account-list-item').forEach(row => {
        if (row.dataset.accountSongEnhanced === 'true') return;
        const copy = row.querySelector('.radio-account-list-copy');
        const title = clean(copy?.querySelector('strong')?.textContent);
        const meta = clean(copy?.querySelector('span')?.textContent);
        const artist = source === 'history' ? clean(meta.split('·')[0]) : meta;
        if (!title) return;
        const song = findSong(songs, title, artist);

        row.dataset.accountSongEnhanced = 'true';
        row.dataset.accountSongSource = source;
        row.dataset.accountSongTitle = song?.title || title;
        row.dataset.accountSongArtist = song?.artist || artist;
        row.dataset.accountSongKey = song?.song_key || '';
        row.dataset.accountSongId = song?.song_id || '';
        row.classList.add('radio-account-song-row');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', 'Play ' + (song?.title || title));

        const thumb = document.createElement('div');
        thumb.className = 'radio-account-song-thumb';
        const image = document.createElement('img');
        image.src = song?.artwork || FALLBACK_ARTWORK;
        image.alt = (song?.title || title) + ' artwork';
        image.loading = 'lazy';
        image.addEventListener('error', () => { image.src = FALLBACK_ARTWORK; }, { once: true });
        thumb.appendChild(image);
        row.insertBefore(thumb, copy || row.firstChild);

        let actions = row.querySelector('.radio-account-list-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'radio-account-list-actions';
          row.appendChild(actions);
        }
        const hint = document.createElement('span');
        hint.className = 'radio-account-song-play-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = '▶ Play';
        actions.insertBefore(hint, actions.firstChild);
      });
    });
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    window.requestAnimationFrame(enhanceRows);
  }

  function playRow(row) {
    const detail = {
      source: row.dataset.accountSongSource === 'history' ? 'history' : 'favorites',
      song_key: row.dataset.accountSongKey || '',
      song_id: row.dataset.accountSongId || '',
      display_title: row.dataset.accountSongTitle || '',
      artist: row.dataset.accountSongArtist || ''
    };
    document.querySelector('.radio-account-close')?.click();
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail })));
  }

  document.addEventListener('click', event => {
    const row = event.target.closest?.('.radio-account-song-row');
    if (!row || event.target.closest('button, a, input, select, textarea')) return;
    playRow(row);
  });

  document.addEventListener('keydown', event => {
    const row = event.target.closest?.('.radio-account-song-row');
    if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    event.preventDefault();
    playRow(row);
  });

  injectStyle();
  queueScan();
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
})();
