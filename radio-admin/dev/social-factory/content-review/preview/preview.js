(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const EXPECTED_TTL_SECONDS = 15 * 60;

  const reviewLabel = document.getElementById('reviewLabel');
  const authPanel = document.getElementById('authPanel');
  const authMessage = document.getElementById('authMessage');
  const playerPanel = document.getElementById('playerPanel');
  const previewVideo = document.getElementById('previewVideo');
  const previewStatus = document.getElementById('previewStatus');
  const refreshPreview = document.getElementById('refreshPreview');
  const expiryStatus = document.getElementById('expiryStatus');

  let expiryTimer = null;
  let currentReviewId = '';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function getReviewId() {
    return String(new URLSearchParams(location.search).get('review_id') || '').trim();
  }

  function clearPreview() {
    if (expiryTimer) window.clearTimeout(expiryTimer);
    expiryTimer = null;
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewVideo.load();
  }

  function showAuth(message) {
    clearPreview();
    playerPanel.hidden = true;
    authPanel.hidden = false;
    authMessage.textContent = message;
  }

  function markExpired() {
    clearPreview();
    previewStatus.hidden = false;
    previewStatus.textContent = 'This secure preview expired. Select Refresh Preview to create a new 15-minute preview.';
    expiryStatus.textContent = 'Preview expired.';
    refreshPreview.hidden = false;
  }

  function scheduleExpiration(seconds) {
    const ttl = Number(seconds || EXPECTED_TTL_SECONDS);
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : EXPECTED_TTL_SECONDS;
    expiryStatus.textContent = `Preview expires in ${Math.round(safeTtl / 60)} minutes.`;
    expiryTimer = window.setTimeout(markExpired, safeTtl * 1000);
  }

  async function requestPreview() {
    const token = getToken();
    if (!token) {
      showAuth('The Social Factory DEV admin token is missing. Open Content Review, enter the current DEV admin token, then return to this page.');
      return;
    }

    clearPreview();
    authPanel.hidden = true;
    playerPanel.hidden = false;
    refreshPreview.disabled = true;
    previewStatus.hidden = false;
    previewStatus.textContent = 'Preparing secure preview…';
    expiryStatus.textContent = 'Creating a new 15-minute preview…';

    try {
      const response = await fetch(`${API_BASE}/social/review-items/${encodeURIComponent(currentReviewId)}/preview`, {
        method: 'POST',
        headers: {
          'x-admin-token': token,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        showAuth('The saved Social Factory DEV admin token is invalid. Return to Content Review and enter the current DEV admin token.');
        return;
      }
      if (!response.ok || payload.ok === false || !payload.preview_url) {
        throw new Error(payload.error || `Preview request failed with HTTP ${response.status}`);
      }

      previewVideo.src = payload.preview_url;
      previewVideo.load();
      previewStatus.hidden = true;
      scheduleExpiration(payload.expires_in_seconds);
    } catch (error) {
      previewStatus.hidden = false;
      previewStatus.textContent = `Preview unavailable: ${error.message || 'Unknown error'}`;
      expiryStatus.textContent = 'No preview is active.';
    } finally {
      refreshPreview.disabled = false;
    }
  }

  currentReviewId = getReviewId();
  if (!/^[a-zA-Z0-9-]{8,120}$/.test(currentReviewId)) {
    reviewLabel.textContent = 'A valid review_id query parameter is required.';
    showAuth('This preview link is missing a valid review item ID. Return to Content Review and open the preview again.');
  } else {
    reviewLabel.textContent = currentReviewId;
    refreshPreview.addEventListener('click', requestPreview);
    window.addEventListener('pagehide', clearPreview);
    requestPreview();
  }
})();
