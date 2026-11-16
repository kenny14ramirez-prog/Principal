/**
 * Crozzo POS — 2FA PoC (TOTP RFC 6238) en JavaScript (Fase -2)
 * -------------------------------------------------------------
 * Implementación básica de TOTP para PoC. En producción usar Rust (totp-rs)
 * vía comando Tauri crozzo_totp_verify para seguridad.
 *
 * API:
 *   Crozzo2FAPoC.generateSecret() -> base32 string
 *   Crozzo2FAPoC.totp(secret, time?) -> 6-digit code (async)
 *   Crozzo2FAPoC.verify(secret, code, window?) -> boolean (async)
 */
(function (global) {
  'use strict';

  var BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function randomBytes(n) {
    var b = new Uint8Array(n);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(b);
    else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }

  function base32Encode(bytes) {
    var out = '';
    var bits = 0, val = 0;
    for (var i = 0; i < bytes.length; i++) {
      val = (val << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += BASE32[(val >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += BASE32[(val << (5 - bits)) & 31];
    return out;
  }

  function base32Decode(str) {
    str = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    var out = [];
    var bits = 0, val = 0;
    for (var i = 0; i < str.length; i++) {
      var idx = BASE32.indexOf(str[i]);
      if (idx < 0) continue;
      val = (val << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((val >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  async function hmacSha1(keyBytes, msgBytes) {
    if (!global.crypto || !global.crypto.subtle) throw new Error('Web Crypto no disponible');
    var key = await global.crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    var sig = await global.crypto.subtle.sign('HMAC', key, msgBytes);
    return new Uint8Array(sig);
  }

  function intToBytes(n) {
    var b = new Uint8Array(8);
    for (var i = 7; i >= 0; i--) { b[i] = n & 0xff; n = Math.floor(n / 256); }
    return b;
  }

  async function totp(secret, time) {
    time = (time == null) ? Math.floor(Date.now() / 1000) : time;
    var counter = Math.floor(time / 30);
    var keyBytes = base32Decode(secret);
    var msgBytes = intToBytes(counter);
    var hmac = await hmacSha1(keyBytes, msgBytes);
    var offset = hmac[hmac.length - 1] & 0x0f;
    var code = ((hmac[offset] & 0x7f) << 24) |
               ((hmac[offset + 1] & 0xff) << 16) |
               ((hmac[offset + 2] & 0xff) << 8) |
               (hmac[offset + 3] & 0xff);
    code = code % 1000000;
    return ('000000' + code).slice(-6);
  }

  async function verify(secret, code, window) {
    window = window == null ? 1 : window;
    var now = Math.floor(Date.now() / 1000);
    for (var i = -window; i <= window; i++) {
      var c = await totp(secret, now + i * 30);
      if (c === String(code).padStart(6, '0')) return true;
    }
    return false;
  }

  function generateSecret(bytes) {
    bytes = bytes || 20;
    return base32Encode(randomBytes(bytes));
  }

  global.Crozzo2FAPoC = {
    generateSecret: generateSecret,
    totp: totp,
    verify: verify,
    base32Encode: base32Encode,
    base32Decode: base32Decode
  };
})(typeof window !== 'undefined' ? window : globalThis);
