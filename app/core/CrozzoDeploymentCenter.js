/**
 * CrozzoDeploymentCenter — Centro de Despliegue Unificado.
 *
 * Unifica todos los sistemas de configuración/despliegue del POS en un solo
 * asistente paso a paso. Accesible solo para Super Admin (KENNY).
 *
 * Módulos integrados:
 * 1. Empresa y datos fiscales
 * 2. Usuarios y permisos
 * 3. Impresoras y periféricos
 * 4. Conexión y red (wizard existente)
 * 5. Nube y sincronización
 * 6. Diagnóstico y salud del sistema
 * 7. Base de datos (Supabase)
 *
 * Cada módulo puede ejecutarse de forma independiente.
 */
(function (global) {
  'use strict';

  var DC_ID = 'crozzoDeploymentCenter';

  // ── Pasos del despliegue ──────────────────────────────────────────
  var STEPS = [
    { id: 'empresa', label: '🏢 Empresa y datos fiscales', desc: 'Nombre, NIT, dirección, teléfono, email, logo' },
    { id: 'impuestos', label: '💰 Impuestos y facturación', desc: 'IVA, INC, resolución DIAN, rangos de numeración' },
    { id: 'usuarios', label: '👥 Usuarios y permisos', desc: 'Crear usuarios, asignar roles, configurar permisos' },
    { id: 'impresoras', label: '🖨️ Impresoras y periféricos', desc: 'Detectar, configurar y probar impresoras' },
    { id: 'red', label: '🔗 Conexión y red', desc: 'Configurar rol (A/B), IP, puertos, LAN/WAN' },
    { id: 'nube', label: '☁️ Nube y sincronización', desc: 'Supabase, sync, backup, restauración' },
    { id: 'diagnostico', label: '🔍 Diagnóstico y salud', desc: 'Verificar estado del sistema, errores, rendimiento' },
  ];

  var _currentStep = 0;
  var _completedSteps = {};

  // ── Cargar estado guardado ───────────────────────────────────────
  function loadState() {
    try {
      var raw = localStorage.getItem('crozzo_deploy_state');
      if (raw) {
        var st = JSON.parse(raw);
        _completedSteps = st.completed || {};
        _currentStep = st.currentStep || 0;
      }
    } catch (_) {}
  }

  function saveState() {
    try {
      localStorage.setItem('crozzo_deploy_state', JSON.stringify({
        completed: _completedSteps,
        currentStep: _currentStep,
        savedAt: new Date().toISOString(),
      }));
    } catch (_) {}
  }

  // ── Abrir centro de despliegue ───────────────────────────────────
  function abrir() {
    if (typeof isSuperAdminUser === 'function' && !isSuperAdminUser()) {
      if (typeof showToast === 'function') showToast('Solo Super Admin puede acceder al centro de despliegue.', 'warning');
      return;
    }

    loadState();

    var existing = document.getElementById(DC_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = DC_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:720px;width:95%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = renderHTML();
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Event handlers
    document.getElementById('dcClose').onclick = function () { overlay.remove(); };
    document.getElementById('dcNext').onclick = function () { nextStep(); };
    document.getElementById('dcPrev').onclick = function () { prevStep(); };

    // Step click handlers
    STEPS.forEach(function (step, idx) {
      var btn = document.getElementById('dc-step-' + step.id);
      if (btn) {
        btn.onclick = function () { goToStep(idx); };
      }
    });

    renderStep();
  }

  function renderHTML() {
    var stepsHtml = STEPS.map(function (step, idx) {
      var done = _completedSteps[step.id] ? '✅' : '⬜';
      var active = idx === _currentStep ? 'font-weight:700;color:#1a1a2e;' : 'color:#666;';
      return '<div id="dc-step-' + step.id + '" style="padding:8px 12px;border-radius:8px;cursor:pointer;margin:4px 0;' + active + '">' +
        done + ' ' + step.label + '<br><span style="font-size:0.75rem;color:#999;">' + step.desc + '</span></div>';
    }).join('');

    return '<h2 style="margin:0 0 8px;font-size:1.4rem;color:#1a1a2e;">🚀 Centro de Despliegue</h2>' +
      '<p style="margin:0 0 16px;color:#666;font-size:0.9rem;">Asistente unificado para configurar y desplegar el sistema POS.</p>' +
      '<div style="display:flex;gap:16px;">' +
        '<div style="flex:0 0 220px;border-right:1px solid #eee;padding-right:16px;">' + stepsHtml + '</div>' +
        '<div style="flex:1;" id="dc-content"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid #eee;">' +
        '<button id="dcPrev" class="btn btn-outline" style="padding:8px 16px;">← Anterior</button>' +
        '<button id="dcNext" class="btn btn-primary" style="padding:8px 16px;margin-left:auto;">Siguiente →</button>' +
        '<button id="dcClose" class="btn btn-outline" style="padding:8px 16px;">Cerrar</button>' +
      '</div>';
  }

  function renderStep() {
    var content = document.getElementById('dc-content');
    if (!content) return;
    var step = STEPS[_currentStep];
    if (!step) return;

    var html = '<h3 style="margin:0 0 12px;font-size:1.1rem;">' + step.label + '</h3>';

    switch (step.id) {
      case 'empresa':
        html += renderEmpresaStep();
        break;
      case 'impuestos':
        html += renderImpuestosStep();
        break;
      case 'usuarios':
        html += renderUsuariosStep();
        break;
      case 'impresoras':
        html += renderImpresorasStep();
        break;
      case 'red':
        html += renderRedStep();
        break;
      case 'nube':
        html += renderNubeStep();
        break;
      case 'diagnostico':
        html += renderDiagnosticoStep();
        break;
    }

    content.innerHTML = html;
  }

  // ── Paso: Empresa ────────────────────────────────────────────────
  function renderEmpresaStep() {
    var emp = (typeof config !== 'undefined' && config.getEmpresa) ? config.getEmpresa() : {};
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Configura los datos básicos de tu negocio.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<label style="font-size:0.85rem;">Nombre comercial</label>' +
        '<input id="dcEmpNombre" type="text" value="' + (emp.nombreComercial || '') + '" style="padding:8px;border:1px solid #ddd;border-radius:6px;">' +
        '<label style="font-size:0.85rem;">NIT / RUT</label>' +
        '<input id="dcEmpNit" type="text" value="' + (emp.nit || '') + '" style="padding:8px;border:1px solid #ddd;border-radius:6px;">' +
        '<label style="font-size:0.85rem;">Dirección</label>' +
        '<input id="dcEmpDir" type="text" value="' + (emp.direccion || '') + '" style="padding:8px;border:1px solid #ddd;border-radius:6px;">' +
        '<label style="font-size:0.85rem;">Teléfono</label>' +
        '<input id="dcEmpTel" type="text" value="' + (emp.telefono || '') + '" style="padding:8px;border:1px solid #ddd;border-radius:6px;">' +
        '<label style="font-size:0.85rem;">Email</label>' +
        '<input id="dcEmpEmail" type="email" value="' + (emp.email || '') + '" style="padding:8px;border:1px solid #ddd;border-radius:6px;">' +
        '<button onclick="window._dcSaveEmpresa()" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#2ecc71;color:#fff;cursor:pointer;">Guardar datos de empresa</button>' +
      '</div>';
  }

  global._dcSaveEmpresa = function () {
    if (typeof config !== 'undefined' && config.setEmpresa) {
      config.setEmpresa({
        nombreComercial: document.getElementById('dcEmpNombre').value,
        nit: document.getElementById('dcEmpNit').value,
        direccion: document.getElementById('dcEmpDir').value,
        telefono: document.getElementById('dcEmpTel').value,
        email: document.getElementById('dcEmpEmail').value,
      });
      if (typeof showToast === 'function') showToast('Datos de empresa guardados', 'success');
      _completedSteps.empresa = true;
      saveState();
      renderStep();
    }
  };

  // ── Paso: Impuestos ──────────────────────────────────────────────
  function renderImpuestosStep() {
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Configura impuestos y facturación.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<p style="font-size:0.85rem;">Para configurar impuestos, ve a <strong>Configuración → Impuestos</strong> en el menú.</p>' +
        '<p style="font-size:0.85rem;">Para configurar facturación DIAN, ve a <strong>Configuración → Config. DIAN</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para configurar el certificado digital, ve a <strong>Configuración → Certificado .p12</strong>.</p>' +
        '<button onclick="window._dcMarkComplete(\'impuestos\')" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#3498db;color:#fff;cursor:pointer;">Marcar como completado</button>' +
      '</div>';
  }

  // ── Paso: Usuarios ───────────────────────────────────────────────
  function renderUsuariosStep() {
    var staff = (typeof getUsuariosConfig === 'function') ? (getUsuariosConfig().staff || []) : [];
    var userCount = staff.filter(function (u) { return u.id !== 'KENNY'; }).length;
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Gestiona usuarios y permisos del sistema.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<p style="font-size:0.85rem;">Usuarios creados: <strong>' + userCount + '</strong></p>' +
        '<p style="font-size:0.85rem;">Para crear/editar usuarios, ve a <strong>Configuración → Usuarios</strong>.</p>' +
        '<p style="font-size:0.85rem;">Roles disponibles: Cajero, Mesero, Cocina, Inventario, Admin.</p>' +
        '<button onclick="window._dcMarkComplete(\'usuarios\')" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#3498db;color:#fff;cursor:pointer;">Marcar como completado</button>' +
      '</div>';
  }

  // ── Paso: Impresoras ─────────────────────────────────────────────
  function renderImpresorasStep() {
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Configura impresoras y periféricos.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<p style="font-size:0.85rem;">Para configurar impresoras de comandas, ve a <strong>Configuración → Impresión comandas</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para configurar facturas e impresión, ve a <strong>Configuración → Facturas e impresión</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para probar impresión, usa el botón de prueba en cada configuración.</p>' +
        '<button onclick="window._dcMarkComplete(\'impresoras\')" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#3498db;color:#fff;cursor:pointer;">Marcar como completado</button>' +
      '</div>';
  }

  // ── Paso: Red ────────────────────────────────────────────────────
  function renderRedStep() {
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Configura la conexión de red y dispositivos.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<p style="font-size:0.85rem;">Para configurar la red, ve a <strong>Configuración → Conexión de sistemas</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para configurar multi-dispositivo, ve a <strong>Configuración → Multi-dispositivo</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para diagnóstico de comunicación, ve a <strong>Configuración → Diagnóstico comunicación</strong>.</p>' +
        '<button onclick="if(typeof wizardOpen===\'function\')wizardOpen();" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#3498db;color:#fff;cursor:pointer;">Abrir asistente de conexión</button>' +
        '<button onclick="window._dcMarkComplete(\'red\')" style="margin-top:4px;padding:8px 16px;border:none;border-radius:6px;background:#2ecc71;color:#fff;cursor:pointer;">Marcar como completado</button>' +
      '</div>';
  }

  // ── Paso: Nube ───────────────────────────────────────────────────
  function renderNubeStep() {
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Configura la nube y sincronización.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<p style="font-size:0.85rem;">Para configurar la nube global, ve a <strong>Configuración → Nube global</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para prioridades de sync, ve a <strong>Configuración → Prioridades sync</strong>.</p>' +
        '<button onclick="window._dcMarkComplete(\'nube\')" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#3498db;color:#fff;cursor:pointer;">Marcar como completado</button>' +
      '</div>';
  }

  // ── Paso: Diagnóstico ────────────────────────────────────────────
  function renderDiagnosticoStep() {
    var errorStats = (typeof CrozzoErrorMonitor !== 'undefined') ? CrozzoErrorMonitor.getErrorStats() : { total: 0 };
    return '<p style="color:#666;font-size:0.9rem;margin-bottom:12px;">Diagnóstico y salud del sistema.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<p style="font-size:0.85rem;">Errores registrados: <strong>' + (errorStats.total || 0) + '</strong></p>' +
        '<p style="font-size:0.85rem;">Para diagnóstico completo, ve a <strong>Configuración → Pruebas de sistema</strong>.</p>' +
        '<p style="font-size:0.85rem;">Para auditoría, ve a <strong>Configuración → Auditoría (eventos)</strong>.</p>' +
        '<button onclick="if(typeof crozzoShowSuperAdminMenu===\'function\'){ /* noop */ } if(typeof renderPage===\'function\')renderPage(\'super-admin-diagnostics\');" style="margin-top:8px;padding:8px 16px;border:none;border-radius:6px;background:#3498db;color:#fff;cursor:pointer;">Abrir diagnóstico completo</button>' +
        '<button onclick="window._dcMarkComplete(\'diagnostico\')" style="margin-top:4px;padding:8px 16px;border:none;border-radius:6px;background:#2ecc71;color:#fff;cursor:pointer;">Marcar como completado</button>' +
      '</div>';
  }

  global._dcMarkComplete = function (stepId) {
    _completedSteps[stepId] = true;
    saveState();
    renderStep();
    // Update step list
    var btn = document.getElementById('dc-step-' + stepId);
    if (btn) btn.innerHTML = btn.innerHTML.replace('⬜', '✅');
  };

  function goToStep(idx) {
    if (idx < 0 || idx >= STEPS.length) return;
    _currentStep = idx;
    saveState();
    renderStep();
    // Update active styling
    STEPS.forEach(function (s, i) {
      var b = document.getElementById('dc-step-' + s.id);
      if (b) {
        b.style.fontWeight = i === idx ? '700' : '400';
        b.style.color = i === idx ? '#1a1a2e' : '#666';
      }
    });
  }

  function nextStep() {
    if (_currentStep < STEPS.length - 1) goToStep(_currentStep + 1);
  }

  function prevStep() {
    if (_currentStep > 0) goToStep(_currentStep - 1);
  }

  // ── Integración con menú Super Admin ─────────────────────────────
  // Agregar botón al menú de Super Admin
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
    btn.innerHTML = '<strong>🚀 Centro de Despliegue</strong><br><span style="font-size:0.8rem;color:#888;">Asistente unificado para configurar todo el sistema.</span>';
    btn.onclick = function () { abrir(); };
    // Insertar antes del botón de cerrar
    var cerrar = document.getElementById('samCerrar');
    if (cerrar && cerrar.parentElement) {
      cerrar.parentElement.insertBefore(btn, cerrar);
    } else {
      btns.appendChild(btn);
    }
  }

  // Observar cuando se crea el menú de Super Admin
  var observer = new MutationObserver(function () {
    patchSuperAdminMenu();
  });
  if (typeof document !== 'undefined') {
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // ── API pública ──────────────────────────────────────────────────
  global.CrozzoDeploymentCenter = {
    abrir: abrir,
    STEPS: STEPS,
    loadState: loadState,
    saveState: saveState,
  };

  // Inicializar
  if (typeof document !== 'undefined') {
    loadState();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
