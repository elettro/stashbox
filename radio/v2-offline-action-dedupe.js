(() => {
  'use strict';

  let scheduled = false;

  function cleanList(list) {
    if (!list) return;

    const seen = new Set();
    list.querySelectorAll('[data-offline-action]').forEach(row => {
      const action = row.dataset.offlineAction;
      const key = action === 'download' || action === 'downloaded' ? 'download' : action;
      if (key !== 'download' && key !== 'library') return;

      if (seen.has(key)) {
        row.remove();
        return;
      }

      seen.add(key);
    });
  }

  function cleanAll() {
    document.querySelectorAll('.v2-li-action-list').forEach(cleanList);
  }

  function scheduleClean() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      cleanAll();
    });
  }

  const observer = new MutationObserver(scheduleClean);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-li-more]')) return;
    scheduleClean();
    setTimeout(scheduleClean, 120);
  }, true);

  cleanAll();
})();
