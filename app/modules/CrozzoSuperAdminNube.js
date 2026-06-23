/**
 * Crozzo POS — Centro de configuración global en nube (solo Super Admin).
 * Asistente: credenciales → SQL Editor → verificación → módulos.
 */
(function (global) {
  'use strict';

  var LS_SQL_DONE = 'crozzo_nube_sql_done_v1';
  var LS_NUBE_STEP = 'crozzo_nube_wizard_step';
  var LS_ALTA_CHECKLIST = 'crozzo_nube_alta_checklist_v1';

  /** Pasos operativos (checklist de alta en producción). */
  var ALTA_NEGOCIO_STEPS = [
    {
      id: 'proyecto',
      label: 'Proyecto Supabase creado (1 negocio = 1 proyecto)',
      detail: 'Dashboard → New project → región SA → contraseña DB guardada.',
    },
    {
      id: 'sql_editor',
      label: 'Script 1 — Base POS ejecutado',
      detail: 'SUPABASE-SQL-EDITOR.sql: products, sales, comandas, devices, company_config.',
    },
    {
      id: 'sql_integracion',
      label: 'Scripts 2–4 — Integración, QyC y Storage',
      detail: 'Empleados, proveedores, facturas, buckets oficina-docs y fotos-marcaciones.',
    },
    {
      id: 'sql_opcional',
      label: 'Scripts opcionales según módulos (5–11)',
      detail: 'Costos, reservorio, cierres, runtime mesas, federación bodegas.',
    },
    {
      id: 'credenciales',
      label: 'URL + anon public copiadas (nunca service_role)',
      detail: 'Settings → API. Solo la clave anon public va al POS.',
    },
    {
      id: 'pos_guardar',
      label: 'POS: Guardar y conectar (Super Admin + contraseña)',
      detail: 'Paso 1 de este asistente → Guardar → Recargar si hace falta.',
    },
    {
      id: 'pos_probar',
      label: 'POS: Probar conexión + Comprobar tablas',
      detail: 'Paso 3: todas las tablas obligatorias en verde.',
    },
    {
      id: 'sync',
      label: 'Sincronización real entre equipos',
      detail: 'Caja central sube catálogo; tablet/otra caja baja o empareja QR.',
    },
    {
      id: 'perfiles',
      label: 'Perfiles login nube (opcional — email/contraseña)',
      detail: 'Script 13 o crear usuario en Super Admin → Paso 3. Los cajeros con PIN usan pos_staff (no profiles).',
    },
    {
      id: 'device_qr_mesh',
      label: 'Script 15 — QRs internos / malla entre tablets (recomendado)',
      detail: 'Tabla crozzo_device_qr_slots: respaldo cuando cae Wi‑Fi; Bluetooth + identidad de dispositivos.',
    },
    {
      id: 'seguridad',
      label: 'Seguridad y respaldo',
      detail: 'Anon key enmascarada; backup Supabase; sin service_role en dispositivos.',
    },
  ];

  var STORAGE_BUCKETS = ['oficina-docs', 'fotos-marcaciones'];

  /** Metadatos por script SQL (tablas, dependencias, errores frecuentes). */
  var SQL_SCRIPT_GUIDE = {
    editor: {
      tables: 'products, sales, comandas, devices, company_config, pos_staff, clients, sync_queue, shift_closes',
      depends: 'Ninguno — ejecutar primero',
      modules: 'POS base, ventas, comandas, multi-dispositivo, cierre turno',
      steps: [
        'Supabase → SQL → New query',
        'Pegar TODO el script (no omitir cabecera)',
        'Run ▶ y espere «Success. No rows returned» o filas de verificación al final',
        'Si falla en company_config seed, ignore el notice y continúe',
      ],
      errors: [
        '401/403 en POS → al final del script está crozzo_fix_all_grants(); vuelva a ejecutarlo',
        'PGRST204 / columna no existe → ejecute de nuevo el script completo (tiene migraciones)',
        'products id UUID vs bigint → use el script actual; no mezcle proyectos viejos',
      ],
    },
    integracion: {
      tables: 'crozzo_empleados, crozzo_marcaciones, crozzo_pedidos_internos, crozzo_nomina_periodos, crozzo_proveedores_ops',
      depends: 'Script 1 (editor)',
      modules: 'Marcación, pedidos internos, planilla, RRHH',
      steps: ['Ejecutar después del script 1', 'Verifique tablas crozzo_% en Table Editor'],
      errors: ['FK empleado_id → cree primero crozzo_empleados'],
    },
    qyc: {
      tables: 'proveedores, recepciones, facturas, materias_primas, usuarios, configuracion',
      depends: 'Scripts 1 y 2',
      modules: 'Centro compras, recepción facturas, QyC, oficina',
      steps: ['Crea bucket oficina-docs al final del script', 'Usuario admin QyC PIN 141414 (cambiar en app)'],
      errors: ['facturas_metodo_pago_chk → ejecute script 5 (fix tarjeta)'],
    },
    storage: {
      tables: 'storage.buckets (fotos-marcaciones)',
      depends: 'Script 3 (qyc crea oficina-docs)',
      modules: 'Fotos marcación, documentos proveedor',
      steps: ['Dashboard → Storage puede mostrar buckets tras este script', 'Público ON para anon key del POS'],
      errors: ['policy already exists → normal; el script hace drop/create'],
    },
    fix_tarjeta: {
      tables: 'ALTER facturas (metodo_pago)',
      depends: 'Script 3 si la base ya existía antes del fix',
      modules: 'Pagos oficina con tarjeta',
      steps: ['Solo si pagos con tarjeta fallan en QyC/oficina'],
      errors: [],
    },
    costos: {
      tables: 'crozzo_matriz_precios, crozzo_inventario_movimientos, crozzo_planilla_feed',
      depends: 'Scripts 1–3',
      modules: 'Sistema costos, matriz MP, inventario ledger',
      steps: ['Opcional si usa costos e inventario valorizado'],
      errors: [],
    },
    reservorio: {
      tables: 'crozzo_reservorio_sync_queue, crozzo_reservorio_snapshots, vista crozzo_v_flujo_compras',
      depends: 'Scripts 1–3 y 7 si usa costos',
      modules: 'Reservorio unificado, sync offline compras',
      steps: ['Puente proveedores POS ↔ QyC (pos_proveedor_id)'],
      errors: [],
    },
    shift_closes: {
      tables: 'shift_closes (refuerzo índices)',
      depends: 'Script 1 (tabla ya existe); use si cierres no suben',
      modules: 'Cierre de caja / arqueo en nube',
      steps: ['Idempotente — seguro re-ejecutar'],
      errors: [],
    },
    pos_runtime: {
      tables: 'crozzo_sede_runtime',
      depends: 'Script 1',
      modules: 'Mesas, carritos, runtime cloud entre cajas',
      steps: [
        'Ejecutar script',
        'Dashboard → Database → Replication → activar crozzo_sede_runtime en Realtime',
      ],
      errors: ['Mesas no se actualizan entre tablets → Realtime no habilitado'],
    },
    federacion: {
      tables: 'crozzo_bodegas, crozzo_remisiones, crozzo_federacion_entrante, crozzo_federacion_socios',
      depends: 'Scripts 1 y 7 recomendados',
      modules: 'Super Admin → Federación / remisiones entre sedes',
      steps: ['Un proyecto Supabase por negocio', 'Repita en cada sede que intercambie stock'],
      errors: [],
    },
    device_qr_slots: {
      tables: 'crozzo_device_qr_slots',
      depends: 'Script 1 (base POS). Mismo proyecto Supabase que caja y tablets.',
      modules: 'Comunicación entre dispositivos, malla BLE/LAN, QRs cada 4 h, renombre de tablets',
      steps: [
        'Supabase → SQL → New query',
        'Copie el script 15 desde el Paso 2 (o use «Copiar SQL» en este panel)',
        'Run ▶ y espere «Success»',
        'Vuelva aquí → «Comprobar tabla» → «Activar en este equipo»',
        'Recargue la app (F5) si antes veía error 404 en consola',
      ],
      errors: [
        '404 / schema cache → la tabla no existe: ejecute el script 15 completo',
        '401 en REST → revise anon key en Paso 1 e inicie sesión (no guest)',
        'Realtime: Dashboard → Database → Replication → crozzo_device_qr_slots ON',
      ],
    },
  };

  var NUBE_ARCHITECTURE = [
    { icon: '🏪', title: '1 negocio = 1 proyecto Supabase', body: 'No comparta un proyecto entre marcas distintas. Mismo Business ID en todos los equipos del negocio.' },
    { icon: '🔑', title: 'Solo anon public en el POS', body: 'Nunca pegue service_role en la app. Super Admin confirma contraseña al guardar.' },
    { icon: '📝', title: 'SQL en orden 1 → 16', body: 'Obligatorios: 1–4 y 10. Opcionales: 5–16. Script 16 = pos_staff business_id (usuarios/PIN nube).' },
    { icon: '📡', title: 'LAN + Nube', body: 'Con internet caído, LAN/P2P sigue operando; la nube drena colas al volver.' },
    { icon: '🪣', title: 'Storage', body: 'Buckets: oficina-docs (QyC/oficina), pos-facturas-share (WhatsApp PDF 30 días), fotos-marcaciones.' },
  ];

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

  // level: 'critico' (la conexión NO está lista sin esto) | 'recomendado' | 'opcional' (módulos)
  var PROBE_TABLES = [
    { table: 'devices', label: 'Dispositivos', script: '1', level: 'critico', required: true },
    { table: 'products', label: 'Productos POS', script: '1', level: 'critico', required: true },
    { table: 'sales', label: 'Ventas', script: '1', level: 'critico', required: true },
    { table: 'comandas', label: 'Comandas', script: '1', level: 'critico', required: true },
    { table: 'company_config', label: 'Config empresa', script: '1', level: 'critico', required: true },
    { table: 'pos_staff', label: 'Usuarios caja', script: '1', level: 'critico', required: true },
    { table: 'sync_queue', label: 'Cola sync', script: '1', level: 'critico', required: true },
    { table: 'crozzo_sede_runtime', label: 'Runtime mesas (vivo)', script: '10', level: 'critico', required: true, probeCol: 'location_id' },
    { table: 'profiles', label: 'Perfiles (login nube)', script: '1', level: 'recomendado', required: false },
    { table: 'crozzo_mesa_runtime', label: 'Runtime por mesa (escala)', script: '12', level: 'recomendado', required: false, probeCol: 'location_id' },
    { table: 'crozzo_empleados', label: 'Empleados RRHH', script: '2', level: 'opcional', required: false },
    { table: 'crozzo_marcaciones', label: 'Marcaciones', script: '2', level: 'opcional', required: false },
    { table: 'crozzo_pedidos_internos', label: 'Pedidos internos', script: '2', level: 'opcional', required: false },
    { table: 'proveedores', label: 'Proveedores QyC', script: '3', level: 'opcional', required: false },
    { table: 'recepciones', label: 'Recepciones', script: '3', level: 'opcional', required: false },
    { table: 'facturas', label: 'Facturas oficina', script: '3', level: 'opcional', required: false },
    { table: 'crozzo_matriz_precios', label: 'Matriz costos', script: '7', level: 'opcional', required: false },
    { table: 'crozzo_reservorio_sync_queue', label: 'Cola reservorio', script: '8', level: 'opcional', required: false },
    { table: 'shift_closes', label: 'Cierres turno', script: '9', level: 'opcional', required: false },
    { table: 'crozzo_bodegas', label: 'Bodegas federación', script: '11', level: 'opcional', required: false },
    {
      table: 'crozzo_device_qr_slots',
      label: 'QRs internos (malla / BLE)',
      script: '15',
      level: 'recomendado',
      required: false,
      probeCol: 'id',
    },
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

  function getAllScripts() {
    var list = getScripts().slice();
    if (global.CrozzoSupabaseSqlExtras && global.CrozzoSupabaseSqlExtras.list) {
      list = list.concat(global.CrozzoSupabaseSqlExtras.list());
    }
    return list.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
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
      hasKey:
        (typeof global.crozzoSupabaseKeyLooksValid === 'function' && global.crozzoSupabaseKeyLooksValid(key)) ||
        key.length >= 20,
      clientOk: clientOk,
      ready: ready,
      deviceId: (sb && sb.deviceId) || md.deviceId || '',
      deviceName: (sb && sb.deviceName) || '',
      businessId: md.businessId || (sb && sb.businessId) || '',
      businessName: md.businessName || '',
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
        var bar = document.querySelector('.crozzo-nube-alta-progress span');
        if (bar) bar.style.width = Math.round((prog.done / prog.total) * 100) + '%';
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
    var scripts = getAllScripts();
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
        '<label class="crozzo-nube-alta-row">' +
        '<input type="checkbox" data-alta-check="' +
        esc(it.id) +
        '"' +
        ck +
        '>' +
        '<span class="crozzo-nube-alta-row__body">' +
        '<strong>' +
        esc(it.label) +
        '</strong>' +
        (it.detail ? '<small>' + esc(it.detail) + '</small>' : '') +
        '</span></label>'
      );
    }).join('');
    var body =
      '<p class="form-hint"><strong>1 negocio = 1 proyecto Supabase.</strong> Marque cada paso al completarlo (se guarda en este navegador). Progreso: <strong id="sanAltaChecklistProgress">' +
      prog.done +
      '/' +
      prog.total +
      '</strong></p>' +
      '<div class="crozzo-nube-alta-progress" aria-hidden="true"><span style="width:' +
      Math.round((prog.done / prog.total) * 100) +
      '%"></span></div>' +
      '<div id="sanAltaChecklistRoot" class="crozzo-nube-alta-checklist">' +
      rows +
      '</div>' +
      '<p class="form-hint" style="margin-top:12px;">Use el asistente principal (pasos 1–4) y la <strong>Guía maestra</strong> desplegable para el detalle de cada SQL.</p>' +
      '<div class="modal-actions" style="margin-top:16px;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-outline" id="sanAltaGuideClose">Cerrar</button>' +
      '<button type="button" class="btn btn-outline" id="sanAltaGuideStep1">Ir a Paso 1</button>' +
      '<button type="button" class="btn btn-outline" id="sanAltaGuideStep2">Ir a SQL</button>' +
      '<button type="button" class="btn btn-primary" id="sanAltaGuideSmoke">Diagnóstico rápido</button></div>';
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
    document.getElementById('sanAltaGuideStep1')?.addEventListener('click', function () {
      global.closeModal({ skipCobroAbort: true });
      setWizardStep(1);
    });
    document.getElementById('sanAltaGuideStep2')?.addEventListener('click', function () {
      global.closeModal({ skipCobroAbort: true });
      setWizardStep(2);
      var w = document.getElementById('crozzoNubeSqlWizard');
      if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderArchitectureCards() {
    return NUBE_ARCHITECTURE.map(function (a) {
      return (
        '<div class="crozzo-nube-arch-card">' +
        '<span class="crozzo-nube-arch-card__icon" aria-hidden="true">' +
        a.icon +
        '</span>' +
        '<div><strong>' +
        esc(a.title) +
        '</strong><p>' +
        esc(a.body) +
        '</p></div></div>'
      );
    }).join('');
  }

  function renderSqlGuidePanel(key) {
    var g = SQL_SCRIPT_GUIDE[key];
    if (!g) {
      return '<p class="form-hint crozzo-nube-sql-guide">Seleccione un script para ver tablas, dependencias y errores frecuentes.</p>';
    }
    var steps = (g.steps || [])
      .map(function (s) {
        return '<li>' + esc(s) + '</li>';
      })
      .join('');
    var errs = (g.errors || [])
      .map(function (e) {
        return '<li>' + esc(e) + '</li>';
      })
      .join('');
    return (
      '<div class="crozzo-nube-sql-guide" id="crozzoNubeSqlGuide">' +
      '<div class="crozzo-nube-sql-guide__grid">' +
      '<div><span class="crozzo-nube-sql-guide__label">Tablas / objetos</span><p>' +
      esc(g.tables || '—') +
      '</p></div>' +
      '<div><span class="crozzo-nube-sql-guide__label">Depende de</span><p>' +
      esc(g.depends || '—') +
      '</p></div>' +
      '<div><span class="crozzo-nube-sql-guide__label">Módulos POS</span><p>' +
      esc(g.modules || '—') +
      '</p></div>' +
      '</div>' +
      (steps ? '<p class="crozzo-nube-sql-guide__label">Pasos en Supabase</p><ol class="crozzo-nube-sql-guide__ol">' + steps + '</ol>' : '') +
      (errs ? '<p class="crozzo-nube-sql-guide__label crozzo-nube-sql-guide__label--warn">Si algo falla</p><ul class="crozzo-nube-sql-guide__ul">' + errs + '</ul>' : '') +
      '</div>'
    );
  }

  function renderFullGuideAccordion() {
    var scripts = getAllScripts();
    var req = scripts.filter(function (s) {
      return s.required;
    });
    var opt = scripts.filter(function (s) {
      return !s.required;
    });
    var reqList = req
      .map(function (s) {
        return '<li><strong>' + s.order + '.</strong> ' + esc(s.title) + ' — <code>' + esc(s.file) + '</code></li>';
      })
      .join('');
    var optList = opt
      .map(function (s) {
        return '<li><strong>' + s.order + '.</strong> ' + esc(s.title) + '</li>';
      })
      .join('');
    return (
      '<div class="card crozzo-nube-master-guide">' +
      '<div class="card-header"><span class="card-title">Guía maestra — configuración nube completa</span></div>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>A. Crear proyecto Supabase (antes del POS)</summary>' +
      '<ol class="crozzo-nube-guide-ol">' +
      '<li>Entrar a <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com/dashboard</a> → <strong>New project</strong>.</li>' +
      '<li>Elegir región cercana (ej. South America). Contraseña de DB: guárdela en gestor de claves.</li>' +
      '<li><strong>1 negocio = 1 proyecto.</strong> No mezcle Álamos y Pinares en el mismo proyecto.</li>' +
      '<li>Espere a que el proyecto esté <em>Active</em> (2–5 min).</li>' +
      '</ol></details>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>B. Scripts SQL obligatorios (' +
      req.length +
      ')</summary>' +
      '<ol class="crozzo-nube-guide-ol">' +
      reqList +
      '</ol>' +
      '<p class="form-hint">Vaya al <strong>Paso 2</strong> de este asistente: copie cada script → SQL Editor → Run → marque «Ya lo ejecuté».</p>' +
      '</details>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>C. Scripts opcionales (' +
      opt.length +
      ') — según módulos activos</summary>' +
      '<ul class="crozzo-nube-guide-ol">' +
      optList +
      '</ul></details>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>D. Credenciales en el POS (Paso 1)</summary>' +
      '<ol class="crozzo-nube-guide-ol">' +
      '<li>Supabase → Settings → API → copiar <strong>Project URL</strong> y <strong>anon public</strong>.</li>' +
      '<li>En este asistente: activar sync, pegar URL y clave, nombre del equipo.</li>' +
      '<li><strong>Guardar y conectar</strong> — el sistema pedirá contraseña de Super Admin.</li>' +
      '<li>Pulse <strong>Recargar aplicación</strong> si <code>__SUPABASE</code> no inicia.</li>' +
      '</ol></details>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>E. Verificación (Paso 3)</summary>' +
      '<ol class="crozzo-nube-guide-ol">' +
      '<li>Probar conexión — debe mostrar proyecto alcanzable.</li>' +
      '<li>Comprobar tablas — todas las obligatorias en verde.</li>' +
      '<li>En caja central: primera venta o «Subir a nube»; en otra caja: sincronizar catálogo.</li>' +
      '</ol></details>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>F. Storage (buckets)</summary>' +
      '<ul class="crozzo-nube-guide-ol">' +
      '<li><code>oficina-docs</code> — creado por script 3 (facturas PDF, RUT proveedor).</li>' +
      '<li><code>fotos-marcaciones</code> — script 4 (fotos control de acceso).</li>' +
      '<li>Dashboard → Storage: verifique que existan y sean <strong>public</strong> si usa anon key.</li>' +
      '</ul></details>' +
      '<details class="crozzo-nube-guide-details">' +
      '<summary>G. Módulos y perfiles (Paso 4)</summary>' +
      '<p class="form-hint">Super Admin → Perfiles y menús: active solo lo que el negocio usa (restaurante, compras, costos…).</p>' +
      '</details>' +
      '</div>'
    );
  }

  function renderHero() {
    var prog = altaChecklistProgress();
    var scripts = getAllScripts();
    return (
      '<div class="crozzo-nube-hero card">' +
      '<div class="crozzo-nube-hero__body">' +
      '<p class="crozzo-nube-hero__eyebrow">Super Admin · Centro de nube</p>' +
      '<h2 class="crozzo-nube-hero__title">Configuración Supabase paso a paso</h2>' +
      '<p class="form-hint crozzo-nube-hero__lead">' +
      'Pegue URL y anon key de Supabase, guarde, y siga los pasos. El POS funciona sin nube en modo local.' +
      '</p>' +
      '<div class="crozzo-nube-arch-grid">' +
      renderArchitectureCards() +
      '</div>' +
      '<div class="crozzo-nube-actions" style="margin-top:14px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-primary btn-sm" id="sanBtnAltaGuia">Checklist operativo (' +
      prog.done +
      '/' +
      prog.total +
      ')</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnNubeSmoke">Diagnóstico rápido</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnScrollSql">Ir a SQL Editor</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnDeviceQrQuick">📲 QRs entre dispositivos</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo(\'super-admin-federacion\')">Federación bodegas</button>' +
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

  function renderPerfPanel() {
    var t =
      global.CrozzoCloudThrottle && typeof global.CrozzoCloudThrottle.snapshot === 'function'
        ? global.CrozzoCloudThrottle.snapshot()
        : null;
    var pressure = !!(t && t.underPressure);
    var intervalSec = t ? Math.round(t.queueIntervalMs / 1000) : 20;
    var batch = t ? t.batchLimit : 8;
    var reason = t && t.reason ? ' (' + t.reason + ')' : '';
    return (
      '<div class="card crozzo-nube-perf-card" style="margin-bottom:14px;">' +
      '<div class="card-header"><span class="card-title">Rendimiento y anti-saturación</span></div>' +
      '<p class="form-hint" style="margin:0 0 10px;">' +
      'La app envía operaciones en lotes pequeños y reduce tráfico automáticamente ante errores 429, 503 o timeouts.' +
      '</p>' +
      '<ul class="crozzo-nube-checklist">' +
      '<li>Intervalo de cola multidispositivo: <strong>' +
      intervalSec +
      ' s</strong> (wizard «Intervalo sync», 5–300 s)</li>' +
      '<li>Lote máximo por ciclo: <strong>' +
      batch +
      '</strong> operaciones</li>' +
      '<li>Estado de presión: ' +
      (pressure
        ? '<span class="badge badge-warning">Frenado temporal' + esc(reason) + '</span>'
        : '<span class="badge badge-success">Normal</span>') +
      '</li>' +
      '</ul>' +
      '<p class="form-hint" style="margin-top:10px;">' +
      '<strong>Recomendaciones:</strong> use 20–60 s de intervalo con varias tablets; comprima imágenes antes de subir; ' +
      'evite pruebas masivas de SQL en hora pico; en sedes grandes active Realtime solo en comandas/mesas críticas.' +
      '</p>' +
      '</div>'
    );
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
    var scripts = getAllScripts();
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
      '<dt>Nombre negocio</dt><dd>' +
      esc(s.businessName || (s.businessId ? '—' : '(sin configurar)')) +
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
      '<p class="form-hint" style="margin:0 0 12px;">' +
      'Supabase → Settings → API → copie <strong>Project URL</strong> y <strong>anon public</strong> (nunca <code>service_role</code>).' +
      '</p>' +
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
      '<div class="form-group full"><label class="form-label">Clave pública (Publishable o anon)</label>' +
      '<input class="form-input" type="password" id="mdSupabaseKey" value="" placeholder="sb_publishable_… o eyJhbGciOiJIUzI1NiIs…" autocomplete="off" title="Publishable (sb_publishable_…) o anon public legacy (eyJ…)"></div>' +
      '<p class="form-hint">Dashboard → Settings → API: copie <strong>Publishable key</strong> (nuevo) o <strong>anon public</strong> (legacy). Nunca <code>sb_secret_</code> ni <code>service_role</code>.</p>' +
      '<div class="form-group"><label class="form-label">Nombre de este equipo</label>' +
      '<input class="form-input" id="mdCloudDeviceName" value="' +
      esc(deviceName) +
      '" placeholder="Ej: Caja 1 · Tablet barra"></div>' +
      '<div class="form-group"><label class="form-label">ID dispositivo</label>' +
      '<input class="form-input" id="mdCloudDeviceIdInput" value="' +
      esc(deviceId) +
      '" placeholder="Vacío = autogenerar" autocomplete="off"></div>' +
      '<div class="form-group"><label class="form-label">Nombre del negocio</label>' +
      '<input class="form-input" id="mdBusinessName" value="' +
      esc(c.businessName || '') +
      '" placeholder="Ej. Álamos" autocomplete="off"></div>' +
      '<p id="mdBusinessLookupHint" class="form-hint" hidden style="margin-top:6px;"></p>' +
      '<div class="form-group"><label class="form-label">Business ID</label>' +
      '<div class="crozzo-nube-inline-actions">' +
      '<input class="form-input" id="mdBusinessId" value="' +
      esc(c.businessId || '') +
      '">' +
      '<button type="button" class="btn btn-outline" onclick="typeof generateBusinessId===\'function\'&&generateBusinessId()">Generar</button></div>' +
      '<p class="form-hint">Mismo nombre e ID en caja y tablets. Viajan en el QR de emparejamiento.</p></div>' +
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
    var scripts = getAllScripts();
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
        (s.key === 'device_qr_slots' ? ' <span class="badge badge-warning">malla</span>' : '') +
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
    html +=
      '<p class="form-hint"><code id="crozzoNubeSqlFile">' +
      esc(file) +
      '</code> · <span id="crozzoNubeSqlStats">' +
      (sql ? Math.round(sql.length / 1024) + ' KB · ' + (sql.split('\n').length + ' líneas') : '') +
      '</span></p>';
    html += renderSqlGuidePanel(current ? current.key : '');
    html +=
      '<textarea id="crozzoNubeSqlTextarea" class="crozzo-nube-sql-textarea" readonly spellcheck="false" aria-label="Script SQL"></textarea>';
    html += '<div class="crozzo-nube-sql-editor__foot">';
    html +=
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnOpenSqlExtern">↗ Pegar en Supabase</button>';
    html +=
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnNextSql">Siguiente script →</button>';
    html +=
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnExpandSql">Pantalla completa</button>';
    html += '</div>';
    html +=
      '<p class="form-hint">En Supabase: <strong>SQL → New query</strong> → pegar → <strong>Run</strong>. Espere «Success» antes del siguiente script.</p>';
    html += '</div></div>';
    return html;
  }

  function renderStepSql() {
    var scripts = getAllScripts();
    var firstKey = scripts[0] ? scripts[0].key : '';
    var url = nubeSnapshot().url;
    return (
      '<div class="crozzo-nube-step-panel" data-nube-panel="2" hidden>' +
      '<div class="card">' +
      '<div class="card-header"><span class="card-title">📝 Paso 2 — Crear la base de datos (SQL Editor)</span></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p>Ejecute los scripts <strong>en orden</strong> (1 → 16). Obligatorios: <strong>1–4 y 10</strong>. Si F12 muestra error <code>business_id</code> en <code>pos_staff</code>: script <strong>16</strong>. Recomendado malla: <strong>15 (QRs entre dispositivos)</strong>. Opcionales: costos (7), reservorio (8), cierres (9), federación (11). ' +
      'Cada script incluye editor, guía de tablas y errores frecuentes.</p>' +
      '<div class="crozzo-nube-sql-progress-bar" aria-hidden="true"><span id="crozzoNubeSqlProgressBar"></span></div>' +
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

  function renderCloudLoginPanel() {
    return (
      '<div class="card" style="margin-top:14px;">' +
      '<div class="card-header"><span class="card-title">🔐 Login nube (profiles)</span></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p><strong>profiles=0 es normal</strong> si solo usa login local (usuario + PIN de caja). ' +
      'La tabla <code>profiles</code> es para entrar con <strong>correo@… + contraseña</strong> (Supabase Auth).</p>' +
      '<ul class="crozzo-nube-guide-ol" style="margin:8px 0;">' +
      '<li><strong>Cajeros del día a día</strong> → usuarios locales (<code>pos_staff</code>) sincronizados vía catálogo/QR.</li>' +
      '<li><strong>Admin remoto / correo</strong> → cree usuario aquí o en Supabase → Authentication → Users.</li>' +
      '<li>Si ya creó usuarios en Authentication y profiles sigue en 0, ejecute el <strong>Script 13</strong> en Paso 2.</li>' +
      '</ul></div>' +
      '<p class="form-hint" id="sanProfilesCount">Perfiles en nube: — (pulse Comprobar tablas)</p>' +
      '<div class="crozzo-form-row">' +
      '<div class="form-group"><label class="form-label" for="sanCloudUserEmail">Correo</label><input type="email" id="sanCloudUserEmail" class="form-input" placeholder="admin@negocio.com" autocomplete="off"></div>' +
      '<div class="form-group"><label class="form-label" for="sanCloudUserPass">Contraseña</label><input type="password" id="sanCloudUserPass" class="form-input" placeholder="mín. 6 caracteres" autocomplete="new-password"></div>' +
      '<div class="form-group" style="flex:0 1 140px;"><label class="form-label" for="sanCloudUserRole">Rol</label><select id="sanCloudUserRole" class="form-select">' +
      '<option value="cajero">Cajero</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option>' +
      '</select></div>' +
      '<div class="form-group form-group--action"><label class="form-label" aria-hidden="true">&nbsp;</label><button type="button" class="btn btn-primary" id="sanBtnCreateCloudUser">➕ Crear usuario nube</button></div>' +
      '</div>' +
      '<p class="form-hint">Tip: en Supabase → Authentication → Providers → Email, desactive «Confirm email» para que el usuario entre de inmediato sin revisar correo.</p>' +
      '</div>'
    );
  }

  function renderDeviceQrMeshPanel() {
    var missing =
      global.CrozzoInternalQrRegistry &&
      typeof global.CrozzoInternalQrRegistry.isCloudQrTableMissing === 'function' &&
      global.CrozzoInternalQrRegistry.isCloudQrTableMissing();
    var done = !!readSqlDoneMap().device_qr_slots;
    return (
      '<div class="card crozzo-nube-device-qr" style="margin-bottom:14px;border:1px solid var(--border, #dde3ed);">' +
      '<div class="card-header"><span class="card-title">📲 Comunicación entre dispositivos (Script 15)</span>' +
      '<span id="sanDeviceQrStatus" class="badge ' +
      (missing ? 'badge-warning' : done ? 'badge-success' : 'badge-info') +
      '">' +
      (missing ? 'Tabla pendiente' : done ? 'Instalado' : 'Sin comprobar') +
      '</span></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p>Crea la tabla <code>crozzo_device_qr_slots</code> en Supabase para que caja, cocina y tablets se encuentren por nombre ' +
      '(QR cada 4 h + malla Bluetooth/LAN cuando cae el internet).</p>' +
      '<p class="form-hint">Si ve en consola <code>404 crozzo_device_qr_slots</code>, siga los pasos de abajo.</p>' +
      '</div>' +
      '<ol class="crozzo-nube-guide-ol" style="margin:0 0 12px 1.2rem;">' +
      '<li><strong>Copiar SQL</strong> del script 15</li>' +
      '<li><strong>Abrir Supabase</strong> → SQL Editor → pegar → <strong>Run</strong></li>' +
      '<li><strong>Comprobar tabla</strong> (debe salir OK)</li>' +
      '<li><strong>Activar en este equipo</strong> y recargar (F5)</li>' +
      '</ol>' +
      '<div class="crozzo-nube-actions" style="flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-primary btn-sm" id="sanBtnDeviceQrOpenScript">1️⃣ Ver script 15</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnDeviceQrCopySql">📋 Copiar SQL</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnDeviceQrOpenSupabase">↗ Abrir Supabase SQL</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnDeviceQrCheck">2️⃣ Comprobar tabla</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanBtnDeviceQrActivate">3️⃣ Activar en este equipo</button>' +
      '</div>' +
      '<p class="form-hint" id="sanDeviceQrHint" style="margin-top:10px;">Archivo: <code>docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql</code></p>' +
      '</div>'
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
      renderDeviceQrMeshPanel() +
      '<div class="card">' +
      '<div class="card-header"><span class="card-title">✅ Paso 3 — Verificar conexión y tablas</span></div>' +
      '<p class="form-hint">Comprueba que PostgREST responde y que las tablas principales existen (necesita URL + anon key del paso 1).</p>' +
      '<div class="crozzo-nube-callout">' +
      '<p><strong>Interpretación:</strong> <span class="badge badge-success">OK</span> = tabla accesible con anon key. ' +
      '<span class="badge badge-warning">No existe</span> = falta ejecutar el script indicado. ' +
      'HTTP 401/403 = ejecute <code>select crozzo_fix_all_grants();</code> en SQL Editor o repita script 1.</p></div>' +
      '<div class="crozzo-nube-actions" style="margin-bottom:12px;">' +
      '<button type="button" class="btn btn-primary" id="sanBtnTestCloud2">🔌 Probar conexión</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnProbeTables">🔍 Comprobar tablas</button>' +
      '<button type="button" class="btn btn-outline" id="sanBtnUploadCatalog">⬆️ Subir catálogo a la nube</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'super-admin-sync-priorities\')">📶 Prioridades sync</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'super-admin-diagnostics\')">🧪 Diagnóstico avanzado</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'pruebas-conexion\')">📡 Pruebas de conexión</button>' +
      '</div>' +
      '<div style="overflow-x:auto;"><table class="data-table crozzo-nube-probe-table"><thead><tr><th>Módulo</th><th>Tabla</th><th>Script</th><th>Estado</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      renderCloudLoginPanel() +
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
    var tipoGrid = '';
    try {
      if (global.CrozzoPerfilesBiblioteca && global.CrozzoPerfilesBiblioteca.renderBusinessTypeGrid) {
        tipoGrid = global.CrozzoPerfilesBiblioteca.renderBusinessTypeGrid(cur);
      }
    } catch (_) {}
    var tplQuick = '';
    try {
      if (global.CrozzoPerfilesBiblioteca && typeof global.crozzoLoadMenuProfilesConfig === 'function') {
        var cfgN = global.crozzoLoadMenuProfilesConfig();
        var tlist = cfgN.savedTemplates || [];
        if (tlist.length) {
          tplQuick =
            '<div class="crozzo-gestion-quick-tpl" style="margin-top:10px;"><span class="form-hint">Plantillas:</span> ' +
            tlist
              .slice(0, 4)
              .map(function (t) {
                return (
                  '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoPerfilesBiblioteca.applyEmpresa(\'' +
                  t.id +
                  '\')">' +
                  esc(t.nombre) +
                  '</button>'
                );
              })
              .join(' ') +
            '</div>';
        }
      }
    } catch (_) {}
    return (
      '<div class="card crozzo-nube-empresa-perfil" style="margin-top:14px;">' +
      '<div class="card-header">' +
      '<span class="card-title">Tipo de negocio (cliente activo)</span>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-left:auto;" onclick="navigateTo(\'gestion-perfiles-menus\')">Configuración completa</button>' +
      '</div>' +
      '<p class="form-hint">Elija el tipo de operación. Guarde plantillas en <strong>Configuración completa</strong> para aplicarlas en un clic a otros clientes.</p>' +
      '<p class="form-hint">Activo: <strong id="sanEmpresaPerfilLabel">' +
      esc(cur || '—') +
      '</strong></p>' +
      tplQuick +
      (tipoGrid || '<div class="crozzo-perfil-pills" id="sanEmpresaPerfilPills">' + pills + '</div>') +
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
      '<details class="crozzo-nube-guide-details crozzo-nube-advanced-block">' +
      '<summary>Guía completa, rendimiento y documentación avanzada</summary>' +
      renderFullGuideAccordion() +
      renderPerfPanel() +
      '</details>' +
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
    var scripts = getAllScripts();
    var req = scripts.filter(function (x) { return x.required; });
    var doneMap = readSqlDoneMap();
    var reqDone = req.filter(function (x) { return doneMap[x.key]; }).length;
    el.textContent = reqDone + '/' + req.length;
    updateSqlProgressBar();
  }

  function selectSqlScript(key) {
    var scripts = getAllScripts();
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
    var stats = document.getElementById('crozzoNubeSqlStats');
    if (stats && s.sql) {
      stats.textContent = Math.round(s.sql.length / 1024) + ' KB · ' + s.sql.split('\n').length + ' líneas';
    }
    var guideHost = document.getElementById('crozzoNubeSqlGuide');
    if (guideHost && guideHost.parentElement) {
      guideHost.outerHTML = renderSqlGuidePanel(key);
    }
    updateSqlProgressBar();
    hubStoreActiveSqlKey(key);
  }

  function updateSqlProgressBar() {
    var bar = document.getElementById('crozzoNubeSqlProgressBar');
    if (!bar) return;
    var scripts = getAllScripts();
    var doneMap = readSqlDoneMap();
    var done = scripts.filter(function (s) {
      return doneMap[s.key];
    }).length;
    var pct = scripts.length ? Math.round((done / scripts.length) * 100) : 0;
    bar.style.width = pct + '%';
    bar.setAttribute('title', done + '/' + scripts.length + ' scripts marcados');
  }

  function selectNextSqlScript() {
    var scripts = getAllScripts();
    var key = hubGetActiveSqlKey();
    var idx = scripts.findIndex(function (s) {
      return s.key === key;
    });
    var next = scripts[idx + 1] || scripts[0];
    if (next) selectSqlScript(next.key);
  }

  function hubStoreActiveSqlKey(key) {
    var hub = document.getElementById('crozzo-nube-hub');
    if (hub) hub.setAttribute('data-active-sql-key', key);
  }

  function hubGetActiveSqlKey() {
    var hub = document.getElementById('crozzo-nube-hub');
    if (hub && hub.getAttribute('data-active-sql-key')) return hub.getAttribute('data-active-sql-key');
    var scripts = getAllScripts();
    return scripts[0] ? scripts[0].key : '';
  }

  function sanPopulateFormFromConfig(force) {
    if (!force && typeof global.crozzoMdCloudFormHasDraft === 'function' && global.crozzoMdCloudFormHasDraft()) {
      return;
    }
    var c = getMdConfig();
    var sb = getSbFile();
    var syncEl = document.getElementById('mdSupabaseSyncEnabled');
    if (syncEl && document.activeElement !== syncEl) syncEl.checked = !!(sb && sb.syncEnabled);
    var urlEl = document.getElementById('mdSupabaseUrl');
    if (urlEl && urlEl.dataset.crozzoDirty !== '1' && document.activeElement !== urlEl) {
      urlEl.value = (c.supabase && c.supabase.url) || (sb && sb.url) || '';
    }
    var keyEl = document.getElementById('mdSupabaseKey');
    if (keyEl && keyEl.dataset.crozzoDirty !== '1' && document.activeElement !== keyEl && !String(keyEl.value || '').trim()) {
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
    var bname = document.getElementById('mdBusinessName');
    if (bname) bname.value = c.businessName || '';
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

  function getDeviceQrSlotsSql() {
    var scripts = getAllScripts();
    var s = scripts.find(function (x) {
      return x.key === 'device_qr_slots';
    });
    return s && s.sql ? s.sql : '';
  }

  function getRestHeadersFromSanForm(key) {
    return Object.assign(
      typeof global.crozzoSupabaseRestHeaders === 'function'
        ? global.crozzoSupabaseRestHeaders(key)
        : {
            apikey: key,
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
      { Prefer: 'count=exact' }
    );
  }

  function updateDeviceQrStatusBadge(state, hint) {
    var badge = document.getElementById('sanDeviceQrStatus');
    var hintEl = document.getElementById('sanDeviceQrHint');
    if (badge) {
      if (state === 'ok') {
        badge.className = 'badge badge-success';
        badge.textContent = 'Tabla OK';
      } else if (state === 'missing') {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Falta tabla';
      } else if (state === 'checking') {
        badge.className = 'badge badge-info';
        badge.textContent = 'Comprobando…';
      } else {
        badge.className = 'badge badge-info';
        badge.textContent = 'Sin comprobar';
      }
    }
    if (hint && hintEl) hintEl.textContent = hint;
  }

  function openDeviceQrSqlWizard() {
    setWizardStep(2);
    global.setTimeout(function () {
      selectSqlScript('device_qr_slots');
      var wiz = document.getElementById('crozzoNubeSqlWizard');
      if (wiz && wiz.scrollIntoView) wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function copyDeviceQrSql() {
    var sql = getDeviceQrSlotsSql();
    if (!sql) {
      if (global.showToast) global.showToast('No se encontró el script 15.', 'warning');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sql).then(
        function () {
          if (global.showToast) global.showToast('SQL script 15 copiado — péguelo en Supabase y Run.', 'success');
        },
        function () {
          if (global.showToast) global.showToast('No se pudo copiar.', 'error');
        }
      );
    }
  }

  async function activateDeviceQrInPos() {
    try {
      if (global.CrozzoInternalQrRegistry) {
        if (typeof global.CrozzoInternalQrRegistry.resetCloudQrTableMissing === 'function') {
          global.CrozzoInternalQrRegistry.resetCloudQrTableMissing();
        }
        if (typeof global.CrozzoInternalQrRegistry.start === 'function') {
          global.CrozzoInternalQrRegistry.start();
        }
        if (typeof global.CrozzoInternalQrRegistry.ensureOwnSlot === 'function') {
          global.CrozzoInternalQrRegistry.ensureOwnSlot({ force: true });
        }
        if (typeof global.CrozzoInternalQrRegistry.exchangeOnDeviceSetup === 'function') {
          await global.CrozzoInternalQrRegistry.exchangeOnDeviceSetup({
            reason: 'super_admin_activate',
            forceOwn: true,
          });
        }
      }
      if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.startBackgroundWiring === 'function') {
        global.CrozzoBlePeerRegistry.startBackgroundWiring();
      }
      writeSqlDone('device_qr_slots', true);
      updateDeviceQrStatusBadge('ok', 'Activado en este equipo. Recargue la app (F5) si aún ve 404 en consola.');
      if (global.showToast) {
        global.showToast('QR entre dispositivos activado. Recargue con F5 si hace falta.', 'success');
      }
      return true;
    } catch (e) {
      if (global.showToast) global.showToast('No se pudo activar: ' + (e && e.message ? e.message : e), 'error');
      return false;
    }
  }

  async function probeDeviceQrSlotsTable(opts) {
    opts = opts || {};
    var url = (document.getElementById('mdSupabaseUrl')?.value || '').trim();
    var keyEl = document.getElementById('mdSupabaseKey');
    var key =
      typeof global.crozzoGetEffectiveAnonKeyFromInput === 'function'
        ? global.crozzoGetEffectiveAnonKeyFromInput(keyEl)
        : (keyEl?.value || '').trim();
    if (!url || !key) {
      updateDeviceQrStatusBadge('missing', 'Configure URL y anon key en el Paso 1.');
      if (global.showToast) global.showToast('Faltan credenciales en el Paso 1.', 'warning');
      return false;
    }
    updateDeviceQrStatusBadge('checking', 'Comprobando crozzo_device_qr_slots…');
    try {
      var controller = new AbortController();
      var t = global.setTimeout(function () {
        controller.abort();
      }, 6000);
      var res = await fetch(
        url.replace(/\/$/, '') + '/rest/v1/crozzo_device_qr_slots?limit=0&select=id',
        {
          method: 'GET',
          signal: controller.signal,
          headers: getRestHeadersFromSanForm(key),
        }
      );
      global.clearTimeout(t);
      if (res && (res.ok || res.status === 200 || res.status === 206)) {
        writeSqlDone('device_qr_slots', true);
        var row = document.querySelector('[data-probe-table="crozzo_device_qr_slots"] .crozzo-nube-probe-status');
        if (row) row.innerHTML = '<span class="badge badge-success">OK</span>';
        updateDeviceQrStatusBadge('ok', 'Tabla lista. Pulse «Activar en este equipo» o recargue (F5).');
        if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.resetCloudQrTableMissing === 'function') {
          global.CrozzoInternalQrRegistry.resetCloudQrTableMissing();
        }
        if (opts.activateAfter) await activateDeviceQrInPos();
        else if (global.showToast) global.showToast('Tabla crozzo_device_qr_slots OK.', 'success');
        return true;
      }
      updateDeviceQrStatusBadge(
        'missing',
        res && res.status === 404
          ? 'Tabla no existe — ejecute el script 15 en Supabase SQL Editor.'
          : 'HTTP ' + (res && res.status) + ' — revise anon key o permisos.'
      );
      if (global.showToast) {
        global.showToast(
          res && res.status === 404
            ? 'Falta la tabla. Copie el script 15 → Supabase → Run.'
            : 'Error HTTP ' + (res && res.status),
          'warning'
        );
      }
      return false;
    } catch (e) {
      updateDeviceQrStatusBadge('missing', 'Error de red al comprobar la tabla.');
      if (global.showToast) global.showToast('Error comprobando tabla.', 'error');
      return false;
    }
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
    var lv = {
      critico: { ok: 0, total: 0, falta: [] },
      recomendado: { ok: 0, total: 0, falta: [] },
      opcional: { ok: 0, total: 0, falta: [] },
    };
    PROBE_TABLES.forEach(function (p) {
      var k = p.level || (p.required ? 'critico' : 'opcional');
      if (lv[k]) lv[k].total++;
    });
    for (var i = 0; i < PROBE_TABLES.length; i++) {
      var p = PROBE_TABLES[i];
      var row = document.querySelector('[data-probe-table="' + p.table + '"] .crozzo-nube-probe-status');
      if (row) row.textContent = '⏳';
      try {
        var controller = new AbortController();
        var t = global.setTimeout(function () { controller.abort(); }, 5000);
        var probeCol = p.probeCol || 'id';
        var res = await fetch(base + '/rest/v1/' + encodeURIComponent(p.table) + '?limit=0&select=' + encodeURIComponent(probeCol), {
          method: 'GET',
          signal: controller.signal,
          headers: Object.assign(
            typeof global.crozzoSupabaseRestHeaders === 'function'
              ? global.crozzoSupabaseRestHeaders(key)
              : {
                  apikey: key,
                  Authorization: 'Bearer ' + key,
                  'Content-Type': 'application/json',
                },
            { Prefer: 'count=exact' }
          ),
        });
        global.clearTimeout(t);
        var ok = res && (res.ok || res.status === 200 || res.status === 206);
        var rowCount = null;
        if (p.table === 'profiles' && res && res.headers) {
          var cr = res.headers.get('content-range') || '';
          var m = cr.match(/\/(\d+|\*)/);
          if (m && m[1] !== '*') rowCount = parseInt(m[1], 10);
        }
        var lk = p.level || (p.required ? 'critico' : 'opcional');
        if (ok) {
          okCount++;
          if (lv[lk]) lv[lk].ok++;
          var okLbl = 'OK';
          if (p.table === 'profiles' && rowCount != null) {
            okLbl = rowCount === 0 ? 'OK (0 — opcional)' : 'OK (' + rowCount + ')';
            var pc = document.getElementById('sanProfilesCount');
            if (pc) {
              pc.textContent =
                rowCount === 0
                  ? 'Perfiles en nube: 0 — normal si usa solo PIN local. Cree usuario abajo o ejecute Script 13.'
                  : 'Perfiles en nube: ' + rowCount + ' usuario(s) con login por correo.';
            }
          }
          if (row) row.innerHTML = '<span class="badge badge-success">' + okLbl + '</span>';
        } else {
          if (p.required) failReq++;
          if (lv[lk]) lv[lk].falta.push(p.label || p.table);
          var lbl = res && res.status === 404 ? 'No existe' : 'HTTP ' + (res && res.status);
          if (row) row.innerHTML = '<span class="badge badge-warning">' + lbl + '</span>';
        }
      } catch (_) {
        var lk2 = p.level || (p.required ? 'critico' : 'opcional');
        if (p.required) failReq++;
        if (lv[lk2]) lv[lk2].falta.push(p.label || p.table);
        if (row) row.innerHTML = '<span class="badge badge-warning">Error</span>';
      }
    }
    // Veredicto claro por nivel: ¿está lista y adecuada la conexión?
    var criticosOk = lv.critico.ok === lv.critico.total;
    var verdict;
    var tone;
    if (criticosOk) {
      verdict = '✅ Conexión LISTA y adecuada — críticos ' + lv.critico.ok + '/' + lv.critico.total + ' completos';
      var extra = [];
      if (lv.recomendado.total) extra.push('recomendados ' + lv.recomendado.ok + '/' + lv.recomendado.total);
      if (lv.opcional.total) extra.push('opcionales ' + lv.opcional.ok + '/' + lv.opcional.total);
      if (extra.length) verdict += ' · ' + extra.join(' · ');
      if (lv.recomendado.falta.length) verdict += ' · faltan recomendados: ' + lv.recomendado.falta.join(', ');
      tone = 'success';
    } else {
      verdict =
        '⛔ Conexión NO lista — faltan ' +
        lv.critico.falta.length +
        ' tabla(s) crítica(s): ' +
        lv.critico.falta.join(', ') +
        '. Ejecute los scripts obligatorios (1–4 y 10) en el Paso 2.';
      tone = 'warning';
    }
    if (summary) summary.textContent = verdict;
    if (global.showToast) {
      global.showToast(
        criticosOk ? 'Conexión lista: críticos completos.' : 'Faltan tablas críticas — revise el Paso 2 (SQL).',
        tone
      );
    }
  }

  function bindOnce(el, event, handler) {
    if (!el || el._crozzoNubeBound) return;
    el._crozzoNubeBound = true;
    el.addEventListener(event, handler);
  }

  var _empresaPerfilPanelBound = false;

  function sanBindCloudFormDirtyTracking() {
    ['mdSupabaseUrl', 'mdSupabaseKey', 'mdCloudDeviceName', 'mdCloudDeviceIdInput', 'mdBusinessName', 'mdBusinessId'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el._crozzoNubeDirtyBound) return;
      el._crozzoNubeDirtyBound = true;
      el.addEventListener('input', function () {
        el.dataset.crozzoDirty = '1';
      });
    });
  }

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

    sanPopulateFormFromConfig(true);
    sanBindCloudFormDirtyTracking();
    try {
      if (typeof global.crozzoBindBusinessRegistryAutocomplete === 'function') {
        global.crozzoBindBusinessRegistryAutocomplete();
      }
    } catch (_) {}
    renderSqlWizardProgress();
    var scripts = getAllScripts();
    var firstKey = scripts[0] ? scripts[0].key : '';
    hubStoreActiveSqlKey(hubGetActiveSqlKey() || firstKey);
    if (firstKey) selectSqlScript(hubGetActiveSqlKey() || firstKey);
    updateSqlProgressBar();

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

    bindOnce(document.getElementById('sanBtnDeviceQrQuick'), 'click', function () {
      setWizardStep(3);
      global.setTimeout(function () {
        var panel = document.querySelector('.crozzo-nube-device-qr');
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    });
    bindOnce(document.getElementById('sanBtnDeviceQrOpenScript'), 'click', openDeviceQrSqlWizard);
    bindOnce(document.getElementById('sanBtnDeviceQrCopySql'), 'click', copyDeviceQrSql);
    bindOnce(document.getElementById('sanBtnDeviceQrOpenSupabase'), 'click', function () {
      var url = (document.getElementById('mdSupabaseUrl')?.value || '').trim();
      var target = supabaseDashboardSqlUrl(url);
      try {
        window.open(target, '_blank', 'noopener');
      } catch (_) {}
      copyDeviceQrSql();
      if (global.showToast) global.showToast('Supabase abierto. Pegue el SQL y Run.', 'info');
    });
    bindOnce(document.getElementById('sanBtnDeviceQrCheck'), 'click', function () {
      probeDeviceQrSlotsTable({ activateAfter: false });
    });
    bindOnce(document.getElementById('sanBtnDeviceQrActivate'), 'click', function () {
      probeDeviceQrSlotsTable({ activateAfter: true });
    });

    bindOnce(document.getElementById('sanBtnAltaGuia'), 'click', openSanAltaNegocioGuide);
    bindOnce(document.getElementById('sanBtnNubeSmoke'), 'click', function () {
      showSanNubeSmokeResults();
    });
    bindOnce(document.getElementById('sanBtnScrollSql'), 'click', function () {
      setWizardStep(2);
      var w = document.getElementById('crozzoNubeSqlWizard');
      if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    bindOnce(document.getElementById('sanBtnOpenSqlExtern'), 'click', function () {
      var url = supabaseDashboardSqlUrl((document.getElementById('mdSupabaseUrl') || {}).value || nubeSnapshot().url);
      if (typeof global.crozzoOpenExternal === 'function') global.crozzoOpenExternal(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
      if (global.showToast) global.showToast('Abra SQL Editor, pegue el script y Run', 'info');
    });
    bindOnce(document.getElementById('sanBtnNextSql'), 'click', selectNextSqlScript);
    bindOnce(document.getElementById('sanBtnExpandSql'), 'click', function () {
      var ta = document.getElementById('crozzoNubeSqlTextarea');
      if (!ta) return;
      ta.classList.toggle('crozzo-nube-sql-textarea--fullscreen');
      if (ta.classList.contains('crozzo-nube-sql-textarea--fullscreen')) {
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    bindOnce(document.getElementById('sanBtnSaveCloud'), 'click', function () {
      if (typeof global.saveSupabaseConfig === 'function') {
        void global.saveSupabaseConfig().then(function () {
          if (typeof global.crozzoClearMdCloudFormDirty === 'function') global.crozzoClearMdCloudFormDirty();
          sanRefreshStatusCards();
          sanPopulateFormFromConfig(true);
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

    bindOnce(document.getElementById('sanBtnCreateCloudUser'), 'click', function () {
      if (typeof global.crozzoCreateCloudUser !== 'function') {
        if (global.showToast) global.showToast('Creación de usuarios nube no disponible.', 'warning');
        return;
      }
      var email = (document.getElementById('sanCloudUserEmail')?.value || '').trim();
      var pass = document.getElementById('sanCloudUserPass')?.value || '';
      var role = document.getElementById('sanCloudUserRole')?.value || 'cajero';
      if (global.showToast) global.showToast('Creando usuario nube…', 'info');
      global
        .crozzoCreateCloudUser({ email: email, password: pass, role: role })
        .then(function (r) {
          if (!r || !r.ok) {
            if (global.showToast) global.showToast((r && r.message) || 'No se pudo crear el usuario.', 'warning');
            return;
          }
          if (global.showToast) global.showToast(r.message, r.needsConfirm ? 'info' : 'success');
          var passEl = document.getElementById('sanCloudUserPass');
          if (passEl) passEl.value = '';
          void probeSupabaseTables();
        })
        .catch(function () {
          if (global.showToast) global.showToast('Error al crear usuario nube.', 'warning');
        });
    });

    bindOnce(document.getElementById('sanBtnUploadCatalog'), 'click', function () {
      if (typeof global.crozzoSubirCatalogoNube !== 'function') {
        if (global.showToast) global.showToast('Subida de catálogo no disponible en este equipo.', 'warning');
        return;
      }
      var summary = document.getElementById('sanProbeSummary');
      if (summary) summary.textContent = '⏳ Subiendo catálogo a la nube…';
      if (global.showToast) global.showToast('Subiendo catálogo a la nube…', 'info');
      global
        .crozzoSubirCatalogoNube({
          onProgress: function (done, total) {
            if (summary) summary.textContent = '⏳ Subiendo catálogo… ' + done + '/' + total;
          },
        })
        .then(function (r) {
          if (!r || r.ok === false) {
            var msg = (r && r.message) || 'No se pudo subir el catálogo. Active la nube e intente de nuevo.';
            if (r && r.pushed != null) msg = 'Subida parcial: ' + r.pushed + ' productos OK, ' + r.failed + ' con error.';
            if (summary) summary.textContent = '⚠️ ' + msg;
            if (global.showToast) global.showToast(msg, 'warning');
            return;
          }
          var ok = '✅ Catálogo subido: ' + r.pushed + ' productos' + (r.tenant ? ' + marca/usuarios' : '') + '. Los equipos nuevos ya pueden descargarlo.';
          if (summary) summary.textContent = ok;
          if (global.showToast) global.showToast(ok, 'success');
        })
        .catch(function () {
          if (summary) summary.textContent = '⚠️ Error al subir el catálogo.';
          if (global.showToast) global.showToast('Error al subir el catálogo.', 'warning');
        });
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
          if (typeof global.crozzoClearMdCloudFormDirty === 'function') global.crozzoClearMdCloudFormDirty();
          sanRefreshStatusCards();
          sanPopulateFormFromConfig(true);
        }
      });
    }
  }

  global.renderSuperAdminNubeConfigHTML = renderSuperAdminNubeConfigHTML;
  global.initSuperAdminNubeConfig = initSuperAdminNubeConfig;
  global.crozzoNubeSnapshot = nubeSnapshot;
  global.crozzoNubeProbeTables = probeSupabaseTables;
  global.crozzoNubeProbeDeviceQrSlots = probeDeviceQrSlotsTable;
  global.crozzoNubeActivateDeviceQr = activateDeviceQrInPos;
  global.crozzoNubeOpenDeviceQrScript = openDeviceQrSqlWizard;
  global.openSanAltaNegocioGuide = openSanAltaNegocioGuide;
  global.runSanNubeSmokeSelfCheck = runSanNubeSmokeSelfCheck;
  global.showSanNubeSmokeResults = showSanNubeSmokeResults;
})(typeof window !== 'undefined' ? window : globalThis);
