/**
 * Crozzo POS — contraseñas locales (PBKDF2), bloqueo de intentos y política de claves.
 */
(function (global) {
  'use strict';

  var PBKDF2_ITERATIONS = 120000;
  var MIN_PASSWORD_LEN = 8;
  var DEFAULT_PASSWORDS = ['141414', '1234', 'password', 'admin', 'crozzo'];
  var LOGIN_ATTEMPTS_LS = 'crozzo_login_lock_v1';
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 5 * 60 * 1000;

  function enc() {
    return new TextEncoder();
  }

  function b64FromBytes(bytes) {
    var bin = '';
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  function bytesFromB64(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function hasHashFields(user) {
    return !!(user && user.claveHash && user.claveSalt);
  }

  function crozzoPasswordPolicy(plain, userId) {
    var p = String(plain || '');
    if (p.length < MIN_PASSWORD_LEN) {
      return { ok: false, msg: 'Mínimo ' + MIN_PASSWORD_LEN + ' caracteres.' };
    }
    var low = p.toLowerCase();
    for (var i = 0; i < DEFAULT_PASSWORDS.length; i++) {
      if (low === DEFAULT_PASSWORDS[i]) {
        return { ok: false, msg: 'Esa contraseña es demasiado común. Elige otra.' };
      }
    }
    if (String(userId || '').toUpperCase() === 'KENNY' && low.indexOf('kenny') >= 0) {
      return { ok: false, msg: 'No uses el nombre de usuario en la contraseña.' };
    }
    return { ok: true };
  }

  async function crozzoHashPassword(plain) {
    var pol = crozzoPasswordPolicy(plain, '');
    if (!pol.ok) throw new Error(pol.msg);
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var keyMat = await crypto.subtle.importKey('raw', enc().encode(String(plain)), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMat,
      256
    );
    return {
      claveHash: b64FromBytes(new Uint8Array(bits)),
      claveSalt: b64FromBytes(salt),
      clave: '',
    };
  }

  async function crozzoVerifyPassword(plain, user) {
    if (!user) return { ok: false };
    if (hasHashFields(user)) {
      try {
        var salt = bytesFromB64(user.claveSalt);
        var keyMat = await crypto.subtle.importKey('raw', enc().encode(String(plain)), 'PBKDF2', false, ['deriveBits']);
        var bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMat,
          256
        );
        var got = b64FromBytes(new Uint8Array(bits));
        return { ok: got === user.claveHash, legacy: false };
      } catch (e) {
        console.warn('[auth] verify hash', e);
        return { ok: false };
      }
    }
    if (user.clave != null && user.clave !== '') {
      return { ok: String(user.clave) === String(plain), legacy: true };
    }
    return { ok: false };
  }

  async function crozzoApplyPasswordToUser(user, plain) {
    var hashed = await crozzoHashPassword(plain);
    var next = Object.assign({}, user, {
      claveHash: hashed.claveHash,
      claveSalt: hashed.claveSalt,
    });
    delete next.clave;
    return next;
  }

  async function crozzoMigrateUserPasswordToHash(userId, plain) {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') return;
    var pol = crozzoPasswordPolicy(plain, userId);
    if (!pol.ok) return;
    var conf = global.getUsuariosConfig();
    var idx = (conf.staff || []).findIndex(function (s) {
      return s.id === userId;
    });
    if (idx < 0) return;
    var u = conf.staff[idx];
    if (hasHashFields(u) && !u.clave) return;
    try {
      var next = await crozzoApplyPasswordToUser(u, plain);
      conf.staff[idx] = next;
      global.saveUsuarios(conf.staff);
    } catch (e) {
      console.warn('[auth] migrate hash', e);
    }
  }

  function crozzoMustChangePassword(user) {
    if (!user) return false;
    var seg = typeof global.config !== 'undefined' && global.config.get ? global.config.get('seguridad') || {} : {};
    if (user.id === 'KENNY' && !seg.kennyPasswordChanged) return true;
    if (hasHashFields(user)) return false;
    if (user.clave != null && user.clave !== '') {
      var pol = crozzoPasswordPolicy(user.clave, user.id);
      return !pol.ok;
    }
    return true;
  }

  function crozzoReadLoginLock() {
    try {
      var raw = sessionStorage.getItem(LOGIN_ATTEMPTS_LS);
      if (!raw) return { fails: 0, until: 0 };
      var o = JSON.parse(raw);
      return { fails: o.fails || 0, until: o.until || 0 };
    } catch (_) {
      return { fails: 0, until: 0 };
    }
  }

  function crozzoWriteLoginLock(o) {
    try {
      sessionStorage.setItem(LOGIN_ATTEMPTS_LS, JSON.stringify(o));
    } catch (_) {}
  }

  function crozzoLoginIsLocked() {
    var lock = crozzoReadLoginLock();
    if (lock.until && Date.now() < lock.until) return { locked: true, until: lock.until };
    return { locked: false };
  }

  function crozzoLoginRecordFail() {
    var lock = crozzoReadLoginLock();
    lock.fails = (lock.fails || 0) + 1;
    if (lock.fails >= MAX_ATTEMPTS) {
      lock.until = Date.now() + LOCK_MS;
      lock.fails = 0;
    }
    crozzoWriteLoginLock(lock);
    return lock;
  }

  function crozzoLoginClearFails() {
    crozzoWriteLoginLock({ fails: 0, until: 0 });
  }

  var DECOY_ACCOUNTS_DEFAULT = [
    { user: 'SUPERADMIN', pass: 'admin123', rol: 'superadmin', label: 'Super Administrador' },
    { user: 'ADMIN', pass: 'admin', rol: 'admin', label: 'Administrador' },
    { user: 'GERENTE', pass: 'gerente2024', rol: 'admin', label: 'Gerente' },
    { user: 'GERENTE2', pass: 'gerente', rol: 'admin', label: 'Gerente turno' },
    { user: 'DIRECTOR', pass: 'director', rol: 'admin', label: 'Director' },
    { user: 'AUDITOR', pass: 'auditor', rol: 'admin', label: 'Auditoría' },
    { user: 'CONTADOR', pass: 'contador', rol: 'admin', label: 'Contabilidad' },
    { user: 'FACTURACION', pass: 'factura2024', rol: 'admin', label: 'Facturación DIAN' },
    { user: 'MANTENIMIENTO', pass: 'mantto', rol: 'admin', label: 'Mantenimiento' },
    { user: 'PILOTO', pass: 'piloto', rol: 'admin', label: 'Piloto / pruebas' },
    { user: 'PAYASO', pass: 'payaso123', rol: 'admin', label: 'Payaso — prueba trampa' },
    { user: 'TICKETS', pass: 'tickets', rol: 'admin', label: 'Soporte tickets' },
    { user: 'SOPORTE', pass: 'soporte', rol: 'superadmin', label: 'Soporte Crozzo' },
    { user: 'SOPORTE_CROZZO', pass: 'crozzo', rol: 'superadmin', label: 'Soporte plataforma' },
    { user: 'ROOT', pass: 'root', rol: 'superadmin', label: 'Root sistema' },
    { user: 'INSTALADOR', pass: 'instalar', rol: 'superadmin', label: 'Instalación' },
    { user: 'BACKDOOR', pass: 'crozzo2024', rol: 'superadmin', label: 'Puerta mantenimiento' },
    { user: 'RECOVERY', pass: 'reset123', rol: 'superadmin', label: 'Recuperación' },
    { user: 'DEBUG', pass: 'debug', rol: 'admin', label: 'Depuración' },
    { user: 'CAJERO', pass: 'cajero', rol: 'caja', label: 'Cajero' },
    { user: 'CAJERO1', pass: '1234', rol: 'caja', label: 'Cajero turno 1' },
    { user: 'CAJERO2', pass: '12345', rol: 'caja', label: 'Cajero turno 2' },
    { user: 'CAJA', pass: 'caja', rol: 'caja', label: 'Punto de venta' },
    { user: 'DEMO', pass: 'demo', rol: 'caja', label: 'Modo demostración' },
    { user: 'MESERO', pass: 'mesero', rol: 'mesero', label: 'Mesero' },
    { user: 'MESERO2', pass: '123456', rol: 'mesero', label: 'Mesero sala' },
    { user: 'MESERO3', pass: 'mesa123', rol: 'mesero', label: 'Mesero terraza' },
    { user: 'REPARTO', pass: 'reparto', rol: 'mesero', label: 'Domicilios' },
    { user: 'COCINA', pass: 'cocina', rol: 'cocina', label: 'Cocina' },
    { user: 'COCINERO', pass: 'cocina123', rol: 'cocina', label: 'Cocinero' },
    { user: 'CHEF', pass: 'chef', rol: 'cocina', label: 'Jefe de cocina' },
    { user: 'BAR', pass: 'bar', rol: 'cocina', label: 'Bar / coctelería' },
    { user: 'BODEGA', pass: 'bodega', rol: 'inventario', label: 'Bodega' },
    { user: 'INVENTARIO', pass: 'inventario', rol: 'inventario', label: 'Inventarios' },
    { user: 'COMPRAS', pass: 'compras', rol: 'inventario', label: 'Compras' },
  ];

  var LOGIN_USER_ALIASES = {
    SUPER_ADMIN: 'SUPERADMIN',
    SUPER: 'SUPERADMIN',
    ADMINISTRADOR: 'ADMIN',
    ADMINISTRADOR1: 'ADMIN',
    CAJA1: 'CAJERO1',
    CAJA_01: 'CAJERO1',
    MESERA: 'MESERO',
    COCINERO1: 'COCINERO',
    CROZZO: 'SOPORTE_CROZZO',
    CROZZO_SOPORTE: 'SOPORTE_CROZZO',
    SYSTEM: 'ROOT',
    SYS: 'ROOT',
    RECUPERACION: 'RECOVERY',
    MANTENIMIENTO_CROZZO: 'BACKDOOR',
    PAYASA: 'PAYASO',
    CLOWN: 'PAYASO',
    PAYASO_PRUEBA: 'PAYASO',
  };

  var HONEYPOT_BAIT_LS = 'crozzo_hp_bait_v1';
  var BAIT_FORCE_AFTER = 3;

  function crozzoHoneypotNormalizeUser(rawUser) {
    var u = String(rawUser || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (u.indexOf('@') >= 0) u = u.split('@')[0];
    if (LOGIN_USER_ALIASES[u]) return LOGIN_USER_ALIASES[u];
    return u;
  }

  function crozzoHoneypotPasswordClose(typed, real) {
    var t = String(typed || '');
    var r = String(real || '');
    if (!t || !r || t === r) return false;
    if (r.indexOf(t) === 0 && t.length >= r.length - 3) return true;
    if (t.toLowerCase() === r.toLowerCase().slice(0, -1)) return true;
    if (t.toLowerCase() + '123' === r.toLowerCase()) return true;
    if (t.toLowerCase() + '1' === r.toLowerCase()) return true;
    if (t.toLowerCase() + '2024' === r.toLowerCase()) return true;
    return false;
  }

  function crozzoHoneypotReadBait() {
    try {
      var o = JSON.parse(sessionStorage.getItem(HONEYPOT_BAIT_LS) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function crozzoHoneypotBumpBait(user) {
    var o = crozzoHoneypotReadBait();
    o[user] = (o[user] || 0) + 1;
    try {
      sessionStorage.setItem(HONEYPOT_BAIT_LS, JSON.stringify(o));
    } catch (_) {}
    return o[user];
  }

  function crozzoHoneypotBaitClear() {
    try {
      sessionStorage.removeItem(HONEYPOT_BAIT_LS);
    } catch (_) {}
  }

  function crozzoHoneypotPickBaitMessage(decoy, typedPass) {
    var u = decoy.user;
    var p = String(typedPass || '');
    var real = String(decoy.pass || '');
    var close = crozzoHoneypotPasswordClose(p, real);

    if (u === 'BACKDOOR') {
      if (p === 'crozzo' || p === 'crozzo2023') {
        return { msg: '✓ Token mantenimiento reconocido. Falta PIN de terminal (4 dígitos finales).', hope: true };
      }
      if (close) return { msg: 'PIN casi válido — verifique el año en la clave.', hope: true };
      return { msg: 'Modo mantenimiento: clave en dos partes. Primera parte incorrecta.', hope: true };
    }
    if (u === 'RECOVERY') {
      if (p === 'reset' || p === 'reset12') {
        return { msg: '✓ Código recovery aceptado. Ingrese el dígito verificador final.', hope: true };
      }
      return { msg: 'Recuperación: faltan caracteres del código (formato resetXXX).', hope: true };
    }
    if (u === 'DEBUG') {
      if (p === 'debug1' || p === 'Debug') {
        return { msg: '✓ Build de laboratorio detectada. Escriba la clave completa en minúsculas.', hope: true };
      }
      return { msg: 'Depuración: solo disponible en build 0.9.8.x (clave de laboratorio).', hope: true };
    }
    if (u === 'FACTURACION') {
      if (p === 'factura' || p === 'factura202') {
        return { msg: '✓ Prefijo fiscal OK. Complete el año en la contraseña.', hope: true };
      }
      return { msg: 'Facturación DIAN: sincronice resolución antes de ingresar.', hope: true };
    }
    if (u === 'SUPERADMIN' || u === 'ROOT' || u === 'SOPORTE' || u === 'SOPORTE_CROZZO' || u === 'INSTALADOR') {
      return { msg: 'Usuario o contraseña incorrectos.', hope: false };
    }
    if (decoy.rol === 'caja' && (p === '123' || p === '12345')) {
      return { msg: 'Usuario o contraseña incorrectos.', hope: false };
    }
    if (close) {
      return { msg: 'Usuario o contraseña incorrectos.', hope: false };
    }
    if (p.length > 0 && p.length < real.length) {
      return { msg: 'Usuario o contraseña incorrectos.', hope: false };
    }
    return { msg: 'Usuario o contraseña incorrectos.', hope: false };
  }

  /** Usuario cebo + clave incorrecta: mensaje falso que invita a reintentar; tras N intentos dispara trampa. */
  function crozzoHoneypotProbeBait(rawUser, rawPass, seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    if (!hp.enabled) return null;
    var u = crozzoHoneypotNormalizeUser(rawUser);
    var p = String(rawPass || '');
    if (!u || !p) return null;
    if (crozzoHoneypotFindDecoy(rawUser, rawPass, seg)) return null;

    var decoy = null;
    for (var i = 0; i < hp.decoys.length; i++) {
      if (hp.decoys[i].user === u) {
        decoy = hp.decoys[i];
        break;
      }
    }
    if (!decoy) return null;

    var pick = crozzoHoneypotPickBaitMessage(decoy, p);
    var count = crozzoHoneypotBumpBait(u);
    var close = crozzoHoneypotPasswordClose(p, decoy.pass);
    var forceTrip =
      count >= BAIT_FORCE_AFTER ||
      close ||
      (u === 'BACKDOOR' && p.length >= 4) ||
      (u === 'RECOVERY' && p.indexOf('reset') === 0);

    return {
      decoy: decoy,
      hp: hp,
      message: pick.msg,
      hopeful: pick.hope,
      baitCount: count,
      forceTrip: forceTrip,
    };
  }

  /** Contraseña legendaria inicial (solo en herramientas/CROZZO_LEYENDA_DESBLOQUEO.txt). */
  var LEGEND_UNLOCK_FACTORY =
    'Crozzo-Leyenda-9K2mX7pQ4vN8wR3sT6hJ1fL5bY0cD_Apr2026-NoCompartir';
  /** Usuario de asistencia para levantar cuarentena legendaria (no es usuario del negocio). */
  var LEGEND_UNLOCK_USER = 'ASISTENCIA_GENERAL';
  var LEGEND_UNLOCK_USER_LABEL = 'Asistencia general';

  var HONEYPOT_DEFAULTS = {
    enabled: true,
    decoyUser: 'SUPERADMIN',
    decoyPass: 'admin123',
    lockMinutes: 45,
    theaterSeconds: 10,
    harvestMinMinutes: 1,
    harvestMaxMinutes: 5,
    sandboxSeconds: 12,
    sandboxInteractiveMinMinutes: 1,
    sandboxInteractiveMaxMinutes: 5,
    breachSeconds: 14,
    wipeSecrets: false,
    tripCount: 0,
    lockUntil: 0,
    legendaryActive: false,
    lastTripAt: null,
    lastTripId: null,
    lastDecoyUser: null,
    lastDecoyRol: null,
  };

  function normalizeDecoyEntry(d) {
    if (!d || typeof d !== 'object') return null;
    var user = String(d.user || d.id || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!user) return null;
    return {
      user: user,
      pass: String(d.pass != null ? d.pass : d.clave != null ? d.clave : ''),
      rol: String(d.rol || 'staff').toLowerCase(),
      label: String(d.label || d.nombre || user),
    };
  }

  function mergeDecoyAccounts(hp) {
    var list = [];
    var seen = {};
    function push(d) {
      var n = normalizeDecoyEntry(d);
      if (!n || !n.pass || seen[n.user]) return;
      seen[n.user] = true;
      list.push(n);
    }
    (Array.isArray(hp.decoys) ? hp.decoys : []).forEach(push);
    if (hp.decoyUser && hp.decoyPass) {
      push({ user: hp.decoyUser, pass: hp.decoyPass, rol: 'superadmin', label: 'Legacy' });
    }
    DECOY_ACCOUNTS_DEFAULT.forEach(push);
    return list;
  }

  /** Login y trampa honeypot son obligatorios; no se pueden desactivar desde la UI. */
  function crozzoEnforceSeguridadPolicy(seg) {
    var s = seg && typeof seg === 'object' ? Object.assign({}, seg) : {};
    s.requiereLogin = true;
    var hpRaw = s.honeypot && typeof s.honeypot === 'object' ? Object.assign({}, s.honeypot) : {};
    hpRaw.enabled = true;
    s.honeypot = normalizeHoneypot(hpRaw);
    return s;
  }

  function normalizeHoneypot(hp) {
    var h = hp && typeof hp === 'object' ? hp : {};
    var decoys = mergeDecoyAccounts(h);
    var hMin = Math.max(1, Math.min(30, parseInt(h.harvestMinMinutes, 10) || HONEYPOT_DEFAULTS.harvestMinMinutes));
    var hMax = Math.max(hMin, Math.min(30, parseInt(h.harvestMaxMinutes, 10) || HONEYPOT_DEFAULTS.harvestMaxMinutes));
    var liveMin = Math.max(
      1,
      Math.min(15, parseInt(h.sandboxInteractiveMinMinutes, 10) || HONEYPOT_DEFAULTS.sandboxInteractiveMinMinutes)
    );
    var liveMax = Math.max(
      liveMin,
      Math.min(15, parseInt(h.sandboxInteractiveMaxMinutes, 10) || HONEYPOT_DEFAULTS.sandboxInteractiveMaxMinutes)
    );
    return {
      enabled: true,
      decoyUser: decoys[0] ? decoys[0].user : 'SUPERADMIN',
      decoyPass: decoys[0] ? decoys[0].pass : 'admin123',
      decoys: decoys,
      lockMinutes: Math.max(5, Math.min(1440, parseInt(h.lockMinutes, 10) || HONEYPOT_DEFAULTS.lockMinutes)),
      theaterSeconds: Math.max(3, Math.min(30, parseInt(h.theaterSeconds, 10) || HONEYPOT_DEFAULTS.theaterSeconds)),
      harvestMinMinutes: hMin,
      harvestMaxMinutes: hMax,
      sandboxSeconds: Math.max(5, Math.min(120, parseInt(h.sandboxSeconds, 10) || HONEYPOT_DEFAULTS.sandboxSeconds)),
      sandboxInteractiveMinMinutes: liveMin,
      sandboxInteractiveMaxMinutes: liveMax,
      breachSeconds: Math.max(20, Math.min(120, parseInt(h.breachSeconds, 10) || HONEYPOT_DEFAULTS.breachSeconds)),
      wipeSecrets: !!h.wipeSecrets,
      legendaryActive: !!h.legendaryActive,
      unlockCodeHash: h.unlockCodeHash || '',
      unlockCodeSalt: h.unlockCodeSalt || '',
      tripCount: Math.max(0, parseInt(h.tripCount, 10) || 0),
      lockUntil: Math.max(0, parseInt(h.lockUntil, 10) || 0),
      lastTripAt: h.lastTripAt || null,
      lastTripId: h.lastTripId || null,
      lastDecoyUser: h.lastDecoyUser || null,
      lastDecoyRol: h.lastDecoyRol || null,
      lastDeviceDump: h.lastDeviceDump && typeof h.lastDeviceDump === 'object' ? h.lastDeviceDump : null,
      tripLog: Array.isArray(h.tripLog) ? h.tripLog.slice(0, 250) : [],
    };
  }

  function crozzoHoneypotFromSeguridad(seg) {
    return normalizeHoneypot(seg && seg.honeypot);
  }

  function crozzoHoneypotFindDecoyByUser(rawUser, seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    var u = crozzoHoneypotNormalizeUser(rawUser);
    if (!u) return null;
    for (var i = 0; i < hp.decoys.length; i++) {
      if (hp.decoys[i].user === u) return { decoy: hp.decoys[i], hp: hp };
    }
    return null;
  }

  /** Coincidencia exacta usuario+clave señuelo (ignora si la trampa está activa). */
  function crozzoHoneypotFindDecoyCredentials(rawUser, rawPass, seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    var u = crozzoHoneypotNormalizeUser(rawUser);
    var p = String(rawPass || '');
    if (!u || !p) return null;
    for (var i = 0; i < hp.decoys.length; i++) {
      var d = hp.decoys[i];
      if (d.user === u && String(d.pass) === p) {
        return { decoy: d, hp: hp };
      }
    }
    return null;
  }

  function crozzoHoneypotFindDecoy(rawUser, rawPass, seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    if (!hp.enabled) return null;
    return crozzoHoneypotFindDecoyCredentials(rawUser, rawPass, seg);
  }

  function crozzoHoneypotIsDecoyUsername(rawUser, seg) {
    return !!crozzoHoneypotFindDecoyByUser(rawUser, seg);
  }

  /** Respaldo mínimo si el módulo de seguridad no cargó por completo. */
  function crozzoHoneypotFallbackDecoyUsername(rawUser) {
    var u = crozzoHoneypotNormalizeUser(rawUser);
    if (!u) return false;
    for (var i = 0; i < DECOY_ACCOUNTS_DEFAULT.length; i++) {
      if (DECOY_ACCOUNTS_DEFAULT[i].user === u) return true;
    }
    return false;
  }

  function crozzoHoneypotMatches(rawUser, rawPass, seg) {
    return !!crozzoHoneypotFindDecoy(rawUser, rawPass, seg);
  }

  function crozzoHoneypotIsReservedUserId(id, seg) {
    var u = crozzoHoneypotNormalizeUser(id);
    if (!u) return false;
    var hp = crozzoHoneypotFromSeguridad(seg || {});
    for (var i = 0; i < hp.decoys.length; i++) {
      if (hp.decoys[i].user === u) return true;
    }
    return false;
  }

  function crozzoHoneypotRandomHarvestMs(hp) {
    var min = (hp.harvestMinMinutes || 1) * 60 * 1000;
    var max = (hp.harvestMaxMinutes || 5) * 60 * 1000;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function crozzoHoneypotLockActive(seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    if (hp.legendaryActive) {
      return { locked: true, legendary: true, until: hp.lockUntil || 0, minutos: null, hp: hp };
    }
    if (!hp.lockUntil || Date.now() >= hp.lockUntil) return { locked: false, hp: hp };
    return {
      locked: true,
      legendary: false,
      until: hp.lockUntil,
      minutos: Math.max(1, Math.ceil((hp.lockUntil - Date.now()) / 60000)),
      hp: hp,
    };
  }

  async function ensureHoneypotLegendUnlock(seg, globalRef) {
    var g = globalRef || global;
    var hp = crozzoHoneypotFromSeguridad(seg);
    if (hp.unlockCodeHash && hp.unlockCodeSalt) return hp;
    try {
      var hashed = await crozzoHashPassword(LEGEND_UNLOCK_FACTORY);
      hp.unlockCodeHash = hashed.claveHash;
      hp.unlockCodeSalt = hashed.claveSalt;
      var nextSeg = Object.assign({}, seg || {}, { honeypot: hp });
      if (g.config && g.config.set) g.config.set('seguridad', nextSeg);
    } catch (e) {
      console.warn('[honeypot] legend hash', e);
    }
    return hp;
  }

  async function crozzoHoneypotVerifyLegendUnlock(code, seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    if (!hp.unlockCodeHash || !hp.unlockCodeSalt) return false;
    return (
      await crozzoVerifyPassword(String(code || ''), {
        claveHash: hp.unlockCodeHash,
        claveSalt: hp.unlockCodeSalt,
      })
    ).ok;
  }

  function crozzoHoneypotNormalizeAssistUser(rawUser) {
    return String(rawUser || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  function crozzoHoneypotVerifyAssistUser(rawUser) {
    var u = crozzoHoneypotNormalizeAssistUser(rawUser);
    return u === LEGEND_UNLOCK_USER || u === 'ASISTENCIA' || u === 'SOPORTE_GENERAL';
  }

  async function crozzoHoneypotClearLegendLock(code, seg, globalRef, opts) {
    var g = globalRef || global;
    var o = opts || {};
    if (o.requireSuperAdmin) {
      var okSa = false;
      try {
        if (typeof g.isSuperAdminUser === 'function') okSa = g.isSuperAdminUser();
      } catch (_) {}
      if (!okSa) return { ok: false, error: 'sin_permiso' };
    } else if (o.requireAssistUser !== false) {
      if (!crozzoHoneypotVerifyAssistUser(o.assistUser || '')) {
        return { ok: false, error: 'usuario_invalido' };
      }
    }
    var okCode = await crozzoHoneypotVerifyLegendUnlock(code, seg);
    if (!okCode) return { ok: false, error: 'codigo_invalido' };
    var hp = crozzoHoneypotFromSeguridad(seg);
    hp.legendaryActive = false;
    hp.lockUntil = 0;
    var nextSeg = Object.assign({}, seg || {}, { honeypot: hp });
    if (g.config && g.config.set) g.config.set('seguridad', nextSeg);
    if (g.config && g.config.addAudit) {
      g.config.addAudit('honeypot_leyenda_clear', 'Cuarentena levantada con código legendaria');
    }
    return { ok: true };
  }

  function crozzoHoneypotMakeTripId() {
    var t = Date.now().toString(36).toUpperCase();
    var r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'HP-' + t + '-' + r;
  }

  function crozzoHoneypotWipeLocalSecrets(globalRef) {
    var g = globalRef || global;
    try {
      localStorage.removeItem('crozzo_supabase_config');
      localStorage.removeItem('SUPABASE_URL');
      localStorage.removeItem('SUPABASE_ANON_KEY');
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
    } catch (_) {}
    try {
      if (g.config && g.config.get && g.config.set) {
        var cert = g.config.get('certificado') || {};
        g.config.set('certificado', Object.assign({}, cert, { password: '', p12Base64: '', p12Sha256: '' }));
        var prov = g.config.get('proveedor') || {};
        if (prov.apiKey) g.config.set('proveedor', Object.assign({}, prov, { apiKey: '' }));
      }
    } catch (e2) {
      console.warn('[honeypot] wipe config', e2);
    }
    try {
      if (g.__SUPABASE && g.__SUPABASE.auth && g.__SUPABASE.auth.signOut) {
        g.__SUPABASE.auth.signOut().catch(function () {});
      }
    } catch (_) {}
    try {
      g.__SUPABASE = null;
      g.__CROZZO_ONLINE_DATA = false;
    } catch (_) {}
  }

  /** Inicia trampa (sin bloqueo aún): teatro + recolección falsa primero. */
  function crozzoHoneypotBeginTrip(rawUser, rawPass, seg, globalRef) {
    var g = globalRef || global;
    var found = crozzoHoneypotFindDecoy(rawUser, rawPass, seg);
    if (!found) return null;
    var hp = found.hp;
    var decoy = found.decoy;
    var tripId = crozzoHoneypotMakeTripId();
    hp.tripCount = (hp.tripCount || 0) + 1;
    hp.lastTripAt = new Date().toISOString();
    hp.lastTripId = tripId;
    hp.lastDecoyUser = decoy.user;
    hp.lastDecoyRol = decoy.rol;
    var nextSeg = Object.assign({}, seg || {}, { honeypot: hp });
    if (g.config && g.config.set) {
      g.__crozzoHpConfigWriteBypass = true;
      try {
        g.config.set('seguridad', nextSeg);
      } finally {
        g.__crozzoHpConfigWriteBypass = false;
      }
    }
    if (g.config && typeof g.config.addAudit === 'function') {
      g.config.addAudit('honeypot_inicio', tripId + ' · ' + decoy.user + ' · rol=' + decoy.rol, {
        synthetic: true,
        channel: 'honeypot',
        tripId: tripId,
        decoyUser: decoy.user,
      });
    }
    return {
      tripId: tripId,
      decoy: decoy,
      lockMinutes: hp.lockMinutes,
      theaterSeconds: hp.theaterSeconds,
      harvestMs: crozzoHoneypotRandomHarvestMs(hp),
      wipeSecrets: hp.wipeSecrets,
    };
  }

  /** Cierra trampa: bloqueo global + opcional borrado de secretos. */
  function crozzoHoneypotFinalizeTrip(seg, trip, globalRef) {
    var g = globalRef || global;
    var hp = crozzoHoneypotFromSeguridad(seg);
    hp.legendaryActive = true;
    hp.lockUntil = 4102444800000;
    if (trip && trip.device && typeof trip.device === 'object') {
      hp.lastDeviceDump = trip.device;
    }
    var nextSeg = Object.assign({}, seg || {}, { honeypot: hp });
    if (g.config && g.config.set) {
      g.__crozzoHpConfigWriteBypass = true;
      try {
        g.config.set('seguridad', nextSeg);
      } finally {
        g.__crozzoHpConfigWriteBypass = false;
      }
    }
    if (typeof g.crozzoHpSecurityLockdownSideEffects === 'function') {
      g.crozzoHpSecurityLockdownSideEffects();
    } else {
      try {
        if (typeof g.logoutCurrentUser === 'function') g.logoutCurrentUser();
      } catch (_) {}
      try {
        if (typeof g.__crozzoSupabaseSignOut === 'function') g.__crozzoSupabaseSignOut();
      } catch (_) {}
    }
    if (g.config && typeof g.config.addAudit === 'function') {
      g.config.addAudit(
        'honeypot_disparado',
        (trip.tripId || 'HP') +
          ' · DETENCIÓN · usuario=' +
          String(trip.decoy && trip.decoy.user ? trip.decoy.user : '') +
          (hp.wipeSecrets ? ' · wipe_secretos' : ''),
        { synthetic: true, channel: 'honeypot', tripId: trip.tripId, decoyUser: trip.decoy && trip.decoy.user }
      );
    }
    if (hp.wipeSecrets) crozzoHoneypotWipeLocalSecrets(g);
    return { lockUntil: hp.lockUntil, lockMinutes: hp.lockMinutes };
  }

  /** @deprecated Use begin + finalize */
  function crozzoHoneypotTrigger(rawUser, rawPass, seg, globalRef) {
    var trip = crozzoHoneypotBeginTrip(rawUser, rawPass, seg, globalRef);
    if (!trip) return { triggered: false };
    crozzoHoneypotFinalizeTrip(seg, trip, globalRef);
    var hp = crozzoHoneypotFromSeguridad(seg);
    return Object.assign({ triggered: true, lockUntil: hp.lockUntil }, trip);
  }

  function crozzoRedactConfigForBackup(cfg) {
    try {
      var copy = JSON.parse(JSON.stringify(cfg || {}));
      if (copy.usuarios && Array.isArray(copy.usuarios.staff)) {
        copy.usuarios.staff = copy.usuarios.staff.map(function (u) {
          var x = Object.assign({}, u);
          delete x.clave;
          delete x.claveHash;
          delete x.claveSalt;
          return x;
        });
      }
      if (copy.seguridad) {
        copy.seguridad = Object.assign({}, copy.seguridad, { kioskExitPin: '[REDACTED]' });
        if (copy.seguridad.honeypot) {
          var hpR = Object.assign({}, copy.seguridad.honeypot, { decoyPass: '[REDACTED]' });
          if (Array.isArray(hpR.decoys)) {
            hpR.decoys = hpR.decoys.map(function (d) {
              return Object.assign({}, d, { pass: '[REDACTED]' });
            });
          }
          hpR.unlockCodeHash = hpR.unlockCodeHash ? '[REDACTED]' : '';
          hpR.unlockCodeSalt = hpR.unlockCodeSalt ? '[REDACTED]' : '';
          copy.seguridad.honeypot = hpR;
        }
      }
      if (copy.certificado) {
        copy.certificado = Object.assign({}, copy.certificado, {
          password: copy.certificado.password ? '[REDACTED]' : '',
          p12Base64: copy.certificado.p12Base64 ? '[REDACTED]' : '',
        });
      }
      return copy;
    } catch (_) {
      return cfg;
    }
  }

  global.CrozzoAuthSecurity = {
    MIN_PASSWORD_LEN: MIN_PASSWORD_LEN,
    crozzoPasswordPolicy: crozzoPasswordPolicy,
    crozzoHashPassword: crozzoHashPassword,
    crozzoVerifyPassword: crozzoVerifyPassword,
    crozzoApplyPasswordToUser: crozzoApplyPasswordToUser,
    crozzoMigrateUserPasswordToHash: crozzoMigrateUserPasswordToHash,
    crozzoMustChangePassword: crozzoMustChangePassword,
    crozzoLoginIsLocked: crozzoLoginIsLocked,
    crozzoLoginRecordFail: crozzoLoginRecordFail,
    crozzoLoginClearFails: crozzoLoginClearFails,
    crozzoRedactConfigForBackup: crozzoRedactConfigForBackup,
    hasHashFields: hasHashFields,
    DECOY_ACCOUNTS_DEFAULT: DECOY_ACCOUNTS_DEFAULT,
    HONEYPOT_DEFAULTS: HONEYPOT_DEFAULTS,
    normalizeHoneypot: normalizeHoneypot,
    crozzoEnforceSeguridadPolicy: crozzoEnforceSeguridadPolicy,
    crozzoHoneypotFromSeguridad: crozzoHoneypotFromSeguridad,
    crozzoHoneypotFindDecoy: crozzoHoneypotFindDecoy,
    crozzoHoneypotFindDecoyCredentials: crozzoHoneypotFindDecoyCredentials,
    crozzoHoneypotFindDecoyByUser: crozzoHoneypotFindDecoyByUser,
    crozzoHoneypotIsDecoyUsername: crozzoHoneypotIsDecoyUsername,
    crozzoHoneypotFallbackDecoyUsername: crozzoHoneypotFallbackDecoyUsername,
    crozzoHoneypotProbeBait: crozzoHoneypotProbeBait,
    crozzoHoneypotNormalizeUser: crozzoHoneypotNormalizeUser,
    crozzoHoneypotBaitClear: crozzoHoneypotBaitClear,
    crozzoHoneypotMatches: crozzoHoneypotMatches,
    crozzoHoneypotIsReservedUserId: crozzoHoneypotIsReservedUserId,
    crozzoHoneypotLockActive: crozzoHoneypotLockActive,
    crozzoHoneypotBeginTrip: crozzoHoneypotBeginTrip,
    crozzoHoneypotFinalizeTrip: crozzoHoneypotFinalizeTrip,
    crozzoHoneypotTrigger: crozzoHoneypotTrigger,
    crozzoHoneypotWipeLocalSecrets: crozzoHoneypotWipeLocalSecrets,
    crozzoHoneypotRandomHarvestMs: crozzoHoneypotRandomHarvestMs,
    LEGEND_UNLOCK_USER: LEGEND_UNLOCK_USER,
    LEGEND_UNLOCK_USER_LABEL: LEGEND_UNLOCK_USER_LABEL,
    crozzoHoneypotVerifyAssistUser: crozzoHoneypotVerifyAssistUser,
    crozzoHoneypotNormalizeAssistUser: crozzoHoneypotNormalizeAssistUser,
    ensureHoneypotLegendUnlock: ensureHoneypotLegendUnlock,
    crozzoHoneypotVerifyLegendUnlock: crozzoHoneypotVerifyLegendUnlock,
    crozzoHoneypotClearLegendLock: crozzoHoneypotClearLegendLock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
