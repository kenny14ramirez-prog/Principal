/**
 * Crozzo POS — Reportes PDF de costos (resumen general + detalle MP/recetas).
 */
(function (global) {
  'use strict';

  var PAGE_W = 210;
  var PAGE_H = 297;
  var M = 14;
  var CONTENT_W = PAGE_W - M * 2;
  var FOOTER_Y = PAGE_H - 10;

  var C_GOLD = [201, 169, 98];
  var C_DARK = [24, 29, 39];
  var C_MUTED = [100, 116, 139];
  var C_RED = [220, 38, 38];
  var C_GREEN = [22, 163, 74];
  var C_SLATE = [148, 163, 184];
  var C_BG = [248, 250, 252];
  var C_BORDER = [226, 232, 240];

  var _pdfBusy = false;

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var base = String(src || '').split('?')[0];
      var tag = document.querySelector('script[data-crozzo-jspdf="' + base + '"]');
      if (tag && tag.getAttribute('data-ready') === '1') {
        resolve();
        return;
      }
      if (tag) {
        tag.addEventListener('load', function () {
          resolve();
        });
        tag.addEventListener('error', function () {
          reject(new Error('No se pudo cargar ' + src));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-crozzo-jspdf', base);
      s.onload = function () {
        s.setAttribute('data-ready', '1');
        resolve();
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function resolveJsPdfCtor() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    if (global.jsPDF) return global.jsPDF;
    return null;
  }

  function loadJsPdf() {
    var ctor = resolveJsPdfCtor();
    if (ctor) return Promise.resolve(ctor);
    return loadScriptOnce('vendor/CrozzoJsPdf.js').then(function () {
      var c = resolveJsPdfCtor();
      if (c) return c;
      return loadScriptOnce(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      ).then(function () {
        var c2 = resolveJsPdfCtor();
        if (c2) return c2;
        throw new Error('jsPDF no está disponible');
      });
    });
  }

  function toast(msg, type) {
    try {
      if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    } catch (_) {}
  }

  function fmtMoney(n) {
    var v = Math.round(Number(n) || 0);
    return '$' + v.toLocaleString('es-CO');
  }

  function fmtMoneyDec(n, dec) {
    dec = dec == null ? 2 : dec;
    var v = Number(n) || 0;
    return (
      '$' +
      v.toLocaleString('es-CO', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    );
  }

  function fmtPct(n) {
    if (n == null || !isFinite(n)) return '—';
    return (Math.round(Number(n) * 10) / 10) + '%';
  }

  function fileStamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0')
    );
  }

  function isTauriEnv() {
    return !!(global.__CROZZO_IS_TAURI__ || (global.__TAURI__ && global.__TAURI__.core));
  }

  function tauriInvoke(cmd, args) {
    var t = global.__TAURI__;
    if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args);
    if (t && typeof t.invoke === 'function') return t.invoke(cmd, args);
    return Promise.reject(new Error('Tauri no disponible'));
  }

  function tauriSavedPath(res) {
    if (!res) return '';
    return String(res.saved_path || res.savedPath || '').trim();
  }

  function openSavedPdfPath(path) {
    if (!path || !isTauriEnv()) return;
    tauriInvoke('plugin:opener|open_path', { path: path }).catch(function () {});
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
        a.remove();
      }, 400);
      return true;
    } catch (e) {
      console.error('[costos-pdf]', e);
      return false;
    }
  }

  function pdfDocToBase64(doc) {
    try {
      if (doc && typeof doc.output === 'function') {
        var uri = doc.output('datauristring');
        var comma = String(uri || '').indexOf(',');
        if (comma >= 0) {
          var b64 = String(uri).slice(comma + 1);
          if (b64.length > 100) return Promise.resolve(b64);
        }
      }
    } catch (e) {
      console.warn('[costos-pdf] datauri sync', e);
    }
    return new Promise(function (resolve) {
      try {
        var blob = doc.output('blob');
        if (!blob || !blob.size) {
          resolve('');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var raw = String(reader.result || '');
          var comma = raw.indexOf(',');
          resolve(comma >= 0 ? raw.slice(comma + 1) : '');
        };
        reader.onerror = function () {
          resolve('');
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error('[costos-pdf] blob read', err);
        resolve('');
      }
    });
  }

  /** Una sola vía de guardado — evita descargas duplicadas. */
  function savePdfDoc(doc, filename) {
    filename = String(filename || 'reporte.pdf');
    return pdfDocToBase64(doc).then(function (b64) {
      if (!b64) {
        return { ok: false, error: new Error('No se pudo serializar el PDF') };
      }
      if (isTauriEnv()) {
        return tauriInvoke('crozzo_save_pdf_b64', {
          pdfB64: b64,
          filename: filename,
        }).then(function (res) {
          var path = tauriSavedPath(res);
          if (res && res.ok && path) {
            openSavedPdfPath(path);
            return {
              ok: true,
              mode: 'tauri-downloads',
              hint: 'PDF guardado en Descargas:\n' + path,
              savedPath: path,
            };
          }
          throw new Error((res && res.message) || 'No se pudo guardar en Descargas');
        });
      }
      try {
        var blob = doc.output('blob');
        if (triggerDownload(blob, filename)) {
          return {
            ok: true,
            mode: 'download',
            hint: 'PDF descargado: ' + filename,
          };
        }
      } catch (e) {
        console.error('[costos-pdf] download', e);
        return { ok: false, error: e };
      }
      return { ok: false, error: new Error('No se pudo iniciar la descarga') };
    });
  }

  function empresaNombre() {
    try {
      if (global.config && typeof global.config.getEmpresa === 'function') {
        var emp = global.config.getEmpresa();
        if (emp && emp.nombre) return String(emp.nombre).trim();
      }
    } catch (_) {}
    return 'Crozzo POS';
  }

  function precioPosProducto(row) {
    if (!row || row.posProductId == null) return null;
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    for (var i = 0; i < prods.length; i++) {
      if (prods[i] && prods[i].id === row.posProductId) {
        return Math.round(Number(prods[i].precio) || 0);
      }
    }
    return null;
  }

  function getHistorialVigente(menuRow, periodoVigente) {
    if (!menuRow || !Array.isArray(menuRow.historialCosteo)) return null;
    return (
      menuRow.historialCosteo.find(function (h) {
        return h && h.periodo === periodoVigente;
      }) || null
    );
  }

  function collectReportData(done) {
    var C = global.CrozzoCatalogoMp;
    var E = global.CrozzoCostosEngine;
    var resolveCosto = global.CrozzoCostosResolveCostoVentaMenu;
    if (!C || !C.ensureReady) {
      done(null, 'Catálogo MP no disponible');
      return;
    }
    C.ensureReady(function () {
      try {
        try {
          if (global.CrozzoCostosSyncMenuDesdeFuentes && C.buildSeedForCostos) {
            global.CrozzoCostosSyncMenuDesdeFuentes(C.buildSeedForCostos(), { force: false });
          }
        } catch (syncErr) {
          console.warn('[costos-pdf] sync previo', syncErr);
        }
        var seed = C.buildSeedForCostos ? C.buildSeedForCostos() : { resumen: [] };
        var pv = C.PERIODO_COSTEO_VIGENTE || 'vigente';
        var store = C.buildPreciosStore ? C.buildPreciosStore() : {};
        var productos = [];
        var subieron = [];
        var bajaron = [];
        var sinCambio = [];

        (seed.resumen || []).forEach(function (row) {
          if (!row || !String(row.producto || '').trim()) return;
          var menuRow = C.getMenuPlato ? C.getMenuPlato(row.slug) : null;
          var tipo = row.tipoCosteo === 'directo' ? 'directo' : 'receta';
          var pack = {
            slug: row.slug,
            producto: row.producto,
            tipoCosteo: tipo,
            categoria: row.categoria || '',
          };
          var rowPack = Object.assign({}, row, pack);
          var costoLive = resolveCosto ? resolveCosto(rowPack, seed) : 0;
          var costoActual =
            costoLive > 0 ? costoLive : Math.round(Number(row.costoMp) || 0);
          var vig = menuRow ? getHistorialVigente(menuRow, pv) : null;
          var costoGuardado = vig
            ? Math.round(Number(vig.costoMp) || 0)
            : Math.round(Number((menuRow && menuRow.costoMp) || row.costoMp) || 0);
          var costoAnterior =
            vig && vig.costoMpAnterior != null ? Math.round(Number(vig.costoMpAnterior)) : null;
          var precioCaja = precioPosProducto(menuRow || row);
          var precioMenu = Math.round(Number((menuRow && menuRow.precioVenta) || row.precioVenta) || 0);
          var margenReal = null;
          if (E && precioMenu > 0) {
            var r = E.calcularResumen(costoActual, precioMenu);
            margenReal = Math.round(r.pctUtilidad * 1000) / 10;
          }
          var ref = costoAnterior != null ? costoAnterior : costoGuardado;
          var delta = costoActual - ref;
          var deltaPct = ref > 0 ? (delta / ref) * 100 : null;
          var tendencia = 'eq';
          if (Math.abs(delta) >= 1) tendencia = delta > 0 ? 'up' : 'down';

          var item = {
            producto: row.producto,
            tipo: tipo,
            costoActual: costoActual,
            costoGuardado: costoGuardado,
            costoAnterior: costoAnterior,
            precioCaja: precioCaja,
            precioMenu: precioMenu,
            margenReal: margenReal,
            delta: delta,
            deltaPct: deltaPct,
            tendencia: tendencia,
          };
          productos.push(item);
          if (tendencia === 'up') subieron.push(item);
          else if (tendencia === 'down') bajaron.push(item);
          else sinCambio.push(item);
        });

        productos.sort(function (a, b) {
          return String(a.producto).localeCompare(String(b.producto), 'es');
        });

        var mps = (C.list ? C.list() : []).map(function (it) {
          var und = String(it.und || 'GR').toUpperCase();
          var precioUnit = Number(it.precioUnit) || 0;
          if (E && E.precioUnitarioMp && (und === 'UNI' || und === 'UND')) {
            precioUnit = Math.round(Number(it.precioTotal) || 0);
          }
          return {
            id: it.id,
            nombre: it.nombre,
            categoria: it.categoria || '',
            und: und,
            peso: Number(it.peso) || 0,
            precioTotal: Math.round(Number(it.precioTotal) || 0),
            precioUnit: precioUnit,
            proveedor: it.proveedor || it.proveedorNombre || '',
          };
        });

        var recetas = [];
        (C.listRecetasPlatos ? C.listRecetasPlatos() : []).forEach(function (rec) {
          if (!rec || !rec.slug) return;
          var lineasCalc = (rec.lineas || []).map(function (ln) {
            var costoU = 0;
            if (ln.costoXUnidad != null) costoU = Number(ln.costoXUnidad);
            else if (E && E.resolverCostoUnitario) {
              var nom = ln.ingrediente;
              if (ln.mpId && C.get) {
                var mp = C.get(ln.mpId);
                if (mp && mp.nombre) nom = mp.nombre;
              }
              costoU = E.resolverCostoUnitario(nom, store);
            }
            var cant = Number(ln.cantidad) || 0;
            return {
              ingrediente: ln.ingrediente || '',
              mpId: ln.mpId || '',
              unidad: ln.unidad || ln.und || 'GR',
              cantidad: cant,
              costoUnit: costoU,
              subtotal: Math.round(cant * costoU),
            };
          });
          var costoTotal = 0;
          if (E && lineasCalc.length) {
            var calc = E.calcularReceta(
              lineasCalc.map(function (l) {
                return {
                  ingrediente: l.ingrediente,
                  unidad: l.unidad,
                  cantidad: l.cantidad,
                  costoXUnidad: l.costoUnit,
                };
              }),
              rec.opts || {}
            );
            costoTotal = calc ? Math.round(Number(calc.costoReferencia) || 0) : 0;
          } else {
            lineasCalc.forEach(function (l) {
              costoTotal += l.subtotal;
            });
          }
          recetas.push({
            slug: rec.slug,
            producto: rec.producto || rec.slug,
            lineas: lineasCalc,
            costoTotal: costoTotal,
            opts: rec.opts || {},
          });
        });
        recetas.sort(function (a, b) {
          return String(a.producto).localeCompare(String(b.producto), 'es');
        });

        var sumCosto = 0;
        var sumVenta = 0;
        productos.forEach(function (p) {
          sumCosto += p.costoActual;
          sumVenta += p.precioMenu;
        });

        done({
          meta: {
            empresa: empresaNombre(),
            fecha: new Date().toLocaleString('es-CO'),
            fechaCorta: new Date().toLocaleDateString('es-CO'),
            totalProductos: productos.length,
            subieron: subieron.length,
            bajaron: bajaron.length,
            sinCambio: sinCambio.length,
            sumCosto: sumCosto,
            sumVenta: sumVenta,
            margenGlobal: sumVenta > 0 ? ((sumVenta - sumCosto) / sumVenta) * 100 : 0,
          },
          productos: productos,
          subieron: subieron,
          bajaron: bajaron,
          mps: mps,
          recetas: recetas,
        });
      } catch (err) {
        done(null, err && err.message ? err.message : String(err));
      }
    });
  }

  function createPdfDoc(jsPDF) {
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var page = 1;
    var y = M;

    function footer() {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor.apply(doc, C_MUTED);
      doc.text('Crozzo POS · Sistema de costos · Confidencial', M, FOOTER_Y);
      doc.text('Pág. ' + page, PAGE_W - M, FOOTER_Y, { align: 'right' });
    }

    function checkSpace(need, redraw) {
      if (y + need <= FOOTER_Y - 6) return;
      footer();
      doc.addPage();
      page++;
      y = M + 6;
      if (typeof redraw === 'function') redraw();
    }

    function drawReportHeader(title, subtitle, metaLine) {
      doc.setFillColor.apply(doc, C_DARK);
      doc.roundedRect(M, 10, CONTENT_W, 32, 3, 3, 'F');
      doc.setFillColor.apply(doc, C_GOLD);
      doc.rect(M, 10, CONTENT_W, 2.5, 'F');
      doc.setTextColor.apply(doc, C_GOLD);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(title, M + 5, 22);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(subtitle, M + 5, 29);
      if (metaLine) {
        doc.setFontSize(7.5);
        doc.setTextColor(200, 210, 220);
        var metaLines = doc.splitTextToSize(String(metaLine), CONTENT_W - 10);
        doc.text(metaLines, M + 5, 35);
      }
      y = 48;
    }

    function sectionTitle(txt) {
      checkSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor.apply(doc, C_DARK);
      doc.text(txt, M, y);
      y += 4;
      doc.setDrawColor.apply(doc, C_GOLD);
      doc.setLineWidth(0.5);
      doc.line(M, y, PAGE_W - M, y);
      y += 7;
    }

    function drawKpiCards(cards) {
      checkSpace(24);
      var gap = 3;
      var cw = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
      var y0 = y;
      cards.forEach(function (c, i) {
        var x = M + i * (cw + gap);
        doc.setFillColor.apply(doc, C_BG);
        doc.setDrawColor.apply(doc, C_BORDER);
        doc.roundedRect(x, y0, cw, 20, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor.apply(doc, C_MUTED);
        doc.text(c.label, x + 4, y0 + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(c.large ? 12 : 10);
        doc.setTextColor.apply(doc, C_DARK);
        var valLines = doc.splitTextToSize(String(c.value), cw - 8);
        doc.text(valLines[0], x + 4, y0 + 14);
        if (c.sub) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor.apply(doc, C_MUTED);
          doc.text(c.sub, x + 4, y0 + 18);
        }
      });
      y = y0 + 24;
    }

    function drawTrendChart(meta) {
      var total = meta.subieron + meta.bajaron + meta.sinCambio;
      if (!total) return;
      checkSpace(32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, C_DARK);
      doc.text('Variación de costos MP (menú)', M, y);
      y += 5;
      var segments = [
        { label: 'Subieron', n: meta.subieron, color: C_RED },
        { label: 'Bajaron', n: meta.bajaron, color: C_GREEN },
        { label: 'Sin cambio', n: meta.sinCambio, color: C_SLATE },
      ];
      var barH = 10;
      var x = M;
      segments.forEach(function (seg) {
        if (!seg.n) return;
        var w = (seg.n / total) * CONTENT_W;
        doc.setFillColor.apply(doc, seg.color);
        doc.rect(x, y, Math.max(w, 1.2), barH, 'F');
        x += w;
      });
      y += barH + 5;
      var lx = M;
      segments.forEach(function (seg) {
        doc.setFillColor.apply(doc, seg.color);
        doc.roundedRect(lx, y, 3, 3, 0.5, 0.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(55, 55, 55);
        var pct = total > 0 ? Math.round((seg.n / total) * 100) : 0;
        doc.text(seg.label + ' ' + seg.n + ' (' + pct + '%)', lx + 5, y + 2.5);
        lx += 58;
      });
      y += 10;
    }

    function drawTopCostBars(items, limit) {
      limit = limit || 8;
      var top = items
        .slice()
        .sort(function (a, b) {
          return b.costoActual - a.costoActual;
        })
        .slice(0, limit);
      if (!top.length) return;
      checkSpace(12 + top.length * 7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, C_DARK);
      doc.text('Top platos por costo MP actual', M, y);
      y += 6;
      var maxVal = top[0].costoActual || 1;
      var labelW = 52;
      var barX = M + labelW + 2;
      var barMaxW = CONTENT_W - labelW - 28;
      top.forEach(function (p) {
        checkSpace(8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(45, 45, 45);
        var nameLines = doc.splitTextToSize(truncate(p.producto, 32), labelW);
        doc.text(nameLines[0], M, y);
        var bw = Math.max(2, (p.costoActual / maxVal) * barMaxW);
        doc.setFillColor.apply(doc, C_GOLD);
        doc.roundedRect(barX, y - 3.2, bw, 4.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(fmtMoney(p.costoActual), PAGE_W - M, y, { align: 'right' });
        y += 7;
      });
      y += 4;
    }

    function drawTableHead(cols) {
      checkSpace(11);
      doc.setFillColor.apply(doc, C_DARK);
      doc.rect(M, y, CONTENT_W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      cols.forEach(function (c) {
        doc.text(c.label, c.x, y + 5.5, { align: c.align || 'left' });
      });
      y += 10;
    }

    function truncate(txt, max) {
      txt = String(txt || '');
      return txt.length > max ? txt.slice(0, max - 1) + '…' : txt;
    }

    return {
      doc: doc,
      getY: function () {
        return y;
      },
      setY: function (ny) {
        y = ny;
      },
      checkSpace: checkSpace,
      drawReportHeader: drawReportHeader,
      sectionTitle: sectionTitle,
      drawKpiCards: drawKpiCards,
      drawTrendChart: drawTrendChart,
      drawTopCostBars: drawTopCostBars,
      drawTableHead: drawTableHead,
      truncate: truncate,
      footer: footer,
      nextRow: function (cells, opts) {
        opts = opts || {};
        var minH = opts.rowH || 6;
        checkSpace(minH + 4, null);
        var rowTop = y;
        var maxH = minH;
        cells.forEach(function (c) {
          if (c.maxW) {
            var linesPre = doc.splitTextToSize(String(c.text), c.maxW);
            maxH = Math.max(maxH, minH + (linesPre.length - 1) * 3.4);
          }
        });
        if (opts.zebra) {
          doc.setFillColor.apply(doc, C_BG);
          doc.rect(M, rowTop - 4, CONTENT_W, maxH + 1, 'F');
        }
        cells.forEach(function (c) {
          doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
          doc.setFontSize(c.size || 7);
          if (c.color) doc.setTextColor.apply(doc, c.color);
          else doc.setTextColor(40, 40, 40);
          if (c.maxW) {
            var lines = doc.splitTextToSize(String(c.text), c.maxW);
            lines.forEach(function (ln, li) {
              doc.text(ln, c.x, rowTop + li * 3.4, { align: c.align || 'left' });
            });
          } else {
            doc.text(String(c.text), c.x, rowTop, { align: c.align || 'left' });
          }
        });
        y = rowTop + maxH + 1;
      },
    };
  }

  var COL_MENU = {
    prod: { x: M + 1, w: 46 },
    actual: { x: M + 50, w: 22 },
    guard: { x: M + 74, w: 22 },
    ant: { x: M + 98, w: 20 },
    delta: { x: M + 120, w: 20 },
    caja: { x: M + 142, w: 22 },
    marg: { x: M + 166, w: 16 },
    trend: { x: PAGE_W - M - 1, w: 8 },
  };

  function buildGeneralPdf(data, jsPDF) {
    var pb = createPdfDoc(jsPDF);
    var meta = data.meta;
    pb.drawReportHeader(
      'Reporte general de costos',
      meta.empresa,
      'Generado ' +
        meta.fecha +
        ' · ' +
        meta.totalProductos +
        ' productos · Margen global ' +
        fmtPct(meta.margenGlobal)
    );

    pb.drawKpiCards([
      { label: 'Productos en menú', value: String(meta.totalProductos) },
      { label: 'Costo MP total', value: fmtMoney(meta.sumCosto) },
      { label: 'Venta menú total', value: fmtMoney(meta.sumVenta) },
      {
        label: 'Margen global',
        value: fmtPct(meta.margenGlobal),
        sub: 'sobre venta',
        large: true,
      },
    ]);

    pb.drawTrendChart(meta);
    pb.drawTopCostBars(data.productos, 8);

    pb.sectionTitle('Menú — costo actual vs guardado');
    pb.drawTableHead([
      { label: 'PRODUCTO', x: COL_MENU.prod.x },
      { label: 'ACTUAL', x: COL_MENU.actual.x + COL_MENU.actual.w, align: 'right' },
      { label: 'GUARD.', x: COL_MENU.guard.x + COL_MENU.guard.w, align: 'right' },
      { label: 'ANT.', x: COL_MENU.ant.x + COL_MENU.ant.w, align: 'right' },
      { label: 'Δ', x: COL_MENU.delta.x + COL_MENU.delta.w, align: 'right' },
      { label: 'CAJA', x: COL_MENU.caja.x + COL_MENU.caja.w, align: 'right' },
      { label: 'MARG', x: COL_MENU.marg.x + COL_MENU.marg.w, align: 'right' },
      { label: '↕', x: COL_MENU.trend.x, align: 'right' },
    ]);

    data.productos.forEach(function (p, i) {
      var arrow = p.tendencia === 'up' ? '↑' : p.tendencia === 'down' ? '↓' : '=';
      var deltaTxt =
        p.delta != null && Math.abs(p.delta) >= 1
          ? (p.delta > 0 ? '+' : '') + fmtMoney(p.delta)
          : '—';
      var deltaColor = p.tendencia === 'up' ? C_RED : p.tendencia === 'down' ? C_GREEN : [40, 40, 40];
      pb.nextRow(
        [
          { text: p.producto, x: COL_MENU.prod.x, maxW: COL_MENU.prod.w },
          { text: fmtMoney(p.costoActual), x: COL_MENU.actual.x + COL_MENU.actual.w, align: 'right' },
          { text: fmtMoney(p.costoGuardado), x: COL_MENU.guard.x + COL_MENU.guard.w, align: 'right' },
          {
            text: p.costoAnterior != null ? fmtMoney(p.costoAnterior) : '—',
            x: COL_MENU.ant.x + COL_MENU.ant.w,
            align: 'right',
          },
          { text: deltaTxt, x: COL_MENU.delta.x + COL_MENU.delta.w, align: 'right', color: deltaColor },
          {
            text: p.precioCaja != null ? fmtMoney(p.precioCaja) : '—',
            x: COL_MENU.caja.x + COL_MENU.caja.w,
            align: 'right',
          },
          { text: fmtPct(p.margenReal), x: COL_MENU.marg.x + COL_MENU.marg.w, align: 'right' },
          {
            text: arrow,
            x: COL_MENU.trend.x,
            align: 'right',
            color: p.tendencia === 'up' ? C_RED : p.tendencia === 'down' ? C_GREEN : C_SLATE,
            bold: true,
          },
        ],
        { zebra: i % 2 === 1, rowH: 5.5 }
      );
    });

    function listBlock(title, items) {
      if (!items.length) return;
      pb.sectionTitle(title + ' (' + items.length + ')');
      items.slice(0, 35).forEach(function (p, i) {
        pb.nextRow(
          [
            { text: p.producto, x: M, maxW: 90 },
            {
              text:
                fmtMoney(p.costoAnterior != null ? p.costoAnterior : p.costoGuardado) +
                '  →  ' +
                fmtMoney(p.costoActual),
              x: PAGE_W - M,
              align: 'right',
            },
          ],
          { zebra: i % 2 === 1 }
        );
      });
      if (items.length > 35) {
        pb.nextRow([{ text: '… y ' + (items.length - 35) + ' productos más', x: M }]);
      }
    }

    listBlock('Platos con costo al alza', data.subieron);
    listBlock('Platos con costo a la baja', data.bajaron);

    pb.checkSpace(16);
    pb.sectionTitle('Notas metodológicas');
    pb.nextRow([
      {
        text: 'Actual = costeo en tiempo real (MP unitario + recetas). Guardado = costeo vigente archivado.',
        x: M,
        maxW: CONTENT_W,
      },
    ]);
    pb.nextRow([
      {
        text: 'Δ compara contra el costo anterior registrado o, si no existe, contra el guardado.',
        x: M,
        maxW: CONTENT_W,
      },
    ]);

    pb.footer();
    return savePdfDoc(pb.doc, 'costos_resumen_' + fileStamp() + '.pdf');
  }

  function buildDetalladoPdf(data, jsPDF) {
    var pb = createPdfDoc(jsPDF);
    var meta = data.meta;

    pb.drawReportHeader(
      'Reporte detallado de costos',
      meta.empresa,
      'Materia prima · Recetas · Menú · ' + meta.fechaCorta
    );

    pb.drawKpiCards([
      { label: 'Insumos MP', value: String(data.mps.length) },
      { label: 'Recetas', value: String(data.recetas.length) },
      { label: 'Platos menú', value: String(meta.totalProductos) },
      { label: 'Margen global', value: fmtPct(meta.margenGlobal) },
    ]);

    pb.sectionTitle('1. Materia prima — costeo unitario');
    pb.drawTableHead([
      { label: 'INSUMO', x: M + 1 },
      { label: 'UND', x: M + 58 },
      { label: 'REF.', x: M + 72, align: 'right' },
      { label: 'P. LOTE', x: M + 98, align: 'right' },
      { label: '$/UND', x: M + 128, align: 'right' },
      { label: 'CATEGORÍA', x: M + 152 },
    ]);

    data.mps.forEach(function (it, i) {
      var ref =
        it.und === 'UNI' || it.und === 'UND'
          ? '1 u'
          : it.peso > 0
            ? it.peso + ' ' + it.und
            : '—';
      var unitLabel =
        it.und === 'GR' || it.und === 'ML'
          ? fmtMoneyDec(it.precioUnit, 4)
          : fmtMoney(it.precioUnit);
      pb.nextRow(
        [
          { text: it.nombre, x: M + 1, maxW: 54 },
          { text: it.und, x: M + 58 },
          { text: ref, x: M + 72, align: 'right' },
          { text: fmtMoney(it.precioTotal), x: M + 98, align: 'right' },
          { text: unitLabel, x: M + 128, align: 'right' },
          { text: it.categoria, x: M + 152, maxW: 38 },
        ],
        { zebra: i % 2 === 1, rowH: 5.5 }
      );
    });

    data.recetas.forEach(function (rec, ri) {
      pb.checkSpace(28);
      pb.sectionTitle('2.' + (ri + 1) + ' Receta — ' + pb.truncate(rec.producto, 42));
      pb.nextRow([
        { text: 'Costo referencia plato:', x: M },
        {
          text: fmtMoney(rec.costoTotal),
          x: PAGE_W - M,
          align: 'right',
          bold: true,
        },
      ]);
      pb.setY(pb.getY() + 2);
      pb.drawTableHead([
        { label: 'INGREDIENTE', x: M + 1 },
        { label: 'CANT.', x: M + 88, align: 'right' },
        { label: 'UND', x: M + 98 },
        { label: '$/U', x: M + 118, align: 'right' },
        { label: 'SUBTOTAL', x: PAGE_W - M, align: 'right' },
      ]);
      rec.lineas.forEach(function (ln, li) {
        pb.checkSpace(8);
        pb.nextRow(
          [
            { text: ln.ingrediente, x: M + 1, maxW: 82 },
            { text: String(ln.cantidad), x: M + 88, align: 'right' },
            { text: ln.unidad, x: M + 98 },
            { text: fmtMoneyDec(ln.costoUnit, 2), x: M + 118, align: 'right' },
            { text: fmtMoney(ln.subtotal), x: PAGE_W - M, align: 'right' },
          ],
          { zebra: li % 2 === 1, rowH: 5.5 }
        );
      });
      pb.setY(pb.getY() + 4);
    });

    if (!data.recetas.length) {
      pb.nextRow([{ text: 'No hay recetas definidas en el catálogo.', x: M }]);
    }

    pb.checkSpace(22);
    pb.sectionTitle('3. Menú — venta vs costo actual');
    pb.drawTopCostBars(data.productos, 6);
    pb.drawTableHead([
      { label: 'PLATO', x: M + 1 },
      { label: 'TIPO', x: M + 72 },
      { label: 'COSTO', x: M + 98, align: 'right' },
      { label: 'VENTA', x: M + 128, align: 'right' },
      { label: 'MARG%', x: PAGE_W - M, align: 'right' },
    ]);
    data.productos.forEach(function (p, i) {
      pb.nextRow(
        [
          { text: p.producto, x: M + 1, maxW: 66 },
          { text: p.tipo === 'directo' ? 'Directo' : 'Receta', x: M + 72 },
          { text: fmtMoney(p.costoActual), x: M + 98, align: 'right' },
          { text: fmtMoney(p.precioMenu), x: M + 128, align: 'right' },
          { text: fmtPct(p.margenReal), x: PAGE_W - M, align: 'right' },
        ],
        { zebra: i % 2 === 1, rowH: 5.5 }
      );
    });

    pb.footer();
    return savePdfDoc(pb.doc, 'costos_detallado_' + fileStamp() + '.pdf');
  }

  function handlePdfResult(result, okLabel) {
    if (result && result.ok) {
      toast(result.hint || okLabel, 'success');
    } else if (result && result.blockedPopup) {
      toast('Permita descargas en el navegador e intente de nuevo.', 'warning');
    } else {
      toast(
        (result && result.error && result.error.message) ||
          'No se pudo guardar el PDF — revise la consola (F12)',
        'error'
      );
    }
  }

  function runPdfBuild(buildFn, jsPDF, okLabel) {
    collectReportData(function (data, err) {
      if (!data) {
        _pdfBusy = false;
        toast(err || 'No hay datos para el reporte', 'error');
        return;
      }
      try {
        var result = buildFn(data, jsPDF);
        Promise.resolve(result)
          .then(function (r) {
            _pdfBusy = false;
            handlePdfResult(r, okLabel);
          })
          .catch(function (ex) {
            _pdfBusy = false;
            console.error('[costos-pdf] save', ex);
            toast('Error al guardar PDF: ' + (ex.message || ex), 'error');
          });
      } catch (ex) {
        _pdfBusy = false;
        console.error('[costos-pdf] build', ex);
        toast('Error al generar PDF: ' + (ex.message || ex), 'error');
      }
    });
  }

  function downloadGeneral() {
    if (_pdfBusy) {
      toast('Ya hay un PDF en proceso…', 'warning');
      return;
    }
    if (!global.CrozzoCatalogoMp) {
      toast('Abra primero Sistema de costos (catálogo no listo)', 'error');
      return;
    }
    _pdfBusy = true;
    toast('Generando PDF resumen…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        runPdfBuild(buildGeneralPdf, jsPDF, 'PDF resumen listo');
      })
      .catch(function (e) {
        _pdfBusy = false;
        console.error('[costos-pdf]', e);
        toast(e.message || 'Error cargando jsPDF', 'error');
      });
  }

  function downloadDetallado() {
    if (_pdfBusy) {
      toast('Ya hay un PDF en proceso…', 'warning');
      return;
    }
    if (!global.CrozzoCatalogoMp) {
      toast('Abra primero Sistema de costos (catálogo no listo)', 'error');
      return;
    }
    _pdfBusy = true;
    toast('Generando PDF detallado…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        runPdfBuild(buildDetalladoPdf, jsPDF, 'PDF detallado listo');
      })
      .catch(function (e) {
        _pdfBusy = false;
        console.error('[costos-pdf]', e);
        toast(e.message || 'Error cargando jsPDF', 'error');
      });
  }

  global.CrozzoCostosReportesPdf = {
    collectReportData: collectReportData,
    downloadGeneral: downloadGeneral,
    downloadDetallado: downloadDetallado,
  };
})(window);
