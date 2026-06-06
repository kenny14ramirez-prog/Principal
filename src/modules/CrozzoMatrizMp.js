/**
 * Crozzo POS — Catálogo de materias primas (nombre, categoría, proveedores)
 */
(function (global) {
  'use strict';

  var CATEGORIAS = [
    'PROTEINAS',
    'LACTEOS',
    'FRUVER',
    'ABARROTES',
    'PULPAS Y CONGELADOS',
    'BEBIDAS Y LICORES',
    'DESECHABLES',
    'TERCERIZADOS',
    'ASEO',
    'PROCESADOS',
    'ELABORADOS',
  ];

  var CAT_LABEL = {
    PROTEINAS: 'Proteínas',
    LACTEOS: 'Lácteos',
    FRUVER: 'Fruver',
    ABARROTES: 'Abarrotes',
    'PULPAS Y CONGELADOS': 'Pulpas y congelados',
    'BEBIDAS Y LICORES': 'Bebidas y licores',
    DESECHABLES: 'Desechables',
    TERCERIZADOS: 'Tercerizados',
    ASEO: 'Aseo',
    PROCESADOS: 'Procesados',
    ELABORADOS: 'Elaborados / prep',
    OTRO: 'Otro',
  };

  var ui = { q: '', cat: '' };

  function cat() {
    return global.CrozzoCatalogoMp;
  }

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

  function proveedoresToStr(arr) {
    return (arr || []).join(', ');
  }

  function injectStyles() {
    if (document.getElementById('crozzo-matriz-mp-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-matriz-mp-css';
    el.textContent =
      '.crozzo-mp-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px}' +
      '.crozzo-mp-search{flex:1;min-width:200px;max-width:420px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:14px}' +
      '.crozzo-mp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
      '.crozzo-mp-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:11px;font-weight:600;cursor:pointer;transition:all .2s}' +
      '.crozzo-mp-chip:hover{border-color:var(--accent)}' +
      '.crozzo-mp-chip.is-active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-mp-table{width:100%;border-collapse:collapse;font-size:.8rem}' +
      '.crozzo-mp-table th{position:sticky;top:0;background:var(--bg-secondary);z-index:1;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;padding:10px 8px;border-bottom:2px solid var(--border)}' +
      '.crozzo-mp-table td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.crozzo-mp-table tr:hover td{background:rgba(var(--accent-rgb,201,169,98),.06)}' +
      '.crozzo-mp-cat{display:inline-block;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(var(--accent-rgb,201,169,98),.12);color:var(--accent);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.crozzo-mp-inp{width:100%;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;font-size:.8rem}' +
      '.crozzo-mp-inp:hover{border-color:var(--border)}' +
      '.crozzo-mp-inp:focus{border-color:var(--accent);background:var(--bg-card);outline:none}' +
      '.crozzo-mp-scroll{max-height:min(58vh,520px);overflow:auto;border:1px solid var(--border);border-radius:12px}' +
      '.crozzo-mp-meta{font-size:.78rem;opacity:.75;margin:0 0 12px}' +
      '.crozzo-mp-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;padding:14px;border:1px dashed var(--border);border-radius:12px;margin-bottom:14px;background:rgba(var(--accent-rgb,201,169,98),.04)}' +
      '.crozzo-mp-form label{font-size:10px;font-weight:600;text-transform:uppercase;opacity:.7;display:block;margin-bottom:4px}' +
      '.crozzo-mp-form input,.crozzo-mp-form select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:inherit;font-size:13px}' +
      '.crozzo-mp-proceso-sel{min-width:148px;font-size:11px;padding:5px 6px}' +
      '.crozzo-mp-proc-empty{color:var(--text-muted);font-size:11px;text-align:center}' +
      '.crozzo-mp-merma-cell{min-width:118px}' +
      '.crozzo-mp-merma-pair{display:flex;flex-direction:column;gap:4px;font-size:10px}' +
      '.crozzo-mp-merma-pair label{display:flex;align-items:center;gap:4px;color:var(--text-muted);white-space:nowrap}' +
      '.crozzo-mp-merma-pair input{width:52px;padding:3px 5px;font-size:11px;text-align:right}';
    document.head.appendChild(el);
  }

  function buildCatalog() {
    var C = cat();
    return C && C.listCatalog ? C.listCatalog() : C && C.list ? C.list() : [];
  }

  function filterItems(items) {
    var matchFn = global.CrozzoCostosSearch && global.CrozzoCostosSearch.match;
    var q = ui.q.trim();
    return items.filter(function (it) {
      if (ui.cat && it.categoria !== ui.cat) return false;
      if (!q) return true;
      var prov = proveedoresToStr(it.proveedores);
      var blob = [it.nombre, it.categoria, it.id, it.und, prov, CAT_LABEL[it.categoria] || ''].join(' ');
      return matchFn ? matchFn(blob, q) : String(it.nombre).toLowerCase().indexOf(q.toLowerCase()) >= 0;
    });
  }

  function renderProcesoCell(it) {
    var C = cat();
    if (!C) return '<td class="crozzo-mp-proc-empty">—</td>';
    var slug = C.resolveMenuSlugForMp ? C.resolveMenuSlugForMp(it.id) : null;
    var isElab = it.esElaborado || String(it.categoria || '').toUpperCase() === 'ELABORADOS';
    if (!slug && !isElab) {
      return '<td class="crozzo-mp-proc-empty" title="En Costos defina receta/plato o marque como ELABORADOS">—</td>';
    }
    var val = (C.getProcesoVentaForMp && C.getProcesoVentaForMp(it.id)) || 'prep_anticipado';
    return (
      '<td><select class="crozzo-mp-inp crozzo-mp-proceso-sel" data-mp-field="procesoVenta" data-mp-menu-slug="' +
      esc(slug || '') +
      '" title="Prep antes = bodega ELABORADOS · Al vender = plato al momento">' +
      '<option value="prep_anticipado"' +
      (val === 'prep_anticipado' ? ' selected' : '') +
      '>Prep antes (bodega)</option>' +
      '<option value="bajo_demanda"' +
      (val === 'bajo_demanda' ? ' selected' : '') +
      '>Al vender (plato)</option>' +
      '</select></td>'
    );
  }

  function renderMermaCell(it) {
    var mc = it.mermaCoccionPct != null && it.mermaCoccionPct !== '' ? num(it.mermaCoccionPct) : '';
    var md = it.mermaDespostePct != null && it.mermaDespostePct !== '' ? num(it.mermaDespostePct) : '';
    return (
      '<td class="crozzo-mp-merma-cell"><div class="crozzo-mp-merma-pair">' +
      '<label title="Merma esperada al cocinar">Coc %' +
      '<input class="crozzo-mp-inp" type="number" min="0" max="95" step="0.1" data-mp-field="mermaCoccionPct" value="' +
      esc(mc) +
      '"></label>' +
      '<label title="Merma esperada al despostar/desgrado">Desp %' +
      '<input class="crozzo-mp-inp" type="number" min="0" max="95" step="0.1" data-mp-field="mermaDespostePct" value="' +
      esc(md) +
      '"></label></div></td>'
    );
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function renderRows(items) {
    var C = cat();
    if (!items.length) {
      return '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.7">Sin insumos. Use + Materia prima.</td></tr>';
    }
    return items
      .map(function (it) {
        var catOpts =
          C && C.renderCategoriaMpOptionsHtml
            ? C.renderCategoriaMpOptionsHtml(it.categoria)
            : CATEGORIAS.map(function (c) {
                return (
                  '<option value="' +
                  esc(c) +
                  '"' +
                  (it.categoria === c ? ' selected' : '') +
                  '>' +
                  esc(CAT_LABEL[c] || c) +
                  '</option>'
                );
              }).join('');
        return (
          '<tr data-mp-id="' +
          esc(it.id) +
          '">' +
          '<td><select class="crozzo-mp-inp crozzo-mp-cat-sel" data-mp-field="categoria" title="Clasifique bien: define en qué pantalla de cocina aparece">' +
          catOpts +
          '</select></td>' +
          '<td><input class="crozzo-mp-inp" data-mp-field="nombre" value="' +
          esc(it.nombre) +
          '"></td>' +
          renderProcesoCell(it) +
          renderMermaCell(it) +
          '<td><input class="crozzo-mp-inp" data-mp-field="proveedores" value="' +
          esc(proveedoresToStr(it.proveedores)) +
          '" placeholder="Proveedor A, Proveedor B" title="Separar con comas"></td>' +
          '<td><button type="button" class="btn btn-outline btn-sm crozzo-mp-del" data-mp-id="' +
          esc(it.id) +
          '" title="Eliminar">×</button></td></tr>'
        );
      })
      .join('');
  }

  function renderPanel(opts) {
    opts = opts || {};
    var embedded = !!opts.embedded;
    injectStyles();
    var all = buildCatalog();
    var filtered = filterItems(all);
    var chips =
      '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
      (ui.cat === '' ? ' is-active' : '') +
      '" data-mp-cat="">Todas (' +
      all.length +
      ')</button>' +
      CATEGORIAS.map(function (c) {
        var n = all.filter(function (x) {
          return x.categoria === c;
        }).length;
        if (!n) return '';
        return (
          '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
          (ui.cat === c ? ' is-active' : '') +
          '" data-mp-cat="' +
          esc(c) +
          '">' +
          esc(CAT_LABEL[c] || c) +
          ' (' +
          n +
          ')</button>'
        );
      }).join('');

    var chrome = embedded
      ? ''
      : '<nav class="crozzo-mod-nav crozzo-mod-nav--links">' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoMpGoCostos">Costeo MP</button>' +
        '<button type="button" class="btn btn-primary btn-sm" id="crozzoMpToggleNew">+ Materia prima</button></nav>';
    var newBtn = embedded
      ? '<button type="button" class="btn btn-primary btn-sm" id="crozzoMpToggleNew">+ Materia prima</button>'
      : '';
    return (
      '<div class="crozzo-mod-page crozzo-mp-root' +
      (embedded ? ' crozzo-mod-embedded' : '') +
      '">' +
      chrome +
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar">' +
      '<input type="search" id="crozzoMpSearch" placeholder="Buscar MP, categoría, proveedor… (ej. lacteos queso)" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<span class="form-hint">' +
      filtered.length +
      ' / ' +
      all.length +
      '</span>' +
      newBtn +
      '</div></div>' +
      '<div class="crozzo-mod-chip-row crozzo-mp-chips">' +
      chips +
      '</div>' +
      '<p class="crozzo-mp-meta">Clasifique cada insumo: <strong>Proteínas</strong> = partir carnes · <strong>Bebidas</strong> = no va a prep cocina · <strong>Fruver / Abarrotes</strong> = cocinar y porcionar.</p>' +
      '<div class="crozzo-mod-form-grid crozzo-mp-form" id="crozzoMpNewForm" style="display:none;margin-bottom:14px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(var(--accent-rgb,201,169,98),.04)">' +
      '<div><label>Nombre</label><input id="crozzoMpNewNombre" placeholder="Ej. Aceite vegetal"></div>' +
      '<div><label>Categoría</label><select id="crozzoMpNewCat">' +
      (cat() && cat().renderCategoriaMpOptionsHtml
        ? cat().renderCategoriaMpOptionsHtml('OTRO')
        : CATEGORIAS.map(function (c) {
            return '<option value="' + esc(c) + '">' + esc(CAT_LABEL[c] || c) + '</option>';
          }).join('') + '<option value="OTRO">Otro</option>') +
      '</select></div>' +
      '<div style="grid-column:1/-1"><label>Proveedor(es)</label><input id="crozzoMpNewProv" placeholder="Distribuidora Norte, Mayorista Sol"></div>' +
      '<div><label>Merma cocinado %</label><input id="crozzoMpNewMc" type="number" min="0" max="95" step="0.1" placeholder="Ej. 28"></div>' +
      '<div><label>Merma desposte %</label><input id="crozzoMpNewMd" type="number" min="0" max="95" step="0.1" placeholder="Ej. 12"></div>' +
      '<div style="display:flex;align-items:flex-end;gap:8px;grid-column:1/-1">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoMpSaveNew">Guardar</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoMpCancelNew">Cancelar</button></div></div>' +
      '<div class="crozzo-mp-scroll"><table class="crozzo-mp-table"><thead><tr>' +
      '<th>Categoría</th><th>Materia prima</th><th>Proceso / venta</th><th>Mermas esp.</th><th>Proveedor(es)</th><th></th>' +
      '</tr></thead><tbody id="crozzoMpTbody">' +
      renderRows(filtered) +
      '</tbody></table></div></div>'
    );
  }

  function getItemFromRow(tr) {
    var C = cat();
    if (!C) return null;
    var id = tr.getAttribute('data-mp-id');
    var base = C.get(id);
    if (!base) return null;
    var row = {
      id: id,
      nombre: base.nombre,
      categoria: base.categoria,
      proveedores: (base.proveedores || []).slice(),
    };
    tr.querySelectorAll('[data-mp-field]').forEach(function (inp) {
      var f = inp.getAttribute('data-mp-field');
      if (f === 'proveedores') row.proveedores = C.parseProveedores ? C.parseProveedores(inp.value) : inp.value.split(',');
      else if (f === 'procesoVenta') row.procesoVenta = inp.value;
      else if (f === 'mermaCoccionPct' || f === 'mermaDespostePct') row[f] = inp.value === '' ? null : num(inp.value);
      else row[f] = inp.value;
    });
    return row;
  }

  function refreshTable(root) {
    var tbody = root.querySelector('#crozzoMpTbody');
    if (!tbody) return;
    var filtered = filterItems(buildCatalog());
    tbody.innerHTML = renderRows(filtered);
    var hint = root.querySelector('.crozzo-mod-toolbar .form-hint');
    if (hint) {
      var all = buildCatalog();
      hint.textContent = filtered.length + ' / ' + all.length;
    }
  }

  function init(root) {
    if (!root) return;
    var C = cat();
    if (!C) return;

    var searchTimer;
    var search = root.querySelector('#crozzoMpSearch');
    if (search) {
      search.addEventListener('input', function () {
        ui.q = search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          refreshTable(root);
        }, 150);
      });
    }

    if (!root._mpBound) {
      root._mpBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function () {
        if (root.isConnected) refreshTable(root);
      });
    }

    root.addEventListener('click', function (e) {
      if (e.target.id === 'crozzoMpGoCostos' && typeof global.navigateTo === 'function') {
        global.navigateTo('costos-matriz');
        setTimeout(function () {
          var tab = document.querySelector('[data-matriz-tab="costeo-mp"]');
          if (tab) tab.click();
        }, 200);
        return;
      }
      var chip = e.target.closest('[data-mp-cat]');
      if (chip) {
        ui.cat = chip.getAttribute('data-mp-cat') || '';
        root.querySelectorAll('.crozzo-mp-chip, .crozzo-mod-chip').forEach(function (btn) {
          btn.classList.toggle('is-active', btn === chip);
        });
        refreshTable(root);
        return;
      }
      if (e.target.id === 'crozzoMpToggleNew') {
        var f = root.querySelector('#crozzoMpNewForm');
        if (f) f.style.display = f.style.display === 'none' ? 'grid' : 'none';
      }
      if (e.target.id === 'crozzoMpCancelNew') {
        var form = root.querySelector('#crozzoMpNewForm');
        if (form) form.style.display = 'none';
      }
      if (e.target.id === 'crozzoMpSaveNew') {
        var nombre = (root.querySelector('#crozzoMpNewNombre') || {}).value || '';
        nombre = nombre.trim();
        if (!nombre) {
          toast('Escriba el nombre', 'warning');
          return;
        }
        var provRaw = (root.querySelector('#crozzoMpNewProv') || {}).value || '';
        var item = {
          id: C.slugId(nombre),
          nombre: nombre,
          categoria: (root.querySelector('#crozzoMpNewCat') || {}).value || 'OTRO',
          proveedores: C.parseProveedores ? C.parseProveedores(provRaw) : provRaw.split(','),
          mermaCoccionPct: num((root.querySelector('#crozzoMpNewMc') || {}).value),
          mermaDespostePct: num((root.querySelector('#crozzoMpNewMd') || {}).value),
        };
        C.upsertCatalog(item);
        toast('«' + item.nombre + '» creada. Defina peso y precio en Costeo.', 'success');
        refreshTable(root);
        var nf = root.querySelector('#crozzoMpNewForm');
        if (nf) nf.style.display = 'none';
      }
      var del = e.target.closest('.crozzo-mp-del');
      if (del && C.remove(del.getAttribute('data-mp-id'))) {
        refreshTable(root);
        toast('Eliminada del catálogo', 'success');
      }
    });

    root.addEventListener(
      'change',
      function (e) {
        var inp = e.target.closest('[data-mp-field]');
        if (!inp) return;
        var tr = inp.closest('tr[data-mp-id]');
        if (!tr) return;
        var item = getItemFromRow(tr);
        if (!item) return;
        if (inp.getAttribute('data-mp-field') === 'procesoVenta') {
          var slug =
            inp.getAttribute('data-mp-menu-slug') ||
            (C.resolveMenuSlugForMp ? C.resolveMenuSlugForMp(item.id) : '');
          if (C.applyProcesoVentaFromMp) {
            C.applyProcesoVentaFromMp(slug, item.procesoVenta, { mpId: item.id });
          } else {
            C.upsertCatalog({ id: item.id, procesoVenta: item.procesoVenta }, { skipInvMov: true, skipIdCheck: true });
          }
          toast(
            item.procesoVenta === 'bajo_demanda'
              ? 'Proceso al vender — se prepara al pedido'
              : 'Prep antes de vender — queda en bodega ELABORADOS',
            'success'
          );
          return;
        }
        if (inp.getAttribute('data-mp-field') === 'nombre') {
          var prev = C.get(item.id);
          if (prev && prev.nombre !== item.nombre) {
            var dupe = C.getByNombre(item.nombre);
            if (dupe && dupe.id !== item.id) {
              toast('Ya existe otra materia prima con ese nombre', 'error');
              refreshTable(root);
              return;
            }
          }
        }
        C.upsertCatalog(item);
        toast('Catálogo actualizado (nombre sincronizado con Costeo y recetas)', 'success');
      },
      true
    );
  }

  global.CrozzoMatrizMp = {
    buildCatalog: buildCatalog,
    renderPanel: renderPanel,
    init: init,
    CATEGORIAS: CATEGORIAS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
