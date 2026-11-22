const fs = require('fs');
const p = 'app/modules/CrozzoAiAssistant.js';
let s = fs.readFileSync(p, 'utf8');

// Replace checkStatus with a simpler, more user-friendly version
const oldStart = s.indexOf('  async function checkStatus() {');
const oldEnd = s.indexOf('  function systemContext() {');
if (oldStart === -1 || oldEnd === -1) { console.log('markers not found'); process.exit(1); }

const newFunc = `  async function checkStatus() {
    var st = document.getElementById('crozzo-ai-status');
    if (!st) return;
    st.textContent = 'Verificando asistente IA…';

    // 1) Try internal sidecar
    try {
      var h = await ollamaInvoke('crozzo_llama_health');
      if (h && h.ok) { st.textContent = '✔ Asistente IA listo'; return; }
    } catch (_) {}

    // 2) Try Ollama
    var url = ollamaUrl();
    try {
      var r = await ollamaInvoke('crozzo_ollama_tags', { url: url, timeout_ms: 3000 });
      if (r) {
        try {
          var j = JSON.parse(r);
          if (j && Array.isArray(j.models) && j.models.length > 0) {
            st.textContent = '✔ Asistente IA listo (Ollama)';
            return;
          }
          // Ollama available but no model -> auto-pull
          if (j && Array.isArray(j.models)) {
            st.textContent = 'Descargando modelo automáticamente…';
            autoPullOllamaModel(url);
            return;
          }
        } catch (_) {}
      }
      var resp = await fetch(url + '/api/tags', { method: 'GET' });
      if (resp.ok) {
        st.textContent = 'Descargando modelo automáticamente…';
        autoPullOllamaModel(url);
        return;
      }
    } catch (_) {}

    // 3) No Ollama available -> try sidecar
    st.textContent = 'Instalando asistente IA…';
    ensureSidecar().then(function (ok) {
      var st2 = document.getElementById('crozzo-ai-status');
      if (st2) st2.textContent = ok ? '✔ Asistente IA listo' : 'Descargando modelo…';
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
        var lines = txt.split('\\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          try {
            var j = JSON.parse(line);
            if (j && j.status) updateStatus('Descargando… ' + j.status + (j.completed && j.total ? ' ' + Math.round((j.completed / j.total) * 100) + '%' : ''));
          } catch (_) {}
        }
      }
      updateStatus('✔ Asistente IA listo');
      checkStatus();
    } catch (e) {
      updateStatus('No se pudo descargar. Instale Ollama (ollama.com) manualmente.');
    }
  }

`;

s = s.slice(0, oldStart) + newFunc + s.slice(oldEnd);
fs.writeFileSync(p, s, 'utf8');
console.log('done');