(function(){
  'use strict';
  if (window.__CROZZO_ADBLOCK__) return;
  window.__CROZZO_ADBLOCK__ = true;

  function isAd(u){
    if(!u) return false;
    u = String(u).toLowerCase();
    if(u.indexOf('doubleclick')>=0||u.indexOf('googlesyndication')>=0||u.indexOf('googleads')>=0||
       u.indexOf('adservice.google')>=0||u.indexOf('pagead')>=0||u.indexOf('adnxs')>=0||
       u.indexOf('outbrain')>=0||u.indexOf('taboola')>=0||u.indexOf('amazon-adsystem')>=0) return true;
    if(u.indexOf('youtube.com/api/stats/ads')>=0||u.indexOf('youtube.com/ptracking')>=0||u.indexOf('youtube.com/pagead')>=0) return true;
    return false;
  }

  try {
    const origFetch = window.fetch;
    window.fetch = function(input, init){
      try {
        const url = (typeof input === 'string') ? input : (input && input.url);
        if (isAd(url)) return Promise.resolve(new Response('', {status:204, statusText:'No Content'}));
      } catch(e){}
      return origFetch.apply(this, arguments);
    };
  } catch(e){}

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      this.__crozzoBlocked = isAd(url);
      return origOpen.apply(this, arguments);
    };
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(){
      if (this.__crozzoBlocked) { try { this.dispatchEvent(new Event('load')); } catch(e){} return; }
      return origSend.apply(this, arguments);
    };
  } catch(e){}

  function skipYouTubeAds(){
    try {
      const skipBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button');
      skipBtns.forEach(function(b){ try { b.click(); } catch(e){} });
      const player = document.querySelector('video');
      const adShowing = document.querySelector('.ad-showing, .ytp-ad-player-overlay, .video-ads');
      if (adShowing && player) {
        try { player.playbackRate = 16; } catch(e){}
        try { if (isFinite(player.duration) && player.duration > 0) player.currentTime = player.duration - 0.1; } catch(e){}
      }
      ['.ytp-ad-overlay-container','.ytp-ad-text-overlay','.ytp-ad-image-overlay','.ytp-ad-player-overlay','.video-ads'].forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){ try { el.style.display='none'; } catch(e){} });
      });
    } catch(e){}
  }

  function startObserver(){
    try {
      const obs = new MutationObserver(function(){ skipYouTubeAds(); });
      if (document.body) obs.observe(document.body, {childList:true, subtree:true});
    } catch(e){}
    setInterval(skipYouTubeAds, 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  function hideSpotifyAds(){
    try {
      ['.AdContainer','[data-testid="ad-container"]','.sponsor-container','.ad-slot'].forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(el){ try { el.style.display='none'; } catch(e){} });
      });
    } catch(e){}
  }
  setInterval(hideSpotifyAds, 1000);
})();