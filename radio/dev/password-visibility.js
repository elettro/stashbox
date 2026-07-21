(() => {
  const STYLE_ID = 'stashbox-password-visibility-styles';
  const DECORATED_ATTRIBUTE = 'data-password-visibility';

  function eyeIcon(visible) {
    if (visible) {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.3A10.8 10.8 0 0 1 12 4c5.5 0 9.5 5.3 9.5 8 0 1.1-.7 2.5-1.9 3.9M6.6 6.6C4.1 8.3 2.5 10.8 2.5 12c0 2.7 4 8 9.5 8 1.7 0 3.3-.5 4.7-1.3"/>
        </svg>`;
    }

    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12S6.1 5 12 5s9.5 7 9.5 7-3.6 7-9.5 7S2.5 12 2.5 12Z"/>
        <circle cx="12" cy="12" r="3"/>
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
        padding-right: 46px !important;
      }

      .radio-password-toggle {
        position: absolute;
        top: 50%;
        right: 7px;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: currentColor;
        cursor: pointer;
        opacity: .72;
        z-index: 2;
      }

      .radio-password-toggle:hover,
      .radio-password-toggle:focus-visible {
        opacity: 1;
        background: rgba(255, 255, 255, .1);
      }

      .radio-password-toggle:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 1px;
      }

      .radio-password-toggle svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
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
