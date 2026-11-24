const fs = require('fs');
const p = 'app/modules/CrozzoAiAssistant.js';
let s = fs.readFileSync(p, 'utf8');

// Find the section to replace
const startMarker = "    // 3) No Ollama available -> try sidecar\n";
const startIdx = s.indexOf(startMarker);
if (startIdx === -1) { console.log('start marker not found'); process.exit(1); }

const endMarker = "    ensureModelInBackground();\n  }";
const endIdx = s.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.log('end marker not found'); process.exit(1); }

const newSection = `    // 3) No Ollama available -> auto-install
    st.textContent = 'Activando asistente IA...';
    var mgr = document.getElementById('crozzo-ai-model-mgr');
    if (mgr) {
      mgr.innerHTML = '<div style="padding:8px 0;font-size:0.85rem;color:#333;">' +
        '<p style="margin:0 0 6px;font-weight:600;">Instalando Ollama automaticamente...</p>' +
        '<div style="background:#eee;border-radius:4px;height:6px;overflow:hidden;margin-bottom:6px;">' +
          '<div id="mm-bar" style="height:100%;width:0%;background:#B59A6D;transition:width 0.3s;"></div>' +
        '</div>' +
        '<p style="margin:0;font-size:0.75rem;color:#999;">Esto puede tomar unos minutos. No cierre la app.</p>' +
      '</div>';
    }
    // Try to install Ollama via Tauri (if available)
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        await global.__TAURI__.core.invoke('install_setup_from_url', { url: 'https://ollama.com/download/OllamaSetup.exe' });
        // Poll for Ollama availability
        var pollCount = 0;
        var pollInterval = setInterval(function () {
          pollCount++;
          fetch(ollamaUrl() + '/api/tags').then(function (r) {
            if (r.ok) {
              clearInterval(pollInterval);
              checkStatus();
            }
          }).catch(function () {});
          if (pollCount > 90) { clearInterval(pollInterval); updateStatus('Instale Ollama manualmente desde ollama.com'); }
        }, 2000);
        return;
      }
    } catch (e) {
      // Fallback: show manual instructions
    }
    // Manual fallback
    st.textContent = 'Para activar el asistente IA, instale Ollama (programa gratuito):';
    if (mgr) {
      mgr.innerHTML = '<div style="padding:8px 0;font-size:0.85rem;color:#333;">' +
        '<p style="margin:0 0 6px;font-weight:600;">Pasos (solo una vez):</p>' +
        '<p style="margin:0 0 4px;">1. Descargue Ollama: <a href="https://ollama.com/download" target="_blank" style="color:#B59A6D;font-weight:600;">ollama.com/download</a></p>' +
        '<p style="margin:0 0 4px;">2. Instalelo (siguiente, siguiente, finalizar)</p>' +
        '<p style="margin:0 0 8px;">3. Vuelva aqui - el sistema descarga el modelo automaticamente</p>' +
        '<button type="button" id="mm-open-ollama" style="padding:6px 12px;border:none;border-radius:8px;background:#B59A6D;color:#fff;cursor:pointer;font-size:0.85rem;">Abrir ollama.com</button>' +
      '</div>';
      var btn = mgr.querySelector('#mm-open-ollama');
      if (btn) btn.onclick = function () { try { window.open('https://ollama.com/download', '_blank'); } catch (_) {} };
    }
    ensureSidecar().then(function (ok) {
      var st2 = document.getElementById('crozzo-ai-status');
      if (st2) st2.textContent = ok ? 'Asistente IA listo' : 'Esperando Ollama...';
    });
`;

s = s.slice(0, startIdx) + newSection + s.slice(endIdx + endMarker.length);
fs.writeFileSync(p, s, 'utf8');
console.log('done');