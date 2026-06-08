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
      '.crozzo-mp-merma-pair input{width:52px;padding:3px 5px;font-size:11px;text-align:right}' +
      '.crozzo-mp-cat-field{display:flex;flex-direction:column;gap:6px}' +
      '.crozzo-mp-cat-new{display:none;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.crozzo-mp-cat-new.is-open{display:flex}' +
      '.crozzo-mp-cat-new input{flex:1;min-width:140px}';
    document.head.appendChild(el);
  }

  function chipLabel(c, C) {
    if (C && C.categoriaMpLabel) return C.categoriaMpLabel(c);
    return CAT_LABEL[c] || c;
  }

  function buildChipsHtml(all) {
    var C = cat();
    var counts = {};
    all.forEach(function (x) {
      var c = x.categoria || 'OTRO';
      counts[c] = (counts[c] || 0) + 1;
    });
    var order = C && C.listCategoriasMpAll ? C.listCategoriasMpAll() : CATEGORIAS.concat(['OTRO']);
    var chips =
      '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
      (ui.cat === '' ? ' is-active' : '') +
      '" data-mp-cat="">Todas (' +
      all.length +
      ')</button>';
    order.forEach(function (c) {
      var n = counts[c] || 0;
      if (!n) return;
      chips +=
        '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
        (ui.cat === c ? ' is-active' : '') +
        '" data-mp-cat="' +
        esc(c) +
        '">' +
        esc(chipLabel(c, C)) +
        ' (' +
        n +
        ')</button>';
    });
    Object.keys(counts).forEach(function (c) {
      if (order.indexOf(c) >= 0 || !counts[c]) return;
      chips +=
        '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
        (ui.cat === c ? ' is-active' : '') +
        '" data-mp-cat="' +
        esc(c) +
        '">' +
        esc(chipLabel(c, C)) +
        ' (' +
        counts[c] +
        ')</button>';
    });
    return chips;
  }

  function refreshCategoryChips(root) {
    var row = root.querySelector('.crozzo-mp-chips');
    if (!row) return;
    row.innerHTML = buildChipsHtml(buildCatalog());
  }

  function resolveNewFormCategoria(root, C) {
    var sel = root.querySelector('#crozzoMpNewCat');
    var catVal = (sel && sel.value) || 'OTRO';
    if (catVal !== '__NEW_MP_CAT__') return catVal;
    var customName = ((root.querySelector('#crozzoMpNewCatName') || {}).value || '').trim();
    if (!customName) return null;
    if (!C.addCategoriaMp) return customName.toUpperCase();
    var cr = C.addCategoriaMp(customName);
    if (!cr.ok) {
      toast(cr.msg || 'No se pudo crear la categoría', 'warning');
      return null;
    }
    if (sel) {
      sel.innerHTML = C.renderCategoriaMpOptionsHtml
        ? C.renderCategoriaMpOptionsHtml(cr.key)
        : sel.innerHTML;
      sel.value = cr.key;
    }
    var wrap = root.querySelector('#crozzoMpNewCatCustom');
    if (wrap) wrap.classList.remove('is-open');
    var nameInp = root.querySelector('#crozzoMpNewCatName');
    if (nameInp) nameInp.value = '';
    refreshCategoryChips(root);
    if (!cr.existed) toast('Categoría «' + cr.label + '» creada', 'success');
    return cr.key;
  }

  function renderCategorySelectHtml(selected, allowNew) {
    var C = cat();
    if (C && C.renderCategoriaMpOptionsHtml) {
      return C.renderCategoriaMpOptionsHtml(selected, { allowNew: allowNew !== false });
    }
    return CATEGORIAS.map(function (c) {
      return (
        '<option value="' +
        esc(c) +
        '"' +
        (selected === c ? ' selected' : '') +
        '>' +
        esc(CAT_LABEL[c] || c) +
        '</option>'
      );
    }).join('');
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
      '" title="Preparación anticipada = bodega ELABORADOS · Al vender = plato al momento">' +
      '<option value="prep_anticipado"' +
      (val === 'prep_anticipado' ? ' selected' : '') +
      '>Preparación anticipada (bodega)</option>' +
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
        var catOpts = renderCategorySelectHtml(it.categoria, false);
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
    var chips = buildChipsHtml(all);

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
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar crozzo-costos-search-row">' +
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
      renderNewMpFormHtml({ prefix: 'crozzoMp', includeCosteo: false, open: false }) +
      '<div class="crozzo-mod-chip-row crozzo-mp-chips">' +
      chips +
      '</div>' +
      '<p class="crozzo-mp-meta">Clasifique cada insumo: <strong>Proteínas</strong> = partir carnes · <strong>Bebidas</strong> = no va a prep cocina · <strong>Fruver / Abarrotes</strong> = cocinar y porcionar.</p>' +
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
    refreshCategoryChips(root);
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
        if (root.isConnected) {
          refreshTable(root);
          refreshCategoryChips(root);
        }
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
              : 'Preparación anticipada — queda en bodega ELABORADOS',
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

    bindNewMpForm(root, {
      prefix: 'crozzoMp',
      onSaved: function () {
        refreshTable(root);
        refreshCategoryChips(root);
      },
    });
  }

  var MP_UND_OPTS = ['GR', 'MG', 'KG', 'ML', 'UNI', 'UND', 'TARRO', 'PAQ', 'CAJA', 'MT', 'ROLLO', 'PAR'];

  function mpFormIds(prefix) {
    prefix = prefix || 'crozzoMp';
    return {
      form: prefix + 'NewForm',
      toggle: prefix + 'ToggleNew',
      nombre: prefix + 'NewNombre',
      cat: prefix + 'NewCat',
      catSearch: prefix + 'CatSearch',
      catGrid: prefix + 'CatGrid',
      catCustom: prefix + 'NewCatCustom',
      catName: prefix + 'NewCatName',
      addCat: prefix + 'AddCat',
      prov: prefix + 'NewProvExtra',
      provSearch: prefix + 'ProvSearch',
      provGrid: prefix + 'ProvGrid',
      mc: prefix + 'NewMc',
      md: prefix + 'NewMd',
      und: prefix + 'NewUnd',
      peso: prefix + 'NewPeso',
      precio: prefix + 'NewPrecioTotal',
      save: prefix + 'SaveNew',
      cancel: prefix + 'CancelNew',
    };
  }

  function toggleMpCreateForm(formEl, open) {
    if (!formEl) return;
    if (open === true) formEl.classList.add('is-open');
    else if (open === false) formEl.classList.remove('is-open');
    else formEl.classList.toggle('is-open');
  }
  global.crozzoToggleMpCreateForm = toggleMpCreateForm;

  function renderNewMpFormHtml(opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'crozzoMp';
    var I = mpFormIds(prefix);
    var includeCosteo = !!opts.includeCosteo;
    var title = opts.title || 'Nueva materia prima';
    var hint =
      opts.hint ||
      (includeCosteo
        ? 'Queda en catálogo y costeo. El precio unitario se calcula al guardar (lote ÷ peso).'
        : 'Queda en catálogo. Defina peso y precio en la pestaña Costeo MP.');
    var undOpts = MP_UND_OPTS.map(function (u) {
      return '<option value="' + u + '"' + (u === 'GR' ? ' selected' : '') + '>' + u + '</option>';
    }).join('');
    var costeoSection = includeCosteo
      ? '<section class="crozzo-mp-create__section">' +
        '<div class="crozzo-mp-create__section-head">' +
        '<span class="crozzo-mp-create__section-icon" aria-hidden="true">⚖</span>' +
        '<h4 class="crozzo-mp-create__section-title">Costeo inicial</h4></div>' +
        '<div class="crozzo-mp-create__grid">' +
        '<div class="crozzo-mp-create__field">' +
        '<label class="crozzo-mp-create__label" for="' +
        I.und +
        '">Unidad de compra</label>' +
        '<select id="' +
        I.und +
        '" class="form-select">' +
        undOpts +
        '</select></div>' +
        '<div class="crozzo-mp-create__field">' +
        '<label class="crozzo-mp-create__label" for="' +
        I.peso +
        '">Peso / referencia</label>' +
        '<input id="' +
        I.peso +
        '" class="form-input" type="number" min="0" step="any" placeholder="Ej. 1000">' +
        '<span class="crozzo-mp-create__hint">Gramos, ml o unidades del lote comprado.</span></div>' +
        '<div class="crozzo-mp-create__field">' +
        '<label class="crozzo-mp-create__label" for="' +
        I.precio +
        '">Precio total del lote</label>' +
        '<input id="' +
        I.precio +
        '" class="form-input" type="number" min="0" step="any" placeholder="Ej. 45000">' +
        '<span class="crozzo-mp-create__hint">Lo pagado por ese peso o empaque.</span></div></div></section>'
      : '';
    return (
      '<article class="crozzo-mp-create" id="' +
      I.form +
      '" aria-label="' +
      esc(title) +
      '">' +
      '<header class="crozzo-mp-create__head">' +
      '<p class="crozzo-mp-create__eyebrow">Alta de insumo</p>' +
      '<h3 class="crozzo-mp-create__title">' +
      esc(title) +
      '</h3>' +
      '<p class="crozzo-mp-create__sub">' +
      esc(hint) +
      '</p></header>' +
      '<div class="crozzo-mp-create__body">' +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">◈</span>' +
      '<h4 class="crozzo-mp-create__section-title">Identificación</h4></div>' +
      '<div class="crozzo-mp-create__grid">' +
      '<div class="crozzo-mp-create__field crozzo-mp-create__field--span">' +
      '<label class="crozzo-mp-create__label" for="' +
      I.nombre +
      '">Nombre del insumo</label>' +
      '<input id="' +
      I.nombre +
      '" class="form-input" placeholder="Ej. Aceite vegetal, Pechuga de pollo…" autocomplete="off"></div>' +
      '<div class="crozzo-mp-create__field crozzo-mp-create__field--span">' +
      '<span class="crozzo-mp-create__label">Categoría</span>' +
      (typeof global.renderMpCategoriaPickerHtml === 'function'
        ? global.renderMpCategoriaPickerHtml(prefix, 'OTRO')
        : '<div class="crozzo-mp-create__cat-box"><select id="' +
          I.cat +
          '" class="form-select">' +
          renderCategorySelectHtml('OTRO', true) +
          '</select><div class="crozzo-mp-create__cat-new" id="' +
          I.catCustom +
          '"><input id="' +
          I.catName +
          '" class="form-input" placeholder="Nombre nueva categoría (ej. Especias)">' +
          '<button type="button" class="btn btn-outline btn-sm" id="' +
          I.addCat +
          '">Crear categoría</button></div></div>') +
      '<span class="crozzo-mp-create__hint">Define en qué pantalla de cocina aparece el insumo. Puede crear categorías nuevas.</span></div></div></section>' +
      costeoSection +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">🏭</span>' +
      '<h4 class="crozzo-mp-create__section-title">Abastecimiento</h4></div>' +
      '<div class="crozzo-mp-create__field crozzo-mp-create__field--span">' +
      '<span class="crozzo-mp-create__label">Proveedor(es)</span>' +
      (typeof global.renderMpProveedorPickerHtml === 'function'
        ? global.renderMpProveedorPickerHtml(prefix)
        : '<input id="' +
          I.prov +
          '" class="form-input" placeholder="Distribuidora Norte, Mayorista Sol…">') +
      '<span class="crozzo-mp-create__hint">Seleccione del directorio, dé de alta uno nuevo o abra el módulo de proveedores.</span></div></section>' +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">%</span>' +
      '<h4 class="crozzo-mp-create__section-title">Mermas esperadas</h4></div>' +
      '<div class="crozzo-mp-create__merma-grid">' +
      '<div class="crozzo-mp-create__field">' +
      '<label class="crozzo-mp-create__label" for="' +
      I.mc +
      '">Merma cocinado</label>' +
      '<input id="' +
      I.mc +
      '" class="form-input" type="number" min="0" max="95" step="0.1" placeholder="Ej. 28">' +
      '<span class="crozzo-mp-create__hint">% pérdida al cocinar.</span></div>' +
      '<div class="crozzo-mp-create__field">' +
      '<label class="crozzo-mp-create__label" for="' +
      I.md +
      '">Merma desposte</label>' +
      '<input id="' +
      I.md +
      '" class="form-input" type="number" min="0" max="95" step="0.1" placeholder="Ej. 12">' +
      '<span class="crozzo-mp-create__hint">% pérdida al limpiar o partir.</span></div></div></section></div>' +
      '<footer class="crozzo-mp-create__foot">' +
      '<button type="button" class="btn btn-outline btn-sm" id="' +
      I.cancel +
      '">Cancelar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="' +
      I.save +
      '">Guardar materia prima</button></footer></article>'
    );
  }

  function resolveNewFormCategoriaPrefixed(root, C, prefix) {
    var I = mpFormIds(prefix);
    var sel = root.querySelector('#' + I.cat);
    var catVal = (sel && sel.value) || 'OTRO';
    if (catVal !== '__NEW_MP_CAT__') return catVal;
    var customName = ((root.querySelector('#' + I.catName) || {}).value || '').trim();
    if (!customName) return null;
    if (!C.addCategoriaMp) return customName.toUpperCase();
    var cr = C.addCategoriaMp(customName);
    if (!cr.ok) {
      toast(cr.msg || 'No se pudo crear la categoría', 'warning');
      return null;
    }
    if (sel) {
      sel.innerHTML = C.renderCategoriaMpOptionsHtml ? C.renderCategoriaMpOptionsHtml(cr.key) : sel.innerHTML;
      sel.value = cr.key;
    }
    var wrap = root.querySelector('#' + I.catCustom);
    if (wrap) wrap.classList.remove('is-open');
    var nameInp = root.querySelector('#' + I.catName);
    if (nameInp) nameInp.value = '';
    if (!cr.existed) toast('Categoría «' + cr.label + '» creada', 'success');
    return cr.key;
  }

  function saveNewMpFromForm(root, C, opts) {
    opts = opts || {};
    var I = mpFormIds(opts.prefix);
    var nombre = ((root.querySelector('#' + I.nombre) || {}).value || '').trim();
    if (!nombre) {
      toast('Escriba el nombre', 'warning');
      return null;
    }
    var categoria =
      typeof global.crozzoReadMpCategoriaFromPicker === 'function'
        ? global.crozzoReadMpCategoriaFromPicker(root, opts.prefix)
        : resolveNewFormCategoriaPrefixed(root, C, opts.prefix);
    if (!categoria) {
      toast('Elija categoría o escriba el nombre de una nueva', 'warning');
      return null;
    }
    var provList =
      typeof global.crozzoReadMpProveedoresFromPicker === 'function'
        ? global.crozzoReadMpProveedoresFromPicker(root, opts.prefix)
        : [];
    var item = {
      id: C.slugId(nombre),
      nombre: nombre,
      categoria: categoria,
      proveedores: C.parseProveedores ? C.parseProveedores(provList) : provList,
      mermaCoccionPct: num((root.querySelector('#' + I.mc) || {}).value),
      mermaDespostePct: num((root.querySelector('#' + I.md) || {}).value),
    };
    C.upsertCatalog(item);
    if (opts.includeCosteo && C.upsertCosteo) {
      var undEl = root.querySelector('#' + I.und);
      var pesoEl = root.querySelector('#' + I.peso);
      var precioEl = root.querySelector('#' + I.precio);
      C.upsertCosteo({
        mpId: item.id,
        und: (undEl && undEl.value) || 'GR',
        peso: num(pesoEl && pesoEl.value, 1000),
        precioTotal: num(precioEl && precioEl.value, 0),
      });
    }
    toast(
      '«' +
        item.nombre +
        '» creada' +
        (opts.includeCosteo ? ' con costeo inicial' : '. Defina peso y precio en Costeo MP') +
        '.',
      'success'
    );
    var nf = root.querySelector('#' + I.form);
    toggleMpCreateForm(nf, false);
    if (root.querySelector('#' + I.nombre)) root.querySelector('#' + I.nombre).value = '';
    root.querySelectorAll('.' + opts.prefix + 'ProvPick').forEach(function (el) {
      el.checked = false;
    });
    if (root.querySelector('#' + I.prov)) root.querySelector('#' + I.prov).value = '';
    if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
      global.crozzoMpRefreshProvPickerGrid(opts.prefix, root, '');
    }
    if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
      global.crozzoMpRefreshCatPickerGrid(opts.prefix, root, '', 'OTRO');
    }
    if (opts.onSaved) opts.onSaved(item);
    return item;
  }

  function bindNewMpForm(root, opts) {
    if (!root) return;
    opts = opts || {};
    var prefix = opts.prefix || 'crozzoMp';
    var bindKey = '_mpNewFormBound_' + prefix;
    if (root[bindKey]) return;
    root[bindKey] = true;
    var C = cat();
    if (!C) return;
    var I = mpFormIds(prefix);
    root.addEventListener('click', function (e) {
      if (e.target.id === I.toggle) {
        var f = root.querySelector('#' + I.form);
        toggleMpCreateForm(f);
        if (f && f.classList.contains('is-open')) {
          if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
            global.crozzoMpRefreshProvPickerGrid(prefix, root, '');
          }
          if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
            global.crozzoMpRefreshCatPickerGrid(prefix, root, '', 'OTRO');
          }
        }
        return;
      }
      if (e.target.id === I.addCat) {
        var catName = ((root.querySelector('#' + I.catName) || {}).value || '').trim();
        if (!catName) {
          toast('Escriba el nombre de la categoría', 'warning');
          return;
        }
        if (!C.addCategoriaMp) {
          toast('No disponible', 'error');
          return;
        }
        var catRes = C.addCategoriaMp(catName);
        if (!catRes.ok) {
          toast(catRes.msg || 'No se pudo crear', 'warning');
          return;
        }
        var catSel = root.querySelector('#' + I.cat);
        if (catSel) {
          catSel.innerHTML = C.renderCategoriaMpOptionsHtml ? C.renderCategoriaMpOptionsHtml(catRes.key) : catSel.innerHTML;
          catSel.value = catRes.key;
        }
        var catWrap = root.querySelector('#' + I.catCustom);
        if (catWrap) catWrap.classList.remove('is-open');
        var catInp = root.querySelector('#' + I.catName);
        if (catInp) catInp.value = '';
        toast(catRes.existed ? 'La categoría ya existía' : 'Categoría «' + catRes.label + '» creada', 'success');
        return;
      }
      if (e.target.id === I.cancel) {
        var form = root.querySelector('#' + I.form);
        toggleMpCreateForm(form, false);
        return;
      }
      if (e.target.id === I.save) {
        saveNewMpFromForm(root, C, opts);
      }
    });
    root.addEventListener('change', function (e) {
      if (e.target.classList && e.target.classList.contains(prefix + 'CatPick')) {
        var hidden = root.querySelector('#' + I.cat);
        if (hidden) hidden.value = e.target.value;
        return;
      }
      if (e.target.id === I.cat) {
        var customWrap = root.querySelector('#' + I.catCustom);
        if (customWrap) customWrap.classList.toggle('is-open', e.target.value === '__NEW_MP_CAT__');
      }
    });
    if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
      global.crozzoMpRefreshProvPickerGrid(prefix, root, '');
    }
    if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
      global.crozzoMpRefreshCatPickerGrid(prefix, root, '', 'OTRO');
    }
  }

  function openNewMpForm(root, prefix) {
    if (!root) return;
    var I = mpFormIds(prefix || 'crozzoMp');
    var f = root.querySelector('#' + I.form);
    toggleMpCreateForm(f, true);
    if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
      global.crozzoMpRefreshProvPickerGrid(prefix || 'crozzoMp', root, '');
    }
    if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
      global.crozzoMpRefreshCatPickerGrid(prefix || 'crozzoMp', root, '', 'OTRO');
    }
  }

  global.CrozzoMatrizMp = {
    buildCatalog: buildCatalog,
    renderPanel: renderPanel,
    renderNewMpFormHtml: renderNewMpFormHtml,
    bindNewMpForm: bindNewMpForm,
    openNewMpForm: openNewMpForm,
    init: init,
    CATEGORIAS: CATEGORIAS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
