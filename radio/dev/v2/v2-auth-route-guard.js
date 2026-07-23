(() => {
  'use strict';

  document.addEventListener('click', event => {
    const trigger = event.target.closest('.v2-header-login, [data-v2-auth-open]');
    if (!trigger) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const target = new URL('/radio/dev/v2/', window.location.origin);
    target.searchParams.set('auth', trigger.dataset.v2AuthOpen || 'login');
    window.location.assign(target.toString());
  }, true);
})();
