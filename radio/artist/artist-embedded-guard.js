(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const embedded = window.self !== window.top && params.get('embedded') === '1';
  if (!embedded) return;

  const ORIGIN = location.origin;
  document.documentElement.classList.add('is-embedded-artist-page');

  function firstSongKey() {
    return String(document.querySelector('#artistApp [data-play-song]')?.dataset.playSong || '').trim();
  }

  function sendPlay(songKey, mode = 'artist') {
    const key = String(songKey || '').trim();
    if (!key) return;
    window.top.postMessage({ type: 'stashbox:play-song', songKey: key, mode }, ORIGIN);
  }

  document.addEventListener('click', event => {
    const back = event.target.closest('#artistApp [data-back]');
    if (back) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.parent.postMessage({ type: 'stashbox:close-overlay' }, ORIGIN);
      return;
    }

    const songButton = event.target.closest('#artistApp [data-play-song]');
    if (songButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendPlay(songButton.dataset.playSong, 'artist-song');
      return;
    }

    const radioButton = event.target.closest('#artistApp [data-start-radio], #artistApp [data-artist-realm-launch]');
    if (radioButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendPlay(firstSongKey(), 'artist-radio');
      return;
    }

    const playlistButton = event.target.closest('#artistApp [data-play-playlist]');
    if (playlistButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendPlay(firstSongKey(), 'artist-playlist');
    }
  }, true);
})();
