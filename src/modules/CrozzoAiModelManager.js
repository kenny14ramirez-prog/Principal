/**
 * Bona Origen — Gestor de modelos para el asistente IA.
 * Usa Ollama para descargar y gestionar modelos automáticamente.
 * El usuario solo necesita tener Ollama instalado (ollama.com).
 */
(function (global) {
  'use strict';

  var MODELS = [
    { id: 'qwen2.5:1.5b', label: 'Modelo ligero (recomendado para equipos modestos)', minRam: 4 },
    { id: 'phi4-mini', label: 'Modelo balanceado (mejor calidad)', minRam: 8 },
    { id: 'llama3.2:3b', label: 'Modelo avanzado (equipos potentes)', minRam: 16 }
  ];

  function recommendedId() {
    var ram = 4;
    try {
      if (global.CrozzoAiDeviceProfile && typeof global.CrozzoAiDeviceProfile.getTier === 'function') {
        var tier = global.CrozzoAiDeviceProfile.getTier();
        if (tier === 'disabled' || tier === 'light') ram = 4;
        else if (tier === 'medium') ram = 8;
        else ram = 16;
      } else if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
        ram = navigator.deviceMemory;
      }
    } catch (_) {}
    if (ram <= 4) return MODELS[0].id;
    if (ram <= 8) return MODELS[1].id;
    return MODELS[2].id;
  }

  function tauri() { return (global.__TAURI__ && global.__TAURI__.core) ? global.__TAURI__.core : null; }
  function invoke(method, args) { args = args || {}; var t = tauri(); if (t && typeof t.invoke === 'function') return t.invoke(method, args); return Promise.resolve(null); }

  var _listeners = false;
  function ensureListeners() {
    if (_listeners) return;
    _listeners = true;
  }

  function mount(root) {
    if (!root) return;
    if (root.getAttribute('data-mm-mounted') === '1') return;
    root.setAttribute('data-mm-mounted', '1');

    var rec = recommendedId();
    var html = '' +
      '<div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">Asistente IA</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">' +
        '<select id="mm-model-select" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">' +
          MODELS.map(function (m) { return '<option value="' + m.id + '"' + (m.id === rec ? ' selected' : '') + '>' + m.label + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" id="mm-download" style="padding:6px 12px;border:none;border-radius:8px;background:#B59A6D;color:#fff;cursor:pointer;font-size:0.85rem;">Descargar</button>' +
      '</div>' +
      '<div id="mm-status" style="font-size:0.75rem;color:#666;margin-bottom:4px;">Verificando…</div>' +
      '<div style="background:#eee;border-radius:4px;height:6px;overflow:hidden;margin-bottom:6px;">' +
        '<div id="mm-bar" style="height:100%;width:0%;background:#B59A6D;transition:width 0.3s;"></div>' +
      '</div>' +
      '<div style="font-size:0.7rem;color:#999;">Requiere Ollama instalado (ollama.com). El sistema descarga el modelo automáticamente.</div>';
    root.innerHTML = (global.CrozzoSanitize && global.CrozzoSanitize.sanitizeHtml) ? global.CrozzoSanitize.sanitizeHtml(html) : html;

    var sel = root.querySelector('#mm-model-select');
    var btn = root.querySelector('#mm-download');
    var st = root.querySelector('#mm-status');
    var bar = root.querySelector('#mm-bar');

    function setStatus(t) { if (st) st.textContent = t; }
    function setBar(pct) { if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }

    async function checkOllama() {
      try {
        var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
        var r = await fetch(url + '/api/tags');
        if (r.ok) {
          var j = await r.json();
          var models = (j && j.models) || [];
          var modelNames = models.map(function (m) { return m.name; });
          var selected = sel ? sel.value : rec;
          if (modelNames.some(function (n) { return n.indexOf(selected) === 0; })) {
            setStatus('✔ Modelo instalado y listo');
            setBar(100);
            return true;
          }
          setStatus('Modelo no instalado. Haga clic en Descargar.');
          setBar(0);
          return false;
        }
      } catch (_) {}
      setStatus('Ollama no detectado. Instale Ollama (ollama.com) y ejecute "ollama serve".');
      setBar(0);
      return false;
    }

    async function downloadModel() {
      var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
      var model = sel ? sel.value : rec;
      // Save selected model
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('crozzo_ollama_model', model); } catch (_) {}
      setStatus('Descargando ' + model + '…');
      setBar(0);
      try {
        var resp = await fetch(url + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model, stream: true }) });
        if (!resp.ok || !resp.body) throw new Error('pull failed: HTTP ' + resp.status);
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
              if (j && j.status) {
                setStatus('Descargando: ' + j.status + (j.completed && j.total ? ' ' + Math.round((j.completed / j.total) * 100) + '%' : ''));
                if (j.completed && j.total) setBar((j.completed / j.total) * 100);
              }
            } catch (_) {}
          }
        }
        setStatus('✔ Modelo listo');
        setBar(100);
        // Update assistant status
        if (global.CrozzoAiAssistant && typeof global.CrozzoAiAssistant.checkStatus === 'function') {
          global.CrozzoAiAssistant.checkStatus();
        }
      } catch (e) {
        setStatus('Error: ' + (e && e.message ? e.message : e) + '. Verifique que Ollama esté corriendo.');
        setBar(0);
      }
    }

    if (btn) btn.onclick = downloadModel;
    // Initial check
    checkOllama();
  }

  global.CrozzoAiModelManager = {
    mount: mount,
    recommendedId: recommendedId,
    MODELS: MODELS
  };
})(typeof window !== 'undefined' ? window : globalThis);