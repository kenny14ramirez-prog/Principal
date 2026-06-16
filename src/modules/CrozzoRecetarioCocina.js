/**
 * Crozzo POS — Recetario de cocina (vista operativa)
 * Sincronizado con recetas de Costos: ingredientes y pesos, sin costos.
 */
(function (global) {
  'use strict';

  var state = { host: null, selected: null, filter: '', group: 'all', view: 'split' };

  var WF_META = {
    elaboracion: {
      label: 'Salsas y bases',
      icon: 'soup',
      tone: 'violet',
      desc: 'Preparaciones para bodega',
      emoji: '🍲',
      doodle: '🥣',
    },
    coccion: {
      label: 'Cocinar y porcionar',
      icon: 'flame',
      tone: 'rose',
      desc: 'Cocción y empaque',
      emoji: '🔥',
      doodle: '🍖',
    },
    bajo_demanda: {
      label: 'Al momento del pedido',
      icon: 'clock',
      tone: 'cyan',
      desc: 'Se arma cuando piden',
      emoji: '⏱️',
      doodle: '🍽️',
    },
    bodega: {
      label: 'Preparación en bodega',
      icon: 'warehouse',
      tone: 'amber',
      desc: 'Antes del servicio',
      emoji: '📦',
      doodle: '🏪',
    },
    general: {
      label: 'Recetas generales',
      icon: 'utensils',
      tone: 'gold',
      desc: 'Carta y costos',
      emoji: '📖',
      doodle: '👨‍🍳',
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

  function C() {
    return global.CrozzoCatalogoMp;
  }

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d != null ? d : 0;
  }

  function icon(name, cls) {
    return '<i data-lucide="' + esc(name) + '" class="' + esc(cls || '') + '" aria-hidden="true"></i>';
  }

  function normTxt(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function resolveProductIcon(menuRow, nombre, workflow) {
    var pid = menuRow && menuRow.posProductId;
    if (pid != null && typeof global.products !== 'undefined' && Array.isArray(global.products)) {
      for (var i = 0; i < global.products.length; i++) {
        var p = global.products[i];
        if (p && p.id === pid && p.icon) return p.icon;
      }
    }
    return recipeEmoji(nombre, workflow);
  }

  function recipeEmoji(nombre, workflow) {
    var n = normTxt(nombre);
    if (/\bsalsa\b|\bsofrito\b|\baderezo\b|\bcaldo\b|\bbase\b|\bmole\b|\bsopa\b|\bcrema\b/.test(n)) return '🍲';
    if (/\barroz\b|\bfrijol\b|\blenteja\b|\bguiso\b/.test(n)) return '🍚';
    if (/\bpasta\b|\bespagueti\b|\blasagna\b|\blasaña\b/.test(n)) return '🍝';
    if (/\bfideo\b|\bramen\b/.test(n)) return '🍜';
    if (/\bpollo\b|\bpechuga\b|\bala\b/.test(n)) return '🍗';
    if (/\bcostilla\b|\bchicharron\b|\bchicharrón\b/.test(n)) return '🍖';
    if (/\bcarn|\bres\b|\bcerdo\b|\blomo\b/.test(n)) return '🥩';
    if (/\bpesc|\bcamaron\b|\bcamarón\b|\bmarisc|\bceviche\b/.test(n)) return '🐟';
    if (/\bpostre|\btorta\b|\bdulce\b|\bhelado\b|\breposter|\bflan\b/.test(n)) return '🍰';
    if (/\bensalada\b|\bverdura\b|\bvegetal\b/.test(n)) return '🥗';
    if (/\bjugo\b|\blimonada\b/.test(n)) return '🧃';
    if (/\bbebida\b|\bgaseosa\b|\brefresco\b/.test(n)) return '🥤';
    if (/\bcafe\b|\bcafé\b/.test(n)) return '☕';
    if (/\barepa\b|\bpan\b|\btostada\b/.test(n)) return '🫓';
    if (/\bempanada\b/.test(n)) return '🥟';
    if (/\btamal\b/.test(n)) return '🫔';
    if (/\bhamburg|\bsandwich\b|\bperro\b|\bhot dog\b/.test(n)) return '🍔';
    if (/\bpizza\b/.test(n)) return '🍕';
    if (/\btaco\b/.test(n)) return '🌮';
    if (/\bwrap\b|\bburrito\b/.test(n)) return '🌯';
    if (/\bpapa\b|\bfrench\b|\bpatat/.test(n)) return '🍟';
    if (/\bdesayuno\b|\bhuevo\b/.test(n)) return '🍳';
    if (/\bcombo\b|\bbandeja\b/.test(n)) return '🍱';
    return '🍽️';
  }

  function ingEmoji(nombre) {
    var n = normTxt(nombre);
    if (/pollo|pechuga/.test(n)) return '🍗';
    if (/carne|\bres\b|cerdo|chicharron/.test(n)) return '🥩';
    if (/pesc|camaron|marisc/.test(n)) return '🐟';
    if (/huevo/.test(n)) return '🥚';
    if (/leche|crema|queso|mantequilla/.test(n)) return '🥛';
    if (/tomate|salsa de tomate/.test(n)) return '🍅';
    if (/cebolla|aj[oó]|ajo en/.test(n)) return '🧅';
    if (/arroz/.test(n)) return '🍚';
    if (/papa|patata/.test(n)) return '🥔';
    if (/aceite|manteca|grasa/.test(n)) return '🫒';
    if (/\bsal\b|sal fina/.test(n)) return '🧂';
    if (/azucar|azúcar/.test(n)) return '🍬';
    if (/limon|limón|naranja|citrico/.test(n)) return '🍋';
    if (/harina|maiz|maíz/.test(n)) return '🌾';
    if (/pimienta|comino|oregano|orégano|curry/.test(n)) return '🌿';
    if (/champi|champiñon|hong/.test(n)) return '🍄';
    if (/agua\b/.test(n)) return '💧';
    return '🥄';
  }

  function emoSpan(ch, cls) {
    return '<span class="crc-emo' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + ch + '</span>';
  }

  function wfMetaForRow(menuRow, rec) {
    var cat = C();
    var wf = 'general';
    var modo =
      menuRow && cat && cat.inferModoProcesoFromMenu
        ? cat.inferModoProcesoFromMenu(menuRow)
        : menuRow && menuRow.modoProceso
          ? menuRow.modoProceso
          : null;
    if (modo === 'bajo_demanda') wf = 'bajo_demanda';
    else if (menuRow && cat && cat.getWorkflowPrepForMenu) {
      var w = cat.getWorkflowPrepForMenu(menuRow);
      if (w === 'coccion' || w === 'elaboracion') wf = w;
      else if (modo === 'prep_anticipado') wf = 'bodega';
    } else if (menuRow && menuRow.workflowPrep === 'coccion') wf = 'coccion';
    else if (menuRow && menuRow.workflowPrep === 'elaboracion') wf = 'elaboracion';
    else if (modo === 'prep_anticipado') wf = 'bodega';
    var base = WF_META[wf] || WF_META.general;
    return {
      key: wf,
      label: base.label,
      icon: base.icon,
      tone: base.tone,
      desc: base.desc,
      emoji: base.emoji,
      doodle: base.doodle,
    };
  }

  function resolveIngName(ln) {
    var cat = C();
    var name = String(ln.ingrediente || '').trim();
    if (ln.mpId && cat && cat.get) {
      var mp = cat.get(ln.mpId);
      if (mp && mp.nombre) name = mp.nombre;
    }
    return name || 'Ingrediente';
  }

  function fmtKitchenQty(ln) {
    var u = String(ln.unidad || 'GR').toUpperCase();
    var q = num(ln.cantidad);
    if (u === 'GR') {
      if (q >= 1000) {
        return {
          main: (q / 1000).toLocaleString('es-CO', { maximumFractionDigits: 3 }) + ' kg',
          hint: Math.round(q).toLocaleString('es-CO') + ' g',
        };
      }
      return { main: Math.round(q).toLocaleString('es-CO') + ' g', hint: '' };
    }
    if (u === 'KG') {
      return { main: q.toLocaleString('es-CO', { maximumFractionDigits: 3 }) + ' kg', hint: '' };
    }
    if (u === 'ML') return { main: Math.round(q).toLocaleString('es-CO') + ' ml', hint: '' };
    if (u === 'LT' || u === 'L') {
      return { main: q.toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' L', hint: '' };
    }
    if (u === 'UNI' || u === 'UND') {
      return { main: Math.round(q).toLocaleString('es-CO') + ' und', hint: '' };
    }
    return { main: q.toLocaleString('es-CO') + ' ' + u.toLowerCase(), hint: '' };
  }

  function buildRecipeRow(menuRow, rec) {
    var meta = wfMetaForRow(menuRow, rec);
    var porciones = num(rec.opts && rec.opts.porciones, 1);
    if (porciones < 1) porciones = 1;
    var lineas = (rec.lineas || []).map(function (ln, i) {
      var fmt = fmtKitchenQty(ln);
      return {
        idx: i + 1,
        nombre: resolveIngName(ln),
        emoji: ingEmoji(resolveIngName(ln)),
        cantidad: num(ln.cantidad),
        unidad: String(ln.unidad || 'GR').toUpperCase(),
        display: fmt.main,
        hint: fmt.hint,
      };
    });
    var enCarta = !!(menuRow && menuRow.slug);
    var nombre = (menuRow && menuRow.producto) || rec.producto || rec.slug;
    return {
      slug: rec.slug || (menuRow && menuRow.slug),
      nombre: nombre,
      emoji: resolveProductIcon(menuRow, nombre, meta.key),
      categoria: (menuRow && menuRow.categoria) || '',
      workflow: meta.key,
      workflowLabel: meta.label,
      workflowIcon: meta.icon,
      workflowTone: meta.tone,
      workflowEmoji: meta.emoji,
      porciones: porciones,
      lineas: lineas,
      enCarta: enCarta,
      updatedAt: rec.updatedAt || '',
    };
  }

  function normalizeRec(raw) {
    var cat = C();
    if (!raw) return null;
    if (raw.lineas && raw.slug) return raw;
    if (cat && cat.getRecetaPlato && raw.slug) return cat.getRecetaPlato(raw.slug);
    return raw;
  }

  /** Todas las recetas con ingredientes del sistema (Costos + carta). */
  function listKitchenRecipes() {
    var cat = C();
    if (!cat) return [];
    var seen = {};
    var out = [];

    function add(rec, menuRow) {
      rec = normalizeRec(rec);
      if (!rec || !rec.slug || !rec.lineas || !rec.lineas.length) return;
      if (seen[rec.slug]) return;
      seen[rec.slug] = true;
      var row =
        menuRow ||
        (cat.getMenuPlato ? cat.getMenuPlato(rec.slug) : null) ||
        { slug: rec.slug, producto: rec.producto || rec.slug, tipoCosteo: 'receta' };
      out.push(buildRecipeRow(row, rec));
    }

    if (typeof cat.listRecetasPlatos === 'function') {
      cat.listRecetasPlatos().forEach(function (raw) {
        add(raw, cat.getMenuPlato ? cat.getMenuPlato(raw.slug) : null);
      });
    }

    if (typeof cat.buildSeedForCostos === 'function') {
      var seed = cat.buildSeedForCostos();
      (seed.resumen || []).forEach(function (row) {
        if (!row || !row.slug || seen[row.slug]) return;
        var rec = cat.getRecetaPlato ? cat.getRecetaPlato(row.slug) : null;
        if (rec && rec.lineas && rec.lineas.length) add(rec, row);
      });
      var demo = seed.demoRecipe || seed.recetaDemo;
      if (demo && demo.lineas && demo.lineas.length) {
        add(demo, cat.getMenuPlato ? cat.getMenuPlato(demo.slug) : null);
      }
    }

    out.sort(function (a, b) {
      return (
        a.workflowLabel.localeCompare(b.workflowLabel, 'es') ||
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
      );
    });
    return out;
  }

  function filteredRecipes() {
    var all = listKitchenRecipes();
    var q = String(state.filter || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    return all.filter(function (r) {
      if (state.group !== 'all' && r.workflow !== state.group) return false;
      if (!q) return true;
      var hay = (r.nombre + ' ' + r.workflowLabel + ' ' + r.categoria)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return hay.indexOf(q) >= 0;
    });
  }

  function refreshIcons(root) {
    if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons(root);
    else if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [root] });
  }

  function injectStyles() {
    var id = 'crozzo-recetario-cocina-css-v3';
    var old =
      document.getElementById(id) ||
      document.getElementById('crozzo-recetario-cocina-css-v2') ||
      document.getElementById('crozzo-recetario-cocina-css');
    if (old) old.remove();
    var el = document.createElement('style');
    el.id = id;
    el.textContent =
      '.crc{--crc-gold:var(--ccp-gold,var(--ventas-gold,#d4b84a));--crc-glass:rgba(14,16,26,.78);max-width:1180px;margin:0 auto;color:var(--text-primary);padding:0 4px 36px}' +
      '.crc-emo{display:inline-block;line-height:1;font-style:normal;user-select:none}' +
      '.crc__hero{position:relative;overflow:hidden;margin-bottom:22px;padding:22px 24px;border-radius:18px;border:1px solid rgba(212,184,74,.28);background:linear-gradient(145deg,rgba(212,184,74,.14) 0%,rgba(212,184,74,.03) 42%,var(--crc-glass) 100%);box-shadow:0 12px 40px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(18px)}' +
      '.crc__hero-glow{position:absolute;top:-50%;right:-5%;width:min(360px,50vw);height:min(360px,50vw);background:radial-gradient(circle,rgba(212,184,74,.22) 0%,transparent 68%);pointer-events:none}' +
      '.crc__hero-deco{position:absolute;top:-30px;right:-20px;width:140px;height:140px;opacity:.1;pointer-events:none;color:var(--crc-gold)}' +
      '.crc__hero-deco svg{width:100%;height:100%}' +
      '.crc__hero-grid{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:20px;position:relative;z-index:1}' +
      '.crc__eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--crc-gold)}' +
      '.crc__eyebrow svg{width:14px;height:14px}' +
      '.crc__title{margin:0;font-size:clamp(1.45rem,3vw,1.85rem);font-weight:650;letter-spacing:-.04em;line-height:1.15}' +
      '.crc__sub{margin:10px 0 0;font-size:14px;color:var(--text-muted);line-height:1.6;max-width:520px}' +
      '.crc__hero-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
      '.crc__hero-actions .btn{display:inline-flex;align-items:center;gap:6px}' +
      '.crc__hero-actions .btn svg{width:16px;height:16px}' +
      '.crc__pills{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}' +
      '.crc-pill{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);font-size:13px;font-weight:600}' +
      '.crc-pill svg{width:16px;height:16px;color:var(--crc-gold);opacity:.9}' +
      '.crc-pill strong{font-size:1.1rem;font-weight:750;font-variant-numeric:tabular-nums;margin-right:2px}' +
      '.crc__toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;margin-bottom:14px}' +
      '.crc__search-wrap{flex:1 1 220px;position:relative}' +
      '.crc__search-wrap svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--text-muted);pointer-events:none}' +
      '.crc__search{width:100%;min-height:48px;padding-left:42px;font-size:15px;border-radius:14px}' +
      '.crc__tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}' +
      '.crc-tab{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .22s}' +
      '.crc-tab svg{width:15px;height:15px}' +
      '.crc-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}' +
      '.crc-tab.is-active{color:var(--text-primary);border-color:rgba(212,184,74,.35);background:linear-gradient(135deg,rgba(212,184,74,.2),rgba(99,102,241,.08));box-shadow:0 6px 20px rgba(0,0,0,.15)}' +
      '.crc__layout{display:grid;grid-template-columns:minmax(280px,340px) 1fr;gap:18px;align-items:start}' +
      '.crc__sidebar{display:flex;flex-direction:column;gap:14px;max-height:min(72vh,680px);overflow-y:auto;padding-right:4px}' +
      '.crc-section__title{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted)}' +
      '.crc-section__title svg{width:14px;height:14px;color:var(--crc-gold)}' +
      '.crc-card{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;padding:14px 16px;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:var(--crc-glass);backdrop-filter:blur(12px);cursor:pointer;font-family:inherit;color:inherit;transition:transform .22s,box-shadow .22s,border-color .22s}' +
      '.crc-card:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(0,0,0,.22);border-color:rgba(212,184,74,.25)}' +
      '.crc-card.is-active{border-color:rgba(212,184,74,.45);background:linear-gradient(135deg,rgba(212,184,74,.14),rgba(99,102,241,.06));box-shadow:0 12px 32px rgba(0,0,0,.2)}' +
      '.crc-card__icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid rgba(255,255,255,.08);background:linear-gradient(145deg,rgba(212,184,74,.18),rgba(212,184,74,.05))}' +
      '.crc-card__glyph{font-size:1.35rem;line-height:1}' +
      '.crc-card__icon--violet{background:linear-gradient(145deg,rgba(167,139,250,.18),rgba(167,139,250,.06))}' +
      '.crc-card__icon--rose{background:linear-gradient(145deg,rgba(251,113,133,.18),rgba(251,113,133,.06))}' +
      '.crc-card__icon--cyan{background:linear-gradient(145deg,rgba(34,211,238,.18),rgba(34,211,238,.06))}' +
      '.crc-card__icon--amber{background:linear-gradient(145deg,rgba(245,158,11,.18),rgba(245,158,11,.06))}' +
      '.crc-card__icon--gold{background:linear-gradient(145deg,rgba(212,184,74,.22),rgba(212,184,74,.06))}' +
      '.crc-card__body{flex:1;min-width:0}' +
      '.crc-card__name{margin:0;font-size:15px;font-weight:650;line-height:1.3}' +
      '.crc-card__meta{margin-top:5px;font-size:11px;color:var(--text-muted);line-height:1.45}' +
      '.crc__detail{position:sticky;top:12px;border-radius:22px;border:1px solid rgba(212,184,74,.18);background:var(--crc-glass);backdrop-filter:blur(20px);overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.25)}' +
      '.crc__detail-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:360px;padding:32px;text-align:center;color:var(--text-muted)}' +
      '.crc__detail-empty svg{width:56px;height:56px;opacity:.35;color:var(--crc-gold)}' +
      '.crc-detail__banner{padding:22px 24px 18px;background:linear-gradient(135deg,rgba(212,184,74,.12),transparent 60%);border-bottom:1px solid rgba(255,255,255,.06)}' +
      '.crc-detail__icon-row{display:flex;align-items:flex-start;gap:16px}' +
      '.crc-detail__icon{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1);flex-shrink:0;background:linear-gradient(145deg,rgba(212,184,74,.18),rgba(212,184,74,.05))}' +
      '.crc-detail__glyph{font-size:1.75rem;line-height:1}' +
      '.crc-detail__title{margin:0;font-size:1.45rem;font-weight:650;letter-spacing:-.03em;line-height:1.2}' +
      '.crc-detail__sub{margin:6px 0 0;font-size:13px;color:var(--text-muted);line-height:1.5;display:flex;align-items:center;gap:6px}' +
      '.crc-detail__sub svg{width:14px;height:14px;opacity:.85}' +
      '.crc-detail__chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
      '.crc-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}' +
      '.crc-chip svg{width:12px;height:12px;opacity:.85}' +
      '.crc-detail__body{padding:8px 16px 20px}' +
      '.crc-ing{display:flex;align-items:center;gap:12px;padding:14px 12px;border-radius:14px;border:1px solid transparent;transition:background .18s}' +
      '.crc-ing:hover{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.05)}' +
      '.crc-ing__num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:750;background:rgba(212,184,74,.15);color:var(--crc-gold);flex-shrink:0}' +
      '.crc-ing__name{flex:1;font-size:15px;font-weight:550;line-height:1.35}' +
      '.crc-ing__name-emo{font-size:1rem;margin-right:6px;vertical-align:-2px}' +
      '.crc-ing__qty{text-align:right;font-size:1.15rem;font-weight:750;font-variant-numeric:tabular-nums;color:var(--crc-gold);line-height:1.2}' +
      '.crc-ing__hint{display:block;font-size:11px;font-weight:500;color:var(--text-muted);margin-top:2px}' +
      '.crc-detail__foot{padding:14px 20px;border-top:1px solid rgba(255,255,255,.06);display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;background:rgba(0,0,0,.12)}' +
      '.crc-empty{padding:32px 20px;text-align:center;border:1px dashed rgba(212,184,74,.25);border-radius:18px;color:var(--text-muted);line-height:1.6}' +
      '.crc-empty svg{width:48px;height:48px;margin-bottom:12px;opacity:.4;color:var(--crc-gold)}' +
      '.crc-empty strong{display:block;color:var(--text-primary);font-size:16px;margin-bottom:8px}' +
      '.ccp.bona .crc__hero,.ccp.bona .crc__detail,.ccp.bona .crc-card{border-color:var(--border)}' +
      '.ccp.bona .crc__hero,.ccp.bona .crc__detail,.ccp.bona .crc-card{background:var(--bg-card);box-shadow:var(--bona-shadow-sm,0 4px 20px rgba(45,45,45,.06))}' +
      '.ccp.bona .crc-detail__title{font-family:var(--bona-font-display,inherit);color:var(--text-primary)}' +
      '.ccp.bona .crc-ing__qty{color:var(--bona-gold,#b59a6d)}' +
      '@media(max-width:960px){.crc__layout{grid-template-columns:1fr}.crc__detail{position:relative;top:0}.crc__sidebar{max-height:280px}}';
    document.head.appendChild(el);
  }

  function heroDecoSvg() {
    return (
      '<div class="crc__hero-glow" aria-hidden="true"></div>' +
      '<div class="crc__hero-deco" aria-hidden="true">' +
      '<svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="52" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 6"/>' +
      '<path d="M35 75c8-18 22-28 25-28s17 10 25 28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<ellipse cx="60" cy="42" rx="18" ry="8" stroke="currentColor" stroke-width="1.5"/></svg></div>'
    );
  }

  function statsPills(all) {
    var counts = { elaboracion: 0, coccion: 0, bajo_demanda: 0, other: 0 };
    all.forEach(function (r) {
      if (r.workflow === 'elaboracion') counts.elaboracion++;
      else if (r.workflow === 'coccion') counts.coccion++;
      else if (r.workflow === 'bajo_demanda') counts.bajo_demanda++;
      else counts.other++;
    });
    return (
      '<div class="crc__pills">' +
      '<div class="crc-pill">' +
      icon('book-open') +
      '<strong>' +
      all.length +
      '</strong> recetas</div>' +
      '<div class="crc-pill">' +
      icon('soup') +
      '<strong>' +
      counts.elaboracion +
      '</strong> salsas</div>' +
      '<div class="crc-pill">' +
      icon('flame') +
      '<strong>' +
      counts.coccion +
      '</strong> cocción</div>' +
      '<div class="crc-pill">' +
      icon('clock') +
      '<strong>' +
      counts.bajo_demanda +
      '</strong> al momento</div></div>'
    );
  }

  function tabsHtml() {
    var tabs = [
      { id: 'all', label: 'Todas', icon: 'layout-grid' },
      { id: 'elaboracion', label: 'Salsas', icon: 'soup' },
      { id: 'coccion', label: 'Cocinar', icon: 'flame' },
      { id: 'bodega', label: 'Bodega', icon: 'warehouse' },
      { id: 'bajo_demanda', label: 'Al momento', icon: 'clock' },
    ];
    return (
      '<div class="crc__tabs" role="tablist">' +
      tabs
        .map(function (t) {
          return (
            '<button type="button" class="crc-tab' +
            (state.group === t.id ? ' is-active' : '') +
            '" role="tab" data-crc-group="' +
            esc(t.id) +
            '" aria-selected="' +
            (state.group === t.id ? 'true' : 'false') +
            '">' +
            icon(t.icon) +
            '<span>' +
            esc(t.label) +
            '</span></button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function groupedListHtml(items) {
    if (!items.length) {
      return (
        '<div class="crc-empty">' +
        icon('chef-hat') +
        '<strong>No hay recetas todavía</strong>' +
        'Agrega platos con ingredientes en <strong>Costos → Recetas</strong>. Aparecerán aquí al instante.</div>'
      );
    }
    var groups = {};
    items.forEach(function (r) {
      var k = r.workflowLabel || 'General';
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });
    return Object.keys(groups)
      .sort(function (a, b) {
        return a.localeCompare(b, 'es');
      })
      .map(function (label) {
        var list = groups[label];
        var wfIcon = (list[0] && list[0].workflowIcon) || 'utensils';
        return (
          '<div class="crc-section">' +
          '<h3 class="crc-section__title">' +
          icon(wfIcon) +
          esc(label) +
          ' · ' +
          list.length +
          '</h3>' +
          list.map(cardHtml).join('') +
          '</div>'
        );
      })
      .join('');
  }

  function cardHtml(r) {
    var active = state.selected === r.slug;
    return (
      '<button type="button" class="crc-card' +
      (active ? ' is-active' : '') +
      '" data-crc-slug="' +
      esc(r.slug) +
      '">' +
      '<div class="crc-card__icon crc-card__icon--' +
      esc(r.workflowTone) +
      '">' +
      emoSpan(r.emoji, 'crc-card__glyph') +
      '</div>' +
      '<div class="crc-card__body">' +
      '<p class="crc-card__name">' +
      esc(r.nombre) +
      '</p>' +
      '<div class="crc-card__meta">' +
      r.lineas.length +
      ' ingrediente' +
      (r.lineas.length === 1 ? '' : 's') +
      (r.porciones > 1 ? ' · ' + r.porciones + ' porc.' : '') +
      (!r.enCarta ? ' · fuera de carta' : '') +
      '</div></div></button>'
    );
  }

  function detailHtml(rec) {
    if (!rec) {
      return (
        '<div class="crc__detail-empty">' +
        icon('hand-pointer') +
        '<p>Elija una receta de la lista.<br>Verá los ingredientes y pesos listos para cocina.</p></div>'
      );
    }
    var ings = rec.lineas
      .map(function (ln) {
        return (
          '<div class="crc-ing">' +
          '<span class="crc-ing__num">' +
          ln.idx +
          '</span>' +
          '<span class="crc-ing__name">' +
          (ln.emoji ? emoSpan(ln.emoji, 'crc-ing__name-emo') : '') +
          esc(ln.nombre) +
          '</span>' +
          '<span class="crc-ing__qty">' +
          esc(ln.display) +
          (ln.hint ? '<span class="crc-ing__hint">' + esc(ln.hint) + '</span>' : '') +
          '</span></div>'
        );
      })
      .join('');
    return (
      '<div class="crc-detail__banner">' +
      '<div class="crc-detail__icon-row">' +
      '<div class="crc-detail__icon crc-card__icon--' +
      esc(rec.workflowTone) +
      '">' +
      emoSpan(rec.emoji, 'crc-detail__glyph') +
      '</div>' +
      '<div>' +
      '<h3 class="crc-detail__title">' +
      esc(rec.nombre) +
      '</h3>' +
      '<p class="crc-detail__sub">' +
      icon(rec.workflowIcon) +
      esc(rec.workflowLabel) +
      ' · solo pesos e ingredientes</p>' +
      '<div class="crc-detail__chips">' +
      '<span class="crc-chip">' +
      icon('list') +
      esc(rec.lineas.length) +
      ' ingredientes</span>' +
      (rec.porciones > 1
        ? '<span class="crc-chip">' + icon('users') + rec.porciones + ' porciones</span>'
        : '<span class="crc-chip">' + icon('scale') + 'Receta estándar</span>') +
      (rec.categoria ? '<span class="crc-chip">' + icon('tag') + esc(rec.categoria) + '</span>' : '') +
      '</div></div></div></div>' +
      '<div class="crc-detail__body">' +
      ings +
      '</div>' +
      '<div class="crc-detail__foot">' +
      '<span class="crc-chip">' +
      icon('refresh-cw') +
      'Sincronizado con Costos</span>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crc-pdf-one-inline">' +
      icon('download') +
      ' PDF de esta receta</button></div>'
    );
  }

  function renderInner() {
    var all = listKitchenRecipes();
    var items = filteredRecipes();
    if (
      state.selected &&
      !items.some(function (r) {
        return r.slug === state.selected;
      })
    ) {
      state.selected = items.length ? items[0].slug : null;
    }
    if (!state.selected && items.length) state.selected = items[0].slug;
    var current =
      items.filter(function (r) {
        return r.slug === state.selected;
      })[0] || null;
    return (
      statsPills(all) +
      tabsHtml() +
      '<div class="crc__layout">' +
      '<div class="crc__sidebar" id="crc-list">' +
      groupedListHtml(items) +
      '</div>' +
      '<div class="crc__detail" id="crc-detail">' +
      detailHtml(current) +
      '</div></div>'
    );
  }

  function refreshList(host) {
    if (!host) return;
    var pills = host.querySelector('.crc__pills');
    var tabs = host.querySelector('.crc__tabs');
    var listEl = host.querySelector('#crc-list');
    var detailEl = host.querySelector('#crc-detail');
    var all = listKitchenRecipes();
    var items = filteredRecipes();
    if (
      state.selected &&
      !items.some(function (r) {
        return r.slug === state.selected;
      })
    ) {
      state.selected = items.length ? items[0].slug : null;
    }
    if (pills) pills.outerHTML = statsPills(all);
    if (tabs) tabs.outerHTML = tabsHtml();
    if (listEl) listEl.innerHTML = groupedListHtml(items);
    if (detailEl) {
      var current =
        items.filter(function (r) {
          return r.slug === state.selected;
        })[0] || null;
      detailEl.innerHTML = detailHtml(current);
    }
    bindCards(host);
    bindTabs(host);
    bindInlinePdf(host);
    refreshIcons(host);
  }

  function bindCards(host) {
    host.querySelectorAll('[data-crc-slug]').forEach(function (btn) {
      if (btn._crcBound) return;
      btn._crcBound = true;
      btn.addEventListener('click', function () {
        state.selected = btn.getAttribute('data-crc-slug');
        refreshList(host);
      });
    });
  }

  function bindTabs(host) {
    host.querySelectorAll('[data-crc-group]').forEach(function (btn) {
      if (btn._crcTabBound) return;
      btn._crcTabBound = true;
      btn.addEventListener('click', function () {
        state.group = btn.getAttribute('data-crc-group') || 'all';
        refreshList(host);
      });
    });
  }

  function bindInlinePdf(host) {
    var btn = host.querySelector('#crc-pdf-one-inline');
    if (!btn || btn._crcBound) return;
    btn._crcBound = true;
    btn.addEventListener('click', function () {
      var one = listKitchenRecipes().filter(function (r) {
        return r.slug === state.selected;
      })[0];
      if (!one) return toast('Seleccione una receta', 'warning');
      exportPdf([one]);
    });
  }

  function bindToolbar(host) {
    var search = host.querySelector('#crc-search');
    if (search && !search._crcBound) {
      search._crcBound = true;
      search.addEventListener('input', function () {
        state.filter = search.value;
        refreshList(host);
      });
    }
    var pdfAll = host.querySelector('#crc-pdf-all');
    if (pdfAll && !pdfAll._crcBound) {
      pdfAll._crcBound = true;
      pdfAll.addEventListener('click', function () {
        var items = filteredRecipes();
        exportPdf(items.length ? items : listKitchenRecipes());
      });
    }
  }

  function recetarioBrandTitle() {
    try {
      if (typeof global.getCrozzoBranding === 'function') {
        var b = global.getCrozzoBranding();
        var plat = b && b.platform;
        var tenant = b && b.tenant;
        var show = b && b.show;
        if (show && show.header && show.header.tenant && tenant && tenant.label && String(tenant.label).trim()) {
          return String(tenant.label).trim();
        }
        if (plat && plat.label && String(plat.label).trim()) return String(plat.label).trim();
      }
    } catch (_) {}
    try {
      if (global.config && typeof global.config.getEmpresa === 'function') {
        var emp = global.config.getEmpresa();
        if (emp && emp.nombre) return String(emp.nombre).trim();
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoAppDisplayName === 'function') return global.crozzoAppDisplayName();
      if (global.CROZZO_APP_DISPLAY_NAME) return String(global.CROZZO_APP_DISPLAY_NAME).trim();
    } catch (_) {}
    return 'BONA origen';
  }

  function resolveRecetarioBrandLogoUrl() {
    try {
      if (typeof global.getCrozzoBranding === 'function') {
        var b = global.getCrozzoBranding();
        var show = b && b.show;
        var tenant = b && b.tenant;
        var plat = b && b.platform;
        if (show && show.header && show.header.tenant && tenant && tenant.dataUrl && String(tenant.dataUrl).trim()) {
          return String(tenant.dataUrl).trim();
        }
        if (plat && plat.dataUrl && String(plat.dataUrl).trim()) return String(plat.dataUrl).trim();
      }
    } catch (_) {}
    var domIds = ['crozzoSidebarImgPlatform', 'crozzoHeaderImgPlatform', 'crozzoLoginImgPlatform'];
    for (var i = 0; i < domIds.length; i++) {
      var el = document.getElementById(domIds[i]);
      if (el && !el.hidden && el.src) return el.src;
    }
    return 'assets/bona-origen-logo.png';
  }

  function absBrandAssetUrl(url) {
    var p = String(url || '').trim();
    if (!p) return '';
    if (/^(data:|https?:|blob:|file:)/i.test(p)) return p;
    if (typeof global.crozzoResolveAssetUrl === 'function') return global.crozzoResolveAssetUrl(p);
    try {
      if (global.location && global.location.href) return new URL(p, global.location.href).href;
    } catch (_) {}
    return p;
  }

  function loadRecetarioBrandForPdf() {
    var meta = {
      title: recetarioBrandTitle(),
      logoData: '',
      logoFormat: 'PNG',
    };
    var url = resolveRecetarioBrandLogoUrl();
    if (!url) return Promise.resolve(meta);
    if (/^data:image\//i.test(url)) {
      meta.logoData = url;
      meta.logoFormat = /png/i.test(url) ? 'PNG' : 'JPEG';
      return Promise.resolve(meta);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width || 64;
          var h = img.naturalHeight || img.height || 64;
          var max = 512;
          var scale = Math.min(1, max / Math.max(w, h, 1));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          var ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          meta.logoData = canvas.toDataURL('image/png');
          meta.logoFormat = 'PNG';
        } catch (e) {
          console.warn('[recetario-pdf] logo raster', e);
        }
        resolve(meta);
      };
      img.onerror = function () {
        console.warn('[recetario-pdf] logo load', url);
        resolve(meta);
      };
      img.src = absBrandAssetUrl(url);
    });
  }

  function empresaNombre() {
    return recetarioBrandTitle();
  }

  function loadJsPdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf.jsPDF);
    if (global.jsPDF) return Promise.resolve(global.jsPDF);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'vendor/CrozzoJsPdf.js';
      s.onload = function () {
        var c = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
        if (c) resolve(c);
        else reject(new Error('jsPDF no disponible'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar jsPDF'));
      };
      document.head.appendChild(s);
    });
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

  function safeFilename(s) {
    return (
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48) || 'receta'
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
      console.error('[recetario-pdf]', e);
      return false;
    }
  }

  function isTauriEnv() {
    return !!(
      (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') ||
      global.__CROZZO_IS_TAURI__
    );
  }

  function tauriInvoke(cmd, args) {
    if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
      return global.__TAURI__.core.invoke(cmd, args || {});
    }
    return Promise.reject(new Error('Tauri no disponible'));
  }

  function tauriSavedPath(res) {
    if (!res) return '';
    return String(res.saved_path || res.savedPath || '').trim();
  }

  function bytesToBase64(u8) {
    var CHUNK = 0x8000;
    var bin = '';
    for (var i = 0; i < u8.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
    }
    return btoa(bin);
  }

  function pdfDocToBase64(doc) {
    try {
      if (doc && typeof doc.output === 'function') {
        var ab = doc.output('arraybuffer');
        if (ab && ab.byteLength > 100) {
          return Promise.resolve(bytesToBase64(new Uint8Array(ab)));
        }
      }
    } catch (e) {
      console.warn('[recetario-pdf] arraybuffer', e);
    }
    try {
      if (doc && typeof doc.output === 'function') {
        var uri = doc.output('datauristring');
        var comma = String(uri || '').indexOf(',');
        if (comma >= 0) {
          var b64 = String(uri).slice(comma + 1);
          if (b64.length > 100) return Promise.resolve(b64);
        }
      }
    } catch (e) {
      console.warn('[recetario-pdf] datauri sync', e);
    }
    return pdfDocToBase64Async(doc);
  }

  function pdfDocToBase64Async(doc) {
    return new Promise(function (resolve) {
      try {
        var blob = doc.output('blob');
        if (!blob || !blob.size) {
          resolve('');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var raw = String(reader.result || '');
          var comma = raw.indexOf(',');
          resolve(comma >= 0 ? raw.slice(comma + 1) : '');
        };
        reader.onerror = function () {
          resolve('');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error('[recetario-pdf] blob read', e);
        resolve('');
      }
    });
  }

  function openSavedPdfPath(path) {
    if (!path || !isTauriEnv()) return;
    tauriInvoke('plugin:opener|open_path', { path: path }).catch(function () {});
  }

  function savePdfDocBrowser(doc, filename) {
    filename = String(filename || 'recetario-cocina.pdf');
    var err = null;
    try {
      if (doc && typeof doc.save === 'function') {
        doc.save(filename);
        return {
          ok: true,
          mode: 'save',
          hint: 'PDF guardado — revise Descargas (' + filename + ')',
        };
      }
    } catch (e1) {
      err = e1;
      console.warn('[recetario-pdf] doc.save', e1);
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
          hint: 'PDF abierto — use Guardar como en el visor si hace falta',
        };
      }
      URL.revokeObjectURL(url);
      return { ok: false, blockedPopup: true, error: new Error('Ventana emergente bloqueada') };
    } catch (e2) {
      err = e2;
      console.error('[recetario-pdf] blob', e2);
    }
    try {
      var uri = doc.output('datauristring');
      var a2 = document.createElement('a');
      a2.href = uri;
      a2.download = filename;
      document.body.appendChild(a2);
      a2.click();
      a2.remove();
      return { ok: true, mode: 'datauri', hint: 'Descarga alternativa (' + filename + ')' };
    } catch (e3) {
      err = e3;
      console.error('[recetario-pdf] datauri', e3);
    }
    return { ok: false, error: err };
  }

  function savePdfDoc(doc, filename) {
    filename = String(filename || 'recetario-cocina.pdf');
    return pdfDocToBase64(doc).then(function (b64) {
      if (!b64) {
        return Promise.reject(new Error('No se pudo preparar el PDF para guardar'));
      }
      if (isTauriEnv()) {
        return tauriInvoke('crozzo_save_pdf_b64', {
          pdfB64: b64,
          filename: filename,
        }).then(function (res) {
          var path = tauriSavedPath(res);
          if (res && res.ok && path) {
            return {
              ok: true,
              mode: 'tauri-downloads',
              hint: 'PDF guardado en Descargas:\n' + path,
              savedPath: path,
            };
          }
          throw new Error((res && res.message) || 'No se pudo guardar en Descargas');
        });
      }
      return savePdfDocBrowser(doc, filename);
    });
  }

  function groupRecipesForPdf(recipes) {
    var order = ['elaboracion', 'coccion', 'bodega', 'bajo_demanda', 'general'];
    var map = {};
    recipes.forEach(function (r) {
      var k = r.workflow || 'general';
      if (!map[k]) {
        var wf = WF_META[k] || WF_META.general;
        map[k] = { label: r.workflowLabel || wf.label, emoji: wf.emoji, items: [] };
      }
      map[k].items.push(r);
    });
    var out = [];
    order.forEach(function (k) {
      if (map[k]) out.push(map[k]);
    });
    Object.keys(map).forEach(function (k) {
      if (order.indexOf(k) < 0) out.push(map[k]);
    });
    return out;
  }

  var _pdfEmojiCache = {};

  function pdfEmojiRaster(emoji, px) {
    emoji = String(emoji || '🍽️').trim() || '🍽️';
    px = px || 48;
    var key = emoji + '@' + px;
    if (_pdfEmojiCache[key]) return _pdfEmojiCache[key];
    try {
      var canvas = document.createElement('canvas');
      var scale = 2;
      canvas.width = px * scale;
      canvas.height = px * scale;
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font =
        Math.round(px * 0.82) +
        'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(emoji, px / 2, px / 2 + 1);
      _pdfEmojiCache[key] = canvas.toDataURL('image/png');
      return _pdfEmojiCache[key];
    } catch (_) {
      return null;
    }
  }

  function pdfDrawBrandLogo(doc, brandMeta, x, y, mm) {
    mm = mm || 9;
    if (!brandMeta || !brandMeta.logoData) return 0;
    try {
      var fmt = brandMeta.logoFormat || 'PNG';
      if (!doc.__crcBrandLogoPlaced) {
        doc.__crcBrandLogoPlaced = true;
        doc.addImage(brandMeta.logoData, fmt, x, y - mm * 0.75, mm, mm, 'crcBrandLogo');
      } else {
        doc.addImage('crcBrandLogo', fmt, x, y - mm * 0.75, mm, mm);
      }
      return mm;
    } catch (e) {
      console.warn('[recetario-pdf] brand logo', e);
      return 0;
    }
  }

  function pdfDrawEmoji(doc, emoji, x, y, mm) {
    mm = mm || 5;
    var data = pdfEmojiRaster(emoji, 48);
    if (!data) return 0;
    if (!doc.__crcEmojiPlaced) doc.__crcEmojiPlaced = {};
    var key = String(emoji || '🍽️');
    try {
      if (!doc.__crcEmojiPlaced[key]) {
        var alias = 'crcE' + Object.keys(doc.__crcEmojiPlaced).length;
        doc.__crcEmojiPlaced[key] = alias;
        doc.addImage(data, 'PNG', x, y - mm * 0.72, mm, mm, alias);
      } else {
        doc.addImage(doc.__crcEmojiPlaced[key], 'PNG', x, y - mm * 0.72, mm, mm);
      }
      return mm;
    } catch (e) {
      console.warn('[recetario-pdf] emoji image', emoji, e);
      return 0;
    }
  }

  function pdfDrawNumBadge(doc, x, y, num, goldColor) {
    var r = 2.6;
    doc.setFillColor.apply(doc, goldColor);
    if (typeof doc.circle === 'function') {
      doc.circle(x, y - 0.5, r, 'F');
    } else {
      doc.roundedRect(x - r, y - 0.5 - r, r * 2, r * 2, r, r, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(String(num), x, y - 0.2, { align: 'center' });
  }

  function buildKitchenPdf(jsPDF, recipes, brandMeta) {
    brandMeta = brandMeta || { title: recetarioBrandTitle(), logoData: '', logoFormat: 'PNG' };
    var brandTitle = String(brandMeta.title || recetarioBrandTitle()).trim() || 'BONA origen';
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var M = 16;
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var W = pageW - M * 2;
    var gold = [181, 154, 109];
    var goldSoft = [245, 240, 232];
    var dark = [28, 32, 40];
    var charcoal = [45, 45, 45];
    var muted = [118, 116, 110];
    var cream = [252, 250, 246];
    var y = 0;
    var single = recipes.length === 1;

    function ensure(h) {
      if (y + h > pageH - 14) {
        doc.addPage();
        y = M;
      }
    }

    function drawFooters() {
      var total = doc.internal.getNumberOfPages();
      for (var p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setDrawColor.apply(doc, goldSoft);
        doc.setLineWidth(0.2);
        doc.line(M, pageH - 12, pageW - M, pageH - 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, muted);
        doc.text(brandTitle + ' · Recetario de cocina', M, pageH - 7);
        doc.text('Pág. ' + p + ' / ' + total, pageW - M, pageH - 7, { align: 'right' });
      }
    }

    function drawCover() {
      doc.setFillColor.apply(doc, gold);
      doc.rect(0, 0, pageW, 2.2, 'F');
      doc.setFillColor.apply(doc, dark);
      doc.rect(0, 2.2, pageW, single ? 36 : 32, 'F');

      if (single) {
        var rec = recipes[0];
        pdfDrawEmoji(doc, rec.emoji, M + 1, 16, 9);
        doc.setTextColor.apply(doc, gold);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('RECETA DE COCINA', M + 12, 13);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        var tLines = doc.splitTextToSize(rec.nombre, W - 14);
        doc.text(tLines.slice(0, 2), M + 12, 21);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(210, 210, 210);
        var meta = rec.workflowLabel + (rec.porciones > 1 ? ' · ' + rec.porciones + ' porciones' : '');
        doc.text(meta, M + 12, 30);
        doc.setFontSize(8);
        doc.text(
          new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }),
          pageW - M,
          30,
          { align: 'right' }
        );
        y = 46;
      } else {
        var logoMm = 9;
        if (brandMeta.logoData) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(M + 0.4, 7.4, logoMm + 1.4, logoMm + 1.4, 1.4, 1.4, 'F');
          pdfDrawBrandLogo(doc, brandMeta, M + 1, 16, logoMm);
        } else {
          pdfDrawEmoji(doc, '👨‍🍳', M + 1, 15, 9);
        }
        doc.setTextColor.apply(doc, gold);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('RECETARIO DE COCINA', M + 12, 13);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(brandTitle, M + 12, 21);
        doc.setFontSize(8);
        doc.setTextColor(210, 210, 210);
        doc.text(
          recipes.length + ' recetas · Ingredientes y pesos para cocina',
          M + 12,
          28
        );
        doc.text(
          new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }),
          pageW - M,
          28,
          { align: 'right' }
        );
        y = 42;
      }
    }

    function drawSection(label, emoji) {
      ensure(14);
      y += 2;
      pdfDrawEmoji(doc, emoji, M, y, 4.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, gold);
      doc.text(String(label).toUpperCase(), M + 6, y);
      y += 5;
    }

    function drawRecipeBlock(rec, withTitle) {
      if (withTitle) {
        var titleMaxW = W - 12;
        var nameLines = doc.splitTextToSize(rec.nombre, titleMaxW);
        var bits = [rec.workflowLabel];
        if (rec.porciones > 1) bits.push(rec.porciones + ' porciones');
        if (rec.categoria) bits.push(rec.categoria);
        var metaLines = doc.splitTextToSize(bits.join('  ·  '), titleMaxW);
        var titleH = 8 + nameLines.length * 5 + metaLines.length * 4 + 4;
        ensure(titleH);
        y += 2;
        pdfDrawEmoji(doc, rec.emoji, M, y + 2, 7);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor.apply(doc, charcoal);
        for (var ni = 0; ni < nameLines.length; ni++) {
          doc.text(nameLines[ni], M + 9, y + 4 + ni * 5);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, muted);
        var metaY = y + 4 + nameLines.length * 5 + 2;
        for (var mi = 0; mi < metaLines.length; mi++) {
          doc.text(metaLines[mi], M + 9, metaY + mi * 4);
        }
        y += titleH;
      }

      rec.lineas.forEach(function (ln) {
        var nameX = M + 15;
        var qtyW = 44;
        var nameMaxW = W - (nameX - M) - qtyW - 4;
        var ingLines = doc.splitTextToSize(String(ln.nombre || ''), nameMaxW);
        var qtyLines = doc.splitTextToSize(String(ln.display || ''), qtyW - 4);
        var lineH = 4.2;
        var padTop = 4.5;
        var nameBlockH = ingLines.length * lineH;
        var qtyBlockH = qtyLines.length * lineH;
        var hintH = ln.hint ? 3.8 : 0;
        var contentH = Math.max(nameBlockH + hintH, qtyBlockH);
        var rowH = Math.max(9.5, padTop + contentH + 3);
        ensure(rowH + 3);
        var rowY = y;

        doc.setFillColor.apply(doc, cream);
        doc.setDrawColor(237, 232, 224);
        doc.setLineWidth(0.12);
        doc.roundedRect(M, rowY, W, rowH, 1.8, 1.8, 'FD');

        var badgeY = rowY + padTop + lineH * 0.85;
        pdfDrawNumBadge(doc, M + 5.5, badgeY, ln.idx, gold);
        pdfDrawEmoji(doc, ln.emoji || '🥄', M + 10, badgeY, 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor.apply(doc, charcoal);
        for (var li = 0; li < ingLines.length; li++) {
          doc.text(ingLines[li], nameX, rowY + padTop + lineH * (li + 1));
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(single ? 11 : 10);
        doc.setTextColor.apply(doc, gold);
        for (var qi = 0; qi < qtyLines.length; qi++) {
          doc.text(qtyLines[qi], M + W - 4, rowY + padTop + lineH * (qi + 1), { align: 'right' });
        }
        if (qtyLines.length > 1) doc.setFontSize(8);

        if (ln.hint) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor.apply(doc, muted);
          doc.text(String(ln.hint), nameX, rowY + padTop + nameBlockH + 2.5);
        }

        y = rowY + rowH + 2.5;
      });

      y += 4;
      doc.setDrawColor.apply(doc, gold);
      doc.setLineWidth(0.15);
      doc.line(M + 6, y, M + W - 6, y);
      y += 8;
    }

    drawCover();

    if (single) {
      drawRecipeBlock(recipes[0], false);
    } else {
      groupRecipesForPdf(recipes).forEach(function (group) {
        drawSection(group.label, group.emoji);
        group.items.forEach(function (rec) {
          drawRecipeBlock(rec, true);
        });
        y += 2;
      });
    }

    drawFooters();
    return doc;
  }

  function finishPdfExport(result) {
    var path = tauriSavedPath(result) || (result && result.savedPath) || '';
    if (result && result.ok && path) {
      toast(result.hint || 'PDF guardado en Descargas:\n' + path, 'success');
      openSavedPdfPath(path);
      return;
    }
    if (result && result.ok) {
      toast(result.hint || 'PDF generado — revise Descargas', 'success');
      return;
    }
    if (result && result.blockedPopup) {
      toast('Permita ventanas emergentes o revise la carpeta Descargas.', 'warning');
      return;
    }
    var msg =
      (result && result.error && (result.error.message || String(result.error))) ||
      'No se pudo guardar el PDF en Descargas';
    toast(msg, 'error');
  }

  function exportPdf(recipes) {
    if (!recipes || !recipes.length) {
      toast('No hay recetas para exportar', 'warning');
      return;
    }
    var stamp = fileStamp();
    var filename =
      recipes.length === 1
        ? 'receta_' + safeFilename(recipes[0].slug || recipes[0].nombre) + '_' + stamp + '.pdf'
        : 'recetario_cocina_' + safeFilename(empresaNombre()) + '_' + stamp + '.pdf';

    toast('Generando PDF…', 'info');

    var timeoutMs = 60000;
    var timeoutPromise = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Tiempo agotado al generar el PDF (' + Math.round(timeoutMs / 1000) + ' s)'));
      }, timeoutMs);
    });

    function exportRecetarioPdf() {
      return loadJsPdf().then(function (jsPDF) {
        return loadRecetarioBrandForPdf().then(function (brandMeta) {
          var doc;
          try {
            doc = buildKitchenPdf(jsPDF, recipes, brandMeta);
          } catch (buildErr) {
            throw new Error('Error al armar el PDF: ' + (buildErr.message || buildErr));
          }
          return savePdfDoc(doc, filename);
        });
      });
    }

    Promise.race([exportRecetarioPdf(), timeoutPromise])
      .catch(function (e) {
        console.warn('[recetario-pdf] reintento', e);
        return exportRecetarioPdf();
      })
      .then(finishPdfExport)
      .catch(function (e) {
        console.error('[recetario-pdf]', e);
        finishPdfExport({ ok: false, error: e instanceof Error ? e : new Error(String(e)) });
      });
  }

  function resolveHost(host) {
    if (!host) return document.getElementById('crozzo-recetario-cocina');
    if (host.id === 'crozzo-recetario-cocina') return host;
    return host.querySelector('#crozzo-recetario-cocina') || host;
  }

  function render(opts) {
    opts = opts || {};
    injectStyles();
    state.filter = '';
    state.group = 'all';
    state.selected = opts.slug || null;
    var all = listKitchenRecipes();
    if (!state.selected && all.length) state.selected = all[0].slug;

    return (
      '<div class="crc crozzo-recetario-host" id="crozzo-recetario-cocina">' +
      '<header class="crc__hero">' +
      heroDecoSvg() +
      '<div class="crc__hero-grid">' +
      '<div>' +
      '<p class="crc__eyebrow">' +
      icon('book-open') +
      ' Recetario · cocina</p>' +
      '<h2 class="crc__title">Sus recetas, claras y listas</h2>' +
      '<p class="crc__sub">Ingredientes y pesos en letra grande — pensado para el equipo de cocina. Se actualiza solo desde Costos.</p>' +
      '</div>' +
      '<div class="crc__hero-actions">' +
      '<button type="button" class="btn btn-primary" id="crc-pdf-all">' +
      icon('download') +
      ' Descargar recetario PDF</button>' +
      '</div></div></header>' +
      '<div class="crc__toolbar">' +
      '<div class="crc__search-wrap">' +
      icon('search') +
      '<input type="search" id="crc-search" class="form-input crc__search" placeholder="Buscar plato o salsa…" autocomplete="off" aria-label="Buscar receta">' +
      '</div></div>' +
      renderInner() +
      '</div>'
    );
  }

  function init(host, opts) {
    host = resolveHost(host);
    state.host = host || null;
    bindToolbar(host);
    bindCards(host);
    bindTabs(host);
    bindInlinePdf(host);
    if (!host._crcChangeBound) {
      host._crcChangeBound = true;
      var refresh = function () {
        refreshList(host);
      };
      document.addEventListener('crozzo-catalogo-mp:changed', refresh);
      document.addEventListener('crozzo-costos:receta-actualizada', refresh);
    }
    refreshIcons(host);
  }

  global.CrozzoRecetarioCocina = {
    render: render,
    init: init,
    listKitchenRecipes: listKitchenRecipes,
    exportPdf: exportPdf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
