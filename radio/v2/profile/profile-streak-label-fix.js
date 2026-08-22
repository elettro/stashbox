(() => {
  'use strict';
  const app = document.getElementById('profileApp');
  if (!app) return;
  let queued = false;

  function repair() {
    queued = false;
    const card = app.querySelector('.streak-card');
    if (!card) return;
    const marked = [...card.querySelectorAll('.streak-days span')].filter(day => day.classList.contains('on') || day.classList.contains('listened')).length;
    const current = Math.max(0, Number(card.querySelector('.streak-number strong')?.textContent || 0));
    if (!marked || marked === current) return;
    const numberNode = card.querySelector('.streak-number strong');
    const label = card.querySelector('.streak-number + b');
    const message = card.querySelector('.streak-days + p');
    if (numberNode) numberNode.textContent = String(marked);
    if (label) label.textContent = `active day${marked === 1 ? '' : 's'} this week`;
    if (message) message.textContent = `${current}-day current streak · ${marked} listening days this week.`;
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(repair);
  }

  new MutationObserver(queue).observe(app, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  queue();
})();
