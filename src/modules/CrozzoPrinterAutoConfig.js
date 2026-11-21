/**
 * Bona Origen — Auto-configuración de impresoras POS.
 * Detecta impresoras USB (vía Rust), identifica marca/modelo, guía driver, asigna nombre/rol, prueba.
 */
(function (global) {
  'use strict';

  async function tauriInvoke(method, args) {
    args = args || {};
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        return await global.__TAURI__.core.invoke(method, args);
      }
    } catch (_) {}
    return null;
  }

  async function detectPrinters() {
    var devices = await tauriInvoke('crozzo_usb_list_devices');
    if (!devices || !devices.length) return [];
    var matches = await tauriInvoke('crozzo_usb_match_printer', { devices: devices });
    return matches || [];
  }

  function showPrinterWizard(matches) {
    if (!matches || !matches.length) {
      if (typeof global.showToast === 'function') global.showToast('No se detectaron impresoras POS conocidas. Use el asistente de rescate.', 'warning');
      if (typeof global.openPrinterRescue === 'function') global.openPrinterRescue('admin');
      return;
    }
    var msg = 'Impresoras detectadas:\n' + matches.map(function (m, i) {
      return (i + 1) + '. ' + m.vendor + ' (' + m.models.slice(0, 3).join(', ') + ') — ' + m.device_name + ' [' + m.status + ']';
    }).join('\n');
    msg += '\n\n¿Desea configurarlas ahora?';
    if (typeof global.confirm === 'function' && !global.confirm(msg)) return;

    // Configure one by one
    (async function () {
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var name = (typeof global.prompt === 'function') ? global.prompt('Nombre para la impresora ' + (i + 1) + ' (' + m.vendor + '):', m.vendor + '_' + (i + 1)) : (m.vendor + '_' + (i + 1));
        if (!name) continue;
        // Assign to config (basic)
        try {
          if (typeof global.config !== 'undefined' && global.config.set) {
            var printers = global.config.get('impresoras') || [];
            printers.push({ name: name, vendor: m.vendor, vid: m.vendor_id, pid: m.product_id, driver: m.driver, port: m.port, role: 'pendiente' });
            global.config.set('impresoras', printers);
            if (typeof global.config.save === 'function') global.config.save();
          }
        } catch (_) {}
        if (typeof global.showToast === 'function') global.showToast('Impresora ' + name + ' configurada.', 'success');
      }
      if (typeof global.showToast === 'function') global.showToast('Configuración de impresoras completada.', 'success');
    })();
  }

  function openWizard() {
    detectPrinters().then(showPrinterWizard).catch(function (e) {
      if (typeof global.showToast === 'function') global.showToast('Error detectando impresoras: ' + (e && e.message ? e.message : e), 'error');
    });
  }

  global.CrozzoPrinterAutoConfig = { detect: detectPrinters, openWizard: openWizard };

  // Register as an AI action if action registry exists
  try {
    if (global.CrozzoAiActionRegistry && typeof global.CrozzoAiActionRegistry.register === 'function') {
      global.CrozzoAiActionRegistry.register('configurar_impresoras', {
        id: 'configurar_impresoras',
        label: 'Configurar impresoras (auto-detectar)',
        confirm: true,
        execute: async function () {
          openWizard();
          return 'Asistente de impresoras abierto.';
        },
      });
    }
  } catch (_) {}

  // FAB / button injection optional
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { /* no auto-open */ }, { once: true });
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);