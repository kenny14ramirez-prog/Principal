/**
 * Crozzo POS — Centro de configuración global en nube (solo Super Admin).
 * Asistente: credenciales → SQL Editor → verificación → módulos.
 */
(function (global) {
  'use strict';

  var LS_SQL_DONE = 'crozzo_nube_sql_done_v1';
  var LS_NUBE_STEP = 'crozzo_nube_wizard_step';
  var LS_ALTA_CHECKLIST = 'crozzo_nube_alta_checklist_v1';

  /** Pasos operativos (espejo de docs/SUPABASE-ALTA-NEGOCIO.md). */
  var ALTA_NEGOCIO_STEPS = [
    { id: 'proyecto', label: 'Proyecto Supabase creado (1 negocio = 1 proyecto)' },
    { id: 'sql_editor', label: 'SQL ejecutado: SUPABASE-SQL-EDITOR.sql' },
    { id: 'sql_integracion', label: 'SQL ejecutado: INTEGRACION + QYC + fotos + fix tarjeta' },
    { id: 'sql_opcional', label: 'SQL opcional: costos / reservorio / cierres (si aplica)' },
    { id: 'credenciales', label: 'URL + anon public copiadas (nunca service_role)' },
    { id: 'pos_guardar', label: 'POS: guardado con Super Admin + confirmación de contraseña' },
    { id: 'pos_probar', label: 'POS: Probar conexión y Comprobar tablas sin errores críticos' },
    { id: 'sync', label: 'Central subió a nube; otra caja del mismo negocio sincronizó' },
    { id: 'perfiles', label: 'Perfiles y menús activados para módulos del negocio' },
    { id: 'seguridad', label: 'Anon key protegida; backup del proyecto Supabase revisado' },
  ];

  var STORAGE_BUCKETS = ['oficina-docs', 'fotos-marcaciones'];

  var MODULES_CLOUD = [
    { menu: 'punto-venta', label: 'Punto de venta / restaurante', tables: 'products, sales, comandas', step: 3 },
    { menu: 'venta-comercial', label: 'Tienda / venta comercial', tables: 'products, sales', step: 3 },
    { menu: 'centro-compras', label: 'Centro de compras / QyC', tables: 'proveedores, recepciones, facturas', step: 3 },
    { menu: 'pedidos-internos', label: 'Pedidos internos', tables: 'crozzo_pedidos_internos', step: 3 },
    { menu: 'control-acceso', label: 'Marcación personal', tables: 'crozzo_empleados, crozzo_marcaciones', step: 3 },
    { menu: 'nomina-planilla', label: 'Planilla 2026', tables: 'crozzo_nomina_periodos', step: 3 },
    { menu: 'sistema-costos', label: 'Sistema de costos', tables: 'crozzo_matriz_precios, crozzo_inventario_*', step: 4, optionalSql: 'costos' },
    { menu: 'cierre-caja', label: 'Cierre de caja', tables: 'crozzo_shift_closes (script 9)', step: 4, optionalSql: 'shift_closes' },
  ];

  var PROBE_TABLES = [
    { table: 'devices', label: 'Dispositivos', script: 'editor', required: true },
    { table: 'products', label: 'Productos', script: 'editor', required: true },
    { table: 'sales', label: 'Ventas', script: 'editor', required: true },
    { table: 'crozzo_empleados', label: 'Empleados', script: 'integracion', required: true },
    { table: 'proveedores', label: 'Proveedores', script: 'qyc', required: true },
    { table: 'recepciones', label: 'Recepciones compra', script: 'qyc', required: true },
    { table: 'crozzo_matriz_precios', label: 'Matriz costos', script: 'costos', required: false },
    { table: 'crozzo_reservorio_sync_queue', label: 'Cola reservorio', script: 'reservorio', required: false },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function getScripts() {
    if (global.CrozzoSupabaseSqlBundles && global.CrozzoSupabaseSqlBundles.list) {
      return global.CrozzoSupabaseSqlBundles.list();
    }
    return [];
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

  function supabaseDashboardSqlUrl(projectUrl) {
    var u = String(projectUrl || '').trim().replace(/\/$/, '');
    if (!u || u.indexOf('supabase.co') < 0) return 'https://supabase.com/dashboard';
    var m = u.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (m) return 'https://supabase.com/dashboard/project/' + m[1] + '/sql/new';
    return u + '/project/default/sql';
  }

  function readSqlDoneMap() {
    try {
      var raw = localStorage.getItem(LS_SQL_DONE);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeSqlDone(key, done) {
    var map = readSqlDoneMap();
    if (done) map[key] = Date.now();
    else delete map[key];
    try {
      localStorage.setItem(LS_SQL_DONE, JSON.stringify(map));
    } catch (_) {}
    renderSqlWizardProgress();
  }

  function statusBadge(ok, okLabel, failLabel) {
    return ok
      ? '<span class="badge badge-success">' + esc(okLabel) + '</span>'
      : '<span class="badge badge-warning">' + esc(failLabel) + '</span>';
  }

  function readAltaChecklistMap() {
    try {
      var raw = localStorage.getItem(LS_ALTA_CHECKLIST);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeAltaChecklistMap(map) {
    try {
      localStorage.setItem(LS_ALTA_CHECKLIST, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function altaChecklistProgress() {
    var done = readAltaChecklistMap();
    var n = 0;
    ALTA_NEGOCIO_STEPS.forEach(function (it) {
      if (done[it.id]) n++;
    });
    return { done: n, total: ALTA_NEGOCIO_STEPS.length };
  }

  function bindAltaChecklistInputs(root) {
    if (!root) return;
    root.querySelectorAll('[data-alta-check]').forEach(function (inp) {
      if (inp._crozzoAltaBound) return;
      inp._crozzoAltaBound = true;
      inp.addEventListener('change', function () {
        var id = inp.getAttribute('data-alta-check');
        var map = readAltaChecklistMap();
        map[id] = !!inp.checked;
        writeAltaChecklistMap(map);
        var prog = altaChecklistProgress();
        var el = document.getElementById('sanAltaChecklistProgress');
        if (el) el.textContent = prog.done + '/' + prog.total;
      });
    });
  }

  function runSanNubeSmokeSelfCheck() {
    if (typeof global.isSuperAdminUser === 'function' && !global.isSuperAdminUser()) {
      if (global.showToast) global.showToast('Solo Super Admin puede ejecutar el smoke de nube.', 'warning');
      return { ok: false, items: [] };
    }
    var s = nubeSnapshot();
    var doneMap = readSqlDoneMap();
    var scripts = getScripts();
    var req = scripts.filter(function (x) { return x.required; });
    var reqDone = req.filter(function (x) { return doneMap[x.key]; }).length;
    var keyEl = document.getElementById('mdSupabaseKey');
    var keyMasked =
      !!(keyEl && keyEl.getAttribute && keyEl.getAttribute('data-crozzo-stored-anon-key')) &&
      keyEl.dataset.crozzoKeyMasked === '1';
    var items = [
      { ok: true, label: 'Sesión Super Admin activa' },
      {
        ok: typeof global.crozzoAssertSuperAdminCloudWrite === 'function',
        label: 'Guard de escritura Cloud (crozzoAssertSuperAdminCloudWrite)',
      },
      {
        ok: typeof global.crozzoConfirmSuperAdminForCloudSave === 'function',
        label: 'Reconfirmación de contraseña al guardar',
      },
      {
        ok: typeof global.crozzoGetEffectiveAnonKeyFromInput === 'function',
        label: 'Lectura de anon key enmascarada',
      },
      { ok: s.url.indexOf('supabase.co') >= 0, label: 'URL del proyecto configurada' },
      { ok: s.hasKey, label: 'Anon key guardada (≥20 caracteres)' },
      { ok: !s.hasKey || keyMasked, label: 'Anon key enmascarada en pantalla (si hay clave)' },
      { ok: s.syncOn, label: 'Sincronización Cloud activada' },
      { ok: s.clientOk, label: 'Cliente Supabase (__SUPABASE) iniciado' },
      { ok: !req.length || reqDone >= req.length, label: 'Scripts SQL obligatorios marcados (' + reqDone + '/' + req.length + ')' },
    ];
    var prog = altaChecklistProgress();
    items.push({
      ok: prog.done >= Math.ceil(prog.total * 0.7),
      warn: prog.done < prog.total,
      label: 'Checklist operativo de alta (' + prog.done + '/' + prog.total + ' pasos)',
    });
    return { ok: items.every(function (it) { return it.ok; }), items: items };
  }

  function showSanNubeSmokeResults(report) {
    var r = report || runSanNubeSmokeSelfCheck();
    var rows = (r.items || [])
      .map(function (it) {
        var badge = it.ok
          ? '<span class="badge badge-success">OK</span>'
          : it.warn
            ? '<span class="badge badge-info">Revise</span>'
            : '<span class="badge badge-warning">Pendiente</span>';
        return '<li style="margin:6px 0;display:flex;gap:8px;align-items:flex-start;">' + badge + '<span>' + esc(it.label) + '</span></li>';
      })
      .join('');
    var body =
      '<p class="form-hint">Comprobaciones automáticas en este equipo. Complete el resto en <strong>Guía de alta</strong>.</p>' +
      '<ul class="crozzo-nube-checklist" style="list-style:none;padding:0;">' +
      rows +
      '</ul>' +
      '<p class="form-hint">Repo: <code>npm run updates:audit</code> · Manual: <code>docs/SMOKE-CHECKLIST.md</code></p>' +
      '<div class="modal-actions" style="margin-top:16px;">' +
      '<button type="button" class="btn btn-outline" id="sanSmokeClose">Cerrar</button>' +
      '<button type="button" class="btn btn-primary" id="sanSmokeOpenAlta">📋 Abrir guía de alta</button></div>';
    if (typeof global.showModal === 'function') {
      global.showModal('Smoke — configuración nube', body, { wide: true });
      document.getElementById('sanSmokeClose')?.addEventListener('click', function () {
        if (typeof global.closeModal === 'function') global.closeModal({ skipCobroAbort: true });
      });
      document.getElementById('sanSmokeOpenAlta')?.addEventListener('click', function () {
        if (typeof global.closeModal === 'function') global.closeModal({ skipCobroAbort: true });
        openSanAltaNegocioGuide();
      });
    }
    if (global.showToast) {
      global.showToast(
        r.ok ? 'Smoke nube: todo OK en este equipo.' : 'Smoke nube: hay ítems pendientes.',
        r.ok ? 'success' : 'warning'
      );
    }
    return r;
  }

  function openSanAltaNegocioGuide() {
    if (typeof global.isSuperAdminUser === 'function' && !global.isSuperAdminUser()) {
      if (global.showToast) global.showToast('Solo Super Admin.', 'warning');
      return;
    }
    var done = readAltaChecklistMap();
    var prog = altaChecklistProgress();
    var rows = ALTA_NEGOCIO_STEPS.map(function (it) {
      var ck = done[it.id] ? ' checked' : '';
      return (
        '<label class="md-toggle" style="display:block;margin:10px 0;align-items:flex-start;">' +
        '<input type="checkbox" data-alta-check="' +
        esc(it.id) +
        '"' +
        ck +
        '>' +
        '<span>' +
        esc(it.label) +
        '</span></label>'
      );
    }).join('');
    var body =
      '<p class="form-hint"><strong>1 negocio = 1 proyecto Supabase.</strong> Marque cada paso al completarlo (se guarda en este navegador). Progreso: <strong id="sanAltaChecklistProgress">' +
      prog.done +
      '/' +
      prog.total +
      '</strong></p>' +
      '<div id="sanAltaChecklistRoot" class="crozzo-nube-alta-checklist">' +
      rows +
      '</div>' +
      '<p class="form-hint" style="margin-top:12px;">Documentación: <code>docs/SUPABASE-ALTA-NEGOCIO.md</code></p>' +
      '<div class="modal-actions" style="margin-top:16px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-outline" id="sanAltaGuideClose">Cerrar</button>' +
      '<button type="button" class="btn btn-primary" id="sanAltaGuideSmoke">🧪 Smoke rápido</button></div>';
    if (typeof global.showModal !== 'function') return;
    global.showModal('Alta de negocio en Supabase', body, { wide: true });
    bindAltaChecklistInputs(document.getElementById('sanAltaChecklistRoot'));
    document.getElementById('sanAltaGuideClose')?.addEventListener('click', function () {
      global.closeModal({ skipCobroAbort: true });
    });
    document.getElementById('sanAltaGuideSmoke')?.addEventListener('click', function () {
      global.closeModal({ skipCobroAbort: true });
      showSanNubeSmokeResults();
    });
  }

  function renderHero() {
    var prog = altaChecklistProgress();
    return (
      '<div class="crozzo-nube-hero card">' +
      '<div class="crozzo-nube-hero__body">' +
      '<h2 class="crozzo-nube-hero__title">☁️ Nube global — Supabase</h2>' +
      '<p class="form-hint crozzo-nube-hero__lead">' +
      'Configure la base de datos en la nube para que <strong>ventas, compras, marcación, planilla y costos</strong> sincronicen entre dispositivos. ' +
      'Sin Supabase el POS sigue en <strong>modo local</strong> (IndexedDB + localStorage).' +
      '</p>' +
      '<ol class="crozzo-nube-steps-overview">' +
      '<li><strong>Conectar</strong> — URL y anon key del proyecto</li>' +
      '<li><strong>Crear base</strong> — pegar cada script en el SQL Editor de Supabase</li>' +
      '<li><strong>Verificar</strong> — comprobar tablas y PostgREST</li>' +
      '<li><strong>Activar módulos</strong> — perfiles y menús por rol</li>' +
      '</ol>' +
      '<div class="crozzo-nube-actions" style="margin-top:14px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnAltaGuia">📋 Guía de alta (' +
      prog.done +
      '/' +
      prog.total +
      ')</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnNubeSmoke">🧪 Smoke rápido</button>' +
      '</div></div></div>'
    );
  }

  function renderWizardNav(activeStep) {
    var steps = [
      { id: 1, label: '1. Conexión', icon: '🔌' },
      { id: 2, label: '2. SQL Editor', icon: '📝' },
      { id: 3, label: '3. Verificar', icon: '✅' },
      { id: 4, label: '4. Módulos', icon: '🧩' },
    ];
  var html = '<nav class="crozzo-nube-wizard-nav" role="tablist">';
    steps.forEach(function (st) {
      var on = st.id === activeStep ? ' crozzo-nube-wizard-nav__item--active' : '';
      html +=
        '<button type="button" class="crozzo-nube-wizard-nav__item' +
        on +
        '" data-nube-step="' +
        st.id +
        '" role="tab">' +
        st.icon +
        ' ' +
        esc(st.label) +
        '</button>';
    });
    html += '</nav>';
    return html;
  }

  function renderStatusPanel() {
    var s = nubeSnapshot();
    var mode =
      s.ready && s.clientOk
        ? 'Conectado y operativo'
        : s.syncOn && s.url
          ? 'Credenciales guardadas — recargue si el cliente no inició'
          : 'Solo datos locales';
    var modeClass = s.ready && s.clientOk ? 'badge-success' : s.syncOn ? 'badge-info' : 'badge-warning';
    var doneMap = readSqlDoneMap();
    var scripts = getScripts();
    var req = scripts.filter(function (x) { return x.required; });
    var reqDone = req.filter(function (x) { return doneMap[x.key]; }).length;

    return (
      '<div class="crozzo-nube-status-grid">' +
      '<div class="card crozzo-nube-status-card">' +
      '<div class="card-header"><span class="card-title">Estado de la nube</span></div>' +
      '<p style="margin:0 0 10px;"><span class="badge ' +
      modeClass +
      '">' +
      esc(mode) +
      '</span></p>' +
      '<ul class="crozzo-nube-checklist">' +
      '<li>Sincronización activa: ' +
      statusBadge(s.syncOn, 'Sí', 'No — active el interruptor') +
      '</li>' +
      '<li>URL del proyecto: ' +
      statusBadge(s.url.indexOf('supabase.co') >= 0, 'Correcta', 'Falta o inválida') +
      '</li>' +
      '<li>Anon key (pública): ' +
      statusBadge(s.hasKey, 'Configurada', 'Falta') +
      '</li>' +
      '<li>Cliente en la app (<code>__SUPABASE</code>): ' +
      statusBadge(s.clientOk, 'Iniciado', 'No — Guarde y pulse Recargar') +
      '</li>' +
      '<li>Scripts SQL obligatorios: <strong id="crozzoNubeSqlProgress">' +
      reqDone +
      '/' +
      req.length +
      '</strong> marcados como ejecutados</li>' +
      '</ul>' +
      '<p class="form-hint" style="margin-top:10px;" id="sanCloudConnStatus">Pulse «Probar conexión» en el paso 1 o 3.</p>' +
      '</div>' +
      '<div class="card crozzo-nube-status-card">' +
      '<div class="card-header"><span class="card-title">Identidad del dispositivo</span></div>' +
      '<dl class="crozzo-nube-dl">' +
      '<dt>Nombre</dt><dd>' +
      esc(s.deviceName || '—') +
      '</dd>' +
      '<dt>Device ID</dt><dd><code class="crozzo-nube-code">' +
      esc(s.deviceId || '(se genera al guardar)') +
      '</code></dd>' +
      '<dt>Business ID</dt><dd>' +
      esc(s.businessId || '(opcional, multi-sede)') +
      '</dd>' +
      '<dt>Location ID</dt><dd>' +
      esc(s.locationId || '(LAN / vacío)') +
      '</dd>' +
      '<dt>Schema PostgreSQL</dt><dd>' +
      esc(s.schema) +
      '</dd>' +
      '</dl>' +
      '<p class="form-hint">Credenciales en <code>crozzo_supabase_config</code> (solo Super Admin). Al guardar se pedirá su contraseña de nuevo.</p>' +
      '</div></div>'
    );
  }

  function renderStepConnection() {
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
    var dashUrl = supabaseDashboardSqlUrl(url);

    return (
      '<div class="crozzo-nube-step-panel" data-nube-panel="1">' +
      '<div class="card">' +
      '<div class="card-header"><span class="card-title">🔌 Paso 1 — Conectar proyecto Supabase</span></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p><strong>¿Dónde obtengo esto?</strong> En <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com/dashboard</a> → su proyecto → <em>Settings → API</em>: copie <strong>Project URL</strong> y la clave <strong>anon public</strong> (no use la service_role en el POS).</p>' +
      '</div>' +
      '<div class="form-grid">' +
      '<div class="form-group full">' +
      '<label class="md-toggle"><input type="checkbox" id="mdSupabaseSyncEnabled" ' +
      (syncOn ? 'checked' : '') +
      '><span>Activar sincronización con Supabase (recomendado en producción)</span></label>' +
      '</div>' +
      '<div class="form-group full"><label class="form-label">Project URL</label>' +
      '<input class="form-input" id="mdSupabaseUrl" value="' +
      esc(url) +
      '" placeholder="https://xxxxxxxx.supabase.co" autocomplete="off"></div>' +
      '<div class="form-group full"><label class="form-label">Anon key (public)</label>' +
      '<input class="form-input" type="password" id="mdSupabaseKey" value="" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." autocomplete="off" title="La clave guardada no se muestra completa; pegue de nuevo solo para cambiarla."></div>' +
      '<p class="form-hint">Si ya hay clave guardada verá •••• y los últimos 4 caracteres.</p>' +
      '<div class="form-group"><label class="form-label">Nombre de este equipo</label>' +
      '<input class="form-input" id="mdCloudDeviceName" value="' +
      esc(deviceName) +
      '" placeholder="Ej: Caja 1 · Tablet barra"></div>' +
      '<div class="form-group"><label class="form-label">ID dispositivo</label>' +
      '<input class="form-input" id="mdCloudDeviceIdInput" value="' +
      esc(deviceId) +
      '" placeholder="Vacío = autogenerar" autocomplete="off"></div>' +
      '<div class="form-group"><label class="form-label">Business ID</label>' +
      '<div class="crozzo-nube-inline-actions">' +
      '<input class="form-input" id="mdBusinessId" value="' +
      esc(c.businessId || '') +
      '">' +
      '<button type="button" class="btn btn-outline" onclick="typeof generateBusinessId===\'function\'&&generateBusinessId()">Generar</button></div>' +
      '<p class="form-hint">Opcional. Mismo ID en todos los equipos del mismo negocio.</p></div>' +
      '<div class="form-group"><label class="form-label">Schema</label>' +
      '<input class="form-input" id="mdSupabaseSchema" value="' +
      esc((c.supabase && c.supabase.schema) || 'public') +
      '"></div>' +
      '<div class="form-group full"><label class="md-toggle">' +
      '<input type="checkbox" id="mdCloudPriority" ' +
      (c.cloudPriority !== false ? 'checked' : '') +
      '><span>Priorizar nube sobre red LAN local</span></label></div>' +
      '</div>' +
      '<div class="crozzo-nube-actions">' +
      '<button type="button" class="btn btn-primary" id="sanBtnSaveCloud">💾 Guardar y conectar</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnTestCloud">🔌 Probar conexión</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnReload">🔄 Recargar aplicación</button>' +
      '<a class="btn btn-outline" href="' +
      esc(dashUrl) +
      '" target="_blank" rel="noopener" id="sanBtnOpenSupabase">↗ Abrir SQL Editor en Supabase</a>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'config-multidispositivo\')">📡 Red LAN</button>' +
      '</div></div></div>'
    );
  }

  function renderSqlScriptList(activeKey) {
    var scripts = getScripts();
    var doneMap = readSqlDoneMap();
    if (!scripts.length) {
      return (
        '<p class="form-hint">No se cargó <code>CrozzoSupabaseSqlBundles.js</code>. Ejecute <code>node scripts/build-supabase-sql-bundles.mjs</code> y recargue la app.</p>'
      );
    }
    var html = '<div class="crozzo-nube-sql-layout">';
    html += '<div class="crozzo-nube-sql-list" role="listbox">';
    scripts.forEach(function (s) {
      var done = !!doneMap[s.key];
      var active = s.key === activeKey ? ' crozzo-nube-sql-list__item--active' : '';
      html +=
        '<button type="button" class="crozzo-nube-sql-list__item' +
        active +
        (done ? ' crozzo-nube-sql-list__item--done' : '') +
        '" data-sql-key="' +
        esc(s.key) +
        '">' +
        '<span class="crozzo-nube-sql-list__order">' +
        s.order +
        '</span>' +
        '<span class="crozzo-nube-sql-list__text">' +
        '<strong>' +
        esc(s.title) +
        '</strong>' +
        (s.required ? '' : ' <span class="badge badge-info">opcional</span>') +
        (done ? ' <span class="badge badge-success">✓</span>' : '') +
        '<small>' +
        esc(s.desc) +
        '</small></span></button>';
    });
    html += '</div>';
    var current = scripts.find(function (x) { return x.key === activeKey; }) || scripts[0];
    var sql = current ? current.sql : '';
    var file = current ? current.file : '';
    html += '<div class="crozzo-nube-sql-editor card">';
    html += '<div class="card-header crozzo-nube-sql-editor__head">';
    html += '<span class="card-title" id="crozzoNubeSqlTitle">' + esc(current ? current.title : 'Script') + '</span>';
    html += '<div class="crozzo-nube-sql-editor__tools">';
    html +=
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnCopySql">📋 Copiar SQL</button>';
    html +=
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnDownloadSql">⬇ Descargar .sql</button>';
    html +=
      '<label class="crozzo-nube-sql-done-toggle"><input type="checkbox" id="sanSqlMarkDone" ' +
      (readSqlDoneMap()[current.key] ? 'checked' : '') +
      '> Ya lo ejecuté en Supabase</label>';
    html += '</div></div>';
    html += '<p class="form-hint" id="crozzoNubeSqlDesc">' + esc(current ? current.desc : '') + '</p>';
    html += '<p class="form-hint"><code id="crozzoNubeSqlFile">' + esc(file) + '</code></p>';
    html +=
      '<textarea id="crozzoNubeSqlTextarea" class="crozzo-nube-sql-textarea" readonly spellcheck="false" aria-label="Script SQL"></textarea>';
    html +=
      '<p class="form-hint">En Supabase: <strong>SQL → New query</strong> → pegar → <strong>Run</strong>. Espere «Success» antes del siguiente script.</p>';
    html += '</div></div>';
    return html;
  }

  function renderStepSql() {
    var scripts = getScripts();
    var firstKey = scripts[0] ? scripts[0].key : '';
    var url = nubeSnapshot().url;
    return (
      '<div class="crozzo-nube-step-panel" data-nube-panel="2" hidden>' +
      '<div class="card">' +
      '<div class="card-header"><span class="card-title">📝 Paso 2 — Crear la base de datos (SQL Editor)</span></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p>Ejecute los scripts <strong>en orden</strong> (1 → 9). Los marcados <em>opcional</em> solo si usa costos, reservorio o cierres de turno. ' +
      'Los scripts están embebidos aquí; también existen en la carpeta <code>docs/</code> del proyecto.</p>' +
      (url
        ? '<p><a href="' +
          esc(supabaseDashboardSqlUrl(url)) +
          '" target="_blank" rel="noopener" class="btn btn-outline btn-sm">↗ Abrir SQL Editor de mi proyecto</a></p>'
        : '<p class="form-hint">Configure la URL en el paso 1 para enlazar su proyecto.</p>') +
      '<p class="form-hint">Buckets Storage tras el script 4: <code>' +
      STORAGE_BUCKETS.join('</code>, <code>') +
      '</code>.</p></div>' +
      '<div id="crozzoNubeSqlWizard">' +
      renderSqlScriptList(firstKey) +
      '</div></div></div>'
    );
  }

  function renderStepVerify() {
    var rows = PROBE_TABLES.map(function (p) {
      return (
        '<tr data-probe-table="' +
        esc(p.table) +
        '"><td>' +
        esc(p.label) +
        '</td><td><code>' +
        esc(p.table) +
        '</code></td><td>Script ' +
        esc(p.script) +
        (p.required ? '' : ' <span class="badge badge-info">opc.</span>') +
        '</td><td class="crozzo-nube-probe-status">—</td></tr>'
      );
    }).join('');
    return (
      '<div class="crozzo-nube-step-panel" data-nube-panel="3" hidden>' +
      '<div class="card">' +
      '<div class="card-header"><span class="card-title">✅ Paso 3 — Verificar conexión y tablas</span></div>' +
      '<p class="form-hint">Comprueba que PostgREST responde y que las tablas principales existen (necesita URL + anon key del paso 1).</p>' +
      '<div class="crozzo-nube-actions" style="margin-bottom:12px;">' +
      '<button type="button" class="btn btn-primary" id="sanBtnTestCloud2">🔌 Probar conexión</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnProbeTables">🔍 Comprobar tablas</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'super-admin-diagnostics\')">🧪 Diagnóstico avanzado</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'pruebas-conexion\')">📡 Pruebas de conexión</button>' +
      '</div>' +
      '<div style="overflow-x:auto;"><table class="data-table crozzo-nube-probe-table"><thead><tr><th>Módulo</th><th>Tabla</th><th>Script</th><th>Estado</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '<p class="form-hint" id="sanProbeSummary" style="margin-top:10px;"></p></div></div>'
    );
  }

  function renderEmpresaPerfilPanel() {
    var cur = '';
    try {
      if (typeof global.crozzoGetPerfilEmpresa === 'function') cur = global.crozzoGetPerfilEmpresa();
    } catch (_) {}
    var pills = '';
    try {
      if (global.CrozzoPerfilesOperativos && typeof global.CrozzoPerfilesOperativos.renderQuickPills === 'function') {
        pills = global.CrozzoPerfilesOperativos.renderQuickPills(false);
      }
    } catch (_) {}
    var preview = '';
    try {
      if (global.CrozzoPerfilesOperativos && typeof global.CrozzoPerfilesOperativos.renderRolePreview === 'function') {
        preview = global.CrozzoPerfilesOperativos.renderRolePreview(cur);
      }
    } catch (_) {}
    return (
      '<div class="card crozzo-nube-empresa-perfil" style="margin-top:14px;">' +
      '<div class="card-header">' +
      '<span class="card-title">🏢 Tamaño de empresa (cliente activo)</span>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;" onclick="navigateTo(\'gestion-perfiles-menus\')">⚙️ Perfiles y menús</button>' +
      '</div>' +
      '<p class="form-hint">Presets para grupos de aprox. <strong>20</strong>, <strong>250</strong> o <strong>500</strong> personas. ' +
      'Ajusta ventas, compras, inventario/bodega y administración por rol.</p>' +
      '<p class="form-hint">Perfil activo: <strong id="sanEmpresaPerfilLabel">' +
      esc(cur || '—') +
      '</strong></p>' +
      '<div class="crozzo-perfil-pills" id="sanEmpresaPerfilPills">' +
      pills +
      '</div>' +
      '<div id="sanEmpresaPerfilPreview" style="margin-top:12px;">' +
      preview +
      '</div></div>'
    );
  }

  function bindEmpresaPerfilPanel() {
    try {
      global.addEventListener('crozzo-perfil-operativo-changed', function () {
        if (global.currentPage !== 'super-admin-nube') return;
        var label = document.getElementById('sanEmpresaPerfilLabel');
        var prev = document.getElementById('sanEmpresaPerfilPreview');
        var cur = typeof global.crozzoGetPerfilEmpresa === 'function' ? global.crozzoGetPerfilEmpresa() : '';
        if (label) label.textContent = cur || '—';
        if (prev && global.CrozzoPerfilesOperativos && global.CrozzoPerfilesOperativos.renderRolePreview) {
          prev.innerHTML = global.CrozzoPerfilesOperativos.renderRolePreview(cur);
        }
        if (typeof global.crozzoRebuildMenusFromRoles === 'function') global.crozzoRebuildMenusFromRoles();
      });
    } catch (_) {}
  }

  function renderStepModules() {
    var rows = MODULES_CLOUD.map(function (m) {
      return (
        '<tr><td>' +
        esc(m.label) +
        '</td><td><code>' +
        esc(m.menu) +
        '</code></td><td>Paso ' +
        m.step +
        '</td><td style="font-size:0.82rem;">' +
        esc(m.tables) +
        (m.optionalSql ? ' <span class="form-hint">(SQL: ' + esc(m.optionalSql) + ')</span>' : '') +
        '</td></tr>'
      );
    }).join('');
    var tables =
      global.__CROZZO_SB_TABLES && global.__CROZZO_SB_TABLES.length
        ? global.__CROZZO_SB_TABLES.join(', ')
        : 'devices, products, sales, comandas, crozzo_empleados, proveedores, …';
    return (
      '<div class="crozzo-nube-step-panel" data-nube-panel="4" hidden>' +
      '<div class="card">' +
      '<div class="card-header">' +
      '<span class="card-title">🧩 Paso 4 — Activar módulos en el POS</span>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;" onclick="navigateTo(\'gestion-perfiles-menus\')">Ir a Perfiles y menús</button>' +
      '</div>' +
      '<p class="form-hint">Tras conectar Supabase, habilite estos módulos por <strong>perfil de empresa</strong> y por <strong>rol</strong> (caja, cocina, inventario…).</p>' +
      '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Módulo</th><th>ID menú</th><th>Cuándo</th><th>Tablas en nube</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>' +
      '<div class="card" style="margin-top:14px;">' +
      '<div class="card-header"><span class="card-title">📚 Catálogo de tablas del POS</span></div>' +
      '<p class="form-hint crozzo-nube-tables-ref">' +
      esc(tables) +
      '</p>' +
      '<p class="form-hint">Documentación: <code>docs/INTEGRACION-MODULOS.md</code>, <code>docs/PROMPT-SQL-SUPABASE-INTEGRACION.md</code>, <code>docs/ALMACENAMIENTO-LOCAL-Y-NUBE.md</code>.</p>' +
      '</div>' +
      renderEmpresaPerfilPanel() +
      '</div>'
    );
  }

  function renderSuperAdminNubeConfigHTML() {
    var step = 1;
    try {
      step = parseInt(localStorage.getItem(LS_NUBE_STEP) || '1', 10) || 1;
    } catch (_) {}
    if (step < 1 || step > 4) step = 1;

    return (
      '<div id="crozzo-nube-hub" class="crozzo-nube-hub">' +
      renderHero() +
      renderStatusPanel() +
      renderWizardNav(step) +
      '<div class="crozzo-nube-wizard-body">' +
      renderStepConnection() +
      renderStepSql() +
      renderStepVerify() +
      renderStepModules() +
      '</div>' +
      '<div class="crozzo-nube-wizard-footer">' +
      '<button type="button" class="btn btn-outline" id="sanBtnPrevStep" ' +
      (step <= 1 ? 'disabled' : '') +
      '>← Anterior</button>' +
      '<button type="button" class="btn btn-primary" id="sanBtnNextStep">' +
      (step >= 4 ? 'Finalizar' : 'Siguiente →') +
      '</button>' +
      '</div></div>'
    );
  }

  function setWizardStep(step) {
    step = Math.max(1, Math.min(4, step));
    try {
      localStorage.setItem(LS_NUBE_STEP, String(step));
    } catch (_) {}
    var hub = document.getElementById('crozzo-nube-hub');
    if (!hub) return;
    hub.querySelectorAll('[data-nube-panel]').forEach(function (panel) {
      var p = parseInt(panel.getAttribute('data-nube-panel'), 10);
      panel.hidden = p !== step;
    });
    hub.querySelectorAll('.crozzo-nube-wizard-nav__item').forEach(function (btn) {
      var s = parseInt(btn.getAttribute('data-nube-step'), 10);
      btn.classList.toggle('crozzo-nube-wizard-nav__item--active', s === step);
    });
    var prev = document.getElementById('sanBtnPrevStep');
    var next = document.getElementById('sanBtnNextStep');
    if (prev) prev.disabled = step <= 1;
    if (next) next.textContent = step >= 4 ? 'Listo ✓' : 'Siguiente →';
  }

  function renderSqlWizardProgress() {
    var el = document.getElementById('crozzoNubeSqlProgress');
    if (!el) return;
    var scripts = getScripts();
    var req = scripts.filter(function (x) { return x.required; });
    var doneMap = readSqlDoneMap();
    var reqDone = req.filter(function (x) { return doneMap[x.key]; }).length;
    el.textContent = reqDone + '/' + req.length;
  }

  function selectSqlScript(key) {
    var scripts = getScripts();
    var s = scripts.find(function (x) { return x.key === key; });
    if (!s) return;
    var ta = document.getElementById('crozzoNubeSqlTextarea');
    if (ta) ta.value = s.sql;
    var title = document.getElementById('crozzoNubeSqlTitle');
    if (title) title.textContent = s.title;
    var desc = document.getElementById('crozzoNubeSqlDesc');
    if (desc) desc.textContent = s.desc;
    var file = document.getElementById('crozzoNubeSqlFile');
    if (file) file.textContent = s.file;
    var mark = document.getElementById('sanSqlMarkDone');
    if (mark) mark.checked = !!readSqlDoneMap()[s.key];
    document.querySelectorAll('.crozzo-nube-sql-list__item').forEach(function (btn) {
      btn.classList.toggle('crozzo-nube-sql-list__item--active', btn.getAttribute('data-sql-key') === key);
    });
    hubStoreActiveSqlKey(key);
  }

  function hubStoreActiveSqlKey(key) {
    var hub = document.getElementById('crozzo-nube-hub');
    if (hub) hub.setAttribute('data-active-sql-key', key);
  }

  function hubGetActiveSqlKey() {
    var hub = document.getElementById('crozzo-nube-hub');
    if (hub && hub.getAttribute('data-active-sql-key')) return hub.getAttribute('data-active-sql-key');
    var scripts = getScripts();
    return scripts[0] ? scripts[0].key : '';
  }

  function sanPopulateFormFromConfig() {
    var c = getMdConfig();
    var sb = getSbFile();
    var syncEl = document.getElementById('mdSupabaseSyncEnabled');
    if (syncEl) syncEl.checked = !!(sb && sb.syncEnabled);
    var urlEl = document.getElementById('mdSupabaseUrl');
    if (urlEl) urlEl.value = (c.supabase && c.supabase.url) || (sb && sb.url) || '';
    var keyEl = document.getElementById('mdSupabaseKey');
    if (keyEl) {
      var fullKey = (c.supabase && c.supabase.anonKey) || getAnonKey(sb) || '';
      if (typeof global.crozzoBindAnonKeyMaskedInput === 'function') {
        global.crozzoBindAnonKeyMaskedInput(keyEl, fullKey);
      } else {
        keyEl.type = 'password';
        keyEl.autocomplete = 'off';
        keyEl.value = '';
        keyEl.placeholder = fullKey ? 'Configurada (pegue solo para cambiar)' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      }
    }
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
    var openLink = document.getElementById('sanBtnOpenSupabase');
    if (openLink) openLink.href = supabaseDashboardSqlUrl(urlEl ? urlEl.value : '');
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
    renderSqlWizardProgress();
  }

  async function probeSupabaseTables() {
    var url = (document.getElementById('mdSupabaseUrl')?.value || '').trim();
    var keyEl = document.getElementById('mdSupabaseKey');
    var key =
      typeof global.crozzoGetEffectiveAnonKeyFromInput === 'function'
        ? global.crozzoGetEffectiveAnonKeyFromInput(keyEl)
        : (keyEl?.value || '').trim();
    var summary = document.getElementById('sanProbeSummary');
    if (!url || !key) {
      if (summary) summary.textContent = 'Configure URL y anon key en el paso 1.';
      if (global.showToast) global.showToast('Faltan credenciales para comprobar tablas.', 'warning');
      return;
    }
    if (summary) summary.textContent = '⏳ Comprobando tablas…';
    var base = url.replace(/\/$/, '');
    var okCount = 0;
    var failReq = 0;
    for (var i = 0; i < PROBE_TABLES.length; i++) {
      var p = PROBE_TABLES[i];
      var row = document.querySelector('[data-probe-table="' + p.table + '"] .crozzo-nube-probe-status');
      if (row) row.textContent = '⏳';
      try {
        var controller = new AbortController();
        var t = global.setTimeout(function () { controller.abort(); }, 5000);
        var res = await fetch(base + '/rest/v1/' + encodeURIComponent(p.table) + '?limit=0&select=id', {
          method: 'GET',
          signal: controller.signal,
          headers: {
            apikey: key,
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
            Prefer: 'count=exact',
          },
        });
        global.clearTimeout(t);
        var ok = res && (res.ok || res.status === 200 || res.status === 206);
        if (row) {
          if (ok) {
            row.innerHTML = '<span class="badge badge-success">OK</span>';
            okCount++;
          } else if (res && res.status === 404) {
            row.innerHTML = '<span class="badge badge-warning">No existe</span>';
            if (p.required) failReq++;
          } else {
            row.innerHTML = '<span class="badge badge-warning">HTTP ' + (res && res.status) + '</span>';
            if (p.required) failReq++;
          }
        }
      } catch (_) {
        if (row) row.innerHTML = '<span class="badge badge-warning">Error</span>';
        if (p.required) failReq++;
      }
    }
    if (summary) {
      summary.textContent =
        okCount +
        ' tablas accesibles de ' +
        PROBE_TABLES.length +
        (failReq ? ' · Faltan ' + failReq + ' tabla(s) obligatoria(s) — ejecute el SQL del paso 2.' : ' · Base lista para operar.');
    }
    if (global.showToast) {
      global.showToast(
        failReq ? 'Faltan tablas obligatorias. Revise el paso 2 (SQL).' : 'Verificación de tablas completada.',
        failReq ? 'warning' : 'success'
      );
    }
  }

  function bindOnce(el, event, handler) {
    if (!el || el._crozzoNubeBound) return;
    el._crozzoNubeBound = true;
    el.addEventListener(event, handler);
  }

  var _empresaPerfilPanelBound = false;

  function initSuperAdminNubeConfig() {
    if (!_empresaPerfilPanelBound) {
      _empresaPerfilPanelBound = true;
      bindEmpresaPerfilPanel();
    }
    var step = 1;
    try {
      step = parseInt(localStorage.getItem(LS_NUBE_STEP) || '1', 10) || 1;
    } catch (_) {}
    setWizardStep(step);

    sanPopulateFormFromConfig();
    renderSqlWizardProgress();
    var scripts = getScripts();
    var firstKey = scripts[0] ? scripts[0].key : '';
    hubStoreActiveSqlKey(hubGetActiveSqlKey() || firstKey);
    if (firstKey) selectSqlScript(hubGetActiveSqlKey() || firstKey);

    document.getElementById('crozzo-nube-hub')?.addEventListener('click', function (ev) {
      var stepBtn = ev.target.closest('[data-nube-step]');
      if (stepBtn && stepBtn.classList.contains('crozzo-nube-wizard-nav__item')) {
        setWizardStep(parseInt(stepBtn.getAttribute('data-nube-step'), 10));
        return;
      }
      var sqlBtn = ev.target.closest('[data-sql-key]');
      if (sqlBtn && sqlBtn.classList.contains('crozzo-nube-sql-list__item')) {
        selectSqlScript(sqlBtn.getAttribute('data-sql-key'));
      }
    });

    bindOnce(document.getElementById('sanBtnAltaGuia'), 'click', openSanAltaNegocioGuide);
    bindOnce(document.getElementById('sanBtnNubeSmoke'), 'click', function () {
      showSanNubeSmokeResults();
    });

    bindOnce(document.getElementById('sanBtnSaveCloud'), 'click', function () {
      if (typeof global.saveSupabaseConfig === 'function') {
        void global.saveSupabaseConfig().then(function () {
          sanRefreshStatusCards();
          sanPopulateFormFromConfig();
        });
      } else if (global.showToast) {
        global.showToast('Función saveSupabaseConfig no disponible.', 'error');
      }
    });

    function runTest() {
      if (typeof global.testSupabaseConnection === 'function') void global.testSupabaseConnection();
    }
    bindOnce(document.getElementById('sanBtnTestCloud'), 'click', runTest);
    bindOnce(document.getElementById('sanBtnTestCloud2'), 'click', runTest);

    bindOnce(document.getElementById('sanBtnReload'), 'click', function () {
      try {
        global.location.reload();
      } catch (_) {}
    });

    bindOnce(document.getElementById('sanBtnProbeTables'), 'click', function () {
      void probeSupabaseTables();
    });

    bindOnce(document.getElementById('sanBtnCopySql'), 'click', function () {
      var ta = document.getElementById('crozzoNubeSqlTextarea');
      if (!ta || !ta.value) return;
      var text = ta.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            if (global.showToast) global.showToast('SQL copiado al portapapeles', 'success');
          },
          function () {
            ta.select();
            document.execCommand('copy');
            if (global.showToast) global.showToast('SQL copiado', 'success');
          }
        );
      } else {
        ta.select();
        try {
          document.execCommand('copy');
          if (global.showToast) global.showToast('SQL copiado', 'success');
        } catch (_) {}
      }
    });

    bindOnce(document.getElementById('sanBtnDownloadSql'), 'click', function () {
      var ta = document.getElementById('crozzoNubeSqlTextarea');
      var fileEl = document.getElementById('crozzoNubeSqlFile');
      if (!ta || !ta.value) return;
      var name = (fileEl && fileEl.textContent) || 'crozzo-supabase.sql';
      name = name.split('/').pop() || name;
      try {
        var blob = new Blob([ta.value], { type: 'text/sql;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        if (global.showToast) global.showToast('Descarga iniciada: ' + name, 'success');
      } catch (e) {
        if (global.showToast) global.showToast('No se pudo descargar', 'error');
      }
    });

    bindOnce(document.getElementById('sanSqlMarkDone'), 'change', function (ev) {
      writeSqlDone(hubGetActiveSqlKey(), !!ev.target.checked);
      var key = hubGetActiveSqlKey();
      var btn = document.querySelector('.crozzo-nube-sql-list__item[data-sql-key="' + key + '"]');
      if (btn) btn.classList.toggle('crozzo-nube-sql-list__item--done', !!ev.target.checked);
    });

    bindOnce(document.getElementById('sanBtnPrevStep'), 'click', function () {
      var cur = parseInt(localStorage.getItem(LS_NUBE_STEP) || '1', 10) || 1;
      setWizardStep(cur - 1);
    });

    bindOnce(document.getElementById('sanBtnNextStep'), 'click', function () {
      var cur = parseInt(localStorage.getItem(LS_NUBE_STEP) || '1', 10) || 1;
      if (cur >= 4) {
        if (global.showToast) global.showToast('Configuración lista. Guarde credenciales y active módulos en Perfiles.', 'success');
        return;
      }
      setWizardStep(cur + 1);
    });

    var urlInput = document.getElementById('mdSupabaseUrl');
    if (urlInput && !urlInput._crozzoNubeUrlChg) {
      urlInput._crozzoNubeUrlChg = true;
      urlInput.addEventListener('input', function () {
        var link = document.getElementById('sanBtnOpenSupabase');
        if (link) link.href = supabaseDashboardSqlUrl(urlInput.value);
      });
    }

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
      }, 500);
    }
  }

  global.renderSuperAdminNubeConfigHTML = renderSuperAdminNubeConfigHTML;
  global.initSuperAdminNubeConfig = initSuperAdminNubeConfig;
  global.crozzoNubeSnapshot = nubeSnapshot;
  global.crozzoNubeProbeTables = probeSupabaseTables;
  global.openSanAltaNegocioGuide = openSanAltaNegocioGuide;
  global.runSanNubeSmokeSelfCheck = runSanNubeSmokeSelfCheck;
  global.showSanNubeSmokeResults = showSanNubeSmokeResults;
})(typeof window !== 'undefined' ? window : globalThis);
