/**
 * Bona Origen — Asistente IA conversacional (side panel, no bloqueante).
 * Chat local contra Ollama/llama.cpp sidecar con RAG (FTS5), voz, acciones.
 * Panel lateral derecho que no bloquea el POS.
 */
(function (global) {
  'use strict';

  var PANEL_ID = 'crozzo-ai-assistant-panel';
  var _history = [];
  var _abort = null;
  var _pulling = false;
  var _sending = false;

  function ollamaUrl() { return (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434'; }
  function ollamaModel() { return (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini'; }

  async function ollamaInvoke(method, args) {
    args = args || {};
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        return await global.__TAURI__.core.invoke(method, args);
      }
    } catch (_) {}
    return null;
  }

  async function ensureSidecar() {
    try {
      var r = await ollamaInvoke('crozzo_llama_ensure_sidecar');
      if (r === true) return true;
    } catch (_) {}
    return false;
  }

  async function ensureModelInBackground() {
    if (_pulling) return;
    var url = ollamaUrl();
    var model = ollamaModel();
    try {
      var r = await ollamaInvoke('crozzo_ollama_tags', { url: url, timeout_ms: 3000 });
      var exists = false;
      if (r) {
        try { var j = JSON.parse(r); exists = !!(j && Array.isArray(j.models) && j.models.some(function (m) { return (m.name || '').indexOf(model) === 0; })); } catch (_) {}
      } else {
        try { var resp = await fetch(url + '/api/tags'); if (resp.ok) { var j2 = await resp.json(); exists = !!(j2 && Array.isArray(j2.models) && j2.models.some(function (m) { return (m.name || '').indexOf(model) === 0; })); } } catch (_) {}
      }
      if (exists) return;
    } catch (_) {}
    _pulling = true;
    updateStatus('Descargando modelo ' + model + ' en segundo plano…');
    try {
      var resp2 = await fetch(url + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model, stream: true }) });
      if (!resp2.ok || !resp2.body) throw new Error('pull failed');
      var reader = resp2.body.getReader();
      var dec = new TextDecoder();
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        var txt = dec.decode(chunk.value, { stream: true });
        var lines = txt.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          try {
            var j3 = JSON.parse(line);
            if (j3 && j3.status) updateStatus('Modelo: ' + j3.status + (j3.completed && j3.total ? ' ' + Math.round((j3.completed / j3.total) * 100) + '%' : ''));
          } catch (_) {}
        }
      }
      updateStatus('Modelo ' + model + ' listo ✔');
    } catch (e) {
      updateStatus('No se pudo descargar. Instale Ollama (ollama.com) manualmente.');
    } finally {
      _pulling = false;
    }
  }

  function updateStatus(text) {
    var st = document.getElementById('crozzo-ai-status');
    if (st) st.textContent = text;
  }

  function ensurePanel() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.style.transform = 'translateX(0)';
      return existing;
    }
    document.body.classList.add('crozzo-ai-panel-open');
    var ov = document.createElement('div');
    ov.id = PANEL_ID;
    ov.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:9000;width:420px;max-width:90vw;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,0.15);display:flex;flex-direction:column;transform:translateX(100%);transition:transform 0.25s ease;';
    var card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    card.innerHTML =
      '<div style="padding:14px 18px;background:linear-gradient(135deg,#B59A6D,#7A6342);color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<strong>Asistente IA · Bona Origen</strong>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" id="crozzo-ai-voice" title="Voz" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;">🎤</button>' +
          '<button type="button" id="crozzo-ai-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;">×</button>' +
        '</div>' +
      '</div>' +
      '<div id="crozzo-ai-status" style="padding:6px 14px;font-size:0.75rem;color:#666;background:#f5f5f5;flex-shrink:0;">Estado: verificando modelo local…</div>' +
      '<div id="crozzo-ai-model-mgr" style="padding:4px 14px;border-bottom:1px solid #eee;flex-shrink:0;"></div>' +
      '<div id="crozzo-ai-messages" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;"></div>' +
      '<div style="padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;flex-shrink:0;">' +
        '<input id="crozzo-ai-input" type="text" placeholder="Escribe o dicta tu consulta…" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;">' +
        '<button type="button" id="crozzo-ai-send" style="padding:10px 16px;border:none;border-radius:8px;background:#B59A6D;color:#fff;cursor:pointer;font-weight:600;">Enviar</button>' +
      '</div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.style.transform = 'translateX(0)'; });
    document.getElementById('crozzo-ai-close').onclick = close;
    document.getElementById('crozzo-ai-send').onclick = send;
    var inp = document.getElementById('crozzo-ai-input');
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    var voiceBtn = document.getElementById('crozzo-ai-voice');
    if (voiceBtn) voiceBtn.onclick = startVoice;
    checkStatus();
    setTimeout(ensureModelInBackground, 100);
    try {
      if (global.CrozzoAiModelManager && typeof global.CrozzoAiModelManager.mount === 'function') {
        var mgrRoot = document.getElementById('crozzo-ai-model-mgr');
        if (mgrRoot) global.CrozzoAiModelManager.mount(mgrRoot);
      }
    } catch (_) {}
    if (global.CrozzoAiOnboarding && typeof global.CrozzoAiOnboarding.show === 'function') {
      setTimeout(function () { global.CrozzoAiOnboarding.show(); }, 500);
    }
    // Restore history
    if (global.CrozzoAiChatHistory && typeof global.CrozzoAiChatHistory.load === 'function') {
      try { var hist = global.CrozzoAiChatHistory.load(); if (hist && hist.length) _history = hist; } catch (_) {}
    }
    return ov;
  }

  function close() {
    document.body.classList.remove('crozzo-ai-panel-open');
    var ov = document.getElementById(PANEL_ID);
    if (ov) {
      ov.style.transform = 'translateX(100%)';
      setTimeout(function () { if (ov.parentNode) ov.remove(); }, 250);
    }
  }

  function addMessage(role, text) {
    var box = document.getElementById('crozzo-ai-messages');
    if (!box) return null;
    var div = document.createElement('div');
    div.style.cssText = role === 'user'
      ? 'align-self:flex-end;max-width:85%;background:#B59A6D;color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;font-size:0.9rem;white-space:pre-wrap;'
      : 'align-self:flex-start;max-width:85%;background:#f0ede6;color:#1a1a2e;padding:8px 12px;border-radius:12px 12px 12px 2px;font-size:0.9rem;white-space:pre-wrap;';
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  async function checkStatus() {
    var st = document.getElementById('crozzo-ai-status');
    if (!st) return;
    try {
      var h = await ollamaInvoke('crozzo_llama_health');
      if (h && h.ok) { st.textContent = 'Estado: modelo interno activo ✔'; return; }
    } catch (_) {}
    var url = ollamaUrl();
    try {
      var r = await ollamaInvoke('crozzo_ollama_tags', { url: url, timeout_ms: 3000 });
      if (r) {
        try { var j = JSON.parse(r); if (j && Array.isArray(j.models) && j.models.length > 0) { st.textContent = 'Estado: Ollama conectado ✔ (' + j.models.length + ' modelos)'; return; } } catch (_) {}
      }
      var resp = await fetch(url + '/api/tags', { method: 'GET' });
      if (resp.ok) {
        st.textContent = 'Estado: descargando modelo automáticamente…';
        autoPullOllamaModel(url);
        return;
      }
    } catch (_) {}
    st.textContent = 'Estado: instalando asistente IA automáticamente…';
    ensureSidecar().then(function (ok) {
      var st2 = document.getElementById('crozzo-ai-status');
      if (st2) st2.textContent = ok ? 'Estado: modelo interno activo ✔' : 'Estado: descargando modelo…';
    });
    ensureModelInBackground();
  }

  async function autoPullOllamaModel(url) {
    var model = ollamaModel();
    try {
      var resp = await fetch(url + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model, stream: true }) });
      if (!resp.ok || !resp.body) throw new Error('pull failed');
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        var txt = dec.decode(chunk.value, { stream: true });
        var lines = txt.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          try {
            var j = JSON.parse(line);
            if (j && j.status) updateStatus('Modelo: ' + j.status + (j.completed && j.total ? ' ' + Math.round((j.completed / j.total) * 100) + '%' : ''));
          } catch (_) {}
        }
      }
      updateStatus('Modelo ' + model + ' listo ✔');
      checkStatus();
    } catch (e) {
      updateStatus('No se pudo descargar. Instale Ollama (ollama.com) manualmente.');
    }
  }

  function systemContext() {
    var ctx = [];
    try {
      if (typeof global.currentPage !== 'undefined') ctx.push('Pantalla actual: ' + global.currentPage);
    } catch (_) {}
    try {
      if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u) ctx.push('Usuario: ' + (u.nombre || u.id || '') + ' (' + (u.rol || '') + ')');
      }
    } catch (_) {}
    try {
      if (typeof navigator !== 'undefined') ctx.push('Online: ' + navigator.onLine);
    } catch (_) {}
    return ctx.join(' | ');
  }

  async function send() {
    if (_sending) return;
    _sending = true;
    var inp = document.getElementById('crozzo-ai-input');
    if (!inp) { _sending = false; return; }
    var text = (inp.value || '').trim();
    if (!text) { _sending = false; return; }
    inp.value = '';
    addMessage('user', text);
    _history.push({ role: 'user', content: text });
    if (_history.length > 60) _history.splice(0, _history.length - 60);
    var assistantDiv = addMessage('assistant', '…');
    var full = '';
    try {
      // Direct action check
      try {
        if (global.CrozzoAiIntentParser && typeof global.CrozzoAiIntentParser.parse === 'function') {
          var userIntents = global.CrozzoAiIntentParser.parse(text).intents || [];
          if (userIntents.length > 0 && global.CrozzoAiActionRegistry && typeof global.CrozzoAiActionRegistry.execute === 'function') {
            assistantDiv.textContent = 'Ejecutando: ' + userIntents.join(', ') + '…';
            for (var ui = 0; ui < userIntents.length; ui++) {
              try {
                var res = await global.CrozzoAiActionRegistry.execute(userIntents[ui]);
                assistantDiv.textContent = 'Resultado: ' + (typeof res === 'string' ? res : (res && res.result) ? res.result : JSON.stringify(res));
              } catch (e) {
                assistantDiv.textContent = 'Error: ' + (e && e.message ? e.message : e);
              }
            }
            _history.push({ role: 'assistant', content: assistantDiv.textContent });
            _sending = false;
            return;
          }
        }
      } catch (_) {}

      // RAG retrieval
      var ragChunks = [];
      try {
        if (global.CrozzoRag && typeof global.CrozzoRag.search === 'function') {
          ragChunks = await global.CrozzoRag.search(text, 5);
        } else {
          var rr = await ollamaInvoke('crozzo_rag_fts_search', { query: text, k: 5 });
          if (rr) { try { var rj = JSON.parse(rr); ragChunks = (rj && rj.chunks) ? rj.chunks : []; } catch (_) {} }
        }
      } catch (_) {}
      var ragContext = '';
      var sourceList = [];
      if (ragChunks && ragChunks.length) {
        ragContext = '\nContexto relevante:\n' + ragChunks.map(function (c) { return '- ' + (c.text || c); }).join('\n');
        ragChunks.forEach(function (c) { if (c.source && sourceList.indexOf(c.source) === -1) sourceList.push(c.source); });
      }

      var prompt = 'Contexto del sistema POS: ' + systemContext() + ragContext + '\n' +
        _history.slice(-12).map(function (m) { return (m.role === 'user' ? 'Usuario: ' : 'Asistente: ') + m.content; }).join('\n') + '\nAsistente:';
      var full = '';
      try {
        var r0 = await ollamaInvoke('crozzo_llama_chat', { prompt: prompt, timeout_ms: 60000 });
        if (r0) { try { var j0 = JSON.parse(r0); full = (j0 && j0.choices && j0.choices[0] && j0.choices[0].message && j0.choices[0].message.content) ? j0.choices[0].message.content : (j0 && j0.response) ? j0.response : ''; } catch (_) { full = String(r0); } }
      } catch (_) {}
      if (!full) {
        var url = ollamaUrl();
        var model = ollamaModel();
        var r = await ollamaInvoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
        if (r) {
          try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); }
        } else {
          var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.4, num_predict: 512 } }) });
          if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
        }
      }
      if (!full) throw new Error('sin respuesta');
      var actionIds = [];
      try {
        if (global.CrozzoAiIntentParser && typeof global.CrozzoAiIntentParser.parse === 'function') {
          actionIds = (global.CrozzoAiIntentParser.parse(full).intents || []).slice();
        } else {
          var mm;
          var rre = /\[ACTION:([a-zA-Z0-9_\-]+)\]/g;
          while ((mm = rre.exec(full)) !== null) { if (actionIds.indexOf(mm[1]) === -1) actionIds.push(mm[1]); }
        }
      } catch (_) {}
      assistantDiv.textContent = full;
      if (sourceList.length) {
        var srcDiv = document.createElement('div');
        srcDiv.style.cssText = 'font-size:0.75rem;color:#888;margin-top:4px;';
        srcDiv.textContent = 'Fuentes: ' + sourceList.join(', ');
        assistantDiv.appendChild(srcDiv);
      }
      if (actionIds.length) {
        var btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;';
        actionIds.forEach(function (aid) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = aid;
          btn.style.cssText = 'padding:4px 10px;border:1px solid #B59A6D;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;';
          btn.onclick = function () {
            if (global.CrozzoAiActionRegistry && typeof global.CrozzoAiActionRegistry.execute === 'function') {
              global.CrozzoAiActionRegistry.execute(aid).then(function (r) {
                addMessage('assistant', 'Resultado: ' + (typeof r === 'string' ? r : (r && r.result) ? r.result : JSON.stringify(r)));
              });
            }
          };
          btnContainer.appendChild(btn);
        });
        assistantDiv.appendChild(btnContainer);
      }
      _history.push({ role: 'assistant', content: full });
    } catch (e) {
      assistantDiv.textContent = 'Error: ' + (e && e.message ? e.message : e);
    } finally {
      _sending = false;
      var box2 = document.getElementById('crozzo-ai-messages');
      if (box2) box2.scrollTop = box2.scrollHeight;
    }
  }

  function startVoice() {
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) { addMessage('assistant', 'Voz no disponible en este navegador. Use texto.'); return; }
    try {
      var rec = new SR();
      rec.lang = 'es-CO';
      rec.interimResults = false;
      rec.onresult = function (e) {
        var t = e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript;
        if (t) {
          var inp = document.getElementById('crozzo-ai-input');
          if (inp) inp.value = t;
        }
      };
      rec.onerror = function (e) { addMessage('assistant', 'Error de voz: ' + (e && e.error ? e.error : e)); };
      rec.start();
      addMessage('assistant', '🎤 Escuchando…');
    } catch (e) {
      addMessage('assistant', 'Voz no disponible: ' + (e && e.message ? e.message : e));
    }
  }

  function open() {
    if (!isAllowedRole()) {
      try { if (typeof global.showToast === 'function') global.showToast('Asistente IA solo para Super Admin, Admin y Encargado.', 'warning'); } catch (_) {}
      return;
    }
    var tier = (global.CrozzoAiDeviceProfile && typeof global.CrozzoAiDeviceProfile.getTier === 'function') ? global.CrozzoAiDeviceProfile.getTier() : 'full';
    if (tier === 'disabled') {
      try { if (typeof global.showToast === 'function') global.showToast('Su equipo tiene rendimiento muy bajo. El asistente IA no puede ejecutarse aquí.', 'warning'); } catch (_) {}
      return;
    }
    ensurePanel();
    if (global.CrozzoAiChatHistory && typeof global.CrozzoAiChatHistory.load === 'function') {
      try { var hist = global.CrozzoAiChatHistory.load(); if (hist && hist.length) _history = hist; } catch (_) {}
    }
  }

  function close() {
    document.body.classList.remove('crozzo-ai-panel-open');
    var ov = document.getElementById(PANEL_ID);
    if (ov) {
      ov.style.transform = 'translateX(100%)';
      setTimeout(function () { if (ov.parentNode) ov.remove(); }, 250);
    }
  }

  function injectFab() {
    if (!isAllowedRole()) return;
    if (document.getElementById('crozzo-ai-fab')) return;
    var btn = document.createElement('button');
    btn.id = 'crozzo-ai-fab';
    btn.type = 'button';
    btn.textContent = '🤖';
    btn.title = 'Asistente IA';
    btn.style.cssText = 'position:fixed;right:16px;bottom:90px;z-index:9000;width:48px;height:48px;border-radius:50%;border:1px solid rgba(181,154,109,0.6);background:#1c1c1c;color:#faf9f7;font-size:1.3rem;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,0.28);';
    btn.onclick = open;
    document.body.appendChild(btn);
  }

  function reindex() {
    return ollamaInvoke('crozzo_rag_reindex').then(function (r) { return r; });
  }

  function isAllowedRole() {
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    } catch (_) {}
    try {
      var sid = sessionStorage.getItem('crozzo_session_user');
      if (sid && String(sid).toUpperCase() === 'KENNY') return true;
    } catch (_) {}
    try {
      if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.rol) {
          var r = String(u.rol).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
          if (r === 'admin' || r === 'encargado' || r === 'superadmin' || r === 'super_admin') return true;
        }
        if (u && String(u.id || '').toUpperCase() === 'KENNY') return true;
      }
    } catch (_) {}
    return false;
  }

  global.CrozzoAiAssistant = { open: open, close: close, send: send, reindex: reindex, ensureModel: ensureModelInBackground, isAllowedRole: isAllowedRole, clearHistory: clearHistory, getHistory: function () { return _history; }, injectFab: injectFab };

  global.crozzoInjectAiFab = function () { setTimeout(injectFab, 100); setTimeout(injectFab, 1000); setTimeout(injectFab, 3000); };

  function clearHistory() {
    _history = [];
    try { if (global.CrozzoAiChatHistory && typeof global.CrozzoAiChatHistory.clear === 'function') global.CrozzoAiChatHistory.clear(); } catch (_) {}
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(injectFab, 200); setTimeout(ensureModelInBackground, 2000); }, { once: true });
    } else {
      setTimeout(injectFab, 200);
      setTimeout(ensureModelInBackground, 2000);
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);