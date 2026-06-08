/**
 * Crozzo POS — Mapa de flujos (PDF para socios / inversores)
 * Qué módulo actualiza qué, cadena MP → costos → caja → inventario → planilla.
 */
(function (global) {
  'use strict';

  var PAGE_W = 210;
  var PAGE_H = 297;
  var M = 14;

  var DARK = [14, 16, 26];
  var GOLD = [212, 184, 74];
  var GREEN = [16, 185, 129];
  var BLUE = [59, 130, 246];
  var VIOLET = [139, 92, 246];
  var ROSE = [244, 63, 94];
  var MUTED = [120, 128, 148];

  var CADENA_MACRO = [
    {
      id: 'mp',
      label: 'Materia prima',
      sub: 'Compras · recepción · catálogo MP',
      tone: BLUE,
    },
    {
      id: 'costo-mp',
      label: 'Costos MP',
      sub: 'Unitario $/g · $/ml · $/und',
      tone: GOLD,
    },
    {
      id: 'costeo',
      label: 'Costeo plato',
      sub: 'Venta directa o explosión receta',
      tone: GREEN,
    },
    {
      id: 'precios',
      label: 'Precios de venta',
      sub: 'Matriz · márgenes · comparativa caja',
      tone: GOLD,
    },
    {
      id: 'pos',
      label: 'Ventas caja',
      sub: 'POS · tablets · comandas · cocina',
      tone: ROSE,
    },
  ];

  var CADENA_OPERATIVA = [
    {
      id: 'recetas',
      label: 'Recetas estándar',
      sub: 'Sub-recetas · insumos · mermas J4',
      tone: VIOLET,
    },
    {
      id: 'recetario',
      label: 'Recetario cocina',
      sub: 'Vista operativa sin costos',
      tone: VIOLET,
    },
    {
      id: 'procesos',
      label: 'Procesos',
      sub: 'Cocción · cortes · mermas reales',
      tone: ROSE,
    },
    {
      id: 'inv',
      label: 'Inventario lógico',
      sub: 'Entradas − salidas · conteo',
      tone: BLUE,
    },
  ];

  var GOBERNANZA = [
    {
      paso: '1',
      titulo: 'Recepción MP',
      detalle: 'Sube costo unitario y fila vigente de costeo. No cambia caja salvo opción explícita.',
    },
    {
      paso: '2',
      titulo: 'Revisión (Super Admin)',
      detalle: 'Línea base + checklist: márgenes, Δ caja→costeo, programaciones pendientes.',
    },
    {
      paso: '3',
      titulo: 'Precios vigentes',
      detalle: 'Borrador editable: probar precios, filtrar pérdidas, programar fecha POS.',
    },
    {
      paso: '4',
      titulo: 'Lanzar / programar',
      detalle: 'Plato borrador → caja/mesero/cocina. Precio programado aplica en fecha.',
    },
    {
      paso: '5',
      titulo: 'Costeos guardados',
      detalle: 'Vigente (actual) en vivo · archivo mensual al cerrar revisión.',
    },
  ];

  var INVERSOR_BULLETS = [
    'Una sola fuente de verdad: compras alimentan costos; recetas alimentan el costo del plato; la matriz decide precios; la caja refleja solo lo lanzado o programado.',
    'Inventario lógico en paralelo: recepciones entran, ventas y procesos salen — auditable sin mezclar con precio de venta.',
    'Cola a planilla: ventas, compras pagadas e inventario cerrado proponen asientos — el contador elige qué ingresa.',
    'Operación offline-first con sync a nube (Supabase) cuando el negocio lo requiere.',
    'Roles y perfiles: cocina ve recetario; gerencia ve márgenes; Super Admin gobierna revisiones de precios.',
  ];

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
      throw new Error('jsPDF no está disponible');
    });
  }

  function toast(msg, type) {
    try {
      if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    } catch (_) {}
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

  function empresaNombre() {
    try {
      if (global.config && typeof global.config.getEmpresa === 'function') {
        var emp = global.config.getEmpresa();
        if (emp && emp.nombre) return String(emp.nombre).trim();
      }
    } catch (_) {}
    return 'Crozzo POS';
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
      console.error('[flujos-pdf]', e);
      return false;
    }
  }

  function savePdfDoc(doc, filename) {
    filename = String(filename || 'mapa-flujos.pdf');
    try {
      if (doc && typeof doc.save === 'function') {
        doc.save(filename);
        return { ok: true, hint: 'Revise Descargas (' + filename + ')' };
      }
    } catch (e1) {
      console.warn('[flujos-pdf] doc.save', e1);
    }
    try {
      var blob = doc.output('blob');
      if (triggerDownload(blob, filename)) {
        return { ok: true, hint: 'Descarga iniciada (' + filename + ')' };
      }
    } catch (e2) {
      console.error('[flujos-pdf] blob', e2);
    }
    return { ok: false };
  }

  function getFlows() {
    var SC = global.CrozzoSistemaCostos;
    return (SC && SC.FLOWS) || {};
  }

  function getConnections() {
    var SC = global.CrozzoSistemaCostos;
    return (SC && SC.CONNECTIONS) || [];
  }

  function flowLabel(id) {
    if (id === 'POS') return 'POS · caja · mesero · cocina';
    if (id === 'proveedores') return 'Proveedores · catálogo MP';
    var f = getFlows()[id];
    if (f) return f.id + ' · ' + f.title;
    return String(id || '—');
  }

  function PdfBuilder(jsPDF) {
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var page = 1;
    var y = M;
    var contentW = PAGE_W - M * 2;

    function footer() {
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(empresaNombre() + ' · Crozzo POS', M, PAGE_H - 8);
      doc.text('Pág. ' + page, PAGE_W - M, PAGE_H - 8, { align: 'right' });
    }

    function newPage() {
      footer();
      doc.addPage();
      page++;
      y = M;
    }

    function ensureSpace(h) {
      if (y + h > PAGE_H - 18) {
        newPage();
      }
    }

    function sectionTitle(title, sub) {
      ensureSpace(16);
      doc.setFillColor.apply(doc, DARK);
      doc.roundedRect(M, y, contentW, sub ? 16 : 12, 2, 2, 'F');
      doc.setTextColor.apply(doc, GOLD);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(title || ''), M + 4, y + 7);
      if (sub) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(200, 200, 210);
        doc.text(String(sub), M + 4, y + 12);
      }
      y += sub ? 20 : 16;
    }

    function drawBox(x, bx, by, bw, bh, item) {
      doc.setDrawColor.apply(doc, item.tone || GOLD);
      doc.setLineWidth(0.4);
      doc.setFillColor(item.tone[0], item.tone[1], item.tone[2], 0.12);
      doc.roundedRect(bx, by, bw, bh, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, DARK);
      var lines = doc.splitTextToSize(String(item.label || ''), bw - 4);
      doc.text(lines.slice(0, 2), bx + 2, by + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor.apply(doc, MUTED);
      var subLines = doc.splitTextToSize(String(item.sub || ''), bw - 4);
      doc.text(subLines.slice(0, 2), bx + 2, by + bh - 4);
    }

    function drawArrowH(x1, x2, ay) {
      doc.setDrawColor.apply(doc, MUTED);
      doc.setLineWidth(0.35);
      doc.line(x1, ay, x2 - 2, ay);
      doc.line(x2 - 2, ay, x2 - 4, ay - 1.2);
      doc.line(x2 - 2, ay, x2 - 4, ay + 1.2);
    }

    function drawArrowV(ax, y1, y2) {
      doc.setDrawColor.apply(doc, MUTED);
      doc.setLineWidth(0.35);
      doc.line(ax, y1, ax, y2 - 2);
      doc.line(ax, y2 - 2, ax - 1.2, y2 - 4);
      doc.line(ax, y2 - 2, ax + 1.2, y2 - 4);
    }

    function pageCover() {
      doc.setFillColor.apply(doc, DARK);
      doc.rect(0, 0, PAGE_W, 72, 'F');
      doc.setTextColor.apply(doc, GOLD);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('Mapa de flujos', M, 32);
      doc.setFontSize(13);
      doc.text('Sistema operativo Crozzo POS', M, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(220, 220, 228);
      doc.text(empresaNombre(), M, 54);
      doc.text(
        'Generado ' +
          new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }),
        M,
        62
      );
      y = 84;
      doc.setTextColor.apply(doc, DARK);
      doc.setFontSize(10);
      var intro =
        'Documento orientado a socios e inversores: muestra cómo se conectan compras, costos, ' +
        'recetas, punto de venta, inventario y planilla. Cada flecha indica qué dato actualiza qué módulo.';
      var introLines = doc.splitTextToSize(intro, contentW);
      doc.text(introLines, M, y);
      y += introLines.length * 5 + 8;
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2], 0.15);
      doc.roundedRect(M, y, contentW, 28, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, DARK);
      doc.text('Contenido del mapa', M + 4, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, MUTED);
      doc.text('1. Cadena macro MP → caja', M + 4, y + 14);
      doc.text('2. Rama recetas · procesos · inventario', M + 4, y + 19);
      doc.text('3. Módulos F1–F6 y tabla «qué actualiza qué»', M + 4, y + 24);
      doc.text('4. Gobernanza de precios y resumen ejecutivo', M + 110, y + 14);
      y += 36;
    }

    function pageMacroDiagram() {
      newPage();
      sectionTitle('Cadena de valor · precios', 'Flujo principal desde materia prima hasta caja');
      var bw = 34;
      var bh = 18;
      var gap = 4;
      var rowY = y;
      var x = M;
      CADENA_MACRO.forEach(function (item, i) {
        drawBox(i, x, rowY, bw, bh, item);
        if (i < CADENA_MACRO.length - 1) drawArrowH(x + bw, x + bw + gap, rowY + bh / 2);
        x += bw + gap + 6;
      });
      y = rowY + bh + 10;
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(
        'Recepción de facturas actualiza «Costos MP». Recetas recalculan «Costeo plato». Matriz propone precio; caja solo cambia al lanzar o programar.',
        M,
        y
      );
      y += 10;

      sectionTitle('Rama operativa · cocina e inventario', 'Recetas alimentan costo y operación en paralelo');
      rowY = y;
      x = M;
      var bw2 = 42;
      CADENA_OPERATIVA.forEach(function (item, i) {
        drawBox(i, x, rowY, bw2, bh, item);
        if (i < CADENA_OPERATIVA.length - 1) drawArrowH(x + bw2, x + bw2 + gap, rowY + bh / 2);
        x += bw2 + gap + 4;
      });
      y = rowY + bh + 6;
      doc.setDrawColor.apply(doc, VIOLET);
      doc.setLineWidth(0.3);
      doc.line(M + 20, rowY - 4, M + 95, rowY - 4);
      doc.line(M + 95, rowY - 4, M + 95, rowY - 6);
      doc.setFontSize(7);
      doc.setTextColor(VIOLET[0], VIOLET[1], VIOLET[2]);
      doc.text('Recetas → recalculan costo en matriz (precios de venta)', M + 22, rowY - 7);
      y += 8;
      drawArrowV(M + 52, y, y + 8);
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, MUTED);
      doc.text('F4 recepción → F3 inventario · POS venta → salida inventario · F2 proceso → transformación', M, y + 14);
      y += 22;
    }

    function pageFlowsGrid() {
      newPage();
      sectionTitle('Módulos conectados F1 – F6', 'Cada bloque es un flujo vivo en el sistema');
      var flows = getFlows();
      var keys = Object.keys(flows);
      var colW = (contentW - 8) / 2;
      var boxH = 32;
      var startY = y;
      keys.forEach(function (k, i) {
        var f = flows[k];
        if (!f) return;
        var col = i % 2;
        var row = Math.floor(i / 2);
        var bx = M + col * (colW + 8);
        var by = startY + row * (boxH + 6);
        doc.setDrawColor.apply(doc, GREEN);
        doc.setFillColor(GREEN[0], GREEN[1], GREEN[2], 0.1);
        doc.roundedRect(bx, by, colW, boxH, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor.apply(doc, DARK);
        doc.text(String(f.icon || '◈') + '  ' + f.id + ' · ' + f.title, bx + 3, by + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, MUTED);
        var sub = doc.splitTextToSize(String(f.subtitle || ''), colW - 6);
        doc.text(sub.slice(0, 2), bx + 3, by + 13);
        doc.setFontSize(7);
        doc.text('Estado: ' + String(f.status || 'conectado'), bx + 3, by + 22);
        if (f.targets && f.targets.length) {
          doc.text('→ ' + f.targets.join(', '), bx + 3, by + 27);
        }
      });
      y = startY + Math.ceil(keys.length / 2) * (boxH + 6) + 4;
    }

    function pageConnectionsTable() {
      newPage();
      sectionTitle('Qué actualiza qué', 'Eventos reales entre módulos');
      var conns = getConnections();
      var col = [M, M + 28, M + 58, M + 118];
      doc.setFillColor(DARK[0], DARK[1], DARK[2], 0.92);
      doc.rect(M, y, contentW, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor.apply(doc, GOLD);
      doc.text('Origen', col[0] + 1, y + 5.5);
      doc.text('Destino', col[1] + 1, y + 5.5);
      doc.text('Qué pasa', col[2] + 1, y + 5.5);
      y += 10;
      conns.forEach(function (c, idx) {
        ensureSpace(12);
        if (idx % 2 === 0) {
          doc.setFillColor(245, 246, 248);
          doc.rect(M, y - 1, contentW, 10, 'F');
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, DARK);
        doc.text(flowLabel(c.from).slice(0, 22), col[0] + 1, y + 4);
        doc.text(flowLabel(c.to).slice(0, 22), col[1] + 1, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, MUTED);
        var lbl = doc.splitTextToSize(String(c.label || ''), contentW - 62);
        doc.text(lbl.slice(0, 2), col[2] + 1, y + 4);
        y += 10;
      });
      y += 6;
      sectionTitle('Eventos adicionales', 'Revisiones y borradores');
      var extra = [
        {
          from: 'Super Admin',
          to: 'Matriz F1',
          label: 'Iniciar revisión → línea base + checklist mensual',
        },
        {
          from: 'Receta guardada',
          to: 'Matriz F1',
          label: 'crozzo-costos:receta-actualizada → recostea platos',
        },
        {
          from: 'Alta plato costos',
          to: 'Borrador',
          label: 'visibleEnPos false hasta lanzar o programar',
        },
      ];
      extra.forEach(function (c, idx) {
        ensureSpace(10);
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, DARK);
        doc.text(c.from + ' → ' + c.to, M, y + 4);
        doc.setTextColor.apply(doc, MUTED);
        doc.text(c.label, M + 4, y + 8);
        y += 12;
      });
    }

    function pageGobernanza() {
      newPage();
      sectionTitle('Gobernanza de precios', 'Separación borrador · vigente · histórico');
      GOBERNANZA.forEach(function (g) {
        ensureSpace(18);
        doc.setFillColor(GOLD[0], GOLD[1], GOLD[2], 0.12);
        doc.circle(M + 4, y + 4, 3.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, DARK);
        doc.text(g.paso, M + 2.6, y + 5.2);
        doc.text(g.titulo, M + 12, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, MUTED);
        var lines = doc.splitTextToSize(g.detalle, contentW - 14);
        doc.text(lines, M + 12, y + 10);
        y += 10 + lines.length * 4;
      });
      y += 6;
      sectionTitle('Resumen para inversores', 'Propuesta de valor operativa');
      INVERSOR_BULLETS.forEach(function (b) {
        ensureSpace(14);
        doc.setFillColor(GREEN[0], GREEN[1], GREEN[2], 0.2);
        doc.circle(M + 2, y + 2, 1.2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, DARK);
        var lines = doc.splitTextToSize(b, contentW - 8);
        doc.text(lines, M + 6, y + 3);
        y += lines.length * 4.2 + 4;
      });
    }

    this.build = function () {
      pageCover();
      pageMacroDiagram();
      pageFlowsGrid();
      pageConnectionsTable();
      pageGobernanza();
      footer();
      return doc;
    };
  }

  function downloadMapaFlujos() {
    toast('Generando mapa de flujos…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        var pb = new PdfBuilder(jsPDF);
        var doc = pb.build();
        var result = savePdfDoc(doc, 'crozzo_mapa_flujos_' + fileStamp() + '.pdf');
        if (result.ok) toast(result.hint || 'Mapa de flujos descargado', 'success');
        else toast('No se pudo guardar el PDF — revise la consola (F12)', 'error');
      })
      .catch(function (e) {
        console.error('[flujos-pdf]', e);
        toast(e.message || 'Error cargando jsPDF', 'error');
      });
  }

  global.CrozzoFlujosMapaPdf = {
    downloadMapaFlujos: downloadMapaFlujos,
    CADENA_MACRO: CADENA_MACRO,
    CADENA_OPERATIVA: CADENA_OPERATIVA,
  };
})(window);
