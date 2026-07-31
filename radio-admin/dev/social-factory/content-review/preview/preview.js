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
  const tokenForm = q('tokenForm');
  const adminTokenInput = q('adminToken');
  const tokenStatus = q('tokenStatus');
  const playerPanel = q('playerPanel');
  const video = q('previewVideo');
  const status = q('previewStatus');
  const refresh = q('refreshPreview');
  const changeToken = q('changeToken');
  const expiry = q('expiryStatus');
  let timer = null;
  let controller = null;

  const reviewId = String(new URLSearchParams(location.search).get('review_id') || '').trim();

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(value) {
    const token = String(value || '').trim();
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(TOKEN_KEY, token);
      tokenStatus.textContent = 'Saved privately in this browser';
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      tokenStatus.textContent = 'Not saved in this browser';
    }
  }

  function hideStatus() {
    status.hidden = true;
    status.style.display = 'none';
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = false;
    status.style.display = 'grid';
  }

  function clearPreview() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (controller) controller.abort();
    controller = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function showAuth(message) {
    clearPreview();
    playerPanel.hidden = true;
    authPanel.hidden = false;
    authMessage.textContent = message;
    adminTokenInput.value = '';
    tokenStatus.textContent = getToken() ? 'Saved privately in this browser' : 'Not saved in this browser';
    adminTokenInput.focus();
  }

  function expired() {
    clearPreview();
    showStatus('This secure preview expired. Select Refresh Preview to create a new 15-minute preview.');
    expiry.textContent = 'Preview expired.';
  }

  async function load() {
    const adminToken = getToken();
    if (!adminToken) {
      showAuth('Enter the current Social Factory DEV admin token below, then select Save and Load Preview.');
      return;
    }

    clearPreview();
    authPanel.hidden = true;
    playerPanel.hidden = false;
    refresh.disabled = true;
    showStatus('Requesting secure preview…');
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
        setToken('');
        showAuth('That DEV admin token was rejected. Enter the current token and try again.');
        return;
      }
      if (!response.ok || payload.ok === false || !payload.preview_url) {
        throw new Error(payload.error || `Preview API returned HTTP ${response.status} without a video URL.`);
      }

      video.onerror = () => {
        hideStatus();
        expiry.textContent = 'Video playback failed. Select Refresh Preview to try again.';
      };

      video.src = payload.preview_url;
      video.load();
      hideStatus();

      const ttl = Number(payload.expires_in_seconds || TTL);
      expiry.textContent = `Preview expires in ${Math.round(ttl / 60)} minutes.`;
      timer = setTimeout(expired, ttl * 1000);
    } catch (error) {
      showStatus(error?.name === 'AbortError'
        ? 'Preview request timed out after 15 seconds. The API did not complete the browser request.'
        : `Preview unavailable: ${error?.message || 'Unknown error'}`);
      expiry.textContent = 'No preview is active.';
    } finally {
      clearTimeout(timeout);
      controller = null;
      refresh.disabled = false;
    }
  }

  tokenForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = adminTokenInput.value;
    if (!String(value || '').trim()) {
      authMessage.textContent = 'Enter the DEV admin token before loading the preview.';
      return;
    }
    setToken(value);
    load();
  });

  changeToken.addEventListener('click', () => {
    setToken('');
    showAuth('Enter the current Social Factory DEV admin token below.');
  });

  if (!/^[a-zA-Z0-9-]{8,120}$/.test(reviewId)) {
    reviewLabel.textContent = 'A valid review_id query parameter is required.';
    showAuth('This preview link is missing a valid review item ID. Return to Content Review and open the preview again.');
  } else {
    reviewLabel.textContent = reviewId;
    refresh.addEventListener('click', load);
    window.addEventListener('pagehide', clearPreview);
    if (getToken()) load();
    else showAuth('Enter the current Social Factory DEV admin token below, then select Save and Load Preview.');
  }
})();
