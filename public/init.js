// Mobile-only: prevent pinch/double-tap zoom; keep desktop behavior unchanged
(function() {
  try {
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
      var base = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
      if (isMobile) {
        // Disable pinch-zoom and double-tap zoom on mobile
        vp.setAttribute('content', base + ', maximum-scale=1, user-scalable=no');
      } else {
        // Leave desktop zoom behavior intact
        vp.setAttribute('content', base);
      }
    }
  } catch (e) { /* noop */ }
})();

// Optional: detect on-screen keyboard to help browsers that don't support interactive-widget
(function() {
  try {
    if ('virtualKeyboard' in navigator) {
      // Enable virtual keyboard overlays on supported browsers
      navigator.virtualKeyboard.overlaysContent = true;
    }
    const onResize = () => {
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      document.documentElement.style.setProperty('--app-vh', vh + 'px');
    };
    window.addEventListener('resize', onResize);
    onResize();
  } catch (e) {
    // no-op
  }
})();
