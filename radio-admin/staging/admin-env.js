(() => {
  'use strict';

  const CONFIG = Object.freeze({
    build: Object.freeze({
      issue: 1077,
      mode: 'migration-staging',
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
        stagingProdWritesAllowed: false
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
      stagingRoot: '/radio-admin/staging/',
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

  function getEnvironment(name) {
    const key = String(name || '').toLowerCase();
    const env = CONFIG.environments[key];
    if (!env) throw new Error(`Unknown admin environment: ${name}`);
    return env;
  }

  function assertWriteAllowed(environmentName, moduleName) {
    const env = getEnvironment(environmentName);
    if (!env.writesAllowedInStaging) {
      throw new Error(`Blocked staging write: ${moduleName || 'module'} -> ${env.label}. Production writes are not approved.`);
    }
    return true;
  }

  window.StashboxAdminMigration = Object.freeze({
    config: CONFIG,
    getEnvironment,
    assertWriteAllowed
  });
})();
