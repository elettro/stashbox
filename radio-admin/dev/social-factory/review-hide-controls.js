(() => {
  'use strict';

  const API_BASE = 'https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_social_factory_admin_token_dev';
  let busy = false;

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function selectedReviewId() {
    return String(document.querySelector('.sf-queue-item[aria-current="true"]')?.dataset?.reviewId || '').trim();
  }

  function showMessage(text, type = 'info') {
    const box = document.getElementById('message');
    if (!box) return;
    box.hidden = !text;
    box.textContent = text || '';
    box.dataset.type = type;
  }

  async function hideSelected() {
    const reviewId = selectedReviewId();
    if (!reviewId || busy) {
      showMessage('Select an In Review item first.', 'error');
      return;
    }
    const savedToken = token();
    if (!savedToken) {
      showMessage('Save the Social Factory DEV token first.', 'error');
      return;
    }
    if (!window.confirm('Hide this item from the active review queue? Nothing will be published or deleted.')) return;

    busy = true;
    const button = document.getElementById('hideReview');
    if (button) button.disabled = true;
    showMessage('Hiding selected review item…');
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
      showMessage(`Hide failed: ${error.message}`, 'error');
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  function loadCardControls() {
    if (document.querySelector('script[data-review-card-hide-controls]')) return;
    const script = document.createElement('script');
    script.src = '/radio-admin/dev/social-factory/review-card-hide-controls.js?v=20260801-2';
    script.dataset.reviewCardHideControls = 'true';
    document.body.appendChild(script);
  }

  function install() {
    loadCardControls();

    const actions = document.querySelector('#reviewForm .sf-form-actions');
    if (!actions) return;

    actions.classList.add('sf-review-actions-sticky');
    let button = document.getElementById('hideReview');
    if (!button) {
      button = document.createElement('button');
      button.id = 'hideReview';
      button.type = 'button';
      button.className = 'sf-button sf-button-danger';
      button.textContent = 'Hide';
      button.addEventListener('click', hideSelected);
      actions.appendChild(button);
    }

    if (!document.getElementById('reviewHideStickyStyles')) {
      const style = document.createElement('style');
      style.id = 'reviewHideStickyStyles';
      style.textContent = `
        .sf-review-actions-sticky{position:sticky;bottom:0;z-index:20;margin:0 -8px;padding:12px 8px;background:linear-gradient(180deg,rgba(15,20,23,.25),rgba(15,20,23,.98) 28%);border-top:1px solid rgba(255,255,255,.1)}
        .sf-button-danger{border-color:rgba(255,116,116,.65)!important;background:linear-gradient(180deg,#a43f3f,#762929)!important;color:#fff!important}
      `;
      document.head.appendChild(style);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
