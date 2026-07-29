(() => {
  'use strict';

  const TOOLTIP_ID = 'sfActionTooltip';
  const ACTIONS = {
    saveReview: 'Saves the title, description, tags, hashtags, collaborators, visibility, schedule field, audience settings, and review note. It does not approve, schedule, upload, or publish the video.',
    approveReview: 'Marks this content item Approved and unlocks its validation, scheduling, and publishing controls. Approving does not upload or publish anything.',
    holdReview: 'Places this content item on Hold and blocks scheduling or publishing until it is reopened and approved again. Nothing is published.',
    reopenReview: 'Returns an approved or held item to In Review so it can be edited and reviewed again. Nothing is uploaded or published.',
    validateYoutubePublish: 'Checks that the approved video, metadata, and connected YouTube channel are ready for upload. It performs no upload and publishes nothing.',
    publishYoutubeUnlisted: 'After a confirmation, uploads the approved video to the connected YouTube channel as Unlisted. The video is not public or searchable, but anyone with its link can view it.',
    validateSchedule: 'Checks that the item is approved and that the selected date and time are valid. It does not create a schedule or publish anything.',
    scheduleApprovedItem: 'After a confirmation, creates a one-time publishing schedule for the selected future date and time. It does not publish the video immediately.',
    cancelScheduledItem: 'Removes the active one-time publishing schedule. It does not upload or publish the video.'
  };

  let tooltip = null;
  let currentTarget = null;
  let hideTimer = 0;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'sf-action-tooltip';
    tooltip.role = 'tooltip';
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function applyTooltips() {
    Object.entries(ACTIONS).forEach(([id, explanation]) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.dataset.sfActionTooltip = explanation;
      button.title = explanation;
      button.setAttribute('aria-describedby', TOOLTIP_ID);
    });
  }

  function positionTooltip(target) {
    if (!tooltip || tooltip.hidden || !target?.isConnected) return;
    const rect = target.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const gap = 12;
    const edge = 10;
    const fitsAbove = rect.top >= tip.height + gap + edge;
    const placement = fitsAbove ? 'top' : 'bottom';
    const top = fitsAbove ? rect.top - tip.height - gap : rect.bottom + gap;
    const idealLeft = rect.left + rect.width / 2 - tip.width / 2;
    const maxLeft = Math.max(edge, window.innerWidth - tip.width - edge);
    const left = Math.min(Math.max(edge, idealLeft), maxLeft);

    tooltip.dataset.placement = placement;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(edge, top))}px`;
  }

  function showTooltip(target) {
    const explanation = target?.dataset?.sfActionTooltip;
    if (!explanation) return;
    window.clearTimeout(hideTimer);
    currentTarget = target;
    const node = ensureTooltip();
    node.textContent = explanation;
    node.hidden = false;
    requestAnimationFrame(() => positionTooltip(target));
  }

  function hideTooltip(delay = 0) {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (tooltip) tooltip.hidden = true;
      currentTarget = null;
    }, delay);
  }

  function tooltipTargetAtPointer(event) {
    const pointTarget = document.elementFromPoint(event.clientX, event.clientY);
    return pointTarget?.closest?.('[data-sf-action-tooltip]') || null;
  }

  function install() {
    ensureTooltip();
    applyTooltips();

    const actions = document.querySelector('.sf-form-actions');
    if (actions) {
      new MutationObserver(() => {
        applyTooltips();
        if (currentTarget && (currentTarget.hidden || !currentTarget.isConnected)) hideTooltip();
      }).observe(actions, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
    }

    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const target = tooltipTargetAtPointer(event);
      if (target === currentTarget) return;
      if (target) showTooltip(target);
      else hideTooltip(60);
    }, { passive: true });

    document.addEventListener('focusin', (event) => {
      const target = event.target.closest?.('[data-sf-action-tooltip]');
      if (target) showTooltip(target);
    });

    document.addEventListener('focusout', (event) => {
      if (event.target.closest?.('[data-sf-action-tooltip]')) hideTooltip(80);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideTooltip();
    });

    window.addEventListener('scroll', () => {
      if (currentTarget) positionTooltip(currentTarget);
    }, { passive: true, capture: true });
    window.addEventListener('resize', () => {
      if (currentTarget) positionTooltip(currentTarget);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();