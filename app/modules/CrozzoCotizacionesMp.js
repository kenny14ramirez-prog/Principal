/**
 * Crozzo POS — Cotizaciones y comparador de costeo (sistema vs proveedores vs competencia)
 * Compras · negociación · auditoría · exportación Excel/PDF
 */
(function (global) {
  'use strict';
  var LS_WORKSPACE = 'crozzo_cot_workspace_v1';
  var UND_OPTS = ['GR', 'MG', 'KG', 'ML', 'UNI', 'UND', 'TARRO', 'PAQ', 'CAJA', 'MT', 'ROLLO', 'PAR'];
  var DEBOUNCE_MS = 140;
  var ui = {
    q: '',
    mpId: '',
    categoria: '',
    focusMpId: '',
    quickMpId: '',
    quickEditCotId: '',
    exportOpen: false,
    addOpen: false,
    pdfUrl: '',
    pdfName: '',
  };
  var mpIndex = null;
  var searchTimer = null;
  var patchTimer = null;
  function R() {
    return global.CrozzoReservorio;
  }
  function C() {
    return global.CrozzoCatalogoMp;
  }
  function E() {
    return global.CrozzoCostosEngine;
  }
  function M() {
    return global.CrozzoMatrizMp;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /** Texto seguro para PDF (Helvetica / WinAnsi; Unicode rompe el texto en Tauri). */
  function pdfAscii(s) {
    return String(s == null ? '' : s)
      .replace(/\u00A0/g, ' ')
      .replace(/\u202F/g, ' ')
      .replace(/\u2009/g, ' ')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u00B7/g, '-')
      .replace(/\u0394/g, 'Var.')
      .replace(/[^\t\n\r\x20-\x7E]/g, '');
  }
  function pdfWrapLines(text, maxChars) {
    maxChars = maxChars || 96;
    var words = pdfAscii(text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var next = line ? line + ' ' + w : w;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = w;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }
  function toast(m, t) {
    try {
      if (typeof global.showToast === 'function') global.showToast(m, t || 'info');
    } catch (_) {}
  }
  function num(v, fb) {
    var n = Number(v);
    return isFinite(n) ? n : fb == null ? 0 : fb;
  }
  function uid(p) {
    return (p || 'cot') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function fmtMoney(n) {
    var res = R();
    if (res && res.fmtCop) return res.fmtCop(n);
    return '$' + Math.round(num(n)).toLocaleString('es-CO');
  }
  function fmtUnit(n, und) {
    var e = E();
    if (e && e.formatoPrecioPorUnd) return e.formatoPrecioPorUnd(n, und);
    return '$' + num(n).toFixed(4) + '/' + und;
  }
  function hintFormula(precioTotal, peso, und) {
    var e = E();
    if (e && e.hintCalculoPrecio) return e.hintCalculoPrecio(precioTotal, peso, und);
    var w = num(peso);
    if (w <= 0) return '';
    return fmtMoney(precioTotal) + ' ÷ ' + w + ' = ' + fmtUnit(num(precioTotal) / w, und);
  }
  function calcUnit(precioTotal, peso) {
    var e = E();
    if (e && e.precioUnitarioMp) return e.precioUnitarioMp(precioTotal, peso);
    var w = num(peso);
    return w > 0 ? num(precioTotal) / w : 0;
  }
  function categorias() {
    if (M() && M().CATEGORIAS) return M().CATEGORIAS.slice();
    return ['PROTEINAS', 'LACTEOS', 'FRUVER', 'ABARROTES', 'BEBIDAS Y LICORES', 'DESECHABLES', 'OTRO'];
  }
  function catLabel(c) {
    if (M() && M().CAT_LABEL && M().CAT_LABEL[c]) return M().CAT_LABEL[c];
    return String(c || 'Otro').replace(/_/g, ' ');
  }
  function loadWorkspace() {
    try {
      var raw = localStorage.getItem(LS_WORKSPACE);
      if (!raw) return { proximo: {}, vsExtra: {}, pdfByMp: {}, sessionMpIds: [], recentProviders: [] };
      var o = JSON.parse(raw);
      return {
        proximo: o.proximo || {},
        vsExtra: o.vsExtra || {},
        pdfByMp: o.pdfByMp || {},
        sessionMpIds: Array.isArray(o.sessionMpIds) ? o.sessionMpIds : [],
        recentProviders: Array.isArray(o.recentProviders) ? o.recentProviders : [],
      };
    } catch (_) {
      return { proximo: {}, vsExtra: {}, pdfByMp: {}, sessionMpIds: [], recentProviders: [] };
    }
  }
  function saveWorkspace(ws) {
    try {
      localStorage.setItem(LS_WORKSPACE, JSON.stringify(ws));
    } catch (_) {}
  }
  function getWs() {
    if (!getWs._cache) getWs._cache = loadWorkspace();
    return getWs._cache;
  }
  function persistWs() {
    saveWorkspace(getWs());
  }
  function rebuildIndex() {
    var cat = C();
    if (!cat || !cat.list) {
      mpIndex = [];
      return;
    }
    mpIndex = cat.list().map(function (mp) {
      return {
        mp: mp,
        search: (String(mp.nombre) + ' ' + String(mp.categoria || '') + ' ' + String(mp.id)).toLowerCase(),
      };
    });
  }
  function filteredMps() {
    if (!mpIndex) rebuildIndex();
    var q = ui.q.toLowerCase().trim();
    return mpIndex.filter(function (row) {
      var mp = row.mp;
      if (ui.mpId && mp.id !== ui.mpId) return false;
      if (ui.categoria && String(mp.categoria || 'OTRO').toUpperCase() !== ui.categoria) return false;
      if (q && row.search.indexOf(q) < 0) return false;
      return true;
    });
  }
  function getMp(id) {
    var cat = C();
    return cat && cat.get ? cat.get(id) : null;
  }

  function searchHits(limit) {
    var q = ui.q.toLowerCase().trim();
    if (!q) return [];
    return filteredMps()
      .filter(function (row) {
        return row.search.indexOf(q) >= 0;
      })
      .slice(0, limit == null ? 15 : limit);
  }

  function getCotRoot(from) {
    if (from && from.querySelector) {
      var inner = from.querySelector('.crozzo-cot-wrap');
      if (inner) return inner;
    }
    return document.querySelector('.crozzo-cot-wrap') || from || null;
  }

  function removeFromSession(mpId) {
    var ws = getWs();
    ws.sessionMpIds = (ws.sessionMpIds || []).filter(function (id) {
      return id !== mpId;
    });
    if (ui.focusMpId === mpId) ui.focusMpId = ws.sessionMpIds[0] || '';
    if (ui.quickMpId === mpId) closeQuickForm();
    persistWs();
    var root = getCotRoot(document.getElementById('mainContent'));
    if (root) refreshCompare(root);
  }

  function closeQuickForm() {
    ui.quickMpId = '';
    ui.quickEditCotId = '';
    var root = getCotRoot(document.getElementById('mainContent'));
    if (root) refreshQuickModal(root);
  }

  function closeExportModal() {
    ui.exportOpen = false;
    var root = getCotRoot(document.getElementById('mainContent'));
    if (root) refreshExportModal(root);
  }

  function openExportModal() {
    var pack = buildExportPack(true);
    if (!pack.resumen.length) return toast('Agregue productos a la cotización antes de exportar', 'warning');
    ui.exportOpen = true;
    var root = getCotRoot(document.getElementById('mainContent'));
    if (root) refreshExportModal(root);
  }

  function openQuickForm(mpId, cotId) {
    var mp = getMp(mpId);
    if (!mp) return;
    ui.focusMpId = mpId;
    ui.quickMpId = mpId;
    ui.quickEditCotId = cotId || '';
    var root = getCotRoot(document.getElementById('mainContent'));
    if (root) {
      refreshQuickModal(root);
      refreshSessionSheet(root);
      setTimeout(function () {
        var p = root.querySelector('#cotQuickProv');
        if (p) p.focus();
      }, 50);
    }
  }

  function getStoredCot(cotId, mpId) {
    var res = R();
    if (!res || !res.listCotizacionesMp) return null;
    return res.listCotizacionesMp({ mpId: mpId, limit: 80 }).find(function (c) {
      return String(c.id) === String(cotId);
    });
  }

  function saveQuickForm(root) {
    root = getCotRoot(root) || root;
    var mpId = ui.quickMpId;
    var mp = getMp(mpId);
    if (!mp || !root) return;
    var prov = root.querySelector('#cotQuickProv');
    var peso = root.querySelector('#cotQuickPeso');
    var precio = root.querySelector('#cotQuickPrecio');
    var und = root.querySelector('#cotQuickUnd');
    var chk = root.querySelector('#cotQuickMi');
    var nom = (prov && prov.value.trim()) || 'Proveedor';
    var pTotal = num(precio && precio.value);
    var pPeso = num(peso && peso.value) || num(mp.peso) || 1000;
    if (pTotal <= 0) return toast('Indique precio del lote', 'warning');
    var res = R();
    if (!res || !res.addCotizacionMp) return;
    if (ui.quickEditCotId && res.removeCotizacionMp) {
      res.removeCotizacionMp(ui.quickEditCotId);
    }
    res.addCotizacionMp({
      mpId: mpId,
      proveedorId: null,
      proveedorNombre: nom,
      peso: pPeso,
      und: (und && und.value) || mp.und,
      precioTotal: pTotal,
      fecha: new Date().toISOString().slice(0, 10),
      notas: '',
      esMiEmpresa: !(chk && !chk.checked),
    });
    touchRecentProvider(nom, !(chk && !chk.checked));
    var ws = getWs();
    if (!ws.sessionMpIds) ws.sessionMpIds = [];
    if (ws.sessionMpIds.indexOf(mpId) < 0) ws.sessionMpIds.push(mpId);
    persistWs();
    closeQuickForm();
    refreshCompare(root);
  }

  function renameCotizacion(cotId, mpId, newName) {
    var c = getStoredCot(cotId, mpId);
    var res = R();
    if (!c || !res || !res.removeCotizacionMp || !res.addCotizacionMp) return;
    var nom = String(newName || '').trim();
    if (!nom || nom === (c.proveedorNombre || '')) return;
    res.removeCotizacionMp(cotId);
    res.addCotizacionMp({
      mpId: mpId,
      proveedorId: c.proveedorId,
      proveedorNombre: nom,
      peso: c.peso,
      und: c.und,
      precioTotal: c.precioTotal,
      fecha: c.fecha,
      notas: c.notas || '',
      esMiEmpresa: !!c.esMiEmpresa,
    });
    refreshSessionSheet(getCotRoot(document.getElementById('mainContent')));
  }

  function selectProduct(mpId) {
    var mp = getMp(mpId);
    if (!mp) return;
    var ws = getWs();
    if (!ws.sessionMpIds) ws.sessionMpIds = [];
    if (ws.sessionMpIds.indexOf(mpId) < 0) ws.sessionMpIds.push(mpId);
    ui.focusMpId = mpId;
    persistWs();
    ui.addOpen = false;
    var root = getCotRoot(document.getElementById('mainContent'));
    if (root) refreshCompare(root);
  }
  function diffClass(diffPct) {
    if (diffPct == null || !isFinite(diffPct)) return '';
    if (diffPct < 0) return 'crozzo-cot-diff--ok';
    if (diffPct > 0) return 'crozzo-cot-diff--warn';
    return 'crozzo-cot-diff--neutral';
  }
  /** Delta costeo actual vs otro escenario (unitario, %, COP por lote ref.) */
  function calcDelta(actualUnit, nuevoUnit, actualLote, nuevoLote) {
    var a = num(actualUnit);
    var n = num(nuevoUnit);
    if (a <= 0 && n <= 0) {
      return { diffUnit: 0, diffPct: null, diffLote: 0, label: '—', verdict: 'neutral', hint: '' };
    }
    if (a <= 0) {
      return {
        diffUnit: n,
        diffPct: null,
        diffLote: num(nuevoLote) - num(actualLote),
        label: 'Nuevo',
        verdict: 'nuevo',
        hint: 'Sin costeo base en sistema',
      };
    }
    var diffUnit = n - a;
    var diffPct = (diffUnit / a) * 100;
    var sign = diffPct > 0 ? '+' : '';
    var label = sign + diffPct.toFixed(1) + '% · ' + (diffUnit >= 0 ? '+' : '') + fmtUnit(Math.abs(diffUnit), '').replace(/ \/ $/, '');
    var verdict = diffPct < -0.5 ? 'mejora' : diffPct > 0.5 ? 'empeora' : 'similar';
    var diffLote = num(nuevoLote) - num(actualLote);
    return {
      diffUnit: diffUnit,
      diffPct: diffPct,
      diffLote: diffLote,
      label: label,
      verdict: verdict,
      hint:
        'Δ unitario: ' +
        (diffUnit >= 0 ? '+' : '') +
        fmtUnit(diffUnit, 'GR').split('/')[0] +
        ' · Δ lote: ' +
        (diffLote >= 0 ? '+' : '') +
        fmtMoney(Math.abs(diffLote)),
    };
  }
  function recommendForMp(mp, scenarios) {
    scenarios = (scenarios || []).filter(function (s) {
      return s && num(s.precioUnit) > 0;
    });
    if (!scenarios.length) return { texto: 'Registre cotizaciones o comparaciones', nivel: 'neutral' };
    var sys = scenarios.find(function (s) {
      return s.tipo === 'sistema';
    });
    var sysU = sys ? num(sys.precioUnit) : num(mp.precioUnit);
    var best = null;
    scenarios.forEach(function (s) {
      if (!best || num(s.precioUnit) < num(best.precioUnit)) best = s;
    });
    if (!best) return { texto: 'Sin datos comparables', nivel: 'neutral' };
    var bestU = num(best.precioUnit);
    if (sysU > 0 && Math.abs(bestU - sysU) / sysU < 0.005) {
      return { texto: 'Mantener costeo actual del sistema', nivel: 'ok', ref: best };
    }
    if (best.tipo === 'proximo') {
      var d = calcDelta(sysU, bestU, mp.precioTotal, best.precioTotal);
      if (d.verdict === 'mejora') return { texto: 'Adoptar costeo próximo planificado (mejora ' + d.label + ')', nivel: 'ok', ref: best };
      if (d.verdict === 'empeora') return { texto: 'Revisar costeo próximo: empeora ' + d.label, nivel: 'warn', ref: best };
      return { texto: 'Costeo próximo similar al actual', nivel: 'neutral', ref: best };
    }
    if (best.esMiEmpresa || best.tipo === 'sistema') {
      return { texto: 'Mejor opción: su costeo / proveedor «' + (best.label || best.proveedorNombre || 'actual') + '»', nivel: 'ok', ref: best };
    }
    var pct = sysU > 0 ? (((bestU - sysU) / sysU) * 100).toFixed(1) : '0';
    return {
      texto: 'Competencia «' + (best.proveedorNombre || best.label) + '» más barata (' + pct + '%). Negociar o validar calidad antes de cambiar.',
      nivel: 'warn',
      ref: best,
    };
  }
  function buildScenarios(mp) {
    var res = R();
    var ws = getWs();
    var und = String(mp.und || 'GR').toUpperCase();
    var sysU = num(mp.precioUnit) || calcUnit(mp.precioTotal, mp.peso);
    var out = [
      {
        id: 'sys',
        tipo: 'sistema',
        label: 'Mi empresa (sistema)',
        esMiEmpresa: true,
        proveedorNombre: 'Costeo actual',
        precioTotal: num(mp.precioTotal),
        peso: num(mp.peso),
        und: und,
        precioUnit: sysU,
        readonly: true,
      },
    ];
    var prox = ws.proximo[mp.id];
    if (prox) {
      var pPeso = num(prox.peso) || num(mp.peso);
      var pTotal = num(prox.precioTotal);
      out.push({
        id: 'proximo',
        tipo: 'proximo',
        label: 'Costeo próximo',
        esMiEmpresa: true,
        proveedorNombre: 'Planificado',
        precioTotal: pTotal,
        peso: pPeso,
        und: String(prox.und || und).toUpperCase(),
        precioUnit: calcUnit(pTotal, pPeso),
        readonly: false,
        workspace: true,
      });
    }
    if (res && res.listCotizacionesMp) {
      res
        .listCotizacionesMp({ mpId: mp.id, limit: 50 })
        .filter(function (c) {
          return c.vigente !== false;
        })
        .forEach(function (c) {
          out.push({
            id: c.id,
            tipo: 'cotizacion',
            label: c.proveedorNombre || 'Cotización',
            esMiEmpresa: !!c.esMiEmpresa,
            proveedorNombre: c.proveedorNombre,
            precioTotal: num(c.precioTotal),
            peso: num(c.peso),
            und: String(c.und || und).toUpperCase(),
            precioUnit: num(c.precioUnit) || calcUnit(c.precioTotal, c.peso),
            fecha: c.fecha,
            stored: true,
          });
        });
    }
    var extras = ws.vsExtra[mp.id] || [];
    extras.forEach(function (x) {
      out.push({
        id: x.id,
        tipo: 'competidor',
        label: x.label || x.proveedorNombre || 'Comparación',
        esMiEmpresa: !!x.esMiEmpresa,
        proveedorNombre: x.proveedorNombre || x.label,
        precioTotal: num(x.precioTotal),
        peso: num(x.peso),
        und: String(x.und || und).toUpperCase(),
        precioUnit: calcUnit(x.precioTotal, x.peso),
        workspace: true,
        extra: true,
      });
    });
    return out;
  }
  function buildComparisons() {
    return filteredMps().map(function (row) {
      var mp = row.mp;
      var scenarios = buildScenarios(mp);
      var quotes = scenarios.filter(function (s) {
        return s.tipo === 'cotizacion';
      });
      var best = null;
      scenarios.forEach(function (s) {
        if (s.tipo === 'sistema') return;
        if (!best || num(s.precioUnit) < num(best.precioUnit)) best = s;
      });
      var sysU = num(mp.precioUnit) || calcUnit(mp.precioTotal, mp.peso);
      var diffPct = null;
      var diffLabel = '—';
      if (best && sysU > 0) {
        diffPct = ((num(best.precioUnit) - sysU) / sysU) * 100;
        var sign = diffPct > 0 ? '+' : '';
        diffLabel = sign + diffPct.toFixed(1) + '%';
      }
      var rec = recommendForMp(mp, scenarios);
      return { mp: mp, quotes: quotes, best: best, sysUnit: sysU, diffPct: diffPct, diffLabel: diffLabel, rec: rec, scenarios: scenarios };
    });
  }
  function provOptions(selectedId) {
    var res = R();
    if (!res || !res.listProveedores) return '<option value="">— Sin proveedores —</option>';
    var list = res.syncProveedoresBidirectional ? res.syncProveedoresBidirectional() : res.listProveedores();
    if (!list.length) return '<option value="">— Registre proveedores primero —</option>';
    return (
      '<option value="">— Proveedor —</option>' +
      list
        .map(function (p) {
          var id = String(p.id || '');
          return (
            '<option value="' +
            esc(id) +
            '"' +
            (id === String(selectedId || '') ? ' selected' : '') +
            '>' +
            esc(p.nombre || id) +
            '</option>'
          );
        })
        .join('')
    );
  }
  function mpOptions(selectedId, forForm) {
    var cat = C();
    if (!cat || !cat.list) return '<option value="">— Catálogo MP —</option>';
    var first = forForm ? '— Seleccione —' : '— Todas las materias primas —';
    return (
      '<option value="">' +
      first +
      '</option>' +
      cat
        .list()
        .map(function (mp) {
          return (
            '<option value="' +
            esc(mp.id) +
            '"' +
            (mp.id === selectedId ? ' selected' : '') +
            ' data-und="' +
            esc(mp.und) +
            '" data-peso="' +
            esc(mp.peso) +
            '" data-precio="' +
            esc(mp.precioTotal) +
            '" data-cat="' +
            esc(mp.categoria) +
            '">' +
            esc(mp.nombre) +
            '</option>'
          );
        })
        .join('')
    );
  }
  function catFilterOptions() {
    return (
      '<option value="">— Todos los grupos —</option>' +
      categorias()
        .map(function (c) {
          return (
            '<option value="' +
            esc(c) +
            '"' +
            (ui.categoria === c ? ' selected' : '') +
            '>' +
            esc(catLabel(c)) +
            '</option>'
          );
        })
        .join('') +
      '<option value="OTRO"' +
      (ui.categoria === 'OTRO' ? ' selected' : '') +
      '>Otro</option>'
    );
  }
  function evalExtremeAlert(sysUnit, otherUnit) {
    var a = num(sysUnit);
    var n = num(otherUnit);
    if (a <= 0 || n <= 0) return null;
    var e = E();
    if (e && e.evaluarVariacionPrecio) {
      var r = e.evaluarVariacionPrecio(a, n, { umbralRatio: 2 });
      if (!r.ok && r.mensaje) {
        return '⚠️ Variación extrema: revise unidad, cantidad ref. o precio. ' + String(r.mensaje).split('\n')[0];
      }
    }
    var ratio = n / a;
    if (ratio >= 2.5 || ratio <= 0.4) {
      return (
        '⚠️ Diferencia muy grande: paga ' +
        fmtUnit(a, 'GR').split('/')[0] +
        ' y la oferta es ' +
        fmtUnit(n, 'GR').split('/')[0] +
        ' (×' +
        ratio.toFixed(1) +
        ')'
      );
    }
    return null;
  }

  function touchRecentProvider(nombre, esMiEmpresa) {
    var nom = String(nombre || '').trim();
    if (!nom) return;
    var ws = getWs();
    if (!ws.recentProviders) ws.recentProviders = [];
    ws.recentProviders = ws.recentProviders.filter(function (p) {
      return String(p.nombre).toLowerCase() !== nom.toLowerCase();
    });
    ws.recentProviders.unshift({
      id: uid('prov'),
      nombre: nom,
      esMiEmpresa: !!esMiEmpresa,
      usedAt: new Date().toISOString(),
    });
    if (ws.recentProviders.length > 12) ws.recentProviders.length = 12;
    persistWs();
  }

  function addVsFromRecent(mpId, provRecId) {
    var mp = getMp(mpId);
    if (!mp) return;
    var ws = getWs();
    var pr = (ws.recentProviders || []).find(function (p) {
      return p.id === provRecId;
    });
    if (!pr) return;
    if (!ws.vsExtra[mpId]) ws.vsExtra[mpId] = [];
    ws.vsExtra[mpId].push({
      id: uid('vs'),
      label: pr.nombre,
      proveedorNombre: pr.nombre,
      esMiEmpresa: !!pr.esMiEmpresa,
      precioTotal: 0,
      peso: num(mp.peso) || 1000,
      und: String(mp.und || 'GR').toUpperCase(),
    });
    persistWs();
    refreshCompare(getCotRoot(document.getElementById('mainContent')) || document.getElementById('mainContent'));
  }

  function renderDeltaBlock(sys, other) {
    if (!other || other.tipo === 'sistema') return '';
    var d = calcDelta(sys.precioUnit, other.precioUnit, sys.precioTotal, other.precioTotal);
    var cls = 'crozzo-cot-delta crozzo-cot-delta--' + d.verdict;
    var alert = evalExtremeAlert(sys.precioUnit, other.precioUnit);
    return (
      '<div class="' +
      cls +
      '">' +
      '<span class="crozzo-cot-delta-pct">' +
      esc(d.label) +
      '</span>' +
      '<span class="crozzo-cot-delta-hint">' +
      esc(d.hint) +
      '</span>' +
      (alert ? '<span class="crozzo-cot-alert-extreme">' + esc(alert) + '</span>' : '') +
      '<span class="crozzo-cot-delta-formula">' +
      esc(hintFormula(other.precioTotal, other.peso, other.und)) +
      '</span></div>'
    );
  }

  function renderRecentProvChips(mp) {
    var ws = getWs();
    var list = ws.recentProviders || [];
    if (!list.length || !mp) {
      return '<p class="form-hint crozzo-cot-recent-empty">Los proveedores que use quedarán aquí para el siguiente producto.</p>';
    }
    return (
      '<div class="crozzo-cot-recent-prov">' +
      '<span class="crozzo-cot-recent-label">Proveedores recientes (reutilizar):</span> ' +
      list
        .map(function (p) {
          return (
            '<button type="button" class="btn btn-outline btn-sm crozzo-cot-recent-prov-btn" data-mp-id="' +
            esc(mp.id) +
            '" data-prov-rec="' +
            esc(p.id) +
            '">+ ' +
            esc(p.nombre) +
            '</button>'
          );
        })
        .join(' ') +
      '</div>'
    );
  }
  function renderVsColumn(sc, sys, mp) {
    var isSys = sc.tipo === 'sistema';
    var isEditable = !!(sc.extra || (sc.workspace && sc.tipo === 'proximo'));
    var headTitle = isSys
      ? 'Mi compra actual'
      : isEditable
        ? '<input type="text" class="form-input crozzo-cot-prov-name crozzo-cot-inp" data-cot-ws="proveedorNombre" data-sc-id="' +
          esc(sc.id) +
          '" data-mp-id="' +
          esc(mp.id) +
          '" value="' +
          esc(sc.proveedorNombre || sc.label || '') +
          '" placeholder="Nombre del proveedor">'
        : '<strong>' + esc(sc.proveedorNombre || sc.label) + '</strong>';
    var tag = isSys
      ? '<span class="crozzo-cot-tag crozzo-cot-tag--mine">Sistema</span>'
      : sc.esMiEmpresa
        ? '<span class="crozzo-cot-tag crozzo-cot-tag--mine">Mi proveedor</span>'
        : '<span class="crozzo-cot-tag crozzo-cot-tag--rival">Competencia</span>';
    var miChk =
      isEditable && !isSys
        ? '<label class="crozzo-cot-mi-chk"><input type="checkbox" class="crozzo-cot-inp" data-cot-ws="esMiEmpresa" data-sc-id="' +
          esc(sc.id) +
          '" data-mp-id="' +
          esc(mp.id) +
          '"' +
          (sc.esMiEmpresa ? ' checked' : '') +
          '> Mi empresa / proveedor habitual</label>'
        : '';
    var body = isSys || !isEditable
      ? '<div class="crozzo-cot-col-body">' +
        '<p class="crozzo-cot-col-lote">' +
        fmtMoney(sc.precioTotal) +
        '</p>' +
        '<p class="form-hint">' +
        esc(sc.peso) +
        ' ' +
        esc(sc.und) +
        ' (referencia)</p>' +
        '</div>'
      : '<div class="crozzo-cot-col-body">' +
        miChk +
        '<label>Cant. ref.</label><input type="number" class="form-input crozzo-cot-inp" data-cot-ws="peso" data-sc-id="' +
        esc(sc.id) +
        '" data-mp-id="' +
        esc(mp.id) +
        '" value="' +
        esc(sc.peso) +
        '" min="0" step="any">' +
        '<label>Precio lote ($)</label><input type="number" class="form-input crozzo-cot-inp" data-cot-ws="precioTotal" data-sc-id="' +
        esc(sc.id) +
        '" data-mp-id="' +
        esc(mp.id) +
        '" value="' +
        esc(sc.precioTotal) +
        '" min="0" step="1">' +
        '<label>Unidad</label><select class="form-input crozzo-cot-inp" data-cot-ws="und" data-sc-id="' +
        esc(sc.id) +
        '" data-mp-id="' +
        esc(mp.id) +
        '">' +
        UND_OPTS.map(function (u) {
          return '<option value="' + u + '"' + (sc.und === u ? ' selected' : '') + '>' + u + '</option>';
        }).join('') +
        '</select></div>';
    var deltaWrap = isSys ? '' : '<div class="crozzo-cot-col-delta">' + renderDeltaBlock(sys, sc) + '</div>';
    var actions = isSys
      ? ''
      : sc.extra
        ? '<div class="crozzo-cot-col-actions">' +
          '<button type="button" class="btn btn-primary btn-sm crozzo-cot-save-vs" data-mp-id="' +
          esc(mp.id) +
          '" data-sc-id="' +
          esc(sc.id) +
          '">Guardar cotización</button> ' +
          '<button type="button" class="btn btn-outline btn-sm crozzo-cot-rm-vs" data-mp-id="' +
          esc(mp.id) +
          '" data-sc-id="' +
          esc(sc.id) +
          '">Quitar</button></div>'
        : sc.stored
          ? '<div class="crozzo-cot-col-actions"><button type="button" class="btn btn-outline btn-sm crozzo-cot-del" data-cot-id="' +
            esc(sc.id) +
            '">Eliminar guardada</button></div>'
          : '';
    return (
      '<div class="crozzo-cot-col' +
      (isSys ? ' crozzo-cot-col--sys' : ' crozzo-cot-col--vs') +
      '" data-sc-tipo="' +
      esc(sc.tipo) +
      '" data-sc-id="' +
      esc(sc.id) +
      '">' +
      '<div class="crozzo-cot-col-head">' +
      headTitle +
      tag +
      '</div>' +
      body +
      '<p class="crozzo-cot-card-unit" data-cot-unit>' +
      esc(fmtUnit(sc.precioUnit, sc.und)) +
      '</p>' +
      deltaWrap +
      actions +
      '</div>'
    );
  }

  function listQuotes(mp) {
    if (!mp) return [];
    return buildScenarios(mp).filter(function (s) {
      return s.tipo === 'cotizacion' && s.stored;
    });
  }

  function renderOffersCell(mp) {
    var quotes = listQuotes(mp);
    var sysU = num(mp.precioUnit);
    var chips = quotes
      .map(function (q) {
        var d = calcDelta(sysU, q.precioUnit, mp.precioTotal, q.precioTotal);
        return (
          '<div class="crozzo-cot-chip">' +
          '<input type="text" class="crozzo-cot-chip-name form-input" data-cot-rename="' +
          esc(q.id) +
          '" data-mp-id="' +
          esc(mp.id) +
          '" value="' +
          esc(q.proveedorNombre || '') +
          '" title="Nombre del proveedor">' +
          '<span class="crozzo-cot-chip-val ' +
          diffClass(d.diffPct) +
          '">' +
          esc(fmtUnit(q.precioUnit, q.und)) +
          '</span>' +
          '<span class="crozzo-cot-chip-sub">' +
          fmtMoney(q.precioTotal) +
          ' · ' +
          esc(q.peso) +
          ' ' +
          esc(q.und) +
          '</span>' +
          '<button type="button" class="crozzo-cot-chip-edit" data-cot-edit-cot="' +
          esc(q.id) +
          '" data-mp-id="' +
          esc(mp.id) +
          '" title="Editar">✎</button>' +
          '<button type="button" class="crozzo-cot-chip-rm" data-cot-del-cot="' +
          esc(q.id) +
          '" title="Quitar">×</button></div>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-cot-offers">' +
      (chips || '<span class="crozzo-cot-offers-empty">Sin cotizaciones</span>') +
      '<button type="button" class="crozzo-cot-offer-add" data-cot-add-offer="' +
      esc(mp.id) +
      '" title="Agregar proveedor">+</button></div>'
    );
  }

  function sessionRowData(id) {
    var mp = getMp(id);
    if (!mp) return null;
    var scenarios = buildScenarios(mp);
    var sysU = num(mp.precioUnit);
    var rec = recommendForMp(mp, scenarios);
    var best = rec.ref && rec.ref.tipo === 'cotizacion' ? rec.ref : null;
    var delta = best && sysU > 0 ? calcDelta(sysU, best.precioUnit, mp.precioTotal, best.precioTotal) : null;
    return { mp: mp, delta: delta, best: best, quoteCount: listQuotes(mp).length };
  }

  function renderSessionSheet() {
    var ws = getWs();
    var ids = ws.sessionMpIds || [];
    var q = ui.q.trim();
    var sessionIds = ids.slice();
    var inlineAddControls =
      '<div class="crozzo-cot-inline-add-mini">' +
      '<input type="search" id="crozzoCotSearch" class="form-input" placeholder="Buscar materia prima..." value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<select id="crozzoCotCatFilter" class="form-input">' +
      catFilterOptions() +
      '</select>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCotAddFirst"' +
      (q ? '' : ' disabled') +
      '>Agregar</button></div>';
    if (!ids.length) {
      var emptyHits = q.length >= 2
        ? searchHits(6)
            .filter(function (h) {
              return sessionIds.indexOf(h.mp.id) < 0;
            })
            .map(function (h) {
              var mp = h.mp;
              return (
                '<tr class="crozzo-cot-inline-result">' +
                '<td class="crozzo-cot-sess-num">+</td>' +
                '<td><strong>' +
                esc(mp.nombre) +
                '</strong><span class="crozzo-cot-sub">' +
                esc(catLabel(mp.categoria)) +
                '</span></td>' +
                '<td class="crozzo-cot-num"><strong>' +
                esc(fmtUnit(mp.precioUnit, mp.und)) +
                '</strong><span class="crozzo-cot-sub">' +
                fmtMoney(mp.precioTotal) +
                ' / ' +
                esc(mp.peso) +
                ' ' +
                esc(mp.und) +
                '</span></td>' +
                '<td colspan="2"><span class="form-hint">Agregar y abrir cotización rápida</span></td>' +
                '<td class="crozzo-cot-sess-act"><button type="button" class="btn btn-primary btn-sm" data-cot-add-id="' +
                esc(mp.id) +
                '">Agregar</button></td></tr>'
              );
            })
            .join('')
        : '';
      return (
        '<section class="crozzo-cot-sheet crozzo-cot-sheet--empty">' +
        '<div class="crozzo-cot-sheet-head">' +
        '<div><h2 class="crozzo-cot-sheet-title">Cotización en curso</h2>' +
        '<p class="form-hint crozzo-cot-sheet-sub">Aquí verá el resumen y podrá descargar Excel, PDF o CSV.</p></div>' +
        '<div class="crozzo-cot-export-bar"><button type="button" class="btn btn-primary btn-sm crozzo-cot-btn-export" id="crozzoCotOpenExport">Descargar reporte</button></div></div>' +
        '<div class="crozzo-mod-table-scroll crozzo-cot-sheet-scroll">' +
        '<table class="crozzo-mod-table crozzo-cot-sheet-table"><thead><tr>' +
        '<th>#</th><th>Producto</th><th>Sistema</th><th>Cotizaciones / proveedores</th><th>Δ mejor</th><th></th>' +
        '</tr></thead><tbody>' +
        '<tr class="crozzo-cot-plus-row"><td class="crozzo-cot-sess-num">+</td><td colspan="4"><strong>Agregar primer producto</strong><span class="crozzo-cot-sub">Escriba en el buscador y pulse Enter o + Agregar</span></td><td class="crozzo-cot-sess-act"><button type="button" class="btn btn-outline btn-sm crozzo-cot-plus-btn" id="crozzoCotFocusAdd">+ Producto</button></td></tr>' +
        (ui.addOpen
          ? '<tr class="crozzo-cot-plus-editor"><td colspan="6">' +
            inlineAddControls +
            '</td></tr>'
          : '') +
        (ui.addOpen ? emptyHits : '') +
        (ui.addOpen && !emptyHits ? '<tr><td colspan="6" class="crozzo-cot-sheet-empty">Busque una materia prima y pulse <strong>Agregar</strong>.</td></tr>' : '') +
        '</tbody></table></div></section>'
      );
    }
    var rows = ids.map(sessionRowData).filter(Boolean);
    var mejora = 0;
    var alerta = 0;
    rows.forEach(function (r) {
      if (r.delta && r.delta.verdict === 'mejora') mejora++;
      if (r.delta && r.best && evalExtremeAlert(num(r.mp.precioUnit), num(r.best.precioUnit))) alerta++;
    });
    return (
      '<section class="crozzo-cot-sheet">' +
      '<div class="crozzo-cot-sheet-head">' +
      '<div><h2 class="crozzo-cot-sheet-title">Cotización en curso</h2>' +
      '<p class="form-hint crozzo-cot-sheet-sub">' +
      rows.length +
      ' producto(s) · ' +
      mejora +
      ' mejora posible · ' +
      (alerta ? alerta + ' alerta(s)' : 'sin alertas') +
      ' · <strong>+</strong> agrega proveedor · edite el nombre en la tabla</p></div>' +
      '<div class="crozzo-cot-export-bar">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-cot-btn-export" id="crozzoCotOpenExport">Descargar reporte</button></div></div>' +
      '<div class="crozzo-mod-table-scroll crozzo-cot-sheet-scroll">' +
      '<table class="crozzo-mod-table crozzo-cot-sheet-table"><thead><tr>' +
      '<th>#</th><th>Producto</th><th>Sistema</th><th>Cotizaciones / proveedores</th><th>Δ mejor</th><th></th>' +
      '</tr></thead><tbody>' +
      rows
        .map(function (r, idx) {
          var mp = r.mp;
          var on = ui.focusMpId === mp.id || ui.quickMpId === mp.id ? ' crozzo-cot-sess-row--on' : '';
          return (
            '<tr class="crozzo-cot-sess-row' +
            on +
            '" data-cot-session-id="' +
            esc(mp.id) +
            '">' +
            '<td class="crozzo-cot-sess-num">' +
            (idx + 1) +
            '</td>' +
            '<td class="crozzo-cot-sess-name"><strong>' +
            esc(mp.nombre) +
            '</strong><span class="crozzo-cot-sub">' +
            esc(catLabel(mp.categoria)) +
            '</span></td>' +
            '<td class="crozzo-cot-num crozzo-cot-sys-cell"><strong>' +
            esc(fmtUnit(mp.precioUnit, mp.und)) +
            '</strong><span class="crozzo-cot-sub">' +
            fmtMoney(mp.precioTotal) +
            ' / ' +
            esc(mp.peso) +
            ' ' +
            esc(mp.und) +
            '</span></td>' +
            '<td class="crozzo-cot-offers-cell">' +
            renderOffersCell(mp) +
            '</td>' +
            '<td class="crozzo-cot-num ' +
            (r.delta ? diffClass(r.delta.diffPct) : '') +
            '">' +
            (r.delta ? esc(r.delta.label) : '—') +
            '</td>' +
            '<td class="crozzo-cot-sess-act">' +
            '<button type="button" class="btn btn-outline btn-sm crozzo-cot-sess-rm" data-cot-remove-session="' +
            esc(mp.id) +
            '" title="Quitar producto">×</button></td></tr>'
          );
        })
        .join('') +
      (ui.addOpen && q.length >= 2
        ? searchHits(8)
            .filter(function (h) {
              return sessionIds.indexOf(h.mp.id) < 0;
            })
            .map(function (h) {
              var mp = h.mp;
              return (
                '<tr class="crozzo-cot-inline-result">' +
                '<td class="crozzo-cot-sess-num">+</td>' +
                '<td><strong>' +
                esc(mp.nombre) +
                '</strong><span class="crozzo-cot-sub">' +
                esc(catLabel(mp.categoria)) +
                '</span></td>' +
                '<td class="crozzo-cot-num"><strong>' +
                esc(fmtUnit(mp.precioUnit, mp.und)) +
                '</strong><span class="crozzo-cot-sub">' +
                fmtMoney(mp.precioTotal) +
                ' / ' +
                esc(mp.peso) +
                ' ' +
                esc(mp.und) +
                '</span></td>' +
                '<td colspan="2"><span class="form-hint">Agregar y abrir cotización rápida</span></td>' +
                '<td class="crozzo-cot-sess-act"><button type="button" class="btn btn-primary btn-sm" data-cot-add-id="' +
                esc(mp.id) +
                '">Agregar</button></td></tr>'
              );
            })
            .join('')
        : '') +
      '<tr class="crozzo-cot-plus-row"><td class="crozzo-cot-sess-num">+</td><td colspan="4"><strong>Agregar otro producto</strong><span class="crozzo-cot-sub">Siga construyendo la cotización desde aquí</span></td><td class="crozzo-cot-sess-act"><button type="button" class="btn btn-outline btn-sm crozzo-cot-plus-btn" id="crozzoCotFocusAdd">+ Producto</button></td></tr>' +
      (ui.addOpen
        ? '<tr class="crozzo-cot-plus-editor"><td colspan="6">' +
          inlineAddControls +
          '</td></tr>'
        : '') +
      '</tbody></table></div></section>'
    );
  }

  function renderSearchPickerTable() {
    var q = ui.q.trim();
    if (!q) {
      return '<p class="crozzo-cot-add-hint">Escriba el nombre del insumo y pulse <strong>Enter</strong> o <strong>Agregar</strong>.</p>';
    }
    var sessionIds = getWs().sessionMpIds || [];
    var hits = searchHits(40);
    if (!hits.length) {
      return '<p class="crozzo-cot-add-hint">Sin coincidencias para «' + esc(q) + '».</p>';
    }
    return (
      '<div class="crozzo-mod-table-scroll crozzo-cot-picker-scroll">' +
      '<table class="crozzo-mod-table crozzo-cot-picker-table"><thead><tr>' +
      '<th>Producto</th><th>Grupo</th><th>Costeo lote</th><th>$ / und</th><th></th>' +
      '</tr></thead><tbody>' +
      hits
        .map(function (row) {
          var mp = row.mp;
          var inS = sessionIds.indexOf(mp.id) >= 0;
          return (
            '<tr class="crozzo-cot-pick-row' +
            (inS ? ' crozzo-cot-pick-row--in' : '') +
            '">' +
            '<td><strong>' +
            esc(mp.nombre) +
            '</strong></td>' +
            '<td>' +
            esc(catLabel(mp.categoria)) +
            '</td>' +
            '<td class="crozzo-cot-num">' +
            fmtMoney(mp.precioTotal) +
            '<span class="crozzo-cot-sub">' +
            esc(mp.peso) +
            ' ' +
            esc(mp.und) +
            '</span></td>' +
            '<td class="crozzo-cot-num">' +
            esc(fmtUnit(mp.precioUnit, mp.und)) +
            '</td>' +
            '<td>' +
            (inS
              ? '<button type="button" class="btn btn-outline btn-sm" data-cot-add-offer="' +
                esc(mp.id) +
                '">+ Cotizar</button>'
              : '<button type="button" class="btn btn-primary btn-sm" data-cot-add-id="' +
                esc(mp.id) +
                '">Agregar</button>') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderAddSection() {
    var q = ui.q.trim();
    var expanded = ui.addOpen || !!q;
    if (!expanded) {
      return (
        '<section class="crozzo-cot-add crozzo-cot-add--compact">' +
        '<button type="button" class="btn btn-outline btn-sm crozzo-cot-add-toggle" id="crozzoCotToggleAdd">+ Buscar y agregar producto</button>' +
        '<span class="form-hint crozzo-cot-add-compact-hint">Agrega a la tabla; use <strong>+</strong> en cada fila para cotizar.</span></section>'
      );
    }
    return (
      '<section class="crozzo-cot-add">' +
      '<div class="crozzo-cot-add-head">' +
      '<h3 class="crozzo-cot-add-title">Agregar producto</h3>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotToggleAdd">Ocultar</button></div>' +
      '<div class="crozzo-cot-add-toolbar">' +
      '<input type="search" id="crozzoCotSearch" class="form-input" placeholder="Buscar insumo (sal, leche, aceite…)" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<select id="crozzoCotCatFilter" class="form-input">' +
      catFilterOptions() +
      '</select>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCotAddFirst"' +
      (q ? '' : ' disabled') +
      '>Agregar</button></div>' +
      '<div id="crozzoCotPickerHost" class="crozzo-cot-picker-host">' +
      renderSearchPickerTable() +
      '</div></section>'
    );
  }

  function renderQuickModal() {
    var mpId = ui.quickMpId;
    var mp = mpId ? getMp(mpId) : null;
    if (!mp) return '';
    var edit = ui.quickEditCotId ? getStoredCot(ui.quickEditCotId, mpId) : null;
    var pesoVal = edit ? edit.peso : mp.peso;
    var precioVal = edit ? edit.precioTotal : '';
    var provVal = edit ? edit.proveedorNombre : '';
    var undVal = edit ? edit.und : mp.und;
    var miChk = edit ? !!edit.esMiEmpresa : true;
    var recent = (getWs().recentProviders || [])
      .slice(0, 5)
      .map(function (p) {
        return (
          '<button type="button" class="btn btn-outline btn-sm crozzo-cot-quick-rec" data-quick-prov="' +
          esc(p.nombre) +
          '">' +
          esc(p.nombre) +
          '</button>'
        );
      })
      .join(' ');
    return (
      '<div class="crozzo-cot-modal" id="crozzoCotQuickModal" role="dialog" aria-modal="true">' +
      '<div class="crozzo-cot-modal-backdrop" id="crozzoCotModalBackdrop"></div>' +
      '<div class="crozzo-cot-modal-box">' +
      '<div class="crozzo-cot-modal-head">' +
      '<h3 class="crozzo-cot-modal-title">' +
      (edit ? 'Editar cotización' : 'Nueva cotización') +
      ' · ' +
      esc(mp.nombre) +
      '</h3>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotModalClose">✕</button></div>' +
      '<p class="form-hint crozzo-cot-modal-sys">Sistema: ' +
      esc(fmtUnit(mp.precioUnit, mp.und)) +
      ' (' +
      fmtMoney(mp.precioTotal) +
      ' / ' +
      esc(mp.peso) +
      ' ' +
      esc(mp.und) +
      ')</p>' +
      (recent ? '<div class="crozzo-cot-quick-recent"><span class="form-hint">Recientes:</span> ' + recent + '</div>' : '') +
      '<label class="crozzo-cot-modal-lbl">Proveedor</label>' +
      '<input type="text" class="form-input" id="cotQuickProv" value="' +
      esc(provVal) +
      '" placeholder="Nombre del proveedor" autocomplete="off">' +
      '<div class="crozzo-cot-modal-grid">' +
      '<div><label class="crozzo-cot-modal-lbl">Cantidad ref.</label>' +
      '<input type="number" class="form-input" id="cotQuickPeso" min="0" step="any" value="' +
      esc(pesoVal) +
      '"></div>' +
      '<div><label class="crozzo-cot-modal-lbl">Unidad</label>' +
      '<select class="form-input" id="cotQuickUnd">' +
      UND_OPTS.map(function (u) {
        return '<option value="' + u + '"' + (String(undVal).toUpperCase() === u ? ' selected' : '') + '>' + u + '</option>';
      }).join('') +
      '</select></div>' +
      '<div class="crozzo-cot-modal-span"><label class="crozzo-cot-modal-lbl">Precio lote ($)</label>' +
      '<input type="number" class="form-input" id="cotQuickPrecio" min="0" step="1" value="' +
      esc(precioVal) +
      '" placeholder="Ej. 4100"></div></div>' +
      '<label class="crozzo-cot-modal-chk"><input type="checkbox" id="cotQuickMi"' +
      (miChk ? ' checked' : '') +
      '> Mi proveedor / empresa</label>' +
      '<div class="crozzo-cot-modal-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCotQuickSave">Guardar en cotización</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotModalClose2">Cancelar</button></div></div></div>'
    );
  }

  function preserveSearchFocus(host, fn) {
    var inp = host.querySelector('#crozzoCotSearch');
    var hadFocus = inp && document.activeElement === inp;
    var start = inp && typeof inp.selectionStart === 'number' ? inp.selectionStart : null;
    var end = inp && typeof inp.selectionEnd === 'number' ? inp.selectionEnd : null;
    fn();
    var filt = host.querySelector('#crozzoCotCatFilter');
    if (filt) filt.value = ui.categoria || '';
    var addBtn = host.querySelector('#crozzoCotAddFirst');
    if (addBtn) addBtn.disabled = !ui.q.trim();
    if (hadFocus) {
      var ni = host.querySelector('#crozzoCotSearch');
      if (ni) {
        ni.focus();
        if (start != null && end != null) {
          try {
            ni.setSelectionRange(start, end);
          } catch (_) {}
        }
      }
    }
  }

  function refreshSessionSheet(host) {
    host = getCotRoot(host) || host;
    if (!host) return;
    var el = host.querySelector('#crozzoCotSessionSheetHost');
    if (el) el.innerHTML = renderSessionSheet();
  }

  function refreshAddSection(host) {
    host = getCotRoot(host) || host;
    if (!host) return;
    preserveSearchFocus(host, function () {
      var sheetHost = host.querySelector('#crozzoCotSessionSheetHost');
      if (sheetHost) sheetHost.innerHTML = renderSessionSheet();
    });
  }

  function patchVsColumns(root, mpId) {
    var mp = getMp(mpId);
    if (!mp || ui.focusMpId !== mpId) return;
    var scenarios = buildScenarios(mp);
    var sys = scenarios[0];
    var scope = root.querySelector('#crozzoCotDrawerBody') || root;
    var row = scope.querySelector('#crozzoCotCompareRow');
    if (!row) return;
    scenarios.forEach(function (sc) {
      var col = row.querySelector('[data-sc-id="' + sc.id + '"]');
      if (!col) return;
      var unitEl = col.querySelector('[data-cot-unit]');
      if (unitEl) unitEl.textContent = fmtUnit(sc.precioUnit, sc.und);
      var deltaEl = col.querySelector('.crozzo-cot-col-delta');
      if (deltaEl && sc.tipo !== 'sistema') deltaEl.innerHTML = renderDeltaBlock(sys, sc);
    });
    patchWorkHead(root, mp);
  }

  function patchWorkHead(root, mp) {
    var scenarios = buildScenarios(mp);
    var rec = recommendForMp(mp, scenarios);
    var scope = root.querySelector('#crozzoCotDrawerBody') || root;
    var box = scope.querySelector('#crozzoCotRecBox');
    if (!box) return;
    box.className = 'crozzo-cot-rec crozzo-cot-rec--' + (rec.nivel || 'neutral');
    box.setAttribute('data-rec-nivel', rec.nivel || 'neutral');
    var p = box.querySelector('[data-cot-rec-texto]');
    if (p) p.textContent = rec.texto;
  }

  function scheduleVsPatch(root, mpId) {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(function () {
      refreshSessionSheet(root);
    }, 80);
  }

  function renderQuoteForm(mp) {
    mp = mp || {};
    return (
      '<div class="crozzo-mod-form-grid crozzo-cot-form-grid">' +
      '<div><label>Proveedor</label><select class="form-input" id="crozzoCotNewProv">' +
      provOptions() +
      '</select></div>' +
      '<div><label>Otro nombre</label><input class="form-input" id="crozzoCotNewProvTxt" placeholder="Competidor, distribuidor…"></div>' +
      '<div><label><input type="checkbox" id="crozzoCotEsMiEmpresa" checked> Es mi empresa / proveedor habitual</label></div>' +
      '<div><label>Cant. ref.</label><input class="form-input" id="crozzoCotNewPeso" type="number" min="0" step="any" value="' +
      esc(mp.peso || '') +
      '"></div>' +
      '<div><label>Precio lote</label><input class="form-input" id="crozzoCotNewPrecio" type="number" min="0" step="1"></div>' +
      '<div><label>Fecha</label><input class="form-input" id="crozzoCotNewFecha" type="date"></div>' +
      '<div class="crozzo-mod-form-span"><label>Notas</label><input class="form-input" id="crozzoCotNewNotas" placeholder="Correo, WhatsApp, condiciones…"></div>' +
      '<div class="crozzo-mod-form-actions"><button type="button" class="btn btn-primary btn-sm" id="crozzoCotSave">Guardar cotización</button></div></div>'
    );
  }
  function renderMpPickerList() {
    var rows = filteredMps();
    if (!rows.length) {
      return '<p class="crozzo-cot-picker-empty">Sin resultados. Amplíe filtros o busque otro término.</p>';
    }
    return rows
      .slice(0, 120)
      .map(function (row) {
        var mp = row.mp;
        var active = ui.focusMpId === mp.id ? ' crozzo-cot-picker-item--on' : '';
        var sysU = num(mp.precioUnit);
        return (
          '<button type="button" class="crozzo-cot-picker-item' +
          active +
          '" data-cot-pick="' +
          esc(mp.id) +
          '">' +
          '<span class="crozzo-cot-picker-name">' +
          esc(mp.nombre) +
          '</span>' +
          '<span class="crozzo-cot-picker-meta">' +
          esc(catLabel(mp.categoria)) +
          ' · ' +
          esc(fmtUnit(sysU, mp.und)) +
          '</span></button>'
        );
      })
      .join('');
  }
  function renderCompareRows(rows) {
    if (!rows.length) {
      return '<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.7">Sin datos. Cambie filtros o registre cotizaciones.</td></tr>';
    }
    return rows
      .map(function (row) {
        var mp = row.mp;
        var best = row.best;
        var quotesCount = row.quotes.length;
        var prox = getWs().proximo[mp.id];
        var proxLabel = prox && num(prox.precioTotal) > 0 ? 'Sí' : '—';
        var expand =
          quotesCount > 0
            ? '<details class="crozzo-mod-details crozzo-cot-details"><summary>' +
              quotesCount +
              ' cotización(es)</summary><div class="crozzo-mod-subtable-wrap"><table class="crozzo-mod-subtable"><thead><tr><th>Origen</th><th>Lote</th><th>Precio / u</th><th>Δ vs sistema</th></tr></thead><tbody>' +
              row.scenarios
                .filter(function (s) {
                  return s.tipo !== 'sistema';
                })
                .map(function (c) {
                  var d = calcDelta(row.sysUnit, c.precioUnit, mp.precioTotal, c.precioTotal);
                  return (
                    '<tr><td>' +
                    esc(c.proveedorNombre || c.label) +
                    (c.esMiEmpresa ? ' <span class="crozzo-cot-tag crozzo-cot-tag--mine">Propio</span>' : ' <span class="crozzo-cot-tag crozzo-cot-tag--rival">Ext.</span>') +
                    '</td><td>' +
                    fmtMoney(c.precioTotal) +
                    ' / ' +
                    esc(c.peso) +
                    ' ' +
                    esc(c.und) +
                    '</td><td><strong>' +
                    esc(fmtUnit(c.precioUnit, c.und)) +
                    '</strong></td><td class="' +
                    diffClass(d.diffPct) +
                    '">' +
                    esc(d.label) +
                    '</td></tr>'
                  );
                })
                .join('') +
              '</tbody></table></div></details>'
            : '<span class="form-hint">Sin cotizaciones</span>';
        return (
          '<tr data-cot-mp="' +
          esc(mp.id) +
          '">' +
          '<td><button type="button" class="crozzo-cot-link-name" data-cot-open="' +
          esc(mp.id) +
          '">' +
          esc(mp.nombre) +
          '</button><br><span class="form-hint">' +
          esc(catLabel(mp.categoria)) +
          '</span></td>' +
          '<td class="crozzo-cot-sys">' +
          fmtMoney(mp.precioTotal) +
          '<br><span class="form-hint">' +
          esc(mp.peso) +
          ' ' +
          esc(mp.und) +
          '</span></td>' +
          '<td class="crozzo-cot-sys"><strong>' +
          esc(fmtUnit(mp.precioUnit, mp.und)) +
          '</strong></td>' +
          '<td>' +
          proxLabel +
          '</td>' +
          '<td>' +
          (best
            ? '<strong>' +
              esc(fmtUnit(best.precioUnit, best.und || mp.und)) +
              '</strong><br><span class="form-hint">' +
              esc(best.proveedorNombre || best.label) +
              '</span>'
            : '—') +
          '</td>' +
          '<td class="' +
          diffClass(row.diffPct) +
          '">' +
          esc(row.diffLabel) +
          '</td>' +
          '<td><span class="crozzo-cot-rec-inline crozzo-cot-rec--' +
          esc(row.rec.nivel) +
          '">' +
          esc(row.rec.texto) +
          '</span></td>' +
          '<td>' +
          expand +
          '</td>' +
          '<td><button type="button" class="btn btn-outline btn-sm crozzo-cot-open-work" data-mp-id="' +
          esc(mp.id) +
          '">Trabajar</button> ' +
          '<button type="button" class="btn btn-outline btn-sm crozzo-cot-recibir" data-mp-id="' +
          esc(mp.id) +
          '" data-precio="' +
          esc(best ? best.precioTotal : mp.precioTotal) +
          '" data-peso="' +
          esc(best ? best.peso : mp.peso) +
          '"' +
          (best ? ' data-prov="' + esc(best.proveedorNombre || '') + '"' : '') +
          '>Recepcionar</button></td></tr>'
        );
      })
      .join('');
  }
  function renderPdfPanel() {
    var url = ui.pdfUrl;
    if (!url) {
      return (
        '<div class="crozzo-cot-pdf-empty">' +
        '<p class="form-hint">Suba el PDF de la cotización del proveedor para consultarlo mientras arma el VS.</p>' +
        '<label class="btn btn-outline btn-sm crozzo-cot-pdf-label">Subir PDF<input type="file" id="crozzoCotPdfFile" accept="application/pdf,.pdf" hidden></label></div>'
      );
    }
    return (
      '<div class="crozzo-cot-pdf-active">' +
      '<div class="crozzo-cot-pdf-bar"><span class="form-hint" title="' +
      esc(ui.pdfName) +
      '">' +
      esc(ui.pdfName || 'Documento') +
      '</span>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotPdfClear">Cerrar</button>' +
      '<label class="btn btn-outline btn-sm">Cambiar<input type="file" id="crozzoCotPdfFile" accept="application/pdf,.pdf" hidden></label></div>' +
      '<iframe class="crozzo-cot-pdf-frame" src="about:blank" data-cot-pdf-blob="1" title="Cotización PDF"></iframe></div>'
    );
  }
  function injectStyles() {
    var el = document.getElementById('crozzo-cotizaciones-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-cotizaciones-css';
      document.head.appendChild(el);
    }
    el.textContent =
      '.crozzo-cot-wrap{--cot-gap:12px;--cot-gold:rgba(201,169,98,.45)}' +
      '.crozzo-cot-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
      '.crozzo-cot-tab{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;font-size:.85rem}' +
      '.crozzo-cot-tab--on{border-color:var(--accent);background:rgba(16,185,129,.12);font-weight:600}' +
      '.crozzo-cot-layout{display:grid;gap:var(--cot-gap);min-height:420px}' +
      '.crozzo-cot-stack{display:flex;flex-direction:column;gap:16px}' +
      '.crozzo-cot-sheet{border:1px solid var(--cot-gold);border-radius:14px;background:var(--bg-card);overflow:hidden;box-shadow:0 6px 28px rgba(0,0,0,.08)}' +
      '.crozzo-cot-sheet--empty .crozzo-cot-sheet-empty{padding:28px 20px;text-align:center;opacity:.9}' +
      '.crozzo-cot-sheet-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--cot-gold);background:linear-gradient(135deg,var(--bg-elevated) 0%,rgba(201,169,98,.14) 100%)}' +
      '.crozzo-cot-sheet-title{margin:0;font-size:1.12rem;font-weight:700;letter-spacing:.01em}' +
      '.crozzo-cot-btn-export{font-weight:700;letter-spacing:.03em;box-shadow:0 2px 8px rgba(0,0,0,.12)}' +
      '.crozzo-cot-sheet-table thead th{border-bottom:2px solid var(--accent);background:linear-gradient(180deg,var(--bg-secondary),var(--bg-card))}' +
      '.crozzo-cot-sheet-sub{margin:4px 0 0;font-size:.8rem}' +
      '.crozzo-cot-sheet-scroll{max-height:none;overflow:visible}' +
      '.crozzo-cot-plus-editor td{background:var(--bg-elevated)!important}' +
      '.crozzo-cot-inline-add-mini{display:grid;grid-template-columns:1fr minmax(170px,220px) auto;gap:8px;padding:8px}' +
      '@media(max-width:760px){.crozzo-cot-inline-add-mini{grid-template-columns:1fr}}' +
      '.crozzo-cot-sheet-table tbody tr:nth-child(even) td{background:rgba(0,0,0,.025)}' +
      '.crozzo-cot-sess-row{transition:background .12s}' +
      '.crozzo-cot-sess-row--on td{background:rgba(16,185,129,.12)!important;box-shadow:inset 4px 0 0 var(--accent)}' +
      '.crozzo-cot-sess-row:hover td{background:rgba(16,185,129,.06)}' +
      '.crozzo-cot-sess-num{width:36px;text-align:center;font-weight:700;opacity:.6}' +
      '.crozzo-cot-sess-act{white-space:nowrap}' +
      '.crozzo-cot-plus-row td{background:rgba(201,169,98,.08)!important;border-top:1px dashed var(--cot-gold)}' +
      '.crozzo-cot-plus-row .crozzo-cot-sess-num{font-size:1.05rem;color:var(--accent);opacity:1}' +
      '.crozzo-cot-plus-btn{font-weight:700}' +
      '.crozzo-cot-inline-result td{background:rgba(16,185,129,.05)!important}' +
      '.crozzo-cot-sess-draft{display:block;font-size:10px;opacity:.7;margin-top:2px}' +
      '.crozzo-cot-num{font-variant-numeric:tabular-nums}' +
      '.crozzo-cot-sub{display:block;font-size:10px;opacity:.72;font-weight:400;margin-top:2px}' +
      '.crozzo-cot-add{border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--bg-card)}' +
      '.crozzo-cot-add-title{margin:0 0 4px;font-size:.95rem}' +
      '.crozzo-cot-add-toolbar{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;margin-top:10px}' +
      '@media(max-width:720px){.crozzo-cot-add-toolbar{grid-template-columns:1fr}}' +
      '.crozzo-cot-picker-host{margin-top:12px}' +
      '.crozzo-cot-picker-scroll{max-height:min(28vh,240px)}' +
      '.crozzo-cot-picker-table tbody tr:nth-child(even) td{background:rgba(0,0,0,.02)}' +
      '.crozzo-cot-pick-row--in td{opacity:.85}' +
      '.crozzo-cot-add-hint{margin:8px 0 0;font-size:.85rem;opacity:.8}' +
      '.crozzo-cot-main-col{min-width:0;display:flex;flex-direction:column;gap:12px}' +
      '.crozzo-cot-offers-cell{min-width:200px;max-width:420px}' +
      '.crozzo-cot-offers{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}' +
      '.crozzo-cot-offers-empty{font-size:11px;opacity:.7}' +
      '.crozzo-cot-chip{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:7px 9px;border:1px solid var(--cot-gold);border-radius:10px;background:linear-gradient(180deg,var(--bg-card),var(--bg-elevated));font-size:11px;max-width:100%;box-shadow:0 1px 6px rgba(0,0,0,.05)}' +
      '.crozzo-cot-chip-name{flex:1 1 90px;min-width:72px;padding:4px 6px!important;font-size:11px!important;font-weight:600}' +
      '.crozzo-cot-chip-val{font-weight:700;font-variant-numeric:tabular-nums}' +
      '.crozzo-cot-chip-sub{width:100%;opacity:.75;font-size:10px}' +
      '.crozzo-cot-chip-edit,.crozzo-cot-chip-rm{padding:2px 6px!important;min-width:24px;font-size:12px;line-height:1}' +
      '.crozzo-cot-offer-add{flex:0 0 32px;width:32px;height:32px;border:2px dashed var(--accent);border-radius:8px;background:rgba(16,185,129,.08);color:var(--accent);font-size:1.2rem;font-weight:700;cursor:pointer}' +
      '.crozzo-cot-modal{position:fixed;inset:0;z-index:950;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.crozzo-cot-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.5)}' +
      '.crozzo-cot-modal-box{position:relative;width:min(400px,100%);max-height:90vh;overflow:auto;border-radius:14px;border:1px solid var(--cot-gold);border-top:3px solid var(--accent);background:var(--bg-card);padding:18px;box-shadow:0 20px 56px rgba(0,0,0,.28)}' +
      '.crozzo-cot-export-box{width:min(720px,96vw)}' +
      '.crozzo-cot-export-lead{margin:0 0 10px;font-size:.82rem;opacity:.88}' +
      '.crozzo-cot-export-preview{max-height:min(36vh,280px);margin-bottom:8px;border:1px solid var(--border);border-radius:10px}' +
      '.crozzo-cot-export-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}' +
      '.crozzo-cot-export-empty{text-align:center;padding:16px!important}' +
      '.crozzo-cot-export-more{margin:6px 0 0;font-size:11px}' +
      '.crozzo-cot-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}' +
      '.crozzo-cot-modal-title{margin:0;font-size:1rem}' +
      '.crozzo-cot-modal-sys{margin:0 0 10px;font-size:.8rem}' +
      '.crozzo-cot-modal-lbl{display:block;font-size:10px;font-weight:600;opacity:.8;margin:8px 0 4px}' +
      '.crozzo-cot-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.crozzo-cot-modal-span{grid-column:1/-1}' +
      '.crozzo-cot-modal-chk{display:block;font-size:12px;margin:10px 0}' +
      '.crozzo-cot-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '.crozzo-cot-quick-recent{margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}' +
      '.crozzo-cot-sys-cell{white-space:nowrap}' +
      '.crozzo-cot-add--compact{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px;border:1px dashed var(--border);border-radius:10px;background:var(--bg-elevated)}' +
      '.crozzo-cot-add-compact-hint{margin:0;font-size:.8rem}' +
      '.crozzo-cot-col-actions{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}' +
      '.crozzo-cot-compare-row{display:flex;flex-wrap:nowrap;gap:10px;overflow-x:auto;padding-bottom:8px;align-items:stretch}' +
      '.crozzo-cot-col-add{flex:0 0 52px;min-height:120px;border:2px dashed var(--accent);border-radius:10px;background:rgba(16,185,129,.06);color:var(--accent);font-size:1.6rem;font-weight:700;cursor:pointer}' +
      '.crozzo-cot-col{flex:0 0 min(260px,85vw);border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--bg-card);display:flex;flex-direction:column}' +
      '.crozzo-cot-col--sys{border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.08)}' +
      '.crozzo-cot-col-head{margin-bottom:10px}' +
      '.crozzo-cot-prov-name{width:100%;font-weight:600;font-size:.9rem;margin-bottom:6px}' +
      '.crozzo-cot-col-body label{display:block;font-size:10px;opacity:.75;margin:6px 0 2px}' +
      '.crozzo-cot-col-body input,.crozzo-cot-col-body select{width:100%;margin-bottom:4px}' +
      '.crozzo-cot-mi-chk{display:block;font-size:11px;margin:0 0 8px}' +
      '.crozzo-cot-col-lote{font-size:1.05rem;font-weight:700;margin:0}' +
      '.crozzo-cot-row-hint{margin:0 0 10px}' +
      '.crozzo-cot-hint-plus{display:inline-block;width:22px;text-align:center;font-weight:700;color:var(--accent)}' +
      '.crozzo-cot-picker{border:1px solid var(--border);border-radius:10px;background:var(--bg-card);max-height:70vh;overflow:auto;display:flex;flex-direction:column}' +
      '.crozzo-cot-picker-item{display:block;width:100%;text-align:left;padding:10px 12px;border:none;border-bottom:1px solid var(--border);background:transparent;color:inherit;cursor:pointer}' +
      '.crozzo-cot-picker-item:hover,.crozzo-cot-picker-item--on{background:rgba(16,185,129,.1)}' +
      '.crozzo-cot-picker-name{display:block;font-weight:600;font-size:.85rem}' +
      '.crozzo-cot-picker-meta{font-size:11px;opacity:.75}' +
      '.crozzo-cot-work-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}' +
      '.crozzo-cot-work-title{margin:0;font-size:1.1rem}' +
      '.crozzo-cot-vs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}' +
      '.crozzo-cot-card{border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--bg-card)}' +
      '.crozzo-cot-card--sys{border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.06)}' +
      '.crozzo-cot-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px}' +
      '.crozzo-cot-card-inps{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px}' +
      '.crozzo-cot-card-inps label{grid-column:span 2;margin:0;opacity:.8}' +
      '.crozzo-cot-card-inps input,.crozzo-cot-card-inps select{grid-column:span 1}' +
      '.crozzo-cot-card-unit{font-weight:700;color:var(--accent);margin:8px 0 4px;font-variant-numeric:tabular-nums}' +
      '.crozzo-cot-tag{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px}' +
      '.crozzo-cot-tag--mine{background:rgba(33,150,243,.2);color:#64b5f6}' +
      '.crozzo-cot-tag--rival{background:rgba(255,152,0,.2);color:#ffb74d}' +
      '.crozzo-cot-delta{font-size:11px;margin-top:6px;padding:8px;border-radius:6px;background:var(--bg-elevated)}' +
      '.crozzo-cot-delta--mejora{border-left:3px solid #4caf50}' +
      '.crozzo-cot-delta--empeora{border-left:3px solid #f44336}' +
      '.crozzo-cot-delta-pct{font-weight:700;display:block}' +
      '.crozzo-cot-delta-hint,.crozzo-cot-delta-formula{display:block;opacity:.8;margin-top:2px}' +
      '.crozzo-cot-diff--ok{color:#4caf50;font-weight:700}' +
      '.crozzo-cot-diff--warn{color:#f44336;font-weight:700}' +
      '.crozzo-cot-rec{max-width:360px;padding:10px 12px;border-radius:8px;font-size:.85rem}' +
      '.crozzo-cot-rec--ok{background:rgba(76,175,80,.12)}' +
      '.crozzo-cot-rec--warn{background:rgba(244,67,54,.1)}' +
      '.crozzo-cot-rec-label{font-size:10px;font-weight:700;text-transform:uppercase;opacity:.7;display:block}' +
      '.crozzo-cot-rec-inline{font-size:11px;display:block;max-width:200px}' +
      '.crozzo-cot-pdf-panel{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-card);display:flex;flex-direction:column;max-height:75vh}' +
      '.crozzo-cot-pdf-frame{flex:1;min-height:320px;width:100%;border:0}' +
      '.crozzo-cot-pdf-bar{display:flex;gap:6px;align-items:center;padding:8px;flex-wrap:wrap;border-bottom:1px solid var(--border)}' +
      '.crozzo-cot-pdf-empty{padding:20px;text-align:center}' +
      '.crozzo-cot-link-name{background:none;border:none;color:var(--accent);cursor:pointer;font-weight:600;padding:0;text-align:left}' +
      '.crozzo-cot-export-bar{display:flex;gap:8px;flex-wrap:wrap}' +
      '.crozzo-cot-form-block{margin-top:16px}' +
      '.crozzo-cot-alert-extreme{display:block;margin-top:6px;padding:8px;border-radius:6px;background:rgba(244,67,54,.12);color:#ffb74d;font-size:11px;font-weight:600}' +
      '.crozzo-cot-recent-prov{margin:12px 0 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.crozzo-cot-recent-label{font-size:11px;font-weight:600;opacity:.85}' +
      '.crozzo-cot-session-summary{margin-top:16px}' +
      '.crozzo-cot-summary-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}' +
      '.crozzo-cot-save-block{margin-top:12px;font-size:.9rem}';
  }
  function refreshQuickModal(host) {
    host = getCotRoot(host) || host;
    if (!host) return;
    var old = host.querySelector('#crozzoCotQuickModal');
    if (old) old.remove();
    if (!ui.quickMpId || !getMp(ui.quickMpId)) return;
    host.insertAdjacentHTML('beforeend', renderQuickModal());
  }

  function renderPanel() {
    injectStyles();
    rebuildIndex();
    return (
      '<div class="crozzo-mod-page crozzo-cot-wrap">' +
      '<p class="crozzo-mod-lead crozzo-cot-lead">Cotizaciones vs costeo</p>' +
      '<p class="form-hint crozzo-cot-sublead">Resumen arriba · <strong>+</strong> para cotizar · sin confirmaciones molestas.</p>' +
      '<nav class="crozzo-mod-nav crozzo-mod-nav--links" aria-label="Accesos compras">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotGoRecepcion">Entrada de factura</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotGoCosteo">Costeo MP</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotGoProveedores">Proveedores</button></nav>' +
      '<div class="crozzo-cot-main-col">' +
      '<div id="crozzoCotSessionSheetHost">' +
      renderSessionSheet() +
      '</div></div>' +
      (ui.quickMpId ? renderQuickModal() : '') +
      (ui.exportOpen ? renderExportModal() : '') +
      '</div>'
    );
  }
  function refreshCompare(host, opts) {
    opts = opts || {};
    host = getCotRoot(host) || host;
    if (!host) return;
    if (!opts.skipSheet) refreshSessionSheet(host);
    if (!opts.skipModal) refreshQuickModal(host);
    if (!opts.skipExport) refreshExportModal(host);
  }

  function saveVsFromColumn(mpId, scId, root) {
    var ws = getWs();
    var ex = (ws.vsExtra[mpId] || []).find(function (x) {
      return x.id === scId;
    });
    if (!ex) return toast('Columna no encontrada', 'warning');
    var nom = String(ex.proveedorNombre || ex.label || '').trim();
    if (!nom) return toast('Escriba el nombre del proveedor arriba', 'warning');
    var pTotal = num(ex.precioTotal);
    if (pTotal <= 0) return toast('Indique precio del lote', 'warning');
    var mp = getMp(mpId);
    var res = R();
    if (!res || !res.addCotizacionMp) return;
    res.addCotizacionMp({
      mpId: mpId,
      proveedorId: null,
      proveedorNombre: nom,
      peso: num(ex.peso) || (mp && mp.peso) || 1000,
      und: ex.und || (mp && mp.und) || 'GR',
      precioTotal: pTotal,
      fecha: new Date().toISOString().slice(0, 10),
      notas: '',
      esMiEmpresa: !!ex.esMiEmpresa,
    });
    touchRecentProvider(nom, ex.esMiEmpresa);
    removeVsSlot(mpId, scId);
    toast('Cotización de «' + nom + '» guardada', 'success');
    refreshCompare(root);
  }
  function ensureProximoCard(mp) {
    var ws = getWs();
    if (!ws.proximo[mp.id]) {
      ws.proximo[mp.id] = {
        precioTotal: num(mp.precioTotal),
        peso: num(mp.peso),
        und: String(mp.und || 'GR').toUpperCase(),
      };
      persistWs();
    }
  }
  function updateWorkspaceField(mpId, scId, field, value) {
    var ws = getWs();
    var mp = getMp(mpId);
    if (!mp) return;
    if (scId === 'proximo') {
      if (!ws.proximo[mpId]) ws.proximo[mpId] = { precioTotal: 0, peso: num(mp.peso), und: mp.und };
      ws.proximo[mpId][field] = field === 'und' ? String(value).toUpperCase() : num(value);
      persistWs();
      var rootPx = getCotRoot(document.getElementById('mainContent')) || document.getElementById('mainContent');
      if (rootPx) scheduleVsPatch(rootPx, mpId);
      return;
    }
    var extras = ws.vsExtra[mpId] || [];
    var ex = extras.find(function (x) {
      return x.id === scId;
    });
    if (!ex) return;
    if (field === 'proveedorNombre') {
      ex.proveedorNombre = String(value);
      ex.label = ex.proveedorNombre || 'Oferta';
      persistWs();
      return;
    }
    if (field === 'esMiEmpresa') {
      ex.esMiEmpresa = !!value;
      persistWs();
      return;
    }
    ex[field] = field === 'und' ? String(value).toUpperCase() : num(value);
    ex.precioUnit = calcUnit(ex.precioTotal, ex.peso);
    persistWs();
    var rootWs = getCotRoot(document.getElementById('mainContent')) || document.getElementById('mainContent');
    if (rootWs) scheduleVsPatch(rootWs, mpId);
  }
  function addVsSlot(mpId) {
    var mp = getMp(mpId);
    if (!mp) return;
    var ws = getWs();
    if (!ws.vsExtra[mpId]) ws.vsExtra[mpId] = [];
    var slot = {
      id: uid('vs'),
      label: 'Nueva oferta',
      proveedorNombre: '',
      esMiEmpresa: false,
      precioTotal: 0,
      peso: num(mp.peso) || 1000,
      und: String(mp.und || 'GR').toUpperCase(),
    };
    ws.vsExtra[mpId].push(slot);
    persistWs();
    ui.focusMpId = mpId;
    refreshCompare(getCotRoot(document.getElementById('mainContent')) || document.getElementById('mainContent'));
  }
  function removeVsSlot(mpId, scId) {
    var ws = getWs();
    ws.vsExtra[mpId] = (ws.vsExtra[mpId] || []).filter(function (x) {
      return x.id !== scId;
    });
    persistWs();
    refreshCompare(getCotRoot(document.getElementById('mainContent')) || document.getElementById('mainContent'));
  }
  function exportFileStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function triggerDownload(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 600);
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildExportPack(sessionOnly) {
    var ids = sessionOnly ? getWs().sessionMpIds || [] : [];
    var resumen = [];
    var detalle = [];
    ids.forEach(function (id, idx) {
      var mp = getMp(id);
      if (!mp) return;
      var quotes = listQuotes(mp);
      var sysU = num(mp.precioUnit);
      var scenarios = buildScenarios(mp);
      var rec = recommendForMp(mp, scenarios);
      var best = rec.ref && rec.ref.tipo === 'cotizacion' ? rec.ref : quotes[0] || null;
      var delta = best && sysU > 0 ? calcDelta(sysU, best.precioUnit, mp.precioTotal, best.precioTotal) : null;
      resumen.push({
        No: idx + 1,
        Producto: mp.nombre,
        Grupo: catLabel(mp.categoria),
        'Costeo sistema (COP)': Math.round(mp.precioTotal),
        'Referencia sistema': mp.peso + ' ' + mp.und,
        '$/und sistema': Number(sysU.toFixed(4)),
        'Mejor proveedor': best ? best.proveedorNombre || best.label || '' : '',
        '$/und mejor': best ? Number(num(best.precioUnit).toFixed(4)) : '',
        'Δ vs sistema': delta ? delta.label : '—',
        'Nº cotizaciones': quotes.length,
      });
      quotes.forEach(function (q) {
        var d = calcDelta(sysU, q.precioUnit, mp.precioTotal, q.precioTotal);
        detalle.push({
          Producto: mp.nombre,
          Grupo: catLabel(mp.categoria),
          Proveedor: q.proveedorNombre || q.label || '',
          'Precio lote (COP)': Math.round(q.precioTotal),
          'Cantidad ref.': q.peso,
          Unidad: q.und,
          '$/und': Number(num(q.precioUnit).toFixed(4)),
          'Δ vs sistema': d.label || '—',
          Tipo: q.esMiEmpresa ? 'Mi proveedor' : 'Competencia',
          Fecha: q.fecha || '',
        });
      });
    });
    return {
      resumen: resumen,
      detalle: detalle,
      meta: {
        titulo: 'Cotización vs costeo — Crozzo POS',
        fecha: exportFileStamp(),
        productos: resumen.length,
        cotizaciones: detalle.length,
      },
    };
  }

  function buildReportRows(sessionOnly) {
    return buildExportPack(!!sessionOnly).resumen;
  }

  function renderExportModal() {
    if (!ui.exportOpen) return '';
    var pack = buildExportPack(true);
    var preview = pack.detalle.slice(0, 12);
    var prevRows = preview.length
      ? preview
          .map(function (r) {
            return (
              '<tr><td>' +
              esc(r.Producto) +
              '</td><td>' +
              esc(r.Proveedor) +
              '</td><td class="crozzo-cot-num">' +
              esc(fmtMoney(r['Precio lote (COP)'])) +
              '</td><td>' +
              esc(r['Cantidad ref.'] + ' ' + r.Unidad) +
              '</td><td class="crozzo-cot-num">' +
              esc('$' + r['$/und']) +
              '</td><td>' +
              esc(r['Δ vs sistema']) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="6" class="crozzo-cot-export-empty">Sin cotizaciones registradas aún.</td></tr>';
    return (
      '<div class="crozzo-cot-modal crozzo-cot-export-modal" id="crozzoCotExportModal" role="dialog" aria-modal="true">' +
      '<div class="crozzo-cot-modal-backdrop" id="crozzoCotExportBackdrop"></div>' +
      '<div class="crozzo-cot-modal-box crozzo-cot-export-box">' +
      '<div class="crozzo-cot-modal-head">' +
      '<div><h3 class="crozzo-cot-modal-title">Exportar cotización</h3>' +
      '<p class="form-hint crozzo-cot-export-meta">' +
      pack.meta.productos +
      ' producto(s) · ' +
      pack.meta.cotizaciones +
      ' cotización(es) · ' +
      esc(pack.meta.fecha) +
      '</p></div>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotExportClose">✕</button></div>' +
      '<p class="crozzo-cot-export-lead">Para subir en <strong>Entrada de factura</strong> use <strong>Imagen PNG</strong> (botón Foto). El PDF es opcional.</p>' +
      '<div class="crozzo-mod-table-scroll crozzo-cot-export-preview">' +
      '<table class="crozzo-mod-table crozzo-cot-export-table"><thead><tr>' +
      '<th>Producto</th><th>Proveedor</th><th>Lote</th><th>Ref.</th><th>$/und</th><th>Δ</th>' +
      '</tr></thead><tbody>' +
      prevRows +
      '</tbody></table></div>' +
      (pack.detalle.length > 12
        ? '<p class="form-hint crozzo-cot-export-more">+' + (pack.detalle.length - 12) + ' filas más en el archivo descargado.</p>'
        : '') +
      '<div class="crozzo-cot-export-actions">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-cot-btn-export" id="crozzoCotExportSessionPng">Imagen PNG (para factura)</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotExportSessionXlsx">Excel (.xlsx)</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotExportSessionPdf">PDF</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCotExportSessionCsv">CSV</button></div></div></div>'
    );
  }

  function refreshExportModal(host) {
    host = getCotRoot(host) || host;
    if (!host) return;
    var old = host.querySelector('#crozzoCotExportModal');
    if (old) old.remove();
    if (!ui.exportOpen) return;
    host.insertAdjacentHTML('beforeend', renderExportModal());
  }

  function downloadCsvPack(pack) {
    pack = pack || buildExportPack(true);
    if (!pack.resumen.length) return toast('No hay datos para exportar', 'warning');
    var lines = ['=== RESUMEN ===', Object.keys(pack.resumen[0]).join(';')];
    pack.resumen.forEach(function (r) {
      lines.push(
        Object.keys(pack.resumen[0])
          .map(function (h) {
            return '"' + String(r[h] == null ? '' : r[h]).replace(/"/g, '""') + '"';
          })
          .join(';')
      );
    });
    lines.push('', '=== COTIZACIONES ===');
    if (pack.detalle.length) {
      lines.push(Object.keys(pack.detalle[0]).join(';'));
      pack.detalle.forEach(function (r) {
        lines.push(
          Object.keys(pack.detalle[0])
            .map(function (h) {
              return '"' + String(r[h] == null ? '' : r[h]).replace(/"/g, '""') + '"';
            })
            .join(';')
        );
      });
    }
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var ok = triggerDownload(blob, 'Crozzo_Cotizacion_' + exportFileStamp() + '.csv');
    if (ok) toast('CSV descargado', 'success');
    else toast('No se pudo descargar CSV en este entorno', 'error');
  }
  function ensureXlsx() {
    return new Promise(function (resolve, reject) {
      if (global.XLSX) return resolve(global.XLSX);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = function () {
        resolve(global.XLSX);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function loadPdfLib() {
    return new Promise(function (resolve, reject) {
      if (global.PDFLib && global.PDFLib.PDFDocument) return resolve(global.PDFLib);
      var existing = document.querySelector('script[data-cxf-pdf-lib],script[data-cot-pdf-lib]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve(global.PDFLib);
        });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.async = true;
      s.setAttribute('data-cot-pdf-lib', '1');
      s.onload = function () {
        if (global.PDFLib && global.PDFLib.PDFDocument) resolve(global.PDFLib);
        else reject(new Error('pdf-lib no disponible'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar pdf-lib'));
      };
      document.head.appendChild(s);
    });
  }

  function canvasWrapLines(text, maxChars) {
    maxChars = maxChars || 92;
    var words = String(text == null ? '' : text)
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var next = line ? line + ' ' + w : w;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = w;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  function comparativoLineForMp(mp, idx) {
    var scenarios = buildScenarios(mp);
    var rec = recommendForMp(mp, scenarios);
    var sysU = num(mp.precioUnit);
    var delta =
      rec.ref && sysU > 0
        ? calcDelta(sysU, rec.ref.precioUnit, mp.precioTotal, rec.ref.precioTotal)
        : null;
    return (
      idx +
      1 +
      '. ' +
      mp.nombre +
      ' | Sys: ' +
      fmtUnit(sysU, mp.und) +
      (delta && delta.label ? ' | Var: ' + delta.label : '') +
      ' | ' +
      (rec.texto || '')
    );
  }

  function buildComparativoPdfLines(sessionOnly) {
    var ids = sessionOnly ? getWs().sessionMpIds || [] : [];
    var out = [];
    ids.forEach(function (id, idx) {
      var mp = getMp(id);
      if (!mp) return;
      pdfWrapLines(comparativoLineForMp(mp, idx), 96).forEach(function (ln) {
        out.push(ln);
      });
    });
    return out;
  }

  function buildComparativoDisplayLines(sessionOnly) {
    var ids = sessionOnly ? getWs().sessionMpIds || [] : [];
    var out = [];
    ids.forEach(function (id, idx) {
      var mp = getMp(id);
      if (!mp) return;
      canvasWrapLines(comparativoLineForMp(mp, idx), 92).forEach(function (ln) {
        out.push(ln);
      });
    });
    return out;
  }

  function dataUrlToUint8Array(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    var base64 = parts.length > 1 ? parts[1] : parts[0];
    var bin = atob(base64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function buildComparativoCanvasPage(lines, title, subtitle, pageNum, totalPages) {
    var pw = 595;
    var ph = 842;
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(pw * scale);
    canvas.height = Math.round(ph * scale);
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pw, ph);
    var y = 52;
    var mx = 44;
    if (title) {
      ctx.fillStyle = '#2a2418';
      ctx.font = 'bold 17px Arial, Helvetica, sans-serif';
      ctx.fillText(String(title), mx, y);
      y += 26;
    }
    if (subtitle) {
      ctx.fillStyle = '#555555';
      ctx.font = '11px Arial, Helvetica, sans-serif';
      ctx.fillText(String(subtitle), mx, y);
      y += 24;
    }
    ctx.fillStyle = '#111111';
    ctx.font = '10px Arial, Helvetica, sans-serif';
    (lines || []).forEach(function (ln) {
      if (y > ph - 56) return;
      ctx.fillText(String(ln), mx, y);
      y += 14;
    });
    ctx.fillStyle = '#888888';
    ctx.font = '8px Arial, Helvetica, sans-serif';
    ctx.fillText('Crozzo POS · Cotizaciones vs costeo', mx, ph - 26);
    if (totalPages > 1) {
      ctx.fillText('Pág. ' + pageNum + ' / ' + totalPages, pw - 100, ph - 26);
    }
    return canvas;
  }
  function xlsxSetColWidths(ws, rows) {
    if (!rows || !rows.length) return ws;
    var keys = Object.keys(rows[0]);
    ws['!cols'] = keys.map(function (k) {
      var max = k.length;
      rows.forEach(function (r) {
        var len = String(r[k] == null ? '' : r[k]).length;
        if (len > max) max = len;
      });
      return { wch: Math.min(42, Math.max(10, max + 2)) };
    });
    return ws;
  }

  function exportXlsx(sessionOnly) {
    var pack = buildExportPack(!!sessionOnly);
    if (!pack.resumen.length) return toast('No hay productos en la cotización para exportar', 'warning');
    ensureXlsx()
      .then(function (XLSX) {
        var wb = XLSX.utils.book_new();
        var portada = [
          { Campo: 'Título', Valor: pack.meta.titulo },
          { Campo: 'Fecha', Valor: pack.meta.fecha },
          { Campo: 'Productos', Valor: pack.meta.productos },
          { Campo: 'Cotizaciones', Valor: pack.meta.cotizaciones },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(portada), 'Portada');
        XLSX.utils.book_append_sheet(
          wb,
          xlsxSetColWidths(XLSX.utils.json_to_sheet(pack.resumen), pack.resumen),
          'Resumen'
        );
        if (pack.detalle.length) {
          XLSX.utils.book_append_sheet(
            wb,
            xlsxSetColWidths(XLSX.utils.json_to_sheet(pack.detalle), pack.detalle),
            'Cotizaciones'
          );
        }
        var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var blob = new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        var ok = triggerDownload(blob, 'Crozzo_Cotizacion_' + exportFileStamp() + '.xlsx');
        if (ok) toast('Excel generado', 'success');
        else toast('No se pudo descargar Excel en este entorno', 'error');
      })
      .catch(function () {
        toast('No se pudo cargar Excel; use CSV', 'error');
      });
  }

  function applyCotPdfFrame(root) {
    if (!root || !root.querySelector) return;
    var iframe = root.querySelector('iframe[data-cot-pdf-blob]');
    if (!iframe || !ui.pdfUrl) return;
    iframe.src = ui.pdfUrl;
  }

  function exportPng(sessionOnly) {
    var pack = buildExportPack(!!sessionOnly);
    if (!pack.resumen.length) return toast('No hay productos en la cotización para exportar', 'warning');
    var bodyLines = buildComparativoDisplayLines(!!sessionOnly);
    if (!bodyLines.length) {
      pack.resumen.forEach(function (r, i) {
        canvasWrapLines(
          i + 1 + '. ' + r.Producto + ' | ' + (r['Mejor proveedor'] || '—') + ' | ' + (r['Δ vs sistema'] || '—'),
          92
        ).forEach(function (ln) {
          bodyLines.push(ln);
        });
      });
    }
    var title = 'Comparativo de cotizaciones · Crozzo POS';
    var subtitle =
      pack.meta.fecha +
      '  |  ' +
      pack.meta.productos +
      ' producto(s)  |  ' +
      pack.meta.cotizaciones +
      ' cotización(es)';
    var perPage = 46;
    var pageCount = Math.max(1, Math.ceil(bodyLines.length / perPage));
    var canvas = buildComparativoCanvasPage(bodyLines.slice(0, perPage), title, subtitle, 1, pageCount);
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        function (blob) {
          if (!blob) return toast('No se pudo generar la imagen', 'error');
          var ok = triggerDownload(blob, 'cotizaciones_costeo_' + exportFileStamp() + '.png');
          if (ok) toast('PNG listo — en Entrada de factura use botón Foto', 'success');
          else toast('No se pudo descargar la imagen', 'error');
        },
        'image/png',
        0.92
      );
      return;
    }
    var dataUrl = canvas.toDataURL('image/png');
    var ok = triggerDownload(
      dataUrlToBlobFromDataUrl(dataUrl),
      'cotizaciones_costeo_' + exportFileStamp() + '.png'
    );
    if (ok) toast('PNG listo — en Entrada de factura use botón Foto', 'success');
  }

  function dataUrlToBlobFromDataUrl(dataUrl) {
    var parts = String(dataUrl).split(',');
    var bin = atob(parts[1] || parts[0]);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new Blob([out], { type: 'image/png' });
  }

  function exportPdf(sessionOnly) {
    var pack = buildExportPack(!!sessionOnly);
    if (!pack.resumen.length) return toast('No hay productos en la cotización para exportar', 'warning');
    var bodyLines = buildComparativoDisplayLines(!!sessionOnly);
    if (!bodyLines.length) {
      pack.resumen.forEach(function (r, i) {
        canvasWrapLines(
          i + 1 + '. ' + r.Producto + ' | ' + (r['Mejor proveedor'] || '—') + ' | ' + (r['Δ vs sistema'] || '—'),
          92
        ).forEach(function (ln) {
          bodyLines.push(ln);
        });
      });
    }
    var title = 'Comparativo de cotizaciones · Crozzo POS';
    var subtitle =
      pack.meta.fecha +
      '  |  ' +
      pack.meta.productos +
      ' producto(s)  |  ' +
      pack.meta.cotizaciones +
      ' cotización(es)';
    var perPage = 46;
    var pageCount = Math.max(1, Math.ceil(bodyLines.length / perPage));
    var pageW = 595.28;
    var pageH = 841.89;
    loadPdfLib()
      .then(function (PDFLib) {
        return PDFLib.PDFDocument.create().then(function (pdfDoc) {
          var chain = Promise.resolve();
          for (var p = 0; p < pageCount; p++) {
            (function (pi) {
              chain = chain.then(function () {
                var chunk = bodyLines.slice(pi * perPage, (pi + 1) * perPage);
                var canvas = buildComparativoCanvasPage(
                  chunk,
                  pi === 0 ? title : '',
                  pi === 0 ? subtitle : '',
                  pi + 1,
                  pageCount
                );
                var jpgBytes = dataUrlToUint8Array(canvas.toDataURL('image/jpeg', 0.9));
                return pdfDoc.embedJpg(jpgBytes).then(function (jpg) {
                  var page = pdfDoc.addPage([pageW, pageH]);
                  page.drawImage(jpg, { x: 0, y: 0, width: pageW, height: pageH });
                });
              });
            })(p);
          }
          return chain.then(function () {
            return pdfDoc.save();
          });
        });
      })
      .then(function (bytes) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var ok = triggerDownload(blob, 'cotizaciones_costeo_' + exportFileStamp() + '.pdf');
        if (ok) toast('PDF generado correctamente', 'success');
        else toast('No se pudo descargar PDF en este entorno', 'error');
      })
      .catch(function (err) {
        console.error('[Cotizaciones] exportPdf', err);
        toast('No se pudo generar PDF; use Excel o CSV', 'error');
      });
  }
  function saveCotizacion(root, mpOverride) {
    var mp = root.querySelector('#crozzoCotNewMp');
    var mpId = mpOverride || (mp && mp.value) || ui.focusMpId;
    if (!mpId) return toast('Seleccione materia prima', 'warning');
    var mpRow = getMp(mpId);
    var prov = root.querySelector('#crozzoCotNewProv') || root.querySelector('#crozzoCotNewProvQuick');
    var provTxt = root.querySelector('#crozzoCotNewProvTxt');
    var peso = root.querySelector('#crozzoCotNewPeso');
    var precio = root.querySelector('#crozzoCotNewPrecio');
    var notas = root.querySelector('#crozzoCotNewNotas');
    var fechaInp = root.querySelector('#crozzoCotNewFecha');
    var chkMi = root.querySelector('#crozzoCotEsMiEmpresa');
    var und = (mpRow && mpRow.und) || 'GR';
    var provId = prov && prov.value;
    var provNom = (provTxt && provTxt.value.trim()) || 'Proveedor';
    if (provId && prov.options[prov.selectedIndex]) provNom = prov.options[prov.selectedIndex].text;
    var pTotal = Number(precio && precio.value) || 0;
    if (pTotal <= 0) return toast('Indique precio del lote', 'warning');
    var res = R();
    if (!res || !res.addCotizacionMp) return;
    res.addCotizacionMp({
      mpId: mpId,
      proveedorId: provId || null,
      proveedorNombre: provNom,
      peso: Number(peso && peso.value) || (mpRow && mpRow.peso) || 1000,
      und: und,
      precioTotal: pTotal,
      fecha: (fechaInp && fechaInp.value) || new Date().toISOString().slice(0, 10),
      notas: (notas && notas.value) || '',
      esMiEmpresa: !(chkMi && !chkMi.checked),
    });
    touchRecentProvider(provNom, !(chkMi && !chkMi.checked));
    toast('Cotización guardada', 'success');
    if (precio) precio.value = '';
    if (notas) notas.value = '';
    refreshCompare(root);
  }
  function init(host) {
    if (!host) return;
    var root = getCotRoot(host) || host.querySelector('.crozzo-mod-page') || host;
    rebuildIndex();
    getWs._cache = loadWorkspace();
    var fecha = root.querySelector('#crozzoCotNewFecha');
    if (fecha && !fecha.value) fecha.value = new Date().toISOString().slice(0, 10);
    applyCotPdfFrame(root);
    if (!root._cotBound) {
      root._cotBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function () {
        mpIndex = null;
        if (root.isConnected) refreshCompare(root);
      });
      document.addEventListener('crozzo-cotizaciones-mp:changed', function () {
        if (root.isConnected) refreshCompare(root);
      });
    }
    root.addEventListener('click', function (e) {
      if (
        e.target.id === 'crozzoCotModalClose' ||
        e.target.id === 'crozzoCotModalClose2' ||
        e.target.id === 'crozzoCotModalBackdrop'
      ) {
        closeQuickForm();
        return;
      }
      if (e.target.id === 'crozzoCotQuickSave') {
        saveQuickForm(root);
        return;
      }
      var quickRec = e.target.closest('.crozzo-cot-quick-rec');
      if (quickRec) {
        var inp = root.querySelector('#cotQuickProv');
        if (inp) inp.value = quickRec.getAttribute('data-quick-prov') || '';
        return;
      }
      var addOffer = e.target.closest('[data-cot-add-offer]');
      if (addOffer) {
        e.stopPropagation();
        var oid = addOffer.getAttribute('data-cot-add-offer');
        var ws = getWs();
        if (!ws.sessionMpIds) ws.sessionMpIds = [];
        if (ws.sessionMpIds.indexOf(oid) < 0) {
          ws.sessionMpIds.push(oid);
          persistWs();
        }
        openQuickForm(oid);
        return;
      }
      var editCot = e.target.closest('[data-cot-edit-cot]');
      if (editCot) {
        e.stopPropagation();
        openQuickForm(editCot.getAttribute('data-mp-id'), editCot.getAttribute('data-cot-edit-cot'));
        return;
      }
      var delCot = e.target.closest('[data-cot-del-cot]');
      if (delCot && R() && R().removeCotizacionMp) {
        e.stopPropagation();
        R().removeCotizacionMp(delCot.getAttribute('data-cot-del-cot'));
        refreshCompare(root);
        toast('Cotización quitada', 'info');
        return;
      }
      if (e.target.id === 'crozzoCotToggleAdd' || e.target.closest('.crozzo-cot-add-toggle')) {
        ui.addOpen = !ui.addOpen;
        refreshAddSection(root);
        if (ui.addOpen) {
          setTimeout(function () {
            var si = root.querySelector('#crozzoCotSearch');
            if (si) si.focus();
          }, 60);
        }
        return;
      }
      if (e.target.id === 'crozzoCotGoRecepcion' && typeof global.navigateTo === 'function') {
        global.navigateTo('compras-recepcion');
      }
      if (e.target.id === 'crozzoCotGoCosteo' && typeof global.navigateTo === 'function') {
        global.navigateTo('costos-matriz');
        setTimeout(function () {
          var tab = document.querySelector('[data-matriz-tab="costeo-mp"]');
          if (tab) tab.click();
        }, 250);
      }
      if (e.target.id === 'crozzoCotGoProveedores' && typeof global.navigateTo === 'function') {
        global.navigateTo('compras-proveedores');
      }
      if (e.target.id === 'crozzoCotOpenExport') {
        openExportModal();
        return;
      }
      if (e.target.id === 'crozzoCotFocusAdd') {
        if (!ui.addOpen) ui.q = '';
        ui.addOpen = true;
        refreshAddSection(root);
        setTimeout(function () {
          var si = root.querySelector('#crozzoCotSearch');
          if (si) si.focus();
        }, 50);
        return;
      }
      if (
        e.target.id === 'crozzoCotExportClose' ||
        e.target.id === 'crozzoCotExportBackdrop'
      ) {
        closeExportModal();
        return;
      }
      if (e.target.id === 'crozzoCotExportSessionPng') {
        exportPng(true);
        return;
      }
      if (e.target.id === 'crozzoCotExportSessionXlsx') {
        exportXlsx(true);
        return;
      }
      if (e.target.id === 'crozzoCotExportSessionPdf') {
        exportPdf(true);
        return;
      }
      if (e.target.id === 'crozzoCotExportSessionCsv') {
        downloadCsvPack(buildExportPack(true));
        return;
      }
      var recProv = e.target.closest('.crozzo-cot-recent-prov-btn');
      if (recProv) {
        addVsFromRecent(recProv.getAttribute('data-mp-id'), recProv.getAttribute('data-prov-rec'));
        return;
      }
      var del = e.target.closest('.crozzo-cot-del');
      if (del && R() && R().removeCotizacionMp) {
        R().removeCotizacionMp(del.getAttribute('data-cot-id'));
        refreshCompare(root);
        toast('Cotización quitada', 'info');
      }
      var rec = e.target.closest('.crozzo-cot-recibir');
      if (rec && typeof global.navigateTo === 'function') {
        window.__crozzoRecepcionPrefill = {
          mpId: rec.getAttribute('data-mp-id'),
          precioTotal: Number(rec.getAttribute('data-precio')) || 0,
          peso: Number(rec.getAttribute('data-peso')) || 0,
          proveedorNombre: rec.getAttribute('data-prov') || '',
        };
        global.navigateTo('compras-recepcion');
        toast('Abra recepción con el precio cotizado', 'info');
      }
      var addIdBtn = e.target.closest('[data-cot-add-id]');
      if (addIdBtn) {
        e.stopPropagation();
        var addMpId = addIdBtn.getAttribute('data-cot-add-id');
        selectProduct(addMpId);
        openQuickForm(addMpId);
        return;
      }
      if (e.target.id === 'crozzoCotAddFirst') {
        var first = searchHits(1)[0];
        if (first) {
          selectProduct(first.mp.id);
          openQuickForm(first.mp.id);
        } else toast('Escriba un producto para agregar', 'warning');
        return;
      }
      var rmSess = e.target.closest('[data-cot-remove-session]');
      if (rmSess) {
        e.stopPropagation();
        removeFromSession(rmSess.getAttribute('data-cot-remove-session'));
        toast('Producto quitado de la lista', 'info');
        return;
      }
      var pick = e.target.closest('[data-cot-pick]');
      if (pick) {
        selectProduct(pick.getAttribute('data-cot-pick'));
        return;
      }
      if (e.target.id === 'crozzoCotPdfClear') {
        if (ui.pdfUrl) URL.revokeObjectURL(ui.pdfUrl);
        ui.pdfUrl = '';
        ui.pdfName = '';
        refreshCompare(root);
      }
    });
    root.addEventListener('change', function (e) {
      if (e.target.id === 'crozzoCotCatFilter') {
        ui.categoria = e.target.value || '';
        refreshAddSection(root);
        return;
      }
      if (e.target.getAttribute('data-cot-ws') === 'esMiEmpresa') {
        updateWorkspaceField(
          e.target.getAttribute('data-mp-id'),
          e.target.getAttribute('data-sc-id'),
          'esMiEmpresa',
          e.target.checked
        );
        return;
      }
      if (e.target.getAttribute('data-cot-ws') === 'und') {
        updateWorkspaceField(
          e.target.getAttribute('data-mp-id'),
          e.target.getAttribute('data-sc-id'),
          'und',
          e.target.value
        );
        return;
      }
      if (e.target.id === 'crozzoCotPdfFile' && e.target.files && e.target.files[0]) {
        var f = e.target.files[0];
        if (ui.pdfUrl) URL.revokeObjectURL(ui.pdfUrl);
        ui.pdfUrl = URL.createObjectURL(f);
        ui.pdfName = f.name;
        applyCotPdfFrame(root);
        refreshCompare(root);
      }
      var mpSel = root.querySelector('#crozzoCotNewMp');
      if (e.target === mpSel && mpSel.value) {
        var opt = mpSel.options[mpSel.selectedIndex];
        var peso = root.querySelector('#crozzoCotNewPeso');
        var precio = root.querySelector('#crozzoCotNewPrecio');
        if (peso && !peso.value) peso.value = opt.getAttribute('data-peso') || '';
        if (precio && !precio.value) precio.value = opt.getAttribute('data-precio') || '';
      }
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'crozzoCotSearch') {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          ui.q = e.target.value;
          refreshAddSection(root);
        }, DEBOUNCE_MS);
        return;
      }
      var inp = e.target.closest('[data-cot-ws]');
      if (!inp) return;
      var mpId = inp.getAttribute('data-mp-id');
      var scId = inp.getAttribute('data-sc-id');
      var field = inp.getAttribute('data-cot-ws');
      var col = inp.closest('.crozzo-cot-col');
      if (col && col.getAttribute('data-sc-tipo') === 'proximo') scId = 'proximo';
      if (!mpId || !field) return;
      if (scId === 'proximo') {
        updateWorkspaceField(mpId, 'proximo', field, inp.value);
        return;
      }
      if (scId) updateWorkspaceField(mpId, scId, field, inp.value);
    });
    root.addEventListener('keydown', function (e) {
      if (e.target.id !== 'crozzoCotSearch') return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var hits = searchHits(1);
      if (hits[0]) selectProduct(hits[0].mp.id);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (ui.exportOpen) {
          closeExportModal();
          return;
        }
        if (ui.quickMpId) {
          closeQuickForm();
          return;
        }
      }
    });
    root.addEventListener(
      'blur',
      function (e) {
        var ren = e.target.getAttribute && e.target.getAttribute('data-cot-rename');
        if (!ren) return;
        renameCotizacion(ren, e.target.getAttribute('data-mp-id'), e.target.value);
      },
      true
    );
  }
  global.CrozzoCotizacionesMp = {
    renderPanel: renderPanel,
    init: init,
    buildReportRows: buildReportRows,
  };
  global.renderComprasCotizaciones = function () {
    return renderPanel();
  };
  global.initComprasCotizaciones = function () {
    var host = document.getElementById('mainContent');
    if (!host) return;
    var boot = function () {
      host.innerHTML = renderPanel();
      init(host);
    };
    var cat = C();
    if (cat && cat.ensureReady) cat.ensureReady(boot);
    else boot();
  };
})(typeof window !== 'undefined' ? window : globalThis);
