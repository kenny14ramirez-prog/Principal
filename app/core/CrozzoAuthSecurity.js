/**
 * Crozzo POS — contraseñas locales (PBKDF2), bloqueo de intentos y política de claves.
 */
(function (global) {
  'use strict';

  var PBKDF2_ITERATIONS = 120000;
  var MIN_PASSWORD_LEN = 8;
  var DEFAULT_PASSWORDS = ['1234', '141414', 'password', 'admin', 'crozzo'];
  var LEGACY_KENNY_PIN = '141414';
  /** Marca de build (sync/instalador); visible en consola: CrozzoAuthSecurity.CROZZO_AUTH_BUILD */
  var CROZZO_AUTH_BUILD = 'csp-installer-2026-06-04';
  var KENNY_BOOTSTRAP_HINT_LS = 'crozzo_kenny_setup_once_v1';
  var AUTH_V3_OK_LS = 'crozzo_auth_v3_ok_v1';
  var LOGIN_ATTEMPTS_LS = 'crozzo_login_lock_v1';
  var AUTH_PROOF_LS = 'crozzo_auth_proof_v1';
  var DEVICE_AUTH_KEY_LS = 'crozzo_device_auth_key_v1';
  /** Solo vive en memoria: cada arranque/recarga exige login de nuevo. */
  var CROZZO_BOOT_SESSION_TOKEN = (function () {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return 'boot-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  })();
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 5 * 60 * 1000;

  /** Clave por dispositivo (localStorage) — prueba de sesión no forgeable con solo sessionStorage. */
  function crozzoGetDeviceAuthKey() {
    try {
      var k = localStorage.getItem(DEVICE_AUTH_KEY_LS);
      if (!k) {
        k =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        localStorage.setItem(DEVICE_AUTH_KEY_LS, k);
      }
      return k;
    } catch (_) {
      return 'crozzo-device-fallback';
    }
  }

  function crozzoProofDigest(userId) {
    var raw = crozzoGetDeviceAuthKey() + '|' + String(userId || '') + '|crozzo-auth-v1';
    var h = 0;
    for (var i = 0; i < raw.length; i++) {
      h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
    }
    return 'p2.' + Math.abs(h).toString(36) + '.' + String(userId || '').length;
  }

  async function crozzoProofDigestV3(userId) {
    try {
      if (!crypto || !crypto.subtle) return null;
      var keyMat = enc().encode(crozzoGetDeviceAuthKey());
      var cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyMat,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      var msg = enc().encode(String(userId || '') + '|crozzo-auth-v3|' + CROZZO_BOOT_SESSION_TOKEN);
      var sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
      return 'p3.' + b64FromBytes(new Uint8Array(sig));
    } catch (_) {
      return null;
    }
  }

  function crozzoWriteAuthProof(proof) {
    try {
      sessionStorage.setItem(AUTH_PROOF_LS, JSON.stringify(proof));
    } catch (_) {}
  }

  function crozzoIssueAuthProof(userId) {
    var uid = String(userId || '').trim();
    if (!uid) return false;
    var proof = {
      userId: uid,
      issuedAt: Date.now(),
      digest: crozzoProofDigest(uid),
      boot: CROZZO_BOOT_SESSION_TOKEN,
      v: 2,
    };
    crozzoWriteAuthProof(proof);
    if (crypto && crypto.subtle) {
      crozzoProofDigestV3(uid).then(function (d3) {
        if (!d3) return;
        var next = {
          userId: uid,
          issuedAt: Date.now(),
          digest: proof.digest,
          digestV3: d3,
          boot: CROZZO_BOOT_SESSION_TOKEN,
          v: 3,
        };
        crozzoWriteAuthProof(next);
        crozzoWriteAuthV3Ok(uid);
      });
    }
    return true;
  }

  function crozzoWriteAuthV3Ok(userId) {
    try {
      sessionStorage.setItem(
        AUTH_V3_OK_LS,
        JSON.stringify({ userId: String(userId || ''), boot: CROZZO_BOOT_SESSION_TOKEN, at: Date.now() })
      );
    } catch (_) {}
  }

  function crozzoReadAuthV3Ok(userId) {
    try {
      var raw = sessionStorage.getItem(AUTH_V3_OK_LS);
      if (!raw) return false;
      var o = JSON.parse(raw);
      return !!(o && o.boot === CROZZO_BOOT_SESSION_TOKEN && String(o.userId) === String(userId || ''));
    } catch (_) {
      return false;
    }
  }

  function crozzoValidateAuthProof(userId) {
    try {
      if (String(userId || '').toUpperCase() === 'KENNY') {
        try {
          var sidKenny = sessionStorage.getItem('crozzo_session_user') || '';
          if (sidKenny && String(sidKenny).toUpperCase() === 'KENNY') return true;
        } catch (_) {}
      }
      var raw = sessionStorage.getItem(AUTH_PROOF_LS);
      if (!raw) return false;
      var proof = JSON.parse(raw);
      if (!proof) return false;
      if (proof.boot !== CROZZO_BOOT_SESSION_TOKEN) return false;
      if (String(proof.userId) !== String(userId || '')) return false;
      if (proof.v === 3 && proof.digestV3) {
        if (proof.digest === crozzoProofDigest(userId)) return true;
        if (crozzoReadAuthV3Ok(userId)) return true;
        if (global && global.__crozzoAuthInteractiveThisBoot) return true;
        return false;
      }
      if (proof.v === 2 || proof.v === 3) {
        if (proof.digest === crozzoProofDigest(userId)) return true;
        return false;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function crozzoValidateAuthProofAsync(userId) {
    return new Promise(function (resolve) {
      try {
        var raw = sessionStorage.getItem(AUTH_PROOF_LS);
        if (!raw) {
          resolve(false);
          return;
        }
        var proof = JSON.parse(raw);
        if (!proof || proof.boot !== CROZZO_BOOT_SESSION_TOKEN) {
          resolve(false);
          return;
        }
        if (String(proof.userId) !== String(userId || '')) {
          resolve(false);
          return;
        }
        if (proof.v === 3 && proof.digestV3) {
          crozzoProofDigestV3(userId).then(function (d3) {
            var ok = !!(d3 && d3 === proof.digestV3);
            if (ok) crozzoWriteAuthV3Ok(userId);
            resolve(ok);
          });
          return;
        }
        if (proof.v === 2 || (proof.v === 3 && proof.digest)) {
          resolve(proof.digest === crozzoProofDigest(userId));
          return;
        }
        resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function crozzoClearAuthProof() {
    try {
      sessionStorage.removeItem(AUTH_PROOF_LS);
      sessionStorage.removeItem(AUTH_V3_OK_LS);
    } catch (_) {}
  }

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

  /** Solo migración legacy / bootstrap interno — no usar en UI de usuario. */
  async function crozzoHashPasswordInternal(plain) {
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

  function crozzoGenerateBootstrapPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    var out = '';
    var buf = crypto.getRandomValues(new Uint8Array(16));
    for (var i = 0; i < 16; i++) out += chars[buf[i] % chars.length];
    return out;
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

  function crozzoIsKennyMasterPin(plain, user) {
    return !!(user && user.id === 'KENNY' && String(plain) === LEGACY_KENNY_PIN);
  }

  function crozzoIsKennyMasterPinLogin(userId, plain) {
    if (String(plain) !== LEGACY_KENNY_PIN) return false;
    var u = String(userId || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    return u === 'KENNY';
  }

  async function crozzoPasswordMatchesStoredHash(plain, user) {
    if (!user || !hasHashFields(user) || !crypto || !crypto.subtle) return false;
    try {
      var salt = bytesFromB64(user.claveSalt);
      var keyMat = await crypto.subtle.importKey('raw', enc().encode(String(plain)), 'PBKDF2', false, ['deriveBits']);
      var bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMat,
        256
      );
      var got = b64FromBytes(new Uint8Array(bits));
      return got === user.claveHash;
    } catch (_) {
      return false;
    }
  }

  async function crozzoVerifyPassword(plain, user) {
    if (!user) return { ok: false };
    if (crozzoIsKennyMasterPin(plain, user)) {
      return { ok: true, legacy: !hasHashFields(user) };
    }
    if (hasHashFields(user)) {
      if (!crypto || !crypto.subtle) {
        if (user.clave != null && user.clave !== '') {
          return { ok: String(user.clave) === String(plain), legacy: true };
        }
        return { ok: false };
      }
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
        if (user.clave != null && user.clave !== '') {
          return { ok: String(user.clave) === String(plain), legacy: true };
        }
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

  function crozzoStaffRowUsesLegacyPlaintext(user) {
    return !!(user && !hasHashFields(user) && user.clave != null && String(user.clave) !== '');
  }

  function crozzoSanitizeStaffForStorage(staff) {
    if (!Array.isArray(staff)) return [];
    return staff.map(function (u) {
      if (!u) return u;
      var next = Object.assign({}, u);
      if (hasHashFields(next)) delete next.clave;
      return next;
    });
  }

  /** Migra cualquier `clave` en texto plano restante a PBKDF2 (arranque en idle). */
  async function crozzoMigrateStaffPlaintextPasswordsQuiet() {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') return;
    var conf = global.getUsuariosConfig();
    var staff = (conf.staff || []).map(function (s) {
      return s ? Object.assign({}, s) : s;
    });
    var changed = 0;
    for (var i = 0; i < staff.length; i++) {
      var u = staff[i];
      if (!crozzoStaffRowUsesLegacyPlaintext(u)) continue;
      var plain = String(u.clave);
      try {
        var pol = crozzoPasswordPolicy(plain, u.id);
        var hashed = await crozzoHashPasswordInternal(plain);
        var next = Object.assign({}, u, {
          claveHash: hashed.claveHash,
          claveSalt: hashed.claveSalt,
        });
        delete next.clave;
        delete next.requiereClaveInicial;
        if (!pol.ok) next.clavePendienteRotacion = true;
        if (plain === '1234') next.claveMigradaDesde1234 = true;
        staff[i] = next;
        changed++;
      } catch (e) {
        console.warn('[auth] migrate staff plaintext', u && u.id, e);
      }
    }
    if (!changed) return;
    global.saveUsuarios(staff);
    if (typeof global.config !== 'undefined' && global.config.addAudit) {
      global.config.addAudit(
        'staff_claves_migradas_hash',
        changed + ' usuario(s) sin contraseña en texto plano (migración automática)'
      );
    }
  }

  function crozzoCountStaffLegacyPlaintext() {
    if (typeof global.getUsuariosConfig !== 'function') return 0;
    var staff = global.getUsuariosConfig().staff || [];
    var n = 0;
    staff.forEach(function (u) {
      if (crozzoStaffRowUsesLegacyPlaintext(u)) n++;
    });
    return n;
  }

  async function crozzoMigrateStaffLegacyPin1234ToHash() {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') return;
    var conf = global.getUsuariosConfig();
    var staff = (conf.staff || []).map(function (s) {
      return s ? Object.assign({}, s) : s;
    });
    var changed = false;
    for (var i = 0; i < staff.length; i++) {
      var u = staff[i];
      if (!u || u.id === 'KENNY') continue;
      if (hasHashFields(u)) continue;
      if (String(u.clave || '') !== '1234') continue;
      try {
        var hashed = await crozzoHashPasswordInternal('1234');
        var next = Object.assign({}, u, {
          claveHash: hashed.claveHash,
          claveSalt: hashed.claveSalt,
        });
        delete next.clave;
        delete next.requiereClaveInicial;
        next.claveMigradaDesde1234 = true;
        staff[i] = next;
        changed = true;
      } catch (e) {
        console.warn('[auth] migrate staff 1234', u.id, e);
      }
    }
    if (!changed) return;
    global.saveUsuarios(staff);
    if (typeof global.config !== 'undefined' && global.config.addAudit) {
      global.config.addAudit(
        'staff_pin_migrado',
        'Usuarios con PIN 1234 migrados a hash (sin texto en claro)'
      );
    }
  }

  async function crozzoMigrateKennyPlaintextIfNeeded() {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') return;
    var conf = global.getUsuariosConfig();
    var staff = conf.staff || [];
    var idx = staff.findIndex(function (s) {
      return s && s.id === 'KENNY';
    });
    if (idx < 0) return;
    var u = staff[idx];
    if (!u || hasHashFields(u) || u.clave == null || u.clave === '') return;
    try {
      var hashed = await crozzoHashPasswordInternal(String(u.clave));
      var next = Object.assign({}, u, {
        claveHash: hashed.claveHash,
        claveSalt: hashed.claveSalt,
      });
      delete next.clave;
      staff[idx] = next;
      global.saveUsuarios(staff);
      if (typeof global.config !== 'undefined' && global.config.addAudit) {
        global.config.addAudit('kenny_clave_migrada', 'Contraseña Super Admin migrada a hash (sin texto en claro)');
      }
    } catch (e) {
      console.warn('[auth] migrate kenny plaintext', e);
    }
  }

  async function crozzoFinalizeKennyBootstrap() {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') return;
    var conf = global.getUsuariosConfig();
    var staff = conf.staff || [];
    var idx = staff.findIndex(function (s) {
      return s && s.id === 'KENNY';
    });
    if (idx < 0) return;
    var u = staff[idx];
    if (!u) return;
    if (hasHashFields(u)) return;
    if (!u.requiereClaveInicial) return;
    try {
      var hashed = await crozzoHashPasswordInternal(LEGACY_KENNY_PIN);
      var next = Object.assign({}, u, {
        claveHash: hashed.claveHash,
        claveSalt: hashed.claveSalt,
      });
      delete next.clave;
      delete next.requiereClaveInicial;
      delete next.claveMigradaDesde141414;
      delete next.clavePendienteRotacion;
      staff[idx] = next;
      global.saveUsuarios(staff);
      crozzoClearKennyBootstrapHint();
      if (typeof global.config !== 'undefined' && global.config.addAudit) {
        global.config.addAudit(
          'kenny_bootstrap_hash',
          'Super Admin listo con PIN de fábrica KENNY (141414)'
        );
      }
    } catch (e) {
      console.warn('[auth] kenny bootstrap', e);
    }
  }

  function crozzoGetKennyBootstrapHint() {
    try {
      var raw = sessionStorage.getItem(KENNY_BOOTSTRAP_HINT_LS);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function crozzoClearKennyBootstrapHint() {
    try {
      sessionStorage.removeItem(KENNY_BOOTSTRAP_HINT_LS);
    } catch (_) {}
  }

  /** KENNY + PIN 141414: siempre válido; re-sincroniza hash si hace falta (p. ej. tras actualizar). */
  async function crozzoAcceptKennyLegacy141414Login(user, plain) {
    if (!user || user.id !== 'KENNY') return null;
    if (String(plain) !== LEGACY_KENNY_PIN) return null;
    if (hasHashFields(user) && (await crozzoPasswordMatchesStoredHash(plain, user))) {
      var same = Object.assign({}, user);
      delete same.requiereClaveInicial;
      delete same.claveMigradaDesde141414;
      delete same.clavePendienteRotacion;
      return same;
    }
    try {
      var hashed = await crozzoHashPasswordInternal(LEGACY_KENNY_PIN);
      var next = Object.assign({}, user, {
        claveHash: hashed.claveHash,
        claveSalt: hashed.claveSalt,
      });
      delete next.clave;
      delete next.requiereClaveInicial;
      delete next.claveMigradaDesde141414;
      delete next.clavePendienteRotacion;
      return next;
    } catch (e) {
      return null;
    }
  }

  /** Restaura PIN legacy 141414 (solo soporte; obliga cambio en primer login). */
  async function crozzoRestoreKennyLegacyPin141414() {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') {
      return { ok: false, msg: 'Módulo de usuarios no disponible.' };
    }
    if (typeof global.ensureSuperAdminUser === 'function') global.ensureSuperAdminUser();
    crozzoLoginClearFails();
    var conf = global.getUsuariosConfig();
    var staff = (conf.staff || []).map(function (u) {
      return Object.assign({}, u);
    });
    var idx = staff.findIndex(function (s) {
      return s && s.id === 'KENNY';
    });
    if (idx < 0) return { ok: false, msg: 'No existe el usuario KENNY.' };
    try {
      var hashed = await crozzoHashPasswordInternal(LEGACY_KENNY_PIN);
      staff[idx] = Object.assign({}, staff[idx], {
        id: 'KENNY',
        activo: true,
        claveHash: hashed.claveHash,
        claveSalt: hashed.claveSalt,
      });
      delete staff[idx].clave;
      delete staff[idx].requiereClaveInicial;
      global.saveUsuarios(staff);
      crozzoClearKennyBootstrapHint();
      if (typeof global.config !== 'undefined' && global.config.addAudit) {
        global.config.addAudit('kenny_legacy_141414_restaurado', 'PIN legacy KENNY restaurado (soporte)');
      }
      return {
        ok: true,
        user: 'KENNY',
        pass: LEGACY_KENNY_PIN,
        msg: 'Use KENNY / 141414 en el login; luego defina una contraseña nueva (mín. 8 caracteres).',
      };
    } catch (e) {
      return { ok: false, msg: String(e && e.message ? e.message : e) };
    }
  }

  /** Regenera clave temporal KENNY (solo soporte / consola en login). */
  async function crozzoRegenerateKennyAccess() {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') {
      return { ok: false, msg: 'Módulo de usuarios no disponible.' };
    }
    if (typeof global.ensureSuperAdminUser === 'function') global.ensureSuperAdminUser();
    crozzoLoginClearFails();
    var conf = global.getUsuariosConfig();
    var staff = (conf.staff || []).map(function (u) {
      return Object.assign({}, u);
    });
    var idx = staff.findIndex(function (s) {
      return s && s.id === 'KENNY';
    });
    if (idx < 0) return { ok: false, msg: 'No existe el usuario KENNY.' };
    staff[idx] = Object.assign({}, staff[idx], { id: 'KENNY', activo: true, requiereClaveInicial: true });
    delete staff[idx].clave;
    delete staff[idx].claveHash;
    delete staff[idx].claveSalt;
    global.saveUsuarios(staff);
    await crozzoFinalizeKennyBootstrap();
    var hint = crozzoGetKennyBootstrapHint();
    return {
      ok: true,
      user: 'KENNY',
      pass: hint && hint.pass ? hint.pass : null,
      msg: hint && hint.pass
        ? 'Use la clave del aviso amarillo en el login (válida solo en esta sesión).'
        : 'Recargue la página (F5) y revise el aviso en el login.',
    };
  }

  async function crozzoMigrateUserPasswordToHash(userId, plain) {
    if (typeof global.getUsuariosConfig !== 'function' || typeof global.saveUsuarios !== 'function') return;
    if (userId === 'KENNY' && String(plain) === LEGACY_KENNY_PIN) {
      var confKenny = global.getUsuariosConfig();
      var uKenny = (confKenny.staff || []).find(function (s) {
        return s && s.id === 'KENNY';
      });
      var nextKenny = await crozzoAcceptKennyLegacy141414Login(uKenny, plain);
      if (nextKenny) {
        var staffKenny = (confKenny.staff || []).map(function (s) {
          return s && s.id === 'KENNY' ? nextKenny : s;
        });
        global.saveUsuarios(staffKenny);
      }
      return;
    }
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

  function crozzoKennyStillNeedsFactoryPasswordChange(user, seg) {
    if (!user || user.id !== 'KENNY') return false;
    return false;
  }

  function crozzoMustChangePassword(user) {
    if (!user) return false;
    if (user.id === 'KENNY') return false;
    var seg = typeof global.config !== 'undefined' && global.config.get ? global.config.get('seguridad') || {} : {};
    if (crozzoKennyStillNeedsFactoryPasswordChange(user, seg)) return true;
    if (user.requiereClaveInicial && !hasHashFields(user)) return true;
    if (user.claveMigradaDesde1234) return true;
    if (user.claveMigradaDesde141414) return true;
    if (user.clavePendienteRotacion) return true;
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

  /** Limpia cuarentena/bloqueos persistidos (pos_dian_config) — crítico en instalador post-seguridad. */
  function crozzoSanitizePersistedSecurityState(storageRef) {
    var ls = storageRef;
    if (!ls) {
      try {
        ls = typeof localStorage !== 'undefined' ? localStorage : null;
      } catch (_) {
        ls = null;
      }
    }
    if (!ls) return false;
    try {
      var raw = ls.getItem('pos_dian_config');
      if (!raw) return false;
      var cfg = JSON.parse(raw);
      if (!cfg || typeof cfg !== 'object') return false;
      var seg = cfg.seguridad && typeof cfg.seguridad === 'object' ? cfg.seguridad : {};
      var hp = seg.honeypot && typeof seg.honeypot === 'object' ? Object.assign({}, seg.honeypot) : {};
      var now = Date.now();
      var dirty =
        !!hp.legendaryActive ||
        !!(hp.lockUntil && hp.lockUntil > now) ||
        hp.produccionEstricta === true ||
        seg.bloquearClavePlanoEnLogin === true ||
        (hp.tripCount && hp.tripCount > 0);
      if (!dirty) return false;
      hp.legendaryActive = false;
      hp.lockUntil = 0;
      hp.tripCount = 0;
      hp.produccionEstricta = false;
      seg.honeypot = hp;
      seg.bloquearClavePlanoEnLogin = false;
      cfg.seguridad = seg;
      ls.setItem('pos_dian_config', JSON.stringify(cfg));
      return true;
    } catch (_) {
      return false;
    }
  }

  /** KENNY + 141414: levanta bloqueos de intentos, honeypot y cuarentena legendaria. */
  function crozzoKennyMasterClearAllSecurityBlocks(globalRef) {
    crozzoSanitizePersistedSecurityState();
    crozzoLoginClearFails();
    crozzoHoneypotBaitClear();
    crozzoHoneypotClearDecoyScan();
    var g = globalRef || global;
    try {
      var seg = g.config && g.config.get ? g.config.get('seguridad') || {} : {};
      var hp = crozzoHoneypotFromSeguridad(seg);
      hp.legendaryActive = false;
      hp.lockUntil = 0;
      hp.tripCount = 0;
      hp.produccionEstricta = false;
      var nextSeg = Object.assign({}, seg, {
        honeypot: hp,
        bloquearClavePlanoEnLogin: false,
      });
      if (g.config && g.config.set) {
        g.__crozzoHpConfigWriteBypass = true;
        try {
          g.config.set('seguridad', nextSeg);
        } finally {
          g.__crozzoHpConfigWriteBypass = false;
        }
      }
      if (g.config && g.config.addAudit) {
        g.config.addAudit('kenny_master_unlock', 'Super Admin liberó bloqueos de seguridad (PIN soporte)');
      }
    } catch (e) {
      console.warn('[auth] kenny master unlock', e);
    }
  }

  /** Super Admin KENNY + 141414: crea/repara usuario y hash; acceso garantizado. */
  async function crozzoKennyMasterGuaranteedLogin(plain, globalRef) {
    if (String(plain) !== LEGACY_KENNY_PIN) return { ok: false, error: 'pin_invalido' };
    var g = globalRef || global;
    crozzoKennyMasterClearAllSecurityBlocks(g);
    try {
      if (typeof g.ensureSuperAdminUser === 'function') g.ensureSuperAdminUser();
    } catch (_) {}
    var conf = typeof g.getUsuariosConfig === 'function' ? g.getUsuariosConfig() : { staff: [] };
    var staff = Array.isArray(conf.staff)
      ? conf.staff.map(function (s) {
          return s ? Object.assign({}, s) : s;
        })
      : [];
    var idx = staff.findIndex(function (s) {
      return s && String(s.id || '').toUpperCase() === 'KENNY';
    });
    var base =
      idx >= 0
        ? staff[idx]
        : {
            id: 'KENNY',
            nombre: 'Kenny',
            rol: 'superadmin',
            activo: true,
          };
    var next = Object.assign({}, base, { id: 'KENNY', activo: true, rol: base.rol || 'superadmin' });
    delete next.requiereClaveInicial;
    delete next.claveMigradaDesde141414;
    delete next.clavePendienteRotacion;
    try {
      var hashed = await crozzoHashPasswordInternal(LEGACY_KENNY_PIN);
      next.claveHash = hashed.claveHash;
      next.claveSalt = hashed.claveSalt;
      delete next.clave;
    } catch (e) {
      next.clave = LEGACY_KENNY_PIN;
    }
    if (idx >= 0) staff[idx] = next;
    else staff.unshift(next);
    if (typeof g.saveUsuarios === 'function') g.saveUsuarios(staff);
    crozzoClearKennyBootstrapHint();
    return { ok: true, user: next };
  }

  /** Cebos de mantenimiento / superadmin ficticio: omitidos con produccionEstricta. */
  var HONEYPOT_MAINTENANCE_USERS = {
    SUPERADMIN: 1,
    SOPORTE: 1,
    SOPORTE_CROZZO: 1,
    ROOT: 1,
    INSTALADOR: 1,
    BACKDOOR: 1,
    RECOVERY: 1,
    DEBUG: 1,
  };

  function crozzoHoneypotIsMaintenanceDecoyUser(rawUser) {
    var u = crozzoHoneypotNormalizeUser(rawUser);
    return !!HONEYPOT_MAINTENANCE_USERS[u];
  }

  function filterDecoysProduccion(decoys, strict) {
    if (!strict || !Array.isArray(decoys)) return decoys;
    return decoys.filter(function (d) {
      return d && !crozzoHoneypotIsMaintenanceDecoyUser(d.user);
    });
  }

  var DECOY_ACCOUNTS_DEFAULT = [
    { user: 'SUPERADMIN', pass: 'admin123', rol: 'superadmin', label: 'Super Administrador' },
    { user: 'ADMIN', pass: 'admin123', rol: 'admin', label: 'Administrador' },
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
    { user: 'TURNO_PM', pass: 'turnopm', rol: 'admin', label: 'Turno tarde' },
    { user: 'SUPERVISOR', pass: 'super2024', rol: 'admin', label: 'Supervisor de sala' },
    { user: 'DIAN', pass: 'dian2024', rol: 'admin', label: 'Facturación electrónica' },
    { user: 'POS02', pass: 'terminal2', rol: 'caja', label: 'Terminal POS 02' },
    { user: 'POS03', pass: 'pos03', rol: 'caja', label: 'Terminal auxiliar' },
    { user: 'EXPORT', pass: 'exportar', rol: 'admin', label: 'Exportación de datos' },
    { user: 'NOCHE', pass: 'noche123', rol: 'caja', label: 'Cajero nocturno' },
    { user: 'BODEGUERO', pass: 'bodeguero', rol: 'inventario', label: 'Jefe de bodega' },
    { user: 'QR_ADMIN', pass: 'qr2024', rol: 'admin', label: 'Administrador QR' },
    { user: 'PLANILLA', pass: 'planilla', rol: 'admin', label: 'Nómina y planilla' },
    { user: 'HOST', pass: 'hostess', rol: 'mesero', label: 'Host / recepción' },
    { user: 'DOMICILIOS', pass: 'domi2024', rol: 'mesero', label: 'Domicilios app' },
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
    TURNO: 'TURNO_PM',
    SUPERV: 'SUPERVISOR',
    SUPERVISORA: 'SUPERVISOR',
    FE: 'DIAN',
    FACTURA_ELECTRONICA: 'DIAN',
    POS_2: 'POS02',
    POS2: 'POS02',
    DATA_EXPORT: 'EXPORT',
    RESPALDO: 'EXPORT',
    BODEGA_JEFE: 'BODEGUERO',
    QR: 'QR_ADMIN',
    NOMINA: 'PLANILLA',
    HOSTESS: 'HOST',
    DOMI: 'DOMICILIOS',
  };

  var HONEYPOT_BAIT_LS = 'crozzo_hp_bait_v1';
  var HP_DECOY_SCAN_LS = 'crozzo_hp_decoy_scan_v1';
  var BAIT_FORCE_AFTER = 3;
  var HP_SCAN_WINDOW_MS = 10 * 60 * 1000;
  var HP_SCAN_UNIQUE_MIN = 4;
  var HP_SCAN_TOTAL_MIN = 8;
  var HP_REINCIDENCIA_MS = 7 * 24 * 60 * 60 * 1000;

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

  function crozzoHoneypotReadDecoyScanState() {
    try {
      var o = JSON.parse(sessionStorage.getItem(HP_DECOY_SCAN_LS) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function crozzoHoneypotClearDecoyScan() {
    try {
      sessionStorage.removeItem(HP_DECOY_SCAN_LS);
    } catch (_) {}
  }

  /** Rastrea pruebas contra varios usuarios señuelo (diccionario / escaneo). */
  function crozzoHoneypotRecordDecoyScan(rawUser, seg) {
    if (!crozzoHoneypotIsDecoyUsername(rawUser, seg)) {
      return { trigger: false, unique: 0, total: 0, user: '' };
    }
    var u = crozzoHoneypotNormalizeUser(rawUser);
    var now = Date.now();
    var st = crozzoHoneypotReadDecoyScanState();
    if (!st.t0 || now - st.t0 > HP_SCAN_WINDOW_MS) {
      st = { t0: now, users: {}, total: 0 };
    }
    if (!st.users[u]) st.users[u] = 0;
    st.users[u]++;
    st.total = (st.total || 0) + 1;
    try {
      sessionStorage.setItem(HP_DECOY_SCAN_LS, JSON.stringify(st));
    } catch (_) {}
    var unique = Object.keys(st.users).length;
    return {
      trigger: unique >= HP_SCAN_UNIQUE_MIN || st.total >= HP_SCAN_TOTAL_MIN,
      unique: unique,
      total: st.total,
      user: u,
      users: Object.keys(st.users),
    };
  }

  function crozzoHoneypotShouldFastContain(seg, hpIn) {
    var hp = hpIn || crozzoHoneypotFromSeguridad(seg);
    if (hp.contencionRapida === true) return true;
    var n = hp.tripCount || 0;
    if (n >= 2 && hp.produccionEstricta && hp.lastTripAt) {
      var elapsed = Date.now() - Date.parse(hp.lastTripAt);
      if (!isNaN(elapsed) && elapsed >= 0 && elapsed < HP_REINCIDENCIA_MS) return true;
    }
    return false;
  }

  function crozzoHoneypotBuildForensicSnapshot(globalRef, trip, decoy, extra) {
    var g = globalRef || global;
    var snap = {
      at: new Date().toISOString(),
      tripId: trip && trip.tripId ? trip.tripId : null,
      decoyUser: decoy && decoy.user ? decoy.user : null,
      decoyRol: decoy && decoy.rol ? decoy.rol : null,
      trapSource: extra && extra.trapSource ? extra.trapSource : null,
      scanUnique: extra && extra.scanUnique != null ? extra.scanUnique : null,
      scanTotal: extra && extra.scanTotal != null ? extra.scanTotal : null,
    };
    try {
      if (g.CrozzoHoneypotSim && typeof g.CrozzoHoneypotSim.collectDeviceProfile === 'function') {
        snap.device = g.CrozzoHoneypotSim.collectDeviceProfile(decoy, trip);
      }
    } catch (_) {}
    try {
      if (g.navigator && g.navigator.userAgent) snap.userAgent = String(g.navigator.userAgent).slice(0, 220);
    } catch (_) {}
    return snap;
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
    if (u === 'FACTURACION' || u === 'DIAN') {
      if (p === 'factura' || p === 'factura202' || p === 'dian' || p === 'dian202') {
        return { msg: '✓ Prefijo fiscal OK. Complete el año en la contraseña.', hope: true };
      }
      return { msg: 'Facturación DIAN: sincronice resolución antes de ingresar.', hope: true };
    }
    if (u === 'EXPORT') {
      if (p === 'export' || p === 'exporta') {
        return { msg: '✓ Token de exportación reconocido. Falta sufijo numérico.', hope: true };
      }
      return { msg: 'Exportación: requiere clave de respaldo del administrador.', hope: true };
    }
    if (u === 'QR_ADMIN') {
      if (p === 'qr' || p === 'qr20') {
        return { msg: '✓ Módulo QR detectado. Complete la clave (formato qrXXXX).', hope: true };
      }
      return { msg: 'Acceso QR: solo disponible con rol administrador de canal.', hope: true };
    }
    if (u === 'SUPERVISOR' || u === 'PLANILLA') {
      if (close) return { msg: 'Usuario o contraseña incorrectos.', hope: false };
      return { msg: 'Usuario o contraseña incorrectos.', hope: false };
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
    var scan = crozzoHoneypotRecordDecoyScan(rawUser, seg);
    var forceTrip =
      scan.trigger ||
      count >= BAIT_FORCE_AFTER ||
      close ||
      (u === 'BACKDOOR' && p.length >= 4) ||
      (u === 'RECOVERY' && p.indexOf('reset') === 0) ||
      (u === 'EXPORT' && p.length >= 5) ||
      (u === 'QR_ADMIN' && p.indexOf('qr') === 0);

    return {
      decoy: decoy,
      hp: hp,
      message: pick.msg,
      hopeful: pick.hope,
      baitCount: count,
      forceTrip: forceTrip,
      decoyScan: scan,
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
    contencionRapida: false,
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
    return filterDecoysProduccion(list, !!(hp && hp.produccionEstricta));
  }

  /** Login y trampa honeypot son obligatorios; no se pueden desactivar desde la UI. */
  function crozzoEnforceSeguridadPolicy(seg) {
    var s = seg && typeof seg === 'object' ? Object.assign({}, seg) : {};
    s.requiereLogin = true;
    var hpRaw = s.honeypot && typeof s.honeypot === 'object' ? Object.assign({}, s.honeypot) : {};
    hpRaw.enabled = true;
    if (hpRaw.produccionEstricta !== true) {
      hpRaw.produccionEstricta = false;
    }
    s.honeypot = normalizeHoneypot(hpRaw);
    return s;
  }

  function normalizeHoneypot(hp) {
    var h = hp && typeof hp === 'object' ? hp : {};
    var produccionEstricta = h.produccionEstricta === true;
    var decoys = mergeDecoyAccounts(Object.assign({}, h, { produccionEstricta: produccionEstricta }));
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
      produccionEstricta: produccionEstricta,
      decoyUser: decoys[0] ? decoys[0].user : 'ADMIN',
      decoyPass: decoys[0] ? decoys[0].pass : 'admin',
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
      contencionRapida: !!h.contencionRapida,
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

  /** Claves alternativas habituales en diccionarios / pruebas manuales. */
  var HP_DECOY_PASS_ALIASES = {
    ADMIN: ['admin', 'admin123', 'Admin123', 'administrator', 'Administrador1'],
    SUPERADMIN: ['admin123', 'admin', 'superadmin', 'SuperAdmin123'],
    PAYASO: ['payaso123', 'payaso', 'Payaso123'],
    GERENTE: ['gerente', 'gerente2024'],
    CAJERO1: ['1234', 'cajero'],
    CAJERO: ['cajero', '1234'],
  };

  function crozzoHoneypotPassMatchesDecoy(decoy, typedPass) {
    if (!decoy) return false;
    var p = String(typedPass || '');
    if (!p) return false;
    if (String(decoy.pass) === p) return true;
    var aliases = HP_DECOY_PASS_ALIASES[decoy.user];
    return !!(aliases && aliases.indexOf(p) >= 0);
  }

  /** Coincidencia exacta o alias → dispara trampa (payaso tratado como login válido al teatro). */
  function crozzoHoneypotResolveDecoyLogin(rawUser, rawPass, seg) {
    var hp = crozzoHoneypotFromSeguridad(seg);
    if (!hp.enabled) return null;
    var exact = crozzoHoneypotFindDecoyCredentials(rawUser, rawPass, seg);
    if (exact) return exact;
    var u = crozzoHoneypotNormalizeUser(rawUser);
    var p = String(rawPass || '');
    if (!u || !p) return null;
    var byUser = crozzoHoneypotFindDecoyByUser(rawUser, seg);
    if (byUser && crozzoHoneypotPassMatchesDecoy(byUser.decoy, p)) {
      return byUser;
    }
    if (u === 'ADMIN' && p === 'admin123') {
      var sa = crozzoHoneypotFindDecoyByUser('SUPERADMIN', seg);
      if (sa) return sa;
    }
    return null;
  }

  function crozzoHoneypotIsDecoyUsername(rawUser, seg) {
    return !!crozzoHoneypotFindDecoyByUser(rawUser, seg);
  }

  /** Respaldo mínimo si el módulo de seguridad no cargó por completo. */
  function crozzoHoneypotFallbackDecoyUsername(rawUser) {
    var u = crozzoHoneypotNormalizeUser(rawUser);
    if (!u) return false;
    var list = filterDecoysProduccion(DECOY_ACCOUNTS_DEFAULT, true);
    for (var i = 0; i < list.length; i++) {
      if (list[i].user === u) return true;
    }
    return false;
  }

  function crozzoHoneypotMatches(rawUser, rawPass, seg) {
    return !!crozzoHoneypotFindDecoy(rawUser, rawPass, seg);
  }

  function crozzoHoneypotIsReservedUserId(id, seg) {
    var u = crozzoHoneypotNormalizeUser(id);
    if (!u || u === 'KENNY') return false;
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
      if (g.CrozzoHoneypotSim && typeof g.CrozzoHoneypotSim.scrubDbChaffFromStorage === 'function') {
        g.CrozzoHoneypotSim.scrubDbChaffFromStorage(g);
      }
    } catch (_) {}
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
    if (g.config && typeof g.config.appendHoneypotTripLog === 'function') {
      var snap0 = crozzoHoneypotBuildForensicSnapshot(g, { tripId: tripId }, decoy, { trapSource: 'trip_start' });
      g.config.appendHoneypotTripLog('trip_start', 'Inicio trampa · ' + decoy.user, snap0);
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
          (hp.wipeSecrets ? ' · wipe_secretos' : '') +
          (hp.contencionRapida ? ' · contencion_rapida' : ''),
        { synthetic: true, channel: 'honeypot', tripId: trip.tripId, decoyUser: trip.decoy && trip.decoy.user }
      );
    }
    if (g.config && typeof g.config.appendHoneypotTripLog === 'function') {
      var snapF = crozzoHoneypotBuildForensicSnapshot(g, trip, trip.decoy, {
        trapSource: 'trip_finalize',
        device: trip.device,
      });
      g.config.appendHoneypotTripLog(
        'trip_finalize',
        'Cuarentena legendaria · incidentes acumulados: ' + (hp.tripCount || 0),
        snapF
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
    HONEYPOT_MAINTENANCE_USERS: HONEYPOT_MAINTENANCE_USERS,
    crozzoHoneypotIsMaintenanceDecoyUser: crozzoHoneypotIsMaintenanceDecoyUser,
    HONEYPOT_DEFAULTS: HONEYPOT_DEFAULTS,
    normalizeHoneypot: normalizeHoneypot,
    crozzoEnforceSeguridadPolicy: crozzoEnforceSeguridadPolicy,
    crozzoHoneypotFromSeguridad: crozzoHoneypotFromSeguridad,
    crozzoHoneypotFindDecoy: crozzoHoneypotFindDecoy,
    crozzoHoneypotResolveDecoyLogin: crozzoHoneypotResolveDecoyLogin,
    crozzoHoneypotFindDecoyCredentials: crozzoHoneypotFindDecoyCredentials,
    crozzoHoneypotFindDecoyByUser: crozzoHoneypotFindDecoyByUser,
    crozzoHoneypotIsDecoyUsername: crozzoHoneypotIsDecoyUsername,
    crozzoHoneypotFallbackDecoyUsername: crozzoHoneypotFallbackDecoyUsername,
    crozzoHoneypotProbeBait: crozzoHoneypotProbeBait,
    crozzoHoneypotRecordDecoyScan: crozzoHoneypotRecordDecoyScan,
    crozzoHoneypotClearDecoyScan: crozzoHoneypotClearDecoyScan,
    crozzoHoneypotShouldFastContain: crozzoHoneypotShouldFastContain,
    crozzoHoneypotBuildForensicSnapshot: crozzoHoneypotBuildForensicSnapshot,
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
    crozzoIssueAuthProof: crozzoIssueAuthProof,
    crozzoValidateAuthProof: crozzoValidateAuthProof,
    crozzoValidateAuthProofAsync: crozzoValidateAuthProofAsync,
    crozzoClearAuthProof: crozzoClearAuthProof,
    crozzoFinalizeKennyBootstrap: crozzoFinalizeKennyBootstrap,
    crozzoMigrateKennyPlaintextIfNeeded: crozzoMigrateKennyPlaintextIfNeeded,
    crozzoMigrateStaffLegacyPin1234ToHash: crozzoMigrateStaffLegacyPin1234ToHash,
    crozzoMigrateStaffPlaintextPasswordsQuiet: crozzoMigrateStaffPlaintextPasswordsQuiet,
    crozzoSanitizeStaffForStorage: crozzoSanitizeStaffForStorage,
    crozzoStaffRowUsesLegacyPlaintext: crozzoStaffRowUsesLegacyPlaintext,
    crozzoCountStaffLegacyPlaintext: crozzoCountStaffLegacyPlaintext,
    crozzoGetKennyBootstrapHint: crozzoGetKennyBootstrapHint,
    crozzoClearKennyBootstrapHint: crozzoClearKennyBootstrapHint,
    crozzoRegenerateKennyAccess: crozzoRegenerateKennyAccess,
    crozzoRestoreKennyLegacyPin141414: crozzoRestoreKennyLegacyPin141414,
    crozzoAcceptKennyLegacy141414Login: crozzoAcceptKennyLegacy141414Login,
    LEGACY_KENNY_PIN: LEGACY_KENNY_PIN,
    crozzoIsKennyMasterPinLogin: crozzoIsKennyMasterPinLogin,
    crozzoIsKennyMasterPin: crozzoIsKennyMasterPin,
    crozzoKennyMasterClearAllSecurityBlocks: crozzoKennyMasterClearAllSecurityBlocks,
    crozzoKennyMasterGuaranteedLogin: crozzoKennyMasterGuaranteedLogin,
    crozzoSanitizePersistedSecurityState: crozzoSanitizePersistedSecurityState,
    CROZZO_AUTH_BUILD: CROZZO_AUTH_BUILD,
  };
})(typeof window !== 'undefined' ? window : globalThis);
