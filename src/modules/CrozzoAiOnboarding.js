/**
 * Crozzo AI Onboarding - tour de 3 pasos (una sola vez por usuario).
 */
(function (global) {
  'use strict';

  var KEY_PREFIX = 'crozzo_ai_onboarding_done_';
  var MODAL_ID = 'crozzo-ai-onboarding-modal';

  function currentUserKey() {
    var u = null;
    try { if (typeof global.getCurrentUser === 'function') u = global.getCurrentUser(); } catch (_) {}
    var id = (u && (u.id || u.nombre || u.name)) ? String(u.id || u.nombre || u.name) : 'anon';
    return KEY_PREFIX + id;
  }

  function isDone() {
    try { return global.localStorage && global.localStorage.getItem(currentUserKey()) === '1'; } catch (_) { return false; }
  }
  function markDone() {
    try { if (global.localStorage) global.localStorage.setItem(currentUserKey(), '1'); } catch (_) {}
  }

  var STEPS = [
    { title: '¿Qué es el Asistente IA?', body: 'Un ayudante local (sin internet) para consultar el POS, documentos y acciones rápidas. Funciona en su equipo.' },
    { title: 'Cómo abrirlo', body: 'Use el botón 🤖 (esquina inferior) o Ctrl+K. Escriba o dicte su consulta. El panel es lateral y no bloquea la venta.' },
    { title: 'Límites', body: 'Requiere modelo local descargado. En equipos de bajo rendimiento se deshabilita. No reemplaza la validación fiscal; confirme siempre.' }
  ];

  var _step = 0;
  function renderStep() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    var s = STEPS[_step] || STEPS[0];
    var title = modal.querySelector('.crozzo-ai-onb-title');
    var body = modal.querySelector('.crozzo-ai-onb-body');
    var prog = modal.querySelector('.crozzo-ai-onb-progress');
    if (title) title.textContent = s.title;
    if (body) body.textContent = s.body;
    if (prog) prog.textContent = 'Paso ' + (_step + 1) + ' de ' + STEPS.length;
    var back = modal.querySelector('.crozzo-ai-onb-back');
    var next = modal.querySelector('.crozzo-ai-onb-next');
    if (back) back.disabled = _step === 0;
    if (next) next.textContent = _step === STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
  }

  function close() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
  }

  function show() {
    if (document.getElementById(MODAL_ID)) return;
    var ov = document.createElement('div');
    ov.id = MODAL_ID;
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    ov.innerHTML =
      '<div style="background:#fff;max-width:420px;width:90%;border-radius:14px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<h3 class="crozzo-ai-onb-title" style="margin:0 0 10px;color:#1a1a2e;"></h3>' +
        '<p class="crozzo-ai-onb-body" style="margin:0 0 14px;color:#444;font-size:0.95rem;line-height:1.5;"></p>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<span class="crozzo-ai-onb-progress" style="font-size:0.8rem;color:#888;"></span>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="crozzo-ai-onb-back" style="padding:8px 14px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;">Atrás</button>' +
            '<button type="button" class="crozzo-ai-onb-next" style="padding:8px 14px;border:none;border-radius:8px;background:#B59A6D;color:#fff;cursor:pointer;font-weight:600;">Siguiente</button>' +
            '<button type="button" class="crozzo-ai-onb-skip" style="padding:8px 14px;border:none;border-radius:8px;background:#eee;color:#333;cursor:pointer;">Saltar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    _step = 0;
    renderStep();
    ov.querySelector('.crozzo-ai-onb-back').onclick = function () { if (_step > 0) { _step--; renderStep(); } };
    ov.querySelector('.crozzo-ai-onb-next').onclick = function () {
      if (_step < STEPS.length - 1) { _step++; renderStep(); }
      else { markDone(); close(); }
    };
    ov.querySelector('.crozzo-ai-onb-skip').onclick = function () { markDone(); close(); };
  }

  function showIfNeeded() {
    if (isDone()) return;
    // solo roles permitidos
    try {
      if (global.CrozzoAiAssistant && typeof global.CrozzoAiAssistant.isAllowedRole === 'function') {
        if (!global.CrozzoAiAssistant.isAllowedRole()) return;
      }
    } catch (_) {}
    setTimeout(show, 1200);
  }

  global.CrozzoAiOnboarding = { show: show, showIfNeeded: showIfNeeded, isDone: isDone, markDone: markDone };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(showIfNeeded, 500); }, { once: true });
    } else {
      setTimeout(showIfNeeded, 500);
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);