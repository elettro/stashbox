(() => {
  'use strict';
  // Emergency rollback: this extension is intentionally disabled while the
  // Safari/player event recursion is rebuilt in isolation. Keeping this file
  // as a harmless no-op also protects browsers that cached an older index.html
  // which still references the script URL.
  console.info('[Stashbox V2] Guest player extension temporarily disabled.');
})();
