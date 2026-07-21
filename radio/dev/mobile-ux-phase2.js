(() => {
  const mobileQuery = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 900px)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const STYLE_HREF = './mobile-ux-phase2.css?v=20260721-phase2a';
  const STYLE_SELECTOR = 'link[data-stashbox-mobile-ux-phase2]';
  const TOOL_SELECTOR = '.mobile-song-tools';
  let filterPanelOpen = false;
  let syncFrame = 0;
  let filterSignature = '';
  let syncing = false;

  document.documentElement.classList.add('sbr-mobile-ux');

  function ensureStyleLast() {
    let link = document.querySelector(STYLE_SELECTOR);
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = STYLE_HREF;
      link.dataset.stashboxMobileUxPhase2 = 'true';
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  function initialsFor(value) {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  }

  function syncAccountInitials() {
    document.querySelectorAll('.radio-account-user-button').forEach((button) => {
      const currentText = String(button.textContent || '').trim();
      if (!button.dataset.accountFullName && currentText.length > 2) {
        button.dataset.accountFullName = currentText;
      }
      const fullName = button.dataset.accountFullName || currentText || 'Listener';
      const initials = initialsFor(fullName);
      if (button.textContent !== initials) button.textContent = initials;
      button.setAttribute('aria-label', `Open My Account for ${fullName}`);
      button.setAttribute('title', `My Account: ${fullName}`);
    });
  }

  function findOriginalFilterButton(label, text) {
    const normalizedLabel = String(label || '').trim().toLowerCase();
    const normalizedText = String(text || '').trim().toLowerCase();
    return [...document.querySelectorAll('.stashbox-radio-header .stashbox-filter-row')]
      .find((row) => String(row.querySelector('b')?.textContent || '').trim().toLowerCase() === normalizedLabel)
      ?.querySelectorAll('.stashbox-filter-pill')
      ? [...([...document.querySelectorAll('.stashbox-radio-header .stashbox-filter-row')]
        .find((row) => String(row.querySelector('b')?.textContent || '').trim().toLowerCase() === normalizedLabel)
        ?.querySelectorAll('.stashbox-filter-pill') || [])]
        .find((button) => String(button.textContent || '').trim().toLowerCase() === normalizedText)
      : null;
  }

  function filterStateSignature() {
    return [...document.querySelectorAll('.stashbox-radio-header .stashbox-filter-row')]
      .map((row) => {
        const label = String(row.querySelector('b')?.textContent || '').trim();
        const buttons = [...row.querySelectorAll('.stashbox-filter-pill')]
          .map((button) => `${button.textContent}:${button.classList.contains('active') ? 1 : 0}:${button.disabled ? 1 : 0}`)
          .join('|');
        return `${label}[${buttons}]`;
      })
      .join('::');
  }

  function rebuildFilterPanel(panel) {
    const signature = filterStateSignature();
    if (!signature || signature === filterSignature) return;
    filterSignature = signature;
    panel.replaceChildren();

    document.querySelectorAll('.stashbox-radio-header .stashbox-filter-row').forEach((originalRow) => {
      const label = String(originalRow.querySelector('b')?.textContent || '').trim();
      const row = originalRow.cloneNode(true);
      row.removeAttribute('aria-hidden');
      row.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      row.querySelectorAll('.stashbox-filter-pill').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const original = findOriginalFilterButton(label, button.textContent);
          original?.click();
          window.setTimeout(scheduleSync, 0);
        });
      });
      panel.appendChild(row);
    });
  }

  function createMobileTools() {
    const radioMain = document.querySelector('.radio-main');
    const listHead = radioMain?.querySelector('.list-head');
    if (!radioMain || !listHead) return null;

    let shell = radioMain.querySelector(TOOL_SELECTOR);
    if (shell) return shell;

    shell = document.createElement('section');
    shell.className = 'mobile-song-tools';
    shell.setAttribute('aria-label', 'Mobile song browsing controls');
    shell.innerHTML = `
      <div class="mobile-song-tools-buttons">
        <button class="mobile-song-tool-button mobile-song-filter-toggle" type="button" aria-expanded="false">Filters</button>
        <button class="mobile-song-tool-button mobile-song-video-toggle" type="button" aria-pressed="false">Songs With Videos</button>
        <button class="mobile-song-tool-button mobile-song-reset" type="button">Reset Filters</button>
      </div>
      <div class="mobile-song-filter-panel" aria-hidden="true"></div>
    `;

    radioMain.insertBefore(shell, listHead);

    const filterToggle = shell.querySelector('.mobile-song-filter-toggle');
    const filterPanel = shell.querySelector('.mobile-song-filter-panel');
    const videoToggle = shell.querySelector('.mobile-song-video-toggle');
    const resetButton = shell.querySelector('.mobile-song-reset');

    filterToggle.addEventListener('click', () => {
      filterPanelOpen = !filterPanelOpen;
      filterToggle.setAttribute('aria-expanded', String(filterPanelOpen));
      filterPanel.classList.toggle('is-open', filterPanelOpen);
      filterPanel.setAttribute('aria-hidden', String(!filterPanelOpen));
      if (filterPanelOpen) rebuildFilterPanel(filterPanel);
    });

    videoToggle.addEventListener('click', () => {
      document.querySelector('.stashbox-radio-header .stashbox-video')?.click();
      window.setTimeout(scheduleSync, 0);
    });

    resetButton.addEventListener('click', () => {
      document.querySelector('.stashbox-radio-header .stashbox-utility')?.click();
      filterPanelOpen = false;
      filterToggle.setAttribute('aria-expanded', 'false');
      filterPanel.classList.remove('is-open');
      filterPanel.setAttribute('aria-hidden', 'true');
      window.setTimeout(scheduleSync, 0);
    });

    return shell;
  }

  function syncMobileTools() {
    const shell = createMobileTools();
    if (!shell) return;

    const originalVideo = document.querySelector('.stashbox-radio-header .stashbox-video');
    const originalReset = document.querySelector('.stashbox-radio-header .stashbox-utility');
    const videoToggle = shell.querySelector('.mobile-song-video-toggle');
    const resetButton = shell.querySelector('.mobile-song-reset');
    const filterPanel = shell.querySelector('.mobile-song-filter-panel');

    const videoActive = Boolean(originalVideo?.classList.contains('active') || originalVideo?.getAttribute('aria-pressed') === 'true');
    videoToggle?.classList.toggle('active', videoActive);
    videoToggle?.setAttribute('aria-pressed', String(videoActive));
    if (videoToggle) videoToggle.disabled = Boolean(originalVideo?.disabled);
    if (resetButton) resetButton.disabled = Boolean(originalReset?.disabled);
    if (filterPanel) rebuildFilterPanel(filterPanel);
  }

  function syncNotificationTab() {
    const bell = document.querySelector('.sbr-notification-bell');
    if (!bell) return;
    bell.setAttribute('title', bell.getAttribute('aria-expanded') === 'true' ? 'Tuck notifications away' : 'Open notifications');
  }

  function syncAll() {
    if (syncing) return;
    syncing = true;
    try {
      ensureStyleLast();
      syncAccountInitials();
      syncMobileTools();
      syncNotificationTab();
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    if (syncFrame) return;
    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0;
      syncAll();
    });
  }

  ensureStyleLast();
  syncAll();

  const bodyObserver = new MutationObserver(scheduleSync);
  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-pressed', 'aria-expanded', 'disabled', 'hidden']
  });

  const headObserver = new MutationObserver(() => {
    window.setTimeout(ensureStyleLast, 0);
  });
  headObserver.observe(document.head, { childList: true });

  window.addEventListener('resize', scheduleSync, { passive: true });
})();
