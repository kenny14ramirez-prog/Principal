/**
 * Bona Origen — Asistente IA (Fase 3: descarga en segundo plano + voz + contexto).
 * - Descarga el modelo via Ollama /api/pull en background (no bloquea el arranque).
 * - Voz: Web Speech API si está disponible (fallback texto).
 * - Contexto: inyecta estado del sistema (health) en el prompt.
 */
(function (global) {
  'use strict';

  var PANEL_ID = 'crozzo-ai-assistant-panel';
  var _panelEsc = null;
  var _history = [];
  var _abort = null;
  var _pulling = false;
  var _sending = false;

  function ollamaUrl() { return (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434'; }
  function ollamaModel() { return (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini'; }

  async function llamaInvoke(method, args) {
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
      var r = await llamaInvoke('crozzo_llama_ensure_sidecar');
      if (r === true) return true;
    } catch (_) {}
    return false;
  }

  async function ensureModelInBackground() {
    if (_pulling) return;
    var url = ollamaUrl();
    var model = ollamaModel();
    // Check if model exists
    try {
      var r = await ollamaInvoke('crozzo_ollama_tags', { url: url, timeout_ms: 5000 });
      var exists = false;
      if (r) {
        try { var j = JSON.parse(r); exists = !!(j && Array.isArray(j.models) && j.models.some(function (m) { return (m.name || '').indexOf(model) === 0; })); } catch (_) {}
      } else {
        try { var resp = await fetch(url + '/api/tags'); if (resp.ok) { var j2 = await resp.json(); exists = !!(j2 && Array.isArray(j2.models) && j2.models.some(function (m) { return (m.name || '').indexOf(model) === 0; })); } } catch (_) {}
      }
      if (exists) return;
    } catch (_) {}
    // Pull in background
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
      updateStatus('Descarga falló: ' + (e && e.message ? e.message : e));
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
    if (existing) return existing;
    var ov = document.createElement('div');
    ov.id = PANEL_ID;
    ov.className = 'crozzo-ai-drawer-backdrop';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.45);';
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var card = document.createElement('div');
    card.className = 'crozzo-ai-drawer';
    card.style.cssText = 'position:fixed;top:0;right:0;width:100%;max-width:420px;height:100vh;display:flex;flex-direction:column;background:#fff;box-shadow:-24px 0 60px rgba(0,0,0,0.32);overflow:hidden;';
    card.innerHTML =
      '<div style="padding:14px 18px;background:linear-gradient(135deg,#B59A6D,#7A6342);color:#fff;display:flex;align-items:center;justify-content:space-between;">' +
        '<strong>Asistente IA · Bona Origen</strong>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" id="crozzo-ai-reindex" title="Reindexar documentos" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:0.8rem;">↻ Reindexar</button>' +
          '<button type="button" id="crozzo-ai-tts" title="Lectura en voz alta" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;">🔊</button>' +
          '<button type="button" id="crozzo-ai-voice" title="Dictar" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;">🎤</button>' +
          '<button type="button" id="crozzo-ai-close" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;">×</button>' +
        '</div>' +
      '</div>' +
      '<div id="crozzo-ai-status" style="padding:6px 14px;font-size:0.75rem;color:#666;background:#f5f5f5;">Estado: verificando modelo local…</div>' +
      '<div id="crozzo-ai-transcript" style="padding:6px 14px;font-size:0.8rem;color:#333;background:#fafafa;border-bottom:1px solid #eee;display:none;"></div>' +
      '<div id="crozzo-ai-modelmgr" style="padding:8px 14px;border-bottom:1px solid #eee;background:#fafafa;"></div>' +
      '<div id="crozzo-ai-messages" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;"></div>' +
      '<div style="padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;">' +
        '<input id="crozzo-ai-input" type="text" placeholder="Escribe o dicta tu consulta…" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;">' +
        '<button type="button" id="crozzo-ai-send" style="padding:10px 16px;border:none;border-radius:8px;background:#B59A6D;color:#fff;cursor:pointer;font-weight:600;">Enviar</button>' +
      '</div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    document.getElementById('crozzo-ai-close').onclick = close;
    document.getElementById('crozzo-ai-send').onclick = send;
    var reindexBtn = document.getElementById('crozzo-ai-reindex');
    if (reindexBtn) reindexBtn.onclick = reindex;
    var inp = document.getElementById('crozzo-ai-input');
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    var voiceBtn = document.getElementById('crozzo-ai-voice');
    if (voiceBtn) voiceBtn.onclick = toggleVoice;
    var ttsBtn = document.getElementById('crozzo-ai-tts');
    if (ttsBtn) { ttsBtn.onclick = toggleTts; updateTtsButton(); }
    if (global.CrozzoAiModelManager && typeof global.CrozzoAiModelManager.mount === 'function') {
      global.CrozzoAiModelManager.mount('#crozzo-ai-modelmgr');
    } else {
      setTimeout(function () {
        if (global.CrozzoAiModelManager && typeof global.CrozzoAiModelManager.mount === 'function') global.CrozzoAiModelManager.mount('#crozzo-ai-modelmgr');
      }, 300);
    }
    checkStatus();
    // Close on Esc
    if (_panelEsc) { try { document.removeEventListener('keydown', _panelEsc); } catch (_) {} }
    _panelEsc = function (e) { if (e && e.key === 'Escape') close(); };
    document.addEventListener('keydown', _panelEsc);
    // Trigger background model download (non-blocking)
    setTimeout(ensureModelInBackground, 100);
    restoreMessages();
    return ov;
  }

  function close() {
    if (_panelEsc) { try { document.removeEventListener('keydown', _panelEsc); } catch (_) {} _panelEsc = null; }
    var ov = document.getElementById(PANEL_ID);
    if (ov) ov.remove();
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
    // Try internal sidecar first
    try {
      var h = await llamaInvoke('crozzo_llama_health');
      if (h && h.ok) { st.textContent = 'Estado: modelo interno activo ✔'; return; }
    } catch (_) {}
    // Fallback to Ollama
    var url = ollamaUrl();
    try {
      var r = await ollamaInvoke('crozzo_ollama_tags', { url: url, timeout_ms: 5000 });
      if (r) {
        try { var j = JSON.parse(r); if (j && Array.isArray(j.models)) { st.textContent = 'Estado: Ollama conectado ✔ (' + j.models.length + ' modelos)'; return; } } catch (_) {}
      }
      var resp = await fetch(url + '/api/tags', { method: 'GET' });
      if (resp.ok) { st.textContent = 'Estado: Ollama conectado ✔'; return; }
    } catch (_) {}
    st.textContent = 'Estado: modelo no disponible. Iniciando sidecar interno…';
    // Try to start sidecar in background
    ensureSidecar().then(function (ok) {
      var st2 = document.getElementById('crozzo-ai-status');
      if (st2) st2.textContent = ok ? 'Estado: modelo interno activo ✔' : 'Estado: modelo no disponible. Instale Ollama o coloque llama-server en src-tauri/binaries/.';
    });
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

  async function reindex() {
    updateStatus('Reindexando documentos…');
    try {
      var n = await llamaInvoke('crozzo_rag_reindex');
      updateStatus('Reindexado: ' + (n != null ? n : '?') + ' chunks ✔');
    } catch (e) {
      updateStatus('Reindexado falló: ' + (e && e.message ? e.message : e));
    }
  }

  async function send() {
    if (_sending) return;
    var inp = document.getElementById('crozzo-ai-input');
    if (!inp) return;
    var text = (inp.value || '').trim();
    if (!text) return;
    _sending = true;
    inp.value = '';
    addMessage('user', text);
    if (_history.length === 0) { try { if (global.CrozzoAiChatHistory && typeof global.CrozzoAiChatHistory.load === 'function') _history = global.CrozzoAiChatHistory.load() || []; } catch (_) {} }
    _history.push({ role: 'user', content: text });
    persistHistory();
    // Fase 4: si el usuario pide una acción directa, ejecutarla sin llamar al modelo
    try {
      if (global.CrozzoAiIntentParser && typeof global.CrozzoAiIntentParser.parse === 'function') {
        var userIntents = global.CrozzoAiIntentParser.parse(text).intents || [];
        if (userIntents.length > 0 && global.CrozzoAiActionRegistry && typeof global.CrozzoAiActionRegistry.execute === 'function') {
          var adiv = addMessage('assistant', 'Ejecutando: ' + userIntents.join(', ') + '…');
          for (var ui = 0; ui < userIntents.length; ui++) {
            try {
              var res = await global.CrozzoAiActionRegistry.execute(userIntents[ui]);
              adiv.textContent = 'Resultado: ' + (typeof res === 'string' ? res : JSON.stringify(res));
            } catch (e) {
              adiv.textContent = 'Error: ' + (e && e.message ? e.message : e);
            }
          }
          _history.push({ role: 'assistant', content: 'Ejecutado: ' + userIntents.join(', ') });
          persistHistory();
          _sending = false;
          return;
        }
      }
    } catch (_) {}
    var assistantDiv = addMessage('assistant', '…');
    var full = '';
    var ragChunks = [];
    try {
      var rr = await llamaInvoke('crozzo_rag_fts_search', { query: text, k: 5 });
      if (Array.isArray(rr)) ragChunks = rr;
    } catch (_) {}
    try {
      var ragContext = '';
      if (ragChunks.length) {
        ragContext = 'Contexto documental (RAG):\n' + ragChunks.map(function (c, i) { return '[' + (i + 1) + '] (' + (c.source || '') + ') ' + (c.text || ''); }).join('\n\n') + '\n\n';
      }
      var prompt = ragContext + 'Contexto del sistema POS: ' + systemContext() + '\n' +
        _history.slice(-12).map(function (m) { return (m.role === 'user' ? 'Usuario: ' : 'Asistente: ') + m.content; }).join('\n') + '\nAsistente:';
      // 1) Sidecar interno (llama.cpp)
      try {
        var r0 = await llamaInvoke('crozzo_llama_chat', { prompt: prompt, timeout_ms: 60000 });
        if (r0) { try { var j0 = JSON.parse(r0); full = (j0 && j0.choices && j0.choices[0] && j0.choices[0].message && j0.choices[0].message.content) ? j0.choices[0].message.content : (j0 && j0.response) ? j0.response : ''; } catch (_) { full = String(r0); } }
      } catch (_) {}
      // 2) Ollama externo
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
      var answerText = full;
      var sourceList = [];
      var seenSrc = {};
      ragChunks.forEach(function (c) {
        if (c && c.source && !seenSrc[c.source]) { seenSrc[c.source] = 1; sourceList.push(c.source); }
      });
      // Fase 4: detectar etiquetas de acción [ACTION:id]
      var actionIds = [];
      try {
        if (global.CrozzoAiIntentParser && typeof global.CrozzoAiIntentParser.parse === 'function') {
          actionIds = (global.CrozzoAiIntentParser.parse(answerText).intents || []).slice();
        } else {
          var mm;
          var rre = /\[ACTION:([a-zA-Z0-9_\-]+)\]/g;
          while ((mm = rre.exec(answerText)) !== null) { if (actionIds.indexOf(mm[1]) === -1) actionIds.push(mm[1]); }
        }
      } catch (_) {}
      var cleanText = String(answerText).replace(/\[ACTION:[a-zA-Z0-9_\-]+\]/g, '').trim();
      var displayText = cleanText;
      if (sourceList.length) {
        displayText += '\n\nFuentes:\n' + sourceList.map(function (s) { return '- ' + s; }).join('\n');
      }
      assistantDiv.textContent = '';
      var textNode = document.createElement('div');
      textNode.style.cssText = 'white-space:pre-wrap;';
      textNode.textContent = displayText;
      assistantDiv.appendChild(textNode);
      if (actionIds.length) {
        var btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
        actionIds.forEach(function (aid) {
          var reg = global.CrozzoAiActionRegistry;
          var meta = reg && typeof reg.get === 'function' ? reg.get(aid) : null;
          var label = (meta && meta.label) ? meta.label : aid;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = '\u25B6 ' + label;
          btn.style.cssText = 'padding:6px 12px;border:none;border-radius:8px;background:#7A6342;color:#fff;cursor:pointer;font-size:0.85rem;font-weight:600;';
          btn.onclick = async function () {
            btn.disabled = true;
            var orig = btn.textContent;
            btn.textContent = 'Ejecutando\u2026';
            try {
              var r = reg && typeof reg.execute === 'function' ? await reg.execute(aid) : { error: 'Registro de acciones no disponible' };
              if (r && r.cancelled) {
                addMessage('assistant', 'Acción cancelada: ' + label);
              } else if (r && r.error) {
                addMessage('assistant', 'Error ejecutando ' + label + ': ' + r.error);
              } else {
                addMessage('assistant', 'Resultado (' + label + '): ' + ((r && r.result != null) ? r.result : 'OK'));
              }
            } catch (e) {
              addMessage('assistant', 'Error ejecutando ' + label + ': ' + (e && e.message ? e.message : e));
            } finally {
              btn.disabled = false;
              btn.textContent = orig;
            }
          };
          btnWrap.appendChild(btn);
        });
        assistantDiv.appendChild(btnWrap);
      }
      var box = document.getElementById('crozzo-ai-messages');
      if (box) box.scrollTop = box.scrollHeight;
      _history.push({ role: 'assistant', content: cleanText });
      persistHistory();
      speak(cleanText);
    } catch (e) {
      assistantDiv.textContent = 'Error: ' + (e && e.message ? e.message : e);
    } finally {
      var box2 = document.getElementById('crozzo-ai-messages');
      if (box2) box2.scrollHeight = box2.scrollHeight;
      _sending = false;
    }
  }

  var _recorder = null;
  var _recChunks = [];
  var _recStream = null;

  function setTranscriptPreview(text) {
    var el = document.getElementById('crozzo-ai-transcript');
    if (!el) return;
    if (text) { el.style.display = 'block'; el.textContent = 'Transcripción: ' + text; }
    else { el.style.display = 'none'; el.textContent = ''; }
  }

  function updateVoiceButton(recording) {
    var btn = document.getElementById('crozzo-ai-voice');
    if (!btn) return;
    btn.textContent = recording ? '⏹' : '🎤';
    btn.style.background = recording ? 'rgba(220,60,60,0.85)' : 'rgba(255,255,255,0.2)';
    btn.title = recording ? 'Detener grabación' : 'Dictar';
  }

  function toggleTts() {
    var cur = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_tts') === '1');
    if (typeof localStorage !== 'undefined') localStorage.setItem('crozzo_tts', cur ? '0' : '1');
    updateTtsButton();
  }
  function updateTtsButton() {
    var btn = document.getElementById('crozzo-ai-tts');
    if (!btn) return;
    var on = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_tts') === '1');
    btn.textContent = on ? '🔊' : '🔇';
    btn.style.opacity = on ? '1' : '0.6';
  }
  function speak(text) {
    try {
      if (typeof localStorage === 'undefined' || localStorage.getItem('crozzo_tts') !== '1') return;
      if (!global.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(String(text || ''));
      u.lang = 'es-CO';
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(u);
    } catch (_) {}
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onloadend = function () { resolve(String(r.result || '').split(',')[1] || ''); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function encodeWav(audioBuffer) {
    var samples = audioBuffer.getChannelData(0);
    var sampleRate = audioBuffer.sampleRate;
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function ws(off, s) { for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
    ws(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE');
    ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ws(36, 'data'); view.setUint32(40, samples.length * 2, true);
    var off = 44;
    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  async function blobToWavBase64(blob) {
    var AC = global.AudioContext || global.webkitAudioContext;
    var ctx = new AC();
    var ab = await blob.arrayBuffer();
    var audioBuf = await ctx.decodeAudioData(ab);
    var targetRate = 16000;
    var OfflineAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    var offline = new OfflineAC(1, Math.ceil(audioBuf.duration * targetRate), targetRate);
    var src = offline.createBufferSource();
    src.buffer = audioBuf;
    src.connect(offline.destination);
    src.start(0);
    var rendered = await offline.startRendering();
    var wav = encodeWav(rendered);
    return await blobToBase64(wav);
  }

  async function toggleVoice() {
    if (_recorder && _recorder.state === 'recording') {
      try { _recorder.stop(); } catch (_) {}
      return;
    }
    try {
      _recChunks = [];
      _recStream = await global.navigator.mediaDevices.getUserMedia({ audio: true });
      _recorder = new MediaRecorder(_recStream);
      _recorder.ondataavailable = function (e) { if (e.data && e.data.size) _recChunks.push(e.data); };
      _recorder.onstop = async function () {
        try {
          var mime = (_recorder && _recorder.mimeType) || 'audio/webm';
          var blob = new Blob(_recChunks, { type: mime });
          updateVoiceButton(false);
          var statusEl = document.getElementById('crozzo-ai-status');
          if (statusEl) statusEl.textContent = 'Transcribiendo…';
          var b64;
          var ext = 'webm';
          try { b64 = await blobToWavBase64(blob); ext = 'wav'; }
          catch (e) { b64 = await blobToBase64(blob); ext = 'webm'; }
          try {
            var path = await llamaInvoke('crozzo_whisper_save_audio', { audio_b64: b64, ext: ext });
            if (!path) throw new Error('no se pudo guardar audio');
            var text = await llamaInvoke('crozzo_whisper_transcribe', { audio_path: path });
            if (text) {
              var inp = document.getElementById('crozzo-ai-input');
              if (inp) inp.value = text;
              setTranscriptPreview(text);
            } else {
              addMessage('assistant', 'Whisper no disponible o no produjo texto. Escriba su consulta manualmente.');
            }
          } catch (e) {
            var _em = (e && e.message) ? e.message : String(e);
            if (/whisper|no disponible|no se pudo guardar audio/i.test(_em)) {
              addMessage('assistant', 'Whisper no disponible: instale whisper-cli.exe y el modelo ggml-base.bin en src-tauri/binaries y src-tauri/models. Puede escribir su consulta manualmente.');
            } else {
              addMessage('assistant', 'Transcripción falló: ' + _em);
            }
            setTranscriptPreview('');
          } finally {
            if (_recStream) { try { _recStream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} }
            _recStream = null;
            _recorder = null;
            var st = document.getElementById('crozzo-ai-status');
            if (st) st.textContent = 'Estado: listo';
          }
        } catch (e) {
          addMessage('assistant', 'Error procesando audio: ' + (e && e.message ? e.message : e));
          updateVoiceButton(false);
        }
      };
      _recorder.start();
      updateVoiceButton(true);
      var st2 = document.getElementById('crozzo-ai-status');
      if (st2) st2.textContent = 'Grabando… (pulse ⏹ para detener)';
    } catch (e) {
      addMessage('assistant', 'Micrófono no disponible: ' + (e && e.message ? e.message : e));
      updateVoiceButton(false);
    }
  }

  function persistHistory() {
    try {
      if (global.CrozzoAiChatHistory && typeof global.CrozzoAiChatHistory.save === 'function') {
        global.CrozzoAiChatHistory.save(_history);
      } else if (global.localStorage) {
        global.localStorage.setItem('crozzo_ai_chat_history_v1', JSON.stringify(_history || []));
      }
    } catch (_) {}
  }
  function restoreMessages() {
    try {
      var box = document.getElementById('crozzo-ai-messages');
      if (!box) return;
      box.innerHTML = '';
      (_history || []).forEach(function (m) { addMessage(m.role, m.content); });
    } catch (_) {}
  }
  function clearHistory() {
    _history = [];
    persistHistory();
    try { var box = document.getElementById('crozzo-ai-messages'); if (box) box.innerHTML = ''; } catch (_) {}
  }

  function open() {
    try { if ((!_history || _history.length === 0) && global.CrozzoAiChatHistory && typeof global.CrozzoAiChatHistory.load === 'function') _history = global.CrozzoAiChatHistory.load() || []; } catch (_) {}
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
  }
  function close() { if (_panelEsc) { try { document.removeEventListener('keydown', _panelEsc); } catch (_) {} _panelEsc = null; } var ov = document.getElementById(PANEL_ID); if (ov) ov.remove(); }

  function isAllowedRole() {
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    } catch (_) {}
    try {
      if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.rol) {
          var r = String(u.rol).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
          if (r === 'admin' || r === 'encargado' || r === 'superadmin' || r === 'super_admin') return true;
        }
      }
    } catch (_) {}
    return false;
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

  global.CrozzoAiAssistant = { open: open, close: close, send: send, reindex: reindex, ensureModel: ensureModelInBackground, isAllowedRole: isAllowedRole, clearHistory: clearHistory, getHistory: function () { return _history; } };

  // Hook para auditoría automática al cierre de turno
  global.crozzoTriggerAutoAudit = function () {
    try {
      if (!isAllowedRole()) return;
      if (global.CrozzoAiActionRegistry && typeof global.CrozzoAiActionRegistry.execute === 'function') {
        global.CrozzoAiActionRegistry.execute('auditoria_cajero');
      }
    } catch (_) {}
  };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(injectFab, 200); setTimeout(ensureModelInBackground, 2000); }, { once: true });
    } else {
      setTimeout(injectFab, 200);
      setTimeout(ensureModelInBackground, 2000);
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);