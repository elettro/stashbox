(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  const TTL = 900;
  const REQUEST_TIMEOUT_MS = 15000;
  const q = (id) => document.getElementById(id);
  const reviewLabel = q('reviewLabel');
  const authPanel = q('authPanel');
  const authMessage = q('authMessage');
  const playerPanel = q('playerPanel');
  const video = q('previewVideo');
  const status = q('previewStatus');
  const refresh = q('refreshPreview');
  const expiry = q('expiryStatus');
  let timer = null;
  let controller = null;

  const reviewId = String(new URLSearchParams(location.search).get('review_id') || '').trim();
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (controller) controller.abort();
    controller = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function auth(message) {
    clear();
    playerPanel.hidden = true;
    authPanel.hidden = false;
    authMessage.textContent = message;
  }

  function expired() {
    clear();
    status.hidden = false;
    status.textContent = 'This secure preview expired. Select Refresh Preview to create a new 15-minute preview.';
    expiry.textContent = 'Preview expired.';
  }

  async function load() {
    const adminToken = token();
    if (!adminToken) {
      auth('The Social Factory DEV admin token is missing. Open Content Review, enter the current DEV admin token, then return to this page.');
      return;
    }

    clear();
    authPanel.hidden = true;
    playerPanel.hidden = false;
    refresh.disabled = true;
    status.hidden = false;
    status.textContent = 'Requesting secure preview…';
    expiry.textContent = 'Creating a new 15-minute preview…';

    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${API_BASE}/social/review-items/${encodeURIComponent(reviewId)}/preview?viewer=browser&ts=${Date.now()}`,
        {
          method: 'POST',
          mode: 'cors',
          cache: 'no-store',
          headers: {
            'x-admin-token': adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ viewer: 'browser' }),
          signal: controller.signal
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        auth('The saved Social Factory DEV admin token is invalid. Return to Content Review and enter the current DEV admin token.');
        return;
      }
      if (!response.ok || payload.ok === false || !payload.preview_url) {
        throw new Error(payload.error || `Preview API returned HTTP ${response.status} without a video URL.`);
      }

      status.textContent = 'Loading video…';
      video.onerror = () => {
        status.hidden = false;
        status.textContent = 'The secure URL was created, but the browser could not load the video file.';
        expiry.textContent = 'Video playback failed.';
      };
      video.onloadedmetadata = () => {
        status.hidden = true;
      };
      video.src = payload.preview_url;
      video.load();

      const ttl = Number(payload.expires_in_seconds || TTL);
      expiry.textContent = `Preview expires in ${Math.round(ttl / 60)} minutes.`;
      timer = setTimeout(expired, ttl * 1000);
    } catch (error) {
      status.hidden = false;
      status.textContent = error?.name === 'AbortError'
        ? 'Preview request timed out after 15 seconds. The API did not complete the browser request.'
        : `Preview unavailable: ${error?.message || 'Unknown error'}`;
      expiry.textContent = 'No preview is active.';
    } finally {
      clearTimeout(timeout);
      controller = null;
      refresh.disabled = false;
    }
  }

  if (!/^[a-zA-Z0-9-]{8,120}$/.test(reviewId)) {
    reviewLabel.textContent = 'A valid review_id query parameter is required.';
    auth('This preview link is missing a valid review item ID. Return to Content Review and open the preview again.');
  } else {
    reviewLabel.textContent = reviewId;
    refresh.addEventListener('click', load);
    window.addEventListener('pagehide', clear);
    load();
  }
})();
