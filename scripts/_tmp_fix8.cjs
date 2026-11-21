const fs = require('fs');
const p = 'app/modules/CrozzoHoneypotJaula.js';
let s = fs.readFileSync(p, 'utf8');

// Add a boot-time guard at the very start of the IIFE (after 'use strict')
const marker = "  'use strict';\n";
const guard = "  'use strict';\n\n  // GUARDIA DE ARRANQUE: si hay un usuario real logueado, limpiar flags honeypot stale\n  try {\n    var _su = sessionStorage.getItem('crozzo_session_user');\n    if (_su && _su !== 'null' && _su !== '') {\n      sessionStorage.removeItem('crozzo_modo_jaula');\n      sessionStorage.removeItem('crozzo_jaula_start');\n      sessionStorage.removeItem('crozzo_jaula_decoy');\n      try { localStorage.removeItem('crozzo_jaula_log'); } catch (_) {}\n      try { localStorage.removeItem('crozzo_jaula_bloqueado'); } catch (_) {}\n    }\n  } catch (_) {}\n";
if (!s.includes(marker)) { console.log('marker not found'); process.exit(1); }
s = s.replace(marker, guard, 1);

// Also make verificarBloqueo clear jaula flags when session user exists
const vbMarker = "  function verificarBloqueo() {\n    // 1. Verificar bloqueo local";
const vbNew = "  function verificarBloqueo() {\n    // Guardia: si hay usuario real, limpiar jaula stale\n    try {\n      var _su2 = sessionStorage.getItem('crozzo_session_user');\n      if (_su2 && _su2 !== 'null' && _su2 !== '') {\n        try { sessionStorage.removeItem('crozzo_modo_jaula'); sessionStorage.removeItem('crozzo_jaula_start'); sessionStorage.removeItem('crozzo_jaula_decoy'); } catch (_) {}\n        try { localStorage.removeItem('crozzo_jaula_log'); localStorage.removeItem('crozzo_jaula_bloqueado'); } catch (_) {}\n        jaula.active = false;\n      }\n    } catch (_) {}\n    // 1. Verificar bloqueo local";
if (s.includes(vbMarker)) s = s.replace(vbMarker, vbNew, 1);

fs.writeFileSync(p, s, 'utf8');
console.log('done');