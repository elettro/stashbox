(() => {
  'use strict';

  // TEMPORARILY DISABLED: Song-level VEC controls now live outside the Songs CMS.
  // Keep the shared VEC implementation and stored song data intact for future reuse.
  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;

  if (
    typeof createFormDivider !== 'function'
    || typeof createVecPlaceholder !== 'function'
    || typeof loadVisualExperienceSettings !== 'function'
  ) {
    return;
  }

  const createActiveFormDivider = createFormDivider;

  createFormDivider = function createSongsCmsDivider(label, className = '') {
    if (label === 'Visual Experience') {
      return document.createDocumentFragment();
    }

    return createActiveFormDivider(label, className);
  };

  createVecPlaceholder = function createDisabledVecPlaceholder() {
    return document.createDocumentFragment();
  };

  loadVisualExperienceSettings = async function skipSongsCmsVisualExperienceLoad() {};
})();
