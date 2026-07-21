(() => {
  const STYLE_ID = 'stashbox-password-visibility-styles';
  const DECORATED_ATTRIBUTE = 'data-password-visibility';

  function eyeIcon(passwordVisible) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path class="radio-password-eye-outline" d="M3.4 12s3.15-4.55 8.6-4.55S20.6 12 20.6 12 17.45 16.55 12 16.55 3.4 12 3.4 12Z" />
        <circle class="radio-password-eye-pupil" cx="12" cy="12" r="2.15" />
        ${passwordVisible ? '<path class="radio-password-eye-slash" d="M5.1 18.9 18.9 5.1" />' : ''}
      </svg>`;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radio-password-field {
        position: relative;
        display: block;
        width: 100%;
      }

      .radio-password-field > input {
        width: 100%;
        padding-right: 52px !important;
      }

      .radio-password-toggle {
        position: absolute;
        top: 50%;
        right: 7px;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 32px;
        padding: 0;
        border: 2px solid #67d7d8;
        border-radius: 8px;
        background: #12282c;
        color: #f3ffff;
        cursor: pointer;
        opacity: 1;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, .08),
          0 1px 3px rgba(0, 0, 0, .32);
        z-index: 2;
        transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease, transform .15s ease;
      }

      .radio-password-toggle:hover {
        border-color: #98ffff;
        background: #17363b;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, .12),
          0 0 0 2px rgba(103, 215, 216, .16),
          0 2px 5px rgba(0, 0, 0, .34);
      }

      .radio-password-toggle:active {
        transform: translateY(-50%) scale(.96);
      }

      .radio-password-toggle:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }

      .radio-password-toggle[aria-pressed="true"] {
        background: #19383e;
        border-color: #8ef4f5;
      }

      .radio-password-toggle svg {
        display: block;
        width: 21px;
        height: 21px;
        overflow: visible;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.9;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }

      .radio-password-eye-pupil {
        fill: none;
      }

      .radio-password-eye-slash {
        stroke: #9fffff;
        stroke-width: 2.15;
      }

      @media (max-width: 600px) {
        .radio-password-field > input {
          padding-right: 50px !important;
        }

        .radio-password-toggle {
          right: 6px;
          width: 35px;
          height: 31px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function decoratePasswordInput(input) {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.hasAttribute(DECORATED_ATTRIBUTE)) return;

    input.setAttribute(DECORATED_ATTRIBUTE, 'true');

    const wrapper = document.createElement('span');
    wrapper.className = 'radio-password-field';
    input.parentNode?.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'radio-password-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.title = 'Show password';
    toggle.innerHTML = eyeIcon(false);
    wrapper.appendChild(toggle);
  }

  function scan(root = document) {
    if (root instanceof HTMLInputElement && root.type === 'password') {
      decoratePasswordInput(root);
    }

    root.querySelectorAll?.('input[type="password"]')
      .forEach(decoratePasswordInput);
  }

  function togglePassword(button) {
    const wrapper = button.closest('.radio-password-field');
    const input = wrapper?.querySelector(`input[${DECORATED_ATTRIBUTE}]`);
    if (!input) return;

    const makeVisible = input.type === 'password';
    input.type = makeVisible ? 'text' : 'password';
    button.setAttribute('aria-label', makeVisible ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(makeVisible));
    button.title = makeVisible ? 'Hide password' : 'Show password';
    button.innerHTML = eyeIcon(makeVisible);
    input.focus({ preventScroll: true });
  }

  injectStyles();
  scan();

  document.addEventListener('click', event => {
    const button = event.target.closest('.radio-password-toggle');
    if (!button) return;
    event.preventDefault();
    togglePassword(button);
  });

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();