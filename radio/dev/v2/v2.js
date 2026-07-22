(() => {
  const V2_CLASS = 'radio-app-v2';
  const V2_VERSION = '2026.07.21-v1';

  document.documentElement.dataset.radioInterface = 'v2';
  document.body.dataset.radioInterfaceVersion = V2_VERSION;

  const markV2App = () => {
    const app = document.querySelector('.radio-app');
    if (!app) return false;

    app.classList.add(V2_CLASS);
    app.dataset.interfaceVersion = 'v2';
    window.dispatchEvent(new CustomEvent('stashbox:radio-v2-ready', {
      detail: { version: V2_VERSION }
    }));
    return true;
  };

  if (markV2App()) return;

  const root = document.getElementById('root');
  if (!root) return;

  const observer = new MutationObserver(() => {
    if (!markV2App()) return;
    observer.disconnect();
  });

  observer.observe(root, {
    childList: true,
    subtree: true
  });
})();
