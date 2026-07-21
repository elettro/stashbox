(() => {
  const STANDARD_DEV_ADMIN_TOKEN_KEY = 'stashbox_admin_token_dev';
  const LEGACY_ARTIST_CMS_TOKEN_KEY = 'stashbox-radio-admin-token-dev';

  const standardToken = localStorage.getItem(STANDARD_DEV_ADMIN_TOKEN_KEY) || '';
  const legacyToken = localStorage.getItem(LEGACY_ARTIST_CMS_TOKEN_KEY) || '';

  if (standardToken) {
    localStorage.setItem(LEGACY_ARTIST_CMS_TOKEN_KEY, standardToken);
  } else if (legacyToken) {
    localStorage.setItem(STANDARD_DEV_ADMIN_TOKEN_KEY, legacyToken);
  }

  const tokenInput = document.getElementById('adminToken');
  const saveButton = document.getElementById('saveToken');
  const clearButton = document.getElementById('clearToken');

  if (tokenInput) {
    tokenInput.value = localStorage.getItem(STANDARD_DEV_ADMIN_TOKEN_KEY)
      || localStorage.getItem(LEGACY_ARTIST_CMS_TOKEN_KEY)
      || '';
  }

  saveButton?.addEventListener('click', () => {
    const token = tokenInput?.value.trim() || '';
    if (token) {
      localStorage.setItem(STANDARD_DEV_ADMIN_TOKEN_KEY, token);
      localStorage.setItem(LEGACY_ARTIST_CMS_TOKEN_KEY, token);
    }
  }, true);

  clearButton?.addEventListener('click', () => {
    localStorage.removeItem(STANDARD_DEV_ADMIN_TOKEN_KEY);
    localStorage.removeItem(LEGACY_ARTIST_CMS_TOKEN_KEY);
  }, true);
})();
