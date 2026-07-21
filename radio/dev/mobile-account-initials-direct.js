(() => {
  if (window.__stashboxMobileAccountInitialsDirectLoaded) return;
  window.__stashboxMobileAccountInitialsDirectLoaded = true;

  const isMobile = () => window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)').matches
    || /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');

  if (!isMobile()) return;

  const SELECTOR = '.radio-account-user-button, [data-account-menu-toggle]';
  let queued = false;

  function initialsFor(name) {
    const words = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
  }

  function fullNameFor(button) {
    const accountName = String(window.StashboxRadioAccount?.getAccount?.()?.display_name || '').trim();
    if (accountName) return accountName;

    const savedName = String(button.dataset.accountFullName || '').trim();
    if (savedName.length > 2) return savedName;

    const currentText = String(button.textContent || '').trim();
    if (currentText.length > 2) return currentText;

    const titleName = String(button.getAttribute('title') || '')
      .replace(/^(?:My Account:|Open My Account for|Open account menu for)\s*/i, '')
      .trim();
    if (titleName.length > 2) return titleName;

    const ariaName = String(button.getAttribute('aria-label') || '')
      .replace(/^(?:My Account:|Open My Account for|Open account menu for)\s*/i, '')
      .trim();
    if (ariaName.length > 2) return ariaName;

    return 'Listener';
  }

  function renderInitials(button) {
    const fullName = fullNameFor(button);
    const initials = initialsFor(fullName);

    button.dataset.accountFullName = fullName;
    button.dataset.accountInitials = initials;

    if (String(button.textContent || '').trim() !== initials) {
      button.replaceChildren(document.createTextNode(initials));
    }

    button.style.setProperty('display', 'inline-grid', 'important');
    button.style.setProperty('place-items', 'center', 'important');
    button.style.setProperty('width', '52px', 'important');
    button.style.setProperty('min-width', '52px', 'important');
    button.style.setProperty('max-width', '52px', 'important');
    button.style.setProperty('height', '52px', 'important');
    button.style.setProperty('min-height', '52px', 'important');
    button.style.setProperty('padding', '0', 'important');
    button.style.setProperty('overflow', 'hidden', 'important');
    button.style.setProperty('font-size', '14px', 'important');
    button.style.setProperty('font-weight', '900', 'important');
    button.style.setProperty('line-height', '1', 'important');
    button.style.setProperty('letter-spacing', '0.06em', 'important');
    button.style.setProperty('color', '#fff', 'important');
    button.style.setProperty('text-indent', '0', 'important');
    button.style.setProperty('white-space', 'nowrap', 'important');
    button.style.setProperty('text-align', 'center', 'important');

    button.setAttribute('aria-label', `Open account menu for ${fullName}`);
    button.setAttribute('title', `My Account: ${fullName}`);
  }

  function enforce() {
    queued = false;
    document.querySelectorAll(SELECTOR).forEach(renderInitials);
  }

  function queueEnforce() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enforce);
  }

  enforce();

  new MutationObserver(queueEnforce).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-expanded', 'aria-label', 'title']
  });

  window.addEventListener('pageshow', enforce);
  window.addEventListener('resize', queueEnforce, { passive: true });
  window.setInterval(enforce, 250);
})();
