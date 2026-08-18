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

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/radio/dev/v2/vec2/vec2-stage.css?v=20260817-core2';
  css.dataset.vec2Style = 'true';
  document.head.appendChild(css);

  const loadBridge = () => {
    if (document.querySelector('script[data-vec2-cms-bridge="true"]')) return;
    const bridge = document.createElement('script');
    bridge.src = '/radio/dev/v2/vec2/vec2-cms-bridge.js?v=20260817-cms1';
    bridge.async = false;
    bridge.dataset.vec2CmsBridge = 'true';
    bridge.onload = () => window.dispatchEvent(new CustomEvent('stashbox:vec2-cms-ready'));
    bridge.onerror = () => console.error('[VEC2] CMS bridge failed to load.');
    document.head.appendChild(bridge);
  };

  const controller = document.createElement('script');
  controller.src = '/radio/dev/v2/vec2/vec2-controller.js?v=20260817-core2';
  controller.async = false;
  controller.dataset.vec2Controller = 'true';
  controller.onload = () => {
    window.dispatchEvent(new CustomEvent('stashbox:vec2-ready'));
    loadBridge();
  };
  controller.onerror = () => {
    document.documentElement.dataset.vecEngine = 'legacy';
    delete document.documentElement.dataset.vecLegacyDisabled;
    console.error('[VEC2] Controller failed to load. Legacy VEC remains available.');
  };
  document.head.appendChild(controller);
})();
