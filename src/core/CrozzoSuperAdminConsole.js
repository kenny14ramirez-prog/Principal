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
    return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;position:relative;z-index:1;">' +
      kpis.map(function (k) {
        return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:12px 16px;text-align:center;min-width:90px;backdrop-filter:blur(4px);transition:transform .18s ease,box-shadow .18s ease;" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 18px rgba(0,0,0,0.3)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">' +
          '<div style="font-size:1.5rem;margin-bottom:2px;">' + k.icon + '</div>' +
          '<div style="font-size:1.25rem;font-weight:800;color:#f0e6d2;">' + k.value + '</div>' +
          '<div style="font-size:0.68rem;color:#8a8a96;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">' + k.label + '</div>' +
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
    return '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;position:relative;z-index:1;padding:4px;background:rgba(0,0,0,0.25);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">' +
      tabs.map(function (t) {
        var active = t.id === _activeTab;
        var st = active
          ? 'background:linear-gradient(135deg,#B59A6D,#8a7340);color:#fff;box-shadow:0 2px 10px rgba(181,154,109,0.35);border:1px solid #B59A6D;'
          : 'background:transparent;color:#9a9aa8;border:1px solid transparent;';
        return '<button type="button" data-sa-tab="' + t.id + '" style="padding:8px 14px;border-radius:9px;cursor:pointer;font-size:0.78rem;font-weight:600;letter-spacing:0.03em;transition:all .18s ease;' + st + '">' + t.icon + ' ' + t.label + '</button>';
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
          html += '<p style="color:#8a8a96;">No hay negocios registrados.</p>';
        } else {
          html += '<div style="display:flex;flex-direction:column;gap:8px;">';
          negs.forEach(function (n) {
            html += '<div style="border:1px solid #3a3a42;border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;">' +
              '<div><strong>' + (n.nombre || n.id) + '</strong><br><span style="font-size:0.8rem;color:#8a8a96;">NIT: ' + (n.nit || '—') + ' · ' + (n.sucursales || 0) + ' sucursales</span></div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="btn btn-sm btn-outline" onclick="window._samAccederNegocio && window._samAccederNegocio(\'' + n.id + '\')">Acceder</button>' +
                '<button type="button" class="btn btn-sm btn-outline" onclick="window._samCrearSucursal && window._samCrearSucursal(\'' + n.id + '\')">+ Sucursal</button>' +
              '</div>' +
            '</div>';
          });
          html += '</div>';
        }
      }
    } catch (_) { html += '<p style="color:#6b6b78;">Error cargando negocios.</p>'; }
    html += '<div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button type="button" class="btn btn-primary" onclick="window._samShowRegisterForm && window._samShowRegisterForm()">+ Registrar negocio</button>' +
      '<button type="button" class="btn btn-outline" onclick="window._samShowAccessForm && window._samShowAccessForm()">Acceder a existente</button>' +
    '</div>';
    return html;
  }

  function renderDespliegue() {
    if (typeof global.CrozzoDeploymentCenter !== 'undefined' && typeof global.CrozzoDeploymentCenter.abrir === 'function') {
      // Open deployment center in a nested way
      return '<p style="color:#8a8a96;">Use el botón "Centro de Despliegue" en el menú original o presione Ctrl+K → "Despliegue".</p>' +
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
        html += '<div style="background:#1f1f24;border-radius:8px;padding:12px;font-size:0.85rem;">' +
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
        html += '<div style="background:#1f1f24;border-radius:8px;padding:12px;font-size:0.85rem;margin-bottom:12px;">' +
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
        html += '<p style="color:#6b6b78;">Módulo honeypot no disponible.</p>';
      }
    } catch (e) { html += '<p style="color:#6b6b78;">Error: ' + e.message + '</p>'; }
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
    return '<p style="color:#8a8a96;">Use el botón "Identidad y logos" en el menú original o presione Ctrl+K → "Identidad".</p>' +
      '<button type="button" class="btn btn-outline" onclick="if(typeof navigateTo === \'function\') navigateTo(\'super-admin-identidad\')">Ir a Identidad</button>';
  }

  function renderAuditoria() {
    return '<p style="color:#8a8a96;">Use el botón "Auditoría" en el menú original.</p>' +
      '<button type="button" class="btn btn-outline" onclick="if(typeof navigateTo === \'function\') navigateTo(\'auditoria\')">Ir a Auditoría</button>';
  }

  function renderActualizaciones() {
    return '<p style="color:#8a8a96;">Use el botón "Actualizaciones del sistema" en el menú original.</p>' +
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
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;animation:saFadeIn .25s ease;';
    var styleEl = document.createElement('style');
    styleEl.textContent = '@keyframes saFadeIn{from{opacity:0}to{opacity:1}}' +
      '#' + CONSOLE_ID + ' .sa-card{background:linear-gradient(160deg,#1c1c20 0%,#26262c 45%,#18181c 100%);border:1px solid #3a3a42;border-radius:22px;padding:28px;max-width:960px;width:96%;max-height:90vh;overflow-y:auto;box-shadow:0 40px 100px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.06);color:#e8e8ec;position:relative;}' +
      '#' + CONSOLE_ID + ' .sa-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#B59A6D,#D4AF37,#B59A6D,transparent);border-radius:22px 22px 0 0;}' +
      '#' + CONSOLE_ID + ' .sa-card::after{content:"";position:absolute;inset:0;border-radius:22px;pointer-events:none;background:repeating-linear-gradient(135deg,rgba(255,255,255,0.012) 0px,rgba(255,255,255,0.012) 1px,transparent 1px,transparent 6px);}' +
      '#' + CONSOLE_ID + ' h2{color:#f0e6d2;text-shadow:0 1px 2px rgba(0,0,0,0.4);}' +
      '#' + CONSOLE_ID + ' h3{color:#d4c4a0;}' +
      '#' + CONSOLE_ID + ' p{color:#b8b8c2;}' +
      '#' + CONSOLE_ID + ' .btn-outline{background:rgba(255,255,255,0.05)!important;color:#d4c4a0!important;border:1px solid rgba(181,154,109,0.35)!important;border-radius:10px!important;transition:all .18s ease;}' +
      '#' + CONSOLE_ID + ' .btn-outline:hover{background:rgba(181,154,109,0.15)!important;border-color:#B59A6D!important;}' +
      '#' + CONSOLE_ID + ' .btn-primary{background:linear-gradient(135deg,#B59A6D,#8a7340)!important;color:#fff!important;border:none!important;border-radius:10px!important;box-shadow:0 2px 10px rgba(181,154,109,0.3);}' +
      '#' + CONSOLE_ID + ' .btn-sm{font-size:0.75rem;padding:4px 10px;}' +
      '#' + CONSOLE_ID + ' [data-sa-tab]{transition:all .18s ease;}';
    overlay.appendChild(styleEl);
    var card = document.createElement('div');
    card.className = 'sa-card';
    card.innerHTML = CrozzoSanitize.sanitizeHtml(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;position:relative;z-index:1;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#B59A6D,#6b5a3a);box-shadow:0 4px 12px rgba(181,154,109,0.35);font-size:1.3rem;">🛡️</span>' +
          '<div>' +
            '<h2 style="margin:0;font-size:1.35rem;font-weight:700;letter-spacing:0.02em;">Consola Super Admin</h2>' +
            '<p style="margin:2px 0 0;font-size:0.72rem;color:#8a8a96;letter-spacing:0.08em;text-transform:uppercase;">Centro de control de plataforma</p>' +
          '</div>' +
        '</div>' +
        '<button type="button" id="saClose" style="padding:8px 14px;border:none;border-radius:10px;background:rgba(231,76,60,0.15);color:#ff6b6b;cursor:pointer;font-weight:600;border:1px solid rgba(231,76,60,0.3);transition:all .18s ease;">✕ Cerrar</button>' +
      '</div>' +
      getKpiHtml() +
      renderTabs() +
      '<div id="sa-content" style="margin-top:16px;position:relative;z-index:1;">' + renderTabContent() + '</div>'
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