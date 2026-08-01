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
    if (document.getElementById('reviewCardHideStyles')) return;
    const style = document.createElement('style');
    style.id = 'reviewCardHideStyles';
    style.textContent = `
      .sf-review-card-shell{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;gap:8px;width:100%}
      .sf-review-card-shell>.sf-queue-item{min-width:0;margin-bottom:8px}
      .sf-card-hide-button{align-self:stretch;min-width:58px;margin-bottom:8px;padding:8px;border:1px solid rgba(255,116,116,.62);border-radius:12px;background:linear-gradient(180deg,#8d3636,#622424);color:#fff;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}
      .sf-card-hide-button:hover{filter:brightness(1.12)}
      .sf-card-hide-button:disabled{opacity:.5;cursor:wait}
      @media(max-width:720px){.sf-review-card-shell{grid-template-columns:minmax(0,1fr) 52px}.sf-card-hide-button{min-width:52px;padding:6px;font-size:10px}}
    `;
    document.head.appendChild(style);
  }

  function attachControls() {
    if (applying) return;
    applying = true;
    try {
      document.querySelectorAll('#queueList .sf-queue-item[data-review-id]').forEach((card) => {
        if (card.parentElement?.classList.contains('sf-review-card-shell')) return;
        const reviewId = String(card.dataset.reviewId || '').trim();
        if (!reviewId) return;

        const shell = document.createElement('div');
        shell.className = 'sf-review-card-shell';
        const parent = card.parentNode;
        parent.insertBefore(shell, card);
        shell.appendChild(card);

        const hide = document.createElement('button');
        hide.type = 'button';
        hide.className = 'sf-card-hide-button';
        hide.textContent = 'Hide';
        hide.setAttribute('aria-label', 'Hide this item from the active review queue');
        hide.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          hideItem(reviewId, hide);
        });
        shell.appendChild(hide);
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
