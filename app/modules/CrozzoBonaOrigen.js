/**
 * BONA origen — identidad visual integrada + trazabilidad «origen bueno»
 * Paleta: crema #F9F7F5 · carbón #2D2D2D · bronce #B59A6D
 */
(function (global) {
  'use strict';

  var LOGO = 'assets/bona-origen-logo.png';
  var LOGO_PNG = 'assets/bona-origen-logo.png';
  var LOGO_SVG = 'assets/bona-origen-logo.svg';
  var STYLE_ID = 'crozzo-bona-origen-css';

  var ORIGEN_CHAIN = [
    { id: 'proveedor', label: 'Proveedor', desc: 'Quién entrega' },
    { id: 'recepcion', label: 'Recepción', desc: 'Factura y kg' },
    { id: 'corte', label: 'Corte', desc: 'Despiece cocina' },
    { id: 'proceso', label: 'Proceso', desc: 'Cocción y merma' },
    { id: 'plato', label: 'Plato', desc: 'Lo que sale' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isActive() {
    try {
      if (document.documentElement.getAttribute('data-theme') === 'bona-origen') return true;
      return document.body && document.body.classList.contains('crozzo-bona-module');
    } catch (_) {
      return false;
    }
  }

  function emblemSvg(size) {
    size = size || 48;
    var c = '#2D2D2D';
    var g = '#B59A6D';
    return (
      '<svg class="bona-emblem" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="30" fill="none" stroke="' +
      g +
      '" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/>' +
      '<circle cx="32" cy="32" r="22" fill="none" stroke="' +
      c +
      '" stroke-width=".8" opacity=".35"/>' +
      '<line x1="32" y1="32" x2="32" y2="10" stroke="' +
      c +
      '" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="52" y2="32" stroke="' +
      g +
      '" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="32" y2="54" stroke="' +
      c +
      '" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="12" y2="32" stroke="' +
      g +
      '" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="44" y2="18" stroke="' +
      c +
      '" stroke-width=".7" opacity=".7"/>' +
      '<line x1="32" y1="32" x2="46" y2="44" stroke="' +
      g +
      '" stroke-width=".7" opacity=".7"/>' +
      '<line x1="32" y1="32" x2="18" y2="44" stroke="' +
      c +
      '" stroke-width=".7" opacity=".7"/>' +
      '<line x1="32" y1="32" x2="18" y2="20" stroke="' +
      g +
      '" stroke-width=".7" opacity=".7"/>' +
      '<circle cx="32" cy="32" r="3.5" fill="' +
      c +
      '"/>' +
      '<circle cx="32" cy="10" r="2.5" fill="' +
      c +
      '"/>' +
      '<circle cx="52" cy="32" r="2.5" fill="' +
      g +
      '"/>' +
      '<circle cx="32" cy="54" r="2.5" fill="' +
      c +
      '"/>' +
      '<circle cx="12" cy="32" r="2.5" fill="' +
      g +
      '"/>' +
      '<circle cx="44" cy="18" r="2" fill="' +
      c +
      '" opacity=".85"/>' +
      '<circle cx="46" cy="44" r="2" fill="' +
      g +
      '"/>' +
      '<circle cx="18" cy="44" r="2" fill="' +
      c +
      '" opacity=".85"/>' +
      '<circle cx="18" cy="20" r="2" fill="' +
      g +
      '"/>' +
      '</svg>'
    );
  }

  /** Logo en marco redondeado (como en la referencia visual) */
  function logoFrame(sizeClass) {
    return (
      '<span class="bona-logo-frame' +
      (sizeClass ? ' ' + sizeClass : '') +
      '">' +
      '<img src="' +
      esc(LOGO) +
      '" alt="BONA origen" loading="lazy" decoding="async">' +
      '</span>'
    );
  }

  function brandWordmark(opts) {
    opts = opts || {};
    var showEmblem = opts.emblem !== false && !opts.logoOnly;
    return (
      '<div class="bona-brand' +
      (opts.compact ? ' bona-brand--compact' : '') +
      '">' +
      (showEmblem ? emblemSvg(opts.size || 36) : '') +
      (opts.logoFrame ? logoFrame(opts.frameSize) : '') +
      '<div class="bona-brand__text">' +
      '<span class="bona-brand__name">BON<span class="bona-brand__a">Λ</span></span>' +
      '<span class="bona-brand__tag">origen</span>' +
      (opts.hint ? '<span class="bona-brand__hint">' + esc(opts.hint) + '</span>' : '') +
      '</div></div>'
    );
  }

  /** Hero producción — editorial luxury */
  function brandHero() {
    return (
      '<div class="bona-hero-brand bona-hero-brand--premium">' +
      '<div class="bona-hero-brand__visual">' +
      logoFrame('bona-logo-frame--hero') +
      '<span class="bona-hero-brand__halo" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="bona-hero-brand__copy">' +
      '<span class="bona-hero-brand__eyebrow">Trazabilidad de origen</span>' +
      '<span class="bona-brand__name">BON<span class="bona-brand__a">Λ</span></span>' +
      '<span class="bona-brand__tag">origen</span>' +
      '<span class="bona-brand__hint">Cadena completa · proveedor al plato</span>' +
      '</div></div>'
    );
  }

  function brandMark(variant) {
    if (variant === 'micro') {
      return '<span class="bona-mark bona-mark--micro" title="BONA origen">' + emblemSvg(16) + '</span>';
    }
    if (variant === 'ribbon') {
      return (
        '<div class="bona-sidebar-ribbon" title="BONA origen">' +
        logoFrame('bona-logo-frame--xs') +
        '<span class="bona-sidebar-ribbon__lbl">origen</span></div>'
      );
    }
    return (
      '<div class="bona-header-chip" title="BONA origen — origen bueno">' +
      logoFrame('bona-logo-frame--xs') +
      '<span class="bona-header-chip__txt"><span class="bona-brand__name bona-brand__name--sm">BON<span class="bona-brand__a">Λ</span></span> <span class="bona-brand__tag bona-brand__tag--sm">origen</span></span>' +
      '</div>'
    );
  }

  function renderOrigenChain(activeId) {
    var idx = ORIGEN_CHAIN.findIndex(function (s) {
      return s.id === activeId;
    });
    if (idx < 0) idx = 0;
    return (
      '<div class="bona-chain" role="list" aria-label="Cadena de origen bueno">' +
      ORIGEN_CHAIN.map(function (s, i) {
        var state = i < idx ? 'done' : i === idx ? 'now' : '';
        var dot = i < ORIGEN_CHAIN.length - 1 ? '<span class="bona-chain__line' + (i < idx ? ' done' : '') + '"></span>' : '';
        return (
          '<div class="bona-chain__step ' +
          state +
          '" role="listitem" title="' +
          esc(s.desc) +
          '">' +
          '<div class="bona-chain__node">' +
          (i <= idx ? emblemSvg(20) : '<span class="bona-chain__num">' + (i + 1) + '</span>') +
          '</div>' +
          '<span class="bona-chain__lbl">' +
          esc(s.label) +
          '</span>' +
          dot +
          '</div>'
        );
      }).join('') +
      '</div>'
    );
  }

  function mapWorkflowToOrigen(wf) {
    var m = { entrada: 'recepcion', despiece: 'corte', coccion: 'proceso', elaboracion: 'proceso' };
    return m[wf] || 'proceso';
  }

  function cssBlock() {
    return (
      '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600&display=swap");' +
      ':root,html[data-theme="bona-origen"]{' +
      '--bona-cream:#FAF9F7;--bona-cream-2:#F4F1EC;--bona-cream-3:#EBE6DE;--bona-charcoal:#1C1C1C;--bona-charcoal-soft:#525252;' +
      '--bona-gold:#B59A6D;--bona-gold-light:#D4BC94;--bona-gold-dark:#7A6342;--bona-champagne:#E8DFD0;' +
      '--bona-gold-08:rgba(181,154,109,.08);--bona-gold-12:rgba(181,154,109,.12);--bona-gold-18:rgba(181,154,109,.18);--bona-gold-22:rgba(181,154,109,.22);' +
      '--bona-line:rgba(28,28,28,.08);--bona-line-strong:rgba(28,28,28,.14);' +
      '--bona-shadow-sm:0 1px 2px rgba(28,28,28,.04),0 2px 8px rgba(28,28,28,.04);' +
      '--bona-shadow:0 4px 24px rgba(28,28,28,.06),0 1px 3px rgba(28,28,28,.04);' +
      '--bona-shadow-lg:0 20px 50px rgba(28,28,28,.08),0 8px 20px rgba(28,28,28,.04);' +
      '--bona-shadow-gold:0 8px 32px rgba(181,154,109,.2);' +
      '--bona-radius-sm:10px;--bona-radius-md:16px;--bona-radius-lg:22px;--bona-radius-xl:28px;' +
      '--bona-font-display:"Cormorant Garamond",Georgia,"Times New Roman",serif;' +
      '--bona-font:"DM Sans",Inter,system-ui,sans-serif;' +
      '--bona-ease:cubic-bezier(.22,1,.36,1);--bona-ease-out:cubic-bezier(.16,1,.3,1)}' +
      'html[data-theme="bona-origen"]{color-scheme:light;' +
      '--bg-primary:var(--bona-cream);--bg-secondary:var(--bona-cream-2);--bg-tertiary:var(--bona-cream-3);' +
      '--bg-card:#FFFFFF;--border:var(--bona-line);--text-primary:var(--bona-charcoal);' +
      '--text-secondary:var(--bona-charcoal-soft);--text-muted:#6B6560;' +
      '--accent:var(--bona-gold);--accent-hover:var(--bona-gold-light);--accent-rgb:181,154,109;' +
      '--accent-08:var(--bona-gold-08);--accent-10:var(--bona-gold-12);--accent-12:var(--bona-gold-18);' +
      '--accent-20:var(--bona-gold-22);--focus-ring:var(--bona-gold);--shadow:var(--bona-shadow-sm);--shadow-lg:var(--bona-shadow-lg)}' +
      'body.bona-enterprise-chrome{font-feature-settings:"kern" 1,"liga" 1}' +
      '.bona-logo-frame{display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(165deg,#fff 0%,var(--bona-cream) 100%);border:1px solid var(--bona-line-strong);border-radius:var(--bona-radius-md);padding:10px;box-shadow:var(--bona-shadow-sm);flex-shrink:0;transition:box-shadow .4s var(--bona-ease),transform .4s var(--bona-ease)}' +
      '.bona-logo-frame img{display:block;width:100%;height:100%;object-fit:contain}' +
      '.bona-logo-frame--hero{width:80px;height:80px;padding:12px;border-radius:var(--bona-radius-lg);box-shadow:var(--bona-shadow),var(--bona-shadow-gold)}' +
      '.bona-logo-frame--live{width:32px;height:32px;padding:5px;border-radius:var(--bona-radius-sm)}' +
      '.bona-logo-frame--xs{width:26px;height:26px;padding:4px;border-radius:8px}' +
      '.bona-brand{display:flex;align-items:center;gap:14px;font-family:var(--bona-font)}' +
      '.bona-brand__text{display:flex;flex-direction:column;line-height:1.05;gap:2px}' +
      '.bona-brand__name{font-family:var(--bona-font-display);font-size:2rem;font-weight:600;letter-spacing:.2em;color:var(--bona-charcoal);line-height:1}' +
      '.bona-brand__name--sm{font-size:.85rem;letter-spacing:.16em}' +
      '.bona-brand__a{font-weight:400;font-style:italic;color:var(--bona-gold);letter-spacing:0}' +
      '.bona-brand__tag{font-size:.68rem;letter-spacing:.38em;text-transform:uppercase;color:var(--bona-gold-dark);font-weight:500}' +
      '.bona-brand__tag--sm{font-size:.58rem;letter-spacing:.28em}' +
      '.bona-brand__hint{font-size:11px;color:var(--bona-charcoal-soft);margin-top:8px;letter-spacing:.02em;font-weight:400;opacity:.85}' +
      '.bona-hero-brand--premium{display:flex;align-items:center;gap:28px;margin-bottom:8px}' +
      '.bona-hero-brand__visual{position:relative;flex-shrink:0}' +
      '.bona-hero-brand__halo{position:absolute;inset:-12px;border-radius:50%;background:radial-gradient(circle,rgba(181,154,109,.15) 0%,transparent 70%);pointer-events:none}' +
      '.bona-hero-brand__eyebrow{font-size:10px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--bona-gold-dark);margin-bottom:6px;display:block}' +
      '.bona-hero-brand__copy .bona-brand__name{font-size:2.4rem}' +
      '.crozzo-brand-dual--sidebar{position:relative;padding:14px 12px;border-radius:var(--bona-radius-lg);background:linear-gradient(165deg,rgba(255,255,255,.97) 0%,rgba(250,249,247,.92) 100%);border:1px solid var(--bona-line);box-shadow:var(--bona-shadow-sm);gap:12px}' +
      'html[data-theme="bona-origen"] .crozzo-brand-dual--sidebar,body.bona-enterprise-chrome .crozzo-brand-dual--sidebar{background:linear-gradient(165deg,#fff 0%,var(--bona-cream-2) 100%);border-color:var(--bona-line-strong)}' +
      '.crozzo-brand-slot.bona-platform-live{border-color:rgba(181,154,109,.28);background:linear-gradient(180deg,#fff 0%,var(--bona-champagne) 100%);box-shadow:var(--bona-shadow-sm),inset 0 1px 0 rgba(255,255,255,.9)}' +
      '.crozzo-brand-slot.bona-platform-live .crozzo-brand-img{padding:6px}' +
      '#crozzoBrandSidebarTenant.crozzo-brand-slot.is-image,#crozzoBrandLoginTenant.crozzo-brand-slot.is-image{border-color:var(--bona-line);background:#fff;box-shadow:var(--bona-shadow-sm)}' +
      'body.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live{animation:bonaPlatformLift 7s var(--bona-ease) infinite}' +
      'body.crozzo-brand-platform-only .crozzo-brand-slot[id*="Tenant"]{display:none!important}' +
      '.bona-workspace-accent{pointer-events:none;position:absolute;right:12px;bottom:12px;width:min(140px,28vw);opacity:.06;z-index:0}' +
      '.bona-workspace-accent img{width:100%;height:auto;object-fit:contain}' +
      '#mainContent{position:relative}' +
      '.login-card.bona-login-card{border-color:rgba(181,154,109,.35);box-shadow:0 8px 32px rgba(28,28,28,.08),0 0 0 1px rgba(181,154,109,.12)}' +
      '.login-card-header .crozzo-brand-dual--login{justify-content:center}' +
      '.bona-login-powered{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--bona-gold-dark,#7A6342);margin:4px 0 0}' +
      '@keyframes bonaPlatformLift{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}' +
      '.bona-header-gem{position:relative;width:40px;height:40px;padding:0;border:none;background:transparent;cursor:default;flex-shrink:0;transition:transform .35s var(--bona-ease)}' +
      '.bona-header-gem:hover{transform:scale(1.04)}' +
      '.bona-header-gem__glow{position:absolute;inset:2px;border-radius:50%;background:radial-gradient(circle at 50% 40%,rgba(181,154,109,.22),transparent 70%);opacity:.9;pointer-events:none}' +
      '.bona-header-gem__plate{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:linear-gradient(165deg,#fff,var(--bona-cream));border:1px solid rgba(181,154,109,.32);box-shadow:var(--bona-shadow-sm)}' +
      '.bona-header-gem__plate img{width:20px;height:20px;object-fit:contain}' +
      'html[data-theme="bona-origen"] .bona-header-gem__plate,body.bona-chrome-active .bona-header-gem__plate{border-color:var(--bona-gold);box-shadow:var(--bona-shadow-sm),0 0 0 1px rgba(181,154,109,.12)}' +
      '#sidebar:has(.bona-sidebar-live){display:flex;flex-direction:column}' +
      '#sidebar:has(.bona-sidebar-live) .sidebar-nav{flex:1 1 auto;min-height:0}' +
      '.bona-sidebar-live{margin-top:auto;padding:0 10px 12px;flex-shrink:0}' +
      '.bona-sidebar-live__frame{padding:12px 14px;border-radius:var(--bona-radius-md);background:linear-gradient(135deg,rgba(181,154,109,.06) 0%,rgba(255,255,255,.4) 50%,rgba(181,154,109,.04) 100%);border:1px solid var(--bona-line);position:relative;overflow:hidden}' +
      '.bona-sidebar-live__line{position:absolute;top:0;left:14px;right:14px;height:1px;background:linear-gradient(90deg,transparent,var(--bona-gold),transparent);opacity:.55}' +
      '.bona-sidebar-live__content{display:flex;align-items:center;gap:10px;position:relative;z-index:1}' +
      '.bona-sidebar-live__copy{display:flex;flex-direction:column;gap:1px;min-width:0}' +
      '.bona-sidebar-live__brand{font-family:var(--bona-font-display);font-size:15px;font-weight:600;letter-spacing:.22em;color:var(--bona-charcoal);line-height:1.1}' +
      '.bona-sidebar-live__tag{font-size:7px;letter-spacing:.26em;text-transform:uppercase;color:var(--bona-gold-dark);font-weight:500;opacity:.9}' +
      '.bona-header-chip,.bona-sidebar-ribbon{display:none!important}' +
      '.bona-mark--micro{display:inline-flex;opacity:.85;vertical-align:middle}' +
      'body.bona-chrome-active .main-content,html[data-theme="bona-origen"] .main-content{position:relative}' +
      'body.bona-chrome-active .main-content::after,html[data-theme="bona-origen"] .main-content::after{content:"";position:absolute;right:3%;bottom:4%;width:min(240px,32vw);height:min(240px,32vw);opacity:.025;background:url(' +
      esc(LOGO) +
      ') center/contain no-repeat;pointer-events:none;z-index:0;filter:grayscale(.2)}' +
      'body.bona-chrome-active .main-body,html[data-theme="bona-origen"] .main-body{position:relative;z-index:1}' +
      'html[data-theme="bona-origen"] body.crozzo-chrome-motion[data-crozzo-motion="high"] .main-header,' +
      'html[data-theme="bona-origen"] body.crozzo-chrome-motion[data-crozzo-motion="high"] .sidebar-header,' +
      'html[data-theme="bona-origen"] body.crozzo-chrome-motion .card{animation:none!important}' +
      'html[data-theme="bona-origen"] .main-header{background:linear-gradient(180deg,#fff 0%,var(--bona-cream-2) 100%);border-bottom-color:var(--bona-line);backdrop-filter:blur(12px)}' +
      'html[data-theme="bona-origen"] .crozzo-brand-dual--login{padding:20px 16px;border-radius:var(--bona-radius-lg);background:linear-gradient(165deg,#fff,var(--bona-cream));border:1px solid var(--bona-line);box-shadow:var(--bona-shadow)}' +
      '.ccp.bona{position:relative;overflow:hidden;font-family:var(--bona-font)}' +
      '.ccp.bona .bona-ccp-watermark{position:absolute;right:-20px;top:100px;width:200px;height:200px;opacity:.035;pointer-events:none;z-index:0}' +
      '.ccp.bona .ccp__status,.ccp.bona .ccp__rail,.ccp.bona #ccp-crumb,.ccp.bona .ccp__body,.ccp.bona .ccp__hero,.ccp.bona .bona-chain,.ccp.bona .ccp__kpis{position:relative;z-index:1}' +
      '.ccp.bona .ccp__status,.ccp.bona .ccp__rail,.ccp.bona #ccp-crumb{flex-shrink:0}' +
      '.ccp.bona .ccp__body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}' +
      '.ccp.bona .ccp__panel{flex:1;min-height:0;overflow:hidden}' +
      '.ccp.bona .ccp-home .ccp__hero{margin:0;border-bottom:1px solid var(--bona-line)}' +
      '.ccp.bona .ccp-home .ccp__welcome{margin:12px 32px 0}' +
      '.ccp.bona .ccp-home .ccp__kpis{padding:12px 32px 16px}' +
      '.ccp.bona{display:flex;flex-direction:column;height:100%;max-height:100%;min-height:0;overflow:hidden;background:var(--bona-cream);color:var(--bona-charcoal)}' +
      '.ccp.bona::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 80% 50% at 0% 0%,var(--bona-gold-08),transparent 55%),radial-gradient(ellipse 60% 40% at 100% 0%,rgba(28,28,28,.02),transparent 50%)}' +
      '.ccp.bona .ccp__status{background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--bona-line);color:var(--bona-charcoal-soft);font-size:11px;letter-spacing:.04em}' +
      '.ccp.bona .ccp__hero{background:#fff;border-bottom:1px solid var(--bona-line);padding:28px 32px 12px;position:relative}' +
      '.ccp.bona .ccp__hero-inner{position:relative;z-index:1}' +
      '.ccp.bona .ccp__title{margin:16px 0 0;font-family:var(--bona-font-display);font-size:1.85rem;font-weight:600;color:var(--bona-charcoal);letter-spacing:-.02em;line-height:1.15}' +
      '.ccp.bona .ccp__sub{margin:10px 0 0;font-size:14px;color:var(--bona-charcoal-soft);max-width:540px;line-height:1.6;font-weight:400}' +
      '.bona-chain{display:flex;align-items:flex-start;gap:0;padding:18px 32px 14px;overflow-x:auto;background:#fff;border-bottom:1px solid var(--bona-line);scrollbar-width:thin}' +
      '.bona-chain__step{flex:1;min-width:72px;display:flex;flex-direction:column;align-items:center;position:relative;text-align:center}' +
      '.bona-chain__node{width:36px;height:36px;display:flex;align-items:center;justify-content:center;margin-bottom:6px}' +
      '.bona-chain__num{width:28px;height:28px;border-radius:50%;border:1px solid var(--bona-line-strong);font-size:10px;font-weight:500;color:var(--bona-charcoal-soft);display:flex;align-items:center;justify-content:center;background:var(--bona-cream)}' +
      '.bona-chain__lbl{font-size:7px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--bona-charcoal-soft);opacity:.85}' +
      '.bona-chain__step.now .bona-chain__lbl{color:var(--bona-gold-dark);opacity:1}' +
      '.bona-chain__step.done .bona-chain__lbl{color:var(--bona-charcoal)}' +
      '.bona-chain__line{position:absolute;top:18px;left:calc(50% + 20px);width:calc(100% - 40px);height:1px;background:var(--bona-line);z-index:0}' +
      '.bona-chain__line.done{background:linear-gradient(90deg,var(--bona-gold-dark),var(--bona-gold-light))}' +
      '.ccp.bona .ccp__welcome{margin:0 32px 16px;padding:14px 20px 14px 48px;border-radius:var(--bona-radius-md);border:1px solid var(--bona-line);background:linear-gradient(135deg,var(--bona-gold-08),#fff);position:relative;font-size:13px;line-height:1.5}' +
      '.ccp.bona .ccp__welcome::before{content:"";position:absolute;left:16px;top:50%;transform:translateY(-50%);width:24px;height:24px;background:url(' +
      esc(LOGO) +
      ') center/contain no-repeat;opacity:.75}' +
      '.ccp.bona .ccp-kpi{background:#fff;border:1px solid var(--bona-line);border-radius:var(--bona-radius-md);box-shadow:var(--bona-shadow-sm);position:relative;overflow:hidden;transition:border-color .35s var(--bona-ease),box-shadow .35s var(--bona-ease),transform .35s var(--bona-ease)}' +
      '.ccp.bona .ccp-kpi:hover{border-color:rgba(181,154,109,.4);box-shadow:var(--bona-shadow);transform:translateY(-2px)}' +
      '.ccp.bona .ccp__rail{background:#fff;border-bottom:1px solid var(--bona-line);padding:0 8px}' +
      '.ccp.bona .ccp-nav.is-active{background:var(--bona-gold-08);border-color:var(--bona-gold);color:var(--bona-charcoal);box-shadow:inset 0 0 0 1px rgba(181,154,109,.12)}' +
      '.ccp.bona .ccp-card{background:#fff;border:1px solid var(--bona-line);border-radius:var(--bona-radius-md);box-shadow:var(--bona-shadow-sm);position:relative;transition:border-color .35s var(--bona-ease),box-shadow .4s var(--bona-ease),transform .4s var(--bona-ease)}' +
      '.ccp.bona .ccp-card:hover{border-color:rgba(181,154,109,.35);box-shadow:var(--bona-shadow-lg);transform:translateY(-3px)}' +
      '.ccp.bona .ccp-card__go{color:var(--bona-gold-dark);font-weight:600;letter-spacing:.04em}' +
      '.ccp.bona .ccp-card__badge{background:var(--bona-gold-08);color:var(--bona-gold-dark);border:1px solid rgba(181,154,109,.2);font-size:10px;letter-spacing:.06em}' +
      '.ccp.bona .ccp-loader{background:rgba(250,249,247,.96);backdrop-filter:blur(6px)}' +
      'html[data-crozzo-theme="bona-origen"],html.bona-origen-hub{--bg:var(--bona-cream);--surface-solid:#fff;--text:var(--bona-charcoal);--accent:var(--bona-gold);--sans:var(--bona-font)}' +
      'html.bona-origen-hub .bona-qyc-strip{display:flex!important;align-items:center;gap:16px;padding:14px 24px;background:linear-gradient(180deg,#fff,var(--bona-cream));border-bottom:1px solid var(--bona-line);box-shadow:var(--bona-shadow-sm)}' +
      'html.bona-origen-hub .bona-qyc-strip .bona-logo-frame--hero{width:52px;height:52px;padding:8px}' +
      '@media(max-width:720px){.bona-hero-brand--premium{flex-direction:column;align-items:flex-start;gap:18px}.bona-sidebar-live__brand{font-size:13px}}' +
      '@media(prefers-reduced-motion:reduce){.bona-header-gem:hover{transform:none}body.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live{animation:none}}'
    );
  }

  function injectStyles() {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = cssBlock();
  }

  function isBonaAssetUrl(url) {
    var s = String(url || '').trim();
    if (!s) return false;
    return s.indexOf('bona-origen-logo') >= 0 || s === LOGO || s === LOGO_PNG || s === LOGO_SVG;
  }

  function hasCustomPlatformImage(dataUrl) {
    var s = String(dataUrl || '').trim();
    if (!s) return false;
    if (isBonaAssetUrl(s)) return false;
    if (s.indexOf('data:image') === 0) return s.length > 40;
    return /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(s) || s.indexOf('assets/') >= 0;
  }

  /** Slot plataforma: BONA por defecto; el tenant sigue siendo logo de la empresa. */
  function getPlatformBranding(platform) {
    platform = platform || {};
    if (hasCustomPlatformImage(platform.dataUrl)) return platform;
    var label = String(platform.label || '').trim();
    return {
      dataUrl: LOGO_PNG,
      emoji: platform.emoji || '○',
      label: label || 'BONA origen',
      loginEmoji: platform.loginEmoji || '○',
      objectFit: platform.objectFit || 'contain'
    };
  }

  function isBonaPlatformDefault(platform) {
    return !hasCustomPlatformImage(platform && platform.dataUrl);
  }

  function installMainWorkspaceAccent() {
    var mc = document.getElementById('mainContent');
    if (!mc) return;
    var w = document.getElementById('bona-workspace-accent');
    if (!w) {
      w = document.createElement('div');
      w.id = 'bona-workspace-accent';
      w.className = 'bona-workspace-accent bona-chrome-injected';
      w.setAttribute('aria-hidden', 'true');
      mc.insertBefore(w, mc.firstChild);
    }
    w.innerHTML = '<img src="' + esc(LOGO_PNG) + '" alt="" decoding="async" loading="lazy">';
  }

  function enhanceLoginChrome() {
    var card = document.querySelector('.login-card');
    if (card) card.classList.add('bona-login-card');
    var title = document.getElementById('loginTitle');
    if (title && (title.textContent === 'Crozzo POS' || title.textContent === 'Proyecto')) title.textContent = 'BONA origen';
    var sub = title && title.nextElementSibling;
    if (sub && sub.tagName === 'P' && !document.getElementById('bonaLoginPowered')) {
      /* Sin línea de powered-by de plataforma en login */
    }
  }

  function clearDynamicChrome() {
    document.querySelectorAll('.bona-chrome-injected, .bona-header-chip, .bona-sidebar-ribbon').forEach(function (el) {
      el.remove();
    });
  }

  function clearChrome() {
    clearDynamicChrome();
    document.querySelectorAll('.crozzo-brand-slot[data-bona-platform]').forEach(function (el) {
      el.removeAttribute('data-bona-platform');
      el.classList.remove('bona-platform-live');
    });
    try {
      document.body.classList.remove('bona-chrome-active');
    } catch (_) {}
  }

  function installHeaderGem() {
    var toolbar = document.querySelector('.crozzo-header__toolbar');
    if (!toolbar || toolbar.querySelector('.bona-header-gem')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bona-header-gem bona-chrome-injected';
    btn.title = 'BONA origen';
    btn.setAttribute('aria-label', 'BONA origen');
    btn.innerHTML =
      '<span class="bona-header-gem__glow" aria-hidden="true"></span>' +
      '<span class="bona-header-gem__plate"><img src="' +
      esc(LOGO) +
      '" alt="" width="20" height="20" decoding="async"></span>';
    var anchor = document.getElementById('crozzoA11yTrigger');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor);
    else toolbar.insertBefore(btn, toolbar.firstChild);
  }

  function installSidebarLive() {
    var sb = document.getElementById('sidebar');
    if (!sb || sb.querySelector('.bona-sidebar-live')) return;
    var live = document.createElement('div');
    live.className = 'bona-sidebar-live bona-chrome-injected';
    live.setAttribute('aria-hidden', 'true');
    live.innerHTML =
      '<div class="bona-sidebar-live__frame">' +
      '<span class="bona-sidebar-live__line" aria-hidden="true"></span>' +
      '<div class="bona-sidebar-live__content">' +
      logoFrame('bona-logo-frame--live') +
      '<div class="bona-sidebar-live__copy">' +
      '<span class="bona-sidebar-live__brand">BONA</span>' +
      '<span class="bona-sidebar-live__tag">origen bueno</span>' +
      '</div></div></div>';
    sb.appendChild(live);
  }

  function enhancePlatformSlots() {
    var plat = {};
    try {
      plat = (window.getCrozzoBranding && window.getCrozzoBranding().platform) || {};
    } catch (_) {}
    var useBona = isBonaPlatformDefault(plat);
    ['crozzoBrandSidebarPlatform', 'crozzoBrandHeaderPlatform', 'crozzoBrandLoginPlatform'].forEach(function (id) {
      var slot = document.getElementById(id);
      if (!slot) return;
      if (useBona && slot.classList.contains('is-image')) {
        slot.setAttribute('data-bona-platform', '1');
        slot.classList.add('bona-platform-live');
      } else {
        slot.removeAttribute('data-bona-platform');
        slot.classList.remove('bona-platform-live');
      }
    });
  }

  function applyChrome() {
    injectStyles();
    clearDynamicChrome();
    installHeaderGem();
    installSidebarLive();
    installMainWorkspaceAccent();
    enhanceLoginChrome();
    try {
      document.body.classList.toggle('bona-chrome-active', isActive());
    } catch (_) {}
    enhancePlatformSlots();
  }

  function afterBrandingApply() {
    injectStyles();
    installHeaderGem();
    installSidebarLive();
    installMainWorkspaceAccent();
    enhanceLoginChrome();
    enhancePlatformSlots();
    try {
      var b = (window.getCrozzoBranding && window.getCrozzoBranding()) || {};
      var plat = b.platform || {};
      var sh = b.show || {};
      var platformOnly =
        sh.sidebar &&
        sh.sidebar.platform &&
        !sh.sidebar.tenant &&
        sh.header &&
        sh.header.platform &&
        !sh.header.tenant &&
        sh.login &&
        sh.login.platform &&
        !sh.login.tenant;
      document.body.classList.toggle('bona-enterprise-chrome', isBonaPlatformDefault(plat) || platformOnly);
      document.body.classList.toggle('bona-chrome-active', isActive() || platformOnly || isBonaPlatformDefault(plat));
    } catch (_) {}
  }

  function onThemeChange(themeId) {
    applyChrome();
    if (themeId !== 'bona-origen' && !document.body.classList.contains('crozzo-bona-module')) {
      try {
        document.body.classList.remove('bona-chrome-active');
      } catch (_) {}
    }
  }

  function activateModule() {
    injectStyles();
    try {
      document.body.classList.add('crozzo-bona-module');
    } catch (_) {}
    applyChrome();
  }

  function deactivateModule() {
    try {
      document.body.classList.remove('crozzo-bona-module');
    } catch (_) {}
    if (document.documentElement.getAttribute('data-theme') !== 'bona-origen') clearChrome();
  }

  function syncEmbedTheme(frame) {
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: 'crozzo-pos-theme-sync', theme: 'bona-origen' }, '*');
    } catch (_) {}
  }

  function renderCcpWatermark() {
    return '<div class="bona-ccp-watermark" aria-hidden="true">' + emblemSvg(200) + '</div>';
  }

  global.CrozzoBonaOrigen = {
    LOGO: LOGO,
    LOGO_PNG: LOGO_PNG,
    ORIGEN_CHAIN: ORIGEN_CHAIN,
    emblemSvg: emblemSvg,
    logoFrame: logoFrame,
    brandWordmark: brandWordmark,
    brandHero: brandHero,
    brandMark: brandMark,
    renderOrigenChain: renderOrigenChain,
    renderCcpWatermark: renderCcpWatermark,
    mapWorkflowToOrigen: mapWorkflowToOrigen,
    injectStyles: injectStyles,
    isActive: isActive,
    hasCustomPlatformImage: hasCustomPlatformImage,
    getPlatformBranding: getPlatformBranding,
    isBonaPlatformDefault: isBonaPlatformDefault,
    applyChrome: applyChrome,
    afterBrandingApply: afterBrandingApply,
    clearChrome: clearChrome,
    onThemeChange: onThemeChange,
    activateModule: activateModule,
    deactivateModule: deactivateModule,
    syncEmbedTheme: syncEmbedTheme
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        try {
          afterBrandingApply();
        } catch (_) {}
      });
    } else {
      try {
        afterBrandingApply();
      } catch (_) {}
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
