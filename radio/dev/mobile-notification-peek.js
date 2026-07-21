(() => {
  const mobileQuery = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 900px)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const PEEK_STORAGE_KEY = 'stashbox_mobile_notification_tab_peek_v1';
  const POSITION_STORAGE_KEY = 'stashbox_mobile_notification_tab_position_v1';
  const STYLE_ID = 'stashbox-mobile-notification-peek-style';
  const ZONE_CLASS = 'sbr-notification-gesture-zone';
  const HORIZONTAL_TRIGGER = 30;
  const AXIS_LOCK = 7;
  let scanQueued = false;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function injectStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        html.sbr-mobile-ux .sbr-notification-bell {
          will-change: right, width, min-width, border-radius;
          transition: right 220ms ease, width 190ms ease, min-width 190ms ease, border-radius 190ms ease, background 160ms ease, border-color 160ms ease !important;
          pointer-events: none !important;
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

        html.sbr-mobile-ux .${ZONE_CLASS} {
          position: fixed;
          top: var(--sbr-notification-tab-top, 44%);
          right: 0;
          z-index: 10004;
          width: 52px;
          height: 92px;
          border: 0;
          padding: 0;
          background: transparent;
          transform: translateY(-50%);
          touch-action: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          cursor: grab;
        }

        html.sbr-mobile-ux:has(.sbr-notification-bell[aria-expanded="true"]) .${ZONE_CLASS} {
          right: var(--sbr-mobile-drawer-width, min(88vw, 390px));
        }

        html.sbr-mobile-ux .${ZONE_CLASS}.is-dragging {
          cursor: grabbing;
        }
      }
    `;
  }

  function readPeekState() {
    try { return localStorage.getItem(PEEK_STORAGE_KEY) === '1'; }
    catch (_) { return false; }
  }

  function savePeekState(hidden) {
    try { localStorage.setItem(PEEK_STORAGE_KEY, hidden ? '1' : '0'); } catch (_) {}
  }

  function setPeekState(bell, hidden, { save = true } = {}) {
    if (!bell) return;
    bell.classList.toggle('is-edge-peek', Boolean(hidden));
    bell.dataset.notificationEdgePeek = hidden ? 'true' : 'false';
    bell.setAttribute('title', hidden
      ? 'Tap or swipe left to open notifications. Drag up or down to reposition.'
      : 'Tap or swipe left to open notifications. Swipe right to hide this tab further.');
    if (save) savePeekState(Boolean(hidden));
  }

  function drawerIsOpen(bell) {
    return bell?.getAttribute('aria-expanded') === 'true';
  }

  function clickBellUntilState(bell, shouldOpen, attempts = 0) {
    if (!bell || drawerIsOpen(bell) === shouldOpen || attempts > 1) return;
    bell.click();
    window.setTimeout(() => clickBellUntilState(bell, shouldOpen, attempts + 1), 30);
  }

  function setDrawerOpen(bell, shouldOpen) {
    if (!bell) return;
    if (shouldOpen) setPeekState(bell, false);
    clickBellUntilState(bell, Boolean(shouldOpen));
  }

  function positionBounds(bell) {
    const height = Math.max(64, Number(bell?.offsetHeight) || 72);
    const gap = 10;
    const minimum = gap + (height / 2);
    const maximum = Math.max(minimum, window.innerHeight - gap - (height / 2));
    return { minimum, maximum };
  }

  function applyVerticalPosition(bell, clientY, save = false) {
    const { minimum, maximum } = positionBounds(bell);
    const y = clamp(clientY, minimum, maximum);
    document.documentElement.style.setProperty('--sbr-notification-tab-top', `${Math.round(y)}px`);
    if (save && maximum > minimum) {
      const ratio = (y - minimum) / (maximum - minimum);
      try { localStorage.setItem(POSITION_STORAGE_KEY, String(clamp(ratio, 0, 1))); } catch (_) {}
    }
  }

  function createGestureZone(bell) {
    let zone = document.querySelector(`.${ZONE_CLASS}`);
    if (zone) return zone;

    zone = document.createElement('button');
    zone.type = 'button';
    zone.className = ZONE_CLASS;
    zone.setAttribute('aria-label', 'Open or move notifications');
    document.body.appendChild(zone);

    let gesture = null;

    zone.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        axis: '',
        moved: false
      };
      zone.classList.add('is-dragging');
      try { zone.setPointerCapture(event.pointerId); } catch (_) {}
    });

    zone.addEventListener('pointermove', (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;

      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_LOCK) {
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'horizontal' : 'vertical';
      }

      if (gesture.axis === 'vertical') {
        gesture.moved = true;
        event.preventDefault();
        applyVerticalPosition(bell, event.clientY, false);
      } else if (gesture.axis === 'horizontal') {
        gesture.moved = true;
        event.preventDefault();
      }
    });

    const finish = (event, cancelled = false) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const current = gesture;
      gesture = null;
      zone.classList.remove('is-dragging');
      try { zone.releasePointerCapture(event.pointerId); } catch (_) {}
      if (cancelled) return;

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const horizontal = current.axis === 'horizontal' || Math.abs(dx) > Math.abs(dy) * 1.1;
      const vertical = current.axis === 'vertical';

      if (vertical) {
        applyVerticalPosition(bell, event.clientY, true);
        return;
      }

      if (horizontal && Math.abs(dx) >= HORIZONTAL_TRIGGER) {
        const isPeek = bell.classList.contains('is-edge-peek');
        const isOpen = drawerIsOpen(bell);

        if (dx < 0) {
          if (isPeek) {
            setPeekState(bell, false);
          } else if (!isOpen) {
            setDrawerOpen(bell, true);
          }
        } else if (dx > 0) {
          if (isOpen) {
            setDrawerOpen(bell, false);
          } else if (!isPeek) {
            setPeekState(bell, true);
          }
        }
        return;
      }

      if (!current.moved || Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) {
        setDrawerOpen(bell, !drawerIsOpen(bell));
      }
    };

    zone.addEventListener('pointerup', event => finish(event, false));
    zone.addEventListener('pointercancel', event => finish(event, true));

    return zone;
  }

  function scan() {
    scanQueued = false;
    injectStyle();
    const bell = document.querySelector('.sbr-notification-bell');
    if (!bell) return;
    if (bell.dataset.notificationGestureV2 !== 'true') {
      bell.dataset.notificationGestureV2 = 'true';
      setPeekState(bell, readPeekState(), { save: false });
    }
    createGestureZone(bell);
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  injectStyle();
  queueScan();
  new MutationObserver(queueScan).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'class']
  });
})();
