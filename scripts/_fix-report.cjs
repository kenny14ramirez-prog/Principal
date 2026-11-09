const fs = require('fs');
const path = 'C:/proyectos/sistema pos/app/infra/CrozzoDeviceReport.js';
let content = fs.readFileSync(path, 'utf8');

const toggleStart = content.indexOf('  function togglePanel() {');
const toggleEnd = content.indexOf('  function createFloatingButton() {');
if (toggleStart !== -1 && toggleEnd !== -1) {
  const newToggle = `  function togglePanel() {
    try {
      var el = createPanel();
      if (!el) return;
      __panelVisible = !__panelVisible;
      el.style.display = __panelVisible ? 'block' : 'none';
      if (__panelVisible) {
        var c = el.querySelector('#crozzoReportContent');
        if (c) {
          c.textContent = __logs.map(function(l) { return '[' + new Date(l.t).toLocaleTimeString() + '] [' + l.type.toUpperCase() + '] ' + l.msg; }).join('\\n');
          c.scrollTop = c.scrollHeight;
        }
      }
    } catch (e) {
      console.error('Error togglePanel:', e);
      try { showToast('Error: ' + String(e)); } catch (_) {}
    }
  }

`;
  content = content.substring(0, toggleStart) + newToggle + content.substring(toggleEnd);
}

content = content.replace(/btn\.textContent = '[^']*';/, "btn.textContent = '\\uD83D\\uDCCB';");

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed');
