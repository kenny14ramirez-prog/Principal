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
  var PAIR_KDF_PASS = 'CrozzoBonaOrigenPairSeal2026';
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
