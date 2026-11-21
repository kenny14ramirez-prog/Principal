const fs = require('fs');
const p = 'app/modules/CrozzoHoneypotJaula.js';
let s = fs.readFileSync(p, 'utf8');

// Add a module-level disabled flag after 'use strict' + boot guard
const marker = "  'use strict';\n";
const guard = "  'use strict';\n\n  // GUARDIA GLOBAL: si hay usuario real logueado, deshabilitar todo el módulo\n  var __HP_DISABLED = false;\n  try {\n    var _su = sessionStorage.getItem('crozzo_session_user');\n    if (_su && _su !== 'null' && _su !== '') {\n      __HP_DISABLED = true;\n      sessionStorage.removeItem('crozzo_modo_jaula');\n      sessionStorage.removeItem('crozzo_jaula_start');\n      sessionStorage.removeItem('crozzo_jaula_decoy');\n      try { localStorage.removeItem('crozzo_jaula_log'); } catch (_) {}\n      try { localStorage.removeItem('crozzo_jaula_bloqueado'); } catch (_) {}\n    }\n  } catch (_) {}\n";
if (!s.includes(marker)) { console.log('marker not found'); process.exit(1); }
// Only add if not already present
if (!s.includes('var __HP_DISABLED')) {
  s = s.replace(marker, guard, 1);
}

// Make activar no-op if disabled
const actMarker = "  function activar(decoy, opts) {\n    if (jaula.active) return;";
const actNew = "  function activar(decoy, opts) {\n    if (__HP_DISABLED) return;\n    if (jaula.active) return;";
if (s.includes(actMarker)) s = s.replace(actMarker, actNew, 1);

// Make restaurarEstado no-op if disabled
const restMarker = "  function restaurarEstado() {\n    try {";
const restNew = "  function restaurarEstado() {\n    if (__HP_DISABLED) { desactivar(); return false; }\n    try {";
if (s.includes(restMarker)) s = s.replace(restMarker, restNew, 1);

// Make modoPreview no-op if disabled
const mpMarker = "  function modoPreview(decoy) {\n    // Activar honeypot sin bloqueo real";
const mpNew = "  function modoPreview(decoy) {\n    if (__HP_DISABLED) return false;\n    // Activar honeypot sin bloqueo real";
if (s.includes(mpMarker)) s = s.replace(mpMarker, mpNew, 1);

fs.writeFileSync(p, s, 'utf8');
console.log('done');