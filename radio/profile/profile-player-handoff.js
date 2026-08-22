(() => {
  'use strict';

  if (window.StashboxProfilePlayerHandoff) return;

  const QUEUE_KEY = 'stashbox_v2_profile_queue_handoff';
  const HANDOFF_KEY = 'stashbox_v2_artist_song_handoff';
  const MAX_AGE_MS = 10 * 60 * 1000;

  const clean = value => String(value ?? '').trim();

  function songKeyFromTarget(target) {
    const direct = target.closest?.('[data-play-song]');
    if (direct?.dataset?.playSong) return clean(direct.dataset.playSong);

    const row = target.closest?.('.profile-list-row');
    if (!row) return '';
    const play = row.querySelector('[data-play-song]');
    return clean(play?.dataset?.playSong);
  }

  function isDestructiveOrEditingAction(target) {
    return Boolean(target.closest?.(
      '[data-remove-favorite], [data-remove-playlist-item], [data-delete-playlist], [data-rename-playlist], [data-close-overlay], input, textarea, select, form'
    ));
  }

  function orderedKeysFor(target, selectedKey) {
    const overlay = target.closest?.('.profile-overlay');
    if (!overlay) return [selectedKey];

    const playlistId = clean(
      overlay.querySelector('[data-rename-playlist]')?.dataset?.renamePlaylist ||
      overlay.querySelector('[data-delete-playlist]')?.dataset?.deletePlaylist
    );

    const keys = [];
    overlay.querySelectorAll('[data-play-song]').forEach(node => {
      const key = clean(node.dataset.playSong);
      if (key && !keys.includes(key)) keys.push(key);
    });

    if (!keys.includes(selectedKey)) keys.unshift(selectedKey);
    return { keys, playlistId };
  }

  function publish(payload) {
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch (_) {}

    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'stashbox:profile-play', payload }, location.origin); } catch (_) {}
      return;
    }
    location.href = '/radio/?profile_play=1';
  }

  function handoff(target, selectedKey) {
    const ordered = orderedKeysFor(target, selectedKey);
    const songKeys = Array.isArray(ordered) ? ordered : ordered.keys;
    const playlistId = Array.isArray(ordered) ? '' : ordered.playlistId;
    const index = Math.max(0, songKeys.indexOf(selectedKey));
    publish({
      songKeys,
      index,
      selectedSongKey: selectedKey,
      playlistId: playlistId || null,
      mode: playlistId ? 'profile-playlist' : 'profile-library',
      autoplay: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + MAX_AGE_MS
    });
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('#profileApp, .profile-overlay')) return;
    if (isDestructiveOrEditingAction(target)) return;

    const selectedKey = songKeyFromTarget(target);
    if (!selectedKey) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    handoff(target, selectedKey);
  }, true);

  window.StashboxProfilePlayerHandoff = Object.freeze({
    queueKey: QUEUE_KEY,
    playSong(songKey, songKeys = [songKey]) {
      const key = clean(songKey);
      const keys = Array.isArray(songKeys) ? songKeys.map(clean).filter(Boolean) : [key];
      if (!key) return;
      publish({
        songKeys: keys.includes(key) ? keys : [key, ...keys],
        index: Math.max(0, keys.indexOf(key)),
        selectedSongKey: key,
        mode: 'profile-programmatic',
        autoplay: true,
        createdAt: Date.now(),
        expiresAt: Date.now() + MAX_AGE_MS
      });
    }
  });
})();