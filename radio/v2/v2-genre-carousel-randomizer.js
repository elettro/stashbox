(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  let randomized = false;

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomValue = globalThis.crypto?.getRandomValues
        ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
        : Math.random();
      const swapIndex = Math.floor(randomValue * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function randomizeGenreCarousel() {
    if (randomized) return true;
    const row = app.querySelector('.v2-category-row[data-carousel-row]');
    if (!row) return false;

    const cards = [...row.querySelectorAll(':scope > [data-genre]')];
    if (cards.length < 2) {
      randomized = true;
      return true;
    }

    shuffle(cards).forEach(card => row.appendChild(card));
    row.scrollLeft = 0;
    randomized = true;
    window.dispatchEvent(new CustomEvent('stashbox:genre-carousel-randomized', {
      detail: { count: cards.length }
    }));
    return true;
  }

  if (randomizeGenreCarousel()) return;

  const observer = new MutationObserver(() => {
    if (!randomizeGenreCarousel()) return;
    observer.disconnect();
  });

  observer.observe(app, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15000);
})();