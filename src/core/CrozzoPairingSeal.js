/**
 * Emparejamiento BONA origen — QR cifrado (solo la app descifra).
 * Escáneres genéricos abren la URL pública de instalación; el fragmento #BO1… no viaja al servidor.
 */
(function (global) {
  'use strict';

  var PAIR_INSTALL_URL = 'https://bonaorigen.app/instalar';
  var PAIR_SCHEME = 'bonaorigen://pair';
  var PAIR_BLOB_PREFIX = 'BO1.';
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
        return PAIR_INSTALL_URL + '#' + PAIR_BLOB_PREFIX + base64UrlEncode(combined);
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

  function unsealFromQr(text) {
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

  function isPairingQr(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    return (
      t.indexOf(PAIR_BLOB_PREFIX) >= 0 ||
      t.indexOf(PAIR_INSTALL_URL) === 0 ||
      t.indexOf(PAIR_SCHEME) === 0
    );
  }

  global.CrozzoPairingSeal = {
    PAIR_INSTALL_URL: PAIR_INSTALL_URL,
    PAIR_SCHEME: PAIR_SCHEME,
    PAIR_BLOB_PREFIX: PAIR_BLOB_PREFIX,
    sealPayload: sealPayload,
    unsealFromQr: unsealFromQr,
    extractBlobFromQr: extractBlobFromQr,
    isPairingQr: isPairingQr,
  };
})(typeof window !== 'undefined' ? window : globalThis);
