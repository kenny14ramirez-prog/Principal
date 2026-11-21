const fs = require('fs');
const p = 'app/core/CrozzoPosMain.js';
let s = fs.readFileSync(p, 'utf8');
const marker = "sessionStorage.removeItem('crozzo_session_user');";
const idx = s.indexOf(marker);
if (idx === -1) { console.log('marker not found'); process.exit(1); }
const insertAt = idx + marker.length;
const addition = "\n  try { if (window.CrozzoHoneypotJaula && typeof window.CrozzoHoneypotJaula.desactivar === 'function') window.CrozzoHoneypotJaula.desactivar(); } catch (_) {}";
s = s.slice(0, insertAt) + addition + s.slice(insertAt);
fs.writeFileSync(p, s, 'utf8');
console.log('done');