(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  let applying = false;

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function showMessage(text, type = 'info') {
    const box = document.getElementById('message');
    if (!box) return;
    box.hidden = !text;
    box.textContent = text || '';
    box.dataset.type = type;
  }

  async function hideItem(reviewId, control) {
    const savedToken = token();
    if (!savedToken) {
      showMessage('Save the Social Factory DEV token first.', 'error');
      return;
    }
    if (!window.confirm('Hide this item from the active review queue? Nothing will be published or deleted.')) return;

    control.disabled = true;
    showMessage('Hiding review item…');
    try {
      const response = await fetch(`${API_BASE}/social/review-items/${encodeURIComponent(reviewId)}/decision`, {
        method: 'POST',
        headers: { 'x-admin-token': savedToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'hide', note: 'Hidden from Content Review queue' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
      showMessage('Item hidden from the active review queue.', 'success');
      document.getElementById('refreshQueue')?.click();
    } catch (error) {
      control.disabled = false;
      showMessage(`Hide failed: ${error.message}`, 'error');
    }
  }

  function installStyles() {
    let style = document.getElementById('reviewCardHideStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'reviewCardHideStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      .sf-review-card-shell{display:contents!important}
      .sf-queue-item[data-review-id]{position:relative!important;padding-right:58px!important}
      .sf-card-hide-button{position:absolute;top:9px;right:9px;z-index:4;width:auto;min-width:0;height:26px;margin:0;padding:4px 8px;border:1px solid rgba(255,116,116,.62);border-radius:8px;background:linear-gradient(180deg,#8d3636,#622424);color:#fff;font-size:10px;line-height:1;font-weight:900;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}
      .sf-card-hide-button:hover{filter:brightness(1.12)}
      .sf-card-hide-button:disabled{opacity:.5;cursor:wait}
    `;
  }

  function unwrapLegacyShells() {
    document.querySelectorAll('#queueList .sf-review-card-shell').forEach((shell) => {
      const card = shell.querySelector(':scope > .sf-queue-item[data-review-id]');
      const hide = shell.querySelector(':scope > .sf-card-hide-button');
      if (!card) return;
      if (hide) hide.remove();
      shell.replaceWith(card);
    });
  }

  function attachControls() {
    if (applying) return;
    applying = true;
    try {
      unwrapLegacyShells();
      document.querySelectorAll('#queueList .sf-queue-item[data-review-id]').forEach((card) => {
        const reviewId = String(card.dataset.reviewId || '').trim();
        if (!reviewId) return;

        let hide = card.querySelector(':scope > .sf-card-hide-button');
        if (!hide) {
          hide = document.createElement('button');
          hide.type = 'button';
          hide.className = 'sf-card-hide-button';
          hide.textContent = 'Hide';
          hide.setAttribute('aria-label', 'Hide this item from the active review queue');
          hide.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            hideItem(reviewId, hide);
          });
          card.appendChild(hide);
        }
      });
    } finally {
      applying = false;
    }
  }

  function init() {
    const queue = document.getElementById('queueList');
    if (!queue) return;
    installStyles();
    attachControls();
    new MutationObserver(() => {
      if (!applying) window.setTimeout(attachControls, 0);
    }).observe(queue, { childList: true, subtree: true });
    document.getElementById('refreshQueue')?.addEventListener('click', () => window.setTimeout(attachControls, 300));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
