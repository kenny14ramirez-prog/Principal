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
