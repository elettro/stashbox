(() => {
  'use strict';

  const originalReferrerLoader = window.fetchReferrerStatsData;
  const originalDeviceLoader = window.fetchDeviceStatsData;
  const renderDashboard = window.renderDashboard;
  const showMessage = window.showMessage;

  if (typeof originalReferrerLoader !== 'function' || typeof originalDeviceLoader !== 'function') {
    console.warn('[DEV Admin] analytics lazy-load skipped because dashboard loaders are unavailable.');
    return;
  }

  let referrerLoaded = false;
  let deviceLoaded = false;
  let referrerLoading = null;
  let deviceLoading = null;

  function currentView() {
    const raw = new URLSearchParams(window.location.search).get('view') || 'dashboard';
    return raw === 'overview' ? 'dashboard' : raw;
  }

  function loadReferrersNow() {
    if (referrerLoading) return referrerLoading;
    referrerLoading = Promise.resolve(originalReferrerLoader())
      .then((result) => {
        referrerLoaded = true;
        if (typeof renderDashboard === 'function') renderDashboard();
        return result;
      })
      .catch((error) => {
        if (typeof showMessage === 'function') showMessage(`Could not load referrer stats: ${error.message}`, 'error');
        console.warn('[DEV Admin] referrer analytics load failed', error);
        throw error;
      })
      .finally(() => {
        referrerLoading = null;
      });
    return referrerLoading;
  }

  function loadDevicesNow() {
    if (deviceLoading) return deviceLoading;
    deviceLoading = Promise.resolve(originalDeviceLoader())
      .then((result) => {
        deviceLoaded = true;
        if (typeof renderDashboard === 'function') renderDashboard();
        return result;
      })
      .catch((error) => {
        if (typeof showMessage === 'function') showMessage(`Could not load device stats: ${error.message}`, 'error');
        console.warn('[DEV Admin] device analytics load failed', error);
        throw error;
      })
      .finally(() => {
        deviceLoading = null;
      });
    return deviceLoading;
  }

  // loadDashboardData() calls these every time. On the normal dashboard landing,
  // return immediately rather than hitting RDS for sections the user cannot see.
  window.fetchReferrerStatsData = function lazyReferrerStats(...args) {
    if (currentView() !== 'referrers') return Promise.resolve(null);
    if (referrerLoaded) return originalReferrerLoader.apply(this, args);
    return loadReferrersNow();
  };

  window.fetchDeviceStatsData = function lazyDeviceStats(...args) {
    if (currentView() !== 'devices') return Promise.resolve(null);
    if (deviceLoaded) return originalDeviceLoader.apply(this, args);
    return loadDevicesNow();
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-dashboard-view-link]');
    if (!link) return;
    const view = link.dataset.dashboardViewLink;
    if (view === 'referrers' && !referrerLoaded) {
      queueMicrotask(() => loadReferrersNow().catch(() => {}));
    }
    if (view === 'devices' && !deviceLoaded) {
      queueMicrotask(() => loadDevicesNow().catch(() => {}));
    }
  });

  window.addEventListener('popstate', () => {
    const view = currentView();
    if (view === 'referrers' && !referrerLoaded) loadReferrersNow().catch(() => {});
    if (view === 'devices' && !deviceLoaded) loadDevicesNow().catch(() => {});
  });
})();
