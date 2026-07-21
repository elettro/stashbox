(() => {
  if (window.__stashboxMobileCriticalFixesLoaded) return;
  window.__stashboxMobileCriticalFixesLoaded = true;

  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  let scanFrame = 0;

  function initialsFor(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  }

  function resolveFullName(button) {
    const accountName = String(window.StashboxRadioAccount?.getAccount?.()?.display_name || '').trim();
    if (accountName) return accountName;

    const storedName = String(button.dataset.accountFullName || '').trim();
    if (storedName && storedName.length > 2) return storedName;

    const currentText = String(button.textContent || '').trim();
    if (currentText.length > 2) return currentText;

    const titleName = String(button.getAttribute('title') || '').replace(/^My Account:\s*/i, '').trim();
    if (titleName.length > 2) return titleName;

    const ariaName = String(button.getAttribute('aria-label') || '').match(/(?:for|menu for)\s+(.+)$/i)?.[1]?.trim();
    return ariaName || 'Listener';
  }

  function forceInitials() {
    document.querySelectorAll('.radio-account-user-button, [data-account-menu-toggle]').forEach((button) => {
      const fullName = resolveFullName(button);
      const initials = initialsFor(fullName);
      button.dataset.accountFullName = fullName;
      if (String(button.textContent || '').trim() !== initials) button.textContent = initials;
      button.setAttribute('aria-label', `Open account menu for ${fullName}`);
      button.setAttribute('title', `My Account: ${fullName}`);
    });
  }

  function scrollPlayerIntoView() {
    const player = document.querySelector('.radio-interface .player, .player');
    player?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function handleArtworkClick(event) {
    const artwork = event.target?.closest?.('.song-card .song-artwork');
    if (!artwork) return;

    const card = artwork.closest('.song-card');
    if (!card) return;

    window.setTimeout(() => {
      if (!card.classList.contains('active')) card.click();
      window.setTimeout(scrollPlayerIntoView, 50);
    }, 40);
  }

  function scan() {
    forceInitials();
  }

  function queueScan() {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      scan();
    });
  }

  document.addEventListener('click', handleArtworkClick, false);

  scan();
  new MutationObserver(queueScan).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'title', 'aria-label', 'aria-expanded']
  });

  window.setInterval(forceInitials, 250);
})();
