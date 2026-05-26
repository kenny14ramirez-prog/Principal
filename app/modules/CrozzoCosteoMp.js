/**
 * Crozzo POS — Costeo de materias primas (unidad, peso, precio total, $/ml|$/g|$/u)
 * Se actualiza desde recepción de facturas; alerta si la variación es desproporcionada.
 */
(function (global) {
  'use strict';

  var UND_OPTS = ['GR', 'MG', 'KG', 'ML', 'UNI', 'UND', 'TARRO', 'PAQ', 'CAJA', 'MT', 'ROLLO', 'PAR'];

  var ui = { q: '' };

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

  function engine() {
    return global.CrozzoCostosEngine || null;
  }

  function fmtUnit(n, und) {
    var e = engine();
    if (e && e.formatoPrecioPorUnd) return e.formatoPrecioPorUnd(n, und);
    return '$' + (Number(n) || 0).toFixed(4) + '/' + und;
  }

  function hintFormula(it) {
    var e = engine();
    if (!e || !e.hintCalculoPrecio) return '';
    return e.hintCalculoPrecio(it.precioTotal, it.peso, it.und);
  }

  function refColLabel(und) {
    var e = engine();
    if (e && e.undRefLabel) {
      var r = e.undRefLabel(und);
      if (r === 'ml') return 'Ref. (ml)';
      if (r === 'g') return 'Ref. (g)';
      if (r === 'kg') return 'Ref. (kg)';
      return 'Ref. (' + r + ')';
    }
    return 'Peso ref.';
  }

  function injectStyles() {
    if (document.getElementById('crozzo-costeo-mp-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-costeo-mp-css';
    el.textContent =
      '.crozzo-costeo-nombre{font-weight:600;color:var(--text-primary)}' +
      '.crozzo-costeo-inp{width:100%;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;font-size:.8rem;font-variant-numeric:tabular-nums}' +
      '.crozzo-costeo-inp:hover{border-color:var(--border)}' +
      '.crozzo-costeo-inp:focus{border-color:var(--accent);background:var(--bg-card);outline:none}' +
      '.crozzo-costeo-val{font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}' +
      '.crozzo-costeo-hint{display:block;font-size:10px;opacity:.65;margin-top:3px;font-weight:400;color:var(--text-secondary)}' +
      '.crozzo-costeo-badge{display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(76,175,80,.15);color:#4caf50;margin-left:6px;vertical-align:middle}';
    document.head.appendChild(el);
  }

  function buildRows() {
    var C = cat();
    return C && C.list ? C.list() : [];
  }

  function filterItems(items) {
    var q = ui.q.toLowerCase().trim();
    if (!q) return items;
    return items.filter(function (it) {
      return String(it.nombre).toLowerCase().indexOf(q) >= 0;
    });
  }

  function recepcionBadge(it) {
    if (!it.ultimaRecepcionAt) return '';
    var d = String(it.ultimaRecepcionAt).slice(0, 10);
    return '<span class="crozzo-costeo-badge" title="Actualizado por recepción ' + esc(d) + '">Recepción</span>';
  }

  function renderRows(items) {
    if (!items.length) {
      return '<tr><td colspan="5" style="text-align:center;padding:24px;opacity:.7">Sin insumos en catálogo. Créelos en Catálogo · materias primas.</td></tr>';
    }
    return items
      .map(function (it) {
        var hint = hintFormula(it);
        return (
          '<tr data-costeo-id="' +
          esc(it.id) +
          '" data-costeo-und="' +
          esc(it.und) +
          '">' +
          '<td class="crozzo-costeo-nombre" title="Editar nombre en Catálogo">' +
          esc(it.nombre) +
          recepcionBadge(it) +
          '</td>' +
          '<td><select class="crozzo-costeo-inp" data-costeo-field="und">' +
          UND_OPTS.map(function (u) {
            return '<option value="' + u + '"' + (it.und === u ? ' selected' : '') + '>' + u + '</option>';
          }).join('') +
          '</select></td>' +
          '<td style="text-align:right"><input class="crozzo-costeo-inp" data-costeo-field="peso" type="number" min="0" step="any" value="' +
          esc(it.peso) +
          '" style="text-align:right" title="' +
          esc(refColLabel(it.und)) +
          '"></td>' +
          '<td style="text-align:right"><input class="crozzo-costeo-inp" data-costeo-field="precioTotal" type="number" min="0" step="any" value="' +
          esc(it.precioTotal) +
          '" style="text-align:right"></td>' +
          '<td class="crozzo-costeo-val" data-costeo-unit-display title="' +
          esc(hint) +
          '">' +
          esc(fmtUnit(it.precioUnit, it.und)) +
          (hint ? '<span class="crozzo-costeo-hint">' + esc(hint) + '</span>' : '') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderPanel(opts) {
    opts = opts || {};
    var embedded = !!opts.embedded;
    injectStyles();
    var all = buildRows();
    var filtered = filterItems(all);
    var chrome = embedded
      ? ''
      : '<nav class="crozzo-mod-nav crozzo-mod-nav--links">' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoCotizaciones">Cotizaciones</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoRecepcion">Entrada factura</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoCatalogo">Catálogo MP</button></nav>';
    return (
      '<div class="crozzo-mod-page crozzo-costeo-root' +
      (embedded ? ' crozzo-mod-embedded' : '') +
      '">' +
      chrome +
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar">' +
      '<input type="search" id="crozzoCosteoSearch" placeholder="Buscar por nombre…" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<span class="form-hint">' +
      filtered.length +
      ' / ' +
      all.length +
      '</span></div></div>' +
      '<div class="card crozzo-mod-table-card">' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table crozzo-costeo-table"><thead><tr>' +
      '<th>Materia prima</th><th>U. medida</th><th>Ref.</th><th>Precio total lote</th><th>Precio unitario</th>' +
      '</tr></thead><tbody id="crozzoCosteoTbody">' +
      renderRows(filtered) +
      '</tbody></table></div></div></div>'
    );
  }

  function getCosteoFromRow(tr) {
    var C = cat();
    if (!C) return null;
    var id = tr.getAttribute('data-costeo-id');
    var base = C.get(id);
    if (!base) return null;
    var row = { mpId: id, und: base.und, peso: base.peso, precioTotal: base.precioTotal };
    tr.querySelectorAll('[data-costeo-field]').forEach(function (inp) {
      var f = inp.getAttribute('data-costeo-field');
      if (f === 'peso' || f === 'precioTotal') row[f] = Number(inp.value);
      else row[f] = inp.value;
    });
    return row;
  }

  function updateRowDisplay(tr, merged) {
    if (!tr || !merged) return;
    var unitCell = tr.querySelector('[data-costeo-unit-display]');
    var hint = hintFormula(merged);
    if (unitCell) {
      unitCell.innerHTML =
        esc(fmtUnit(merged.precioUnit, merged.und)) +
        (hint ? '<span class="crozzo-costeo-hint">' + esc(hint) + '</span>' : '');
      unitCell.setAttribute('title', hint);
    }
    tr.setAttribute('data-costeo-und', merged.und);
    var nombreCell = tr.querySelector('.crozzo-costeo-nombre');
    if (nombreCell && merged.ultimaRecepcionAt) {
      var badge = nombreCell.querySelector('.crozzo-costeo-badge');
      if (!badge) {
        nombreCell.insertAdjacentHTML('beforeend', recepcionBadge(merged));
      }
    }
  }

  function refreshTable(root) {
    var tbody = root.querySelector('#crozzoCosteoTbody');
    if (!tbody) return;
    var filtered = filterItems(buildRows());
    tbody.innerHTML = renderRows(filtered);
    var hint = root.querySelector('.crozzo-mod-toolbar .form-hint');
    if (hint) {
      var all = buildRows();
      hint.textContent = filtered.length + ' / ' + all.length;
    }
  }

  function init(root) {
    if (!root) return;
    var C = cat();
    if (!C) return;

    var searchTimer;
    var search = root.querySelector('#crozzoCosteoSearch');
    if (search) {
      search.addEventListener('input', function () {
        ui.q = search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          refreshTable(root);
        }, 150);
      });
    }

    if (!root._costeoBound) {
      root._costeoBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function (ev) {
        if (!root.isConnected) return;
        refreshTable(root);
        var d = ev && ev.detail;
        if (d && (d.tipo === 'recepcion-precios' || d.tipo === 'recepcion-precio')) {
          toast('Costeo actualizado desde recepción de factura', 'success');
        }
      });
    }

    root.addEventListener('click', function (e) {
      if (e.target.id === 'crozzoCosteoGoCatalogo' && typeof global.navigateTo === 'function') {
        global.navigateTo('catalogo-mp');
      }
      if (e.target.id === 'crozzoCosteoGoCotizaciones' && typeof global.navigateTo === 'function') {
        global.navigateTo('compras-cotizaciones');
      }
      if (e.target.id === 'crozzoCosteoGoRecepcion' && typeof global.navigateTo === 'function') {
        global.navigateTo('compras-recepcion');
      }
    });

    root.addEventListener(
      'change',
      function (e) {
        var inp = e.target.closest('[data-costeo-field]');
        if (!inp) return;
        var tr = inp.closest('tr[data-costeo-id]');
        if (!tr) return;
        var patch = getCosteoFromRow(tr);
        if (!patch) return;
        var merged = C.upsertCosteo(patch);
        if (!merged) {
          var prev = C.get(patch.mpId);
          if (prev) refreshTable(root);
          return;
        }
        updateRowDisplay(tr, merged);
        toast('Costeo actualizado', 'success');
      },
      true
    );
  }

  global.CrozzoCosteoMp = {
    renderPanel: renderPanel,
    init: init,
  };
})(typeof window !== 'undefined' ? window : globalThis);
