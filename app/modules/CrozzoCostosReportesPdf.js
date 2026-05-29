/**
 * Crozzo POS — Reportes PDF de costos (resumen general + detalle MP/recetas).
 */
(function (global) {
  'use strict';

  var PAGE_W = 210;
  var PAGE_H = 297;
  var M = 14;

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
    return loadScriptOnce('vendor/CrozzoJsPdf.js')
      .then(function () {
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

  /** Guarda el PDF sin depender de ventanas emergentes (si bloqueó popup, use otra vía). */
  function savePdfDoc(doc, filename) {
    filename = String(filename || 'reporte.pdf');
    var err = null;
    try {
      if (doc && typeof doc.save === 'function') {
        doc.save(filename);
        return {
          ok: true,
          mode: 'save',
          hint: 'Revise la carpeta Descargas de Windows (' + filename + ')',
        };
      }
    } catch (e1) {
      err = e1;
      console.warn('[costos-pdf] doc.save', e1);
    }
    try {
      var blob = doc.output('blob');
      if (triggerDownload(blob, filename)) {
        return {
          ok: true,
          mode: 'download',
          hint: 'Descarga iniciada — carpeta Descargas (' + filename + ')',
        };
      }
      var url = URL.createObjectURL(blob);
      if (!global.__CROZZO_IS_TAURI__) {
        var w0 = window.open(url, '_blank');
        if (w0) {
          setTimeout(function () {
            try {
              URL.revokeObjectURL(url);
            } catch (_) {}
          }, 120000);
          return { ok: true, mode: 'window', hint: 'PDF abierto en nueva pestaña' };
        }
      }
      var w = window.open(url, '_blank');
      if (w) {
        setTimeout(function () {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {}
        }, 120000);
        return {
          ok: true,
          mode: 'window',
          hint: 'PDF abierto — Guardar como en el visor si lo necesita',
        };
      }
      URL.revokeObjectURL(url);
      return {
        ok: false,
        blockedPopup: true,
        error: new Error('Ventana emergente bloqueada'),
      };
    } catch (e2) {
      err = e2;
      console.error('[costos-pdf] blob', e2);
    }
    try {
      var uri = doc.output('datauristring');
      var a = document.createElement('a');
      a.href = uri;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return { ok: true, mode: 'datauri', hint: 'Descarga alternativa (' + filename + ')' };
    } catch (e3) {
      err = e3;
      console.error('[costos-pdf] datauri', e3);
    }
    return { ok: false, error: err };
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
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('Crozzo POS · Sistema de costos', M, PAGE_H - 8);
      doc.text('Pág. ' + page, PAGE_W - M, PAGE_H - 8, { align: 'right' });
    }

    function checkSpace(need, redraw) {
      if (y + need <= PAGE_H - 16) return;
      footer();
      doc.addPage();
      page++;
      y = M + 8;
      if (typeof redraw === 'function') redraw();
    }

    function drawReportHeader(title, subtitle, meta) {
      doc.setFillColor(24, 29, 39);
      doc.roundedRect(M, 10, PAGE_W - M * 2, 28, 3, 3, 'F');
      doc.setTextColor(201, 169, 98);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, M + 4, 20);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(subtitle, M + 4, 27);
      if (meta) {
        doc.setFontSize(8);
        doc.text(meta, M + 4, 33);
      }
      y = 44;
    }

    function sectionTitle(txt) {
      checkSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(24, 29, 39);
      doc.text(txt, M, y);
      y += 3;
      doc.setDrawColor(201, 169, 98);
      doc.setLineWidth(0.4);
      doc.line(M, y, PAGE_W - M, y);
      y += 6;
    }

    function drawTableHead(cols) {
      checkSpace(10);
      doc.setFillColor(237, 242, 247);
      doc.rect(M, y, PAGE_W - M * 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 40);
      cols.forEach(function (c) {
        doc.text(c.label, c.x, y + 5, { align: c.align || 'left' });
      });
      y += 9;
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
      drawTableHead: drawTableHead,
      truncate: truncate,
      footer: footer,
      nextRow: function (cells, rowH) {
        rowH = rowH || 6;
        var self = this;
        checkSpace(rowH + 2, null);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(35, 35, 35);
        cells.forEach(function (c) {
          doc.text(String(c.text), c.x, y, { align: c.align || 'left' });
        });
        y += rowH;
      },
      badge: function (text, x, color) {
        color = color || [100, 116, 139];
        doc.setFillColor(color[0], color[1], color[2]);
        doc.roundedRect(x, y - 3.8, 18, 5, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(text, x + 9, y - 0.5, { align: 'center' });
        doc.setTextColor(35, 35, 35);
        doc.setFont('helvetica', 'normal');
      },
      save: function (filename) {
        footer();
        var r = savePdfDoc(doc, filename);
        return r && r.ok;
      },
    };
  }

  function buildGeneralPdf(data, jsPDF) {
    var pb = createPdfDoc(jsPDF);
    var doc = pb.doc;
    var meta = data.meta;
    pb.drawReportHeader(
      'Reporte general de costos',
      meta.empresa,
      'Generado: ' + meta.fecha + ' · ' + meta.totalProductos + ' productos'
    );

    pb.sectionTitle('Resumen ejecutivo');
    pb.nextRow([
      { text: 'Costo MP total (actual):', x: M },
      { text: fmtMoney(meta.sumCosto), x: PAGE_W - M, align: 'right' },
    ]);
    pb.nextRow([
      { text: 'Venta menú total:', x: M },
      { text: fmtMoney(meta.sumVenta), x: PAGE_W - M, align: 'right' },
    ]);
    pb.nextRow([
      { text: 'Margen global ponderado:', x: M },
      { text: fmtPct(meta.margenGlobal), x: PAGE_W - M, align: 'right' },
    ]);
    pb.setY(pb.getY() + 2);
    pb.nextRow([
      { text: 'Productos con costo al alza:', x: M },
      { text: String(meta.subieron), x: 80 },
      { text: 'A la baja:', x: 110 },
      { text: String(meta.bajaron), x: 130 },
      { text: 'Sin cambio:', x: 150 },
      { text: String(meta.sinCambio), x: 175 },
    ]);

    var cols = [
      { label: 'PRODUCTO', x: M + 1 },
      { label: 'ACTUAL', x: 78, align: 'right' },
      { label: 'GUARDADO', x: 102, align: 'right' },
      { label: 'ANT.', x: 124, align: 'right' },
      { label: 'Δ', x: 142, align: 'right' },
      { label: 'CAJA', x: 162, align: 'right' },
      { label: 'MARG%', x: 182, align: 'right' },
      { label: '↕', x: PAGE_W - M - 2, align: 'right' },
    ];

    pb.sectionTitle('Menú de venta — actual vs guardado');
    pb.drawTableHead(cols);

    data.productos.forEach(function (p, i) {
      if (i > 0 && i % 2 === 0) {
        pb.checkSpace(7);
        doc.setFillColor(248, 250, 252);
        doc.rect(M, pb.getY() - 4.5, PAGE_W - M * 2, 6, 'F');
      }
      var arrow = p.tendencia === 'up' ? '↑' : p.tendencia === 'down' ? '↓' : '=';
      var deltaTxt =
        p.delta != null && Math.abs(p.delta) >= 1
          ? (p.delta > 0 ? '+' : '') + fmtMoney(p.delta)
          : '—';
      pb.nextRow([
        { text: pb.truncate(p.producto, 28), x: M + 1 },
        { text: fmtMoney(p.costoActual), x: 78, align: 'right' },
        { text: fmtMoney(p.costoGuardado), x: 102, align: 'right' },
        {
          text: p.costoAnterior != null ? fmtMoney(p.costoAnterior) : '—',
          x: 124,
          align: 'right',
        },
        { text: deltaTxt, x: 142, align: 'right' },
        { text: p.precioCaja != null ? fmtMoney(p.precioCaja) : '—', x: 162, align: 'right' },
        { text: fmtPct(p.margenReal), x: 182, align: 'right' },
        { text: arrow, x: PAGE_W - M - 2, align: 'right' },
      ]);
    });

    function listBlock(title, items, color) {
      if (!items.length) return;
      pb.sectionTitle(title + ' (' + items.length + ')');
      items.slice(0, 40).forEach(function (p) {
        pb.checkSpace(7);
        pb.nextRow([
          { text: pb.truncate(p.producto, 40), x: M },
          {
            text:
              fmtMoney(p.costoAnterior != null ? p.costoAnterior : p.costoGuardado) +
              ' → ' +
              fmtMoney(p.costoActual),
            x: PAGE_W - M,
            align: 'right',
          },
        ]);
      });
      if (items.length > 40) {
        pb.nextRow([{ text: '… y ' + (items.length - 40) + ' más', x: M }]);
      }
    }

    listBlock('Costos que subieron', data.subieron, [220, 38, 38]);
    listBlock('Costos que bajaron', data.bajaron, [22, 163, 74]);

    pb.sectionTitle('Notas');
    pb.nextRow([
      {
        text: 'Actual = costeo unitario o receta en tiempo real. Guardado = fila vigente archivada.',
        x: M,
      },
    ]);
    pb.nextRow([
      {
        text: 'Δ compara contra costo anterior registrado o, si no hay, contra el guardado.',
        x: M,
      },
    ]);

    pb.footer();
    return savePdfDoc(pb.doc, 'costos_resumen_' + fileStamp() + '.pdf');
  }

  function buildDetalladoPdf(data, jsPDF) {
    var pb = createPdfDoc(jsPDF);
    var doc = pb.doc;
    var meta = data.meta;

    pb.drawReportHeader(
      'Reporte detallado de costos',
      meta.empresa,
      'MP unitarias · Recetas estándar · ' + meta.fecha
    );

    pb.sectionTitle('1. Materia prima — costeo unitario');
    pb.drawTableHead([
      { label: 'INSUMO', x: M + 1 },
      { label: 'UND', x: 72 },
      { label: 'REF.', x: 88, align: 'right' },
      { label: 'P. TOTAL', x: 118, align: 'right' },
      { label: '$/UND', x: 148, align: 'right' },
      { label: 'CATEG.', x: 168 },
    ]);

    data.mps.forEach(function (it, i) {
      if (i > 0 && i % 2 === 0) {
        pb.checkSpace(7);
        doc.setFillColor(248, 250, 252);
        doc.rect(M, pb.getY() - 4.5, PAGE_W - M * 2, 6, 'F');
      }
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
      pb.nextRow([
        { text: pb.truncate(it.nombre, 32), x: M + 1 },
        { text: it.und, x: 72 },
        { text: ref, x: 88, align: 'right' },
        { text: fmtMoney(it.precioTotal), x: 118, align: 'right' },
        { text: unitLabel, x: 148, align: 'right' },
        { text: pb.truncate(it.categoria, 18), x: 168 },
      ]);
    });

    data.recetas.forEach(function (rec, ri) {
      pb.checkSpace(24);
      pb.sectionTitle('2.' + (ri + 1) + ' Receta — ' + rec.producto);
      pb.nextRow([
        { text: 'Costo referencia plato:', x: M },
        { text: fmtMoney(rec.costoTotal), x: PAGE_W - M, align: 'right' },
      ]);
      pb.setY(pb.getY() + 2);
      pb.drawTableHead([
        { label: 'INGREDIENTE', x: M + 1 },
        { label: 'CANT.', x: 100, align: 'right' },
        { label: 'UND', x: 118 },
        { label: '$/U', x: 142, align: 'right' },
        { label: 'SUBTOTAL', x: PAGE_W - M, align: 'right' },
      ]);
      rec.lineas.forEach(function (ln) {
        pb.nextRow([
          { text: pb.truncate(ln.ingrediente, 36), x: M + 1 },
          { text: String(ln.cantidad), x: 100, align: 'right' },
          { text: ln.unidad, x: 118 },
          { text: fmtMoneyDec(ln.costoUnit, 2), x: 142, align: 'right' },
          { text: fmtMoney(ln.subtotal), x: PAGE_W - M, align: 'right' },
        ]);
      });
      pb.setY(pb.getY() + 4);
    });

    if (!data.recetas.length) {
      pb.nextRow([{ text: 'No hay recetas definidas en el catálogo.', x: M }]);
    }

    pb.checkSpace(20);
    pb.sectionTitle('3. Menú — enlace venta / costo actual');
    pb.drawTableHead([
      { label: 'PLATO', x: M + 1 },
      { label: 'TIPO', x: 78 },
      { label: 'COSTO', x: 108, align: 'right' },
      { label: 'VENTA', x: 138, align: 'right' },
      { label: 'MARG%', x: 168, align: 'right' },
    ]);
    data.productos.forEach(function (p) {
      pb.nextRow([
        { text: pb.truncate(p.producto, 30), x: M + 1 },
        { text: p.tipo === 'directo' ? 'Directo' : 'Receta', x: 78 },
        { text: fmtMoney(p.costoActual), x: 108, align: 'right' },
        { text: fmtMoney(p.precioMenu), x: 138, align: 'right' },
        { text: fmtPct(p.margenReal), x: 168, align: 'right' },
      ]);
    });

    pb.footer();
    return savePdfDoc(pb.doc, 'costos_detallado_' + fileStamp() + '.pdf');
  }

  function runPdfBuild(buildFn, jsPDF, okLabel) {
    collectReportData(function (data, err) {
      if (!data) {
        toast(err || 'No hay datos para el reporte', 'error');
        return;
      }
      try {
        var result = buildFn(data, jsPDF);
        if (result && result.ok) {
          toast((result.hint || okLabel) + '', 'success');
        } else if (result && result.blockedPopup) {
          toast(
            'Bloqueó la ventana emergente — el PDF igual puede estar en Descargas. Vuelva a pulsar el botón y elija «Permitir», o abra Descargas.',
            'warning'
          );
        } else {
          toast(
            (result && result.error && result.error.message) ||
              'No se pudo guardar el PDF — revise la consola (F12)',
            'error'
          );
        }
      } catch (ex) {
        console.error('[costos-pdf] build', ex);
        toast('Error al generar PDF: ' + (ex.message || ex), 'error');
      }
    });
  }

  function downloadGeneral() {
    if (!global.CrozzoCatalogoMp) {
      toast('Abra primero Sistema de costos (catálogo no listo)', 'error');
      return;
    }
    toast('Generando PDF resumen…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        runPdfBuild(buildGeneralPdf, jsPDF, 'PDF resumen listo');
      })
      .catch(function (e) {
        console.error('[costos-pdf]', e);
        toast(e.message || 'Error cargando jsPDF', 'error');
      });
  }

  function downloadDetallado() {
    if (!global.CrozzoCatalogoMp) {
      toast('Abra primero Sistema de costos (catálogo no listo)', 'error');
      return;
    }
    toast('Generando PDF detallado…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        runPdfBuild(buildDetalladoPdf, jsPDF, 'PDF detallado listo');
      })
      .catch(function (e) {
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
