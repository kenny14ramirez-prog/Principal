/**
 * Panel operativo — bodegas, remisiones, préstamos, bandeja entrante.
 */
(function (global) {
  'use strict';

  var ui = { tab: 'nueva', draftLineas: [] };

  function E() {
    return global.CrozzoFederacionEngine;
  }

  function esc(s) {
    return E() ? E().esc(s) : String(s == null ? '' : s);
  }

  function toast(m, t) {
    if (E()) E().toast(m, t);
  }

  function mpOptions() {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.list) return [];
    return C.list().filter(function (mp) {
      return mp && mp.activo !== false && mp.nombre;
    });
  }

  function injectStyles() {
    if (document.getElementById('crozzo-fed-ui-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-fed-ui-css';
    el.textContent =
      '.crozzo-fed-hub{--fed-gap:14px}' +
      '.crozzo-fed-hero{margin-bottom:var(--fed-gap);padding:18px 20px;border-radius:14px;border:1px solid var(--border);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 8%,var(--bg-card)),var(--bg-card))}' +
      '.crozzo-fed-hero h1{margin:0 0 6px;font-size:1.35rem}' +
      '.crozzo-fed-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:var(--fed-gap)}' +
      '.crozzo-fed-tabs button{padding:9px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-secondary);cursor:pointer;font-weight:600;font-size:12px;color:var(--text-muted)}' +
      '.crozzo-fed-tabs button.active{background:color-mix(in srgb,var(--accent) 18%,var(--bg-card));color:var(--text-primary);border-color:color-mix(in srgb,var(--accent) 35%,var(--border))}' +
      '.crozzo-fed-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--fed-gap)}@media(max-width:900px){.crozzo-fed-grid{grid-template-columns:1fr}}' +
      '.crozzo-fed-card{padding:16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)}' +
      '.crozzo-fed-badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase}' +
      '.crozzo-fed-badge--pendiente{background:color-mix(in srgb,#f59e0b 20%,transparent);color:#b45309}' +
      '.crozzo-fed-badge--enviada{background:color-mix(in srgb,#3b82f6 20%,transparent);color:#1d4ed8}' +
      '.crozzo-fed-badge--recibida{background:color-mix(in srgb,#10b981 20%,transparent);color:#047857}' +
      '.crozzo-fed-line-row{display:grid;grid-template-columns:1fr 100px 72px 36px;gap:8px;align-items:center;margin-bottom:8px}' +
      '.crozzo-fed-print-bar{margin:12px 0 4px;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-secondary)}' +
      '.crozzo-fed-print-bar .form-label{font-size:11px;margin-bottom:6px;display:block}';
    document.head.appendChild(el);
  }

  function badgeEstado(est) {
    var cls = 'crozzo-fed-badge';
    if (est === 'recibida') cls += ' crozzo-fed-badge--recibida';
    else if (est === 'enviada' || est === 'en_transito') cls += ' crozzo-fed-badge--enviada';
    else cls += ' crozzo-fed-badge--pendiente';
    return '<span class="' + cls + '">' + esc(est || 'borrador') + '</span>';
  }

  function renderRemisionPrintBar() {
    var eng = E();
    var current = eng ? eng.remisionSavedPrintOutput() : 'roll_80';
    var H = global.CrozzoPrintStudioHub;
    if (H && typeof H.renderPrintOutputPicker === 'function') {
      return (
        '<div class="crozzo-fed-print-bar" data-print-output-scope="remision">' +
        '<span class="form-label">Formato de impresión (bodega)</span>' +
        H.renderPrintOutputPicker('remision', current, ['roll_58', 'roll_80', 'carta', 'oficio']) +
        '<span class="form-hint" style="margin:6px 0 0">58/80 mm → térmica bodega · Carta/Oficio → copia en hoja</span></div>'
      );
    }
    var opts = [
      { id: 'roll_58', label: '58 mm térmica' },
      { id: 'roll_80', label: '80 mm térmica' },
      { id: 'carta', label: 'Carta A4' },
      { id: 'oficio', label: 'Oficio' },
    ];
    return (
      '<div class="crozzo-fed-print-bar">' +
      '<label class="form-label" for="fedPrintOutput">Formato de impresión</label>' +
      '<select class="form-input" id="fedPrintOutput" style="max-width:240px">' +
      opts
        .map(function (o) {
          return (
            '<option value="' +
            esc(o.id) +
            '"' +
            (current === o.id ? ' selected' : '') +
            '>' +
            esc(o.label) +
            '</option>'
          );
        })
        .join('') +
      '</select></div>'
    );
  }

  function renderTabs() {
    var tabs = [
      { id: 'nueva', label: 'Nueva remisión' },
      { id: 'salientes', label: 'Salientes' },
      { id: 'entrantes', label: 'Entrantes' },
      { id: 'prestamos', label: 'Préstamos' },
      { id: 'bodegas', label: 'Bodegas' },
    ];
    return (
      '<div class="crozzo-fed-tabs">' +
      tabs
        .map(function (t) {
          return (
            '<button type="button" class="' +
            (ui.tab === t.id ? 'active' : '') +
            '" data-fed-ui-tab="' +
            t.id +
            '">' +
            esc(t.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderLineEditor() {
    var mps = mpOptions();
    var lines = ui.draftLineas.length ? ui.draftLineas : [{ mpId: '', cantidad: '', und: 'kg' }];
    var rows = lines
      .map(function (ln, idx) {
        return (
          '<div class="crozzo-fed-line-row" data-line-idx="' +
          idx +
          '">' +
          '<select class="form-input fed-line-mp"><option value="">— Insumo —</option>' +
          mps
            .slice(0, 400)
            .map(function (mp) {
              return (
                '<option value="' +
                esc(mp.id) +
                '"' +
                (String(ln.mpId || '') === String(mp.id) ? ' selected' : '') +
                '>' +
                esc(mp.nombre) +
                '</option>'
              );
            })
            .join('') +
          '</select>' +
          '<input class="form-input fed-line-qty" type="number" step="any" placeholder="Cant." value="' +
          esc(ln.cantidad) +
          '" />' +
          '<input class="form-input fed-line-und" placeholder="Und" value="' +
          esc(ln.und || 'kg') +
          '" />' +
          '<button type="button" class="btn btn-outline btn-sm fed-line-rm">✕</button></div>'
        );
      })
      .join('');
    return (
      rows +
      '<button type="button" class="btn btn-outline btn-sm" id="fedAddLine">+ Línea</button>'
    );
  }

  function renderNueva() {
    var eng = E();
    if (!eng) return '<p>Módulo no cargado.</p>';
    var bodegas = eng.listBodegas();
    var socios = eng.listSocios();
    var bodOpts = bodegas
      .map(function (b) {
        return '<option value="' + esc(b.id) + '">' + esc(b.nombre) + '</option>';
      })
      .join('');
    var socOpts =
      '<option value="">— Mismo negocio —</option>' +
      socios
        .map(function (s) {
          return (
            '<option value="' +
            esc(s.id) +
            '" data-pid="' +
            esc(s.partnerNegocioId) +
            '" data-nom="' +
            esc(s.partnerNombre) +
            '">' +
            esc(s.partnerNombre || s.partnerNegocioId) +
            '</option>'
          );
        })
        .join('');
    var tipos = eng.TIPOS_DOC.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>';
    }).join('');
    return (
      '<div class="crozzo-fed-card">' +
      '<h3 style="margin:0 0 12px">Crear remisión o préstamo</h3>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="fedDocTipo">' +
      tipos +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Responsable</label><input class="form-input" id="fedEnviadoPor" placeholder="Nombre quien envía" /></div>' +
      '<div class="form-group"><label class="form-label">Bodega origen</label><select class="form-input" id="fedOrigenBod">' +
      bodOpts +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Bodega destino (local)</label><select class="form-input" id="fedDestinoBod">' +
      bodOpts +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Socio / otra sede</label><select class="form-input" id="fedSocioSel">' +
      socOpts +
      '</select></div>' +
      '<div class="form-group full"><label class="form-label">Notas</label><textarea class="form-input" id="fedNotas" rows="2"></textarea></div></div>' +
      '<h4 style="margin:16px 0 8px;font-size:0.9rem">Ítems</h4>' +
      '<div id="fedLineEditor">' +
      renderLineEditor() +
      '</div>' +
      '<div class="btn-group" style="margin-top:14px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" id="fedGuardarBorrador">Guardar borrador</button>' +
      '<button type="button" class="btn btn-outline" id="fedEnviarRem">Enviar remisión</button>' +
      '<button type="button" class="btn btn-outline" id="fedSyncNow" data-fed-sync="1">↻ Sincronizar socios</button></div>' +
      '<p class="form-hint" id="fedStockWarn" style="margin-top:10px"></p></div>'
    );
  }

  function renderListaRemisiones(filter) {
    var eng = E();
    var rows = eng ? eng.listRemisiones(filter) : [];
    if (!rows.length) return '<p class="form-hint">Sin documentos en esta bandeja.</p>';
    return (
      '<div class="table-container"><table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Origen → Destino</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rows
        .map(function (r) {
          var acciones = '';
          if (r.estado === 'borrador') {
            acciones +=
              '<button type="button" class="btn btn-primary btn-sm" data-fed-enviar="' +
              esc(r.id) +
              '">Enviar</button> ';
          } else {
            acciones +=
              '<button type="button" class="btn btn-outline btn-sm" data-fed-reenviar="' +
              esc(r.id) +
              '">Reenviar</button> ';
          }
          acciones +=
            '<button type="button" class="btn btn-outline btn-sm" data-fed-print="' +
            esc(r.id) +
            '">Imprimir</button> ' +
            '<button type="button" class="btn btn-outline btn-sm" data-fed-print-roll="' +
            esc(r.id) +
            '" title="Térmica bodega">🖨 Roll</button>';
          return (
            '<tr><td>' +
            esc((r.createdAt || '').slice(0, 10)) +
            '</td><td>' +
            esc(r.tipo) +
            '</td><td>' +
            esc(eng.bodegaLabel(r.origenBodegaId)) +
            ' → ' +
            esc(r.destinoNegocioNombre || eng.bodegaLabel(r.destinoBodegaId)) +
            '</td><td>' +
            badgeEstado(r.estado) +
            '</td><td>' +
            acciones +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderEntrantes() {
    var eng = E();
    var inbox = eng
      ? eng.loadStore().inbox.filter(function (row) {
          return row.estado === 'pendiente';
        })
      : [];
    if (!inbox.length) {
      return (
        '<div class="crozzo-fed-card">' +
        '<p class="form-hint" style="margin:0 0 10px">No hay remisiones entrantes pendientes.</p>' +
        '<button type="button" class="btn btn-outline btn-sm" data-fed-sync="1">↻ Sincronizar entrantes</button></div>'
      );
    }
    return (
      '<div style="margin-bottom:10px">' +
      '<button type="button" class="btn btn-outline btn-sm" data-fed-sync="1">↻ Sincronizar entrantes</button></div>' +
      '<div class="crozzo-fed-grid">' +
      inbox
        .map(function (row) {
          var lineas = (row.payload && row.payload.lineas) || [];
          var items = lineas
            .map(function (l) {
              return '<li>' + esc(l.producto || l.mpId || 'ítem') + ': ' + esc(l.cantidad) + ' ' + esc(l.und || '') + '</li>';
            })
            .join('');
          return (
            '<div class="crozzo-fed-card">' +
            '<strong>' +
            esc(row.origenNegocioNombre || row.origenNegocioId) +
            '</strong> · ' +
            badgeEstado(row.estado) +
            '<ul style="margin:8px 0;font-size:12px">' +
            (items || '<li>Sin detalle</li>') +
            '</ul>' +
            '<div class="form-group"><input class="form-input fed-rec-nombre" placeholder="Recibido por" /></div>' +
            '<div class="btn-group">' +
            '<button type="button" class="btn btn-primary btn-sm" data-fed-confirm="' +
            esc(row.id) +
            '">Confirmar recepción</button>' +
            '<button type="button" class="btn btn-outline btn-sm" data-fed-reject="' +
            esc(row.id) +
            '">Rechazar</button> ' +
            '<button type="button" class="btn btn-outline btn-sm" data-fed-print-inbox="' +
            esc(row.id) +
            '">Imprimir</button></div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderBodegas() {
    var eng = E();
    var list = eng ? eng.listBodegas() : [];
    var tipos = (eng && eng.TIPOS_BODEGA) || [];
    var tipoOpts = tipos.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>';
    }).join('');
    return (
      '<div class="crozzo-fed-grid">' +
      '<div class="crozzo-fed-card">' +
      '<h3 style="margin:0 0 10px">Bodegas registradas</h3>' +
      '<ul style="margin:0;padding-left:18px;font-size:13px">' +
      list
        .map(function (b) {
          return '<li><strong>' + esc(b.nombre) + '</strong> <span class="form-hint">(' + esc(b.tipo) + ')</span></li>';
        })
        .join('') +
      '</ul></div>' +
      '<div class="crozzo-fed-card">' +
      '<h3 style="margin:0 0 10px">Agregar bodega</h3>' +
      '<div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="fedNewBodNombre" /></div>' +
      '<div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="fedNewBodTipo">' +
      tipoOpts +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Área comanda (opcional)</label><input class="form-input" id="fedNewBodArea" placeholder="COCINA, BAR…" /></div>' +
      '<button type="button" class="btn btn-primary btn-sm" id="fedSaveBod">Guardar bodega</button></div></div>'
    );
  }

  function renderBody() {
    if (ui.tab === 'nueva') return renderNueva();
    if (ui.tab === 'salientes') return renderListaRemisiones({ direccion: 'saliente' });
    if (ui.tab === 'entrantes') return renderEntrantes();
    if (ui.tab === 'prestamos') return renderListaRemisiones({ tipo: 'prestamo' });
    if (ui.tab === 'bodegas') return renderBodegas();
    return renderNueva();
  }

  function collectLineas() {
    var lines = [];
    document.querySelectorAll('#fedLineEditor .crozzo-fed-line-row').forEach(function (row) {
      var sel = row.querySelector('.fed-line-mp');
      var mpId = sel ? sel.value : '';
      var qty = row.querySelector('.fed-line-qty')?.value;
      var und = row.querySelector('.fed-line-und')?.value || 'kg';
      if (!mpId || !qty) return;
      var label = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : mpId;
      lines.push({ mpId: mpId, producto: label, cantidad: Number(qty), und: und });
    });
    return lines;
  }

  function collectFormRemision() {
    var socioSel = document.getElementById('fedSocioSel');
    var opt = socioSel && socioSel.selectedOptions[0];
    var socioId = socioSel ? socioSel.value : '';
    return {
      tipo: document.getElementById('fedDocTipo')?.value || 'transferencia',
      enviadoPor: document.getElementById('fedEnviadoPor')?.value || '',
      origenBodegaId: document.getElementById('fedOrigenBod')?.value || '',
      destinoBodegaId: document.getElementById('fedDestinoBod')?.value || '',
      destinoSocioId: socioId,
      destinoNegocioId: opt ? opt.getAttribute('data-pid') || '' : '',
      destinoNegocioNombre: opt ? opt.getAttribute('data-nom') || '' : '',
      notas: document.getElementById('fedNotas')?.value || '',
      lineas: collectLineas(),
    };
  }

  function rerender() {
    var hub = document.querySelector('.crozzo-fed-hub');
    if (!hub) return;
    var neg = E() ? E().loadStore().negocio : { nombre: '', id: '' };
    hub.innerHTML =
      '<div class="crozzo-fed-hero">' +
      '<h1>Bodegas y remisiones</h1>' +
      '<p class="form-hint" style="margin:0">Transferencias, préstamos e intercambio entre bodegas' +
      (neg.nombre ? ' · <strong>' + esc(neg.nombre) + '</strong>' : '') +
      '. Configure socios en Super Admin → Federación.</p></div>' +
      '<div id="crozzo-fed-ui-tabs">' +
      renderTabs() +
      '</div>' +
      '<div id="crozzo-fed-print-bar-wrap">' +
      renderRemisionPrintBar() +
      '</div>' +
      '<div id="crozzo-fed-ui-body">' +
      renderBody() +
      '</div>';
    bindPanel();
  }

  function updateFedStockHints() {
    var eng = E();
    var bod = document.getElementById('fedOrigenBod')?.value || '';
    var warn = document.getElementById('fedStockWarn');
    if (!eng || !bod) {
      if (warn) warn.textContent = '';
      return;
    }
    document.querySelectorAll('#fedLineEditor .crozzo-fed-line-row').forEach(function (row) {
      var sel = row.querySelector('.fed-line-mp');
      var qty = row.querySelector('.fed-line-qty');
      if (!sel || !qty) return;
      var mpId = sel.value;
      if (!mpId) {
        qty.title = '';
        return;
      }
      var stk = eng.stockBodegaMp(mpId, bod);
      qty.title = 'Disponible en bodega origen: ' + stk;
      qty.placeholder = 'máx ~' + stk;
    });
    if (warn && ui.tab === 'nueva') {
      var draft = collectFormRemision();
      var val = eng.validarStockOrigen(draft);
      if (!val.ok && val.faltantes.length) {
        warn.innerHTML =
          '⚠ Stock insuficiente: ' +
          val.faltantes
            .map(function (f) {
              return esc(f.producto) + ' (tiene ' + f.have + ', pide ' + f.need + ' ' + f.und + ')';
            })
            .join(' · ');
      } else warn.textContent = '';
    }
  }

  function syncFed(showToast) {
    var eng = E();
    if (!eng) return Promise.resolve();
    return eng.syncAll().then(function () {
      if (showToast !== false) toast('Sincronización completada', 'success');
      if (ui.tab === 'entrantes' || ui.tab === 'salientes') rerender();
    });
  }

  function enviarRemisionId(id, opts) {
    opts = opts || {};
    var eng = E();
    if (!eng) return;
    var rem = eng.getRemision(id);
    if (!rem) {
      toast('Remisión no encontrada', 'warning');
      return;
    }
    if (rem.estado === 'borrador' && !opts.skipStockCheck) {
      var val = eng.validarStockOrigen(rem);
      if (!val.ok) {
        var msg = val.faltantes
          .map(function (f) {
            return f.producto + ': ' + f.have + '/' + f.need;
          })
          .join(', ');
        if (!confirm('Stock insuficiente en bodega origen (' + msg + '). ¿Enviar igualmente?')) return;
      }
    }
    eng.enviarRemision(id).then(function (r) {
      if (r.ok) {
        toast(r.reenvio ? 'Remisión reenviada' : 'Remisión enviada · stock actualizado', 'success');
        if (!r.reenvio && opts.print !== false) eng.printRemision(id);
      } else {
        toast('Error: ' + (r.error || 'no se pudo enviar'), 'error');
      }
      if (ui.tab === 'salientes' || ui.tab === 'prestamos') rerender();
    });
  }

  function onFedHubClick(ev) {
    var eng = E();
    if (!eng) return;

    var tabBtn = ev.target.closest('[data-fed-ui-tab]');
    if (tabBtn) {
      ui.tab = tabBtn.getAttribute('data-fed-ui-tab');
      ui.draftLineas = [];
      rerender();
      return;
    }

    var rmLine = ev.target.closest('.fed-line-rm');
    if (rmLine) {
      rmLine.closest('.crozzo-fed-line-row')?.remove();
      updateFedStockHints();
      return;
    }

    if (ev.target.id === 'fedAddLine' || ev.target.closest('#fedAddLine')) {
      ui.draftLineas = collectLineas();
      ui.draftLineas.push({ mpId: '', cantidad: '', und: 'kg' });
      var ed = document.getElementById('fedLineEditor');
      if (ed) ed.innerHTML = renderLineEditor();
      bindPanelInputs();
      return;
    }

    if (ev.target.closest('[data-fed-sync]')) {
      void syncFed(true);
      return;
    }

    if (ev.target.id === 'fedSaveBod' || ev.target.closest('#fedSaveBod')) {
      var nom = document.getElementById('fedNewBodNombre')?.value;
      if (!String(nom || '').trim()) {
        toast('Indique nombre de bodega', 'warning');
        return;
      }
      eng.upsertBodega({
        nombre: nom,
        tipo: document.getElementById('fedNewBodTipo')?.value,
        linkComandaArea: document.getElementById('fedNewBodArea')?.value,
      });
      toast('Bodega agregada', 'success');
      rerender();
      return;
    }

    if (ev.target.id === 'fedGuardarBorrador' || ev.target.closest('#fedGuardarBorrador')) {
      var data = collectFormRemision();
      if (!data.lineas.length) {
        toast('Agregue al menos una línea', 'warning');
        return;
      }
      eng.createRemision(data);
      ui.draftLineas = [];
      toast('Borrador guardado', 'success');
      ui.tab = 'salientes';
      rerender();
      return;
    }

    if (ev.target.id === 'fedEnviarRem' || ev.target.closest('#fedEnviarRem')) {
      var dataSend = collectFormRemision();
      if (!dataSend.lineas.length) {
        toast('Agregue al menos una línea', 'warning');
        return;
      }
      var valSend = eng.validarStockOrigen(dataSend);
      if (!valSend.ok) {
        var msgSend = valSend.faltantes
          .map(function (f) {
            return f.producto + ': ' + f.have + '/' + f.need;
          })
          .join(', ');
        if (!confirm('Stock insuficiente en bodega origen (' + msgSend + '). ¿Enviar igualmente?')) return;
      }
      var remNew = eng.createRemision(dataSend);
      ui.draftLineas = [];
      eng.enviarRemision(remNew.id).then(function (r) {
        if (r.ok) {
          toast('Remisión enviada · stock actualizado', 'success');
          eng.printRemision(remNew.id);
        } else toast('Error al enviar: ' + (r.error || ''), 'error');
        ui.tab = 'salientes';
        rerender();
      });
      return;
    }

    var enviarBtn = ev.target.closest('[data-fed-enviar]');
    if (enviarBtn) {
      enviarRemisionId(enviarBtn.getAttribute('data-fed-enviar'));
      return;
    }

    var reenvBtn = ev.target.closest('[data-fed-reenviar]');
    if (reenvBtn) {
      enviarRemisionId(reenvBtn.getAttribute('data-fed-reenviar'), { skipStockCheck: true, print: false });
      return;
    }

    var printRollBtn = ev.target.closest('[data-fed-print-roll]');
    if (printRollBtn) {
      var saved = eng.remisionSavedPrintOutput();
      var out = saved.indexOf('roll') >= 0 ? saved : 'roll_80';
      eng.printRemision(printRollBtn.getAttribute('data-fed-print-roll'), { printOutput: out });
      return;
    }

    var printInboxBtn = ev.target.closest('[data-fed-print-inbox]');
    if (printInboxBtn) {
      var row = eng.loadStore().inbox.find(function (x) {
        return x.id === printInboxBtn.getAttribute('data-fed-print-inbox');
      });
      if (row) eng.printRemision(eng.remisionFromInbox(row));
      return;
    }

    var printBtn = ev.target.closest('[data-fed-print]');
    if (printBtn) {
      eng.printRemision(printBtn.getAttribute('data-fed-print'));
      return;
    }

    var confirmBtn = ev.target.closest('[data-fed-confirm]');
    if (confirmBtn) {
      var card = confirmBtn.closest('.crozzo-fed-card');
      var nombre = card?.querySelector('.fed-rec-nombre')?.value || '';
      eng.confirmarEntrante(confirmBtn.getAttribute('data-fed-confirm'), { recibidoPor: nombre }).then(function (r) {
        if (r && r.ok) toast('Recepción confirmada', 'success');
        else toast('No se pudo confirmar' + (r && r.error ? ': ' + r.error : ''), 'warning');
        rerender();
      });
      return;
    }

    var rejectBtn = ev.target.closest('[data-fed-reject]');
    if (rejectBtn) {
      eng.confirmarEntrante(rejectBtn.getAttribute('data-fed-reject'), { rechazar: true }).then(function (r) {
        if (r && r.ok) toast('Remisión rechazada', 'info');
        else toast('No se pudo rechazar', 'warning');
        rerender();
      });
    }
  }

  function bindPanelInputs() {
    var fedPrintSel = document.getElementById('fedPrintOutput');
    if (fedPrintSel) {
      fedPrintSel.onchange = function (ev) {
        E()?.remisionSavePrintOutput(ev.target.value);
      };
    }
    var printHost = document.querySelector('[data-print-output-scope="remision"]');
    if (printHost && !printHost._fedPrintBound) {
      printHost._fedPrintBound = true;
      printHost.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.crozzo-print-output__btn');
        if (!btn) return;
        var id = btn.getAttribute('data-output');
        if (id) E()?.remisionSavePrintOutput(id);
      });
    }
    var origenBod = document.getElementById('fedOrigenBod');
    if (origenBod) {
      origenBod.onchange = updateFedStockHints;
      origenBod.oninput = updateFedStockHints;
    }
    document.querySelectorAll('.fed-line-mp, .fed-line-qty').forEach(function (el) {
      el.onchange = updateFedStockHints;
      el.oninput = updateFedStockHints;
    });
    updateFedStockHints();
  }

  function ensureHubDelegation() {
    var hub = document.querySelector('.crozzo-fed-hub');
    if (!hub || hub._fedDelegated) return;
    hub._fedDelegated = true;
    hub.addEventListener('click', onFedHubClick);
  }

  function bindPanel() {
    ensureHubDelegation();
    bindPanelInputs();
  }

  function render() {
    injectStyles();
    var eng = E();
    if (eng) eng.listBodegas();

    var neg = eng ? eng.loadStore().negocio : { nombre: '', id: '' };
    return (
      '<div class="crozzo-mod-page crozzo-fed-hub">' +
      '<div class="crozzo-fed-hero">' +
      '<h1>Bodegas y remisiones</h1>' +
      '<p class="form-hint" style="margin:0">Transferencias, préstamos e intercambio entre bodegas' +
      (neg.nombre ? ' · <strong>' + esc(neg.nombre) + '</strong>' : '') +
      '. Configure socios en Super Admin → Federación.</p></div>' +
      '<div id="crozzo-fed-ui-tabs">' +
      renderTabs() +
      '</div>' +
      '<div id="crozzo-fed-print-bar-wrap">' +
      renderRemisionPrintBar() +
      '</div>' +
      '<div id="crozzo-fed-ui-body">' +
      renderBody() +
      '</div></div>'
    );
  }

  function init() {
    ensureHubDelegation();
    bindPanel();
    var eng = E();
    var cfg = eng ? eng.loadFedConfig() : {};
    if (cfg.autoSync && eng) {
      eng.syncAll().catch(function () {});
    }
  }

  global.CrozzoFederacionOperaciones = {
    render: render,
    init: init,
  };
  global.renderFederacionOperaciones = render;
  global.initFederacionOperaciones = init;
})(typeof window !== 'undefined' ? window : globalThis);
