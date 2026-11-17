/**
 * CrozzoDeploymentCenter — Centro de Despliegue Unificado (3 Caras).
 *
 * Cara 1: Despliegue Inicial — Configuración paso a paso según tipo de negocio
 * Cara 2: Solucionador de Problemas — Detección y solución automática
 * Cara 3: Diagnóstico en Tiempo Real — Salud del sistema
 *
 * Accesible solo para Super Admin (KENNY).
 */
(function (global) {
  'use strict';

  var DC_ID = 'crozzoDeploymentCenter';
  var _face = 'deploy'; // 'deploy' | 'solver' | 'diagnostic'
  var _currentStep = 0;
  var _completedSteps = {};
  var _monitorInterval = null;

  // ── Pasos del despliegue ──────────────────────────────────────────
  var DEPLOY_STEPS = [
    { id: 'empresa', label: 'Empresa', desc: 'Datos básicos del negocio' },
    { id: 'impuestos', label: 'Impuestos', desc: 'IVA, INC, facturación' },
    { id: 'salon', label: 'Salón y mesas', desc: 'Cantidad de mesas y pedidos para llevar' },
    { id: 'usuarios', label: 'Usuarios', desc: 'Crear usuarios y roles' },
    { id: 'impresoras', label: 'Impresoras', desc: 'Detectar y configurar' },
    { id: 'red', label: 'Red', desc: 'Conexión y dispositivos' },
    { id: 'nube', label: 'Nube', desc: 'Supabase y sync' },
    { id: 'verificacion', label: 'Verificación', desc: 'Test final' },
  ];

  // ── Tipos de negocio ─────────────────────────────────────────────
  var BUSINESS_TYPES = [
    { id: 'restaurante_pequeno', label: 'Restaurante pequeño', roles: ['admin', 'caja', 'mesero', 'cocina'], printers: ['recibo', 'cocina'] },
    { id: 'restaurante_mediano', label: 'Restaurante mediano', roles: ['admin', 'encargado', 'caja', 'mesero', 'cocina', 'inventario'], printers: ['recibo', 'recibo', 'cocina', 'cocina', 'bar'] },
    { id: 'restaurante_grande', label: 'Restaurante grande', roles: ['admin', 'encargado', 'caja', 'mesero', 'cocina', 'inventario', 'compras'], printers: ['recibo', 'recibo', 'recibo', 'cocina', 'cocina', 'cocina', 'bar', 'bar', 'etiquetas'] },
    { id: 'tienda_pequena', label: 'Tienda pequeña', roles: ['admin', 'caja'], printers: ['recibo'] },
    { id: 'supermercado', label: 'Supermercado', roles: ['admin', 'caja', 'inventario', 'compras'], printers: ['recibo', 'recibo', 'etiquetas'] },
    { id: 'hotel', label: 'Hotel (F&B)', roles: ['admin', 'recepcion', 'mesero', 'cocina'], printers: ['recibo', 'recibo', 'cocina', 'cocina', 'bar'] },
    { id: 'bodega', label: 'Bodega/Suministros', roles: ['admin', 'inventario', 'compras'], printers: ['recibo', 'etiquetas'] },
    { id: 'demo', label: 'Demo (datos ficticios)', roles: ['admin', 'caja', 'mesero'], printers: [] },
  ];

  // ── Base de datos de impresoras conocidas (expandida) ────────────
  var PRINTER_DB = [
    { vendor: 'Epson', ids: [0x04B8], models: ['TM-T20II', 'TM-T20III', 'TM-T82II', 'TM-T82III', 'TM-T88V', 'TM-T88VI', 'TM-T88VII', 'TM-m30', 'TM-m30II', 'TM-m30III', 'TM-U220', 'TM-T70', 'TM-P20', 'TM-P60II', 'TM-P80'], driver: 'Epson Advanced Printer Driver', port: 'USB/Serial' },
    { vendor: 'Star Micronics', ids: [0x0519], models: ['TSP100III', 'TSP143III', 'TSP654II', 'TSP700II', 'mC-Print3', 'mPOP', 'BSC10', 'SP700'], driver: 'Star futurePRNT', port: 'USB' },
    { vendor: 'Bixolon', ids: [0x1504], models: ['SRP-350III', 'SRP-350plusIII', 'SRP-E300', 'SRP-S300', 'SRP-275III', 'SPP-R200III', 'SPP-R310'], driver: 'Bixolon Unified Driver', port: 'USB' },
    { vendor: 'Citizen', ids: [0x08BD, 0x1D90, 0x2730], models: ['CT-S310II', 'CT-S4000', 'CT-S601', 'CT-S651', 'CT-E351', 'CT-E651'], driver: 'Citizen Driver', port: 'USB' },
    { vendor: 'Zebra', ids: [0x0A5F], models: ['ZD220', 'ZD421', 'ZD621', 'ZT230', 'ZT411', 'GK420t', 'GK420d', 'ZQ520', 'ZQ630'], driver: 'Zebra ZDesigner', port: 'USB' },
    { vendor: 'NCR', ids: [0x0404], models: ['7197', '7199', '7167', 'RealPOS 7197'], driver: 'NCR Driver', port: 'USB' },
    { vendor: 'Custom', ids: [0x0DD4], models: ['VKP80', 'TG2480', 'TL60'], driver: 'Custom Driver', port: 'USB' },
    { vendor: 'OKI', ids: [0x06BC], models: ['POS Printer'], driver: 'OKI Driver', port: 'USB' },
    { vendor: 'Fujitsu', ids: [0x04C5], models: ['FTP-628', 'FTP-638'], driver: 'Fujitsu Driver', port: 'USB' },
    { vendor: 'TSC', ids: [0x1203], models: ['TTP-244 Plus', 'TTP-342', 'TE200', 'TE300'], driver: 'TSC Driver', port: 'USB' },
    { vendor: 'Dymo', ids: [0x0922], models: ['LabelWriter 450', 'LabelWriter 550'], driver: 'Dymo Driver', port: 'USB' },
    { vendor: 'Xprinter/Generic', ids: [0x0416, 0x0FE6, 0x154F], models: ['XP-58', 'XP-80', 'XP-58IIH', 'POS-58', 'POS-80', 'Generic 58mm', 'Generic 80mm', 'POS58', 'POS80'], driver: 'Generic / Text Only', port: 'USB' },
    { vendor: 'HP', ids: [0x03F0], models: ['OfficeJet', 'LaserJet', 'DeskJet'], driver: 'HP Universal Print Driver', port: 'USB/Network' },
    { vendor: 'Bematech/Elgin', ids: [], models: ['MP-4200 TH', 'MP-2800', 'I9'], driver: 'Elgin Driver', port: 'USB' },
    { vendor: 'Daruma', ids: [], models: ['DR700', 'DR800'], driver: 'Daruma Driver', port: 'USB' },
    { vendor: 'Sweda', ids: [], models: ['SI-300', 'SI-500'], driver: 'Sweda Driver', port: 'USB' },
    { vendor: 'Tanca', ids: [], models: ['TP-650', 'TP-550'], driver: 'Tanca Driver', port: 'USB' },
    { vendor: 'Sunmi', ids: [], models: ['V2', 'V2s', 'P2', 'T2'], driver: 'Built-in (Android)', port: 'Internal' },
    { vendor: 'Rongta', ids: [], models: ['RP80', 'RP326', 'RPP02N'], driver: 'Rongta Driver', port: 'USB' },
    { vendor: 'HOIN', ids: [], models: ['HOP-E200', 'HOP-E58', 'HOP-E80'], driver: 'HOIN Driver', port: 'USB' },
    { vendor: 'Cashino', ids: [], models: ['P80', 'P58', 'P58H'], driver: 'Cashino Driver', port: 'USB' },
  ];

  // ── Estado ───────────────────────────────────────────────────────
  var _state = { businessType: null, facturacion: null, completedSteps: {} };

  function loadState() {
    try {
      var raw = localStorage.getItem('crozzo_deploy_state');
      if (raw) {
        var st = JSON.parse(raw);
        _state = Object.assign(_state, st);
      }
    } catch (_) {}
  }

  function saveState() {
    try { localStorage.setItem('crozzo_deploy_state', JSON.stringify(_state)); } catch (_) {}
  }

  // ── Abrir centro ─────────────────────────────────────────────────
  function abrir() {
    if (typeof isSuperAdminUser === 'function' && !isSuperAdminUser()) {
      if (typeof showToast === 'function') showToast('Solo Super Admin puede acceder.', 'warning');
      return;
    }
    loadState();
    var existing = document.getElementById(DC_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = DC_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:800px;width:95%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml(renderTabs() + '<div id="dc-content" style="margin-top:16px;"></div>');
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('dcClose').onclick = function () { cerrar(); };
    renderFace();
  }

  function cerrar() {
    if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
    var el = document.getElementById(DC_ID);
    if (el) el.remove();
  }

  // ── Tabs (3 caras) ───────────────────────────────────────────────
  function renderTabs() {
    var tabs = [
      { id: 'deploy', label: ' Despliegue' },
      { id: 'solver', label: ' Solucionador' },
      { id: 'diagnostic', label: ' Diagnóstico' },
    ];
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<h2 style="margin:0;font-size:1.3rem;color:#1a1a2e;">Centro de Despliegue Unificado</h2>' +
      '<button id="dcClose" style="border:none;background:none;font-size:1.5rem;cursor:pointer;color:#999;"></button>' +
      '</div>' +
      '<div style="display:flex;gap:4px;border-bottom:2px solid #eee;padding-bottom:8px;">' +
      tabs.map(function (t) {
        var active = t.id === _face ? 'background:#1a1a2e;color:#fff;' : 'background:#f1f3f5;color:#666;';
        return '<button onclick="window._dcSwitchFace(\'' + t.id + '\')" style="padding:8px 16px;border:none;border-radius:8px 8px 0 0;cursor:pointer;font-size:0.9rem;' + active + '">' + t.label + '</button>';
      }).join('') +
      '</div>';
  }

  global._dcSwitchFace = function (face) {
    _face = face;
    var overlay = document.getElementById(DC_ID);
    if (!overlay) return;
    var card = overlay.querySelector('div[style*="max-width"]');
    if (card) {
      card.innerHTML = CrozzoSanitize.sanitizeHtml(renderTabs() + '<div id="dc-content" style="margin-top:16px;"></div>');
      document.getElementById('dcClose').onclick = function () { cerrar(); };
    }
    renderFace();
  };

  function renderFace() {
    var content = document.getElementById('dc-content');
    if (!content) return;
    if (_face === 'deploy') content.innerHTML = CrozzoSanitize.sanitizeHtml(renderDeployFace());
    else if (_face === 'solver') content.innerHTML = CrozzoSanitize.sanitizeHtml(renderSolverFace());
    else if (_face === 'diagnostic') content.innerHTML = CrozzoSanitize.sanitizeHtml(renderDiagnosticFace());
  }

  // ══════════════════════════════════════════════════════════════════
  // CARA 1: DESPLIEGUE INICIAL
  // ══════════════════════════════════════════════════════════════════
  function renderDeployFace() {
    if (!_state.businessType) {
      return renderBusinessTypeSelection();
    }
    return renderDeploySteps();
  }

  function renderBusinessTypeSelection() {
    var html = '<h3 style="margin:0 0 12px;">¿Qué tipo de negocio vas a desplegar?</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    BUSINESS_TYPES.forEach(function (bt) {
      html += '<button onclick="window._dcSelectBusiness(\'' + bt.id + '\')" style="padding:12px;border:1px solid #ddd;border-radius:8px;background:#f8f9fa;cursor:pointer;text-align:left;font-size:0.9rem;">' +
        bt.label + '<br><span style="font-size:0.75rem;color:#999;">' + bt.roles.join(', ') + '</span></button>';
    });
    html += '</div>';
    return html;
  }

  global._dcSelectBusiness = function (typeId) {
    var bt = BUSINESS_TYPES.find(function (b) { return b.id === typeId; });
    if (!bt) return;
    _state.businessType = typeId;
    _state.roles = bt.roles;
    _state.printers = bt.printers;
    if (typeId === 'demo') {
      _state.facturacion = 'demo';
    }
    saveState();
    renderFace();
  };

  function renderDeploySteps() {
    var bt = BUSINESS_TYPES.find(function (b) { return b.id === _state.businessType; });
    var html = '<div style="margin-bottom:12px;padding:8px;background:#e8f5e9;border-radius:6px;font-size:0.85rem;">' +
      'Negocio: <strong>' + (bt ? bt.label : '') + '</strong> · ' +
      '<button onclick="window._dcResetBusiness()" style="border:none;background:none;color:#e74c3c;cursor:pointer;font-size:0.8rem;">Cambiar</button></div>';

    html += '<div style="display:flex;gap:16px;">';
    // Sidebar de pasos
    html += '<div style="flex:0 0 180px;">';
    DEPLOY_STEPS.forEach(function (step, idx) {
      var done = _state.completedSteps[step.id] ? '' : '·';
      var active = idx === _currentStep;
      html += '<div onclick="window._dcGoToStep(' + idx + ')" style="padding:6px 8px;border-radius:6px;cursor:pointer;margin:2px 0;' + (active ? 'background:#1a1a2e;color:#fff;' : 'color:#666;') + '">' +
        done + ' ' + step.label + '</div>';
    });
    html += '</div>';

    // Contenido del paso
    html += '<div style="flex:1;" id="dc-step-content"></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button onclick="window._dcPrevStep()" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;cursor:pointer;">← Anterior</button>' +
      '<button onclick="window._dcNextStep()" style="padding:6px 12px;border:none;border-radius:6px;background:#1a1a2e;color:#fff;cursor:pointer;margin-left:auto;">Siguiente →</button>' +
      '</div>';

    // Renderizar después de insertar HTML
    setTimeout(function () { renderDeployStepContent(); }, 50);
    return html;
  }

  global._dcResetBusiness = function () {
    _state.businessType = null;
    _state.completedSteps = {};
    saveState();
    renderFace();
  };

  global._dcGoToStep = function (idx) {
    _currentStep = idx;
    saveState();
    renderDeployStepContent();
    // Update sidebar active
    var items = document.querySelectorAll('#dc-content > div > div:first-child > div');
    items.forEach(function (el, i) {
      el.style.background = i === idx ? '#1a1a2e' : '';
      el.style.color = i === idx ? '#fff' : '#666';
    });
  };

  global._dcNextStep = function () {
    if (_currentStep < DEPLOY_STEPS.length - 1) {
      _currentStep++;
      saveState();
      renderDeployStepContent();
    }
  };

  global._dcPrevStep = function () {
    if (_currentStep > 0) {
      _currentStep--;
      saveState();
      renderDeployStepContent();
    }
  };

  // ── Paso: Salón y mesas ──────────────────────────────────────────
  function renderSalonStep() {
    var cfg = (typeof getSalonConfig === 'function') ? getSalonConfig() : { mesaCount: 40, llevarCount: 10, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero' };
    var html = '<p style="font-size:0.85rem;color:#666;margin-bottom:12px;">Configura la cantidad de mesas y pedidos para llevar.</p>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    html += '<label style="font-size:0.85rem;">Cantidad de mesas (1-100)</label>';
    html += '<input id="dcSalonMesas" type="number" min="1" max="100" value="' + (cfg.mesaCount || 40) + '" style="padding:6px;border:1px solid #ddd;border-radius:4px;">';
    html += '<label style="font-size:0.85rem;">Cantidad de pedidos para llevar (1-60)</label>';
    html += '<input id="dcSalonLlevar" type="number" min="1" max="60" value="' + (cfg.llevarCount || 10) + '" style="padding:6px;border:1px solid #ddd;border-radius:4px;">';
    html += '<label style="font-size:0.85rem;">Etiqueta mesas en tablet</label>';
    html += '<select id="dcSalonMesaEtiqueta" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
      '<option value="solo_numero" ' + (cfg.mesaEtiquetaTablet === 'solo_numero' ? 'selected' : '') + '>Solo número</option>' +
      '<option value="nombre" ' + (cfg.mesaEtiquetaTablet === 'nombre' ? 'selected' : '') + '>Nombre completo</option>' +
      '</select>';
    html += '<label style="font-size:0.85rem;">Etiqueta llevar en tablet</label>';
    html += '<select id="dcSalonLlevarEtiqueta" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
      '<option value="solo_numero" ' + (cfg.llevarEtiquetaTablet === 'solo_numero' ? 'selected' : '') + '>Solo número</option>' +
      '<option value="nombre" ' + (cfg.llevarEtiquetaTablet === 'nombre' ? 'selected' : '') + '>Nombre completo</option>' +
      '</select>';
    html += '<button onclick="window._dcSaveSalon()" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#2ecc71;color:#fff;cursor:pointer;">Guardar configuración de salón</button>';
    html += '</div>';
    html += '<p style="font-size:0.75rem;color:#999;margin-top:8px;">Los cambios se aplican al guardar. Las mesas se generan automáticamente (M1, M2, ... M' + (cfg.mesaCount || 40) + ').</p>';
    return html;
  }

  global._dcSaveSalon = function () {
    var mesaCount = parseInt(document.getElementById('dcSalonMesas').value, 10) || 40;
    var llevarCount = parseInt(document.getElementById('dcSalonLlevar').value, 10) || 10;
    var mesaEtiqueta = document.getElementById('dcSalonMesaEtiqueta').value;
    var llevarEtiqueta = document.getElementById('dcSalonLlevarEtiqueta').value;

    if (typeof saveSalonConfig === 'function') {
      saveSalonConfig({
        mesaCount: mesaCount,
        llevarCount: llevarCount,
        mesaEtiquetaTablet: mesaEtiqueta,
        llevarEtiquetaTablet: llevarEtiqueta,
      });
      if (typeof applySalonSlotsToRuntime === 'function') {
        applySalonSlotsToRuntime({ silent: true });
      }
      if (typeof showToast === 'function') showToast('Configuración de salón guardada: ' + mesaCount + ' mesas, ' + llevarCount + ' para llevar', 'success');
    } else if (typeof config !== 'undefined' && config.set) {
      config.set('salon', {
        mesaCount: mesaCount,
        llevarCount: llevarCount,
        mesaEtiquetaTablet: mesaEtiqueta,
        llevarEtiquetaTablet: llevarEtiqueta,
        mesaNombres: {},
        llevarNombres: {},
      });
      if (typeof showToast === 'function') showToast('Configuración de salón guardada', 'success');
    }
    _dcMarkStep('salon');
  };

  function renderDeployStepContent() {
    var el = document.getElementById('dc-step-content');
    if (!el) return;
    var step = DEPLOY_STEPS[_currentStep];
    if (!step) return;

    var html = '<h3 style="margin:0 0 8px;">' + step.label + '</h3>';

    switch (step.id) {
      case 'empresa':
        html += '<p style="font-size:0.85rem;color:#666;">Configura los datos de tu negocio.</p>';
        html += '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<input id="dcEmpNombre" placeholder="Nombre comercial" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          '<input id="dcEmpNit" placeholder="NIT / RUT" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          '<input id="dcEmpDir" placeholder="Dirección" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          '<input id="dcEmpTel" placeholder="Teléfono" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          '<input id="dcEmpEmail" placeholder="Email" style="padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          '<button onclick="window._dcSaveEmpresa()" style="padding:6px 12px;border:none;border-radius:4px;background:#2ecc71;color:#fff;cursor:pointer;">Guardar</button>' +
          '</div>';
        break;
      case 'impuestos':
        html += '<p style="font-size:0.85rem;color:#666;">Configura impuestos y facturación.</p>';
        html += '<p style="font-size:0.85rem;">Ve a <strong>Configuración → Impuestos</strong> y <strong>Config. DIAN</strong>.</p>';
        html += '<button onclick="window._dcMarkStep(\'impuestos\')" style="padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;">Marcar completado</button>';
        break;
      case 'salon':
        html += renderSalonStep();
        break;
      case 'usuarios':
        html += '<p style="font-size:0.85rem;color:#666;">Roles sugeridos para este negocio: <strong>' + (_state.roles || []).join(', ') + '</strong></p>';
        html += '<p style="font-size:0.85rem;">Ve a <strong>Configuración → Usuarios</strong> para crearlos.</p>';
        html += '<button onclick="window._dcMarkStep(\'usuarios\')" style="padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;">Marcar completado</button>';
        break;
      case 'impresoras':
        html += renderPrinterDetection();
        break;
      case 'red':
        html += '<p style="font-size:0.85rem;color:#666;">Configura la conexión de red.</p>';
        html += '<button onclick="if(typeof wizardOpen===\'function\')wizardOpen();" style="padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;margin-right:4px;">Abrir asistente de conexión</button>';
        html += '<button onclick="window._dcMarkStep(\'red\')" style="padding:6px 12px;border:none;border-radius:4px;background:#2ecc71;color:#fff;cursor:pointer;">Marcar completado</button>';
        break;
      case 'nube':
        html += '<p style="font-size:0.85rem;color:#666;">Configura la nube y sincronización.</p>';
        html += '<p style="font-size:0.85rem;">Ve a <strong>Configuración → Nube global</strong>.</p>';
        html += '<button onclick="window._dcMarkStep(\'nube\')" style="padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;">Marcar completado</button>';
        break;
      case 'verificacion':
        html += '<p style="font-size:0.85rem;color:#666;">Verificación final del despliegue.</p>';
        html += '<button onclick="window._dcRunVerification()" style="padding:6px 12px;border:none;border-radius:4px;background:#2ecc71;color:#fff;cursor:pointer;">Ejecutar verificación</button>';
        break;
    }

    el.innerHTML = CrozzoSanitize.sanitizeHtml(html);
  }

  function renderPrinterDetection() {
    var webUsbAvailable = (typeof navigator !== 'undefined' && navigator.usb);
    var html = '<p style="font-size:0.85rem;color:#666;">Detecta e instala impresoras automáticamente.</p>';
    html += '<div style="margin:8px 0;padding:8px;background:#f1f3f5;border-radius:6px;font-size:0.8rem;">' +
      'WebUSB: ' + (webUsbAvailable ? ' Disponible' : ' No disponible (usar detección nativa)') + '</div>';

    if (webUsbAvailable) {
      html += '<button onclick="window._dcDetectPrinters()" style="padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;margin-right:4px;">Detectar impresoras USB</button>';
    }
    html += '<button onclick="if(typeof crozzoAdminRefreshSystemPrinters===\'function\')crozzoAdminRefreshSystemPrinters();" style="padding:6px 12px;border:none;border-radius:4px;background:#6c757d;color:#fff;cursor:pointer;margin-right:4px;">Listar impresoras del sistema</button>';
    html += '<button onclick="window._dcMarkStep(\'impresoras\')" style="padding:6px 12px;border:none;border-radius:4px;background:#2ecc71;color:#fff;cursor:pointer;">Marcar completado</button>';

    // Mostrar impresoras conocidas
    html += '<div style="margin-top:12px;"><strong style="font-size:0.85rem;">Impresoras conocidas:</strong></div>';
    html += '<div style="max-height:120px;overflow-y:auto;font-size:0.75rem;margin-top:4px;">';
    PRINTER_DB.forEach(function (p) {
      html += '<div style="padding:2px 0;">' + p.vendor + ': ' + p.models.join(', ') + '</div>';
    });
    html += '</div>';

    return html;
  }

  global._dcDetectPrinters = async function () {
    if (!navigator.usb) {
      if (typeof showToast === 'function') showToast('WebUSB no disponible. Usando detección nativa del sistema.', 'warning');
      return;
    }
    try {
      var device = await navigator.usb.requestDevice({ filters: PRINTER_DB.filter(function (p) { return p.ids.length > 0; }).map(function (p) { return { vendorId: p.ids[0] }; }) });
      var found = PRINTER_DB.find(function (p) { return p.ids.indexOf(device.vendorId) >= 0; });
      var msg = 'Impresora detectada: ' + (device.productName || device.manufacturerName || 'Desconocida');
      if (found) msg += ' (' + found.vendor + ' — ' + found.driver + ')';
      if (typeof showToast === 'function') showToast(msg, 'success');
      // Guardar en localStorage
      try {
        var detected = JSON.parse(localStorage.getItem('crozzo_detected_printers') || '[]');
        detected.push({ vendor: found ? found.vendor : 'Desconocido', product: device.productName || '', vendorId: device.vendorId, productId: device.productId, detectedAt: new Date().toISOString() });
        localStorage.setItem('crozzo_detected_printers', JSON.stringify(detected));
      } catch (_) {}
    } catch (e) {
      if (typeof showToast === 'function') showToast('No se detectó impresora: ' + (e.message || e), 'warning');
    }
  };

  // ── Verificar impresoras del sistema (nativo Tauri) ──────────────
  global._dcCheckPrinters = function () {
    var el = document.getElementById('dc-printer-status');
    if (!el) return;
    var printers = (typeof getAvailablePrintersList === 'function') ? getAvailablePrintersList() : [];
    var html = '';
    if (printers.length === 0) {
      html = '<span style="color:#e74c3c;"> No se encontraron impresoras configuradas</span><br>' +
        '<span style="color:#666;">Verifica que las impresoras estén encendidas y conectadas.</span>';
    } else {
      html = printers.map(function (p) { return ' ' + p; }).join('<br>');
    }
    // Mostrar detectadas por WebUSB
    try {
      var detected = JSON.parse(localStorage.getItem('crozzo_detected_printers') || '[]');
      if (detected.length > 0) {
        html += '<br><br><strong>Detectadas por WebUSB:</strong><br>';
        html += detected.map(function (d) { return ' ' + (d.vendor || 'Desconocido') + ' — ' + (d.product || 'Sin nombre') + ' (' + new Date(d.detectedAt).toLocaleString() + ')'; }).join('<br>');
      }
    } catch (_) {}
    el.innerHTML = CrozzoSanitize.sanitizeHtml(html);
  };

  global._dcSaveEmpresa = function () {
    if (typeof config !== 'undefined' && config.setEmpresa) {
      config.setEmpresa({
        nombreComercial: (document.getElementById('dcEmpNombre') || {}).value || '',
        nit: (document.getElementById('dcEmpNit') || {}).value || '',
        direccion: (document.getElementById('dcEmpDir') || {}).value || '',
        telefono: (document.getElementById('dcEmpTel') || {}).value || '',
        email: (document.getElementById('dcEmpEmail') || {}).value || '',
      });
      if (typeof showToast === 'function') showToast('Datos de empresa guardados', 'success');
      _dcMarkStep('empresa');
    }
  };

  global._dcMarkStep = function (stepId) {
    _state.completedSteps[stepId] = true;
    saveState();
    renderDeployStepContent();
  };

  global._dcRunVerification = function () {
    var results = [];
    // Verificar empresa
    var emp = (typeof config !== 'undefined' && config.getEmpresa) ? config.getEmpresa() : {};
    results.push('Empresa: ' + (emp.nombreComercial ? ' ' + emp.nombreComercial : ' Sin configurar'));
    // Verificar usuarios
    var staff = (typeof getUsuariosConfig === 'function') ? (getUsuariosConfig().staff || []) : [];
    var userCount = staff.filter(function (u) { return u.id !== 'KENNY'; }).length;
    results.push('Usuarios: ' + (userCount > 0 ? ' ' + userCount + ' creados' : ' Sin usuarios'));
    // Verificar impresoras
    var printers = (typeof getAvailablePrintersList === 'function') ? getAvailablePrintersList() : [];
    results.push('Impresoras: ' + (printers.length > 0 ? ' ' + printers.length + ' disponibles' : ' Sin impresoras configuradas'));
    // Verificar errores
    var errStats = (typeof CrozzoErrorMonitor !== 'undefined') ? CrozzoErrorMonitor.getErrorStats() : { total: 0 };
    results.push('Errores: ' + (errStats.total === 0 ? ' Sin errores' : ' ' + errStats.total + ' errores'));

    var el = document.getElementById('dc-step-content');
    if (el) {
      el.innerHTML = CrozzoSanitize.sanitizeHtml('<h3> Verificación Final</h3>' +
        '<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;">' +
        results.map(function (r) { return '<div style="font-size:0.9rem;">' + r + '</div>'; }).join('') +
        '</div>' +
        '<button onclick="window._dcMarkStep(\'verificacion\')" style="margin-top:12px;padding:6px 12px;border:none;border-radius:4px;background:#2ecc71;color:#fff;cursor:pointer;">Marcar como completado</button>');
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // CARA 2: SOLUCIONADOR DE PROBLEMAS
  // ══════════════════════════════════════════════════════════════════
  function renderSolverFace() {
    var html = '<h3 style="margin:0 0 12px;"> Solucionador de Problemas</h3>';
    html += '<p style="font-size:0.85rem;color:#666;margin-bottom:12px;">Detecta y soluciona problemas de hardware y conexión.</p>';

    // Diagnóstico de impresoras
    html += '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">' +
      '<strong style="font-size:0.9rem;"> Impresoras</strong><br>' +
      '<button onclick="window._dcCheckPrinters()" style="margin-top:4px;padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;font-size:0.8rem;">Verificar impresoras</button>' +
      '<div id="dc-printer-status" style="margin-top:8px;font-size:0.8rem;"></div>' +
      '</div>';

    // Diagnóstico de conexión
    html += '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">' +
      '<strong style="font-size:0.9rem;"> Conexión</strong><br>' +
      '<button onclick="window._dcCheckConnection()" style="margin-top:4px;padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;font-size:0.8rem;">Verificar conexión</button>' +
      '<div id="dc-conn-status" style="margin-top:8px;font-size:0.8rem;"></div>' +
      '</div>';

    // Diagnóstico de base de datos
    html += '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">' +
      '<strong style="font-size:0.9rem;"> Base de datos</strong><br>' +
      '<button onclick="window._dcCheckDatabase()" style="margin-top:4px;padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;font-size:0.8rem;">Verificar base de datos</button>' +
      '<div id="dc-db-status" style="margin-top:8px;font-size:0.8rem;"></div>' +
      '</div>';

    // Auto-reparación
    html += '<div style="margin-top:12px;padding:12px;background:#fff3cd;border-radius:8px;">' +
      '<strong style="font-size:0.9rem;"> Auto-reparación</strong><br>' +
      '<button onclick="window._dcAutoRepair()" style="margin-top:4px;padding:6px 12px;border:none;border-radius:4px;background:#e67e22;color:#fff;cursor:pointer;font-size:0.8rem;">Ejecutar auto-reparación</button>' +
      '<div id="dc-repair-status" style="margin-top:8px;font-size:0.8rem;"></div>' +
      '</div>';

    return html;
  }

  global._dcCheckPrinters = function () {
    var el = document.getElementById('dc-printer-status');
    if (!el) return;
    var printers = (typeof getAvailablePrintersList === 'function') ? getAvailablePrintersList() : [];
    if (printers.length === 0) {
      el.innerHTML = CrozzoSanitize.sanitizeHtml('<span style="color:#e74c3c;"> No se encontraron impresoras configuradas</span><br>' +
        '<span style="color:#666;">Verifica que las impresoras estén encendidas y conectadas.</span>');
    } else {
      el.innerHTML = CrozzoSanitize.sanitizeHtml(printers.map(function (p) { return ' ' + p; }).join('<br>'));
    }
  };

  global._dcCheckConnection = function () {
    var el = document.getElementById('dc-conn-status');
    if (!el) return;
    var online = navigator.onLine;
    el.innerHTML = CrozzoSanitize.sanitizeHtml('Internet: ' + (online ? ' Conectado' : ' Sin conexión') + '<br>' +
      'Supabase: ' + (typeof CrozzoSuperAdminCentral !== 'undefined' && CrozzoSuperAdminCentral.isAvailable() ? ' Disponible' : ' No disponible'));
  };

  global._dcCheckDatabase = function () {
    var el = document.getElementById('dc-db-status');
    if (!el) return;
    var staff = (typeof getUsuariosConfig === 'function') ? (getUsuariosConfig().staff || []) : [];
    el.innerHTML = CrozzoSanitize.sanitizeHtml('Usuarios: ' + staff.length + '<br>' +
      'Errores: ' + ((typeof CrozzoErrorMonitor !== 'undefined') ? CrozzoErrorMonitor.getErrorStats().total : 0));
  };

  global._dcAutoRepair = async function () {
    var el = document.getElementById('dc-repair-status');
    if (!el) return;
    el.innerHTML = CrozzoSanitize.sanitizeHtml('Ejecutando auto-reparación...');
    var results = [];
    // 1. Verificar conexión
    if (typeof CrozzoEasyConnect !== 'undefined' && CrozzoEasyConnect.runAutoConnect) {
      try { await CrozzoEasyConnect.runAutoConnect({ silent: true }); results.push(' Auto-conexión ejecutada'); } catch (e) { results.push(' Auto-conexión: ' + (e.message || e)); }
    }
    // 2. Verificar errores
    if (typeof CrozzoErrorMonitor !== 'undefined') {
      var stats = CrozzoErrorMonitor.getErrorStats();
      if (stats.total > 0) { CrozzoErrorMonitor.clearErrorLog(); results.push(' Log de errores limpiado (' + stats.total + ' errores)'); }
      else results.push(' Sin errores registrados');
    }
    // 3. Verificar sync
    if (typeof crozzoRunPostLoginCloudSync === 'function') {
      try { crozzoRunPostLoginCloudSync(); results.push(' Sync cloud ejecutado'); } catch (e) { results.push(' Sync: ' + (e.message || e)); }
    }
    el.innerHTML = CrozzoSanitize.sanitizeHtml(results.join('<br>'));
  };

  // ══════════════════════════════════════════════════════════════════
  // CARA 3: DIAGNÓSTICO EN TIEMPO REAL
  // ══════════════════════════════════════════════════════════════════
  function renderDiagnosticFace() {
    var html = '<h3 style="margin:0 0 12px;"> Diagnóstico en Tiempo Real</h3>';
    html += '<div id="dc-diag-content"></div>';
    html += '<div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button onclick="window._dcStartMonitoring()" style="padding:6px 12px;border:none;border-radius:4px;background:#2ecc71;color:#fff;cursor:pointer;font-size:0.8rem;">Iniciar monitoreo</button>' +
      '<button onclick="window._dcStopMonitoring()" style="padding:6px 12px;border:none;border-radius:4px;background:#e74c3c;color:#fff;cursor:pointer;font-size:0.8rem;">Detener</button>' +
      '<button onclick="window._dcExportReport()" style="padding:6px 12px;border:none;border-radius:4px;background:#3498db;color:#fff;cursor:pointer;font-size:0.8rem;">Exportar reporte</button>' +
      '</div>';
    setTimeout(function () { window._dcRefreshDiagnostic(); }, 100);
    return html;
  }

  global._dcRefreshDiagnostic = function () {
    var el = document.getElementById('dc-diag-content');
    if (!el) return;
    var html = '';

    // Impresoras
    html += '<div style="margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:6px;">' +
      '<strong style="font-size:0.85rem;"> Impresoras</strong><br>';
    var printers = (typeof getAvailablePrintersList === 'function') ? getAvailablePrintersList() : [];
    if (printers.length === 0) {
      html += '<span style="font-size:0.8rem;color:#e74c3c;">Sin impresoras configuradas</span>';
    } else {
      printers.forEach(function (p) { html += '<span style="font-size:0.8rem;"> ' + p + '</span><br>'; });
    }
    // Detectadas por WebUSB
    try {
      var detected = JSON.parse(localStorage.getItem('crozzo_detected_printers') || '[]');
      if (detected.length > 0) {
        html += '<br><span style="font-size:0.75rem;color:#666;">Detectadas por WebUSB:</span><br>';
        html += detected.map(function (d) { return '<span style="font-size:0.75rem;"> ' + (d.vendor || '?') + ' — ' + (d.product || '?') + '</span>'; }).join('<br>');
      }
    } catch (_) {}
    html += '</div>';

    // Conexión
    html += '<div style="margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:6px;">' +
      '<strong style="font-size:0.85rem;"> Conexión</strong><br>' +
      '<span style="font-size:0.8rem;">Internet: ' + (navigator.onLine ? ' Conectado' : ' Sin conexión') + '</span><br>' +
      '<span style="font-size:0.8rem;">Supabase: ' + (typeof CrozzoSuperAdminCentral !== 'undefined' && CrozzoSuperAdminCentral.isAvailable() ? ' Disponible' : ' No disponible') + '</span>' +
      '</div>';

    // Base de datos
    html += '<div style="margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:6px;">' +
      '<strong style="font-size:0.85rem;"> Base de datos</strong><br>';
    var staff = (typeof getUsuariosConfig === 'function') ? (getUsuariosConfig().staff || []) : [];
    html += '<span style="font-size:0.8rem;">Usuarios: ' + staff.length + '</span><br>';
    var errStats = (typeof CrozzoErrorMonitor !== 'undefined') ? CrozzoErrorMonitor.getErrorStats() : { total: 0 };
    html += '<span style="font-size:0.8rem;">Errores: ' + (errStats.total || 0) + ' (críticos: ' + (errStats.critical || 0) + ', altos: ' + (errStats.high || 0) + ')</span>' +
      '</div>';

    // Rendimiento
    html += '<div style="margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:6px;">' +
      '<strong style="font-size:0.85rem;"> Rendimiento</strong><br>';
    if (typeof performance !== 'undefined' && performance.memory) {
      html += '<span style="font-size:0.8rem;">Memoria: ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB / ' + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB</span><br>';
    }
    html += '<span style="font-size:0.8rem;">Tiempo de carga: ' + Math.round(performance.now()) + ' ms</span><br>';
    html += '<span style="font-size:0.8rem;">Navegador: ' + (navigator.userAgent.match(/Chrome|Firefox|Safari|Edge/) || ['Desconocido'])[0] + '</span>' +
      '</div>';

    // Historial de problemas
    var problemHistory = [];
    try { problemHistory = JSON.parse(localStorage.getItem('crozzo_problem_history') || '[]'); } catch (_) {}
    if (problemHistory.length > 0) {
      html += '<div style="margin-bottom:8px;padding:8px;background:#fff3cd;border-radius:6px;">' +
        '<strong style="font-size:0.85rem;"> Historial de problemas (' + problemHistory.length + ')</strong><br>';
      problemHistory.slice(-5).forEach(function (p) {
        html += '<span style="font-size:0.75rem;">' + new Date(p.ts).toLocaleString() + ' — ' + p.type + ': ' + p.desc + '</span><br>';
      });
      html += '</div>';
    }

    // Honeypot status
    if (typeof config !== 'undefined') {
      var seg = config.get('seguridad') || {};
      var hp = seg.honeypot || {};
      html += '<div style="margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:6px;">' +
        '<strong style="font-size:0.85rem;"> Honeypot</strong><br>' +
        '<span style="font-size:0.8rem;">Estado: ' + (hp.produccionEstricta ? ' Activo (estricto)' : ' Desactivado') + '</span><br>' +
        '<span style="font-size:0.8rem;">Bloqueos: ' + (hp.tripCount || 0) + ' trips</span><br>' +
        '<span style="font-size:0.8rem;">Cuarentena: ' + (hp.legendaryActive ? ' Activa' : ' Inactiva') + '</span>' +
        '</div>';
    }

    el.innerHTML = CrozzoSanitize.sanitizeHtml(html);
  };

  global._dcStartMonitoring = function () {
    if (_monitorInterval) clearInterval(_monitorInterval);
    _monitorInterval = setInterval(function () { window._dcRefreshDiagnostic(); }, 5000);
    if (typeof showToast === 'function') showToast('Monitoreo iniciado (actualización cada 5s)', 'success');
  };

  global._dcStopMonitoring = function () {
    if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
    if (typeof showToast === 'function') showToast('Monitoreo detenido', 'info');
  };

  global._dcExportReport = function () {
    if (typeof CrozzoFieldDiagnostic !== 'undefined' && CrozzoFieldDiagnostic.downloadFullReport) {
      CrozzoFieldDiagnostic.downloadFullReport();
    } else if (typeof showToast === 'function') {
      showToast('Módulo de reportes no disponible', 'warning');
    }
  };

  // ── Registrar problema en historial ──────────────────────────────
  global._dcLogProblem = function (type, desc) {
    try {
      var history = JSON.parse(localStorage.getItem('crozzo_problem_history') || '[]');
      history.push({ ts: Date.now(), type: type, desc: desc });
      if (history.length > 50) history = history.slice(-50);
      localStorage.setItem('crozzo_problem_history', JSON.stringify(history));
    } catch (_) {}
  };

  // ── Verificar impresoras con WebUSB ──────────────────────────────
  global._dcCheckPrintersWebUSB = async function () {
    var el = document.getElementById('dc-printer-status');
    if (!el) return;
    if (!navigator.usb) {
      el.innerHTML = CrozzoSanitize.sanitizeHtml('<span style="color:#999;">WebUSB no disponible en este navegador</span>');
      return;
    }
    try {
      var device = await navigator.usb.requestDevice({ filters: PRINTER_DB.filter(function (p) { return p.ids.length > 0; }).map(function (p) { return { vendorId: p.ids[0] }; }) });
      var found = PRINTER_DB.find(function (p) { return p.ids.indexOf(device.vendorId) >= 0; });
      var msg = ' Detectada: ' + (device.productName || device.manufacturerName || 'Desconocida');
      if (found) msg += ' (' + found.vendor + ' — ' + found.driver + ')';
      el.innerHTML = CrozzoSanitize.sanitizeHtml(msg);
      _dcLogProblem('impresora', 'Detectada: ' + (device.productName || 'Desconocida'));
    } catch (e) {
      el.innerHTML = CrozzoSanitize.sanitizeHtml('<span style="color:#e74c3c;"> ' + (e.message || e) + '</span>');
    }
  };

  // ── Integración con menú Super Admin ─────────────────────────────
  function patchSuperAdminMenu() {
    var menu = document.getElementById('crozzoSuperAdminMenu');
    if (!menu) return;
    if (document.getElementById('dc-menu-btn')) return;
    var card = menu.querySelector('div[style*="max-width"]');
    if (!card) return;
    var btns = card.querySelector('div[style*="flex-direction:column"]');
    if (!btns) return;
    var btn = document.createElement('button');
    btn.id = 'dc-menu-btn';
    btn.style.cssText = 'padding:14px 20px;border:1px solid #e0e0e0;border-radius:10px;background:#f8f9fa;cursor:pointer;font-size:1rem;text-align:left;';
    btn.innerHTML = CrozzoSanitize.sanitizeHtml('<strong>Centro de Despliegue</strong><br><span style="font-size:0.8rem;color:#888;">Asistente unificado: despliegue, solución de problemas, diagnóstico.</span>');
    btn.onclick = function () { abrir(); };
    var cerrar = document.getElementById('samCerrar');
    if (cerrar && cerrar.parentElement) {
      cerrar.parentElement.insertBefore(btn, cerrar);
    } else {
      btns.appendChild(btn);
    }
  }

  var observer = new MutationObserver(function () { patchSuperAdminMenu(); });
  if (typeof document !== 'undefined') {
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // ── API pública ──────────────────────────────────────────────────
  global.CrozzoDeploymentCenter = {
    abrir: abrir,
    cerrar: cerrar,
    DEPLOY_STEPS: DEPLOY_STEPS,
    BUSINESS_TYPES: BUSINESS_TYPES,
    PRINTER_DB: PRINTER_DB,
  };

  if (typeof document !== 'undefined') {
    loadState();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
