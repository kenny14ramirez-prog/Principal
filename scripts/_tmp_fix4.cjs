const fs = require('fs');
const p = 'app/modules/CrozzoHoneypotJaula.js';
let s = fs.readFileSync(p, 'utf8');
const old = "  function activar(decoy, opts) {\n    if (jaula.active) return;\n    opts = opts || {};";
const neu = "  function activar(decoy, opts) {\n    if (jaula.active) return;\n    // Guardia: no activar si hay un usuario real logueado (salvo adminPreview para KENNY)\n    opts = opts || {};\n    var isAdminPreview = !!opts.adminPreview;\n    if (!isAdminPreview) {\n      try {\n        var su = sessionStorage.getItem('crozzo_session_user');\n        if (su && su !== 'null' && su !== '') return;\n      } catch (_) {}\n      try {\n        if (typeof global.getCurrentUser === 'function') {\n          var u = global.getCurrentUser();\n          if (u) return;\n        }\n      } catch (_) {}\n    } else {\n      // adminPreview solo válido para KENNY/superadmin\n      try {\n        var u2 = (typeof global.getCurrentUser === 'function') ? global.getCurrentUser() : null;\n        if (!u2 || !(u2.id === 'KENNY' || u2.es_super_admin === true)) return;\n      } catch (_) { return; }\n    }";
if (!s.includes(old)) { console.log('NOT FOUND'); process.exit(1); }
s = s.replace(old, neu, 1);
fs.writeFileSync(p, s, 'utf8');
console.log('done');