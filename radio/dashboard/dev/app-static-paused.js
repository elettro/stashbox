(() => {
  'use strict';

  // PAUSED DEV DASHBOARD MODE — 2026-08-19
  // This legacy DEV dashboard intentionally makes ZERO Radio stats/API requests.
  // The original live implementation remains preserved in ./app.js.
  // To restore live analytics later, switch index.html back to ./app.js.

  const byId = id => document.getElementById(id);
  const sections = [...document.querySelectorAll('[data-dashboard-section]')];
  const viewLinks = [...document.querySelectorAll('[data-dashboard-view-link]')];
  const allowedViews = new Set([
    'overview', 'operational', 'today', 'top-songs', 'most-liked', 'most-shared',
    'product-analytics', 'top-clicked-products', 'recent-product-clicks', 'events', 'archive'
  ]);

  function currentView() {
    const view = new URLSearchParams(window.location.search).get('view') || 'overview';
    return allowedViews.has(view) ? view : 'overview';
  }

  function applyView() {
    const activeView = currentView();
    sections.forEach(section => {
      const visible = activeView === 'overview' || section.dataset.dashboardSection === activeView;
      section.classList.toggle('is-dashboard-section-hidden', !visible);
      section.toggleAttribute('hidden', !visible);
    });
    viewLinks.forEach(link => {
      if (link.dataset.dashboardViewLink === activeView) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  const status = byId('statusBanner');
  if (status) {
    status.textContent = 'DEV analytics paused · This dashboard is preserved in static mode and is not querying AWS.';
    status.classList.add('is-success');
  }

  const refresh = byId('refreshButton');
  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = 'Live Stats Paused';
    refresh.title = 'This DEV dashboard is in static mode and does not query AWS.';
  }

  function staticCards(id, labels) {
    const container = byId(id);
    if (!container) return;
    container.innerHTML = labels.map(label => `
      <article class="stat-card">
        <span class="stat-label">${label}</span>
        <strong class="stat-value">—</strong>
      </article>`).join('');
  }

  function staticRank(id, message = 'Live ranking paused') {
    const container = byId(id);
    if (!container) return;
    container.classList.add('rank-grid--compact');
    container.innerHTML = `<article class="rank-card muted">${message} · No AWS request is made from this page.</article>`;
  }

  staticCards('operationalStats', [
    'Songs Tracked', 'Total Plays', 'Total Likes', 'Total Shares',
    'Video Clicks', 'Product Clicks', 'Skip Count'
  ]);

  staticCards('songAnalyticsStats', [
    'Full Plays', 'Partial Plays', 'Average Engagement Rate',
    'Average Skip Rate', 'Songs With Likes', 'Songs With Product Clicks'
  ]);

  staticCards('todayStats', [
    'Plays Today', 'Likes Today', 'Shares Today', 'Video Clicks Today',
    'Product Clicks Today', 'Skips Today', 'Active Songs Today', 'Activity Today'
  ]);

  staticCards('productAnalytics', [
    'Total Product Clicks', 'Songs With Product Clicks',
    'Top Song Product Clicks', 'Product Clicks / Play'
  ]);

  staticCards('eventTypeStats', ['Event analytics paused']);

  const topSongsBody = byId('topSongsBody');
  if (topSongsBody) {
    topSongsBody.innerHTML = '<tr><td class="empty-cell" colspan="7">Live song rankings are paused. This DEV dashboard is no longer querying AWS.</td></tr>';
  }

  staticRank('likedSongs');
  staticRank('engagementSongs');
  staticRank('sharedSongs');
  staticRank('videoClicks');
  staticRank('productClicks');
  staticRank('skipRateSongs');
  staticRank('recentEvents', 'Recent events paused');
  staticRank('recentProductClicks', 'Recent product clicks paused');

  const recentProductClicksMessage = byId('recentProductClicksMessage');
  if (recentProductClicksMessage) {
    recentProductClicksMessage.textContent = 'Live recent product-click queries are paused in this archived DEV dashboard.';
  }

  applyView();
  window.addEventListener('popstate', applyView);
})();
