/**
 * Bona Origen — Consola unificada de Super Admin (KENNY).
 * Reemplaza el menú disperso por una consola con tabs: Negocios, Despliegue, Diagnóstico,
 * Honeypot, IA, Identidad, Auditoría, Actualizaciones.
 */
(function (global) {
  'use strict';

  var CONSOLE_ID = 'crozzoSuperAdminConsole';
  var _activeTab = 'negocios';

  function isSuperAdmin() {
    try { if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true; } catch (_) {}
    try { var sid = sessionStorage.getItem('crozzo_session_user'); if (sid && String(sid).toUpperCase() === 'KENNY') return true; } catch (_) {}
    return false;
  }

  function getKpiHtml() {
    var kpis = [];
    // Businesses
    try {
      if (typeof global.listarNegocios === 'function') {
        var neg = global.listarNegocios();
        kpis.push({ label: 'Negocios', value: (neg && neg.length) || 0, icon: '🏢' });
      }
    } catch (_) {}
    // Errors
    try {
      var el = (typeof global.crozzoGetErrorLog === 'function') ? global.crozzoGetErrorLog() : null;
      var errCount = (el && Array.isArray(el)) ? el.length : 0;
      kpis.push({ label: 'Errores', value: errCount, icon: '⚠️' });
    } catch (_) {}
    // Honeypot
    try {
      if (global.CrozzoHoneypotJaula && typeof global.CrozzoHoneypotJaula.getStats === 'function') {
        var hs = global.CrozzoHoneypotJaula.getStats();
        kpis.push({ label: 'Trampas', value: (hs && hs.actionCount) || 0, icon: '🪤' });
      }
    } catch (_) {}
    // AI status
    try {
      var tier = (global.CrozzoAiDeviceProfile && typeof global.CrozzoAiDeviceProfile.getTier === 'function') ? global.CrozzoAiDeviceProfile.getTier() : '—';
      kpis.push({ label: 'IA Tier', value: tier, icon: '🤖' });
    } catch (_) {}
    // Token expiry
    try {
      var token = (global.CrozzoSuperAdminCentral && global.CrozzoSuperAdminCentral.getTokenExpiry) ? global.CrozzoSuperAdminCentral.getTokenExpiry() : null;
      if (token) kpis.push({ label: 'Token', value: token, icon: '🔑' });
    } catch (_) {}

    if (!kpis.length) return '';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
      kpis.map(function (k) {
        return '<div style="background:#f5f5f5;border-radius:8px;padding:8px 12px;text-align:center;min-width:80px;">' +
          '<div style="font-size:1.2rem;">' + k.icon + '</div>' +
          '<div style="font-size:1.1rem;font-weight:700;">' + k.value + '</div>' +
          '<div style="font-size:0.7rem;color:#666;">' + k.label + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderTabs() {
    var tabs = [
      { id: 'negocios', label: 'Negocios', icon: '🏢' },
      { id: 'despliegue', label: 'Despliegue', icon: '🚀' },
      { id: 'diagnostico', label: 'Diagnóstico', icon: '🔍' },
      { id: 'honeypot', label: 'Honeypot', icon: '🪤' },
      { id: 'ia', label: 'IA', icon: '🤖' },
      { id: 'identidad', label: 'Identidad', icon: '🎨' },
      { id: 'auditoria', label: 'Auditoría', icon: '📋' },
      { id: 'actualizaciones', label: 'Updates', icon: '🔄' },
    ];
    return '<div style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;">' +
      tabs.map(function (t) {
        var active = t.id === _activeTab ? 'background:#B59A6D;color:#fff;' : 'background:#f0f0f0;color:#333;';
        return '<button type="button" data-sa-tab="' + t.id + '" style="padding:6px 12px;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600;' + active + '">' + t.icon + ' ' + t.label + '</button>';
      }).join('') +
    '</div>';
  }

  function renderTabContent() {
    switch (_activeTab) {
      case 'negocios': return renderNegocios();
      case 'despliegue': return renderDespliegue();
      case 'diagnostico': return renderDiagnostico();
      case 'honeypot': return renderHoneypot();
      case 'ia': return renderIA();
      case 'identidad': return renderIdentidad();
      case 'auditoria': return renderAuditoria();
      case 'actualizaciones': return renderActualizaciones();
      default: return '<p>Pestaña no encontrada.</p>';
    }
  }

  function renderNegocios() {
    var html = '<h3 style="margin:0 0 12px;">Negocios registrados</h3>';
    try {
      if (typeof global.listarNegocios === 'function') {
        var negs = global.listarNegocios();
        if (!negs || !negs.length) {
          html += '<p style="color:#666;">No hay negocios registrados.</p>';
        } else {
          html += '<div style="display:flex;flex-direction:column;gap:8px;">';
          negs.forEach(function (n) {
            html += '<div style="border:1px solid #ddd;border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;">' +
              '<div><strong>' + (n.nombre || n.id) + '</strong><br><span style="font-size:0.8rem;color:#666;">NIT: ' + (n.nit || '—') + ' · ' + (n.sucursales || 0) + ' sucursales</span></div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="btn btn-sm btn-outline" onclick="window._samAccederNegocio && window._samAccederNegocio(\'' + n.id + '\')">Acceder</button>' +
                '<button type="button" class="btn btn-sm btn-outline" onclick="window._samCrearSucursal && window._samCrearSucursal(\'' + n.id + '\')">+ Sucursal</button>' +
              '</div>' +
            '</div>';
          });
          html += '</div>';
        }
      }
    } catch (_) { html += '<p style="color:#999;">Error cargando negocios.</p>'; }
    html += '<div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button type="button" class="btn btn-primary" onclick="window._samShowRegisterForm && window._samShowRegisterForm()">+ Registrar negocio</button>' +
      '<button type="button" class="btn btn-outline" onclick="window._samShowAccessForm && window._samShowAccessForm()">Acceder a existente</button>' +
    '</div>';
    return html;
  }

  function renderDespliegue() {
    if (typeof global.CrozzoDeploymentCenter !== 'undefined' && typeof global.CrozzoDeploymentCenter.abrir === 'function') {
      // Open deployment center in a nested way
      return '<p style="color:#666;">Use el botón "Centro de Despliegue" en el menú original o presione Ctrl+K → "Despliegue".</p>' +
        '<button type="button" class="btn btn-primary" onclick="if(window.CrozzoDeploymentCenter) window.CrozzoDeploymentCenter.abrir()">Abrir Centro de Despliegue</button>';
    }
    return '<p>Módulo de despliegue no disponible.</p>';
  }

  function renderDiagnostico() {
    var html = '<h3 style="margin:0 0 12px;">Diagnóstico del sistema</h3>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoComunicacionDiag) window.CrozzoComunicacionDiag.run()">Ejecutar diagnóstico</button>' +
      '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoDeploymentCenter) window.CrozzoDeploymentCenter.abrir()">Centro de despliegue</button>' +
      '<button type="button" class="btn btn-outline" onclick="if(window.crozzoReadinessRun) window.crozzoReadinessRun()">Readiness</button>' +
    '</div>';
    // Show last diag result
    try {
      if (global.__crozzoLastDiag) {
        var d = global.__crozzoLastDiag;
        html += '<div style="background:#f5f5f5;border-radius:8px;padding:12px;font-size:0.85rem;">' +
          '<strong>Último diagnóstico:</strong> ' + (d.verdict || 'Sin veredicto') + '<br>' +
          'Problemas: ' + (d.fails || 0) + ' · Advertencias: ' + (d.warns || 0) +
        '</div>';
      }
    } catch (_) {}
    return html;
  }

  function renderHoneypot() {
    var html = '<h3 style="margin:0 0 12px;">Honeypot (trampa de ratas)</h3>';
    try {
      if (global.CrozzoHoneypotJaula && typeof global.CrozzoHoneypotJaula.getStats === 'function') {
        var st = global.CrozzoHoneypotJaula.getStats();
        html += '<div style="background:#f5f5f5;border-radius:8px;padding:12px;font-size:0.85rem;margin-bottom:12px;">' +
          'Activo: ' + (st.active ? 'Sí' : 'No') + ' · Bloqueado: ' + (st.blocked ? 'Sí' : 'No') + '<br>' +
          'Decoy: ' + (st.decoy || '—') + ' · Duración: ' + (st.duration || 0) + 's<br>' +
          'Pantallas visitadas: ' + (st.visitedScreens ? st.visitedScreens.join(', ') : '—') + '<br>' +
          'Acciones: ' + (st.actionCount || 0) + ' · Alertas: ' + (st.alertCount || 0) +
        '</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoHoneypotJaula) { var l = window.CrozzoHoneypotJaula.exportarLog(); console.log(l); alert(\'Log exportado a consola\'); }">Exportar log</button>' +
          '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoHoneypotJaula) { window.CrozzoHoneypotJaula.limpiarLogs(); alert(\'Logs limpiados\'); }">Limpiar logs</button>' +
          '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoHoneypotJaula) { window.CrozzoHoneypotJaula.desactivar(); alert(\'Jaula desactivada\'); }">Desactivar jaula</button>' +
        '</div>';
      } else {
        html += '<p style="color:#999;">Módulo honeypot no disponible.</p>';
      }
    } catch (e) { html += '<p style="color:#999;">Error: ' + e.message + '</p>'; }
    return html;
  }

  function renderIA() {
    var html = '<h3 style="margin:0 0 12px;">Asistente IA</h3>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<button type="button" class="btn btn-primary" onclick="if(window.CrozzoAiAssistant) window.CrozzoAiAssistant.open()">Abrir asistente</button>' +
      '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoAiActionRegistry) window.CrozzoAiActionRegistry.execute(\'reindex_rag\').then(function(r){alert(r.result||r);})">Reindexar docs</button>' +
      '<button type="button" class="btn btn-outline" onclick="if(window.CrozzoAiDeviceProfile) alert(\'Tier: \' + window.CrozzoAiDeviceProfile.getTier() + \' | Modelo: \' + window.CrozzoAiDeviceProfile.recommendedModel(window.CrozzoAiDeviceProfile.getTier()))">Ver tier IA</button>' +
    '</div>';
    // Model manager mount point
    html += '<div id="sa-ai-model-mgr" style="margin-top:12px;"></div>';
    return html;
  }

  function renderIdentidad() {
    return '<p style="color:#666;">Use el botón "Identidad y logos" en el menú original o presione Ctrl+K → "Identidad".</p>' +
      '<button type="button" class="btn btn-outline" onclick="if(typeof navigateTo === \'function\') navigateTo(\'super-admin-identidad\')">Ir a Identidad</button>';
  }

  function renderAuditoria() {
    return '<p style="color:#666;">Use el botón "Auditoría" en el menú original.</p>' +
      '<button type="button" class="btn btn-outline" onclick="if(typeof navigateTo === \'function\') navigateTo(\'auditoria\')">Ir a Auditoría</button>';
  }

  function renderActualizaciones() {
    return '<p style="color:#666;">Use el botón "Actualizaciones del sistema" en el menú original.</p>' +
      '<button type="button" class="btn btn-outline" onclick="if(typeof navigateTo === \'function\') navigateTo(\'actualizaciones-sistema\')">Ir a Actualizaciones</button>';
  }

  function wireTabs() {
    var consoleEl = document.getElementById(CONSOLE_ID);
    if (!consoleEl) return;
    consoleEl.querySelectorAll('[data-sa-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _activeTab = btn.getAttribute('data-sa-tab');
        renderConsole();
      });
    });
  }

  function renderConsole() {
    var existing = document.getElementById(CONSOLE_ID);
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = CONSOLE_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:900px;width:95%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    card.innerHTML = CrozzoSanitize.sanitizeHtml(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:1.4rem;color:#1a1a2e;">Consola Super Admin</h2>' +
        '<button type="button" id="saClose" style="padding:6px 12px;border:none;border-radius:8px;background:#e74c3c;color:#fff;cursor:pointer;">Cerrar</button>' +
      '</div>' +
      getKpiHtml() +
      renderTabs() +
      '<div id="sa-content" style="margin-top:16px;">' + renderTabContent() + '</div>'
    );
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.getElementById('saClose').onclick = function () { overlay.remove(); };
    wireTabs();
    // Mount model manager if on IA tab
    if (_activeTab === 'ia') {
      try {
        if (global.CrozzoAiModelManager && typeof global.CrozzoAiModelManager.mount === 'function') {
          var mgrRoot = document.getElementById('sa-ai-model-mgr');
          if (mgrRoot) global.CrozzoAiModelManager.mount(mgrRoot);
        }
      } catch (_) {}
    }
  }

  function abrir() {
    if (!isSuperAdmin()) {
      if (typeof showToast === 'function') showToast('Solo Super Admin puede acceder.', 'warning');
      return;
    }
    renderConsole();
  }

  global.CrozzoSuperAdminConsole = { abrir: abrir };
  // Keep backward compat
  global.CrozzoSuperAdminMenu = global.CrozzoSuperAdminMenu || {};
  global.crozzoShowSuperAdminMenu = function () { abrir(); };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { /* ready */ }, { once: true });
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);