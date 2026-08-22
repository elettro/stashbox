(() => {
  'use strict';

  const AUTH_INPUT_SELECTOR = '.v2-auth-input-shell input';

  const normalizeAuthInput = input => {
    if (!(input instanceof HTMLInputElement) || !input.matches(AUTH_INPUT_SELECTOR)) return;

    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.style.setProperty('text-transform', 'none', 'important');
    input.style.setProperty('font-family', 'var(--font-body, "Karla", system-ui, sans-serif)', 'important');
    input.style.setProperty('font-variant', 'normal', 'important');

    if (input.type === 'email') input.setAttribute('inputmode', 'email');
  };

  const normalizeAllAuthInputs = root => {
    if (root instanceof HTMLInputElement) normalizeAuthInput(root);
    root?.querySelectorAll?.(AUTH_INPUT_SELECTOR).forEach(normalizeAuthInput);
  };

  normalizeAllAuthInputs(document);

  new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node instanceof Element) normalizeAllAuthInputs(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('focusin', event => normalizeAuthInput(event.target));
})();
