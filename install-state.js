/* NibbleSpot installation awareness — browser PWA, iOS, Android WebView and desktop app. */
(function(){
  'use strict';
  let justInstalled=false;
  const standaloneQuery=window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  const fullscreenQuery=window.matchMedia ? window.matchMedia('(display-mode: fullscreen)') : null;
  const minimalQuery=window.matchMedia ? window.matchMedia('(display-mode: minimal-ui)') : null;

  function isInstalled(){
    const ua=navigator.userAgent||'';
    // Markers from our packaged apps. Older installers are recognized below.
    const brandedApp=/\bNibbleSpot(?:Android|Desktop)App\/\d/i.test(ua);
    const desktopApp=typeof window.nibbleIntro?.finish==='function';
    const androidWebView=/Android/i.test(ua)&&/(?:;\s*wv[);]|\bVersion\/4\.0\b.*\bChrome\/)/i.test(ua);
    const pwa=Boolean(standaloneQuery?.matches||fullscreenQuery?.matches||
      minimalQuery?.matches||navigator.standalone===true);
    return justInstalled||brandedApp||desktopApp||androidWebView||pwa;
  }

  function refresh(){
    const installed=isInstalled();
    document.documentElement.dataset.nibbleInstalled=installed?'true':'false';
    return installed;
  }

  function markInstalled(){
    justInstalled=true;
    refresh();
  }

  window.NibbleSpotInstallState=Object.freeze({
    isInstalled,
    refresh,
    markInstalled
  });

  refresh();
  window.addEventListener('appinstalled',markInstalled);
  window.addEventListener('pageshow',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  for(const query of [standaloneQuery,fullscreenQuery,minimalQuery]){
    if(query&&typeof query.addEventListener==='function')query.addEventListener('change',refresh);
  }
})();
