(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) {
    throw new Error('StashboxAdminMigration config is required before staging.js');
  }

  const { config } = migration;
  const environmentSelect = document.getElementById('environmentSelect');
  const envBadge = document.getElementById('envBadge');
  const writeState = document.getElementById('writeState');
  const endpointValue = document.getElementById('endpointValue');
  const playerValue = document.getElementById('playerValue');
  const policyBody = document.getElementById('policyBody');
  const moduleGrid = document.getElementById('moduleGrid');

  const modules = [
    ['Dashboard', config.routes.currentModernDev, 'DEV', 'Current modern dashboard reference'],
    ['Songs', config.routes.songsDev, 'CANONICAL LIVE TARGET', 'Will become the single shared real-song catalog'],
    ['Video Library', config.routes.visualLibraryDev, 'DEV', 'Environment-specific visual assets/config'],
    ['VEC Lab', config.routes.vecDev, 'DEV', 'Environment-specific recipes and testing'],
    ['Video Factory', config.routes.videoFactoryDev, 'DEV', 'DEV jobs until production workflow is explicitly validated'],
    ['Ads', config.routes.adsDev, 'DEV / PROD SEPARATE', 'Live ad settings must remain isolated'],
    ['Artists', config.routes.artistsDev, 'DEV', 'Needs route/token normalization before PROD'],
    ['Notifications', config.routes.notificationsDev, 'DEV / PROD SEPARATE', 'PROD publishing remains blocked'],
    ['Bug Base', config.routes.bugsDev, 'SHARED', 'Safe shared operational module'],
    ['System Health', config.routes.systemHealthDev, 'DEV / PROD SEPARATE', 'Must identify which environment is being checked'],
    ['Social Factory', config.routes.socialFactoryDev, 'DEV-ONLY SERVICE', 'Separate backend and credentials']
  ];

  function renderModules() {
    moduleGrid.innerHTML = modules.map(([name, href, scope, note]) => `
      <article class="module-card">
        <div class="module-card__top">
          <h3>${name}</h3>
          <span class="scope-badge">${scope}</span>
        </div>
        <p>${note}</p>
        <a href="${href}" target="_blank" rel="noopener">Open current reference</a>
      </article>
    `).join('');
  }

  function renderPolicies() {
    const rows = [
      ['Songs', 'Canonical LIVE catalog', 'PROD write disabled in staging', 'DEV/V2 and PROD player should ultimately read the same real-song catalog'],
      ['Ads', 'Environment-specific', 'PROD write blocked', 'Protect live commercial behavior'],
      ['VEC', 'Environment-specific', 'PROD write blocked', 'Share song identity, not recipes/config'],
      ['Analytics', 'Environment-specific', 'PROD read validation later', 'Retain current production analytics freeze until tested'],
      ['Notifications', 'Environment-specific', 'PROD write blocked', 'Publishing is high-risk'],
      ['Social Factory', 'Separate service', 'DEV-only', 'No implicit PROD toggle']
    ];

    policyBody.innerHTML = rows.map(row => `
      <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
    `).join('');
  }

  function renderEnvironment() {
    const key = environmentSelect.value;
    const env = migration.getEnvironment(key);
    envBadge.textContent = env.label;
    endpointValue.textContent = env.apiBase;
    playerValue.textContent = env.playerPath;

    if (env.writesAllowedInStaging) {
      writeState.textContent = 'DEV writes allowed only when a migrated module explicitly uses this config.';
      writeState.className = 'status status-dev';
    } else {
      writeState.textContent = 'PROD writes BLOCKED. Phase 4 is read-only and has not started.';
      writeState.className = 'status status-blocked';
    }
  }

  environmentSelect.addEventListener('change', renderEnvironment);
  renderModules();
  renderPolicies();
  renderEnvironment();
})();
