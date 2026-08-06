(() => {
  'use strict';

  const desktop = window.matchMedia('(min-width: 700px)');
  const DESKTOP_MAX_SIZE = 78;
  const DESKTOP_MIN_SIZE = 24;
  const MOBILE_MAX_SIZE = 36;
  const MOBILE_MIN_SIZE = 19;
  const MOBILE_SINGLE_LINE_SIZE = 32;
  const MOBILE_TARGET_FIRST_LINE_RATIO = 0.66;
  const MOBILE_LINE_HEIGHT = 1.02;
  let frame = 0;
  let resizeObserver = null;
  let rendering = false;

  const FIT_PROPERTIES = [
    'display',
    'width',
    'max-width',
    'font-size',
    'line-height',
    'max-height',
    'overflow',
    'overflow-wrap',
    'text-overflow',
    'text-wrap',
    'white-space',
    'word-break',
    'hyphens',
    '-webkit-box-orient',
    '-webkit-line-clamp'
  ];

  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');

  function important(title, property, value) {
    title.style.setProperty(property, value, 'important');
  }

  function clearFitStyles(title) {
    FIT_PROPERTIES.forEach(property => title.style.removeProperty(property));
    title.removeAttribute('data-v2-title-fit');
    title.removeAttribute('data-v2-title-lines');
  }

  function sourceTitle(title) {
    const current = normalize(title.textContent);
    const previouslyRendered = normalize(title.dataset.v2TitleRendered);
    const storedSource = normalize(title.dataset.v2TitleSource);

    if (!storedSource || (current && current !== previouslyRendered)) {
      title.dataset.v2TitleSource = current;
      title.dataset.v2TitleRendered = current;
      return current;
    }
    return storedSource;
  }

  function renderPlain(title, text) {
    if (normalize(title.textContent) !== text || title.children.length) {
      title.textContent = text;
    }
    title.dataset.v2TitleRendered = text;
    title.setAttribute('aria-label', text);
  }

  function renderTwoLines(title, firstLine, secondLine, size) {
    const first = document.createElement('span');
    const second = document.createElement('span');
    first.textContent = firstLine;
    second.textContent = secondLine;
    first.style.cssText = 'display:block;white-space:nowrap;overflow:visible;text-overflow:clip;';
    second.style.cssText = 'display:block;white-space:nowrap;overflow:visible;text-overflow:clip;';

    title.replaceChildren(first, document.createTextNode('\n'), second);
    title.dataset.v2TitleRendered = `${firstLine} ${secondLine}`;
    title.dataset.v2TitleFit = `two-lines-${size}`;
    title.dataset.v2TitleLines = '2';
    title.setAttribute('aria-label', `${firstLine} ${secondLine}`);
  }

  function canvasContext(title, size) {
    const canvas = canvasContext.canvas || (canvasContext.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    const style = getComputedStyle(title);
    context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    return context;
  }

  function measuredWidth(title, text, size) {
    const context = canvasContext(title, size);
    const style = getComputedStyle(title);
    const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
    return context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
  }

  function chooseTwoLineBreak(title, text, available, size) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;

    let best = null;
    for (let split = 1; split < words.length; split += 1) {
      const firstLine = words.slice(0, split).join(' ');
      const secondLine = words.slice(split).join(' ');
      const firstWidth = measuredWidth(title, firstLine, size);
      const secondWidth = measuredWidth(title, secondLine, size);
      if (firstWidth > available + 1 || secondWidth > available + 1) continue;

      const total = firstWidth + secondWidth;
      const ratio = total > 0 ? firstWidth / total : 0.5;
      const firstLinePenalty = firstWidth < secondWidth ? 0.18 : 0;
      const veryShortSecondPenalty = secondLine.length < 5 ? 0.08 : 0;
      const score = Math.abs(ratio - MOBILE_TARGET_FIRST_LINE_RATIO) + firstLinePenalty + veryShortSecondPenalty;

      if (!best || score < best.score) {
        best = { firstLine, secondLine, score, firstWidth, secondWidth };
      }
    }
    return best;
  }

  function fitSingleLine(title, text, maxSize, minSize) {
    const available = title.clientWidth;
    if (!text || available < 40) return false;

    renderPlain(title, text);
    important(title, 'display', 'block');
    important(title, 'white-space', 'nowrap');
    important(title, 'overflow', 'visible');
    important(title, 'text-overflow', 'clip');
    important(title, 'max-height', 'none');
    important(title, 'font-size', `${maxSize}px`);

    if (title.scrollWidth <= available + 1) {
      title.dataset.v2TitleFit = String(maxSize);
      title.dataset.v2TitleLines = '1';
      return true;
    }

    let low = minSize;
    let high = maxSize;
    let best = minSize;
    for (let step = 0; step < 10; step += 1) {
      const size = (low + high) / 2;
      important(title, 'font-size', `${size}px`);
      if (title.scrollWidth <= available + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }

    const finalSize = Math.max(minSize, Math.floor(best * 2) / 2);
    important(title, 'font-size', `${finalSize}px`);
    const fits = title.scrollWidth <= available + 1;
    if (fits) {
      title.dataset.v2TitleFit = String(finalSize);
      title.dataset.v2TitleLines = '1';
    }
    return fits;
  }

  function fitMobileTitle(title) {
    const text = sourceTitle(title);
    if (!text) return;

    clearFitStyles(title);
    renderPlain(title, text);
    important(title, 'display', 'block');
    important(title, 'width', '100%');
    important(title, 'max-width', '100%');
    important(title, 'overflow', 'visible');
    important(title, 'text-overflow', 'clip');
    important(title, 'max-height', 'none');
    important(title, 'line-height', String(MOBILE_LINE_HEIGHT));
    important(title, 'text-transform', 'none');

    const available = title.clientWidth;
    if (available < 80) return;

    // Short titles remain on one line at a readable, consistent mobile size.
    important(title, 'white-space', 'nowrap');
    important(title, 'font-size', `${MOBILE_SINGLE_LINE_SIZE}px`);
    if (title.scrollWidth <= available + 1) {
      title.dataset.v2TitleFit = String(MOBILE_SINGLE_LINE_SIZE);
      title.dataset.v2TitleLines = '1';
      return;
    }

    // Long titles are always formatted into exactly two complete lines. The
    // preferred break gives the first line roughly two-thirds of the title,
    // matching: "I Should Be Back In a" / "Week Or So".
    important(title, 'white-space', 'normal');
    important(title, 'overflow-wrap', 'normal');
    important(title, 'word-break', 'normal');
    important(title, 'hyphens', 'none');
    important(title, 'text-wrap', 'nowrap');

    let chosen = null;
    let chosenSize = MOBILE_MIN_SIZE;
    for (let size = MOBILE_MAX_SIZE; size >= MOBILE_MIN_SIZE; size -= 0.5) {
      const candidate = chooseTwoLineBreak(title, text, available, size);
      if (candidate) {
        chosen = candidate;
        chosenSize = size;
        break;
      }
    }

    if (!chosen) {
      const words = text.split(/\s+/).filter(Boolean);
      const split = Math.max(1, Math.min(words.length - 1, Math.ceil(words.length * 0.66)));
      chosen = {
        firstLine: words.slice(0, split).join(' '),
        secondLine: words.slice(split).join(' ')
      };
    }

    important(title, 'font-size', `${chosenSize}px`);
    renderTwoLines(title, chosen.firstLine, chosen.secondLine, chosenSize);
  }

  function fitDesktopTitle(title) {
    const text = sourceTitle(title);
    if (!text) return;
    clearFitStyles(title);
    renderPlain(title, text);
    fitSingleLine(title, text, DESKTOP_MAX_SIZE, DESKTOP_MIN_SIZE);
  }

  function fitTitle(title) {
    if (!(title instanceof HTMLElement)) return;
    if (desktop.matches) fitDesktopTitle(title);
    else fitMobileTitle(title);
  }

  function getTitles() {
    return [...document.querySelectorAll('#v2App .v2-player [data-ptitle]')];
  }

  function schedule() {
    if (rendering) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      rendering = true;
      const current = getTitles();
      current.forEach(fitTitle);

      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(entries => {
        entries.forEach(entry => fitTitle(entry.target));
      });
      current.forEach(title => resizeObserver.observe(title));
      rendering = false;
    });
  }

  const root = document.getElementById('v2App') || document.documentElement;
  new MutationObserver(mutations => {
    if (rendering) return;
    const meaningful = mutations.some(mutation => {
      if (mutation.type === 'characterData') return true;
      return [...mutation.addedNodes].some(node => {
        if (!(node instanceof Element)) return false;
        return node.matches?.('[data-ptitle]') || node.querySelector?.('[data-ptitle]');
      });
    });
    if (meaningful) schedule();
  }).observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });

  desktop.addEventListener?.('change', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  document.fonts?.ready?.then(schedule).catch(() => {});
  schedule();
})();