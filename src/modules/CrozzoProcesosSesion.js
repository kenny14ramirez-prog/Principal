/**
 * Crozzo POS — Nueva sesión de producción enlazada a recetas de Costos.
 * Porciones · ajuste proporcional · varias producciones · responsables.
 */
(function (global) {
  'use strict';

  var state = {
    workflow: '',
    host: null,
    responsables: [],
    batch: [],
    edit: null,
  };

  var WF = {
    despiece: {
      title: 'Partir carnes',
      icon: 'beef',
      tone: 'amber',
      sub: 'Pesa la pieza, anota qué sacaste y cuánto pesó cada cosa.',
      pickLabel: '¿Qué carne partiste?',
      steps: ['Pesar pieza', 'Anotar cada corte', 'Guardar'],
    },
    coccion: {
      title: 'Cocinar y porcionar',
      icon: 'flame',
      tone: 'rose',
      sub: 'Anota peso crudo, peso cocido y cuánto empaquetas para bodega.',
      pickLabel: '¿Qué estás cocinando?',
      steps: ['Pesos', 'Porciones', 'Guardar'],
    },
    elaboracion: {
      title: 'Salsas y bases',
      icon: 'soup',
      tone: 'violet',
      sub: 'Suma ingredientes y anota cuánto salió la salsa, caldo o base.',
      pickLabel: '¿Qué salsa o base preparaste?',
      steps: ['Ingredientes', 'Peso final', 'Guardar'],
    },
  };

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

  function fmtMoney(n) {
    var v = Math.round(Number(n) || 0);
    try {
      if (typeof global.crozzoFormatCop === 'function') return global.crozzoFormatCop(v);
    } catch (_) {}
    return '$' + v.toLocaleString('es-CO');
  }

  function R() {
    return global.CrozzoReservorio;
  }

  function C() {
    return global.CrozzoCatalogoMp;
  }

  function E() {
    return global.CrozzoCostosEngine;
  }

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d != null ? d : 0;
  }

  function injectStyles() {
    var css =
      '.cps{max-width:960px;margin:0 auto;color:var(--text-primary)}' +
      '.cps__head{margin-bottom:16px}' +
      '.cps__badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:5px 12px;border-radius:999px;border:1px solid var(--accent-12);color:var(--accent);background:var(--accent-08);margin-bottom:10px}' +
      '.cps__title{margin:0 0 6px;font-size:1.35rem;font-weight:650;letter-spacing:-.03em;color:var(--text-primary)}' +
      '.cps__sub{margin:0;font-size:14px;color:var(--text-muted);line-height:1.55}' +
      '.cps .form-label{font-size:13px;font-weight:600}' +
      '.cps .form-input,.cps .form-select{min-height:44px;font-size:15px}' +
      '.cps .btn{min-height:44px;font-size:14px}' +
      '.cps .btn-sm{min-height:36px}' +
      '.cps__head-actions{margin-top:12px}' +
      '.cps .card h3,.cps .card .card-title{margin:0 0 12px;font-size:13px;font-weight:650;color:var(--text-primary)}' +
      '.cps-total{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-radius:var(--radius-md,12px);background:var(--accent-08);border:1px solid var(--accent-12);margin-top:12px}' +
      '.cps-total__lbl{font-size:12px;color:var(--text-muted)}' +
      '.cps-total__val{font-size:1.15rem;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}' +
      '.cps-actions{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 16px;align-items:center}' +
      '.cps-hint{font-size:12px;color:var(--text-muted);margin:8px 0 0;line-height:1.5}' +
      '.cps-empty{font-size:13px;color:var(--text-muted);padding:12px 0}' +
      '.cps-link{background:none;border:none;padding:0;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px}' +
      '.cps-tag{display:inline-block;font-size:10px;padding:3px 8px;border-radius:999px;background:var(--bg-tertiary);color:var(--text-muted);margin-left:6px;vertical-align:middle}' +
      '.cps-tag--ok{background:var(--success-bg);color:var(--success)}' +
      '.cps-tag--warn{background:var(--warning-bg);color:var(--warning)}' +
      '.cps-tag--lock{background:var(--accent-08);color:var(--accent);font-size:9px}' +
      '.cps .table td.num,.cps .table th.num{text-align:right;font-variant-numeric:tabular-nums}' +
      '.cps .table input[type=number]{max-width:96px;text-align:right}' +
      '.cps-porc-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.cps-porc-btns .btn{padding:4px 12px;font-size:11px;min-height:28px}' +
      '.cps-porc-btns .btn.is-active{background:var(--accent-08);border-color:var(--accent);color:var(--accent)}' +
      '.cps-resp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}' +
      '.cps-resp-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:12px}' +
      '.cps-resp-chip.is-primary{border-color:var(--accent-12);background:var(--accent-08)}' +
      '.cps-resp-chip button{background:none;border:none;padding:0;cursor:pointer;color:var(--text-muted);font-size:14px;line-height:1}' +
      '.cps-batch-list{list-style:none;margin:0;padding:0}' +
      '.cps-batch-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px}' +
      '.cps-batch-item:last-child{border-bottom:none}' +
      '.cps-line-locked{opacity:.92}' +
      '.cps-line-unlock{font-size:10px;padding:2px 6px;margin-left:4px}' +
      '.cps-modo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}' +
      '.cps-modo-opt{display:block;padding:12px 14px;border:1px solid var(--border);border-radius:12px;cursor:pointer;background:var(--bg-card);transition:border-color .2s,background .2s;position:relative}' +
      '.cps-modo-opt.is-active{border-color:var(--accent);background:var(--accent-08);box-shadow:inset 0 0 0 1px var(--accent-12)}' +
      '.cps-modo-opt input{position:absolute;opacity:0;width:0;height:0}' +
      '.cps-modo-opt__title{display:block;font-size:13px;font-weight:650;margin-bottom:4px;color:var(--text-primary)}' +
      '.cps-modo-opt__desc{display:block;font-size:11px;color:var(--text-muted);line-height:1.45}' +
      '.cps-tipo-banner{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-tertiary);font-size:12px;color:var(--text-muted);line-height:1.45}' +
      '.cps-vender-check{display:inline-flex;align-items:center;gap:6px;margin:0;cursor:pointer;font-size:12px;color:var(--text-primary);font-weight:600}' +
      '.cps-vender-check input{margin:0;accent-color:var(--accent)}' +
      '.cps-merma{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-tertiary)}' +
      '.cps-merma__title{font-size:12px;font-weight:650;margin:0 0 8px;color:var(--text-primary)}' +
      '.cps-merma__esp{font-size:11px;color:var(--text-muted);margin:0 0 10px;line-height:1.45}' +
      '.cps-merma-live{display:flex;flex-wrap:wrap;gap:10px 16px;font-size:12px;margin-top:10px}' +
      '.cps-merma-live span{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:var(--bg-card);border:1px solid var(--border)}' +
      '.cps-merma-live .is-warn{border-color:var(--warning);color:var(--warning);background:var(--warning-bg)}' +
      '.cps-despiece-table input[type=text]{min-width:120px}' +
      '.cps-despiece-resumen{margin:14px 0 0;padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)}' +
      '.cps-despiece-resumen--ok{border-color:var(--success);background:var(--success-bg)}' +
      '.cps-despiece-resumen--warn{border-color:var(--warning);background:var(--warning-bg)}' +
      '.cps-despiece-resumen__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px 16px;margin-bottom:10px}' +
      '.cps-despiece-resumen__stats .lbl{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:2px}' +
      '.cps-despiece-resumen__stats .val{display:block;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text-primary)}' +
      '.cps-despiece-resumen__stats .val.is-warn{color:var(--warning)}' +
      '.cps-despiece-resumen__cortes{margin:0 0 10px;padding-left:18px;font-size:12px;line-height:1.55;color:var(--text-muted)}' +
      '.cps-despiece-verdict{margin:0;font-size:12px;font-weight:600;line-height:1.45}' +
      '.cps-despiece-verdict.is-ok{color:var(--success)}' +
      '.cps-despiece-verdict.is-warn{color:var(--warning)}' +
      '.cps-cortes-save-hint{font-size:11px;color:var(--success);font-weight:600;opacity:0;transition:opacity .2s}' +
      '.cps-cortes-save-hint.is-visible{opacity:1}' +
      '.cps-despiece-step{margin:0 0 20px;padding:16px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card)}' +
      '.cps-despiece-step__badge{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:999px;background:var(--accent-08);color:var(--accent);margin-bottom:10px}' +
      '.cps-despiece-step__title{margin:0 0 4px;font-size:16px;font-weight:650;color:var(--text-primary)}' +
      '.cps-despiece-step__help{margin:0 0 12px;font-size:13px;color:var(--text-muted);line-height:1.5}' +
      '.cps-despiece-step .form-input{font-size:18px;font-weight:600;text-align:center;max-width:200px}' +
      '.cps-corte-cards{display:flex;flex-direction:column;gap:12px;margin:12px 0}' +
      '.cps-corte-card{padding:14px 16px;border-radius:14px;border:1px solid var(--border);background:var(--bg-tertiary)}' +
      '.cps-corte-card .form-label{display:block;font-size:13px;font-weight:600;margin:0 0 6px;color:var(--text-primary)}' +
      '.cps-corte-card .form-label:not(:first-of-type){margin-top:12px}' +
      '.cps-corte-card .form-input{width:100%;min-height:48px;font-size:17px}' +
      '.cps-corte-card__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:12px}' +
      '@media(max-width:520px){.cps-corte-card__grid{grid-template-columns:1fr}}' +
      '.cps-corte-total-box{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:2px solid var(--accent);background:var(--accent-08);text-align:center}' +
      '.cps-corte-total-box__lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px}' +
      '.cps-corte-total-box__val{display:block;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent);line-height:1.3}' +
      '.cps-corte-total-box.is-empty{border-color:var(--border);background:var(--bg-card)}' +
      '.cps-corte-total-box.is-empty .cps-corte-total-box__val{font-size:14px;font-weight:500;color:var(--text-muted)}' +
      '.cps-corte-balanza{margin-top:12px;padding:12px;border-radius:12px;border:2px solid var(--warning);background:var(--warning-bg)}' +
      '.cps-corte-balanza .form-label{font-size:13px;font-weight:700;color:var(--text-primary)}' +
      '.cps-corte-balanza .form-label .cps-req{color:var(--warning);font-weight:800}' +
      '.cps-corte-balanza .form-input{font-size:20px;font-weight:800;min-height:52px;border-color:var(--warning)}' +
      '.cps-corte-balanza.is-done{border-color:var(--success);background:var(--success-bg)}' +
      '.cps-corte-balanza.is-done .form-input{border-color:var(--success)}' +
      '.cps-corte-diff{margin:10px 0 0;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.55;background:var(--bg-card);border:1px solid var(--border)}' +
      '.cps-corte-diff.is-ok{border-color:var(--success);background:var(--success-bg);color:var(--success)}' +
      '.cps-corte-diff.is-warn{border-color:var(--warning);background:var(--warning-bg);color:var(--warning)}' +
      '.cps-corte-diff.is-bad{border-color:var(--danger,#e5484d);background:rgba(229,72,77,.08);color:var(--danger,#e5484d)}' +
      '.cps-corte-diff strong{font-weight:800}' +
      '.cps-cortes-barra{margin:14px 0 0;padding:12px 14px;border-radius:12px;background:var(--bg-tertiary);border:1px solid var(--border);font-size:14px;line-height:1.55;color:var(--text-primary)}' +
      '.cps-cortes-barra strong{font-weight:750;color:var(--accent)}' +
      '.cps-cortes-barra.is-ok{border-color:var(--success);background:var(--success-bg)}' +
      '.cps-corte-porciones{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--accent-08);font-size:14px;font-weight:650;color:var(--accent);min-height:20px}' +
      '.cps-corte-porciones.is-muted{font-weight:500;color:var(--text-muted);background:var(--bg-card)}' +
      '.cps-corte-porciones.is-ready{color:var(--success);background:var(--success-bg)}' +
      '.cps-corte-card__foot{display:flex;justify-content:flex-end;margin-top:12px}' +
      '.cps-corte-card__foot .btn{font-size:12px;color:var(--text-muted);border-color:transparent;background:transparent}' +
      '.cps-despiece-story{margin:0 0 12px;font-size:15px;line-height:1.65;color:var(--text-primary)}' +
      '.cps-despiece-story strong{font-weight:700;color:var(--accent)}' +
      '.cps-despiece-list{margin:0 0 12px;padding:0;list-style:none;font-size:14px;line-height:1.7}' +
      '.cps-despiece-list li{padding:8px 12px;border-radius:10px;background:var(--bg-tertiary);margin-bottom:6px;display:flex;justify-content:space-between;gap:10px}' +
      '.cps-despiece-list li span:last-child{font-weight:700;font-variant-numeric:tabular-nums}' +
      '.cps-coach{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--bg-tertiary)}' +
      '.cps-coach__step{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:var(--bg-card);border:1px solid var(--border);font-size:12px;color:var(--text-muted)}' +
      '.cps-coach__step span.num{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--accent-08);color:var(--accent);font-size:11px;font-weight:700}' +
      '.cps.crozzo-procesos-host{max-width:920px;margin:0 auto}' +
      '.cps-hist-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 20px}' +
      '.cps-hist-stat{padding:16px 18px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card)}' +
      '.cps-hist-stat__lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)}' +
      '.cps-hist-stat__val{font-size:1.35rem;font-weight:700;margin-top:6px;font-variant-numeric:tabular-nums;color:var(--text-primary)}' +
      '.cps .table-container{border-radius:12px;overflow:auto;border:1px solid var(--border);background:var(--bg-card)}' +
      '.cps .table-container .table{margin:0}' +
      '.cps-hist-empty{text-align:center;padding:36px 24px;color:var(--text-muted);border:1px dashed var(--border);border-radius:14px;background:var(--bg-tertiary)}' +
      '.cps-hist-empty strong{display:block;font-size:15px;font-weight:650;color:var(--text-primary);margin-bottom:8px}' +
      '.cps-wf-pick{margin-bottom:16px}' +
      '.cps-wf-pick__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}' +
      '.cps-wf-pick__btn{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);cursor:pointer;font-family:inherit;text-align:left;transition:border-color .22s,box-shadow .22s,transform .22s;color:inherit}' +
      '.cps-wf-pick__btn:hover,.cps-wf-pick__btn.is-active{border-color:var(--accent);box-shadow:0 4px 18px rgba(0,0,0,.06);transform:translateY(-1px)}' +
      '.cps-wf-pick__btn.is-active{background:var(--accent-08)}' +
      '.cps-wf-pick__title{font-size:14px;font-weight:650;color:var(--text-primary)}' +
      '.cps-wf-pick__desc{font-size:11px;color:var(--text-muted);line-height:1.45}' +
      '.ccp.bona .cps .card{background:#fff;border-color:var(--bona-line,#e8e4de);box-shadow:var(--bona-shadow-sm,0 1px 3px rgba(0,0,0,.06))}' +
      '.ccp.bona .cps__title{font-family:var(--bona-font-display,inherit);color:var(--bona-charcoal)}' +
      '.ccp.bona .cps__sub{color:var(--bona-charcoal-soft)}' +
      '.ccp.bona .cps-hist-stat{border-color:var(--bona-line);background:#fff;box-shadow:var(--bona-shadow-sm)}' +
      '.ccp.bona .cps-wf-pick__btn{border-color:var(--bona-line);background:#fff}' +
      '.ccp.bona .cps-wf-pick__btn.is-active{border-color:var(--bona-gold);background:var(--bona-gold-08)}' +
      '.ccp.bona .cps-coach{border-color:var(--bona-line);background:linear-gradient(135deg,var(--bona-gold-08,#faf8f5),#fff)}' +
      '.ccp.bona .cps-coach__step{background:#fff;border-color:var(--bona-line)}' +
      '@media(max-width:640px){.cps-modo-grid{grid-template-columns:1fr}.cps-wf-pick__grid,.cps-hist-stats{grid-template-columns:1fr}}';
    var el = document.getElementById('crozzo-procesos-sesion-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-procesos-sesion-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function wfMeta(wf) {
    return (
      WF[wf] || {
        title: 'Anotar preparación',
        icon: 'utensils',
        tone: 'violet',
        sub: 'Elige qué preparaste y completa pesos o ingredientes.',
        pickLabel: '¿Qué preparaste?',
        steps: ['Elegir', 'Completar', 'Guardar'],
      }
    );
  }

  function workflowPickerHtml(active) {
    var ids = ['despiece', 'coccion', 'elaboracion'];
    var btns = ids
      .map(function (id) {
        var m = WF[id];
        return (
          '<button type="button" class="cps-wf-pick__btn' +
          (active === id ? ' is-active' : '') +
          '" data-cps-wf="' +
          id +
          '">' +
          '<span class="cps-wf-pick__title">' +
          esc(m.title) +
          '</span>' +
          '<span class="cps-wf-pick__desc">' +
          esc(m.sub) +
          '</span></button>'
        );
      })
      .join('');
    return (
      '<div class="card cps-wf-pick" id="cps-wf-pick">' +
      '<h3 class="card-title">¿Qué tipo de preparación vas a anotar?</h3>' +
      '<p class="cps-hint" style="margin:0">Elige para ver la lista correcta y los pasos guiados.</p>' +
      '<div class="cps-wf-pick__grid">' +
      btns +
      '</div></div>'
    );
  }

  function historialStatsHtml() {
    var res = R();
    if (!res) return '';
    var all = (res.load().cortes || []).filter(function (c) {
      return (c.modoProceso || 'prep_anticipado') !== 'bajo_demanda';
    });
    var hoy = new Date().toISOString().slice(0, 10);
    var mes = hoy.slice(0, 7);
    var today = 0;
    var month = 0;
    var total = all.length;
    all.forEach(function (c) {
      var f = String(c.fecha || '').slice(0, 10);
      if (f === hoy) today++;
      if (String(c.fecha || '').slice(0, 7) === mes) month++;
    });
    return (
      '<div class="cps-hist-stats">' +
      '<div class="cps-hist-stat"><div class="cps-hist-stat__lbl">Hoy</div><div class="cps-hist-stat__val">' +
      today +
      '</div></div>' +
      '<div class="cps-hist-stat"><div class="cps-hist-stat__lbl">Este mes</div><div class="cps-hist-stat__val">' +
      month +
      '</div></div>' +
      '<div class="cps-hist-stat"><div class="cps-hist-stat__lbl">Total en bodega</div><div class="cps-hist-stat__val">' +
      total +
      '</div></div></div>'
    );
  }

  function coachHtml(wf) {
    var meta = wfMeta(wf);
    if (!wf || !meta.steps || !meta.steps.length) return '';
    var steps = meta.steps
      .map(function (s, i) {
        return (
          '<span class="cps-coach__step"><span class="num">' +
          (i + 1) +
          '</span>' +
          esc(s) +
          '</span>'
        );
      })
      .join('');
    return '<div class="cps-coach" id="cps-coach">' + steps + '</div>';
  }

  function resetForWorkflow(wf) {
    state.workflow = wf || '';
    state.batch = [];
    state.edit = null;
    state.host = null;
  }

  function workflowFootnoteHtml(wf) {
    if (wf === 'despiece') {
      return '<p class="cps-hint">Elige la carne que vas a partir. Solo aparecen carnes y piezas enteras.</p>';
    }
    if (wf === 'coccion') {
      return '<p class="cps-hint">Pesa crudo, cocido y cuánto empaquetas para reservar.</p>';
    }
    if (wf === 'elaboracion') {
      return (
        '<p class="cps-hint">Salsas y bases con receta.' +
        (canVerValoresProcesos()
          ? ' <button type="button" class="cps-link" id="cps-goto-costos">¿Falta algo? Configurar receta</button>'
          : '') +
        '</p>'
      );
    }
    return (
      '<p class="cps-hint">Solo lo que guardas en bodega.' +
      (canVerValoresProcesos()
        ? ' <button type="button" class="cps-link" id="cps-goto-costos">¿Falta algo en la lista? Configurar receta</button>'
        : '') +
      '</p>'
    );
  }

  function isMpElaborado(mp) {
    if (!mp) return false;
    var catName = String(mp.categoria || '').toUpperCase();
    return mp.esElaborado || catName === 'ELABORADOS' || catName.indexOf('ELABOR') >= 0;
  }

  function listMpCoccion() {
    var cat = C();
    if (!cat || !cat.list) return [];
    var out = [];
    cat.list().forEach(function (mp) {
      if (!mp || !mp.nombre) return;
      if (cat.mpAptoCoccion ? cat.mpAptoCoccion(mp) : !isMpElaborado(mp)) out.push(mp);
    });
    out.sort(function (a, b) {
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
    return out;
  }

  function getMe() {
    return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  }

  function listStaffActivos() {
    if (typeof getUsuariosConfig !== 'function') return [];
    return (getUsuariosConfig().staff || []).filter(function (u) {
      return u && u.activo !== false;
    });
  }

  function initResponsables() {
    var me = getMe();
    if (!me) {
      return [{ id: 'OPERADOR', nombre: 'Operador', rol: '', principal: true }];
    }
    return [
      {
        id: me.id,
        nombre: String(me.nombre || me.id).trim(),
        rol: me.rol || '',
        principal: true,
      },
    ];
  }

  function responsableLabel(r) {
    if (!r) return '';
    var rol = String(r.rol || '').toLowerCase();
    var pref =
      rol.indexOf('coc') >= 0
        ? 'Cocina'
        : rol.indexOf('mes') >= 0
          ? 'Mesero/a'
          : rol.indexOf('caj') >= 0
            ? 'Caja'
            : rol.indexOf('admin') >= 0
              ? 'Admin'
              : 'Equipo';
    return pref + ' ' + String(r.nombre || r.id);
  }

  function responsablesPayload() {
    return (state.responsables || []).map(function (r) {
      return {
        id: r.id,
        nombre: r.nombre,
        rol: r.rol || '',
        principal: !!r.principal,
      };
    });
  }

  function primaryResponsable() {
    var list = state.responsables || [];
    return list.filter(function (r) {
      return r.principal;
    })[0] || list[0] || null;
  }

  function loadBaseLineas(slug) {
    var cat = C();
    var eng = E();
    if (!cat || !eng || !slug) return [];
    var pack =
      global.CrozzoCostosRecetaLineasCalc &&
      typeof global.CrozzoCostosRecetaLineasCalc === 'function'
        ? global.CrozzoCostosRecetaLineasCalc(slug, null, { readOnly: true })
        : null;
    if (!pack || !pack.lineas || !pack.lineas.length) {
      var rec = cat.getRecetaPlato(slug);
      if (!rec || !rec.lineas.length) return [];
      var store = cat.buildPreciosStore();
      var resolve = global.CrozzoCostosResolveCostoUnitarioLinea;
      pack = {
        lineas: rec.lineas.map(function (ln) {
          return {
            ingrediente: ln.ingrediente,
            unidad: ln.unidad || ln.und || 'GR',
            cantidad: ln.cantidad,
            mpId: ln.mpId,
            costoXUnidad: resolve ? resolve(ln, eng, cat, store) : 0,
          };
        }),
        opts: rec.opts || {},
      };
    }
    return pack.lineas.map(function (ln) {
      return Object.assign({}, ln, { cantidadBase: num(ln.cantidad, 0) });
    });
  }

  function inferModoForSlug(slug) {
    var cat = C();
    if (!cat || !slug) return 'prep_anticipado';
    var menu = cat.getMenuPlato(slug);
    if (cat.inferModoProcesoFromMenu) return cat.inferModoProcesoFromMenu(menu);
    return 'prep_anticipado';
  }

  function modoProcesoLabel(m) {
    return m === 'bajo_demanda' ? 'Al momento' : 'Preparación anticipada';
  }

  function modoProcesoHint(m) {
    if (m === 'bajo_demanda') {
      return 'Consume materia prima y elaborados ya guardados (ej. salsa elaborada). No suma stock — va directo al plato o vaso.';
    }
    return 'Descuenta MP cruda y suma el resultado en inventario ELABORADOS para usar después.';
  }

  function readModoFromHost(host) {
    var r = host && host.querySelector('input[name="cps-modo"]:checked');
    return r ? r.value : null;
  }

  function prepOnlyBannerHtml() {
    return (
      '<div class="cps-tipo-banner" id="cps-tipo-banner">' +
      '<span class="cps-tag">Para bodega</span>' +
      '<span>Lo que preparas hoy y guardas para el servicio. ' +
      'Los platos al pedido (huevos, pastas al momento…) se descuentan solos en caja — no los anotes aquí.</span></div>'
    );
  }

  function syncVenderCheckFromModo(host, modo) {
    var chk = host.querySelector('#cps-vender-al-momento');
    if (!chk || chk._cpsSyncing) return;
    chk._cpsSyncing = true;
    chk.checked = modo === 'bajo_demanda';
    chk._cpsSyncing = false;
  }

  function applyModoToHost(host, modo) {
    modo = modo || 'prep_anticipado';
    if (state.edit) state.edit.modoProceso = modo;
    host.querySelectorAll('input[name="cps-modo"]').forEach(function (radio) {
      radio.checked = radio.value === modo;
    });
    host.querySelectorAll('.cps-modo-opt').forEach(function (lbl) {
      var radio = lbl.querySelector('input[name="cps-modo"]');
      lbl.classList.toggle('is-active', !!(radio && radio.checked));
    });
    var hint = host.querySelector('#cps-modo-hint');
    if (hint) hint.textContent = modoProcesoHint(modo);
    if (state.edit && state.edit.tipoReceta === 'base') syncVenderCheckFromModo(host, modo);
  }

  function persistVendeAlCliente(slug, checked) {
    var cat = C();
    if (!cat || !slug || !cat.updateMenuPlato) return;
    cat.updateMenuPlato(slug, { vendeAlCliente: !!checked });
    if (state.edit && state.edit.slug === slug) state.edit.vendeAlCliente = !!checked;
  }

  function calcMermasLive(ent, coc, util) {
    var cat = C();
    if (cat && cat.calcMermasProceso) return cat.calcMermasProceso(ent, coc, util);
    return {
      mermaCoccionPct: null,
      mermaDespostePct: null,
      mermaCoccionKg: 0,
      mermaDesposteKg: 0,
      mermaTotalKg: 0,
    };
  }

  var DESPIECE_TPL_KEY = 'crozzo_despiece_tpl_';
  var persistCortesTimer = null;

  function despieceCorteId() {
    return 'corte_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function loadCortesTemplateLocal(mpId) {
    try {
      var raw = localStorage.getItem(DESPIECE_TPL_KEY + mpId);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch (_) {}
    return [];
  }

  function saveCortesTemplateLocal(mpId, cortes) {
    if (!mpId || !cortes) return;
    try {
      localStorage.setItem(
        DESPIECE_TPL_KEY + mpId,
        JSON.stringify(
          (cortes || []).map(function (c) {
            return {
              id: c.id,
              nombre: String(c.nombre || '').trim(),
              pctRef: c.pctRef !== '' && c.pctRef != null ? num(c.pctRef) : null,
              grPorPorcion:
                c.grPorPorcion !== '' && c.grPorPorcion != null && num(c.grPorPorcion) > 0
                  ? num(c.grPorPorcion)
                  : null,
            };
          })
        )
      );
    } catch (_) {}
  }

  function loadCortesTemplate(mpId) {
    var cat = C();
    var mp = cat && cat.get ? cat.get(mpId) : null;
    var fromCat = mp && Array.isArray(mp.cortesDespiece) && mp.cortesDespiece.length ? mp.cortesDespiece : null;
    if (!fromCat || !fromCat.length) {
      fromCat = loadCortesTemplateLocal(mpId);
      if (fromCat.length && cat && cat.saveCortesDespiece) {
        cat.saveCortesDespiece(mpId, fromCat);
      }
    }
    if (!fromCat || !fromCat.length) {
      return [{ id: despieceCorteId(), nombre: '', pctRef: '', grPorPorcion: '', cantPorciones: '', kgReal: 0 }];
    }
    return fromCat.map(function (c) {
      return {
        id: c.id || despieceCorteId(),
        nombre: c.nombre || '',
        pctRef: c.pctRef != null && c.pctRef !== '' ? num(c.pctRef) : '',
        grPorPorcion: c.grPorPorcion > 0 ? num(c.grPorPorcion) : '',
        cantPorciones: '',
        kgReal: 0,
        grReal: 0,
      };
    });
  }

  function persistCortesDespiece(host, mpId, cortes, opts) {
    opts = opts || {};
    if (!mpId) return;
    cortes = cortes || [];
    var cat = C();
    var payload = cat && cat.normalizeCortesDespiece ? cat.normalizeCortesDespiece(cortes) : cortes;
    if (cat && cat.saveCortesDespiece) {
      cat.saveCortesDespiece(mpId, cortes);
    }
    saveCortesTemplateLocal(mpId, cortes);
    if (opts.toastDelete) toast('Listo, quitamos ese corte', 'info');
    else if (opts.silent !== true && payload.length) showCortesSavedHint(host);
  }

  function showCortesSavedHint(host) {
    if (!host) return;
    var el = host.querySelector('#cps-cortes-save-hint');
    if (!el) return;
    el.textContent = '✓ Guardado';
    el.classList.add('is-visible');
    clearTimeout(el._hideT);
    el._hideT = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 1800);
  }

  function schedulePersistCortes(host, mpId, cortes) {
    clearTimeout(persistCortesTimer);
    persistCortesTimer = setTimeout(function () {
      persistCortesDespiece(host, mpId, cortes, { silent: false });
    }, 400);
  }

  function readCortesFromHost(host, edit) {
    if (!edit || !edit.cortesDespiece) return [];
    return edit.cortesDespiece.map(function (c) {
      var row = host.querySelector('[data-corte-id="' + c.id + '"]');
      if (!row) return c;
      var nom = (row.querySelector('.cps-corte-nom') || {}).value || '';
      var pctInp = row.querySelector('.cps-corte-pct');
      var pctRaw = pctInp ? pctInp.value : null;
      var pct =
        pctRaw === '' || pctRaw == null
          ? c.pctRef !== '' && c.pctRef != null
            ? num(c.pctRef)
            : ''
          : num(pctRaw);
      var undRaw = (row.querySelector('.cps-corte-und') || {}).value;
      var und =
        undRaw === '' || undRaw == null
          ? c.cantPorciones !== '' && c.cantPorciones != null
            ? num(c.cantPorciones)
            : ''
          : num(undRaw);
      var grBalanza = Math.round(num((row.querySelector('.cps-corte-gr') || {}).value, 0));
      var grPorRaw = (row.querySelector('.cps-corte-gr-porcion') || {}).value;
      var grPor =
        grPorRaw === '' || grPorRaw == null
          ? c.grPorPorcion !== '' && c.grPorPorcion != null
            ? num(c.grPorPorcion)
            : ''
          : num(grPorRaw);
      var resolved = resolveCortePeso({
        cantPorciones: und,
        grPorPorcion: grPor,
        grBalanza: grBalanza,
      });
      return {
        id: c.id,
        nombre: nom.trim(),
        pctRef: pct,
        cantPorciones: und,
        grPorPorcion: grPor,
        grBalanza: grBalanza,
        grReal: resolved.grReal,
        kgReal: resolved.kgReal,
      };
    });
  }

  /** Tolerancia por corte: balanza vs porciones × g (lee tolerancia admin). */
  function corteToleranciaGr(esperadoGr) {
    esperadoGr = Math.round(num(esperadoGr));
    var pctTol = 0.03;
    var cat = C();
    if (cat && cat.getPerdidasProcesoRef) {
      pctTol = num(cat.getPerdidasProcesoRef().toleranciaPct, 3) / 100;
    }
    if (esperadoGr <= 0) return 30;
    return Math.max(30, Math.round(esperadoGr * pctTol));
  }

  /** Diferencia grave — no deja guardar sin corregir. */
  function corteDeltaGraveGr(esperadoGr) {
    esperadoGr = Math.round(num(esperadoGr));
    if (esperadoGr <= 0) return 50;
    return Math.max(50, Math.round(esperadoGr * 0.1));
  }

  function calcPorcionesCorte(grTotal, grPorPorcion, cantUnd) {
    grTotal = num(grTotal);
    grPorPorcion = num(grPorPorcion);
    cantUnd = num(cantUnd);
    if (cantUnd > 0 && grPorPorcion > 0) {
      var calcGr = cantUnd * grPorPorcion;
      var grEfectivo = grTotal > 0 ? grTotal : calcGr;
      var restoUnd = grEfectivo > 0 ? Math.round(grEfectivo - cantUnd * grPorPorcion) : 0;
      return { porciones: cantUnd, restoGr: restoUnd > 0 ? restoUnd : 0, grCalc: calcGr };
    }
    if (grTotal <= 0 || grPorPorcion <= 0) return { porciones: null, restoGr: 0, grCalc: 0 };
    var porciones = Math.floor(grTotal / grPorPorcion);
    var restoGr = Math.round(grTotal - porciones * grPorPorcion);
    return { porciones: porciones, restoGr: restoGr, grCalc: porciones * grPorPorcion };
  }

  function resolveCortePeso(c) {
    c = c || {};
    var und = c.cantPorciones === '' || c.cantPorciones == null ? 0 : num(c.cantPorciones);
    var grPor = c.grPorPorcion === '' || c.grPorPorcion == null ? 0 : num(c.grPorPorcion);
    var grBalanza =
      c.grBalanza != null && c.grBalanza !== ''
        ? Math.round(num(c.grBalanza))
        : num(c.grReal) > 0
          ? Math.round(num(c.grReal))
          : num(c.kgReal) > 0
            ? Math.round(num(c.kgReal) * 1000)
            : 0;
    var grCalc = und > 0 && grPor > 0 ? und * grPor : 0;
    var grReal = grBalanza;
    var deltaGr = grBalanza > 0 && grCalc > 0 ? grBalanza - grCalc : null;
    var tol = corteToleranciaGr(grCalc);
    var graveLim = corteDeltaGraveGr(grCalc);
    var deltaOk = deltaGr != null && Math.abs(deltaGr) <= tol;
    var deltaGrave = deltaGr != null && Math.abs(deltaGr) > graveLim;
    var porc = calcPorcionesCorte(grBalanza, grPor, und);
    var restoGr = und > 0 && grPor > 0 && grBalanza > 0 ? Math.max(0, Math.round(grBalanza - und * grPor)) : porc.restoGr;
    return {
      cantPorciones: und > 0 ? und : porc.porciones,
      grPorPorcion: grPor > 0 ? grPor : null,
      grBalanza: grBalanza,
      grCalc: grCalc,
      grReal: grReal,
      kgReal: grReal > 0 ? grReal / 1000 : 0,
      porciones: und > 0 ? und : porc.porciones,
      restoGr: restoGr,
      deltaGr: deltaGr,
      deltaOk: deltaOk,
      deltaGrave: deltaGrave,
      tieneBalanza: grBalanza > 0,
      tienePorciones: und > 0 && grPor > 0,
    };
  }

  function fmtCorteDiffHtml(resolved) {
    resolved = resolved || {};
    var und = num(resolved.cantPorciones || resolved.porciones);
    var grPor = num(resolved.grPorPorcion);
    var grCalc = num(resolved.grCalc);
    var grBalanza = num(resolved.grBalanza);
    if (!(grCalc > 0) && !(grBalanza > 0)) return '';
    var parts = [];
    if (grCalc > 0) {
      parts.push(
        'Por porciones: <strong>' +
          und.toLocaleString('es-CO') +
          ' × ' +
          grPor.toLocaleString('es-CO') +
          ' g = ' +
          fmtPesoGr(grCalc) +
          '</strong>'
      );
    }
    if (grBalanza > 0) {
      parts.push('Balanza: <strong>' + fmtPesoGr(grBalanza) + '</strong>');
    } else if (grCalc > 0) {
      return parts.join(' · ') + ' — <strong>falta pesar en balanza</strong>';
    }
    if (grCalc > 0 && grBalanza > 0 && resolved.deltaGr != null) {
      var d = Math.round(resolved.deltaGr);
      if (d === 0) {
        parts.push('Cuadra perfecto ✓');
      } else {
        var sign = d > 0 ? '+' : '';
        parts.push('Diferencia: <strong>' + sign + d + ' g</strong>');
      }
    }
    return parts.join(' · ');
  }

  function fmtCorteTotalFormula(und, grPor, grTotal) {
    und = num(und);
    grPor = num(grPor);
    grTotal = Math.round(num(grTotal));
    if (und > 0 && grPor > 0) {
      var total = grTotal > 0 ? grTotal : und * grPor;
      return (
        und.toLocaleString('es-CO') +
        ' × ' +
        grPor.toLocaleString('es-CO') +
        ' g = ' +
        fmtPesoGr(total)
      );
    }
    if (grTotal > 0 && grPor > 0) {
      var p = Math.floor(grTotal / grPor);
      if (p > 0) {
        return (
          p.toLocaleString('es-CO') +
          ' × ' +
          grPor.toLocaleString('es-CO') +
          ' g = ' +
          fmtPesoGr(p * grPor) +
          (grTotal > p * grPor ? ' (+ ' + (grTotal - p * grPor) + ' g)' : '')
        );
      }
    }
    return '';
  }

  function fmtPorcionesLinea(l) {
    if (!l || l.porciones == null || l.porciones <= 0) return '';
    var esperado =
      num(l.grCalc) > 0
        ? l.porciones + ' × ' + num(l.grPorPorcion) + ' g = ' + fmtPesoGr(l.grCalc)
        : l.porciones + ' porc. de ' + num(l.grPorPorcion) + ' g';
    if (num(l.grBalanza) > 0) {
      esperado += ' · balanza ' + fmtPesoGr(l.grBalanza);
      if (l.deltaGr != null && Math.round(l.deltaGr) !== 0) {
        esperado += ' (' + (l.deltaGr > 0 ? '+' : '') + Math.round(l.deltaGr) + ' g)';
      }
    }
    if (l.restoGr > 0) esperado += ' (' + l.restoGr + ' g sin empaquetar)';
    return esperado;
  }

  function validateDespieceCortes(host, edit) {
    edit = edit || state.edit;
    if (!host || !edit) return { ok: false, msg: 'Completa el despiece' };
    var cortes = readCortesFromHost(host, edit);
    var activos = cortes.filter(function (c) {
      return (c.nombre || '').trim();
    });
    if (!activos.length) return { ok: false, msg: 'Anota al menos un corte con nombre' };
    for (var i = 0; i < activos.length; i++) {
      var c = activos[i];
      var r = resolveCortePeso(c);
      var nom = c.nombre;
      if (!r.tieneBalanza) return { ok: false, msg: 'Pesa «' + nom + '» en la balanza (g) — es obligatorio' };
      if (!r.tienePorciones) {
        return { ok: false, msg: 'Cuenta porciones y gramos de «' + nom + '» para comparar con la balanza' };
      }
      if (r.deltaGrave) {
        return {
          ok: false,
          msg:
            '«' +
            nom +
            '»: la balanza (' +
            r.grBalanza +
            ' g) no cuadra con ' +
            r.porciones +
            ' × ' +
            r.grPorPorcion +
            ' g (= ' +
            r.grCalc +
            ' g). Vuelve a pesar o corrige el conteo.',
        };
      }
    }
    return { ok: true, cortes: cortes };
  }

  function readEntradaGrFromHost(host) {
    if (!host) return 0;
    var grInp = host.querySelector('#cps-mp-entrada-gr');
    if (grInp && grInp.value !== '' && grInp.value != null) {
      return Math.round(num(grInp.value, 0));
    }
    var kgInp = host.querySelector('#cps-mp-entrada');
    if (kgInp && num(kgInp.value) > 0) return Math.round(num(kgInp.value) * 1000);
    return 0;
  }

  function syncEntradaKgHidden(host) {
    if (!host) return;
    var gr = readEntradaGrFromHost(host);
    var hid = host.querySelector('#cps-mp-entrada');
    if (hid) hid.value = gr > 0 ? String(gr / 1000) : '';
  }

  function fmtPesoGr(gr) {
    gr = Math.round(num(gr));
    if (gr <= 0) return '0 g';
    if (gr >= 1000) {
      var kg = gr / 1000;
      return (kg >= 10 ? kg.toFixed(1) : kg.toFixed(2)) + ' kg';
    }
    return gr.toLocaleString('es-CO') + ' g';
  }

  /** Tolerancia al pesar: diferencias pequeñas no son “merma grave”. */
  function mermaToleranciaGr(entGr) {
    entGr = Math.round(num(entGr));
    if (entGr <= 0) return 30;
    return Math.max(30, Math.round(entGr * 0.005));
  }

  function describeSobranteGlobal(mermaGr, entGr) {
    mermaGr = Math.round(num(mermaGr));
    entGr = Math.round(num(entGr));
    if (mermaGr <= 0) {
      return { txt: ' No sobró nada — cuadra perfecto.', esMinima: true, esGrave: false };
    }
    if (mermaGr <= mermaToleranciaGr(entGr)) {
      return {
        txt: ' Diferencia al pesar: <strong>' + mermaGr + ' g</strong> — normal entre balanzas.',
        esMinima: true,
        esGrave: false,
      };
    }
    return {
      txt: ' Sobró o se perdió <strong>' + fmtPesoGr(mermaGr) + '</strong> (no quedó en ningún corte).',
      esMinima: false,
      esGrave: true,
    };
  }

  function calcDespieceSummary(entKg, cortes, mp, opts) {
    opts = opts || {};
    var entGr = opts.entGr != null ? Math.round(num(opts.entGr)) : Math.round(num(entKg) * 1000);
    cortes = cortes || [];
    var sumGr = 0;
    var pctRefSum = 0;
    var lineas = cortes.map(function (c) {
      var resolved = resolveCortePeso(c);
      var gr = Math.round(resolved.grReal);
      var kg = resolved.kgReal;
      var grPor = num(resolved.grPorPorcion);
      var porc = {
        porciones: resolved.porciones,
        restoGr: resolved.restoGr,
      };
      var pctRef = num(c.pctRef);
      var pctReal = entGr > 0 && gr > 0 ? (gr / entGr) * 100 : null;
      sumGr += gr;
      if (pctRef > 0) pctRefSum += pctRef;
      return {
        id: c.id,
        nombre: c.nombre,
        pctRef: pctRef > 0 ? pctRef : null,
        kgReal: kg,
        grReal: gr,
        grBalanza: resolved.grBalanza,
        grCalc: resolved.grCalc,
        grPorPorcion: grPor > 0 ? grPor : null,
        porciones: porc.porciones,
        restoGr: resolved.restoGr,
        deltaGr: resolved.deltaGr,
        deltaOk: resolved.deltaOk,
        deltaGrave: resolved.deltaGrave,
        pctReal: pctReal,
      };
    });
    var mermaGr = entGr > 0 ? Math.max(0, entGr - sumGr) : 0;
    var entradaKg = entGr / 1000;
    var sumKg = sumGr / 1000;
    var mermaKg = mermaGr / 1000;
    var mermaPct = entGr > 0 && sumGr > 0 ? (mermaGr / entGr) * 100 : null;
    var utilPct = entGr > 0 && sumGr > 0 ? (sumGr / entGr) * 100 : null;
    var mermas = calcMermasLive(entradaKg, 0, sumKg);
    var cat = C();
    var alertaRaw =
      canVerMermaReferencias() && cat && cat.evalMermaProcesoAlerta && mp
        ? cat.evalMermaProcesoAlerta(mp, mermas)
        : { ok: true };
    var esMinima = mermaGr <= mermaToleranciaGr(entGr);
    var alerta = esMinima ? { ok: true } : alertaRaw;
    var espD =
      canVerMermaReferencias() && cat && cat.perdidaEsperadaPct
        ? num(cat.perdidaEsperadaPct(mp, 'despiece'))
        : mp && canVerMermaReferencias()
          ? num(mp.mermaDespostePct)
          : 0;
    var deltaPp = espD > 0 && mermaPct != null ? mermaPct - espD : null;
    return {
      entradaKg: entradaKg,
      entradaGr: entGr,
      sumKg: sumKg,
      sumGr: sumGr,
      utilPct: utilPct,
      mermaKg: mermaKg,
      mermaGr: mermaGr,
      mermaPct: mermaPct,
      mermaEsMinima: esMinima,
      pctRefSum: pctRefSum,
      lineas: lineas,
      mermas: mermas,
      alerta: alerta,
      espDespostePct: espD > 0 ? espD : null,
      deltaPp: deltaPp,
    };
  }

  function despieceResumenHtml(summary, mp) {
    summary = summary || {};
    var mpNom = mp && mp.nombre ? String(mp.nombre) : 'la carne';
    if (summary.entradaGr <= 0) {
      return (
        '<div class="cps-despiece-step" id="cps-despiece-resumen">' +
        '<span class="cps-despiece-step__badge">Paso 3</span>' +
        '<p class="cps-despiece-step__title">¿Cómo quedó?</p>' +
        '<p class="cps-despiece-step__help">Primero pon cuánto pesó toda la pieza (paso 1).</p></div>'
      );
    }
    var hasCortes = summary.sumGr > 0;
    if (!hasCortes) {
      return (
        '<div class="cps-despiece-step" id="cps-despiece-resumen">' +
        '<span class="cps-despiece-step__badge">Paso 3</span>' +
        '<p class="cps-despiece-step__title">¿Cómo quedó?</p>' +
        '<p class="cps-despiece-step__help">Anota al menos un corte con su peso (paso 2).</p></div>'
      );
    }
    var sobrante = describeSobranteGlobal(summary.mermaGr, summary.entradaGr);
    var okCls = '';
    var warnCls = '';
    if (canVerMermaReferencias()) {
      okCls = summary.alerta && summary.alerta.ok ? ' cps-despiece-resumen--ok' : '';
      warnCls = summary.alerta && !summary.alerta.ok ? ' cps-despiece-resumen--warn' : '';
    } else {
      okCls = !sobrante.esGrave ? ' cps-despiece-resumen--ok' : '';
      warnCls = sobrante.esGrave ? ' cps-despiece-resumen--warn' : '';
    }
    var lineasHtml = (summary.lineas || [])
      .filter(function (l) {
        return l.grReal > 0 && l.nombre;
      })
      .map(function (l) {
        var pesoTxt = num(l.grBalanza) > 0 ? fmtPesoGr(l.grBalanza) + ' (balanza)' : num(l.grReal) > 0 ? num(l.grReal).toFixed(0) + ' g' : '';
        var porcTxt = fmtPorcionesLinea(l);
        return (
          '<li><span>' +
          esc(l.nombre) +
          (porcTxt ? ' · ' + esc(porcTxt) : '') +
          '</span><span>' +
          pesoTxt +
          '</span></li>'
        );
      })
      .join('');
    var veredicto = '';
    if (sobrante.esGrave) {
      veredicto =
        '<p class="cps-despiece-verdict is-warn">⚠ Falta anotar ' +
        fmtPesoGr(summary.mermaGr) +
        ' en algún corte (hueso, grasa, recorte…). Cuéntale al jefe de cocina.</p>';
    } else if (sobrante.esMinima && summary.mermaGr > 0) {
      veredicto =
        '<p class="cps-despiece-verdict is-ok">✓ Cuadra — ' + summary.mermaGr + ' g de diferencia al pesar (normal).</p>';
    } else {
      veredicto = '<p class="cps-despiece-verdict is-ok">✓ Todo cuadra.</p>';
    }
    var ayudaSobrante = canVerMermaReferencias()
      ? '<p class="cps-despiece-step__help" style="margin-top:8px">La merma es lo que <em>no</em> pusiste en ningún corte.</p>'
      : '<p class="cps-despiece-step__help" style="margin-top:8px">Lo que no anotaste en un corte (hueso, grasa…) va en otro corte o en recorte.</p>';
    var refPerdida =
      canVerMermaReferencias() && summary.espDespostePct
        ? '<p class="cps-hint">Referencia al partir: ~' + summary.espDespostePct.toFixed(0) + '%</p>'
        : '';
    return (
      '<div class="cps-despiece-step cps-despiece-resumen' +
      okCls +
      warnCls +
      '" id="cps-despiece-resumen">' +
      '<span class="cps-despiece-step__badge">Paso 3</span>' +
      '<p class="cps-despiece-step__title">Así quedó</p>' +
      '<p class="cps-despiece-story">Entraste con <strong>' +
      fmtPesoGr(summary.entradaGr) +
      '</strong> de ' +
      esc(mpNom) +
      '. En cortes anotaste <strong>' +
      fmtPesoGr(summary.sumGr) +
      '</strong>.' +
      sobrante.txt +
      '</p>' +
      ayudaSobrante +
      refPerdida +
      (lineasHtml ? '<ul class="cps-despiece-list">' + lineasHtml + '</ul>' : '') +
      veredicto +
      '</div>'
    );
  }

  function despieceCortesCardsHtml(edit) {
    var cortes = edit.cortesDespiece || [];
    var cards = cortes
      .map(function (c, idx) {
        var grPorVal = c.grPorPorcion !== '' && c.grPorPorcion != null && num(c.grPorPorcion) > 0 ? num(c.grPorPorcion) : '';
        var undVal =
          c.cantPorciones !== '' && c.cantPorciones != null && num(c.cantPorciones) > 0 ? num(c.cantPorciones) : '';
        var grBalanza = num(c.grBalanza) > 0 ? num(c.grBalanza) : num(c.grReal) > 0 ? num(c.grReal) : '';
        return (
          '<div class="cps-corte-card" data-corte-id="' +
          esc(c.id) +
          '" data-corte-idx="' +
          idx +
          '">' +
          '<label class="form-label">¿Cómo se llama este corte?</label>' +
          '<input type="text" class="form-input cps-corte-nom" placeholder="Ej: Filete, Churrasco, Molida" value="' +
          esc(c.nombre || '') +
          '">' +
          '<div class="cps-corte-balanza' +
          (grBalanza ? ' is-done' : '') +
          '">' +
          '<label class="form-label">Pesa todo este corte en la balanza (g) <span class="cps-req">*</span></label>' +
          '<input type="number" class="form-input cps-corte-gr" min="0" step="1" inputmode="numeric" required placeholder="Ej: 987 — lo que marque la balanza" value="' +
          esc(grBalanza) +
          '"></div>' +
          '<div class="cps-corte-card__grid">' +
          '<div><label class="form-label">¿Cuántas salieron?</label>' +
          '<input type="number" class="form-input cps-corte-und" min="0" step="1" inputmode="numeric" placeholder="Ej: 10" value="' +
          esc(undVal) +
          '"></div>' +
          '<div><label class="form-label">¿Cuánto pesa cada una? (g)</label>' +
          '<input type="number" class="form-input cps-corte-gr-porcion" min="0" step="1" inputmode="numeric" placeholder="Ej: 100" value="' +
          esc(grPorVal) +
          '"></div></div>' +
          '<div class="cps-corte-total-box is-empty" data-corte-total>' +
          '<span class="cps-corte-total-box__lbl">Comparación</span>' +
          '<span class="cps-corte-total-box__val" data-corte-total-val>Pesa en balanza y cuenta las porciones</span></div>' +
          '<div class="cps-corte-diff is-muted" data-corte-diff aria-live="polite"></div>' +
          '<div class="cps-corte-porciones is-muted" data-corte-porciones>1) Pesa en balanza · 2) Cuenta porciones × gramos</div>' +
          '<div class="cps-corte-card__foot">' +
          '<button type="button" class="btn btn-outline btn-sm cps-corte-rm" data-corte-rm="' +
          esc(c.id) +
          '">Quitar este corte</button></div></div>'
        );
      })
      .join('');
    return (
      '<div class="cps-despiece-cortes" id="cps-despiece-cortes">' +
      '<div class="cps-despiece-step">' +
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px">' +
      '<span class="cps-despiece-step__badge">Paso 2</span>' +
      '<span class="cps-cortes-save-hint" id="cps-cortes-save-hint" aria-live="polite"></span></div>' +
      '<p class="cps-despiece-step__title">¿Qué sacaste? Pesa y cuenta</p>' +
      '<p class="cps-despiece-step__help">Por cada corte: <strong>1)</strong> pesa en balanza (obligatorio) · <strong>2)</strong> cuenta cuántas salieron y cuánto pesa cada una. Si no cuadra, el sistema avisa.</p>' +
      '<div class="cps-corte-cards" id="cps-cortes-tbody">' +
      cards +
      '</div>' +
      '<div class="cps-cortes-barra" id="cps-cortes-barra" aria-live="polite">Pesa cada corte en balanza y anota las porciones.</div>' +
      '<button type="button" class="btn btn-outline" id="cps-corte-add">+ Agregar otro corte</button></div>' +
      '<input type="hidden" id="cps-output-kg" value="0">' +
      '</div>'
    );
  }

  function refreshDespieceLive(host) {
    if (!host || !state.edit || state.edit.mode !== 'mp' || state.workflow !== 'despiece') return;
    state.edit.cortesDespiece = readCortesFromHost(host, state.edit);
    syncEntradaKgHidden(host);
    var entGr = readEntradaGrFromHost(host);
    var mp = C().get(state.edit.mpId);
    var summary = calcDespieceSummary(0, state.edit.cortesDespiece, mp, { entGr: entGr });
    summary.lineas.forEach(function (l) {
      var row = host.querySelector('[data-corte-id="' + l.id + '"]');
      if (!row) return;
      var resolved = resolveCortePeso({
        cantPorciones: l.porciones,
        grPorPorcion: l.grPorPorcion,
        grBalanza: l.grBalanza,
        grCalc: l.grCalc,
        deltaGr: l.deltaGr,
        deltaOk: l.deltaOk,
        deltaGrave: l.deltaGrave,
      });
      var balWrap = row.querySelector('.cps-corte-balanza');
      if (balWrap) {
        if (num(l.grBalanza) > 0) balWrap.classList.add('is-done');
        else balWrap.classList.remove('is-done');
      }
      var totalBox = row.querySelector('[data-corte-total]');
      var totalVal = row.querySelector('[data-corte-total-val]');
      var diffEl = row.querySelector('[data-corte-diff]');
      if (totalBox && totalVal) {
        if (num(l.grCalc) > 0) {
          totalBox.classList.remove('is-empty');
          totalVal.textContent =
            num(l.porciones).toLocaleString('es-CO') +
            ' × ' +
            num(l.grPorPorcion).toLocaleString('es-CO') +
            ' g = ' +
            fmtPesoGr(l.grCalc);
        } else if (num(l.grPorPorcion) > 0 && !(num(l.porciones) > 0)) {
          totalBox.classList.add('is-empty');
          totalVal.textContent = 'Falta poner cuántas salieron';
        } else if (num(l.porciones) > 0 && !(num(l.grPorPorcion) > 0)) {
          totalBox.classList.add('is-empty');
          totalVal.textContent = 'Falta poner cuánto pesa cada una (g)';
        } else {
          totalBox.classList.add('is-empty');
          totalVal.textContent = 'Cuenta porciones y gramos';
        }
      }
      if (diffEl) {
        diffEl.classList.remove('is-ok', 'is-warn', 'is-bad', 'is-muted');
        var diffHtml = fmtCorteDiffHtml(resolved);
        if (!num(l.grBalanza)) {
          diffEl.classList.add('is-warn');
          diffEl.innerHTML = num(l.grCalc) > 0 ? diffHtml || 'Falta pesar en balanza' : 'Primero pesa este corte en la balanza';
        } else if (num(l.grCalc) > 0 && l.deltaGr != null) {
          if (l.deltaGrave) {
            diffEl.classList.add('is-bad');
            diffEl.innerHTML = diffHtml + ' — <strong>corrige antes de guardar</strong>';
          } else if (!l.deltaOk && l.deltaGr !== 0) {
            diffEl.classList.add('is-warn');
            diffEl.innerHTML = diffHtml + ' — revisa conteo o vuelve a pesar';
          } else {
            diffEl.classList.add('is-ok');
            diffEl.innerHTML = diffHtml;
          }
        } else if (num(l.grBalanza) > 0) {
          diffEl.classList.add('is-warn');
          diffEl.innerHTML = 'Balanza: <strong>' + fmtPesoGr(l.grBalanza) + '</strong> — falta contar porciones';
        } else {
          diffEl.classList.add('is-muted');
          diffEl.textContent = '';
        }
      }
      var el = row.querySelector('[data-corte-porciones]');
      if (!el) return;
      el.classList.remove('is-ready', 'is-muted');
      if (num(l.grBalanza) > 0 && l.porciones != null && l.porciones > 0 && num(l.grPorPorcion) > 0) {
        if (l.deltaGrave) {
          el.classList.add('is-muted');
          el.textContent = '⚠ Balanza y porciones no cuadran — corrige';
        } else if (l.deltaOk || l.deltaGr === 0) {
          el.classList.add('is-ready');
          el.textContent = '✓ Balanza y porciones cuadran';
        } else {
          el.classList.add('is-muted');
          el.textContent = '⚠ Diferencia de ' + Math.abs(Math.round(l.deltaGr)) + ' g — revisa';
        }
      } else if (!num(l.grBalanza)) {
        el.classList.add('is-muted');
        el.textContent = 'Primero pesa este corte en la balanza (g)';
      } else if (num(l.grPorPorcion) > 0 && !(num(l.porciones) > 0)) {
        el.classList.add('is-muted');
        el.textContent = 'Falta poner cuántas porciones salieron';
      } else if (num(l.porciones) > 0 && !(num(l.grPorPorcion) > 0)) {
        el.classList.add('is-muted');
        el.textContent = 'Falta poner cuánto pesa cada porción (g)';
      } else {
        el.classList.add('is-muted');
        el.textContent = '1) Pesa en balanza · 2) Cuenta porciones × gramos';
      }
    });
    var barra = host.querySelector('#cps-cortes-barra');
    if (barra) {
      barra.classList.remove('is-ok');
      if (entGr <= 0) {
        barra.textContent = 'Primero pesa toda la pieza en el paso 1.';
      } else if (summary.sumGr <= 0) {
        barra.textContent = 'Llevas 0 g — pesa cada corte en la balanza (obligatorio).';
      } else {
        var falta = Math.max(0, entGr - summary.sumGr);
        var tol = mermaToleranciaGr(entGr);
        if (falta <= tol) {
          barra.classList.add('is-ok');
          barra.innerHTML =
            'Llevas <strong>' +
            fmtPesoGr(summary.sumGr) +
            '</strong> en cortes de <strong>' +
            fmtPesoGr(entGr) +
            '</strong> que entraron — cuadra bien.';
        } else {
          barra.innerHTML =
            'Llevas <strong>' +
            fmtPesoGr(summary.sumGr) +
            '</strong> en cortes de <strong>' +
            fmtPesoGr(entGr) +
            '</strong> — faltan <strong>' +
            fmtPesoGr(falta) +
            '</strong> por anotar (hueso, grasa, otro corte…).';
        }
      }
    }
    var out = host.querySelector('#cps-output-kg');
    if (out) out.value = String(summary.sumKg);
    var resumen = host.querySelector('#cps-despiece-resumen');
    if (resumen) resumen.outerHTML = despieceResumenHtml(summary, mp);
    refreshMermaLive(host);
  }

  function rerenderDespieceCortes(host) {
    if (!host || !state.edit || state.edit.mode !== 'mp') return;
    var wrap = host.querySelector('#cps-despiece-cortes');
    if (!wrap) return;
    wrap.outerHTML = despieceCortesCardsHtml(state.edit);
    bindDespieceCortes(host);
    refreshDespieceLive(host);
  }

  function bindDespieceCortes(host) {
    if (!host || state.workflow !== 'despiece') return;
    var mpId = state.edit && state.edit.mpId;
    var add = host.querySelector('#cps-corte-add');
    if (add && !add._cpsBound) {
      add._cpsBound = true;
      add.addEventListener('click', function () {
        if (!state.edit) return;
        state.edit.cortesDespiece = readCortesFromHost(host, state.edit);
        state.edit.cortesDespiece.push({
          id: despieceCorteId(),
          nombre: '',
          pctRef: '',
          grPorPorcion: '',
          cantPorciones: '',
          kgReal: 0,
        });
        rerenderDespieceCortes(host);
        persistCortesDespiece(host, mpId, state.edit.cortesDespiece);
      });
    }
    host.querySelectorAll('.cps-corte-rm').forEach(function (btn) {
      if (btn._cpsBound) return;
      btn._cpsBound = true;
      btn.addEventListener('click', function () {
        if (!state.edit) return;
        var id = btn.getAttribute('data-corte-rm');
        state.edit.cortesDespiece = readCortesFromHost(host, state.edit).filter(function (c) {
          return c.id !== id;
        });
        if (!state.edit.cortesDespiece.length) {
          state.edit.cortesDespiece.push({
            id: despieceCorteId(),
            nombre: '',
            pctRef: '',
            grPorPorcion: '',
            cantPorciones: '',
            kgReal: 0,
          });
        }
        rerenderDespieceCortes(host);
        persistCortesDespiece(host, mpId, state.edit.cortesDespiece, { toastDelete: true });
      });
    });
    host.querySelectorAll('.cps-corte-nom, .cps-corte-gr, .cps-corte-gr-porcion, .cps-corte-und').forEach(function (inp) {
      if (inp._cpsBound) return;
      inp._cpsBound = true;
      inp.addEventListener('input', function () {
        refreshDespieceLive(host);
        refreshTotals(host);
        if (!state.edit) return;
        state.edit.cortesDespiece = readCortesFromHost(host, state.edit);
        schedulePersistCortes(host, mpId, state.edit.cortesDespiece);
      });
      inp.addEventListener('blur', function () {
        if (!state.edit) return;
        state.edit.cortesDespiece = readCortesFromHost(host, state.edit);
        if (
          inp.classList.contains('cps-corte-nom') ||
          inp.classList.contains('cps-corte-gr-porcion') ||
          inp.classList.contains('cps-corte-und')
        ) {
          persistCortesDespiece(host, mpId, state.edit.cortesDespiece);
        }
      });
    });
  }

  function mermaEspHintHtml(mp) {
    if (!mp) return '';
    var parts = [];
    if (mp.mermaCoccionPct > 0) parts.push('cocinado ~' + num(mp.mermaCoccionPct).toFixed(1) + '%');
    if (mp.mermaDespostePct > 0) parts.push('desposte ~' + num(mp.mermaDespostePct).toFixed(1) + '%');
    if (!parts.length) return '<p class="cps-merma__esp">Pesa entrada → cocido → listo. La diferencia se calcula sola.</p>';
    return '<p class="cps-merma__esp">Esperado en catálogo: ' + esc(parts.join(' · ')) + '</p>';
  }

  function mermaLiveHtml(mermas, mp) {
    mermas = mermas || {};
    var cat = C();
    var alerta = cat && cat.evalMermaProcesoAlerta && mp ? cat.evalMermaProcesoAlerta(mp, mermas) : { ok: true };
    if (state.workflow === 'despiece') {
      var md =
        mermas.mermaDespostePct != null
          ? 'Merma ' + num(mermas.mermaDespostePct).toFixed(1) + '% (' + num(mermas.mermaDesposteKg).toFixed(2) + ' kg)'
          : 'Merma —';
      var espD = cat && cat.perdidaEsperadaPct ? num(cat.perdidaEsperadaPct(mp, 'despiece')) : 0;
      var esp = espD > 0 ? 'Esperado ~' + espD.toFixed(1) + '%' : 'Sin referencia';
      return (
        '<div class="cps-merma-live" id="cps-merma-live">' +
        '<span' +
        (alerta.ok ? '' : ' class="is-warn"') +
        '>' +
        esc(md) +
        '</span><span>' +
        esc(esp) +
        '</span></div>'
      );
    }
    var mc =
      mermas.mermaCoccionPct != null
        ? 'Cocinado ' + num(mermas.mermaCoccionPct).toFixed(1) + '% (' + num(mermas.mermaCoccionKg).toFixed(2) + ' kg)'
        : 'Cocinado —';
    var md =
      mermas.mermaDespostePct != null
        ? 'Desposte ' + num(mermas.mermaDespostePct).toFixed(1) + '% (' + num(mermas.mermaDesposteKg).toFixed(2) + ' kg)'
        : 'Desposte —';
    var tot =
      mermas.mermaTotalKg > 0
        ? 'Total merma ' + num(mermas.mermaTotalKg).toFixed(2) + ' kg'
        : 'Total merma —';
    return (
      '<div class="cps-merma-live" id="cps-merma-live">' +
      '<span' +
      (alerta.ok ? '' : ' class="is-warn"') +
      '>' +
      esc(mc) +
      '</span><span>' +
      esc(md) +
      '</span><span>' +
      esc(tot) +
      '</span></div>'
    );
  }

  function mermaBlockHtml(mp, wf) {
    wf = wf || state.workflow || '';
    if (wf === 'despiece') return '';
    var showCoc = wf === 'coccion' || wf === 'elaboracion';
    if (!showCoc) return '';
    if (!canVerMermaReferencias()) {
      if (wf === 'coccion') {
        return (
          '<div class="form-group" style="margin-top:8px"><label class="form-label">Peso después de cocinar (kg)</label>' +
          '<input type="number" class="form-input" id="cps-peso-cocido" min="0" step="0.01" placeholder="Pesa cuando salga de la cocina"></div>'
        );
      }
      return '';
    }
    return (
      '<div class="cps-merma" id="cps-merma-block">' +
      '<p class="cps-merma__title">¿Cuánto se perdió?</p>' +
      mermaEspHintHtml(mp) +
      (showCoc
        ? '<div class="form-group" style="margin-top:8px"><label class="form-label">Peso después de cocinar (kg)</label>' +
          '<input type="number" class="form-input" id="cps-peso-cocido" min="0" step="0.01" placeholder="Si hubo cocción"></div>'
        : '') +
      mermaLiveHtml({}, mp) +
      '</div>'
    );
  }

  function refreshMermaLive(host) {
    if (!host) return;
    var block = host.querySelector('#cps-merma-block');
    if (!block) return;
    var ent = num((host.querySelector('#cps-mp-entrada') || {}).value, 0);
    if (ent <= 0) ent = num((host.querySelector('#cps-peso-bruto') || {}).value, 0);
    var coc = num((host.querySelector('#cps-peso-cocido') || {}).value, 0);
    var util = num((host.querySelector('#cps-output-kg') || {}).value, 0);
    var mp = null;
    if (state.edit && state.edit.mpId) mp = C().get(state.edit.mpId);
    else if (state.edit && state.edit.slug) {
      var menu = C().getMenuPlato(state.edit.slug);
      if (menu && menu.costeoMpSourceId) mp = C().get(menu.costeoMpSourceId);
    }
    var mermas = calcMermasLive(ent, coc, util);
    var live = block.querySelector('#cps-merma-live');
    if (live) live.outerHTML = mermaLiveHtml(mermas, mp);
  }

  function attachMermaPayload(item, host, mp) {
    var ent = num(item.pesoEntradaKg || item.kg, 0);
    if (ent <= 0) ent = num((host.querySelector('#cps-peso-bruto') || {}).value, 0);
    var coc = num((host.querySelector('#cps-peso-cocido') || {}).value, 0);
    var util = num((host.querySelector('#cps-output-kg') || {}).value, 0);
    if (util <= 0) util = num(item.kg, 0);
    var m = calcMermasLive(ent, coc, util);
    item.pesoEntradaKg = ent > 0 ? ent : item.pesoEntradaKg;
    item.pesoCocidoKg = coc > 0 ? coc : null;
    item.pesoUtilKg = util > 0 ? util : null;
    item.mermaCoccionRealPct = m.mermaCoccionPct;
    item.mermaDesposteRealPct = m.mermaDespostePct;
    item.mermaCoccionKg = m.mermaCoccionKg;
    item.mermaDesposteKg = m.mermaDesposteKg;
    item.mermaTotalKg = m.mermaTotalKg;
    var cat = C();
    if (cat && cat.evalMermaProcesoAlerta && mp && canVerMermaReferencias()) {
      var ev = cat.evalMermaProcesoAlerta(mp, m);
      if (!ev.ok) item.mermaAlerta = ev.mensaje;
    }
    return item;
  }

  function modoSelectorHtml(modo) {
    modo = modo || 'prep_anticipado';
    return (
      '<div class="cps-modo-grid" id="cps-modo-grid">' +
      '<label class="cps-modo-opt' +
      (modo === 'prep_anticipado' ? ' is-active' : '') +
      '">' +
      '<input type="radio" name="cps-modo" value="prep_anticipado"' +
      (modo === 'prep_anticipado' ? ' checked' : '') +
      '>' +
      '<span class="cps-modo-opt__title">Preparación anticipada</span>' +
      '<span class="cps-modo-opt__desc">Salsas, bases — queda en bodega ELABORADOS</span></label>' +
      '<label class="cps-modo-opt' +
      (modo === 'bajo_demanda' ? ' is-active' : '') +
      '">' +
      '<input type="radio" name="cps-modo" value="bajo_demanda"' +
      (modo === 'bajo_demanda' ? ' checked' : '') +
      '>' +
      '<span class="cps-modo-opt__title">Al momento</span>' +
      '<span class="cps-modo-opt__desc">Jugos, spaguetis al pedir — consume y sale</span></label></div>' +
      '<p class="cps-hint" id="cps-modo-hint">' +
      esc(modoProcesoHint(modo)) +
      '</p>'
    );
  }

  function lineaEsElaborado(ln, slugPlato) {
    var cat = C();
    if (!cat || !ln) return false;
    if (ln.mpId) {
      var mp = cat.get(ln.mpId);
      if (mp && (mp.esElaborado || String(mp.categoria || '').toUpperCase() === 'ELABORADOS')) return true;
    }
    if (ln.ingrediente && cat.slugPlato && cat.getMenuPlato) {
      var s = cat.slugPlato(ln.ingrediente);
      if (s && s !== slugPlato && cat.getMenuPlato(s)) return true;
    }
    return false;
  }

  function newEditReceta(slug) {
    var cat = C();
    return {
      mode: 'receta',
      slug: slug,
      mpId: '',
      factor: 1,
      tipoReceta: 'base',
      vendeAlCliente: false,
      modoProceso: 'prep_anticipado',
      baseLineas: loadBaseLineas(slug),
      locked: {},
      overrides: {},
      scaleRatio: 1,
      opts: (function () {
        var rec = C() && C().getRecetaPlato(slug);
        return (rec && rec.opts) || {};
      })(),
    };
  }

  function newEditMp(mpId) {
    return {
      mode: 'mp',
      slug: '',
      mpId: mpId,
      factor: 1,
      modoProceso: 'prep_anticipado',
      baseLineas: [],
      locked: {},
      overrides: {},
      scaleRatio: 1,
      opts: {},
      cortesDespiece: state.workflow === 'despiece' ? loadCortesTemplate(mpId) : [],
    };
  }

  function computeDisplayLineas(edit) {
    if (!edit || edit.mode !== 'receta') return [];
    var factor = num(edit.factor, 1) || 1;
    var ratio = num(edit.scaleRatio, 1) || 1;
    return (edit.baseLineas || []).map(function (ln, i) {
      if (edit.locked[i] && edit.overrides[i] != null) {
        return Object.assign({}, ln, { cantidad: num(edit.overrides[i]), locked: true, idx: i });
      }
      return Object.assign({}, ln, {
        cantidad: num(ln.cantidadBase) * factor * ratio,
        locked: false,
        idx: i,
      });
    });
  }

  function calcCostoFromLineas(lineas, opts) {
    var eng = E();
    if (!eng || !lineas.length) return 0;
    var calc = eng.calcularReceta(
      lineas.map(function (ln) {
        return {
          ingrediente: ln.ingrediente,
          unidad: ln.unidad,
          cantidad: ln.cantidad,
          costoXUnidad: ln.costoXUnidad,
        };
      }),
      opts || {}
    );
    return calc ? num(calc.totalMp) : 0;
  }

  function costoMpPorKg(mp) {
    if (!mp) return 0;
    var peso = num(mp.peso, 1);
    if (peso <= 0) peso = 1;
    if (mp.precioTotal != null && num(mp.precioTotal) > 0) return num(mp.precioTotal) / peso;
    var und = String(mp.und || '').toUpperCase();
    if (und === 'GR' || und === 'ML') return num(mp.precioUnit) * 1000;
    return num(mp.precioUnit) || 0;
  }

  function costoEntradaKg(mp, entradaKg) {
    return Math.round(costoMpPorKg(mp) * num(entradaKg));
  }

  function isProcesoPrepRow(row) {
    var cat = C();
    if (!cat || !row) return false;
    if (cat.requiresSesionProceso) return cat.requiresSesionProceso(row);
    if (cat.inferModoProcesoFromMenu) return cat.inferModoProcesoFromMenu(row) === 'prep_anticipado';
    return row.tipoCosteo !== 'directo';
  }

  function listCatalogo() {
    var cat = C();
    if (!cat || !cat.buildSeedForCostos) return { recetas: [], directos: [], sinReceta: [], mpDespiece: [] };
    var seed = cat.buildSeedForCostos();
    var recetas = [];
    var directos = [];
    var sinReceta = [];
    (seed.resumen || []).forEach(function (row) {
      if (!row || !row.slug) return;
      if (!isProcesoPrepRow(row)) return;
      var rec = cat.getRecetaPlato(row.slug);
      var hasLineas = !!(rec && rec.lineas && rec.lineas.length);
      var item = { row: row, rec: rec, hasLineas: hasLineas };
      if (row.tipoCosteo === 'directo') directos.push(item);
      else if (hasLineas) recetas.push(item);
      else sinReceta.push(item);
    });
    recetas.sort(function (a, b) {
      return String(a.row.producto).localeCompare(String(b.row.producto), 'es');
    });
    var mpDespiece = [];
    if (cat.list) {
      cat.list().forEach(function (mp) {
        if (!mp || !mp.nombre) return;
        if (cat.mpAptoDespiece ? cat.mpAptoDespiece(mp) : false) mpDespiece.push(mp);
      });
    }
    mpDespiece.sort(function (a, b) {
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
    return { recetas: recetas, directos: directos, sinReceta: sinReceta, mpDespiece: mpDespiece };
  }

  function mpOptionsHtml(mps, emptyLabel) {
    if (!mps.length) {
      return '<option value="" disabled>' + esc(emptyLabel || 'Sin opciones en catálogo') + '</option>';
    }
    return mps
      .map(function (mp) {
        return (
          '<option value="mp:' +
          esc(mp.id) +
          '">' +
          esc(mp.nombre) +
          (mp.categoria ? ' · ' + esc(mp.categoria) : '') +
          '</option>'
        );
      })
      .join('');
  }

  function filterRecetasForWorkflow(recetas, workflow) {
    var cat = C();
    if (!workflow || !cat || !cat.menuRowMatchesPrepWorkflow) return recetas;
    return recetas.filter(function (it) {
      return cat.menuRowMatchesPrepWorkflow(it.row, workflow);
    });
  }

  function recetaOptionsHtml(recetas, sinReceta) {
    var html = '';
    if (recetas.length) {
      html +=
        recetas
          .map(function (it) {
            var n = (it.rec && it.rec.lineas && it.rec.lineas.length) || 0;
            return (
              '<option value="rec:' +
              esc(it.row.slug) +
              '">' +
              esc(it.row.producto) +
              ' · ' +
              n +
              ' ingr.</option>'
            );
          })
          .join('');
    }
    if (sinReceta.length) {
      html += sinReceta
        .map(function (it) {
          return (
            '<option value="rec:' +
            esc(it.row.slug) +
            '" disabled>' +
            esc(it.row.producto) +
            ' — sin ingredientes</option>'
          );
        })
        .join('');
    }
    return html;
  }

  function productOptionsHtml(workflow) {
    var data = listCatalogo();
    var meta = wfMeta(workflow);
    var html = '<option value="">— ' + esc(meta.pickLabel) + ' —</option>';

    if (workflow === 'despiece') {
      html +=
        '<optgroup label="Carnes y piezas">' +
        mpOptionsHtml(data.mpDespiece, 'Agrega carnes en catálogo MP') +
        '</optgroup>';
      return html;
    }

    if (workflow === 'coccion') {
      var mpCoc = listMpCoccion();
      if (mpCoc.length) {
        html +=
          '<optgroup label="Materia prima a cocinar">' +
          mpOptionsHtml(mpCoc, 'Agrega materias primas en catálogo') +
          '</optgroup>';
      }
      var recCoc = filterRecetasForWorkflow(data.recetas, 'coccion');
      var sinCoc = filterRecetasForWorkflow(data.sinReceta, 'coccion');
      if (recCoc.length || sinCoc.length) {
        html +=
          '<optgroup label="Preparaciones cocidas (con receta)">' +
          recetaOptionsHtml(recCoc, sinCoc) +
          '</optgroup>';
      }
      if (!mpCoc.length && !recCoc.length && !sinCoc.length) {
        html +=
          '<option value="" disabled>Agrega MP en catálogo o recetas en «Cocinar y porcionar» (Costos)</option>';
      }
      return html;
    }

    if (workflow === 'elaboracion') {
      var recElab = filterRecetasForWorkflow(data.recetas, 'elaboracion');
      var sinElab = filterRecetasForWorkflow(data.sinReceta, 'elaboracion');
      if (recElab.length || sinElab.length) {
        html +=
          '<optgroup label="Salsas y bases (con receta)">' +
          recetaOptionsHtml(recElab, sinElab) +
          '</optgroup>';
      } else {
        html +=
          '<option value="" disabled>Define recetas en Costos → «Salsas y bases»</option>';
      }
      return html;
    }

    if (data.mpDespiece.length) {
      html +=
        '<optgroup label="Carnes y piezas">' +
        mpOptionsHtml(data.mpDespiece, '') +
        '</optgroup>';
    }
    var mpCocAll = listMpCoccion();
    if (mpCocAll.length) {
      html +=
        '<optgroup label="Cocinar y porcionar">' +
        mpOptionsHtml(mpCocAll, '') +
        '</optgroup>';
    }
    if (data.recetas.length || data.sinReceta.length) {
      html +=
        '<optgroup label="Salsas y bases">' +
        recetaOptionsHtml(data.recetas, data.sinReceta) +
        '</optgroup>';
    }
    return html;
  }

  function staffAddOptionsHtml() {
    var ids = {};
    (state.responsables || []).forEach(function (r) {
      ids[String(r.id)] = true;
    });
    return (
      '<option value="">— Sumar compañero —</option>' +
      listStaffActivos()
        .filter(function (u) {
          return !ids[String(u.id)];
        })
        .map(function (u) {
          return (
            '<option value="' +
            esc(u.id) +
            '">' +
            esc(u.nombre || u.id) +
            (u.rol ? ' · ' + esc(u.rol) : '') +
            '</option>'
          );
        })
        .join('')
    );
  }

  function responsablesCardHtml() {
    var chips = (state.responsables || [])
      .map(function (r) {
        return (
          '<span class="cps-resp-chip' +
          (r.principal ? ' is-primary' : '') +
          '" data-resp-id="' +
          esc(r.id) +
          '">' +
          esc(responsableLabel(r)) +
          (r.principal ? ' <span class="cps-tag">Responsable</span>' : '') +
          (!r.principal
            ? ' <button type="button" class="cps-resp-rm" data-resp-rm="' +
              esc(r.id) +
              '" title="Quitar">×</button>'
            : '') +
          '</span>'
        );
      })
      .join('');
    return (
      '<div class="card" id="cps-resp-card">' +
      '<h3 class="card-title">Equipo en cocina</h3>' +
      '<div class="cps-resp-chips" id="cps-resp-chips">' +
      (chips || '<span class="cps-hint">Sin usuario en sesión</span>') +
      '</div>' +
      '<div class="form-group" style="margin:0">' +
      '<label class="form-label">¿Quién más ayudó?</label>' +
      '<select class="form-input form-select" id="cps-resp-add">' +
      staffAddOptionsHtml() +
      '</select></div></div>'
    );
  }

  function batchCardHtml() {
    if (!state.batch.length) return '';
    var items = state.batch
      .map(function (it, i) {
        return (
          '<li class="cps-batch-item" data-batch-idx="' +
          i +
          '">' +
          '<span><strong>' +
          esc(it.producto) +
          '</strong>' +
          (it.porciones != null ? ' · ' + esc(it.porciones) + ' porc.' : '') +
          ' · ' +
          esc(modoProcesoLabel(it.modoProceso)) +
          (canVerValoresProcesos() ? ' · ' + fmtMoney(it.costoMpTotal) : '') +
          '</span>' +
          '<button type="button" class="btn btn-outline btn-sm cps-batch-rm" data-batch-rm="' +
          i +
          '">Quitar</button></li>'
        );
      })
      .join('');
    var sum = state.batch.reduce(function (s, it) {
      return s + num(it.costoMpTotal);
    }, 0);
    return (
      '<div class="card" id="cps-batch-card">' +
      '<h3 class="card-title">En esta anotación <span class="cps-tag">' +
      state.batch.length +
      '</span></h3>' +
      '<ul class="cps-batch-list">' +
      items +
      '</ul>' +
      costoTotalBlockHtml('Total insumos usados', sum, 'cps-costo-total') +
      '</div>'
    );
  }

  function porcionesBtnsHtml(factor) {
    var presets = [0.5, 1, 1.5, 2, 3, 5];
    return presets
      .map(function (p) {
        var active = Math.abs(num(factor) - p) < 0.001 ? ' is-active' : '';
        return (
          '<button type="button" class="btn btn-outline btn-sm cps-porc-pick' +
          active +
          '" data-porc="' +
          p +
          '">' +
          (p === 0.5 ? '½' : String(p)) +
          '</button>'
        );
      })
      .join('');
  }

  function lineasTableHtml(edit) {
    var lineas = computeDisplayLineas(edit);
    if (!lineas.length) {
      return '<p class="cps-empty">Este plato no tiene ingredientes en Costos. Créela allí primero.</p>';
    }
    var slugPlato = edit && edit.slug ? edit.slug : '';
    var verVal = canVerValoresProcesos();
    var rows = lineas
      .map(function (ln) {
        var i = ln.idx;
        var total = num(ln.costoXUnidad) * num(ln.cantidad);
        var esElab = lineaEsElaborado(ln, slugPlato);
        return (
          '<tr data-cps-line="' +
          i +
          '"' +
          (ln.locked ? ' class="cps-line-locked"' : '') +
          '>' +
          '<td>' +
          esc(ln.ingrediente) +
          (esElab ? ' <span class="cps-tag cps-tag--ok">Elaborado</span>' : '') +
          (ln.locked ? ' <span class="cps-tag cps-tag--lock">Fijo</span>' : '') +
          '</td>' +
          '<td><input type="number" class="form-input cps-line-qty" data-idx="' +
          i +
          '" min="0" step="0.01" value="' +
          esc(Number(num(ln.cantidad).toFixed(4))) +
          '"> ' +
          esc(ln.unidad || '') +
          (ln.locked
            ? ' <button type="button" class="btn btn-outline btn-sm cps-line-unlock" data-unlock="' +
              i +
              '" title="Volver a calcular auto">↺</button>'
            : '') +
          '</td>' +
          (verVal
            ? '<td class="num">' +
              fmtMoney(ln.costoXUnidad) +
              '</td><td class="num cps-line-total" data-idx="' +
              i +
              '">' +
              fmtMoney(total) +
              '</td>'
            : '') +
          '</tr>'
        );
      })
      .join('');
    return (
      '<table class="table"><thead><tr><th>Ingrediente</th><th>Cantidad usada</th>' +
      (verVal ? '<th class="num">Costo unit.</th><th class="num">Subtotal</th>' : '') +
      '</tr></thead><tbody>' +
      rows +
      '</tbody></table>'
    );
  }

  function recetaPanelHtml(edit) {
    var cat = C();
    var slug = edit.slug;
    var rec = cat && slug ? cat.getRecetaPlato(slug) : null;
    var menu = cat && slug ? cat.getMenuPlato(slug) : null;
    var lineas = computeDisplayLineas(edit);
    var costo = calcCostoFromLineas(lineas, edit.opts);
    var porBase = (rec && rec.opts && rec.opts.porciones) || 1;
    return (
      '<div class="card" id="cps-receta-panel">' +
      '<h3 class="card-title">Ingredientes · ' +
      esc((menu && menu.producto) || (rec && rec.producto) || slug) +
      '<span class="cps-tag cps-tag--ok">Receta</span></h3>' +
      prepOnlyBannerHtml() +
      '<div class="form-grid">' +
      '<div class="form-group"><label class="form-label">¿Cuántas porciones salieron?</label>' +
      '<input type="number" class="form-input" id="cps-factor" min="0.01" step="0.01" value="' +
      esc(num(edit.factor, 1)) +
      '">' +
      '<div class="cps-porc-btns" id="cps-porc-btns">' +
      porcionesBtnsHtml(edit.factor) +
      '</div></div>' +
      '<div class="form-group"><label class="form-label">Receta base (porciones)</label>' +
      '<input type="number" class="form-input" readonly value="' +
      esc(porBase) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">¿Cuánto pesó al final? (kg / und)</label>' +
      '<input type="number" class="form-input" id="cps-output-kg" min="0" step="0.01" placeholder="Peso listo para guardar"></div>' +
      '<div class="form-group"><label class="form-label">Peso antes de cocinar (kg)</label>' +
      '<input type="number" class="form-input" id="cps-peso-bruto" min="0" step="0.01" placeholder="Opcional"></div>' +
      '<div class="form-group"><label class="form-label">Notas (turno, lote…)</label>' +
      '<input type="text" class="form-input" id="cps-notas" placeholder="Turno, lote…"></div>' +
      '</div>' +
      '<p class="cps-hint">Si cambias porciones o un ingrediente, el resto se ajusta solo. Lo que ya tenías preparado (ej. salsa hecha) se descuenta del stock.</p>' +
      mermaBlockHtml(
        (function () {
          var m = menu;
          return m && m.costeoMpSourceId ? cat.get(m.costeoMpSourceId) : null;
        })(),
        state.workflow
      ) +
      '<div id="cps-lineas-wrap">' +
      lineasTableHtml(edit) +
      '</div>' +
      costoTotalBlockHtml('Valor materia prima', costo, 'cps-costo-total') +
      '</div>'
    );
  }

  function mpPanelHtml(edit) {
    var cat = C();
    var mp = cat && edit.mpId ? cat.get(edit.mpId) : null;
    if (!mp) return '<p class="cps-empty">Elige una carne de la lista.</p>';
    var unit = costoMpPorKg(mp);
    var isDespiece = state.workflow === 'despiece';
    var entradaVal = num(mp.peso) || '';
    if (isDespiece) {
      var entGr = num(entradaVal) > 0 ? Math.round(num(entradaVal) * 1000) : '';
      return (
        '<div class="card" id="cps-mp-panel">' +
        '<h3 class="card-title">' +
        esc(mp.nombre) +
        '</h3>' +
        '<div class="cps-despiece-step">' +
        '<span class="cps-despiece-step__badge">Paso 1</span>' +
        '<p class="cps-despiece-step__title">Pesa toda la pieza junta</p>' +
        '<p class="cps-despiece-step__help">Usa gramos (g) como en la balanza. Ej: 10 kg = <strong>10000</strong> g.</p>' +
        (function () {
          if (!canVerMermaReferencias()) return '';
          var cat = C();
          var esp = cat && cat.perdidaEsperadaPct ? cat.perdidaEsperadaPct(mp, 'despiece') : 0;
          return esp > 0 ? '<p class="cps-hint">Referencia al partir: ~' + num(esp).toFixed(0) + '%</p>' : '';
        })() +
        '<label class="form-label">Peso total (g)</label>' +
        '<input type="number" class="form-input" id="cps-mp-entrada-gr" min="0" step="1" inputmode="numeric" placeholder="Ej: 10000" value="' +
        esc(entGr) +
        '">' +
        '<input type="hidden" id="cps-mp-entrada" value="' +
        esc(entGr ? num(entGr) / 1000 : '') +
        '"></div>' +
        despieceCortesCardsHtml(edit) +
        despieceResumenHtml(
          calcDespieceSummary(0, edit.cortesDespiece || [], mp, { entGr: num(entGr) || 0 }),
          mp
        ) +
        '<div class="form-group" style="margin-top:12px">' +
        '<label class="form-label">Notas (opcional)</label>' +
        '<input type="text" class="form-input" id="cps-notas" placeholder="Ej: turno mañana"></div>' +
        costoTotalBlockEmptyHtml('Insumo usado', 'cps-costo-total') +
        '</div>'
      );
    }
    return (
      '<div class="card" id="cps-mp-panel">' +
      '<h3 class="card-title">Pieza entera · ' +
      esc(mp.nombre) +
      '<span class="cps-tag">Despiece</span></h3>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label class="form-label">¿Cuánto pesó la pieza? (kg)</label><input type="number" class="form-input" id="cps-mp-entrada" min="0" step="0.01" value="' +
      esc(entradaVal) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">¿Cuánto salió en cortes? (kg)</label><input type="number" class="form-input" id="cps-output-kg" min="0" step="0.01"></div>' +
      (canVerValoresProcesos()
        ? '<div class="form-group"><label class="form-label">Costo por kg (referencia)</label><input type="text" class="form-input" readonly value="' +
          esc(fmtMoney(unit)) +
          '"></div>'
        : '') +
      '<div class="form-group"><label class="form-label">Notas</label><input type="text" class="form-input" id="cps-notas"></div>' +
      '</div>' +
      mermaBlockHtml(mp, state.workflow) +
      costoTotalBlockEmptyHtml('Valor insumos usados', 'cps-costo-total') +
      '</div>'
    );
  }

  function canAdminProcesos() {
    if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    if (typeof global.getCurrentUser !== 'function') return false;
    var u = global.getCurrentUser();
    if (!u) return false;
    var r =
      typeof global.crozzoNormalizeAppRol === 'function'
        ? global.crozzoNormalizeAppRol(u.rol)
        : String(u.rol || '').toLowerCase();
    return r === 'admin' || r === 'superadmin' || r === 'super_admin';
  }

  /** Valores $ — jefe compras, admin, gerente; no cocina operativa. */
  function canVerValoresProcesos() {
    if (canAdminProcesos()) return true;
    if (typeof global.getCurrentUser !== 'function') return false;
    var u = global.getCurrentUser();
    if (!u) return false;
    var r =
      typeof global.crozzoNormalizeAppRol === 'function'
        ? global.crozzoNormalizeAppRol(u.rol)
        : String(u.rol || '').toLowerCase();
    if (r === 'gerente' || r === 'jefe_compras' || r === 'jefe-compras') return true;
    var inv = (u.permisos && u.permisos.inventario) || [];
    if (
      inv.indexOf('proveedores') >= 0 ||
      inv.indexOf('reportes') >= 0 ||
      inv.indexOf('recepcion') >= 0 ||
      inv.indexOf('ordenes') >= 0
    ) {
      return true;
    }
    var adm = (u.permisos && u.permisos.admin) || [];
    if (adm.length) return true;
    return false;
  }

  /** % merma / pérdidas de referencia — no cocina operativa. */
  function canVerMermaReferencias() {
    return canVerValoresProcesos();
  }

  function costoTotalBlockHtml(label, amount, id) {
    if (!canVerValoresProcesos()) return '';
    return (
      '<div class="cps-total"><span class="cps-total__lbl">' +
      esc(label) +
      '</span><span class="cps-total__val"' +
      (id ? ' id="' + esc(id) + '"' : '') +
      '>' +
      fmtMoney(amount) +
      '</span></div>'
    );
  }

  function costoTotalBlockEmptyHtml(label, id) {
    if (!canVerValoresProcesos()) return '';
    return (
      '<div class="cps-total"><span class="cps-total__lbl">' +
      esc(label) +
      '</span><span class="cps-total__val"' +
      (id ? ' id="' + esc(id) + '"' : '') +
      '>—</span></div>'
    );
  }

  function historialRowsHtml(limit) {
    var res = R();
    if (!res) return '';
    limit = limit || 20;
    var admin = canAdminProcesos();
    var verVal = canVerValoresProcesos();
    return res
      .load()
      .cortes.filter(function (c) {
        return (c.modoProceso || 'prep_anticipado') !== 'bajo_demanda';
      })
      .slice(0, limit)
      .map(function (c) {
        var costo =
          verVal && c.costoMpTotal != null && c.costoMpTotal > 0 ? fmtMoney(c.costoMpTotal) : verVal ? '—' : '';
        var resp = c.responsableNombre || (c.responsables && c.responsables[0] && c.responsables[0].nombre) || '—';
        var mermaTxt = '—';
        if (Array.isArray(c.cortesDespiece) && c.cortesDespiece.length) {
          mermaTxt = c.cortesDespiece
            .map(function (cr) {
              var gr = cr.grReal != null ? num(cr.grReal) : num(cr.kgReal) * 1000;
              var base = (cr.nombre || '?') + ' ' + (gr > 0 ? gr.toFixed(0) + ' g' : num(cr.kgReal).toFixed(1) + ' kg');
              if (cr.porciones > 0) base += ' · ' + cr.porciones + ' porc.';
              return base;
            })
            .join(' · ');
          if (c.mermaDesposteKg > 0) {
            var mGr = Math.round(num(c.mermaDesposteKg) * 1000);
            mermaTxt += mGr >= 1000 ? ' · sobró ' + (mGr / 1000).toFixed(2) + ' kg' : ' · sobró ' + mGr + ' g';
          }
        } else if (canVerMermaReferencias() && c.mermaTotalKg > 0) {
          mermaTxt =
            'MC ' +
            (c.mermaCoccionRealPct != null ? num(c.mermaCoccionRealPct).toFixed(1) + '%' : '—') +
            ' · MD ' +
            (c.mermaDesposteRealPct != null ? num(c.mermaDesposteRealPct).toFixed(1) + '%' : '—');
        }
        var delCell = admin
          ? '<td><button type="button" class="btn btn-outline btn-sm cps-proc-rm" data-proc-rm="' +
            esc(c.id) +
            '" title="Borrar preparación">Borrar</button></td>'
          : '';
        return (
          '<tr data-proc-id="' +
          esc(c.id) +
          '"><td>' +
          esc(c.fecha) +
          '</td><td>' +
          esc(c.producto) +
          '</td><td>' +
          (c.porciones != null ? esc(c.porciones) : c.factor != null ? esc(c.factor) : '—') +
          '</td>' +
          (verVal ? '<td class="num">' + costo + '</td>' : '') +
          '<td style="font-size:11px">' +
          esc(mermaTxt) +
          '</td><td>' +
          esc(resp) +
          '</td>' +
          delCell +
          '</tr>'
        );
      })
      .join('');
  }

  function historialHtml(opts) {
    opts = opts || {};
    var admin = canAdminProcesos();
    var verVal = canVerValoresProcesos();
    var limit = opts.fullPage ? (admin ? 100 : 50) : admin ? 50 : 20;
    var rows = historialRowsHtml(limit);
    var title = opts.fullPage ? 'Registro completo' : 'Últimas preparaciones';
    var colSpan = (verVal ? 1 : 0) + 5 + (admin ? 1 : 0);
    var body = rows
      ? '<div class="table-container"><table class="table"><thead><tr><th>Fecha</th><th>Qué</th><th>Porc.</th>' +
        (verVal ? '<th class="num">Insumos</th>' : '') +
        '<th>Detalle</th><th>Quién</th>' +
        (admin ? '<th></th>' : '') +
        '</tr></thead><tbody id="cps-historial-tbody">' +
        rows +
        '</tbody></table></div>'
      : '<div class="cps-hist-empty"><strong>Aún no hay preparaciones registradas</strong>Cuando anotes tu primera preparación en cocina, aparecerá aquí con fecha, pesos y responsable.</div>';
    return (
      '<div class="card" id="cps-historial-card"><h3 class="card-title">' +
      esc(title) +
      '</h3>' +
      body +
      '</div>'
    );
  }

  function refreshHistorial(host) {
    if (!host) return;
    var tbody = host.querySelector('#cps-historial-tbody');
    if (!tbody) return;
    var admin = canAdminProcesos();
    var verVal = canVerValoresProcesos();
    var rows = historialRowsHtml(admin ? 50 : 20);
    var colSpan = (verVal ? 1 : 0) + 5 + (admin ? 1 : 0);
    tbody.innerHTML = rows || '<tr><td colspan="' + colSpan + '">Sin preparaciones registradas</td></tr>';
    bindHistorialAdmin(host);
  }

  function bindHistorialAdmin(host) {
    if (!host || !canAdminProcesos()) return;
    host.querySelectorAll('.cps-proc-rm').forEach(function (btn) {
      if (btn._cpsBound) return;
      btn._cpsBound = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-proc-rm');
        if (!id) return;
        if (
          !confirm(
            '¿Borrar esta preparación?\n\nTambién se quitan los movimientos de bodega ligados a este registro.'
          )
        ) {
          return;
        }
        var res = R();
        if (!res || !res.eliminarProceso) return toast('No se puede borrar', 'error');
        if (res.eliminarProceso(id)) {
          toast('Preparación eliminada', 'success');
          refreshHistorial(host);
        } else toast('No se encontró el registro', 'warning');
      });
    });
  }

  function renderHistorial() {
    injectStyles();
    return (
      '<div class="crozzo-compras-local cps crozzo-procesos-host" id="crozzo-procesos-historial">' +
      '<header class="cps__head">' +
      '<div class="cps__badge">Lo preparé antes</div>' +
      '<h2 class="cps__title">Historial de preparaciones</h2>' +
      '<p class="cps__sub page-subtitle">Todo lo que registraste en bodega: salsas, bases, despiece y cocción.</p>' +
      '<div class="cps__head-actions">' +
      (canVerValoresProcesos()
        ? '<button type="button" class="btn btn-outline btn-sm" id="cps-goto-recetas">Ver recetas e ingredientes</button>'
        : '') +
      '</div>' +
      '</header>' +
      historialStatsHtml() +
      historialHtml({ fullPage: true }) +
      '</div>'
    );
  }

  function initHistorial(host) {
    state.host = host || null;
    bindHistorialAdmin(host);
    host.querySelectorAll('#cps-goto-recetas').forEach(function (btn) {
      if (btn._cpsBound) return;
      btn._cpsBound = true;
      btn.addEventListener('click', function () {
        goRecetasEstandar(host);
      });
    });
  }

  function goRecetasEstandar(host) {
    var slug = '';
    if (state.edit && state.edit.slug) slug = state.edit.slug;
    else if (host) {
      var sel = host.querySelector('#cps-producto');
      var v = sel && sel.value ? String(sel.value) : '';
      if (v.indexOf('rec:') === 0) slug = v.slice(4);
    }
    if (typeof global.crozzoNavigateToRecetasEstandar === 'function') {
      global.crozzoNavigateToRecetasEstandar(slug ? { slug: slug } : {});
    } else if (typeof global.navigateTo === 'function') {
      global.__crozzoCostosMatrizTab = 'demo';
      global.navigateTo('costos-matriz');
    }
  }

  function render(opts) {
    opts = opts || {};
    injectStyles();
    state.workflow = opts.workflow || '';
    if (!state.responsables.length) state.responsables = initResponsables();
    var meta = wfMeta(state.workflow);
    var ready = !!(C() && E());
    return (
      '<div class="crozzo-compras-local cps crozzo-procesos-host" id="crozzo-procesos-sesion">' +
      '<header class="cps__head">' +
      '<div class="cps__badge">' +
      esc(meta.title) +
      '</div>' +
      '<h2 class="cps__title">' +
      esc(meta.title) +
      '</h2>' +
      '<p class="cps__sub page-subtitle">' +
      esc(meta.sub) +
      '</p>' +
      '<div class="cps__head-actions">' +
      (state.workflow === 'elaboracion' || !state.workflow
        ? canVerValoresProcesos()
          ? '<button type="button" class="btn btn-outline btn-sm" id="cps-goto-recetas">Ver receta e ingredientes</button>'
          : ''
        : '') +
      '</div>' +
      (!ready ? '<p class="cps-hint"><span class="cps-tag cps-tag--warn">Cargando catálogo…</span></p>' : '') +
      '</header>' +
      (!state.workflow ? workflowPickerHtml('') : '') +
      coachHtml(state.workflow) +
      responsablesCardHtml() +
      '<div id="cps-batch-host">' +
      batchCardHtml() +
      '</div>' +
      '<div class="card">' +
      '<h3 class="card-title">' +
      esc(meta.pickLabel) +
      '</h3>' +
      (state.workflow
        ? '<div class="form-group"><label class="form-label">Elige de la lista</label>' +
          '<select class="form-input form-select" id="cps-producto">' +
          productOptionsHtml(state.workflow) +
          '</select></div>' +
          workflowFootnoteHtml(state.workflow)
        : '<p class="cps-hint" style="margin:0">Primero elige el tipo de preparación arriba para ver productos y pasos.</p>') +
      '</div>' +
      '<div id="cps-detail-host"></div>' +
      '<div class="cps-actions" id="cps-actions" style="display:none">' +
      '<button type="button" class="btn btn-outline" id="cps-add-batch">+ Otra preparación en este registro</button>' +
      '<button type="button" class="btn btn-primary" id="cps-save">Guardar en bodega</button></div>' +
      historialHtml() +
      '</div>'
    );
  }

  function refreshBatchHost(host) {
    var el = host.querySelector('#cps-batch-host');
    if (el) el.innerHTML = batchCardHtml();
    bindBatch(host);
    var save = host.querySelector('#cps-save');
    if (save) {
      var n = state.batch.length + (state.edit ? 1 : 0);
      save.textContent = n > 1 ? 'Guardar en bodega (' + n + ')' : 'Guardar en bodega';
    }
  }

  function refreshRespCard(host) {
    var el = host.querySelector('#cps-resp-card');
    if (el) el.outerHTML = responsablesCardHtml();
    bindResponsables(host);
  }

  function refreshDetailPanel(host) {
    if (!state.edit) return;
    var detail = host.querySelector('#cps-detail-host');
    if (!detail) return;
    if (state.edit.mode === 'receta') detail.innerHTML = recetaPanelHtml(state.edit);
    else if (state.edit.mode === 'mp') detail.innerHTML = mpPanelHtml(state.edit);
    bindDetail(host);
    refreshTotals(host);
  }

  function refreshLineasTable(host) {
    if (!state.edit || state.edit.mode !== 'receta') return;
    var wrap = host.querySelector('#cps-lineas-wrap');
    if (!wrap) return;
    wrap.innerHTML = lineasTableHtml(state.edit);
    bindLineInputs(host);
    refreshTotals(host);
  }

  function refreshTotals(host) {
    if (!host || !state.edit) return;
    if (!canVerValoresProcesos()) return;
    if (state.edit.mode === 'receta') {
      var lineas = computeDisplayLineas(state.edit);
      lineas.forEach(function (ln) {
        var cell = host.querySelector('.cps-line-total[data-idx="' + ln.idx + '"]');
        if (cell) cell.textContent = fmtMoney(num(ln.costoXUnidad) * num(ln.cantidad));
      });
      var tot = host.querySelector('#cps-costo-total');
      if (tot) tot.textContent = fmtMoney(calcCostoFromLineas(lineas, state.edit.opts));
    } else if (state.edit.mode === 'mp') {
      var mp = C().get(state.edit.mpId);
      var entGr = readEntradaGrFromHost(host);
      var ent = entGr > 0 ? entGr / 1000 : num((host.querySelector('#cps-mp-entrada') || {}).value, 0);
      var totMp = host.querySelector('#cps-costo-total');
      if (totMp) totMp.textContent = ent > 0 ? fmtMoney(costoEntradaKg(mp, ent)) : '—';
    }
  }

  function onFactorChange(host, val) {
    if (!state.edit) return;
    state.edit.factor = num(val, 1) || 1;
    refreshLineasTable(host);
    var btns = host.querySelector('#cps-porc-btns');
    if (btns) btns.innerHTML = porcionesBtnsHtml(state.edit.factor);
    bindPorcBtns(host);
  }

  function onLineQtyChange(host, idx, rawVal) {
    if (!state.edit || state.edit.mode !== 'receta') return;
    var edit = state.edit;
    var val = num(rawVal, 0);
    var base = edit.baseLineas[idx];
    if (!base) return;
    var expected = num(base.cantidadBase) * num(edit.factor, 1) * num(edit.scaleRatio, 1);
    if (Math.abs(val - expected) < 0.0001) {
      delete edit.locked[idx];
      delete edit.overrides[idx];
    } else {
      var r = expected > 0 ? val / expected : 1;
      edit.scaleRatio = num(edit.scaleRatio, 1) * r;
      edit.locked[idx] = true;
      edit.overrides[idx] = val;
    }
    refreshLineasTable(host);
  }

  function unlockLine(host, idx) {
    if (!state.edit) return;
    delete state.edit.locked[idx];
    delete state.edit.overrides[idx];
    refreshLineasTable(host);
    toast('Ingrediente vuelve al cálculo automático', 'info');
  }

  function collectCurrentItem(host) {
    if (!state.edit) return null;
    var primary = primaryResponsable();
    if (state.edit.mode === 'receta') {
      var cat = C();
      var slug = state.edit.slug;
      var menu = cat.getMenuPlato(slug);
      var rec = cat.getRecetaPlato(slug);
      var lineasDisp = computeDisplayLineas(state.edit);
      if (!lineasDisp.length) return null;
      var lineas = lineasDisp.map(function (ln) {
        return {
          mpId: ln.mpId || null,
          ingrediente: ln.ingrediente,
          unidad: ln.unidad || 'GR',
          cantidadUsada: num(ln.cantidad),
          costoXUnidad: num(ln.costoXUnidad),
          subtotal: Math.round(num(ln.costoXUnidad) * num(ln.cantidad)),
          manual: !!ln.locked,
        };
      });
      var costoTotal = calcCostoFromLineas(lineasDisp, state.edit.opts);
      var outputKg = num((host.querySelector('#cps-output-kg') || {}).value, 0);
      if (outputKg <= 0) outputKg = num(state.edit.factor, 1);
      var bruto = num((host.querySelector('#cps-peso-bruto') || {}).value, 0);
      var item = {
        producto: (menu && menu.producto) || (rec && rec.producto) || slug,
        slug: slug,
        workflow: state.workflow || 'elaboracion',
        kg: outputKg,
        porciones: num(state.edit.factor, 1),
        factor: num(state.edit.factor, 1),
        modoProceso: 'prep_anticipado',
        costoMpTotal: costoTotal,
        lineas: lineas,
        notas: ((host.querySelector('#cps-notas') || {}).value || '').trim(),
        responsables: responsablesPayload(),
        responsableId: primary ? primary.id : null,
        responsableNombre: primary ? primary.nombre : null,
        pesoEntradaKg: bruto > 0 ? bruto : null,
      };
      var mpRef = menu && menu.costeoMpSourceId ? cat.get(menu.costeoMpSourceId) : null;
      return attachMermaPayload(item, host, mpRef);
    }
    if (state.edit.mode === 'mp') {
      var mp = C().get(state.edit.mpId);
      if (!mp) return null;
      var entradaGr = readEntradaGrFromHost(host);
      var entrada = entradaGr > 0 ? entradaGr / 1000 : num((host.querySelector('#cps-mp-entrada') || {}).value, 0);
      syncEntradaKgHidden(host);
      var salida = 0;
      var cortesPayload = [];
      if (state.workflow === 'despiece') {
        state.edit.cortesDespiece = readCortesFromHost(host, state.edit);
        cortesPayload = (state.edit.cortesDespiece || [])
          .filter(function (c) {
            return (c.nombre || '').trim() && num(c.grBalanza) > 0;
          })
          .map(function (c) {
            var resolved = resolveCortePeso(c);
            var gr = resolved.grReal;
            var kg = resolved.kgReal;
            return {
              nombre: String(c.nombre).trim(),
              pctRef: num(c.pctRef) > 0 ? num(c.pctRef) : null,
              grPorPorcion: num(c.grPorPorcion) > 0 ? num(c.grPorPorcion) : null,
              grEsperado: resolved.grCalc > 0 ? resolved.grCalc : null,
              grBalanza: resolved.grBalanza > 0 ? resolved.grBalanza : null,
              deltaGr: resolved.deltaGr,
              grReal: gr > 0 ? gr : null,
              kgReal: kg,
              porciones: resolved.porciones,
              restoGr: resolved.restoGr,
              pctReal: entrada > 0 ? (kg / entrada) * 100 : null,
            };
          });
        salida = cortesPayload.reduce(function (s, c) {
          return s + num(c.kgReal);
        }, 0);
      } else {
        salida = num((host.querySelector('#cps-output-kg') || {}).value, 0);
      }
      if (entrada <= 0) return null;
      if (state.workflow === 'despiece' && salida <= 0) return null;
      var costoMp = costoEntradaKg(mp, entrada);
      var itemMp = {
        producto: mp.nombre,
        mpId: state.edit.mpId,
        workflow: state.workflow || 'despiece',
        kg: salida || entrada,
        pesoEntradaKg: entrada,
        pesoUtilKg: salida > 0 ? salida : null,
        cortesDespiece: cortesPayload,
        costoMpTotal: costoMp,
        lineas: [
          {
            mpId: state.edit.mpId,
            ingrediente: mp.nombre,
            unidad: 'kg',
            cantidadUsada: entrada,
            costoXUnidad: costoMpPorKg(mp),
            subtotal: costoMp,
          },
        ],
        notas: ((host.querySelector('#cps-notas') || {}).value || '').trim(),
        responsables: responsablesPayload(),
        responsableId: primary ? primary.id : null,
        responsableNombre: primary ? primary.nombre : null,
        modoProceso: 'prep_anticipado',
      };
      return attachMermaPayload(itemMp, host, mp);
    }
    return null;
  }

  function addCurrentToBatch(host) {
    if (state.edit && state.edit.mode === 'mp' && state.workflow === 'despiece') {
      var val = validateDespieceCortes(host);
      if (!val.ok) return toast(val.msg, 'warning');
    }
    var item = collectCurrentItem(host);
    if (!item) {
      if (state.edit && state.edit.mode === 'mp' && state.workflow === 'despiece') {
        return toast('Pesa la pieza y anota cada corte en balanza', 'warning');
      }
      return toast('Completa pesos e ingredientes antes de agregar', 'warning');
    }
    if (state.edit.mode === 'mp' && item.pesoEntradaKg <= 0) return toast('Indica cuánto pesó la pieza', 'warning');
    if (canVerMermaReferencias() && item.mermaAlerta) toast(item.mermaAlerta, 'warning');
    state.batch.push(item);
    state.edit = null;
    var detail = host.querySelector('#cps-detail-host');
    var actions = host.querySelector('#cps-actions');
    var sel = host.querySelector('#cps-producto');
    if (detail) detail.innerHTML = '';
    if (actions) actions.style.display = 'none';
    if (sel) sel.value = '';
    refreshBatchHost(host);
    toast('Agregado — puedes registrar otra preparación', 'success');
  }

  function saveSession(host) {
    var res = R();
    if (!res || !res.registrarProceso) return toast('Reservorio no disponible', 'error');
    var items = state.batch.slice();
    var current = collectCurrentItem(host);
    if (current) items.push(current);
    if (!items.length) return toast('Registra al menos una preparación antes de guardar', 'warning');
    var sesionId = 'ses_' + Date.now();
    var totalCosto = 0;
    items.forEach(function (item) {
      if (canVerMermaReferencias() && item.mermaAlerta) toast(item.mermaAlerta, 'warning');
      res.registrarProceso(
        Object.assign({}, item, {
          sesionId: sesionId,
          responsables: item.responsables || responsablesPayload(),
        })
      );
      totalCosto += num(item.costoMpTotal);
    });
    toast(
      (items.length === 1 ? '1 preparación guardada' : items.length + ' preparaciones guardadas') +
        (canVerValoresProcesos() ? ' · ' + fmtMoney(totalCosto) + ' en insumos' : ''),
      'success'
    );
    state.batch = [];
    state.edit = null;
    state.responsables = initResponsables();
    host.innerHTML = render({ workflow: state.workflow });
    init(host, { workflow: state.workflow });
  }

  function onProductChange(host) {
    var sel = host.querySelector('#cps-producto');
    var detail = host.querySelector('#cps-detail-host');
    var actions = host.querySelector('#cps-actions');
    if (!sel || !detail) return;
    var val = sel.value || '';
    state.edit = null;
    detail.innerHTML = '';
    if (actions) actions.style.display = 'none';
    if (!val) return;
    if (val.indexOf('rec:') === 0) {
      state.edit = newEditReceta(val.slice(4));
      detail.innerHTML = recetaPanelHtml(state.edit);
      if (actions) actions.style.display = 'flex';
      bindDetail(host);
      return;
    }
    if (val.indexOf('mp:') === 0) {
      state.edit = newEditMp(val.slice(3));
      detail.innerHTML = mpPanelHtml(state.edit);
      if (actions) actions.style.display = 'flex';
      bindDetail(host);
      bindDespieceCortes(host);
      refreshTotals(host);
      refreshDespieceLive(host);
    }
  }

  function bindLineInputs(host) {
    host.querySelectorAll('.cps-line-qty').forEach(function (inp) {
      if (inp._cpsBound) return;
      inp._cpsBound = true;
      inp.addEventListener('change', function () {
        onLineQtyChange(host, num(inp.getAttribute('data-idx')), inp.value);
      });
      inp.addEventListener('blur', function () {
        onLineQtyChange(host, num(inp.getAttribute('data-idx')), inp.value);
      });
    });
    host.querySelectorAll('.cps-line-unlock').forEach(function (btn) {
      btn.onclick = function () {
        unlockLine(host, num(btn.getAttribute('data-unlock')));
      };
    });
  }

  function bindPorcBtns(host) {
    host.querySelectorAll('.cps-porc-pick').forEach(function (btn) {
      if (btn._cpsBound) return;
      btn._cpsBound = true;
      btn.addEventListener('click', function () {
        var p = num(btn.getAttribute('data-porc'), 1);
        var factor = host.querySelector('#cps-factor');
        if (factor) factor.value = String(p);
        onFactorChange(host, p);
      });
    });
  }

  function bindModo(host) {
    host.querySelectorAll('input[name="cps-modo"]').forEach(function (inp) {
      if (inp._cpsBound) return;
      inp._cpsBound = true;
      inp.addEventListener('change', function () {
        var modo = readModoFromHost(host) || 'prep_anticipado';
        applyModoToHost(host, modo);
        if (state.edit && state.edit.tipoReceta === 'base' && state.edit.slug) {
          persistVendeAlCliente(state.edit.slug, modo === 'bajo_demanda');
        }
      });
    });
    var vendeChk = host.querySelector('#cps-vender-al-momento');
    if (vendeChk && !vendeChk._cpsBound) {
      vendeChk._cpsBound = true;
      vendeChk.addEventListener('change', function () {
        if (vendeChk._cpsSyncing) return;
        var modo = vendeChk.checked ? 'bajo_demanda' : 'prep_anticipado';
        applyModoToHost(host, modo);
        if (state.edit && state.edit.slug) persistVendeAlCliente(state.edit.slug, vendeChk.checked);
      });
    }
  }

  function bindDetail(host) {
    var factor = host.querySelector('#cps-factor');
    if (factor && !factor._cpsBound) {
      factor._cpsBound = true;
      factor.addEventListener('input', function () {
        onFactorChange(host, factor.value);
      });
    }
    bindPorcBtns(host);
    bindLineInputs(host);
    ['#cps-mp-entrada-gr', '#cps-mp-entrada', '#cps-output-kg', '#cps-peso-cocido', '#cps-peso-bruto'].forEach(function (sel) {
      var el = host.querySelector(sel);
      if (el && !el._cpsBound) {
        el._cpsBound = true;
        el.addEventListener('input', function () {
          if (sel === '#cps-mp-entrada-gr') syncEntradaKgHidden(host);
          refreshTotals(host);
          if (state.workflow === 'despiece' && (sel === '#cps-mp-entrada-gr' || sel === '#cps-mp-entrada')) {
            refreshDespieceLive(host);
          } else refreshMermaLive(host);
        });
      }
    });
    bindDespieceCortes(host);
  }

  function bindResponsables(host) {
    var add = host.querySelector('#cps-resp-add');
    if (add && !add._cpsBound) {
      add._cpsBound = true;
      add.addEventListener('change', function () {
        var id = add.value;
        if (!id) return;
        var u = listStaffActivos().find(function (s) {
          return String(s.id) === String(id);
        });
        if (!u) return;
        var exists = (state.responsables || []).some(function (r) {
          return String(r.id) === String(id);
        });
        if (exists) return;
        state.responsables.push({
          id: u.id,
          nombre: String(u.nombre || u.id).trim(),
          rol: u.rol || '',
          principal: false,
        });
        add.value = '';
        refreshRespCard(host);
      });
    }
    host.querySelectorAll('.cps-resp-rm').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-resp-rm');
        state.responsables = (state.responsables || []).filter(function (r) {
          return String(r.id) !== String(id);
        });
        refreshRespCard(host);
      };
    });
  }

  function bindBatch(host) {
    host.querySelectorAll('.cps-batch-rm').forEach(function (btn) {
      btn.onclick = function () {
        var idx = num(btn.getAttribute('data-batch-rm'), -1);
        if (idx < 0) return;
        state.batch.splice(idx, 1);
        refreshBatchHost(host);
      };
    });
  }

  function bindWorkflowPick(host) {
    host.querySelectorAll('[data-cps-wf]').forEach(function (btn) {
      if (btn._cpsWfBound) return;
      btn._cpsWfBound = true;
      btn.addEventListener('click', function () {
        var wf = btn.getAttribute('data-cps-wf') || '';
        if (!wf) return;
        resetForWorkflow(wf);
        try {
          sessionStorage.setItem('qca_pro_workflow', wf);
        } catch (_) {}
        host.innerHTML = render({ workflow: wf });
        init(host, { workflow: wf });
        if (typeof global.refreshLucideIcons === 'function') global.refreshLucideIcons(host);
      });
    });
  }

  function init(host, opts) {
    opts = opts || {};
    if (opts.workflow != null && opts.workflow !== state.workflow) {
      resetForWorkflow(opts.workflow);
    } else {
      state.workflow = opts.workflow || state.workflow || '';
    }
    state.host = host;
    if (!host) return;
    if (!state.responsables.length) state.responsables = initResponsables();
    var cat = C();
    if (cat && cat.ensureReady) {
      cat.ensureReady(function () {
        var sel = host.querySelector('#cps-producto');
        if (sel) sel.innerHTML = productOptionsHtml(state.workflow);
      });
    }
    var sel = host.querySelector('#cps-producto');
    if (sel && !sel._cpsBound) {
      sel._cpsBound = true;
      sel.addEventListener('change', function () {
        onProductChange(host);
      });
    }
    var addBatch = host.querySelector('#cps-add-batch');
    if (addBatch && !addBatch._cpsBound) {
      addBatch._cpsBound = true;
      addBatch.addEventListener('click', function () {
        addCurrentToBatch(host);
      });
    }
    var save = host.querySelector('#cps-save');
    if (save && !save._cpsBound) {
      save._cpsBound = true;
      save.addEventListener('click', function () {
        saveSession(host);
      });
    }
    var goto = host.querySelector('#cps-goto-costos');
    if (goto && !goto._cpsBound) {
      goto._cpsBound = true;
      goto.addEventListener('click', function () {
        goRecetasEstandar(host);
      });
    }
    host.querySelectorAll('#cps-goto-recetas').forEach(function (btn) {
      if (btn._cpsBound) return;
      btn._cpsBound = true;
      btn.addEventListener('click', function () {
        goRecetasEstandar(host);
      });
    });
    bindWorkflowPick(host);
    bindResponsables(host);
    bindBatch(host);
    bindHistorialAdmin(host);
  }

  global.CrozzoProcesosSesion = {
    render: render,
    renderHistorial: renderHistorial,
    init: init,
    initHistorial: initHistorial,
    resetForWorkflow: resetForWorkflow,
    listCatalogo: listCatalogo,
  };
})(typeof window !== 'undefined' ? window : globalThis);
