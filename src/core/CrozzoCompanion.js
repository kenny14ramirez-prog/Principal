/* CrozzoCompanion — saludo y preferencias del asistente (solo en este equipo). */
(function (global) {
  'use strict';

  var KEY = 'crozzo_companion_prefs_v1';
  var DEFAULTS = { enabled: true, nombre: '', tratamiento: 'tu', region: 'colombia', ritmo: 'directo', mayordomo: true, pausa: true, onboardingDone: false, focusMode: false, celebraciones: true };
  var PAGINA_INICIO = 'inicio-operacion';
  var HORA_CIERRE = 15;
  var HITOS = [3, 10, 25];
  var TIPS = {
    'cajero': 'Consejo: usa chips de categoría para filtrar rápido y Enter para confirmar.',
    'inicio-operacion': 'Consejo: el mayordomo sugiere dónde continuar según tu última venta.',
    'cierre-caja': 'Consejo: declara efectivo antes de cerrar para evitar diferencias.',
    'facturas': 'Consejo: filtra por periodo para encontrar facturas rápido.',
    'default': 'Consejo: personaliza tu asistente con Ctrl+K → "Personalizar asistente".'
  };
  var PAUSA_TRAS_MS = 3 * 60 * 60 * 1000;
  var PAUSA_CADA_MS = 90 * 60 * 1000;
  var REVISION_MS = 5 * 60 * 1000;
  var CLAVE_INICIO = 'crozzo_companion_inicio';
  var CLAVE_ULT_PAUSA = 'crozzo_companion_ultima_pausa';

  var FRASES = {
    pereira: {
      tu: {
        manana: 'Buenos días, {n}. ¿Qué más? ¿Cómo vas hoy?',
        tarde: 'Buenas tardes, {n}. ¿Qué más? Ámonos con todo.',
        noche: 'Buenas noches, {n}. Vamos a cerrar bien, pilas con el cierre.'
      },
      usted: {
        manana: 'Buenos días, {n}. ¿Cómo amaneció hoy?',
        tarde: 'Buenas tardes, {n}. Lo acompañamos con todo.',
        noche: 'Buenas noches, {n}. Lo acompañamos en el cierre.'
      }
    },
    colombia: {
      tu: {
        manana: 'Buenos días, {n}. ¿Cómo vas hoy?',
        tarde: 'Buenas tardes, {n}. Vamos con todo.',
        noche: 'Buenas noches, {n}. Pilas con el cierre.'
      },
      usted: {
        manana: 'Buenos días, {n}. ¿Cómo está hoy?',
        tarde: 'Buenas tardes, {n}. Lo acompañamos con todo.',
        noche: 'Buenas noches, {n}. Lo acompañamos en el cierre.'
      }
    }
  };

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save(prefs) {
    try { global.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* almacenamiento no disponible */ }
  }

  function momento(h) {
    if (h >= 5 && h < 12) return 'manana';
    if (h >= 12 && h < 19) return 'tarde';
    return 'noche';
  }

  function memoriaTurno(p) {
    var cfg = global.config;
    if (!cfg || typeof cfg.get !== 'function') return '';
    var list = cfg.get('cajaDeclaracionesTurno');
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u || !Array.isArray(list)) return '';
    var e = list.filter(function (x) { return x && String(x.userId) === String(u.id); })[0];
    if (!e) return '';
    var fecha = new Date(e.at);
    if (isNaN(fecha.getTime())) return '';
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var dia = new Date(fecha); dia.setHours(0, 0, 0, 0);
    var dias = Math.round((hoy - dia) / 86400000);
    var cuando = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : 'el ' + fecha.toLocaleDateString('es-CO', { weekday: 'long' });
    var diff = Number(e.diff) || 0;
    var estado = Math.abs(diff) < 1
      ? 'sin diferencias'
      : (diff > 0 ? 'con sobrante de $' : 'con faltante de $') + Math.abs(diff).toLocaleString('es-CO');
    return (p.tratamiento === 'usted' ? 'Su' : 'Tu') + ' último cierre fue ' + cuando + ' y quedó ' + estado + '.';
  }

  function memoriaTooltip() {
    var p = load();
    return p.enabled ? memoriaTurno(p) : '';
  }

  function greeting(firstName) {
    var p = load();
    if (!p.enabled) return null;
    var region = FRASES[p.region] ? p.region : 'colombia';
    var tabla = FRASES[region][p.tratamiento === 'usted' ? 'usted' : 'tu'];
    var nombre = String(p.nombre || firstName || '').trim();
    var base = tabla[momento(new Date().getHours())];
    if (!nombre) base = base.replace(', {n}', '');
    var txt = base.replace('{n}', nombre);
    if (p.ritmo === 'detallado') txt += ' ' + (memoriaTurno(p) || 'Aquí tienes el detalle del día.');
    return txt;
  }

  function refrescarSaludo() {
    var el = global.document.getElementById('crozzoHeaderGreeting');
    if (!el || el.hidden) return;
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    var first = String((u && u.nombre) || '').trim().split(/\s+/)[0] || '';
    var txt = greeting(first);
    if (txt) el.textContent = txt;
  }

  function openPrefs() {
    var doc = global.document;
    var prev = doc.querySelector('.crozzo-companion-overlay');
    if (prev) prev.remove();
    var p = load();

    var overlay = doc.createElement('div');
    overlay.className = 'crozzo-companion-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'crozzoCompanionTitle');

    var card = doc.createElement('div');
    card.className = 'crozzo-companion-card';

    var title = doc.createElement('h2');
    title.id = 'crozzoCompanionTitle';
    title.textContent = 'Tu asistente';
    card.appendChild(title);

    var sub = doc.createElement('p');
    sub.className = 'crozzo-companion-sub';
    sub.textContent = 'Cómo quieres que te hable el sistema. Todo se guarda solo en este equipo.';
    card.appendChild(sub);

    var preview = doc.createElement('p');
    preview.className = 'crozzo-companion-preview';
    card.appendChild(preview);

    var memo = doc.createElement('p');
    memo.className = 'crozzo-companion-sub';
    card.appendChild(memo);

    function campo(label, el) {
      var wrap = doc.createElement('label');
      wrap.className = 'crozzo-companion-field';
      var span = doc.createElement('span');
      span.textContent = label;
      wrap.appendChild(span);
      wrap.appendChild(el);
      card.appendChild(wrap);
      return el;
    }

    var inNombre = doc.createElement('input');
    inNombre.type = 'text';
    inNombre.maxLength = 30;
    inNombre.value = p.nombre || '';
    inNombre.placeholder = 'Como te gusta que te llamen';
    campo('Nombre preferido', inNombre);

    var inTrato = doc.createElement('select');
    [['tu', 'Tú'], ['usted', 'Usted']].forEach(function (o) {
      var op = doc.createElement('option'); op.value = o[0]; op.textContent = o[1]; inTrato.appendChild(op);
    });
    inTrato.value = p.tratamiento;
    campo('Tratamiento', inTrato);

    var inRegion = doc.createElement('select');
    [['colombia', 'Colombia (general)'], ['pereira', 'Eje Cafetero (Pereira)']].forEach(function (o) {
      var op = doc.createElement('option'); op.value = o[0]; op.textContent = o[1]; inRegion.appendChild(op);
    });
    inRegion.value = p.region === 'auto' ? 'colombia' : p.region;
    campo('Expresiones de la región', inRegion);

    var inRitmo = doc.createElement('select');
    [['directo', 'Directo'], ['detallado', 'Detallado']].forEach(function (o) {
      var op = doc.createElement('option'); op.value = o[0]; op.textContent = o[1]; inRitmo.appendChild(op);
    });
    inRitmo.value = p.ritmo;
    campo('Ritmo', inRitmo);

    var inOn = doc.createElement('input');
    inOn.type = 'checkbox';
    inOn.checked = !!p.enabled;
    var lbl = doc.createElement('label');
    lbl.className = 'crozzo-companion-toggle';
    lbl.appendChild(inOn);
    var lblTxt = doc.createElement('span');
    lblTxt.textContent = 'Personalizar el saludo';
    lbl.appendChild(lblTxt);
    card.appendChild(lbl);

    var inMay = doc.createElement('input');
    inMay.type = 'checkbox';
    inMay.checked = p.mayordomo !== false;
    var lblMay = doc.createElement('label');
    lblMay.className = 'crozzo-companion-toggle';
    lblMay.appendChild(inMay);
    var lblMayTxt = doc.createElement('span');
    lblMayTxt.textContent = 'Sugerencias del mayordomo en el inicio';
    lblMay.appendChild(lblMayTxt);
    card.appendChild(lblMay);

    var inPausa = doc.createElement('input');
    inPausa.type = 'checkbox';
    inPausa.checked = p.pausa !== false;
    var lblPausa = doc.createElement('label');
    lblPausa.className = 'crozzo-companion-toggle';
    lblPausa.appendChild(inPausa);
    var lblPausaTxt = doc.createElement('span');
    lblPausaTxt.textContent = 'Recordatorio de pausa en jornadas largas';
    lblPausa.appendChild(lblPausaTxt);
    card.appendChild(lblPausa);

    var inFocus = doc.createElement('input');
    inFocus.type = 'checkbox';
    inFocus.checked = p.focusMode === true;
    var lblFocus = doc.createElement('label');
    lblFocus.className = 'crozzo-companion-toggle';
    lblFocus.appendChild(inFocus);
    var lblFocusTxt = doc.createElement('span');
    lblFocusTxt.textContent = 'Modo enfoque (oculta distracciones)';
    lblFocus.appendChild(lblFocusTxt);
    card.appendChild(lblFocus);

    var inCel = doc.createElement('input');
    inCel.type = 'checkbox';
    inCel.checked = p.celebraciones !== false;
    var lblCel = doc.createElement('label');
    lblCel.className = 'crozzo-companion-toggle';
    lblCel.appendChild(inCel);
    var lblCelTxt = doc.createElement('span');
    lblCelTxt.textContent = 'Celebraciones por hitos';
    lblCel.appendChild(lblCelTxt);
    card.appendChild(lblCel);
    function leer() {
      return {
        enabled: inOn.checked,
        nombre: inNombre.value.trim(),
        tratamiento: inTrato.value,
        region: inRegion.value,
        ritmo: inRitmo.value,
        mayordomo: inMay.checked,
        pausa: inPausa.checked,
        focusMode: inFocus.checked,
        celebraciones: inCel.checked
      };
    }
    function actualizarVista() {
      var q = leer();
      memo.textContent = q.enabled && q.ritmo !== 'detallado' ? memoriaTurno(q) : '';
      if (!q.enabled) {
        preview.textContent = 'Saludo estándar mientras la personalización esté apagada.';
        return;
      }
      var region = FRASES[q.region] ? q.region : 'colombia';
      var tabla = FRASES[region][q.tratamiento === 'usted' ? 'usted' : 'tu'];
      var nombre = q.nombre || 'Kenny';
      preview.textContent = tabla[momento(new Date().getHours())].replace('{n}', nombre)
        + (q.ritmo === 'detallado' ? ' ' + (memoriaTurno(q) || 'Aquí tienes el detalle del día.') : '');
    }
    [inNombre, inTrato, inRegion, inRitmo, inOn, inMay, inPausa].forEach(function (el) {
      el.addEventListener('input', actualizarVista);
      el.addEventListener('change', actualizarVista);
    });

    var acciones = doc.createElement('div');
    acciones.className = 'crozzo-companion-actions';
    var btnCancel = doc.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn btn-outline';
    btnCancel.textContent = 'Cancelar';
    var btnSave = doc.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'btn btn-primary';
    btnSave.textContent = 'Guardar';
    acciones.appendChild(btnCancel);
    acciones.appendChild(btnSave);
    card.appendChild(acciones);

    function cerrar() {
      doc.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') cerrar(); }
    doc.addEventListener('keydown', onKey);

    btnCancel.addEventListener('click', cerrar);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
    btnSave.addEventListener('click', function () {
      save(Object.assign({}, leer(), { onboardingDone: true }));
      applyFocusMode();
      refrescarSaludo();
      renderMayordomo();
      renderBienvenida();
      cerrar();
      if (typeof global.showToast === 'function') global.showToast('Listo, quedó guardado', 'success');
    });

    overlay.appendChild(card);
    doc.body.appendChild(overlay);
    actualizarVista();
    inNombre.focus();
  }

  function paginaActual() {
    return typeof currentPage !== 'undefined' ? currentPage : null;
  }

  function avisar(msg, tipo) {
    if (typeof global.showToast === 'function') global.showToast(msg, tipo);
  }

  function cierresLimpiosSeguidos(u) {
    var cfg = global.config;
    if (!cfg || typeof cfg.get !== 'function' || !u) return 0;
    var list = cfg.get('cajaDeclaracionesTurno');
    if (!Array.isArray(list)) return 0;
    var mios = list.filter(function (x) { return x && String(x.userId) === String(u.id); });
    var n = 0;
    for (var i = 0; i < mios.length; i++) {
      if (Math.abs(Number(mios[i].diff) || 0) < 1) n++;
      else break;
    }
    return n;
  }

  function revisarLogros() {
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return;
    var n = cierresLimpiosSeguidos(u);
    var alcanzado = HITOS.filter(function (h) { return n >= h; }).pop();
    if (!alcanzado) return;
    var clave = 'crozzo_companion_logro_' + u.id;
    var previo = 0;
    try { previo = Number(global.localStorage.getItem(clave)) || 0; } catch (e) { previo = 0; }
    if (alcanzado <= previo) return;
    try { global.localStorage.setItem(clave, String(alcanzado)); } catch (e) { /* sin almacenamiento */ }
    var usted = load().tratamiento === 'usted';
    avisar((usted ? 'Lleva ' : 'Llevas ') + alcanzado + ' cierres seguidos sin diferencias. Excelente trabajo.', 'success');
    celebrar();
  }

  function inicioSesion(u) {
    var raw = null;
    try { raw = global.sessionStorage.getItem(CLAVE_INICIO); } catch (e) { return 0; }
    if (!u) {
      try { global.sessionStorage.removeItem(CLAVE_INICIO); } catch (e) { /* sin almacenamiento */ }
      return 0;
    }
    var previo = null;
    try { previo = raw ? JSON.parse(raw) : null; } catch (e) { previo = null; }
    if (!previo || String(previo.uid) !== String(u.id)) {
      var nuevo = { uid: String(u.id), at: Date.now() };
      try { global.sessionStorage.setItem(CLAVE_INICIO, JSON.stringify(nuevo)); } catch (e) { /* sin almacenamiento */ }
      return nuevo.at;
    }
    return Number(previo.at) || 0;
  }

  function revisarPausa() {
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    var inicio = inicioSesion(u);
    var p = load();
    if (!inicio || !p.enabled || p.pausa === false) return;
    var ahora = Date.now();
    if (ahora - inicio < PAUSA_TRAS_MS) return;
    var ultima = Number(global.sessionStorage.getItem(CLAVE_ULT_PAUSA)) || 0;
    if (ahora - ultima < PAUSA_CADA_MS) return;
    global.sessionStorage.setItem(CLAVE_ULT_PAUSA, String(ahora));
    var usted = p.tratamiento === 'usted';
    avisar(usted
      ? 'Lleva más de tres horas seguidas. Tómese un minuto; el sistema queda aquí.'
      : 'Llevas más de tres horas seguidas. Tómate un minuto; el sistema queda aquí.', 'info');
  }

  function iniciarAcompanamiento() {
    global.setTimeout(function () { revisarLogros(); revisarPausa(); }, 3000);
    global.setInterval(function () { revisarLogros(); revisarPausa(); }, REVISION_MS);
  }

  var ACOMPANAMIENTO = [
    { patron: /impres|imprim/i, tu: 'Tranquilo: la venta no se pierde. Revisa la impresora y vuelve a intentar.', usted: 'Con calma: la venta no se pierde. Revise la impresora y vuelva a intentar.' },
    { patron: /conex|internet|supabase|red\b|sin conexi/i, tu: 'Tranquilo: la caja sigue operando en modo local.', usted: 'Con calma: la caja sigue operando en modo local.' },
    { patron: /cobr|pago|cobro/i, tu: 'Tranquilo: revisa el cobro antes de cerrar la cuenta.', usted: 'Con calma: revise el cobro antes de cerrar la cuenta.' }
  ];

  function acompanarError(msg) {
    var p = load();
    if (!p.enabled || typeof msg !== 'string') return msg;
    for (var i = 0; i < ACOMPANAMIENTO.length; i++) {
      var a = ACOMPANAMIENTO[i];
      if (a.patron.test(msg)) {
        var sep = /[.!?:]$/.test(msg.trim()) ? ' ' : '. ';
        return msg.trim() + sep + (p.tratamiento === 'usted' ? a.usted : a.tu);
      }
    }
    return msg;
  }

  function queSigue() {
    var p = load();
    var usted = p.tratamiento === 'usted';
    avisar(usted
      ? 'Siga este orden: 1) Verificar conexión. 2) Verificar impresoras. 3) Verificar base de datos. Si nada responde, ejecute la auto-reparación.'
      : 'Sigue este orden: 1) Verificar conexión. 2) Verificar impresoras. 3) Verificar base de datos. Si nada responde, ejecuta la auto-reparación.', 'info');
  }

  function navDisponible(page) {
    return !!global.document.querySelector('.nav-item[data-page="' + page + '"]');
  }

  function declaracionHoy(u) {
    var cfg = global.config;
    if (!cfg || typeof cfg.get !== 'function' || !u) return false;
    var list = cfg.get('cajaDeclaracionesTurno');
    if (!Array.isArray(list)) return false;
    var hoy = new Date().toDateString();
    return list.some(function (x) {
      return x && String(x.userId) === String(u.id) && new Date(x.at).toDateString() === hoy;
    });
  }

  function sugerencias(p) {
    var out = [];
    var actual = paginaActual();
    var ultimaVenta = null;
    try { ultimaVenta = global.localStorage.getItem('crozzo_last_sales_page'); } catch (e) { ultimaVenta = null; }
    if ((ultimaVenta === 'cajero' || ultimaVenta === 'venta-comercial') && ultimaVenta !== actual && navDisponible(ultimaVenta)) {
      out.push({
        page: ultimaVenta,
        label: ultimaVenta === 'cajero' ? 'Volver a caja' : 'Volver a venta comercial',
        hint: 'Donde dejaste la venta'
      });
    }
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (u && new Date().getHours() >= HORA_CIERRE && !declaracionHoy(u) && actual !== 'cierre-caja' && navDisponible('cierre-caja')) {
      out.push({
        page: 'cierre-caja',
        label: 'Cierre de caja',
        hint: 'Aún no hay declaración de efectivo hoy'
      });
    }
    return out.slice(0, 3);
  }

  function renderMayordomo() {
    var doc = global.document;
    var host = doc.getElementById('mainContent');
    if (!host) return;
    var prev = doc.getElementById('crozzoMayordomo');
    var p = load();
    var usted = p.tratamiento === 'usted';
    var esInicio = p.enabled && p.mayordomo !== false;
    var items = esInicio ? sugerencias(p) : [];
    if (!items.length) {
      var tip = TIPS[paginaActual()] || TIPS.default;
      var firmaTip = 'tip|' + paginaActual();
      if (prev && prev.dataset.firma === firmaTip) return;
      if (prev) prev.remove();
      if (!p.enabled || p.mayordomo === false) return;
      var boxTip = doc.createElement('section');
      boxTip.id = 'crozzoMayordomo';
      boxTip.className = 'crozzo-mayordomo crozzo-mayordomo--tip';
      boxTip.dataset.firma = firmaTip;
      var headTip = doc.createElement('div');
      headTip.className = 'crozzo-mayordomo__head';
      var tTip = doc.createElement('h3');
      tTip.textContent = usted ? 'Un consejo' : 'Un consejo';
      headTip.appendChild(tTip);
      var closeTip = doc.createElement('button');
      closeTip.type = 'button';
      closeTip.className = 'crozzo-mayordomo__close';
      closeTip.textContent = 'Ocultar';
      closeTip.addEventListener('click', function () { boxTip.remove(); });
      headTip.appendChild(closeTip);
      boxTip.appendChild(headTip);
      var pTip = doc.createElement('p');
      pTip.className = 'crozzo-mayordomo__tip';
      pTip.textContent = tip;
      boxTip.appendChild(pTip);
      host.insertBefore(boxTip, host.firstChild);
      return;
    }
    var firma = p.tratamiento + '|' + items.map(function (s) { return s.page; }).join(',');
    if (prev && prev.dataset.firma === firma) return;
    if (prev) prev.remove();

    var usted = p.tratamiento === 'usted';
    var box = doc.createElement('section');
    box.id = 'crozzoMayordomo';
    box.className = 'crozzo-mayordomo';
    box.dataset.firma = firma;

    var head = doc.createElement('div');
    head.className = 'crozzo-mayordomo__head';
    var titulo = doc.createElement('h3');
    titulo.textContent = usted ? 'Le sugiero continuar' : 'Te sugiero continuar';
    head.appendChild(titulo);
    var ocultar = doc.createElement('button');
    ocultar.type = 'button';
    ocultar.className = 'crozzo-mayordomo__close';
    ocultar.setAttribute('aria-label', 'Ocultar sugerencias');
    ocultar.textContent = 'Ocultar';
    ocultar.addEventListener('click', function () {
      save(Object.assign({}, load(), { mayordomo: false }));
      box.remove();
    });
    head.appendChild(ocultar);
    box.appendChild(head);

    var lista = doc.createElement('div');
    lista.className = 'crozzo-mayordomo__list';
    items.forEach(function (s) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'crozzo-mayordomo__item';
      var l = doc.createElement('strong');
      l.textContent = s.label;
      var h = doc.createElement('span');
      h.textContent = s.hint;
      b.appendChild(l);
      b.appendChild(h);
      b.addEventListener('click', function () {
        if (typeof global.navigateTo === 'function') global.navigateTo(s.page);
      });
      lista.appendChild(b);
    });
    box.appendChild(lista);

    host.insertBefore(box, host.firstChild);
  }

  function renderBienvenida() {
    var doc = global.document;
    var host = doc.getElementById('mainContent');
    if (!host) return;
    var prev = doc.getElementById('crozzoBienvenida');
    var p = load();
    if (!p.enabled || paginaActual() !== PAGINA_INICIO) {
      if (prev) prev.remove();
      return;
    }
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    var firma = (u && u.id ? u.id : '') + '|' + (p.nombre || '') + '|' + (p.tratamiento || '') + '|' + (p.ritmo || '');
    if (prev && prev.dataset.firma === firma) return;
    if (prev) prev.remove();
    var usted = p.tratamiento === 'usted';
    var box = doc.createElement('section');
    box.id = 'crozzoBienvenida';
    box.className = 'crozzo-bienvenida';
    box.dataset.firma = firma;
    var h = doc.createElement('h2');
    h.textContent = greeting((u && u.nombre) ? String(u.nombre).trim().split(/\s+/)[0] : '') || 'Bienvenido';
    box.appendChild(h);
    var sub = doc.createElement('p');
    sub.className = 'crozzo-bienvenida__sub';
    var memo = memoriaTurno(p);
    sub.textContent = memo || (usted ? 'Su espacio de trabajo está listo.' : 'Tu espacio de trabajo está listo.');
    box.appendChild(sub);
    var meta = doc.createElement('div');
    meta.className = 'crozzo-bienvenida__meta';
    if (u && u.rol && typeof global.crozzoPremiumTierMeta === 'function') {
      var m = global.crozzoPremiumTierMeta(u.rol);
      var badge = doc.createElement('span');
      badge.className = 'crozzo-bienvenida__badge';
      badge.textContent = m.badge;
      meta.appendChild(badge);
      var role = doc.createElement('span');
      role.className = 'crozzo-bienvenida__role';
      role.textContent = m.roleLine;
      meta.appendChild(role);
    }
    box.appendChild(meta);
    var actions = doc.createElement('div');
    actions.className = 'crozzo-bienvenida__actions';
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline';
    btn.textContent = usted ? 'Personalizar asistente' : 'Personalizar asistente';
    btn.addEventListener('click', function () { openPrefs(); });
    actions.appendChild(btn);
    box.appendChild(actions);
    host.insertBefore(box, host.firstChild);
  }

  function iniciarMayordomo() {
    var host = global.document.getElementById('mainContent');
    if (!host || typeof global.MutationObserver !== 'function') return;
    new global.MutationObserver(function () { renderMayordomo(); renderBienvenida(); }).observe(host, { childList: true });
    renderMayordomo();
    renderBienvenida();
  }

  function applyFocusMode() {
    var p = load();
    if (global.document && global.document.body) {
      global.document.body.classList.toggle('crozzo-focus-mode', !!p.enabled && p.focusMode === true);
    }
  }
  function celebrar() {
    var p = load();
    if (!p.enabled || p.celebraciones === false) return;
    if (!global.document || !global.document.body) return;
    global.document.body.classList.add('crozzo-celebrate');
    global.setTimeout(function () { global.document.body.classList.remove('crozzo-celebrate'); }, 1800);
  }
  function iniciarTodo() {
    applyFocusMode();
    iniciarMayordomo();
    iniciarAcompanamiento();
    var p = load();
    if (p.enabled && !p.onboardingDone && !String(p.nombre || '').trim()) {
      global.setTimeout(function () { openPrefs(); }, 600);
    }
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', iniciarTodo);
    } else {
      iniciarTodo();
    }
  }

  global.CrozzoCompanion = {
    load: load,
    save: save,
    greeting: greeting,
    memoriaTooltip: memoriaTooltip,
    acompanarError: acompanarError,
    queSigue: queSigue,
    refrescarSaludo: refrescarSaludo,
    openPrefs: openPrefs,
    renderMayordomo: renderMayordomo,
    renderBienvenida: renderBienvenida,
    applyFocusMode: applyFocusMode,
    celebrar: celebrar,
    revisarLogros: revisarLogros,
    revisarPausa: revisarPausa
  };
})(typeof window !== 'undefined' ? window : globalThis);
