/**
 * Delegación de clics/formularios sin onclick inline (CSP Tauri bloquea handlers en HTML).
 * Uso: data-crozzo-act="nombreFuncion" [data-crozzo-args="arg1|arg2"]
 *      data-crozzo-backdrop="nombreFuncion" en overlay (cierra al clic fuera)
 *      data-crozzo-submit="nombreFuncion" en <form>
 *      data-crozzo-enter="nombreFuncion" en <input> (Enter)
 */
(function (global) {
  'use strict';

  function parseArg(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    var s = String(raw);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if ((s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') || (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']')) {
      try {
        return JSON.parse(s);
      } catch (_) {}
    }
    return s;
  }

  function crozzoInvokeDomAct(act, el) {
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
      fn.call(global);
    }
    return true;
  }

  function onClick(e) {
    var actEl = e.target && e.target.closest ? e.target.closest('[data-crozzo-act]') : null;
    if (actEl) {
      e.preventDefault();
      if (!crozzoInvokeDomAct(actEl.getAttribute('data-crozzo-act'), actEl)) {
        try {
          console.warn('[crozzo-csp] acción no disponible:', actEl.getAttribute('data-crozzo-act'));
        } catch (_) {}
      }
      return;
    }
    var backdrop = e.target && e.target.closest ? e.target.closest('[data-crozzo-backdrop]') : null;
    if (backdrop && e.target === backdrop) {
      crozzoInvokeDomAct(backdrop.getAttribute('data-crozzo-backdrop'), backdrop);
    }
  }

  function onSubmit(e) {
    var form = e.target && e.target.closest ? e.target.closest('[data-crozzo-submit]') : null;
    if (!form) return;
    e.preventDefault();
    crozzoInvokeDomAct(form.getAttribute('data-crozzo-submit'), form);
  }

  function onKeydown(e) {
    if (e.key !== 'Enter') return;
    var inp = e.target && e.target.closest ? e.target.closest('[data-crozzo-enter]') : null;
    if (!inp) return;
    e.preventDefault();
    crozzoInvokeDomAct(inp.getAttribute('data-crozzo-enter'), inp);
  }

  function boot() {
    if (document._crozzoCspDomWire) return;
    document._crozzoCspDomWire = true;
    document.addEventListener('click', onClick, false);
    document.addEventListener('submit', onSubmit, false);
    document.addEventListener('keydown', onKeydown, false);
  }

  global.crozzoInvokeDomAct = crozzoInvokeDomAct;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
