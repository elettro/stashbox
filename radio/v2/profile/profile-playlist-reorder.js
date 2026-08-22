(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const baselines = new WeakMap();
  const savedOrders = new Map();
  let scheduled = false;
  let drag = null;
  let autoScrollFrame = 0;

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  function authHeaders(json = false) {
    const tokens = readTokens();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
    };
  }

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function orderFor(list) {
    return [...list.querySelectorAll(':scope > .profile-list-row[data-reorder-item-id]')]
      .map(row => row.dataset.reorderItemId)
      .filter(Boolean);
  }

  function sameOrder(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function gripMarkup() {
    return '<span class="profile-reorder-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  }

  function playlistContext() {
    const overlays = [...document.querySelectorAll('.profile-overlay')].reverse();
    const overlay = overlays.find(node => node.isConnected && node.querySelector('[data-remove-playlist-item][data-playlist-id]'));
    if (!overlay) return null;
    const list = overlay.querySelector('.profile-sheet-body .profile-list');
    if (!list) return null;
    const itemButtons = [...list.querySelectorAll('[data-remove-playlist-item][data-playlist-id]')];
    if (!itemButtons.length) return null;
    const playlistId = itemButtons[0].dataset.playlistId || '';
    if (!playlistId || itemButtons.some(button => button.dataset.playlistId !== playlistId)) return null;
    return { overlay, list, playlistId, itemButtons };
  }

  function applyOrder(list, desired) {
    if (!Array.isArray(desired) || !desired.length) return;
    const rows = [...list.querySelectorAll(':scope > .profile-list-row[data-reorder-item-id]')];
    const rowMap = new Map(rows.map(row => [row.dataset.reorderItemId, row]));
    const complete = desired.filter(id => rowMap.has(id));
    rows.forEach(row => {
      if (!complete.includes(row.dataset.reorderItemId)) complete.push(row.dataset.reorderItemId);
    });
    if (!sameOrder(orderFor(list), complete)) complete.forEach(id => list.appendChild(rowMap.get(id)));
  }

  function updateSaveState(context, message = '') {
    const button = context.overlay.querySelector('[data-save-playlist-order]');
    const status = context.overlay.querySelector('[data-playlist-order-message]');
    if (!button || button.dataset.orderSaving === 'true' || context.list.dataset.orderHydrating === 'true') return;
    const current = orderFor(context.list);
    const baseline = baselines.get(context.list) || current;
    const dirty = !sameOrder(current, baseline);
    button.disabled = !dirty || current.length < 2;
    button.classList.toggle('is-dirty', dirty);
    setText(button, dirty ? 'Save Order' : 'Order Saved');
    if (status && message) {
      setText(status, message);
      status.classList.remove('success', 'error');
    }
  }

  async function hydrateSavedOrder(context) {
    if (context.list.dataset.orderHydrated === 'true' || context.list.dataset.orderHydrating === 'true') return;
    context.list.dataset.orderHydrating = 'true';
    const status = context.overlay.querySelector('[data-playlist-order-message]');
    if (status) setText(status, 'Loading your saved song order…');

    try {
      const tokens = readTokens();
      if (!tokens.accessToken) throw new Error('Your session expired. Log in again.');
      const body = await fetch(`${API_ROOT}/radio/me/playlists/${encodeURIComponent(context.playlistId)}`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: authHeaders()
      }).then(parseResponse);
      const ids = Array.isArray(body.playlist?.items) ? body.playlist.items.map(item => String(item.id || '')).filter(Boolean) : [];
      if (ids.length) {
        savedOrders.set(context.playlistId, ids);
        applyOrder(context.list, ids);
      } else {
        applyOrder(context.list, savedOrders.get(context.playlistId));
      }
      baselines.set(context.list, orderFor(context.list));
      if (status) setText(status, context.itemButtons.length > 1 ? 'Grab the handle on the left of a song, move it, then save.' : 'Add more songs to rearrange this playlist.');
    } catch (error) {
      applyOrder(context.list, savedOrders.get(context.playlistId));
      baselines.set(context.list, orderFor(context.list));
      if (status) {
        setText(status, `Saved order could not be refreshed: ${error.message}`);
        status.classList.add('error');
      }
    } finally {
      delete context.list.dataset.orderHydrating;
      context.list.dataset.orderHydrated = 'true';
      updateSaveState(context);
    }
  }

  function decorate() {
    scheduled = false;
    const context = playlistContext();
    if (!context) return;

    context.itemButtons.forEach(button => {
      const row = button.closest('.profile-list-row');
      const itemId = button.dataset.removePlaylistItem || '';
      if (!row || !itemId) return;
      row.dataset.reorderItemId = itemId;
      row.dataset.reorderPlaylistId = context.playlistId;
      row.classList.add('is-reorderable');
      if (!row.querySelector(':scope > .profile-reorder-handle')) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'profile-reorder-handle';
        handle.dataset.reorderHandle = 'true';
        handle.setAttribute('aria-label', `Move ${row.querySelector('.profile-list-copy strong')?.textContent || 'song'} up or down`);
        handle.title = 'Hold and drag to rearrange';
        handle.innerHTML = gripMarkup();
        row.prepend(handle);
      }
    });

    const toolbar = context.overlay.querySelector('.profile-sheet-body > .profile-form-actions');
    if (toolbar && !toolbar.querySelector('[data-save-playlist-order]')) {
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'profile-button profile-save-order';
      save.dataset.savePlaylistOrder = context.playlistId;
      save.disabled = true;
      save.textContent = 'Order Saved';
      toolbar.appendChild(save);

      const status = document.createElement('p');
      status.className = 'profile-order-message';
      status.dataset.playlistOrderMessage = 'true';
      status.setAttribute('role', 'status');
      status.textContent = 'Loading your saved song order…';
      toolbar.insertAdjacentElement('afterend', status);
    }

    if (!baselines.has(context.list)) baselines.set(context.list, orderFor(context.list));
    hydrateSavedOrder(context);
    updateSaveState(context);
  }

  function queueDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function markDirty() {
    const context = playlistContext();
    if (!context) return;
    updateSaveState(context, 'Order changed. Tap Save Order to keep it.');
  }

  function startAutoScroll() {
    cancelAnimationFrame(autoScrollFrame);
    const tick = () => {
      if (!drag) return;
      const rect = drag.scroller.getBoundingClientRect();
      const edge = Math.min(80, rect.height * .2);
      let amount = 0;
      if (drag.clientY < rect.top + edge) amount = -Math.max(4, Math.round((rect.top + edge - drag.clientY) / 5));
      if (drag.clientY > rect.bottom - edge) amount = Math.max(4, Math.round((drag.clientY - (rect.bottom - edge)) / 5));
      if (amount) drag.scroller.scrollTop += amount;
      autoScrollFrame = requestAnimationFrame(tick);
    };
    autoScrollFrame = requestAnimationFrame(tick);
  }

  function beginDrag(event, handle) {
    const row = handle.closest('.profile-list-row[data-reorder-item-id]');
    const list = row?.parentElement;
    const scroller = row?.closest('.profile-sheet-body');
    if (!row || !list || !scroller || list.dataset.orderHydrating === 'true') return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, handle, row, list, scroller, clientY: event.clientY, moved: false };
    handle.setPointerCapture?.(event.pointerId);
    row.classList.add('is-dragging');
    list.classList.add('is-reordering');
    startAutoScroll();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.clientY = event.clientY;
    const candidates = [...drag.list.querySelectorAll(':scope > .profile-list-row[data-reorder-item-id]')].filter(row => row !== drag.row);
    const before = candidates.find(row => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    if (before) drag.list.insertBefore(drag.row, before);
    else drag.list.appendChild(drag.row);
    drag.moved = true;
  }

  function finishDrag(event) {
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    cancelAnimationFrame(autoScrollFrame);
    drag.handle.releasePointerCapture?.(drag.pointerId);
    drag.row.classList.remove('is-dragging');
    drag.list.classList.remove('is-reordering');
    const moved = drag.moved;
    drag = null;
    if (moved) markDirty();
  }

  function keyboardMove(event, handle) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const row = handle.closest('.profile-list-row[data-reorder-item-id]');
    if (!row || row.parentElement.dataset.orderHydrating === 'true') return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    if (event.key === 'ArrowDown' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
    markDirty();
    handle.focus();
  }

  async function saveOrder(button) {
    const context = playlistContext();
    if (!context || context.playlistId !== button.dataset.savePlaylistOrder || button.dataset.orderSaving === 'true') return;
    const orderedItemIds = orderFor(context.list);
    const status = context.overlay.querySelector('[data-playlist-order-message]');
    if (!readTokens().accessToken) {
      if (status) {
        setText(status, 'Your session expired. Log in again before saving.');
        status.className = 'profile-order-message error';
      }
      return;
    }

    button.dataset.orderSaving = 'true';
    button.disabled = true;
    setText(button, 'Saving…');
    if (status) {
      setText(status, 'Saving your playlist order…');
      status.className = 'profile-order-message';
    }

    try {
      const body = await fetch(`${API_ROOT}/radio/me/playlists/${encodeURIComponent(context.playlistId)}/items/reorder`, {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'omit',
        headers: authHeaders(true),
        body: JSON.stringify({ ordered_item_ids: orderedItemIds })
      }).then(parseResponse);
      const saved = Array.isArray(body.ordered_item_ids) ? body.ordered_item_ids.map(String) : orderedItemIds;
      savedOrders.set(context.playlistId, saved);
      baselines.set(context.list, saved);
      button.classList.remove('is-dirty');
      setText(button, 'Saved');
      if (status) {
        setText(status, 'Playlist order saved. You can close and reopen this playlist and rearrange it again.');
        status.className = 'profile-order-message success';
      }
      window.setTimeout(() => {
        delete button.dataset.orderSaving;
        const current = playlistContext();
        if (current?.list === context.list) updateSaveState(current);
      }, 900);
    } catch (error) {
      delete button.dataset.orderSaving;
      button.disabled = false;
      setText(button, 'Save Order');
      if (status) {
        setText(status, error.message || 'The playlist order could not be saved.');
        status.className = 'profile-order-message error';
      }
    }
  }

  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-reorder-handle]');
    if (handle) beginDrag(event, handle);
  }, { passive: false });
  document.addEventListener('pointermove', moveDrag, { passive: false });
  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);
  document.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-reorder-handle]');
    if (handle) keyboardMove(event, handle);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-save-playlist-order]');
    if (button) saveOrder(button);
  });

  new MutationObserver(queueDecorate).observe(document.body, { childList: true, subtree: true });
  queueDecorate();
})();
