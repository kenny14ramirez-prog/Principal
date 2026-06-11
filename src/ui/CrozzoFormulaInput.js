/**
 * Crozzo POS — Campos numéricos con fórmulas (2+2, 100*0.19, (10+5)/3).
 * Al salir del campo: evalúa y muestra el resultado. Al hacer clic: muestra la fórmula.
 */
(function (global) {
  'use strict';

  var SKIP_TYPES = {
    date: 1,
    time: 1,
    'datetime-local': 1,
    month: 1,
    week: 1,
    tel: 1,
    email: 1,
    password: 1,
    search: 1,
    url: 1,
    color: 1,
    file: 1,
    hidden: 1,
    checkbox: 1,
    radio: 1,
    range: 1,
    button: 1,
    submit: 1,
    reset: 1,
  };

  function normalizeExpr(raw) {
    return String(raw == null ? '' : raw)
      .trim()
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/(\d)x(\d)/gi, '$1*$2');
  }

  function parseExpression(s) {
    var i = 0;

    function peek() {
      return s.charAt(i);
    }
    function consume() {
      return s.charAt(i++);
    }

    function parseExpr() {
      var left = parseTerm();
      while (peek() === '+' || peek() === '-') {
        var op = consume();
        var right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }

    function parseTerm() {
      var left = parseFactor();
      while (peek() === '*' || peek() === '/') {
        var op = consume();
        var right = parseFactor();
        if (op === '/' && Math.abs(right) < 1e-12) throw new Error('División por cero');
        left = op === '*' ? left * right : left / right;
      }
      return left;
    }

    function parseFactor() {
      if (peek() === '-') {
        consume();
        return -parseFactor();
      }
      if (peek() === '+') {
        consume();
        return parseFactor();
      }
      if (peek() === '(') {
        consume();
        var v = parseExpr();
        if (peek() !== ')') throw new Error('Paréntesis sin cerrar');
        consume();
        return v;
      }
      return parseNumber();
    }

    function parseNumber() {
      var start = i;
      while (/[\d.]/.test(peek())) consume();
      if (start === i) throw new Error('Número esperado');
      var n = parseFloat(s.slice(start, i));
      if (!isFinite(n)) throw new Error('Número inválido');
      return n;
    }

    var out = parseExpr();
    if (i < s.length) throw new Error('Fórmula incompleta');
    return out;
  }

  function looksLikeFormula(expr) {
    return /[+\-*/()]/.test(expr) && /\d/.test(expr);
  }

  function formatDisplay(n) {
    if (n == null || !isFinite(n)) return '';
    var r = Math.round(n * 1e10) / 1e10;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return String(r);
  }

  function evaluate(raw) {
    var expr = normalizeExpr(raw);
    if (!expr) return { ok: true, value: null, isPlain: true, formula: '' };
    if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
      return { ok: true, value: parseFloat(expr), isPlain: !looksLikeFormula(expr), formula: null };
    }
    if (!/^[\d+\-*/().]+$/.test(expr)) {
      return { ok: false, error: 'Use números y + − × ÷ ( )' };
    }
    try {
      var val = parseExpression(expr);
      if (!isFinite(val)) return { ok: false, error: 'Resultado no válido' };
      return { ok: true, value: val, isPlain: false, formula: expr };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Fórmula inválida' };
    }
  }

  function isEligible(el) {
    if (!el || el.tagName !== 'INPUT' || el.dataset.crozzoFormulaBound === '1') return false;
    if (el.readOnly || el.disabled) return false;
    if (el.dataset.noFormula === '1' || el.dataset.crozzoNoFormula === '1') return false;
    if (el.closest('[data-crozzo-no-formula]')) return false;
    var t = String(el.type || 'text').toLowerCase();
    if (SKIP_TYPES[t]) return false;
    if (t === 'number') return true;
    if (el.classList.contains('crozzo-formula-field') || el.classList.contains('crozzo-formula-input')) return true;
    if (el.dataset.crozzoFormulaField === '1') return true;
    if ((t === 'text' || t === '') && (el.inputMode === 'decimal' || el.inputMode === 'numeric')) {
      if (el.getAttribute('step') != null || el.getAttribute('min') != null || el.getAttribute('max') != null) return true;
    }
    return false;
  }

  function isActive(el) {
    return el && el.classList && el.classList.contains('crozzo-formula-field');
  }

  function enhance(el) {
    if (!isEligible(el)) return;
    el.dataset.crozzoFormulaBound = '1';
    el.dataset.crozzoOrigType = el.type || 'text';
    if (String(el.type).toLowerCase() === 'number') {
      el.type = 'text';
      if (!el.inputMode) el.setAttribute('inputmode', 'decimal');
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('spellcheck', 'false');
    }
    el.classList.add('crozzo-formula-field');
    if (el.value && el.dataset.crozzoFormula) {
      var res = evaluate(el.dataset.crozzoFormula);
      if (res.ok && res.value != null) el.value = formatDisplay(res.value);
    }
  }

  function scanRoot(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.tagName === 'INPUT' && isEligible(root)) enhance(root);
    root.querySelectorAll('input').forEach(enhance);
  }

  function commitField(el, silent) {
    if (!isActive(el)) return { ok: true, value: null };
    var raw = String(el.value || '').trim();
    el.classList.remove('is-formula-edit');
    if (!raw) {
      delete el.dataset.crozzoFormula;
      el.classList.remove('has-formula', 'is-formula-error');
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      return { ok: true, value: null };
    }
    var res = evaluate(raw);
    if (!res.ok) {
      el.classList.add('is-formula-error');
      el.title = res.error || 'Fórmula inválida';
      return res;
    }
    el.classList.remove('is-formula-error');
    if (res.isPlain || !looksLikeFormula(raw)) {
      delete el.dataset.crozzoFormula;
      el.classList.remove('has-formula');
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      if (res.value != null) el.value = formatDisplay(res.value);
    } else {
      el.dataset.crozzoFormula = raw;
      el.classList.add('has-formula');
      el.title = 'Fórmula: ' + raw + ' — clic para editar';
      el.setAttribute('aria-label', 'Resultado ' + formatDisplay(res.value) + ', fórmula ' + raw);
      el.value = formatDisplay(res.value);
    }
    if (!silent) {
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    }
    return res;
  }

  function onFocusIn(ev) {
    var el = ev.target;
    if (!isActive(el)) return;
    var formula = el.dataset.crozzoFormula;
    if (formula) {
      el.value = formula;
      el.classList.add('is-formula-edit');
      el.classList.remove('is-formula-error');
      try {
        el.select();
      } catch (_) {}
    }
  }

  function onFocusOut(ev) {
    var el = ev.target;
    if (!isActive(el)) return;
    commitField(el, false);
  }

  function onKeyDown(ev) {
    var el = ev.target;
    if (!isActive(el)) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitField(el, false);
      el.blur();
    }
    if (ev.key === 'Escape' && el.dataset.crozzoFormula) {
      el.value = formatDisplay(evaluate(el.dataset.crozzoFormula).value);
      el.classList.remove('is-formula-edit', 'is-formula-error');
      el.blur();
    }
  }

  function onPointerDown(ev) {
    var active = document.activeElement;
    if (!active || !isActive(active) || !active.classList.contains('is-formula-edit')) return;
    if (ev.target === active || (active.contains && active.contains(ev.target))) return;
    commitField(active, false);
  }

  function injectStyles() {
    if (document.getElementById('crozzo-formula-input-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-formula-input-css';
    el.textContent =
      '.crozzo-formula-field.has-formula:not(:focus){background-image:linear-gradient(135deg,color-mix(in srgb,var(--accent,#2563eb) 10%,transparent) 0,transparent 42%);background-repeat:no-repeat}' +
      '.crozzo-formula-field.is-formula-edit{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.02em}' +
      '.crozzo-formula-field.is-formula-error{border-color:var(--danger,#dc2626)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--danger,#dc2626) 25%,transparent)}' +
      '.crozzo-formula-field.has-formula:not(:focus):not(.is-formula-error){cursor:text}';
    document.head.appendChild(el);
  }

  function resolve(el, def) {
    if (def == null) def = 0;
    if (!el) return def;
    if (isActive(el)) {
      var live = evaluate(String(el.value || '').trim());
      if (live.ok && live.value != null) return live.value;
    }
    var n = Number(String(el.value || '').replace(/,/g, '.'));
    return isFinite(n) ? n : def;
  }

  function resolveRaw(raw, def) {
    if (def == null) def = 0;
    var res = evaluate(raw);
    if (res.ok && res.value != null) return res.value;
    var n = Number(String(raw || '').replace(/,/g, '.'));
    return isFinite(n) ? n : def;
  }

  function init() {
    if (global.__crozzoFormulaInputInit) return;
    global.__crozzoFormulaInputInit = true;
    injectStyles();
    scanRoot(document);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener(
      'submit',
      function () {
        document.querySelectorAll('.crozzo-formula-field.is-formula-edit').forEach(function (el) {
          commitField(el, false);
        });
      },
      true
    );
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          for (var i = 0; i < m.addedNodes.length; i++) {
            var node = m.addedNodes[i];
            if (node.nodeType !== 1) continue;
            scanRoot(node);
          }
        });
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  global.CrozzoFormulaInput = {
    init: init,
    bind: scanRoot,
    evaluate: evaluate,
    resolve: resolve,
    resolveRaw: resolveRaw,
    format: formatDisplay,
    commit: commitField,
  };
  global.crozzoResolveNum = resolve;
  global.crozzoEvaluateExpr = function (raw) {
    var r = evaluate(raw);
    return r.ok ? r.value : null;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
