(() => {
  'use strict';

  let currentReviewId = '';
  let applying = false;

  function selectedReviewId() {
    return String(document.querySelector('.sf-queue-item[aria-current="true"]')?.dataset?.reviewId || '').trim();
  }

  function applyDefaults() {
    if (applying) return;
    const reviewId = selectedReviewId();
    if (!reviewId || reviewId === currentReviewId) return;

    const collaborators = document.getElementById('collaborators');
    const notify = document.getElementById('notifySubscribers');
    const synthetic = document.getElementById('containsSyntheticMedia');
    if (!collaborators || !notify || !synthetic) return;

    applying = true;
    currentReviewId = reviewId;

    const collaboratorValue = String(collaborators.value || '').trim();
    if (!collaboratorValue || collaboratorValue === 'Elettro TV | @Elettrotv | Collaborator') {
      collaborators.value = '@Elettrotv';
    }

    notify.checked = true;
    synthetic.checked = true;
    applying = false;
  }

  function prepareCollaboratorForSave() {
    const collaborators = document.getElementById('collaborators');
    if (!collaborators) return;
    if (String(collaborators.value || '').trim().toLowerCase() !== '@elettrotv') return;

    collaborators.value = '| @Elettrotv |';
    window.setTimeout(() => {
      if (collaborators.isConnected) collaborators.value = '@Elettrotv';
    }, 0);
  }

  function init() {
    const queue = document.getElementById('queueList');
    const form = document.getElementById('reviewForm');
    if (!queue || !form) return;

    new MutationObserver(() => window.setTimeout(applyDefaults, 0)).observe(queue, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-current']
    });

    form.addEventListener('submit', prepareCollaboratorForSave, true);
    document.getElementById('saveReview')?.addEventListener('click', prepareCollaboratorForSave, true);
    document.getElementById('approveReview')?.addEventListener('click', prepareCollaboratorForSave, true);

    window.setTimeout(applyDefaults, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
