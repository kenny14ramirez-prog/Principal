/**
 * Crozzo POS — Cifrado de payloads en LAN (AES-256-GCM) usando Web Crypto.
 * Clave derivada del token LAN compartido (PBKDF2). Fallback a texto plano si
 * Web Crypto no está disponible.
 */
(function (global) {
  'use strict';

  var __keyCache = null;
  var __keyToken = '';

  function getToken() {
    try {
      if (typeof global.getMultiDeviceConfig === 'function') {
        var md = global.getMultiDeviceConfig() || {};
        if (md.lanToken) return String(md.lanToken);
      }
    } catch (_) {}
    try { return String(global.localStorage.getItem('crozzo_lan_token') || ''); } catch (_) { return ''; }
  }

  async function deriveKey(token) {
    if (!global.crypto || !global.crypto.subtle) return null;
    if (__keyCache && __keyToken === token) return __keyCache;
    var enc = new TextEncoder();
    var base = await global.crypto.subtle.importKey('raw', enc.encode(token || 'crozzo-lan'), 'PBKDF2', false, ['deriveKey']);
    var key = await global.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('crozzo-lan-salt'), iterations: 100000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    __keyCache = key;
    __keyToken = token;
    return key;
  }

  async function encrypt(plain) {
    try {
      var token = getToken();
      var key = await deriveKey(token);
      if (!key) return { ok: false, plain: true, data: plain };
      var iv = global.crypto.getRandomValues(new Uint8Array(12));
      var enc = new TextEncoder();
      var ct = await global.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(typeof plain === 'string' ? plain : JSON.stringify(plain)));
      var out = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)), v: 1 };
      return { ok: true, plain: false, data: JSON.stringify(out) };
    } catch (_) {
      return { ok: false, plain: true, data: plain };
    }
  }

  async function decrypt(blob) {
    try {
      if (typeof blob !== 'string') return blob;
      var parsed = null;
      try { parsed = JSON.parse(blob); } catch (_) { return blob; }
      if (!parsed || parsed.v !== 1 || !parsed.iv || !parsed.ct) return blob;
      var token = getToken();
      var key = await deriveKey(token);
      if (!key) return blob;
      var iv = new Uint8Array(parsed.iv);
      var ct = new Uint8Array(parsed.ct);
      var pt = await global.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
      var text = new TextDecoder().decode(pt);
      try { return JSON.parse(text); } catch (_) { return text; }
    } catch (_) {
      return blob;
    }
  }

  global.CrozzoLanCrypto = { encrypt: encrypt, decrypt: decrypt, deriveKey: deriveKey };
  global.crozzoLanEncrypt = encrypt;
  global.crozzoLanDecrypt = decrypt;
})(window);
