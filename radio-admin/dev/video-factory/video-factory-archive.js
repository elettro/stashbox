(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const JOBS_URL = `${API_ROOT}/admin/video-factory/jobs`;
  const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';
  const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);

  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');
  const historyStatus = document.getElementById('historyStatus');
  const refreshHistory = document.getElementById('refreshHistory');
  const message = document.getElementById('message');

  if (!historyList || !historyStatus || !refreshHistory) return;

  function showMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('error', isError);
    message.classList.remove('hidden');
  }

  function getStatus(card) {
    const badge = card.querySelector('.vf-job-header .vf-badge');
    return String(badge?.textContent || '').trim().toLowerCase();
  }

  function getJobId(card) {
    return String(card.querySelector('[data-job-id]')?.dataset.jobId || '').trim();
  }

  async function performAction(jobId, action) {
    const token = String(localStorage.getItem(TOKEN_STORAGE_KEY) || '').trim();
    if (!token) throw new Error('Save the DEV admin token before changing Render History.');

    const response = await fetch(`${JOBS_URL}/${encodeURIComponent(jobId)}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: '{}'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Render ${action} failed.`);
    return body;
  }

  function createActionButton(jobId, action, label, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vf-small-button${danger ? ' vf-danger-button' : ''}`;
    button.dataset.archiveAction = action;
    button.dataset.jobId = jobId;
    button.textContent = label;
    button.addEventListener('click', async () => {
      if (action === 'archive') {
        const confirmed = window.confirm('Archive this render? It will disappear from the normal list but the MP4 will remain safely stored.');
        if (!confirmed) return;
      }

      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = action === 'archive' ? 'Archiving…' : 'Restoring…';
      try {
        const body = await performAction(jobId, action);
        showMessage(body.message || `Render ${action} completed.`);
        refreshHistory.click();
      } catch (error) {
        showMessage(error.message, true);
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    return button;
  }

  function updateEmptyState() {
    if (!historyEmpty) return;
    const visibleCards = [...historyList.querySelectorAll('.vf-job-card')]
      .filter(card => !card.hidden);
    historyEmpty.classList.toggle('hidden', visibleCards.length > 0);
    if (!visibleCards.length && historyStatus.value === 'archived') {
      historyEmpty.textContent = 'No archived renders.';
    } else if (!visibleCards.length) {
      historyEmpty.textContent = 'No Video Factory jobs match the current filters.';
    }
  }

  function enhanceCards() {
    const selectedStatus = historyStatus.value;

    historyList.querySelectorAll('.vf-job-card').forEach(card => {
      const status = getStatus(card);
      const jobId = getJobId(card);
      card.hidden = selectedStatus === 'all' && status === 'archived';

      if (!jobId || card.dataset.archiveEnhanced === 'true') return;
      const actions = card.querySelector('.vf-actions');
      if (!actions) return;

      if (status === 'archived') {
        actions.prepend(createActionButton(jobId, 'restore', 'Restore'));
      } else if (!ACTIVE_STATUSES.has(status)) {
        actions.append(createActionButton(jobId, 'archive', 'Archive', true));
      }
      card.dataset.archiveEnhanced = 'true';
    });

    updateEmptyState();
  }

  const observer = new MutationObserver(enhanceCards);
  observer.observe(historyList, { childList: true, subtree: true });
  historyStatus.addEventListener('change', () => window.setTimeout(enhanceCards, 0));
  enhanceCards();
})();
