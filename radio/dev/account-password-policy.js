(() => {
  const MINIMUM_PASSWORD_LENGTH = 8;

  function applyPasswordPolicy(root = document) {
    root.querySelectorAll?.('input[type="password"][name="password"]').forEach((input) => {
      input.minLength = MINIMUM_PASSWORD_LENGTH;
    });

    root.querySelectorAll?.('.radio-account-dev-note, .radio-account-message').forEach((element) => {
      const current = element.textContent || '';
      if (current.includes('at least 12 characters')) {
        element.textContent = current.replaceAll(
          'at least 12 characters',
          `at least ${MINIMUM_PASSWORD_LENGTH} characters`
        );
      }
    });
  }

  applyPasswordPolicy();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) applyPasswordPolicy(node);
      });

      if (mutation.type === 'characterData') {
        applyPasswordPolicy(mutation.target.parentElement || document);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
