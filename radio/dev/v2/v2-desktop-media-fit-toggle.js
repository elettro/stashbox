(() => {
  'use strict';

  if (window.StashboxDesktopMediaFitToggle) return;

  const desktop = window.matchMedia('(min-width: 900px)');
  const STORAGE_KEY = 'stashbox_v2_desktop_media_fit_mode';
  const CONTROL_CLASS = 'desktop-media-fit-control';
  const BUTTON_CLASS = 'desktop-media-fit-switch';
  let mode = readMode();
  let frame = 0;

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
          margin: 10px 0 7px;
          pointer-events: auto;
        }

        #v2App [data-player] .${CONTROL_CLASS} {
          margin-top: 4px;
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
          box-shadow: 0 8px 26px rgba(0,0,0,.28);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: border-color .18s ease, background .18s ease, color .18s ease;
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
          transition: background .18s ease, border-color .18s ease;
        }

        .${BUTTON_CLASS} .desktop-media-fit-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,.38);
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

        .${BUTTON_CLASS} .desktop-media-fit-fill,
        .${BUTTON_CLASS}[aria-pressed="true"] .desktop-media-fit-full {
          color: #fff;
        }

        .${BUTTON_CLASS}[aria-pressed="true"] .desktop-media-fit-fill,
        .${BUTTON_CLASS}:not([aria-pressed="true"]) .desktop-media-fit-full {
          color: rgba(255,255,255,.44);
        }

        body.desktop-media-fill-view #v2App [data-player] [data-mobile-vec-stage] {
          background-size: cover !important;
          background-position: center center !important;
          background-color: #050607 !important;
        }

        body.desktop-media-fill-view #v2App [data-player] [data-mobile-vec-stage] > img,
        body.desktop-media-fill-view #v2App [data-player] [data-mobile-vec-stage] > video,
        body.desktop-media-fill-view #v2App [data-player] [data-mobile-vec-stage] .v2-mobile-vec-media {
          object-fit: cover !important;
          object-position: center center !important;
        }

        body.desktop-media-full-view #v2App [data-player] [data-mobile-vec-stage] {
          background-size: contain !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-color: #050607 !important;
        }

        body.desktop-media-full-view #v2App [data-player] [data-mobile-vec-stage] > img,
        body.desktop-media-full-view #v2App [data-player] [data-mobile-vec-stage] > video,
        body.desktop-media-full-view #v2App [data-player] [data-mobile-vec-stage] .v2-mobile-vec-media {
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
          object-position: center center !important;
          transform: none !important;
          background: #050607 !important;
        }

        body.desktop-media-fill-view .artist-realm-stage {
          background-size: cover !important;
          background-position: center center !important;
          background-color: #050607 !important;
        }

        body.desktop-media-fill-view .artist-realm-stage .artist-realm-media {
          object-fit: cover !important;
          object-position: center center !important;
        }

        body.desktop-media-full-view .artist-realm-stage {
          background-size: contain !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-color: #050607 !important;
        }

        body.desktop-media-full-view .artist-realm-stage .artist-realm-media {
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
          object-position: center center !important;
          transform: none !important;
          background: #050607 !important;
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
    button.setAttribute('aria-label', 'Toggle between cropped fill view and complete 9 by 16 view');
    button.title = 'Switch between edge-to-edge fill and the complete uncropped artwork or video';
    button.innerHTML = `
      <span class="desktop-media-fit-fill">Fill</span>
      <span class="desktop-media-fit-track" aria-hidden="true"><i class="desktop-media-fit-thumb"></i></span>
      <span class="desktop-media-fit-full">Full 9:16</span>
    `;
    button.addEventListener('click', () => {
      mode = mode === 'full' ? 'fill' : 'full';
      saveMode(mode);
      applyMode(true);
    });

    wrapper.appendChild(button);
    return wrapper;
  }

  function placeMainControl() {
    const timeline = document.querySelector('#v2App [data-player] .v2-timeline');
    if (!timeline || timeline.parentElement?.querySelector(`:scope > .${CONTROL_CLASS}[data-desktop-media-fit-context="main"]`)) return;
    timeline.parentElement?.insertBefore(buildControl('main'), timeline);
  }

  function placeArtistControl() {
    const progress = document.querySelector('.artist-realm-player .artist-realm-progress-row');
    if (!progress || progress.parentElement?.querySelector(`:scope > .${CONTROL_CLASS}[data-desktop-media-fit-context="artist"]`)) return;
    progress.parentElement?.insertBefore(buildControl('artist'), progress);
  }

  function updateButtons() {
    const full = mode === 'full';
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
      button.setAttribute('aria-pressed', String(full));
      button.dataset.mediaFitMode = mode;
    });
  }

  function applyMode(announce = false) {
    if (!desktop.matches) {
      document.body.classList.remove('desktop-media-fill-view', 'desktop-media-full-view');
      return;
    }

    const full = mode === 'full';
    document.body.classList.toggle('desktop-media-full-view', full);
    document.body.classList.toggle('desktop-media-fill-view', !full);
    document.documentElement.dataset.desktopMediaFitMode = mode;
    updateButtons();

    document.querySelectorAll('#v2App [data-player], .artist-realm-player').forEach(player => {
      player.dataset.desktopMediaFitMode = mode;
    });

    window.dispatchEvent(new CustomEvent('stashbox:desktop-media-fit-change', {
      detail: { mode, full, userInitiated: announce }
    }));
  }

  function scan() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!desktop.matches) {
        applyMode(false);
        return;
      }
      installStyles();
      placeMainControl();
      placeArtistControl();
      applyMode(false);
    });
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  desktop.addEventListener?.('change', scan);
  window.addEventListener('resize', scan, { passive: true });

  installStyles();
  scan();

  window.StashboxDesktopMediaFitToggle = Object.freeze({
    getMode: () => mode,
    setMode: nextMode => {
      mode = nextMode === 'full' ? 'full' : 'fill';
      saveMode(mode);
      applyMode(false);
    },
    refresh: scan,
  });
})();