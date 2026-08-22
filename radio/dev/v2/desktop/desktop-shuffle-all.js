(() => {
  'use strict';

  if (!document.body.classList.contains('desktop-clean-runtime')) return;

  const desktopQuery = window.matchMedia('(min-width: 900px)');
  const app = document.getElementById('v2App');
  if (!app) return;

  const SHUFFLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 7h3.5c2.3 0 3.7 1.1 5.2 3.2l2.6 3.6C16.8 15.9 18.2 17 20.5 17H21M16 21h5v-5M4 17h3.5c1.6 0 2.7-.5 3.8-1.7M14.8 8.7C16.3 6.9 17.7 6 20 6h1"/></svg>';

  let enabled = false;
  let order = [];
  let cursor = -1;
  let syntheticSongClick = false;
  let catalogKeys = [];

  function installStyles() {
    if (document.getElementById('desktopShuffleAllStyles')) return;
    const style = document.createElement('style');
    style.id = 'desktopShuffleAllStyles';
    style.textContent = `
      .desktop-clean-runtime .v2-player-controls { position: relative; }
      .desktop-clean-runtime .desktop-shuffle-all {
        position: absolute !important;
        left: calc(50% - 224px);
        top: 50%;
        transform: translate(-50%, -50%);
        width: 46px;
        height: 46px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(255,255,255,.92);
        cursor: pointer;
        z-index: 8;
        opacity: .9;
        transition: color 120ms ease, opacity 120ms ease, transform 120ms ease, filter 120ms ease;
      }
      .desktop-clean-runtime .desktop-shuffle-all svg {
        width: 25px;
        height: 25px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.9;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }
      .desktop-clean-runtime .desktop-shuffle-all:hover,
      .desktop-clean-runtime .desktop-shuffle-all:focus-visible {
        color: #ff9f1a;
        opacity: 1;
        outline: none;
        filter: drop-shadow(0 0 7px rgba(255,159,26,.42));
      }
      .desktop-clean-runtime .desktop-shuffle-all.is-active {
        color: #ff9f1a;
        opacity: 1;
        filter: drop-shadow(0 0 8px rgba(255,159,26,.58));
      }
      .desktop-clean-runtime .desktop-shuffle-all:active {
        transform: translate(-50%, -50%) scale(.92);
      }
      @media (max-width: 899px) {
        .desktop-clean-runtime .desktop-shuffle-all { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function captureCatalog() {
    const keys = [];
    const seen = new Set();
    app.querySelectorAll('[data-song]').forEach(node => {
      const key = String(node.dataset.song || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      keys.push(key);
    });
    if (keys.length > catalogKeys.length) catalogKeys = keys;
  }

  function currentKey() {
    const title = String(app.querySelector('[data-ptitle]')?.textContent || '').trim();
    const artist = String(app.querySelector('[data-partist]')?.textContent || '').trim();
    if (!title) return '';

    const match = Array.from(app.querySelectorAll('[data-song]')).find(node => {
      const cardTitle = String(node.querySelector('h3')?.textContent || node.querySelector('strong')?.textContent || '').trim();
      const cardArtist = String(node.querySelector('p')?.textContent || node.querySelector('small')?.textContent || '').trim();
      return cardTitle === title && (!artist || cardArtist.includes(artist));
    });
    return String(match?.dataset.song || '').trim();
  }

  function shuffled(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function updateButton() {
    const button = app.querySelector('[data-desktop-shuffle-all]');
    if (!button) return;
    button.classList.toggle('is-active', enabled);
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.setAttribute('aria-label', enabled ? 'Shuffle all on' : 'Shuffle all');
    button.title = enabled ? 'Shuffle All: On (S skips)' : 'Shuffle All (S)';
  }

  function disableShuffle() {
    enabled = false;
    order = [];
    cursor = -1;
    updateButton();
  }

  function triggerSong(key) {
    if (!key) return false;
    let target = Array.from(app.querySelectorAll('[data-song]')).find(node => node.dataset.song === key);
    let proxy = null;

    if (!target) {
      proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.hidden = true;
      proxy.dataset.song = key;
      app.appendChild(proxy);
      target = proxy;
    }

    syntheticSongClick = true;
    try {
      target.click();
    } finally {
      syntheticSongClick = false;
      proxy?.remove();
    }
    return true;
  }

  function playAt(index) {
    if (!enabled || !order.length) return;
    cursor = (index + order.length) % order.length;
    triggerSong(order[cursor]);
  }

  function activateShuffle() {
    captureCatalog();
    if (!catalogKeys.length) return;

    const current = currentKey();
    order = shuffled(catalogKeys);

    if (current && order.length > 1 && order[0] === current) {
      const alternate = order.findIndex(key => key !== current);
      if (alternate > 0) [order[0], order[alternate]] = [order[alternate], order[0]];
    }

    enabled = true;
    cursor = -1;
    updateButton();
    playAt(0);
  }

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
  }

  function shuffleSkip() {
    if (!enabled) {
      activateShuffle();
      return;
    }
    playAt(cursor + 1);
  }

  function adjacentHotkey(step) {
    if (enabled) {
      playAt(cursor + step);
      return;
    }

    captureCatalog();
    if (!catalogKeys.length) return;

    const current = currentKey();
    const currentIndex = catalogKeys.indexOf(current);
    let nextIndex;

    if (currentIndex < 0) nextIndex = step > 0 ? 0 : catalogKeys.length - 1;
    else nextIndex = (currentIndex + step + catalogKeys.length) % catalogKeys.length;

    triggerSong(catalogKeys[nextIndex]);
  }

  function playerIsOpen() {
    const player = app.querySelector('[data-player]');
    return Boolean(player && !player.hidden);
  }

  function likeHotkey() {
    if (!playerIsOpen()) return false;
    const likeButton = app.querySelector('[data-player] [data-like]');
    if (!likeButton) return false;
    likeButton.click();
    return true;
  }

  function injectButton() {
    if (!desktopQuery.matches) return;
    captureCatalog();

    const controls = app.querySelector('[data-player] .v2-player-controls');
    if (!controls || controls.querySelector('[data-desktop-shuffle-all]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-shuffle-all';
    button.dataset.desktopShuffleAll = 'true';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Shuffle all');
    button.title = 'Shuffle All (S)';
    button.innerHTML = SHUFFLE_ICON;

    const previous = controls.querySelector('[data-prev]');
    controls.insertBefore(button, previous || controls.firstChild);
    updateButton();
  }

  installStyles();
  injectButton();

  const observer = new MutationObserver(() => {
    captureCatalog();
    injectButton();
  });
  observer.observe(app, { childList: true, subtree: true });

  document.addEventListener('keydown', event => {
    if (!desktopQuery.matches || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    const key = String(event.key || '').toLowerCase();
    if (!['s', 'w', 'e', 'f', 'l'].includes(key)) return;
    if ((key === 'f' || key === 'l') && !playerIsOpen()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (key === 's') {
      shuffleSkip();
      return;
    }

    if (key === 'w') {
      adjacentHotkey(-1);
      return;
    }

    if (key === 'e') {
      adjacentHotkey(1);
      return;
    }

    likeHotkey();
  }, true);

  document.addEventListener('click', event => {
    if (!desktopQuery.matches) return;

    if (event.target.closest('[data-desktop-shuffle-all]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (enabled) disableShuffle();
      else activateShuffle();
      return;
    }

    if (enabled && event.target.closest('[data-next]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playAt(cursor + 1);
      return;
    }

    if (enabled && event.target.closest('[data-prev]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      playAt(cursor - 1);
      return;
    }

    const songTarget = event.target.closest('[data-song]');
    if (songTarget && enabled && !syntheticSongClick) disableShuffle();
  }, true);

  document.addEventListener('ended', event => {
    if (!enabled || !desktopQuery.matches) return;
    if (!(event.target instanceof HTMLMediaElement) || !event.target.matches('[data-audio]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    playAt(cursor + 1);
  }, true);

  const onDesktopChange = event => {
    if (!event.matches) {
      disableShuffle();
      app.querySelector('[data-desktop-shuffle-all]')?.remove();
      return;
    }
    injectButton();
  };

  if (typeof desktopQuery.addEventListener === 'function') desktopQuery.addEventListener('change', onDesktopChange);
  else if (typeof desktopQuery.addListener === 'function') desktopQuery.addListener(onDesktopChange);
})();
