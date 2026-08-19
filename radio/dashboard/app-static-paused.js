(() => {
  'use strict';

  // PAUSED PUBLIC DASHBOARD MODE — 2026-08-19
  // This legacy dashboard intentionally makes ZERO Radio AWS/API requests.
  // The original live implementation remains preserved in ./app.js.
  // To restore live analytics later, change index.html back from
  // ./app-static-paused.js to ./app.js.

  const byId = id => document.getElementById(id);
  const status = byId('statusBanner');
  const refresh = byId('refreshButton');

  if (status) {
    status.textContent = 'Archived dashboard snapshot mode · Live AWS analytics are paused.';
    status.classList.add('is-success');
  }

  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = 'Live Stats Paused';
    refresh.title = 'This legacy dashboard is in static mode and does not query AWS.';
  }

  const staticCards = (id, labels) => {
    const container = byId(id);
    if (!container) return;
    container.innerHTML = labels.map(label => `
      <article class="stat-card">
        <span class="stat-label">${label}</span>
        <strong class="stat-value">—</strong>
      </article>`).join('');
  };

  const staticRank = (id, message = 'Live ranking paused') => {
    const container = byId(id);
    if (!container) return;
    container.classList.add('rank-grid--compact');
    container.innerHTML = `<article class="rank-card muted">${message} · No AWS request is made from this page.</article>`;
  };

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

  const topSongsBody = byId('topSongsBody');
  if (topSongsBody) {
    topSongsBody.innerHTML = '<tr><td class="empty-cell" colspan="7">Live song rankings are paused. This legacy dashboard is no longer querying AWS.</td></tr>';
  }

  staticRank('likedSongs');
  staticRank('engagementSongs');
  staticRank('sharedSongs');
  staticRank('videoClicks');
  staticRank('productClicks');
  staticRank('skipRateSongs');
})();
