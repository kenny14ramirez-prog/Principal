const fs = require('fs');
const p = 'app/modules/CrozzoHoneypotJaula.js';
let s = fs.readFileSync(p, 'utf8');
const old = `  function activar(decoy, opts) {
    if (jaula.active) return;
    // Guardia: no activar si hay un usuario real logueado
    try {
      var su = sessionStorage.getItem('crozzo_session_user');
      if (su && su !== 'null' && su !== '') return;
    } catch (_) {}
    opts = opts || {};`;
const neu = `  function activar(decoy, opts) {
    if (jaula.active) return;
    opts = opts || {};
    var isAdminPreview = !!opts.adminPreview;
    if (!isAdminPreview) {
      // Guardia: no activar si hay un usuario real logueado
      try {
        var su = sessionStorage.getItem('crozzo_session_user');
        if (su && su !== 'null' && su !== '') return;
      } catch (_) {}
      try {
        if (typeof global.getCurrentUser === 'function') {
          var u = global.getCurrentUser();
          if (u) return;
        }
      } catch (_) {}
    } else {
      // adminPreview solo válido para KENNY/superadmin
      try {
        var u2 = (typeof global.getCurrentUser === 'function') ? global.getCurrentUser() : null;
        if (!u2 || !(u2.id === 'KENNY' || u2.es_super_admin === true)) return;
      } catch (_) { return; }
    }`;
if (!s.includes(old)) { console.log('NOT FOUND'); process.exit(1); }
s = s.replace(old, neu, 1);
fs.writeFileSync(p, s, 'utf8');
console.log('done');