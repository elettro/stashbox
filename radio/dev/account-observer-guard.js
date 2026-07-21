(() => {
  if (window.__stashboxAccountObserverGuardInstalled || typeof window.MutationObserver !== 'function') return;

  const NativeMutationObserver = window.MutationObserver;

  class GuardedMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.options = null;
      this.running = false;
      const source = Function.prototype.toString.call(callback);
      this.isAccountScanner = source.includes('injectHeader') && source.includes('injectPlaylistButton');
      this.nativeObserver = new NativeMutationObserver((mutations) => {
        if (!this.isAccountScanner) {
          callback(mutations, this);
          return;
        }
        if (this.running) return;
        this.running = true;
        this.nativeObserver.disconnect();
        try {
          callback(mutations, this);
        } finally {
          this.running = false;
          if (this.target && this.options) this.nativeObserver.observe(this.target, this.options);
        }
      });
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
      this.nativeObserver.observe(target, options);
    }

    disconnect() {
      this.target = null;
      this.options = null;
      this.nativeObserver.disconnect();
    }

    takeRecords() {
      return this.nativeObserver.takeRecords();
    }
  }

  window.__stashboxAccountObserverGuardInstalled = true;
  window.MutationObserver = GuardedMutationObserver;
  window.__restoreStashboxMutationObserver = () => {
    if (window.MutationObserver === GuardedMutationObserver) window.MutationObserver = NativeMutationObserver;
    delete window.__restoreStashboxMutationObserver;
  };
})();
