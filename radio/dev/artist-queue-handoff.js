(() => {
  const STORAGE_KEY = 'stashbox_radio_dev_artist_queue_handoff';
  const PLAY_EVENT = 'stashbox:playlist-play';
  const STARTED_EVENT = 'stashbox:playlist-player-started';
  const MAX_AGE_MS = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 18;
  let payload = null;

  try {
    payload = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
  } catch (_) {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  if (!payload || !Array.isArray(payload.items) || !payload.items.length) return;
  if (payload.createdAt && Date.now() - Number(payload.createdAt) > MAX_AGE_MS) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  let attempts = 0;
  let timer = null;
  let completed = false;

  function cleanArtistQueueUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('artist_queue')) return;
    url.searchParams.delete('artist_queue');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function finish(success) {
    if (completed) return;
    completed = true;
    if (timer) clearInterval(timer);
    window.removeEventListener(STARTED_EVENT, handleStarted);
    if (success) {
      sessionStorage.removeItem(STORAGE_KEY);
      cleanArtistQueueUrl();
    } else {
      console.error('[artist queue] DEV radio did not acknowledge the artist playback queue.');
    }
  }

  function handleStarted(event) {
    const startedId = String(event?.detail?.playlistId || '');
    const expectedId = String(payload.playlistId || '');
    if (!expectedId || startedId === expectedId) finish(true);
  }

  function dispatchQueue() {
    if (completed) return;
    attempts += 1;
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: payload }));
    if (attempts >= MAX_ATTEMPTS) finish(false);
  }

  window.addEventListener(STARTED_EVENT, handleStarted);
  setTimeout(dispatchQueue, 350);
  timer = setInterval(dispatchQueue, 800);
})();
