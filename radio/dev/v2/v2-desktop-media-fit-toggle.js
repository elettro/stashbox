(() => {
  'use strict';

  if (window.StashboxDesktopMediaFitToggle) return;

  const desktop = window.matchMedia('(min-width: 900px)');
  const STORAGE_KEY = 'stashbox_v2_desktop_media_fit_mode';
  const CONTROL_CLASS = 'desktop-media-fit-control';
  const BUTTON_CLASS = 'desktop-media-fit-switch';
  let mode = readMode();
  let scanTimer = 0;

  function readMode() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : 'fill';
    } catch (_) {
      return 'fill';
    }
  }

  function saveMode(nextMode) {
    try { localStorage.setItem(STORAGE_KEY, nextMode); }
    catch (_) {}
  }

  function installStyles() {
    if (document.getElementById('v2-desktop-media-fit-toggle-css')) return;
    const style = document.createElement('style');
    style.id = 'v2-desktop-media-fit-toggle-css';
    style.textContent = `
      @media (min-width: 900px) {
        .${CONTROL_CLASS} {
          position: relative;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          width: 100%;
          margin: 4px 0 7px;
          pointer-events: auto;
        }

        .artist-realm-bottom .${CONTROL_CLASS} {
          margin-top: 12px;
          margin-bottom: 4px;
        }

        .${BUTTON_CLASS} {
          position: relative;
          display: inline-grid;
          grid-template-columns: auto 38px auto;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 4px 9px;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 999px;
          background: rgba(5,6,7,.7);
          color: rgba(255,255,255,.62);
          font: 800 9px/1 Karla, sans-serif;
          letter-spacing: .08em;
          text-transform: uppercase;
          cursor: pointer;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .${BUTTON_CLASS}:hover,
        .${BUTTON_CLASS}:focus-visible {
          border-color: rgba(255,173,47,.75);
          color: #fff;
          outline: none;
        }

        .${BUTTON_CLASS} .desktop-media-fit-track {
          position: relative;
          width: 38px;
          height: 19px;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 999px;
          background: rgba(255,255,255,.1);
        }

        .${BUTTON_CLASS} .desktop-media-fit-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #fff;
          transition: transform .18s ease, background .18s ease;
        }

        .${BUTTON_CLASS}[aria-pressed="true"] {
          border-color: rgba(255,173,47,.72);
          background: rgba(22,15,6,.78);
          color: #fff;
        }

        .${BUTTON_CLASS}[aria-pressed="true"] .desktop-media-fit-track {
          border-color: #ffad2f;
          background: rgba(255,173,47,.34);
        }

        .${BUTTON_CLASS}[aria-pressed="true"] .desktop-media-fit-thumb {
          transform: translateX(19px);
          background: #ffad2f;
        }

        /* Only change fit on media that the existing player has already made active.
           Do not touch opacity, visibility, z-index, backgrounds, sources, playback,
           stage ownership, or runtime classes. */
        #v2App [data-player][data-desktop-media-fit-mode="fill"] [data-mobile-vec-stage] > img.is-active,
        #v2App [data-player][data-desktop-media-fit-mode="fill"] [data-mobile-vec-stage] > video.is-active,
        #v2App [data-player][data-desktop-media-fit-mode="fill"] [data-mobile-vec-stage] .v2-mobile-vec-media.is-active,
        .artist-realm-player[data-desktop-media-fit-mode="fill"] .artist-realm-media.is-active {
          object-fit: cover !important;
          object-position: center center !important;
        }

        #v2App [data-player][data-desktop-media-fit-mode="full"] [data-mobile-vec-stage] > img.is-active,
        #v2App [data-player][data-desktop-media-fit-mode="full"] [data-mobile-vec-stage] > video.is-active,
        #v2App [data-player][data-desktop-media-fit-mode="full"] [data-mobile-vec-stage] .v2-mobile-vec-media.is-active,
        .artist-realm-player[data-desktop-media-fit-mode="full"] .artist-realm-media.is-active {
          object-fit: contain !important;
          object-position: center center !important;
          transform: none !important;
        }
      }

      @media (max-width: 899px) {
        .${CONTROL_CLASS} { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildControl(context) {
    const wrapper = document.createElement('div');
    wrapper.className = CONTROL_CLASS;
    wrapper.dataset.desktopMediaFitContext = context;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', 'Toggle between cropped fill view and complete media view');
    button.title = 'Switch between edge-to-edge fill and complete uncropped artwork or video';
    button.innerHTML = `
      <span>Fill</span>
      <span class="desktop-media-fit-track" aria-hidden="true"><i class="desktop-media-fit-thumb"></i></span>
      <span>Full 9:16</span>
    `;
    button.addEventListener('click', () => {
      mode = mode === 'full' ? 'fill' : 'full';
      saveMode(mode);
      applyMode();
    });

    wrapper.appendChild(button);
    return wrapper;
  }

  function placeMainControl() {
    const timeline = document.querySelector('#v2App [data-player] .v2-timeline');
    if (!timeline) return;
    const parent = timeline.parentElement;
    if (!parent || parent.querySelector(`:scope > .${CONTROL_CLASS}[data-desktop-media-fit-context="main"]`)) return;
    parent.insertBefore(buildControl('main'), timeline);
  }

  function placeArtistControl() {
    const progress = document.querySelector('.artist-realm-player .artist-realm-progress-row');
    if (!progress) return;
    const parent = progress.parentElement;
    if (!parent || parent.querySelector(`:scope > .${CONTROL_CLASS}[data-desktop-media-fit-context="artist"]`)) return;
    parent.insertBefore(buildControl('artist'), progress);
  }

  function applyMode() {
    if (!desktop.matches) return;
    const full = mode === 'full';
    document.querySelectorAll('#v2App [data-player], .artist-realm-player').forEach(player => {
      player.dataset.desktopMediaFitMode = mode;
    });
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
      button.setAttribute('aria-pressed', String(full));
      button.dataset.mediaFitMode = mode;
    });
  }

  function scan() {
    if (!desktop.matches) return;
    installStyles();
    placeMainControl();
    placeArtistControl();
    applyMode();
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 60);
  }

  const observer = new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length)) scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  desktop.addEventListener?.('change', scheduleScan);
  window.addEventListener('resize', scheduleScan, { passive: true });

  scan();

  window.StashboxDesktopMediaFitToggle = Object.freeze({
    getMode: () => mode,
    setMode: nextMode => {
      mode = nextMode === 'full' ? 'full' : 'fill';
      saveMode(mode);
      applyMode();
    },
    refresh: scan,
  });
})();