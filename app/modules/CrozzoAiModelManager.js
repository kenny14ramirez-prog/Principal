/**
 * Bona Origen — Gestor de modelos GGUF para el asistente IA (llama-server).
 * Selector de tamaño (1B/3B/4B según RAM), barra de progreso, descargar/cancelar/reintentar.
 */
(function (global) {
  'use strict';

  var MODELS = [
    { id: '1b', label: 'Llama 3.2 1B (Q4)', size: '1B', minRam: 4 },
    { id: '3b', label: 'Llama 3.2 3B (Q4)', size: '3B', minRam: 8 },
    { id: '4b', label: 'Gemma 3 4B (Q4)', size: '4B', minRam: 16 }
  ];

  function recommendedId() {
    var ram = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
    if (ram <= 4) return '1b';
    if (ram <= 8) return '3b';
    return '4b';
  }

  function tauri() { return global.__TAURI__ && global.__TAURI__.core; }
  function tauriEvent() { return global.__TAURI__ && global.__TAURI__.event; }

  async function invoke(method, args) {
    args = args || {};
    try {
      if (tauri() && typeof tauri().invoke === 'function') {
        return await tauri().invoke(method, args);
      }
    } catch (e) { console.warn('invoke', method, e); }
    return null;
  }

  var _listenersReady = false;
  function ensureListeners() {
    if (_listenersReady) return;
    _listenersReady = true;
    var ev = tauriEvent();
    if (ev && typeof ev.listen === 'function') {
      ev.listen('crozzo-llama-model-progress', function (e) {
        var p = (e && e.payload) ? e.payload : e;
        if (!p || !p.model_id) return;
        updateProgress(p);
      }).catch(function () {});
    }
  }

  function mount(selector) {
    ensureListeners();
    var root = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!root) return;
    if (root.getAttribute('data-mm-mounted') === '1') return;
    root.setAttribute('data-mm-mounted', '1');

    var rec = recommendedId();
    var html = '' +
      '<div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">Modelo IA local</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">' +
        '<select id="mm-model-select" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">' +
          MODELS.map(function (m) { return '<option value="' + m.id + '"' + (m.id === rec ? ' selected' : '') + '>' + m.label + ' (≥' + m.minRam + 'GB RAM)</option>'; }).join('') +
        '</select>' +
        '<button type="button" id="mm-download" style="padding:6px 10px;border:none;border-radius:8px;background:#B59A6D;color:#fff;cursor:pointer;font-size:0.8rem;">Descargar</button>' +
        '<button type="button" id="mm-cancel" style="padding:6px 10px;border:none;border-radius:8px;background:#999;color:#fff;cursor:pointer;font-size:0.8rem;">Cancelar</button>' +
      '</div>' +
      '<div style="background:#eee;border-radius:8px;height:10px;overflow:hidden;margin-bottom:4px;">' +
        '<div id="mm-bar" style="height:100%;width:0%;background:#B59A6D;transition:width .2s;"></div>' +
      '</div>' +
      '<div id="mm-status" style="font-size:0.72rem;color:#666;">Estado: verificando…</div>' +
      '<div style="display:flex;gap:6px;margin-top:4px;">' +
        '<button type="button" id="mm-retry" style="padding:4px 8px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:0.75rem;">Reintentar</button>' +
        '<button type="button" id="mm-delete" style="padding:4px 8px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:0.75rem;">Eliminar</button>' +
      '</div>';
    root.innerHTML = html;

    var select = root.querySelector('#mm-model-select');
    var bar = root.querySelector('#mm-bar');
    var status = root.querySelector('#mm-status');

    function setStatus(t) { if (status) status.textContent = t; }
    function setBar(pct) { if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }

    async function refreshStatus() {
      var id = select.value;
      var s = await invoke('crozzo_llama_model_status', { modelId: id });
      if (s && s.installed) {
        setStatus('Modelo instalado ✔ (' + (s.size_bytes / 1048576).toFixed(1) + ' MB)');
        setBar(100);
      } else {
        setStatus('Modelo no descargado.');
        setBar(0);
      }
    }

    select.addEventListener('change', refreshStatus);

    root.querySelector('#mm-download').onclick = async function () {
      var id = select.value;
      setStatus('Iniciando descarga…');
      setBar(0);
      var r = await invoke('crozzo_llama_model_download', { modelId: id });
      if (r === null) setStatus('Descarga no disponible (backend).');
    };

    root.querySelector('#mm-cancel').onclick = async function () {
      var id = select.value;
      await invoke('crozzo_llama_model_cancel', { modelId: id });
      setStatus('Cancelado.');
    };

    root.querySelector('#mm-retry').onclick = async function () {
      var id = select.value;
      await invoke('crozzo_llama_model_delete', { modelId: id }).catch(function () {});
      await invoke('crozzo_llama_model_download', { modelId: id });
    };

    root.querySelector('#mm-delete').onclick = async function () {
      var id = select.value;
      await invoke('crozzo_llama_model_delete', { modelId: id });
      setStatus('Eliminado.');
      setBar(0);
    };

    function updateProgress(p) {
      if (!p || p.model_id !== select.value) return;
      if (p.status === 'downloading') {
        setStatus('Descargando… ' + Math.round(p.percent || 0) + '%');
        setBar(p.percent || 0);
      } else if (p.status === 'done') {
        setStatus('Descarga completa ✔');
        setBar(100);
      } else if (p.status === 'cancelled') {
        setStatus('Descarga cancelada.');
      } else if (p.status === 'error') {
        setStatus('Error: ' + (p.error || 'desconocido'));
      }
    }

    // expose for global listener
    root._mmUpdate = updateProgress;

    refreshStatus();
  }

  function updateProgress(p) {
    // dispatch to all mounted roots
    var roots = document.querySelectorAll('[data-mm-mounted="1"]');
    roots.forEach(function (r) {
      if (typeof r._mmUpdate === 'function') r._mmUpdate(p);
    });
  }

  // Listen as soon as possible
  ensureListeners();

  global.CrozzoAiModelManager = {
    mount: mount,
    recommendedId: recommendedId,
    MODELS: MODELS
  };
})(typeof window !== 'undefined' ? window : globalThis);