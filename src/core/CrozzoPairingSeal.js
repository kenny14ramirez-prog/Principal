/**
 * Emparejamiento BONA origen — QR cifrado (solo la app descifra).
 * Escáneres genéricos abren la URL pública de instalación; el fragmento #BO1… no viaja al servidor.
 */
(function (global) {
  'use strict';

  var PAIR_INSTALL_URL = 'https://bonaorigen.app/instalar';
  var PAIR_SCHEME = 'bonaorigen://pair';
  var PAIR_BLOB_PREFIX = 'BO1.';
  /** QR compacto de enlace rápido (sin cifrado, menos módulos → lectura más veloz). */
  var PAIR_FAST_PREFIX = 'BOF.';
  var PAIR_KDF_SALT = new TextEncoder().encode('bona-origen-pair-v1');
  // P0-25 Fase 1: migración a ECDH P-256 (Web Crypto) por instalación.
  // Genera par de claves efímeras por QR + identidad de hub firmada.
  // Reemplaza el secreto estático 'CrozzoBonaOrigenPairSeal2026'.
  var PAIR_KEY_LS = 'crozzo_pairing_ecdh_priv_v1';
  var PAIR_PUB_LS = 'crozzo_pairing_ecdh_pub_v1';
  var PAIR_SIGN_PRIV_LS = 'crozzo_pairing_sign_priv_v1';
  var PAIR_SIGN_PUB_LS = 'crozzo_pairing_sign_pub_v1';
  var _ecdhKeyPromise = null;
  var _signKeyPromise = null;

  function crozzoPairingGetOrCreateEcdhKeys() {
    if (_ecdhKeyPromise) return _ecdhKeyPromise;
    _ecdhKeyPromise = (async function () {
      try {
        if (typeof localStorage !== 'undefined') {
          var privB64 = localStorage.getItem(PAIR_KEY_LS);
          var pubB64 = localStorage.getItem(PAIR_PUB_LS);
          if (privB64 && pubB64) {
            var privRaw = Uint8Array.from(atob(privB64), function (c) { return c.charCodeAt(0); });
            var pubRaw = Uint8Array.from(atob(pubB64), function (c) { return c.charCodeAt(0); });
            var privKey = await crypto.subtle.importKey('pkcs8', privRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
            var pubKey = await crypto.subtle.importKey('raw', pubRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
            return { privateKey: privKey, publicKey: pubKey, publicKeyRaw: pubRaw };
          }
        }
        var kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
        var pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey);
        var privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
        var pubB64n = btoa(String.fromCharCode.apply(null, new Uint8Array(pubRaw)));
        var privB64n = btoa(String.fromCharCode.apply(null, new Uint8Array(privRaw)));
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(PAIR_KEY_LS, privB64n);
          localStorage.setItem(PAIR_PUB_LS, pubB64n);
        }
        return { privateKey: kp.privateKey, publicKey: kp.publicKey, publicKeyRaw: new Uint8Array(pubRaw) };
      } catch (_) {
        return null;
      }
    })();
    return _ecdhKeyPromise;
  }

  // P0-25 Fase 2: par de firma ECDSA P-256 para firmar/verificar QRs.
  function crozzoPairingGetOrCreateSignKeys() {
    if (_signKeyPromise) return _signKeyPromise;
    _signKeyPromise = (async function () {
      try {
        if (typeof localStorage !== 'undefined') {
          var privB64 = localStorage.getItem(PAIR_SIGN_PRIV_LS);
          var pubB64 = localStorage.getItem(PAIR_SIGN_PUB_LS);
          if (privB64 && pubB64) {
            var privRaw = Uint8Array.from(atob(privB64), function (c) { return c.charCodeAt(0); });
            var pubRaw = Uint8Array.from(atob(pubB64), function (c) { return c.charCodeAt(0); });
            var privKey = await crypto.subtle.importKey('pkcs8', privRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
            var pubKey = await crypto.subtle.importKey('spki', pubRaw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
            return { privateKey: privKey, publicKey: pubKey, publicKeyRaw: pubRaw };
          }
        }
        var kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        var pubRaw = await crypto.subtle.exportKey('spki', kp.publicKey);
        var privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
        var pubB64n = btoa(String.fromCharCode.apply(null, new Uint8Array(pubRaw)));
        var privB64n = btoa(String.fromCharCode.apply(null, new Uint8Array(privRaw)));
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(PAIR_SIGN_PRIV_LS, privB64n);
          localStorage.setItem(PAIR_SIGN_PUB_LS, pubB64n);
        }
        return { privateKey: kp.privateKey, publicKey: kp.publicKey, publicKeyRaw: new Uint8Array(pubRaw) };
      } catch (_) {
        return null;
      }
    })();
    return _signKeyPromise;
  }

  // Firmar payload de emparejamiento (P0-25 Fase 2)
  async function crozzoPairingSignPayload(payload) {
    try {
      var keys = await crozzoPairingGetOrCreateSignKeys();
      if (!keys) return null;
      var data = new TextEncoder().encode(JSON.stringify(payload));
      var sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, data);
      var sigB64 = btoa(String.fromCharCode.apply(null, new Uint8Array(sig)));
      var pubB64 = btoa(String.fromCharCode.apply(null, keys.publicKeyRaw));
      return { v: 5, payload: payload, sig: sigB64, pub: pubB64, ts: Date.now() };
    } catch (_) {
      return null;
    }
  }

  // Verificar payload firmado (P0-25 Fase 2)
  async function crozzoPairingVerifyPayload(signed) {
    try {
      if (!signed || !signed.sig || !signed.pub || !signed.payload) return null;
      // Expiración estricta: 24h
      if (signed.ts && (Date.now() - signed.ts) > 24 * 60 * 60 * 1000) return null;
      var pubRaw = Uint8Array.from(atob(signed.pub), function (c) { return c.charCodeAt(0); });
      var pubKey = await crypto.subtle.importKey('spki', pubRaw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
      var data = new TextEncoder().encode(JSON.stringify(signed.payload));
      var sig = Uint8Array.from(atob(signed.sig), function (c) { return c.charCodeAt(0); });
      var ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, data);
      if (!ok) return null;
      return signed.payload;
    } catch (_) {
      return null;
    }
  }

  // Fallback legacy (solo para compatibilidad de lectura, se elimina en F6)
  function crozzoPairingGetInstallPass() {
    try {
      var k = 'crozzo_pairing_install_pass_v1';
      var v = (typeof localStorage !== 'undefined') ? localStorage.getItem(k) : null;
      if (!v) {
        var bytes = new Uint8Array(32);
        if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(bytes);
        else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        v = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
      }
      return v;
    } catch (_) {
      return 'CrozzoBonaOrigenPairSeal2026';
    }
  }
  var PAIR_KDF_PASS = crozzoPairingGetInstallPass();
  var _keyPromise = null;

  function base64UrlEncode(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlDecode(str) {
    var b = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveKey() {
    if (!global.crypto || !global.crypto.subtle) {
      return Promise.reject(new Error('Web Crypto no disponible'));
    }
    if (!_keyPromise) {
      _keyPromise = global.crypto.subtle
        .importKey('raw', new TextEncoder().encode(PAIR_KDF_PASS), { name: 'PBKDF2' }, false, ['deriveKey'])
        .then(function (km) {
          return global.crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: PAIR_KDF_SALT, iterations: 100000, hash: 'SHA-256' },
            km,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );
        });
    }
    return _keyPromise;
  }

  function sealPayload(payloadObj) {
    return deriveKey().then(function (key) {
      var json = JSON.stringify(payloadObj);
      var iv = global.crypto.getRandomValues(new Uint8Array(12));
      return global.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(json)).then(function (ct) {
        var combined = new Uint8Array(iv.length + ct.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ct), iv.length);
        return PAIR_BLOB_PREFIX + base64UrlEncode(combined);
      });
    });
  }

  function extractBlobFromQr(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var hashIdx = t.indexOf('#');
    if (hashIdx >= 0) {
      var frag = t.slice(hashIdx + 1);
      if (frag.indexOf(PAIR_BLOB_PREFIX) === 0) return frag;
    }
    if (t.indexOf(PAIR_BLOB_PREFIX) === 0) return t;
    if (t.indexOf(PAIR_SCHEME) === 0 && hashIdx >= 0) {
      var inner = t.slice(hashIdx + 1);
      if (inner.indexOf(PAIR_BLOB_PREFIX) === 0) return inner;
    }
    return null;
  }

  /** Extrae BOF.… desde URL de instalación, deep link o texto pegado (case-insensitive). */
  function extractFastFromQr(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var m = t.match(/BOF\.[A-Za-z0-9_-]+/i);
    if (!m) return null;
    return m[0];
  }

  function isPairingQr(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    return (
      t.indexOf(PAIR_FAST_PREFIX) >= 0 ||
      t.indexOf(PAIR_BLOB_PREFIX) >= 0 ||
      t.indexOf(PAIR_INSTALL_URL) === 0 ||
      t.indexOf(PAIR_SCHEME) === 0
    );
  }

  /** Texto QR compacto: LAN + perfil + credenciales Supabase (anon key es pública). */
  function buildFastQrText(payloadObj) {
    var p = payloadObj || {};
    var lan = p.lan || {};
    var ip = String(lan.central_ip || lan.server_ip || p.central_ip || '').trim();
    var port = Math.max(1, Number(lan.port || p.port) || 3000);
    var compact = {
      t: 'C',
      v: 4,
      f: 1,
      tp: String(p.target_profile || 'tablet').toLowerCase(),
      ip: ip,
      p: port,
      loc: String(p.location_id || (p.network_primary && p.network_primary.location_id) || '').trim(),
      ss: String((p.network_primary && p.network_primary.ssid_note) || p.network_ssid || '').trim().slice(0, 80),
      ts: Number(p.timestamp) || Date.now(),
      k: String((lan && lan.lan_token) || p.lan_token || '').trim().slice(0, 96),
    };
    var bid = String(p.business_id || p.businessId || '').trim();
    var bn = String(p.business_name || p.businessName || '').trim();
    if (bid) compact.bid = bid.slice(0, 64);
    if (bn) compact.bn = bn.slice(0, 48);
    if (p.pantalla_area_id) compact.pa = String(p.pantalla_area_id).trim().slice(0, 48);
    if (p.device_id) compact.did = String(p.device_id).trim().slice(0, 64);
    if (p.device_role) compact.dr = String(p.device_role).trim().slice(0, 1);
    if (p.device_name) compact.dn = String(p.device_name).trim().slice(0, 48);
    /* Hint de flota: peers recientes de la sede (compacto) para que el nuevo sepa a quién buscar. */
    try {
      var fp =
        Array.isArray(p.fleet_peers) && p.fleet_peers.length
          ? p.fleet_peers
          : typeof window !== 'undefined' &&
              window.CrozzoPeerDirectory &&
              typeof window.CrozzoPeerDirectory.peersForQrHint === 'function'
            ? window.CrozzoPeerDirectory.peersForQrHint(5)
            : [];
      if (fp && fp.length) {
        compact.fp = fp.slice(0, 5).map(function (x) {
          return {
            d: String((x && (x.d || x.deviceId)) || '').slice(0, 36),
            n: String((x && (x.n || x.name)) || '').slice(0, 18),
            r: String((x && (x.r || x.role)) || 'B').slice(0, 1),
            ip: String((x && (x.ip || x.lanIp)) || '').slice(0, 32),
          };
        });
      }
    } catch (_) {}
    if (p.cloud_sync !== false) {
      var su = String(p.supabase_url || '').trim();
      var sk = String(p.supabase_key || '').trim();
      if (su && sk) {
        compact.cb = 1;
        compact.su = su;
        compact.sk = sk;
      }
    }
    return PAIR_FAST_PREFIX + base64UrlEncode(new TextEncoder().encode(JSON.stringify(compact)));
  }

  function expandFastPayload(compact) {
    if (!compact || typeof compact !== 'object') return null;
    var ip = String(compact.ip || '').trim();
    if (!ip) return null;
    var port = Math.max(1, Number(compact.p) || 3000);
    var tp = String(compact.tp || 'tablet').toLowerCase();
    if (tp !== 'tablet' && tp !== 'pantalla') tp = 'tablet';
    var cloudOn = !!(compact.cb && compact.su && compact.sk);
    var bid = String(compact.bid || '').trim();
    var bn = String(compact.bn || '').trim();
    return {
      type: 'CROZZO_CLOUD_PAIRING',
      version: 4,
      fast: 1,
      target_profile: tp,
      business_id: bid,
      business_name: bn,
      businessId: bid,
      businessName: bn,
      cloud_sync: cloudOn,
      supabase_url: cloudOn ? String(compact.su || '').trim() : '',
      supabase_key: cloudOn ? String(compact.sk || '').trim() : '',
      sync_priority: 'hybrid',
      network_primary: { ssid_note: String(compact.ss || '').trim(), location_id: String(compact.loc || '').trim() },
      lan: {
        lan_sync_enabled: true,
        role: 'B',
        server_ip: ip,
        central_ip: ip,
        port: port,
        allow_lan: true,
        offline_enabled: true,
        cloud_priority: true,
        lan_token: String(compact.k || '').trim(),
      },
      location_id: String(compact.loc || '').trim(),
      network_ssid: String(compact.ss || '').trim(),
      pantalla_area_id: String(compact.pa || '').trim(),
      role: 'B',
      device_id: String(compact.did || '').trim(),
      device_role: String(compact.dr || '').trim(),
      device_name: String(compact.dn || '').trim(),
      fleet_peers: Array.isArray(compact.fp) ? compact.fp : [],
      timestamp: Number(compact.ts) || Date.now(),
    };
  }

  function parseFastQr(text) {
    var blob = extractFastFromQr(text);
    if (!blob) {
      var t = String(text || '').trim();
      if (t.indexOf(PAIR_FAST_PREFIX) !== 0) return null;
      blob = t;
    }
    var prefixMatch = blob.match(/^BOF\./i);
    if (!prefixMatch) return null;
    try {
      var raw = base64UrlDecode(blob.slice(prefixMatch[0].length));
      var compact = JSON.parse(new TextDecoder().decode(raw));
      // P0-25 Fase 3: version check. Aceptar v:4 (legacy, deprecado) y v:5 (verificado).
      var v = Number(compact && compact.v) || 4;
      if (v < 4) return null; // rechazar versiones antiguas
      if (v === 5) {
        // v:5 debe tener firma; verificar de forma síncrona no es posible (async).
        // Se marca como 'signed' para que el caller verifique con verifyPayload.
        compact._signed = true;
      } else {
        compact._legacy = true;
      }
      return expandFastPayload(compact);
    } catch (_) {
      return null;
    }
  }

  function unsealFromQr(text) {
    var fast = parseFastQr(text);
    if (fast) return Promise.resolve(fast);
    var blob = extractBlobFromQr(text);
    if (!blob || !global.crypto || !global.crypto.subtle) return Promise.resolve(null);
    return deriveKey()
      .then(function (key) {
        var raw = base64UrlDecode(blob.slice(PAIR_BLOB_PREFIX.length));
        if (raw.length < 13) return null;
        var iv = raw.slice(0, 12);
        var data = raw.slice(12);
        return global.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
      })
      .then(function (plain) {
        if (!plain) return null;
        return JSON.parse(new TextDecoder().decode(plain));
      })
      .catch(function () {
        return null;
      });
  }

  global.CrozzoPairingSeal = {
    PAIR_INSTALL_URL: PAIR_INSTALL_URL,
    PAIR_SCHEME: PAIR_SCHEME,
    PAIR_BLOB_PREFIX: PAIR_BLOB_PREFIX,
    PAIR_FAST_PREFIX: PAIR_FAST_PREFIX,
    sealPayload: sealPayload,
    buildFastQrText: buildFastQrText,
    parseFastQr: parseFastQr,
    unsealFromQr: unsealFromQr,
    extractBlobFromQr: extractBlobFromQr,
    extractFastFromQr: extractFastFromQr,
    isPairingQr: isPairingQr,
    // P0-25 Fase 2: firma/verificación ECDSA P-256
    getOrCreateSignKeys: crozzoPairingGetOrCreateSignKeys,
    getOrCreateEcdhKeys: crozzoPairingGetOrCreateEcdhKeys,
    signPayload: crozzoPairingSignPayload,
    verifyPayload: crozzoPairingVerifyPayload,
  };
})(typeof window !== 'undefined' ? window : globalThis);
