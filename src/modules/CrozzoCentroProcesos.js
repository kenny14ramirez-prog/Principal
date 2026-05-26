/**
 * Crozzo POS — Centro de Producción
 * Experiencia guiada, fluida y clara para personal sin entrenamiento previo.
 */
(function (global) {
  'use strict';

  var hub = {
    loadedQyc: false,
    frameToken: 0,
    view: 'home',
    qycSub: null,
    loading: false
  };

  var VIEWS = {
    home: { label: 'Inicio', icon: 'layout-grid', sub: null, desc: 'Elige qué harás hoy' },
    form: { label: 'Nueva sesión', icon: 'sparkles', sub: 'form', desc: 'Registrar transformación' },
    hist: { label: 'Historial', icon: 'history', sub: 'hist', desc: 'Ver procesos guardados' },
    jefe: { label: 'Llegó del proveedor', icon: 'package-check', sub: 'jefe', desc: 'Entrada de factura' }
  };

  var WORKFLOWS = [
    {
      id: 'despiece',
      title: 'Despiece de carnes',
      desc: 'Un solomo (o pieza madre) se convierte en varios cortes. Lo que no cuadra queda como merma.',
      icon: 'beef',
      tone: 'amber',
      badge: 'Recomendado',
      badgeClass: '',
      sub: 'form',
      hint: 'despiece',
      steps: ['Pesar pieza', 'Elegir cortes', 'Guardar']
    },
    {
      id: 'coccion',
      title: 'Cocción y porcionado',
      desc: 'Registra peso crudo, cocido y lo que empacas. Las mermas se calculan solas.',
      icon: 'flame',
      tone: 'rose',
      badge: '~5 min',
      badgeClass: 'time',
      sub: 'form',
      hint: 'coccion',
      steps: ['Pesos', 'Porciones', 'Guardar']
    },
    {
      id: 'elaboracion',
      title: 'Salsas y elaborados',
      desc: 'Ej. salsa napolitana: sumas ingredientes y obtienes el producto terminado.',
      icon: 'flask-conical',
      tone: 'violet',
      badge: 'Con receta',
      badgeClass: 'time',
      sub: 'form',
      hint: 'elaboracion',
      steps: ['Ingredientes', 'Peso final', 'Guardar']
    },
    {
      id: 'entrada',
      title: 'Llegó del proveedor',
      desc: 'Cuando entra la factura: kilos y cómo viene la materia prima.',
      icon: 'truck',
      tone: 'cyan',
      badge: 'Jefe cocina',
      badgeClass: 'time',
      sub: 'jefe',
      hint: null,
      steps: ['Abrir recepción', 'Kg', 'Confirmar']
    }
  ];

  function esc(s) {
    if (typeof escUserAttr === 'function') return escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    if (typeof showToast === 'function') showToast(m, t || 'info');
  }

  function cloudOk() {
    try {
      if (typeof global.crozzoShouldUseCloud === 'function') return global.crozzoShouldUseCloud();
      return typeof crozzoOnlineConfigReady === 'function' && crozzoOnlineConfigReady();
    } catch (_) {
      return false;
    }
  }

  function bona() {
    return global.CrozzoBonaOrigen;
  }

  function injectStyles() {
    if (bona()) bona().injectStyles();
    if (document.getElementById('crozzo-centro-procesos-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-centro-procesos-css';
    el.textContent =
      'body.crozzo-page-centro-procesos .main-body,#mainContent.main-body--centro-procesos{padding:0!important;overflow:hidden!important;min-height:0!important;height:auto!important;flex:1 1 auto!important;background:var(--bg-primary,#080a10)}' +
      'html.crozzo-vp-ready body.crozzo-page-centro-procesos .main-body,html.crozzo-vp-ready #mainContent.main-body--centro-procesos{overflow:hidden!important;min-height:0!important;-webkit-overflow-scrolling:auto!important}' +
      '.ccp{display:flex;flex-direction:column;height:100%;max-height:100%;min-height:0;overflow:hidden;box-sizing:border-box}' +
      '.ccp__status,.ccp__rail,#ccp-crumb,.ccp__crumb{flex-shrink:0}' +
      '.ccp:not(.bona){--ccp-gold:#d4b84a;--ccp-gold-soft:rgba(212,184,74,.22);--ccp-glass:rgba(14,16,26,.78);background:radial-gradient(1100px 520px at 6% -8%,rgba(212,184,74,.16),transparent 58%),var(--bg-primary,#080a10);font-family:inherit}' +
      '.ccp__status{padding:8px 20px;font-size:11px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.28);color:var(--text-muted)}' +
      '.ccp__status strong{color:var(--text-primary)}' +
      '.ccp__hero{position:relative;padding:22px 24px 18px;border-bottom:1px solid rgba(255,255,255,.06)}' +
      '.ccp__hero::after{content:"";position:absolute;inset:auto 0 0 0;height:1px;background:linear-gradient(90deg,transparent,var(--ccp-gold),transparent);opacity:.35}' +
      '.ccp__eyebrow{font-size:10px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--ccp-gold);margin-bottom:8px}' +
      '.ccp__title{margin:0;font-size:1.5rem;font-weight:650;letter-spacing:-.04em;line-height:1.2}' +
      '.ccp__sub{margin:8px 0 0;font-size:13px;color:var(--text-muted);max-width:480px;line-height:1.6}' +
      '.ccp__welcome{margin:0 24px 12px;padding:14px 18px;border-radius:14px;border:1px dashed var(--ccp-gold-soft);background:rgba(212,184,74,.06);font-size:13px;color:var(--text-muted);line-height:1.55;animation:ccpFadeUp .5s ease}' +
      '.ccp__welcome strong{color:var(--text-primary)}' +
      '@keyframes ccpFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '.ccp__kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:0 24px 16px}' +
      '.ccp-kpi{background:var(--ccp-glass);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:13px 15px;backdrop-filter:blur(16px);transition:transform .25s,border-color .25s}' +
      '.ccp-kpi:hover{transform:translateY(-2px);border-color:rgba(212,184,74,.2)}' +
      '.ccp-kpi__lbl{font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px}' +
      '.ccp-kpi__val{font-size:1.2rem;font-weight:700;font-variant-numeric:tabular-nums}' +
      '.ccp-kpi__val--gold{color:var(--ccp-gold)}' +
      '.ccp__body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}' +
      '.ccp__rail{display:flex;align-items:center;gap:8px;padding:12px 20px 14px;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap;background:rgba(0,0,0,.12)}' +
      '.ccp-nav{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;transition:all .25s cubic-bezier(.22,1,.36,1);font-family:inherit}' +
      '.ccp-nav:hover{color:var(--text-primary);background:rgba(255,255,255,.05);transform:translateY(-1px)}' +
      '.ccp-nav.is-active{color:var(--text-primary);background:linear-gradient(135deg,rgba(212,184,74,.22),rgba(99,102,241,.12));border-color:var(--ccp-gold-soft);box-shadow:0 6px 24px rgba(0,0,0,.2)}' +
      '.ccp-nav i,.ccp-nav svg{width:15px;height:15px}' +
      '.ccp__crumb{padding:8px 24px 0;font-size:11px;color:var(--text-muted)}' +
      '.ccp__crumb button{background:none;border:none;color:var(--ccp-gold);cursor:pointer;font:inherit;padding:0;font-weight:600}' +
      '.ccp__panel{flex:1;min-height:0;position:relative;overflow:hidden}' +
      '.ccp-home{position:absolute;inset:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 0 28px;animation:ccpFadeUp .4s ease}' +
      '.ccp-home .ccp__hero{margin:0}' +
      '.ccp-home .ccp__welcome{margin:12px 24px 0}' +
      '.ccp-home .ccp__kpis{padding:12px 24px 16px}' +
      '.ccp-home__lead{margin:16px 24px 18px;font-size:14px;color:var(--text-muted);line-height:1.55}' +
      '.ccp-wf{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:0 24px 8px}' +
      '.ccp-card{position:relative;text-align:left;padding:20px 20px 56px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:var(--ccp-glass);backdrop-filter:blur(18px);cursor:pointer;font-family:inherit;color:inherit;overflow:hidden;transition:transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s,border-color .3s}' +
      '.ccp-card::before{content:"";position:absolute;inset:0;opacity:0;background:linear-gradient(125deg,rgba(212,184,74,.14),transparent 50%);transition:opacity .35s;pointer-events:none}' +
      '.ccp-card:hover{transform:translateY(-5px);box-shadow:0 24px 56px rgba(0,0,0,.38);border-color:rgba(212,184,74,.25)}' +
      '.ccp-card:hover::before{opacity:1}' +
      '.ccp-card__badge{position:absolute;top:16px;right:16px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:999px;background:rgba(74,222,128,.12);color:#86efac;border:1px solid rgba(74,222,128,.25)}' +
      '.ccp-card__badge.time{background:rgba(99,102,241,.15);color:#c4b5fd;border-color:rgba(99,102,241,.3)}' +
      '.ccp-card--amber::after{background:#f59e0b}.ccp-card--rose::after{background:#fb7185}.ccp-card--violet::after{background:#a78bfa}.ccp-card--cyan::after{background:#22d3ee}' +
      '.ccp-card::after{content:"";position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;opacity:.15;filter:blur(24px);pointer-events:none}' +
      '.ccp-card__icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}' +
      '.ccp-card__title{font-size:15px;font-weight:650;margin:0 0 8px;letter-spacing:-.02em;padding-right:80px}' +
      '.ccp-card__desc{font-size:12px;color:var(--text-muted);margin:0 0 14px;line-height:1.5}' +
      '.ccp-card__steps{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}' +
      '.ccp-card__steps li{font-size:10px;font-weight:600;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--text-muted)}' +
      '.ccp-card__go{position:absolute;left:20px;bottom:18px;font-size:11px;font-weight:650;color:var(--ccp-gold);letter-spacing:.03em}' +
      '.ccp-engine{position:absolute;inset:0;display:none;flex-direction:column;overflow:hidden;opacity:0;transition:opacity .35s ease}' +
      '.ccp-engine.is-open{display:flex;opacity:1}' +
      '.ccp-engine__frame{flex:1;min-height:0;width:100%;height:100%;border:0;background:var(--bg-primary);display:block}' +
      '.ccp-loader{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(8,10,16,.92);z-index:5;backdrop-filter:blur(8px)}' +
      '.ccp-loader.show{display:flex;animation:ccpFadeUp .3s ease}' +
      '.ccp-loader__ring{width:44px;height:44px;border-radius:50%;border:3px solid rgba(212,184,74,.2);border-top-color:var(--ccp-gold);animation:ccpSpin .9s linear infinite}' +
      '@keyframes ccpSpin{to{transform:rotate(360deg)}}' +
      '.ccp-loader__txt{font-size:13px;color:var(--text-muted)}' +
      '.ccp-local{position:absolute;inset:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:20px 24px;display:none}' +
      '@media(max-width:900px){.ccp__kpis{grid-template-columns:repeat(2,1fr)}.ccp-wf{grid-template-columns:1fr}}';
    document.head.appendChild(el);
  }

  function qycUrl() {
    return 'CrozzoQyC_App.html?embed=1&pos_auto=1&hub=procesos&_=' + Date.now() + '_' + ++hub.frameToken;
  }

  function postToFrame(payload) {
    var fr = document.getElementById('ccp-qyc-frame');
    if (!fr || !fr.contentWindow) return;
    try {
      fr.contentWindow.postMessage(payload, '*');
    } catch (_) {}
  }

  function setLoading(on, msg) {
    hub.loading = !!on;
    var el = document.getElementById('ccp-loader');
    if (!el) return;
    el.classList.toggle('show', !!on);
    var t = el.querySelector('.ccp-loader__txt');
    if (t && msg) t.textContent = msg;
  }

  function navIcon(name) {
    return '<i data-lucide="' + esc(name) + '" aria-hidden="true"></i>';
  }

  function statusBarHtml() {
    return (
      '<div class="ccp__status" id="ccp-status">' +
      (cloudOk()
        ? '<span>✓ Conectado — tus registros se guardan en la nube del negocio</span>'
        : '<span>Modo sin conexión · Activa <strong>Cloud</strong> en Configuración para guardar en todos los equipos</span>') +
      '</div>'
    );
  }

  function welcomeHtml() {
    try {
      if (localStorage.getItem('ccp_welcome_seen') === '1') return '';
    } catch (_) {}
    return (
      '<p class="ccp__welcome" id="ccp-welcome">' +
      '<strong>¿Primera vez?</strong> No hace falta memorizar nada: elige una tarjeta abajo y te guiamos paso a paso con textos claros. ' +
      '<button type="button" style="margin-left:6px;background:none;border:none;color:var(--ccp-gold);cursor:pointer;font-weight:600;font-size:12px" id="ccp-welcome-dismiss">Entendido</button></p>'
    );
  }

  function kpiHtml() {
    return (
      '<div class="ccp__kpis">' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Hoy registraste</div><div class="ccp-kpi__val ccp-kpi__val--gold" id="ccp-kpi-hoy">—</div></div>' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Kg este mes</div><div class="ccp-kpi__val" id="ccp-kpi-kg">—</div></div>' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Revisar merma</div><div class="ccp-kpi__val" id="ccp-kpi-alert">—</div></div>' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Facturas pendientes</div><div class="ccp-kpi__val" id="ccp-kpi-pend">—</div></div>' +
      '</div>'
    );
  }

  function crumbHtml(view) {
    if (view === 'home') return '';
    var v = VIEWS[view] || VIEWS.form;
    return (
      '<div class="ccp__crumb">' +
      '<button type="button" data-ccp-view="home">← Volver al inicio</button>' +
      ' · <span>' +
      esc(v.label) +
      '</span></div>'
    );
  }

  function railHtml(active) {
    return Object.keys(VIEWS)
      .map(function (k) {
        var v = VIEWS[k];
        return (
          '<button type="button" class="ccp-nav' +
          (active === k ? ' is-active' : '') +
          '" data-ccp-view="' +
          k +
          '" title="' +
          esc(v.desc) +
          '">' +
          navIcon(v.icon) +
          '<span>' +
          esc(v.label) +
          '</span></button>'
        );
      })
      .join('');
  }

  function workflowCardsHtml() {
    return WORKFLOWS.map(function (w) {
      var steps = (w.steps || [])
        .map(function (s) {
          return '<li>' + esc(s) + '</li>';
        })
        .join('');
      return (
        '<button type="button" class="ccp-card ccp-card--' +
        w.tone +
        '" data-ccp-wf="' +
        w.id +
        '" data-ccp-sub="' +
        w.sub +
        '"' +
        (w.hint ? ' data-ccp-hint="' + w.hint + '"' : '') +
        '>' +
        '<span class="ccp-card__badge' +
        (w.badgeClass ? ' ' + w.badgeClass : '') +
        '">' +
        esc(w.badge) +
        '</span>' +
        '<div class="ccp-card__icon">' +
        navIcon(w.icon) +
        '</div>' +
        '<h3 class="ccp-card__title">' +
        esc(w.title) +
        '</h3>' +
        '<p class="ccp-card__desc">' +
        esc(w.desc) +
        '</p>' +
        '<ul class="ccp-card__steps">' +
        steps +
        '</ul>' +
        '<span class="ccp-card__go">Toca para empezar →</span>' +
        '</button>'
      );
    }).join('');
  }

  function setView(view, opts) {
    opts = opts || {};
    hub.view = view;
    var home = document.getElementById('ccp-panel-home');
    var eng = document.getElementById('ccp-engine');
    var crumb = document.getElementById('ccp-crumb');
    if (!home || !eng) return;

    document.querySelectorAll('.ccp-nav').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-ccp-view') === view);
    });
    if (crumb) crumb.innerHTML = crumbHtml(view);

    if (view === 'home') {
      home.style.display = 'block';
      eng.classList.remove('is-open');
      setLoading(false);
      return;
    }

    home.style.display = 'none';
    eng.classList.add('is-open');

    var sub = VIEWS[view] ? VIEWS[view].sub : 'form';
    if (opts.hint) {
      try {
        sessionStorage.setItem('qca_pro_workflow', opts.hint);
      } catch (_) {}
    }

    if (cloudOk()) {
      setLoading(true, 'Preparando tu pantalla de cocina…');
      if (!hub.loadedQyc) {
        showLocalFallback(hub.view === 'jefe' ? 'recepcion' : 'procesado');
      }
      ensureFrame(function () {
        var loc = document.getElementById('ccp-local-host');
        if (loc) loc.style.display = 'none';
        var payload = { type: 'crozzo-qyc-nav', module: 'procesado', sub: sub };
        if (opts.hint) payload.workflow = opts.hint;
        postToFrame(payload);
        setTimeout(function () {
          setLoading(false);
        }, 450);
      });
    } else {
      setLoading(false);
      showLocalFallback(hub.view === 'jefe' ? 'recepcion' : 'procesado');
      toast('Modo local seguro — datos en reservorio de este equipo', 'info');
    }
  }

  function showLocalFallback(mod) {
    mod = mod || (hub.view === 'jefe' ? 'recepcion' : 'procesado');
    var loc = document.getElementById('ccp-local-host');
    var eng = document.getElementById('ccp-engine');
    if (!loc || !eng) return;
    eng.classList.add('is-open');
    loc.style.display = 'block';
    if (mod === 'recepcion' && global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.render) {
      loc.innerHTML = global.CrozzoRecepcionFacturas.render();
      global.CrozzoRecepcionFacturas.init(loc);
      return;
    }
    if (mod === 'dashboard' && global.CrozzoComprasLocal) {
      loc.innerHTML = global.CrozzoComprasLocal.render('dashboard');
      global.CrozzoComprasLocal.init(loc, 'dashboard');
      return;
    }
    if (global.CrozzoComprasLocal) {
      loc.innerHTML = global.CrozzoComprasLocal.render(mod === 'recepcion' ? 'recepcion' : 'procesado');
      global.CrozzoComprasLocal.init(loc, mod === 'recepcion' ? 'recepcion' : 'procesado');
    }
  }

  function syncThemeToQycFrame() {
    postToFrame({ type: 'crozzo-pos-theme-sync', theme: 'bona-origen' });
    if (typeof global.crozzoBroadcastThemeToEmbeds === 'function') {
      global.crozzoBroadcastThemeToEmbeds('bona-origen');
    }
  }

  function ensureFrame(onReady) {
    var loc = document.getElementById('ccp-local-host');
    if (loc) loc.style.display = 'none';
    if (hub.loadedQyc) {
      if (onReady) onReady();
      return;
    }
    var fr = document.getElementById('ccp-qyc-frame');
    if (!fr || !cloudOk()) return;
    fr.onload = function () {
      hub.loadedQyc = true;
      postToFrame({ type: 'crozzo-pos-supabase-sync' });
      syncThemeToQycFrame();
      if (onReady) onReady();
    };
    fr.src = qycUrl();
  }

  function reloadFrame() {
    hub.loadedQyc = false;
    var fr = document.getElementById('ccp-qyc-frame');
    if (!fr) return;
    if (!cloudOk()) {
      fr.removeAttribute('src');
      return;
    }
    postToFrame({ type: 'crozzo-pos-supabase-sync' });
    fr.src = qycUrl();
  }

  function bindUi(root) {
    if (!root || root._ccpBound) return;
    root._ccpBound = true;

    var dismiss = document.getElementById('ccp-welcome-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        try {
          localStorage.setItem('ccp_welcome_seen', '1');
        } catch (_) {}
        var w = document.getElementById('ccp-welcome');
        if (w) w.remove();
      });
    }

    root.querySelectorAll('.ccp-nav,[data-ccp-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-ccp-view');
        if (v) setView(v);
      });
    });

    root.querySelectorAll('[data-ccp-wf]').forEach(function (card) {
      card.addEventListener('click', function () {
        var sub = card.getAttribute('data-ccp-sub') || 'form';
        var hint = card.getAttribute('data-ccp-hint');
        var view = sub === 'jefe' ? 'jefe' : sub === 'hist' ? 'hist' : 'form';
        setView(view, { hint: hint });
        if (hint) toast('Te guiamos paso a paso — sigue los números en pantalla', 'success');
      });
    });

    document.addEventListener('crozzo-supabase-config-saved', function () {
      reloadFrame();
      var st = document.getElementById('ccp-status');
      if (st) st.outerHTML = statusBarHtml();
      toast('Listo — cocina sincronizada con la nube', 'success');
    });
  }

  function refreshKpis() {
    if (!cloudOk()) return;
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      if (!raw) return;
      var j = JSON.parse(raw);
      var url = String(j.url || '').replace(/\/$/, '');
      var key = String(j.key || j.anonKey || '').trim();
      if (!j.syncEnabled || !url || key.length < 20) return;
      var H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
      var mes = new Date().toISOString().slice(0, 7);
      var hoy = new Date().toISOString().slice(0, 10);
      Promise.all([
        fetch(url + '/rest/v1/lotes_procesado?fecha=eq.' + hoy + '&select=id', { headers: H }).then(function (r) {
          return r.json();
        }),
        fetch(url + '/rest/v1/lotes_procesado?fecha=gte.' + mes + '-01&select=peso_entrada_kg,diferencia_gr', {
          headers: H
        }).then(function (r) {
          return r.json();
        }),
        fetch(url + '/rest/v1/recepciones?estado_recepcion=eq.pendiente_jefe&select=id', { headers: H }).then(function (r) {
          return r.json();
        })
      ]).then(function (res) {
        var today = Array.isArray(res[0]) ? res[0].length : 0;
        var month = Array.isArray(res[1]) ? res[1] : [];
        var pend = Array.isArray(res[2]) ? res[2].length : 0;
        var kg = 0;
        var alert = 0;
        month.forEach(function (r) {
          kg += parseFloat(r.peso_entrada_kg) || 0;
          var d = parseFloat(r.diferencia_gr) || 0;
          var pe = (parseFloat(r.peso_entrada_kg) || 0) * 1000;
          if (pe > 0 && Math.abs(d / pe) > 0.05) alert++;
        });
        var el = document.getElementById('ccp-kpi-hoy');
        if (el) el.textContent = today === 0 ? '0' : today + ' ses.';
        el = document.getElementById('ccp-kpi-kg');
        if (el) el.textContent = kg.toFixed(1) + ' kg';
        el = document.getElementById('ccp-kpi-alert');
        if (el) el.textContent = alert === 0 ? 'Ninguna' : alert + ' lote' + (alert > 1 ? 's' : '');
        el = document.getElementById('ccp-kpi-pend');
        if (el) el.textContent = pend === 0 ? 'Al día' : String(pend);
      });
    } catch (_) {}
  }

  function heroHtml() {
    var B = bona();
    var wf = '';
    try {
      wf = sessionStorage.getItem('qca_pro_workflow') || '';
    } catch (_) {}
    var chain = B ? B.renderOrigenChain(B.mapWorkflowToOrigen(wf)) : '';
    return (
      '<header class="ccp__hero">' +
      '<div class="ccp__hero-inner">' +
      (B ? B.brandHero() : '<div class="ccp__eyebrow">Origen bueno</div>') +
      '<h1 class="ccp__title">¿Qué vas a hacer hoy?</h1>' +
      '<p class="ccp__sub">Cada paso queda trazado: del proveedor al plato. Elige una tarjeta y te guiamos con claridad.</p>' +
      '</div></header>' +
      chain
    );
  }

  global.CrozzoCentroProcesos = {
    render: function (startView) {
      injectStyles();
      if (bona()) bona().activateModule();
      hub.loadedQyc = false;
      hub.frameToken = 0;
      hub.view = startView && VIEWS[startView] ? startView : 'home';
      hub.qycSub = VIEWS[hub.view] && VIEWS[hub.view].sub;

      return (
        '<section class="ccp bona" id="crozzo-centro-procesos">' +
        (bona() ? bona().renderCcpWatermark() : '') +
        statusBarHtml() +
        '<div class="ccp__body">' +
        '<nav class="ccp__rail" aria-label="Producción">' +
        railHtml(hub.view) +
        '</nav>' +
        '<div id="ccp-crumb">' +
        crumbHtml(hub.view) +
        '</div>' +
        '<div class="ccp__panel">' +
        '<div class="ccp-home" id="ccp-panel-home">' +
        heroHtml() +
        welcomeHtml() +
        kpiHtml() +
        '<p class="ccp-home__lead">Origen bueno: registras quién, cuándo y cuánto en cada etapa. Toca la tarjeta de tu tarea.</p>' +
        '<div class="ccp-wf">' +
        workflowCardsHtml() +
        '</div></div>' +
        '<div class="ccp-engine" id="ccp-engine">' +
        '<div class="ccp-loader" id="ccp-loader"><div class="ccp-loader__ring"></div><div class="ccp-loader__txt">Abriendo guía de cocina…</div></div>' +
        '<iframe id="ccp-qyc-frame" class="ccp-engine__frame" title="Procesado cocina"></iframe>' +
        '<div class="ccp-local" id="ccp-local-host"></div></div></div></div></section>'
      );
    },

    init: function (startView) {
      var root = document.getElementById('crozzo-centro-procesos');
      bindUi(root);
      refreshKpis();
      if (typeof global.refreshLucideIcons === 'function') global.refreshLucideIcons(root);
      else if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

      if (startView && startView !== 'home' && VIEWS[startView]) {
        setView(startView);
      }
    },

    openWorkflow: function (wfId) {
      var w = WORKFLOWS.filter(function (x) {
        return x.id === wfId;
      })[0];
      if (!w) return;
      var view = w.sub === 'jefe' ? 'jefe' : 'form';
      setView(view, { hint: w.hint });
    }
  };

  global.renderCentroProcesos = function (v) {
    return global.CrozzoCentroProcesos.render(v);
  };
  global.initCentroProcesos = function (v) {
    return global.CrozzoCentroProcesos.init(v);
  };
  global.crozzoProcesosPageToView = function (page) {
    var map = {
      'compras-cortes': 'home',
      'compras-proceso-sesion': 'form',
      'compras-proceso-historial': 'hist',
      'centro-procesos': 'home'
    };
    return map[page] || null;
  };

  global.crozzoCentroProcesosTeardown = function () {
    if (bona()) bona().deactivateModule();
    hub.loadedQyc = false;
    var fr = document.getElementById('ccp-qyc-frame');
    if (fr) {
      try {
        fr.src = 'about:blank';
      } catch (_) {}
    }
    var lh = document.getElementById('ccp-local-host');
    if (lh) lh.innerHTML = '';
  };
})(typeof window !== 'undefined' ? window : globalThis);
