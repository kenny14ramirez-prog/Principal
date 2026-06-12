/**
 * Consola técnica embebida — respaldo cuando DevTools nativo (F12) no abre.
 */
(function (global) {
  'use strict';

  var MAX_LINES = 500;
  var buf = [];
  var panel = null;
  var logEl = null;
  var open = false;
  var hooked = false;

  function formatArg(a) {
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || a.message || String(a);
    try {
      return JSON.stringify(a);
    } catch (_) {
      return String(a);
    }
  }

  function formatArgs(args) {
    return Array.prototype.map.call(args, formatArg).join(' ');
  }

  function pushLine(level, args) {
    buf.push({
      t: Date.now(),
      level: level,
      text: formatArgs(args),
    });
    if (buf.length > MAX_LINES) buf.splice(0, buf.length - MAX_LINES);
    if (open) render();
  }

  function hookConsole() {
    if (hooked) return;
    hooked = true;
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
      var orig = console[lvl];
      if (typeof orig !== 'function') return;
      console[lvl] = function crozzoTechConsoleWrap() {
        pushLine(lvl, arguments);
        return orig.apply(console, arguments);
      };
    });
    global.addEventListener('error', function (ev) {
      var msg = ev && ev.message ? ev.message : 'Error';
      if (ev && ev.filename) msg += ' · ' + String(ev.filename).split('/').pop();
      pushLine('error', [msg]);
    });
    global.addEventListener('unhandledrejection', function (ev) {
      var r = ev && ev.reason;
      pushLine('error', [r && r.message ? r.message : String(r || 'Promesa rechazada')]);
    });
  }

  function render() {
    if (!logEl) return;
    logEl.textContent = buf
      .map(function (line) {
        var ts = new Date(line.t).toLocaleTimeString('es-CO', { hour12: false });
        return '[' + ts + '] ' + line.level.toUpperCase() + ' ' + line.text;
      })
      .join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'crozzoTechConsole';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Consola técnica Crozzo');
    panel.innerHTML =
      '<header class="crozzo-tech-console__head">' +
      '<strong>Consola técnica</strong>' +
      '<span class="crozzo-tech-console__hint">F12 · Ctrl+Shift+I</span>' +
      '<button type="button" class="crozzo-tech-console__btn" data-act="clear">Limpiar</button>' +
      '<button type="button" class="crozzo-tech-console__btn" data-act="close">Cerrar</button>' +
      '</header>' +
      '<pre class="crozzo-tech-console__log" id="crozzoTechConsoleLog"></pre>';
    panel.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'clear') {
        buf.length = 0;
        render();
      } else if (act === 'close') {
        crozzoCloseTechConsole();
      }
    });
    document.body.appendChild(panel);
    logEl = document.getElementById('crozzoTechConsoleLog');
    return panel;
  }

  function crozzoOpenTechConsole() {
    hookConsole();
    ensurePanel();
    open = true;
    panel.removeAttribute('hidden');
    document.documentElement.classList.add('crozzo-tech-console-open');
    render();
  }

  function crozzoCloseTechConsole() {
    open = false;
    if (panel) panel.setAttribute('hidden', '');
    document.documentElement.classList.remove('crozzo-tech-console-open');
  }

  function crozzoToggleTechConsole() {
    if (open) crozzoCloseTechConsole();
    else crozzoOpenTechConsole();
  }

  global.crozzoOpenTechConsole = crozzoOpenTechConsole;
  global.crozzoCloseTechConsole = crozzoCloseTechConsole;
  global.crozzoToggleTechConsole = crozzoToggleTechConsole;
})(typeof window !== 'undefined' ? window : globalThis);
