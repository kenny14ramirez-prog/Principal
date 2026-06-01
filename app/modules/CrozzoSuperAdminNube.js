/**
 * Crozzo POS — Centro de configuración global en nube (solo Super Admin).
 * Supabase, checklist SQL, módulos integrados y estado de conexión.
 */
(function (global) {
  'use strict';

  var SQL_CHECKLIST = [
    { file: 'docs/SUPABASE-SQL-EDITOR.sql', title: 'Base POS', order: 1, required: true },
    { file: 'docs/SUPABASE-SQL-INTEGRACION.sql', title: 'Integración (empleados, pedidos, nómina)', order: 2, required: true },
    { file: 'docs/SUPABASE-SQL-QYC.sql', title: 'Compras / facturas proveedor (QyC)', order: 3, required: true },
    { file: 'docs/SUPABASE-STORAGE-FOTOS-MARCACIONES.sql', title: 'Storage fotos marcación', order: 4, required: true },
    { file: 'docs/SUPABASE-SQL-QYC-FIX-TARJETA.sql', title: 'Fix método pago tarjeta', order: 5, required: false },
    { file: 'docs/SUPABASE-SQL-COSTOS.sql', title: 'Sistema de costos (opcional)', order: 6, required: false },
    { file: 'docs/SUPABASE-SQL-RESERVORIO-UNIFICADO.sql', title: 'Reservorio unificado (opcional)', order: 7, required: false },
    { file: 'docs/SUPABASE-SQL-SHIFT-CLOSES.sql', title: 'Cierres de turno (opcional)', order: 8, required: false },
  ];

  var MODULES_CLOUD = [
    { menu: 'centro-compras', label: 'Centro de compras / QyC', tables: 'proveedores, facturas, recepciones' },
    { menu: 'pedidos-internos', label: 'Pedidos internos', tables: 'crozzo_pedidos_internos' },
    { menu: 'control-acceso', label: 'Marcación personal', tables: 'crozzo_empleados, crozzo_marcaciones' },
    { menu: 'nomina-planilla', label: 'Planilla 2026', tables: 'crozzo_nomina_periodos' },
    { menu: 'punto-venta', label: 'Punto de venta / catálogo', tables: 'products, sales, comandas' },
    { menu: 'sistema-costos', label: 'Sistema de costos', tables: 'ver SUPABASE-SQL-COSTOS.sql' },
  ];

  var STORAGE_BUCKETS = ['oficina-docs', 'fotos-marcaciones'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function getSbFile() {
    try {
      if (typeof global.readCrozzoSupabaseJson === 'function') return global.readCrozzoSupabaseJson();
      var raw = localStorage.getItem('crozzo_supabase_config');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function getAnonKey(obj) {
    if (!obj) return '';
    if (typeof global.crozzoSupabaseEffectiveAnonKey === 'function') {
      return global.crozzoSupabaseEffectiveAnonKey(obj);
    }
    return String(obj.key || obj.anonKey || '').trim();
  }

  function cloudReady() {
    return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
  }

  function getMdConfig() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function nubeSnapshot() {
    var sb = getSbFile();
    var md = getMdConfig();
    var syncOn = !!(sb && sb.syncEnabled);
    var url = (sb && sb.url) || (md.supabase && md.supabase.url) || '';
    var key = getAnonKey(sb) || (md.supabase && md.supabase.anonKey) || '';
    var clientOk = !!global.__SUPABASE;
    var ready = cloudReady();
    return {
      syncOn: syncOn,
      url: String(url).trim(),
      hasKey: key.length >= 20,
      clientOk: clientOk,
      ready: ready,
      deviceId: (sb && sb.deviceId) || md.deviceId || '',
      deviceName: (sb && sb.deviceName) || '',
      businessId: md.businessId || (sb && sb.businessId) || '',
      locationId: md.locationId || '',
      schema: (md.supabase && md.supabase.schema) || 'public',
    };
  }

  function statusBadge(ok, okLabel, failLabel) {
    return ok
      ? '<span class="badge badge-success">' + esc(okLabel) + '</span>'
      : '<span class="badge badge-warning">' + esc(failLabel) + '</span>';
  }

  function renderStatusPanel() {
    var s = nubeSnapshot();
    var mode =
      s.ready && s.clientOk
        ? 'Conectado a la nube'
        : s.syncOn && s.url
          ? 'Configurado — cliente no iniciado'
          : 'Solo datos locales';
    var modeClass = s.ready && s.clientOk ? 'badge-success' : s.syncOn ? 'badge-info' : 'badge-warning';

    return (
      '<div class="crozzo-nube-status-grid">' +
      '<div class="card crozzo-nube-status-card">' +
      '<div class="card-header"><span class="card-title">Estado global</span></div>' +
      '<p style="margin:0 0 10px;"><span class="badge ' +
      modeClass +
      '">' +
      esc(mode) +
      '</span></p>' +
      '<ul class="crozzo-nube-checklist" style="margin:0;padding-left:1.1rem;font-size:0.88rem;">' +
      '<li>Sync activada: ' +
      statusBadge(s.syncOn, 'Sí', 'No') +
      '</li>' +
      '<li>URL Supabase: ' +
      statusBadge(s.url.indexOf('supabase.co') >= 0, 'Válida', 'Falta o incorrecta') +
      '</li>' +
      '<li>Anon key: ' +
      statusBadge(s.hasKey, 'Presente', 'Falta') +
      '</li>' +
      '<li>Cliente JS (<code>__SUPABASE</code>): ' +
      statusBadge(s.clientOk, 'Iniciado', 'No iniciado — guarde y recargue F5') +
      '</li>' +
      '<li>Modo operativo: ' +
      (typeof global.__crozzoIsLocalDataMode === 'function' && global.__crozzoIsLocalDataMode()
        ? statusBadge(false, '', 'Local (IndexedDB)')
        : statusBadge(true, 'Nube prioritaria', '')) +
      '</li>' +
      '</ul>' +
      '<p class="form-hint" style="margin-top:10px;" id="sanCloudConnStatus">⏳ Pulse «Probar conexión» para validar PostgREST.</p>' +
      '</div>' +
      '<div class="card crozzo-nube-status-card">' +
      '<div class="card-header"><span class="card-title">Identidad en nube</span></div>' +
      '<dl class="crozzo-nube-dl">' +
      '<dt>Dispositivo</dt><dd>' +
      esc(s.deviceName || '—') +
      '</dd>' +
      '<dt>Device ID</dt><dd><code style="font-size:0.75rem;word-break:break-all;">' +
      esc(s.deviceId || '(se genera al guardar)') +
      '</code></dd>' +
      '<dt>Business ID</dt><dd>' +
      esc(s.businessId || '(opcional)') +
      '</dd>' +
      '<dt>Location ID</dt><dd>' +
      esc(s.locationId || '(LAN / vacío)') +
      '</dd>' +
      '<dt>Schema</dt><dd>' +
      esc(s.schema) +
      '</dd>' +
      '</dl>' +
      '<p class="form-hint">Archivo local: <code>localStorage.crozzo_supabase_config</code> (solo Super Admin escribe).</p>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSqlChecklist() {
    var rows = SQL_CHECKLIST.map(function (item) {
      return (
        '<tr><td>' +
        item.order +
        '</td><td><strong>' +
        esc(item.title) +
        '</strong>' +
        (item.required ? '' : ' <span class="badge badge-info">opcional</span>') +
        '</td><td><code>' +
        esc(item.file) +
        '</code></td></tr>'
      );
    }).join('');
    return (
      '<div class="card" style="margin-top:14px;">' +
      '<div class="card-header"><span class="card-title">📋 SQL en Supabase (orden obligatorio)</span></div>' +
      '<p class="form-hint">Ejecute en el <strong>SQL Editor</strong> del proyecto Supabase, en este orden. Los archivos están en la carpeta <code>docs/</code> del repositorio.</p>' +
      '<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:0.85rem;"><thead><tr><th>#</th><th>Script</th><th>Ruta</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '<p class="form-hint" style="margin-top:8px;">Buckets Storage: <code>' +
      STORAGE_BUCKETS.join('</code>, <code>') +
      '</code>. Guía: <code>docs/PROMPT-SQL-SUPABASE-INTEGRACION.md</code> y <code>docs/INTEGRACION-MODULOS.md</code>.</p>' +
      '</div>'
    );
  }

  function renderModulesChecklist() {
    var rows = MODULES_CLOUD.map(function (m) {
      return (
        '<tr><td>' +
        esc(m.label) +
        '</td><td><code>' +
        esc(m.menu) +
        '</code></td><td style="font-size:0.82rem;">' +
        esc(m.tables) +
        '</td></tr>'
      );
    }).join('');
    return (
      '<div class="card" style="margin-top:14px;">' +
      '<div class="card-header">' +
      '<span class="card-title">🧩 Módulos que usan la nube</span>' +
      '<button type="button" class="btn btn-outline" style="margin-left:auto;font-size:0.8rem;" onclick="navigateTo(\'gestion-perfiles-menus\')">Perfiles y menús</button>' +
      '</div>' +
      '<p class="form-hint">Tras conectar Supabase, active estos ítems en <strong>Perfiles y menús</strong> para cada rol.</p>' +
      '<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:0.85rem;"><thead><tr><th>Módulo</th><th>ID menú</th><th>Tablas principales</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '</div>'
    );
  }

  function renderCloudForm() {
    var c = getMdConfig();
    var sb = getSbFile();
    var syncOn = !!(sb && sb.syncEnabled);
    var url = (c.supabase && c.supabase.url) || (sb && sb.url) || '';
    var key = (c.supabase && c.supabase.anonKey) || getAnonKey(sb) || '';
    var deviceName = (sb && sb.deviceName) || '';
    try {
      if (!deviceName) deviceName = localStorage.getItem('device_name') || '';
    } catch (_) {}
    var deviceId = (sb && sb.deviceId) || '';
    try {
      if (!deviceId) deviceId = localStorage.getItem('device_id') || '';
    } catch (_) {}
    if (!deviceId) deviceId = String(c.deviceId || '');

    return (
      '<div class="card" style="margin-top:14px;">' +
      '<div class="card-header"><span class="card-title">☁️ Credenciales y sincronización Supabase</span></div>' +
      '<p class="form-hint" style="margin-bottom:12px;">Configure aquí la base global del proyecto. Al guardar, el POS y los módulos embebidos (compras, marcación, pedidos) usan <strong>esta misma</strong> conexión.</p>' +
      '<div class="form-grid">' +
      '<div class="form-group full">' +
      '<label class="md-toggle"><input type="checkbox" id="mdSupabaseSyncEnabled" ' +
      (syncOn ? 'checked' : '') +
      '><span>Activar sincronización con Supabase Cloud</span></label>' +
      '</div>' +
      '<div class="form-group full"><label class="form-label">Supabase URL</label>' +
      '<input class="form-input" id="mdSupabaseUrl" value="' +
      esc(url) +
      '" placeholder="https://xxxxxxxx.supabase.co"></div>' +
      '<div class="form-group full"><label class="form-label">Supabase anon key</label>' +
      '<input class="form-input" id="mdSupabaseKey" value="' +
      esc(key) +
      '" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." autocomplete="off"></div>' +
      '<div class="form-group full"><label class="form-label">Nombre de este dispositivo</label>' +
      '<input class="form-input" id="mdCloudDeviceName" value="' +
      esc(deviceName) +
      '" placeholder="Caja principal / Tablet barra"></div>' +
      '<div class="form-group full"><label class="form-label">ID del dispositivo</label>' +
      '<input class="form-input" id="mdCloudDeviceIdInput" value="' +
      esc(deviceId) +
      '" placeholder="(vacío = autogenerar)" autocomplete="off"></div>' +
      '<div class="form-group"><label class="form-label">Business ID (opcional)</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<input class="form-input" id="mdBusinessId" value="' +
      esc(c.businessId || '') +
      '" style="flex:1;min-width:160px;">' +
      '<button type="button" class="btn btn-outline" onclick="typeof generateBusinessId===\'function\'&&generateBusinessId()">Generar</button></div></div>' +
      '<div class="form-group"><label class="form-label">Schema</label>' +
      '<input class="form-input" id="mdSupabaseSchema" value="' +
      esc((c.supabase && c.supabase.schema) || 'public') +
      '"></div>' +
      '<div class="form-group"><label class="md-toggle" style="margin-top:24px;">' +
      '<input type="checkbox" id="mdCloudPriority" ' +
      (c.cloudPriority !== false ? 'checked' : '') +
      '><span>Priorizar Cloud sobre LAN</span></label></div>' +
      '</div>' +
      '<div class="btn-group" style="margin-top:12px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-primary" id="sanBtnSaveCloud">💾 Guardar y conectar nube</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnTestCloud">🔌 Probar conexión</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnReload">🔄 Recargar app (F5)</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'config-multidispositivo\')">📡 LAN / asistente</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'super-admin-diagnostics\')">🧪 Diagnóstico</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderTablesReference() {
    var tables =
      global.__CROZZO_SB_TABLES && global.__CROZZO_SB_TABLES.length
        ? global.__CROZZO_SB_TABLES.join(', ')
        : 'profiles, products, sales, comandas, crozzo_empleados, …';
    return (
      '<div class="card" style="margin-top:14px;">' +
      '<div class="card-header"><span class="card-title">📚 Tablas esperadas por el POS</span></div>' +
      '<p class="form-hint" style="font-size:0.82rem;word-break:break-word;">' +
      esc(tables) +
      '</p></div>'
    );
  }

  function renderSuperAdminNubeConfigHTML() {
    return (
      '<div id="crozzo-nube-hub" class="crozzo-nube-hub">' +
      '<div class="crozzo-facturas-admin__hero" style="margin-bottom:16px;">' +
      '<h2>Configuración global en nube</h2>' +
      '<p>Panel único del Super Admin: conectar Supabase, validar scripts SQL y activar módulos. Sin conexión, el POS opera en <strong>modo local</strong> (IndexedDB + localStorage).</p>' +
      '</div>' +
      renderStatusPanel() +
      renderCloudForm() +
      renderSqlChecklist() +
      renderModulesChecklist() +
      renderTablesReference() +
      '</div>'
    );
  }

  function sanPopulateFormFromConfig() {
    var c = getMdConfig();
    var sb = getSbFile();
    var syncEl = document.getElementById('mdSupabaseSyncEnabled');
    if (syncEl) syncEl.checked = !!(sb && sb.syncEnabled);
    var urlEl = document.getElementById('mdSupabaseUrl');
    if (urlEl) urlEl.value = (c.supabase && c.supabase.url) || (sb && sb.url) || '';
    var keyEl = document.getElementById('mdSupabaseKey');
    if (keyEl) keyEl.value = (c.supabase && c.supabase.anonKey) || getAnonKey(sb) || '';
    var nameEl = document.getElementById('mdCloudDeviceName');
    if (nameEl) {
      var dn = (sb && sb.deviceName) || '';
      try {
        if (!dn) dn = localStorage.getItem('device_name') || '';
      } catch (_) {}
      nameEl.value = dn;
    }
    var idEl = document.getElementById('mdCloudDeviceIdInput');
    if (idEl) {
      var did = (sb && sb.deviceId) || '';
      try {
        if (!did) did = localStorage.getItem('device_id') || '';
      } catch (_) {}
      if (!did) did = String(c.deviceId || '');
      idEl.value = did;
    }
    var biz = document.getElementById('mdBusinessId');
    if (biz) biz.value = c.businessId || '';
    var sch = document.getElementById('mdSupabaseSchema');
    if (sch) sch.value = (c.supabase && c.supabase.schema) || 'public';
    var pri = document.getElementById('mdCloudPriority');
    if (pri) pri.checked = c.cloudPriority !== false;
  }

  function sanRefreshStatusCards() {
    var hub = document.getElementById('crozzo-nube-hub');
    if (!hub) return;
    var grid = hub.querySelector('.crozzo-nube-status-grid');
    if (grid) {
      var tmp = document.createElement('div');
      tmp.innerHTML = renderStatusPanel();
      var newGrid = tmp.querySelector('.crozzo-nube-status-grid');
      if (newGrid) grid.replaceWith(newGrid);
    }
  }

  function initSuperAdminNubeConfig() {
    sanPopulateFormFromConfig();
    sanRefreshStatusCards();

    document.getElementById('sanBtnSaveCloud')?.addEventListener('click', function () {
      if (typeof global.saveSupabaseConfig === 'function') {
        void global.saveSupabaseConfig().then(function () {
          sanRefreshStatusCards();
        });
      } else if (global.showToast) {
        global.showToast('Función saveSupabaseConfig no disponible.', 'error');
      }
    });

    document.getElementById('sanBtnTestCloud')?.addEventListener('click', function () {
      if (typeof global.testSupabaseConnection === 'function') {
        void global.testSupabaseConnection();
      }
    });

    document.getElementById('sanBtnReload')?.addEventListener('click', function () {
      try {
        global.location.reload();
      } catch (_) {}
    });

    if (!global.__crozzoNubeConfigListener) {
      global.__crozzoNubeConfigListener = true;
      global.addEventListener('crozzo-supabase-config-saved', function () {
        if (global.currentPage === 'super-admin-nube') {
          sanRefreshStatusCards();
          sanPopulateFormFromConfig();
        }
      });
    }

    var s = nubeSnapshot();
    if (s.url && s.hasKey && typeof global.testSupabaseConnection === 'function') {
      global.setTimeout(function () {
        if (global.currentPage === 'super-admin-nube') void global.testSupabaseConnection();
      }, 400);
    }
  }

  global.renderSuperAdminNubeConfigHTML = renderSuperAdminNubeConfigHTML;
  global.initSuperAdminNubeConfig = initSuperAdminNubeConfig;
  global.crozzoNubeSnapshot = nubeSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);
