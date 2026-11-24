/**
 * Bona Origen — Registro de acciones ejecutables del asistente IA (Fase 4).
 * Mapea intent -> función (Tauri invoke o función JS). Confirma antes de ejecutar.
 */
(function (global) {
  'use strict';

  function tauriInvoke(method, args) {
    args = args || {};
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        return global.__TAURI__.core.invoke(method, args);
      }
    } catch (_) {}
    return Promise.resolve(null);
  }

  var ACTIONS = {
    repair_connection: {
      id: 'repair_connection',
      label: 'Reparar conexión',
      confirm: true,
      execute: async function () {
        if (typeof global.crozzoRepararComunicacion === 'function') {
          var steps = await global.crozzoRepararComunicacion();
          return (Array.isArray(steps) ? steps.join(' ') : (steps != null ? String(steps) : 'Reparación ejecutada.'));
        }
        return 'Función de reparación no disponible en este dispositivo.';
      },
    },
    test_printer: {
      id: 'test_printer',
      label: 'Probar impresora',
      confirm: true,
      execute: async function () {
        if (typeof global.crozzoFacturasAdminTestPrint === 'function') {
          try { await global.crozzoFacturasAdminTestPrint('thermal'); } catch (_) {}
          return 'Prueba de impresión enviada.';
        }
        if (typeof global.onRescueTestPrinter === 'function') {
          try { global.onRescueTestPrinter(); } catch (_) {}
          return 'Prueba de impresión solicitada.';
        }
        return 'Servicio de prueba de impresión no disponible.';
      },
    },
    open_printer_rescue: {
      id: 'open_printer_rescue',
      label: 'Abrir asistente de impresora',
      confirm: false,
      execute: async function () {
        if (typeof global.openPrinterRescue === 'function') {
          try { global.openPrinterRescue('admin'); } catch (_) {}
          return 'Asistente de impresora abierto.';
        }
        if (global.CrozzoPrinterRescue && typeof global.CrozzoPrinterRescue.open === 'function') {
          try { global.CrozzoPrinterRescue.open('admin'); } catch (_) {}
          return 'Asistente de impresora abierto.';
        }
        return 'Asistente de impresora no disponible.';
      },
    },
    clear_error_log: {
      id: 'clear_error_log',
      label: 'Limpiar log de errores',
      confirm: true,
      execute: async function () {
        if (global.CrozzoErrorMonitor && typeof global.CrozzoErrorMonitor.clearErrorLog === 'function') {
          global.CrozzoErrorMonitor.clearErrorLog();
          return 'Log de errores limpiado.';
        }
        return 'Monitor de errores no disponible.';
      },
    },
    open_help: {
      id: 'open_help',
      label: 'Abrir centro de ayuda',
      confirm: false,
      execute: async function () {
        if (global.CrozzoHelpHub && typeof global.CrozzoHelpHub.open === 'function') {
          try { global.CrozzoHelpHub.open('home'); } catch (_) {}
          return 'Centro de ayuda abierto.';
        }
        return 'Centro de ayuda no disponible.';
      },
    },
    reindex_rag: {
      id: 'reindex_rag',
      label: 'Reindexar documentos',
      confirm: true,
      execute: async function () {
        var n = null;
        try { n = await tauriInvoke('crozzo_rag_reindex', {}); } catch (_) {}
        if (n == null && global.CrozzoAiAssistant && typeof global.CrozzoAiAssistant.reindex === 'function') {
          try { await global.CrozzoAiAssistant.reindex(); n = 'ok'; } catch (_) {}
        }
        return 'Reindexado: ' + (n != null ? n : '?') + ' chunks.';
      },
    },
    configurar_impresoras: {
      id: 'configurar_impresoras',
      label: 'Configurar impresoras (auto-detectar)',
      confirm: true,
      execute: async function () {
        try {
          if (global.CrozzoPrinterAutoConfig && typeof global.CrozzoPrinterAutoConfig.openWizard === 'function') {
            global.CrozzoPrinterAutoConfig.openWizard();
            return 'Asistente de impresoras abierto. Siga los pasos en pantalla.';
          }
          return 'Módulo de auto-configuración no disponible.';
        } catch (e) {
          return 'Error: ' + (e && e.message ? e.message : e);
        }
      },
    },
    detectar_impresora: {
      id: 'detectar_impresora',
      label: 'Detectar impresoras',
      confirm: false,
      execute: async function () {
        try {
          var list = [];
          if (typeof global.getAvailablePrintersList === 'function') list = global.getAvailablePrintersList() || [];
          if (!list || !list.length) {
            if (typeof global.openPrinterRescue === 'function') {
              try { global.openPrinterRescue('admin'); } catch (_) {}
            }
            return 'No se detectaron impresoras. Se abrió el asistente de rescate de impresora.';
          }
          var names = list.map(function (p) { return (p.name || p.label || p) + (p.status ? ' (' + p.status + ')' : ''); });
          return 'Impresoras detectadas: ' + names.join(', ') + '. Use Configuración → Facturas e impresión para asignarlas.';
        } catch (e) {
          return 'Error detectando impresoras: ' + (e && e.message ? e.message : e);
        }
      },
    },
    report_failures: {
      id: 'report_failures',
      label: 'Reportar fallas',
      confirm: true,
      execute: async function () {
        if (global.CrozzoFailureReporter && typeof global.CrozzoFailureReporter.runAll === 'function') {
          try {
            var r = await global.CrozzoFailureReporter.runAll();
            return (r && r.summary) ? r.summary : 'Reporte de fallas generado.';
          } catch (e) {
            return 'Error generando reporte: ' + (e && e.message ? e.message : e);
          }
        }
        return 'Reportador de fallas no disponible.';
      },
    },
    reporte_ventas_dia: {
      id: 'reporte_ventas_dia',
      label: 'Reporte de ventas del día',
      confirm: false,
      execute: async function () {
        try {
          var ventas = [];
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              ventas = global.config.get('ventas') || global.config.get('facturas') || [];
            }
          } catch (_) {}
          if (!Array.isArray(ventas) || !ventas.length) return 'No hay ventas registradas hoy.';
          var total = 0;
          var porMetodo = {};
          ventas.forEach(function (v) {
            total += Number(v.total || v.monto || 0);
            var m = v.metodoPago || v.metodo || 'otro';
            porMetodo[m] = (porMetodo[m] || 0) + Number(v.total || v.monto || 0);
          });
          var resumen = 'Ventas del día: ' + ventas.length + ' transacciones · Total: $' + total.toLocaleString() + '\nPor método: ' + Object.keys(porMetodo).map(function (k) { return k + ': $' + porMetodo[k].toLocaleString(); }).join(', ');
          // LLM analysis
          var prompt = 'Analiza las ventas del día y da 3 recomendaciones para mejorar. Datos: ' + JSON.stringify(ventas).slice(0, 3000);
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.4, num_predict: 400 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return resumen + (full ? '\n\nAnálisis IA:\n' + full : '');
        } catch (e) {
          return 'Error generando reporte de ventas: ' + (e && e.message ? e.message : e);
        }
      },
    },
    verificar_cierre: {
      id: 'verificar_cierre',
      label: 'Verificar cierre de turno',
      confirm: false,
      execute: async function () {
        try {
          var decls = [];
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              decls = global.config.get('cajaDeclaracionesTurno') || [];
            }
          } catch (_) {}
          if (!Array.isArray(decls) || !decls.length) return 'No hay declaraciones de caja para verificar.';
          var d = decls[0];
          var diff = Number(d.diff) || 0;
          var estado = Math.abs(diff) < 1000 ? 'OK (sin diferencia significativa)' : (diff > 0 ? 'SOBRANTE de $' + diff.toLocaleString() : 'FALTANTE de $' + Math.abs(diff).toLocaleString());
          return 'Verificación de cierre:\nDeclarado: $' + (d.declarado || 0).toLocaleString() + '\nEsperado: $' + (d.esperado || 0).toLocaleString() + '\nDiferencia: ' + estado + '\n' + (Math.abs(diff) >= 1000 ? '⚠️ Revisar arqueo.' : '✅ Cierre coherente.');
        } catch (e) {
          return 'Error verificando cierre: ' + (e && e.message ? e.message : e);
        }
      },
    },
    alertas_stock: {
      id: 'alertas_stock',
      label: 'Alertas de stock bajo',
      confirm: false,
      execute: async function () {
        try {
          var prods = [];
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              prods = global.config.get('productos') || [];
            }
          } catch (_) {}
          if (!Array.isArray(prods) || !prods.length) return 'No hay productos configurados.';
          var low = prods.filter(function (p) { return (Number(p.stock || 0) <= Number(p.stockMin || 5)); });
          if (!low.length) return '✅ Todos los productos tienen stock suficiente.';
          var list = low.map(function (p) { return (p.nombre || p.id) + ' (stock: ' + (p.stock || 0) + ', mín: ' + (p.stockMin || 5) + ')'; }).join('\n');
          return '⚠️ Productos con stock bajo:\n' + list;
        } catch (e) {
          return 'Error revisando stock: ' + (e && e.message ? e.message : e);
        }
      },
    },
    sugerencias_optimizacion: {
      id: 'sugerencias_optimizacion',
      label: 'Sugerencias de optimización',
      confirm: false,
      execute: async function () {
        try {
          // Recopilar datos del sistema
          var ctx = systemContext ? systemContext() : '';
          var journal = global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.exportJson === 'function' ? global.CrozzoOperativeJournal.exportJson() : {};
          var prompt = 'Eres un asesor de negocio para un POS. Analiza los siguientes datos y da 5 sugerencias concretas para mejorar operación, ventas y control. Datos del sistema:\n' + JSON.stringify(journal).slice(0, 3000) + '\nContexto: ' + ctx;
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.5, num_predict: 512 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return full ? full : 'No se pudo generar sugerencias (modelo no disponible).';
        } catch (e) {
          return 'Error generando sugerencias: ' + (e && e.message ? e.message : e);
        }
      },
    },
    llenar_planilla: {
      id: 'llenar_planilla',
      label: 'Llenar planilla (CSV)',
      confirm: true,
      execute: async function () {
        try {
          var rows = [];
          // Si hay datos de auditoría descargados, usarlos
          if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.exportJson === 'function') {
            var data = global.CrozzoOperativeJournal.exportJson();
            if (data && data.events) {
              rows.push('fecha,hora,accion,detalle');
              data.events.forEach(function (e) {
                rows.push([e.ts ? new Date(e.ts).toISOString() : '', e.action || '', (e.detail || '').replace(/,/g, ';')].join(','));
              });
            }
          }
          if (!rows.length) return 'No hay datos para llenar planilla.';
          var csv = rows.join('\n');
          var blob = new Blob([csv], { type: 'text/csv' });
          var url = (global.URL || window.URL).createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = 'planilla_' + Date.now() + '.csv';
          a.click();
          return 'Planilla CSV generada (' + (rows.length - 1) + ' filas).';
        } catch (e) {
          return 'Error llenando planilla: ' + (e && e.message ? e.message : e);
        }
      },
    },
    analizar_costos: {
      id: 'analizar_costos',
      label: 'Analizar costos',
      confirm: false,
      execute: async function () {
        try {
          var text = 'Analiza los costos del negocio. Si hay datos de costos en el sistema, resúmelos.';
          // Intentar leer datos de costos del sistema
          var costData = null;
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              costData = global.config.get('costos') || global.config.get('productos') || null;
            }
          } catch (_) {}
          var prompt = text + (costData ? '\nDatos: ' + JSON.stringify(costData).slice(0, 3000) : '');
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.3, num_predict: 512 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return full ? full : 'Análisis de costos no disponible (modelo no disponible).';
        } catch (e) {
          return 'Error analizando costos: ' + (e && e.message ? e.message : e);
        }
      },
    },
    consultar_datos: {
      id: 'consultar_datos',
      label: 'Consultar datos en lenguaje natural',
      confirm: false,
      execute: async function () {
        try {
          var pregunta = (typeof global.prompt === 'function') ? global.prompt('¿Qué quieres saber? (ej: "¿Qué productos tienen stock bajo?", "¿Cuánto vendí hoy?")') : '';
          if (!pregunta) return 'Cancelado.';
          // Recopilar datos del sistema
          var datos = {};
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              datos.productos = global.config.get('productos') || [];
              datos.ventas = global.config.get('ventas') || global.config.get('facturas') || [];
              datos.clientes = global.config.get('clientes') || [];
            }
          } catch (_) {}
          var prompt = 'Eres un asistente de POS. Responde la siguiente pregunta basándote en los datos proporcionados. Responde en español, conciso y con números concretos.\n\nPregunta: ' + pregunta + '\n\nDatos (JSON): ' + JSON.stringify(datos).slice(0, 6000);
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.3, num_predict: 512 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return full ? full : 'No se pudo obtener respuesta (modelo no disponible).';
        } catch (e) {
          return 'Error consultando datos: ' + (e && e.message ? e.message : e);
        }
      },
    },
    consultar_inventario: {
      id: 'consultar_inventario',
      label: 'Consultar inventario en lenguaje natural',
      confirm: false,
      execute: async function () {
        try {
          var pregunta = (typeof global.prompt === 'function') ? global.prompt('¿Qué quieres saber del inventario? (ej: "¿Qué productos tienen stock bajo?", "¿Cuánto vale el inventario?")') : '';
          if (!pregunta) return 'Cancelado.';
          var prods = [];
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              prods = global.config.get('productos') || [];
            }
          } catch (_) {}
          var prompt = 'Eres un asistente de inventario POS. Responde la pregunta basándote en los datos. Responde en español, conciso, con números.\n\nPregunta: ' + pregunta + '\n\nProductos (JSON): ' + JSON.stringify(prods).slice(0, 6000);
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.3, num_predict: 512 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return full ? full : 'No se pudo obtener respuesta (modelo no disponible).';
        } catch (e) {
          return 'Error: ' + (e && e.message ? e.message : e);
        }
      },
    },
    consultar_ventas: {
      id: 'consultar_ventas',
      label: 'Consultar ventas en lenguaje natural',
      confirm: false,
      execute: async function () {
        try {
          var pregunta = (typeof global.prompt === 'function') ? global.prompt('¿Qué quieres saber de las ventas? (ej: "¿Cuánto vendí hoy?", "¿Cuál es el producto más vendido?")') : '';
          if (!pregunta) return 'Cancelado.';
          var ventas = [];
          try {
            if (typeof global.config !== 'undefined' && global.config.get) {
              ventas = global.config.get('ventas') || global.config.get('facturas') || [];
            }
          } catch (_) {}
          var prompt = 'Eres un asistente de ventas POS. Responde la pregunta basándote en los datos. Responde en español, conciso, con números.\n\nPregunta: ' + pregunta + '\n\nVentas (JSON): ' + JSON.stringify(ventas).slice(0, 6000);
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.3, num_predict: 512 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return full ? full : 'No se pudo obtener respuesta (modelo no disponible).';
        } catch (e) {
          return 'Error: ' + (e && e.message ? e.message : e);
        }
      },
    },
      label: 'Analizar factura',
      confirm: true,
      execute: async function () {
        try {
          var text = (typeof global.prompt === 'function') ? global.prompt('Pega el texto de la factura (XML/PDF/texto):') : '';
          if (!text) return 'Cancelado: sin texto.';
          var prompt = 'Extrae de la siguiente factura un JSON con: proveedor, fecha, items (nombre, cantidad, unidad, precio_unit, total, categoria: materia_prima|gasto|servicio), total. Texto:\n' + text;
          var url = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: url, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(url + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.2, num_predict: 1024 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          if (!full) return 'Sin respuesta del modelo.';
          var jsonMatch = full.match(/\{[\s\S]*\}/);
          var parsed = null;
          if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch (_) {} }
          if (parsed) {
            return 'Factura analizada: ' + (parsed.proveedor || '?') + ' · ' + (parsed.items ? parsed.items.length : 0) + ' ítems · Total: ' + (parsed.total || '?');
          }
          return 'Respuesta del modelo (no JSON): ' + full.slice(0, 500);
        } catch (e) {
          return 'Error analizando factura: ' + (e && e.message ? e.message : e);
        }
      },
    },
    auditoria_cajero: {
      id: 'auditoria_cajero',
      label: 'Auditoría de cajero',
      confirm: true,
      execute: async function () {
        try {
          var journal = global.CrozzoOperativeJournal;
          var data = (journal && typeof journal.exportJson === 'function') ? journal.exportJson() : {};
          var summary = 'Eventos: ' + (data && data.events ? data.events.length : 0) + '.\n';
          // Descargar JSON
          try {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = (global.URL || window.URL).createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'auditoria_cajero_' + Date.now() + '.json';
            a.click();
          } catch (_) {}
          // Pedir al LLM que analice
          var prompt = 'Eres un auditor de un punto de venta. Analiza la siguiente auditoria de cajero del POS y responde en espanol con conclusiones claras y accionables: 1) anomalias detectadas, 2) acciones sospechosas, 3) recomendaciones. Cita evidencias (eventos/timestamps) cuando sea posible. Datos JSON:\n' + JSON.stringify(data).slice(0, 6000);
          var modelUrl = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_url')) || 'http://127.0.0.1:11434';
          var model = (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_ollama_model')) || 'phi4-mini';
          var full = '';
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_ollama_chat', { url: modelUrl, model: model, prompt: prompt, timeout_ms: 60000 });
            if (r) { try { var j = JSON.parse(r); full = (j && j.response) ? j.response : (j && j.message && j.message.content) ? j.message.content : ''; } catch (_) { full = String(r); } }
          } else {
            var resp = await fetch(modelUrl + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, prompt: prompt, stream: false, options: { temperature: 0.3, num_predict: 512 } }) });
            if (resp.ok) { var j2 = await resp.json(); full = j2.response || ''; }
          }
          return (full ? full : 'Auditoría descargada. ' + summary + ' (LLM no disponible para análisis automático.)');
        } catch (e) {
          return 'Error en auditoría: ' + (e && e.message ? e.message : e);
        }
      },
    },
    diagnosticar_sistema: {
      id: 'diagnosticar_sistema',
      label: 'Diagnosticar sistema',
      confirm: false,
      execute: async function () {
        try {
          if (global.CrozzoComunicacionDiag && typeof global.CrozzoComunicacionDiag.run === 'function') {
            global.CrozzoComunicacionDiag.run();
            return 'Diagnóstico de comunicación ejecutado. Revise el panel de diagnóstico.';
          }
          if (global.CrozzoDeploymentCenter && typeof global.CrozzoDeploymentCenter.abrir === 'function') {
            global.CrozzoDeploymentCenter.abrir();
            return 'Centro de despliegue/diagnóstico abierto.';
          }
          return 'No hay módulo de diagnóstico disponible.';
        } catch (e) {
          return 'Error diagnosticando: ' + (e && e.message ? e.message : e);
        }
      },
    },
    reparar_sistema: {
      id: 'reparar_sistema',
      label: 'Reparar sistema',
      confirm: true,
      execute: async function () {
        try {
          if (global.CrozzoComunicacionDiag && typeof global.CrozzoComunicacionDiag.repair === 'function') {
            await global.CrozzoComunicacionDiag.repair();
            return 'Reparación de comunicación ejecutada.';
          }
          return 'No hay módulo de reparación disponible.';
        } catch (e) {
          return 'Error reparando: ' + (e && e.message ? e.message : e);
        }
      },
    },
    instalacion_asistente: {
      id: 'instalacion_asistente',
      label: 'Asistente de instalación',
      confirm: false,
      execute: async function () {
        try {
          if (global.CrozzoDeploymentCenter && typeof global.CrozzoDeploymentCenter.abrir === 'function') {
            global.CrozzoDeploymentCenter.abrir();
            return 'Centro de despliegue abierto (pestaña Despliegue).';
          }
          return 'Centro de despliegue no disponible.';
        } catch (e) {
          return 'Error: ' + (e && e.message ? e.message : e);
        }
      },
    },
  };

  function get(id) {
    return ACTIONS[id] || null;
  }

  function list() {
    return Object.keys(ACTIONS).map(function (k) { return ACTIONS[k]; });
  }

  async function execute(id) {
    var action = get(id);
    if (!action) return { error: 'Acción desconocida: ' + id };
    // Role gate: solo super admin, admin, encargado
    var allowed = false;
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) allowed = true;
      else if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.rol) {
          var r = String(u.rol).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
          if (r === 'admin' || r === 'encargado' || r === 'superadmin' || r === 'super_admin') allowed = true;
        }
      }
    } catch (_) {}
    if (!allowed) return { error: 'Permiso denegado: solo Super Admin, Admin y Encargado.' };
    if (action.confirm) {
      try {
        var ok = (typeof global.confirm === 'function') ? global.confirm('¿Ejecutar acción: ' + action.label + '?') : true;
        if (!ok) return { cancelled: true };
      } catch (_) {}
    }
    try {
      var result = await action.execute();
      return { ok: true, result: result };
    } catch (e) {
      return { error: (e && e.message) ? e.message : String(e) };
    }
  }

  global.CrozzoAiActionRegistry = {
    ACTIONS: ACTIONS,
    get: get,
    list: list,
    execute: execute,
  };
})(typeof window !== 'undefined' ? window : globalThis);