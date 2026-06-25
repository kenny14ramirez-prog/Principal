/**
 * Crozzo POS — CRM Intel: analítica de clientes, cumpleaños y recordatorios WhatsApp.
 */
(function (global) {
  'use strict';

  var DEFAULT_MSG =
    '¡Hola {nombre}! Te invitamos a compartir este día tan especial con nosotros. Reclama un postre de cortesía en tu próxima visita 🎂';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cfg() {
    return typeof global.config !== 'undefined' && global.config.get ? global.config : null;
  }

  function getClients() {
    if (typeof global.crozzoCrmGetClients === 'function') return global.crozzoCrmGetClients();
    var c = cfg();
    var list = c && c.get ? c.get('clientesCrm') : [];
    return Array.isArray(list) ? list : [];
  }

  function clientById(id) {
    if (typeof global.crozzoCrmClientById === 'function') return global.crozzoCrmClientById(id);
    return getClients().find(function (x) {
      return x.id === id;
    });
  }

  function nitsEq(a, b) {
    if (typeof global.crozzoCrmNitsEquivalent === 'function') return global.crozzoCrmNitsEquivalent(a, b);
    return String(a || '').replace(/\D/g, '') === String(b || '').replace(/\D/g, '');
  }

  function defaultSettings() {
    return {
      cumpleActivo: true,
      cumpleDiasAntes: 3,
      cumplePlantilla: DEFAULT_MSG,
    };
  }

  function loadSettings() {
    var c = cfg();
    var base = defaultSettings();
    if (!c || !c.get) return base;
    var stored = c.get('crmIntel');
    if (stored && typeof stored === 'object') {
      Object.keys(base).forEach(function (k) {
        if (stored[k] !== undefined) base[k] = stored[k];
      });
    }
    base.cumpleDiasAntes = Math.max(0, Math.min(30, Number(base.cumpleDiasAntes) || 3));
    base.cumpleActivo = base.cumpleActivo !== false;
    if (!String(base.cumplePlantilla || '').trim()) base.cumplePlantilla = DEFAULT_MSG;
    return base;
  }

  function saveSettings(patch) {
    var c = cfg();
    if (!c || !c.get || !c.set || !c.save) return;
    var next = loadSettings();
    patch = patch || {};
    Object.keys(patch).forEach(function (k) {
      next[k] = patch[k];
    });
    c.set('crmIntel', next);
    c.save();
  }

  function applyDefaultClientFields(c) {
    if (!c) return c;
    if (c.fechaNacimiento === undefined) c.fechaNacimiento = '';
    if (c.cumpleRecordatorio === undefined) c.cumpleRecordatorio = true;
    if (c.cumpleDiasAntes === undefined) c.cumpleDiasAntes = null;
    if (c.cumpleUltimoAviso === undefined) c.cumpleUltimoAviso = '';
    return c;
  }

  function parseBirthday(fecha) {
    fecha = String(fecha || '').trim();
    if (!fecha) return null;
    var m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
    m = fecha.match(/^(\d{2})-(\d{2})$/);
    if (m) return { y: null, mo: Number(m[1]), d: Number(m[2]) };
    m = fecha.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
    if (m) return { y: m[3] ? Number(m[3]) : null, mo: Number(m[1]), d: Number(m[2]) };
    return null;
  }

  function nextBirthdayDate(fecha, fromDate) {
    var p = parseBirthday(fecha);
    if (!p || !p.mo || !p.d) return null;
    fromDate = fromDate || new Date();
    var y = fromDate.getFullYear();
    var cand = new Date(y, p.mo - 1, p.d);
    if (cand < new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) {
      cand = new Date(y + 1, p.mo - 1, p.d);
    }
    return cand;
  }

  function daysUntilBirthday(fecha, fromDate) {
    var next = nextBirthdayDate(fecha, fromDate);
    if (!next) return null;
    fromDate = fromDate || new Date();
    var a = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    return Math.round((next - a) / 86400000);
  }

  function waDigits(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10 && d.charAt(0) === '3') return '57' + d;
    if (d.length === 12 && d.indexOf('57') === 0) return d;
    return d;
  }

  function formatMoney(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO');
  }

  function getFacturasForClient(c) {
    var c0 = cfg();
    if (!c0 || !c0.getFacturas || !c) return [];
    var nit = c.nit || '';
    if (!nit || nit === '222222222-2') return [];
    return (c0.getFacturas() || []).filter(function (f) {
      return nitsEq(f.compradorNit, nit);
    });
  }

  function favoriteProducts(c, limit) {
    limit = limit || 5;
    var counts = {};
    var hist = c.historial || [];
    hist.forEach(function (h) {
      (h.items || []).forEach(function (it) {
        var name = String(it.n || it.nombre || '').trim();
        if (!name) return;
        var q = Number(it.q || it.cantidad || 1);
        counts[name] = (counts[name] || 0) + q;
      });
    });
    if (Object.keys(counts).length < 2) {
      getFacturasForClient(c).slice(0, 40).forEach(function (f) {
        (f.items || []).forEach(function (it) {
          var name = String(it.nombreVenta || it.nombre || '').trim();
          if (!name) return;
          var q = Number(it.cantidad || 1);
          counts[name] = (counts[name] || 0) + q;
        });
      });
    }
    return Object.keys(counts)
      .map(function (k) {
        return { name: k, qty: counts[k] };
      })
      .sort(function (a, b) {
        return b.qty - a.qty;
      })
      .slice(0, limit);
  }

  function computeIntel(c) {
    applyDefaultClientFields(c);
    var hist = Array.isArray(c.historial) ? c.historial : [];
    var visits = hist.length;
    var total = Number(c.totalCompras || 0);
    if (!total && visits) {
      total = hist.reduce(function (s, h) {
        return s + Number(h.total || 0);
      }, 0);
    }
    var avg = visits > 0 ? total / visits : 0;
    var dates = hist
      .map(function (h) {
        return h.fecha ? new Date(h.fecha) : null;
      })
      .filter(function (d) {
        return d && !isNaN(d.getTime());
      })
      .sort(function (a, b) {
        return a - b;
      });
    var first = dates[0] || null;
    var last = dates.length ? dates[dates.length - 1] : c.ultimaCompra ? new Date(c.ultimaCompra) : null;
    var daysSinceLast = last ? Math.max(0, Math.round((Date.now() - last.getTime()) / 86400000)) : null;
    var spanDays =
      first && last && visits > 1 ? Math.max(1, Math.round((last - first) / 86400000)) : null;
    var visitsPerMonth = spanDays && visits > 1 ? (visits / (spanDays / 30)).toFixed(1) : visits > 0 ? '—' : '0';
    var visitRatio = 0;
    if (spanDays && visits > 1) {
      visitRatio = Math.min(100, Math.round((visits / (spanDays / 7)) * 12));
    } else if (visits >= 3) visitRatio = Math.min(100, visits * 8);
    else if (visits === 2) visitRatio = 35;
    else if (visits === 1) visitRatio = 15;
    var fav = favoriteProducts(c, 4);
    var bDays = c.fechaNacimiento ? daysUntilBirthday(c.fechaNacimiento) : null;
    return {
      visits: visits,
      total: total,
      avg: avg,
      daysSinceLast: daysSinceLast,
      visitsPerMonth: visitsPerMonth,
      visitRatio: visitRatio,
      favorites: fav,
      birthdayDays: bDays,
      lastVisitLabel: daysSinceLast == null ? 'Sin compras' : daysSinceLast === 0 ? 'Hoy' : 'Hace ' + daysSinceLast + ' d',
    };
  }

  function aggregateHubStats() {
    var clients = getClients();
    var totalClientes = clients.length;
    var conTel = clients.filter(function (c) {
      return waDigits(c.telefono);
    }).length;
    var activos30 = clients.filter(function (c) {
      var intel = computeIntel(c);
      return intel.daysSinceLast != null && intel.daysSinceLast <= 30;
    }).length;
    var cumplesProx = listBirthdayReminders().length;
    var valorCartera = clients.reduce(function (s, c) {
      return s + Number(c.totalCompras || 0);
    }, 0);
    return { totalClientes: totalClientes, conTel: conTel, activos30: activos30, cumplesProx: cumplesProx, valorCartera: valorCartera };
  }

  function listBirthdayReminders(opts) {
    opts = opts || {};
    var settings = loadSettings();
    if (!settings.cumpleActivo && !opts.ignoreMaster) return [];
    var windowDays = opts.diasAntes != null ? opts.diasAntes : settings.cumpleDiasAntes;
    var out = [];
    var year = new Date().getFullYear();
    getClients().forEach(function (c) {
      applyDefaultClientFields(c);
      if (!c.fechaNacimiento) return;
      if (c.cumpleRecordatorio === false) return;
      if (!waDigits(c.telefono) && !opts.includeSinTel) return;
      var days = daysUntilBirthday(c.fechaNacimiento);
      var clientWindow =
        c.cumpleDiasAntes != null && c.cumpleDiasAntes !== '' ? Math.max(0, Math.min(30, Number(c.cumpleDiasAntes) || 0)) : windowDays;
      if (days == null || days > clientWindow) return;
      if (String(c.cumpleUltimoAviso || '') === String(year) + '-' + days) return;
      out.push({
        client: c,
        days: days,
        intel: computeIntel(c),
      });
    });
    out.sort(function (a, b) {
      return a.days - b.days;
    });
    return out;
  }

  function formatMessage(template, c) {
    var first = String(c.nombre || 'Cliente')
      .trim()
      .split(/\s+/)[0];
    return String(template || DEFAULT_MSG).replace(/\{nombre\}/g, first || 'Cliente');
  }

  function openWhatsApp(client, customText) {
    var tel = waDigits(client && client.telefono);
    if (!tel) {
      if (typeof global.showToast === 'function') global.showToast('Este cliente no tiene teléfono / WhatsApp', 'warning');
      return false;
    }
    var text = customText || formatMessage(loadSettings().cumplePlantilla, client);
    if (typeof global.crozzoWhatsAppDockOpenShare === 'function') {
      global.crozzoWhatsAppDockOpenShare(text, tel);
      return true;
    }
    var url =
      'https://wa.me/' +
      tel +
      '?text=' +
      encodeURIComponent(text);
    try {
      window.open(url, '_blank', 'noopener');
      return true;
    } catch (_) {
      if (typeof global.showToast === 'function') global.showToast('No se pudo abrir WhatsApp', 'warning');
      return false;
    }
  }

  function markReminderSent(clientId) {
    var c = clientById(clientId);
    if (!c) return;
    var days = c.fechaNacimiento ? daysUntilBirthday(c.fechaNacimiento) : 0;
    c.cumpleUltimoAviso = new Date().getFullYear() + '-' + days;
    if (cfg() && cfg().save) cfg().save();
  }

  function renderSettingsPanel() {
    var s = loadSettings();
    return (
      '<details class="crozzo-crm-intel-settings card" open>' +
      '<summary class="crozzo-crm-intel-settings__sum"><span aria-hidden="true">🎂</span> Recordatorios de cumpleaños · WhatsApp</summary>' +
      '<div class="crozzo-crm-intel-settings__body">' +
      '<label class="crozzo-crm-intel-check">' +
      '<input type="checkbox" id="crmIntelCumpleActivo"' +
      (s.cumpleActivo ? ' checked' : '') +
      '> Activar recordatorios de cumpleaños</label>' +
      '<div class="form-group"><label class="form-label">Avisar con anticipación (días)</label>' +
      '<input type="number" class="form-input" id="crmIntelCumpleDias" min="0" max="30" value="' +
      esc(s.cumpleDiasAntes) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Mensaje predefinido · use <code>{nombre}</code></label>' +
      '<textarea class="form-input" id="crmIntelCumpleMsg" rows="3">' +
      esc(s.cumplePlantilla) +
      '</textarea></div>' +
      '<p class="form-hint">Si activa recordatorios, todo el equipo verá un aviso al entrar (sin animación). Los clientes con teléfono y cumpleaños aparecen aquí para enviar WhatsApp con un clic.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crmIntelSaveSettings">Guardar preferencias</button></div></details>'
    );
  }

  function renderBirthdayBanner() {
    var list = listBirthdayReminders();
    if (!list.length) return '';
    var chips = list
      .slice(0, 6)
      .map(function (row) {
        var c = row.client;
        var lbl = row.days === 0 ? '¡Hoy!' : 'En ' + row.days + ' d';
        return (
          '<div class="crozzo-crm-intel-bday-chip">' +
          '<div><strong>' +
          esc(c.nombre || 'Cliente') +
          '</strong><span>' +
          lbl +
          '</span></div>' +
          '<button type="button" class="btn btn-primary btn-sm" data-crm-wa-id="' +
          esc(c.id) +
          '"><i data-lucide="message-circle"></i> WhatsApp</button></div>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-crm-intel-bday-banner">' +
      '<div class="crozzo-crm-intel-bday-banner__head"><i data-lucide="sparkles"></i><strong>Cumpleaños próximos</strong><span>' +
      list.length +
      ' cliente(s)</span></div><div class="crozzo-crm-intel-bday-banner__list">' +
      chips +
      (list.length > 6 ? '<p class="form-hint">+' + (list.length - 6) + ' más en la tabla</p>' : '') +
      '</div></div>'
    );
  }

  function renderHubKpis() {
    var st = aggregateHubStats();
    return (
      '<div class="crozzo-crm-intel-kpis">' +
      '<div class="crozzo-crm-intel-kpi"><span>Clientes</span><strong>' +
      st.totalClientes +
      '</strong></div>' +
      '<div class="crozzo-crm-intel-kpi"><span>Activos 30 d</span><strong>' +
      st.activos30 +
      '</strong></div>' +
      '<div class="crozzo-crm-intel-kpi"><span>Con WhatsApp</span><strong>' +
      st.conTel +
      '</strong></div>' +
      '<div class="crozzo-crm-intel-kpi"><span>Valor comprado</span><strong>' +
      formatMoney(st.valorCartera) +
      '</strong></div>' +
      '<div class="crozzo-crm-intel-kpi crozzo-crm-intel-kpi--accent"><span>Cumples cerca</span><strong>' +
      st.cumplesProx +
      '</strong></div></div>'
    );
  }

  function rowIntelCells(c) {
    var intel = computeIntel(c);
    var bday =
      intel.birthdayDays != null
        ? intel.birthdayDays === 0
          ? '🎂 Hoy'
          : intel.birthdayDays <= 7
            ? '🎂 ' + intel.birthdayDays + 'd'
            : '—'
        : '—';
    var fav =
      intel.favorites.length > 0
        ? esc(intel.favorites[0].name.slice(0, 22)) + (intel.favorites[0].name.length > 22 ? '…' : '')
        : '—';
    return (
      '<td class="crozzo-crm-intel-td"><span class="crozzo-crm-intel-ratio" title="Frecuencia de visita">' +
      intel.visitRatio +
      '</span><small>' +
      intel.visits +
      ' visitas</small></td>' +
      '<td class="crozzo-crm-intel-td"><strong>' +
      formatMoney(intel.total) +
      '</strong><small>Ø ' +
      formatMoney(intel.avg) +
      '</small></td>' +
      '<td class="crozzo-crm-intel-td" title="' +
      esc(intel.favorites.map(function (f) {
        return f.name;
      }).join(', ')) +
      '">' +
      fav +
      '</td>' +
      '<td class="crozzo-crm-intel-td">' +
      bday +
      '</td>'
    );
  }

  function renderPage() {
    injectStyles();
    var rows = renderTableRows();
    return (
      '<div class="crozzo-crm-intel-page">' +
      '<header class="crozzo-crm-intel-hero">' +
      '<div class="crozzo-crm-intel-hero__glow" aria-hidden="true"></div>' +
      '<div class="crozzo-crm-intel-hero__main">' +
      '<p class="crozzo-crm-intel-hero__eyebrow">CRM · Facturación electrónica</p>' +
      '<h2 class="crozzo-crm-intel-hero__title">Clientes inteligentes</h2>' +
      '<p class="crozzo-crm-intel-hero__sub">Visitas, valor comprado, favoritos y cumpleaños con recordatorio WhatsApp.</p></div></header>' +
      renderHubKpis() +
      renderBirthdayBanner() +
      renderSettingsPanel() +
      '<div class="card crozzo-crm-intel-table-card">' +
      '<div class="card-header crozzo-crm-intel-table-card__head">' +
      '<span class="card-title">Directorio de clientes</span>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="crozzoCajaClientesOpenNew()">➕ Nuevo cliente</button></div>' +
      '<div class="crozzo-crm-intel-toolbar">' +
      '<input type="text" class="form-input" id="crozzoClientesDirSearch" placeholder="🔎 NIT, nombre, teléfono, correo…" value="' +
      esc(global.__crozzoClienteDirSearch || '') +
      '"></div>' +
      '<div class="crozzo-rep-table-wrap">' +
      '<table class="crozzo-crm-intel-table"><thead><tr>' +
      '<th>Cliente</th><th>Contacto</th><th>Ratio / visitas</th><th>Valor</th><th>Favorito</th><th>Cumple</th><th></th>' +
      '</tr></thead><tbody id="crozzoClientesDirTbody">' +
      rows +
      '</tbody></table></div>' +
      '<p class="form-hint">Datos locales · sincroniza con ventas al facturar. Ratio = frecuencia relativa de visita (0–100).</p></div>' +
      '<div id="crozzoCrmRegMount"></div></div>'
    );
  }

  function renderTableRows() {
    var q = String(global.__crozzoClienteDirSearch || '')
      .toLowerCase()
      .trim();
    var list = getClients();
    if (q) {
      list = list.filter(function (c) {
        return [c.nit, c.nombre, c.telefono, c.email, (c.emails || []).join(' '), c.ciudad]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
    }
    list.sort(function (a, b) {
      return Number(b.totalCompras || 0) - Number(a.totalCompras || 0);
    });
    if (!list.length) {
      return '<tr><td colspan="7" class="crozzo-crm-intel-empty">Sin coincidencias. Cree un cliente o borre el filtro.</td></tr>';
    }
    return list
      .map(function (c) {
        applyDefaultClientFields(c);
        var id = esc(c.id);
        var intel = computeIntel(c);
        return (
          '<tr class="crozzo-crm-intel-row" data-client-id="' +
          id +
          '">' +
          '<td><strong>' +
          esc(c.nombre || '') +
          '</strong><br><code class="crozzo-crm-intel-nit">' +
          esc(c.nit || '—') +
          '</code><br><small>' +
          esc(intel.lastVisitLabel) +
          '</small></td>' +
          '<td><span>' +
          esc(c.telefono || '—') +
          '</span><br><small>' +
          esc(typeof global.crozzoCrmClientEmailsShort === 'function' ? global.crozzoCrmClientEmailsShort(c) : c.email || '—') +
          '</small></td>' +
          rowIntelCells(c) +
          '<td class="crozzo-crm-intel-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoCrmIntel.openDetail(\'' +
          id +
          '\')" title="Ver ficha">Ficha</button> ' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoCajaClientesOpenEdit(\'' +
          id +
          '\')">Editar</button></td></tr>'
        );
      })
      .join('');
  }

  function renderEditFields(c) {
    applyDefaultClientFields(c || {});
    c = c || {};
    var settings = loadSettings();
    var diasCli = c.cumpleDiasAntes != null && c.cumpleDiasAntes !== '' ? c.cumpleDiasAntes : settings.cumpleDiasAntes;
    return (
      '<div class="crozzo-crm-intel-edit card" style="margin-top:12px;padding:12px;border-color:rgba(201,169,98,.25);">' +
      '<h4 style="margin:0 0 10px;font-size:.9rem;">🎂 Cumpleaños y recordatorio</h4>' +
      '<div class="form-group"><label class="form-label">Fecha de cumpleaños</label>' +
      '<input type="date" class="form-input" id="cliDirCumple" value="' +
      esc(c.fechaNacimiento || '') +
      '"></div>' +
      '<label class="crozzo-crm-intel-check">' +
      '<input type="checkbox" id="cliDirCumpleRec"' +
      (c.cumpleRecordatorio !== false ? ' checked' : '') +
      '> Recordarme antes del cumpleaños (requiere teléfono / WhatsApp)</label>' +
      '<div class="form-group"><label class="form-label">Días de anticipación (vacío = usar global)</label>' +
      '<input type="number" class="form-input" id="cliDirCumpleDias" min="0" max="30" placeholder="' +
      esc(settings.cumpleDiasAntes) +
      '" value="' +
      (c.cumpleDiasAntes != null && c.cumpleDiasAntes !== '' ? esc(c.cumpleDiasAntes) : '') +
      '"></div></div>'
    );
  }

  function collectEditFields(c) {
    if (!c) return;
    applyDefaultClientFields(c);
    var inp = document.getElementById('cliDirCumple');
    var rec = document.getElementById('cliDirCumpleRec');
    var dias = document.getElementById('cliDirCumpleDias');
    c.fechaNacimiento = inp ? String(inp.value || '').trim() : c.fechaNacimiento;
    c.cumpleRecordatorio = rec ? !!rec.checked : c.cumpleRecordatorio;
    if (dias && String(dias.value || '').trim() !== '') {
      c.cumpleDiasAntes = Math.max(0, Math.min(30, Number(dias.value) || 0));
    } else {
      c.cumpleDiasAntes = null;
    }
  }

  function renderDetailModal(c) {
    var intel = computeIntel(c);
    var favHtml =
      intel.favorites.length > 0
        ? '<ul class="crozzo-crm-intel-fav-list">' +
          intel.favorites
            .map(function (f) {
              return '<li><span>' + esc(f.name) + '</span><strong>×' + f.qty + '</strong></li>';
            })
            .join('') +
          '</ul>'
        : '<p class="form-hint">Aún sin historial de productos — se completa al facturar.</p>';
    var histHtml = (c.historial || [])
      .slice(0, 8)
      .map(function (h) {
        return (
          '<li><span>' +
          esc(h.consecutivo || h.uuid || 'Venta') +
          '</span><span>' +
          formatMoney(h.total) +
          '</span><small>' +
          esc(h.fecha ? new Date(h.fecha).toLocaleDateString('es-CO') : '') +
          '</small></li>'
        );
      })
      .join('');
    var bdayLine = c.fechaNacimiento
      ? intel.birthdayDays != null
        ? intel.birthdayDays === 0
          ? '¡Cumple hoy!'
          : 'Cumple en ' + intel.birthdayDays + ' días'
        : 'Fecha registrada'
      : 'Sin fecha';
    return (
      '<div class="crozzo-crm-intel-detail">' +
      '<div class="crozzo-crm-intel-detail__head"><div><h3 style="margin:0;">' +
      esc(c.nombre) +
      '</h3><p class="form-hint">' +
      esc(c.nit || '') +
      ' · ' +
      esc(c.telefono || 'Sin teléfono') +
      '</p></div>' +
      '<div class="crozzo-crm-intel-detail__ratio" title="Ratio de visitas"><span>Ratio</span><strong>' +
      intel.visitRatio +
      '</strong></div></div>' +
      '<div class="crozzo-crm-intel-detail__grid">' +
      '<div><span>Visitas</span><strong>' +
      intel.visits +
      '</strong></div>' +
      '<div><span>Valor total</span><strong>' +
      formatMoney(intel.total) +
      '</strong></div>' +
      '<div><span>Ticket promedio</span><strong>' +
      formatMoney(intel.avg) +
      '</strong></div>' +
      '<div><span>Frecuencia</span><strong>' +
      intel.visitsPerMonth +
      '/mes</strong></div>' +
      '<div><span>Última visita</span><strong>' +
      esc(intel.lastVisitLabel) +
      '</strong></div>' +
      '<div><span>Cumpleaños</span><strong>' +
      esc(bdayLine) +
      '</strong></div></div>' +
      '<h4>Productos favoritos</h4>' +
      favHtml +
      '<h4>Últimas compras</h4><ul class="crozzo-crm-intel-hist-list">' +
      (histHtml || '<li class="form-hint">Sin compras registradas</li>') +
      '</ul>' +
      '<div class="btn-group" style="margin-top:14px;flex-wrap:wrap;">' +
      (waDigits(c.telefono)
        ? '<button type="button" class="btn btn-primary" onclick="CrozzoCrmIntel.sendWhatsAppFromDetail(\'' +
          esc(c.id) +
          '\')"><i data-lucide="message-circle"></i> WhatsApp cumpleaños</button>'
        : '') +
      '<button type="button" class="btn btn-outline" onclick="crozzoCajaClientesOpenEdit(\'' +
      esc(c.id) +
      '\');closeModal();">Editar</button>' +
      '<button type="button" class="btn btn-outline" onclick="closeModal()">Cerrar</button></div></div>'
    );
  }

  function openDetail(clientId) {
    var c = clientById(clientId);
    if (!c || typeof global.showModal !== 'function') return;
    global.showModal('Ficha de cliente', renderDetailModal(c));
    try {
      if (typeof global.lucide !== 'undefined' && global.lucide.createIcons) global.lucide.createIcons();
    } catch (_) {}
  }

  function sendWhatsAppFromDetail(clientId) {
    var c = clientById(clientId);
    if (!c) return;
    if (openWhatsApp(c)) markReminderSent(clientId);
  }

  function bindPage(root) {
    root = root || document.querySelector('.crozzo-crm-intel-page');
    if (!root) return;
    var saveBtn = document.getElementById('crmIntelSaveSettings');
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener('click', function () {
        var act = document.getElementById('crmIntelCumpleActivo');
        var dias = document.getElementById('crmIntelCumpleDias');
        var msg = document.getElementById('crmIntelCumpleMsg');
        saveSettings({
          cumpleActivo: act ? !!act.checked : true,
          cumpleDiasAntes: dias ? Number(dias.value) : 3,
          cumplePlantilla: msg ? msg.value : DEFAULT_MSG,
        });
        if (typeof global.showToast === 'function') global.showToast('Preferencias CRM guardadas', 'success');
        if (typeof global.renderPage === 'function') global.renderPage('caja-clientes');
      });
    }
    root.querySelectorAll('[data-crm-wa-id]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-crm-wa-id');
        var c = clientById(id);
        if (c && openWhatsApp(c)) markReminderSent(id);
      });
    });
    var search = document.getElementById('crozzoClientesDirSearch');
    if (search && !search._crozzoDirBound) {
      search._crozzoDirBound = true;
      search.addEventListener('input', function (e) {
        global.__crozzoClienteDirSearch = e.target.value;
        clearTimeout(global.__crozzoClienteDirSearchT);
        global.__crozzoClienteDirSearchT = setTimeout(function () {
          var tb = document.getElementById('crozzoClientesDirTbody');
          if (tb) tb.innerHTML = renderTableRows();
        }, 150);
      });
    }
  }

  function initPage() {
    injectStyles();
    bindPage();
    if (typeof global.CrozzoCrmRegistroQr !== 'undefined' && global.CrozzoCrmRegistroQr.mountInClientesPage) {
      global.CrozzoCrmRegistroQr.mountInClientesPage();
    }
    maybeSessionReminder();
  }

  function maybeSessionReminder() {
    maybeLoginReminder(false);
  }

  function maybeLoginReminder(force) {
    try {
      var settings = loadSettings();
      if (!settings.cumpleActivo) return;
      var key = 'crozzo_crm_client_cumple_ping_' + new Date().toISOString().slice(0, 10);
      if (!force && sessionStorage.getItem(key)) return;
      var list = listBirthdayReminders();
      if (!list.length) return;
      sessionStorage.setItem(key, '1');
      if (typeof global.showToast === 'function') {
        var names = list
          .slice(0, 3)
          .map(function (row) {
            return String((row.client && row.client.nombre) || 'Cliente')
              .trim()
              .split(/\s+/)[0];
          })
          .join(', ');
        var extra = list.length > 3 ? ' +' + (list.length - 3) + ' más' : '';
        global.showToast(
          '🎂 ' +
            list.length +
            ' cliente(s) con cumple próximo (' +
            settings.cumpleDiasAntes +
            ' d): ' +
            names +
            extra +
            ' — Clientes',
          'info'
        );
      }
    } catch (_) {}
  }

  function enrichHistorialEntry(factura) {
    return (factura.items || []).slice(0, 16).map(function (it) {
      return {
        n: String(it.nombreVenta || it.nombre || '').slice(0, 80),
        q: Number(it.cantidad || 1),
      };
    });
  }

  function getCss() {
    return '';
  }

  function injectStyles() {
    /* Estilos en app/css/CrozzoPosStyles.css — .crozzo-crm-intel-* */
  }

  function isBirthdayToday(fecha, fromDate) {
    return daysUntilBirthday(fecha, fromDate) === 0;
  }

  global.CrozzoCrmIntel = {
    renderPage: renderPage,
    renderTableRows: renderTableRows,
    initPage: initPage,
    renderEditFields: renderEditFields,
    collectEditFields: collectEditFields,
    applyDefaultClientFields: applyDefaultClientFields,
    computeIntel: computeIntel,
    listBirthdayReminders: listBirthdayReminders,
    openDetail: openDetail,
    sendWhatsAppFromDetail: sendWhatsAppFromDetail,
    openWhatsApp: openWhatsApp,
    enrichHistorialEntry: enrichHistorialEntry,
    loadSettings: loadSettings,
    maybeLoginReminder: maybeLoginReminder,
    maybeSessionReminder: maybeSessionReminder,
    injectStyles: injectStyles,
    parseBirthday: parseBirthday,
    daysUntilBirthday: daysUntilBirthday,
    isBirthdayToday: isBirthdayToday,
  };
})(typeof window !== 'undefined' ? window : globalThis);
