/**
 * CSP Tauri: sin onclick/onchange inline (bloqueados por script-src con hashes).
 * 1) data-crozzo-act / data-crozzo-submit / data-crozzo-enter (declarativo)
 * 2) Migración automática: convierte onclick|onchange|oninput|onsubmit → addEventListener
 */
(function (global) {
  'use strict';

  var ATTRS = [
    { attr: 'onclick', evt: 'click' },
    { attr: 'onchange', evt: 'change' },
    { attr: 'oninput', evt: 'input' },
    { attr: 'onsubmit', evt: 'submit' },
  ];

  function parseArg(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    var s = String(raw).trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (
      (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') ||
      (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']')
    ) {
      try {
        return JSON.parse(s);
      } catch (_) {}
    }
    if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') || (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
      return s.slice(1, -1);
    }
    return s;
  }

  function splitTopLevelCommas(s) {
    var parts = [];
    var depth = 0;
    var quote = null;
    var cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (quote) {
        cur += c;
        if (c === quote && s[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        cur += c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function resolveFn(path) {
    if (!path) return null;
    var parts = String(path).split('.');
    var o = global;
    for (var i = 0; i < parts.length; i++) {
      if (o == null) return null;
      o = o[parts[i]];
    }
    return typeof o === 'function' ? o : null;
  }

  function evalArg(expr, el, event) {
    var s = String(expr || '').trim();
    if (!s) return undefined;
    if (s === 'this') return el;
    if (s === 'this.checked') return el ? !!el.checked : false;
    if (s === 'this.value') return el ? el.value : '';
    if (s === 'event') return event;
    if (s === 'event.stopPropagation()') {
      if (event && event.stopPropagation) event.stopPropagation();
      return undefined;
    }
    return parseArg(s);
  }

  function runStatement(stmt, el, event) {
    var s = String(stmt || '').trim();
    if (!s) return;
    if (s === 'return false') return false;
    if (s === 'return true') return true;
    if (s.indexOf('event.stopPropagation') >= 0) {
      if (event && event.stopPropagation) event.stopPropagation();
      s = s.replace(/event\.stopPropagation\(\)\s*;?/g, '').trim();
      if (!s) return;
    }
    if (s === 'location.reload()' || s === 'window.location.reload()') {
      global.location.reload();
      return;
    }
    var ifM = s.match(
      /^if\s*\(\s*typeof\s+([a-zA-Z_$][\w$]*)\s*===?\s*['"]function['"]\s*\)\s*([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*;?$/
    );
    if (ifM && typeof global[ifM[1]] === 'function') {
      global[ifM[1]]();
      return;
    }
    var andM = s.match(/^typeof\s+([a-zA-Z_$][\w$]*)\s*===?\s*['"]function['"]\s*&&\s*\1\s*\(\s*\)\s*;?$/);
    if (andM && typeof global[andM[1]] === 'function') {
      global[andM[1]]();
      return;
    }
    var callM = s.match(/^([a-zA-Z_$][\w$.]*)\s*\((.*)\)\s*;?$/s);
    if (!callM) return;
    var fn = resolveFn(callM[1]);
    if (!fn) {
      try {
        console.warn('[crozzo-csp] función no disponible:', callM[1]);
      } catch (_) {}
      return;
    }
    var argsStr = String(callM[2] || '').trim();
    var args = [];
    if (argsStr) {
      var rawArgs = splitTopLevelCommas(argsStr);
      for (var i = 0; i < rawArgs.length; i++) args.push(evalArg(rawArgs[i], el, event));
    }
    return fn.apply(global, args);
  }

  function runInlineHandler(code, el, event) {
    if (!code) return;
    var statements = String(code).split(';');
    for (var i = 0; i < statements.length; i++) {
      var r = runStatement(statements[i], el, event);
      if (r === false) {
        if (event && event.preventDefault) event.preventDefault();
        return false;
      }
    }
  }

  function crozzoInvokeDomAct(act, el, event) {
    if (!act) return false;
    var fn = global[act];
    if (typeof fn !== 'function') return false;
    var argsRaw = el && el.getAttribute ? el.getAttribute('data-crozzo-args') : null;
    if (argsRaw) {
      var parts = String(argsRaw).split('|');
      var args = [];
      for (var i = 0; i < parts.length; i++) args.push(parseArg(parts[i]));
      fn.apply(global, args);
    } else {
      fn.call(global, el, event);
    }
    return true;
  }

  function wireInlineAttr(el, spec) {
    if (!el || el.nodeType !== 1) return;
    var flag = 'data-crozzo-wired-' + spec.evt;
    if (el.hasAttribute(flag)) return;
    var code = el.getAttribute(spec.attr);
    if (!code) return;
    el.removeAttribute(spec.attr);
    el.setAttribute(flag, '1');
    el.addEventListener(
      spec.evt,
      function (e) {
        if (spec.evt === 'submit') e.preventDefault();
        runInlineHandler(code, el, e);
      },
      false
    );
  }

  function wireElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute && el.hasAttribute('data-crozzo-act')) return;
    for (var i = 0; i < ATTRS.length; i++) {
      if (el.hasAttribute && el.hasAttribute(ATTRS[i].attr)) wireInlineAttr(el, ATTRS[i]);
    }
  }

  function wireTree(root) {
    if (!root) return;
    if (root.nodeType === 1) wireElement(root);
    if (!root.querySelectorAll) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var nodes = root.querySelectorAll('[' + ATTRS[i].attr + ']');
      for (var j = 0; j < nodes.length; j++) wireInlineAttr(nodes[j], ATTRS[i]);
    }
  }

  function onClick(e) {
    var actEl = e.target && e.target.closest ? e.target.closest('[data-crozzo-act]') : null;
    if (actEl) {
      e.preventDefault();
      if (!crozzoInvokeDomAct(actEl.getAttribute('data-crozzo-act'), actEl, e)) {
        try {
          console.warn('[crozzo-csp] acción no disponible:', actEl.getAttribute('data-crozzo-act'));
        } catch (_) {}
      }
      return;
    }
    var backdrop = e.target && e.target.closest ? e.target.closest('[data-crozzo-backdrop]') : null;
    if (backdrop && e.target === backdrop) {
      crozzoInvokeDomAct(backdrop.getAttribute('data-crozzo-backdrop'), backdrop, e);
    }
  }

  function onSubmit(e) {
    var form = e.target && e.target.closest ? e.target.closest('[data-crozzo-submit]') : null;
    if (!form) return;
    e.preventDefault();
    crozzoInvokeDomAct(form.getAttribute('data-crozzo-submit'), form, e);
  }

  function onKeydown(e) {
    if (e.key !== 'Enter') return;
    var inp = e.target && e.target.closest ? e.target.closest('[data-crozzo-enter]') : null;
    if (!inp) return;
    e.preventDefault();
    crozzoInvokeDomAct(inp.getAttribute('data-crozzo-enter'), inp, e);
  }

  var _obs = null;
  var _wireQueued = false;
  var _pendingRoots = [];

  function flushWireQueue() {
    _wireQueued = false;
    var roots = _pendingRoots.slice();
    _pendingRoots.length = 0;
    for (var i = 0; i < roots.length; i++) wireTree(roots[i]);
  }

  function queueWire(root) {
    if (root) _pendingRoots.push(root);
    if (_wireQueued) return;
    _wireQueued = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushWireQueue);
    else setTimeout(flushWireQueue, 0);
  }

  function boot() {
    if (document._crozzoCspDomWire) return;
    document._crozzoCspDomWire = true;
    document.addEventListener('click', onClick, false);
    document.addEventListener('submit', onSubmit, false);
    document.addEventListener('keydown', onKeydown, false);
    wireTree(document.documentElement);
    if (typeof MutationObserver === 'function' && document.documentElement) {
      _obs = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n && n.nodeType === 1) queueWire(n);
          }
        }
      });
      _obs.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  global.crozzoInvokeDomAct = crozzoInvokeDomAct;
  global.crozzoCspWireTree = wireTree;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
