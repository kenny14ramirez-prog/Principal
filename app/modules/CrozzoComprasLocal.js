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
    var docCell = hasDoc
      ? '<button type="button" class="crozzo-oficina-doc-btn ccl-of-ver-pdf' +
        (expanded && ofUi.expandedTab === 'pdf' ? ' is-active' : '') +
        '" data-id="' +
        esc(f.id) +
        '" title="Ver PDF">📄</button>'
      : '<span class="crozzo-oficina-doc-none">—</span>';
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
    host.innerHTML = renderOficina();
    if (ofUi.expandedTab === 'pdf') ofMountPdfPreview(host, facturaId, 0);
    if (ofUi.expandedTab === 'oficina') ofMountProvDocPreview(host, facturaId);
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
    var lines = ['Fecha,Proveedor,NumeroFactura,Valor,Metodo,Estado,Notas'];
    list.forEach(function (f) {
      lines.push(
        [
          ofFacturaDate(f),
          '"' + String(f.proveedorNombre || '').replace(/"/g, '""') + '"',
          '"' + String(f.numeroFactura || '').replace(/"/g, '""') + '"',
          Number(f.valor) || 0,
          ofNormMetodo(f.metodo),
          f.estado || '',
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
        '<span>⚠️ Los filtros ocultan <strong>' +
        (all.length - filtered.length) +
        '</strong> factura(s). Mostrando <strong>' +
        filtered.length +
        '</strong>.</span>' +
        '<button type="button" class="btn btn-primary btn-sm" id="ccl-of-show-all">Ver todas</button>' +
        '</div>'
      : '';

    var filtersBlock =
      '<button type="button" class="crozzo-oficina-filter-toggle" id="ccl-of-toggle-filters" aria-expanded="' +
      (ofUi.filtersOpen ? 'true' : 'false') +
      '">' +
      '<span>🔍 Filtros y búsqueda</span><span>' +
      (ofUi.filtersOpen ? '▲' : '▼') +
      '</span></button>' +
      (ofUi.filtersOpen
        ? '<div class="crozzo-oficina-filter crozzo-oficina-filter-panel">' +
          '<div class="crozzo-oficina-filter__title">Criterios</div>' +
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
          (ofUi.soloPdf ? '✓ Solo con PDF' : 'Solo con PDF') +
          '</button>' +
          '<span class="crozzo-oficina-filter__summary">' +
          summary +
          '</span></div></div>'
        : '<p class="form-hint" style="margin:0 0 12px">' +
          summary +
          ' · <button type="button" class="btn btn-link btn-sm" id="ccl-of-open-filters" style="padding:0;min-height:0">Abrir filtros</button></p>');

    return (
      '<div class="crozzo-compras-local crozzo-oficina-app">' +
      '<header class="crozzo-oficina-hero">' +
      '<div><h2>Oficina y pagos</h2>' +
      '<p>Revise facturas cargadas, despliegue el PDF en la misma pantalla y confirme pagos. Cada recepción con adjunto queda enlazada aquí automáticamente.</p></div>' +
      '<div class="crozzo-oficina-hero__actions">' +
      '<button type="button" class="btn btn-outline btn-sm' +
      (colaPlan ? ' crozzo-of-planilla-queue' : '') +
      '" id="ccl-of-go-planilla">📋 Cola planilla' +
      (colaPlan ? ' <span class="crozzo-pl-tab-badge">' + colaPlan + '</span>' : '') +
      '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ccl-of-go-recepcion">📥 Recepción facturas</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="ccl-of-export">⬇ CSV</button>' +
      '</div></header>' +
      '<div class="crozzo-invoice-kpis">' +
      '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--warn"><div class="crozzo-invoice-kpi__label">Pendientes</div><div class="crozzo-invoice-kpi__value">' +
      kpis.pendientes +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">Por pagar</div><div class="crozzo-invoice-kpi__value">' +
      fmtMoney(kpis.valorPend) +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--success"><div class="crozzo-invoice-kpi__label">Pagadas hoy</div><div class="crozzo-invoice-kpi__value">' +
      kpis.pagadasHoy +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi' +
      (colaPlan ? ' crozzo-invoice-kpi--warn' : '') +
      '"><div class="crozzo-invoice-kpi__label">En cola planilla</div><div class="crozzo-invoice-kpi__value">' +
      (colaPlan ? colaPlan + ' · ' + fmtMoney(colaMonto) : '—') +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--info"><div class="crozzo-invoice-kpi__label">Total mes</div><div class="crozzo-invoice-kpi__value">' +
      fmtMoney(kpis.totalMes) +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">Con PDF</div><div class="crozzo-invoice-kpi__value">' +
      conPdf +
      '</div></div>' +
      '</div>' +
      filterBanner +
      '<div class="crozzo-oficina-toolbar">' +
      '<div class="crozzo-oficina-tabs">' +
      tabBtn('todas', 'Todas', counts.todas) +
      tabBtn('transferencias', 'Transferencias', counts.transferencias) +
      tabBtn('efectivo', 'Efectivo', counts.efectivo) +
      tabBtn('tarjetas', 'Tarjetas', counts.tarjetas) +
      '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="ccl-of-refresh">↻ Actualizar</button>' +
      '</div>' +
      '<div class="crozzo-oficina-table-wrap">' +
      '<table class="crozzo-oficina-table"><thead><tr>' +
      '<th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Método</th><th>Estado</th><th>Documento</th><th style="text-align:right">Acciones</th>' +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="7"><div class="crozzo-oficina-empty">' + esc(emptyMsg) + '</div></td></tr>') +
      '</tbody></table></div>' +
      (filtered.length > 120 ? '<p class="form-hint">Mostrando 120 de ' + filtered.length + ' — acote filtros o exporte CSV.</p>' : '') +
      filtersBlock +
      '<button type="button" class="crozzo-oficina-form-toggle" id="ccl-of-toggle-form" aria-expanded="' + (ofUi.formOpen ? 'true' : 'false') + '">' +
      '<span>➕ Registrar pago manual</span><span>' + (ofUi.formOpen ? '▲' : '▼') + '</span></button>' +
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
    host.innerHTML = renderOficina();
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
    if (!host) return;
    var res = R();
    if (res && res.runBlobMigration) res.runBlobMigration(res.load());
    if (host._cclOfClick) host.removeEventListener('click', host._cclOfClick);
    if (host._cclOfKey) host.removeEventListener('keydown', host._cclOfKey);

    host._cclOfClick = function (ev) {
      var t = ev.target && ev.target.closest
        ? ev.target.closest(
            '[data-of-tab],[data-of-preset],#ccl-of-apply,#ccl-of-clear,#ccl-of-show-all,#ccl-of-solo-pdf,#ccl-of-refresh,#ccl-of-toggle-form,#ccl-of-toggle-filters,#ccl-of-open-filters,#ccl-of-save,#ccl-of-export,#ccl-of-go-planilla,#ccl-of-go-recepcion,.ccl-of-pagar,.ccl-of-proceso,.ccl-of-ver-pdf,.ccl-of-revisar,.ccl-of-cerrar-pdf,.ccl-of-pdf-doc,.ccl-of-tab-pdf,.ccl-of-tab-oficina,.ccl-of-tab-historial,.ccl-of-goto-historial,.ccl-of-hist-open,.ccl-of-save-edit,.ccl-of-open-prov,.ccl-of-open-rut,.ccl-of-open-impuestos,.ccl-of-view-prov-doc,.ccl-of-expand-prov-doc'
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
        R().actualizarEstadoOficina(idPay, 'pagada');
        toast('Pago registrado → cola planilla', 'success');
        refreshOficina(host);
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
