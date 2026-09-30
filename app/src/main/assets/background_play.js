// Keep Spotify playback alive when the Android app is backgrounded.
(function () {
  'use strict';
  try {
    Object.defineProperty(document, 'hidden', {
      configurable: true, get: () => false
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'visible'
    });
    document.addEventListener(
      'visibilitychange',
      e => e.stopImmediatePropagation(), true
    );
    window.addEventListener(
      'blur', e => e.stopImmediatePropagation(), true
    );
  } catch (e) {
    console.warn('[Wrapper] visibility patch failed', e);
  }

  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'playing'; } catch (_) {}
  }
})();
