(() => {
  'use strict';

  const aspectRatio = document.getElementById('aspectRatio');
  const filenamePreview = document.getElementById('filenamePreview');
  if (!aspectRatio || !filenamePreview) return;

  function correctFourByFiveResolution() {
    if (aspectRatio.value !== '4:5') return;
    const current = String(filenamePreview.textContent || '');
    if (!current.includes('1920x1080')) return;
    filenamePreview.textContent = current.replace(/1920x1080/g, '1080x1350');
  }

  const observer = new MutationObserver(correctFourByFiveResolution);
  observer.observe(filenamePreview, { childList: true, characterData: true, subtree: true });
  aspectRatio.addEventListener('change', correctFourByFiveResolution);
  correctFourByFiveResolution();
})();
