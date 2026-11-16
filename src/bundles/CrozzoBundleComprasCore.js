/* Crozzo bundle: CrozzoBundleComprasCore.js — generado, no editar */

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
    if (typeof escHtml === 'function') return escHtml(s);
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
      ' · <strong>Reservorio unificado</strong> (memoria interna). Al activar nube: ejecute los scripts en <code>docs/</code> del proyecto (Supabase SQL Editor).</p></div>' +
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

  var ofUi = {
    tab: 'todas',
    q: '',
    estado: '',
    provId: '',
    desde: '',
    hasta: '',
    preset: '',
    formOpen: false,
    filtersOpen: false,
    soloPdf: false,
    expandedId: null,
    expandedAdjIdx: 0,
    expandedTab: 'oficina',
    activeProvDocKey: 'rut',
    _blobUrls: [],
  };

  function injectOficinaStyles() {
    var el = document.getElementById('crozzo-oficina-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-oficina-css';
      document.head.appendChild(el);
    }
    el.textContent =
      '.crozzo-oficina-app{display:flex;flex-direction:column;gap:14px;max-width:1280px;margin:0 auto}' +
      '.crozzo-oficina-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;background:linear-gradient(135deg,rgba(var(--accent-rgb,59,130,246),.08),var(--bg-card));border:1px solid var(--border);border-radius:var(--radius-lg)}' +
      '.crozzo-oficina-hero h2{margin:0 0 4px;font-size:1.25rem;font-weight:700;letter-spacing:-.02em}' +
      '.crozzo-oficina-hero p{margin:0;font-size:.84rem;color:var(--text-muted);max-width:520px;line-height:1.45}' +
      '.crozzo-oficina-hero__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.crozzo-oficina-filter{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px}' +
      '.crozzo-oficina-filter__title{font-size:.68rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);font-weight:600;margin:0 0 10px}' +
      '.crozzo-oficina-filter__grid{display:grid;grid-template-columns:minmax(220px,1.1fr) minmax(160px,.8fr) minmax(140px,.7fr) minmax(180px,1fr);gap:12px;align-items:end}' +
      '.crozzo-oficina-filter__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}' +
      '.crozzo-oficina-filter__summary{flex:1;font-size:.78rem;color:var(--text-muted)}' +
      '.crozzo-oficina-presets{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.crozzo-oficina-preset{font-size:.72rem;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--bg-primary);cursor:pointer;color:var(--text-secondary)}' +
      '.crozzo-oficina-preset.is-active{border-color:var(--accent);color:var(--accent);background:rgba(var(--accent-rgb,59,130,246),.1)}' +
      '.crozzo-oficina-tabs{display:flex;flex-wrap:wrap;gap:6px}' +
      '.crozzo-oficina-tab{padding:8px 14px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-card);font-size:.82rem;font-weight:600;cursor:pointer;color:var(--text-secondary)}' +
      '.crozzo-oficina-tab.is-active{border-color:var(--accent);background:rgba(var(--accent-rgb,59,130,246),.1);color:var(--accent)}' +
      '.crozzo-oficina-tab__count{font-size:.7rem;opacity:.75;margin-left:4px}' +
      '.crozzo-oficina-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}' +
      '.crozzo-oficina-table-wrap{border:1px solid var(--border);border-radius:var(--radius-lg);overflow:visible;background:var(--bg-card);margin-bottom:12px}' +
      '.crozzo-oficina-table{width:100%;border-collapse:collapse;font-size:.84rem}' +
      '.crozzo-oficina-table thead{position:sticky;top:0;z-index:1;background:var(--bg-secondary)}' +
      '.crozzo-oficina-table th{padding:10px 12px;text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);border-bottom:1px solid var(--border)}' +
      '.crozzo-oficina-table td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.crozzo-oficina-table tr:hover td{background:var(--bg-tertiary)}' +
      '.crozzo-oficina-table tr.is-pending td:first-child{box-shadow:inset 3px 0 0 var(--warning)}' +
      '.crozzo-oficina-table .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}' +
      '.crozzo-oficina-metodo{display:inline-flex;align-items:center;gap:5px;font-size:.78rem}' +
      '.crozzo-oficina-row-actions{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}' +
      '.crozzo-oficina-empty{padding:40px 20px;text-align:center;color:var(--text-muted);font-size:.88rem}' +
      '.crozzo-oficina-form-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border:1px dashed var(--border);border-radius:var(--radius-lg);background:var(--bg-card);cursor:pointer;font-weight:600;font-size:.88rem}' +
      '.crozzo-oficina-form-panel{margin-top:10px;padding:16px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-card)}' +
      '.crozzo-oficina-ref{font-size:.72rem;color:var(--text-muted)}' +
      '.crozzo-oficina-table tr.crozzo-oficina-data-row.is-expanded td{background:rgba(var(--accent-rgb,59,130,246),.06)}' +
      '.crozzo-oficina-doc-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid rgba(var(--accent-rgb,59,130,246),.35);background:rgba(var(--accent-rgb,59,130,246),.08);color:var(--accent);font-size:.76rem;font-weight:600;cursor:pointer;transition:all .15s}' +
      '.crozzo-oficina-doc-btn:hover,.crozzo-oficina-doc-btn.is-active{background:rgba(var(--accent-rgb,59,130,246),.18);border-color:var(--accent);box-shadow:0 2px 10px rgba(var(--accent-rgb,59,130,246),.15)}' +
      '.crozzo-oficina-doc-btn__icon{font-size:.95rem;line-height:1}' +
      '.crozzo-oficina-doc-none{font-size:.72rem;color:var(--text-muted);opacity:.65}' +
      '.crozzo-oficina-doc-cell{display:flex;flex-wrap:wrap;gap:4px;align-items:center}' +
      '.crozzo-oficina-comp{margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)}' +
      '.crozzo-oficina-comp__has{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}' +
      '.crozzo-oficina-comp__badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid rgba(var(--success-rgb,34,197,94),.35);background:rgba(var(--success-rgb,34,197,94),.08);font-size:.78rem;font-weight:600;color:var(--text-primary)}' +
      '.crozzo-oficina-comp__actions{display:flex;flex-wrap:wrap;gap:6px}' +
      '.crozzo-oficina-comp-panel{padding:14px}' +
      '.crozzo-oficina-pdf-row td{padding:0!important;border-bottom:1px solid var(--border)}' +
      '.crozzo-oficina-pdf-panel{border-top:2px solid rgba(var(--accent-rgb,59,130,246),.25);background:linear-gradient(180deg,rgba(var(--accent-rgb,59,130,246),.04),var(--bg-card))}' +
      '.crozzo-oficina-pdf-panel__head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg-secondary)}' +
      '.crozzo-oficina-pdf-panel__head span{font-size:.8rem;font-weight:600;color:var(--text-primary)}' +
      '.crozzo-oficina-pdf-panel__tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.crozzo-oficina-pdf-doc-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-right:6px}' +
      '.crozzo-oficina-pdf-doc-tab{padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--bg-primary);font-size:.72rem;cursor:pointer;color:var(--text-secondary)}' +
      '.crozzo-oficina-pdf-doc-tab.is-active{border-color:var(--accent);color:var(--accent);background:rgba(var(--accent-rgb,59,130,246),.1)}' +
      '.crozzo-oficina-pdf-panel__body{position:relative;min-height:420px;background:var(--bg-secondary)}' +
      '.crozzo-oficina-pdf-panel__body.has-preview{background:var(--bg-card)}' +
      '.crozzo-oficina-pdf-iframe{width:100%;height:min(520px,58vh);border:none;display:none;background:var(--bg-card)}' +
      '.crozzo-oficina-pdf-canvas{display:none;max-width:100%;height:auto;margin:0 auto;padding:8px;box-sizing:border-box;background:var(--bg-card)}' +
      '.crozzo-oficina-pdf-img{display:none;max-width:100%;max-height:min(520px,58vh);margin:0 auto;padding:12px;box-sizing:border-box;object-fit:contain;background:var(--bg-card)}' +
      '.crozzo-oficina-pdf-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.88rem;color:var(--text-secondary);background:var(--bg-secondary);z-index:2}' +
      '.crozzo-oficina-chip-solo{margin-left:6px}' +
      '.crozzo-oficina-filter-banner{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px;margin-bottom:10px;border:1px solid rgba(var(--warning-rgb,234,179,8),.35);border-radius:var(--radius-lg);background:rgba(var(--warning-rgb,234,179,8),.08);font-size:.82rem;color:var(--text-secondary)}' +
      '.crozzo-oficina-filter-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;margin-bottom:10px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-card);cursor:pointer;font-size:.84rem;font-weight:600}' +
      '.crozzo-oficina-filter-panel{margin-bottom:12px}' +
      'body.crozzo-page-oficina #mainContent.main-body--centro-compras{overflow:auto!important;height:auto!important;min-height:calc(100vh - 56px)}' +
      'body.crozzo-page-oficina .crozzo-hub-compras{height:auto!important;min-height:calc(100vh - 56px)}' +
      'body.crozzo-page-oficina .crozzo-hub-compras__body{flex:none;min-height:0}' +
      'body.crozzo-page-oficina .crozzo-hub-local{position:relative!important;inset:auto!important;overflow:visible!important;height:auto!important;min-height:100%}' +
      'body.crozzo-page-oficina .crozzo-oficina-app{padding-bottom:28px}' +
      '.crozzo-oficina-detail-tabs{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg-secondary)}' +
      '.crozzo-oficina-detail-tab{padding:6px 14px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:.78rem;font-weight:600;cursor:pointer;color:var(--text-secondary)}' +
      '.crozzo-oficina-detail-tab.is-active{border-color:var(--accent);color:var(--accent);background:rgba(var(--accent-rgb,59,130,246),.1)}' +
      '.crozzo-oficina-review{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,1.1fr);gap:14px;padding:14px}' +
      '.crozzo-oficina-review__col{display:flex;flex-direction:column;gap:10px}' +
      '.crozzo-oficina-reco{display:flex;gap:10px;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-primary);font-size:.8rem;line-height:1.45}' +
      '.crozzo-oficina-reco--ok{border-color:rgba(var(--success-rgb,34,197,94),.35);background:rgba(var(--success-rgb,34,197,94),.06)}' +
      '.crozzo-oficina-reco--warn{border-color:rgba(var(--warning-rgb,234,179,8),.35);background:rgba(var(--warning-rgb,234,179,8),.08)}' +
      '.crozzo-oficina-reco--danger{border-color:rgba(var(--danger-rgb,239,68,68),.35);background:rgba(var(--danger-rgb,239,68,68),.06)}' +
      '.crozzo-oficina-reco__icon{flex-shrink:0;font-size:1rem;line-height:1.2}' +
      '.crozzo-oficina-reco__title{font-weight:700;margin:0 0 2px;font-size:.78rem}' +
      '.crozzo-oficina-calc{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:.82rem;padding:12px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-card)}' +
      '.crozzo-oficina-calc strong{text-align:right;font-variant-numeric:tabular-nums}' +
      '.crozzo-oficina-calc__neto{grid-column:1/-1;padding-top:8px;margin-top:4px;border-top:1px dashed var(--border);font-weight:700}' +
      '.crozzo-oficina-edit{border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px;background:var(--bg-card)}' +
      '.crozzo-oficina-edit__title{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;margin:0 0 10px}' +
      '.crozzo-oficina-prov-card{padding:12px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-card)}' +
      '.crozzo-oficina-prov-card h4{margin:0 0 4px;font-size:.92rem}' +
      '.crozzo-oficina-prov-card p{margin:0;font-size:.78rem;color:var(--text-muted)}' +
      '.crozzo-oficina-prov-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
      '.crozzo-rut-mini{position:relative;margin-top:10px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-secondary);min-height:100px;max-height:160px}' +
      '.crozzo-rut-mini.has-preview{background:var(--bg-card)}' +
      '.crozzo-rut-mini--empty{min-height:auto;padding:10px;background:var(--bg-secondary)}' +
      '.crozzo-rut-mini__load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.72rem;color:var(--text-secondary)}' +
      '.crozzo-rut-mini__iframe,.crozzo-rut-mini__img,.crozzo-rut-mini__canvas{width:100%;height:130px;border:none;object-fit:contain;display:block;background:var(--bg-card)}' +
      '.crozzo-rut-mini__canvas{height:auto;max-height:140px;padding:4px;box-sizing:border-box}' +
      '.crozzo-rut-mini__expand{position:absolute;right:6px;bottom:6px;z-index:2;background:rgba(0,0,0,.55)!important;color:#fff!important;font-size:.68rem;padding:2px 8px}' +
      '.crozzo-of-prov-doc-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}' +
      '.crozzo-of-prov-doc-badge{font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:999px;border:1px solid var(--border);letter-spacing:.02em}' +
      '.crozzo-of-prov-doc-badge.is-ok{background:rgba(var(--success-rgb,34,197,94),.12);border-color:rgba(var(--success-rgb,34,197,94),.35);color:var(--success)}' +
      '.crozzo-of-prov-doc-badge.is-miss{background:rgba(var(--warning-rgb,234,179,8),.08);border-color:rgba(var(--warning-rgb,234,179,8),.3);color:var(--text-muted);opacity:.85}' +
      '.crozzo-of-docs-panel{margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)}' +
      '.crozzo-of-docs-summary{font-size:.8rem;margin:0 0 6px;color:var(--text-secondary)}' +
      '.crozzo-of-docs-missing{color:var(--warning)!important;margin:0 0 8px;font-size:.78rem}' +
      '.crozzo-of-docs-complete{color:var(--success)!important;margin:0 0 8px;font-size:.78rem}' +
      '.crozzo-of-doc-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:10px}' +
      '.crozzo-of-doc-chip{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-primary);font-size:.78rem}' +
      '.crozzo-of-doc-chip.is-ok{border-color:rgba(var(--success-rgb,34,197,94),.35)}' +
      '.crozzo-of-doc-chip.is-miss{border-color:rgba(var(--warning-rgb,234,179,8),.25);opacity:.92}' +
      '.crozzo-of-doc-chip.is-active{box-shadow:0 0 0 2px rgba(var(--accent-rgb,59,130,246),.25);border-color:var(--accent)}' +
      '.crozzo-of-doc-chip__icon{font-size:1.1rem;line-height:1}' +
      '.crozzo-of-doc-chip__body{flex:1;min-width:0}' +
      '.crozzo-of-doc-chip__body strong{display:block;font-size:.76rem}' +
      '.crozzo-of-doc-chip__acts{display:flex;flex-direction:column;gap:4px;align-items:flex-end}' +
      '.crozzo-of-doc-chip__miss{font-size:.68rem;color:var(--text-muted)}' +
      '.crozzo-of-docs-preview{margin-top:8px}' +
      '.crozzo-of-docs-preview__box{min-height:120px;max-height:200px}' +
      '.crozzo-of-historial{padding:14px}' +
      '.crozzo-of-historial__kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}' +
      '.crozzo-of-historial__kpis>div{padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}' +
      '.crozzo-of-historial__kpis strong{display:block;font-size:1rem;margin-top:2px;font-variant-numeric:tabular-nums}' +
      '.crozzo-of-historial-table{width:100%;font-size:.78rem;border-collapse:collapse}' +
      '.crozzo-of-historial-table th,.crozzo-of-historial-table td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left}' +
      '.crozzo-of-historial-table .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}' +
      '.crozzo-of-historial-table tr.is-current td{background:rgba(var(--accent-rgb,59,130,246),.08)}' +
      '.crozzo-of-historial-table tr.is-paid td:first-child{box-shadow:inset 3px 0 0 var(--success)}' +
      '.crozzo-of-historial--empty{padding:24px;text-align:center}' +
      '.crozzo-prov-historial{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}' +
      '@media(max-width:900px){.crozzo-oficina-review{grid-template-columns:1fr}}' +
      '@media(max-width:960px){.crozzo-oficina-filter__grid{grid-template-columns:1fr 1fr}}' +
      '@media(max-width:640px){.crozzo-oficina-filter__grid{grid-template-columns:1fr}.crozzo-oficina-pdf-iframe,.crozzo-oficina-pdf-panel__body{min-height:320px;height:44vh}}';
  }

  function ofLocalIso(d) {
    var x = d ? new Date(d) : new Date();
    return (
      x.getFullYear() +
      '-' +
      String(x.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(x.getDate()).padStart(2, '0')
    );
  }

  function ofTodayIso() {
    return ofLocalIso(new Date());
  }

  function ofMonthStartIso(d) {
    var x = d ? new Date(d) : new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-01';
  }

  function ofMonthEndIso(d) {
    var x = d ? new Date(d) : new Date();
    var last = new Date(x.getFullYear(), x.getMonth() + 1, 0);
    return ofLocalIso(last);
  }

  function ofApplyPreset(preset) {
    ofUi.preset = preset || '';
    if (preset === 'all') {
      ofUi.desde = '';
      ofUi.hasta = '';
      return;
    }
    var today = ofTodayIso();
    var now = new Date();
    if (preset === '7d') {
      var d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      ofUi.desde = ofLocalIso(d7);
      ofUi.hasta = today;
    } else if (preset === 'mes') {
      ofUi.desde = ofMonthStartIso(now);
      ofUi.hasta = ofMonthEndIso(now);
    } else if (preset === 'mes-ant') {
      var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      ofUi.desde = ofMonthStartIso(prev);
      ofUi.hasta = ofMonthEndIso(prev);
    } else if (preset === 'trim') {
      var d90 = new Date(now);
      d90.setDate(d90.getDate() - 89);
      ofUi.desde = ofLocalIso(d90);
      ofUi.hasta = today;
    } else {
      ofUi.desde = '';
      ofUi.hasta = '';
    }
  }

  function ofClearAllFilters() {
    ofUi.q = '';
    ofUi.estado = '';
    ofUi.provId = '';
    ofUi.soloPdf = false;
    ofUi.tab = 'todas';
    ofUi.desde = '';
    ofUi.hasta = '';
    ofUi.preset = '';
  }

  function ofNormMetodo(m) {
    var s = String(m || '').toLowerCase().trim();
    if (s.indexOf('trans') >= 0) return 'transferencia';
    if (s.indexOf('tarj') >= 0 || s.indexOf('card') >= 0) return 'tarjeta';
    if (s.indexOf('efec') >= 0 || s.indexOf('cash') >= 0) return 'efectivo';
    return s || 'por_definir';
  }

  function ofMetodoLabel(m) {
    var n = ofNormMetodo(m);
    if (n === 'transferencia') return '🔄 Transferencia';
    if (n === 'tarjeta') return '💳 Tarjeta';
    if (n === 'efectivo') return '💵 Efectivo';
    return '📋 Por definir';
  }

  function ofEstadoLabel(e) {
    var s = String(e || '').toLowerCase();
    if (s === 'pagada') return 'Pagada';
    if (s === 'en_proceso') return 'En proceso';
    if (s === 'pendiente_oficina' || s === 'pending') return 'Pendiente oficina';
    if (s === 'pendiente_pago') return 'Pendiente pago';
    return 'Pendiente';
  }

  function ofEstadoBadge(e) {
    var s = String(e || '').toLowerCase();
    var cls = 'badge-warning';
    if (s === 'pagada') cls = 'badge-success';
    else if (s === 'en_proceso') cls = 'badge-info';
    return '<span class="badge ' + cls + '">' + esc(ofEstadoLabel(e)) + '</span>';
  }

  function ofFacturaDate(f) {
    return String((f && (f.fecha || f.createdAt)) || '').slice(0, 10);
  }

  function ofListAll() {
    var res = R();
    if (!res) return [];
    return (res.load().facturasOficina || []).slice();
  }

  function ofMatchesTab(f) {
    var tab = ofUi.tab || 'todas';
    if (tab === 'todas') return true;
    var m = ofNormMetodo(f.metodo);
    if (tab === 'transferencias') return m === 'transferencia';
    if (tab === 'efectivo') return m === 'efectivo';
    if (tab === 'tarjetas') return m === 'tarjeta';
    return true;
  }

  function ofFilterList(list) {
    var q = String(ofUi.q || '').toLowerCase().trim();
    var est = String(ofUi.estado || '').toLowerCase();
    var pid = String(ofUi.provId || '');
    var desde = String(ofUi.desde || '');
    var hasta = String(ofUi.hasta || '');
    return list.filter(function (f) {
      if (!ofMatchesTab(f)) return false;
      if (pid && String(f.proveedorId || '') !== pid) return false;
      if (est) {
        var fe = String(f.estado || '').toLowerCase();
        if (est === 'pendiente' && fe !== 'pendiente' && fe !== 'pendiente_oficina' && fe !== 'pending' && fe !== 'pendiente_pago') return false;
        if (est === 'en_proceso' && fe !== 'en_proceso') return false;
        if (est === 'pagada' && fe !== 'pagada') return false;
      }
      var fd = ofFacturaDate(f);
      if (desde && fd && fd < desde) return false;
      if (hasta && fd && fd > hasta) return false;
      if (q) {
        var blob = [f.proveedorNombre, f.numeroFactura, f.notas, f.metodo, f.estado].join(' ').toLowerCase();
        if (blob.indexOf(q) < 0) return false;
      }
      if (ofUi.soloPdf && !ofHasDocument(f)) return false;
      return true;
    }).sort(function (a, b) {
      return String(b.createdAt || b.fecha || '').localeCompare(String(a.createdAt || a.fecha || ''));
    });
  }

  function ofComputeKpis(list) {
    var today = ofTodayIso();
    var mesStart = ofMonthStartIso();
    var mesEnd = ofMonthEndIso();
    var pendientes = 0;
    var valorPend = 0;
    var pagadasHoy = 0;
    var totalMes = 0;
    list.forEach(function (f) {
      var est = String(f.estado || '').toLowerCase();
      var val = Number(f.valor) || 0;
      var fd = ofFacturaDate(f);
      if (est !== 'pagada') {
        pendientes++;
        valorPend += val;
      }
      if (est === 'pagada') {
        var paidDay = String(f.updatedAt || f.fecha || '').slice(0, 10);
        if (paidDay === today) pagadasHoy++;
      }
      if (fd >= mesStart && fd <= mesEnd) totalMes += val;
    });
    return { pendientes: pendientes, valorPend: valorPend, pagadasHoy: pagadasHoy, totalMes: totalMes };
  }

  function ofTabCounts(all) {
    var c = { todas: all.length, transferencias: 0, efectivo: 0, tarjetas: 0 };
    all.forEach(function (f) {
      var m = ofNormMetodo(f.metodo);
      if (m === 'transferencia') c.transferencias++;
      else if (m === 'efectivo') c.efectivo++;
      else if (m === 'tarjeta') c.tarjetas++;
    });
    return c;
  }

  function ofFormatFecha(iso) {
    if (!iso) return '—';
    try {
      var p = String(iso).slice(0, 10).split('-');
      if (p.length === 3) return p[2] + '/' + p[1] + '/' + p[0];
    } catch (_) {}
    return String(iso).slice(0, 10);
  }

  function ofIsPdfAdj(a) {
    if (!a) return false;
    var m = String(a.mime || '').toLowerCase();
    if (m.indexOf('pdf') >= 0) return true;
    return /\.pdf$/i.test(String(a.nombre || ''));
  }

  function ofIsImageAdj(a) {
    if (!a) return false;
    var m = String(a.mime || '').toLowerCase();
    return m.indexOf('image') >= 0 || !!(a.thumbDataUrl && !ofIsPdfAdj(a));
  }

  function ofResolveAdjuntos(f) {
    var out = [];
    var res = R();
    if (!res || !f) return out;
    var st = res.load();
    if (f.recepcionId) {
      var rec = (st.recepciones || []).find(function (r) {
        return String(r.id) === String(f.recepcionId);
      });
      if (rec && rec.adjuntos) {
        rec.adjuntos.forEach(function (a) {
          if (a) out.push(a);
        });
      }
    }
    (f.adjuntos || []).forEach(function (a) {
      if (!a) return;
      if (!out.some(function (x) { return String(x.id || x.blobRef) === String(a.id || a.blobRef); })) out.push(a);
    });
    return out.sort(function (a, b) {
      var ap = ofIsPdfAdj(a) ? 0 : 1;
      var bp = ofIsPdfAdj(b) ? 0 : 1;
      return ap - bp;
    });
  }

  function ofHasDocument(f) {
    return ofResolveAdjuntos(f).length > 0;
  }

  function ofHasComprobantePago(f) {
    var cp = f && f.comprobantePago;
    if (!cp) return false;
    return !!(cp.blobRef || cp.blobId || cp.url || cp.supabasePath);
  }

  function ofComprobanteBlobId(f) {
    var cp = f && f.comprobantePago;
    if (!cp) return null;
    return ofAdjBlobId(cp);
  }

  function ofReadFileDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Sin archivo'));
      var fr = new FileReader();
      fr.onload = function () {
        resolve(fr.result);
      };
      fr.onerror = function () {
        reject(fr.error || new Error('No se pudo leer el archivo'));
      };
      fr.readAsDataURL(file);
    });
  }

  function ofStoreComprobantePago(facturaId, file) {
    var B = global.CrozzoBlobStore;
    var res = R();
    if (!B || !B.putBlob) return Promise.reject(new Error('Almacén local no disponible'));
    if (!res || !res.actualizarFacturaOficina) return Promise.reject(new Error('Reservorio no disponible'));
    var fac = ofListAll().find(function (x) {
      return String(x.id) === String(facturaId);
    });
    return ofReadFileDataUrl(file).then(function (dataUrl) {
      return B.putBlob({
        dataUrl: dataUrl,
        mime: file.type || 'application/octet-stream',
        nombre: file.name || 'comprobante-pago',
        refTipo: 'oficina_comprobante',
        proveedorId: fac && fac.proveedorId,
      });
    }).then(function (rec) {
      var adj = {
        id: rec.id,
        blobRef: rec.id,
        blobId: rec.id,
        nombre: String(rec.nombre || file.name || 'comprobante-pago').slice(0, 120),
        mime: rec.mime || file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        tipo: 'comprobante_pago',
      };
      res.actualizarFacturaOficina(facturaId, { comprobantePago: adj });
      return adj;
    });
  }

  function ofComprobantePagoHtml(f) {
    var fid = esc(f.id);
    var cp = f.comprobantePago;
    var has = ofHasComprobantePago(f);
    var name = has ? esc(String(cp.nombre || 'Comprobante').slice(0, 48)) : '';
    var uploaded =
      has && cp.uploadedAt ? esc(ofFormatFecha(String(cp.uploadedAt).slice(0, 10))) : '';
    return (
      '<div class="crozzo-oficina-comp">' +
      '<p class="crozzo-oficina-edit__title">Comprobante de pago</p>' +
      (has
        ? '<div class="crozzo-oficina-comp__has">' +
          '<span class="crozzo-oficina-comp__badge">🧾 ' +
          name +
          '</span>' +
          (uploaded ? '<span class="form-hint">Subido ' + uploaded + '</span>' : '') +
          '<div class="crozzo-oficina-comp__actions">' +
          '<button type="button" class="btn btn-outline btn-sm ccl-of-comp-ver" data-id="' +
          fid +
          '">Ver comprobante</button>' +
          '<label class="btn btn-ghost btn-sm">Reemplazar<input type="file" class="ccl-of-comp-file" data-id="' +
          fid +
          '" accept="application/pdf,image/*,.jpg,.jpeg,.png,.webp" hidden></label>' +
          '</div></div>'
        : '<p class="form-hint" style="margin:0 0 8px">Adjunte transferencia, consignación o soporte bancario (PDF o imagen). Puede hacerlo al confirmar el pago o después.</p>' +
          '<label class="btn btn-outline btn-sm">📎 Subir comprobante<input type="file" class="ccl-of-comp-file" data-id="' +
          fid +
          '" accept="application/pdf,image/*,.jpg,.jpeg,.png,.webp" hidden></label>') +
      '</div>'
    );
  }

  function ofComprobantePanelHtml(f) {
    var fid = esc(f.id);
    var has = ofHasComprobantePago(f);
    return (
      '<div class="crozzo-oficina-comp-panel">' +
      ofComprobantePagoHtml(f) +
      (has
        ? '<div class="crozzo-oficina-pdf-panel__body has-preview" data-comp-panel="' +
          fid +
          '">' +
          '<div class="crozzo-oficina-pdf-loading" data-comp-preview-load>Cargando comprobante…</div>' +
          '<canvas class="crozzo-oficina-pdf-canvas" data-comp-preview-canvas aria-label="Comprobante de pago"></canvas>' +
          '<iframe class="crozzo-oficina-pdf-iframe" data-comp-preview-iframe title="Comprobante de pago"></iframe>' +
          '<img class="crozzo-oficina-pdf-img" data-comp-preview-img alt="Comprobante de pago">' +
          '</div>'
        : '<div class="crozzo-oficina-empty">Sin comprobante adjunto.</div>') +
      '</div>'
    );
  }

  function ofMountComprobantePreview(host, facturaId) {
    var fac = ofListAll().find(function (x) {
      return String(x.id) === String(facturaId);
    });
    if (!fac || !ofHasComprobantePago(fac) || !host) return;
    var panelBody = host.querySelector('[data-comp-panel="' + facturaId + '"]');
    if (!panelBody) return;
    var PDm = PD();
    var blobId = ofComprobanteBlobId(fac);
    var load = panelBody.querySelector('[data-comp-preview-load]');
    if (blobId && PDm && PDm.mountBlobPreview) {
      PDm.mountBlobPreview(panelBody, blobId, {
        maxWidth: panelBody.clientWidth || 900,
        trackUrls: ofUi._blobUrls,
        loadingText: 'Cargando comprobante…',
      }).then(function (ok) {
        if (!ok && load) {
          load.style.display = 'flex';
          load.textContent = 'Comprobante no disponible — vuelva a subirlo';
        }
      });
    }
  }

  function ofOpenModalPago(host, facPay) {
    var prov = ofGetProveedor(facPay);
    var calc = ofCalcRetenciones(facPay, prov);
    var neto = calc.neto != null ? calc.neto : facPay.valor;
    var body =
      '<p class="form-hint" style="margin:0">Confirme el pago de <strong>' +
      esc(facPay.proveedorNombre || 'proveedor') +
      '</strong> · neto sugerido <strong>' +
      fmtMoney(neto) +
      '</strong>.</p>' +
      '<div class="crozzo-oficina-comp" style="margin-top:14px;border-top:none;padding-top:0">' +
      '<label class="form-label" for="ccl-of-modal-comp-file">Comprobante de pago (opcional)</label>' +
      '<input type="file" id="ccl-of-modal-comp-file" class="form-input" accept="application/pdf,image/*,.jpg,.jpeg,.png,.webp">' +
      '<p class="form-hint" style="margin:8px 0 0">PDF o foto de transferencia, consignación o soporte bancario.</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-outline" id="ccl-of-modal-pago-cancel">Cancelar</button>' +
      '<button type="button" class="btn btn-primary" id="ccl-of-modal-pago-ok">Confirmar pago</button>' +
      '</div>';
    if (typeof global.showModal !== 'function') {
      R().actualizarEstadoOficina(facPay.id, 'pagada');
      toast('Pago registrado → cola planilla', 'success');
      refreshOficina(host);
      return;
    }
    global.showModal('Registrar pago', body, { wide: true, showClose: true });
    setTimeout(function () {
      var okBtn = document.getElementById('ccl-of-modal-pago-ok');
      var cancelBtn = document.getElementById('ccl-of-modal-pago-cancel');
      var fileInp = document.getElementById('ccl-of-modal-comp-file');
      function closeM() {
        if (typeof global.closeModal === 'function') global.closeModal();
      }
      if (cancelBtn) cancelBtn.onclick = closeM;
      if (!okBtn) return;
      okBtn.onclick = function () {
        okBtn.disabled = true;
        var file = fileInp && fileInp.files && fileInp.files[0];
        function donePago(withComp) {
          R().actualizarEstadoOficina(facPay.id, 'pagada');
          closeM();
          toast(
            withComp ? 'Pago registrado con comprobante → planilla' : 'Pago registrado → cola planilla',
            'success'
          );
          refreshOficina(host);
        }
        if (file) {
          ofStoreComprobantePago(facPay.id, file)
            .then(function () {
              donePago(true);
            })
            .catch(function (e) {
              toast('Comprobante no guardado: ' + (e.message || e) + ' — pago registrado igual', 'warning');
              donePago(false);
            });
        } else {
          donePago(false);
        }
      };
    }, 0);
  }

  function ofHandleComprobanteFile(host, facturaId, file) {
    if (!file || !facturaId) return;
    ofStoreComprobantePago(facturaId, file)
      .then(function () {
        toast('Comprobante guardado', 'success');
        refreshOficina(host, true);
        if (String(ofUi.expandedId) === String(facturaId) && ofUi.expandedTab === 'comprobante') {
          setTimeout(function () {
            ofMountComprobantePreview(host, facturaId);
          }, 0);
        }
      })
      .catch(function (e) {
        toast('No se pudo guardar comprobante: ' + (e.message || e), 'warning');
      });
  }

  function ofSupabasePublicUrl(path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      if (!raw) return null;
      var cfg = JSON.parse(raw);
      var base = String(cfg.url || '').replace(/\/$/, '');
      if (!base) return null;
      var p = String(path).replace(/^\//, '');
      if (p.indexOf('storage/v1/') === 0) return base + '/' + p;
      return base + '/storage/v1/object/public/' + p;
    } catch (_) {
      return null;
    }
  }

  function ofAdjBlobId(adj) {
    if (!adj) return null;
    var B = global.CrozzoBlobStore;
    if (B && B.normalizeBlobId) return B.normalizeBlobId(adj);
    return adj.blobRef || adj.blobId || null;
  }

  function ofAdjuntoToViewUrl(adj) {
    if (!adj) return Promise.resolve(null);
    if (adj.supabasePath) {
      var remote = ofSupabasePublicUrl(adj.supabasePath);
      if (remote) return Promise.resolve({ url: remote, revoke: false });
    }
    var B = global.CrozzoBlobStore;
    var blobId = ofAdjBlobId(adj);
    if (blobId && B && B.getViewUrl) {
      return B.getViewUrl(blobId).then(function (view) {
        if (!view || !view.url) return null;
        return { url: view.url, revoke: !!view.revoke, view: view };
      });
    }
    if (blobId && B && B.getBlobUrl) {
      return B.getBlobUrl(blobId).then(function (u) {
        return u ? { url: u, revoke: true } : null;
      });
    }
    if (adj.dataUrl) return Promise.resolve({ url: adj.dataUrl, revoke: false });
    if (adj.thumbDataUrl) return Promise.resolve({ url: adj.thumbDataUrl, revoke: false });
    return Promise.resolve(null);
  }

  function ofRevokeAllPdfUrls() {
    (ofUi._blobUrls || []).forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (_) {}
    });
    ofUi._blobUrls = [];
    var host = document.getElementById('crozzo-hub-local-host');
    if (host) {
      host.querySelectorAll('.crozzo-oficina-pdf-panel__body, .crozzo-rut-mini').forEach(function (el) {
        if (el._previewBlobUrl) {
          try {
            URL.revokeObjectURL(el._previewBlobUrl);
          } catch (_) {}
          el._previewBlobUrl = null;
        }
      });
    }
  }

  function ofMountPdfPreview(host, facturaId, adjIdx) {
    adjIdx = adjIdx == null ? ofUi.expandedAdjIdx || 0 : adjIdx;
    ofUi.expandedAdjIdx = adjIdx;
    var f = ofListAll().find(function (x) {
      return String(x.id) === String(facturaId);
    });
    if (!f || !host) return;
    var docs = ofResolveAdjuntos(f);
    var adj = docs[adjIdx];
    var fid = String(facturaId);
    var panelBody = host.querySelector('[data-pdf-for="' + fid + '"] .crozzo-oficina-pdf-panel__body');
    var label = host.querySelector('#ccl-of-pdf-label-' + fid);
    var newTab = host.querySelector('.ccl-of-pdf-newtab[data-id="' + fid + '"]');
    var PDm = PD();

    ofRevokeAllPdfUrls();
    if (panelBody) {
      panelBody.classList.remove('has-preview');
      var canvas = panelBody.querySelector('.crozzo-oficina-pdf-canvas');
      var iframe = panelBody.querySelector('.crozzo-oficina-pdf-iframe');
      var img = panelBody.querySelector('.crozzo-oficina-pdf-img');
      var load = panelBody.querySelector('.crozzo-oficina-pdf-loading');
      if (iframe) {
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
      }
      if (img) {
        img.style.display = 'none';
        img.removeAttribute('src');
      }
      if (canvas) canvas.style.display = 'none';
      if (newTab) {
        newTab.href = '#';
        newTab.style.display = 'none';
      }
      if (!adj) {
        if (load) {
          load.style.display = 'flex';
          load.textContent = 'Sin documento adjunto en recepción';
        }
        if (label) label.textContent = 'Sin documento';
        return;
      }
      if (label) label.textContent = adj.nombre || 'Factura adjunta';
      var blobId = ofAdjBlobId(adj);
      if (blobId && PDm && PDm.mountBlobPreview) {
        PDm.mountBlobPreview(panelBody, blobId, {
          maxWidth: panelBody.clientWidth || 900,
          trackUrls: ofUi._blobUrls,
          loadingText: 'Cargando documento…',
        }).then(function (ok) {
          if (!ok && load) {
            load.style.display = 'flex';
            load.textContent = 'Documento no disponible — vuelva a cargarlo en recepción';
          }
          if (ok && newTab && panelBody._previewBlobUrl) {
            newTab.href = panelBody._previewBlobUrl;
            newTab.style.display = 'inline-flex';
          }
        });
        return;
      }
      if (load) load.style.display = 'flex';
      ofAdjuntoToViewUrl(adj)
        .then(function (view) {
          if (load) load.style.display = 'none';
          if (!view || !view.url) {
            if (load) {
              load.style.display = 'flex';
              load.textContent = 'Documento no disponible en este equipo';
            }
            return;
          }
          if (view.revoke) {
            ofUi._blobUrls = ofUi._blobUrls || [];
            ofUi._blobUrls.push(view.url);
          }
          if (newTab) {
            newTab.href = view.url;
            newTab.style.display = 'inline-flex';
          }
          if (ofIsPdfAdj(adj) && PDm && PDm.renderPdfFirstPageToCanvas && canvas) {
            return PDm.renderPdfFirstPageToCanvas(view.url, canvas, panelBody.clientWidth || 900).then(function () {
              panelBody.classList.add('has-preview');
            });
          }
          if (ofIsImageAdj(adj) && img) {
            img.src = view.url;
            img.style.display = 'block';
            panelBody.classList.add('has-preview');
          } else if (iframe) {
            iframe.src = view.url;
            iframe.style.display = 'block';
            panelBody.classList.add('has-preview');
          }
        })
        .catch(function () {
          if (load) {
            load.style.display = 'flex';
            load.textContent = 'Error al cargar documento';
          }
        });
    }
  }

  function PD() {
    return global.CrozzoProveedorDocumentos;
  }

  function ofGetProveedor(f) {
    var res = R();
    if (!res || !f) return null;
    var pid = String(f.proveedorId || '');
    if (!pid) return null;
    return (res.load().proveedores || []).find(function (p) {
      return String(p.id) === pid;
    }) || null;
  }

  function ofLabelIdTributario() {
    var PDm = PD();
    return PDm && PDm.labelIdentificador ? PDm.labelIdentificador() : 'NIT / RUT';
  }

  function ofCalcRetenciones(f, prov) {
    var valor = Number(f && f.valor) || 0;
    var meta = (f && f.oficinaMeta) || {};
    var out = {
      valor: valor,
      retFuente: Number(meta.retencionFuente) || 0,
      retIca: Number(meta.retencionICA) || 0,
      neto: valor,
      tarifaFuente: 0,
      tarifaIca: 0,
      retenciones: null,
      sugerido: true,
    };
    var PDm = PD();
    if (!PDm) {
      out.neto = valor - out.retFuente - out.retIca;
      return out;
    }
    var impCfg = PDm.getImpuestosEmpresaConfig();
    var ret = PDm.getRetencionProveedor(prov);
    out.retenciones = ret;
    if (meta.retencionesConfirmadas) {
      out.sugerido = false;
      out.neto = Number(meta.netoPagar) || valor - out.retFuente - out.retIca;
      return out;
    }
    out.retFuente = 0;
    out.retIca = 0;
    var renta = ret.retencionRenta || ret;
    if ((renta.aplica || ret.aplicaRetencion) && impCfg.retencionFuente.aplica !== false) {
      out.tarifaFuente = Number(impCfg.retencionFuente.tarifa) || 0.025;
      if (renta.aplica !== false && !renta.exento) out.retFuente = Math.round(valor * out.tarifaFuente);
    }
    var ica = ret.retencionICA;
    if (ica && ica.aplica && impCfg.retencionICA.aplica) {
      out.tarifaIca = Number(impCfg.retencionICA.tarifa) || 0;
      out.retIca = Math.round(valor * out.tarifaIca);
    }
    out.neto = valor - out.retFuente - out.retIca;
    return out;
  }

  function ofRecomendacionesOficina(f, prov, calc) {
    var items = [];
    var PDm = PD();
    if (!prov) {
      items.push({
        tipo: 'warn',
        titulo: 'Proveedor no vinculado',
        texto: 'Asigne un proveedor del directorio o corrija el nombre. Sin ficha no hay validación de RUT.',
      });
    } else {
      if (!prov.nit) {
        items.push({
          tipo: 'warn',
          titulo: ofLabelIdTributario() + ' faltante',
          texto: 'Complete el identificador tributario en la ficha del proveedor.',
        });
      }
      var leg = prov.legal || {};
      if (!leg.regimenTributario && !leg.obligaciones) {
        items.push({
          tipo: 'info',
          titulo: 'Importar RUT recomendado',
          texto: 'Suba el certificado RUT/NIT del proveedor para calcular retenciones en la fuente e ICA.',
        });
      } else if (PDm && PDm.evaluarVigencia && leg.fechaDocumento) {
        var vig = PDm.evaluarVigencia(leg.fechaDocumento, leg.anioTributario, new Date());
        if (vig && vig.estado === 'vencido') {
          items.push({
            tipo: 'warn',
            titulo: 'RUT posiblemente desactualizado',
            texto: PDm.formatVigenciaTexto ? PDm.formatVigenciaTexto(vig) : 'Renueve el certificado tributario.',
          });
        } else if (vig && vig.estado === 'vigente') {
          items.push({
            tipo: 'ok',
            titulo: 'RUT vigente',
            texto: PDm.formatVigenciaTexto ? PDm.formatVigenciaTexto(vig) : 'Certificado dentro de vigencia.',
          });
        }
      }
      if (leg.regimenTributario && leg.regimenTributario.esSimple) {
        items.push({
          tipo: 'ok',
          titulo: 'Régimen Simple',
          texto: 'No aplican retenciones en la fuente (renta) según RUT.',
        });
      }
      var cuentas = Array.isArray(leg.cuentasBancarias) ? leg.cuentasBancarias : [];
      if (!cuentas.length && !leg.nombreParaTransferencias) {
        items.push({
          tipo: 'warn',
          titulo: 'Datos bancarios',
          texto: 'Registre al menos una cuenta bancaria del proveedor antes de transferir.',
        });
      }
      var PDmDocs = PD();
      if (PDmDocs && PDmDocs.proveedorDocsSummary) {
        var ds = PDmDocs.proveedorDocsSummary(prov);
        if (ds.missing.length) {
          items.push({
            tipo: 'warn',
            titulo: 'Expediente documentos',
            texto: ds.faltaTexto + ' — cargue en Compras → Proveedores.',
          });
        } else if (ds.count > 0) {
          items.push({
            tipo: 'ok',
            titulo: 'Expediente documentos',
            texto: ds.tieneTexto,
          });
        }
      }
    }
    if (calc.retenciones) {
      var renta = calc.retenciones.retencionRenta || calc.retenciones;
      items.push({
        tipo: renta.exento ? 'ok' : renta.aplica || calc.retenciones.aplicaRetencion ? 'warn' : 'info',
        titulo: 'Retención renta (fuente)',
        texto: renta.motivo || calc.retenciones.motivo || 'Revise obligación 07 en RUT.',
      });
      var ica = calc.retenciones.retencionICA;
      if (ica && ica.motivo) {
        items.push({
          tipo: ica.aplica ? 'warn' : ica.pendienteConfig || ica.pendienteDatos ? 'info' : 'ok',
          titulo: 'RETE ICA',
          texto: ica.motivo,
        });
      }
    }
    if (!impuestosEmpresaOk()) {
      items.push({
        tipo: 'info',
        titulo: 'Tarifas de retención',
        texto: 'Configure retención en la fuente e ICA en Administración → Impuestos.',
      });
    }
    if (!f.numeroFactura) {
      items.push({
        tipo: 'warn',
        titulo: 'Nº de factura',
        texto: 'Registre el consecutivo del documento soporte antes de pagar.',
      });
    }
    if (Number(f.valor) <= 0) {
      items.push({ tipo: 'danger', titulo: 'Valor inválido', texto: 'Corrija el valor total de la factura.' });
    }
    if (ofNormMetodo(f.metodo) === 'transferencia' && String(f.estado).toLowerCase() !== 'pagada' && !ofHasDocument(f)) {
      items.push({
        tipo: 'warn',
        titulo: 'Transferencia sin soporte',
        texto: 'Adjunte PDF en recepción o cargue soporte antes de marcar pagada.',
      });
    }
    return items;
  }

  function impuestosEmpresaOk() {
    var PDm = PD();
    if (!PDm || !PDm.getImpuestosEmpresaConfig) return false;
    try {
      return !!global.config;
    } catch (_) {
      return false;
    }
  }

  function ofRecoHtml(items) {
    if (!items.length) {
      return '<p class="form-hint" style="margin:0">Sin observaciones — revise PDF y datos antes de pagar.</p>';
    }
    return items
      .map(function (it) {
        var icon = it.tipo === 'ok' ? '✓' : it.tipo === 'danger' ? '!' : it.tipo === 'warn' ? '⚠' : 'ℹ';
        return (
          '<div class="crozzo-oficina-reco crozzo-oficina-reco--' +
          esc(it.tipo || 'info') +
          '">' +
          '<span class="crozzo-oficina-reco__icon">' +
          icon +
          '</span><div><p class="crozzo-oficina-reco__title">' +
          esc(it.titulo) +
          '</p><p style="margin:0;color:var(--text-secondary)">' +
          esc(it.texto) +
          '</p></div></div>'
        );
      })
      .join('');
  }

  function ofHistorialProveedor(provId, provNombre) {
    var res = R();
    if (res && res.listFacturasOficinaPorProveedor) {
      return res.listFacturasOficinaPorProveedor(provId, { proveedorNombre: provNombre });
    }
    var pid = String(provId || '');
    var nom = provNombre ? String(provNombre).trim().toUpperCase() : '';
    return ofListAll()
      .filter(function (f) {
        if (pid && String(f.proveedorId || '') === pid) return true;
        if (nom && String(f.proveedorNombre || '').trim().toUpperCase() === nom) return true;
        return false;
      })
      .sort(function (a, b) {
        return String(ofFacturaDate(b)).localeCompare(String(ofFacturaDate(a)));
      });
  }

  function ofResumenHistorialProveedor(provId, provNombre) {
    var res = R();
    if (res && res.resumenPagosProveedor) {
      return res.resumenPagosProveedor(provId, { proveedorNombre: provNombre });
    }
    var list = ofHistorialProveedor(provId, provNombre);
    var pagadas = list.filter(function (f) {
      return String(f.estado || '').toLowerCase() === 'pagada';
    });
    var pendientes = list.filter(function (f) {
      var e = String(f.estado || '').toLowerCase();
      return e === 'pendiente' || e === 'en_proceso';
    });
    function sum(arr) {
      return arr.reduce(function (s, f) {
        return s + (Number(f.valor) || 0);
      }, 0);
    }
    return {
      total: list.length,
      pagadas: pagadas.length,
      pendientes: pendientes.length,
      montoPagado: sum(pagadas),
      montoPendiente: sum(pendientes),
      montoNetoPagado: sum(pagadas),
      facturas: list,
    };
  }

  function ofProvHistorialHtml(provId, provNombre, currentFacturaId) {
    var sum = ofResumenHistorialProveedor(provId, provNombre);
    if (!sum.facturas.length) {
      return (
        '<div class="crozzo-of-historial crozzo-of-historial--empty">' +
        '<p class="form-hint" style="margin:0">Sin pagos ni facturas de oficina para este proveedor.</p></div>'
      );
    }
    var rows = sum.facturas
      .slice(0, 60)
      .map(function (fac) {
        var isCurrent = String(fac.id) === String(currentFacturaId || '');
        var est = String(fac.estado || '').toLowerCase();
        var meta = fac.oficinaMeta || {};
        var neto =
          meta.retencionesConfirmadas && meta.netoPagar != null ? fmtMoney(meta.netoPagar) : '—';
        return (
          '<tr class="crozzo-of-hist-row' +
          (isCurrent ? ' is-current' : '') +
          (est === 'pagada' ? ' is-paid' : '') +
          '">' +
          '<td>' +
          esc(ofFormatFecha(ofFacturaDate(fac))) +
          '</td>' +
          '<td>' +
          esc(fac.numeroFactura || '—') +
          (isCurrent ? ' <span class="badge badge-info">Actual</span>' : '') +
          '</td>' +
          '<td class="num">' +
          fmtMoney(fac.valor) +
          '</td>' +
          '<td class="num">' +
          neto +
          '</td>' +
          '<td>' +
          ofEstadoBadge(fac.estado) +
          '</td>' +
          '<td>' +
          esc(ofMetodoLabel(fac.metodo)) +
          '</td>' +
          '<td style="text-align:right">' +
          (isCurrent
            ? '<span class="form-hint">—</span>'
            : '<button type="button" class="btn btn-ghost btn-sm ccl-of-hist-open" data-id="' +
              esc(fac.id) +
              '">Abrir</button>') +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-of-historial">' +
      '<p class="crozzo-oficina-edit__title">Historial de pagos · ' +
      esc(provNombre || 'Proveedor') +
      '</p>' +
      '<div class="crozzo-of-historial__kpis">' +
      '<div><span class="form-hint">Facturas</span><strong>' +
      sum.total +
      '</strong></div>' +
      '<div><span class="form-hint">Pagadas</span><strong>' +
      sum.pagadas +
      '</strong></div>' +
      '<div><span class="form-hint">Pendientes</span><strong>' +
      sum.pendientes +
      '</strong></div>' +
      '<div><span class="form-hint">Total pagado</span><strong>' +
      fmtMoney(sum.montoPagado) +
      '</strong></div>' +
      '<div><span class="form-hint">Por pagar</span><strong>' +
      fmtMoney(sum.montoPendiente) +
      '</strong></div>' +
      (sum.montoNetoPagado !== sum.montoPagado
        ? '<div><span class="form-hint">Neto pagado</span><strong>' +
          fmtMoney(sum.montoNetoPagado) +
          '</strong></div>'
        : '') +
      '</div>' +
      '<div class="table-container" style="max-height:min(420px,50vh);overflow:auto">' +
      '<table class="crozzo-of-historial-table"><thead><tr>' +
      '<th>Fecha</th><th>Nº factura</th><th>Valor</th><th>Neto</th><th>Estado</th><th>Método</th><th></th>' +
      '</tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      (sum.facturas.length > 60
        ? '<p class="form-hint">Mostrando 60 de ' + sum.facturas.length + ' movimientos.</p>'
        : '') +
      '</div>'
    );
  }

  function ofProvCardHtml(f, prov) {
    var PDm = PD();
    var leg = (prov && prov.legal) || {};
    var nombre = prov ? prov.nombre : f.proveedorNombre || '—';
    var nit = prov ? prov.nit || '—' : '—';
    var regimen =
      (leg.regimenTributario && (leg.regimenTributario.etiqueta || leg.regimenTributario.codigo)) || 'Sin RUT importado';
    var ciudad = leg.ciudad || '—';
    var pid = prov ? String(prov.id) : String(f.proveedorId || '');
    var docsPanel =
      PDm && PDm.renderProveedorDocsPanel && pid
        ? PDm.renderProveedorDocsPanel(prov || { id: pid, proveedorId: pid }, pid, {
            activeKey: ofUi.activeProvDocKey,
            withPreview: true,
          })
        : '';
    var histSum = pid || nombre ? ofResumenHistorialProveedor(pid, nombre) : { total: 0 };
    var histRef =
      histSum.total > 0
        ? '<p class="form-hint" style="margin:8px 0">' +
          histSum.pagadas +
          ' pagada' +
          (histSum.pagadas === 1 ? '' : 's') +
          ' · ' +
          fmtMoney(histSum.montoPagado) +
          ' total' +
          (histSum.pendientes
            ? ' · ' + histSum.pendientes + ' pendiente' + (histSum.pendientes === 1 ? '' : 's')
            : '') +
          ' · <button type="button" class="btn btn-link btn-sm ccl-of-goto-historial" data-id="' +
          esc(f.id) +
          '">Ver historial</button></p>'
        : '';
    return (
      '<div class="crozzo-oficina-prov-card">' +
      '<h4>' +
      esc(nombre) +
      '</h4>' +
      '<p>' +
      esc(ofLabelIdTributario() + ': ' + nit) +
      ' · ' +
      esc(regimen) +
      '</p>' +
      '<p style="margin-top:4px">Ciudad: ' +
      esc(ciudad) +
      '</p>' +
      histRef +
      docsPanel +
      '<div class="crozzo-oficina-prov-actions">' +
      '<button type="button" class="btn btn-outline btn-sm ccl-of-open-prov" data-prov-id="' +
      esc(pid) +
      '">🏪 Ficha proveedor</button>' +
      (PDm && PDm.openProveedorRut
        ? '<button type="button" class="btn btn-outline btn-sm ccl-of-open-rut" data-prov-id="' +
          esc(pid) +
          '">📄 Importar RUT</button>'
        : '') +
      '<button type="button" class="btn btn-ghost btn-sm ccl-of-open-impuestos">⚙ Impuestos empresa</button>' +
      '</div></div>'
    );
  }

  function ofEditFormHtml(f, calc) {
    var fid = esc(f.id);
    var meta = f.oficinaMeta || {};
    return (
      '<div class="crozzo-oficina-edit">' +
      '<p class="crozzo-oficina-edit__title">Corregir factura</p>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input ccl-of-ed-prov" data-id="' +
      fid +
      '">' +
      provOptions(f.proveedorId) +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Nº factura</label><input class="form-input ccl-of-ed-num" data-id="' +
      fid +
      '" value="' +
      esc(f.numeroFactura || '') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Valor ($)</label><input class="form-input ccl-of-ed-valor" data-id="' +
      fid +
      '" type="number" min="0" step="1" value="' +
      esc(String(Number(f.valor) || 0)) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Fecha</label><input class="form-input ccl-of-ed-fecha" data-id="' +
      fid +
      '" type="date" value="' +
      esc(ofFacturaDate(f)) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Método pago</label><select class="form-input ccl-of-ed-metodo" data-id="' +
      fid +
      '">' +
      ['transferencia', 'efectivo', 'tarjeta', 'por_definir']
        .map(function (m) {
          var sel = ofNormMetodo(f.metodo) === m ? ' selected' : '';
          return (
            '<option value="' +
            m +
            '"' +
            sel +
            '>' +
            esc(ofMetodoLabel(m).replace(/^[^\s]+\s/, '')) +
            '</option>'
          );
        })
        .join('') +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Estado</label><select class="form-input ccl-of-ed-estado" data-id="' +
      fid +
      '">' +
      ['pendiente', 'en_proceso', 'pagada']
        .map(function (e) {
          return (
            '<option value="' +
            e +
            '"' +
            (String(f.estado) === e ? ' selected' : '') +
            '>' +
            esc(ofEstadoLabel(e)) +
            '</option>'
          );
        })
        .join('') +
      '</select></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label class="form-label">Notas oficina</label><input class="form-input ccl-of-ed-notas" data-id="' +
      fid +
      '" value="' +
      esc(f.notas || '') +
      '" placeholder="Observaciones, causación, causación contable…"></div>' +
      '<div class="form-group"><label class="form-label">Ret. fuente ($)</label><input class="form-input ccl-of-ed-retf" data-id="' +
      fid +
      '" type="number" min="0" step="1" value="' +
      esc(String(calc.retFuente || 0)) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">RETE ICA ($)</label><input class="form-input ccl-of-ed-reti" data-id="' +
      fid +
      '" type="number" min="0" step="1" value="' +
      esc(String(calc.retIca || 0)) +
      '"></div>' +
      '</div>' +
      '<label class="form-hint" style="display:flex;align-items:center;gap:8px;margin:10px 0">' +
      '<input type="checkbox" class="ccl-of-ed-confirm-ret" data-id="' +
      fid +
      '"' +
      (meta.retencionesConfirmadas ? ' checked' : '') +
      '> Retenciones revisadas y confirmadas</label>' +
      '<button type="button" class="btn btn-primary btn-sm ccl-of-save-edit" data-id="' +
      fid +
      '">Guardar correcciones</button>' +
      ofComprobantePagoHtml(f) +
      '</div>'
    );
  }

  function ofCalcHtml(calc) {
    return (
      '<div class="crozzo-oficina-calc">' +
      '<span>Valor factura</span><strong>' +
      fmtMoney(calc.valor) +
      '</strong>' +
      '<span>Ret. fuente' +
      (calc.tarifaFuente ? ' (' + (calc.tarifaFuente * 100).toFixed(2) + '%)' : '') +
      '</span><strong>- ' +
      fmtMoney(calc.retFuente) +
      '</strong>' +
      '<span>RETE ICA' +
      (calc.tarifaIca ? ' (' + (calc.tarifaIca * 1000).toFixed(2) + '‰)' : '') +
      '</span><strong>- ' +
      fmtMoney(calc.retIca) +
      '</strong>' +
      '<div class="crozzo-oficina-calc__neto"><span>Neto sugerido a pagar</span><strong>' +
      fmtMoney(calc.neto) +
      '</strong></div></div>'
    );
  }

  function ofDetailPanelRowHtml(f, docs) {
    var fid = esc(f.id);
    var tab = ofUi.expandedTab || (docs.length ? 'pdf' : 'oficina');
    var prov = ofGetProveedor(f);
    var calc = ofCalcRetenciones(f, prov);
    var recos = ofRecomendacionesOficina(f, prov, calc);
    var tabPdfCls = tab === 'pdf' ? ' is-active' : '';
    var tabOfCls = tab === 'oficina' ? ' is-active' : '';
    var tabHistCls = tab === 'historial' ? ' is-active' : '';
    var tabCompCls = tab === 'comprobante' ? ' is-active' : '';
    var provId = prov ? prov.id : f.proveedorId;
    var provNom = (prov && prov.nombre) || f.proveedorNombre || '';
    var docTabs = '';
    if (docs.length > 1) {
      docTabs =
        '<div class="crozzo-oficina-pdf-doc-tabs">' +
        docs
          .map(function (d, i) {
            var active = i === (ofUi.expandedAdjIdx || 0) ? ' is-active' : '';
            return (
              '<button type="button" class="crozzo-oficina-pdf-doc-tab' +
              active +
              ' ccl-of-pdf-doc" data-id="' +
              fid +
              '" data-idx="' +
              i +
              '">' +
              esc(String(d.nombre || 'Doc ' + (i + 1)).slice(0, 22)) +
              '</button>'
            );
          })
          .join('') +
        '</div>';
    }
    var pdfBlock =
      tab === 'pdf' && docs.length
        ? '<div class="crozzo-oficina-pdf-panel__body">' +
          '<div class="crozzo-oficina-pdf-loading" id="ccl-of-pdf-load-' +
          fid +
          '" data-blob-preview-load>Cargando documento…</div>' +
          '<canvas class="crozzo-oficina-pdf-canvas" id="ccl-of-pdf-canvas-' +
          fid +
          '" data-blob-preview-canvas aria-label="Vista previa factura"></canvas>' +
          '<iframe class="crozzo-oficina-pdf-iframe" id="ccl-of-pdf-iframe-' +
          fid +
          '" data-blob-preview-iframe title="Vista previa factura"></iframe>' +
          '<img class="crozzo-oficina-pdf-img" id="ccl-of-pdf-img-' +
          fid +
          '" data-blob-preview-img alt="Adjunto factura">' +
          '</div>'
        : tab === 'pdf'
          ? '<div class="crozzo-oficina-empty">Sin PDF adjunto — cargue el documento en recepción de facturas.</div>'
          : '';
    var historialBlock =
      tab === 'historial'
        ? ofProvHistorialHtml(provId, provNom, f.id)
        : '';
    var comprobanteBlock = tab === 'comprobante' ? ofComprobantePanelHtml(f) : '';
    var oficinaBlock =
      tab === 'oficina'
        ? '<div class="crozzo-oficina-review">' +
          '<div class="crozzo-oficina-review__col">' +
          ofProvCardHtml(f, prov) +
          '<div><p class="crozzo-oficina-edit__title">Revisión tributaria</p>' +
          ofRecoHtml(recos) +
          '</div>' +
          ofCalcHtml(calc) +
          '</div>' +
          '<div class="crozzo-oficina-review__col">' +
          ofEditFormHtml(f, calc) +
          '</div></div>'
        : '';
    return (
      '<tr class="crozzo-oficina-pdf-row" data-pdf-for="' +
      fid +
      '"><td colspan="7">' +
      '<div class="crozzo-oficina-pdf-panel">' +
      '<div class="crozzo-oficina-detail-tabs">' +
      '<button type="button" class="crozzo-oficina-detail-tab' +
      tabPdfCls +
      ' ccl-of-tab-pdf" data-id="' +
      fid +
      '">📄 Documento</button>' +
      '<button type="button" class="crozzo-oficina-detail-tab' +
      tabOfCls +
      ' ccl-of-tab-oficina" data-id="' +
      fid +
      '">🏛️ Revisión oficina</button>' +
      '<button type="button" class="crozzo-oficina-detail-tab' +
      tabCompCls +
      ' ccl-of-tab-comprobante" data-id="' +
      fid +
      '">🧾 Comprobante' +
      (ofHasComprobantePago(f) ? '' : '') +
      '</button>' +
      (provId || provNom
        ? '<button type="button" class="crozzo-oficina-detail-tab' +
          tabHistCls +
          ' ccl-of-tab-historial" data-id="' +
          fid +
          '" data-prov-id="' +
          esc(String(provId || '')) +
          '">💳 Historial pagos</button>'
        : '') +
      docTabs +
      '<div style="flex:1"></div>' +
      '<a class="btn btn-ghost btn-sm ccl-of-pdf-newtab" data-id="' +
      fid +
      '" href="#" target="_blank" rel="noopener" style="display:none">↗ Nueva pestaña</a>' +
      '<button type="button" class="btn btn-ghost btn-sm ccl-of-cerrar-pdf" data-id="' +
      fid +
      '">× Cerrar</button>' +
      '</div>' +
      '<div class="crozzo-oficina-pdf-panel__head" style="display:none"><span id="ccl-of-pdf-label-' +
      fid +
      '"></span></div>' +
      pdfBlock +
      oficinaBlock +
      comprobanteBlock +
      historialBlock +
      '</div></td></tr>'
    );
  }

  function ofPdfPanelRowHtml(f, docs) {
    return ofDetailPanelRowHtml(f, docs);
  }

  function ofRowHtml(f) {
    var est = String(f.estado || '').toLowerCase();
    var pending = est !== 'pagada';
    var docs = ofResolveAdjuntos(f);
    var hasDoc = docs.length > 0;
    var expanded = String(ofUi.expandedId || '') === String(f.id);
    var actions = '';
    if (pending) {
      actions +=
        '<button type="button" class="btn btn-primary btn-sm ccl-of-pagar" data-id="' + esc(f.id) + '" title="Registrar pago y enviar a planilla">✓ Pagar</button>' +
        '<button type="button" class="btn btn-outline btn-sm ccl-of-proceso" data-id="' + esc(f.id) + '">En proceso</button>';
    } else {
      actions += '<span class="crozzo-oficina-ref">En cola planilla</span>';
    }
    var ref = f.numeroFactura
      ? '<div class="crozzo-oficina-ref">Fact. ' + esc(f.numeroFactura) + '</div>'
      : f.recepcionId
        ? '<div class="crozzo-oficina-ref">Recepción · ' + esc(String(f.recepcionId).slice(-8)) + '</div>'
        : '';
    var docCell =
      '<div class="crozzo-oficina-doc-cell">' +
      (hasDoc
        ? '<button type="button" class="crozzo-oficina-doc-btn ccl-of-ver-pdf' +
          (expanded && ofUi.expandedTab === 'pdf' ? ' is-active' : '') +
          '" data-id="' +
          esc(f.id) +
          '" title="Ver factura PDF">📄</button>'
        : '<span class="crozzo-oficina-doc-none">—</span>') +
      (ofHasComprobantePago(f)
        ? '<button type="button" class="crozzo-oficina-doc-btn ccl-of-comp-ver' +
          (expanded && ofUi.expandedTab === 'comprobante' ? ' is-active' : '') +
          '" data-id="' +
          esc(f.id) +
          '" title="Ver comprobante de pago">🧾</button>'
        : est === 'pagada'
          ? '<label class="crozzo-oficina-doc-btn" title="Adjuntar comprobante" style="cursor:pointer">📎<input type="file" class="ccl-of-comp-file" data-id="' +
            esc(f.id) +
            '" accept="application/pdf,image/*,.jpg,.jpeg,.png,.webp" hidden></label>'
          : '') +
      '</div>';
    var rowClass = 'crozzo-oficina-data-row' + (pending ? ' is-pending' : '') + (expanded ? ' is-expanded' : '');
    var provForRow = ofGetProveedor(f);
    var provBadges =
      PD() && PD().renderProveedorDocsRowBadges && provForRow ? PD().renderProveedorDocsRowBadges(provForRow) : '';
    var html =
      '<tr class="' +
      rowClass +
      '">' +
      '<td>' +
      esc(ofFormatFecha(ofFacturaDate(f))) +
      ref +
      '</td>' +
      '<td><strong>' +
      esc(f.proveedorNombre || '—') +
      '</strong>' +
      provBadges +
      (f.notas ? '<div class="crozzo-oficina-ref">' + esc(String(f.notas).slice(0, 60)) + '</div>' : '') +
      '</td>' +
      '<td class="num">' +
      fmtMoney(f.valor) +
      '</td>' +
      '<td><span class="crozzo-oficina-metodo">' +
      esc(ofMetodoLabel(f.metodo)) +
      '</span></td>' +
      '<td>' +
      ofEstadoBadge(f.estado) +
      '</td>' +
      '<td>' +
      docCell +
      '</td>' +
      '<td><div class="crozzo-oficina-row-actions">' +
      '<button type="button" class="btn btn-outline btn-sm ccl-of-revisar' +
      (expanded && ofUi.expandedTab === 'oficina' ? ' btn-primary' : '') +
      '" data-id="' +
      esc(f.id) +
      '">🏛️ Revisar</button> ' +
      actions +
      '</div></td></tr>';
    if (expanded) html += ofDetailPanelRowHtml(f, docs);
    return html;
  }

  function ofViewProvDocInline(host, provId, docKey) {
    var PDm = PD();
    if (!PDm || !host || !provId || !docKey) return;
    ofUi.activeProvDocKey = docKey;
    var prov = ofGetProveedor({ proveedorId: provId });
    var blobId = PDm.getProveedorDocBlobId ? PDm.getProveedorDocBlobId(prov, docKey) : null;
    if (!blobId) {
      toast('Documento no archivado', 'warning');
      return;
    }
    var panel = host.querySelector('[data-prov-docs="' + provId + '"]');
    if (panel) {
      panel.querySelectorAll('.crozzo-of-doc-chip').forEach(function (chip) {
        chip.classList.toggle('is-active', chip.getAttribute('data-doc-chip') === docKey);
      });
    }
    var previewWrap = host.querySelector('[data-prov-docs-preview="' + provId + '"]');
    var hint = previewWrap && previewWrap.querySelector('.crozzo-of-docs-preview__hint');
    var box = host.querySelector('[data-doc-preview-box="' + provId + '"]');
    if (hint) hint.style.display = 'none';
    if (box) {
      box.style.display = '';
      if (PDm.mountBlobPreview) {
        PDm.mountBlobPreview(box, blobId, { maxWidth: box.clientWidth || 480, loadingText: 'Cargando…' });
      }
    }
  }

  function ofMountProvDocPreview(host, facturaId) {
    var fac = ofListAll().find(function (x) {
      return String(x.id) === String(facturaId);
    });
    if (!fac || !fac.proveedorId || !host) return;
    var PDm = PD();
    var prov = ofGetProveedor(fac);
    if (!PDm || !PDm.proveedorDocsSummary || !prov) return;
    var sum = PDm.proveedorDocsSummary(prov);
    var key = ofUi.activeProvDocKey;
    if (!key || !PDm.getProveedorDocBlobId(prov, key)) {
      key = sum.present.length ? sum.present[0].key : null;
    }
    if (key) ofViewProvDocInline(host, fac.proveedorId, key);
  }

  function ofExpandFactura(host, facturaId, tab) {
    ofRevokeAllPdfUrls();
    ofUi.expandedId = facturaId;
    ofUi.expandedTab = tab || 'oficina';
    ofUi.expandedAdjIdx = 0;
    host.innerHTML = CrozzoSanitize.sanitizeHtml(renderOficina());
    if (ofUi.expandedTab === 'pdf') ofMountPdfPreview(host, facturaId, 0);
    if (ofUi.expandedTab === 'oficina') ofMountProvDocPreview(host, facturaId);
    if (ofUi.expandedTab === 'comprobante') ofMountComprobantePreview(host, facturaId);
    setTimeout(function () {
      var panel = host.querySelector('[data-pdf-for="' + facturaId + '"]');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  function ofSaveEditFromDom(host, facturaId) {
    var fid = String(facturaId);
    var q = function (sel) {
      return host.querySelector(sel + '[data-id="' + fid + '"]');
    };
    var valor = Number(q('.ccl-of-ed-valor') && q('.ccl-of-ed-valor').value) || 0;
    if (valor <= 0) return toast('Indique un valor válido', 'warning');
    var retF = Number(q('.ccl-of-ed-retf') && q('.ccl-of-ed-retf').value) || 0;
    var retI = Number(q('.ccl-of-ed-reti') && q('.ccl-of-ed-reti').value) || 0;
    var confirm = !!(q('.ccl-of-ed-confirm-ret') && q('.ccl-of-ed-confirm-ret').checked);
    var provSel = q('.ccl-of-ed-prov');
    var patch = {
      proveedorId: provSel && provSel.value,
      numeroFactura: (q('.ccl-of-ed-num') && q('.ccl-of-ed-num').value) || '',
      valor: valor,
      fecha: (q('.ccl-of-ed-fecha') && q('.ccl-of-ed-fecha').value) || ofTodayIso(),
      metodo: (q('.ccl-of-ed-metodo') && q('.ccl-of-ed-metodo').value) || 'transferencia',
      estado: (q('.ccl-of-ed-estado') && q('.ccl-of-ed-estado').value) || 'pendiente',
      notas: (q('.ccl-of-ed-notas') && q('.ccl-of-ed-notas').value) || '',
      oficinaMeta: {
        retencionFuente: retF,
        retencionICA: retI,
        netoPagar: valor - retF - retI,
        retencionesConfirmadas: confirm,
        revisadoAt: new Date().toISOString(),
      },
    };
    var res = R();
    if (!res) return toast('Reservorio no disponible', 'warning');
    if (res.actualizarFacturaOficina) res.actualizarFacturaOficina(fid, patch);
    else if (res.actualizarEstadoOficina) res.actualizarEstadoOficina(fid, patch.estado, patch);
    toast('Correcciones guardadas', 'success');
    refreshOficina(host, true);
  }

  function ofExportCsv(list) {
    if (!list.length) return toast('No hay registros para exportar', 'warning');
    var lines = ['Fecha,Proveedor,NumeroFactura,Valor,Metodo,Estado,Comprobante,Notas'];
    list.forEach(function (f) {
      lines.push(
        [
          ofFacturaDate(f),
          '"' + String(f.proveedorNombre || '').replace(/"/g, '""') + '"',
          '"' + String(f.numeroFactura || '').replace(/"/g, '""') + '"',
          Number(f.valor) || 0,
          ofNormMetodo(f.metodo),
          f.estado || '',
          ofHasComprobantePago(f) ? 'si' : 'no',
          '"' + String(f.notas || '').replace(/"/g, '""') + '"',
        ].join(',')
      );
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'oficina-pagos-' + ofTodayIso() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('CSV descargado', 'success');
  }

  function renderOficina() {
    injectOficinaStyles();
    if (global.__crozzoOficinaExpandId) {
      ofUi.expandedId = global.__crozzoOficinaExpandId;
      ofUi.expandedTab = 'oficina';
      global.__crozzoOficinaExpandId = null;
    }
    var res = R();
    var all = ofListAll();
    var filtered = ofFilterList(all);
    var kpis = ofComputeKpis(all);
    var counts = ofTabCounts(all);
    var conPdf = all.filter(ofHasDocument).length;
    var colaPlan = 0;
    var colaMonto = 0;
    if (res && res.listFeed) {
      (res.listFeed(200) || []).forEach(function (f) {
        if (f && f.estado === 'pendiente' && String(f.origen || '').toLowerCase() === 'oficina') {
          colaPlan++;
          colaMonto += Number(f.monto) || 0;
        }
      });
    }
    var rows = filtered.slice(0, 120).map(ofRowHtml).join('');
    var summary =
      filtered.length === all.length
        ? '<strong>' + all.length + '</strong> facturas en reservorio'
        : '<strong>' + filtered.length + '</strong> de ' + all.length + ' facturas';

    function tabBtn(id, label, n) {
      var active = ofUi.tab === id ? ' is-active' : '';
      return (
        '<button type="button" class="crozzo-oficina-tab' + active + '" data-of-tab="' + esc(id) + '">' +
        esc(label) + '<span class="crozzo-oficina-tab__count">(' + n + ')</span></button>'
      );
    }

    function presetBtn(id, label) {
      var active =
        ofUi.preset === id || (id === 'all' && !ofUi.preset && !ofUi.desde && !ofUi.hasta) ? ' is-active' : '';
      return '<button type="button" class="crozzo-oficina-preset' + active + '" data-of-preset="' + esc(id) + '">' + esc(label) + '</button>';
    }

    var filterHidden = all.length > 0 && filtered.length < all.length;
    var emptyMsg =
      all.length > 0 && !filtered.length
        ? 'Ninguna factura coincide con los filtros (' + all.length + ' en total). Pulse «Ver todas» o limpie filtros.'
        : ofUi.tab === 'transferencias'
          ? 'Sin transferencias — pruebe pestaña «Todas»'
          : ofUi.tab === 'efectivo'
            ? 'Sin pagos en efectivo — pruebe pestaña «Todas»'
            : ofUi.tab === 'tarjetas'
              ? 'Sin pagos con tarjeta — pruebe pestaña «Todas»'
              : 'Sin facturas registradas — cargue recepciones o registre un pago manual';

    var filterBanner = filterHidden
      ? '<div class="crozzo-oficina-filter-banner">' +
        '<span>Los filtros ocultan <strong>' +
        (all.length - filtered.length) +
        '</strong> factura(s). Mostrando <strong>' +
        filtered.length +
        '</strong>.</span>' +
        '<button type="button" class="btn btn-primary btn-sm" id="ccl-of-show-all">Ver todas</button>' +
        '</div>'
      : '';

    var hubTop =
      global.CrozzoOficinaHub && global.CrozzoOficinaHub.renderShell
        ? global.CrozzoOficinaHub.renderShell({
            kpis: kpis,
            colaPlan: colaPlan,
            colaMonto: colaMonto,
          })
        : '<div class="crozzo-of-hub__bar">' +
          '<div class="crozzo-of-hub__stats">' +
          '<span class="crozzo-of-hub__stat crozzo-of-hub__stat--warn"><strong>' +
          kpis.pendientes +
          '</strong> pendientes</span>' +
          '<span class="crozzo-of-hub__stat"><strong>' +
          fmtMoney(kpis.valorPend) +
          '</strong> por pagar</span>' +
          '<span class="crozzo-of-hub__stat crozzo-of-hub__stat--ok"><strong>' +
          kpis.pagadasHoy +
          '</strong> pagadas hoy</span>' +
          '<span class="crozzo-of-hub__stat' +
          (colaPlan ? ' crozzo-of-hub__stat--warn' : '') +
          '"><strong>' +
          (colaPlan ? colaPlan + ' · ' + fmtMoney(colaMonto) : '—') +
          '</strong> planilla</span>' +
          '</div>' +
          '<div class="crozzo-of-hub__actions">' +
          '<button type="button" class="btn btn-outline btn-sm' +
          (colaPlan ? ' crozzo-of-planilla-queue' : '') +
          '" id="ccl-of-go-planilla">Planilla' +
          (colaPlan ? ' <span class="crozzo-pl-tab-badge">' + colaPlan + '</span>' : '') +
          '</button>' +
          '<button type="button" class="btn btn-outline btn-sm" id="ccl-of-go-recepcion">Recepción</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="ccl-of-export">CSV</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="ccl-of-refresh" title="Actualizar">↻</button>' +
          '</div></div>';

    var filtersBlock =
      '<button type="button" class="crozzo-oficina-filter-toggle" id="ccl-of-toggle-filters" aria-expanded="' +
      (ofUi.filtersOpen ? 'true' : 'false') +
      '">' +
      '<span>Filtros</span><span>' +
      (ofUi.filtersOpen ? '▲' : '▼') +
      '</span></button>' +
      (ofUi.filtersOpen
        ? '<div class="crozzo-oficina-filter crozzo-oficina-filter-panel">' +
          '<div class="crozzo-oficina-filter__grid">' +
          '<div class="form-group" style="margin:0"><label class="form-label">Rango fechas</label>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<input class="form-input" type="date" id="ccl-of-desde" value="' +
          esc(ofUi.desde) +
          '" style="flex:1;min-width:120px">' +
          '<span style="color:var(--text-muted)">→</span>' +
          '<input class="form-input" type="date" id="ccl-of-hasta" value="' +
          esc(ofUi.hasta) +
          '" style="flex:1;min-width:120px">' +
          '</div>' +
          '<div class="crozzo-oficina-presets">' +
          presetBtn('all', 'Todas') +
          presetBtn('7d', '7 días') +
          presetBtn('mes', 'Este mes') +
          presetBtn('mes-ant', 'Mes ant.') +
          presetBtn('trim', '90 días') +
          '</div></div>' +
          '<div class="form-group" style="margin:0"><label class="form-label">Proveedor</label>' +
          '<select class="form-input" id="ccl-of-f-prov"><option value="">Todos</option>' +
          provOptions(ofUi.provId) +
          '</select></div>' +
          '<div class="form-group" style="margin:0"><label class="form-label">Estado</label>' +
          '<select class="form-input" id="ccl-of-f-estado">' +
          '<option value=""' +
          (ofUi.estado === '' ? ' selected' : '') +
          '>Todos</option>' +
          '<option value="pendiente"' +
          (ofUi.estado === 'pendiente' ? ' selected' : '') +
          '>Pendiente</option>' +
          '<option value="en_proceso"' +
          (ofUi.estado === 'en_proceso' ? ' selected' : '') +
          '>En proceso</option>' +
          '<option value="pagada"' +
          (ofUi.estado === 'pagada' ? ' selected' : '') +
          '>Pagada</option>' +
          '</select></div>' +
          '<div class="form-group" style="margin:0"><label class="form-label">Buscar</label>' +
          '<input class="form-input" id="ccl-of-q" placeholder="Proveedor, Nº factura, notas…" value="' +
          esc(ofUi.q) +
          '">' +
          '</div></div>' +
          '<div class="crozzo-oficina-filter__actions">' +
          '<button type="button" class="btn btn-primary btn-sm" id="ccl-of-apply">Aplicar filtros</button>' +
          '<button type="button" class="btn btn-outline btn-sm" id="ccl-of-clear">Limpiar</button>' +
          '<button type="button" class="btn btn-outline btn-sm crozzo-oficina-chip-solo' +
          (ofUi.soloPdf ? ' btn-primary' : '') +
          '" id="ccl-of-solo-pdf">' +
          (ofUi.soloPdf ? '✓ Con PDF' : 'Con PDF') +
          '</button>' +
          '<span class="crozzo-oficina-filter__summary">' +
          summary +
          '</span></div></div>'
        : '<p class="form-hint crozzo-of-hub__filter-hint">' +
          summary +
          ' · <button type="button" class="btn btn-link btn-sm" id="ccl-of-open-filters" style="padding:0;min-height:0">Filtros</button></p>');

    return (
      '<div class="crozzo-compras-local crozzo-oficina-app crozzo-oficina-hub">' +
      hubTop +
      filterBanner +
      filtersBlock +
      '<div class="crozzo-oficina-toolbar crozzo-of-hub__tabs">' +
      '<div class="crozzo-oficina-tabs">' +
      tabBtn('todas', 'Todas', counts.todas) +
      tabBtn('transferencias', 'Transferencias', counts.transferencias) +
      tabBtn('efectivo', 'Efectivo', counts.efectivo) +
      tabBtn('tarjetas', 'Tarjetas', counts.tarjetas) +
      '</div></div>' +
      '<div class="crozzo-oficina-table-wrap">' +
      '<table class="crozzo-oficina-table"><thead><tr>' +
      '<th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Método</th><th>Estado</th><th>Docs</th><th style="text-align:right">Acciones</th>' +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="7"><div class="crozzo-oficina-empty">' + esc(emptyMsg) + '</div></td></tr>') +
      '</tbody></table></div>' +
      (filtered.length > 120 ? '<p class="form-hint">Mostrando 120 de ' + filtered.length + ' — acote filtros o exporte CSV.</p>' : '') +
      '<button type="button" class="crozzo-oficina-form-toggle" id="ccl-of-toggle-form" aria-expanded="' + (ofUi.formOpen ? 'true' : 'false') + '">' +
      '<span>Pago manual</span><span>' + (ofUi.formOpen ? '▲' : '▼') + '</span></button>' +
      (ofUi.formOpen
        ? '<div class="crozzo-oficina-form-panel">' +
          '<div class="form-grid">' +
          '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-of-prov">' + provOptions() + '</select></div>' +
          '<div class="form-group"><label class="form-label">Nº factura</label><input class="form-input" id="ccl-of-num" placeholder="Opcional"></div>' +
          '<div class="form-group"><label class="form-label">Valor ($)</label><input class="form-input" type="number" id="ccl-of-valor" min="0" step="1"></div>' +
          '<div class="form-group"><label class="form-label">Fecha</label><input class="form-input" type="date" id="ccl-of-fecha" value="' + esc(ofTodayIso()) + '"></div>' +
          '<div class="form-group"><label class="form-label">Método</label><select class="form-input" id="ccl-of-metodo">' +
          '<option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option></select></div>' +
          '<div class="form-group"><label class="form-label">Estado inicial</label><select class="form-input" id="ccl-of-estado">' +
          '<option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="pagada">Pagada</option></select></div>' +
          '<div class="form-group" style="grid-column:1/-1"><label class="form-label">Notas</label><input class="form-input" id="ccl-of-notas" placeholder="Referencia, observaciones…"></div>' +
          '</div>' +
          '<button type="button" class="btn btn-primary" id="ccl-of-save">Guardar registro</button>' +
          '</div>'
        : '') +
      (!res ? '<p class="form-hint" style="color:var(--warning)">Reservorio no cargado — recargue la página.</p>' : '') +
      '</div>'
    );
  }

  function refreshOficina(host, keepExpanded) {
    ofRevokeAllPdfUrls();
    if (!keepExpanded) ofUi.expandedId = null;
    host.innerHTML = CrozzoSanitize.sanitizeHtml(renderOficina());
    if (ofUi.expandedId && ofUi.expandedTab === 'pdf') {
      ofMountPdfPreview(host, ofUi.expandedId, ofUi.expandedAdjIdx || 0);
    }
    if (ofUi.expandedId && ofUi.expandedTab === 'oficina') {
      ofMountProvDocPreview(host, ofUi.expandedId);
    }
  }

  function readOficinaFiltersFromDom(host) {
    var q = host.querySelector('#ccl-of-q');
    var est = host.querySelector('#ccl-of-f-estado');
    var prov = host.querySelector('#ccl-of-f-prov');
    var desde = host.querySelector('#ccl-of-desde');
    var hasta = host.querySelector('#ccl-of-hasta');
    ofUi.q = q ? q.value : ofUi.q;
    ofUi.estado = est ? est.value : ofUi.estado;
    ofUi.provId = prov ? prov.value : ofUi.provId;
    ofUi.desde = desde ? desde.value : ofUi.desde;
    ofUi.hasta = hasta ? hasta.value : ofUi.hasta;
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
    body.innerHTML = CrozzoSanitize.sanitizeHtml(res.renderDashboardHtml({ dias: dias, categoria: cat || undefined }));
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
      tr.innerHTML = CrozzoSanitize.sanitizeHtml(renderRecepcionLineRow().replace(/^<tr[^>]*>|<\/tr>$/g, ''));
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
        tr.innerHTML = CrozzoSanitize.sanitizeHtml(renderRecepcionLineRow().replace(/^<tr[^>]*>|<\/tr>$/g, ''));
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
        host.innerHTML = CrozzoSanitize.sanitizeHtml(renderRecepcion());
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
      host.innerHTML = CrozzoSanitize.sanitizeHtml(renderProcesado());
      bindProcesado(host);
    };
  }

  function bindOficina(host) {
    if (!host) return;
    var res = R();
    if (res && res.runBlobMigration) res.runBlobMigration(res.load());
    if (host._cclOfClick) host.removeEventListener('click', host._cclOfClick);
    if (host._cclOfKey) host.removeEventListener('keydown', host._cclOfKey);
    if (host._cclOfChange) host.removeEventListener('change', host._cclOfChange);

    host._cclOfClick = function (ev) {
      var t = ev.target && ev.target.closest
        ? ev.target.closest(
            '[data-of-tab],[data-of-preset],#ccl-of-apply,#ccl-of-clear,#ccl-of-show-all,#ccl-of-solo-pdf,#ccl-of-refresh,#ccl-of-toggle-form,#ccl-of-toggle-filters,#ccl-of-open-filters,#ccl-of-save,#ccl-of-export,#ccl-of-go-planilla,#ccl-of-go-recepcion,.ccl-of-pagar,.ccl-of-proceso,.ccl-of-ver-pdf,.ccl-of-revisar,.ccl-of-cerrar-pdf,.ccl-of-pdf-doc,.ccl-of-tab-pdf,.ccl-of-tab-oficina,.ccl-of-tab-historial,.ccl-of-tab-comprobante,.ccl-of-comp-ver,.ccl-of-goto-historial,.ccl-of-hist-open,.ccl-of-save-edit,.ccl-of-open-prov,.ccl-of-open-rut,.ccl-of-open-impuestos,.ccl-of-view-prov-doc,.ccl-of-expand-prov-doc'
          )
        : null;
      if (!t) return;

      if (t.id === 'ccl-of-go-planilla') {
        global.__crozzoPlanillaTab = 'cola';
        if (typeof global.navigateTo === 'function') global.navigateTo('nomina-planilla');
        return;
      }
      if (t.id === 'ccl-of-go-recepcion') {
        if (typeof global.navigateTo === 'function') global.navigateTo('compras-recepcion');
        return;
      }
      if (t.id === 'ccl-of-export') {
        ofExportCsv(ofFilterList(ofListAll()));
        return;
      }
      if (t.classList.contains('ccl-of-ver-pdf')) {
        var idPdf = t.getAttribute('data-id');
        if (!idPdf) return;
        if (String(ofUi.expandedId) === String(idPdf) && ofUi.expandedTab === 'pdf') {
          ofRevokeAllPdfUrls();
          ofUi.expandedId = null;
          refreshOficina(host);
          return;
        }
        ofExpandFactura(host, idPdf, 'pdf');
        return;
      }
      if (t.classList.contains('ccl-of-revisar')) {
        var idRev = t.getAttribute('data-id');
        if (!idRev) return;
        if (String(ofUi.expandedId) === String(idRev) && ofUi.expandedTab === 'oficina') {
          ofRevokeAllPdfUrls();
          ofUi.expandedId = null;
          refreshOficina(host);
          return;
        }
        ofExpandFactura(host, idRev, 'oficina');
        return;
      }
      if (t.classList.contains('ccl-of-tab-pdf')) {
        ofUi.expandedTab = 'pdf';
        refreshOficina(host, true);
        return;
      }
      if (t.classList.contains('ccl-of-tab-oficina')) {
        ofUi.expandedTab = 'oficina';
        refreshOficina(host, true);
        return;
      }
      if (t.classList.contains('ccl-of-tab-historial')) {
        ofUi.expandedTab = 'historial';
        refreshOficina(host, true);
        return;
      }
      if (t.classList.contains('ccl-of-tab-comprobante')) {
        ofUi.expandedTab = 'comprobante';
        refreshOficina(host, true);
        return;
      }
      if (t.classList.contains('ccl-of-comp-ver')) {
        var idComp = t.getAttribute('data-id');
        if (!idComp) return;
        if (String(ofUi.expandedId) === String(idComp) && ofUi.expandedTab === 'comprobante') {
          ofRevokeAllPdfUrls();
          ofUi.expandedId = null;
          refreshOficina(host);
          return;
        }
        ofExpandFactura(host, idComp, 'comprobante');
        return;
      }
      if (t.classList.contains('ccl-of-goto-historial')) {
        var idHistGo = t.getAttribute('data-id');
        if (!idHistGo) return;
        ofUi.expandedId = idHistGo;
        ofUi.expandedTab = 'historial';
        refreshOficina(host, true);
        return;
      }
      if (t.classList.contains('ccl-of-hist-open')) {
        var histId = t.getAttribute('data-id');
        if (histId) ofExpandFactura(host, histId, 'oficina');
        return;
      }
      if (t.classList.contains('ccl-of-save-edit')) {
        ofSaveEditFromDom(host, t.getAttribute('data-id'));
        return;
      }
      if (t.classList.contains('ccl-of-view-prov-doc')) {
        var pidDoc = t.getAttribute('data-prov-id');
        var docKey = t.getAttribute('data-doc-key');
        if (pidDoc && docKey) ofViewProvDocInline(host, pidDoc, docKey);
        return;
      }
      if (t.classList.contains('ccl-of-expand-prov-doc')) {
        var pidExp = t.getAttribute('data-prov-id');
        var keyExp = t.getAttribute('data-doc-key');
        if (PD() && PD().openProveedorDocByKey && pidExp && keyExp) PD().openProveedorDocByKey(pidExp, keyExp);
        return;
      }
      if (t.classList.contains('ccl-of-open-prov')) {
        var pidProv = t.getAttribute('data-prov-id');
        if (typeof global.crozzoNavProveedores === 'function') global.crozzoNavProveedores(pidProv || '');
        else if (typeof global.navigateTo === 'function') global.navigateTo('compras-proveedores');
        if (pidProv) global.__crozzoOficinaProvFocus = pidProv;
        return;
      }
      if (t.classList.contains('ccl-of-open-rut')) {
        var pidRut = t.getAttribute('data-prov-id');
        var PDmR = PD();
        if (pidRut && PDmR && PDmR.openProveedorRut) {
          var provR = (R() && R().getProveedor && R().getProveedor(pidRut)) || ofGetProveedor({ proveedorId: pidRut });
          if (provR && provR.legal && provR.legal.document && provR.legal.document.blobId) {
            PDmR.openProveedorRut(pidRut);
            return;
          }
        }
        if (typeof global.crozzoNavProveedores === 'function') global.crozzoNavProveedores('import');
        else if (typeof global.navigateTo === 'function') global.navigateTo('compras-proveedores');
        if (pidRut) global.__crozzoOficinaProvFocus = pidRut;
        return;
      }
      if (t.classList.contains('ccl-of-open-impuestos')) {
        if (typeof global.navigateTo === 'function') global.navigateTo('config-impuestos');
        return;
      }
      if (t.classList.contains('ccl-of-cerrar-pdf')) {
        ofRevokeAllPdfUrls();
        ofUi.expandedId = null;
        refreshOficina(host);
        return;
      }
      if (t.classList.contains('ccl-of-pdf-doc')) {
        var idDoc = t.getAttribute('data-id');
        var idxDoc = Number(t.getAttribute('data-idx')) || 0;
        if (!idDoc) return;
        ofUi.expandedAdjIdx = idxDoc;
        host.querySelectorAll('.ccl-of-pdf-doc[data-id="' + idDoc + '"]').forEach(function (btn) {
          btn.classList.toggle('is-active', btn === t);
        });
        ofMountPdfPreview(host, idDoc, idxDoc);
        return;
      }
      if (t.id === 'ccl-of-toggle-filters') {
        ofUi.filtersOpen = !ofUi.filtersOpen;
        refreshOficina(host, true);
        return;
      }
      if (t.id === 'ccl-of-open-filters') {
        ofUi.filtersOpen = true;
        refreshOficina(host, true);
        return;
      }
      if (t.id === 'ccl-of-show-all') {
        ofClearAllFilters();
        refreshOficina(host);
        toast('Mostrando todas las facturas', 'info');
        return;
      }
      if (t.id === 'ccl-of-toggle-form') {
        ofUi.formOpen = !ofUi.formOpen;
        refreshOficina(host, true);
        return;
      }
      if (t.id === 'ccl-of-refresh') {
        refreshOficina(host);
        return;
      }
      if (t.id === 'ccl-of-solo-pdf') {
        ofUi.soloPdf = !ofUi.soloPdf;
        refreshOficina(host, true);
        return;
      }
      if (t.id === 'ccl-of-clear') {
        ofClearAllFilters();
        refreshOficina(host);
        return;
      }
      if (t.id === 'ccl-of-apply') {
        readOficinaFiltersFromDom(host);
        ofUi.preset = '';
        refreshOficina(host);
        return;
      }
      if (t.getAttribute('data-of-tab')) {
        ofUi.tab = t.getAttribute('data-of-tab') || 'todas';
        refreshOficina(host);
        return;
      }
      if (t.getAttribute('data-of-preset')) {
        ofApplyPreset(t.getAttribute('data-of-preset'));
        refreshOficina(host);
        return;
      }
      if (t.classList.contains('ccl-of-pagar')) {
        var idPay = t.getAttribute('data-id');
        if (!idPay || !R()) return;
        var facPay = ofListAll().find(function (x) {
          return String(x.id) === String(idPay);
        });
        if (facPay) {
          var provPay = ofGetProveedor(facPay);
          if (String(facPay.estado || '').toLowerCase() === 'pagada') {
            toast('Esta factura ya está marcada como pagada', 'info');
            return;
          }
          var metPay = ofNormMetodo(facPay.metodo);
          if (metPay === 'por_definir' || !metPay) {
            toast('Indique medio de pago (efectivo, tarjeta o transferencia) antes de pagar', 'warning');
            ofExpandFactura(host, idPay, 'oficina');
            return;
          }
          var calcPay = ofCalcRetenciones(facPay, provPay);
          var recosPay = ofRecomendacionesOficina(facPay, provPay, calcPay);
          var danger = recosPay.filter(function (r) {
            return r.tipo === 'danger';
          });
          if (danger.length) {
            toast(danger[0].titulo + ' — ' + danger[0].texto, 'warning');
            ofExpandFactura(host, idPay, 'oficina');
            return;
          }
          var metaPay = facPay.oficinaMeta || {};
          if ((calcPay.retFuente > 0 || calcPay.retIca > 0) && !metaPay.retencionesConfirmadas) {
            var msg =
              'Retenciones sugeridas: ' +
              fmtMoney(calcPay.retFuente + calcPay.retIca) +
              '. Neto a pagar: ' +
              fmtMoney(calcPay.neto) +
              '. ¿Confirma pago sin marcar retenciones revisadas?';
            if (typeof global.confirm === 'function' && !global.confirm(msg)) {
              ofExpandFactura(host, idPay, 'oficina');
              return;
            }
          }
        }
        ofOpenModalPago(host, facPay);
        return;
      }
      if (t.classList.contains('ccl-of-proceso')) {
        var idProc = t.getAttribute('data-id');
        if (!idProc || !R()) return;
        R().actualizarEstadoOficina(idProc, 'en_proceso');
        toast('Marcada en proceso', 'info');
        refreshOficina(host);
        return;
      }
      if (t.id === 'ccl-of-save') {
        if (!R()) return toast('Reservorio no disponible', 'warning');
        var prov = host.querySelector('#ccl-of-prov');
        var val = host.querySelector('#ccl-of-valor');
        var met = host.querySelector('#ccl-of-metodo');
        var est = host.querySelector('#ccl-of-estado');
        var num = host.querySelector('#ccl-of-num');
        var notas = host.querySelector('#ccl-of-notas');
        var fecha = host.querySelector('#ccl-of-fecha');
        var pid = prov && prov.value;
        if (!pid) return toast('Seleccione proveedor', 'warning');
        var valor = Number(val && val.value) || 0;
        if (valor <= 0) return toast('Indique un valor mayor a cero', 'warning');
        var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
        R().registrarOficina({
          proveedorId: pid,
          proveedorNombre: nombre,
          valor: valor,
          metodo: (met && met.value) || 'transferencia',
          estado: (est && est.value) || 'pendiente',
          numeroFactura: (num && num.value) || '',
          notas: (notas && notas.value) || '',
          fecha: (fecha && fecha.value) || ofTodayIso(),
        });
        toast('Registro guardado en oficina', 'success');
        ofUi.formOpen = false;
        refreshOficina(host);
      }
    };

    host._cclOfKey = function (ev) {
      if (ev.key === 'Enter' && ev.target && (ev.target.id === 'ccl-of-q' || ev.target.id === 'ccl-of-desde' || ev.target.id === 'ccl-of-hasta')) {
        readOficinaFiltersFromDom(host);
        refreshOficina(host);
      }
    };

    host.addEventListener('click', host._cclOfClick);
    host.addEventListener('keydown', host._cclOfKey);
    host._cclOfChange = function (ev) {
      var t = ev.target;
      if (!t || !t.classList || !t.classList.contains('ccl-of-comp-file')) return;
      var fid = t.getAttribute('data-id');
      var file = t.files && t.files[0];
      if (!fid || !file) return;
      ofHandleComprobanteFile(host, fid, file);
      t.value = '';
    };
    host.addEventListener('change', host._cclOfChange);
    if (ofUi.expandedId && ofUi.expandedTab === 'pdf') {
      setTimeout(function () {
        ofMountPdfPreview(host, ofUi.expandedId, ofUi.expandedAdjIdx || 0);
      }, 0);
    }
    if (ofUi.expandedId && ofUi.expandedTab === 'oficina') {
      setTimeout(function () {
        ofMountProvDocPreview(host, ofUi.expandedId);
        var panel = host.querySelector('[data-pdf-for="' + ofUi.expandedId + '"]');
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
    if (ofUi.expandedId && ofUi.expandedTab === 'comprobante') {
      setTimeout(function () {
        ofMountComprobantePreview(host, ofUi.expandedId);
        var panel = host.querySelector('[data-pdf-for="' + ofUi.expandedId + '"]');
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
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
 * Bona Origen — Cotizaciones y comparador de costeo (sistema vs proveedores vs competencia)
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
    if (el) el.innerHTML = CrozzoSanitize.sanitizeHtml(renderSessionSheet());
  }

  function refreshAddSection(host) {
    host = getCotRoot(host) || host;
    if (!host) return;
    preserveSearchFocus(host, function () {
      var sheetHost = host.querySelector('#crozzoCotSessionSheetHost');
      if (sheetHost) sheetHost.innerHTML = CrozzoSanitize.sanitizeHtml(renderSessionSheet());
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
      if (deltaEl && sc.tipo !== 'sistema') deltaEl.innerHTML = CrozzoSanitize.sanitizeHtml(renderDeltaBlock(sys, sc));
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
        titulo: 'Cotización vs costeo — Bona Origen',
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
    ctx.fillText('Bona Origen · Cotizaciones vs costeo', mx, ph - 26);
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
    var title = 'Comparativo de cotizaciones · Bona Origen';
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
    var title = 'Comparativo de cotizaciones · Bona Origen';
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
      host.innerHTML = CrozzoSanitize.sanitizeHtml(renderPanel());
      init(host);
    };
    var cat = C();
    if (cat && cat.ensureReady) cat.ensureReady(boot);
    else boot();
  };
})(typeof window !== 'undefined' ? window : globalThis);


/* --- CrozzoCentroCompras.js --- */

/**
 * Contenido de compras (sin menú duplicado): módulos nativos Bona Origen.
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

  function setOficinaPageChrome(on) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('crozzo-page-oficina', !!on);
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
      host.innerHTML = CrozzoSanitize.sanitizeHtml(global.CrozzoRecepcionFacturas.render());
      global.CrozzoRecepcionFacturas.init(host);
    } else if (global.CrozzoComprasLocal) {
      host.innerHTML = CrozzoSanitize.sanitizeHtml(global.CrozzoComprasLocal.render(mod));
      global.CrozzoComprasLocal.init(host, mod);
    } else {
      host.innerHTML = CrozzoSanitize.sanitizeHtml('<div class="card"><p>Cargue CrozzoComprasLocal.js</p></div>');
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
    setOficinaPageChrome(mod === 'oficina');
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
        ? renderComprasProveedores({ view: 'ordenes' })
        : '<div class="card"><p>Módulo de órdenes no disponible</p></div>') +
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
        if (typeof initComprasProveedores === 'function') initComprasProveedores({ view: 'ordenes' });
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
    if (page === 'compras-proceso-entrada') return { page: 'compras-recepcion', module: null };
    if (page === 'compras-ordenes') return { page: 'compras-ordenes', module: null };
    return { page: page, module: null };
  };

  function centroComprasTeardown() {
    setOficinaPageChrome(false);
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
  if (global.CrozzoBonaOrigen) return;

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
    var showEmblem = opts.emblem === true;
    var showLogo = !!opts.logoFrame;
    return (
      '<div class="bona-brand' +
      (opts.compact ? ' bona-brand--compact' : '') +
      (opts.inline ? ' bona-brand--inline' : '') +
      '">' +
      (showEmblem ? emblemSvg(opts.size || 36) : '') +
      (showLogo ? logoFrame(opts.frameSize) : '') +
      '<div class="bona-brand__text">' +
      '<span class="bona-brand__name">BON<span class="bona-brand__a">Λ</span></span>' +
      '<span class="bona-brand__tag">origen</span>' +
      (opts.hint ? '<span class="bona-brand__hint">' + esc(opts.hint) + '</span>' : '') +
      '</div></div>'
    );
  }

  /** Solo tipografía BONΛ origen — sin logo, eyebrow ni hint. */
  function brandNameOnly(opts) {
    opts = opts || {};
    return (
      '<span class="bona-brand-name-only' +
      (opts.compact ? ' bona-brand-name-only--compact' : '') +
      (opts.center ? ' bona-brand-name-only--center' : '') +
      '" aria-label="BONA origen">' +
      '<span class="bona-brand__name">BON<span class="bona-brand__a">Λ</span></span>' +
      '<span class="bona-brand__tag">origen</span>' +
      '</span>'
    );
  }

  /** Hero producción — editorial luxury (solo Centro de procesos) */
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
      '--bona-font:"DM Sans",system-ui,sans-serif;' +
      '--bona-ease:cubic-bezier(.22,1,.36,1);--bona-ease-out:cubic-bezier(.16,1,.3,1)}' +
      'html[data-theme="bona-origen"]{color-scheme:light;' +
      '--font-sans:var(--bona-font);--gold-primary:var(--bona-gold);--gold-light:var(--bona-gold-light);--gold-dark:var(--bona-gold-dark);' +
      '--gold-glow:rgba(181,154,109,.4);--gradient-gold:linear-gradient(135deg,var(--bona-gold-light) 0%,var(--bona-gold) 50%,var(--bona-gold-dark) 100%);' +
      '--bg-primary:var(--bona-cream);--bg-secondary:var(--bona-cream-2);--bg-tertiary:var(--bona-cream-3);' +
      '--bg-card:#FFFFFF;--border:var(--bona-line);--text-primary:var(--bona-charcoal);' +
      '--text-secondary:var(--bona-charcoal-soft);--text-muted:#6B6560;' +
      '--accent:var(--bona-gold);--accent-hover:var(--bona-gold-light);--accent-rgb:181,154,109;' +
      '--accent-08:var(--bona-gold-08);--accent-10:var(--bona-gold-12);--accent-12:var(--bona-gold-18);' +
      '--accent-20:var(--bona-gold-22);--focus-ring:var(--bona-gold);--shadow:var(--bona-shadow-sm);--shadow-lg:var(--bona-shadow-lg)}' +
      'html[data-theme="bona-origen"] body{font-family:var(--bona-font)}' +
      'body.bona-enterprise-chrome{font-feature-settings:"kern" 1,"liga" 1}' +
      '.bona-logo-frame{display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(165deg,var(--bg-card) 0%,var(--bg-secondary) 100%);border:1px solid var(--border);border-radius:var(--bona-radius-md);padding:10px;box-shadow:var(--bona-shadow-sm);flex-shrink:0;transition:box-shadow .4s var(--bona-ease),transform .4s var(--bona-ease)}' +
      '.bona-logo-frame img{display:block;width:100%;height:100%;object-fit:contain}' +
      '.bona-logo-frame--hero{width:80px;height:80px;padding:12px;border-radius:var(--bona-radius-lg);box-shadow:var(--bona-shadow),var(--bona-shadow-gold)}' +
      '.bona-logo-frame--live{width:32px;height:32px;padding:5px;border-radius:var(--bona-radius-sm)}' +
      '.bona-logo-frame--xs{width:26px;height:26px;padding:4px;border-radius:8px}' +
      '.bona-brand{display:flex;align-items:center;gap:14px;font-family:var(--bona-font)}' +
      '.bona-brand__text{display:flex;flex-direction:column;line-height:1.05;gap:2px}' +
      '.bona-brand__name{font-family:var(--bona-font-display);font-size:2rem;font-weight:600;letter-spacing:.2em;color:var(--text-primary);line-height:1}' +
      '.bona-brand__name--sm{font-size:.85rem;letter-spacing:.16em}' +
      '.bona-brand__a{font-weight:400;font-style:italic;color:var(--accent);letter-spacing:0}' +
      '.bona-brand__tag{font-size:.68rem;letter-spacing:.38em;text-transform:uppercase;color:#6b5328;font-weight:500}' +
      '.bona-brand__tag--sm{font-size:.58rem;letter-spacing:.28em}' +
      '.bona-brand__hint{font-size:11px;color:var(--text-secondary);margin-top:8px;letter-spacing:.02em;font-weight:400;opacity:.85}' +
      '.bona-brand-name-only{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;line-height:1}' +
      '.bona-brand-name-only--center{align-items:center;text-align:center}' +
      '.bona-brand-name-only--compact .bona-brand__name{font-size:1.25rem;letter-spacing:.14em}' +
      '.bona-brand-name-only--compact .bona-brand__tag{font-size:.58rem;letter-spacing:.3em}' +
      '.crozzo-brand-txt.bona-brand-txt--styled{display:flex;flex-direction:column;align-items:flex-start;gap:2px;font-size:inherit;letter-spacing:0;text-transform:none}' +
      '.crozzo-brand-txt.bona-brand-txt--styled .bona-brand__name{font-size:1.15rem;letter-spacing:.14em}' +
      '.crozzo-brand-txt.bona-brand-txt--styled .bona-brand__tag{font-size:.55rem;letter-spacing:.28em}' +
      '.login-card-header .crozzo-brand-txt.bona-brand-txt--styled{align-items:center}' +
      '.crozzo-shift-welcome__modal .bona-brand-name-only{margin:0 auto 14px}' +
      '.bona-hero-brand--premium{display:flex;align-items:center;gap:28px;margin-bottom:8px}' +
      '.bona-hero-brand__visual{position:relative;flex-shrink:0}' +
      '.bona-hero-brand__halo{position:absolute;inset:-12px;border-radius:50%;background:radial-gradient(circle,rgba(181,154,109,.15) 0%,transparent 70%);pointer-events:none}' +
      '.bona-hero-brand__eyebrow{font-size:10px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--bona-gold-dark);margin-bottom:6px;display:block}' +
      '.bona-hero-brand__copy .bona-brand__name{font-size:2.4rem}' +
      '.crozzo-brand-dual--sidebar{position:relative;padding:14px 12px;border-radius:var(--bona-radius-lg);background:linear-gradient(165deg,var(--bg-card) 0%,var(--bg-secondary) 100%);border:1px solid var(--border);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.08));gap:12px}' +
      'html[data-theme="bona-origen"] .crozzo-brand-dual--sidebar,body.bona-enterprise-chrome .crozzo-brand-dual--sidebar{background:linear-gradient(165deg,var(--bg-card) 0%,var(--bona-cream-2) 100%);border-color:var(--bona-line-strong)}' +
      '.crozzo-brand-slot.bona-platform-live{border-color:var(--accent-20);background:linear-gradient(180deg,var(--bg-card) 0%,var(--bg-secondary) 100%);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.06)),inset 0 1px 0 color-mix(in srgb,var(--text-primary) 6%,transparent)}' +
      '.crozzo-brand-slot.bona-platform-live .crozzo-brand-img{padding:6px}' +
      '#crozzoBrandSidebarTenant.crozzo-brand-slot.is-image,#crozzoBrandLoginTenant.crozzo-brand-slot.is-image{border-color:var(--border);background:var(--bg-card);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.06))}' +
      'body.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live{animation:bonaPlatformLift 7s var(--bona-ease) infinite}' +
      'body.crozzo-page-rest-pos.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live,body.crozzo-page-tablets.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live,body.crozzo-page-comandas.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live,body.crozzo-page-cocina.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live,body.crozzo-page-operativa.crozzo-chrome-motion .crozzo-brand-slot.bona-platform-live{animation:none!important}' +
      'body.crozzo-page-rest-pos .bona-header-gem:hover,body.crozzo-page-tablets .bona-header-gem:hover,body.crozzo-page-comandas .bona-header-gem:hover,body.crozzo-page-cocina .bona-header-gem:hover,body.crozzo-page-operativa .bona-header-gem:hover{transform:none}' +
      'body.crozzo-brand-platform-only .crozzo-brand-slot[id*="Tenant"]{display:none!important}' +
      '.bona-workspace-accent{pointer-events:none;position:absolute;right:12px;bottom:12px;width:min(140px,28vw);opacity:.06;z-index:0}' +
      '.bona-workspace-accent img{width:100%;height:auto;object-fit:contain}' +
      '#mainContent{position:relative}' +
      '.login-card.bona-login-card{border-color:rgba(181,154,109,.35);box-shadow:0 8px 32px rgba(28,28,28,.08),0 0 0 1px rgba(181,154,109,.12)}' +
      '.login-card-header .crozzo-brand-dual--login{justify-content:center}' +
      '.bona-login-powered{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--bona-gold-dark,#7A6342);margin:4px 0 0}' +
      'body.bona-login-hotel #loginForm button[type="submit"]{transition:transform .15s var(--bona-ease,ease-out),opacity .15s ease}' +
      'body.bona-login-hotel #loginForm button[type="submit"]:active{transform:scale(.98);opacity:.94}' +
      '@media(prefers-reduced-motion:reduce){body.bona-login-hotel #loginForm button[type="submit"]:active{transform:none;opacity:1}}' +
      '@keyframes bonaPlatformLift{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}' +
      '.bona-header-gem{position:relative;width:40px;height:40px;padding:0;border:none;background:transparent;cursor:default;flex-shrink:0;transition:transform .35s var(--bona-ease)}' +
      '.bona-header-gem:hover{transform:scale(1.04)}' +
      '.bona-header-gem__glow{position:absolute;inset:2px;border-radius:50%;background:radial-gradient(circle at 50% 40%,rgba(181,154,109,.22),transparent 70%);opacity:.9;pointer-events:none}' +
      '.bona-header-gem__plate{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:linear-gradient(165deg,var(--bg-card),var(--bg-secondary));border:1px solid var(--accent-20);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.06))}' +
      '.bona-header-gem__plate img{width:20px;height:20px;object-fit:contain}' +
      'html[data-theme="bona-origen"] .bona-header-gem__plate,body.bona-chrome-active .bona-header-gem__plate{border-color:var(--bona-gold);box-shadow:var(--bona-shadow-sm),0 0 0 1px rgba(181,154,109,.12)}' +
      '#sidebar:has(.bona-sidebar-live){display:flex;flex-direction:column}' +
      '#sidebar:has(.bona-sidebar-live) .sidebar-nav{flex:1 1 auto;min-height:0}' +
      '.bona-sidebar-live{margin-top:auto;padding:0 10px 12px;flex-shrink:0}' +
      '.bona-sidebar-live__frame{padding:12px 14px;border-radius:var(--bona-radius-md);background:linear-gradient(135deg,var(--accent-08) 0%,var(--bg-tertiary) 52%,var(--accent-08) 100%);border:1px solid var(--border);position:relative;overflow:hidden}' +
      '.bona-sidebar-live__line{position:absolute;top:0;left:14px;right:14px;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.55}' +
      '.bona-sidebar-live__content{display:flex;align-items:center;gap:10px;position:relative;z-index:1}' +
      '.bona-sidebar-live__copy{display:flex;flex-direction:column;gap:1px;min-width:0}' +
      '.bona-sidebar-live__brand{font-family:var(--bona-font-display);font-size:15px;font-weight:600;letter-spacing:.22em;color:var(--text-primary);line-height:1.1}' +
      '.bona-sidebar-live__tag{font-size:7px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);font-weight:500;opacity:.92}' +
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
      '.ccp.bona{display:flex;flex-direction:column;height:100%;max-height:100%;min-height:0;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}' +
      '.ccp.bona::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 80% 50% at 0% 0%,var(--accent-08),transparent 55%),radial-gradient(ellipse 60% 40% at 100% 0%,rgba(0,0,0,.02),transparent 50%)}' +
      '.ccp.bona .ccp__status{background:var(--bg-secondary);backdrop-filter:blur(8px);border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px;letter-spacing:.04em}' +
      '.ccp.bona .ccp__hero{background:var(--bg-card);border-bottom:1px solid var(--border);padding:28px 32px 12px;position:relative}' +
      '.ccp.bona .ccp__hero-inner{position:relative;z-index:1}' +
      '.ccp.bona .ccp__title{margin:16px 0 0;font-family:var(--bona-font-display);font-size:1.85rem;font-weight:600;color:var(--text-primary);letter-spacing:-.02em;line-height:1.15}' +
      '.ccp.bona .ccp__sub{margin:10px 0 0;font-size:14px;color:var(--text-secondary);max-width:540px;line-height:1.6;font-weight:400}' +
      '.bona-chain{display:flex;align-items:flex-start;gap:0;padding:18px 32px 14px;overflow-x:auto;background:var(--bg-card);border-bottom:1px solid var(--border);scrollbar-width:thin}' +
      '.bona-chain__step{flex:1;min-width:72px;display:flex;flex-direction:column;align-items:center;position:relative;text-align:center}' +
      '.bona-chain__node{width:36px;height:36px;display:flex;align-items:center;justify-content:center;margin-bottom:6px}' +
      '.bona-chain__num{width:28px;height:28px;border-radius:50%;border:1px solid var(--border);font-size:10px;font-weight:500;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;background:var(--bg-secondary)}' +
      '.bona-chain__lbl{font-size:7px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);opacity:.85}' +
      '.bona-chain__step.now .bona-chain__lbl{color:var(--accent);opacity:1}' +
      '.bona-chain__step.done .bona-chain__lbl{color:var(--text-primary)}' +
      '.bona-chain__line{position:absolute;top:18px;left:calc(50% + 20px);width:calc(100% - 40px);height:1px;background:var(--border);z-index:0}' +
      '.bona-chain__line.done{background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 70%,transparent))}' +
      '.ccp.bona .ccp__welcome{margin:0 32px 16px;padding:14px 20px 14px 48px;border-radius:var(--bona-radius-md);border:1px solid var(--border);background:linear-gradient(135deg,var(--accent-08),var(--bg-card));position:relative;font-size:13px;line-height:1.5}' +
      '.ccp.bona .ccp__welcome::before{content:"";position:absolute;left:16px;top:50%;transform:translateY(-50%);width:24px;height:24px;background:url(' +
      esc(LOGO) +
      ') center/contain no-repeat;opacity:.75}' +
      '.ccp.bona .ccp-kpi{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--bona-radius-md);box-shadow:var(--bona-shadow-sm);position:relative;overflow:hidden;transition:border-color .35s var(--bona-ease),box-shadow .35s var(--bona-ease),transform .35s var(--bona-ease)}' +
      '.ccp.bona .ccp-kpi:hover{border-color:rgba(181,154,109,.4);box-shadow:var(--bona-shadow);transform:translateY(-1px)}' +
      '.ccp.bona .ccp__rail{background:var(--bg-card);border-bottom:1px solid var(--border);padding:0 8px}' +
      '.ccp.bona .ccp-nav.is-active{background:var(--accent-08);border-color:var(--accent);color:var(--text-primary);box-shadow:inset 0 0 0 1px var(--accent-10)}' +
      '.ccp.bona .ccp-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--bona-radius-md);box-shadow:var(--bona-shadow-sm);position:relative;transition:border-color .35s var(--bona-ease),box-shadow .4s var(--bona-ease),transform .4s var(--bona-ease)}' +
      '.ccp.bona .ccp-card:hover{border-color:rgba(181,154,109,.35);box-shadow:var(--bona-shadow);transform:translateY(-1px)}' +
      '.ccp.bona .ccp-card__go{color:var(--bona-gold-dark);font-weight:600;letter-spacing:.04em}' +
      '.ccp.bona .ccp-card__badge{background:var(--bona-gold-08);color:var(--bona-gold-dark);border:1px solid rgba(181,154,109,.2);font-size:10px;letter-spacing:.06em}' +
      '.ccp.bona .ccp-loader{background:color-mix(in srgb,var(--bg-primary) 96%,transparent);backdrop-filter:blur(6px)}' +
      '.ccp.bona .ccp-local{background:transparent;padding:20px 32px 32px;color:var(--text-primary)}' +
      '.ccp.bona .ccp-nav{color:var(--text-secondary)}' +
      '.ccp.bona .ccp-nav:hover{background:var(--accent-08);color:var(--text-primary)}' +
      '.ccp.bona .ccp__crumb{color:var(--text-secondary);padding:8px 32px 0}' +
      '.ccp.bona .ccp__crumb button{color:var(--bona-gold-dark)}' +
      '.ccp.bona .cps .card{border-color:var(--bona-line);box-shadow:var(--bona-shadow-sm)}' +
      '.ccp.bona .cps__badge{border-color:rgba(181,154,109,.28);color:var(--bona-gold-dark);background:var(--bona-gold-08)}' +
      '.ccp.bona .cps__title{font-family:var(--bona-font-display);color:var(--bona-charcoal)}' +
      '.ccp.bona .cps__sub{color:var(--bona-charcoal-soft)}' +
      '.ccp.bona .cps-hist-stat{border-color:var(--border);background:var(--bg-card);box-shadow:var(--bona-shadow-sm)}' +
      '.ccp.bona .cps-wf-pick__btn{border-color:var(--border);background:var(--bg-card)}' +
      '.ccp.bona .cps-wf-pick__btn.is-active{border-color:var(--accent);background:var(--accent-08)}' +
      '.ccp.bona .cps-coach{border-color:var(--border);background:linear-gradient(135deg,var(--accent-08),var(--bg-card))}' +
      '.ccp.bona .cps-coach__step{background:var(--bg-card);border-color:var(--border)}' +
      '.ccp.bona .ccp-home__section-title,.ccp.bona .ccp-home__section-lead{color:var(--bona-charcoal-soft)}' +
      '.ccp.bona .ccp__welcome-dismiss{color:var(--bona-gold-dark)}' +
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
    w.innerHTML = CrozzoSanitize.sanitizeHtml('<img src="' + esc(LOGO_PNG) + '" alt="" decoding="async" loading="lazy">');
  }

  function enhanceLoginChrome() {
    var overlay = document.getElementById('loginOverlay');
    var card = overlay ? overlay.querySelector('.login-card') : document.querySelector('.login-card');
    if (card) card.classList.add('bona-login-card');
    try {
      if (document.body) document.body.classList.add('bona-login-hotel');
    } catch (_) {}
    if (overlay && !overlay.querySelector('.bona-login-atmosphere')) {
      var atm = document.createElement('div');
      atm.className = 'bona-login-atmosphere bona-chrome-injected';
      atm.setAttribute('aria-hidden', 'true');
      overlay.insertBefore(atm, overlay.firstChild);
    }
    /* Quitar lockup hero erróneo; logo de config se queda. Solo estilizar texto BONA origen. */
    try {
      document.querySelectorAll('.bona-login-lockup').forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    } catch (_) {}
    stylePlatformBrandLabels();
    var submit = document.querySelector('#loginForm button[type="submit"]');
    if (submit) {
      var st = String(submit.textContent || '').replace(/\s+/g, ' ').trim();
      if (!st || /🔐|Iniciar sesión/i.test(st)) submit.textContent = 'Entrar';
    }
    if (typeof crozzoRefreshLoginBuildStamp === 'function') crozzoRefreshLoginBuildStamp();
  }

  /** Reemplaza texto plano "BONA origen" por BONΛ origen tipográfico; no toca el <img> del logo. */
  function stylePlatformBrandLabels() {
    var nameHtml =
      '<span class="bona-brand__name">BON<span class="bona-brand__a">Λ</span></span>' +
      '<span class="bona-brand__tag">origen</span>';
    document.querySelectorAll('.crozzo-brand-txt').forEach(function (el) {
      var raw = String(el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!raw) return;
      if (!/bona\s*origen/i.test(raw) && !el.querySelector('.bona-brand__a')) return;
      if (el.querySelector('.bona-brand__a')) {
        el.classList.add('bona-brand-txt--styled');
        return;
      }
      el.innerHTML = CrozzoSanitize.sanitizeHtml(nameHtml);
      el.classList.add('bona-brand-txt--styled');
    });
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
      CrozzoSanitize.sanitizeHtml('<span class="bona-header-gem__glow" aria-hidden="true"></span>' +
      '<span class="bona-header-gem__plate"><img src="' +
      esc(LOGO) +
      '" alt="" width="20" height="20" decoding="async"></span>');
    var anchor = document.getElementById('crozzoA11yTrigger');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor);
    else toolbar.insertBefore(btn, toolbar.firstChild);
  }

  function installSidebarLive() {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    var live = sb.querySelector('.bona-sidebar-live');
    if (!live) {
      live = document.createElement('div');
      live.className = 'bona-sidebar-live bona-chrome-injected';
      live.setAttribute('aria-hidden', 'true');
      sb.appendChild(live);
    }
    live.innerHTML =
      CrozzoSanitize.sanitizeHtml('<div class="bona-sidebar-live__frame">' +
      '<span class="bona-sidebar-live__line" aria-hidden="true"></span>' +
      '<div class="bona-sidebar-live__content">' +
      logoFrame('bona-logo-frame--live') +
      '<div class="bona-sidebar-live__copy">' +
      '<span class="bona-sidebar-live__brand"><span class="bona-brand__name bona-brand__name--sm">BON<span class="bona-brand__a">Λ</span></span></span>' +
      '<span class="bona-sidebar-live__tag bona-brand__tag bona-brand__tag--sm">origen</span>' +
      '</div></div></div>');
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
    injectStyles();
    var wantBona =
      themeId === 'bona-origen' ||
      (document.body && document.body.classList.contains('crozzo-bona-module'));
    if (wantBona) {
      applyChrome();
    } else {
      clearChrome();
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
    brandNameOnly: brandNameOnly,
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
 * Bona Origen — Centro de Producción
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
    home: { label: 'Inicio', icon: 'layout-dashboard', sub: null, desc: 'Panel del día · resumen y accesos rápidos' },
    form: { label: 'Anotar preparación', icon: 'utensils', sub: 'form', desc: 'Registrar lo que acabas de preparar' },
    hist: { label: 'Lo preparé antes', icon: 'clipboard-list', sub: 'hist', desc: 'Historial de preparaciones en bodega' },
    recetario: { label: 'Recetario', icon: 'book-open', sub: 'recetario', desc: 'Ingredientes y pesos para cocina' },
    jefe: { label: 'Mercado', icon: 'truck', sub: 'jefe', desc: 'Entrada de factura' }
  };

  var WORKFLOWS = [
    {
      id: 'despiece',
      title: 'Partir carnes',
      desc: 'Pesa la carne entera, anota qué sacaste y cuánto pesó cada corte.',
      icon: 'beef',
      tone: 'amber',
      badge: 'Más usado',
      badgeClass: '',
      sub: 'form',
      hint: 'despiece',
      steps: ['1. Pesar pieza', '2. Anotar cortes', '3. Guardar']
    },
    {
      id: 'coccion',
      title: 'Cocinar y porcionar',
      desc: 'Anoto peso crudo, peso cocido y cuánto empaqueto para reservar.',
      icon: 'flame',
      tone: 'rose',
      badge: 'Rápido',
      badgeClass: 'time',
      sub: 'form',
      hint: 'coccion',
      steps: ['1. Pesos', '2. Porciones', '3. Guardar']
    },
    {
      id: 'elaboracion',
      title: 'Salsas y bases',
      desc: 'Ej. salsa, caldo, aderezo — lo dejo listo en bodega para el servicio.',
      icon: 'soup',
      tone: 'violet',
      badge: 'Con receta',
      badgeClass: 'time',
      sub: 'form',
      hint: 'elaboracion',
      steps: ['1. Ingredientes', '2. Peso final', '3. Guardar']
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
    var el = document.getElementById('crozzo-centro-procesos-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-centro-procesos-css';
      document.head.appendChild(el);
    }
    el.textContent =
      'body.crozzo-page-centro-procesos .main-body,#mainContent.main-body--centro-procesos{padding:0!important;overflow:hidden!important;min-height:0!important;height:auto!important;flex:1 1 auto!important;background:var(--bg-primary,#080a10)}' +
      'html.crozzo-vp-ready body.crozzo-page-centro-procesos .main-body,html.crozzo-vp-ready #mainContent.main-body--centro-procesos{overflow:hidden!important;min-height:0!important;-webkit-overflow-scrolling:auto!important}' +
      '.ccp{display:flex;flex-direction:column;height:100%;max-height:100%;min-height:0;overflow:hidden;box-sizing:border-box}' +
      '.ccp__status,.ccp__rail,#ccp-crumb,.ccp__crumb{flex-shrink:0}' +
      '.ccp:not(.bona){--ccp-gold:#d4b84a;--ccp-gold-soft:rgba(212,184,74,.22);--ccp-glass:rgba(14,16,26,.78);background:radial-gradient(1100px 520px at 6% -8%,rgba(212,184,74,.16),transparent 58%),var(--bg-primary,#080a10);font-family:inherit}' +
      '.ccp__status{padding:8px 20px;font-size:11px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.28);color:var(--text-muted);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}' +
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
      '.ccp__kpis--chef{grid-template-columns:repeat(3,minmax(0,1fr))}' +
      '.ccp-kpi{background:var(--ccp-glass);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:13px 15px;backdrop-filter:blur(16px);transition:transform .25s,border-color .25s}' +
      '.ccp-kpi:hover{transform:translateY(-2px);border-color:rgba(212,184,74,.2)}' +
      '.ccp-kpi__lbl{font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px}' +
      '.ccp-kpi__val{font-size:1.2rem;font-weight:700;font-variant-numeric:tabular-nums}' +
      '.ccp-kpi__val--gold{color:var(--ccp-gold)}' +
      '.ccp__body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}' +
      '.ccp__rail{display:flex;align-items:center;gap:8px;padding:12px 20px 14px;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap;background:rgba(0,0,0,.12)}' +
      '.ccp-nav{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer;transition:all .25s cubic-bezier(.22,1,.36,1);font-family:inherit;min-height:44px}' +
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
      '.ccp-home__lead{margin:16px 32px 8px;font-size:14px;color:var(--text-muted);line-height:1.55}' +
      '.ccp-home__section{padding:8px 32px 0}' +
      '.ccp-home__section-title{margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)}' +
      '.ccp-home__section-lead{margin:6px 0 0;font-size:13px;color:var(--text-muted);line-height:1.55;max-width:520px}' +
      '.ccp__welcome-dismiss{margin-left:8px;background:none;border:none;color:var(--ccp-gold);cursor:pointer;font-weight:600;font-size:12px;font-family:inherit;text-decoration:underline;text-underline-offset:3px;padding:0}' +
      '.ccp__status-icon{display:inline-flex;align-items:center;gap:8px;line-height:1.45}' +
      '.ccp__status-icon svg,.ccp__status-icon i{width:14px;height:14px;opacity:.85;flex-shrink:0}' +
      '.ccp__status-meta{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);opacity:.9}' +
      '.ccp-wf{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 32px 28px}' +
      '.ccp-card{position:relative;text-align:left;padding:22px 22px 58px;border-radius:20px;border:1px solid rgba(255,255,255,.08);background:var(--ccp-glass);backdrop-filter:blur(18px);cursor:pointer;font-family:inherit;color:inherit;overflow:hidden;transition:transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s,border-color .3s;min-height:168px}' +
      '.ccp-card::before{content:"";position:absolute;inset:0;opacity:0;background:linear-gradient(125deg,rgba(212,184,74,.14),transparent 50%);transition:opacity .35s;pointer-events:none}' +
      '.ccp-card:hover{transform:translateY(-5px);box-shadow:0 24px 56px rgba(0,0,0,.38);border-color:rgba(212,184,74,.25)}' +
      '.ccp-card:hover::before{opacity:1}' +
      '.ccp-card__badge{position:absolute;top:16px;right:16px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:999px;background:rgba(74,222,128,.12);color:#86efac;border:1px solid rgba(74,222,128,.25)}' +
      '.ccp-card__badge.time{background:rgba(99,102,241,.15);color:#c4b5fd;border-color:rgba(99,102,241,.3)}' +
      '.ccp-card--amber::after{background:#f59e0b}.ccp-card--rose::after{background:#fb7185}.ccp-card--violet::after{background:#a78bfa}.ccp-card--cyan::after{background:#22d3ee}' +
      '.ccp-card::after{content:"";position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;opacity:.15;filter:blur(24px);pointer-events:none}' +
      '.ccp-card__icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}' +
      '.ccp-card__title{font-size:16px;font-weight:700;margin:0 0 8px;letter-spacing:-.02em;padding-right:80px;line-height:1.25}' +
      '.ccp-card__desc{font-size:13px;color:var(--text-muted);margin:0 0 14px;line-height:1.55}' +
      '.ccp-card__steps{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}' +
      '.ccp-card__steps li{font-size:10px;font-weight:600;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--text-muted)}' +
      '.ccp-card__go{position:absolute;left:22px;bottom:20px;font-size:12px;font-weight:700;color:var(--ccp-gold);letter-spacing:.02em}' +
      '.ccp-engine{position:absolute;inset:0;display:none;flex-direction:column;overflow:hidden;opacity:0;transition:opacity .35s ease}' +
      '.ccp-engine.is-open{display:flex;opacity:1}' +
      '.ccp-engine__frame{flex:1;min-height:0;width:100%;height:100%;border:0;background:var(--bg-primary);display:block}' +
      '.ccp-loader{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(8,10,16,.92);z-index:5;backdrop-filter:blur(8px)}' +
      '.ccp-loader.show{display:flex;animation:ccpFadeUp .3s ease}' +
      '.ccp-loader__ring{width:44px;height:44px;border-radius:50%;border:3px solid rgba(212,184,74,.2);border-top-color:var(--ccp-gold);animation:ccpSpin .9s linear infinite}' +
      '@keyframes ccpSpin{to{transform:rotate(360deg)}}' +
      '.ccp-loader__txt{font-size:13px;color:var(--text-muted)}' +
      '.ccp-local{position:absolute;inset:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:20px 28px 32px;display:none;background:var(--bg-primary,#080a10)}' +
      '.ccp-local .cps{max-width:1040px}' +
      '.ccp.bona .ccp-local{background:var(--bona-cream,#faf9f7);padding:24px 32px 40px}' +
      '.ccp-dash{padding:0 32px 28px}' +
      '.ccp-dash__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}' +
      '.ccp-dash-act{display:flex;align-items:flex-start;gap:14px;padding:18px 18px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:var(--ccp-glass);cursor:pointer;font-family:inherit;color:inherit;text-align:left;transition:transform .25s,box-shadow .25s,border-color .25s;min-height:88px}' +
      '.ccp-dash-act:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.12);border-color:rgba(212,184,74,.25)}' +
      '.ccp-dash-act--primary{grid-column:1/-1;padding:20px 22px;border-color:rgba(212,184,74,.35);background:linear-gradient(135deg,rgba(212,184,74,.14),var(--ccp-glass))}' +
      '.ccp-dash-act__icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1)}' +
      '.ccp-dash-act--primary .ccp-dash-act__icon{background:rgba(212,184,74,.18);color:var(--ccp-gold,#d4b84a)}' +
      '.ccp-dash-act__icon svg,.ccp-dash-act__icon i{width:22px;height:22px}' +
      '.ccp-dash-act__title{display:block;font-size:15px;font-weight:700;margin:0 0 4px;letter-spacing:-.02em}' +
      '.ccp-dash-act__desc{display:block;font-size:12px;color:var(--text-muted);line-height:1.45;margin:0}' +
      '.ccp-dash-act__go{margin-left:auto;align-self:center;font-size:12px;font-weight:700;color:var(--ccp-gold,#d4b84a);flex-shrink:0}' +
      '.ccp-dash-act--primary .ccp-dash-act__body{flex:1}' +
      '.ccp-dash-act--primary{display:flex;align-items:center}' +
      '.ccp-wf-short{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:var(--ccp-glass);cursor:pointer;font-family:inherit;color:inherit;text-align:left;transition:border-color .2s,transform .2s;width:100%}' +
      '.ccp-wf-short:hover{border-color:rgba(212,184,74,.3);transform:translateY(-1px)}' +
      '.ccp-wf-short__icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(255,255,255,.06)}' +
      '.ccp-wf-short__icon svg,.ccp-wf-short__icon i{width:18px;height:18px}' +
      '.ccp-wf-short--amber .ccp-wf-short__icon{color:#d97706;background:rgba(245,158,11,.12)}' +
      '.ccp-wf-short--rose .ccp-wf-short__icon{color:#e11d48;background:rgba(251,113,133,.12)}' +
      '.ccp-wf-short--violet .ccp-wf-short__icon{color:#7c3aed;background:rgba(167,139,250,.12)}' +
      '.ccp-wf-short__body{flex:1;min-width:0}' +
      '.ccp-wf-short__title{display:block;font-size:13px;font-weight:650}' +
      '.ccp-wf-short__meta{display:block;font-size:11px;color:var(--text-muted);margin-top:2px}' +
      '.ccp-wf-short__count{font-size:12px;font-weight:700;color:var(--ccp-gold,#d4b84a);flex-shrink:0}' +
      '.ccp-wf-shorts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:20px}' +
      '.ccp-recent{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:var(--ccp-glass);overflow:hidden;margin-bottom:16px}' +
      '.ccp-recent__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.06)}' +
      '.ccp-recent__title{margin:0;font-size:13px;font-weight:650}' +
      '.ccp-recent__link{background:none;border:none;padding:0;font-size:12px;font-weight:600;color:var(--ccp-gold,#d4b84a);cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:3px}' +
      '.ccp-recent__list{list-style:none;margin:0;padding:0}' +
      '.ccp-recent__item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px}' +
      '.ccp-recent__item:last-child{border-bottom:none}' +
      '.ccp-recent__name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ccp-recent__meta{font-size:11px;color:var(--text-muted);flex-shrink:0;text-align:right}' +
      '.ccp-recent__empty{padding:28px 18px;text-align:center;font-size:13px;color:var(--text-muted);line-height:1.55}' +
      '.ccp-recent__empty strong{display:block;font-size:14px;color:var(--text-primary);margin-bottom:6px;font-weight:650}' +
      '.ccp-alert{margin:0 32px 16px;padding:12px 16px;border-radius:12px;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.1);font-size:13px;color:var(--text-primary);display:flex;align-items:flex-start;gap:10px;line-height:1.5}' +
      '.ccp-alert svg,.ccp-alert i{width:18px;height:18px;flex-shrink:0;color:#f59e0b;margin-top:1px}' +
      '.ccp-alert button{margin-left:auto;background:none;border:none;color:var(--ccp-gold,#d4b84a);font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0}' +
      '.ccp-dash__section-title{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted)}' +
      '.ccp.bona .ccp-dash-act,.ccp.bona .ccp-wf-short,.ccp.bona .ccp-recent{background:#fff;border-color:var(--bona-line,rgba(0,0,0,.08));box-shadow:var(--bona-shadow-sm)}' +
      '.ccp.bona .ccp-dash-act--primary{background:linear-gradient(135deg,var(--bona-gold-08,#f5f0e8),#fff);border-color:rgba(181,154,109,.35)}' +
      '.ccp.bona .ccp-alert{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.25)}' +
      '@media(max-width:1100px){.ccp-wf{grid-template-columns:repeat(2,minmax(0,1fr))}.ccp-wf-shorts{grid-template-columns:1fr}}' +
      '@media(max-width:900px){.ccp__kpis{grid-template-columns:repeat(2,1fr)}.ccp-home__lead,.ccp-home__section,.ccp-wf,.ccp-dash,.ccp-alert{padding-left:20px;padding-right:20px}.ccp-alert{margin-left:20px;margin-right:20px}.ccp-dash__grid{grid-template-columns:1fr}}' +
      '@media(max-width:640px){.ccp-wf{grid-template-columns:1fr}.ccp__kpis{grid-template-columns:1fr}}';
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
      '<span class="ccp__status-icon">' +
      navIcon('info') +
      ' Solo anota lo que preparas <strong>antes</strong> del servicio</span>' +
      '<span class="ccp__status-meta" id="ccp-status-meta">Salsas · bases · despiece</span></div>'
    );
  }

  function welcomeHtml() {
    try {
      if (localStorage.getItem('ccp_welcome_seen') === '1') return '';
    } catch (_) {}
    return (
      '<p class="ccp__welcome" id="ccp-welcome">' +
      '<strong>¿Primera vez aquí?</strong> Elige una tarjeta abajo. Te guiamos paso a paso — no hay que memorizar nada. ' +
      '<button type="button" class="ccp__welcome-dismiss" id="ccp-welcome-dismiss">Entendido</button></p>'
    );
  }

  function kpiHtml() {
    return (
      '<div class="ccp__kpis ccp__kpis--chef">' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Preparaciones hoy</div><div class="ccp-kpi__val ccp-kpi__val--gold" id="ccp-kpi-hoy">—</div></div>' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Kg este mes</div><div class="ccp-kpi__val" id="ccp-kpi-kg">—</div></div>' +
      '<div class="ccp-kpi"><div class="ccp-kpi__lbl">Revisar diferencias</div><div class="ccp-kpi__val" id="ccp-kpi-alert">—</div></div>' +
      '</div>'
    );
  }

  function crumbHtml(view) {
    if (view === 'home') return '';
    var v = VIEWS[view] || VIEWS.form;
    return (
      '<div class="ccp__crumb">' +
      '<button type="button" data-ccp-view="home">← Volver al panel</button>' +
      ' · <span>' +
      esc(v.label) +
      '</span></div>'
    );
  }

  function railHtml(active) {
    return ['home', 'recetario', 'form', 'hist']
      .filter(function (k) {
        return VIEWS[k];
      })
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

  function loadCortesPrep() {
    try {
      var Res = global.CrozzoReservorio;
      if (!Res || typeof Res.load !== 'function') return [];
      return (Res.load().cortes || [])
        .filter(function (c) {
          return (c.modoProceso || 'prep_anticipado') !== 'bajo_demanda';
        })
        .sort(function (a, b) {
          return String(b.fecha || '').localeCompare(String(a.fecha || ''));
        });
    } catch (_) {
      return [];
    }
  }

  function prepStats(cortes) {
    var hoy = new Date().toISOString().slice(0, 10);
    var mes = hoy.slice(0, 7);
    var stats = {
      today: 0,
      kg: 0,
      alertCount: 0,
      byWf: { despiece: 0, coccion: 0, elaboracion: 0 },
      recent: cortes.slice(0, 6)
    };
    cortes.forEach(function (c) {
      var f = String(c.fecha || '').slice(0, 10);
      if (f === hoy) {
        stats.today++;
        var wf = c.workflow || 'elaboracion';
        if (stats.byWf[wf] != null) stats.byWf[wf]++;
      }
      if (String(c.fecha || '').slice(0, 7) === mes) {
        var pe = Number(c.pesoEntradaKg) || 0;
        stats.kg += pe;
        if (pe > 0 && Number(c.mermaTotalKg) > 0) {
          var ratio = Number(c.mermaTotalKg) / pe;
          if (ratio > 0.05) stats.alertCount++;
        }
      }
    });
    return stats;
  }

  function alertBannerHtml(alertCount) {
    if (!alertCount) return '';
    return (
      '<div class="ccp-alert" id="ccp-alert-banner">' +
      navIcon('alert-triangle') +
      '<span><strong>' +
      alertCount +
      ' lote' +
      (alertCount > 1 ? 's' : '') +
      '</strong> con diferencia de peso superior al 5% este mes — conviene revisarlos.</span>' +
      '<button type="button" data-ccp-view="hist">Ver historial</button></div>'
    );
  }

  function quickActionsHtml() {
    return (
      '<div class="ccp-dash__grid">' +
      '<button type="button" class="ccp-dash-act ccp-dash-act--primary" data-ccp-view="form">' +
      '<span class="ccp-dash-act__icon">' +
      navIcon('utensils') +
      '</span>' +
      '<span class="ccp-dash-act__body">' +
      '<span class="ccp-dash-act__title">Anotar preparación</span>' +
      '<span class="ccp-dash-act__desc">Registra despiece, cocción o salsas — el formulario te guía paso a paso.</span>' +
      '</span>' +
      '<span class="ccp-dash-act__go">Abrir →</span></button>' +
      '<button type="button" class="ccp-dash-act" data-ccp-view="recetario">' +
      '<span class="ccp-dash-act__icon">' +
      navIcon('book-open') +
      '</span>' +
      '<span class="ccp-dash-act__body">' +
      '<span class="ccp-dash-act__title">Recetario</span>' +
      '<span class="ccp-dash-act__desc">Ingredientes y pesos para consultar o imprimir.</span></span></button>' +
      '<button type="button" class="ccp-dash-act" data-ccp-view="hist">' +
      '<span class="ccp-dash-act__icon">' +
      navIcon('clipboard-list') +
      '</span>' +
      '<span class="ccp-dash-act__body">' +
      '<span class="ccp-dash-act__title">Lo preparé antes</span>' +
      '<span class="ccp-dash-act__desc">Historial completo con pesos y responsables.</span></span></button></div>'
    );
  }

  function wfShortcutsHtml(byWf) {
    byWf = byWf || {};
    return (
      '<p class="ccp-dash__section-title">Atajo por tipo · hoy</p>' +
      '<div class="ccp-wf-shorts">' +
      WORKFLOWS.map(function (w) {
        var n = byWf[w.id] || 0;
        return (
          '<button type="button" class="ccp-wf-short ccp-wf-short--' +
          w.tone +
          '" data-ccp-view="form" data-ccp-hint="' +
          w.hint +
          '">' +
          '<span class="ccp-wf-short__icon">' +
          navIcon(w.icon) +
          '</span>' +
          '<span class="ccp-wf-short__body">' +
          '<span class="ccp-wf-short__title">' +
          esc(w.title) +
          '</span>' +
          '<span class="ccp-wf-short__meta">' +
          (n ? n + ' registrada' + (n > 1 ? 's' : '') + ' hoy' : 'Sin registros hoy') +
          '</span></span>' +
          '<span class="ccp-wf-short__count">+ Anotar</span></button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function recentActivityHtml(recent) {
    var items = (recent || [])
      .map(function (c) {
        var wf = WORKFLOWS.filter(function (w) {
          return w.id === (c.workflow || 'elaboracion');
        })[0];
        var wfLabel = wf ? wf.title : 'Preparación';
        var resp = c.responsableNombre || (c.responsables && c.responsables[0] && c.responsables[0].nombre) || '';
        return (
          '<li class="ccp-recent__item">' +
          '<span class="ccp-recent__name">' +
          esc(c.producto || '—') +
          '</span>' +
          '<span class="ccp-recent__meta">' +
          esc(String(c.fecha || '').slice(0, 10)) +
          ' · ' +
          esc(wfLabel) +
          (resp ? ' · ' + esc(resp) : '') +
          '</span></li>'
        );
      })
      .join('');
    return (
      '<div class="ccp-recent">' +
      '<div class="ccp-recent__head">' +
      '<h3 class="ccp-recent__title">Actividad reciente</h3>' +
      '<button type="button" class="ccp-recent__link" data-ccp-view="hist">Ver todo</button></div>' +
      (items
        ? '<ul class="ccp-recent__list">' + items + '</ul>'
        : '<div class="ccp-recent__empty"><strong>Sin preparaciones aún</strong>Cuando anotes la primera, aparecerá aquí al instante.</div>') +
      '</div>'
    );
  }

  function homeDashboardHtml(stats) {
    stats = stats || prepStats(loadCortesPrep());
    return (
      alertBannerHtml(stats.alertCount) +
      '<div class="ccp-dash">' +
      quickActionsHtml() +
      wfShortcutsHtml(stats.byWf) +
      recentActivityHtml(stats.recent) +
      '<p class="ccp-home__lead">Lo que se arma al pedir (huevos, pastas al momento, etc.) <strong>no</strong> va aquí — el POS lo descuenta al vender.</p></div>'
    );
  }

  function refreshHomeDashboard() {
    var host = document.getElementById('ccp-home-dynamic');
    if (!host) return;
    var stats = prepStats(loadCortesPrep());
    host.innerHTML = CrozzoSanitize.sanitizeHtml(homeDashboardHtml(stats));
    refreshKpisFromStats(stats);
    var root = document.getElementById('crozzo-centro-procesos');
    if (root) bindNavClicks(root);
    if (typeof global.refreshLucideIcons === 'function') global.refreshLucideIcons(host);
    else if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [host] });
  }

  function refreshKpisFromStats(stats) {
    applyKpiDom(stats.today, stats.kg, stats.alertCount);
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
    if (crumb) crumb.innerHTML = CrozzoSanitize.sanitizeHtml(crumbHtml(view));

    if (view === 'home') {
      home.style.display = 'block';
      eng.classList.remove('is-open');
      setLoading(false);
      refreshHomeDashboard();
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

    if (view === 'form' && global.CrozzoProcesosSesion) {
      setLoading(false);
      showProcesosSesion(opts);
      return;
    }

    if (view === 'hist' && global.CrozzoProcesosSesion && global.CrozzoProcesosSesion.renderHistorial) {
      setLoading(false);
      showProcesosHistorial();
      return;
    }

    if (view === 'recetario' && global.CrozzoRecetarioCocina) {
      setLoading(false);
      showRecetario(opts);
      return;
    }

    if (global.__CROZZO_IS_TAURI__) {
      setLoading(false);
      showLocalFallback(opts);
      return;
    }

    if (cloudOk()) {
      setLoading(true, 'Preparando tu pantalla de cocina…');
      if (!hub.loadedQyc) {
        showLocalFallback(opts);
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
      showLocalFallback(opts);
    }
  }

  function workflowHint(opts) {
    if (opts && opts.hint) return opts.hint;
    try {
      return sessionStorage.getItem('qca_pro_workflow') || '';
    } catch (_) {
      return '';
    }
  }

  function showProcesosSesion(opts) {
    opts = opts || {};
    var loc = document.getElementById('ccp-local-host');
    var eng = document.getElementById('ccp-engine');
    var fr = document.getElementById('ccp-qyc-frame');
    var Ses = global.CrozzoProcesosSesion;
    if (!loc || !eng || !Ses) return;
    eng.classList.add('is-open');
    loc.style.display = 'block';
    if (fr) fr.style.display = 'none';
    var hint = workflowHint(opts);
    if (Ses.resetForWorkflow) Ses.resetForWorkflow(hint);
    loc.innerHTML = CrozzoSanitize.sanitizeHtml(Ses.render({ workflow: hint }));
    Ses.init(loc, { workflow: hint });
  }

  function showRecetario(opts) {
    opts = opts || {};
    var loc = document.getElementById('ccp-local-host');
    var eng = document.getElementById('ccp-engine');
    var fr = document.getElementById('ccp-qyc-frame');
    var Rec = global.CrozzoRecetarioCocina;
    if (!loc || !eng || !Rec) return;
    eng.classList.add('is-open');
    loc.style.display = 'block';
    if (fr) fr.style.display = 'none';
    loc.innerHTML = CrozzoSanitize.sanitizeHtml(Rec.render({ slug: opts.slug || null }));
    Rec.init(loc, opts);
  }

  function showProcesosHistorial() {
    var loc = document.getElementById('ccp-local-host');
    var eng = document.getElementById('ccp-engine');
    var fr = document.getElementById('ccp-qyc-frame');
    var Ses = global.CrozzoProcesosSesion;
    if (!loc || !eng || !Ses || !Ses.renderHistorial) return;
    eng.classList.add('is-open');
    loc.style.display = 'block';
    if (fr) fr.style.display = 'none';
    loc.innerHTML = CrozzoSanitize.sanitizeHtml(Ses.renderHistorial());
    if (Ses.initHistorial) Ses.initHistorial(loc);
  }

  function showLocalFallback(opts) {
    opts = opts || {};
    var loc = document.getElementById('ccp-local-host');
    var eng = document.getElementById('ccp-engine');
    if (!loc || !eng) return;
    eng.classList.add('is-open');
    loc.style.display = 'block';
    if (hub.view === 'hist') {
      showProcesosHistorial();
      return;
    }
    if (hub.view === 'recetario') {
      showRecetario(opts);
      return;
    }
    var mod = hub.view === 'jefe' ? 'recepcion' : 'procesado';
    if (mod === 'procesado' && global.CrozzoProcesosSesion) {
      showProcesosSesion(opts);
      return;
    }
    if (mod === 'recepcion' && global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.render) {
      loc.innerHTML = CrozzoSanitize.sanitizeHtml(global.CrozzoRecepcionFacturas.render());
      global.CrozzoRecepcionFacturas.init(loc);
      return;
    }
    if (mod === 'dashboard' && global.CrozzoComprasLocal) {
      loc.innerHTML = CrozzoSanitize.sanitizeHtml(global.CrozzoComprasLocal.render('dashboard'));
      global.CrozzoComprasLocal.init(loc, 'dashboard');
      return;
    }
    if (global.CrozzoComprasLocal) {
      loc.innerHTML = CrozzoSanitize.sanitizeHtml(global.CrozzoComprasLocal.render(mod === 'recepcion' ? 'recepcion' : 'procesado'));
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

  function bindNavClicks(root) {
    if (!root) return;
    root.querySelectorAll('[data-ccp-view]').forEach(function (btn) {
      if (btn._ccpNavBound) return;
      btn._ccpNavBound = true;
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-ccp-view');
        if (!v) return;
        var hint = btn.getAttribute('data-ccp-hint') || '';
        setView(v, hint ? { hint: hint } : {});
        if (hint && v === 'form') toast('Listo — completa los pasos en pantalla', 'info');
      });
    });
  }

  function bindUi(root) {
    if (!root || root._ccpBound) return;
    root._ccpBound = true;

    bindNavClicks(root);

    document.addEventListener('crozzo-supabase-config-saved', function () {
      reloadFrame();
      var st = document.getElementById('ccp-status');
      if (st) st.outerHTML = statusBarHtml();
      toast('Listo — cocina sincronizada', 'success');
    });
  }

  function applyKpiDom(today, kg, alertCount) {
    var el = document.getElementById('ccp-kpi-hoy');
    if (el) {
      el.textContent =
        today === 0
          ? '0'
          : today === 1
            ? '1 preparación'
            : today + ' preparaciones';
    }
    el = document.getElementById('ccp-kpi-kg');
    if (el) el.textContent = kg > 0 ? kg.toFixed(1) + ' kg' : '0 kg';
    el = document.getElementById('ccp-kpi-alert');
    if (el) {
      el.textContent =
        alertCount === 0 ? 'Todo bien' : alertCount + ' lote' + (alertCount > 1 ? 's' : '') + ' a revisar';
    }
  }

  function refreshKpisLocal() {
    try {
      var Res = global.CrozzoReservorio;
      if (!Res || typeof Res.load !== 'function') return false;
      var cortes = (Res.load().cortes || []).filter(function (c) {
        return (c.modoProceso || 'prep_anticipado') !== 'bajo_demanda';
      });
      var hoy = new Date().toISOString().slice(0, 10);
      var mes = hoy.slice(0, 7);
      var today = 0;
      var kg = 0;
      var alertCount = 0;
      cortes.forEach(function (c) {
        var f = String(c.fecha || '').slice(0, 10);
        if (f === hoy) today++;
        if (String(c.fecha || '').slice(0, 7) === mes) {
          var pe = Number(c.pesoEntradaKg) || 0;
          kg += pe;
          if (pe > 0 && Number(c.mermaTotalKg) > 0) {
            var ratio = Number(c.mermaTotalKg) / pe;
            if (ratio > 0.05) alertCount++;
          }
        }
      });
      applyKpiDom(today, kg, alertCount);
      return true;
    } catch (_) {
      return false;
    }
  }

  function refreshKpis() {
    refreshKpisLocal();
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
        applyKpiDom(today, kg, alert);
      });
    } catch (_) {}
  }

  function heroHtml() {
    var B = bona();
    return (
      '<header class="ccp__hero">' +
      '<div class="ccp__hero-inner">' +
      (B ? B.brandHero() : '<div class="ccp__eyebrow">Centro de producción</div>') +
      '<h1 class="ccp__title">Panel de cocina</h1>' +
      '<p class="ccp__sub">Resumen del día, accesos rápidos y lo último que registraste en bodega.</p>' +
      '</div></header>'
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
        '<nav class="ccp__rail" aria-label="Cocina">' +
        railHtml(hub.view) +
        '</nav>' +
        '<div id="ccp-crumb">' +
        crumbHtml(hub.view) +
        '</div>' +
        '<div class="ccp__panel">' +
        '<div class="ccp-home" id="ccp-panel-home">' +
        heroHtml() +
        kpiHtml() +
        '<div id="ccp-home-dynamic">' +
        homeDashboardHtml(prepStats(loadCortesPrep())) +
        '</div></div>' +
        '<div class="ccp-engine" id="ccp-engine">' +
        '<div class="ccp-loader" id="ccp-loader"><div class="ccp-loader__ring"></div><div class="ccp-loader__txt">Abriendo formulario…</div></div>' +
        '<iframe id="ccp-qyc-frame" class="ccp-engine__frame" title="Procesado cocina"></iframe>' +
        '<div class="ccp-local" id="ccp-local-host"></div></div></div></div></section>'
      );
    },

    init: function (startView) {
      var root = document.getElementById('crozzo-centro-procesos');
      bindUi(root);
      refreshHomeDashboard();
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
      'compras-recetario-cocina': 'recetario',
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

