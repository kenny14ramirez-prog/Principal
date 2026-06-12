/**
 * Experiencia premium de instalación y emparejamiento BONA origen.
 * — Nombre del negocio en landings y modales
 * — Video corto (15 s) o guía animada en paso 1
 * — Sonido sutil al completar emparejamiento
 */
(function (global) {
  'use strict';

  var LS_BRAND = 'crozzo_install_brand_v1';
  var LS_VIDEO = 'crozzo_install_video_url_v1';
  var LS_SOUND = 'crozzo_install_sound_v1';
  var SS_BRAND = 'crozzo_install_brand_v1';
  var DEFAULT_VIDEO = 'assets/install-welcome.mp4';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lsGet(key) {
    try {
      return global.localStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function lsSet(key, val) {
    try {
      global.localStorage.setItem(key, String(val || ''));
      return true;
    } catch (_) {
      return false;
    }
  }

  function brandFromUrl() {
    try {
      var u = new URL(global.location.href);
      var b = u.searchParams.get('biz') || u.searchParams.get('nombre') || u.searchParams.get('negocio');
      if (b) return decodeURIComponent(b).replace(/\+/g, ' ').trim();
    } catch (_) {}
    return '';
  }

  function brandFromApp() {
    try {
      if (typeof global.config !== 'undefined' && global.config.getEmpresa) {
        var e = global.config.getEmpresa() || {};
        var n = String(e.nombreComercial || e.razonSocial || '').trim();
        if (n) return n;
      }
    } catch (_) {}
    try {
      if (typeof global.getMultiDeviceConfig === 'function') {
        var c = global.getMultiDeviceConfig() || {};
        var bn = String(c.businessName || '').trim();
        if (bn && bn !== 'Mi negocio') return bn;
      }
    } catch (_) {}
    return '';
  }

  function resolveBusinessName() {
    var url = brandFromUrl();
    if (url) {
      persistBusinessName(url);
      return url;
    }
    try {
      var ss = global.sessionStorage.getItem(SS_BRAND);
      if (ss) return String(ss).trim();
    } catch (_) {}
    var ls = String(lsGet(LS_BRAND) || '').trim();
    if (ls) return ls;
    return brandFromApp();
  }

  function persistBusinessName(name) {
    name = String(name || '').trim();
    if (!name) return;
    lsSet(LS_BRAND, name);
    try {
      global.sessionStorage.setItem(SS_BRAND, name);
    } catch (_) {}
  }

  function syncBrandFromApp() {
    var n = brandFromApp();
    if (n) persistBusinessName(n);
    return n || resolveBusinessName();
  }

  function withBrandUrl(base) {
    base = String(base || '').trim();
    if (!base) return base;
    var name = resolveBusinessName();
    if (!name) return base;
    try {
      var u = new URL(base, global.location.href);
      u.searchParams.set('biz', name);
      return u.pathname + u.search + (u.hash || '');
    } catch (_) {
      var sep = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + 'biz=' + encodeURIComponent(name);
    }
  }

  function getVideoUrl() {
    return String(lsGet(LS_VIDEO) || '').trim();
  }

  function probeBundledVideo(cb) {
    if (getVideoUrl()) {
      if (typeof cb === 'function') cb(getVideoUrl());
      return;
    }
    fetch(DEFAULT_VIDEO, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) {
        if (r.ok) lsSet(LS_VIDEO, DEFAULT_VIDEO);
        if (typeof cb === 'function') cb(r.ok ? DEFAULT_VIDEO : '');
      })
      .catch(function () {
        if (typeof cb === 'function') cb('');
      });
  }

  function setVideoUrl(url) {
    lsSet(LS_VIDEO, String(url || '').trim());
  }

  function toEmbedUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i);
    if (m) {
      return (
        'https://www.youtube.com/embed/' +
        m[1] +
        '?rel=0&modestbranding=1&playsinline=1&enablejsapi=0'
      );
    }
    return url;
  }

  function isYoutube(url) {
    return /youtube\.com|youtu\.be/i.test(String(url || ''));
  }

  function shouldPlaySound() {
    if (lsGet(LS_SOUND) === '0') return false;
    try {
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch (_) {}
    return true;
  }

  function setSoundEnabled(on) {
    lsSet(LS_SOUND, on ? '1' : '0');
  }

  function playPairingSuccessChime() {
    if (!shouldPlaySound()) return;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      function tone(freq, t0, dur, vol) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol || 0.07, t0 + 0.018);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      }
      var t = ctx.currentTime;
      tone(523.25, t, 0.32, 0.06);
      tone(659.25, t + 0.11, 0.38, 0.055);
      tone(783.99, t + 0.24, 0.5, 0.045);
      global.setTimeout(function () {
        try {
          ctx.close();
        } catch (_) {}
      }, 900);
    } catch (_) {}
  }

  function cinemaFallbackHtml(compact) {
    var cls = compact ? ' crozzo-install-cinema--compact' : '';
    return (
      '<div class="crozzo-install-cinema' +
      cls +
      '" role="img" aria-label="Guía animada de instalación, 15 segundos">' +
      '<div class="crozzo-install-cinema__frame">' +
      '<div class="crozzo-install-cinema__slide crozzo-install-cinema__slide--1">' +
      '<span class="crozzo-install-cinema__icon" aria-hidden="true">1</span>' +
      '<p class="crozzo-install-cinema__line">Descargue la app oficial</p>' +
      '</div>' +
      '<div class="crozzo-install-cinema__slide crozzo-install-cinema__slide--2">' +
      '<span class="crozzo-install-cinema__icon" aria-hidden="true">2</span>' +
      '<p class="crozzo-install-cinema__line">Instale y abra BONA origen</p>' +
      '</div>' +
      '<div class="crozzo-install-cinema__slide crozzo-install-cinema__slide--3">' +
      '<span class="crozzo-install-cinema__icon" aria-hidden="true">3</span>' +
      '<p class="crozzo-install-cinema__line">Empareje con la caja principal</p>' +
      '</div>' +
      '<span class="crozzo-install-cinema__badge">15 s</span>' +
      '</div></div>'
    );
  }

  function renderVideoBlock(opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var url = getVideoUrl();
    if (!url) return cinemaFallbackHtml(compact);

    if (isYoutube(url)) {
      var embed = toEmbedUrl(url);
      return (
        '<div class="crozzo-install-video' +
        (compact ? ' crozzo-install-video--compact' : '') +
        '">' +
        '<div class="crozzo-install-video__frame">' +
        '<iframe src="' +
        esc(embed) +
        '" title="Bienvenida BONA origen" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>' +
        '</div>' +
        '<p class="form-hint crozzo-install-video__caption">Vídeo de bienvenida · ~15 s</p></div>'
      );
    }

    return (
        '<div class="crozzo-install-video' +
        (compact ? ' crozzo-install-video--compact' : '') +
        '">' +
        '<div class="crozzo-install-video__frame">' +
        '<video class="crozzo-install-video__player" playsinline muted preload="metadata" poster="" controls>' +
        '<source src="' +
        esc(url) +
        '" type="video/mp4">' +
        '</video>' +
        '<button type="button" class="crozzo-install-video__play" aria-label="Reproducir vídeo de bienvenida">' +
        '<span aria-hidden="true">▶</span></button>' +
        '</div>' +
        '<p class="form-hint crozzo-install-video__caption">Vídeo de bienvenida · ~15 s</p></div>'
      );
  }

  function bindVideoPlayers(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.crozzo-install-video__frame').forEach(function (frame) {
      if (frame._crozzoVideoBound) return;
      frame._crozzoVideoBound = true;
      var btn = frame.querySelector('.crozzo-install-video__play');
      var vid = frame.querySelector('video');
      if (!btn || !vid) return;
      btn.addEventListener('click', function () {
        try {
          vid.muted = false;
          vid.volume = 0.85;
          var p = vid.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
          btn.classList.add('crozzo-install-video__play--hidden');
        } catch (_) {}
      });
      vid.addEventListener('ended', function () {
        btn.classList.remove('crozzo-install-video__play--hidden');
      });
    });
  }

  function applyPairingUI() {
    try {
      var name = syncBrandFromApp() || resolveBusinessName();
      var sub = global.document.getElementById('crozzoPairingBizSubtitle');
      if (sub) {
        if (name) {
          sub.textContent = 'Para ' + name;
          sub.hidden = false;
        } else {
          sub.textContent = '';
          sub.hidden = true;
        }
      }
      var eyebrow = global.document.querySelector(
        '#crozzoPairingOverlay .crozzo-pairing-card__eyebrow'
      );
      if (eyebrow) {
        eyebrow.textContent = name || 'Configuración de terminal';
      }

      var host = global.document.getElementById('crozzoPairingStep1Video');
      if (host) {
        probeBundledVideo(function () {
          host.innerHTML = renderVideoBlock({ compact: true });
          bindVideoPlayers(host);
        });
      }
    } catch (e) {
      try {
        console.warn('[CrozzoInstallPremium] applyPairingUI', e);
      } catch (_) {}
    }
  }

  function applySplashBrand(opts) {
    opts = opts || {};
    var name = opts.businessName || resolveBusinessName();
    var eyebrow = global.document.querySelector('.crozzo-install-success-splash__eyebrow');
    if (eyebrow) eyebrow.textContent = name || 'BONA origen';
    if (opts.title && name && !opts.titleHasBrand) {
      opts.title = opts.title;
    }
    return opts;
  }

  function showSuccess(opts) {
    opts = opts || {};
    applySplashBrand(opts);
    if (typeof global.crozzoShowInstallSuccessSplash === 'function') {
      global.crozzoShowInstallSuccessSplash(opts);
    }
    playPairingSuccessChime();
  }

  /** Utilidad para landings HTML estáticas (movil.html, bona-origen-instalar.html). */
  function applyStaticLandingBrand(ids) {
    ids = ids || {};
    var name = brandFromUrl();
    if (name) persistBusinessName(name);
    else name = resolveBusinessName();
    if (!name) return '';
    if (ids.titleEl) {
      var t = global.document.getElementById(ids.titleEl);
      if (t) t.textContent = 'Bienvenido a ' + name;
    }
    if (ids.leadEl) {
      var l = global.document.getElementById(ids.leadEl);
      if (l) {
        l.textContent =
          'Preparamos su terminal para operar en ' + name + ' con el sistema POS BONA origen.';
        try {
          l.hidden = false;
        } catch (_) {}
      }
    }
    if (ids.eyebrowEl) {
      var e = global.document.getElementById(ids.eyebrowEl);
      if (e) e.textContent = name;
    }
    try {
      global.document.title = (name ? name + ' · ' : '') + (ids.docTitle || 'BONA origen');
    } catch (_) {}
    return name;
  }

  global.CrozzoInstallPremium = {
    resolveBusinessName: resolveBusinessName,
    persistBusinessName: persistBusinessName,
    syncBrandFromApp: syncBrandFromApp,
    withBrandUrl: withBrandUrl,
    getVideoUrl: getVideoUrl,
    setVideoUrl: setVideoUrl,
    probeBundledVideo: probeBundledVideo,
    setSoundEnabled: setSoundEnabled,
    shouldPlaySound: shouldPlaySound,
    playPairingSuccessChime: playPairingSuccessChime,
    renderVideoBlock: renderVideoBlock,
    bindVideoPlayers: bindVideoPlayers,
    applyPairingUI: applyPairingUI,
    applySplashBrand: applySplashBrand,
    showSuccess: showSuccess,
    applyStaticLandingBrand: applyStaticLandingBrand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
