(() => {
  const STYLE_ID = 'stashbox-account-preferences-ui';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .radio-account-form[data-form="preferences"] {
      gap: 16px;
    }

    .radio-account-form[data-form="preferences"] > label {
      gap: 8px;
      color: #f4f4f4;
      font-size: 14px;
      letter-spacing: .01em;
    }

    .radio-account-form[data-form="preferences"] > label > span {
      display: flex;
      flex-direction: row-reverse;
      align-items: center;
      justify-content: space-between;
      gap: 22px;
      min-height: 58px;
      box-sizing: border-box;
      padding: 11px 14px 11px 16px;
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, .02));
      color: #f7f7f7;
      font: 700 14px/1.25 Karla, Arial, sans-serif;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .025);
      transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
    }

    .radio-account-form[data-form="preferences"] > label > span:hover {
      border-color: rgba(240, 165, 0, .48);
      background: linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .028));
    }

    .radio-account-form[data-form="preferences"] input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      flex: 0 0 auto;
      width: 54px;
      height: 30px;
      min-height: 30px;
      margin: 0;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, .24);
      border-radius: 999px;
      background-color: #343434;
      background-image: radial-gradient(circle at 14px 50%, #ffffff 0 9px, transparent 9.7px);
      box-shadow: inset 0 2px 5px rgba(0, 0, 0, .42), 0 1px 2px rgba(0, 0, 0, .32);
      cursor: pointer;
      transition: background-color .18s ease, background-position .18s ease, border-color .18s ease, box-shadow .18s ease;
    }

    .radio-account-form[data-form="preferences"] input[type="checkbox"]:checked {
      border-color: #f0a500;
      background-color: #f0a500;
      background-image: radial-gradient(circle at calc(100% - 14px) 50%, #ffffff 0 9px, transparent 9.7px);
      box-shadow: inset 0 1px 2px rgba(125, 77, 0, .28), 0 0 0 2px rgba(240, 165, 0, .10);
    }

    .radio-account-form[data-form="preferences"] input[type="checkbox"]:hover {
      border-color: rgba(255, 255, 255, .52);
    }

    .radio-account-form[data-form="preferences"] input[type="checkbox"]:checked:hover {
      border-color: #ffc343;
      background-color: #ffb20b;
    }

    .radio-account-form[data-form="preferences"] input[type="checkbox"]:focus-visible {
      outline: 2px solid #ffffff;
      outline-offset: 3px;
    }

    .radio-account-form[data-form="preferences"] select,
    .radio-account-form[data-form="preferences"] input[type="text"] {
      border-color: rgba(255, 255, 255, .18);
      background: #0b0b0b;
      transition: border-color .16s ease, box-shadow .16s ease;
    }

    .radio-account-form[data-form="preferences"] select:focus,
    .radio-account-form[data-form="preferences"] input[type="text"]:focus {
      border-color: #f0a500;
      outline: none;
      box-shadow: 0 0 0 3px rgba(240, 165, 0, .12);
    }

    .radio-account-form[data-form="preferences"] .radio-account-form-actions {
      padding-top: 4px;
    }

    .radio-account-form[data-form="preferences"] .radio-account-form-actions .primary {
      min-height: 42px;
      padding-inline: 18px;
      box-shadow: 0 4px 14px rgba(240, 165, 0, .16);
    }

    @media (max-width: 620px) {
      .radio-account-form[data-form="preferences"] > label > span {
        min-height: 56px;
        padding: 10px 12px 10px 14px;
        gap: 16px;
      }

      .radio-account-form[data-form="preferences"] input[type="checkbox"] {
        width: 50px;
        height: 28px;
        min-height: 28px;
        background-image: radial-gradient(circle at 13px 50%, #ffffff 0 8px, transparent 8.7px);
      }

      .radio-account-form[data-form="preferences"] input[type="checkbox"]:checked {
        background-image: radial-gradient(circle at calc(100% - 13px) 50%, #ffffff 0 8px, transparent 8.7px);
      }
    }
  `;

  document.head.appendChild(style);
})();
