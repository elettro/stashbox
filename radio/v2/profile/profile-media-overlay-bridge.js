(() => {
  'use strict';

  const app = document.getElementById('profileApp');
  if (!app) return;

  let queued = false;

  function wakeMediaEnhancer() {
    queued = false;
    const form = document.querySelector('form[data-form="account"]');
    if (!form || form.dataset.mediaUploadsReady === 'true') return;

    // profile-media-upload.js owns the actual authenticated Lambda → S3 upload
    // workflow. Its original observer watches #profileApp, while profile sheets
    // are mounted under body. A brief child mutation wakes that existing
    // enhancer whenever Account Information opens.
    const marker = document.createElement('span');
    marker.hidden = true;
    marker.dataset.profileMediaWake = 'true';
    app.appendChild(marker);
    requestAnimationFrame(() => marker.remove());
  }

  function queueWake() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(wakeMediaEnhancer);
  }

  new MutationObserver(queueWake).observe(document.body, {
    childList: true,
    subtree: true
  });

  queueWake();
})();
