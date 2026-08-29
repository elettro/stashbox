(() => {
  'use strict';

  const CONFIG = Object.freeze({
    build: Object.freeze({
      issue: 1077,
      mode: 'cutover-candidate',
      phase4ProdReadApproved: true,
      productionCutoverApproved: false,
      productionWritesApproved: false
    }),

    environments: Object.freeze({
      dev: Object.freeze({
        label: 'DEV',
        apiBase: 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev',
        tokenStorageKey: 'radio_admin_token_dev',
        legacyTokenStorageKeys: Object.freeze(['stashbox_admin_token_dev', 'stashbox-radio-admin-token-dev']),
        playerPath: '/radio/dev/v2/',
        healthPath: '/radio-admin/dev/system-health/',
        writesAllowedInStaging: true
      }),
      prod: Object.freeze({
        label: 'PROD',
        apiBase: 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2',
        tokenStorageKey: 'radio_admin_token_prod',
        legacyTokenStorageKeys: Object.freeze(['stashbox_admin_token_dev']),
        playerPath: '/radio/',
        healthPath: null,
        writesAllowedInStaging: false
      })
    }),

    dataPolicy: Object.freeze({
      songs: Object.freeze({
        targetArchitecture: 'canonical-live',
        canonicalEnvironment: 'prod',
        publicReadPath: '/radio/songs',
        adminPath: '/admin/songs',
        stagingProdWritesAllowed: false,
        prodReadValidated: true,
        prodReadValidatedAt: '2026-08-28',
        devSongCountValidated: 84,
        prodSongCountValidated: 84,
        sharedSongKeysValidated: 84,
        devOnlySongKeysValidated: 0,
        prodOnlySongKeysValidated: 0,
        playerContractValidated: true,
        canonicalPlayerReadCandidateReady: true
      }),
      ads: Object.freeze({
        targetArchitecture: 'environment-specific',
        path: '/admin/ads',
        settingsPath: '/admin/ad-settings'
      }),
      vec: Object.freeze({
        targetArchitecture: 'environment-specific',
        recipePath: '/admin/vec/recipe',
        songAssetsPath: '/admin/vec/song-assets'
      }),
      analytics: Object.freeze({
        targetArchitecture: 'environment-specific',
        prodReadValidationRequired: true,
        prodFreezeMustRemainUntilValidated: true
      }),
      notifications: Object.freeze({
        targetArchitecture: 'environment-specific',
        prodWritesAllowedInStaging: false
      }),
      socialFactory: Object.freeze({
        targetArchitecture: 'separate-service',
        environment: 'dev-only-until-explicit-prod-build'
      })
    }),

    routes: Object.freeze({
      stagingRoot: '/radio-admin/',
      currentModernDev: '/radio-admin/dev/',
      currentAncientProd: '/radio-admin/',
      futureLegacyProd: '/radio-admin/legacy/',
      songsDev: '/radio-admin/songs/dev/',
      visualLibraryDev: '/radio/visual-experience/dev/',
      vecDev: '/radio-admin/dev/vec/',
      videoFactoryDev: '/radio-admin/dev/video-factory/',
      adsDev: '/radio-admin/dev/ads/',
      artistsDev: '/radio-admin/artists/dev/',
      notificationsDev: '/radio-admin/notifications/dev/',
      bugsDev: '/radio-admin/dev/bugs/',
      systemHealthDev: '/radio-admin/dev/system-health/',
      socialFactoryDev: '/radio-admin/dev/social-factory/'
    })
  });

  const STAGING_NAV_ITEMS = Object.freeze([
    ['Dashboard', '/radio-admin/'],
    ['Songs', '/radio-admin/songs/'],
    ['Video Library', '/radio-admin/video-library/'],
    ['VEC Lab', '/radio-admin/vec/'],
    ['Video Factory', '/radio-admin/video-factory/'],
    ['Ads', '/radio-admin/ads/'],
    ['Notifications', '/radio-admin/notifications/'],
    ['Artists', '/radio-admin/artists/'],
    ['Social Factory', '/radio-admin/social-factory/'],
    ['Bug Base', '/radio-admin/bugs/'],
    ['DEV Health', '/radio-admin/system-health/']
  ]);

  function getEnvironment(name) {
    const key = String(name || '').toLowerCase();
    const env = CONFIG.environments[key];
    if (!env) throw new Error(`Unknown admin environment: ${name}`);
    return env;
  }

  function getCanonicalSongEnvironment() {
    const name = CONFIG.dataPolicy.songs.canonicalEnvironment;
    return getEnvironment(name);
  }

  function assertWriteAllowed(environmentName, moduleName) {
    const env = getEnvironment(environmentName);
    if (!env.writesAllowedInStaging) {
      throw new Error(`Blocked Admin write: ${moduleName || 'module'} -> ${env.label}. Production writes are not approved.`);
    }
    return true;
  }

  function assertCanonicalSongWriteApproved(moduleName = 'canonical-song') {
    const env = getCanonicalSongEnvironment();
    const approved = CONFIG.build.productionWritesApproved === true
      && CONFIG.dataPolicy.songs.stagingProdWritesAllowed === true
      && env.writesAllowedInStaging === true;
    if (!approved) {
      throw new Error(`Blocked canonical song write: ${moduleName} -> ${env.label}. Production Song CMS writes are not approved.`);
    }
    return true;
  }

  function canonicalSongPublicUrl(search = '') {
    const env = getCanonicalSongEnvironment();
    const url = new URL(`${env.apiBase}${CONFIG.dataPolicy.songs.publicReadPath}`);
    if (search) url.search = String(search).replace(/^\?/, '');
    return url.toString();
  }

  function canonicalSongAdminUrl(path = '') {
    const env = getCanonicalSongEnvironment();
    return `${env.apiBase}${CONFIG.dataPolicy.songs.adminPath}${path}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function currentStagingRoute(pathname = window.location.pathname) {
    const path = String(pathname || '/');
    if (path === CONFIG.routes.stagingRoot || path === CONFIG.routes.stagingRoot.slice(0, -1)) return CONFIG.routes.stagingRoot;
    const matches = STAGING_NAV_ITEMS
      .map(([, href]) => href)
      .filter(href => href !== CONFIG.routes.stagingRoot && path.startsWith(href))
      .sort((a, b) => b.length - a.length);
    return matches[0] || '';
  }

  function installStagingNavigation(root = document) {
    if (!String(window.location.pathname || '').startsWith(CONFIG.routes.stagingRoot)) return;
    const current = currentStagingRoute();
    root.querySelectorAll('nav.topnav').forEach(nav => {
      nav.setAttribute('aria-label', 'Unified admin navigation');
      nav.innerHTML = STAGING_NAV_ITEMS.map(([label, href]) => {
        const active = href === current ? ' aria-current="page"' : '';
        return `<a href="${escapeHtml(href)}"${active}>${escapeHtml(label)}</a>`;
      }).join('');
    });
  }

  window.StashboxAdminMigration = Object.freeze({
    config: CONFIG,
    getEnvironment,
    getCanonicalSongEnvironment,
    assertWriteAllowed,
    assertCanonicalSongWriteApproved,
    canonicalSongPublicUrl,
    canonicalSongAdminUrl,
    installStagingNavigation,
    stagingNavigation: STAGING_NAV_ITEMS
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installStagingNavigation(), { once: true });
  } else {
    installStagingNavigation();
  }
})();
