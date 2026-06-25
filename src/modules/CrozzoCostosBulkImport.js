/**
 * Crozzo POS — Importación masiva de platos y recetas vía Excel
 * Plantilla humana: Platos + Recetas + lista de insumos disponibles
 */
(function (global) {
  'use strict';

  var XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    try {
      if (typeof global.showToast === 'function') global.showToast(m, t || 'info');
    } catch (_) {}
  }

  function cat() {
    return global.CrozzoCatalogoMp;
  }

  function normKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function slugPlato(nombre) {
    var C = cat();
    if (C && C.slugFromPosProduct) {
      return C.slugFromPosProduct({ nombre: nombre });
    }
    return String(nombre || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function ensureXlsx() {
    return new Promise(function (resolve, reject) {
      if (global.XLSX && global.XLSX.utils) return resolve(global.XLSX);
      var s = document.createElement('script');
      s.src = XLSX_CDN;
      s.onload = function () {
        if (global.XLSX) resolve(global.XLSX);
        else reject(new Error('XLSX no cargó'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar la librería Excel'));
      };
      document.head.appendChild(s);
    });
  }

  function triggerDownload(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 4000);
      return true;
    } catch (_) {
      return false;
    }
  }

  function sheetColWidths(rows) {
    if (!rows || !rows.length) return null;
    var keys = Object.keys(rows[0]);
    return keys.map(function (k) {
      var max = k.length;
      rows.forEach(function (r) {
        var len = String(r[k] == null ? '' : r[k]).length;
        if (len > max) max = len;
      });
      return { wch: Math.min(Math.max(max + 2, 10), 48) };
    });
  }

  function listMpReference() {
    var C = cat();
    return C && C.list ? C.list() : [];
  }

  function findMpByName(nombre) {
    var q = normKey(nombre);
    if (!q) return null;
    var list = listMpReference();
    var exact = list.find(function (it) {
      return normKey(it.nombre) === q;
    });
    if (exact) return exact;
    return (
      list.find(function (it) {
        var n = normKey(it.nombre);
        return n.indexOf(q) >= 0 || q.indexOf(n) >= 0;
      }) || null
    );
  }

  function parseSiNo(val, defaultYes) {
    var s = String(val == null ? '' : val)
      .trim()
      .toLowerCase();
    if (!s) return defaultYes !== false;
    if (s === 'si' || s === 'sí' || s === 's' || s === '1' || s === 'true' || s === 'x') return true;
    if (s === 'no' || s === 'n' || s === '0' || s === 'false') return false;
    return defaultYes !== false;
  }

  function normalizeCategoria(raw) {
    var c = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    var map = {
      platos: 'platos-fuertes',
      'platos-fuertes': 'platos-fuertes',
      fuertes: 'platos-fuertes',
      entradas: 'entradas',
      bebidas: 'bebidas',
      postres: 'postres',
    };
    return map[c] || 'platos-fuertes';
  }

  function readSheetRows(wb, names) {
    if (!wb || !wb.SheetNames) return [];
    var target = null;
    names.some(function (n) {
      if (wb.SheetNames.indexOf(n) >= 0) {
        target = n;
        return true;
      }
      return false;
    });
    if (!target) return [];
    var ws = wb.Sheets[target];
    return global.XLSX.utils.sheet_to_json(ws, { defval: '' });
  }

  function platoExists(slug) {
    var C = cat();
    if (C && C.getMenuPlato) return !!C.getMenuPlato(slug);
    var prods = global.products;
    if (!Array.isArray(prods)) return false;
    return prods.some(function (p) {
      return slugPlato(p.nombre) === slug;
    });
  }

  function createPlatoFromRow(row, lineNum) {
    var nombre = String(row.nombre || row.plato || row.producto || '').trim();
    if (!nombre) return { ok: false, error: 'Fila ' + lineNum + ': falta nombre' };

    var slug = slugPlato(nombre);
    if (platoExists(slug)) {
      return { ok: true, slug: slug, nombre: nombre, skipped: true };
    }

    var categoria = normalizeCategoria(row.categoria || row.categoría);
    var icon = String(row.icono || row.icon || '🍽️').trim() || '🍽️';
    var precio = Math.round(Number(row.precio_venta || row.precio || 0)) || 0;
    var gramaje = Math.round(Number(row.gramos_porcion || row.gramaje || 0)) || 0;
    var ventaDirecta = !parseSiNo(row.con_receta != null ? row.con_receta : row.receta, true);
    if (row.venta_directa != null) ventaDirecta = parseSiNo(row.venta_directa, false);

    var areas = global.getComandasConfig && global.getComandasConfig().areas;
    var defaultArea = areas && areas[0] ? areas[0].id : 'COCINA';
    var areaRaw = String(row.area_comanda || row.comanda || defaultArea).trim().toUpperCase();
    var areaMatch =
      areas &&
      areas.find(function (a) {
        return String(a.id || '').toUpperCase() === areaRaw || normKey(a.nombre) === normKey(areaRaw);
      });
    var areaComanda = areaMatch ? areaMatch.id : defaultArea;

    if (typeof global.crozzoBulkCreatePlato === 'function') {
      var id = global.crozzoBulkCreatePlato({
        nombre: nombre,
        categoria: categoria,
        icon: icon,
        gramajeVenta: gramaje > 0 ? gramaje : undefined,
        tieneRecetaProceso: !ventaDirecta,
        areasComanda: [areaComanda],
        areaComanda: areaComanda,
        precio: precio,
      });
      if (!id) return { ok: false, error: 'No se pudo crear «' + nombre + '»' };
      return { ok: true, slug: slug, nombre: nombre, productId: id, created: true };
    }
    return { ok: false, error: 'Motor de catálogo no disponible' };
  }

  function applyPrecioMenu(slug, precio) {
    var p = Math.round(Number(precio) || 0);
    if (p <= 0) return;
    var C = cat();
    if (C && C.updateMenuPlato) {
      C.updateMenuPlato(slug, { precioVenta: p });
    }
  }

  function importRecetasRows(rows, report) {
    var byPlato = {};
    rows.forEach(function (row, i) {
      var plato = String(row.plato || row.nombre_plato || row.producto || '').trim();
      var ing = String(row.ingrediente || row.insumo || row.materia_prima || '').trim();
      if (!plato || !ing) {
        if (plato || ing) report.warnings.push('Receta fila ' + (i + 2) + ': complete plato e ingrediente');
        return;
      }
      var key = normKey(plato);
      if (!byPlato[key]) byPlato[key] = { nombre: plato, lineas: [] };
      var mp = findMpByName(ing);
      if (!mp) {
        report.warnings.push('«' + plato + '»: no encontré insumo «' + ing + '» — revise hoja Insumos');
        return;
      }
      var cant = Number(row.cantidad || row.cant || 0);
      if (!(cant > 0)) cant = 1;
      byPlato[key].lineas.push({
        mpId: mp.id,
        ingrediente: mp.nombre,
        unidad: String(row.unidad || row.und || mp.und || 'GR')
          .trim()
          .toUpperCase(),
        cantidad: cant,
      });
    });

    var C = cat();
    Object.keys(byPlato).forEach(function (k) {
      var pack = byPlato[k];
      if (!pack.lineas.length) return;
      var slug = slugPlato(pack.nombre);
      if (!platoExists(slug)) {
        report.warnings.push('Receta «' + pack.nombre + '»: el plato no existe — créelo en hoja Platos');
        return;
      }
      if (C && C.upsertRecetaPlato) {
        C.upsertRecetaPlato({
          slug: slug,
          producto: pack.nombre,
          lineas: pack.lineas,
          opts: { margenErrorPct: 0.03, porcentajeMpObjetivo: 0.3, impuestoPct: 0.08, porciones: 1 },
        });
        report.recetas++;
      }
    });
  }

  function listMenuRows() {
    var C = cat();
    if (C && C.buildSeedForCostos) {
      try {
        var seed = C.buildSeedForCostos();
        if (seed && Array.isArray(seed.resumen)) return seed.resumen;
      } catch (_) {}
    }
    return [];
  }

  function buildExportPlatosRows() {
    var menu = listMenuRows();
    if (!menu.length && Array.isArray(global.products)) {
      return global.products.map(function (p) {
        return {
          nombre: p.nombre,
          categoria: p.categoria || 'platos-fuertes',
          icono: p.icon || '🍽️',
          precio_venta: p.precio || 0,
          gramos_porcion: p.gramajeVenta || '',
          con_receta: p.tieneRecetaProceso !== false ? 'SI' : 'NO',
          area_comanda: (p.areasComanda && p.areasComanda[0]) || p.areaComanda || 'COCINA',
        };
      });
    }
    return menu.map(function (m) {
      var prods = global.products;
      var pos =
        Array.isArray(prods) &&
        prods.find(function (p) {
          return slugPlato(p.nombre) === m.slug;
        });
      return {
        nombre: m.producto || m.slug,
        categoria: (pos && pos.categoria) || m.categoria || 'platos-fuertes',
        icono: (pos && pos.icon) || '🍽️',
        precio_venta: m.precioVenta || 0,
        gramos_porcion: m.gramajeVenta || (pos && pos.gramajeVenta) || '',
        con_receta: m.tipoCosteo === 'directo' ? 'NO' : 'SI',
        area_comanda: (pos && pos.areasComanda && pos.areasComanda[0]) || (pos && pos.areaComanda) || 'COCINA',
      };
    });
  }

  function buildExportRecetasRows() {
    var C = cat();
    if (!C || !C.listRecetasPlatos) return [];
    var rows = [];
    C.listRecetasPlatos().forEach(function (r) {
      (r.lineas || []).forEach(function (ln) {
        rows.push({
          plato: r.producto || r.slug,
          ingrediente: ln.ingrediente || ln.mpId,
          cantidad: ln.cantidad,
          unidad: ln.unidad || ln.und || 'GR',
        });
      });
    });
    return rows;
  }

  function renderBulkBarHtml() {
    return (
      '<div class="crozzo-costos-bulk" id="crozzoCostosBulkBar">' +
      '<div class="crozzo-costos-bulk__icon" aria-hidden="true">📊</div>' +
      '<div class="crozzo-costos-bulk__copy">' +
      '<p class="crozzo-costos-bulk__title">Carga rápida con Excel</p>' +
      '<p class="crozzo-costos-bulk__sub">Descargue la plantilla, llene platos e ingredientes en el computador y súbala aquí. Ideal para menús grandes.</p>' +
      '</div>' +
      '<div class="crozzo-costos-bulk__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCostosBulkTpl" title="Plantilla vacía con ejemplos">⬇ Plantilla</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCostosBulkExport" title="Exportar platos actuales para editar">⬇ Mis platos</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCostosBulkImport">⬆ Subir Excel</button>' +
      '<input type="file" id="crozzoCostosBulkFile" accept=".xlsx,.xls" hidden>' +
      '</div></div>'
    );
  }

  function exportPlantilla(opts) {
    opts = opts || {};
    return ensureXlsx().then(function (XLSX) {
      var wb = XLSX.utils.book_new();
      var instrucciones = [
        { paso: '1', que_hacer: 'Revise la hoja Insumos — son los ingredientes que ya tiene cargados.' },
        { paso: '2', que_hacer: 'En Platos: una fila por producto de venta (nombre obligatorio).' },
        { paso: '3', que_hacer: 'En Recetas: plato + ingrediente + cantidad + unidad (GR, ML, UND…).' },
        { paso: '4', que_hacer: 'Suba el archivo en Costos → botón «Subir Excel».' },
        { paso: '5', que_hacer: 'Revise precios en la matriz y publique a caja cuando esté listo.' },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instrucciones), 'Como_usar');

      var platosEjemplo = opts.includeCurrent
        ? buildExportPlatosRows()
        : [
            {
              nombre: 'Bandeja paisa',
              categoria: 'platos-fuertes',
              icono: '🍽️',
              precio_venta: 28000,
              gramos_porcion: 650,
              con_receta: 'SI',
              area_comanda: 'COCINA',
            },
            {
              nombre: 'Gaseosa 400ml',
              categoria: 'bebidas',
              icono: '🥤',
              precio_venta: 4500,
              gramos_porcion: '',
              con_receta: 'NO',
              area_comanda: 'BAR',
            },
          ];
      if (!platosEjemplo.length) {
        platosEjemplo.push({
          nombre: 'Ejemplo: sopa del día',
          categoria: 'platos-fuertes',
          icono: '🍽️',
          precio_venta: '',
          gramos_porcion: 350,
          con_receta: 'SI',
          area_comanda: 'COCINA',
        });
      }
      var wsPlatos = XLSX.utils.json_to_sheet(platosEjemplo);
      wsPlatos['!cols'] = sheetColWidths(platosEjemplo);
      XLSX.utils.book_append_sheet(wb, wsPlatos, 'Platos');

      var recetasEjemplo = opts.includeCurrent
        ? buildExportRecetasRows()
        : [
            { plato: 'Bandeja paisa', ingrediente: 'Arroz', cantidad: 180, unidad: 'GR' },
            { plato: 'Bandeja paisa', ingrediente: 'Frijol', cantidad: 120, unidad: 'GR' },
          ];
      var wsRec = XLSX.utils.json_to_sheet(recetasEjemplo);
      wsRec['!cols'] = sheetColWidths(recetasEjemplo);
      XLSX.utils.book_append_sheet(wb, wsRec, 'Recetas');

      var insumos = listMpReference().map(function (it) {
        return {
          nombre: it.nombre,
          unidad: it.und || 'GR',
          precio_por_unidad: it.precioUnit || '',
          categoria: it.categoria || '',
        };
      });
      if (!insumos.length) {
        insumos.push({
          nombre: '(Primero cargue insumos en pestaña Costeo MP)',
          unidad: '',
          precio_por_unidad: '',
          categoria: '',
        });
      }
      var wsMp = XLSX.utils.json_to_sheet(insumos);
      wsMp['!cols'] = sheetColWidths(insumos);
      XLSX.utils.book_append_sheet(wb, wsMp, 'Insumos');

      var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      var blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      var stamp = new Date().toISOString().slice(0, 10);
      var name = opts.includeCurrent
        ? 'crozzo_platos_actuales_' + stamp + '.xlsx'
        : 'crozzo_plantilla_platos_' + stamp + '.xlsx';
      triggerDownload(blob, name);
      toast(opts.includeCurrent ? 'Platos exportados — edite y vuelva a subir' : 'Plantilla descargada', 'success');
    });
  }

  function importFromFile(file) {
    if (!file) return Promise.reject(new Error('Sin archivo'));
    return ensureXlsx().then(function (XLSX) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var buf = ev.target.result;
            var wb = XLSX.read(buf, { type: 'array' });
            var platoRows = readSheetRows(wb, ['Platos', 'platos', 'PRODUCTOS', 'Productos']);
            var recetaRows = readSheetRows(wb, ['Recetas', 'recetas', 'RECETAS']);
            var report = { created: 0, skipped: 0, recetas: 0, warnings: [], errors: [] };

            platoRows.forEach(function (row, i) {
              var nombre = String(row.nombre || row.plato || '').trim();
              if (!nombre || /^ejemplo/i.test(nombre)) return;
              var res = createPlatoFromRow(row, i + 2);
              if (!res.ok) {
                report.errors.push(res.error);
                return;
              }
              if (res.created) report.created++;
              else if (res.skipped) report.skipped++;
              var precio = row.precio_venta || row.precio;
              if (precio != null && String(precio).trim() !== '') {
                applyPrecioMenu(res.slug, precio);
              }
            });

            if (recetaRows.length) importRecetasRows(recetaRows, report);

            resolve(report);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () {
          reject(new Error('No se pudo leer el archivo'));
        };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function bindBulkBar(root, onDone) {
    if (!root) return;
    var bar = root.querySelector('#crozzoCostosBulkBar');
    if (!bar || bar._bound) return;
    bar._bound = true;

    var tpl = bar.querySelector('#crozzoCostosBulkTpl');
    if (tpl) {
      tpl.addEventListener('click', function () {
        exportPlantilla({ includeCurrent: false }).catch(function (e) {
          toast(String(e.message || e), 'error');
        });
      });
    }
    var exp = bar.querySelector('#crozzoCostosBulkExport');
    if (exp) {
      exp.addEventListener('click', function () {
        exportPlantilla({ includeCurrent: true }).catch(function (e) {
          toast(String(e.message || e), 'error');
        });
      });
    }
    var fileInp = bar.querySelector('#crozzoCostosBulkFile');
    var btnImport = bar.querySelector('#crozzoCostosBulkImport');
    if (btnImport && fileInp) {
      btnImport.addEventListener('click', function () {
        fileInp.click();
      });
      fileInp.addEventListener('change', function () {
        var f = fileInp.files && fileInp.files[0];
        fileInp.value = '';
        if (!f) return;
        btnImport.disabled = true;
        btnImport.textContent = 'Importando…';
        importFromFile(f)
          .then(function (report) {
            var msg =
              report.created +
              ' plato(s) nuevo(s)' +
              (report.skipped ? ', ' + report.skipped + ' ya existían' : '') +
              (report.recetas ? ', ' + report.recetas + ' receta(s)' : '');
            if (report.errors.length) toast(msg + ' · ' + report.errors.length + ' error(es)', 'warning');
            else toast('Importación lista: ' + msg, 'success');
            if (report.warnings.length && report.warnings.length <= 3) {
              report.warnings.forEach(function (w) {
                toast(w, 'warning');
              });
            } else if (report.warnings.length > 3) {
              toast(report.warnings.length + ' avisos — revise nombres de insumos', 'warning');
            }
            if (typeof onDone === 'function') onDone(report);
          })
          .catch(function (e) {
            toast(String(e.message || e), 'error');
          })
          .finally(function () {
            btnImport.disabled = false;
            btnImport.textContent = '⬆ Subir Excel';
          });
      });
    }
  }

  global.CrozzoCostosBulkImport = {
    renderBulkBarHtml: renderBulkBarHtml,
    bindBulkBar: bindBulkBar,
    exportPlantilla: exportPlantilla,
    importFromFile: importFromFile,
    ensureXlsx: ensureXlsx,
  };

  global.crozzoOpenCostosBulkImport = function () {
    var inp = document.getElementById('crozzoCostosBulkFile');
    if (inp) inp.click();
    else toast('Abra Costos y márgenes primero', 'info');
  };
})(window);
