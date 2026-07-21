(() => {
  const mobileQuery = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 900px)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const STORAGE_KEY = 'stashbox_mobile_notification_tab_peek_v1';
  const STYLE_ID = 'stashbox-mobile-notification-peek-style';
  const HORIZONTAL_TRIGGER = 32;
  const AXIS_LOCK = 9;
  let scanQueued = false;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        html.sbr-mobile-ux .sbr-notification-bell {
          will-change: right, width, min-width, border-radius;
          transition: right 220ms ease, width 190ms ease, min-width 190ms ease, border-radius 190ms ease, background 160ms ease, border-color 160ms ease !important;
        }

        html.sbr-mobile-ux .sbr-notification-bell.is-edge-peek {
          right: 0 !important;
          grid-template-rows: 1fr !important;
          width: 16px !important;
          min-width: 16px !important;
          height: 64px !important;
          min-height: 64px !important;
          padding: 0 !important;
          overflow: hidden !important;
          border-right: 0 !important;
          border-radius: 10px 0 0 10px !important;
          background: rgba(12, 20, 16, 0.9) !important;
          box-shadow: -5px 0 18px rgba(0, 0, 0, 0.28) !important;
          cursor: ns-resize !important;
        }

        html.sbr-mobile-ux .sbr-notification-bell.is-edge-peek::before {
          content: "" !important;
          display: block !important;
          width: 3px !important;
          height: 30px !important;
          border-radius: 999px !important;
          background: rgba(255, 217, 120, 0.9) !important;
          box-shadow: 0 0 10px rgba(242, 189, 85, 0.32) !important;
        }

        html.sbr-mobile-ux .sbr-notification-bell.is-edge-peek .sbr-notification-count,
        html.sbr-mobile-ux .sbr-notification-bell.is-edge-peek svg,
        html.sbr-mobile-ux .sbr-notification-bell.is-edge-peek .sbr-notification-bell-label {
          display: none !important;
        }

        html.sbr-mobile-ux .sbr-notification-bell.is-edge-peek.is-dragging {
          width: 18px !important;
          min-width: 18px !important;
          background: rgba(16, 26, 21, 0.98) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function readPeekState() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch (_) { return false; }
  }

  function savePeekState(hidden) {
    try { localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0'); } catch (_) {}
  }

  function setPeekState(bell, hidden, { save = true } = {}) {
    if (!bell) return;
    bell.classList.toggle('is-edge-peek', Boolean(hidden));
    bell.dataset.notificationEdgePeek = hidden ? 'true' : 'false';
    bell.setAttribute('title', hidden
      ? 'Swipe left or tap to restore notifications. Drag up or down to reposition.'
      : 'Swipe right to hide this tab further. Drag up or down to reposition.');
    if (save) savePeekState(Boolean(hidden));
  }

  function closeDrawerIfOpen(bell) {
    if (bell.getAttribute('aria-expanded') !== 'true') return;
    bell.click();
  }

  function attachGestures(bell) {
    if (!bell || bell.dataset.notificationEdgeGesture === 'true') return;
    bell.dataset.notificationEdgeGesture = 'true';
    setPeekState(bell, readPeekState(), { save: false });

    let gesture = null;
    let suppressClickUntil = 0;

    bell.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: '',
        handled: false
      };
    }, true);

    bell.addEventListener('pointermove', (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_LOCK) {
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'horizontal' : 'vertical';
      }

      if (gesture.axis === 'horizontal') event.preventDefault();
    }, true);

    bell.addEventListener('pointerup', (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const horizontal = gesture.axis === 'horizontal' || Math.abs(dx) > Math.abs(dy) * 1.15;

      if (horizontal && Math.abs(dx) >= HORIZONTAL_TRIGGER) {
        const currentlyHidden = bell.classList.contains('is-edge-peek');
        if (dx > 0 && !currentlyHidden) {
          closeDrawerIfOpen(bell);
          window.setTimeout(() => setPeekState(bell, true), bell.getAttribute('aria-expanded') === 'true' ? 230 : 0);
          gesture.handled = true;
        } else if (dx < 0 && currentlyHidden) {
          setPeekState(bell, false);
          gesture.handled = true;
        }
      }

      if (gesture.handled) suppressClickUntil = Date.now() + 500;
      gesture = null;
    }, true);

    bell.addEventListener('pointercancel', () => {
      gesture = null;
    }, true);

    bell.addEventListener('click', (event) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (!bell.classList.contains('is-edge-peek')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPeekState(bell, false);
    }, true);
  }

  function scan() {
    scanQueued = false;
    injectStyle();
    attachGestures(document.querySelector('.sbr-notification-bell'));
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  injectStyle();
  queueScan();
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
})();
