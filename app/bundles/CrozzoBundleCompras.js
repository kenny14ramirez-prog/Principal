/* Crozzo bundle: CrozzoBundleCompras.js — generado, no editar */


/* --- CrozzoRecepcionFacturas.js --- */

/**
 * Entrada de facturas — experiencia premium (pilar del flujo compras → costeo).
 * Proveedor → documento (PDF/foto) → líneas MP → verificación y pago → historial.
 */
(function (global) {
  'use strict';

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

  function freshUi() {
    revokeAllCxfPreviewUrls();
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
    };
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
    var found = null;
    ui.proveedorIds.forEach(function (pid) {
      if (found) return;
      var b = ui.porProveedor[pid] || ensureBucket(pid);
      if (!b || !b.facturas) return;
      b.facturas.forEach(function (f) {
        (f.docs || []).forEach(function (d) {
          if (String(d.id) === String(docId)) found = d;
        });
      });
    });
    return found;
  }

  function getPdfBlobUrl(doc) {
    if (!doc || !isPdfDoc(doc)) return '';
    if (_cxfPreviewUrls[doc.id]) return _cxfPreviewUrls[doc.id];
    if (!doc.dataUrl) return '';
    try {
      var bytes = dataUrlToUint8Array(normalizePdfDataUrl(doc.dataUrl));
      if (!bytes.length) return '';
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      _cxfPreviewUrls[doc.id] = url;
      return url;
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

  function pdfBytesToPreviewUrl(bytes) {
    return loadPdfJs().then(function (pdfjsLib) {
      var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var vp = page.getViewport({ scale: 1.4 });
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, vp.width | 0);
          canvas.height = Math.max(1, vp.height | 0);
          var ctx = canvas.getContext('2d');
          return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
            return { url: canvas.toDataURL('image/jpeg', 0.9), numPages: pdf.numPages };
          });
        });
      });
    });
  }

  function ensureDocPdfPreview(doc) {
    if (!doc || !isPdfDoc(doc) || !doc.dataUrl) return Promise.resolve(doc);
    if (doc.previewUrl) return Promise.resolve(doc);
    try {
      var bytes = dataUrlToUint8Array(normalizePdfDataUrl(doc.dataUrl));
      return pdfBytesToPreviewUrl(bytes)
        .then(function (out) {
          doc.previewUrl = out.url;
          doc.previewPages = out.numPages;
          return doc;
        })
        .catch(function (err) {
          console.warn('[CXF] vista previa PDF', err);
          return doc;
        });
    } catch (e) {
      return Promise.resolve(doc);
    }
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
      '<p class="cxf-pdf-preview-fallback cxf-muted">¿No se lee bien? Quite el archivo, exporte de nuevo en <strong>Cotizaciones</strong> y súbalo otra vez. ' +
      '<button type="button" class="btn btn-link btn-sm" data-cxf-pdf-open="' +
      esc(doc.id) +
      '">Abrir PDF externo</button></p></div>'
    );
  }

  function showPdfPreviewInHost(host, doc) {
    var img = host.querySelector('img.cxf-pdf-preview-img');
    var loading = host.querySelector('.cxf-pdf-loading');
    if (!img) return;
    if (!doc || !doc.previewUrl) {
      if (loading) {
        loading.textContent =
          'Vista previa no disponible. Exporte el PDF de nuevo en Cotizaciones (Descargar reporte) y vuelva a subirlo.';
        loading.style.display = 'block';
      }
      img.style.display = 'none';
      return;
    }
    img.src = doc.previewUrl;
    img.style.display = 'block';
    if (loading) {
      if (doc.previewPages > 1) {
        loading.textContent = 'Vista: página 1 de ' + doc.previewPages;
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
      if (!doc || !doc.dataUrl) {
        var loading = host.querySelector('.cxf-pdf-loading');
        if (loading) {
          loading.textContent = 'Sin documento PDF';
          loading.style.display = 'block';
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
      ensureDocPdfPreview(doc).then(function (d) {
        showPdfPreviewInHost(host, d);
      });
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

  function attemptGoProductos(host) {
    persistNumeroFacturasFromDom(host);
    persistActiveBucket();
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

  function proveedoresList() {
    var res = R();
    if (!res) return [];
    if (res.syncProveedoresBidirectional) return res.syncProveedoresBidirectional();
    return res.listProveedores();
  }

  function mpList() {
    var cat = C();
    if (!cat || !cat.list) return [];
    return cat.list();
  }

  function getMp(mpId) {
    var cat = C();
    if (!cat || !cat.get) return null;
    return cat.get(mpId);
  }

  function mpUndLabel(und) {
    if (und === 'ML') return 'ml';
    if (und === 'UND') return 'und';
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
    if (und === 'UND') {
      return {
        pesoTag: 'CANTIDAD',
        pesoTitle: 'Unidades recibidas',
        suffix: 'und',
        pesoTip: 'Piezas, bolsas o cajas',
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
    return mpList()
      .filter(function (mp) {
        if (!needle) return true;
        var blob = [mp.nombre, mp.categoria, mp.id, mp.und].join(' ').toLowerCase();
        return blob.indexOf(needle) >= 0;
      })
      .sort(function (a, b) {
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
      '<div class="cxf-form-grid cxf-form-grid--wide">' +
      '<div class="cxf-field-span-2"><label class="cxf-label">Nombre / razón social *</label><input class="form-input" id="cxf-new-nombre" placeholder="Distribuidora Sol Naciente"></div>' +
      '<div><label class="cxf-label">NIT</label><input class="form-input" id="cxf-new-nit" placeholder="900.123.456-7"></div>' +
      '<div><label class="cxf-label">Rubro *</label><select class="form-input" id="cxf-new-rubro">' +
      TIPOS_RUBRO.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join('') +
      '</select></div>' +
      '<div><label class="cxf-label">Representante</label><input class="form-input" id="cxf-new-rep" placeholder="Opcional"></div>' +
      '<div><label class="cxf-label">Teléfono</label><input class="form-input" id="cxf-new-tel" placeholder="603…"></div>' +
      '<div><label class="cxf-label">Correo</label><input class="form-input" id="cxf-new-email" type="email" placeholder="facturas@…"></div></div>' +
      '<p class="form-hint cxf-legal-note">Datos tributarios (retenciones, régimen) se completarán en una fase posterior.</p>' +
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
      '<p class="cxf-panel-lead">Agregue uno o varios proveedores. En el siguiente paso cargará la factura de cada uno en su propio recuadro.</p>' +
      '</header>' +
      '<nav class="cxf-prov-tabs crozzo-mod-nav crozzo-mod-nav--segmented cxf-prov-tabs--wrap" role="tablist" aria-label="Modo proveedor">' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (tab === 'select' ? ' is-active' : '') +
      '" data-cxf-prov-tab="select" role="tab">Registrado</button>' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (tab === 'nuevo' ? ' is-active' : '') +
      '" data-cxf-prov-tab="nuevo" role="tab">+ Nuevo</button></nav>' +
      (tab === 'nuevo' ? renderProveedorCreatePane() : renderProveedorSelectPane()) +
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
      preview = renderPdfPreviewHtml(doc, 'cxf-preview-frame--card');
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

  function renderDocumentoStep() {
    var provs = getSelectedProviders();
    return (
      '<section class="cxf-panel cxf-panel--documento cxf-panel--full">' +
      '<header class="cxf-prov-hero">' +
      '<p class="cxf-eyebrow">Paso 2 · Facturas</p>' +
      '<h2 class="cxf-panel-title">Un recuadro por proveedor</h2>' +
      '<p class="cxf-panel-lead">Cada <strong>PDF = una factura</strong>. Varios PDF → varios bloques. Un PDF con varias facturas → use <strong>✂ Dividir PDF</strong>. Asigne Nº FE en cada bloque y continúe a productos.</p>' +
      '</header>' +
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
    return (
      '<div class="crozzo-mod-page cxf-root' +
      (ui.step === 'productos' ? ' cxf-root--wide cxf-root--fluid' : ui.step === 'documento' || ui.step === 'proveedor' ? ' cxf-root--wide' : '') +
      '" data-cxf-build="202606015">' +
      renderPdfChoiceModal() +
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

  function refreshDocumentoCards(host) {
    persistActiveBucket();
    var stack = host.querySelector('.cxf-prov-facturas-stack');
    if (!stack) {
      refreshStepHost(host);
      return;
    }
    var provs = getSelectedProviders();
    stack.innerHTML = provs.length
      ? provs.map(renderProvFacturaCard).join('')
      : '<p class="cxf-muted">Vuelva al paso anterior y agregue proveedores.</p>';
    var stepper = host.querySelector('.cxf-stepper');
    if (stepper) stepper.innerHTML = renderStepper();
    applyPdfPreviews(host);
  }

  function scheduleDocumentoRefresh(host) {
    if (_cxfDocRefreshTimer) clearTimeout(_cxfDocRefreshTimer);
    _cxfDocRefreshTimer = setTimeout(function () {
      _cxfDocRefreshTimer = null;
      if (ui.step === 'documento' && host.querySelector('.cxf-panel--documento')) {
        refreshDocumentoCards(host);
      } else {
        refreshStepHost(host);
      }
    }, 120);
  }

  function refreshStepHost(host) {
    host = getCxfHost() || host;
    closeAllCxfOverlays(host);
    persistActiveBucket();
    var sh = host.querySelector('#cxf-step-host');
    if (sh) sh.innerHTML = renderStepContent();
    var stepper = host.querySelector('.cxf-stepper');
    if (stepper) stepper.innerHTML = renderStepper();
    bindStep(host);
    applyPdfPreviews(host);
  }

  function addDoc(doc, provId, opts) {
    opts = opts || {};
    var pid = provId || getActiveProvId();
    var b = ensureBucket(pid);
    if (!b) return;
    if (doc.dataUrl && (isPdfDoc(doc) || (doc.mime && doc.mime.indexOf('pdf') >= 0))) {
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
    f.docPreviewIdx = f.docs.length - 1;
    if (!f.numeroFactura) f.numeroFactura = guessNumeroFactura(doc.nombre);
    b.facturaActiva = f.id;
    if (String(pid) === getActiveProvId()) syncUiFromBucket();
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
    var saveProv = host.querySelector('#cxf-save-prov');
    if (saveProv && !saveProv._cxfBound) {
      saveProv._cxfBound = true;
      saveProv.onclick = function () {
        var res = R();
        if (!res) return toast('Reservorio no disponible', 'warning');
        var nom = host.querySelector('#cxf-new-nombre');
        if (!nom || !nom.value.trim()) return toast('Nombre del proveedor requerido', 'warning');
        var row = res.upsertProveedor({
          nombre: nom.value.trim(),
          nit: (host.querySelector('#cxf-new-nit') || {}).value || '',
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
        return file
          .arrayBuffer()
          .then(function (buf) {
            var bytes = new Uint8Array(buf);
            var doc = {
              id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              nombre: file.name,
              mime: 'application/pdf',
              dataUrl: uint8ArrayToDataUrl(bytes),
            };
            return ensureDocPdfPreview(doc).then(function () {
              addDoc(doc, provId, {
                facturaId: opts.useFacturaId ? facturaId : null,
                newFacturaPerFile: !!opts.newFacturaPerFile,
              });
            });
          })
          .catch(function (err) {
            console.error('[CXF] ingest PDF', err);
            toast('No se pudo leer el PDF', 'error');
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
      var chain = Promise.resolve();
      files.forEach(function (file, idx) {
        chain = chain.then(function () {
          return ingestFileOne(file, asPdf, provId, facturaId, {
            useFacturaId: !multi || idx === 0,
            newFacturaPerFile: asPdf && multi && idx > 0,
            newFacturaPerImage: !asPdf && multi && idx > 0,
          });
        });
      });
      return chain.then(function () {
        scheduleDocumentoRefresh(host);
        toast(
          files.length === 1 ? (asPdf ? 'PDF agregado' : 'Foto agregada') : files.length + ' archivos agregados',
          'success'
        );
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
    installCxfGlobalUi();
    var root = resolveCxfRoot(host);
    if (!root) return;
    installCxfClickDelegation(root);
    applyPrefill();
    bindStep(root);
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
    version: 202606015,
  };
  global.cxfGuardarRecepcion = confirmarIngresoFactura;
  global.crozzoConfirmarIngresoFactura = confirmarIngresoFactura;
  if (typeof document !== 'undefined') {
    loadPdfJs().catch(function () {});
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

  installCxfGlobalUi();
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoComprasLocal.js --- */

/**
 * Compras sin nube — UI local conectada al reservorio unificado (CrozzoReservorio).
 */
(function (global) {
  'use strict';

  function R() {
    return global.CrozzoReservorio;
  }

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

  function proveedoresList() {
    var res = R();
    if (!res) return [];
    if (res.listProveedoresOcFormat) return res.listProveedoresOcFormat();
    if (res.syncProveedoresBidirectional) {
      return res.syncProveedoresBidirectional().map(function (p) {
        return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
      });
    }
    return res.listProveedores().map(function (p) {
      return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
    });
  }

  function provOptions(selectedId) {
    var list = proveedoresList();
    if (!list.length) {
      return '<option value="">— Agregue proveedores en Compras → Proveedores —</option>';
    }
    return list
      .map(function (p) {
        var id = String(p.id || '');
        var sel = id === String(selectedId || '') ? ' selected' : '';
        return '<option value="' + esc(id) + '"' + sel + '>' + esc(p.name || id) + '</option>';
      })
      .join('');
  }

  function fmtMoney(n) {
    var res = R();
    if (res && res.fmtCop) return res.fmtCop(n);
    var x = Number(n);
    if (!isFinite(x)) return '—';
    return '$' + Math.round(x).toLocaleString('es-CO');
  }

  function renderShell(title, hint, inner) {
    return (
      '<div class="crozzo-compras-local">' +
      '<div class="card" style="margin-bottom:12px">' +
      '<h2 class="card-title" style="margin:0 0 6px">' + esc(title) + '</h2>' +
      '<p class="page-subtitle" style="margin:0">' + hint +
      ' · <strong>Reservorio unificado</strong> (memoria interna). Al activar nube: ejecute SQL en Costos → Editor SQL.</p></div>' +
      inner + '</div>'
    );
  }

  function mpOptionsHtml() {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.list) {
      return '<option value="">— Cargue catálogo MP en Gestión —</option>';
    }
    var list = C.list();
    if (!list.length) return '<option value="">— Sin materias primas —</option>';
    return (
      '<option value="">— Materia prima —</option>' +
      list
        .map(function (mp) {
          return (
            '<option value="' +
            esc(mp.id) +
            '" data-peso="' +
            esc(mp.peso) +
            '" data-und="' +
            esc(mp.und) +
            '" data-precio="' +
            esc(mp.precioTotal) +
            '">' +
            esc(mp.nombre) +
            '</option>'
          );
        })
        .join('')
    );
  }

  function renderRecepcionLineRow() {
    return (
      '<tr class="ccl-rec-line">' +
      '<td><select class="form-input ccl-rec-mp">' +
      mpOptionsHtml() +
      '</select></td>' +
      '<td style="text-align:right"><input class="form-input ccl-rec-cant" type="number" min="0" step="any" placeholder="1000" style="text-align:right"></td>' +
      '<td style="text-align:right"><input class="form-input ccl-rec-precio" type="number" min="0" step="1" placeholder="Precio lote" style="text-align:right"></td>' +
      '<td><button type="button" class="btn btn-outline btn-sm ccl-rec-rm" title="Quitar línea">×</button></td></tr>'
    );
  }

  function renderRecepcion() {
    if (global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.render) {
      return global.CrozzoRecepcionFacturas.render();
    }
    var res = R();
    var rows = res
      ? res.load().recepciones.slice(0, 40).map(function (r) {
          var n = (r.items && r.items.length) ? r.items.length + ' ítem(s)' : '';
          return (
            '<tr><td>' +
            esc(r.fecha || '') +
            '</td><td>' +
            esc(r.proveedorNombre || '—') +
            '</td>' +
            '<td style="text-align:right">' +
            fmtMoney(r.valor) +
            '</td><td>' +
            esc(r.notas || '') +
            (n ? ' · ' + esc(n) : '') +
            '</td></tr>'
          );
        }).join('')
      : '';
    return renderShell(
      'Entrada de factura',
      'Recepción → inventario + costeo MP + oficina',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-rec-prov">' +
      provOptions() +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Valor factura (total)</label><input class="form-input" type="number" id="ccl-rec-valor" min="0" step="1" placeholder="Opcional si detalla líneas"></div>' +
      '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-rec-notas" placeholder="Nº factura, referencia…"></div></div>' +
      '<h3 class="card-title" style="margin:16px 0 8px;font-size:.95rem">Líneas de factura → costeo</h3>' +
      '<p class="form-hint" style="margin:0 0 10px">Indique materia prima, cantidad de referencia (ml, g, und) y <strong>precio total del lote</strong>. Si el precio cambió respecto al costeo actual, se pedirá confirmación.</p>' +
      '<table class="table" id="ccl-rec-lines"><thead><tr><th>Materia prima</th><th>Cant. ref.</th><th>Precio lote</th><th></th></tr></thead><tbody>' +
      renderRecepcionLineRow() +
      '</tbody></table>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ccl-rec-add-line" style="margin:8px 0 14px">+ Línea</button>' +
      '<button type="button" class="btn btn-primary" id="ccl-rec-save">Guardar recepción</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ccl-rec-cotizaciones" style="margin-left:8px">Cotizaciones vs costeo</button>' +
      '<p class="form-hint" style="margin-top:10px">Actualiza <strong>Costos → Costeo materias primas</strong> e inventario. Compare precios antes en <strong>Cotizaciones</strong>.</p></div>' +
      '<div class="card" style="margin-top:12px"><h3 class="card-title">Últimas recepciones</h3>' +
      '<table class="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Notas</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4">Sin recepciones</td></tr>') +
      '</tbody></table></div>'
    );
  }

  function renderProcesado() {
    var res = R();
    var rows = res
      ? res.load().cortes.slice(0, 30).map(function (c) {
          return '<tr><td>' + esc(c.fecha) + '</td><td>' + esc(c.producto) + '</td><td>' + esc(c.kg) + ' kg</td></tr>';
        }).join('')
      : '';
    return renderShell(
      'Procesos / cortes',
      'Proceso cerrado → entrada inventario transformada',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Producto / lote</label><input class="form-input" id="ccl-cor-prod"></div>' +
      '<div class="form-group"><label class="form-label">Kg / porciones</label><input class="form-input" type="number" id="ccl-cor-kg" min="0" step="0.01"></div>' +
      '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-cor-notas"></div></div>' +
      '<button type="button" class="btn btn-primary" id="ccl-cor-save">Registrar proceso</button></div>' +
      '<div class="card" style="margin-top:12px"><table class="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="3">Sin procesos</td></tr>') + '</tbody></table></div>'
    );
  }

  function renderOficina() {
    var res = R();
    var rows = res
      ? res.load().facturasOficina.slice(0, 40).map(function (f) {
          return (
            '<tr><td>' + esc(f.fecha) + '</td><td>' + esc(f.proveedorNombre) + '</td>' +
            '<td style="text-align:right">' + fmtMoney(f.valor) + '</td><td>' + esc(f.metodo) + '</td>' +
            '<td>' + esc(f.estado) + '</td>' +
            '<td>' + (f.estado !== 'pagada' ? '<button type="button" class="btn btn-outline btn-sm ccl-of-pagar" data-id="' + esc(f.id) + '">Marcar pagada</button>' : '—') + '</td></tr>'
          );
        }).join('')
      : '';
    return renderShell(
      'Oficina y pagos',
      'Pago proveedor → cola planilla',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-of-prov">' + provOptions() + '</select></div>' +
      '<div class="form-group"><label class="form-label">Valor</label><input class="form-input" type="number" id="ccl-of-valor"></div>' +
      '<div class="form-group"><label class="form-label">Método</label><select class="form-input" id="ccl-of-metodo"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>' +
      '<div class="form-group"><label class="form-label">Estado</label><select class="form-input" id="ccl-of-estado"><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="pagada">Pagada</option></select></div></div>' +
      '<button type="button" class="btn btn-primary" id="ccl-of-save">Guardar</button></div>' +
      '<div class="card" style="margin-top:12px"><table class="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Método</th><th>Estado</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">Sin registros</td></tr>') + '</tbody></table></div>'
    );
  }

  function renderDashboard() {
    var res = R();
    var dash = res
      ? '<div class="ccl-dash-filters" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px">' +
        '<label class="form-hint" style="margin:0">Período</label>' +
        '<select class="form-input" id="ccl-dash-dias" style="width:auto;min-width:120px">' +
        '<option value="7">Últimos 7 días</option>' +
        '<option value="30" selected>Últimos 30 días</option>' +
        '<option value="90">Últimos 90 días</option>' +
        '<option value="365">Último año</option>' +
        '</select>' +
        '<input class="form-input" id="ccl-dash-cat" placeholder="Filtrar categoría (ej. ABARROTES)" style="max-width:220px">' +
        '<button type="button" class="btn btn-outline btn-sm" id="ccl-dash-refresh">Actualizar</button></div>' +
        '<div id="ccl-dash-body">' +
        res.renderDashboardHtml({ dias: 30 }) +
        '</div>'
      : '<p>Cargue CrozzoReservorio.js</p>';
    return renderShell('Resumen compras (reservorio)', 'KPIs unificados de todo el flujo', dash);
  }

  function refreshDashboardBody(host) {
    var res = R();
    var body = host.querySelector('#ccl-dash-body');
    if (!res || !body || !res.renderDashboardHtml) return;
    var dias = Number((host.querySelector('#ccl-dash-dias') || {}).value) || 30;
    var cat = ((host.querySelector('#ccl-dash-cat') || {}).value || '').trim();
    body.innerHTML = res.renderDashboardHtml({ dias: dias, categoria: cat || undefined });
  }

  function bindRecepcionLineRow(tr) {
    if (!tr) return;
    var sel = tr.querySelector('.ccl-rec-mp');
    var cant = tr.querySelector('.ccl-rec-cant');
    var precio = tr.querySelector('.ccl-rec-precio');
    if (sel && !sel._cclBound) {
      sel._cclBound = true;
      sel.addEventListener('change', function () {
        var opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.value) return;
        if (cant && !cant.value) cant.value = opt.getAttribute('data-peso') || '';
        if (precio && !precio.value) precio.value = opt.getAttribute('data-precio') || '';
      });
    }
    var rm = tr.querySelector('.ccl-rec-rm');
    if (rm && !rm._cclBound) {
      rm._cclBound = true;
      rm.onclick = function () {
        var tbody = tr.parentNode;
        if (tbody && tbody.querySelectorAll('.ccl-rec-line').length > 1) tr.remove();
        else toast('Debe haber al menos una línea', 'info');
      };
    }
  }

  function collectRecepcionItems(host) {
    var items = [];
    host.querySelectorAll('.ccl-rec-line').forEach(function (tr) {
      var sel = tr.querySelector('.ccl-rec-mp');
      var cant = tr.querySelector('.ccl-rec-cant');
      var precio = tr.querySelector('.ccl-rec-precio');
      var mpId = sel && sel.value;
      if (!mpId) return;
      var opt = sel.options[sel.selectedIndex];
      var pTotal = Number(precio && precio.value) || 0;
      if (pTotal <= 0) return;
      items.push({
        mpId: mpId,
        productoNombre: opt ? opt.text : '',
        peso: Number(cant && cant.value) || Number(opt && opt.getAttribute('data-peso')) || 1000,
        cantidad: Number(cant && cant.value) || 1000,
        und: (opt && opt.getAttribute('data-und')) || 'GR',
        precioTotal: pTotal,
      });
    });
    return items;
  }

  function applyRecepcionPrefill(host) {
    var pre = global.__crozzoRecepcionPrefill;
    if (!pre || !host) return;
    global.__crozzoRecepcionPrefill = null;
    var tbody = host.querySelector('#ccl-rec-lines tbody');
    if (!tbody) return;
    var tr = tbody.querySelector('.ccl-rec-line') || tbody.appendChild(document.createElement('tr'));
    tr.className = 'ccl-rec-line';
    if (!tr.querySelector('.ccl-rec-mp')) {
      tr.innerHTML = renderRecepcionLineRow().replace(/^<tr[^>]*>|<\/tr>$/g, '');
      bindRecepcionLineRow(tr);
    }
    var sel = tr.querySelector('.ccl-rec-mp');
    var cant = tr.querySelector('.ccl-rec-cant');
    var precio = tr.querySelector('.ccl-rec-precio');
    var prov = host.querySelector('#ccl-rec-prov');
    if (sel && pre.mpId) sel.value = pre.mpId;
    if (cant && pre.peso) cant.value = pre.peso;
    if (precio && pre.precioTotal) precio.value = pre.precioTotal;
    if (prov && pre.proveedorNombre) {
      for (var i = 0; i < prov.options.length; i++) {
        if (prov.options[i].text.indexOf(pre.proveedorNombre) >= 0) {
          prov.selectedIndex = i;
          break;
        }
      }
    }
    toast('Datos de cotización cargados — revise y guarde recepción', 'info');
  }

  function bindRecepcion(host) {
    if (global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.init) {
      global.CrozzoRecepcionFacturas.init(host);
      return;
    }
    applyRecepcionPrefill(host);
    var cotBtn = host.querySelector('#ccl-rec-cotizaciones');
    if (cotBtn && !cotBtn._cclBound) {
      cotBtn._cclBound = true;
      cotBtn.onclick = function () {
        if (typeof global.navigateTo === 'function') global.navigateTo('compras-cotizaciones');
      };
    }
    var addLine = host.querySelector('#ccl-rec-add-line');
    if (addLine && !addLine._cclBound) {
      addLine._cclBound = true;
      addLine.onclick = function () {
        var tbody = host.querySelector('#ccl-rec-lines tbody');
        if (!tbody) return;
        var tr = document.createElement('tr');
        tr.className = 'ccl-rec-line';
        tr.innerHTML = renderRecepcionLineRow().replace(/^<tr[^>]*>|<\/tr>$/g, '');
        tbody.appendChild(tr);
        bindRecepcionLineRow(tr);
      };
    }
    host.querySelectorAll('.ccl-rec-line').forEach(bindRecepcionLineRow);

    var btn = host.querySelector('#ccl-rec-save');
    if (!btn || !R()) return;
    if (btn._cclBound) return;
    btn._cclBound = true;
    btn.onclick = function () {
      var prov = host.querySelector('#ccl-rec-prov');
      var val = host.querySelector('#ccl-rec-valor');
      var notas = host.querySelector('#ccl-rec-notas');
      var pid = prov && prov.value;
      if (!pid) return toast('Seleccione proveedor', 'warning');
      var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
      var items = collectRecepcionItems(host);
      var totalLineas = items.reduce(function (s, it) {
        return s + (Number(it.precioTotal) || 0);
      }, 0);
      var valorFactura = Number(val && val.value) || 0;
      if (!items.length && valorFactura <= 0) {
        return toast('Agregue líneas de materia prima o el valor total de la factura', 'warning');
      }
      if (!valorFactura && totalLineas > 0) valorFactura = totalLineas;
      R().registrarRecepcion({
        proveedorId: pid,
        proveedorNombre: nombre,
        valor: valorFactura,
        notas: (notas && notas.value) || '',
        items: items,
      });
      var msg = 'Recepción guardada';
      if (items.length) msg += ' — ' + items.length + ' precio(s) de costeo actualizados';
      toast(msg, 'success');
      var boot = function () {
        host.innerHTML = renderRecepcion();
        bindRecepcion(host);
      };
      var C = global.CrozzoCatalogoMp;
      if (C && C.ensureReady) C.ensureReady(boot);
      else boot();
    };
  }

  function bindProcesado(host) {
    var btn = host.querySelector('#ccl-cor-save');
    if (!btn || !R()) return;
    btn.onclick = function () {
      var prod = host.querySelector('#ccl-cor-prod');
      var kg = host.querySelector('#ccl-cor-kg');
      var notas = host.querySelector('#ccl-cor-notas');
      if (!prod || !prod.value.trim()) return toast('Indique producto', 'warning');
      R().registrarProceso({
        producto: prod.value.trim(),
        kg: Number(kg && kg.value) || 0,
        notas: (notas && notas.value) || '',
      });
      toast('Proceso registrado — inventario actualizado', 'success');
      host.innerHTML = renderProcesado();
      bindProcesado(host);
    };
  }

  function bindOficina(host) {
    var btn = host.querySelector('#ccl-of-save');
    if (btn && R()) {
      btn.onclick = function () {
        var prov = host.querySelector('#ccl-of-prov');
        var val = host.querySelector('#ccl-of-valor');
        var met = host.querySelector('#ccl-of-metodo');
        var est = host.querySelector('#ccl-of-estado');
        var pid = prov && prov.value;
        if (!pid) return toast('Seleccione proveedor', 'warning');
        var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
        R().registrarOficina({
          proveedorId: pid,
          proveedorNombre: nombre,
          valor: Number(val && val.value) || 0,
          metodo: (met && met.value) || 'efectivo',
          estado: (est && est.value) || 'pendiente',
        });
        toast('Oficina guardada', 'success');
        host.innerHTML = renderOficina();
        bindOficina(host);
      };
    }
    host.querySelectorAll('.ccl-of-pagar').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        if (R()) R().actualizarEstadoOficina(id, 'pagada');
        toast('Pago registrado → cola planilla', 'success');
        host.innerHTML = renderOficina();
        bindOficina(host);
      };
    });
  }

  function renderModule(mod) {
    if (mod === 'procesado') return renderProcesado();
    if (mod === 'oficina') return renderOficina();
    if (mod === 'dashboard') return renderDashboard();
    return renderRecepcion();
  }

  function bindDashboard(host) {
    var refresh = host.querySelector('#ccl-dash-refresh');
    if (refresh && !refresh._cclBound) {
      refresh._cclBound = true;
      refresh.onclick = function () {
        refreshDashboardBody(host);
      };
    }
    var dias = host.querySelector('#ccl-dash-dias');
    if (dias && !dias._cclBound) {
      dias._cclBound = true;
      dias.addEventListener('change', function () {
        refreshDashboardBody(host);
      });
    }
    var cat = host.querySelector('#ccl-dash-cat');
    if (cat && !cat._cclBound) {
      cat._cclBound = true;
      cat.addEventListener('change', function () {
        refreshDashboardBody(host);
      });
      cat.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') refreshDashboardBody(host);
      });
    }
  }

  function bindModule(host, mod) {
    if (mod === 'procesado') bindProcesado(host);
    else if (mod === 'oficina') bindOficina(host);
    else if (mod === 'dashboard') bindDashboard(host);
    else bindRecepcion(host);
  }

  global.CrozzoComprasLocal = {
    render: renderModule,
    init: function (host, mod) {
      if (!host) return;
      var m = mod || 'recepcion';
      if (m === 'recepcion' && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.ensureReady) {
        global.CrozzoCatalogoMp.ensureReady(function () {
          bindModule(host, m);
        });
        return;
      }
      bindModule(host, m);
    },
    isAvailable: function () {
      return !!R();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoCotizacionesMp.js --- */

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



/* --- CrozzoCentroCompras.js --- */

/**
 * Contenido de compras (sin menú duplicado): módulos nativos Crozzo POS.
 * La navegación vive en el sidebar del POS (grupo Compras).
 */
(function (global) {
  'use strict';

  var hub = { qycModule: 'recepcion', loadedQyc: false, frameToken: 0 };

  var QYC_ONLY = { recepcion: 1, procesado: 1, oficina: 1, dashboard: 1, ventas: 1 };

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

  function injectHubStyles() {
    if (document.getElementById('crozzo-hub-compras-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-hub-compras-css';
    el.textContent =
      'body.crozzo-page-centro-compras #mainContent.main-body--centro-compras{padding:0;overflow:hidden;height:calc(100vh - 56px);min-height:480px}' +
      '.crozzo-hub-compras{display:flex;flex-direction:column;height:100%;min-height:calc(100vh - 56px);background:var(--bg-primary)}' +
      '.crozzo-hub-compras__body{flex:1;min-height:0;position:relative}' +
      '.crozzo-hub-engine{position:absolute;inset:0;display:flex;flex-direction:column}' +
      '.crozzo-hub-engine__frame{flex:1;border:0;width:100%;background:var(--bg-primary)}' +
      '.crozzo-hub-local{position:absolute;inset:0;overflow:auto;padding:12px 16px}' +
      '.crozzo-hub-native{position:absolute;inset:0;overflow:auto;padding:12px 16px}' +
      '.crozzo-hub-no-cloud{display:none}' +
      '.crozzo-hub-status{padding:6px 14px;font-size:11px;border-bottom:1px solid var(--border);background:var(--bg-card);color:var(--text-muted)}' +
      '.crozzo-hub-status strong{color:var(--text-primary)}';
    document.head.appendChild(el);
  }

  function qycUrl() {
    return 'CrozzoQyC_App.html?embed=1&pos_auto=1&hub=1&_=' + Date.now() + '_' + ++hub.frameToken;
  }

  function postToQycFrame(payload) {
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (!fr || !fr.contentWindow) return;
    try {
      fr.contentWindow.postMessage(payload, '*');
    } catch (_) {}
  }

  function statusBarHtml() {
    if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.statusBarHtml) {
      return global.CrozzoReservorioOffline.statusBarHtml();
    }
    var cloud = cloudOk();
    return (
      '<div class="crozzo-hub-status" id="crozzo-hub-status">' +
      (cloud
        ? '<span>☁️ <strong>Sincronización cloud</strong> — recepciones y compras enlazadas a Supabase</span>'
        : '<span>💾 <strong>Almacenamiento local</strong> — facturas y datos en este equipo. Active Cloud en Multi-dispositivo para sincronizar.</span>') +
      '</div>'
    );
  }

  function showLocalModule(mod) {
    var host = document.getElementById('crozzo-hub-local-host');
    var eng = document.getElementById('crozzo-hub-engine');
    if (eng) {
      eng.style.display = 'none';
      eng.style.pointerEvents = 'none';
      eng.style.visibility = 'hidden';
      eng.setAttribute('inert', '');
    }
    if (!host) return;
    host.style.display = 'block';
    host.style.pointerEvents = 'auto';
    host.style.visibility = 'visible';
    host.removeAttribute('inert');
    if (mod === 'recepcion' && global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.render) {
      host.innerHTML = global.CrozzoRecepcionFacturas.render();
      global.CrozzoRecepcionFacturas.init(host);
    } else if (global.CrozzoComprasLocal) {
      host.innerHTML = global.CrozzoComprasLocal.render(mod);
      global.CrozzoComprasLocal.init(host, mod);
    } else {
      host.innerHTML = '<div class="card"><p>Cargue CrozzoComprasLocal.js</p></div>';
    }
  }

  function showQycEngine(mod) {
    hub.qycModule = mod || 'recepcion';
    var host = document.getElementById('crozzo-hub-local-host');
    var eng = document.getElementById('crozzo-hub-engine');
    if (!hub.loadedQyc) {
      showLocalModule(mod);
      if (eng) eng.style.display = 'none';
      ensureQycFrameLoaded(function () {
        if (!hub.loadedQyc || !cloudOk()) return;
        if (host) {
          host.style.display = 'none';
          host.style.pointerEvents = 'none';
        }
        if (eng) {
          eng.style.display = 'flex';
          eng.style.pointerEvents = 'auto';
          eng.style.visibility = 'visible';
          eng.removeAttribute('inert');
        }
        postToQycFrame({ type: 'crozzo-qyc-nav', module: hub.qycModule });
      });
      return;
    }
    if (host) {
      host.style.display = 'none';
      host.style.pointerEvents = 'none';
    }
    if (eng) {
      eng.style.display = 'flex';
      eng.style.pointerEvents = 'auto';
      eng.style.visibility = 'visible';
      eng.removeAttribute('inert');
    }
    postToQycFrame({ type: 'crozzo-qyc-nav', module: hub.qycModule });
  }

  function openModule(mod) {
    if (!QYC_ONLY[mod]) {
      toast('Use el menú lateral para esta sección', 'info');
      return;
    }
    hub.qycModule = mod;
    showLocalModule(mod);
    var st = document.getElementById('crozzo-hub-status');
    if (st) st.outerHTML = statusBarHtml();
  }

  function reloadQycFrame() {
    hub.loadedQyc = false;
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (!fr) return;
    if (!cloudOk()) {
      fr.removeAttribute('src');
      openModule(hub.qycModule);
      return;
    }
    postToQycFrame({ type: 'crozzo-pos-supabase-sync' });
    fr.src = qycUrl();
  }

  function syncThemeToQycFrame() {
    if (typeof global.crozzoBroadcastThemeToEmbeds === 'function') {
      global.crozzoBroadcastThemeToEmbeds();
    }
  }

  function ensureQycFrameLoaded(onReady) {
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (!fr || hub.loadedQyc || !cloudOk()) {
      if (onReady) onReady();
      return;
    }
    var token = hub.frameToken;
    if (hub._loadTimer) clearTimeout(hub._loadTimer);
    hub._loadTimer = setTimeout(function () {
      if (hub.loadedQyc || token !== hub.frameToken) return;
      hub.loadedQyc = false;
      try {
        fr.removeAttribute('src');
      } catch (_) {}
      toast('Sin conexión con QyC — modo local seguro activado', 'warning');
      showLocalModule(hub.qycModule);
      var st = document.getElementById('crozzo-hub-status');
      if (st) st.outerHTML = statusBarHtml();
    }, 10000);
    fr.onerror = function () {
      if (hub._loadTimer) clearTimeout(hub._loadTimer);
      if (hub.loadedQyc) return;
      toast('Error cargando QyC — modo local', 'warning');
      showLocalModule(hub.qycModule);
    };
    fr.onload = function () {
      if (hub._loadTimer) clearTimeout(hub._loadTimer);
      hub.loadedQyc = true;
      postToQycFrame({ type: 'crozzo-pos-supabase-sync' });
      postToQycFrame({ type: 'crozzo-qyc-nav', module: hub.qycModule });
      syncThemeToQycFrame();
      if (onReady) onReady();
    };
    fr.src = qycUrl();
  }

  function bindSupabaseListeners() {
    if (hub._sbBound) return;
    hub._sbBound = true;
    document.addEventListener('crozzo-supabase-config-saved', function () {
      reloadQycFrame();
      toast('Nube actualizada — compras recargadas', 'success');
    });
    window.addEventListener('storage', function (ev) {
      if (ev && ev.key === 'crozzo_supabase_config') reloadQycFrame();
    });
    document.addEventListener('crozzo-connectivity-changed', function () {
      if (typeof currentPage === 'undefined') return;
      if (currentPage !== 'centro-compras' && currentPage !== 'operaciones-qyc') return;
      hub.loadedQyc = false;
      var st = document.getElementById('crozzo-hub-status');
      if (st) st.outerHTML = statusBarHtml();
      openModule(hub.qycModule);
    });
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'crozzo-qyc-recepcion-guardada' && global.CrozzoReservorio) {
        var qSig =
          String(d.recepcionId || d.id || '') ||
          [
            d.proveedorId,
            d.valor || d.total,
            (d.items || d.lineas || []).length,
            d.numeroFactura,
          ].join('|');
        if (hub._lastQycRecepcionSig === qSig) return;
        hub._lastQycRecepcionSig = qSig;
        global.CrozzoReservorio.registrarRecepcion({
          id: d.recepcionId || d.id || undefined,
          proveedorId: d.proveedorId,
          proveedorNombre: d.proveedorNombre,
          valor: d.valor || d.total,
          numeroFactura: d.numeroFactura || '',
          notas: d.notas || 'Recepción factura',
          crearOficina: d.crearOficina !== false,
          items: d.items || d.lineas || [],
          skipConfirmVariacion: d.skipConfirmVariacion === true,
        });
        if (d.items && d.items.length) {
          toast('Recepción registrada — costeo MP actualizado', 'success');
        }
      }
      if (d.type === 'crozzo-qyc-factura-pagada' && global.CrozzoReservorio && d.facturaId) {
        global.CrozzoReservorio.actualizarEstadoOficina(d.facturaId, 'pagada');
      }
    });
  }

  function renderOrdenesEmbed() {
    return (
      '<div id="crozzo-hub-ordenes-host">' +
      (typeof renderComprasProveedores === 'function'
        ? '<div class="card" style="margin-bottom:12px"><p class="page-subtitle" style="margin:0">Órdenes de compra al catálogo POS.</p></div>' + renderComprasProveedores()
        : '<div class="card"><p>Módulo de proveedores no disponible</p></div>') +
      '</div>'
    );
  }

  global.crozzoComprasPageToModule = function (page) {
    var map = {
      'compras-oficina': 'oficina',
      'centro-compras': 'recepcion',
      'operaciones-qyc': 'recepcion'
    };
    return map[page] || null;
  };

  global.crozzoNavGroupForPage = function (page) {
    if (
      page === 'compras-recepcion' ||
      page === 'compras-proveedores' ||
      page === 'compras-cotizaciones' ||
      page === 'compras-ordenes' ||
      page === 'centro-compras' ||
      page === 'operaciones-qyc'
    ) {
      return 'compras';
    }
    if (
      page === 'compras-cortes' ||
      page === 'centro-procesos' ||
      page === 'compras-proceso-sesion' ||
      page === 'compras-proceso-entrada' ||
      page === 'compras-proceso-historial'
    ) {
      return 'procesos';
    }
    if (page === 'compras-oficina') return 'administrativo';
    if (page === 'compras-dashboard' || page === 'inventarios') return 'gestion';
    if (page === 'planilla-2026' || page === 'nomina-planilla') return 'administrativo';
    if (page === 'pedidos-internos') return 'compras';
    return null;
  };

  global.crozzoOpenNavGroup = function (groupId) {
    if (!groupId) return;
    var g = document.querySelector(
      '#sidebar [data-group="' + groupId + '"], #sidebar [data-nav-group="' + groupId + '"]'
    );
    if (g && global.CrozzoSidebarNav && global.CrozzoSidebarNav.applyGroupOpen) {
      global.CrozzoSidebarNav.applyGroupOpen(g, true, false);
    } else if (g) {
      g.classList.add('open');
      g.classList.remove('nav-group-collapsed');
    }
  };

  global.crozzoOpenComprasGroup = function () {
    global.crozzoOpenNavGroup('compras');
  };

  global.CrozzoCentroCompras = {
    openModule: openModule,

    render: function (startModule) {
      injectHubStyles();
      hub.loadedQyc = false;
      hub.frameToken = 0;
      hub.qycModule = startModule && QYC_ONLY[startModule] ? startModule : 'recepcion';

      if (startModule === 'ordenes') {
        return (
          '<section class="crozzo-hub-compras" id="crozzo-hub-compras">' +
          statusBarHtml() +
          '<div class="crozzo-hub-compras__body"><div class="crozzo-hub-native" style="position:relative;inset:auto;height:100%">' +
          renderOrdenesEmbed() +
          '</div></div></section>'
        );
      }

      return (
        '<section class="crozzo-hub-compras" id="crozzo-hub-compras">' +
        statusBarHtml() +
        '<div class="crozzo-hub-compras__body">' +
        '<div class="crozzo-hub-engine" id="crozzo-hub-engine" style="display:none">' +
        '<iframe id="crozzo-hub-qyc-frame" class="crozzo-hub-engine__frame" title="Facturas de compra"></iframe></div>' +
        '<div class="crozzo-hub-local" id="crozzo-hub-local-host" style="display:none"></div>' +
        '</div></section>'
      );
    },

    init: function (startModule) {
      if (global.CrozzoReservorioOffline) global.CrozzoReservorioOffline.ensureReservorioReady();
      bindSupabaseListeners();
      if (startModule === 'ordenes') {
        if (typeof initComprasProveedores === 'function') initComprasProveedores();
        return;
      }
      openModule(hub.qycModule);
    }
  };

  global.renderCentroCompras = function (start) {
    return global.CrozzoCentroCompras.render(start);
  };

  global.initCentroCompras = function (start) {
    return global.CrozzoCentroCompras.init(start);
  };

  global.crozzoResolveLegacyComprasPage = function (page) {
    var mod = global.crozzoComprasPageToModule(page);
    if (mod) return { page: 'centro-compras', module: mod };
    if (page === 'compras-proveedores') return { page: 'compras-proveedores', module: null };
    if (page === 'compras-cotizaciones') return { page: 'compras-cotizaciones', module: null };
    if (page === 'compras-recepcion') return { page: 'compras-recepcion', module: null };
    if (page === 'compras-ordenes') return { page: 'centro-compras', module: 'ordenes' };
    return { page: page, module: null };
  };

  function centroComprasTeardown() {
    hub.loadedQyc = false;
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (fr) {
      try {
        fr.src = 'about:blank';
      } catch (_) {}
    }
    var lh = document.getElementById('crozzo-hub-local-host');
    if (lh) lh.innerHTML = '';
  }

  global.crozzoCentroComprasTeardown = centroComprasTeardown;
  if (typeof window !== 'undefined') window.crozzoCentroComprasTeardown = centroComprasTeardown;
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoBonaOrigen.js --- */

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



/* --- CrozzoCentroProcesos.js --- */

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

