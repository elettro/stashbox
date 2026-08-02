(() => {
  'use strict';

  const reviewItems = new Map();
  const originalFetch = window.fetch.bind(window);
  let enhanceScheduled = false;

  const BUTTON_HELP = Object.freeze({
    'preview video': 'Loads a temporary secure preview of this rendered video. This does not publish or change its review status.',
    approve: 'Marks this item approved in Content Review. It does not publish the video. Disabled means this item is already approved.',
    hold: 'Places this item on hold so it stays in Content Review and is not ready for publishing.',
    regenerate: 'Creates and launches a replacement render using the current song assets and settings. The existing item is placed on hold.',
    hide: 'Removes this item from the normal Content Review view without deleting the underlying render.',
    play: 'Plays the secure preview video.',
    pause: 'Pauses the secure preview video.',
    'retry secure preview': 'Requests a fresh temporary preview link and reloads the video.',
    'select visible': 'Selects every video currently visible after applying campaign and filter settings.',
    'clear selection': 'Clears all selected campaign videos.',
    'approve selected': 'Marks all selected videos approved in Content Review. Nothing is published.',
    'hold selected': 'Places all selected videos on hold.',
    'regenerate selected': 'Creates replacement renders for all selected videos after confirmation.',
    'hide selected': 'Hides all selected videos from the normal Content Review view.',
    'refresh campaign': 'Reloads the latest campaign and Content Review information from the backend.',
    'clear filters': 'Clears the search, review-status, and aspect-ratio filters.',
    'save token': 'Stores the DEV admin token in this browser so the page can access protected review data.',
    'clear token': 'Removes the saved DEV admin token from this browser.'
  });

  function clean(value) {
    return String(value ?? '').trim();
  }

  function findArtworkInfo(item = {}) {
    const candidates = [
      item?.video?.artwork_selection,
      item?.source?.artwork_selection,
      item?.metadata?.artwork_selection,
      item?.artwork_selection,
      item?.video,
      item?.source,
      item?.metadata,
      item
    ].filter(Boolean);

    for (const source of candidates) {
      const requested = clean(
        source.requested_ratio || source.artwork_requested_ratio ||
        source.requested_artwork_ratio || source.aspect_ratio
      );
      const selected = clean(
        source.source_ratio || source.artwork_source_ratio ||
        source.selected_artwork_ratio || source.profile_image_ratio
      );
      const rule = clean(
        source.selection_rule || source.artwork_selection_rule ||
        source.artwork_source || source.profile_image_source
      );
      const url = clean(
        source.artwork_url || source.selected_artwork_url ||
        source.profile_image_url
      );

      if (requested || selected || rule || url) {
        return {
          requested: requested || clean(item?.video?.aspect_ratio || item?.aspect_ratio),
          selected,
          rule,
          url
        };
      }
    }

    return {
      requested: clean(item?.video?.aspect_ratio || item?.aspect_ratio),
      selected: '',
      rule: '',
      url: ''
    };
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (/\/social\/review-items(?:\?|$)/.test(requestUrl) && response.ok) {
        const payload = await response.clone().json();
        for (const item of Array.isArray(payload?.items) ? payload.items : []) {
          if (item?.id) reviewItems.set(clean(item.id), item);
        }
      }
    } catch (_) {
      // Never interfere with the primary page request.
    }
    return response;
  };

  function reviewIdFromCard(card) {
    const ids = card.querySelector('.ids')?.textContent || '';
    return clean(ids.match(/Review:\s*([^\n]+)/i)?.[1]);
  }

  function ensureArtworkMetadata(card) {
    if (card.querySelector('.artwork-selection')) return;
    const reviewId = reviewIdFromCard(card);
    const item = reviewItems.get(reviewId);
    if (!item) return;

    const info = findArtworkInfo(item);
    const row = document.createElement('div');
    row.className = 'artwork-selection';

    const requested = info.requested || 'unknown';
    const selected = info.selected || 'not reported';
    const rule = info.rule || 'not reported';
    row.innerHTML = [
      '<strong>Profile artwork</strong>',
      `<span>Requested: ${escapeHtml(requested)}</span>`,
      `<span>Selected: ${escapeHtml(selected)}</span>`,
      `<span>Rule: ${escapeHtml(rule.replaceAll('_', ' '))}</span>`
    ].join('');

    if (requested === '9:16' && selected && selected !== '9x16' && selected !== '9:16') {
      row.dataset.warning = 'true';
      row.title = 'Warning: this vertical render reports a non-vertical song profile image.';
    }

    const ids = card.querySelector('.ids');
    if (ids) ids.before(row);
  }

  function escapeHtml(value) {
    return clean(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function addTooltip(control, helpText) {
    if (!control || !helpText) return;
    control.dataset.tooltip = helpText;
    control.setAttribute('title', helpText);
    control.setAttribute('aria-description', helpText);
    control.classList.add('has-tooltip');
  }

  function ensureButtonTooltips(root = document) {
    for (const control of root.querySelectorAll('button, a.btn')) {
      const key = clean(control.textContent).toLowerCase();
      let helpText = BUTTON_HELP[key];
      if (key === 'approve' && control.disabled) {
        helpText = 'This item is already approved. Approval changes Content Review status only and does not publish the video.';
      }
      addTooltip(control, helpText);
    }
  }

  function ensureRetry(preview) {
    if (!/Preview unavailable:|Preview expired\./i.test(preview.textContent || '')) return;
    if (preview.querySelector('.preview-retry')) return;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn primary preview-retry';
    retry.textContent = 'Retry secure preview';
    addTooltip(retry, BUTTON_HELP['retry secure preview']);
    retry.addEventListener('click', () => {
      const card = preview.closest('.card');
      card?.querySelector('.card-actions .btn.primary')?.click();
    });
    preview.appendChild(retry);
  }

  function ensureVideoControls(preview) {
    const video = preview.querySelector('video');
    if (!video) return;

    video.controls = true;
    video.setAttribute('controls', '');
    video.playsInline = true;
    video.preload = 'metadata';
    video.removeAttribute('autoplay');

    if (preview.querySelector('.preview-play-toggle')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'preview-play-toggle';
    toggle.textContent = video.paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', 'Play or pause preview video');
    addTooltip(toggle, video.paused ? BUTTON_HELP.play : BUTTON_HELP.pause);
    toggle.addEventListener('click', async () => {
      if (video.paused) {
        try { await video.play(); } catch (_) { /* Native controls remain available. */ }
      } else {
        video.pause();
      }
    });
    video.addEventListener('play', () => {
      toggle.textContent = 'Pause';
      addTooltip(toggle, BUTTON_HELP.pause);
    });
    video.addEventListener('pause', () => {
      toggle.textContent = 'Play';
      addTooltip(toggle, BUTTON_HELP.play);
    });
    video.addEventListener('ended', () => {
      toggle.textContent = 'Play';
      addTooltip(toggle, BUTTON_HELP.play);
    });
    preview.appendChild(toggle);
  }

  function enhance() {
    enhanceScheduled = false;
    const grid = document.getElementById('grid');
    ensureButtonTooltips(document);
    if (!grid) return;
    const cards = [...grid.querySelectorAll('.card')];
    grid.dataset.cardCount = String(cards.length);

    for (const card of cards) {
      ensureArtworkMetadata(card);
      ensureButtonTooltips(card);
      const preview = card.querySelector('.preview');
      if (!preview) continue;
      ensureRetry(preview);
      ensureVideoControls(preview);
    }
  }

  function scheduleEnhance() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    window.requestAnimationFrame(enhance);
  }

  function start() {
    const grid = document.getElementById('grid');
    ensureButtonTooltips(document);
    if (!grid) {
      window.setTimeout(start, 100);
      return;
    }
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(grid, { childList: true, subtree: true });
    scheduleEnhance();
  }

  document.addEventListener('DOMContentLoaded', start);
})();
