(() => {
  'use strict';

  const app = document.getElementById('profileApp');
  if (!app) return;

  let queued = false;

  function repair() {
    queued = false;
    const card = app.querySelector('.streak-card');
    if (!card) return;

    const days = [...card.querySelectorAll('.streak-days span')];
    const numberNode = card.querySelector('.streak-number strong');
    if (!days.length || !numberNode) return;

    // Once profile-real-stats.js has attached date titles, those database-backed
    // dates are authoritative and this placeholder repair must stay out of the way.
    if (days.some(day => day.hasAttribute('title'))) return;

    const streak = Math.max(0, Number(numberNode.textContent || 0));
    const todayIndex = new Date().getDay();
    days.forEach((day, index) => {
      const distanceFromToday = todayIndex - index;
      const isVisiblePartOfCurrentStreak = streak > 0 && distanceFromToday >= 0 && distanceFromToday < streak;
      day.classList.toggle('on', isVisiblePartOfCurrentStreak);
      day.setAttribute('aria-label', isVisiblePartOfCurrentStreak ? `${day.textContent}: active streak day` : `${day.textContent}: not in current streak`);
    });

    const message = card.querySelector('.streak-days + p');
    if (message && streak > 0) message.textContent = `${streak}-day current streak · keep it going!`;
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(repair);
  }

  new MutationObserver(queue).observe(app, { childList: true, subtree: true, characterData: true });
  queue();
})();
