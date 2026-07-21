(() => {
  const STYLE_ID = 'stashbox-dev-header-action-alignment';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .stashbox-action-row {
      align-items: center !important;
    }

    .stashbox-action-row > button,
    .stashbox-action-row > .radio-account-actions > .radio-account-button {
      height: 38px !important;
      min-height: 38px !important;
      max-height: 38px !important;
      box-sizing: border-box !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      line-height: 1 !important;
      vertical-align: middle !important;
    }

    .stashbox-action-row > .radio-account-actions {
      height: 38px !important;
      min-height: 38px !important;
      align-items: center !important;
    }

    @media (max-width: 900px) {
      .stashbox-action-row > button,
      .stashbox-action-row > .radio-account-actions > .radio-account-button,
      .stashbox-action-row > .radio-account-actions {
        height: 38px !important;
        min-height: 38px !important;
        max-height: 38px !important;
      }
    }
  `;

  document.head.appendChild(style);
})();
