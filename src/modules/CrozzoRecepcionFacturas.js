/**
 * Entrada de facturas — experiencia premium (pilar del flujo compras → costeo).
 * Proveedor → documento (PDF/foto) → líneas MP → verificación y pago → historial.
 */
(function (global) {
  'use strict';

  if (global.__cxfRecepcionModuleLive) {
    var live = global.__cxfRecepcionModuleLive;
    global.CrozzoRecepcionFacturas = live.api;
    global.renderRecepcionFacturas = live.render;
    global.initRecepcionFacturas = live.initRecepcion;
    global.cxfGuardarRecepcion = live.guardar;
    global.crozzoConfirmarIngresoFactura = live.guardar;
    if (live.pdfWork) global.CrozzoRecepcionPdfWork = live.pdfWork;
    return;
  }

  var STEPS = [
    { id: 'proveedor', label: 'Proveedor', icon: '🏢' },
    { id: 'documento', label: 'Factura', icon: '📄' },
    { id: 'productos', label: 'Productos', icon: '📦' },
    { id: 'cierre', label: 'Verificar', icon: '✓' },
  ];

  var TIPOS_RUBRO = [
    'Carnicería',
    'Quesería',
    'Verduras y frutas',
    'Abarrotes',
    'Bebidas',
    'Panadería',
    'Lácteos',
    'Pescadería',
    'Empaques',
    'Otro',
  ];

  var ui = {
    step: 'proveedor',
    proveedorIds: [],
    porProveedor: {},
    proveedorActivo: '',
    proveedorId: '',
    proveedorTab: 'select',
    provFilter: '',
    docs: [],
    lines: [],
    numeroFactura: '',
    valorFactura: '',
    metodoPago: 'transferencia',
    comentarios: '',
    editingId: null,
    docPreviewIdx: 0,
    creatingMpLine: null,
    provComboOpen: false,
    mpLineFilters: {},
    mpLineComboOpen: null,
    mpEditorMode: 'create',
    editingMpId: '',
    modoEntrada: null,
  };

  function R() {
    return global.CrozzoReservorio;
  }

  function C() {
    return global.CrozzoCatalogoMp;
  }

  function E() {
    return global.CrozzoCostosEngine;
  }

  function esc(s) {
    if (typeof escUserAttr === 'function') return escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function attrQuote(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function getCxfHost() {
    var mc = document.getElementById('mainContent');
    if (mc) {
      var inner = mc.querySelector('.cxf-root');
      if (inner) return inner;
    }
    var hub = document.getElementById('crozzo-hub-local-host');
    if (hub) {
      var inHub = hub.querySelector('.cxf-root');
      if (inHub) return inHub;
    }
    return document.querySelector('.cxf-root');
  }

  function resolveCxfRoot(host) {
    if (!host) return null;
    if (host.classList && host.classList.contains('cxf-root')) return host;
    return host.querySelector('.cxf-root') || host;
  }

  /** Vuelve a montar el módulo en #mainContent (evita .cxf-root anidados y pantalla congelada). */
  function remountRecepcionModule(opts) {
    opts = opts || {};
    if (opts.resetUi !== false) freshUi();
    global.__cxfSavingRecepcion = false;
    ui._pendingRecId = null;
    var mc = document.getElementById('mainContent');
    if (!mc) {
      var h = getCxfHost();
      if (h && h.parentElement) {
        h.parentElement.innerHTML = render();
        init(h.parentElement);
      }
      return;
    }
    if (typeof global.crozzoPrepareModuloGestionPage === 'function') {
      global.crozzoPrepareModuloGestionPage(mc);
    }
    mc.innerHTML = render();
    init(mc);
    try {
      mc.scrollTop = 0;
      var hist = mc.querySelector('.cxf-historial');
      if (hist && hist.scrollIntoView) hist.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (_) {}
  }

  function toast(m, t) {
    t = t || 'info';
    try {
      if (typeof showToast === 'function') showToast(m, t);
      else if (typeof global.showToast === 'function') global.showToast(m, t);
      else {
        var box = document.getElementById('toastContainer');
        if (box) {
          var el = document.createElement('div');
          el.className = 'toast toast-' + t;
          el.textContent = m;
          box.appendChild(el);
        }
      }
    } catch (_) {}
  }

  function fmtMoney(n) {
    var res = R();
    if (res && res.fmtCop) return res.fmtCop(n);
    var x = Number(n);
    if (!isFinite(x)) return '—';
    return '$' + Math.round(x).toLocaleString('es-CO');
  }

  var _cxfPreviewUrls = {};

  function ensureRecIdForSave() {
    if (ui.editingId) return String(ui.editingId);
    if (!ui._pendingRecId) {
      ui._pendingRecId =
        'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }
    return ui._pendingRecId;
  }

  var CXF_SESSION_KEY = 'crozzo_cxf_recepcion_v1';
  var CXF_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  var _cxfPersistTimer = null;

  function freshUi() {
    revokeAllCxfPreviewUrls();
    try {
      sessionStorage.removeItem(CXF_SESSION_KEY);
    } catch (_) {}
    global.__cxfBlobVault = {};
    ui = {
      step: 'proveedor',
      proveedorIds: [],
      porProveedor: {},
      proveedorActivo: '',
      proveedorId: '',
      proveedorTab: 'select',
      provFilter: '',
      docs: [],
      lines: [{ mpId: '', cant: '', precio: '' }],
      numeroFactura: '',
      valorFactura: '',
      metodoPago: 'transferencia',
      comentarios: '',
      editingId: null,
      docPreviewIdx: 0,
      creatingMpLine: null,
      provComboOpen: false,
      mpLineFilters: {},
      mpLineComboOpen: null,
      mpEditorMode: 'create',
      editingMpId: '',
      modoEntrada: null,
    };
  }

  /** Copia para FE/QR (pdf.js exclusivo con análisis). */
  function vaultDocBlob(doc) {
    if (!doc || !doc.id || !doc._pdfBlob) return;
    if (!global.__cxfBlobVault) global.__cxfBlobVault = {};
    global.__cxfBlobVault[doc.id] = doc._pdfBlob;
  }

  function viewVaultKey(docId) {
    return 'cxfview_' + docId;
  }

  /** Copia solo para ver en pantalla — no comparte cola FE. */
  function vaultViewDocBlob(doc) {
    if (!doc || !doc.id || !doc._viewBlob) return;
    if (!global.__cxfBlobVault) global.__cxfBlobVault = {};
    global.__cxfBlobVault[viewVaultKey(doc.id)] = doc._viewBlob;
  }

  function attachDocBlobsFromVault() {
    var vault = global.__cxfBlobVault;
    if (!vault) return;
    Object.keys(ui.porProveedor || {}).forEach(function (pid) {
      var b = ui.porProveedor[pid];
      if (!b || !b.facturas) return;
      b.facturas.forEach(function (f) {
        (f.docs || []).forEach(function (d) {
          if (!d || !d.id) return;
          var vk = viewVaultKey(d.id);
          if (vault[vk] && !d._viewBlob) d._viewBlob = vault[vk];
          if (vault[d.id] && !d._pdfBlob) d._pdfBlob = vault[d.id];
        });
      });
    });
  }

  function ensureDocBlobAttached(doc) {
    if (!doc || doc._pdfBlob) return;
    var vault = global.__cxfBlobVault;
    if (vault && doc.id && vault[doc.id]) doc._pdfBlob = vault[doc.id];
  }

  function ensureDocViewBlobAttached(doc) {
    if (!doc) return;
    if (doc._viewBlob) return;
    var vault = global.__cxfBlobVault;
    if (vault && doc.id && vault[viewVaultKey(doc.id)]) {
      doc._viewBlob = vault[viewVaultKey(doc.id)];
      return;
    }
    ensureDocBlobAttached(doc);
    if (!doc._viewBlob && doc._pdfBlob) doc._viewBlob = doc._pdfBlob;
  }

  function scheduleViewBlobIdbBackup(doc) {
    if (!doc || !doc._viewBlob || doc.viewBlobRef) return;
    var B = global.CrozzoBlobStore;
    if (!B || !B.putBlob) return;
    var viewId = viewVaultKey(doc.id);
    setTimeout(function () {
      B.putBlob({
        id: viewId,
        blob: doc._viewBlob,
        mime: doc.mime || 'application/pdf',
        nombre: (doc.nombre || 'factura') + ' (vista)',
        refTipo: 'cxf_view',
      })
        .then(function (rec) {
          if (rec && rec.id) {
            doc.viewBlobRef = rec.id;
            schedulePersistCxfSession();
          }
        })
        .catch(function () {});
    }, 40);
  }

  function hydrateViewBlobsFromIdb() {
    var B = global.CrozzoBlobStore;
    if (!B || !B.getRecord) return Promise.resolve();
    var pending = [];
    Object.keys(ui.porProveedor || {}).forEach(function (pid) {
      var b = ui.porProveedor[pid];
      if (!b || !b.facturas) return;
      b.facturas.forEach(function (f) {
        (f.docs || []).forEach(function (d) {
          if (d && d.viewBlobRef && !d._viewBlob) pending.push(d);
        });
      });
    });
    if (!pending.length) return Promise.resolve();
    return Promise.all(
      pending.map(function (d) {
        return B.getRecord(d.viewBlobRef).then(function (rec) {
          if (rec && rec.blob) {
            d._viewBlob = rec.blob;
            vaultViewDocBlob(d);
          }
        });
      })
    ).catch(function () {});
  }

  function kickCxfPdfPreviews(host) {
    attachDocBlobsFromVault();
    hydrateViewBlobsFromIdb().then(function () {
      enqueueAllPdfPreviewsDeferred();
      host = host || getCxfHost();
      if (host) applyPdfPreviews(host);
    });
  }

  function vaultAllDocBlobs() {
    Object.keys(ui.porProveedor || {}).forEach(function (pid) {
      var b = ui.porProveedor[pid];
      if (!b || !b.facturas) return;
      b.facturas.forEach(function (f) {
        (f.docs || []).forEach(function (d) {
          vaultDocBlob(d);
          vaultViewDocBlob(d);
        });
      });
    });
  }

  function bucketHasWork(b) {
    if (!b || !b.facturas) return false;
    return b.facturas.some(function (f) {
      return (
        (f.docs && f.docs.length) ||
        (f.feAnalisis && f.feAnalisis.estado) ||
        String(f.numeroFactura || '').trim() ||
        String(f.valorFactura || '').trim()
      );
    });
  }

  function hasActiveRecepcionWork() {
    if (ui.editingId) return true;
    if (ui.proveedorIds && ui.proveedorIds.length) return true;
    return Object.keys(ui.porProveedor || {}).some(function (id) {
      return bucketHasWork(ui.porProveedor[id]);
    });
  }

  function syncProveedorIdsFromBuckets() {
    Object.keys(ui.porProveedor || {}).forEach(function (id) {
      if (!id || !bucketHasWork(ui.porProveedor[id])) return;
      if (ui.proveedorIds.indexOf(id) < 0) ui.proveedorIds.push(id);
    });
  }

  function serializeDocForSession(d) {
    if (!d) return null;
    return {
      id: d.id,
      nombre: d.nombre,
      mime: d.mime,
      dataUrl:
        d.dataUrl && d.dataUrl.length && d.dataUrl.length < 350000 ? d.dataUrl : '',
      hasBlob: !!(d._pdfBlob || (global.__cxfBlobVault && global.__cxfBlobVault[d.id])),
      hasViewBlob: !!(
        d._viewBlob ||
        (global.__cxfBlobVault && global.__cxfBlobVault[viewVaultKey(d.id)])
      ),
      viewBlobRef: d.viewBlobRef || null,
    };
  }

  function serializeFacturaForSession(f) {
    if (!f) return null;
    return {
      id: f.id,
      numeroFactura: f.numeroFactura,
      docs: (f.docs || []).map(serializeDocForSession).filter(Boolean),
      docPreviewIdx: f.docPreviewIdx,
      lines: (f.lines || []).slice(),
      valorFactura: f.valorFactura,
      metodoPago: f.metodoPago,
      comentarios: f.comentarios,
      feAnalisis: f.feAnalisis,
      valorCajero: f.valorCajero,
    };
  }

  function serializeBucketForSession(b) {
    if (!b) return null;
    return {
      facturas: (b.facturas || []).map(serializeFacturaForSession).filter(Boolean),
      facturaActiva: b.facturaActiva,
    };
  }

  function persistCxfSessionNow() {
    try {
      vaultAllDocBlobs();
      if (!hasActiveRecepcionWork() && !isCxfBackgroundWork()) {
        sessionStorage.removeItem(CXF_SESSION_KEY);
        return;
      }
      var por = {};
      Object.keys(ui.porProveedor || {}).forEach(function (pid) {
        var sb = serializeBucketForSession(ui.porProveedor[pid]);
        if (sb && bucketHasWork(ui.porProveedor[pid])) por[pid] = sb;
      });
      sessionStorage.setItem(
        CXF_SESSION_KEY,
        JSON.stringify({
          t: Date.now(),
          ui: {
            step: ui.step,
            proveedorIds: (ui.proveedorIds || []).slice(),
            porProveedor: por,
            proveedorActivo: ui.proveedorActivo,
            modoEntrada: ui.modoEntrada,
            editingId: ui.editingId,
            metodoPago: ui.metodoPago,
            comentarios: ui.comentarios,
          },
          fe: {
            awaitingContinue: !!(_feBatchSession && _feBatchSession.awaitingContinue),
            complete: !!(_feBatchSession && _feBatchSession.complete),
            done: _feBatchSession ? _feBatchSession.done : 0,
            total: _feBatchSession ? _feBatchSession.total : 0,
            modoEntrada: _feBackgroundJob ? _feBackgroundJob.modoEntrada : ui.modoEntrada,
          },
        })
      );
    } catch (_) {}
  }

  function schedulePersistCxfSession() {
    if (_cxfPersistTimer) clearTimeout(_cxfPersistTimer);
    _cxfPersistTimer = setTimeout(function () {
      _cxfPersistTimer = null;
      persistCxfSessionNow();
    }, 420);
  }

  function restoreCxfSessionIfNeeded() {
    try {
      if (hasActiveRecepcionWork()) return false;
      var raw = sessionStorage.getItem(CXF_SESSION_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.ui || !data.t || Date.now() - data.t > CXF_SESSION_TTL_MS) {
        sessionStorage.removeItem(CXF_SESSION_KEY);
        return false;
      }
      var u = data.ui;
      ui.step = u.step || ui.step;
      ui.proveedorIds = (u.proveedorIds || []).slice();
      ui.proveedorActivo = u.proveedorActivo || '';
      ui.modoEntrada = u.modoEntrada != null ? u.modoEntrada : ui.modoEntrada;
      ui.editingId = u.editingId || null;
      ui.metodoPago = u.metodoPago || ui.metodoPago;
      ui.comentarios = u.comentarios || '';
      ui.porProveedor = {};
      Object.keys(u.porProveedor || {}).forEach(function (pid) {
        var sb = u.porProveedor[pid];
        if (!sb) return;
        ui.porProveedor[pid] = migrateBucket({
          facturas: (sb.facturas || []).map(function (f) {
            return newFactura(f);
          }),
          facturaActiva: sb.facturaActiva,
        });
      });
      attachDocBlobsFromVault();
      if (data.fe) {
        if (data.fe.modoEntrada && !ui.modoEntrada) ui.modoEntrada = data.fe.modoEntrada;
        if (data.fe.awaitingContinue || data.fe.complete) {
          _feBatchSession = {
            active: false,
            done: data.fe.done || 0,
            total: data.fe.total || 0,
            currentPct: 100,
            barPct: 100,
            label: 'Análisis completado',
            awaitingContinue: !!data.fe.awaitingContinue,
            complete: !!data.fe.complete,
          };
        }
      }
      syncProveedorIdsFromBuckets();
      return hasActiveRecepcionWork();
    } catch (_) {
      return false;
    }
  }

  function repairRecepcionSession(opts) {
    opts = opts || {};
    restoreCxfSessionIfNeeded();
    syncProveedorIdsFromBuckets();
    if (_feBackgroundJob && _feBackgroundJob.modoEntrada && !ui.modoEntrada) {
      ui.modoEntrada = _feBackgroundJob.modoEntrada;
    }
    if (
      (_feBatchSession && (_feBatchSession.awaitingContinue || _feBatchSession.complete)) &&
      hasActiveRecepcionWork() &&
      !ui.modoEntrada
    ) {
      ui.modoEntrada = 'complejo';
    }
    attachDocBlobsFromVault();
    if (hasActiveRecepcionWork()) {
      if (!ui.proveedorActivo) ui.proveedorActivo = ui.proveedorIds[0] || '';
      if (
        opts.forceDocumento ||
        (_feBatchSession && (_feBatchSession.awaitingContinue || _feBatchSession.complete))
      ) {
        ui.step = 'documento';
      }
    }
  }

  function continueFromFeBatch() {
    repairRecepcionSession({ forceDocumento: true });
    if (_feBatchSession) _feBatchSession.awaitingContinue = false;
    global.__crozzoRecepcionResumeStep = 'documento';
    persistCxfSessionNow();
    hideCxfProgressDock();
    if (isOnRecepcionPage()) {
      var h = getCxfHost();
      if (h) {
        refreshStepHost(h);
        setTimeout(function () {
          kickCxfPdfPreviews(h);
        }, 180);
      }
      return;
    }
    if (typeof global.navigateTo === 'function') {
      global.navigateTo((_feBackgroundJob && _feBackgroundJob.returnPage) || 'compras-recepcion');
    }
  }

  function newFactura(seed) {
    seed = seed || {};
    return {
      id: seed.id || 'fac_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      numeroFactura: seed.numeroFactura || '',
      docs: (seed.docs || []).slice(),
      docPreviewIdx: seed.docPreviewIdx || 0,
      lines: (seed.lines && seed.lines.length ? seed.lines : [{ mpId: '', cant: '', precio: '' }]).slice(),
      valorFactura: seed.valorFactura || '',
      metodoPago: seed.metodoPago || 'transferencia',
      comentarios: seed.comentarios || '',
      feAnalisis: seed.feAnalisis || null,
      valorCajero: seed.valorCajero || '',
    };
  }

  function newBucket() {
    var f = newFactura();
    return {
      facturas: [f],
      facturaActiva: f.id,
      docs: [],
      docPreviewIdx: 0,
      numeroFactura: '',
      lines: [{ mpId: '', cant: '', precio: '' }],
      valorFactura: '',
      metodoPago: 'transferencia',
      comentarios: '',
    };
  }

  function migrateBucket(b) {
    if (!b) return null;
    if (b.facturas && b.facturas.length) {
      b.facturas.forEach(function (f) {
        if (!f.lines || !f.lines.length) f.lines = [{ mpId: '', cant: '', precio: '' }];
        if (!f.docs) f.docs = [];
      });
      return b;
    }
    var f = newFactura({
      numeroFactura: b.numeroFactura || '',
      docs: b.docs || [],
      docPreviewIdx: b.docPreviewIdx || 0,
      lines: b.lines,
      valorFactura: b.valorFactura || '',
      metodoPago: b.metodoPago || 'transferencia',
      comentarios: b.comentarios || '',
    });
    b.facturas = [f];
    b.facturaActiva = f.id;
    return b;
  }

  function ensureBucket(provId) {
    var id = String(provId || '');
    if (!id) return null;
    if (!ui.porProveedor[id]) ui.porProveedor[id] = newBucket();
    return migrateBucket(ui.porProveedor[id]);
  }

  function getFactura(provId, facturaId) {
    var b = ensureBucket(provId || getActiveProvId());
    if (!b || !b.facturas.length) return null;
    var fid = facturaId || b.facturaActiva || b.facturas[0].id;
    for (var i = 0; i < b.facturas.length; i++) {
      if (String(b.facturas[i].id) === String(fid)) return b.facturas[i];
    }
    return b.facturas[0];
  }

  function getActiveFacturaId(provId) {
    var b = ensureBucket(provId || getActiveProvId());
    return b ? b.facturaActiva || (b.facturas[0] && b.facturas[0].id) || '' : '';
  }

  function setActiveFactura(provId, facturaId) {
    persistActiveBucket();
    var b = ensureBucket(provId);
    if (b && facturaId) b.facturaActiva = String(facturaId);
    syncUiFromBucket();
  }

  function guessNumeroFactura(nombre) {
    var n = String(nombre || '');
    var fe = n.match(/FE[-_\s]?([A-Za-z0-9-]+)/i);
    if (fe) return 'FE-' + fe[1].replace(/^-/, '');
    var nums = n.match(/(\d{5,})/);
    if (nums) return nums[1];
    return '';
  }

  function countPdfFacturas(provId) {
    var b = ensureBucket(provId);
    if (!b) return 0;
    var n = 0;
    b.facturas.forEach(function (f) {
      if (f.docs && f.docs.some(function (d) {
        return d.mime && d.mime.indexOf('pdf') >= 0;
      })) {
        n++;
      }
    });
    return n;
  }

  function mergeFacturasEnUna(provId, facturaIds) {
    var b = ensureBucket(provId);
    if (!b || !b.facturas.length) return;
    facturaIds = facturaIds || b.facturas.map(function (f) {
      return f.id;
    });
    if (facturaIds.length < 2) return toast('Seleccione al menos 2 facturas para unir', 'info');
    var target = getFactura(provId, facturaIds[0]);
    if (!target) return;
    var allDocs = [];
    var numeros = [];
    facturaIds.forEach(function (fid) {
      var f = getFactura(provId, fid);
      if (!f || f.id === target.id) return;
      numeros.push(f.numeroFactura);
      (f.docs || []).forEach(function (d) {
        allDocs.push(d);
      });
      (f.lines || []).forEach(function (ln) {
        if (ln.mpId || ln.precio) target.lines.push(ln);
      });
    });
    target.docs = (target.docs || []).concat(allDocs);
    if (numeros.length && target.numeroFactura) numeros.unshift(target.numeroFactura);
    target.numeroFactura = numeros.filter(Boolean).join(' / ') || target.numeroFactura;
    b.facturas = b.facturas.filter(function (f) {
      return facturaIds.indexOf(f.id) < 0 || f.id === target.id;
    });
    b.facturaActiva = target.id;
    target.docPreviewIdx = 0;
    if (String(provId) === getActiveProvId()) syncUiFromBucket();
    toast('Facturas unidas en una sola', 'success');
  }

  function getActiveProvId() {
    return String(ui.proveedorActivo || ui.proveedorIds[0] || ui.proveedorId || '');
  }

  function getActiveBucket() {
    var id = getActiveProvId();
    return id ? ensureBucket(id) : null;
  }

  function syncUiFromBucket() {
    var b = getActiveBucket();
    if (!b) {
      ui.proveedorId = '';
      ui.docs = [];
      ui.docPreviewIdx = 0;
      ui.lines = [{ mpId: '', cant: '', precio: '' }];
      ui.numeroFactura = '';
      ui.valorFactura = '';
      ui.metodoPago = 'transferencia';
      ui.comentarios = '';
      return;
    }
    var f = getFactura(getActiveProvId());
    ui.proveedorId = getActiveProvId();
    if (!f) return;
    ui.docs = f.docs;
    ui.docPreviewIdx = f.docPreviewIdx;
    ui.lines = f.lines;
    ui.numeroFactura = f.numeroFactura;
    ui.valorFactura = f.valorFactura;
    ui.metodoPago = f.metodoPago;
    ui.comentarios = f.comentarios;
  }

  function persistActiveBucket() {
    var id = getActiveProvId();
    if (!id) return;
    var f = getFactura(id);
    if (!f) return;
    f.docs = ui.docs;
    f.docPreviewIdx = ui.docPreviewIdx;
    f.lines = ui.lines;
    f.numeroFactura = ui.numeroFactura;
    f.valorFactura = ui.valorFactura;
    f.metodoPago = ui.metodoPago;
    f.comentarios = ui.comentarios;
  }

  function setActiveProv(provId) {
    persistActiveBucket();
    ui.proveedorActivo = String(provId || '');
    var b = ensureBucket(provId);
    if (b && !getFactura(provId)) {
      b.facturas.push(newFactura());
      b.facturaActiva = b.facturas[b.facturas.length - 1].id;
    }
    syncUiFromBucket();
  }

  function addProvToSession(provId) {
    var id = String(provId || '');
    if (!id) return false;
    if (ui.proveedorIds.indexOf(id) < 0) ui.proveedorIds.push(id);
    ensureBucket(id);
    if (!ui.proveedorActivo) ui.proveedorActivo = id;
    schedulePersistCxfSession();
    return true;
  }

  function removeProvFromSession(provId) {
    var id = String(provId || '');
    ui.proveedorIds = ui.proveedorIds.filter(function (x) {
      return x !== id;
    });
    delete ui.porProveedor[id];
    if (ui.proveedorActivo === id) ui.proveedorActivo = ui.proveedorIds[0] || '';
    syncUiFromBucket();
  }

  function getSelectedProviders() {
    return ui.proveedorIds
      .map(function (id) {
        return proveedoresList().find(function (p) {
          return String(p.id) === String(id);
        });
      })
      .filter(Boolean);
  }

  function provHasDocs(provId) {
    var b = ensureBucket(provId);
    if (!b) return false;
    return b.facturas.some(function (f) {
      return f.docs && f.docs.length;
    });
  }

  function totalDocsCount() {
    var n = 0;
    ui.proveedorIds.forEach(function (id) {
      var b = ensureBucket(id);
      if (!b) return;
      b.facturas.forEach(function (f) {
        if (f.docs) n += f.docs.length;
      });
    });
    return n;
  }

  function allFacturasForSave() {
    var out = [];
    ui.proveedorIds.forEach(function (pid) {
      var b = ensureBucket(pid);
      if (!b) return;
      b.facturas.forEach(function (f) {
        if ((f.docs && f.docs.length) || collectLines(f).length) {
          out.push({ provId: pid, factura: f });
        }
      });
    });
    return out;
  }

  function loadJsPdf() {
    return new Promise(function (resolve, reject) {
      if (global.jspdf && global.jspdf.jsPDF) return resolve(global.jspdf.jsPDF);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.async = true;
      s.onload = function () {
        if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf.jsPDF);
        else reject(new Error('jsPDF no disponible'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar jsPDF'));
      };
      document.head.appendChild(s);
    });
  }

  function compressImage(file, maxW) {
    maxW = maxW || 1400;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width;
          var h = img.height;
          var scale = w > maxW ? maxW / w : 1;
          var cw = Math.round(w * scale);
          var ch = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function imagesToPdf(dataUrls) {
    return loadJsPdf().then(function (jsPDF) {
      var pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 24;
      return dataUrls.reduce(function (chain, dataUrl, i) {
        return chain.then(function () {
          return new Promise(function (res) {
            var img = new Image();
            img.onload = function () {
              if (i > 0) pdf.addPage();
              var availW = pageW - margin * 2;
              var availH = pageH - margin * 2;
              var ratio = Math.min(availW / img.width, availH / img.height);
              var w = img.width * ratio;
              var h = img.height * ratio;
              var x = (pageW - w) / 2;
              var y = (pageH - h) / 2;
              pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
              res();
            };
            img.src = dataUrl;
          });
        });
      }, Promise.resolve()).then(function () {
        return pdf.output('datauristring');
      });
    });
  }

  function listImageDocsForProv(provId) {
    var b = ensureBucket(provId);
    if (!b) return [];
    var imgs = [];
    b.facturas.forEach(function (f) {
      (f.docs || []).forEach(function (d) {
        if (d.mime && d.mime.indexOf('image') >= 0) imgs.push({ doc: d, facturaId: f.id });
      });
    });
    return imgs;
  }

  function listImagesInFactura(factura) {
    return (factura.docs || []).filter(function (d) {
      return d.mime && d.mime.indexOf('image') >= 0;
    });
  }

  function isPdfDoc(d) {
    if (!d) return false;
    if (d.mime && d.mime.indexOf('pdf') >= 0) return true;
    return /\.pdf$/i.test(String(d.nombre || ''));
  }

  function facturaHasSinglePdf(factura) {
    if (!factura || !factura.docs || !factura.docs.length) return false;
    var pdfs = 0;
    var otros = 0;
    factura.docs.forEach(function (d) {
      if (isPdfDoc(d)) pdfs++;
      else otros++;
    });
    return pdfs === 1 && otros === 0;
  }

  function loadPdfLib() {
    return new Promise(function (resolve, reject) {
      if (global.PDFLib && global.PDFLib.PDFDocument) return resolve(global.PDFLib);
      var existing = document.querySelector('script[data-cxf-pdf-lib]');
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
      s.setAttribute('data-cxf-pdf-lib', '1');
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

  function dataUrlToUint8Array(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    var base64 = parts.length > 1 ? parts[1] : parts[0];
    var bin = atob(base64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function uint8ArrayToDataUrl(bytes) {
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return 'data:application/pdf;base64,' + btoa(bin);
  }

  function blobToDataUrlAsync(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var fr = new FileReader();
        fr.onload = function () {
          resolve(fr.result);
        };
        fr.onerror = function () {
          reject(fr.error || new Error('No se pudo leer el archivo'));
        };
        fr.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  function docHasPayload(doc) {
    if (!doc) return false;
    ensureDocViewBlobAttached(doc);
    ensureDocBlobAttached(doc);
    if (doc._viewBlob || doc._pdfBlob) return true;
    var u = String(doc.dataUrl || '');
    return u.length > 80 && u.indexOf('data:') === 0;
  }

  function ensureDocDataUrl(doc) {
    if (!doc) return Promise.resolve('');
    if (doc.dataUrl && doc.dataUrl.indexOf('data:') === 0 && doc.dataUrl.length > 80) {
      doc.dataUrl = normalizePdfDataUrl(doc.dataUrl);
      return Promise.resolve(doc.dataUrl);
    }
    if (doc._dataUrlPromise) return doc._dataUrlPromise;
    if (doc._pdfBlob) {
      doc._dataUrlPromise = blobToDataUrlAsync(doc._pdfBlob)
        .then(function (url) {
          doc.dataUrl = normalizePdfDataUrl(url);
          doc._dataUrlPromise = null;
          return doc.dataUrl;
        })
        .catch(function (err) {
          doc._dataUrlPromise = null;
          throw err;
        });
      return doc._dataUrlPromise;
    }
    return Promise.resolve(doc.dataUrl || '');
  }

  /** Bytes del PDF de análisis (FE / QR en PDF). */
  function getDocPdfBytes(doc) {
    if (!doc) return Promise.resolve(null);
    ensureDocBlobAttached(doc);
    if (doc._pdfBlob) {
      return doc._pdfBlob.arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    if (doc.dataUrl) {
      return Promise.resolve(dataUrlToUint8Array(normalizePdfDataUrl(doc.dataUrl)));
    }
    return Promise.resolve(null);
  }

  /** Bytes del PDF de vista (miniatura / iframe — independiente del análisis). */
  function getViewPdfBytes(doc) {
    if (!doc) return Promise.resolve(null);
    ensureDocViewBlobAttached(doc);
    if (doc._viewBlob) {
      return doc._viewBlob.arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    return getDocPdfBytes(doc);
  }

  function normalizePdfDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return '';
    if (dataUrl.indexOf('data:application/pdf') === 0) return dataUrl;
    var comma = dataUrl.indexOf(',');
    if (comma < 0) return dataUrl;
    return 'data:application/pdf;base64,' + dataUrl.slice(comma + 1);
  }

  function revokeCxfPreviewUrl(docId) {
    if (!docId || !_cxfPreviewUrls[docId]) return;
    try {
      URL.revokeObjectURL(_cxfPreviewUrls[docId]);
    } catch (e) {}
    delete _cxfPreviewUrls[docId];
  }

  function revokeAllCxfPreviewUrls() {
    Object.keys(_cxfPreviewUrls).forEach(function (id) {
      revokeCxfPreviewUrl(id);
    });
  }

  function findDocById(docId) {
    if (!docId) return null;
    var loc = findFacturaByDocId(docId);
    return loc ? loc.doc : null;
  }

  function findFacturaByDocId(docId) {
    if (!docId) return null;
    var out = null;
    ui.proveedorIds.forEach(function (pid) {
      if (out) return;
      var b = ui.porProveedor[pid] || ensureBucket(pid);
      if (!b || !b.facturas) return;
      b.facturas.forEach(function (f) {
        if (out) return;
        (f.docs || []).forEach(function (d) {
          if (String(d.id) === String(docId)) out = { provId: pid, facturaId: f.id, factura: f, doc: d };
        });
      });
    });
    return out;
  }

  function findFacturaSlotEl(host, provId, facturaId) {
    host = host || getCxfHost();
    if (!host) return null;
    var card = host.querySelector('.cxf-prov-factura-card[data-prov-id="' + provId + '"]');
    if (!card) return null;
    return card.querySelector('.cxf-factura-slot[data-factura-id="' + facturaId + '"]');
  }

  /** Actualiza solo vista previa + bloque FE de una factura (sin redibujar toda la lista). */
  function patchFacturaSlotUi(host, provId, facturaId) {
    var slot = findFacturaSlotEl(host, provId, facturaId);
    if (!slot) return false;
    var f = getFactura(provId, facturaId);
    if (!f) return false;
    var previewEl = slot.querySelector('.cxf-prov-factura-card__preview');
    if (previewEl) {
      var tmp = document.createElement('div');
      tmp.innerHTML = renderFacturaSlotPreview(provId, f);
      var next = tmp.firstElementChild;
      if (next) previewEl.replaceWith(next);
    }
    var feMount = slot.querySelector('[data-cxf-fe-mount]');
    if (feMount && isModoComplejo()) {
      feMount.innerHTML = renderFeAnalisisBlock(provId, f);
    }
    if (f._feAnalisisRunning) slot.classList.add('is-fe-busy');
    else slot.classList.remove('is-fe-busy');
    applyPdfPreviews(slot);
    return true;
  }

  function enqueueAllPdfPreviewsDeferred() {
    var jobs = [];
    ui.proveedorIds.forEach(function (pid) {
      var b = ensureBucket(pid);
      if (!b) return;
      b.facturas.forEach(function (f, idx) {
        var doc = f.docs && f.docs[f.docPreviewIdx || 0];
        if (doc && isPdfDoc(doc) && !doc.previewUrl) {
          jobs.push({ docId: doc.id, priority: idx });
        }
      });
    });
    jobs.sort(function (a, b) {
      return a.priority - b.priority;
    });
    jobs.forEach(function (j) {
      var doc = findDocById(j.docId);
      if (doc) enqueuePdfPreview(doc, j.priority);
    });
  }

  function getPdfBlobUrl(doc) {
    if (!doc || !isPdfDoc(doc)) return '';
    ensureDocViewBlobAttached(doc);
    if (_cxfPreviewUrls[doc.id]) return _cxfPreviewUrls[doc.id];
    try {
      if (doc._viewBlob) {
        var url = URL.createObjectURL(doc._viewBlob);
        _cxfPreviewUrls[doc.id] = url;
        return url;
      }
      if (!doc.dataUrl) return '';
      var bytes = dataUrlToUint8Array(normalizePdfDataUrl(doc.dataUrl));
      if (!bytes.length) return '';
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url2 = URL.createObjectURL(blob);
      _cxfPreviewUrls[doc.id] = url2;
      return url2;
    } catch (e) {
      return '';
    }
  }

  var _cxfPdfJsLoading = null;

  function resolveVendorUrl(path) {
    try {
      var a = document.createElement('a');
      a.href = path;
      return a.href;
    } catch (e) {
      return path;
    }
  }

  function configurePdfJsWorker(lib) {
    if (lib && lib.GlobalWorkerOptions) {
      lib.GlobalWorkerOptions.workerSrc = resolveVendorUrl('vendor/CrozzoPdfJs.worker.js');
    }
  }

  function loadPdfJs() {
    if (global.pdfjsLib && global.pdfjsLib.getDocument) {
      configurePdfJsWorker(global.pdfjsLib);
      return Promise.resolve(global.pdfjsLib);
    }
    if (_cxfPdfJsLoading) return _cxfPdfJsLoading;
    _cxfPdfJsLoading = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-cxf-pdfjs]');
      if (existing) {
        if (global.pdfjsLib && global.pdfjsLib.getDocument) {
          configurePdfJsWorker(global.pdfjsLib);
          resolve(global.pdfjsLib);
          return;
        }
        existing.addEventListener('load', function () {
          if (global.pdfjsLib && global.pdfjsLib.getDocument) {
            configurePdfJsWorker(global.pdfjsLib);
            resolve(global.pdfjsLib);
          } else reject(new Error('pdf.js no disponible'));
        });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = resolveVendorUrl('vendor/CrozzoPdfJs.js');
      s.async = true;
      s.setAttribute('data-cxf-pdfjs', '1');
      s.onload = function () {
        var lib = global.pdfjsLib;
        configurePdfJsWorker(lib);
        if (lib && lib.getDocument) resolve(lib);
        else reject(new Error('pdf.js no disponible'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar pdf.js local'));
      };
      document.head.appendChild(s);
    });
    return _cxfPdfJsLoading;
  }

  /** Miniatura desde copia de vista — no usa la cola exclusiva del análisis FE. */
  function pdfBytesToPreviewUrl(bytes) {
    return loadPdfJs().then(function (pdfjsLib) {
      var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var vp = page.getViewport({ scale: 1.15 });
          var canvas = document.createElement('canvas');
          var maxSide = 720;
          var w = vp.width;
          var h = vp.height;
          var sc = 1;
          if (Math.max(w, h) > maxSide) sc = maxSide / Math.max(w, h);
          canvas.width = Math.max(1, (w * sc) | 0);
          canvas.height = Math.max(1, (h * sc) | 0);
          var ctx = canvas.getContext('2d');
          var drawVp = sc < 1 ? page.getViewport({ scale: 1.15 * sc }) : vp;
          return page.render({ canvasContext: ctx, viewport: drawVp }).promise.then(function () {
            var numPages = pdf.numPages;
            try {
              pdf.destroy();
            } catch (eD) {}
            return { url: canvas.toDataURL('image/jpeg', 0.82), numPages: numPages };
          });
        });
      });
    });
  }

  function ensureDocPdfPreview(doc) {
    if (!doc || !isPdfDoc(doc) || !docHasPayload(doc)) return Promise.resolve(doc);
    if (doc.previewUrl) return Promise.resolve(doc);
    return getViewPdfBytes(doc)
      .then(function (bytes) {
        if (!bytes || !bytes.length) return doc;
        return pdfBytesToPreviewUrl(bytes);
      })
      .then(function (out) {
        if (out && out.url) {
          doc.previewUrl = out.url;
          doc.previewPages = out.numPages;
        }
        return doc;
      })
      .catch(function (err) {
        console.warn('[CXF] vista previa PDF', err);
        return doc;
      });
  }

  function renderPdfPreviewHtml(doc, frameClass) {
    if (!doc || !isPdfDoc(doc)) return '';
    return (
      '<div class="cxf-pdf-preview-host ' +
      esc(frameClass || '') +
      '">' +
      '<div class="cxf-pdf-canvas-wrap" data-cxf-pdf-preview="' +
      esc(doc.id) +
      '">' +
      '<p class="cxf-pdf-loading cxf-muted">Generando vista previa…</p>' +
      '<img class="cxf-preview-img cxf-pdf-preview-img" alt="Vista previa PDF" style="display:none">' +
      '</div>' +
      '<p class="cxf-pdf-preview-fallback cxf-muted">' +
      'No se pudo generar la miniatura. ' +
      '<button type="button" class="btn btn-link btn-sm" data-cxf-pdf-open="' +
      esc(doc.id) +
      '">Abrir PDF</button></p></div>'
    );
  }

  function showPdfPreviewInHost(host, doc) {
    var wrap = host.closest('.cxf-pdf-preview-host') || host.parentElement;
    var img = host.querySelector('img.cxf-pdf-preview-img');
    var loading = host.querySelector('.cxf-pdf-loading');
    if (!img) return;
    if (wrap) wrap.classList.remove('is-preview-failed');
    if (!doc || !doc.previewUrl) {
      if (wrap) wrap.classList.add('is-preview-failed');
      if (loading) {
        loading.textContent = 'Vista previa no disponible.';
        loading.style.display = 'block';
      }
      img.style.display = 'none';
      return;
    }
    img.src = doc.previewUrl;
    img.style.display = 'block';
    if (loading) {
      if (doc.previewPages > 1) {
        loading.textContent = 'Página 1 de ' + doc.previewPages;
        loading.style.display = 'block';
      } else {
        loading.style.display = 'none';
      }
    }
  }

  function applyPdfPreviews(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-cxf-pdf-preview]').forEach(function (host) {
      if (host.tagName === 'IFRAME') return;
      var docId = host.getAttribute('data-cxf-pdf-preview');
      var doc = findDocById(docId);
      if (!doc || !docHasPayload(doc)) {
        var wrapBad = host.closest('.cxf-pdf-preview-host');
        if (wrapBad) wrapBad.classList.add('is-preview-failed');
        var loadingBad = host.querySelector('.cxf-pdf-loading');
        if (loadingBad) {
          loadingBad.textContent = 'Sin documento PDF';
          loadingBad.style.display = 'block';
        }
        return;
      }
      if (doc.previewUrl) {
        showPdfPreviewInHost(host, doc);
        return;
      }
      var loading = host.querySelector('.cxf-pdf-loading');
      if (loading) {
        loading.textContent = 'Generando vista previa…';
        loading.style.display = 'block';
      }
      enqueuePdfPreview(doc);
    });
  }

  function schedulePdfPreviewRefresh() {
    setTimeout(function () {
      var host = document.getElementById('mainContent');
      if (host) applyPdfPreviews(host);
    }, 80);
  }

  function splitPdfIntoFacturas(provId, facturaId, numParts) {
    var f = getFactura(provId, facturaId);
    if (!f) return Promise.reject(new Error('Factura no encontrada'));
    var pdfDoc = null;
    (f.docs || []).forEach(function (d) {
      if (!pdfDoc && isPdfDoc(d)) pdfDoc = d;
    });
    if (!pdfDoc || !pdfDoc.dataUrl) return Promise.reject(new Error('No hay PDF en este bloque'));
    numParts = Math.max(2, Math.min(20, Math.floor(Number(numParts) || 2)));
    return loadPdfLib().then(function (PDFLib) {
      return PDFLib.PDFDocument.load(dataUrlToUint8Array(pdfDoc.dataUrl)).then(function (src) {
        var totalPages = src.getPageCount();
        if (numParts > totalPages) {
          throw new Error('El PDF tiene ' + totalPages + ' página(s). Máximo ' + totalPages + ' partes.');
        }
        var pagesPer = Math.ceil(totalPages / numParts);
        var chain = Promise.resolve([]);
        for (var p = 0; p < numParts; p++) {
          chain = (function (partIdx, prev) {
            return prev.then(function (acc) {
              var start = partIdx * pagesPer;
              if (start >= totalPages) return acc;
              var end = Math.min(start + pagesPer, totalPages);
              var indices = [];
              for (var i = start; i < end; i++) indices.push(i);
              return PDFLib.PDFDocument.create().then(function (newDoc) {
                return newDoc.copyPages(src, indices).then(function (pages) {
                  pages.forEach(function (page) {
                    newDoc.addPage(page);
                  });
                  return newDoc.save();
                }).then(function (bytes) {
                  acc.push({
                    idx: partIdx,
                    pageFrom: start + 1,
                    pageTo: end,
                    dataUrl: uint8ArrayToDataUrl(bytes),
                  });
                  return acc;
                });
              });
            });
          })(p, chain);
        }
        return chain.then(function (parts) {
          if (!parts.length) throw new Error('No se pudo dividir el PDF');
          var b = ensureBucket(provId);
          var baseNombre = (pdfDoc.nombre || 'Factura').replace(/\.pdf$/i, '');
          var baseNum = String(f.numeroFactura || '').trim() || guessNumeroFactura(pdfDoc.nombre) || '';
          var nuevas = parts.map(function (part, idx) {
            var suf = parts.length > 1 ? '-' + (idx + 1) : '';
            return newFactura({
              numeroFactura: baseNum ? baseNum + suf : 'FE-' + (idx + 1),
              lines:
                idx === 0 && f.lines && f.lines.length
                  ? f.lines.slice()
                  : [{ mpId: '', cant: '', precio: '' }],
              valorFactura: idx === 0 ? f.valorFactura || '' : '',
              comentarios: f.comentarios || '',
              metodoPago: f.metodoPago || 'transferencia',
              docs: [
                {
                  id: 'pdf_split_' + Date.now() + '_' + idx,
                  nombre: baseNombre + '_p' + part.pageFrom + '-' + part.pageTo + '.pdf',
                  mime: 'application/pdf',
                  dataUrl: part.dataUrl,
                },
              ],
            });
          });
          b.facturas = b.facturas.filter(function (x) {
            return x.id !== f.id;
          });
          nuevas.forEach(function (nf) {
            b.facturas.push(nf);
          });
          b.facturaActiva = nuevas[0].id;
          if (String(provId) === getActiveProvId()) syncUiFromBucket();
          return nuevas.length;
        });
      });
    });
  }

  function persistNumeroFacturasFromDom(host) {
    if (!host) return;
    host.querySelectorAll('.cxf-num-factura').forEach(function (inp) {
      var pid = inp.getAttribute('data-prov-id');
      var fac = getFactura(pid, inp.getAttribute('data-factura-id'));
      if (fac) fac.numeroFactura = inp.value;
    });
  }

  function persistValorCajeroFromDom(host) {
    if (!host) return;
    host.querySelectorAll('.cxf-valor-cajero').forEach(function (inp) {
      var pid = inp.getAttribute('data-prov-id');
      var fac = getFactura(pid, inp.getAttribute('data-factura-id'));
      if (fac) fac.valorCajero = inp.value;
    });
  }

  function attemptGoProductos(host) {
    persistNumeroFacturasFromDom(host);
    persistValorCajeroFromDom(host);
    persistActiveBucket();
    if (isModoComplejo()) {
      var sinAplicar = [];
      ui.proveedorIds.forEach(function (pid) {
        var b = ensureBucket(pid);
        if (!b) return;
        b.facturas.forEach(function (f) {
          if (!f.docs || !f.docs.length) return;
          if (f.feAnalisis && f.feAnalisis.esElectronica && !f.feAnalisis.aplicadoAt) {
            sinAplicar.push(f.numeroFactura || 'factura sin número');
          }
        });
      });
      if (sinAplicar.length && !global.confirm(
        'Hay ' +
          sinAplicar.length +
          ' factura(s) electrónica(s) sin «Aplicar datos».\n\n¿Continuar igual a productos?'
      )) {
        return;
      }
    }
    if (!totalDocsCount()) return toast('Adjunte al menos un archivo en algún proveedor', 'warning');
    if (hasImageDocs()) {
      promptAndConvertImages(host, { scope: 'all', autoGoProductos: true });
      return;
    }
    if (hasNonPdfDocs()) return toast('Solo se permiten archivos PDF en este paso', 'warning');
    ui.proveedorIds.forEach(function (pid) {
      reorganizeFacturasPorPdf(pid);
    });
    if (!ui.proveedorActivo) ui.proveedorActivo = ui.proveedorIds.find(provHasDocs) || ui.proveedorIds[0];
    setActiveProv(ui.proveedorActivo);
    ui.step = 'productos';
    syncValorFromLines();
    refreshStepHost(host);
  }

  function hasImageDocs() {
    return ui.proveedorIds.some(function (id) {
      return listImageDocsForProv(id).length > 0;
    });
  }

  function removeImageDocsForProv(provId) {
    var b = ensureBucket(provId);
    if (!b) return;
    b.facturas.forEach(function (f) {
      f.docs = (f.docs || []).filter(function (d) {
        return !(d.mime && d.mime.indexOf('image') >= 0);
      });
      if (f.docPreviewIdx >= f.docs.length) f.docPreviewIdx = Math.max(0, f.docs.length - 1);
    });
    if (String(provId) === getActiveProvId()) syncUiFromBucket();
  }

  function convertImagesPdfForFactura(provId, facturaId) {
    var f = getFactura(provId, facturaId);
    if (!f) return Promise.resolve();
    var imgs = listImagesInFactura(f);
    if (!imgs.length) return Promise.resolve();
    return imagesToPdf(
      imgs.map(function (d) {
        return d.dataUrl;
      })
    ).then(function (pdfUri) {
      var base = (f.numeroFactura || imgs[0].nombre || 'Factura').replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
      f.docs = [
        {
          id: 'pdf_' + Date.now() + '_' + f.id,
          nombre: base + '.pdf',
          mime: 'application/pdf',
          dataUrl: pdfUri,
        },
      ];
      f.docPreviewIdx = 0;
      if (String(provId) === getActiveProvId()) syncUiFromBucket();
    });
  }

  /** Convierte las fotos de cada bloque/factura en un PDF dentro del mismo bloque (conserva Nº FE y segmentación). */
  function convertImagesPdfPerFactura(provId) {
    var b = ensureBucket(provId);
    if (!b) return Promise.resolve();
    var chain = Promise.resolve();
    b.facturas.forEach(function (f) {
      if (!listImagesInFactura(f).length) return;
      chain = chain.then(function () {
        return convertImagesPdfForFactura(provId, f.id);
      });
    });
    return chain;
  }

  function convertImagesPdfMergedForProv(provId, facturaId) {
    var b = ensureBucket(provId);
    if (!b) return Promise.resolve();
    var f;
    var imgDocs;
    if (facturaId) {
      f = getFactura(provId, facturaId);
      imgDocs = f ? listImagesInFactura(f) : [];
    } else {
      imgDocs = [];
      listImageDocsForProv(provId).forEach(function (item) {
        imgDocs.push(item.doc);
      });
      f = getFactura(provId);
    }
    if (!imgDocs.length) return Promise.resolve();
    return imagesToPdf(
      imgDocs.map(function (d) {
        return d.dataUrl;
      })
    ).then(function (pdfUri) {
      if (!f) {
        f = newFactura();
        b.facturas = [f];
      }
      if (facturaId) {
        f.docs = (f.docs || []).filter(function (d) {
          return !(d.mime && d.mime.indexOf('image') >= 0);
        });
      } else {
        removeImageDocsForProv(provId);
        b.facturas = [f];
      }
      f.docs = (f.docs || []).concat([
        {
          id: 'pdf_' + Date.now(),
          nombre: facturaId ? (f.numeroFactura || 'Factura') + '.pdf' : 'Factura_unificada.pdf',
          mime: 'application/pdf',
          dataUrl: pdfUri,
        },
      ]);
      f.docPreviewIdx = f.docs.length - 1;
      b.facturaActiva = f.id;
      if (String(provId) === getActiveProvId()) syncUiFromBucket();
    });
  }

  function convertImagesPdfEachForProv(provId) {
    return convertImagesPdfOnePerImageForProv(provId);
  }

  /** Una foto → un PDF → un bloque de factura (1 a 1). */
  function convertImagesPdfOnePerImageForProv(provId) {
    var b = ensureBucket(provId);
    if (!b) return Promise.resolve();
    var items = listImageDocsForProv(provId);
    if (!items.length) return Promise.resolve();
    if (items.length === 1) return convertImagesPdfForFactura(provId, items[0].facturaId);
    var kept = b.facturas.filter(function (f) {
      return !listImagesInFactura(f).length;
    });
    var chain = Promise.resolve();
    var nuevas = [];
    items.forEach(function (item, idx) {
      chain = chain.then(function () {
        return imagesToPdf([item.doc.dataUrl]).then(function (pdfUri) {
          var base = (item.doc.nombre || 'Factura').replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
          nuevas.push(
            newFactura({
              numeroFactura: guessNumeroFactura(item.doc.nombre) || '',
              docs: [
                {
                  id: 'pdf_' + Date.now() + '_' + idx,
                  nombre: base + '.pdf',
                  mime: 'application/pdf',
                  dataUrl: pdfUri,
                },
              ],
            })
          );
        });
      });
    });
    return chain.then(function () {
      b.facturas = kept.concat(nuevas);
      if (nuevas.length) b.facturaActiva = nuevas[0].id;
      if (String(provId) === getActiveProvId()) syncUiFromBucket();
    });
  }

  function convertImagesPdfOnePerImageForFactura(provId, facturaId) {
    var f = getFactura(provId, facturaId);
    if (!f) return Promise.resolve();
    var imgs = listImagesInFactura(f);
    if (!imgs.length) return Promise.resolve();
    if (imgs.length === 1) return convertImagesPdfForFactura(provId, facturaId);
    var b = ensureBucket(provId);
    var kept = b.facturas.filter(function (x) {
      return x.id !== facturaId;
    });
    var chain = Promise.resolve();
    var nuevas = [];
    imgs.forEach(function (doc, idx) {
      chain = chain.then(function () {
        return imagesToPdf([doc.dataUrl]).then(function (pdfUri) {
          var base = (doc.nombre || 'Factura').replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
          nuevas.push(
            newFactura({
              numeroFactura: guessNumeroFactura(doc.nombre) || f.numeroFactura || '',
              docs: [
                {
                  id: 'pdf_' + Date.now() + '_' + idx,
                  nombre: base + '.pdf',
                  mime: 'application/pdf',
                  dataUrl: pdfUri,
                },
              ],
            })
          );
        });
      });
    });
    return chain.then(function () {
      b.facturas = kept.concat(nuevas);
      if (nuevas.length) b.facturaActiva = nuevas[0].id;
      if (String(provId) === getActiveProvId()) syncUiFromBucket();
    });
  }

  function countImagesForPdfPrompt(provId, facturaId) {
    if (facturaId) {
      var f = getFactura(provId, facturaId);
      return f ? listImagesInFactura(f).length : 0;
    }
    return listImageDocsForProv(provId).length;
  }

  function countAllImageDocs() {
    return ui.proveedorIds.reduce(function (n, pid) {
      return n + listImageDocsForProv(pid).length;
    }, 0);
  }

  function runImagePdfConversion(mode, scope, provId, facturaId) {
    if (scope === 'all') return convertAllImagesPdf(mode);
    if (mode === 'merged') return convertImagesPdfMergedForProv(provId, scope === 'slot' && facturaId ? facturaId : null);
    // Modo 1 a 1: para evitar mezclar cargas múltiples en un mismo bloque,
    // normalizamos siempre a "una foto = una factura" para todo el proveedor.
    return convertImagesPdfOnePerImageForProv(provId);
  }

  function askImagePdfMode(imgCount) {
    var msg =
      'Se detectaron ' +
      imgCount +
      ' foto(s).\n\nAceptar = 1 foto → 1 PDF\nCancelar = todas las fotos → 1 solo PDF';
    return global.confirm(msg) ? 'each' : 'merged';
  }

  function promptAndConvertImages(host, opts) {
    opts = opts || {};
    var scope = opts.scope || 'prov';
    var provId = opts.provId || getActiveProvId();
    var facturaId = opts.facturaId || '';
    var imgN = scope === 'all' ? countAllImageDocs() : countImagesForPdfPrompt(provId, scope === 'slot' ? facturaId : null);
    if (!imgN) return Promise.resolve(false);
    var mode = askImagePdfMode(imgN);
    toast('Generando PDF…', 'info');
    return runImagePdfConversion(mode, scope, provId, facturaId)
      .then(function () {
        if (scope === 'all') {
          ui.proveedorIds.forEach(function (pid) {
            reorganizeFacturasPorPdf(pid);
          });
        } else if (provId) {
          reorganizeFacturasPorPdf(provId);
        }
        if (opts.autoGoProductos) {
          if (!ui.proveedorActivo) ui.proveedorActivo = ui.proveedorIds.find(provHasDocs) || ui.proveedorIds[0];
          setActiveProv(ui.proveedorActivo);
          ui.step = 'productos';
          syncValorFromLines();
          refreshStepHost(host);
          toast('PDF listo — continuamos a productos', 'success');
        } else {
          scheduleDocumentoRefresh(host);
          toast(mode === 'merged' ? 'Todas las fotos en un PDF' : 'Un PDF por cada foto', 'success');
        }
        return true;
      })
      .catch(function () {
        toast('No se pudo crear PDF', 'warning');
        return false;
      });
  }

  function facturaNeedsSplit(f) {
    var pdfs = (f.docs || []).filter(function (d) {
      return d.mime && d.mime.indexOf('pdf') >= 0;
    });
    return pdfs.length > 1;
  }

  function reorganizeFacturasPorPdf(provId) {
    var b = ensureBucket(provId);
    if (!b) return;
    if (!b.facturas.some(facturaNeedsSplit)) return;
    var pdfs = [];
    b.facturas.forEach(function (f) {
      (f.docs || []).forEach(function (d) {
        if (d.mime && d.mime.indexOf('pdf') >= 0) pdfs.push({ doc: d, numero: f.numeroFactura, lines: f.lines, valor: f.valorFactura, comentarios: f.comentarios, metodo: f.metodoPago });
      });
    });
    if (!pdfs.length) return;
    if (pdfs.length === 1 && b.facturas.length <= 1) return;
    var nuevas = pdfs.map(function (p, idx) {
      var nf = newFactura({
        numeroFactura: p.numero || guessNumeroFactura(p.doc.nombre) || 'FE-' + (idx + 1),
        docs: [p.doc],
        lines: p.lines && p.lines.length ? p.lines : [{ mpId: '', cant: '', precio: '' }],
        valorFactura: p.valor || '',
        comentarios: p.comentarios || '',
        metodoPago: p.metodo || 'transferencia',
      });
      return nf;
    });
    b.facturas = nuevas;
    b.facturaActiva = nuevas[0].id;
  }

  function convertAllImagesPdf(mode) {
    var chain = Promise.resolve();
    ui.proveedorIds.forEach(function (pid) {
      if (!listImageDocsForProv(pid).length) return;
      chain = chain.then(function () {
        return mode === 'each' ? convertImagesPdfOnePerImageForProv(pid) : convertImagesPdfMergedForProv(pid);
      });
    });
    return chain;
  }

  function linesSumForBucket(facturaOrLines) {
    var lines;
    if (facturaOrLines && facturaOrLines.lines) lines = facturaOrLines.lines;
    else if (facturaOrLines && facturaOrLines.facturas) lines = getFactura(getActiveProvId()).lines;
    else lines = ui.lines;
    return (lines || []).reduce(function (s, ln) {
      return s + (Number(ln.precio) || 0);
    }, 0);
  }

  function linesSum() {
    return linesSumForBucket(getFactura(getActiveProvId()));
  }

  function syncValorFromLines() {
    var f = getFactura(getActiveProvId());
    if (!f) return;
    var sum = linesSumForBucket(f);
    if (sum > 0 && !Number(f.valorFactura)) {
      f.valorFactura = String(sum);
      ui.valorFactura = f.valorFactura;
    }
  }

  function countDocsProv(provId) {
    var b = ensureBucket(provId);
    if (!b) return 0;
    return b.facturas.reduce(function (n, f) {
      return n + (f.docs ? f.docs.length : 0);
    }, 0);
  }

  function countLinesProv(provId) {
    var b = ensureBucket(provId);
    if (!b) return 0;
    return b.facturas.reduce(function (n, f) {
      return n + collectLines(f).length;
    }, 0);
  }

  function hasNonPdfDocs() {
    return ui.proveedorIds.some(function (pid) {
      var b = ensureBucket(pid);
      return b.facturas.some(function (f) {
        return (f.docs || []).some(function (d) {
          return !isPdfDoc(d);
        });
      });
    });
  }

  function renderTotalsMatchHtml() {
    var sum = linesSum();
    var val = Number(ui.valorFactura) || 0;
    var diff = val - sum;
    var ok = val > 0 && Math.abs(diff) < 1;
    return (
      '<div class="cxf-factura-totals' +
      (ok ? ' cxf-factura-totals--ok' : val > 0 ? ' cxf-factura-totals--warn' : '') +
      '">' +
      '<div class="cxf-factura-totals__row">' +
      '<label class="cxf-label" for="cxf-valor-factura-lines">Total en factura (papel)</label>' +
      '<input class="form-input cxf-input-lg" type="number" id="cxf-valor-factura-lines" value="' +
      esc(ui.valorFactura || '') +
      '" min="0" step="1" placeholder="Ej. 850000">' +
      '</div>' +
      '<div class="cxf-factura-totals__kpis">' +
      '<span>Suma líneas: <strong id="cxf-sum-lines">' +
      fmtMoney(sum) +
      '</strong></span>' +
      (val > 0
        ? '<span class="cxf-factura-totals__diff" id="cxf-lines-diff">' +
          (ok ? '✓ Coincide con la factura' : '⚠ Diferencia: ' + fmtMoney(diff)) +
          '</span>'
        : '<span class="cxf-muted">Indique el total impreso en la factura</span>') +
      '</div></div>'
    );
  }

  function renderDocPreviewLarge(provId) {
    var f = getFactura(provId || getActiveProvId());
    if (!f) {
      return (
        '<div class="cxf-preview-empty cxf-preview-empty--lg">' +
        '<span class="cxf-preview-empty__icon">📄</span><p>Sin documento</p></div>'
      );
    }
    var doc = f.docs[f.docPreviewIdx] || f.docs[0];
    if (!doc) {
      return (
        '<div class="cxf-preview-empty cxf-preview-empty--lg">' +
        '<span class="cxf-preview-empty__icon">📄</span><p>Sin documento PDF</p></div>'
      );
    }
    if (isPdfDoc(doc) && doc.previewUrl) {
      return (
        '<div class="cxf-pdf-preview-host cxf-preview-frame--lg cxf-pdf-preview-host--ready">' +
        '<img class="cxf-preview-img cxf-preview-img--lg cxf-pdf-preview-img" src="' +
        doc.previewUrl +
        '" alt="Vista previa"></div>'
      );
    }
    if (isPdfDoc(doc)) return renderPdfPreviewHtml(doc, 'cxf-preview-frame--lg');
    return '<img class="cxf-preview-img cxf-preview-img--lg" src="' + esc(doc.dataUrl) + '" alt="Factura">';
  }

  function renderSplitPdfModal() {
    return (
      '<div class="cxf-modal-backdrop" id="cxf-split-modal" hidden aria-hidden="true">' +
      '<div class="cxf-modal" role="dialog" aria-labelledby="cxf-split-modal-title">' +
      '<h3 class="cxf-modal__title" id="cxf-split-modal-title">Dividir PDF en varias facturas</h3>' +
      '<p class="cxf-modal__text">Un mismo PDF con varias facturas (ej. 3 en un archivo). Se separará <strong>por páginas</strong> en bloques distintos para cargar líneas y Nº FE en cada una.</p>' +
      '<label class="cxf-label" for="cxf-split-count">¿Cuántas facturas hay en el PDF?</label>' +
      '<input class="form-input" type="number" id="cxf-split-count" min="2" max="20" value="3" step="1">' +
      '<p class="cxf-muted cxf-split-hint" id="cxf-split-hint"></p>' +
      '<div class="cxf-modal__actions">' +
      '<button type="button" class="btn btn-primary" id="cxf-split-confirm">Dividir PDF</button>' +
      '<button type="button" class="btn btn-outline" data-cxf-split-cancel>Cancelar</button></div></div></div>'
    );
  }

  function renderPdfChoiceModal() {
    return '';
  }

  function renderQrCameraModal() {
    return (
      '<div id="cxf-qr-cam-modal" class="cxf-mp-modal-backdrop" hidden aria-hidden="true">' +
      '<div class="cxf-qr-cam-dialog" role="dialog" aria-modal="true" aria-labelledby="cxf-qr-cam-title">' +
      '<header class="cxf-qr-cam-dialog__head">' +
      '<h3 id="cxf-qr-cam-title">Escanear QR de factura</h3>' +
      '<button type="button" class="cxf-qr-cam-close" data-cxf-qr-cam-close aria-label="Cerrar">×</button>' +
      '</header>' +
      '<p class="cxf-muted cxf-qr-cam-lead">Enfoque el código QR de la factura electrónica (suele estar en una esquina).</p>' +
      '<div id="cxf-qr-cam-host" class="cxf-qr-cam-host"></div>' +
      '<p id="cxf-qr-cam-status" class="cxf-qr-cam-status" role="status">Preparando cámara…</p>' +
      '<div class="cxf-qr-cam-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" data-cxf-qr-cam-retry-perm>Reintentar permiso</button>' +
      '<button type="button" class="btn btn-outline btn-sm" data-cxf-qr-cam-file-btn>📁 Foto del QR</button>' +
      '<input type="file" id="cxf-qr-cam-file-input" accept="image/*" capture="environment" hidden>' +
      '<button type="button" class="btn btn-outline" data-cxf-qr-cam-close>Cancelar</button>' +
      '</div></div></div>'
    );
  }

  function isCxfTauriDesktop() {
    return !!(global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke);
  }

  function resetCxfWebviewCameraPermission() {
    if (!isCxfTauriDesktop()) return Promise.resolve();
    return global.__TAURI__.core.invoke('cxf_reset_webview_camera_permission').catch(function () {});
  }

  function cxfCameraErrorMessage(err) {
    var name = err && err.name ? err.name : '';
    var msg = err && err.message ? err.message : String(err || '');
    var blob = name + ' ' + msg;
    if (/NotAllowed|Permission denied|PermissionDenied/i.test(blob)) {
      if (isCxfTauriDesktop()) {
        return (
          'Permiso bloqueado en el visor de la app (WebView2), no solo en Windows. ' +
          '1) Configuración → Privacidad → Cámara → permitir acceso de escritorio. ' +
          '2) Pulse «Reintentar permiso» abajo. Si antes eligió Bloquear en el aviso interno, ese botón lo restablece.'
        );
      }
      return 'Permiso de cámara denegado. Revise la configuración del navegador.';
    }
    if (/NotFound|DevicesNotFound/i.test(blob)) {
      return 'No se detectó ninguna cámara en este equipo.';
    }
    return 'No se pudo abrir la cámara: ' + (msg || 'error desconocido');
  }

  function tryCxfGetUserMedia() {
    var tries = [
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
    ];
    var i = 0;
    var lastErr;
    function next() {
      if (i >= tries.length) return Promise.reject(lastErr || new Error('Sin cámara'));
      return navigator.mediaDevices.getUserMedia(tries[i]).catch(function (err) {
        lastErr = err;
        i++;
        return next();
      });
    }
    return next();
  }

  function decodeCxfQrFromImageFile(file) {
    if (!file) return Promise.reject(new Error('Sin archivo'));
    return ensureJsQrForCamera().then(function () {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement('canvas');
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            var max = 1280;
            var sc = Math.min(1, max / Math.max(w, h));
            c.width = Math.max(2, (w * sc) | 0);
            c.height = Math.max(2, (h * sc) | 0);
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, c.width, c.height);
            var id = ctx.getImageData(0, 0, c.width, c.height);
            var code = global.jsQR(id.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
            URL.revokeObjectURL(url);
            if (code && code.data) resolve(code.data);
            else reject(new Error('No se encontró QR en la foto'));
          } catch (e) {
            URL.revokeObjectURL(url);
            reject(e);
          }
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('No se pudo leer la imagen'));
        };
        img.src = url;
      });
    });
  }

  function setCxfQrCamStatus(msg, isErr) {
    var el = document.getElementById('cxf-qr-cam-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isErr);
  }

  function stopCxfQrCamera() {
    if (!_cxfQrCam) return;
    if (_cxfQrCam.rafId) cancelAnimationFrame(_cxfQrCam.rafId);
    if (_cxfQrCam.stream) {
      _cxfQrCam.stream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (_) {}
      });
    }
    _cxfQrCam = null;
    var host = document.getElementById('cxf-qr-cam-host');
    if (host) host.innerHTML = '';
  }

  function closeCxfQrCameraModal(resumeBatch) {
    stopCxfQrCamera();
    var modal = document.getElementById('cxf-qr-cam-modal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
    if (resumeBatch !== false) {
      global.__cxfFeBatchPaused = false;
      var h = getCxfHost();
      if (_feAnalisisQueue.length) scheduleFeDrain(h);
    }
  }

  function cancelFeQueueForFactura(provId, facturaId) {
    var key = feAnalisisQueueKey(provId, facturaId);
    _feAnalisisQueue = _feAnalisisQueue.filter(function (q) {
      return q.key !== key;
    });
    var f = getFactura(provId, facturaId);
    if (f) {
      f._fePendienteAnalisis = false;
      f._feAnalisisRunning = false;
    }
  }

  function runFeAnalisisFromQr(provId, facturaId, parsedQr, host) {
    var FD = feDian();
    if (!FD || !FD.analyzeFacturaElectronica) {
      toast('Módulo FE no disponible', 'warning');
      return Promise.resolve();
    }
    cancelFeQueueForFactura(provId, facturaId);
    global.__cxfFeBatchMode = false;
    global.__cxfFeBatchPaused = true;
    var prov = proveedoresList().find(function (p) {
      return String(p.id) === String(provId);
    });
    var f = getFactura(provId, facturaId);
    if (!f) return Promise.resolve();
    var doc = f.docs && f.docs[f.docPreviewIdx || 0];
    f._feAnalisisRunning = true;
    f.feAnalisis = {
      estado: 'analizando',
      pasos: [],
      progreso: FD.createInitialProgreso ? FD.createInitialProgreso() : { pct: 8, label: 'QR de cámara…' },
    };
    host = host || getCxfHost();
    patchFacturaSlotUiIfVisible(host, provId, facturaId);
    return waitPdfWorkIdle()
      .then(function () {
        return yieldToMain(80);
      })
      .then(function () {
        return FD.analyzeFacturaElectronica({
          doc: doc,
          proveedor: prov,
          valorCajero: f.valorCajero || f.valorFactura,
          mpCatalog: mpList(),
          batchMode: false,
          qrPrefill: parsedQr,
          onProgress: function (prog) {
            pushFeAnalisisProgress(f, host, String(provId), String(facturaId), prog);
          },
        });
      })
      .then(function (res) {
        f.feAnalisis = res;
        f._feAnalisisRunning = false;
        patchFacturaSlotUiIfVisible(host, provId, facturaId);
        if (res && res.esElectronica) {
          toast('Factura electrónica identificada por cámara — revise y pulse «Aplicar datos»', 'success');
        } else {
          toast('QR leído — revise el panel o use Reanalizar con el PDF', 'info');
        }
        schedulePersistCxfSession();
      })
      .catch(function (err) {
        f._feAnalisisRunning = false;
        f.feAnalisis = {
          estado: 'error',
          pasos: [{ id: 'err', ok: false, titulo: 'Cámara', detalle: String((err && err.message) || err) }],
        };
        patchFacturaSlotUiIfVisible(host, provId, facturaId);
        toast('No se pudo completar el análisis', 'error');
      })
      .finally(function () {
        global.__cxfFeBatchPaused = false;
        if (_feAnalisisQueue.length) scheduleFeDrain(host || getCxfHost());
      });
  }

  function onCxfQrCameraDecoded(raw) {
    var FD = feDian();
    if (!FD || !FD.parseQrPayload || !_cxfQrCam) return;
    var parsed = FD.parseQrPayload(raw);
    if (!parsed.cufe && !parsed.url) {
      setCxfQrCamStatus('QR leído pero sin CUFE DIAN — acerque más el código.', true);
      return;
    }
    var ctx = { provId: _cxfQrCam.provId, facturaId: _cxfQrCam.facturaId, host: _cxfQrCam.host };
    closeCxfQrCameraModal(false);
    parsed.technique = 'Cámara en vivo';
    toast('QR detectado — analizando factura…', 'success');
    runFeAnalisisFromQr(ctx.provId, ctx.facturaId, parsed, ctx.host);
  }

  function startCxfQrCameraScan() {
    var hostEl = document.getElementById('cxf-qr-cam-host');
    if (!hostEl) return;
    hostEl.innerHTML = '';
    if (!global.isSecureContext) {
      setCxfQrCamStatus('Cámara requiere HTTPS o localhost. Use Reanalizar con el PDF.', true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCxfQrCamStatus('Cámara no disponible en este navegador.', true);
      return;
    }
    var detector = null;
    if (typeof global.BarcodeDetector !== 'undefined') {
      try {
        detector = new global.BarcodeDetector({ formats: ['qr_code'] });
      } catch (_) {}
    }
    var video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.className = 'cxf-qr-cam-video';
    hostEl.appendChild(video);
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    tryCxfGetUserMedia()
      .then(function (stream) {
        var base = _cxfQrCam || {};
        _cxfQrCam = base;
        _cxfQrCam.stream = stream;
        _cxfQrCam.video = video;
        _cxfQrCam.detector = detector;
        _cxfQrCam.canvas = canvas;
        _cxfQrCam.ctx = ctx;
        _cxfQrCam.frame = 0;
        video.srcObject = stream;
        return video.play();
      })
      .then(function () {
        setCxfQrCamStatus('Enfoque el QR — se detecta automáticamente');
        function tick() {
          if (!_cxfQrCam || !_cxfQrCam.video) return;
          var v = _cxfQrCam.video;
          if (v.readyState < 2) {
            _cxfQrCam.rafId = requestAnimationFrame(tick);
            return;
          }
          _cxfQrCam.frame = (_cxfQrCam.frame || 0) + 1;
          if (_cxfQrCam.frame % 6 !== 0) {
            _cxfQrCam.rafId = requestAnimationFrame(tick);
            return;
          }
          if (_cxfQrCam.detector) {
            _cxfQrCam.detector
              .detect(v)
              .then(function (codes) {
                if (codes && codes.length && codes[0].rawValue) onCxfQrCameraDecoded(codes[0].rawValue);
                else _cxfQrCam.rafId = requestAnimationFrame(tick);
              })
              .catch(function () {
                _cxfQrCam.rafId = requestAnimationFrame(tick);
              });
          } else {
            ensureJsQrForCamera()
              .then(function () {
                if (!_cxfQrCam || !_cxfQrCam.video || typeof global.jsQR !== 'function') {
                  _cxfQrCam.rafId = requestAnimationFrame(tick);
                  return;
                }
                var vw = v.videoWidth || 640;
                var vh = v.videoHeight || 480;
                var maxSide = 400;
                var sc = Math.min(1, maxSide / Math.max(vw, vh));
                var tw = Math.max(2, Math.floor(vw * sc));
                var th = Math.max(2, Math.floor(vh * sc));
                _cxfQrCam.canvas.width = tw;
                _cxfQrCam.canvas.height = th;
                _cxfQrCam.ctx.drawImage(v, 0, 0, tw, th);
                var id = _cxfQrCam.ctx.getImageData(0, 0, tw, th);
                var code = global.jsQR(id.data, tw, th, { inversionAttempts: 'attemptBoth' });
                if (code && code.data) onCxfQrCameraDecoded(code.data);
                else _cxfQrCam.rafId = requestAnimationFrame(tick);
              })
              .catch(function () {
                _cxfQrCam.rafId = requestAnimationFrame(tick);
              });
          }
        }
        _cxfQrCam.rafId = requestAnimationFrame(tick);
      })
      .catch(function (err) {
        setCxfQrCamStatus(cxfCameraErrorMessage(err), true);
      });
  }

  function retryCxfQrCameraPermission() {
    setCxfQrCamStatus('Restableciendo permiso de cámara…');
    resetCxfWebviewCameraPermission()
      .then(function () {
        return yieldToMain(120);
      })
      .then(function () {
        startCxfQrCameraScan();
      });
  }

  function openCxfQrPhotoPicker() {
    var inp = document.getElementById('cxf-qr-cam-file-input');
    if (!inp) return;
    inp.value = '';
    inp.click();
  }

  function onCxfQrPhotoFileSelected(file) {
    if (!file || !_cxfQrCam) return;
    setCxfQrCamStatus('Leyendo QR de la foto…');
    decodeCxfQrFromImageFile(file)
      .then(function (raw) {
        onCxfQrCameraDecoded(raw);
      })
      .catch(function (err) {
        setCxfQrCamStatus(
          (err && err.message) || 'No se encontró QR en la foto — acerque más el código',
          true
        );
      });
  }

  var _cxfJsQrLoadP = null;
  function ensureJsQrForCamera() {
    if (typeof global.jsQR === 'function') return Promise.resolve();
    if (_cxfJsQrLoadP) return _cxfJsQrLoadP;
    _cxfJsQrLoadP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'vendor/CrozzoJsQR.js';
      s.onload = function () {
        if (typeof global.jsQR === 'function') resolve();
        else reject(new Error('jsQR'));
      };
      s.onerror = function () {
        reject(new Error('jsQR'));
      };
      document.head.appendChild(s);
    });
    return _cxfJsQrLoadP;
  }

  function openCxfQrCameraModal(provId, facturaId, host) {
    if (!isModoComplejo()) {
      toast('Active modo complejo primero', 'info');
      return;
    }
    cancelFeQueueForFactura(provId, facturaId);
    global.__cxfFeBatchPaused = true;
    _cxfQrCam = { provId: String(provId), facturaId: String(facturaId), host: host || getCxfHost() };
    var modal = document.getElementById('cxf-qr-cam-modal');
    if (!modal) return;
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    startCxfQrCameraScan();
  }

  function proveedoresList() {
    var res = R();
    if (!res) return [];
    if (res.syncProveedoresBidirectional) return res.syncProveedoresBidirectional();
    return res.listProveedores();
  }

  function mpList() {
    var cat = C();
    if (!cat || !cat.list) return [];
    if (cat.ensureMpFromPosVentaDirecta) cat.ensureMpFromPosVentaDirecta({ silent: true });
    return cat.list();
  }

  function getMp(mpId) {
    var cat = C();
    if (!cat || !cat.get) return null;
    return cat.get(mpId);
  }

  function mpUndLabel(und) {
    if (und === 'ML') return 'ml';
    if (und === 'UND' || und === 'UNI') return 'und';
    return 'g';
  }

  function undFieldMeta(und) {
    if (und === 'ML') {
      return {
        pesoTag: 'PESO',
        pesoTitle: 'Mililitros recibidos',
        suffix: 'ml',
        pesoTip: '1 litro = escriba 1000',
      };
    }
    if (und === 'UND' || und === 'UNI') {
      return {
        pesoTag: 'CANTIDAD',
        pesoTitle: 'Unidades recibidas',
        suffix: 'und',
        pesoTip: 'Piezas, botellas o cajas (venta directa)',
      };
    }
    return {
      pesoTag: 'PESO',
      pesoTitle: 'Gramos recibidos',
      suffix: 'g',
      pesoTip: '3 kg de arroz = escriba 3000',
    };
  }

  function renderLinePesoField(ln, mp) {
    var und = mp ? mp.und || 'GR' : 'GR';
    var meta = undFieldMeta(und);
    var cantPh = mp ? String(mp.peso || 1000) : '3000';
    var cantHint = ln.cant ? cantidadHintHtml(ln.cant, und) : '';
    return (
      '<div class="cxf-line-card__col cxf-line-card__col--peso">' +
      '<div class="cxf-field-box cxf-field-box--peso cxf-field-box--compact">' +
      '<span class="cxf-line-peso-title cxf-field-box__title" title="' +
      esc(meta.pesoTip) +
      '">⚖ ' +
      esc(meta.pesoTitle) +
      '</span>' +
      '<div class="cxf-input-with-unit" title="Peso o volumen — no es dinero">' +
      '<input class="form-input cxf-line-cant" type="number" min="0" step="any" placeholder="' +
      esc(cantPh) +
      '" value="' +
      esc(ln.cant) +
      '" inputmode="decimal" aria-label="' +
      esc(meta.pesoTitle) +
      '">' +
      '<span class="cxf-input-with-unit__suffix cxf-line-peso-suffix" aria-hidden="true">' +
      esc(meta.suffix) +
      '</span></div>' +
      '<span class="cxf-line-cant-hint"' +
      (cantHint ? '' : ' hidden') +
      '>' +
      esc(cantHint) +
      '</span></div></div>'
    );
  }

  function renderLineDineroField(ln) {
    return (
      '<div class="cxf-line-card__col cxf-line-card__col--dinero">' +
      '<div class="cxf-field-box cxf-field-box--dinero cxf-field-box--compact">' +
      '<span class="cxf-field-box__title" title="Valor total de esta línea en la factura">💰 Total pagado ($)</span>' +
      '<div class="cxf-input-with-unit cxf-input-with-unit--money">' +
      '<span class="cxf-input-with-unit__prefix" aria-hidden="true">$</span>' +
      '<input class="form-input cxf-line-precio" type="number" min="0" step="1" placeholder="10000" value="' +
      esc(ln.precio) +
      '" inputmode="numeric" aria-label="Total pagado en pesos">' +
      '</div></div></div>'
    );
  }

  function lineUnitPrice(valorTotal, cantidad, und) {
    var mp = { und: und || 'GR' };
    var C = global.CrozzoCatalogoMp;
    if (C && C.compraPrecioUnitario) {
      return C.compraPrecioUnitario({ und: und }, null, valorTotal, cantidad);
    }
    var c = Number(cantidad) || 0;
    var v = Number(valorTotal) || 0;
    if (c <= 0) return 0;
    return v / c;
  }

  function catalogUnitPrice(mp) {
    if (!mp) return 0;
    var ref = Number(mp.peso) || 0;
    var total = Number(mp.precioTotal) || 0;
    if (ref <= 0) return 0;
    return total / ref;
  }

  function formatUnitPrice(unit, und) {
    if (!unit || unit <= 0) return '—';
    var u = mpUndLabel(und);
    var n = unit;
    if (n >= 100) n = Math.round(n);
    else if (n >= 1) n = Math.round(n * 100) / 100;
    else n = Math.round(n * 10000) / 10000;
    return '$' + n.toLocaleString('es-CO') + '/' + u;
  }

  function formatDeltaUnit(delta, und) {
    var n = Math.abs(Number(delta) || 0);
    if (n <= 0) return '';
    var sign = delta > 0 ? '+' : '−';
    if (n >= 100) n = Math.round(n * 100) / 100;
    else if (n >= 1) n = Math.round(n * 100) / 100;
    else n = Math.round(n * 10000) / 10000;
    return sign + '$' + n.toLocaleString('es-CO') + '/' + mpUndLabel(und);
  }

  function cantidadHintHtml(cant, und) {
    var c = Number(cant) || 0;
    if (c <= 0) return '';
    if (und === 'GR' && c >= 1000) {
      return '≈ ' + (Math.round((c / 1000) * 10) / 10).toLocaleString('es-CO') + ' kg';
    }
    if (und === 'ML' && c >= 1000) {
      return '≈ ' + (Math.round((c / 1000) * 10) / 10).toLocaleString('es-CO') + ' L';
    }
    return '';
  }

  function catalogCosteoHint(mp) {
    if (!mp) return '';
    var ref = Number(mp.peso) || 0;
    var total = Number(mp.precioTotal) || 0;
    if (ref <= 0) return 'Sin referencia de costeo';
    return (
      'Costeo actual: ' +
      formatUnitPrice(catalogUnitPrice(mp), mp.und) +
      ' (ref. ' +
      ref.toLocaleString('es-CO') +
      ' ' +
      mpUndLabel(mp.und) +
      ' · ' +
      fmtMoney(total) +
      ')'
    );
  }

  function evalLinePrice(mpId, valorTotal, cantidad) {
    var item = getMp(mpId);
    var und = item ? item.und || 'GR' : 'GR';
    var cant = Number(cantidad) || 0;
    var valor = Number(valorTotal) || 0;
    var nuevoUnit = lineUnitPrice(valor, cant, und);
    var anteriorUnit = catalogUnitPrice(item);
    var delta = nuevoUnit - anteriorUnit;
    var base = {
      anterior: anteriorUnit,
      nuevo: nuevoUnit,
      und: und,
      delta: delta,
      valorTotal: valor,
      cantidad: cant,
    };
    if (!item) {
      return Object.assign(base, {
        nivel: 'nuevo',
        mensaje: 'Producto nuevo — al guardar se crea el costeo',
        corto: 'Nuevo en catálogo',
      });
    }
    if (cant <= 0 || valor <= 0) {
      return Object.assign(base, {
        nivel: 'pendiente',
        mensaje: cant <= 0 ? 'Indique cantidad en ' + mpUndLabel(und) : 'Indique el total pagado en la factura',
        corto: 'Complete los datos',
      });
    }
    if (anteriorUnit <= 0) {
      return Object.assign(base, {
        nivel: 'nuevo',
        mensaje: 'Primera compra registrada: ' + formatUnitPrice(nuevoUnit, und),
        corto: 'Primera compra',
      });
    }
    var eng = E();
    var ev =
      eng && eng.evaluarVariacionPrecio
        ? eng.evaluarVariacionPrecio(anteriorUnit, nuevoUnit, { umbralRatio: 2.2 })
        : { ok: true, ratio: anteriorUnit > 0 ? nuevoUnit / anteriorUnit : 1 };
    if (Math.abs(delta) < 0.005) {
      return Object.assign(base, {
        nivel: 'igual',
        mensaje: 'Igual al costeo (' + formatUnitPrice(anteriorUnit, und) + ')',
        corto: 'Sin cambio',
        ratio: 1,
        actualizaCosteo: false,
      });
    }
    if (!ev.ok) {
      return Object.assign(base, {
        nivel: 'alerta',
        mensaje:
          '¡Revise! De ' +
          formatUnitPrice(anteriorUnit, und) +
          ' a ' +
          formatUnitPrice(nuevoUnit, und) +
          ' — ¿cantidad o total correctos?',
        corto: 'Variación extrema',
        ratio: ev.ratio,
        confirmar:
          (item.nombre || 'Producto') +
          ': el precio por ' +
          mpUndLabel(und) +
          ' pasaría de ' +
          formatUnitPrice(anteriorUnit, und) +
          ' a ' +
          formatUnitPrice(nuevoUnit, und) +
          '.\n\n' +
          (ev.mensaje || 'Revise la factura antes de guardar.'),
        actualizaCosteo: true,
      });
    }
    var sube = delta > 0;
    var deltaTxt = formatDeltaUnit(delta, und);
    return Object.assign(base, {
      nivel: sube ? 'sube' : 'baja',
      mensaje:
        (sube ? 'Subió ' : 'Bajó ') +
        deltaTxt +
        ' · costeo ' +
        formatUnitPrice(anteriorUnit, und) +
        ' → compra ' +
        formatUnitPrice(nuevoUnit, und),
      corto: (sube ? 'Subió ' : 'Bajó ') + deltaTxt,
      ratio: ev.ratio,
      actualizaCosteo: true,
    });
  }

  function linePriceInsightHtml(ev, mp, compact) {
    if (!ev) {
      return '<div class="cxf-line-price-insight cxf-line-price-insight--empty"><span>Elija producto, peso y dinero</span></div>';
    }
    if (ev.nivel === 'pendiente') {
      return (
        '<div class="cxf-line-price-insight cxf-line-price-insight--empty"><span>' + esc(ev.mensaje) + '</span></div>'
      );
    }
    var cls =
      'cxf-line-price-insight cxf-line-price-insight--' +
      (ev.nivel || 'nuevo') +
      (compact ? ' cxf-line-price-insight--compact' : '');
    var badge =
      ev.corto && ev.nivel !== 'pendiente'
        ? '<span class="cxf-price-chip cxf-price-chip--' +
          esc(ev.nivel) +
          '" title="' +
          esc(ev.mensaje) +
          '">' +
          esc(ev.corto) +
          '</span>'
        : '';
    var formula = '';
    if (ev.cantidad > 0 && ev.valorTotal > 0) {
      formula =
        '<span class="cxf-line-price-insight__formula">' +
        esc(fmtMoney(ev.valorTotal)) +
        ' ÷ ' +
        ev.cantidad.toLocaleString('es-CO') +
        ' ' +
        mpUndLabel(ev.und) +
        ' → <strong>' +
        formatUnitPrice(ev.nuevo, ev.und) +
        '</strong></span>';
    }
    var cmp = '';
    if (ev.anterior > 0 && ev.nuevo > 0 && ev.nivel !== 'igual') {
      cmp =
        '<span class="cxf-line-price-insight__cmp">Costeo ' +
        formatUnitPrice(ev.anterior, ev.und) +
        (ev.delta != null && Math.abs(ev.delta) >= 0.005
          ? ' · <em class="cxf-line-price-insight__delta">' + esc(formatDeltaUnit(ev.delta, ev.und)) + '</em>'
          : '') +
        '</span>';
    } else if (ev.nivel === 'igual' && ev.anterior > 0) {
      cmp = '<span class="cxf-line-price-insight__cmp">Igual al costeo ' + formatUnitPrice(ev.anterior, ev.und) + '</span>';
    }
    var foot =
      ev.nivel === 'alerta'
        ? '<span class="cxf-line-price-insight__warn">Revise antes de guardar</span>'
        : ev.actualizaCosteo !== false && ev.nuevo > 0
          ? '<span class="cxf-line-price-insight__save">Actualiza costeo al guardar</span>'
          : '';
    if (compact) {
      return (
        '<div class="' +
        cls +
        '" title="' +
        esc(ev.mensaje) +
        '">' +
        '<div class="cxf-line-price-insight__row">' +
        badge +
        formula +
        '</div>' +
        (cmp || foot
          ? '<div class="cxf-line-price-insight__row cxf-line-price-insight__row--sub">' + cmp + foot + '</div>'
          : '') +
        '</div>'
      );
    }
    return (
      '<div class="' +
      cls +
      '" title="' +
      esc(ev.mensaje) +
      '">' +
      badge +
      formula +
      cmp +
      foot +
      '</div>'
    );
  }

  function priceChipHtml(ev) {
    return linePriceInsightHtml(ev, null);
  }

  function updateLinePriceCell(tr) {
    if (!tr) return;
    var cell = tr.querySelector('.cxf-line-ev');
    if (!cell) return;
    var mpIdInp = tr.querySelector('.cxf-line-mp-id');
    var cant = tr.querySelector('.cxf-line-cant');
    var precio = tr.querySelector('.cxf-line-precio');
    var hintCant = tr.querySelector('.cxf-line-cant-hint');
    var mp = mpIdInp && mpIdInp.value ? getMp(mpIdInp.value) : null;
    if (hintCant && mp) {
      var h = cantidadHintHtml(cant && cant.value, mp.und || 'GR');
      hintCant.textContent = h;
      hintCant.hidden = !h;
    }
    var ev =
      mpIdInp && mpIdInp.value
        ? evalLinePrice(mpIdInp.value, precio && precio.value, cant && cant.value)
        : null;
    cell.innerHTML = linePriceInsightHtml(ev, mp);
  }

  function stepIndex(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i;
    return 0;
  }

  function canGoStep(id) {
    if (id === 'proveedor') return true;
    if (!ui.proveedorIds.length) return false;
    if (id === 'documento') return true;
    if (id === 'productos') return totalDocsCount() > 0 || true;
    if (id === 'cierre') {
      var hostCk = getCxfHost();
      if (ui.step === 'productos' && hostCk && hostCk.querySelectorAll('.cxf-line').length) {
        readLinesFromDom(hostCk);
        persistActiveBucket();
      } else {
        syncUiFromBucket();
      }
      return collectLines().length > 0 || Number(ui.valorFactura) > 0;
    }
    return false;
  }

  function renderStepper() {
    var cur = stepIndex(ui.step);
    return STEPS.map(function (s, i) {
      var done = i < cur;
      var active = s.id === ui.step;
      var locked = !canGoStep(s.id) && i > cur;
      return (
        '<button type="button" class="crozzo-mod-nav__item cxf-step' +
        (active ? ' is-active' : '') +
        (done ? ' is-done' : '') +
        (locked ? ' is-locked' : '') +
        '" data-cxf-step="' +
        esc(s.id) +
        '"' +
        (locked ? ' disabled' : '') +
        '>' +
        '<span class="crozzo-mod-nav__num">' +
        (done ? '✓' : String(i + 1)) +
        '</span>' +
        '<span class="crozzo-mod-nav__label">' +
        esc(s.label) +
        '</span></button>'
      );
    }).join('');
  }

  function renderAlertasBanner() {
    var res = R();
    if (!res || !res.listAlertasPrecio) return '';
    var list = res.listAlertasPrecio(5).filter(function (a) {
      return !a.leida && (a.nivel === 'alerta' || a.nivel === 'sube');
    });
    if (!list.length) return '';
    return (
      '<div class="cxf-alerts">' +
      list
        .map(function (a) {
          return (
            '<div class="cxf-alert cxf-alert--' +
            esc(a.nivel || 'sube') +
            '"><strong>' +
            esc(a.productoNombre || a.mpId || 'Insumo') +
            '</strong> — ' +
            esc(a.mensaje || 'Variación de precio') +
            (a.proveedorNombre ? ' · ' + esc(a.proveedorNombre) : '') +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function provOptions() {
    return proveedoresList()
      .map(function (p) {
        var sel = String(p.id) === String(ui.proveedorId) ? ' selected' : '';
        var rubro = p.tipoRubro || p.categoria || '';
        return (
          '<option value="' +
          esc(p.id) +
          '"' +
          sel +
          ' data-rubro="' +
          esc(rubro) +
          '">' +
          esc(p.nombre) +
          (p.nit ? ' · NIT ' + esc(p.nit) : '') +
          '</option>'
        );
      })
      .join('');
  }

  function filteredMpList(q) {
    var needle = String(q || '')
      .trim()
      .toLowerCase();
    var cat = C();
    if (needle && cat && cat.findPosDirectoForRecepcion && cat.ensureMpFromPosProducto) {
      var hits = cat.findPosDirectoForRecepcion(needle);
      hits.forEach(function (p) {
        cat.ensureMpFromPosProducto(p, { silent: true });
      });
    }
    return mpList()
      .filter(function (mp) {
        if (!needle) return true;
        var blob = [mp.nombre, mp.categoria, mp.id, mp.und, mp.esReventaPos ? 'venta directa pos' : '']
          .join(' ')
          .toLowerCase();
        return blob.indexOf(needle) >= 0;
      })
      .sort(function (a, b) {
        var ar = cat && cat.isMpReventaPos && cat.isMpReventaPos(a) ? 0 : 1;
        var br = cat && cat.isMpReventaPos && cat.isMpReventaPos(b) ? 0 : 1;
        if (ar !== br) return ar - br;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
      });
  }

  function getMpLineFilter(lineIdx) {
    return ui.mpLineFilters[lineIdx] != null ? ui.mpLineFilters[lineIdx] : '';
  }

  function mpComboDisplayValue(lineIdx, ln) {
    if (ui.mpLineComboOpen === lineIdx) return getMpLineFilter(lineIdx);
    if (ln && ln.mpId) {
      var mp = getMp(ln.mpId);
      return mp ? mp.nombre : '';
    }
    return getMpLineFilter(lineIdx);
  }

  function renderMpComboOptionsHtml(q, lineIdx, selectedId) {
    var list = filteredMpList(q).slice(0, 80);
    if (!list.length) {
      return '<div class="cxf-combobox__empty">Sin coincidencias — escriba para buscar o use «+ Nuevo»</div>';
    }
    return list
      .map(function (mp) {
        var sel = String(mp.id) === String(selectedId || '');
        var unit = mpUndLabel(mp.und || 'GR');
        var cat = C();
        var reventa = cat && cat.isMpReventaPos && cat.isMpReventaPos(mp);
        var reventaTag = reventa
          ? '<span class="cxf-combobox__option-tag">Venta directa · POS</span> '
          : '';
        return (
          '<button type="button" class="cxf-combobox__option' +
          (sel ? ' is-selected' : '') +
          '" data-mp-id="' +
          attrQuote(mp.id) +
          '" data-line-idx="' +
          lineIdx +
          '" data-peso="' +
          esc(mp.peso) +
          '" data-und="' +
          esc(mp.und || 'GR') +
          '" data-precio="' +
          esc(mp.precioTotal) +
          '">' +
          '<span class="cxf-combobox__option-name">' +
          esc(mp.nombre) +
          '</span>' +
          '<span class="cxf-combobox__option-meta">' +
          reventaTag +
          esc(mp.categoria || 'General') +
          ' · ref. ' +
          esc(mp.peso || '—') +
          ' ' +
          unit +
          (mp.precioTotal ? ' · ' + fmtMoney(mp.precioTotal) : '') +
          '</span></button>'
        );
      })
      .join('');
  }

  function renderMpComboCell(lineIdx, ln) {
    var open = ui.mpLineComboOpen === lineIdx;
    var display = mpComboDisplayValue(lineIdx, ln);
    return (
      '<div class="cxf-mp-combobox cxf-combobox--line' +
      (open ? ' is-open' : '') +
      '" data-line-idx="' +
      lineIdx +
      '">' +
      '<input type="hidden" class="cxf-line-mp-id" value="' +
      esc(ln.mpId || '') +
      '">' +
      '<input class="form-input cxf-combobox__input cxf-mp-combo-input" type="text" role="combobox" aria-expanded="' +
      (open ? 'true' : 'false') +
      '" autocomplete="off" placeholder="Buscar materia prima…" value="' +
      esc(display) +
      '">' +
      '<div class="cxf-combobox__list" role="listbox"' +
      (open ? '' : ' hidden') +
      '>' +
      renderMpComboOptionsHtml(display || getMpLineFilter(lineIdx), lineIdx, ln.mpId) +
      '</div></div>'
    );
  }

  function setMpComboOpenUi(host, lineIdx, open) {
    host.querySelectorAll('.cxf-line-card.is-combo-open').forEach(function (el) {
      el.classList.remove('is-combo-open');
    });
    if (!open && open !== 0) return;
    var line = host.querySelector('.cxf-line[data-line="' + lineIdx + '"]');
    if (line) line.classList.add('is-combo-open');
  }

  function closeAllMpCombos(host) {
    ui.mpLineComboOpen = null;
    host.querySelectorAll('.cxf-mp-combobox.is-open').forEach(function (w) {
      w.classList.remove('is-open');
      var list = w.querySelector('.cxf-combobox__list');
      if (list) list.hidden = true;
      var inp = w.querySelector('.cxf-mp-combo-input');
      if (inp) inp.setAttribute('aria-expanded', 'false');
    });
    setMpComboOpenUi(host, null, false);
  }

  function refreshMpComboList(host, lineIdx) {
    var wrap = host.querySelector('.cxf-mp-combobox[data-line-idx="' + lineIdx + '"]');
    if (!wrap) return;
    var list = wrap.querySelector('.cxf-combobox__list');
    var hid = wrap.querySelector('.cxf-line-mp-id');
    var inp = wrap.querySelector('.cxf-mp-combo-input');
    if (!list || !inp) return;
    var selectedId = hid ? hid.value : '';
    list.innerHTML = renderMpComboOptionsHtml(inp.value, lineIdx, selectedId);
    list.hidden = false;
    wrap.classList.add('is-open');
    inp.setAttribute('aria-expanded', 'true');
    ui.mpLineComboOpen = lineIdx;
    setMpComboOpenUi(host, lineIdx, true);
  }

  function applyLineMpToDom(host, lineIdx, mp) {
    var tr = host.querySelector('.cxf-line[data-line="' + lineIdx + '"]');
    if (!tr || !mp) return false;
    var hid = tr.querySelector('.cxf-line-mp-id');
    var comboInp = tr.querySelector('.cxf-mp-combo-input');
    if (hid) hid.value = mp.id;
    if (comboInp) comboInp.value = mp.nombre || '';
    return true;
  }

  function updateLineAfterMpPick(host, lineIdx, mp) {
    var tr = host.querySelector('.cxf-line[data-line="' + lineIdx + '"]');
    if (!tr) return;
    var meta = undFieldMeta(mp.und || 'GR');
    var sfx = tr.querySelector('.cxf-line-peso-suffix');
    if (sfx) sfx.textContent = meta.suffix;
    var tit = tr.querySelector('.cxf-line-peso-title');
    if (tit) tit.textContent = '⚖ ' + meta.pesoTitle;
    var cant = tr.querySelector('.cxf-line-cant');
    var precio = tr.querySelector('.cxf-line-precio');
    if (cant && !cant.value) cant.value = String(mp.peso != null ? mp.peso : '');
    if (precio && !precio.value) precio.value = String(mp.precioTotal != null ? mp.precioTotal : '');
    var ref = tr.querySelector('.cxf-line-catalog-ref');
    if (!ref) {
      ref = document.createElement('p');
      ref.className = 'cxf-line-catalog-ref';
      var rowInp = tr.querySelector('.cxf-line-card__row-inputs');
      if (rowInp) tr.insertBefore(ref, rowInp);
      else tr.appendChild(ref);
    }
    ref.textContent = catalogCosteoHint(mp);
    var editBtn = tr.querySelector('.cxf-line-edit-mp');
    if (editBtn) {
      editBtn.disabled = false;
      editBtn.setAttribute('data-mp-id', mp.id);
    }
    updateLinePriceCell(tr);
    readLinesFromDom(host);
    persistActiveBucket();
  }

  function pickMpForLine(host, lineIdx, mpId) {
    host = getCxfHost() || host;
    lineIdx = Number(lineIdx);
    mpId = String(mpId || '').trim();
    if (!mpId) return;
    var mp = getMp(mpId);
    if (!mp) return toast('Producto no encontrado — recargue o créelo con +', 'warning');
    if (!ui.lines[lineIdx]) ui.lines[lineIdx] = { mpId: '', cant: '', precio: '' };
    ui.lines[lineIdx].mpId = mp.id;
    var curCant = Number(ui.lines[lineIdx].cant) || 0;
    var curPrecio = Number(ui.lines[lineIdx].precio) || 0;
    if (curCant <= 0) ui.lines[lineIdx].cant = String(mp.peso != null ? mp.peso : '');
    if (curPrecio <= 0) ui.lines[lineIdx].precio = String(mp.precioTotal != null ? mp.precioTotal : '');
    delete ui.mpLineFilters[lineIdx];
    closeAllMpCombos(host);
    hideMpModal(host);
    persistActiveBucket();
    if (applyLineMpToDom(host, lineIdx, mp)) {
      updateLineAfterMpPick(host, lineIdx, mp);
      toast('«' + mp.nombre + '» asignado a la línea', 'success');
      return;
    }
    refreshStepHost(host);
    toast('«' + mp.nombre + '» asignado a la línea', 'success');
  }

  function closeAllCxfOverlays(host) {
    host = resolveCxfRoot(getCxfHost() || host);
    if (!host) return;
    hideMpModal(host);
    var split = host.querySelector('#cxf-split-modal');
    if (split) {
      split.hidden = true;
      split.setAttribute('aria-hidden', 'true');
    }
    closeAllMpCombos(host);
  }

  function hideMpModal(host) {
    host = resolveCxfRoot(getCxfHost() || host);
    if (!host) return;
    var root = host;
    var modal = root.querySelector('#cxf-mp-modal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.style.cssText =
        'display:none!important;pointer-events:none!important;visibility:hidden!important;z-index:-1!important';
      modal.innerHTML = '';
    }
    ui.creatingMpLine = null;
    ui.editingMpId = '';
    ui.mpEditorMode = 'create';
  }

  function showMpModal(host) {
    host = resolveCxfRoot(getCxfHost() || host);
    if (!host) return;
    var root = host;
    if (ui.creatingMpLine == null) return;
    var modal = root.querySelector('#cxf-mp-modal');
    if (!modal) return;
    modal.innerHTML =
      '<div class="cxf-mp-modal" role="dialog" aria-modal="true" aria-labelledby="cxf-mp-modal-title">' +
      renderMpCreatePanel() +
      '</div>';
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = '';
    modal.style.pointerEvents = '';
    modal.style.visibility = '';
    var nom = modal.querySelector('#cxf-mp-nombre');
    if (nom) {
      try {
        nom.focus();
      } catch (_) {}
    }
  }

  function openMpEditor(host, lineIdx, mpId) {
    host = getCxfHost() || host;
    if (!mpId) return toast('Seleccione un producto primero', 'info');
    ui.creatingMpLine = lineIdx;
    ui.mpEditorMode = 'edit';
    ui.editingMpId = String(mpId);
    closeAllMpCombos(host);
    showMpModal(host);
  }

  function openMpCreate(host, lineIdx) {
    host = getCxfHost() || host;
    ui.creatingMpLine = lineIdx;
    ui.mpEditorMode = 'create';
    ui.editingMpId = '';
    closeAllMpCombos(host);
    showMpModal(host);
  }

  function filteredProveedores() {
    var q = String(ui.provFilter || '')
      .trim()
      .toLowerCase();
    var list = proveedoresList();
    if (!q) return list;
    return list.filter(function (p) {
      var blob = [p.nombre, p.nit, p.tipoRubro, p.categoria, p.telefono, p.email].join(' ').toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }

  function renderProvComboOptionsHtml() {
    var list = filteredProveedores().slice(0, 80);
    if (!list.length) {
      return '<div class="cxf-combobox__empty">Sin coincidencias — pruebe otro texto o cree uno en «+ Nuevo»</div>';
    }
    return list
      .map(function (p) {
        var rubro = p.tipoRubro || p.categoria || '';
        var ya = ui.proveedorIds.indexOf(String(p.id)) >= 0;
        return (
          '<button type="button" class="cxf-combobox__option' +
          (ya ? ' is-in-list' : '') +
          '" data-cxf-prov-pick="' +
          esc(p.id) +
          '">' +
          '<span class="cxf-combobox__option-name">' +
          (ya ? '✓ ' : '') +
          esc(p.nombre) +
          '</span>' +
          '<span class="cxf-combobox__option-meta">' +
          (p.nit ? 'NIT ' + esc(p.nit) : '') +
          (rubro ? (p.nit ? ' · ' : '') + esc(rubro) : '') +
          (ya ? ' · en la lista' : ' · clic para agregar') +
          '</span></button>'
        );
      })
      .join('');
  }

  function renderProvChipsHtml() {
    var provs = getSelectedProviders();
    if (!provs.length) {
      return (
        '<div class="cxf-prov-empty cxf-prov-empty--chips">' +
        '<span aria-hidden="true">🏢</span>' +
        '<p>Busque arriba y haga clic en un proveedor para agregarlo. Puede elegir varios.</p></div>'
      );
    }
    return (
      '<div class="cxf-prov-chips">' +
      provs
        .map(function (p, i) {
          return (
            '<div class="cxf-prov-chip">' +
            '<span class="cxf-prov-chip__num">' +
            (i + 1) +
            '</span>' +
            '<span class="cxf-prov-chip__body">' +
            '<strong>' +
            esc(p.nombre) +
            '</strong>' +
            (p.nit ? '<span class="cxf-prov-chip__meta">NIT ' + esc(p.nit) + '</span>' : '') +
            '</span>' +
            '<button type="button" class="cxf-prov-chip__rm" data-cxf-prov-remove="' +
            esc(p.id) +
            '" title="Quitar de esta sesión" aria-label="Quitar ' +
            esc(p.nombre) +
            '">×</button></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderProveedorSelectPane() {
    var count = proveedoresList().length;
    var listOpen = ui.provComboOpen;
    return (
      '<div class="cxf-card cxf-card--featured cxf-prov-pane cxf-prov-pane--full">' +
      '<label class="cxf-label" for="cxf-prov-combo">Buscar proveedor y agregar a la lista</label>' +
      '<div class="cxf-combobox-row">' +
      '<div class="cxf-combobox' +
      (listOpen ? ' is-open' : '') +
      '" id="cxf-prov-combobox">' +
      '<input class="form-input cxf-combobox__input" id="cxf-prov-combo" type="text" role="combobox" aria-expanded="' +
      (listOpen ? 'true' : 'false') +
      '" aria-controls="cxf-prov-list" autocomplete="off" placeholder="Nombre, NIT o rubro…" value="' +
      esc(ui.provFilter || '') +
      '">' +
      '<div class="cxf-combobox__list" id="cxf-prov-list" role="listbox"' +
      (listOpen ? '' : ' hidden') +
      '>' +
      renderProvComboOptionsHtml() +
      '</div></div>' +
      '<button type="button" class="btn btn-outline" id="cxf-prov-add-first" title="Agregar el primero de la lista">+ Agregar</button></div>' +
      '<p class="cxf-hint-inline">Haga clic en un resultado o pulse <kbd>Enter</kbd> para agregar el primero.</p>' +
      (count
        ? '<p class="cxf-muted">' + count + ' proveedor' + (count === 1 ? '' : 'es') + ' en el sistema</p>'
        : '<p class="cxf-muted">Sin proveedores — use la pestaña «+ Nuevo».</p>') +
      '<h3 class="cxf-prov-chips-title">Proveedores en esta recepción (' +
      ui.proveedorIds.length +
      ')</h3>' +
      renderProvChipsHtml() +
      '<div class="cxf-step-actions">' +
      '<button type="button" class="btn btn-primary btn-lg cxf-btn-next" id="cxf-go-documento"' +
      (ui.proveedorIds.length ? '' : ' disabled') +
      '>Continuar a facturas <span aria-hidden="true">→</span></button></div></div>'
    );
  }

  function renderProveedorCreatePane() {
    return (
      '<div class="cxf-card cxf-prov-pane cxf-prov-pane--nuevo">' +
      '<p class="form-hint" style="margin:0 0 12px">Alta mínima para esta recepción. Para certificado RUT/NIT use la pestaña <strong>Desde certificado</strong> o el <button type="button" class="btn btn-link btn-sm" onclick="typeof crozzoNavProveedores===\'function\'&&crozzoNavProveedores(\'import\')">directorio de proveedores</button>.</p>' +
      '<div class="cxf-form-grid cxf-form-grid--wide">' +
      '<div class="cxf-field-span-2"><label class="cxf-label">Nombre / razón social *</label><input class="form-input" id="cxf-new-nombre" placeholder="Distribuidora Sol Naciente"></div>' +
      '<div><label class="cxf-label">' +
      (typeof global.CrozzoProveedorDocumentos !== 'undefined' && global.CrozzoProveedorDocumentos.labelIdentificador
        ? esc(global.CrozzoProveedorDocumentos.labelIdentificador())
        : 'NIT / RUT') +
      '</label><input class="form-input" id="cxf-new-nit" placeholder="12.345.678-9"></div>' +
      '<div><label class="cxf-label">Rubro *</label><select class="form-input" id="cxf-new-rubro">' +
      TIPOS_RUBRO.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join('') +
      '</select></div>' +
      '<div><label class="cxf-label">Representante</label><input class="form-input" id="cxf-new-rep" placeholder="Opcional"></div>' +
      '<div><label class="cxf-label">Teléfono</label><input class="form-input" id="cxf-new-tel" placeholder="603…"></div>' +
      '<div><label class="cxf-label">Correo</label><input class="form-input" id="cxf-new-email" type="email" placeholder="facturas@…"></div></div>' +
      '<p class="form-hint cxf-legal-note">Retenciones y régimen: revisión contable en oficina.</p>' +
      '<div class="cxf-step-actions">' +
      '<button type="button" class="btn btn-primary btn-lg" id="cxf-save-prov">Guardar y agregar a la lista</button></div></div>'
    );
  }

  function renderProveedorStep() {
    var tab = ui.proveedorTab || 'select';
    return (
      '<section class="cxf-panel cxf-panel--proveedor cxf-panel--full">' +
      '<header class="cxf-prov-hero">' +
      '<p class="cxf-eyebrow">Paso 1 · Proveedores</p>' +
      '<h2 class="cxf-panel-title">¿Quiénes facturan hoy?</h2>' +
      '<p class="cxf-panel-lead">Elija proveedores ya registrados o délos de alta aquí. El directorio completo está en <strong>Compras → Directorio proveedores</strong>.</p>' +
      '</header>' +
      '<nav class="cxf-prov-tabs crozzo-mod-nav crozzo-mod-nav--segmented cxf-prov-tabs--wrap" role="tablist" aria-label="Modo proveedor">' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (tab === 'select' ? ' is-active' : '') +
      '" data-cxf-prov-tab="select" role="tab">Registrado</button>' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (tab === 'nuevo' ? ' is-active' : '') +
      '" data-cxf-prov-tab="nuevo" role="tab">Alta rápida</button>' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (tab === 'importar' ? ' is-active' : '') +
      '" data-cxf-prov-tab="importar" role="tab">Desde certificado</button></nav>' +
      (tab === 'nuevo'
        ? renderProveedorCreatePane()
        : tab === 'importar'
          ? (typeof global.CrozzoProveedorDocumentos !== 'undefined' &&
            global.CrozzoProveedorDocumentos.renderImportBlock
              ? '<div class="cxf-card">' + global.CrozzoProveedorDocumentos.renderImportBlock('cxf-prov-only') + '</div>'
              : '<p class="form-hint">Módulo de importación no cargado.</p>')
          : renderProveedorSelectPane()) +
      '</section>'
    );
  }

  function removeDoc(index, provId, facturaId) {
    var f = getFactura(provId || getActiveProvId(), facturaId);
    if (!f || index < 0 || index >= f.docs.length) return;
    var removed = f.docs[index];
    if (removed && removed.id) revokeCxfPreviewUrl(removed.id);
    f.docs.splice(index, 1);
    if (!f.docs.length) {
      f.docPreviewIdx = 0;
      var b = ensureBucket(provId);
      if (b && b.facturas.length > 1 && !f.docs.length && !collectLines(f).length) {
        b.facturas = b.facturas.filter(function (x) {
          return x.id !== f.id;
        });
        if (!b.facturas.length) b.facturas.push(newFactura());
        b.facturaActiva = b.facturas[0].id;
      }
    } else {
      if (f.docPreviewIdx > index) f.docPreviewIdx--;
      else if (f.docPreviewIdx >= f.docs.length) f.docPreviewIdx = f.docs.length - 1;
    }
    if (String(provId || getActiveProvId()) === getActiveProvId()) syncUiFromBucket();
  }

  function renderDocThumbsForProv(provId, facturaId) {
    var f = getFactura(provId, facturaId);
    if (!f || !f.docs.length) {
      return '<p class="cxf-drop-hint">Sin archivos — suba PDF o fotos</p>';
    }
    return (
      '<div class="cxf-doc-thumbs-head">' +
      '<span class="cxf-doc-thumbs-count">' +
      f.docs.length +
      ' archivo' +
      (f.docs.length === 1 ? '' : 's') +
      '</span>' +
      (f.docs.length > 1
        ? '<button type="button" class="btn btn-outline btn-sm cxf-doc-clear-factura" data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(f.id) +
          '">Quitar todos</button>'
        : '') +
      '</div>' +
      '<div class="cxf-doc-thumbs">' +
      f.docs
        .map(function (d, i) {
          return (
            '<div class="cxf-doc-thumb-wrap' +
            (i === f.docPreviewIdx ? ' is-active' : '') +
            '">' +
            '<button type="button" class="cxf-doc-thumb" data-cxf-doc-idx="' +
            i +
            '" data-prov-id="' +
            esc(provId) +
            '" data-factura-id="' +
            esc(f.id) +
            '" title="Ver ' +
            esc(d.nombre) +
            '">' +
            (d.mime && d.mime.indexOf('pdf') >= 0
              ? '<span class="cxf-doc-thumb__pdf">PDF</span>'
              : '<span class="cxf-doc-thumb__img" aria-hidden="true">🖼</span>') +
            '<span class="cxf-doc-thumb__name">' +
            esc(d.nombre) +
            '</span></button>' +
            '<button type="button" class="cxf-doc-thumb-rm" data-cxf-doc-rm="' +
            i +
            '" data-prov-id="' +
            esc(provId) +
            '" data-factura-id="' +
            esc(f.id) +
            '" title="Quitar" aria-label="Quitar ' +
            esc(d.nombre) +
            '">×</button></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderFacturaSlotPreview(provId, factura) {
    var doc = (factura.docs || [])[factura.docPreviewIdx || 0];
    var preview;
    if (!doc) {
      preview = '<div class="cxf-preview-empty cxf-preview-empty--card"><span>📄</span><p>Vista previa</p></div>';
    } else if (isPdfDoc(doc) && doc.previewUrl) {
      preview =
        '<div class="cxf-pdf-preview-host cxf-preview-frame--card cxf-pdf-preview-host--ready">' +
        '<img class="cxf-preview-img cxf-preview-img--card cxf-pdf-preview-img" src="' +
        doc.previewUrl +
        '" alt="Vista previa del documento"></div>';
    } else if (isPdfDoc(doc)) {
      ensureDocBlobAttached(doc);
      var blobUrl = docHasPayload(doc) ? getPdfBlobUrl(doc) : '';
      if (blobUrl) {
        preview =
          '<div class="cxf-pdf-preview-host cxf-preview-frame--card cxf-pdf-preview-host--blob" data-cxf-pdf-preview="' +
          esc(doc.id) +
          '">' +
          '<iframe class="cxf-pdf-preview-iframe" src="' +
          esc(blobUrl) +
          '#toolbar=0&navpanes=0" title="' +
          esc(doc.nombre || 'PDF') +
          '"></iframe></div>';
      } else if (docHasPayload(doc)) {
        preview = renderPdfPreviewHtml(doc, 'cxf-preview-frame--card');
      } else {
        preview =
          '<div class="cxf-preview-empty cxf-preview-empty--card"><span>📄</span><p>Sin PDF en memoria — vuelva a cargar el archivo</p></div>';
      }
    } else {
      preview =
        '<img class="cxf-preview-img cxf-preview-img--card" src="' + esc(doc.dataUrl) + '" alt="">';
    }
    return (
      '<div class="cxf-prov-factura-card__preview cxf-preview-wrap">' +
      (doc
        ? '<div class="cxf-preview-toolbar">' +
          '<span class="cxf-preview-toolbar__name">' +
          esc(doc.nombre) +
          '</span>' +
          '<button type="button" class="btn btn-outline btn-sm cxf-doc-remove-current" data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(factura.id) +
          '">Quitar</button></div>'
        : '') +
      preview +
      '</div>'
    );
  }

  function renderFacturaSlot(provId, factura, slotIndex, totalSlots) {
    var hasImg = listImagesInFactura(factura).length > 0;
    var canSplit = facturaHasSinglePdf(factura);
    var multi = totalSlots > 1;
    return (
      '<div class="cxf-factura-slot' +
      (multi ? ' cxf-factura-slot--multi' : '') +
      '" data-factura-id="' +
      esc(factura.id) +
      '">' +
      (multi
        ? '<div class="cxf-factura-slot__head"><span class="cxf-factura-slot__tag">Factura ' +
          (slotIndex + 1) +
          '</span>' +
          (factura.docs.length
            ? '<span class="cxf-muted">' +
              factura.docs.length +
              ' PDF</span>'
            : '') +
          '</div>'
        : '') +
      '<div class="cxf-factura-slot__grid">' +
      '<div class="cxf-prov-factura-card__upload cxf-dropzone" data-cxf-drop-prov="' +
      esc(provId) +
      '" data-factura-id="' +
      esc(factura.id) +
      '">' +
      '<input type="file" class="cxf-file-pdf" data-prov-id="' +
      esc(provId) +
      '" data-factura-id="' +
      esc(factura.id) +
      '" accept="application/pdf,.pdf" hidden multiple>' +
      '<input type="file" class="cxf-file-img" data-prov-id="' +
      esc(provId) +
      '" data-factura-id="' +
      esc(factura.id) +
      '" accept="image/*" capture="environment" hidden multiple>' +
      '<div class="cxf-doc-actions">' +
      '<button type="button" class="cxf-doc-btn cxf-pick-pdf" data-prov-id="' +
      esc(provId) +
      '" data-factura-id="' +
      esc(factura.id) +
      '"><span>📁</span> PDF</button>' +
      '<button type="button" class="cxf-doc-btn cxf-doc-btn--gold cxf-pick-img" data-prov-id="' +
      esc(provId) +
      '" data-factura-id="' +
      esc(factura.id) +
      '"><span>📷</span> Foto</button></div>' +
      (hasImg
        ? '<div class="cxf-pdf-tools"><div class="cxf-pdf-tools__btns">' +
          '<button type="button" class="btn btn-outline btn-sm cxf-img-to-pdf" data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(factura.id) +
          '" data-pdf-mode="ask">📄 Convertir fotos de este bloque…</button></div></div>'
        : '') +
      (canSplit
        ? '<div class="cxf-pdf-tools cxf-pdf-tools--split"><button type="button" class="btn btn-outline btn-sm" data-cxf-split-pdf data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(factura.id) +
          '">✂ Dividir PDF en varias facturas</button></div>'
        : '') +
      renderDocThumbsForProv(provId, factura.id) +
      '<label class="cxf-label">Nº factura (FE, prefijo, etc.)</label>' +
      '<input class="form-input cxf-num-factura" data-prov-id="' +
      esc(provId) +
      '" data-factura-id="' +
      esc(factura.id) +
      '" value="' +
      esc(factura.numeroFactura) +
      '" placeholder="FE-12345">' +
      (isModoComplejo()
        ? '<label class="cxf-label">Valor registrado por cajero ($)</label>' +
          '<input class="form-input cxf-valor-cajero" type="number" min="0" step="1" data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(factura.id) +
          '" value="' +
          esc(factura.valorCajero || factura.valorFactura || '') +
          '" placeholder="Total que anotó en caja">' +
          '<p class="form-hint">Se compara con el total de la factura electrónica.</p>' +
          '<div class="cxf-fe-mount" data-cxf-fe-mount data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(factura.id) +
          '">' +
          renderFeAnalisisBlock(provId, factura) +
          '</div>'
        : '') +
      '</div>' +
      renderFacturaSlotPreview(provId, factura) +
      '</div></div>'
    );
  }

  function renderProvFacturaCard(prov, index) {
    var pid = String(prov.id);
    var b = ensureBucket(pid);
    var totalDocs = countDocsProv(pid);
    var imgCount = listImageDocsForProv(pid).length;
    var multiFact = b.facturas.length > 1 || countPdfFacturas(pid) > 1 || imgCount > 1;
    var hasImg = imgCount > 0;
    return (
      '<article class="cxf-prov-factura-card" data-prov-id="' +
      esc(pid) +
      '">' +
      '<header class="cxf-prov-factura-card__head">' +
      '<span class="cxf-prov-factura-card__num">' +
      (index + 1) +
      '</span>' +
      '<div class="cxf-prov-factura-card__title">' +
      '<strong>' +
      esc(prov.nombre) +
      '</strong>' +
      '<span>' +
      (prov.nit ? 'NIT ' + esc(prov.nit) + ' · ' : '') +
      esc(prov.tipoRubro || prov.categoria || 'Proveedor') +
      '</span></div>' +
      '<span class="cxf-prov-factura-card__badge">' +
      (totalDocs
        ? totalDocs +
          ' archivo(s) · ' +
          b.facturas.length +
          ' factura' +
          (b.facturas.length === 1 ? '' : 's')
        : 'Sin factura') +
      '</span></header>' +
      '<div class="cxf-prov-factura-card__body">' +
      (multiFact
        ? '<div class="cxf-facturas-merge-bar">' +
          '<p><strong>Varias facturas detectadas.</strong> Asigne el número (FE-…) a cada una o únelas en una sola recepción.</p>' +
          '<div class="cxf-facturas-merge-bar__btns">' +
          '<button type="button" class="btn btn-outline btn-sm" data-cxf-merge-all data-prov-id="' +
          esc(pid) +
          '">Unir todas en 1 factura</button>' +
          '<button type="button" class="btn btn-outline btn-sm" data-cxf-add-factura data-prov-id="' +
          esc(pid) +
          '">+ Factura vacía</button></div></div>'
        : '') +
      (hasImg
        ? '<div class="cxf-pdf-tools cxf-pdf-tools--prov">' +
          '<p class="cxf-muted">Hay ' +
          imgCount +
          ' foto(s) sin PDF. Elija 1 a 1 o un solo PDF al subir, o convierta ahora:</p>' +
          '<div class="cxf-pdf-tools__btns">' +
          '<button type="button" class="btn btn-primary btn-sm cxf-img-to-pdf" data-prov-id="' +
          esc(pid) +
          '" data-pdf-mode="ask">📑 Convertir fotos a PDF…</button></div></div>'
        : '') +
      '<div class="cxf-facturas-in-prov">' +
      b.facturas
        .map(function (f, i) {
          return renderFacturaSlot(pid, f, i, b.facturas.length);
        })
        .join('') +
      '</div></div></article>'
    );
  }

  function isModoComplejo() {
    return ui.modoEntrada === 'complejo';
  }

  function feDian() {
    return global.CrozzoRecepcionFeDian;
  }

  function renderModoEntradaPicker() {
    return (
      '<section class="cxf-panel cxf-panel--documento cxf-panel--full cxf-panel--modo">' +
      '<header class="cxf-prov-hero">' +
      '<p class="cxf-eyebrow">Paso 2 · Tipo de entrada</p>' +
      '<h2 class="cxf-panel-title">¿Cómo desea cargar las facturas?</h2>' +
      '<p class="cxf-panel-lead">Elija el flujo para esta recepción. Puede cambiarlo volviendo a proveedores y entrando de nuevo.</p>' +
      '</header>' +
      '<div class="cxf-modo-grid">' +
      '<article class="cxf-modo-card">' +
      '<h3 class="cxf-modo-card__title">Simple</h3>' +
      '<p class="cxf-modo-card__desc">Sube PDF o fotos, asigna número de factura y continúa a materias primas como hasta ahora.</p>' +
      '<ul class="cxf-modo-card__list form-hint"><li>Varios PDF por proveedor</li><li>Conversión foto → PDF</li><li>Control manual de líneas</li></ul>' +
      '<button type="button" class="btn btn-primary btn-lg" data-cxf-modo-entrada="simple">Usar modo simple</button></article>' +
      '<article class="cxf-modo-card cxf-modo-card--featured">' +
      '<span class="badge badge-info">Recomendado FE</span>' +
      '<h3 class="cxf-modo-card__title">Complejo</h3>' +
      '<p class="cxf-modo-card__desc">Analiza facturas electrónicas: lee <strong>QR y CUFE</strong>, consulta DIAN, valida proveedor y total del cajero, y sugiere materias primas.</p>' +
      '<ul class="cxf-modo-card__list form-hint"><li>Detección automática FE</li><li>Enlace a catálogo DIAN</li><li>Match proveedor y valor</li><li>Sugerencia de líneas MP</li></ul>' +
      '<button type="button" class="btn btn-primary btn-lg" data-cxf-modo-entrada="complejo">Usar modo complejo</button></article>' +
      '</div>' +
      '<div class="cxf-nav-row">' +
      '<button type="button" class="btn btn-outline" data-cxf-step="proveedor">← Proveedores</button></div></section>'
    );
  }

  var _feProgressPatchTimers = {};
  var _feAnalisisQueue = [];
  var _feAnalisisQueueBusy = false;
  var _pdfPreviewQueue = [];
  var _pdfPreviewQueueBusy = false;
  var _cxfIngestBatch = 0;
  var _cxfIngestOverlayEl = null;
  var _cxfProgressDockEl = null;
  var _cxfProgressDockHideTimer = null;
  var _feBatchSession = null;
  var _cxfIngestDock = { current: 0, total: 0, label: '' };
  var CXF_MAX_PDF_FILE_MB = 18;
  var CXF_MAX_PDF_TOTAL_MB = 70;
  var FE_ANALISIS_TIMEOUT_MS = 4 * 60 * 1000;
  var _cxfPdfJsWorkBusy = false;
  var _cxfPdfJsWorkQueue = [];
  var _feProgressMinInterval = 400;
  var _feProgressLastEmit = {};
  var _cxfDockPending = null;
  var _cxfDockPaintTimer = null;
  var _cxfDockLastPaint = 0;
  var _cxfDockBodyOn = false;
  var _cxfDockRefs = null;
  var _feMpCatalogCache = null;
  var CXF_DOCK_PAINT_MS = 620;
  var CXF_DOCK_PAINT_BATCH_MS = 980;
  var CXF_BG_YIELD_MS = 820;
  var _cxfQrCam = null;
  var CXF_FE_DRAIN_DELAY_MS = 1100;
  var _feDockBatchMerge = null;
  var _feDrainTimer = null;
  var _feBackgroundJob = null;

  function yieldToMain(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms == null ? 16 : ms);
    });
  }

  /** Un solo uso intensivo de PDF.js a la vez (vista previa vs análisis FE). */
  function runExclusivePdfWork(workFn) {
    return new Promise(function (resolve, reject) {
      _cxfPdfJsWorkQueue.push({ fn: workFn, resolve: resolve, reject: reject });
      drainExclusivePdfWork();
    });
  }

  function drainExclusivePdfWork() {
    if (_cxfPdfJsWorkBusy || !_cxfPdfJsWorkQueue.length) return;
    _cxfPdfJsWorkBusy = true;
    var job = _cxfPdfJsWorkQueue.shift();
    Promise.resolve()
      .then(function () {
        return job.fn();
      })
      .then(job.resolve, job.reject)
      .finally(function () {
        _cxfPdfJsWorkBusy = false;
        setTimeout(drainExclusivePdfWork, global.__cxfFeBatchMode ? 320 : 48);
      });
  }

  function waitPdfWorkIdle() {
    return new Promise(function (resolve) {
      function tick() {
        if (!_cxfPdfJsWorkBusy && !_cxfPdfJsWorkQueue.length) resolve();
        else setTimeout(tick, 60);
      }
      tick();
    });
  }

  function readDocumentoDomIntoBuckets(host) {
    persistNumeroFacturasFromDom(host);
    persistValorCajeroFromDom(host);
  }

  function isFeBatchUi() {
    return !!(
      _feBatchSession &&
      _feBatchSession.active &&
      _feBatchSession.total > 1
    );
  }

  function isOnRecepcionPage() {
    var mc = document.getElementById('mainContent');
    return !!(mc && mc.querySelector('.cxf-root'));
  }

  function feModoComplejoActive() {
    return ui.modoEntrada === 'complejo';
  }

  function recordFeBackgroundJob() {
    if (!feModoComplejoActive()) return;
    _feBackgroundJob = {
      returnPage: 'compras-recepcion',
      returnStep: ui.step || 'documento',
      modoEntrada: ui.modoEntrada,
      startedAt: Date.now(),
    };
    schedulePersistCxfSession();
  }

  function isCxfBackgroundWork() {
    return _cxfIngestBatch > 0 || _feAnalisisQueueBusy || _feAnalisisQueue.length > 0;
  }

  /** Bloquea miniaturas JPEG solo mientras corre ingest o análisis FE activo. */
  function isFeBlockingPdfPreviews() {
    if (_cxfIngestBatch > 0) return true;
    if (_feAnalisisQueueBusy) return true;
    if (_feAnalisisQueue.length > 0 && _feBatchSession && _feBatchSession.active) return true;
    return false;
  }

  function syncCxfFeBatchModeFlag() {
    global.__cxfFeBatchMode =
      !!(_feBatchSession && _feBatchSession.active) || _feAnalisisQueue.length >= 2;
  }

  function scheduleFeDrain(host, delayMs) {
    if (_feDrainTimer) clearTimeout(_feDrainTimer);
    delayMs = delayMs != null ? delayMs : CXF_FE_DRAIN_DELAY_MS;
    _feDrainTimer = setTimeout(function () {
      _feDrainTimer = null;
      drainFeAnalisisQueue(host || getCxfHost());
    }, delayMs);
  }

  function syncFeBatchBar(invoicePct) {
    if (!_feBatchSession || !_feBatchSession.total) return 0;
    var done = _feBatchSession.done || 0;
    var total = _feBatchSession.total;
    var slot = 100 / total;
    var inv = Math.min(100, Math.max(0, Number(invoicePct) || 0));
    var bar = done * slot + (inv / 100) * slot;
    if (inv >= 99) bar = Math.min(99.5, (done + 1) * slot - 0.5);
    _feBatchSession.currentPct = inv;
    _feBatchSession.barPct = Math.max(_feBatchSession.barPct || 0, Math.round(bar));
    return _feBatchSession.barPct;
  }

  function feBatchOverallPct() {
    if (!_feBatchSession || !_feBatchSession.total) return 0;
    if (_feBatchSession.complete) return 100;
    return _feBatchSession.barPct != null ? _feBatchSession.barPct : 0;
  }

  function syncFeBatchTotals() {
    var pending = _feAnalisisQueue.length + (_feAnalisisQueueBusy ? 1 : 0);
    if (pending <= 0 && !_feAnalisisQueueBusy) return;
    if (!_feBatchSession) {
      _feBatchSession = {
        active: true,
        done: 0,
        total: 0,
        currentPct: 0,
        barPct: 0,
        label: '',
        currentName: '',
      };
    }
    _feBatchSession.total = Math.max(_feBatchSession.total, (_feBatchSession.done || 0) + pending);
    _feBatchSession.active = true;
    ensureCxfProgressDock();
    updateCxfProgressDock({ phase: 'fe' });
  }

  function finishFeBatchSession() {
    if (!_feBatchSession) return;
    if (_feDockBatchMerge) {
      clearTimeout(_feDockBatchMerge);
      _feDockBatchMerge = null;
    }
    var n = _feBatchSession.total || 0;
    var onPage = isOnRecepcionPage();
    _feBatchSession.currentPct = 100;
    _feBatchSession.barPct = 100;
    _feBatchSession.label = 'Análisis completado';
    _feBatchSession.active = false;
    _feBatchSession.complete = true;
    _feBatchSession.awaitingContinue = true;
    global.__cxfFeBatchMode = false;
    updateCxfProgressDock({ phase: 'fe', complete: true, showContinue: true });
    if (onPage) {
      if (n > 1) {
        toast('Análisis de ' + n + ' facturas listo — revise y pulse «Aplicar datos»', 'success');
      }
      var h = getCxfHost();
      if (h && ui.step === 'documento') {
        scheduleDocumentoRefresh(h, { force: true, deferMs: 200 });
      }
    } else if (n > 0) {
      toast('Análisis de facturas terminado — pulse «Continuar con facturas» abajo', 'success');
    }
    schedulePersistCxfSession();
    setTimeout(function () {
      kickCxfPdfPreviews(getCxfHost());
    }, onPage ? 450 : 120);
    if (_cxfProgressDockHideTimer) clearTimeout(_cxfProgressDockHideTimer);
    if (!onPage) {
      return;
    }
    _cxfProgressDockHideTimer = setTimeout(function () {
      _cxfProgressDockHideTimer = null;
      if (
        !_feBatchSession ||
        !_feBatchSession.awaitingContinue ||
        _feAnalisisQueueBusy ||
        _feAnalisisQueue.length ||
        _cxfIngestBatch > 0
      ) {
        return;
      }
      hideCxfProgressDock();
    }, 12000);
  }

  function ensureCxfProgressDock() {
    if (_cxfProgressDockEl) return _cxfProgressDockEl;
    var el = document.createElement('div');
    el.id = 'cxf-progress-dock';
    el.className = 'cxf-progress-dock';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.innerHTML =
      '<div class="cxf-progress-dock__inner">' +
      '<div class="cxf-progress-dock__head">' +
      '<span class="cxf-progress-dock__spinner" aria-hidden="true"></span>' +
      '<div class="cxf-progress-dock__text">' +
      '<strong class="cxf-progress-dock__title" data-cxf-dock-title>Procesando</strong>' +
      '<span class="cxf-progress-dock__subtitle" data-cxf-dock-subtitle></span>' +
      '</div>' +
      '<span class="cxf-progress-dock__pct" data-cxf-dock-pct>0%</span>' +
      '</div>' +
      '<div class="cxf-progress-dock__bar-wrap"><div class="cxf-progress-dock__bar" data-cxf-dock-bar></div></div>' +
      '<p class="cxf-progress-dock__hint" data-cxf-dock-hint>Puede usar otras pantallas — el análisis sigue en segundo plano</p>' +
      '<div class="cxf-progress-dock__actions" data-cxf-dock-actions hidden></div>' +
      '</div>';
    document.body.appendChild(el);
    _cxfProgressDockEl = el;
    _cxfDockRefs = null;
    return el;
  }

  function syncCxfDockBodyClass(visible) {
    document.body.classList.toggle('cxf-progress-dock-visible', !!visible);
  }

  function hideCxfProgressDock() {
    if (_cxfProgressDockEl) _cxfProgressDockEl.hidden = true;
    syncCxfDockBodyClass(false);
    if (_cxfDockPaintTimer) {
      clearTimeout(_cxfDockPaintTimer);
      _cxfDockPaintTimer = null;
    }
    _cxfDockPending = null;
  }

  function getCxfDockRefs() {
    if (!_cxfProgressDockEl) return null;
    if (_cxfDockRefs && _cxfDockRefs.root === _cxfProgressDockEl) return _cxfDockRefs;
    _cxfDockRefs = {
      root: _cxfProgressDockEl,
      title: _cxfProgressDockEl.querySelector('[data-cxf-dock-title]'),
      subtitle: _cxfProgressDockEl.querySelector('[data-cxf-dock-subtitle]'),
      pct: _cxfProgressDockEl.querySelector('[data-cxf-dock-pct]'),
      bar: _cxfProgressDockEl.querySelector('[data-cxf-dock-bar]'),
      hint: _cxfProgressDockEl.querySelector('[data-cxf-dock-hint]'),
      actions: _cxfProgressDockEl.querySelector('[data-cxf-dock-actions]'),
    };
    return _cxfDockRefs;
  }

  function scheduleCxfProgressDock(opts) {
    _cxfDockPending = Object.assign(_cxfDockPending || {}, opts);
    if (_cxfDockPaintTimer) return;
    var paintMs = isFeBatchUi() ? CXF_DOCK_PAINT_BATCH_MS : CXF_DOCK_PAINT_MS;
    var wait = Math.max(0, paintMs - (Date.now() - _cxfDockLastPaint));
    _cxfDockPaintTimer = setTimeout(function () {
      _cxfDockPaintTimer = null;
      var pending = _cxfDockPending;
      _cxfDockPending = null;
      if (pending) updateCxfProgressDock(pending);
    }, wait);
  }

  function updateCxfProgressDock(opts) {
    opts = opts || {};
    var ingestActive = _cxfIngestBatch > 0;
    var feActive = _feAnalisisQueueBusy || _feAnalisisQueue.length > 0;
    if (opts.visible === false && !ingestActive && !feActive) {
      if (_feBatchSession && _feBatchSession.awaitingContinue) {
        updateCxfProgressDock({ phase: 'fe', complete: true, showContinue: true });
        return;
      }
      hideCxfProgressDock();
      return;
    }
    if (!ingestActive && !feActive && opts.complete) {
      ensureCxfProgressDock();
    } else if (!ingestActive && !feActive && !opts.complete) {
      hideCxfProgressDock();
      return;
    }

    var dock = ensureCxfProgressDock();
    var wasHidden = dock.hidden;
    dock.hidden = false;
    if (!_cxfDockBodyOn) syncCxfDockBodyClass(true);
    _cxfDockLastPaint = Date.now();

    var refs = getCxfDockRefs();
    var titleEl = refs && refs.title;
    var subEl = refs && refs.subtitle;
    var pctEl = refs && refs.pct;
    var barEl = refs && refs.bar;
    var hintEl = refs && refs.hint;
    var actionsEl = refs && refs.actions;
    var pct = 0;
    var title = 'Procesando';
    var subtitle = '';
    var hint = 'Puede seguir usando la pantalla — el progreso no se pierde';

    if (ingestActive || opts.phase === 'ingest') {
      if (opts.current != null) _cxfIngestDock.current = opts.current;
      if (opts.total != null) _cxfIngestDock.total = opts.total;
      if (opts.label) _cxfIngestDock.label = opts.label;
      title = 'Cargando archivos';
      var ic = _cxfIngestDock.current || 0;
      var it = _cxfIngestDock.total || 0;
      subtitle = it ? ic + ' de ' + it + ' archivos' : _cxfIngestDock.label || 'Preparando…';
      pct = it ? Math.round((ic / it) * 100) : 8;
      hint = 'Puede revisar proveedores o facturas ya cargadas mientras termina la importación';
    } else if (feActive || opts.phase === 'fe' || _feBatchSession) {
      if (_feBatchSession) {
        if (opts.currentPct != null) syncFeBatchBar(opts.currentPct);
        if (opts.label) _feBatchSession.label = opts.label;
        if (opts.currentName) _feBatchSession.currentName = opts.currentName;
      }
      title = opts.complete ? 'Análisis FE completado' : 'Análisis factura electrónica';
      var done = _feBatchSession ? _feBatchSession.done || 0 : 0;
      var total = _feBatchSession ? _feBatchSession.total || 1 : 1;
      var working = _feAnalisisQueueBusy ? 1 : 0;
      var pos = Math.min(total, done + working);
      subtitle =
        total > 1
          ? pos + ' de ' + total + ' facturas' + (working ? ' · analizando ahora' : '')
          : working
            ? 'Analizando 1 factura'
            : done + ' de ' + total + ' listas';
      pct = opts.complete ? 100 : feBatchOverallPct();
      if (!opts.complete && _feBatchSession && _feBatchSession.label && total <= 3) {
        subtitle += ' — ' + _feBatchSession.label;
      }
      if (!isOnRecepcionPage() && feActive) {
        hint = 'Puede ir a Oficina u otras pantallas — el análisis no se detiene';
      } else if (isOnRecepcionPage() && feActive) {
        hint = 'Puede seguir en esta pantalla o ir a otra sección del menú';
      }
    }

    if (actionsEl) {
      var showBtn =
        !!opts.showContinue || (_feBatchSession && _feBatchSession.awaitingContinue && !feActive && !ingestActive);
      if (showBtn) {
        actionsEl.hidden = false;
        actionsEl.innerHTML =
          '<button type="button" class="btn btn-primary" data-cxf-goto-recepcion>Continuar con facturas →</button>';
      } else {
        actionsEl.hidden = true;
        actionsEl.innerHTML = '';
      }
    }

    if (!wasHidden || !isFeBatchUi()) {
      if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
      if (hintEl && hintEl.textContent !== hint) hintEl.textContent = hint;
    }
    if (subEl && subEl.textContent !== subtitle) subEl.textContent = subtitle;
    if (pctEl) pctEl.textContent = pct + '%';
    if (barEl) barEl.style.width = pct + '%';
    dock.classList.toggle('is-complete', !!opts.complete);
  }

  function patchFacturaSlotUiIfVisible(host, provId, facturaId) {
    host = host || getCxfHost();
    if (!host || ui.step !== 'documento') return false;
    return patchFacturaSlotUi(host, provId, facturaId);
  }

  function showIngestOverlay(label, opts) {
    opts = opts || {};
    if (_cxfIngestOverlayEl) _cxfIngestOverlayEl.hidden = true;
    scheduleCxfProgressDock({
      phase: 'ingest',
      visible: true,
      current: opts.current,
      total: opts.total,
      label: label,
    });
  }

  function hideIngestOverlay() {
    if (_cxfIngestOverlayEl) _cxfIngestOverlayEl.hidden = true;
    if (_cxfIngestBatch === 0) {
      _cxfIngestDock = { current: 0, total: 0, label: '' };
      if (!_feAnalisisQueueBusy && !_feAnalisisQueue.length) {
        updateCxfProgressDock({ visible: false });
      }
    }
  }

  function feAnalisisQueueKey(provId, facturaId) {
    return String(provId) + ':' + String(facturaId);
  }

  function feAnalisisQueueIndex(key) {
    var i;
    for (i = 0; i < _feAnalisisQueue.length; i++) {
      if (_feAnalisisQueue[i].key === key) return i;
    }
    return -1;
  }

  function markFeColaStates() {
    if (global.__cxfFeBatchMode) return;
    var waiting = _feAnalisisQueue.slice();
    var total = waiting.length + (_feAnalisisQueueBusy ? 1 : 0);
    waiting.forEach(function (item, idx) {
      var f = getFactura(item.provId, item.facturaId);
      if (!f || f._feAnalisisRunning) return;
      if (f.feAnalisis && f.feAnalisis.estado === 'analizando') return;
      if (f.feAnalisis && f.feAnalisis.estado === 'listo') return;
      var pos = (_feAnalisisQueueBusy ? idx + 2 : idx + 1);
      f.feAnalisis = {
        estado: 'en_cola',
        colaPos: pos,
        colaTotal: Math.max(total, pos),
      };
    });
  }

  /** Reconstruye la cola FE para todas las facturas con PDF/foto pendientes. */
  function rebuildFeAnalisisQueue(host, opts) {
    opts = opts || {};
    if (!feModoComplejoActive()) return;
    if (
      !opts.force &&
      _feBatchSession &&
      (_feBatchSession.awaitingContinue ||
        (_feBatchSession.complete && !_feAnalisisQueueBusy && !_feAnalisisQueue.length))
    ) {
      return;
    }
    recordFeBackgroundJob();
    if (!opts.force && (_feAnalisisQueueBusy || _feAnalisisQueue.length > 0)) {
      scheduleFeDrain(host, 120);
      return;
    }
    if (!opts.force && _feBatchSession && _feBatchSession.active) {
      scheduleFeDrain(host, 120);
      return;
    }
    var seen = {};
    var added = 0;
    ui.proveedorIds.forEach(function (pid) {
      var b = ensureBucket(pid);
      if (!b) return;
      b.facturas.forEach(function (f) {
        if (!f.docs || !f.docs.length) return;
        var doc = f.docs[f.docPreviewIdx || 0];
        if (!doc || !docHasPayload(doc)) return;
        var okMime = isPdfDoc(doc) || (doc.mime && doc.mime.indexOf('image') >= 0);
        if (!okMime) return;
        if (f._feAnalisisRunning) return;
        if (f.feAnalisis && f.feAnalisis.estado === 'analizando') return;
        if (f.feAnalisis && f.feAnalisis.estado === 'listo' && !f._fePendienteAnalisis) return;
        var key = feAnalisisQueueKey(pid, f.id);
        if (seen[key]) return;
        if (feAnalisisQueueIndex(key) >= 0) return;
        seen[key] = true;
        f._fePendienteAnalisis = true;
        _feAnalisisQueue.push({ provId: String(pid), facturaId: String(f.id), key: key });
        added++;
      });
    });
    if (!added) return;
    if (!global.__cxfFeBatchMode) markFeColaStates();
    if (!_feBatchSession || opts.force) {
      _feBatchSession = {
        active: true,
        done: 0,
        total: added,
        currentPct: 0,
        barPct: 0,
        label: '',
        currentName: '',
        awaitingContinue: false,
        complete: false,
      };
      _feMpCatalogCache = mpList();
      _pdfPreviewQueue = [];
    } else {
      _feBatchSession.total = Math.max(_feBatchSession.total, (_feBatchSession.done || 0) + added);
      _feBatchSession.active = true;
      _feBatchSession.awaitingContinue = false;
      _feBatchSession.complete = false;
    }
    syncCxfFeBatchModeFlag();
    syncFeBatchTotals();
    scheduleFeDrain(host, CXF_FE_DRAIN_DELAY_MS);
  }

  function drainFeAnalisisQueue(host) {
    if (global.__cxfFeBatchPaused) return;
    if (_feAnalisisQueueBusy || !_feAnalisisQueue.length) {
      if (!_feAnalisisQueueBusy && !_feAnalisisQueue.length && _feBatchSession && _feBatchSession.active) {
        finishFeBatchSession();
      }
      syncCxfFeBatchModeFlag();
      return;
    }
    if (!feModoComplejoActive()) {
      _feAnalisisQueue = [];
      hideCxfProgressDock();
      _feBatchSession = null;
      _feBackgroundJob = null;
      _feMpCatalogCache = null;
      global.__cxfFeBatchMode = false;
      return;
    }
    host = host || getCxfHost();
    syncCxfFeBatchModeFlag();
    syncFeBatchTotals();
    var next = _feAnalisisQueue[0];
    var f = getFactura(next.provId, next.facturaId);
    if (!f) {
      _feAnalisisQueue.shift();
      return drainFeAnalisisQueue(host);
    }
    var doc = f.docs && f.docs[f.docPreviewIdx || 0];
    var okMime = doc && docHasPayload(doc) && (isPdfDoc(doc) || (doc.mime && doc.mime.indexOf('image') >= 0));
    if (!okMime) {
      f._fePendienteAnalisis = false;
      _feAnalisisQueue.shift();
      return drainFeAnalisisQueue(host);
    }
    _feAnalisisQueue.shift();
    _feAnalisisQueueBusy = true;
    if (!isFeBatchUi()) markFeColaStates();
    var docNext = f.docs && f.docs[f.docPreviewIdx || 0];
    scheduleCxfProgressDock({
      phase: 'fe',
      currentPct: 4,
      label: 'Iniciando factura ' + ((_feBatchSession && _feBatchSession.done) || 0) + 1 + '…',
    });
    if (!isFeBatchUi()) patchFacturaSlotUiIfVisible(host, next.provId, next.facturaId);
    waitPdfWorkIdle()
      .then(function () {
        return yieldToMain(isFeBatchUi() ? CXF_BG_YIELD_MS : 32);
      })
      .then(function () {
        return runFeAnalisisNow(next.provId, next.facturaId, host);
      })
      .finally(function () {
        _feAnalisisQueueBusy = false;
        if (!isFeBatchUi()) markFeColaStates();
        if (_feBatchSession) {
          _feBatchSession.done = (_feBatchSession.done || 0) + 1;
          _feBatchSession.currentPct = 0;
          var totalDone = _feBatchSession.total || 1;
          _feBatchSession.barPct = Math.max(
            _feBatchSession.barPct || 0,
            Math.round((_feBatchSession.done / totalDone) * 100)
          );
        }
        scheduleCxfProgressDock({ phase: 'fe' });
        if (!isFeBatchUi()) patchFacturaSlotUiIfVisible(host, next.provId, next.facturaId);
        setTimeout(function () {
          if (!_feAnalisisQueue.length && !_feAnalisisQueueBusy) {
            finishFeBatchSession();
            _feMpCatalogCache = null;
            global.__cxfFeBatchMode = false;
          }
          drainFeAnalisisQueue(host);
        }, isFeBatchUi() ? CXF_BG_YIELD_MS : 180);
      });
  }

  function enqueueFeAnalisis(provId, facturaId, host) {
    if (!feModoComplejoActive()) return;
    recordFeBackgroundJob();
    var pid = String(provId || '');
    var fid = String(facturaId || '');
    var f = getFactura(pid, fid);
    if (!f) return;
    var doc = f.docs && f.docs[f.docPreviewIdx || 0];
    if (!doc || !docHasPayload(doc)) return;
    var okMime = isPdfDoc(doc) || (doc.mime && doc.mime.indexOf('image') >= 0);
    if (!okMime) return;
    if (f.feAnalisis && f.feAnalisis.estado === 'listo' && !f._fePendienteAnalisis) return;
    if (f._feAnalisisRunning) return;

    f._fePendienteAnalisis = true;
    var key = feAnalisisQueueKey(pid, fid);
    if (feAnalisisQueueIndex(key) < 0) {
      _feAnalisisQueue.push({ provId: pid, facturaId: fid, key: key });
    }
    if (_cxfIngestBatch > 0) return;
    if (!global.__cxfFeBatchMode) markFeColaStates();
    syncCxfFeBatchModeFlag();
    scheduleFeDrain(host, global.__cxfFeBatchMode ? CXF_FE_DRAIN_DELAY_MS : 200);
  }

  function enqueuePdfPreview(doc, priority) {
    if (!doc || !isPdfDoc(doc) || doc.previewUrl) return;
    ensureDocViewBlobAttached(doc);
    if (!docHasPayload(doc)) return;
    if (_cxfIngestBatch > 0) return;
    var id = doc.id;
    var i;
    for (i = 0; i < _pdfPreviewQueue.length; i++) {
      if (_pdfPreviewQueue[i].docId === id) return;
    }
    _pdfPreviewQueue.push({ docId: id, priority: priority != null ? priority : 99 });
    _pdfPreviewQueue.sort(function (a, b) {
      return a.priority - b.priority;
    });
    drainPdfPreviewQueue();
  }

  function drainPdfPreviewQueue() {
    if (_pdfPreviewQueueBusy || !_pdfPreviewQueue.length) return;
    if (_cxfIngestBatch > 0) {
      setTimeout(drainPdfPreviewQueue, 400);
      return;
    }
    _pdfPreviewQueueBusy = true;
    var job = _pdfPreviewQueue.shift();
    var doc = findDocById(job.docId);
    if (!doc) {
      _pdfPreviewQueueBusy = false;
      return drainPdfPreviewQueue();
    }
    ensureDocPdfPreview(doc)
      .then(function (d) {
        var loc = findFacturaByDocId(d.id);
        var host = getCxfHost();
        if (loc && host && patchFacturaSlotUi(host, loc.provId, loc.facturaId)) return;
        var hostEl = document.querySelector('[data-cxf-pdf-preview="' + d.id + '"]');
        if (hostEl) showPdfPreviewInHost(hostEl, d);
      })
      .finally(function () {
        _pdfPreviewQueueBusy = false;
        setTimeout(drainPdfPreviewQueue, 120);
      });
  }

  function patchFeLoaderDom(host, provId, facturaId, progreso) {
    if (!host || !progreso) return false;
    var loader = host.querySelector(
      '[data-fe-loader][data-prov-id="' + provId + '"][data-factura-id="' + facturaId + '"]'
    );
    if (!loader) return false;
    var pct = progreso.pct || 0;
    var pctShow = progreso.pctDisplay != null ? progreso.pctDisplay : Math.round(pct);
    var bar = loader.querySelector('[data-fe-loader-bar]');
    var label = loader.querySelector('[data-fe-loader-label]');
    var pctEl = loader.querySelector('[data-fe-loader-pct]');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = progreso.label || 'Procesando…';
    if (pctEl) pctEl.textContent = pctShow + '%';
    if (progreso.steps && progreso.steps.length) {
      var list = loader.querySelector('[data-fe-loader-steps]');
      if (list) {
        list.innerHTML = progreso.steps
          .map(function (s) {
            var cls = 'cxf-fe-loader__step';
            if (s.done) cls += ' is-done';
            else if (s.active) cls += ' is-active';
            return (
              '<li class="' +
              cls +
              '" data-fe-step="' +
              esc(s.id) +
              '"><span class="cxf-fe-loader__step-dot" aria-hidden="true"></span><span>' +
              esc(s.label) +
              '</span></li>'
            );
          })
          .join('');
      }
    }
    return true;
  }

  function pushFeAnalisisProgress(f, host, provId, facturaId, progreso) {
    if (!f) return;
    f.feAnalisis = f.feAnalisis || { estado: 'analizando' };
    f.feAnalisis.progreso = progreso;
    if (isFeBatchUi()) {
      syncFeBatchBar(progreso.pct);
      _cxfDockPending = Object.assign(_cxfDockPending || {}, {
        phase: 'fe',
        currentPct: _feBatchSession.barPct,
        label: progreso.label,
      });
      if (!_feDockBatchMerge) {
        _feDockBatchMerge = setTimeout(function () {
          _feDockBatchMerge = null;
          scheduleCxfProgressDock(_cxfDockPending || { phase: 'fe' });
        }, CXF_DOCK_PAINT_BATCH_MS);
      }
      return;
    }
    scheduleCxfProgressDock({ phase: 'fe', currentPct: progreso.pct, label: progreso.label });
    var key = provId + ':' + facturaId;
    if (_feProgressPatchTimers[key]) clearTimeout(_feProgressPatchTimers[key]);
    var now = Date.now();
    var last = _feProgressLastEmit[key] || 0;
    var wait = Math.max(0, _feProgressMinInterval - (now - last));
    _feProgressPatchTimers[key] = setTimeout(function () {
      _feProgressPatchTimers[key] = null;
      _feProgressLastEmit[key] = Date.now();
      host = host || getCxfHost();
      if (!patchFeLoaderDom(host, provId, facturaId, progreso)) {
        patchFacturaSlotUiIfVisible(host, provId, facturaId);
      }
    }, wait);
  }

  /** Encola análisis FE (uno a la vez aunque suban muchos archivos). */
  function runFeAnalisis(provId, facturaId, host) {
    var f = getFactura(provId, facturaId);
    if (f) {
      f._fePendienteAnalisis = true;
      if (f.feAnalisis && f.feAnalisis.estado === 'listo') {
        f.feAnalisis = null;
      }
      var key = feAnalisisQueueKey(provId, facturaId);
      _feAnalisisQueue = _feAnalisisQueue.filter(function (q) {
        return q.key !== key;
      });
    }
    if (_feBatchSession) {
      _feBatchSession.active = false;
      _feBatchSession = null;
    }
    global.__cxfFeBatchMode = false;
    enqueueFeAnalisis(provId, facturaId, host);
    return Promise.resolve();
  }

  function runFeAnalisisNow(provId, facturaId, host) {
    var FD = feDian();
    if (!FD || !FD.analyzeFacturaElectronica) {
      toast('Módulo de análisis FE no cargado — recargue la página (Ctrl+R)', 'warning');
      return Promise.resolve();
    }
    var prov = proveedoresList().find(function (p) {
      return String(p.id) === String(provId);
    });
    var f = getFactura(provId, facturaId);
    if (!f || !f.docs || !f.docs.length) return Promise.resolve();
    var doc = f.docs[f.docPreviewIdx || 0];
    if (!doc || !docHasPayload(doc)) return Promise.resolve();
    var docEsPdf = isPdfDoc(doc);
    var docEsImg = doc.mime && doc.mime.indexOf('image') >= 0;
    if (!docEsPdf && !docEsImg) return Promise.resolve();
    f._feAnalisisRunning = true;
    f._fePendienteAnalisis = false;
    var progresoIni = FD.createInitialProgreso ? FD.createInitialProgreso() : { pct: 5, label: 'Iniciando…' };
    f.feAnalisis = { estado: 'analizando', pasos: [], progreso: progresoIni };
    host = host || getCxfHost();
    syncFeBatchTotals();
    if (!isFeBatchUi()) patchFacturaSlotUiIfVisible(host, provId, facturaId);
    var quedanEnCola = function () {
      return _feAnalisisQueue.length > 0;
    };
    var analisisP = yieldToMain(global.__cxfFeBatchMode ? 120 : 24).then(function () {
      return ensureDocDataUrl(doc);
    }).then(function (dataUrl) {
      if (!dataUrl && docEsPdf) throw new Error('No se pudo leer el PDF');
      return FD.analyzeFacturaElectronica({
      doc: doc,
      proveedor: prov,
      valorCajero: f.valorCajero || f.valorFactura,
      mpCatalog: _feMpCatalogCache || mpList(),
      batchMode: isFeBatchUi(),
      onProgress: function (prog) {
        pushFeAnalisisProgress(f, host, String(provId), String(facturaId), prog);
      },
    });
    });
    var timeoutP = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Tiempo agotado analizando este documento'));
      }, FE_ANALISIS_TIMEOUT_MS);
    });
    return Promise.race([analisisP, timeoutP])
      .then(function (res) {
        f.feAnalisis = res;
        f._feAnalisisRunning = false;
        patchFacturaSlotUiIfVisible(host, provId, facturaId);
        if (!quedanEnCola() && !isFeBatchUi()) {
          if (res && res.estado === 'error') {
            toast('Error en análisis FE — use Reanalizar', 'warning');
          } else if (res && res.esElectronica) {
            toast('Análisis FE listo — revise y pulse «Aplicar datos»', 'success');
          } else if (res) {
            toast('Documentos analizados — revise cada factura', 'info');
          }
        }
      })
      .catch(function (err) {
        console.error('[CXF] FE análisis', err);
        f.feAnalisis = {
          estado: 'error',
          esElectronica: false,
          pasos: [{ id: 'err', ok: false, titulo: 'Error', detalle: String((err && err.message) || err) }],
        };
        patchFacturaSlotUiIfVisible(host, provId, facturaId);
        if (!quedanEnCola() && !isFeBatchUi()) toast('No se pudo analizar el PDF — Reanalizar', 'error');
      })
      .finally(function () {
        f._feAnalisisRunning = false;
        var slot = findFacturaSlotEl(host, provId, facturaId);
        if (slot) slot.classList.remove('is-fe-busy');
      });
  }

  function applyFeAnalisis(provId, facturaId, host) {
    var f = getFactura(provId, facturaId);
    if (!f || !f.feAnalisis || f.feAnalisis.estado !== 'listo') {
      return toast('Ejecute el análisis primero (suba un PDF)', 'warning');
    }
    var fe = f.feAnalisis.fe || {};
    if (fe.numeroFactura) f.numeroFactura = fe.numeroFactura;
    if (fe.total > 0) {
      f.valorFactura = String(Math.round(fe.total));
      f.valorCajero = f.valorCajero || f.valorFactura;
    }
    var sugeridas = f.feAnalisis.lineasSugeridas || [];
    if (sugeridas.length) {
      f.lines = sugeridas.map(function (s) {
        return { mpId: s.mpId || '', cant: s.cant || '1', precio: s.precio || '' };
      });
      if (!f.lines.length) f.lines = [{ mpId: '', cant: '', precio: '' }];
    }
    f.feAnalisis.aplicadoAt = new Date().toISOString();
    if (String(provId) === getActiveProvId()) syncUiFromBucket();
    scheduleDocumentoRefresh(host);
    toast('Datos de la FE aplicados a número, valor y líneas sugeridas', 'success');
  }

  function renderFeAnalisisBlock(provId, factura) {
    if (!isModoComplejo()) return '';
    var FD = feDian();
    if (!FD || !FD.renderAnalisisPanel) return '';
    var a = factura.feAnalisis;
    if (a && a.estado === 'en_cola') {
      return (
        '<div class="cxf-fe-analisis cxf-fe-analisis--pending">' +
        '<p class="form-label">Análisis factura electrónica</p>' +
        '<p class="cxf-muted">En cola: documento <strong>' +
        esc(String(a.colaPos || '?')) +
        '</strong> de <strong>' +
        esc(String(a.colaTotal || '?')) +
        '</strong>. Se revisará uno por uno.</p>' +
        '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-camara data-prov-id="' +
        esc(provId) +
        '" data-factura-id="' +
        esc(factura.id) +
        '">📷 Escanear QR con cámara (sin esperar)</button></div>'
      );
    }
    if (!a || a.estado === 'analizando') {
      var tienePdf = (factura.docs || []).some(function (d) {
        return isPdfDoc(d) || (d.mime && d.mime.indexOf('image') >= 0);
      });
      if (a && a.estado === 'analizando' && isFeBatchUi()) {
        return (
          '<div class="cxf-fe-analisis cxf-fe-analisis--background">' +
          '<p class="form-label">Análisis factura electrónica</p>' +
          '<p class="cxf-muted">En proceso en segundo plano — progreso en la <strong>barra inferior</strong>. Si el PDF no tiene QR legible, puede usar la cámara en cuanto termine o en otra factura.</p>' +
          '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-camara data-prov-id="' +
          esc(provId) +
          '" data-factura-id="' +
          esc(factura.id) +
          '">📷 Cámara QR</button></div>'
        );
      }
      if (a && a.estado === 'analizando' && FD.renderFeAnalisisLoader) {
        return FD.renderFeAnalisisLoader(a.progreso || (FD.createInitialProgreso && FD.createInitialProgreso()), {
          provId: provId,
          facturaId: factura.id,
        });
      }
      return (
        '<div class="cxf-fe-analisis cxf-fe-analisis--pending">' +
        '<p class="form-label">Análisis factura electrónica</p>' +
        '<p class="cxf-muted">' +
        (tienePdf ? 'Pulse para iniciar el análisis automático.' : 'Suba un PDF para iniciar el análisis automático.') +
        '</p>' +
        (tienePdf
          ? '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-reanalizar data-prov-id="' +
            esc(provId) +
            '" data-factura-id="' +
            esc(factura.id) +
            '">▶ Iniciar análisis</button> '
          : '') +
        '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-camara data-prov-id="' +
        esc(provId) +
        '" data-factura-id="' +
        esc(factura.id) +
        '">📷 Cámara QR</button></div>'
      );
    }
    if (a.estado === 'error') {
      return (
        '<div class="cxf-fe-analisis cxf-fe-analisis--pending">' +
        '<p class="form-label">Análisis factura electrónica</p>' +
        '<p class="cxf-muted">' +
        esc((a.pasos && a.pasos[0] && a.pasos[0].detalle) || 'Error al analizar') +
        '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-reanalizar data-prov-id="' +
        esc(provId) +
        '" data-factura-id="' +
        esc(factura.id) +
        '">↻ Reanalizar</button> ' +
        '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-camara data-prov-id="' +
        esc(provId) +
        '" data-factura-id="' +
        esc(factura.id) +
        '">📷 Cámara QR</button></div>'
      );
    }
    return FD.renderAnalisisPanel(a, { provId: provId, facturaId: factura.id });
  }

  function renderDocumentoStep() {
    if (!ui.modoEntrada) return renderModoEntradaPicker();
    var provs = getSelectedProviders();
    var modoBanner =
      ui.modoEntrada === 'complejo'
        ? '<div class="alert alert-info cxf-modo-banner"><strong>Modo complejo:</strong> por cada PDF se intenta leer el QR (en lote, lectura rápida). Si no detecta el código, use <strong>📷 Cámara QR</strong> o <strong>↻ Reanalizar</strong> en esa factura. Pulse <strong>Aplicar datos</strong> antes de continuar.</div>'
        : '<div class="cxf-modo-banner cxf-muted" style="font-size:0.85rem">Modo simple — carga manual de facturas.</div>';
    return (
      '<section class="cxf-panel cxf-panel--documento cxf-panel--full">' +
      '<header class="cxf-prov-hero">' +
      '<p class="cxf-eyebrow">Paso 2 · Facturas · ' +
      (ui.modoEntrada === 'complejo' ? 'Complejo' : 'Simple') +
      '</p>' +
      '<h2 class="cxf-panel-title">Un recuadro por proveedor</h2>' +
      '<p class="cxf-panel-lead">' +
      (isModoComplejo()
        ? 'Suba el <strong>PDF de la factura electrónica</strong>. El sistema leerá QR/CUFE, consultará DIAN cuando sea posible y completará datos para productos.'
        : 'Cada <strong>PDF = una factura</strong>. Varios PDF → varios bloques. Un PDF con varias facturas → use <strong>✂ Dividir PDF</strong>.') +
      ' <button type="button" class="btn btn-link btn-sm" data-cxf-modo-cambiar>Cambiar modo</button></p>' +
      '</header>' +
      modoBanner +
      '<div class="cxf-prov-facturas-stack">' +
      (provs.length
        ? provs.map(renderProvFacturaCard).join('')
        : '<p class="cxf-muted">Vuelva al paso anterior y agregue proveedores.</p>') +
      '</div>' +
      '<div class="cxf-nav-row">' +
      '<button type="button" class="btn btn-outline" data-cxf-step="proveedor">← Proveedores</button>' +
      '<button type="button" class="btn btn-primary" id="cxf-go-productos">Continuar a productos →</button></div></section>'
    );
  }

  function renderMpCreatePanel() {
    if (ui.creatingMpLine == null) return '';
    var isEdit = ui.mpEditorMode === 'edit' && ui.editingMpId;
    var mp = isEdit ? getMp(ui.editingMpId) : null;
    return (
      '<div class="cxf-mp-create cxf-mp-create--modal" id="cxf-mp-create-panel">' +
      '<header class="cxf-mp-create__head">' +
      '<span class="cxf-mp-create__icon" aria-hidden="true">' +
      (isEdit ? '✎' : '✨') +
      '</span>' +
      '<div><h4 class="cxf-mp-create__title" id="cxf-mp-modal-title">' +
      (isEdit ? 'Editar materia prima' : 'Nueva materia prima') +
      '</h4>' +
      '<p class="cxf-card__hint">' +
      (isEdit
        ? 'Corrija nombre, categoría o referencia de costeo. Los cambios aplican en todo el POS.'
        : 'Se agrega al catálogo y costeo; queda disponible al buscar en la línea.') +
      '</p></div></header>' +
      '<div class="cxf-form-grid cxf-form-grid--mp-modal">' +
      '<div class="cxf-field-span-2"><label class="cxf-label">Nombre *</label><input class="form-input" id="cxf-mp-nombre" placeholder="Ej. Pechuga fresca" value="' +
      esc(mp ? mp.nombre : '') +
      '"></div>' +
      '<div><label class="cxf-label">Categoría</label><input class="form-input" id="cxf-mp-cat" placeholder="Carnes" value="' +
      esc((mp && mp.categoria) || 'General') +
      '"></div>' +
      '<div><label class="cxf-label">Unidad</label><select class="form-input" id="cxf-mp-und">' +
      '<option value="GR"' +
      (mp && mp.und === 'GR' ? ' selected' : !mp ? ' selected' : '') +
      '>Gramos (g)</option>' +
      '<option value="ML"' +
      (mp && mp.und === 'ML' ? ' selected' : '') +
      '>Mililitros (ml)</option>' +
      '<option value="UND"' +
      (mp && mp.und === 'UND' ? ' selected' : '') +
      '>Unidad (und)</option></select></div>' +
      '<div><label class="cxf-label">Cantidad de referencia</label><input class="form-input" id="cxf-mp-peso" type="number" min="1" step="any" value="' +
      esc(mp && mp.peso != null ? mp.peso : '1000') +
      '" placeholder="Ej. 1000"></div>' +
      '<div><label class="cxf-label">Precio ref. costeo ($)</label><input class="form-input" id="cxf-mp-precio-ref" type="number" min="0" step="1" value="' +
      esc(mp && mp.precioTotal != null ? mp.precioTotal : '0') +
      '" placeholder="Lote de referencia"></div>' +
      '</div>' +
      '<div class="cxf-mp-create__actions">' +
      '<button type="button" class="btn btn-primary btn-sm" id="cxf-mp-save">' +
      (isEdit ? 'Guardar cambios' : 'Crear y usar en línea') +
      '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cxf-mp-cancel">Cancelar</button>' +
      (isEdit
        ? '<button type="button" class="btn btn-outline btn-sm" id="cxf-mp-goto-catalog">Abrir en catálogo MP</button>'
        : '') +
      '</div></div>'
    );
  }

  function renderLineCards() {
    return ui.lines
      .map(function (ln, i) {
        var mp = ln.mpId ? getMp(ln.mpId) : null;
        var ev = ln.mpId ? evalLinePrice(ln.mpId, ln.precio, ln.cant) : null;
        return (
          '<article class="cxf-line cxf-line-card" data-line="' +
          i +
          '">' +
          '<div class="cxf-line-card__top">' +
          '<span class="cxf-line-card__idx">' +
          (i + 1) +
          '</span>' +
          '<div class="cxf-line-card__product">' +
          renderMpComboCell(i, ln) +
          '<div class="cxf-line-mp-actions">' +
          '<button type="button" class="btn btn-outline btn-sm cxf-line-edit-mp" data-cxf-mp-edit="' +
          i +
          '" data-mp-id="' +
          esc(ln.mpId || '') +
          '" title="Editar"' +
          (ln.mpId ? '' : ' disabled') +
          '>✎</button>' +
          '<button type="button" class="btn btn-outline btn-sm cxf-line-new-mp" data-line-new-mp="' +
          i +
          '" title="Nuevo">+</button></div></div>' +
          '<button type="button" class="btn btn-outline btn-sm cxf-line-rm" title="Quitar línea">×</button>' +
          '</div>' +
          (mp ? '<p class="cxf-line-catalog-ref">' + esc(catalogCosteoHint(mp)) + '</p>' : '') +
          '<div class="cxf-line-card__row-inputs">' +
          renderLinePesoField(ln, mp) +
          renderLineDineroField(ln) +
          '</div>' +
          '<div class="cxf-line-card__calc cxf-line-ev">' +
          linePriceInsightHtml(ev, mp, true) +
          '</div></article>'
        );
      })
      .join('');
  }

  function renderFacturaRail() {
    var pid = getActiveProvId();
    var b = ensureBucket(pid);
    if (!b || b.facturas.length <= 1) return '';
    var activeF = getActiveFacturaId(pid);
    return (
      '<div class="cxf-factura-work-rail" aria-label="Elegir factura">' +
      '<h3 class="cxf-prov-chips-title">Facturas de este proveedor</h3>' +
      '<div class="cxf-prov-chips cxf-prov-chips--pick">' +
      b.facturas
        .map(function (f, i) {
          var meta = [];
          if (f.docs && f.docs.length) meta.push(f.docs.length + ' PDF');
          var nLines = collectLines(f).length;
          if (nLines) meta.push(nLines + ' línea(s)');
          return (
            '<button type="button" class="cxf-prov-chip cxf-prov-chip--pick cxf-factura-chip' +
            (String(f.id) === String(activeF) ? ' is-active' : '') +
            '" data-cxf-factura-active="' +
            esc(f.id) +
            '" data-prov-id="' +
            esc(pid) +
            '">' +
            '<span class="cxf-prov-chip__num">' +
            (i + 1) +
            '</span>' +
            '<span class="cxf-prov-chip__body">' +
            '<strong>' +
            esc(f.numeroFactura || 'Factura ' + (i + 1)) +
            '</strong>' +
            (meta.length ? '<span class="cxf-prov-chip__meta">' + esc(meta.join(' · ')) + '</span>' : '') +
            '</span></button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function renderProvWorkRail() {
    var provs = getSelectedProviders();
    if (provs.length <= 1) return '';
    var active = getActiveProvId();
    return (
      '<div class="cxf-prov-work-rail" aria-label="Elegir proveedor">' +
      '<h3 class="cxf-prov-chips-title">Proveedores en esta recepción</h3>' +
      '<div class="cxf-prov-chips cxf-prov-chips--pick">' +
      provs
        .map(function (p, i) {
          var meta = [];
          var nd = countDocsProv(p.id);
          if (nd) meta.push(nd + ' archivo(s)');
          var nLines = countLinesProv(p.id);
          if (nLines) meta.push(nLines + ' línea(s)');
          var b = ensureBucket(p.id);
          if (b && b.facturas.length > 1) meta.push(b.facturas.length + ' facturas');
          return (
            '<button type="button" class="cxf-prov-chip cxf-prov-chip--pick' +
            (String(p.id) === active ? ' is-active' : '') +
            '" data-cxf-prov-active="' +
            esc(p.id) +
            '">' +
            '<span class="cxf-prov-chip__num">' +
            (i + 1) +
            '</span>' +
            '<span class="cxf-prov-chip__body">' +
            '<strong>' +
            esc(p.nombre) +
            '</strong>' +
            (p.nit ? '<span class="cxf-prov-chip__meta">NIT ' + esc(p.nit) + '</span>' : '') +
            (meta.length ? '<span class="cxf-prov-chip__meta">' + esc(meta.join(' · ')) + '</span>' : '') +
            '</span></button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function renderProductosStep() {
    var pid = getActiveProvId();
    var f = getFactura(pid);
    var docThumbs =
      f && f.docs.length > 1
        ? '<div class="cxf-doc-thumbs cxf-doc-thumbs--compact">' +
          f.docs
            .map(function (d, i) {
              return (
                '<button type="button" class="cxf-doc-thumb-mini' +
                (i === f.docPreviewIdx ? ' is-active' : '') +
                '" data-cxf-doc-idx="' +
                i +
                '" data-prov-id="' +
                esc(pid) +
                '" data-factura-id="' +
                esc(f.id) +
                '">' +
                (d.mime && d.mime.indexOf('pdf') >= 0 ? 'PDF' : '🖼') +
                ' ' +
                esc((d.nombre || '').slice(0, 12)) +
                '</button>'
              );
            })
            .join('') +
          '</div>'
        : '';
    var prov = proveedoresList().find(function (p) {
      return String(p.id) === pid;
    });
    var facLabel = f && f.numeroFactura ? f.numeroFactura : 'Sin Nº FE';
    return (
      '<section class="cxf-panel cxf-panel--productos cxf-panel--full">' +
      renderProvWorkRail() +
      renderFacturaRail() +
      '<div class="cxf-productos-layout cxf-productos-layout--split">' +
      '<aside class="cxf-productos-pdf cxf-card cxf-card--glass" aria-label="Vista previa factura">' +
      '<header class="cxf-productos-pdf__head">' +
      '<p class="cxf-eyebrow">Factura · ' +
      esc(prov ? prov.nombre : 'Proveedor') +
      '</p>' +
      '<h3 class="cxf-card__title cxf-productos-pdf__title">' +
      esc(facLabel) +
      '</h3>' +
      '<p class="cxf-productos-pdf__hint">Consulte el PDF mientras registra las líneas →</p></header>' +
      docThumbs +
      '<div class="cxf-productos-pdf__viewport">' +
      '<div class="cxf-preview-wrap cxf-preview-wrap--side">' +
      renderDocPreviewLarge(pid) +
      '</div></div></aside>' +
      '<div class="cxf-productos-work">' +
      '<div class="cxf-productos-lines__head">' +
      '<div><p class="cxf-eyebrow">Paso 3 · Materias primas</p>' +
      '<h3 class="cxf-card__title">Líneas de esta factura</h3></div>' +
      '<span class="cxf-lines-count" id="cxf-lines-count">' +
      ui.lines.length +
      ' línea(s)</span></div>' +
      '<details class="cxf-hint-fold"><summary>¿Peso vs dinero?</summary>' +
      '<p class="cxf-card__hint"><strong>⚖ Peso</strong> en g/ml/und (3 kg = 3000) · <strong>💰 Dinero</strong> = total en factura. El cálculo $/g aparece abajo de cada línea.</p></details>' +
      renderTotalsMatchHtml() +
      '<div class="cxf-lines-panel cxf-card cxf-card--glass">' +
      '<div class="cxf-lines-panel__bar">' +
      '<span class="cxf-lines-panel__legend"><span class="cxf-legend-peso">⚖ Peso</span><span class="cxf-legend-dinero">💰 Dinero</span><span class="cxf-legend-calc">Cálculo</span></span>' +
      '<div class="cxf-lines-toolbar cxf-lines-toolbar--inline">' +
      '<button type="button" class="btn btn-outline btn-sm" id="cxf-add-line">+ Línea</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cxf-new-mp-line">+ Materia prima</button></div></div>' +
      '<div id="cxf-lines-list" class="cxf-lines-list">' +
      renderLineCards() +
      '</div></div></div>' +
      renderProductosComprasDashHtml() +
      '</div>' +
      '<div class="cxf-nav-row">' +
      '<button type="button" class="btn btn-outline" data-cxf-step="documento">← Factura</button>' +
      '<button type="button" class="btn btn-primary" id="cxf-go-cierre">Verificar y pagar →</button></div></section>'
    );
  }

  function renderProductosComprasDashHtml() {
    var dash = renderCierreComprasPeriodoHtml();
    if (!dash) return '';
    return (
      '<div class="cxf-card cxf-card--glass cxf-productos-dash" style="margin-top:14px">' +
      '<h3 class="cxf-card__title">Compras recientes por materia prima</h3>' +
      '<p class="cxf-card__hint">Resumen del reservorio (últimos 30 días). Al confirmar la factura se suma aquí.</p>' +
      dash +
      '</div>'
    );
  }

  function renderCierreImpactPanel(f) {
    var lines = collectLines(f);
    if (!lines.length) {
      return (
        '<div class="cxf-card cxf-card--glass cxf-cierre-impact">' +
        '<p class="cxf-muted" style="margin:0">Sin líneas de materia prima en esta factura.</p></div>'
      );
    }
    var rows = lines
      .map(function (it) {
        var mp = getMp(it.mpId);
        var ev = evalLinePrice(it.mpId, it.precioTotal, it.cantidad || it.peso, it.und || (mp && mp.und));
        var und = it.und || (mp && mp.und) || 'GR';
        var invUnd = und === 'ML' ? 'ml' : und === 'UND' || und === 'UNI' ? 'und' : 'g';
        return (
          '<tr><td><strong>' +
          esc(it.productoNombre || (mp && mp.nombre) || '—') +
          '</strong></td>' +
          '<td style="text-align:right">' +
          (Number(it.cantidad) || 0).toLocaleString('es-CO') +
          ' ' +
          invUnd +
          '</td>' +
          '<td style="text-align:right">' +
          fmtMoney(it.precioTotal) +
          '</td>' +
          '<td>' +
          formatUnitPrice(ev.nuevo, und) +
          '</td>' +
          '<td><span class="cxf-impact-tag cxf-impact-tag--' +
          esc(ev.nivel || 'info') +
          '">' +
          esc(ev.corto || '—') +
          '</span></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="cxf-card cxf-card--glass cxf-cierre-impact">' +
      '<h3 class="cxf-card__title">Al confirmar se actualiza</h3>' +
      '<p class="cxf-card__hint">Costeo y matriz MP (precio unitario) · inventario (entrada por cantidad recibida).</p>' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table cxf-impact-table"><thead><tr>' +
      '<th>Producto</th><th style="text-align:right">Ingreso inv.</th><th style="text-align:right">Total $</th><th>$/unidad</th><th>Costeo</th>' +
      '</tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function renderCierreComprasPeriodoHtml() {
    var res = R();
    if (!res || !res.renderComprasMpDashboardHtml) return '';
    return res.renderComprasMpDashboardHtml({ dias: 30 });
  }

  function renderCierreStep() {
    var f = getFactura(getActiveProvId());
    var lines = collectLines(f);
    ui._cierreItems = lines.slice();
    var sum = lines.reduce(function (s, it) {
      return s + (Number(it.precioTotal) || 0);
    }, 0);
    var val = Number((f && f.valorFactura) || ui.valorFactura) || sum;
    var diff = val - sum;
    var prov = proveedoresList().find(function (p) {
      return String(p.id) === getActiveProvId();
    });
    return (
      '<section class="cxf-panel cxf-panel--cierre cxf-panel--full">' +
      renderProvWorkRail() +
      renderFacturaRail() +
      '<div class="cxf-cierre-grid">' +
      '<div class="cxf-card cxf-card--glass">' +
      '<h3 class="cxf-card__title">Verificación · ' +
      esc(prov ? prov.nombre : '') +
      '</h3>' +
      '<div class="cxf-kpi-row">' +
      '<div class="cxf-kpi"><span class="cxf-kpi__lbl">Líneas</span><strong>' +
      lines.length +
      '</strong></div>' +
      '<div class="cxf-kpi"><span class="cxf-kpi__lbl">Suma ítems</span><strong>' +
      fmtMoney(sum) +
      '</strong></div>' +
      '<div class="cxf-kpi"><span class="cxf-kpi__lbl">Total factura</span><strong id="cxf-kpi-total">' +
      fmtMoney(val) +
      '</strong></div>' +
      '<div class="cxf-kpi cxf-kpi--' +
      (Math.abs(diff) < 1 ? 'ok' : 'warn') +
      '"><span class="cxf-kpi__lbl">Diferencia</span><strong id="cxf-kpi-diff">' +
      fmtMoney(diff) +
      '</strong></div></div>' +
      '<label class="cxf-label">Valor total factura</label>' +
      '<input class="form-input cxf-input-lg" type="number" id="cxf-valor-factura" value="' +
      esc(val || '') +
      '" min="0" step="1">' +
      (Math.abs(diff) >= 1
        ? '<p class="cxf-warn">La suma de líneas no coincide con el total — revise antes de confirmar.</p>'
        : '<p class="cxf-ok-hint">✓ Totales coherentes</p>') +
      renderCierreImpactPanel(f) +
      '</div>' +
      '<div class="cxf-card cxf-card--accent">' +
      '<h3 class="cxf-card__title">Pago y observaciones</h3>' +
      '<div class="cxf-pay-methods" id="cxf-pay-methods">' +
      ['efectivo', 'tarjeta', 'transferencia']
        .map(function (m) {
          var labels = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '🏦 Transferencia' };
          return (
            '<button type="button" class="cxf-pay' +
            (ui.metodoPago === m ? ' is-active' : '') +
            '" data-cxf-pay="' +
            m +
            '">' +
            labels[m] +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<label class="cxf-label">Comentarios</label>' +
      '<textarea class="form-input" id="cxf-comentarios" rows="3" placeholder="Observaciones, acuerdos, vencimiento…">' +
      esc(ui.comentarios) +
      '</textarea>' +
      '<div class="cxf-verificar-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" data-cxf-step="productos">← Productos</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="cxf-ingreso-guardar">' +
      (ui.editingId ? '✓ Actualizar recepción' : '✓ Confirmar ingreso y salir') +
      '</button></div></div>' +
      renderCierreComprasPeriodoHtml() +
      '</div></section>'
    );
  }

  function renderHistorial() {
    var res = R();
    var rows = res
      ? res.listRecepciones(25).map(function (r) {
          var n = (r.items && r.items.length) || 0;
          return (
            '<tr class="cxf-hist-row" data-rec-id="' +
            esc(r.id) +
            '"><td>' +
            esc(r.fecha || '') +
            '</td><td>' +
            esc(r.proveedorNombre || '—') +
            '</td><td>' +
            esc(r.numeroFactura || '—') +
            '</td><td style="text-align:right">' +
            fmtMoney(r.valor) +
            '</td><td>' +
            esc(r.metodoPago || r.metodo || '—') +
            '</td><td>' +
            n +
            ' ítem(s)</td><td class="cxf-hist-actions">' +
            '<button type="button" class="btn btn-outline btn-sm cxf-hist-edit" data-rec-id="' +
            esc(r.id) +
            '">Editar</button> ' +
            '<button type="button" class="btn btn-outline btn-sm cxf-hist-delete cxf-hist-delete--danger" data-rec-id="' +
            esc(r.id) +
            '" title="Eliminar del historial">🗑 Borrar</button></td></tr>'
          );
        }).join('')
      : '';
    return (
      '<section class="cxf-historial">' +
      '<details class="cxf-historial__toggle" open>' +
      '<summary><span class="cxf-storage-bar__icon" aria-hidden="true">📋</span> Historial de ingresos · editar cuando haga falta</summary>' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table"><thead><tr>' +
      '<th>Fecha</th><th>Proveedor</th><th>Nº factura</th><th>Valor</th><th>Pago</th><th>Ítems</th><th></th>' +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="8">Sin recepciones registradas</td></tr>') +
      '</tbody></table></div></details></section>'
    );
  }

  function renderStepContent() {
    if (ui.step === 'productos' || ui.step === 'cierre') syncUiFromBucket();
    if (ui.step === 'proveedor') return renderProveedorStep();
    if (ui.step === 'documento') return renderDocumentoStep();
    if (ui.step === 'productos') return renderProductosStep();
    return renderCierreStep();
  }

  function renderStorageNote(summary) {
    summary = summary || {};
    var blobs = summary.blobs || {};
    var ret = summary.retentionDays || 365;
    return (
      '<details class="cxf-storage-bar crozzo-mod-aside" id="cxf-storage-note">' +
      '<summary><span class="cxf-storage-bar__icon" aria-hidden="true">📁</span> Documentos · ' +
      ret +
      ' días' +
      (blobs.mb != null ? ' · ~' + blobs.mb + ' MB' : '') +
      '</summary>' +
      '<div class="crozzo-mod-aside__body">' +
      (summary.recepcionesActivas != null ? summary.recepcionesActivas + ' ingresos activos. ' : '') +
      'PDF y fotos se guardan de forma segura en este equipo. Con Cloud (Supabase) podrá sincronizar copias de respaldo.</div></details>'
    );
  }

  function refreshStorageNote(host) {
    var res = R();
    if (!res || !res.getStorageSummary) return;
    res.getStorageSummary().then(function (s) {
      var el = host.querySelector('#cxf-storage-note');
      if (el && el.parentNode) {
        var wrap = document.createElement('div');
        wrap.innerHTML = renderStorageNote(s);
        var neu = wrap.firstChild;
        if (neu) el.parentNode.replaceChild(neu, el);
      }
    });
  }

  function render() {
    repairRecepcionSession();
    return (
      '<div class="crozzo-mod-page cxf-root' +
      (ui.step === 'productos' ? ' cxf-root--wide cxf-root--fluid' : ui.step === 'documento' || ui.step === 'proveedor' ? ' cxf-root--wide' : '') +
      '" data-cxf-build="202606023">' +
      renderPdfChoiceModal() +
      renderQrCameraModal() +
      renderSplitPdfModal() +
      renderStorageNote({ retentionDays: 365 }) +
      renderAlertasBanner() +
      '<nav class="crozzo-mod-nav crozzo-mod-nav--segmented cxf-stepper" aria-label="Pasos ingreso factura">' +
      renderStepper() +
      '</nav>' +
      '<div id="cxf-step-host" class="cxf-step-host">' +
      renderStepContent() +
      '</div>' +
      '<div id="cxf-mp-modal" class="cxf-mp-modal-backdrop" hidden aria-hidden="true"></div>' +
      renderHistorial() +
      '<div class="crozzo-mod-footer">' +
      '<button type="button" class="btn btn-outline btn-sm" id="cxf-go-cotizaciones">Cotizaciones</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cxf-new-ingreso">+ Nuevo ingreso</button></div></div>'
    );
  }

  function collectLines(source) {
    var lines;
    if (source && source.facturas) {
      lines = getFactura(getActiveProvId()).lines;
    } else if (source && source.lines) {
      lines = source.lines;
    } else {
      lines = ui.lines;
    }
    var items = [];
    (lines || []).forEach(function (ln) {
      if (!ln.mpId) return;
      var cant = Number(ln.cant) || 0;
      var pTotal = Number(ln.precio) || 0;
      if (pTotal <= 0 || cant <= 0) return;
      var mp = getMp(ln.mpId);
      items.push({
        mpId: ln.mpId,
        productoNombre: mp ? mp.nombre : '',
        categoria: mp ? mp.categoria : '',
        peso: cant,
        cantidad: cant,
        und: (mp && mp.und) || 'GR',
        precioTotal: pTotal,
      });
    });
    return items;
  }

  function mergeFacturaLinesFromUi(host) {
    host = host || getCxfHost();
    if (host && host.querySelectorAll('.cxf-line').length) readLinesFromDom(host);
    syncUiFromBucket();
    var pid = getActiveProvId();
    var f = getFactura(pid);
    if (!f) return { factura: null, items: [], provId: pid || '' };
    if (host) readCierreFieldsFromDom(host);
    if (ui.step === 'cierre' && ui._cierreItems && ui._cierreItems.length) {
      persistActiveBucket();
      return { factura: f, items: ui._cierreItems.slice(), provId: pid };
    }
    if (ui.lines && ui.lines.length) f.lines = ui.lines;
    persistActiveBucket();
    var items = collectLines(f);
    if (!items.length) items = collectLines();
    if (!items.length && ui._cierreItems && ui._cierreItems.length) items = ui._cierreItems.slice();
    return { factura: f, items: items, provId: pid };
  }

  function flushLinesBeforeLeaveProductos(host) {
    host = host || getCxfHost();
    if (!host || ui.step !== 'productos') return;
    if (host.querySelectorAll('.cxf-line').length) readLinesFromDom(host);
    persistActiveBucket();
  }

  function collectAlertasFromLines(source) {
    var lines;
    if (source && source.facturas) {
      lines = getFactura(getActiveProvId()).lines;
    } else if (source && source.lines) {
      lines = source.lines;
    } else {
      lines = ui.lines;
    }
    var alertas = [];
    (lines || []).forEach(function (ln) {
      if (!ln.mpId || !ln.precio) return;
      var ev = evalLinePrice(ln.mpId, ln.precio, ln.cant);
      if (!ev || ev.nivel === 'igual' || ev.nivel === 'pendiente' || ev.actualizaCosteo === false) return;
      var mp = getMp(ln.mpId);
      alertas.push({
        mpId: ln.mpId,
        productoNombre: mp ? mp.nombre : ln.mpId,
        nivel: ev.nivel,
        mensaje: ev.mensaje,
        anterior: ev.anterior,
        nuevo: ev.nuevo,
        ratio: ev.ratio,
      });
    });
    return alertas;
  }

  function readLinesFromDom(host) {
    var nodes = host.querySelectorAll('.cxf-line');
    if (!nodes.length) return;
    var lines = [];
    nodes.forEach(function (tr) {
      var mpIdInp = tr.querySelector('.cxf-line-mp-id');
      var cant = tr.querySelector('.cxf-line-cant');
      var precio = tr.querySelector('.cxf-line-precio');
      lines.push({
        mpId: mpIdInp && mpIdInp.value,
        cant: cant && cant.value,
        precio: precio && precio.value,
      });
    });
    if (!lines.length) lines.push({ mpId: '', cant: '', precio: '' });
    ui.lines = lines;
    persistActiveBucket();
  }

  function readCierreFieldsFromDom(host) {
    var valInp = host.querySelector('#cxf-valor-factura');
    if (valInp) {
      ui.valorFactura = valInp.value;
      var fVal = getFactura(getActiveProvId());
      if (fVal) fVal.valorFactura = valInp.value;
    }
    var com = host.querySelector('#cxf-comentarios');
    if (com) {
      ui.comentarios = com.value;
      var fCom = getFactura(getActiveProvId());
      if (fCom) fCom.comentarios = com.value;
    }
  }

  var _cxfDocRefreshTimer = null;

  /** Redibuja solo la pila de facturas (sin persistir ui.docs sobre otras facturas). */
  function refreshDocumentoStackHtml(host, opts) {
    opts = opts || {};
    host = host || getCxfHost();
    if (!host) return false;
    if (!opts.skipPersist) readDocumentoDomIntoBuckets(host);
    var stack = host.querySelector('.cxf-prov-facturas-stack');
    if (!stack) return false;
    var provs = getSelectedProviders();
    stack.innerHTML = provs.length
      ? provs.map(renderProvFacturaCard).join('')
      : '<p class="cxf-muted">Vuelva al paso anterior y agregue proveedores.</p>';
    if (!opts.skipStepper) {
      var stepper = host.querySelector('.cxf-stepper');
      if (stepper) stepper.innerHTML = renderStepper();
    }
    if (!opts.skipPreviews && !isFeBlockingPdfPreviews()) applyPdfPreviews(host);
    if (!opts.skipSync && String(getActiveProvId())) syncUiFromBucket();
    return true;
  }

  function refreshDocumentoCards(host) {
    host = host || getCxfHost();
    if (!host) return;
    if (!refreshDocumentoStackHtml(host)) {
      refreshStepHost(host);
      return;
    }
    if (_cxfIngestBatch === 0 && !_feAnalisisQueueBusy) {
      scanPendingFeAnalisis(host);
    }
  }

  function scheduleDocumentoRefresh(host, opts) {
    opts = opts || {};
    if (!opts.force && (_feAnalisisQueueBusy || _cxfIngestBatch > 0)) return;
    var delay = opts.immediate ? 0 : opts.deferMs != null ? opts.deferMs : 180;
    if (_cxfDocRefreshTimer) clearTimeout(_cxfDocRefreshTimer);
    _cxfDocRefreshTimer = setTimeout(function () {
      _cxfDocRefreshTimer = null;
      host = host || getCxfHost();
      if (!host) return;
      if (ui.step === 'documento' && host.querySelector('.cxf-panel--documento')) {
        refreshDocumentoCards(host);
      } else {
        refreshStepHost(host);
      }
    }, delay);
  }

  function refreshStepHost(host) {
    host = getCxfHost() || host;
    attachDocBlobsFromVault();
    closeAllCxfOverlays(host);
    persistActiveBucket();
    var sh = host.querySelector('#cxf-step-host');
    if (sh) sh.innerHTML = renderStepContent();
    var stepper = host.querySelector('.cxf-stepper');
    if (stepper) stepper.innerHTML = renderStepper();
    bindStep(host);
    applyPdfPreviews(host);
    if (
      ui.step === 'documento' &&
      _feBatchSession &&
      (_feBatchSession.complete || _feBatchSession.awaitingContinue) &&
      !isFeBlockingPdfPreviews()
    ) {
      setTimeout(function () {
        kickCxfPdfPreviews(host);
      }, 120);
    }
    if (ui.step === 'documento' && isModoComplejo() && (_feAnalisisQueue.length || _feAnalisisQueueBusy)) {
      scheduleCxfProgressDock({ phase: 'fe' });
    }
  }

  function addDoc(doc, provId, opts) {
    opts = opts || {};
    var pid = provId || getActiveProvId();
    var b = ensureBucket(pid);
    if (!b) return;
    if (doc.dataUrl && doc.dataUrl.length > 80 && (isPdfDoc(doc) || (doc.mime && doc.mime.indexOf('pdf') >= 0))) {
      doc.dataUrl = normalizePdfDataUrl(doc.dataUrl);
      doc.mime = 'application/pdf';
    }
    var isPdf = isPdfDoc(doc);
    var isImage = doc.mime && doc.mime.indexOf('image') >= 0;
    var f = opts.facturaId ? getFactura(pid, opts.facturaId) : getFactura(pid, b.facturaActiva);
    if (!f) {
      f = newFactura();
      b.facturas = [f];
    }
    var pdfsHere = (f.docs || []).filter(function (d) {
      return d.mime && d.mime.indexOf('pdf') >= 0;
    });
    var imgsHere = (f.docs || []).filter(function (d) {
      return d.mime && d.mime.indexOf('image') >= 0;
    });
    if (
      opts.newFacturaPerFile ||
      opts.newFacturaPerImage ||
      (isPdf && pdfsHere.length >= 1) ||
      (isImage && imgsHere.length >= 1 && !opts.facturaId)
    ) {
      f = newFactura({ numeroFactura: guessNumeroFactura(doc.nombre) });
      b.facturas.push(f);
    }
    if (!f.docs) f.docs = [];
    f.docs.push(doc);
    vaultDocBlob(doc);
    schedulePersistCxfSession();
    f.docPreviewIdx = f.docs.length - 1;
    if (!f.numeroFactura) f.numeroFactura = guessNumeroFactura(doc.nombre);
    b.facturaActiva = f.id;
    if (isPdf) {
      vaultViewDocBlob(doc);
      scheduleViewBlobIdbBackup(doc);
    }
    if (String(pid) === getActiveProvId()) syncUiFromBucket();
    queueFeAnalisisAfterDoc(pid, f.id);
    if (isPdf) {
      var slotIdx = b.facturas.indexOf(f);
      enqueuePdfPreview(doc, slotIdx >= 0 ? slotIdx : 99);
    }
  }

  /** Marca pendiente de FE; la cola se vacía al terminar de importar todos los archivos. */
  function queueFeAnalisisAfterDoc(provId, facturaId) {
    if (!feModoComplejoActive()) return;
    var f = getFactura(provId, facturaId);
    if (f) f._fePendienteAnalisis = true;
    if (_cxfIngestBatch > 0) return;
    enqueueFeAnalisis(provId, facturaId, getCxfHost());
  }

  function scanPendingFeAnalisis(host) {
    if (!feModoComplejoActive()) return;
    if (_cxfIngestBatch > 0) return;
    if (_feAnalisisQueueBusy || _feAnalisisQueue.length) return;
    if (
      _feBatchSession &&
      (_feBatchSession.awaitingContinue ||
        (_feBatchSession.complete && !_feAnalisisQueueBusy && !_feAnalisisQueue.length))
    ) {
      return;
    }
    rebuildFeAnalisisQueue(host || getCxfHost());
  }

  function resumeRecepcionBackground(host) {
    repairRecepcionSession({
      forceDocumento: !!(
        _feBatchSession &&
        (_feBatchSession.awaitingContinue || _feBatchSession.complete)
      ),
    });
    if (
      _feBatchSession &&
      (_feBatchSession.awaitingContinue || _feBatchSession.complete) &&
      hasActiveRecepcionWork()
    ) {
      ui.step = 'documento';
      global.__crozzoRecepcionResumeStep = null;
    } else if (global.__crozzoRecepcionResumeStep) {
      ui.step = global.__crozzoRecepcionResumeStep;
      global.__crozzoRecepcionResumeStep = null;
    } else if (_feBackgroundJob && _feBackgroundJob.returnStep) {
      ui.step = _feBackgroundJob.returnStep;
    }
    ensureCxfProgressDock();
    if (isCxfBackgroundWork()) {
      scheduleCxfProgressDock({ phase: 'fe' });
      if (!_feAnalisisQueueBusy && _feAnalisisQueue.length) {
        scheduleFeDrain(host, 80);
      }
    } else if (_feBatchSession && _feBatchSession.awaitingContinue) {
      _feBatchSession.awaitingContinue = false;
      hideCxfProgressDock();
    }
    host = host || getCxfHost();
    if (host && ui.step === 'documento') {
      attachDocBlobsFromVault();
      refreshDocumentoStackHtml(host, { skipPreviews: isFeBlockingPdfPreviews(), skipStepper: true });
      if (!isFeBlockingPdfPreviews()) applyPdfPreviews(host);
      if (_feBatchSession && (_feBatchSession.complete || _feBatchSession.awaitingContinue)) {
        setTimeout(function () {
          kickCxfPdfPreviews(host);
        }, 280);
      }
    }
  }

  function installCxfBackgroundNavigation() {
    if (global.__cxfBgNavInstalled) return;
    global.__cxfBgNavInstalled = true;
    ensureCxfProgressDock();
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cxf-goto-recepcion]');
      if (!btn) return;
      e.preventDefault();
      continueFromFeBatch();
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-cxf-qr-cam-close]')) {
        e.preventDefault();
        closeCxfQrCameraModal(true);
        return;
      }
      if (e.target.closest('[data-cxf-qr-cam-retry-perm]')) {
        e.preventDefault();
        retryCxfQrCameraPermission();
        return;
      }
      if (e.target.closest('[data-cxf-qr-cam-file-btn]')) {
        e.preventDefault();
        openCxfQrPhotoPicker();
      }
    });
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'cxf-qr-cam-file-input') {
        var f = e.target.files && e.target.files[0];
        if (f) onCxfQrPhotoFileSelected(f);
      }
    });
  }

  function pickProveedorFromSearch(host, provId) {
    if (!provId) return;
    if (ui.proveedorIds.indexOf(String(provId)) >= 0) {
      toast('Ese proveedor ya está en la lista', 'info');
    } else {
      addProvToSession(provId);
      toast('Proveedor agregado', 'success');
    }
    ui.provFilter = '';
    ui.provComboOpen = false;
    var combo = host.querySelector('#cxf-prov-combo');
    if (combo) combo.value = '';
    refreshStepHost(host);
  }

  function refreshProvComboList(host) {
    var list = host.querySelector('#cxf-prov-list');
    var comboBox = host.querySelector('#cxf-prov-combobox');
    if (list) {
      list.hidden = false;
      list.innerHTML = renderProvComboOptionsHtml();
    }
    if (comboBox) comboBox.classList.add('is-open');
  }

  function bindProveedor(host) {
    if (!host._cxfProvDelegated) {
      host._cxfProvDelegated = true;
      host.addEventListener(
        'mousedown',
        function (e) {
          var pick = e.target.closest('[data-cxf-prov-pick]');
          if (pick) {
            e.preventDefault();
            e.stopPropagation();
            pickProveedorFromSearch(host, pick.getAttribute('data-cxf-prov-pick'));
            return;
          }
          var rm = e.target.closest('[data-cxf-prov-remove]');
          if (rm) {
            e.preventDefault();
            removeProvFromSession(rm.getAttribute('data-cxf-prov-remove'));
            refreshStepHost(host);
            toast('Proveedor quitado de esta sesión', 'info');
          }
        },
        true
      );
      host.addEventListener('click', function (e) {
        var pick = e.target.closest('[data-cxf-prov-pick]');
        if (pick) {
          e.preventDefault();
          pickProveedorFromSearch(host, pick.getAttribute('data-cxf-prov-pick'));
        }
      });
    }

    host.querySelectorAll('[data-cxf-prov-tab]').forEach(function (btn) {
      if (btn._cxfBound) return;
      btn._cxfBound = true;
      btn.addEventListener('click', function () {
        ui.proveedorTab = btn.getAttribute('data-cxf-prov-tab') || 'select';
        refreshStepHost(host);
      });
    });
    var combo = host.querySelector('#cxf-prov-combo');
    var comboBox = host.querySelector('#cxf-prov-combobox');
    if (combo && !combo._cxfBound) {
      combo._cxfBound = true;
      combo.addEventListener('focus', function () {
        ui.provComboOpen = true;
        ui.provFilter = combo.value;
        refreshProvComboList(host);
        combo.setAttribute('aria-expanded', 'true');
      });
      combo.addEventListener('input', function () {
        ui.provFilter = combo.value;
        ui.provComboOpen = true;
        refreshProvComboList(host);
      });
      combo.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          ui.provComboOpen = false;
          var list = host.querySelector('#cxf-prov-list');
          if (list) list.hidden = true;
          if (comboBox) comboBox.classList.remove('is-open');
          combo.setAttribute('aria-expanded', 'false');
          return;
        }
        if (e.key === 'Enter') {
          var matches = filteredProveedores();
          if (matches.length >= 1) {
            e.preventDefault();
            pickProveedorFromSearch(host, matches[0].id);
          }
        }
      });
    }
    var addFirst = host.querySelector('#cxf-prov-add-first');
    if (addFirst && !addFirst._cxfBound) {
      addFirst._cxfBound = true;
      addFirst.onclick = function () {
        var matches = filteredProveedores();
        if (!matches.length) return toast('Escriba para buscar un proveedor', 'info');
        pickProveedorFromSearch(host, matches[0].id);
      };
    }
    var goDoc = host.querySelector('#cxf-go-documento');
    if (goDoc && !goDoc._cxfBound) {
      goDoc._cxfBound = true;
      goDoc.onclick = function () {
        if (!ui.proveedorIds.length) return toast('Agregue al menos un proveedor', 'warning');
        if (!ui.proveedorActivo) ui.proveedorActivo = ui.proveedorIds[0];
        ui.step = 'documento';
        refreshStepHost(host);
      };
    }
    var provDocRoots = host.querySelectorAll('[data-prov-doc-root]');
    provDocRoots.forEach(function (pdr) {
      if (!global.CrozzoProveedorDocumentos || !global.CrozzoProveedorDocumentos.bindImportRoot) return;
      global.CrozzoProveedorDocumentos.bindImportRoot(pdr, {
          onSaved: function (saveRes) {
            if (saveRes && saveRes.row) {
              addProvToSession(saveRes.row.id);
              ui.proveedorTab = 'select';
              var resv = R();
              if (resv && resv.syncProveedoresBidirectional) resv.syncProveedoresBidirectional();
              toast('Proveedor listo — agregado a la recepción', 'success');
              refreshStepHost(host);
            }
          },
        });
    });
    var saveProv = host.querySelector('#cxf-save-prov');
    if (saveProv && !saveProv._cxfBound) {
      saveProv._cxfBound = true;
      saveProv.onclick = function () {
        var res = R();
        if (!res) return toast('Reservorio no disponible', 'warning');
        var nom = host.querySelector('#cxf-new-nombre');
        if (!nom || !nom.value.trim()) return toast('Nombre del proveedor requerido', 'warning');
        var nitVal = (host.querySelector('#cxf-new-nit') || {}).value || '';
        if (global.CrozzoProveedorDocumentos && global.CrozzoProveedorDocumentos.validarIdentificador && nitVal) {
          var v = global.CrozzoProveedorDocumentos.validarIdentificador(nitVal);
          if (v.display) nitVal = v.display;
        }
        var row = res.upsertProveedor({
          nombre: nom.value.trim(),
          nit: nitVal,
          tipoRubro: (host.querySelector('#cxf-new-rubro') || {}).value || '',
          representante: (host.querySelector('#cxf-new-rep') || {}).value || '',
          email: (host.querySelector('#cxf-new-email') || {}).value || '',
          telefono: (host.querySelector('#cxf-new-tel') || {}).value || '',
          legal: {},
        });
        if (row) {
          addProvToSession(row.id);
          ui.proveedorTab = 'select';
          ui.provFilter = '';
          if (res.syncProveedoresBidirectional) res.syncProveedoresBidirectional();
          toast('Proveedor creado y agregado — puede añadir más', 'success');
          refreshStepHost(host);
        }
      };
    }
  }

  function bindDocumento(host) {
    if (host._cxfDocDelegated) return;
    host._cxfDocDelegated = true;

    function ingestFileOne(file, asPdf, provId, facturaId, opts) {
      opts = opts || {};
      if (!file || !provId) return Promise.resolve();
      if (asPdf) {
        var mb = file.size / (1024 * 1024);
        if (mb > CXF_MAX_PDF_FILE_MB) {
          toast(
            'PDF muy pesado (' +
              Math.round(mb) +
              ' MB): ' +
              (file.name || '') +
              ' — máx ' +
              CXF_MAX_PDF_FILE_MB +
              ' MB por archivo',
            'warning'
          );
          return Promise.resolve();
        }
        return file
          .arrayBuffer()
          .then(function (buf) {
            return yieldToMain(24).then(function () {
              var pdfBuf = new Uint8Array(buf);
              var doc = {
                id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
                nombre: file.name,
                mime: 'application/pdf',
                dataUrl: '',
                _viewBlob: new Blob([pdfBuf], { type: 'application/pdf' }),
                _pdfBlob: new Blob([pdfBuf], { type: 'application/pdf' }),
              };
              addDoc(doc, provId, {
                facturaId: opts.useFacturaId ? facturaId : null,
                newFacturaPerFile: !!opts.newFacturaPerFile,
              });
            });
          })
          .catch(function (err) {
            console.error('[CXF] ingest PDF', err);
            toast('No se pudo leer el PDF: ' + (file.name || 'archivo'), 'error');
          });
      }
      return compressImage(file)
        .then(function (url) {
          addDoc(
            {
              id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              nombre: file.name,
              mime: 'image/jpeg',
              dataUrl: url,
            },
            provId,
            {
              facturaId: opts.useFacturaId ? facturaId : null,
              newFacturaPerImage: !!opts.newFacturaPerImage,
            }
          );
        });
    }

    function ingestFiles(fileList, asPdf, provId, facturaId) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length || !provId) return Promise.resolve();
      var multi = files.length > 1;
      var totalMb = 0;
      var fi;
      for (fi = 0; fi < files.length; fi++) totalMb += (files[fi].size || 0) / (1024 * 1024);
      if (asPdf && totalMb > CXF_MAX_PDF_TOTAL_MB) {
        toast(
          'Demasiado peso en total (' +
            Math.round(totalMb) +
            ' MB). Suba como máximo ' +
            CXF_MAX_PDF_TOTAL_MB +
            ' MB por tanda o menos archivos.',
          'warning'
        );
        return Promise.resolve();
      }
      _cxfIngestBatch++;
      _pdfPreviewQueue = [];
      _feAnalisisQueue = [];
      _feAnalisisQueueBusy = false;
      if (multi) {
        showIngestOverlay('Preparando ' + files.length + ' archivos…', {
          current: 0,
          total: files.length,
        });
      }
      var chain = Promise.resolve();
      files.forEach(function (file, idx) {
        chain = chain
          .then(function () {
            if (multi) {
              showIngestOverlay('Cargando ' + (idx + 1) + ' de ' + files.length + '…', {
                current: idx + 1,
                total: files.length,
              });
            }
            return yieldToMain(multi ? 180 + Math.min(idx * 15, 120) : 48);
          })
          .then(function () {
            return ingestFileOne(file, asPdf, provId, facturaId, {
              useFacturaId: !multi || idx === 0,
              newFacturaPerFile: asPdf && multi && idx > 0,
              newFacturaPerImage: !asPdf && multi && idx > 0,
            });
          });
      });
      return chain
        .then(function () {
          var msg =
            files.length === 1
              ? asPdf
                ? 'PDF agregado'
                : 'Foto agregada'
              : files.length +
                ' archivos cargados' +
                (isModoComplejo() ? ' — iniciando análisis uno por uno…' : '');
          toast(msg, 'success');
          if (!asPdf && ui.step === 'documento') {
            var scope = files.length > 1 ? 'prov' : facturaId ? 'slot' : 'prov';
            var imgN = countImagesForPdfPrompt(provId, scope === 'slot' ? facturaId : null);
            if (imgN > 0) {
              setTimeout(function () {
                promptAndConvertImages(host, {
                  provId: provId,
                  facturaId: facturaId || '',
                  scope: scope,
                });
              }, 180);
            }
          }
        })
        .finally(function () {
          hideIngestOverlay();
          _cxfIngestBatch = Math.max(0, _cxfIngestBatch - 1);
          if (_cxfIngestBatch === 0) {
            var hDone = getCxfHost() || host;
            if (hDone && ui.step === 'documento') {
              requestAnimationFrame(function () {
                refreshDocumentoCards(hDone);
                if (isModoComplejo()) {
                  setTimeout(function () {
                    rebuildFeAnalisisQueue(hDone || host);
                  }, CXF_FE_DRAIN_DELAY_MS);
                } else {
                  setTimeout(enqueueAllPdfPreviewsDeferred, 400);
                }
              });
            }
          }
        });
    }

    host.addEventListener('click', function (e) {
      var openPdf = e.target.closest('[data-cxf-pdf-open]');
      if (openPdf) {
        e.preventDefault();
        var docOpen = findDocById(openPdf.getAttribute('data-cxf-pdf-open'));
        var urlOpen = docOpen ? getPdfBlobUrl(docOpen) : '';
        if (urlOpen) window.open(urlOpen, '_blank', 'noopener');
        else toast('No se pudo abrir el PDF', 'warning');
        return;
      }
      var modoBtn = e.target.closest('[data-cxf-modo-entrada]');
      if (modoBtn) {
        e.preventDefault();
        ui.modoEntrada = modoBtn.getAttribute('data-cxf-modo-entrada') === 'complejo' ? 'complejo' : 'simple';
        if (ui.modoEntrada === 'complejo') recordFeBackgroundJob();
        toast(
          ui.modoEntrada === 'complejo' ? 'Modo complejo — análisis FE activado' : 'Modo simple',
          'success'
        );
        refreshStepHost(host);
        return;
      }
      var modoCambiar = e.target.closest('[data-cxf-modo-cambiar]');
      if (modoCambiar) {
        e.preventDefault();
        ui.modoEntrada = null;
        refreshStepHost(host);
        return;
      }
      var feAplicar = e.target.closest('[data-cxf-fe-aplicar]');
      if (feAplicar) {
        e.preventDefault();
        applyFeAnalisis(
          feAplicar.getAttribute('data-prov-id'),
          feAplicar.getAttribute('data-factura-id'),
          host
        );
        return;
      }
      var feRe = e.target.closest('[data-cxf-fe-reanalizar]');
      if (feRe) {
        e.preventDefault();
        runFeAnalisis(feRe.getAttribute('data-prov-id'), feRe.getAttribute('data-factura-id'), host);
        return;
      }
      var feCam = e.target.closest('[data-cxf-fe-camara]');
      if (feCam) {
        e.preventDefault();
        openCxfQrCameraModal(feCam.getAttribute('data-prov-id'), feCam.getAttribute('data-factura-id'), host);
        return;
      }
      var goProdBtn = e.target.closest('#cxf-go-productos');
      if (goProdBtn) {
        e.preventDefault();
        attemptGoProductos(host);
        return;
      }
      var splitBtn = e.target.closest('[data-cxf-split-pdf]');
      if (splitBtn) {
        openSplitPdfModal(host, splitBtn.getAttribute('data-prov-id'), splitBtn.getAttribute('data-factura-id'));
        return;
      }
      var mergeAll = e.target.closest('[data-cxf-merge-all]');
      if (mergeAll) {
        var mpid = mergeAll.getAttribute('data-prov-id');
        mergeFacturasEnUna(mpid);
        scheduleDocumentoRefresh(host);
        return;
      }
      var addFac = e.target.closest('[data-cxf-add-factura]');
      if (addFac) {
        var apid = addFac.getAttribute('data-prov-id');
        var ab = ensureBucket(apid);
        var nf = newFactura();
        ab.facturas.push(nf);
        ab.facturaActiva = nf.id;
        if (String(apid) === getActiveProvId()) syncUiFromBucket();
        scheduleDocumentoRefresh(host);
        toast('Factura vacía agregada', 'info');
        return;
      }
      var pickPdf = e.target.closest('.cxf-pick-pdf');
      if (pickPdf) {
        var pid = pickPdf.getAttribute('data-prov-id');
        var fid = pickPdf.getAttribute('data-factura-id');
        var inp = host.querySelector(
          '.cxf-file-pdf[data-prov-id="' + pid + '"]' + (fid ? '[data-factura-id="' + fid + '"]' : '')
        );
        if (inp) inp.click();
        return;
      }
      var pickImg = e.target.closest('.cxf-pick-img');
      if (pickImg) {
        var pid2 = pickImg.getAttribute('data-prov-id');
        var fid2 = pickImg.getAttribute('data-factura-id');
        var inp2 = host.querySelector(
          '.cxf-file-img[data-prov-id="' + pid2 + '"]' + (fid2 ? '[data-factura-id="' + fid2 + '"]' : '')
        );
        if (inp2) inp2.click();
        return;
      }
      var toPdf = e.target.closest('.cxf-img-to-pdf');
      if (toPdf) {
        var pid3 = toPdf.getAttribute('data-prov-id');
        var fid3 = toPdf.getAttribute('data-factura-id');
        promptAndConvertImages(host, { provId: pid3, facturaId: fid3 || '', scope: fid3 ? 'slot' : 'prov' });
        return;
      }
      var docIdx = e.target.closest('[data-cxf-doc-idx]');
      if (docIdx) {
        var pidx = docIdx.getAttribute('data-prov-id');
        var fidx = docIdx.getAttribute('data-factura-id');
        var fb = getFactura(pidx, fidx);
        if (fb) fb.docPreviewIdx = Number(docIdx.getAttribute('data-cxf-doc-idx')) || 0;
        if (String(pidx) === getActiveProvId()) syncUiFromBucket();
        scheduleDocumentoRefresh(host);
        return;
      }
      var docRm = e.target.closest('[data-cxf-doc-rm]');
      if (docRm) {
        e.preventDefault();
        e.stopPropagation();
        removeDoc(
          Number(docRm.getAttribute('data-cxf-doc-rm')),
          docRm.getAttribute('data-prov-id'),
          docRm.getAttribute('data-factura-id')
        );
        scheduleDocumentoRefresh(host);
        toast('Archivo eliminado', 'info');
        return;
      }
      var rmCur = e.target.closest('.cxf-doc-remove-current');
      if (rmCur) {
        var pid4 = rmCur.getAttribute('data-prov-id');
        var f4 = getFactura(pid4, rmCur.getAttribute('data-factura-id'));
        if (f4 && f4.docs.length) removeDoc(f4.docPreviewIdx, pid4, f4.id);
        scheduleDocumentoRefresh(host);
        return;
      }
      var clearFac = e.target.closest('.cxf-doc-clear-factura');
      if (clearFac) {
        var pid5 = clearFac.getAttribute('data-prov-id');
        var fid5 = clearFac.getAttribute('data-factura-id');
        if (!window.confirm('¿Quitar todos los archivos de esta factura?')) return;
        var f5 = getFactura(pid5, fid5);
        if (f5) {
          f5.docs = [];
          f5.docPreviewIdx = 0;
        }
        if (String(pid5) === getActiveProvId()) syncUiFromBucket();
        scheduleDocumentoRefresh(host);
        return;
      }
    });

    host.addEventListener('change', function (e) {
      var inPdf = e.target.closest('.cxf-file-pdf');
      if (inPdf) {
        var pid = inPdf.getAttribute('data-prov-id');
        var fid = inPdf.getAttribute('data-factura-id');
        ingestFiles(inPdf.files, true, pid, fid);
        inPdf.value = '';
        return;
      }
      var inImg = e.target.closest('.cxf-file-img');
      if (inImg) {
        var pid2 = inImg.getAttribute('data-prov-id');
        var fid2 = inImg.getAttribute('data-factura-id');
        ingestFiles(inImg.files, false, pid2, fid2);
        inImg.value = '';
      }
    });

    host.addEventListener('input', function (e) {
      var num = e.target.closest('.cxf-num-factura');
      if (num) {
        var pid = num.getAttribute('data-prov-id');
        var f = getFactura(pid, num.getAttribute('data-factura-id'));
        if (f) f.numeroFactura = num.value;
        if (String(pid) === getActiveProvId()) ui.numeroFactura = num.value;
      }
      var valCaj = e.target.closest('.cxf-valor-cajero');
      if (valCaj) {
        var pid2 = valCaj.getAttribute('data-prov-id');
        var f2 = getFactura(pid2, valCaj.getAttribute('data-factura-id'));
        if (f2) {
          f2.valorCajero = valCaj.value;
          if (f2.feAnalisis && f2.feAnalisis.estado === 'listo' && feDian()) {
            f2.feAnalisis.valorVerificacion = feDian().verifyValorCajero(
              valCaj.value,
              f2.feAnalisis.fe && f2.feAnalisis.fe.total
            );
            var pasos = f2.feAnalisis.pasos || [];
            for (var i = 0; i < pasos.length; i++) {
              if (pasos[i].id === 'valor') {
                pasos[i].ok = f2.feAnalisis.valorVerificacion.ok === true;
                pasos[i].warn = f2.feAnalisis.valorVerificacion.ok === null;
                pasos[i].detalle = f2.feAnalisis.valorVerificacion.detalle;
              }
            }
          }
        }
      }
    });

    host.querySelectorAll('[data-cxf-drop-prov]').forEach(function (zone) {
      if (zone._cxfDropBound) return;
      zone._cxfDropBound = true;
      var pid = zone.getAttribute('data-cxf-drop-prov');
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        zone.classList.add('is-drag');
      });
      zone.addEventListener('dragleave', function () {
        zone.classList.remove('is-drag');
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('is-drag');
        var fidDrop = zone.getAttribute('data-factura-id');
        var pdfFiles = [];
        var imgFiles = [];
        Array.prototype.forEach.call(e.dataTransfer.files || [], function (f) {
          if (f.type === 'application/pdf') pdfFiles.push(f);
          else if (f.type && f.type.indexOf('image') >= 0) imgFiles.push(f);
        });
        var dropChain = Promise.resolve();
        if (pdfFiles.length) {
          dropChain = dropChain.then(function () {
            return ingestFiles(pdfFiles, true, pid, fidDrop);
          });
        }
        if (imgFiles.length) {
          dropChain = dropChain.then(function () {
            return ingestFiles(imgFiles, false, pid, fidDrop);
          });
        }
      });
    });

  }

  function openSplitPdfModal(host, provId, facturaId) {
    var modal = host.querySelector('#cxf-split-modal');
    if (!modal) return toast('Modal no disponible', 'warning');
    modal.dataset.provId = provId || '';
    modal.dataset.facturaId = facturaId || '';
    var hint = host.querySelector('#cxf-split-hint');
    if (hint) hint.textContent = 'Ej.: PDF de 9 páginas en 3 facturas → 3 páginas por bloque.';
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    var inp = host.querySelector('#cxf-split-count');
    if (inp) inp.focus();
  }

  function bindSplitPdfModal(host) {
    var modal = host.querySelector('#cxf-split-modal');
    if (!modal || modal._cxfBound) return;
    modal._cxfBound = true;
    modal.querySelectorAll('[data-cxf-split-cancel]').forEach(function (btn) {
      btn.onclick = function () {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
      };
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
      }
    });
    var confirm = host.querySelector('#cxf-split-confirm');
    if (confirm) {
      confirm.onclick = function () {
        var pid = modal.dataset.provId;
        var fid = modal.dataset.facturaId;
        var countInp = host.querySelector('#cxf-split-count');
        var n = countInp ? Number(countInp.value) : 3;
        if (!pid || !fid) return;
        persistNumeroFacturasFromDom(host);
        toast('Dividiendo PDF…', 'info');
        splitPdfIntoFacturas(pid, fid, n)
          .then(function (created) {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            scheduleDocumentoRefresh(host);
            toast('PDF dividido en ' + created + ' factura(s)', 'success');
          })
          .catch(function (err) {
            toast((err && err.message) || 'No se pudo dividir el PDF', 'warning');
          });
      };
    }
  }

  function bindPdfModal(host) {
    return;
  }

  function saveMpForm(host, lineIdx) {
    host = getCxfHost() || host;
    var cat = C();
    if (!cat || !cat.upsert) return toast('Catálogo no disponible', 'warning');
    var nom = host.querySelector('#cxf-mp-nombre');
    if (!nom || !nom.value.trim()) return toast('Nombre de materia prima requerido', 'warning');
    var isEdit = ui.mpEditorMode === 'edit' && ui.editingMpId;
    var existing = isEdit ? getMp(ui.editingMpId) : null;
    var res = R();
    var prov = getActiveProvId() && res && res.getProveedor ? res.getProveedor(getActiveProvId()) : null;
    var provs = [];
    if (existing && Array.isArray(existing.proveedores)) {
      provs = existing.proveedores.slice();
    } else if (existing && existing.proveedores) {
      provs = [].concat(existing.proveedores);
    }
    if (prov && prov.nombre) {
      var has = provs.some(function (p) {
        return String(p.id || p.nombre) === String(prov.id || prov.nombre);
      });
      if (!has) provs.push({ nombre: prov.nombre, id: prov.id });
    }
    var payload = {
      nombre: nom.value.trim(),
      categoria: ((host.querySelector('#cxf-mp-cat') || {}).value || 'General').trim(),
      proveedores: provs,
      und: (host.querySelector('#cxf-mp-und') || {}).value || 'GR',
      peso: Number((host.querySelector('#cxf-mp-peso') || {}).value) || 1000,
      precioTotal: Number((host.querySelector('#cxf-mp-precio-ref') || {}).value) || 0,
    };
    if (isEdit) payload.id = ui.editingMpId;
    var row = cat.upsert(payload, { skipInvMov: true });
    if (!row) return toast('No se pudo guardar la materia prima', 'warning');
    if (lineIdx >= 0 && ui.lines[lineIdx]) {
      ui.lines[lineIdx].mpId = row.id;
      if (!Number(ui.lines[lineIdx].cant)) ui.lines[lineIdx].cant = String(row.peso != null ? row.peso : '');
      if (!Number(ui.lines[lineIdx].precio)) ui.lines[lineIdx].precio = String(row.precioTotal != null ? row.precioTotal : '');
    }
    hideMpModal(host);
    persistActiveBucket();
    toast(
      isEdit ? '«' + row.nombre + '» actualizada en el catálogo' : '«' + row.nombre + '» creada y asignada a la línea',
      'success'
    );
    refreshStepHost(host);
  }

  function historialRecIdFromClick(el) {
    if (!el) return '';
    var direct = el.getAttribute('data-rec-id');
    if (direct) return direct;
    var tr = el.closest('.cxf-hist-row');
    return tr ? tr.getAttribute('data-rec-id') || '' : '';
  }

  function runHistorialEdit(id) {
    if (!id) {
      toast('Registro no encontrado', 'warning');
      return;
    }
    var res = R();
    if (!res) return;
    var rec = res.getRecepcion(id);
    if (!rec) return toast('Registro no encontrado', 'warning');
    loadRecepcionForEdit(rec);
    remountRecepcionModule({ resetUi: false });
    toast('Modo edición — ajuste y confirme', 'info');
  }

  function installCxfGlobalUi() {
    if (!global.__cxfUnifiedClickInstalled) {
      global.__cxfUnifiedClickInstalled = true;
      document.addEventListener(
        'click',
        function (e) {
          var host = getCxfHost();
          if (!host) return;

          var edit = e.target.closest('.cxf-hist-edit');
          if (edit && host.contains(edit)) {
            e.preventDefault();
            e.stopPropagation();
            runHistorialEdit(historialRecIdFromClick(edit));
            return;
          }

          var del = e.target.closest('.cxf-hist-delete');
          if (del && host.contains(del)) {
            e.preventDefault();
            e.stopPropagation();
            eliminarIngresoHistorial(historialRecIdFromClick(del));
          }
        },
        true
      );
    }

    if (global.__cxfProductosUiInstalled) return;
    global.__cxfProductosUiInstalled = true;

    document.addEventListener(
      'mousedown',
      function (e) {
        var opt = e.target.closest('.cxf-combobox__option[data-mp-id]');
        if (!opt) return;
        var host = getCxfHost();
        if (!host || !host.contains(opt)) return;
        e.preventDefault();
        e.stopPropagation();
        pickMpForLine(host, opt.getAttribute('data-line-idx'), opt.getAttribute('data-mp-id'));
      },
      true
    );

    document.addEventListener('focusin', function (e) {
      var inp = e.target.closest('.cxf-mp-combo-input');
      if (!inp) return;
      var host = getCxfHost();
      if (!host || !host.contains(inp)) return;
      var wrap = inp.closest('.cxf-mp-combobox');
      if (!wrap) return;
      var lineIdx = Number(wrap.getAttribute('data-line-idx'));
      ui.mpLineComboOpen = lineIdx;
      refreshMpComboList(host, lineIdx);
    });

    document.addEventListener('input', function (e) {
      var inp = e.target.closest('.cxf-mp-combo-input');
      if (!inp) return;
      var host = getCxfHost();
      if (!host || !host.contains(inp)) return;
      var wrap = inp.closest('.cxf-mp-combobox');
      if (!wrap) return;
      var lineIdx = Number(wrap.getAttribute('data-line-idx'));
      ui.mpLineFilters[lineIdx] = inp.value;
      ui.mpLineComboOpen = lineIdx;
      var hid = wrap.querySelector('.cxf-line-mp-id');
      if (hid) hid.value = '';
      if (!ui.lines[lineIdx]) ui.lines[lineIdx] = { mpId: '', cant: '', precio: '' };
      ui.lines[lineIdx].mpId = '';
      refreshMpComboList(host, lineIdx);
    });

    document.addEventListener('keydown', function (e) {
      var inp = e.target.closest('.cxf-mp-combo-input');
      if (!inp || e.key !== 'Enter') return;
      var host = getCxfHost();
      if (!host || !host.contains(inp)) return;
      var wrap = inp.closest('.cxf-mp-combobox');
      if (!wrap) return;
      var lineIdx = Number(wrap.getAttribute('data-line-idx'));
      var matches = filteredMpList(inp.value);
      if (matches.length >= 1) {
        e.preventDefault();
        pickMpForLine(host, lineIdx, matches[0].id);
      }
    });

    document.addEventListener('click', function (e) {
      var host = getCxfHost();
      if (!host || !host.contains(e.target)) return;

      var backdrop = host.querySelector('#cxf-mp-modal');
      if (backdrop && !backdrop.hidden) {
        if (e.target === backdrop) {
          hideMpModal(host);
          return;
        }
        if (e.target.closest('#cxf-mp-cancel')) {
          hideMpModal(host);
          return;
        }
        if (e.target.closest('#cxf-mp-save')) {
          saveMpForm(host, ui.creatingMpLine == null ? 0 : ui.creatingMpLine);
          return;
        }
        if (e.target.closest('#cxf-mp-goto-catalog')) {
          if (typeof global.navigateTo === 'function') global.navigateTo('catalogo-mp');
          return;
        }
      }

      var newMp = e.target.closest('[data-line-new-mp]');
      if (newMp) {
        e.preventDefault();
        openMpCreate(host, Number(newMp.getAttribute('data-line-new-mp')) || 0);
        return;
      }
      var newMpToolbar = e.target.closest('#cxf-new-mp-line');
      if (newMpToolbar) {
        e.preventDefault();
        ui.lines.push({ mpId: '', cant: '', precio: '' });
        persistActiveBucket();
        refreshStepHost(host);
        openMpCreate(host, ui.lines.length - 1);
        return;
      }
      var addLine = e.target.closest('#cxf-add-line');
      if (addLine) {
        e.preventDefault();
        ui.lines.push({ mpId: '', cant: '', precio: '' });
        persistActiveBucket();
        refreshStepHost(host);
        return;
      }
      var editMp = e.target.closest('.cxf-line-edit-mp');
      if (editMp && !editMp.disabled) {
        openMpEditor(host, Number(editMp.getAttribute('data-cxf-mp-edit')), editMp.getAttribute('data-mp-id'));
        return;
      }
      var rm = e.target.closest('.cxf-line-rm');
      if (rm) {
        var list = host.querySelector('#cxf-lines-list');
        if (list && list.querySelectorAll('.cxf-line').length > 1) {
          rm.closest('.cxf-line').remove();
          readLinesFromDom(host);
          persistActiveBucket();
          refreshLinesTotalsUi(host);
          refreshLinesCountUi(host);
        }
        return;
      }
      if (!e.target.closest('.cxf-mp-combobox')) {
        closeAllMpCombos(host);
      }
    });
  }

  function refreshLinesCountUi(host) {
    var el = host.querySelector('#cxf-lines-count');
    if (el) el.textContent = ui.lines.length + ' línea(s)';
  }

  function refreshLinesTotalsUi(host) {
    var sum = linesSum();
    var sumEl = host.querySelector('#cxf-sum-lines');
    if (sumEl) sumEl.textContent = fmtMoney(sum);
    var val = Number(ui.valorFactura) || 0;
    var diffEl = host.querySelector('#cxf-lines-diff');
    if (diffEl && val > 0) {
      var diff = val - sum;
      var ok = Math.abs(diff) < 1;
      diffEl.textContent = ok ? '✓ Coincide con la factura' : '⚠ Diferencia: ' + fmtMoney(diff);
      var wrap = host.querySelector('.cxf-factura-totals');
      if (wrap) {
        wrap.classList.toggle('cxf-factura-totals--ok', ok);
        wrap.classList.toggle('cxf-factura-totals--warn', !ok);
      }
    }
    refreshLinesCountUi(host);
  }

  function bindProductos(host) {
    host = getCxfHost() || host;
    host.querySelectorAll('[data-cxf-prov-active]').forEach(function (btn) {
      btn.onclick = function () {
        readLinesFromDom(host);
        setActiveProv(btn.getAttribute('data-cxf-prov-active'));
        ui.creatingMpLine = null;
        refreshStepHost(host);
      };
    });
    host.querySelectorAll('[data-cxf-factura-active]').forEach(function (btn) {
      btn.onclick = function () {
        readLinesFromDom(host);
        setActiveFactura(btn.getAttribute('data-prov-id'), btn.getAttribute('data-cxf-factura-active'));
        ui.creatingMpLine = null;
        refreshStepHost(host);
      };
    });
    host.querySelectorAll('.cxf-line-cant, .cxf-line-precio').forEach(function (inp) {
      if (inp._cxfPriceBound) return;
      inp._cxfPriceBound = true;
      inp.addEventListener('input', function () {
        readLinesFromDom(host);
        var tr = inp.closest('.cxf-line');
        updateLinePriceCell(tr);
        refreshLinesTotalsUi(host);
      });
    });
    var valFact = host.querySelector('#cxf-valor-factura-lines');
    if (valFact && !valFact._cxfBound) {
      valFact._cxfBound = true;
      valFact.addEventListener('input', function () {
        ui.valorFactura = valFact.value;
        var f = getFactura(getActiveProvId());
        if (f) f.valorFactura = valFact.value;
        refreshLinesTotalsUi(host);
      });
    }
    var goCierre = host.querySelector('#cxf-go-cierre');
    if (goCierre && !goCierre._cxfBound) {
      goCierre._cxfBound = true;
      goCierre.onclick = function () {
        readLinesFromDom(host);
        if (!collectLines().length) return toast('Agregue al menos una línea con cantidad y valor', 'warning');
        var sum = linesSum();
        var val = Number(ui.valorFactura) || 0;
        if (!val && sum > 0) ui.valorFactura = String(sum);
        val = Number(ui.valorFactura) || sum;
        if (val > 0 && Math.abs(val - sum) >= 1) {
          toast(
            'Total factura ' + fmtMoney(val) + ' ≠ líneas ' + fmtMoney(sum) + ' — se usará la suma de líneas',
            'info'
          );
          ui.valorFactura = String(sum);
          var fGo = getFactura(getActiveProvId());
          if (fGo) fGo.valorFactura = String(sum);
        }
        persistActiveBucket();
        if (!ui.editingId) ensureRecIdForSave();
        ui.step = 'cierre';
        refreshStepHost(host);
      };
    }
  }

  function lightAdjuntoRefs(docsPayload) {
    return (docsPayload || []).map(function (d) {
      return {
        id: d.id,
        nombre: d.nombre,
        mime: d.mime,
        thumbDataUrl: d.dataUrl && d.dataUrl.length < 120000 ? d.dataUrl : null,
        blobRef: d.blobRef || null,
      };
    });
  }

  function persistAdjuntosInBackground(recId, docsPayload) {
    var B = global.CrozzoBlobStore;
    if (!B || !B.persistAdjuntos || !docsPayload || !docsPayload.length) return;
    setTimeout(function () {
      Promise.race([
        B.persistAdjuntos(recId, docsPayload),
        new Promise(function (resolve) {
          setTimeout(resolve, 8000);
        }),
      ]).catch(function () {});
    }, 50);
  }

  function recIdNuevoFactura(f, idx) {
    if (f._recId) return f._recId;
    f._recId =
      'rec_' + Date.now() + '_' + (idx || 0) + '_' + Math.random().toString(36).slice(2, 8);
    return f._recId;
  }

  function buildPayloadEntry(provId, f, items, opts) {
    opts = opts || {};
    var res = R();
    if (!res || !f || !items || !items.length) return null;
    var alertas = collectAlertasFromLines(f);
    var prov = res.getProveedor(provId);
    var sumItems = items.reduce(function (s, it) {
      return s + it.precioTotal;
    }, 0);
    var valor = Number(f.valorFactura) || sumItems;
    if (valor > 0 && Math.abs(valor - sumItems) >= 1) {
      valor = sumItems;
      f.valorFactura = String(sumItems);
    }
    var recId = opts.editingId || recIdNuevoFactura(f, opts.idx || 0);
    var docsPayload = (f.docs || []).map(function (d) {
      return { id: d.id, nombre: d.nombre, mime: d.mime, dataUrl: d.dataUrl, blobRef: d.blobRef };
    });
    return {
      editingId: opts.editingId || null,
      itemsCount: items.length,
      payload: {
        id: recId,
        proveedorId: provId,
        proveedorNombre: prov ? prov.nombre : '',
        valor: valor,
        numeroFactura: f.numeroFactura,
        metodoPago: f.metodoPago || ui.metodoPago,
        comentarios: f.comentarios,
        notas:
          (f.numeroFactura ? 'Factura ' + f.numeroFactura + '. ' : '') + (f.comentarios || ''),
        items: items,
        adjuntos: lightAdjuntoRefs(docsPayload),
        alertasPrecio: alertas,
        estado: 'confirmada',
        syncEstado: 'pendiente_nube',
        skipConfirmVariacion: true,
        _forceNew: !opts.editingId,
      },
      persistAdjuntos: function (finalId) {
        persistAdjuntosInBackground(finalId || recId, docsPayload);
      },
    };
  }

  function buildIngresosParaGuardar(host) {
    host = host || getCxfHost();
    var pid0 = getActiveProvId();
    if (pid0 && ui.proveedorIds.indexOf(pid0) < 0) addProvToSession(pid0);
    if (host && host.querySelectorAll('.cxf-line').length) readLinesFromDom(host);
    if (host) readCierreFieldsFromDom(host);
    persistActiveBucket();
    syncUiFromBucket();

    var label = ui.editingId ? 'Actualizar recepción' : 'Confirmar ingreso y salir';
    var merged = mergeFacturaLinesFromUi(host);
    if (!merged || !merged.provId) return { error: 'Seleccione un proveedor en el paso 1', level: 'warning' };
    if (!merged.items || !merged.items.length) {
      return {
        error: 'En Productos agregue materia prima con cantidad y valor total de línea',
        level: 'warning',
      };
    }
    var entry = buildPayloadEntry(merged.provId, merged.factura, merged.items, {
      editingId: ui.editingId ? String(ui.editingId) : null,
      idx: 0,
    });
    if (!entry) return { error: 'Datos incompletos para guardar', level: 'warning' };
    if (!ui.editingId) entry.payload._forceNew = true;
    return { entries: [entry], label: label };
  }

  function afterIngresoGuardado() {
    global.__cxfSavingRecepcion = false;
    ui._pendingRecId = null;
    freshUi();
    ui.step = 'proveedor';
    var hubHost = document.getElementById('crozzo-hub-local-host');
    if (hubHost) {
      hubHost.innerHTML = render();
      init(hubHost);
      try {
        var hist = hubHost.querySelector('.cxf-historial');
        if (hist && hist.scrollIntoView) hist.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
      return;
    }
    remountRecepcionModule();
  }

  function onBorrarIngreso(recId) {
    if (String(ui.editingId) === String(recId)) freshUi();
  }

  function eliminarIngresoHistorial(id) {
    if (!id) {
      toast('No se identificó el ingreso', 'warning');
      return;
    }
    var res = R();
    if (!res || !res.eliminarRecepcion) {
      toast('No se puede eliminar', 'warning');
      return;
    }
    var rec = res.getRecepcion(id);
    if (!rec) {
      toast('Registro no encontrado', 'warning');
      return;
    }
    var label =
      (rec.proveedorNombre || 'Proveedor') +
      (rec.numeroFactura ? ' · ' + rec.numeroFactura : '');
    if (!global.confirm('¿Eliminar este ingreso?\n\n' + label)) return;
    onBorrarIngreso(id);
    if (!res.eliminarRecepcion(id)) {
      toast('No se pudo eliminar', 'error');
      return;
    }
    toast('Ingreso eliminado', 'success');
    remountRecepcionModule();
  }

  function confirmarIngresoFactura() {
    var host = getCxfHost();
    closeAllCxfOverlays(host);
    if (!host) {
      toast('Abra Entrada de factura desde el menú lateral', 'error');
      return;
    }

    var btn = host.querySelector('#cxf-ingreso-guardar');
    if (btn && btn.disabled) return;

    if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.ensureReservorioReady) {
      global.CrozzoReservorioOffline.ensureReservorioReady();
    }

    var res = R();
    if (!res || !res.registrarRecepcion) {
      toast('Reservorio no cargado — espere 2 s y pulse de nuevo', 'error');
      return;
    }

    var Ccat = C();
    if (Ccat && Ccat.ensureReady) {
      try {
        Ccat.ensureReady();
      } catch (_) {}
    }

    var pack = buildIngresosParaGuardar(host);
    if (pack.error) {
      toast(pack.error, pack.level || 'warning');
      return;
    }

    var entry = pack.entries[0];
    if (!entry || !entry.payload) {
      toast('No hay datos para guardar', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Guardando…';
    }

    var out;
    try {
      if (entry.editingId) {
        out = res.actualizarRecepcion(entry.editingId, entry.payload);
      } else {
        out = res.registrarRecepcion(entry.payload);
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = ui.editingId ? '✓ Actualizar recepción' : '✓ Confirmar ingreso y salir';
      }
      toast((err && err.message) || 'Error al guardar', 'error');
      console.error('[cxf-guardar]', err);
      return;
    }

    if (!out || !out.recepcion) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = ui.editingId ? '✓ Actualizar recepción' : '✓ Confirmar ingreso y salir';
      }
      toast('No se pudo guardar en el reservorio local', 'error');
      return;
    }

    if (typeof entry.persistAdjuntos === 'function') {
      entry.persistAdjuntos(out.recepcion.id);
    }

    var nCosteo = out.costeoActualizado && out.costeoActualizado.length ? out.costeoActualizado.length : 0;
    var msg = 'Ingreso guardado · inventario actualizado';
    if (nCosteo) msg += ' · costo unitario actualizado';
    toast(msg, 'success');
    afterIngresoGuardado();
  }

  function installCxfClickDelegation(host) {
    host = resolveCxfRoot(host) || host;
    if (!host) return;
    if (!host._cxfDelegation) {
      host._cxfDelegation = true;
      host.addEventListener('click', function (e) {
        if (e.target.closest('#cxf-ingreso-guardar')) {
          e.preventDefault();
          e.stopPropagation();
          confirmarIngresoFactura();
        }
      });
    }
  }

  function bindCierre(host) {
    host.querySelectorAll('[data-cxf-prov-active]').forEach(function (btn) {
      btn.onclick = function () {
        readLinesFromDom(host);
        setActiveProv(btn.getAttribute('data-cxf-prov-active'));
        refreshStepHost(host);
      };
    });
    var valInp = host.querySelector('#cxf-valor-factura');
    if (valInp) {
      valInp.oninput = function () {
        ui.valorFactura = valInp.value;
        var fVal = getFactura(getActiveProvId());
        if (fVal) fVal.valorFactura = valInp.value;
        var lines = collectLines();
        var sum = lines.reduce(function (s, it) {
          return s + it.precioTotal;
        }, 0);
        var val = Number(valInp.value) || 0;
        var diff = val - sum;
        var dEl = host.querySelector('#cxf-kpi-diff');
        var tEl = host.querySelector('#cxf-kpi-total');
        if (dEl) dEl.textContent = fmtMoney(diff);
        if (tEl) tEl.textContent = fmtMoney(val);
      };
    }
    host.querySelectorAll('[data-cxf-pay]').forEach(function (btn) {
      btn.onclick = function () {
        ui.metodoPago = btn.getAttribute('data-cxf-pay');
        var fPay = getFactura(getActiveProvId());
        if (fPay) fPay.metodoPago = ui.metodoPago;
        host.querySelectorAll('.cxf-pay').forEach(function (bx) {
          bx.classList.toggle('is-active', bx === btn);
        });
      };
    });
    var com = host.querySelector('#cxf-comentarios');
    if (com)
      com.oninput = function () {
        ui.comentarios = com.value;
        var fCom = getFactura(getActiveProvId());
        if (fCom) fCom.comentarios = com.value;
      };
  }

  function bindStep(host) {
    bindProveedor(host);
    bindDocumento(host);
    bindPdfModal(host);
    bindSplitPdfModal(host);
    bindProductos(host);
    bindCierre(host);
    host.querySelectorAll('[data-cxf-step]').forEach(function (btn) {
      if (btn._cxfStepBound) return;
      btn._cxfStepBound = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-cxf-step');
        if (!canGoStep(id)) return toast('Complete el paso anterior', 'info');
        if (id === 'productos') {
          attemptGoProductos(host);
          return;
        }
        flushLinesBeforeLeaveProductos(host);
        if (id === 'cierre' && !ui.editingId) ensureRecIdForSave();
        ui.step = id;
        refreshStepHost(host);
      });
    });
    host.querySelectorAll('.cxf-step[data-cxf-step]').forEach(function (btn) {
      if (btn._cxfStepNav) return;
      btn._cxfStepNav = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-cxf-step');
        if (id === 'cierre' && ui.step === 'cierre') {
          confirmarIngresoFactura();
          return;
        }
        if (btn.disabled || !canGoStep(id)) return;
        if (id === 'productos') {
          attemptGoProductos(host);
          return;
        }
        flushLinesBeforeLeaveProductos(host);
        if (id === 'cierre' && !ui.editingId) ensureRecIdForSave();
        ui.step = id;
        refreshStepHost(host);
      });
    });
  }

  function loadRecepcionForEdit(rec) {
    if (!rec) return;
    ui.editingId = rec.id;
    var pid = String(rec.proveedorId || '');
    ui.proveedorIds = pid ? [pid] : [];
    ui.proveedorActivo = pid;
    var b = ensureBucket(pid);
    var f = getFactura(pid);
    if (f) {
      f.numeroFactura = rec.numeroFactura || '';
      f.valorFactura = String(rec.valor || '');
      f.metodoPago = rec.metodoPago || rec.metodo || 'transferencia';
      f.comentarios = rec.comentarios || rec.notas || '';
      f.docs = [];
      f.lines = (rec.items || []).map(function (it) {
        return {
          mpId: it.mpId || '',
          cant: String(it.peso || it.cantidad || ''),
          precio: String(it.precioTotal || ''),
        };
      });
      if (!f.lines.length) f.lines = [{ mpId: '', cant: '', precio: '' }];
      b.facturas = [f];
      b.facturaActiva = f.id;
    }
    syncUiFromBucket();
    ui.step = 'productos';
    var B = global.CrozzoBlobStore;
    if (B && B.loadAdjuntosForUi && rec.adjuntos && rec.adjuntos.length && f) {
      B.loadAdjuntosForUi(rec.adjuntos).then(function (docs) {
        f.docs = docs;
        syncUiFromBucket();
        var root = document.getElementById('mainContent');
        if (root && root.querySelector('.cxf-root')) {
          refreshStepHost(root.querySelector('.cxf-root') || root);
        }
      });
    }
  }

  function applyPrefill() {
    var pre = global.__crozzoRecepcionPrefill;
    if (!pre) return;
    global.__crozzoRecepcionPrefill = null;
    if (pre.proveedorNombre) {
      var p = proveedoresList().find(function (x) {
        return String(x.nombre).toUpperCase().indexOf(String(pre.proveedorNombre).toUpperCase()) >= 0;
      });
      if (p) addProvToSession(p.id);
    }
    var fPre = getFactura(getActiveProvId());
    if (fPre) {
      fPre.lines = [{ mpId: pre.mpId || '', cant: String(pre.peso || ''), precio: String(pre.precioTotal || '') }];
    }
    syncUiFromBucket();
    ui.step = 'productos';
    toast('Cotización cargada — complete y confirme', 'info');
  }

  function init(host) {
    if (!host) return;
    repairRecepcionSession();
    installCxfGlobalUi();
    installCxfBackgroundNavigation();
    var root = resolveCxfRoot(host);
    if (!root) return;
    installCxfClickDelegation(root);
    applyPrefill();
    bindStep(root);
    resumeRecepcionBackground(root);
    refreshStorageNote(root);
    var res = R();
    if (res && res.runBlobMigration) res.runBlobMigration(res.load());
    var prov = root.querySelector('#cxf-go-proveedores');
    if (prov && !prov._cxfBound) {
      prov._cxfBound = true;
      prov.onclick = function () {
        if (typeof global.navigateTo === 'function') global.navigateTo('compras-proveedores');
      };
    }
    var cot = root.querySelector('#cxf-go-cotizaciones');
    if (cot && !cot._cxfBound) {
      cot._cxfBound = true;
      cot.onclick = function () {
        if (typeof global.navigateTo === 'function') global.navigateTo('compras-cotizaciones');
      };
    }
    var neu = root.querySelector('#cxf-new-ingreso');
    if (neu && !neu._cxfBound) {
      neu._cxfBound = true;
      neu.onclick = function () {
        remountRecepcionModule();
        toast('Nuevo ingreso', 'info');
      };
    }
  }

  global.CrozzoRecepcionPdfWork = {
    runExclusive: runExclusivePdfWork,
    waitIdle: waitPdfWorkIdle,
  };

  global.CrozzoRecepcionFacturas = {
    render: render,
    init: init,
    freshUi: freshUi,
    remount: remountRecepcionModule,
    buildIngresosParaGuardar: buildIngresosParaGuardar,
    confirmarIngresoFactura: confirmarIngresoFactura,
    ejecutarGuardadoVerificar: confirmarIngresoFactura,
    afterIngresoGuardado: afterIngresoGuardado,
    onBorrarIngreso: onBorrarIngreso,
    guardar: confirmarIngresoFactura,
    guardarIngreso: confirmarIngresoFactura,
    version: 202606023,
  };
  global.cxfGuardarRecepcion = confirmarIngresoFactura;
  global.crozzoConfirmarIngresoFactura = confirmarIngresoFactura;
  if (typeof document !== 'undefined') {
    loadPdfJs().catch(function () {});
    installCxfBackgroundNavigation();
  }
  global.renderRecepcionFacturas = render;
  global.initRecepcionFacturas = function (host) {
    var h = host || document.getElementById('mainContent');
    installCxfGlobalUi();
    init(h);
    if (C() && C().ensureReady) {
      try {
        C().ensureReady();
      } catch (_) {}
    }
  };

  global.__cxfRecepcionModuleLive = {
    api: global.CrozzoRecepcionFacturas,
    render: render,
    initRecepcion: global.initRecepcionFacturas,
    guardar: global.cxfGuardarRecepcion,
    pdfWork: global.CrozzoRecepcionPdfWork,
  };

  installCxfGlobalUi();
})(typeof window !== 'undefined' ? window : globalThis);
