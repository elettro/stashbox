(() => {
  const STYLE_ID = 'stashbox-account-dashboard-ui';
  let scanQueued = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radio-account-stat[data-account-stat-view] {
        position: relative;
        cursor: pointer;
        transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
      }

      .radio-account-stat[data-account-stat-view]::after {
        content: '›';
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: #f0a500;
        font-size: 25px;
        font-weight: 900;
        line-height: 1;
      }

      .radio-account-stat[data-account-stat-view]:hover,
      .radio-account-stat[data-account-stat-view]:focus-visible {
        transform: translateY(-2px);
        border-color: rgba(240, 165, 0, .62);
        background: linear-gradient(135deg, rgba(240, 165, 0, .1), rgba(255, 255, 255, .035));
        box-shadow: 0 12px 28px rgba(0, 0, 0, .22);
        outline: none;
      }

      .radio-account-overview-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        width: 100%;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, .1);
      }

      .radio-account-overview-actions button {
        min-width: 108px;
      }

      .radio-account-profile-preferences {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, .12);
      }

      .radio-account-profile-preferences-header {
        margin-bottom: 14px;
      }

      .radio-account-profile-preferences-header h3 {
        margin: 0;
        color: #fff;
        font-size: 19px;
      }

      .radio-account-profile-preferences-header p {
        margin: 6px 0 0;
        color: #aeb5bd;
        font-size: 13px;
        line-height: 1.4;
      }

      .radio-account-profile-preferences .radio-account-form-actions {
        justify-content: flex-end;
      }

      @media (max-width: 620px) {
        .radio-account-overview-actions button,
        .radio-account-profile-preferences .radio-account-form-actions button {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function accountApi() {
    return window.StashboxRadioAccount || null;
  }

  function openView(view) {
    accountApi()?.open?.(view);
  }

  function statLabel(stat) {
    return String(stat?.childNodes?.[0]?.textContent || stat?.textContent || '')
      .trim()
      .toLowerCase();
  }

  function enhanceOverview() {
    const grid = document.querySelector('.radio-account-content .radio-account-card-grid');
    if (!grid) return;

    const destinations = new Map([
      ['favorites', 'favorites'],
      ['playlists', 'playlists'],
      ['history events', 'history']
    ]);

    grid.querySelectorAll('.radio-account-stat').forEach(stat => {
      const destination = destinations.get(statLabel(stat));
      if (!destination || stat.dataset.accountStatView) return;
      stat.dataset.accountStatView = destination;
      stat.setAttribute('role', 'button');
      stat.tabIndex = 0;
      stat.setAttribute('aria-label', `Open ${statLabel(stat)}`);
    });

    const panel = grid.closest('.radio-account-panel');
    if (!panel) return;

    panel.querySelector('form[data-form="profile"]')?.remove();

    if (!panel.querySelector('.radio-account-overview-actions')) {
      const actions = document.createElement('div');
      actions.className = 'radio-account-overview-actions';
      actions.innerHTML = '<button type="button" data-action="logout">Log Out</button>';
      panel.appendChild(actions);
    }
  }

  function enhancePreferences() {
    const preferencesForm = document.querySelector('.radio-account-content form[data-form="preferences"]');
    if (!preferencesForm) return;
    const panel = preferencesForm.closest('.radio-account-panel');
    if (!panel || panel.querySelector('.radio-account-profile-preferences')) return;

    const account = accountApi()?.getAccount?.() || {};
    const section = document.createElement('section');
    section.className = 'radio-account-profile-preferences';
    section.innerHTML = `
      <div class="radio-account-profile-preferences-header">
        <h3>Profile Information</h3>
        <p>Update the name displayed throughout Stashbox Radio. Your sign-in email is shown for reference.</p>
      </div>
      <form class="radio-account-form" data-form="profile">
        <label>Display name
          <input name="display_name" maxlength="120" value="${escapeHtml(account.display_name || '')}" required>
        </label>
        <label>Email
          <input value="${escapeHtml(account.email || '')}" disabled>
        </label>
        <div class="radio-account-form-actions">
          <button class="primary" type="submit">Save Changes</button>
        </div>
        <p class="radio-account-message"></p>
      </form>`;
    panel.appendChild(section);
  }

  function enhanceAccountUi() {
    injectStyles();
    enhanceOverview();
    enhancePreferences();
  }

  function queueEnhance() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      enhanceAccountUi();
    });
  }

  document.addEventListener('click', event => {
    const stat = event.target.closest('[data-account-stat-view]');
    if (!stat) return;
    event.preventDefault();
    event.stopPropagation();
    openView(stat.dataset.accountStatView);
  }, true);

  document.addEventListener('keydown', event => {
    const stat = event.target.closest('[data-account-stat-view]');
    if (!stat || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openView(stat.dataset.accountStatView);
  }, true);

  injectStyles();
  queueEnhance();
  new MutationObserver(queueEnhance).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
