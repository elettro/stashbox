(() => {
  const API_URL = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/me/notifications/state';
  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const READ_STORAGE_KEY = 'stashbox_notification_read_ids_dev';
  const DISMISSED_STORAGE_KEY = 'stashbox_notification_dismissed_ids_dev';
  let lastToken = '';
  let syncing = false;

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeSet(key, values) {
    const existing = readJson(key, []);
    const merged = [...new Set([...(Array.isArray(existing) ? existing : []), ...values].map(String).filter(Boolean))];
    try { localStorage.setItem(key, JSON.stringify(merged)); } catch (_) {}
    return merged;
  }

  async function sync() {
    if (syncing) return;
    const tokens = readJson(TOKEN_STORAGE_KEY, null);
    const accessToken = String(tokens?.accessToken || '');
    if (!accessToken || accessToken === lastToken) return;
    syncing = true;
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      if (tokens?.idToken) headers['X-Cognito-Id-Token'] = tokens.idToken;
      const response = await fetch(API_URL, { headers, cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      const rows = Array.isArray(body.notification_state) ? body.notification_state : [];
      const readIds = writeSet(READ_STORAGE_KEY, rows.filter(row => row.read_at || row.clicked_at).map(row => row.notification_id));
      const dismissedIds = writeSet(DISMISSED_STORAGE_KEY, rows.filter(row => row.dismissed_at).map(row => row.notification_id));
      lastToken = accessToken;
      window.dispatchEvent(new CustomEvent('stashbox-notification-account-state', {
        detail: { readIds, dismissedIds }
      }));
    } catch (error) {
      console.warn('[notifications] account-state sync failed', error);
    } finally {
      syncing = false;
    }
  }

  sync();
  window.setInterval(sync, 2000);
})();
