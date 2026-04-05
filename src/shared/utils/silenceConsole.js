// Central console silencer to reduce browser noise
// Opt back in by setting localStorage.DEBUG_CONSOLE = '1'
// or window.__DEBUG_CONSOLE__ = true at runtime

(() => {
  try {
    const shouldDebug =
      (typeof window !== 'undefined' && (window.__DEBUG_CONSOLE__ === true || localStorage.getItem('DEBUG_CONSOLE') === '1')) ||
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEBUG_CONSOLE === '1');

    if (shouldDebug) return; // Keep native console

    const noop = () => {};
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'group', 'groupCollapsed', 'groupEnd', 'table'];
    methods.forEach((m) => {
      // eslint-disable-next-line no-console
      if (console[m]) {
        // eslint-disable-next-line no-console
        console[m] = noop;
      }
    });
  } catch {
    // Ignore failures, never break the app for this
  }
})();
