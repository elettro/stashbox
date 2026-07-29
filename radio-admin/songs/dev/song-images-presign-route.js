(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;

  // Prepared Song Images intentionally use the established
  // /admin/uploads/presign route. The dedicated artwork API is responsible
  // only for reading and saving each ratio URL to the selected song.
  //
  // A previous compatibility shim redirected artwork uploads to
  // /radio/admin/songs/:songKey/artwork-images/presign. When the frontend was
  // deployed before that Lambda route, uploads failed with a generic 404
  // "Not Found" response. Leaving fetch untouched keeps ZIP and individual
  // image uploads on the proven upload route and removes that deployment-order
  // dependency.
})();
