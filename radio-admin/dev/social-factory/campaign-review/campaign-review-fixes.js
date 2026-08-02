(() => {
  'use strict';

  const reviewItems = new Map();
  const originalFetch = window.fetch.bind(window);

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
      `<strong>Profile artwork</strong>`,
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

  function ensureRetry(preview) {
    if (!/Preview unavailable:|Preview expired\./i.test(preview.textContent || '')) return;
    if (preview.querySelector('.preview-retry')) return;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn primary preview-retry';
    retry.textContent = 'Retry secure preview';
    retry.addEventListener('click', () => {
      const card = preview.closest('.card');
      card?.querySelector('.card-actions .btn.primary')?.click();
    });
    preview.appendChild(retry);
  }

  function autoLoadPreview(card) {
    if (card.dataset.previewAutoloaded === 'true') return;
    const preview = card.querySelector('.preview');
    const button = card.querySelector('.card-actions .btn.primary');
    if (!preview || !button) return;
    if (preview.querySelector('video, .spinner')) return;

    card.dataset.previewAutoloaded = 'true';
    window.setTimeout(() => button.click(), 80);
  }

  function enhance() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('.card')];
    grid.dataset.cardCount = String(cards.length);

    for (const card of cards) {
      ensureArtworkMetadata(card);
      const preview = card.querySelector('.preview');
      if (preview) ensureRetry(preview);
      autoLoadPreview(card);
    }
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', enhance);
})();
