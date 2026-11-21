const fs = require('fs');
const p = 'app/modules/CrozzoHoneypotJaula.js';
let s = fs.readFileSync(p, 'utf8');
const marker = "if (codigo === 'CROZZO-UNLOCK-2026') {";
const idx = s.indexOf(marker);
if (idx === -1) { console.log('marker not found'); process.exit(1); }
// Find the next "return true;" after idx
const trueIdx = s.indexOf('return true;', idx);
if (trueIdx === -1) { console.log('return true not found'); process.exit(1); }
// Find the closing brace after return true
const closeIdx = s.indexOf('}', trueIdx);
if (closeIdx === -1) { console.log('close not found'); process.exit(1); }
// Remove from idx to closeIdx+1
const before = s.slice(0, idx);
const after = s.slice(closeIdx + 1);
s = before + "// Código de desbloqueo hardcodeado eliminado (seguridad).\n          // Usar solo verificación server-side (verify_unlock_code).\n" + after;
fs.writeFileSync(p, s, 'utf8');
console.log('done');