/**
 * Emulación honeypot: clona la UI real de Crozzo POS y rota vistas con datos creíbles.
 */
(function (global) {
  'use strict';

  var FAKE_EMPRESAS = [
    {
      nombre: 'Restaurante La Casona del Valle S.A.S.',
      razon: 'La Casona del Valle S.A.S.',
      nit: '901284567-3',
      direccion: 'Carrera 47 # 79-123',
      ciudad: 'Medellín, Antioquia',
      telefono: '604 321 8890',
      email: 'facturacion@casonadelvalle.com',
      regimen: 'Responsable de IVA',
      actividad: 'Restaurante y bar',
      resolucion: '18764001234567',
      prefijo: 'FV',
      desde: '1',
      hasta: '5000',
      vigencia: '2025-01-01 / 2027-12-31',
    },
    {
      nombre: 'Parrilla El Fogón de Usaquén Ltda.',
      razon: 'El Fogón de Usaquén Ltda.',
      nit: '900876543-1',
      direccion: 'Calle 119 # 7-45 Local 12',
      ciudad: 'Bogotá D.C.',
      telefono: '601 678 4520',
      email: 'admin@elfogonusaquen.co',
      regimen: 'Responsable de IVA',
      actividad: 'Expendio de comidas preparadas',
      resolucion: '18764009876543',
      prefijo: 'FE',
      desde: '1200',
      hasta: '8000',
      vigencia: '2024-06-01 / 2026-05-31',
    },
    {
      nombre: 'Cafetería Avenida 68 S.A.S.',
      razon: 'Cafetería Avenida 68 S.A.S.',
      nit: '901556789-2',
      direccion: 'Av. 68 # 45-20',
      ciudad: 'Bogotá D.C.',
      telefono: '601 445 9012',
      email: 'caja@avenida68cafe.com',
      regimen: 'Responsable de IVA',
      actividad: 'Cafetería y panadería',
      resolucion: '18764005551234',
      prefijo: 'CAF',
      desde: '1',
      hasta: '3000',
      vigencia: '2025-03-15 / 2027-03-14',
    },
    {
      nombre: 'Mariscos del Caribe S.A.S.',
      razon: 'Mariscos del Caribe S.A.S.',
      nit: '900334455-6',
      direccion: 'Vía 40 # 84-200',
      ciudad: 'Barranquilla, Atlántico',
      telefono: '605 334 7788',
      email: 'ventas@mariscoscaribe.co',
      regimen: 'Responsable de IVA',
      actividad: 'Restaurante especializado en mariscos',
      resolucion: '18764003336677',
      prefijo: 'MC',
      desde: '500',
      hasta: '4500',
      vigencia: '2025-01-01 / 2026-12-31',
    },
    {
      nombre: 'Panadería La Esquina del Parque Ltda.',
      razon: 'Panadería La Esquina del Parque Ltda.',
      nit: '901998877-4',
      direccion: 'Calle 5 # 12-08',
      ciudad: 'Cali, Valle del Cauca',
      telefono: '602 556 3311',
      email: 'contabilidad@laesquinadelparque.com',
      regimen: 'Responsable de IVA',
      actividad: 'Panadería y pastelería',
      resolucion: '18764007778899',
      prefijo: 'PE',
      desde: '1',
      hasta: '2500',
      vigencia: '2024-09-01 / 2026-08-31',
    },
    {
      nombre: 'Hotel Boutique Casa Naranja S.A.S.',
      razon: 'Casa Naranja Hotel Boutique S.A.S.',
      nit: '901112233-8',
      direccion: 'Carrera 11 # 93-67',
      ciudad: 'Bogotá D.C.',
      telefono: '601 234 9900',
      email: 'recepcion@casanaranjahotel.co',
      regimen: 'Responsable de IVA',
      actividad: 'Hotelería y restaurante',
      resolucion: '18764004445566',
      prefijo: 'HN',
      desde: '2000',
      hasta: '12000',
      vigencia: '2025-02-01 / 2027-01-31',
    },
  ];

  var FAKE_STAFF_DAY = [
    { id: 'MARIA_G', rol: 'Caja', estado: 'activa' },
    { id: 'CARLOS_R', rol: 'Mesero', estado: 'activa' },
    { id: 'LUIS_M', rol: 'Cocina', estado: 'activa' },
    { id: 'ANA_P', rol: 'Mesero', estado: 'activa' },
  ];
  var FAKE_STAFF_NIGHT = [{ id: 'TURNO_NOCT', rol: 'Caja', estado: 'inactivo' }];

  var FAKE_FIRST_NAMES = [
    'Juan', 'María', 'Carlos', 'Ana', 'Luis', 'Sandra', 'Diego', 'Camila', 'Andrés', 'Paola',
    'Jorge', 'Laura', 'Pedro', 'Diana', 'Miguel', 'Lucía', 'Felipe', 'Valentina', 'Ricardo', 'Natalia',
    'Héctor', 'Claudia', 'Oscar', 'Mónica', 'Julián', 'Adriana', 'Roberto', 'Carolina', 'Daniel', 'Patricia',
  ];
  var FAKE_LAST_NAMES = [
    'Pérez', 'Gómez', 'Rodríguez', 'López', 'Martínez', 'Hernández', 'Ruiz', 'Vargas', 'Torres', 'Ramírez',
    'Castro', 'Ortiz', 'Méndez', 'Salazar', 'Ríos', 'Guerrero', 'Navarro', 'Romero', 'Suárez', 'Delgado',
  ];
  var FAKE_BIZ_TYPES = ['Distribuidora', 'Comercializadora', 'Inversiones', 'Alimentos', 'Servicios', 'Importadora', 'Logística', 'Carnes'];
  var FAKE_BIZ_NAMES = ['El Prado', 'La 14', 'Del Norte', 'Andina', 'Centro', 'Bolívar', 'San Jorge', 'La Estrella', 'Los Andes', 'El Dorado'];
  var FAKE_PROVEEDOR_RUBROS = [
    'Carnes premium', 'Verduras frescas', 'Bebidas gaseosas', 'Lácteos', 'Panadería industrial', 'Desechables',
    'Licores', 'Aceites', 'Condimentos', 'Mariscos', 'Embutidos', 'Frutas', 'Café', 'Helados',
  ];
  var FAKE_CORTES_TIPOS = ['Lomo fino', 'Pechuga', 'Costilla', 'Chicharrón', 'Pescado filete', 'Pollo entero', 'Carne molida', 'Chuleta'];

  var CLIENTES_FAKE = [
    { nombre: 'Consumidor final', nit: '222222222222' },
    { nombre: 'Distribuidora El Prado S.A.S.', nit: '900123456-1' },
    { nombre: 'Juan Pérez', nit: '1012345678' },
    { nombre: 'María López', nit: '52987654' },
    { nombre: 'Eventos La 14 Ltda.', nit: '901555444-3' },
    { nombre: 'Hotel Central', nit: '860001122-4' },
  ];

  var MESA_STATES = [
    { state: 'libre', label: 'Desocupada' },
    { state: 'pendiente', label: 'Pendiente (2 ítems)' },
    { state: 'comandado', label: 'Comandado (4 ítems)' },
    { state: 'salio', label: 'Ya salió' },
    { state: 'pendiente', label: 'Pendiente (1 ítem)' },
    { state: 'comandado', label: 'Comandado (6 ítems)' },
  ];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function fakeNit() {
    return '900' + String(rand(100000, 999999));
  }

  function fakeUuid() {
    var h = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
    return h;
  }

  function pickRandom(arr) {
    return arr[rand(0, arr.length - 1)];
  }

  function buildRandomPersonName() {
    return pickRandom(FAKE_FIRST_NAMES) + ' ' + pickRandom(FAKE_LAST_NAMES);
  }

  function buildRandomBusinessName() {
    return pickRandom(FAKE_BIZ_TYPES) + ' ' + pickRandom(FAKE_BIZ_NAMES) + ' ' + pickRandom(['S.A.S.', 'Ltda.', 'S.A.']);
  }

  function buildRandomNitPerson() {
    return String(rand(10000000, 999999999));
  }

  function buildRandomNitBiz() {
    return '900' + String(rand(100000, 999999)) + '-' + rand(1, 9);
  }

  function buildRandomClients(count) {
    if (!count) return [];
    var list = [{ nombre: 'Consumidor final', nit: '222222222222' }];
    for (var i = 0; i < count; i++) {
      if (Math.random() > 0.5) {
        list.push({ nombre: buildRandomPersonName(), nit: buildRandomNitPerson() });
      } else {
        list.push({ nombre: buildRandomBusinessName(), nit: buildRandomNitBiz() });
      }
    }
    return list;
  }

  function buildRandomProveedores(count) {
    if (!count) return [];
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push({
        nombre: buildRandomBusinessName(),
        nit: buildRandomNitBiz(),
        contacto: buildRandomPersonName(),
        rubro: pickRandom(FAKE_PROVEEDOR_RUBROS),
        saldo: Math.random() > 0.25 ? rand(85000, 4800000) : 0,
        ultimaCompra: new Date(Date.now() - rand(86400000, 86400000 * 60)).toISOString(),
      });
    }
    return out;
  }

  function buildRandomStaff(count, emp) {
    if (!count) return [];
    var tag = String((emp && emp.nit) || 'HP').replace(/\D/g, '').slice(-3) || '01';
    var roles = ['admin', 'caja', 'mesero', 'cocina', 'inventario'];
    var prefixes = ['CAJA', 'MES', 'COC', 'ADM', 'INV'];
    var staff = [];
    for (var i = 0; i < count; i++) {
      var rol = i === 0 ? 'admin' : pickRandom(roles);
      staff.push({
        id: pickRandom(prefixes) + '_' + tag + '_' + String(i + 1),
        nombre: buildRandomPersonName(),
        rol: rol,
        activo: Math.random() > 0.1,
      });
    }
    return staff;
  }

  function buildFakeCortes(count, ctx) {
    if (!count) return [];
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push({
        tipo: pickRandom(FAKE_CORTES_TIPOS),
        lote: 'L-' + String(rand(1000, 9999)),
        kg: (rand(15, 180) + Math.random()).toFixed(1),
        proveedor: ctx.fakeProveedores && ctx.fakeProveedores[i % ctx.fakeProveedores.length]
          ? ctx.fakeProveedores[i % ctx.fakeProveedores.length].nombre
          : buildRandomBusinessName(),
        fecha: new Date(Date.now() - rand(3600000, 86400000 * 4)).toLocaleString('es-CO'),
      });
    }
    return out;
  }

  /** 0=cerrado · 1=poca · 2=normal · 3=mucha · 4=excesiva */
  function getDensityConfig(h) {
    if (h >= 0 && h < 5) {
      return { dataDensity: 0, period: 'closed', label: 'Madrugada · negocio cerrado', emptyBusiness: true };
    }
    if (h >= 5 && h < 8) {
      return { dataDensity: 1, period: 'dawn', label: 'Apertura · madrugada' };
    }
    if (h >= 8 && h < 12) {
      return { dataDensity: 2, period: 'morning', label: 'Turno mañana' };
    }
    if (h >= 12 && h < 18) {
      return { dataDensity: 3, period: 'afternoon', label: 'Turno tarde · alta actividad' };
    }
    if (h >= 18 && h < 22) {
      return { dataDensity: 4, period: 'rush', label: 'Antes de las 10 PM · máxima carga' };
    }
    return { dataDensity: 2, period: 'late', label: 'Cierre nocturno' };
  }

  function densityRanges(density) {
    switch (density) {
      case 0:
        return {
          facturas: 0,
          clientes: 0,
          proveedores: 0,
          staff: 0,
          mesasTotal: 8,
          mesasOcup: 0,
          comandas: 0,
          trans: 0,
          ventasMin: 0,
          ventasMax: 0,
          ticketMin: 0,
          ticketMax: 0,
          facturaTotalMax: 0,
          cortes: 0,
          tableRows: 0,
        };
      case 1:
        return {
          facturas: rand(3, 8),
          clientes: rand(5, 12),
          proveedores: rand(2, 6),
          staff: rand(2, 5),
          mesasTotal: 12,
          mesasOcup: rand(0, 2),
          comandas: rand(0, 3),
          trans: rand(2, 12),
          ventasMin: 80000,
          ventasMax: 420000,
          ticketMin: 15000,
          ticketMax: 45000,
          facturaTotalMax: 120000,
          cortes: rand(1, 3),
          tableRows: 8,
        };
      case 2:
        return {
          facturas: rand(18, 35),
          clientes: rand(20, 35),
          proveedores: rand(8, 15),
          staff: rand(5, 10),
          mesasTotal: 22,
          mesasOcup: rand(4, 10),
          comandas: rand(6, 14),
          trans: rand(22, 48),
          ventasMin: 1200000,
          ventasMax: 2800000,
          ticketMin: 22000,
          ticketMax: 65000,
          facturaTotalMax: 350000,
          cortes: rand(4, 8),
          tableRows: 18,
        };
      case 3:
        return {
          facturas: rand(40, 58),
          clientes: rand(42, 55),
          proveedores: rand(14, 28),
          staff: rand(10, 18),
          mesasTotal: 30,
          mesasOcup: rand(10, 20),
          comandas: rand(14, 28),
          trans: rand(55, 95),
          ventasMin: 4500000,
          ventasMax: 9200000,
          ticketMin: 28000,
          ticketMax: 95000,
          facturaTotalMax: 680000,
          cortes: rand(8, 14),
          tableRows: 28,
        };
      case 4:
        return {
          facturas: rand(65, 95),
          clientes: rand(48, 60),
          proveedores: rand(22, 38),
          staff: rand(15, 26),
          mesasTotal: 40,
          mesasOcup: rand(18, 32),
          comandas: rand(22, 42),
          trans: rand(90, 160),
          ventasMin: 8500000,
          ventasMax: 18500000,
          ticketMin: 35000,
          ticketMax: 280000,
          facturaTotalMax: 1850000,
          cortes: rand(12, 22),
          tableRows: 40,
        };
      default:
        return densityRanges(2);
    }
  }

  function ensureFakePools(ctx) {
    if (ctx._fakePoolsReady) return ctx;
    var dr = ctx.densityRanges || densityRanges(ctx.dataDensity != null ? ctx.dataDensity : 2);
    ctx.densityRanges = dr;
    var emp = getEmpresaInfo(ctx);
    ctx.fakeClientes = buildRandomClients(dr.clientes);
    ctx.fakeProveedores = buildRandomProveedores(dr.proveedores);
    ctx.fakeStaff = dr.staff ? buildRandomStaff(dr.staff, emp) : [];
    ctx.fakeCortes = buildFakeCortes(dr.cortes, ctx);
    ctx._fakePoolsReady = true;
    return ctx;
  }

  function formatMoney(n) {
    return Number(n || 0).toLocaleString('es-CO');
  }

  function hashSeed(str) {
    var s = String(str || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /** Empresa inventada aleatoria (estable por trip/sesión honeypot). */
  function pickFakeEmpresa(seed) {
    var idx =
      seed != null && seed !== ''
        ? hashSeed(seed) % FAKE_EMPRESAS.length
        : rand(0, FAKE_EMPRESAS.length - 1);
    return Object.assign({}, FAKE_EMPRESAS[idx]);
  }

  function buildFakeStaffUsers(emp) {
    var tag = String((emp && emp.nit) || 'HP').replace(/\D/g, '').slice(-3) || '01';
    return [
      { id: 'ADMIN_' + tag, nombre: 'Laura Méndez', rol: 'admin', activo: true },
      { id: 'CAJA_' + tag, nombre: 'Pedro Salazar', rol: 'caja', activo: true },
      { id: 'MESERO_' + tag, nombre: 'Sandra Ruiz', rol: 'mesero', activo: true },
      { id: 'COCINA_' + tag, nombre: 'Diego Vargas', rol: 'cocina', activo: true },
      { id: 'INV_' + tag, nombre: 'Camilo Ortiz', rol: 'inventario', activo: false },
    ];
  }

  function getEmpresaInfo(ctx) {
    if (ctx && ctx.fakeEmpresa) return ctx.fakeEmpresa;
    try {
      if (global.__crozzoHoneypotLive && global.__crozzoHoneypotLive.fakeEmpresa) {
        return global.__crozzoHoneypotLive.fakeEmpresa;
      }
      if (global.__crozzoHoneypotLive && global.__crozzoHoneypotLive.active) {
        return pickFakeEmpresa(String(Date.now()));
      }
    } catch (_) {}
    if (ctx && ctx.believable) {
      return pickFakeEmpresa(String((ctx && ctx.hour) || new Date().getHours()));
    }
    var emp = {};
    try {
      if (global.config && typeof global.config.getEmpresa === 'function') emp = global.config.getEmpresa() || {};
    } catch (_) {}
    return {
      nombre: emp.nombreComercial || emp.razonSocial || 'Mi negocio',
      razon: emp.razonSocial || emp.nombreComercial || 'Mi negocio',
      nit: String(emp.nit || emp.documento || fakeNit()).trim(),
      direccion: emp.direccion || 'Calle 10 # 22-15',
      ciudad: emp.ciudad || 'Bogotá',
      telefono: emp.telefono || '',
      email: emp.email || '',
      regimen: emp.regimen || 'Responsable de IVA',
      actividad: emp.actividad || 'Comercio',
    };
  }

  function getBusinessName(ctx) {
    return getEmpresaInfo(ctx).nombre;
  }

  function getCatalogProducts(ctx) {
    var hpLive = global.__crozzoHoneypotLive;
    if (hpLive && hpLive.active) {
      return [
        { id: 1, nombre: 'Bandeja Paisa', precio: 28000, icon: '🍛', categoria: 'Platos fuertes' },
        { id: 2, nombre: 'Ajiaco santafereño', precio: 25000, icon: '🍲', categoria: 'Sopas' },
        { id: 3, nombre: 'Café premium', precio: 7000, icon: '☕', categoria: 'Bebidas' },
        { id: 4, nombre: 'Jugo natural', precio: 8000, icon: '🧃', categoria: 'Bebidas' },
        { id: 5, nombre: 'Postre del día', precio: 12000, icon: '🍰', categoria: 'Postres' },
        { id: 6, nombre: 'Cerveza nacional', precio: 9000, icon: '🍺', categoria: 'Bar' },
      ];
    }
    if (ctx && ctx.believable) {
      return [
        { id: 1, nombre: 'Bandeja Paisa', precio: 28000, icon: '🍛', categoria: 'Platos fuertes' },
        { id: 2, nombre: 'Ajiaco santafereño', precio: 25000, icon: '🍲', categoria: 'Sopas' },
        { id: 3, nombre: 'Café premium', precio: 7000, icon: '☕', categoria: 'Bebidas' },
        { id: 4, nombre: 'Jugo natural', precio: 8000, icon: '🧃', categoria: 'Bebidas' },
        { id: 5, nombre: 'Postre del día', precio: 12000, icon: '🍰', categoria: 'Postres' },
        { id: 6, nombre: 'Cerveza nacional', precio: 9000, icon: '🍺', categoria: 'Bar' },
      ];
    }
    var list = [];
    try {
      if (global.products && global.products.length) {
        list = global.products.slice(0, 16).map(function (p) {
          return {
            id: p.id,
            nombre: p.nombre,
            precio: Number(p.precio) || 0,
            icon: p.icon || '🍽️',
            categoria: p.categoria || 'todas',
          };
        });
      }
    } catch (_) {}
    if (list.length) return list;
    return [
      { id: 1, nombre: 'Bandeja Paisa', precio: 28000, icon: '🍛' },
      { id: 2, nombre: 'Ajiaco', precio: 25000, icon: '🍲' },
      { id: 3, nombre: 'Café Premium', precio: 7000, icon: '☕' },
      { id: 4, nombre: 'Jugo Natural', precio: 8000, icon: '🧃' },
    ];
  }

  function buildFakeFacturas(ctx) {
    ensureFakePools(ctx);
    var dr = ctx.densityRanges;
    var n = dr.facturas;
    if (!n) return [];
    var clients = ctx.fakeClientes && ctx.fakeClientes.length ? ctx.fakeClientes : CLIENTES_FAKE;
    var rows = [];
    var now = Date.now();
    var maxTotal = dr.facturaTotalMax || 185000;
    for (var i = 0; i < n; i++) {
      var cl = clients[i % clients.length];
      var total =
        ctx.dataDensity >= 4
          ? rand(Math.max(120000, Math.floor(maxTotal * 0.35)), maxTotal)
          : ctx.dataDensity >= 3
            ? rand(45000, maxTotal)
            : rand(Math.max(12000, dr.ticketMin || 12000), Math.max(18000, maxTotal));
      var est = i % 5 === 0 ? 'timbrada' : i % 3 === 0 ? 'pos' : 'timbrada';
      rows.push({
        consecutivo: 'FV-' + String(1000 + n - i),
        compradorNombre: cl.nombre,
        compradorNit: cl.nit,
        total: total,
        estado: est,
        uuid: fakeUuid(),
        fecha: new Date(now - i * rand(180000, 7200000)).toISOString(),
      });
    }
    return rows;
  }

  function mergeFacturas(ctx) {
    var fake = ctx.fakeFacturas || [];
    if (ctx.believable || ctx.fakeEmpresa || (global.__crozzoHoneypotLive && global.__crozzoHoneypotLive.active)) {
      return fake;
    }
    var real = [];
    try {
      if (global.config && typeof global.config.getFacturas === 'function') {
        real = (global.config.getFacturas() || []).slice(0, 25).map(function (f, i) {
          return {
            consecutivo: f.consecutivo || 'POS-' + (i + 1),
            compradorNombre: f.compradorNombre || 'Cliente',
            compradorNit: f.compradorNit || '',
            total: Number(f.total) || 0,
            estado: f.estado || 'pos',
            uuid: f.uuid || fakeUuid(),
            fecha: f.fecha || new Date().toISOString(),
          };
        });
      }
    } catch (_) {}
    if (real.length >= 3) {
      var mix = real.concat(fake.slice(0, Math.max(0, 15 - real.length)));
      return mix.slice(0, 40);
    }
    return fake;
  }

  function buildMesas(ctx) {
    ensureFakePools(ctx);
    var dr = ctx.densityRanges;
    var total = dr.mesasTotal || 24;
    var out = [];
    for (var i = 1; i <= total; i++) {
      var st =
        ctx.dataDensity === 0
          ? MESA_STATES[0]
          : MESA_STATES[(i + rand(0, 5)) % MESA_STATES.length];
      if (ctx.dataDensity <= 1 && i > 3) st = MESA_STATES[0];
      out.push({ id: 'M' + i, nombre: 'Mesa ' + i, state: st.state, label: st.label });
    }
    return out;
  }

  function buildSampleCart(products) {
    var n = rand(2, Math.min(5, products.length));
    var cart = [];
    var used = {};
    for (var i = 0; i < n; i++) {
      var p = products[rand(0, products.length - 1)];
      if (used[p.id]) {
        cart[used[p.id]].cantidad++;
        continue;
      }
      used[p.id] = cart.length;
      cart.push({ id: p.id, nombre: p.nombre, precio: p.precio, icon: p.icon, cantidad: rand(1, 3) });
    }
    return cart;
  }

  function enrichContext(ctx) {
    if (ctx.believable && !ctx.fakeEmpresa) {
      var seed =
        (global.__crozzoHoneypotLive &&
          global.__crozzoHoneypotLive.opts &&
          global.__crozzoHoneypotLive.opts.trip &&
          global.__crozzoHoneypotLive.opts.trip.tripId) ||
        Date.now();
      ctx.fakeEmpresa = pickFakeEmpresa(seed);
    }
    if (ctx.dataDensity == null) {
      var dc = getDensityConfig(typeof ctx.hour === 'number' ? ctx.hour : new Date().getHours());
      Object.assign(ctx, dc);
    }
    ensureFakePools(ctx);
    var emp = getEmpresaInfo(ctx);
    var dr = ctx.densityRanges;
    ctx.empresa = emp;
    ctx.sucursal = emp.nombre;
    ctx.nit = emp.nit;
    ctx.catalog = getCatalogProducts(ctx);
    if (!ctx._facturasReady) {
      ctx.fakeFacturas = buildFakeFacturas(ctx);
      ctx._facturasReady = true;
    }
    ctx.facturas = mergeFacturas(ctx);
    ctx.facturasCount = ctx.facturas.length;
    ctx.timbradasCount = ctx.facturas.filter(function (f) {
      return f.estado === 'timbrada';
    }).length;
    ctx.posCount = ctx.facturas.filter(function (f) {
      return f.estado === 'pos';
    }).length;
    if (!ctx._mesasReady) {
      ctx.mesas = buildMesas(ctx);
      ctx._mesasReady = true;
    }
    ctx.mesasOcupadas = dr.mesasOcup != null ? dr.mesasOcup : ctx.mesasOcupadas;
    ctx.comandasVivas = dr.comandas != null ? dr.comandas : ctx.comandasVivas;
    ctx.sampleCart = ctx.dataDensity === 0 ? [] : buildSampleCart(ctx.catalog);
    ctx.transacciones = dr.trans;
    ctx.ticketMedio =
      dr.ticketMin && dr.ticketMax ? rand(dr.ticketMin, dr.ticketMax) : rand(22000, 48000);
    if (dr.ventasMin != null && dr.ventasMax != null && dr.ventasMax > 0) {
      ctx.ventasHoyFake = rand(dr.ventasMin, dr.ventasMax);
    } else if (ctx.dataDensity === 0) {
      ctx.ventasHoyFake = 0;
    }
    ctx.staffOnline = (ctx.fakeStaff || []).filter(function (s) {
      return s.activo;
    });
    ctx.staffAll = ctx.fakeStaff || [];
    return ctx;
  }

  function getShiftContext(believable) {
    var now = new Date();
    var h = now.getHours();
    var dc = getDensityConfig(h);
    var dr = densityRanges(dc.dataDensity);
    var ctx = {
      period: dc.period,
      dataDensity: dc.dataDensity,
      densityRanges: dr,
      label: dc.label,
      hour: h,
      emptyBusiness: !!dc.emptyBusiness,
      staffOnline: [],
      staffAll: [],
      mesasOcupadas: dr.mesasOcup,
      comandasVivas: dr.comandas,
      ventasHoyFake: dr.ventasMax > 0 ? rand(dr.ventasMin, dr.ventasMax) : 0,
      terminal: 'POS-01',
      modoOp: 'SIMPLE',
      believable: believable !== false,
    };
    if (believable !== false) {
      ctx.fakeEmpresa = pickFakeEmpresa(String(Date.now()) + String(rand(1, 99999)));
    }
    return enrichContext(ctx);
  }

  function theaterStepsForDecoy(decoy, ctx, believable) {
    var label = (decoy && decoy.label) || 'Usuario';
    var rol = (decoy && decoy.rol) || 'staff';
    var p = ctx.period;
    var head = [
      { pct: 8, txt: 'Crozzo POS — validando credenciales…' },
      { pct: 18, txt: 'Cargando configuración de ' + (ctx.empresa.nombre || 'sucursal') + '…' },
      { pct: 28, txt: 'Sincronizando catálogo (' + ctx.catalog.length + ' productos)…' },
      { pct: 38, txt: 'Conectando terminal ' + ctx.terminal + '…' },
    ];
    if (p === 'day' || p === 'morning' || p === 'afternoon') {
      head.push({ pct: 48, txt: ctx.facturasCount + ' comprobantes en historial local…' });
      head.push({ pct: 56, txt: (ctx.staffOnline.length || ctx.fakeStaff.length) + ' usuarios en línea…' });
    } else if (p === 'rush' || p === 'late') {
      head.push({ pct: 48, txt: 'Preparando cierre · ' + ctx.facturasCount + ' facturas · $' + formatMoney(ctx.ventasHoyFake) + '…' });
      head.push({ pct: 56, txt: ctx.transacciones + ' transacciones · cuadrando medios de pago…' });
    } else if (p === 'dawn') {
      head.push({ pct: 48, txt: 'Apertura · ' + ctx.facturasCount + ' comprobantes del turno anterior…' });
      head.push({ pct: 56, txt: 'Cargando caja y catálogo…' });
    } else if (p === 'closed') {
      head.push({ pct: 48, txt: 'Negocio cerrado · sin ventas activas…' });
      head.push({ pct: 56, txt: 'Terminal en modo vigilancia…' });
    } else {
      head.push({ pct: 48, txt: ctx.facturasCount + ' comprobantes en historial…' });
      head.push({ pct: 56, txt: 'Sincronizando datos locales…' });
    }
    var mid = [];
    if (rol === 'admin' || rol === 'superadmin') {
      mid = [
        { pct: 66, txt: 'Módulos de gestión y facturas…' },
        { pct: 76, txt: 'Resolución DIAN · NIT ' + ctx.nit + '…' },
        { pct: 86, txt: 'Reportes y cierres de caja…' },
      ];
    } else if (rol === 'caja') {
      mid = [
        { pct: 66, txt: 'Abriendo turno de caja…' },
        { pct: 76, txt: 'Mapa de mesas · ' + ctx.mesasOcupadas + ' activas…' },
        { pct: 86, txt: 'Cargando ventas del turno…' },
      ];
    } else if (rol === 'mesero') {
      mid = [
        { pct: 66, txt: 'Mesas · ' + ctx.mesasOcupadas + ' ocupadas…' },
        { pct: 76, txt: 'Comandas en cocina: ' + ctx.comandasVivas + '…' },
        { pct: 86, txt: 'Impresoras de comanda: OK' },
      ];
    } else {
      mid = [
        { pct: 66, txt: 'Pantalla cocina · cola ' + ctx.comandasVivas + '…' },
        { pct: 76, txt: 'Áreas caliente / fría / bar…' },
        { pct: 86, txt: 'Listo para despacho…' },
      ];
    }
    return head.concat(mid, [
      { pct: 94, txt: 'Bienvenido, ' + label },
      { pct: 100, txt: 'Entrando al sistema…' },
    ]);
  }

  function facturaBadge(estado) {
    if (estado === 'timbrada') return '<span class="badge badge-success">✅ Timbrada</span>';
    if (estado === 'pos') return '<span class="badge badge-info">🧾 POS</span>';
    return '<span class="badge badge-info">🧾 POS</span>';
  }

  function renderHpCajero(ctx, decoy, liveState) {
    var mode = (liveState && liveState.cajaMode) || 'directa';
    if (mode === 'mesa') return renderHpMesas(ctx, decoy, liveState);
    if (mode === 'llevar') return renderHpLlevar(ctx, decoy, liveState);
    var products = ctx.catalog;
    var cart = ctx.sampleCart;
    var sub = cart.reduce(function (s, i) {
      return s + i.precio * i.cantidad;
    }, 0);
    var iva = Math.round(sub * 0.08);
    var total = sub + iva;
    var cartHtml = cart.length
      ? cart
          .map(function (it) {
            return (
              '<div class="cart-item" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">' +
              '<span>' +
              esc(it.icon) +
              ' ' +
              esc(it.nombre) +
              ' ×' +
              it.cantidad +
              '</span><span>$' +
              (it.precio * it.cantidad).toLocaleString('es-CO') +
              '</span></div>'
            );
          })
          .join('')
      : '<div style="text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:3rem;margin-bottom:12px;">🛒</div><p>Agrega productos a la orden</p></div>';

    return (
      '<div class="alert alert-info" style="display:flex;"><span>💵</span><div><strong>FACTURACIÓN SIMPLE (TICKET / SOPORTE)</strong><br><span style="font-size:0.85rem;">Comprobante de caja · ' +
      esc(ctx.empresa.nombre) +
      ' · NIT ' +
      esc(ctx.nit) +
      '</span></div></div>' +
      '<div class="pos-container">' +
      '<div><div class="service-mode-switch" style="margin-bottom:14px;">' +
      '<button type="button" class="service-mode-btn active" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'directa\')">✅ Venta Directa</button>' +
      '<button type="button" class="service-mode-btn" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'mesa\')">🍽️ Mesas</button>' +
      '<button type="button" class="service-mode-btn" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'llevar\')">🥡 Llevar</button></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<div style="font-weight:700;">🛒 Venta directa · ' +
      esc(decoy.label || decoy.user) +
      '</div><span class="badge badge-info">Flujo Caja → Cocina</span></div>' +
      '<div style="margin-bottom:16px;"><input type="text" class="form-input" placeholder="🔍 Buscar producto, código o SKU…" value="" style="width:100%;" readonly></div>' +
      '<div class="pos-products">' +
      products
        .map(function (p) {
          return (
            '<div class="product-card" data-name="' +
            esc(p.nombre.toLowerCase()) +
            '"><div class="product-icon">' +
            esc(p.icon) +
            '</div><div class="product-name">' +
            esc(p.nombre) +
            '</div><div class="product-price">$' +
            p.precio.toLocaleString('es-CO') +
            '</div></div>'
          );
        })
        .join('') +
      '</div></div>' +
      '<div class="cart-panel"><div class="cart-header"><span style="font-weight:600;">🧾 Pedido actual</span></div>' +
      '<div style="margin:8px 12px 0;font-size:0.8rem;color:var(--text-secondary);">Pendientes por comandar: ' +
      rand(0, 3) +
      ' ítems</div>' +
      '<div class="cart-items">' +
      cartHtml +
      '</div><div class="cart-footer"><div class="cart-summary">' +
      '<div class="cart-row"><span>Subtotal</span><span>$' +
      sub.toLocaleString('es-CO') +
      '</span></div>' +
      '<div class="cart-row"><span>IVA / impuesto</span><span>$' +
      iva.toLocaleString('es-CO') +
      '</span></div>' +
      '<div class="cart-row cart-total"><span>Total</span><span>$' +
      total.toLocaleString('es-CO') +
      '</span></div></div>' +
      '<button type="button" class="btn btn-success touch-main-btn" style="margin-top:8px;width:100%;">✅ Cobrar Venta Directa</button></div></div></div>'
    );
  }

  function renderHpLlevar(ctx, decoy, liveState) {
    var items = ctx.mesas.slice(0, 12).map(function (m, i) {
      return {
        id: 'L' + (i + 1),
        nombre: 'Llevar ' + (i + 1),
        state: m.state,
        label: m.label,
      };
    });
    return (
      '<div class="card"><div class="service-mode-switch" style="margin-bottom:14px;">' +
      '<button type="button" class="service-mode-btn" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'directa\')">✅ Venta Directa</button>' +
      '<button type="button" class="service-mode-btn" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'mesa\')">🍽️ Mesas</button>' +
      '<button type="button" class="service-mode-btn active" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'llevar\')">🥡 Llevar</button></div>' +
      '<div style="font-weight:700;margin-bottom:8px;">Pedidos para llevar</div>' +
      '<div class="target-choice-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));">' +
      items
        .map(function (m) {
          return (
            '<div class="target-choice-card" style="padding:12px;"><div style="font-weight:700;">' +
            esc(m.nombre) +
            '</div><span class="status-pill ' +
            m.state +
            '">' +
            esc(m.label) +
            '</span></div>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function renderHpMesas(ctx, decoy, liveState) {
    var mesas = ctx.mesas.slice(0, 20);
    return (
      '<div class="card"><div class="service-mode-switch" style="margin-bottom:14px;">' +
      '<button type="button" class="service-mode-btn" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'directa\')">✅ Venta Directa</button>' +
      '<button type="button" class="service-mode-btn active" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'mesa\')">🍽️ Mesas</button>' +
      '<button type="button" class="service-mode-btn" style="padding:14px;font-size:1rem;" onclick="crozzoHpLiveSetCajaMode(\'llevar\')">🥡 Llevar</button></div>' +
      '<div style="font-weight:700;margin-bottom:8px;">Selecciona mesa · ' +
      ctx.mesasOcupadas +
      ' con actividad</div>' +
      '<input type="text" class="form-input" placeholder="🔎 Buscar mesa…" style="margin-bottom:10px;" readonly>' +
      '<div class="target-choice-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));">' +
      mesas
        .map(function (m) {
          return (
            '<div class="target-choice-card" style="padding:12px;"><div style="font-weight:700;font-size:0.98rem;">' +
            esc(m.nombre) +
            '</div><span class="status-pill ' +
            m.state +
            '">' +
            esc(m.label) +
            '</span></div>'
          );
        })
        .join('') +
      '</div><p class="form-hint" style="margin-top:12px;">' +
      ctx.comandasVivas +
      ' comandas activas en cocina · última actualización ' +
      new Date().toLocaleTimeString('es-CO') +
      '</p></div>'
    );
  }

  function renderHpFacturas(ctx) {
    var dr = ctx.densityRanges || {};
    var show = Math.min(ctx.facturas.length, dr.tableRows || 40);
    var facturas = ctx.facturas.slice(0, show);
    var rows = facturas
      .map(function (f) {
        var fecha = '';
        try {
          fecha = new Date(f.fecha).toLocaleString('es-CO');
        } catch (_) {
          fecha = '—';
        }
        return (
          '<tr><td style="white-space:nowrap;font-size:0.8rem;color:var(--text-secondary);">' +
          esc(fecha) +
          '</td><td class="col-cons">' +
          esc(f.consecutivo) +
          '</td><td><strong style="font-weight:600;">' +
          esc(f.compradorNombre) +
          '</strong><br><span style="font-size:0.72rem;color:var(--text-muted);">' +
          esc(f.compradorNit) +
          '</span></td><td class="col-total">$' +
          Number(f.total).toLocaleString('es-CO') +
          '</td><td>' +
          facturaBadge(f.estado) +
          '</td><td style="font-size:0.72rem;font-family:monospace;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);">' +
          esc((f.uuid || '').slice(0, 12)) +
          '…</td><td><button type="button" class="btn btn-outline" style="padding:5px 10px;font-size:0.75rem;">Abrir</button></td></tr>'
        );
      })
      .join('');

    return (
      '<section class="crozzo-invoice-studio crozzo-invoice-studio--split">' +
      '<div class="crozzo-invoice-studio__list">' +
      '<div class="crozzo-invoice-studio__hero"><div><h2>Comprobantes y facturas</h2>' +
      '<p>Historial de ventas facturadas · ' +
      esc(ctx.empresa.nombre) +
      ' · NIT ' +
      esc(ctx.nit) +
      '</p></div><button type="button" class="btn btn-outline">Limpiar</button></div>' +
      '<div class="crozzo-invoice-kpis">' +
      '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">Registros</div><div class="crozzo-invoice-kpi__value">' +
      ctx.facturasCount +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--success"><div class="crozzo-invoice-kpi__label">Timbradas</div><div class="crozzo-invoice-kpi__value">' +
      ctx.timbradasCount +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--info"><div class="crozzo-invoice-kpi__label">POS</div><div class="crozzo-invoice-kpi__value">' +
      ctx.posCount +
      '</div></div>' +
      '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">Ventas hoy</div><div class="crozzo-invoice-kpi__value">$' +
      ctx.ventasHoyFake.toLocaleString('es-CO') +
      '</div></div></div>' +
      '<div class="crozzo-invoice-toolbar"><div class="crozzo-invoice-toolbar__search">' +
      '<input type="search" placeholder="Buscar consecutivo, cliente, NIT…" value="" readonly></div>' +
      '<div class="crozzo-invoice-filters">' +
      '<button type="button" class="crozzo-invoice-filter-chip is-active">Todos</button>' +
      '<button type="button" class="crozzo-invoice-filter-chip">Timbradas</button>' +
      '<button type="button" class="crozzo-invoice-filter-chip">POS</button></div></div>' +
      '<div class="crozzo-invoice-table-wrap" style="max-height:calc(100vh - 320px);overflow:auto;">' +
      '<table class="crozzo-invoice-table"><thead><tr><th>Fecha</th><th>Nº</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Ref.</th><th></th></tr></thead><tbody>' +
      (rows ||
        '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Sin comprobantes · negocio cerrado o sin actividad en este horario.</td></tr>') +
      '</tbody></table>' +
      (ctx.facturas.length > show
        ? '<p class="form-hint" style="margin:8px 12px 0;">Mostrando ' +
          show +
          ' de ' +
          ctx.facturasCount +
          ' comprobantes.</p>'
        : '') +
      '</div></div>' +
      '<div class="crozzo-invoice-preview-pane"><div class="crozzo-invoice-empty" style="padding:24px;text-align:center;color:var(--text-muted);">' +
      '<p><strong>Vista previa del comprobante</strong></p><p style="font-size:0.85rem;margin-top:8px;">Seleccione una fila para ver detalle, CUFE y totales de cierre.</p></div></div></section>'
    );
  }

  function renderHpReportes(ctx) {
    var top = ctx.catalog.slice(0, 5);
    return (
      '<div class="card crozzo-rep-root"><div class="card-header"><div><h2 class="card-title">Reportes e inventario</h2>' +
      '<p class="page-subtitle" style="margin-top:4px;">KPIs del día · ' +
      esc(ctx.empresa.nombre) +
      '</p></div></div>' +
      '<div class="crozzo-rep-tabs">' +
      '<button type="button" class="crozzo-rep-tab active">📈 Ventas hoy</button>' +
      '<button type="button" class="crozzo-rep-tab">📦 Inventario</button>' +
      '<button type="button" class="crozzo-rep-tab">📥 Exportar CSV</button></div>' +
      '<div class="crozzo-rep-panel"><div class="crozzo-rep-kpi-grid">' +
      '<div class="crozzo-rep-kpi"><div class="val">$' +
      ctx.ventasHoyFake.toLocaleString('es-CO') +
      '</div><div class="lbl">Ventas hoy</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      ctx.transacciones +
      '</div><div class="lbl">Transacciones</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">$' +
      ctx.ticketMedio.toLocaleString('es-CO') +
      '</div><div class="lbl">Ticket medio</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      ctx.facturasCount +
      '</div><div class="lbl">Comprobantes</div></div></div>' +
      '<h3 style="font-size:0.95rem;margin:16px 0 8px;">Top productos (hoy)</h3>' +
      '<div class="crozzo-rep-table-wrap"><table><thead><tr><th>Producto</th><th>Cant.</th><th>Ingresos</th></tr></thead><tbody>' +
      top
        .map(function (p, i) {
          return (
            '<tr><td>' +
            esc(p.icon + ' ' + p.nombre) +
            '</td><td>' +
            rand(3, 28) +
            '</td><td>$' +
            (p.precio * rand(5, 20)).toLocaleString('es-CO') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div></div></div>'
    );
  }

  function renderHpCierre(ctx) {
    var efectivo = Math.round(ctx.ventasHoyFake * 0.42);
    var otros = ctx.ventasHoyFake - efectivo;
    var fondo = rand(100000, 250000);
    var esperado = fondo + efectivo;
    return (
      '<div class="card"><h2 class="card-title" style="margin-top:0;">🔒 Cierre de turno / arqueo</h2>' +
      '<p class="form-hint">Ventas del turno leídas del historial local (' +
      ctx.facturasCount +
      ' comprobantes). Datos de ' +
      esc(ctx.empresa.nombre) +
      '.</p>' +
      '<div class="crozzo-shift-dash-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin:16px 0;">' +
      '<div class="crozzo-shift-dash-card" style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);"><div class="val" style="font-weight:700;font-size:1.1rem;">' +
      ctx.transacciones +
      '</div><div class="lbl" style="font-size:0.72rem;color:var(--text-muted);">Ventas</div></div>' +
      '<div class="crozzo-shift-dash-card" style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);"><div class="val" style="font-weight:700;font-size:1.1rem;">$' +
      ctx.ventasHoyFake.toLocaleString('es-CO') +
      '</div><div class="lbl" style="font-size:0.72rem;color:var(--text-muted);">Total turno</div></div>' +
      '<div class="crozzo-shift-dash-card" style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);"><div class="val" style="font-weight:700;font-size:1.1rem;">$' +
      efectivo.toLocaleString('es-CO') +
      '</div><div class="lbl" style="font-size:0.72rem;color:var(--text-muted);">Efectivo</div></div>' +
      '<div class="crozzo-shift-dash-card" style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);"><div class="val" style="font-weight:700;font-size:1.1rem;">$' +
      otros.toLocaleString('es-CO') +
      '</div><div class="lbl" style="font-size:0.72rem;color:var(--text-muted);">Otros medios</div></div></div>' +
      '<label class="form-label">Fondo inicial en caja ($)</label><input type="number" class="form-input crozzo-shift-input" value="' +
      fondo +
      '" readonly>' +
      '<label class="form-label">Efectivo contado ($)</label><input type="number" class="form-input crozzo-shift-input" value="' +
      esperado +
      '" readonly>' +
      '<div class="alert alert-success" style="margin-top:12px;">Cuadre sin diferencia · listo para exportar cierre Z y respaldo de ' +
      ctx.facturasCount +
      ' facturas.</div>' +
      '<button type="button" class="btn btn-primary" style="width:100%;margin-top:12px;">Cerrar turno y guardar</button></div>'
    );
  }

  var VIEW_META = {
    cajero: {
      page: 'cajero',
      title: 'Punto de Venta',
      subtitle: 'Gestiona tus ventas y facturación electrónica',
      render: renderHpCajero,
    },
    mesas: {
      page: 'cajero',
      title: 'Restaurante · POS',
      subtitle: 'Mesas y comandas del salón',
      render: renderHpMesas,
    },
    facturas: {
      page: 'facturas',
      title: 'Facturas',
      subtitle: 'Historial de comprobantes y ventas facturadas',
      render: renderHpFacturas,
    },
    reportes: {
      page: 'inventarios',
      title: 'Reportes e inventario',
      subtitle: 'KPIs del día, stock y exportación contable',
      render: renderHpReportes,
    },
    cierre: {
      page: 'inventarios',
      title: 'Cierre de turno',
      subtitle: 'Arqueo de caja y totales del turno',
      render: renderHpCierre,
    },
  };

  function planViews(ctx, decoy) {
    var d = ctx.dataDensity != null ? ctx.dataDensity : 2;
    if (d === 0) return ['cajero', 'facturas'];
    if (d === 1) return ['cajero', 'facturas', 'reportes'];
    if (d === 4) {
      return ['facturas', 'cierre', 'reportes', 'cajero', 'mesas', 'facturas'];
    }
    if (d === 3) {
      return ['cajero', 'mesas', 'facturas', 'reportes', 'facturas', 'cierre'];
    }
    if (decoy && (decoy.rol === 'mesero' || decoy.rol === 'caja')) {
      return ['mesas', 'cajero', 'facturas', 'facturas', 'reportes', 'cierre'];
    }
    return ['cajero', 'mesas', 'facturas', 'reportes', 'cierre', 'facturas'];
  }

  function refreshLucide() {
    try {
      if (global.lucide && typeof global.lucide.createIcons === 'function') global.lucide.createIcons();
    } catch (_) {}
  }

  function prefixCloneIds(clone) {
    clone.querySelectorAll('[id]').forEach(function (el) {
      if (el.id && el.id.indexOf('hpC_') !== 0) el.id = 'hpC_' + el.id;
    });
  }

  function qClone(clone, baseId) {
    return clone.querySelector('#hpC_' + baseId);
  }

  function mountAppClone(container, decoy, ctx) {
    var src = document.querySelector('.app-container');
    if (!src || !container) return null;
    var wrap = document.createElement('div');
    wrap.className = 'crozzo-hp-clone-wrap';
    var clone = src.cloneNode(true);
    clone.classList.add('crozzo-hp-app-clone');
    prefixCloneIds(clone);
    var sidebar = clone.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.add('is-expanded');
    }
    clone.querySelectorAll('.nav-group-li').forEach(function (g) {
      var grp = g.getAttribute('data-nav-group');
      if (
        grp === 'operacion' ||
        grp === 'gestion' ||
        grp === 'administrativo' ||
        grp === 'configuracion' ||
        grp === 'compras' ||
        grp === 'procesos'
      ) {
        g.classList.add('open');
        g.classList.remove('nav-group-collapsed');
        var items = g.querySelector('.nav-group-items');
        if (items) items.classList.add('open');
        var btn = g.querySelector('.nav-group-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      }
    });
    clone.querySelectorAll('button, input, select, textarea, a[href]').forEach(function (el) {
      el.setAttribute('tabindex', '-1');
      if (el.tagName === 'A') el.removeAttribute('href');
      if (el.tagName === 'INPUT' && el.type !== 'hidden') el.readOnly = true;
    });
    clone.querySelectorAll('[data-nav-group="super-admin"], .super-admin-menu').forEach(function (g) {
      g.style.display = 'none';
    });
    var tenantTxt = qClone(clone, 'crozzoSidebarTenantTxt');
    if (tenantTxt) tenantTxt.textContent = ctx.empresa.nombre;
    var userName = qClone(clone, 'userMenuName');
    if (userName) userName.textContent = decoy.label || decoy.user || 'Usuario';
    var userRole = qClone(clone, 'userMenuRole');
    if (userRole) userRole.textContent = (decoy.rol || 'staff') + ' · ' + ctx.label;
    var avatar = qClone(clone, 'userMenuAvatarInitial');
    if (avatar) avatar.textContent = String((decoy.label || decoy.user || 'U')).charAt(0).toUpperCase();
    wrap.appendChild(clone);
    container.innerHTML = '';
    container.appendChild(wrap);
    refreshLucide();
    return {
      wrap: wrap,
      clone: clone,
      main: qClone(clone, 'mainContent'),
    };
  }

  function setHpView(mounted, viewKey, decoy, ctx) {
    if (!mounted || !mounted.main) return;
    var meta = VIEW_META[viewKey] || VIEW_META.cajero;
    ctx.sampleCart = buildSampleCart(ctx.catalog);
    mounted.main.innerHTML = meta.render(ctx, decoy);
    var title = qClone(mounted.clone, 'pageTitle');
    var subtitle = qClone(mounted.clone, 'pageSubtitle');
    if (title) title.textContent = meta.title;
    if (subtitle) subtitle.textContent = meta.subtitle;
    mounted.clone.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
      el.classList.remove('active');
      if (el.getAttribute('data-page') === meta.page) el.classList.add('active');
    });
    var dateEl = qClone(mounted.clone, 'currentDate');
    if (dateEl) {
      try {
        dateEl.textContent = new Date().toLocaleDateString('es-CO', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch (_) {}
    }
    refreshLucide();
  }

  function mountSandbox(container, decoy, ctx) {
    ctx = enrichContext(ctx);
    var mounted = mountAppClone(container, decoy, ctx);
    var rotTimer = null;
    if (!mounted) {
      container.innerHTML =
        '<p class="form-hint" style="padding:20px;">Cargando interfaz…</p>';
      return { stop: function () {} };
    }
    setHpView(mounted, 'cajero', decoy, ctx);
    return {
      startRotation: function (durationMs) {
        var views = planViews(ctx, decoy);
        var idx = 0;
        var per = Math.max(3200, Math.floor(durationMs / views.length));
        function tick() {
          idx = (idx + 1) % views.length;
          setHpView(mounted, views[idx], decoy, ctx);
          rotTimer = setTimeout(tick, per);
        }
        rotTimer = setTimeout(tick, per);
      },
      stop: function () {
        if (rotTimer) clearTimeout(rotTimer);
        rotTimer = null;
      },
      setView: function (v) {
        setHpView(mounted, v, decoy, ctx);
      },
    };
  }

  function fakeLogLine(decoy, tripId, ctx) {
    var p = ctx.period;
    var d = ctx.dataDensity != null ? ctx.dataDensity : 2;
    var pool = [
      'Exportando ' + ctx.facturasCount + ' comprobantes del historial local…',
      'Respaldo ventas · ' + ctx.empresa.nombre + ' · NIT ' + ctx.nit,
      'Sincronizando catálogo (' + ctx.catalog.length + ' productos)…',
      'Cola de facturación procesada',
      'Cierre de turno · cuadre efectivo OK',
    ];
    if (d === 0 || p === 'closed') {
      pool = [
        'Negocio cerrado · terminal en vigilancia…',
        'Sin transacciones activas en este horario',
        'Esperando apertura de turno…',
      ];
    } else if (d === 1 || p === 'dawn') {
      pool.push('Apertura · ' + ctx.facturasCount + ' comprobantes del turno anterior');
      pool.push('Cargando caja inicial…');
    } else if (d >= 3 || p === 'afternoon' || p === 'rush') {
      pool.push('Mesa M' + rand(1, ctx.mesas.length || 18) + ' · comanda registrada');
      pool.push('Descargando reporte ventas · $' + formatMoney(ctx.ventasHoyFake));
      pool.push(ctx.timbradasCount + ' facturas timbradas en lote');
      pool.push((ctx.fakeProveedores && ctx.fakeProveedores.length) + ' proveedores en catálogo');
      if (d === 4) {
        pool.push('Arqueo de caja · ' + ctx.transacciones + ' transacciones');
        pool.push('Recepción MP · ' + (ctx.fakeCortes && ctx.fakeCortes.length) + ' cortes del día');
      }
    } else {
      pool.push('Mesa M' + rand(1, 18) + ' · comanda registrada');
      pool.push('Descargando reporte ventas del día · $' + formatMoney(ctx.ventasHoyFake));
    }
    if (p === 'late') {
      pool.push('Arqueo de caja · ' + ctx.transacciones + ' transacciones');
      pool.push('Generando CSV cierres de turno…');
    }
    return { text: pool[rand(0, pool.length - 1)], cls: '' };
  }

  function renderHpInicio(ctx) {
    if (ctx.dataDensity === 0) {
      return (
        '<div class="card">' +
        '<div class="alert alert-warning" style="margin-top:0;">🌙 <strong>Negocio cerrado</strong> · ' +
        esc(ctx.label) +
        '</div>' +
        '<p class="form-hint">' +
        esc(ctx.empresa.nombre) +
        ' · NIT ' +
        esc(ctx.nit) +
        '<br>Sin ventas ni comprobantes en este horario. El terminal permanece en modo vigilancia.</p>' +
        '<div class="btn-group" style="margin-top:14px;flex-wrap:wrap;gap:10px;opacity:0.55;">' +
        '<button type="button" class="btn btn-primary" disabled>🍽️ Restaurante · POS</button>' +
        '<button type="button" class="btn btn-outline" disabled>📄 Facturas</button></div></div>'
      );
    }
    return (
      '<div class="card">' +
      '<p class="form-hint">' +
      esc(ctx.empresa.nombre) +
      ' · NIT ' +
      esc(ctx.nit) +
      ' · ' +
      esc(ctx.label) +
      '<br>' +
      ctx.facturasCount +
      ' comprobantes · $' +
      formatMoney(ctx.ventasHoyFake) +
      ' ventas hoy · ' +
      (ctx.fakeClientes && ctx.fakeClientes.length) +
      ' clientes</p>' +
      '<div class="btn-group" style="margin-top:14px;flex-wrap:wrap;gap:10px;">' +
      '<button type="button" class="btn btn-primary" onclick="navigateTo(\'cajero\')">🍽️ Restaurante · POS</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'venta-comercial\')">🏪 Tienda / Comercial</button>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'facturas\')">📄 Facturas</button></div></div>'
    );
  }

  function renderHpComandas(ctx) {
    var n = ctx.comandasVivas;
    var cards = [];
    for (var i = 0; i < Math.min(8, n); i++) {
      cards.push(
        '<div class="card" style="padding:12px;margin-bottom:8px;border-left:4px solid var(--accent);">' +
        '<strong>Mesa M' +
        (rand(1, 18)) +
        '</strong> · ' +
        ['Cocina caliente', 'Bar', 'Postres'][i % 3] +
        '<br><span class="form-hint">Pendiente · ' +
        rand(2, 9) +
        ' ítems · ' +
        new Date().toLocaleTimeString('es-CO') +
        '</span></div>'
      );
    }
    return (
      '<div class="card"><h2 class="card-title">Comandas · cocina</h2>' +
      '<p class="form-hint">' +
      n +
      ' comandas en cola · turno ' +
      esc(ctx.label) +
      '</p>' +
      cards.join('') +
      '</div>'
    );
  }

  function renderHpTablets(ctx) {
    return renderHpMesas(ctx, null, { cajaMode: 'mesa' }).replace(
      'Selecciona mesa',
      'Tablets · selecciona mesa para tomar pedido'
    );
  }

  function renderHpClientes(ctx) {
    var list = ctx.fakeClientes && ctx.fakeClientes.length ? ctx.fakeClientes : CLIENTES_FAKE;
    var dr = ctx.densityRanges || {};
    var show = Math.min(list.length, dr.tableRows || list.length || 50);
    var rows = list.slice(0, show).map(function (c) {
      return (
        '<tr><td>' +
        esc(c.nombre) +
        '</td><td>' +
        esc(c.nit) +
        '</td><td><span class="badge badge-info">FE</span></td></tr>'
      );
    }).join('');
    if (!rows) {
      rows =
        '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">Sin clientes registrados · negocio cerrado.</td></tr>';
    }
    return (
      '<div class="card"><h2 class="card-title">Clientes (facturación electrónica)</h2>' +
      '<p class="form-hint">' +
      list.length +
      ' clientes en directorio · ' +
      esc(ctx.label) +
      '</p>' +
      '<div class="crozzo-rep-table-wrap" style="max-height:calc(100vh - 260px);overflow:auto;">' +
      '<table><thead><tr><th>Cliente</th><th>NIT</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      (list.length > show
        ? '<p class="form-hint" style="margin-top:8px;">Mostrando ' + show + ' de ' + list.length + '.</p>'
        : '') +
      '</div>'
    );
  }

  function renderHpProductos(ctx) {
    var rows = ctx.catalog
      .map(function (p) {
        return (
          '<tr><td>' +
          esc(p.icon + ' ' + p.nombre) +
          '</td><td>$' +
          p.precio.toLocaleString('es-CO') +
          '</td><td>' +
          esc(p.categoria || '—') +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="card"><h2 class="card-title">Catálogo y precios</h2>' +
      '<p class="form-hint">' +
      ctx.catalog.length +
      ' productos activos · sincronizado con POS</p>' +
      '<div class="crozzo-rep-table-wrap"><table><thead><tr><th>Producto</th><th>Precio</th><th>Categoría</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function renderHpProveedores(ctx) {
    var list = ctx.fakeProveedores || [];
    var dr = ctx.densityRanges || {};
    var show = Math.min(list.length, dr.tableRows || list.length || 30);
    var rows = list.slice(0, show).map(function (p) {
      return (
        '<tr><td>' +
        esc(p.nombre) +
        '</td><td>' +
        esc(p.nit) +
        '</td><td>' +
        esc(p.rubro) +
        '</td><td>' +
        esc(p.contacto) +
        '</td><td>' +
        (p.saldo ? '$' + formatMoney(p.saldo) : '—') +
        '</td></tr>'
      );
    }).join('');
    if (!rows) {
      rows =
        '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Sin proveedores · negocio cerrado o sin compras.</td></tr>';
    }
    var ordenes = ctx.dataDensity >= 3 ? rand(8, 24) : ctx.dataDensity >= 1 ? rand(1, 6) : 0;
    return (
      '<motion.div class="card"><h2 class="card-title">Proveedores</h2>' +
      '<p class="form-hint">' +
      list.length +
      ' proveedores activos · ' +
      ordenes +
      ' órdenes abiertas · ' +
      esc(ctx.empresa.nombre) +
      '</p>' +
      '<div class="crozzo-rep-kpi-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      list.length +
      '</div><div class="lbl">Registrados</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      ordenes +
      '</div><div class="lbl">Órdenes abiertas</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">$' +
      formatMoney(ctx.dataDensity >= 3 ? rand(1200000, 6800000) : rand(0, 900000)) +
      '</div><div class="lbl">Compras mes</div></div>' +
      '</div>' +
      '<div class="crozzo-rep-table-wrap" style="max-height:calc(100vh - 340px);overflow:auto;">' +
      '<table><thead><tr><th>Proveedor</th><th>NIT</th><th>Rubro</th><th>Contacto</th><th>Saldo</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function renderHpCortes(ctx) {
    var list = ctx.fakeCortes || [];
    var dr = ctx.densityRanges || {};
    var show = Math.min(list.length, dr.tableRows || list.length || 25);
    var rows = list.slice(0, show).map(function (c) {
      return (
        '<tr><td>' +
        esc(c.tipo) +
        '</td><td>' +
        esc(c.lote) +
        '</td><td>' +
        esc(c.kg) +
        ' kg</td><td>' +
        esc(c.proveedor) +
        '</td><td>' +
        esc(c.fecha) +
        '</td></tr>'
      );
    }).join('');
    if (!rows) {
      rows =
        '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Sin cortes registrados en este horario.</td></tr>';
    }
    return (
      '<div class="card"><h2 class="card-title">Cortes y materia prima</h2>' +
      '<p class="form-hint">' +
      list.length +
      ' recepciones MP · turno ' +
      esc(ctx.label) +
      '</p>' +
      '<div class="crozzo-rep-table-wrap" style="max-height:calc(100vh - 260px);overflow:auto;">' +
      '<table><thead><tr><th>Tipo</th><th>Lote</th><th>Peso</th><th>Proveedor</th><th>Fecha</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function renderHpCompras(ctx) {
    var prov = (ctx.fakeProveedores && ctx.fakeProveedores.length) || 0;
    var cortes = (ctx.fakeCortes && ctx.fakeCortes.length) || 0;
    var ordenes = ctx.dataDensity >= 3 ? rand(8, 24) : ctx.dataDensity >= 1 ? rand(1, 6) : 0;
    return (
      '<div class="card"><h2 class="card-title">Centro de compras</h2>' +
      '<p class="form-hint">Órdenes y recepciones · ' +
      esc(ctx.label) +
      ' · datos locales del terminal</p>' +
      '<div class="crozzo-rep-kpi-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px;">' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      ordenes +
      '</div><div class="lbl">Órdenes abiertas</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">$' +
      formatMoney(ctx.dataDensity >= 3 ? rand(1200000, 6800000) : rand(0, 900000)) +
      '</div><div class="lbl">Compras mes</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      prov +
      '</div><div class="lbl">Proveedores</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val">' +
      cortes +
      '</div><div class="lbl">Cortes MP</div></div></div>' +
      (prov
        ? '<p class="form-hint" style="margin-top:14px;">Use el menú <strong>Proveedores</strong> o <strong>Cortes y materia prima</strong> para ver el detalle completo.</p>'
        : '<p class="form-hint" style="margin-top:14px;">Sin actividad de compras en este horario.</p>') +
      '</div>'
    );
  }

  function renderHpEmpresa(ctx) {
    var e = ctx.empresa || {};
    return (
      '<motion.div class="card"><h2 class="card-title">Configuración empresa</h2>' +
      '<p class="form-hint" style="margin:0 0 14px;">Datos fiscales y comerciales del establecimiento · almacenamiento local</p>' +
      '<motion.div class="form-grid" style="gap:12px;">' +
      '<div class="form-group"><label class="form-label">Nombre comercial</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.nombre) +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Razón social</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.razon) +
      '"></motion.div>' +
      '<motion.div class="form-group"><label class="form-label">NIT</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.nit) +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Régimen</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.regimen || 'Responsable de IVA') +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Actividad económica</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.actividad || '—') +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Dirección</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.direccion) +
      '"></motion.div>' +
      '<motion.div class="form-group"><label class="form-label">Ciudad</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.ciudad) +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Teléfono</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.telefono || '—') +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Correo facturación</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.email || '—') +
      '"></motion.div>' +
      '</motion.div>' +
      '<div class="alert alert-info" style="margin-top:14px;">Sincronizado con terminal ' +
      esc(ctx.terminal || 'POS-01') +
      ' · última actualización ' +
      new Date().toLocaleString('es-CO') +
      '</div></motion.div>'
    ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function renderHpDian(ctx) {
    var e = ctx.empresa || {};
    return (
      '<motion.div class="card"><h2 class="card-title">Configuración DIAN</h2>' +
      '<p class="form-hint">' +
      esc(e.nombre) +
      ' · NIT ' +
      esc(e.nit) +
      '</p>' +
      '<motion.div class="form-grid" style="gap:12px;margin-top:12px;">' +
      '<div class="form-group"><label class="form-label">Resolución DIAN</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.resolucion || '18764000000000') +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Prefijo</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.prefijo || 'FV') +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Desde</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.desde || '1') +
      '"></motion.div>' +
      '<div class="form-group"><label class="form-label">Hasta</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.hasta || '5000') +
      '"></motion.div>' +
      '<div class="form-group" style="grid-column:1/-1;"><label class="form-label">Vigencia</label>' +
      '<input class="form-input" readonly value="' +
      esc(e.vigencia || '2025-01-01 / 2027-12-31') +
      '"></motion.div>' +
      '</motion.div>' +
      '<div class="alert alert-success" style="margin-top:12px;">✅ Resolución activa · modo facturación electrónica habilitado</div></motion.div>'
    ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function renderHpUsuarios(ctx) {
    var staff = ctx.fakeStaff || buildFakeStaffUsers(ctx.empresa);
    var rows = staff
      .map(function (u) {
        var rolLbl = { admin: 'Admin', caja: 'Caja', mesero: 'Mesero', cocina: 'Cocina', inventario: 'Inventario' }[u.rol] || u.rol;
        return (
          '<tr><td><div class="user-cell-name"><strong>' +
          esc(u.nombre) +
          '</strong><small>' +
          esc(u.id) +
          '</small></div></td><td><span class="badge">' +
          esc(rolLbl) +
          '</span></td><td><span class="badge ' +
          (u.activo ? 'badge-success' : 'badge-warning') +
          '">' +
          (u.activo ? 'Activo' : 'Inactivo') +
          '</span></td><td><button type="button" class="btn btn-outline" onclick="crozzoHpFakeEditUser()">✏️ Editar</button></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="card"><motion.div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
      '<span class="card-title">👥 Usuarios y permisos</span>' +
      '<span class="badge" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);">' +
      staff.length +
      ' usuarios · ' +
      esc(ctx.empresa.nombre) +
      '</span></motion.div>' +
      '<div class="users-toolbar" style="margin:14px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
      '<input type="text" class="form-input" placeholder="🔎 Buscar por nombre, ID o rol…" style="max-width:220px;" readonly>' +
      '<input type="text" class="form-input" id="hpFakeNewUserName" placeholder="Nombre" style="max-width:160px;">' +
      '<input type="password" class="form-input" id="hpFakeNewUserPass" placeholder="Mín. 8 caracteres" style="max-width:140px;" autocomplete="new-password">' +
      '<select class="form-select" id="hpFakeNewUserRole" style="max-width:130px;"><option value="caja">Caja</option><option value="mesero">Mesero</option><option value="admin">Admin</option></select>' +
      '<button type="button" class="btn btn-primary" onclick="crozzoHpFakeAddUser()">➕ Agregar</button>' +
      '</div>' +
      '<div class="users-table-wrap" style="max-height:calc(100vh - 280px);overflow:auto;"><table class="users-table"><thead><tr><th>Usuario / ID</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      '<p class="form-hint" style="margin-top:10px;">Los cambios se guardan en este terminal y se sincronizan con la red local del negocio.</p></div>'
    ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function renderHpConfig(ctx, pageLabel) {
    return (
      '<div class="card"><h2 class="card-title">' +
      esc(pageLabel) +
      '</h2>' +
      '<p class="form-hint"><strong>' +
      esc(ctx.empresa.nombre) +
      '</strong><br>Razón social: ' +
      esc(ctx.empresa.razon) +
      '<br>NIT ' +
      esc(ctx.nit) +
      '<br>' +
      esc(ctx.empresa.direccion) +
      ' · ' +
      esc(ctx.empresa.ciudad) +
      '</p>' +
      '<div class="alert alert-info" style="margin-top:12px;">Configuración cargada desde almacenamiento local del terminal.</div></div>'
    );
  }

  function renderLivePage(page, ctx, decoy, liveState) {
    ctx = enrichContext(ctx);
    if (liveState) liveState.ctx = ctx;
    var p = String(page || 'cajero');
    if (p === 'cajero' || p === 'venta-comercial') return renderHpCajero(ctx, decoy, liveState);
    if (p === 'facturas') return renderHpFacturas(ctx);
    if (p === 'tablets') return renderHpTablets(ctx);
    if (p === 'comandas' || p === 'cocina') return renderHpComandas(ctx);
    if (p === 'inventarios' || p === 'compras-dashboard') return renderHpReportes(ctx);
    if (p === 'planilla-2026' || p === 'nomina-planilla') return renderHpCierre(ctx);
    if (p === 'inicio-operacion') return renderHpInicio(ctx);
    if (p === 'caja-clientes') return renderHpClientes(ctx);
    if (p === 'productos') return renderHpProductos(ctx);
    if (p === 'compras-proveedores') return renderHpProveedores(ctx);
    if (p === 'compras-cortes') return renderHpCortes(ctx);
    if (
      p === 'centro-compras' ||
      p.indexOf('compras-') === 0 ||
      p === 'pedidos-internos' ||
      p === 'operaciones-qyc'
    ) {
      return renderHpCompras(ctx);
    }
    if (p === 'config-empresa') return renderHpEmpresa(ctx);
    if (p === 'config-dian') return renderHpDian(ctx);
    if (p === 'config-usuarios') return renderHpUsuarios(ctx);
    if (p.indexOf('config-') === 0) {
      var labels = {
        'config-empresa': 'Empresa',
        'config-dian': 'Configuración DIAN',
        'config-impuestos': 'Impuestos',
        'config-usuarios': 'Usuarios',
        'config-comandas': 'Impresión comandas',
        'config-conexiones-sistemas': 'Conexión de sistemas',
        'config-multidispositivo': 'Multi-dispositivo',
        'config-facturas-admin': 'Facturas e impresión',
        'config-certificado': 'Certificado .p12',
        'config-proveedor': 'Proveedor FE',
      };
      return renderHpConfig(ctx, labels[p] || 'Configuración');
    }
    if (p === 'control-acceso') return renderHpConfig(ctx, 'Marcación personal');
    if (p === 'auditoria') {
      return (
        '<div class="card"><h2 class="card-title">Auditoría</h2><p class="form-hint">Últimos eventos del turno · ' +
        ctx.transacciones +
        ' operaciones registradas.</p></div>'
      );
    }
    return renderHpInicio(ctx);
  }

  function dashboardHtml(decoy, ctx) {
    return '<div class="crozzo-hp-clone-fallback">Cargando Crozzo POS…</div>';
  }

  function collectDeviceProfile(decoy, trip) {
    var nav = global.navigator || {};
    var scr = global.screen || {};
    var conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    var profile = {
      caso: (trip && trip.tripId) || '—',
      usuarioSenuelo: (decoy && decoy.user) || '—',
      etiqueta: (decoy && decoy.label) || '—',
      fecha: new Date().toLocaleString('es-CO'),
      userAgent: nav.userAgent || '—',
      plataforma: nav.platform || '—',
      idioma: nav.language || '—',
      idiomas: (nav.languages || []).join(', ') || '—',
      pantalla:
        (scr.width || '?') + '×' + (scr.height || '?') + ' · prof. ' + (scr.colorDepth || '?'),
      zonaHoraria: '',
      online: nav.onLine ? 'Sí' : 'No',
      nucleos: nav.hardwareConcurrency || '—',
      memoriaGB: nav.deviceMemory != null ? nav.deviceMemory : '—',
      touch: nav.maxTouchPoints > 0 ? 'Sí (' + nav.maxTouchPoints + ')' : 'No',
      conexion: conn ? conn.effectiveType || conn.type || 'red' : '—',
      ruta: (global.location && global.location.pathname) || '—',
      host: (global.location && global.location.hostname) || 'local',
    };
    try {
      profile.zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_) {
      profile.zonaHoraria = '—';
    }
    try {
      if (global.__TAURI__ || global.__TAURI_INTERNALS__) profile.entorno = 'Crozzo Desktop (Tauri)';
      else profile.entorno = 'Navegador / WebView';
    } catch (_) {
      profile.entorno = 'POS';
    }
    return profile;
  }

  function formatDeviceDump(device) {
    if (!device) return '—';
    return Object.keys(device)
      .map(function (k) {
        return k.toUpperCase().replace(/_/g, ' ') + ': ' + device[k];
      })
      .join('\n');
  }

  global.CrozzoHoneypotSim = {
    getShiftContext: getShiftContext,
    pickFakeEmpresa: pickFakeEmpresa,
    buildFakeStaffUsers: buildFakeStaffUsers,
    theaterStepsForDecoy: theaterStepsForDecoy,
    fakeLogLine: fakeLogLine,
    dashboardHtml: dashboardHtml,
    renderLivePage: renderLivePage,
    collectDeviceProfile: collectDeviceProfile,
    formatDeviceDump: formatDeviceDump,
    mountSandbox: mountSandbox,
    planViews: planViews,
  };
})(typeof window !== 'undefined' ? window : globalThis);
