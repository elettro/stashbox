(() => {
  'use strict';

  if (window.StashboxVec2Loader) return;

  const params = new URLSearchParams(location.search);
  const enabled = params.get('vec2') === '1' || localStorage.getItem('stashbox_vec2_dev') === '1';

  const api = {
    enabled: () => enabled,
    enableNextLoad: () => localStorage.setItem('stashbox_vec2_dev', '1'),
    disableNextLoad: () => localStorage.removeItem('stashbox_vec2_dev')
  };
  window.StashboxVec2Loader = Object.freeze(api);

  if (!enabled) return;

  document.documentElement.dataset.vecEngine = '2';
  document.documentElement.dataset.vecLegacyDisabled = 'true';

  // Prevent legacy desktop VEC owners from booting on the opt-in VEC 2.0 path.
  // The old scripts remain untouched and continue to work on normal DEV loads.
  const marker = name => {
    if (document.querySelector(`script[${name}]`)) return;
    const node = document.createElement('script');
    node.type = 'application/json';
    node.setAttribute(name, 'true');
    node.textContent = '{}';
    document.head.appendChild(node);
  };
  marker('data-desktop-vec-core');
  marker('data-desktop-artwork-runtime');

  window.StashboxMainVecVideoWatchdog = Object.freeze({
    refresh: () => {}, stop: () => {}, rescueActive: () => false,
    activeSongKey: () => '', clipCount: () => 0, rescueUrl: () => '', state: () => ({ disabledBy: 'vec2' })
  });
  window.StashboxV2MediaTransitionGuard = Object.freeze({
    refresh: () => {}, isDesktopWideSurface: () => true, minHorizontalRatio: 0,
    videoArtworkLocked: () => false, watchdogOwnsVideoStage: () => false
  });
  window.StashboxDesktopOfficialArtwork16x9 = Object.freeze({
    refresh: () => {}, applyCurrent: () => false, applySong: () => false,
    desktopSurface: () => true, state: () => ({ disabledBy: 'vec2' })
  });

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/radio/attempt2/vec2/vec2-stage.css?v=20260817-core3';
  css.dataset.vec2Style = 'true';
  document.head.appendChild(css);

  const loadBridge = () => {
    if (document.querySelector('script[data-vec2-cms-bridge="true"]')) return;
    const bridge = document.createElement('script');
    bridge.src = '/radio/attempt2/vec2/vec2-cms-bridge.js?v=20260817-cms1';
    bridge.async = false;
    bridge.dataset.vec2CmsBridge = 'true';
    bridge.onload = () => window.dispatchEvent(new CustomEvent('stashbox:vec2-cms-ready'));
    bridge.onerror = () => console.error('[VEC2] CMS bridge failed to load.');
    document.head.appendChild(bridge);
  };

  const controller = document.createElement('script');
  controller.src = '/radio/attempt2/vec2/vec2-controller.js?v=20260817-core3';
  controller.async = false;
  controller.dataset.vec2Controller = 'true';
  controller.onload = () => {
    window.dispatchEvent(new CustomEvent('stashbox:vec2-ready'));
    loadBridge();
  };
  controller.onerror = () => {
    document.documentElement.dataset.vecEngine = 'legacy';
    delete document.documentElement.dataset.vecLegacyDisabled;
    console.error('[VEC2] Controller failed to load. Reload without ?vec2=1 to use legacy VEC.');
  };
  document.head.appendChild(controller);
})();
