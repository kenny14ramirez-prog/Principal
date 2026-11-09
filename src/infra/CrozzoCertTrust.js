/**
 * Crozzo POS — Confianza de certificado de la caja (CA self-signed).
 * Expone global.crozzoCertTrustInstall(certPem) para instalar la CA en el
 * WebView (WebView2 en Windows) cuando la plataforma lo permite, o guardarla
 * en localStorage como fallback (TOFU complementario). No rompe el pairing
 * existente.
 *
 * Flujo real:
 *   1. Valida y persiste el PEM + fingerprint en localStorage (TOFU).
 *   2. Intenta instalacion nativa real via crozzo_lan_tls_install_ca (Tauri).
 *   3. Verifica el resultado devuelto (ok/installed/fingerprint).
 *   4. Si falla (especialmente en WebView2 puro), muestra instrucciones (toast).
 *   5. Persiste el estado de confianza en localStorage.
 */
(function (global) {
  'use strict';

  var STORAGE_PEM_KEY = 'crozzo_trusted_ca_pem';
  var STORAGE_FP_KEY = 'crozzo_trusted_ca_fingerprint';
  var STORAGE_STATE_KEY = 'crozzo_cert_trusted';
  var STORAGE_METHOD_KEY = 'crozzo_cert_trust_method';
  var STORAGE_AT_KEY = 'crozzo_cert_trust_at';
  var STORAGE_ERROR_KEY = 'crozzo_cert_trust_error';
  var STORAGE_INSTALLED_KEY = 'crozzo_cert_installed';

  function normalizePem(pem) {
    return String(pem == null ? '' : pem).trim();
  }

  function isPem(pem) {
    return /-----BEGIN CERTIFICATE-----/.test(pem) && /-----END CERTIFICATE-----/.test(pem);
  }

  async function fingerprintFromPem(pem) {
    try {
      if (!global.crypto || !global.crypto.subtle) return '';
      var b64 = String(pem || '')
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, '');
      if (!b64) return '';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var digest = await global.crypto.subtle.digest('SHA-256', bytes);
      return Array.prototype.map.call(new Uint8Array(digest), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    } catch (_) {
      return '';
    }
  }

  function savePem(pem) {
    pem = normalizePem(pem);
    if (!pem) return false;
    try { global.__CROZZO_TRUSTED_CA_PEM = pem; } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined') global.localStorage.setItem(STORAGE_PEM_KEY, pem);
    } catch (_) {}
    return true;
  }

  function saveFingerprint(fp) {
    fp = String(fp == null ? '' : fp).trim().toLowerCase();
    if (!fp) return false;
    try { global.__CROZZO_TRUSTED_CA_FP = fp; } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined') global.localStorage.setItem(STORAGE_FP_KEY, fp);
    } catch (_) {}
    return true;
  }

  function getTrustedPem() {
    try {
      if (global.__CROZZO_TRUSTED_CA_PEM) return normalizePem(global.__CROZZO_TRUSTED_CA_PEM);
    } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined') return normalizePem(global.localStorage.getItem(STORAGE_PEM_KEY));
    } catch (_) {}
    return '';
  }

  function getTrustedFingerprint() {
    try {
      if (global.__CROZZO_TRUSTED_CA_FP) return String(global.__CROZZO_TRUSTED_CA_FP).trim().toLowerCase();
    } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined') return String(global.localStorage.getItem(STORAGE_FP_KEY) || '').trim().toLowerCase();
    } catch (_) {}
    return '';
  }

  function isTrusted() {
    try {
      if (typeof global.localStorage !== 'undefined') return global.localStorage.getItem(STORAGE_STATE_KEY) === '1';
    } catch (_) {}
    try { return global.__CROZZO_CERT_TRUSTED === true; } catch (_) {}
    return false;
  }

  function isInstalled() {
    try {
      if (typeof global.localStorage !== 'undefined') return global.localStorage.getItem(STORAGE_INSTALLED_KEY) === '1';
    } catch (_) {}
    return false;
  }

  function isTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {}
    return false;
  }

  function isWebView2() {
    try {
      if (isTauri()) return true;
      var ua = String((global.navigator && (global.navigator.userAgent || global.navigator.platform)) || '');
      if (/WebView2|Edg\//i.test(ua)) return true;
      if (global.chrome && global.chrome.webview) return true;
      if (global.__CROZZO_IS_TAURI__) return true;
    } catch (_) {}
    return false;
  }

  function isWindows() {
    try {
      if (global.navigator && /Win/i.test(global.navigator.platform || '')) return true;
      if (global.navigator && /Windows/i.test(global.navigator.userAgent || '')) return true;
    } catch (_) {}
    return false;
  }

  function instructionsForPlatform() {
    if (isWindows()) {
      return 'En Windows (WebView2): el certificado se instala automaticamente en el almacen de raiz del usuario (CurrentUser\\Root) via PowerShell. Si falla, importalo manualmente con certmgr.msc (certificado -> Trusted Root Certification Authorities -> Current User).';
    }
    if (/Mac/i.test((global.navigator && global.navigator.platform) || '')) {
      return 'En macOS: guarda el certificado (PEM) y agregalo al Llavero (Keychain) como "Confiar siempre" para Crozzo POS. Comando: security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db crozzo_ca.pem';
    }
    if (/Linux/i.test((global.navigator && global.navigator.platform) || '')) {
      return 'En Linux: copia el PEM a /usr/local/share/ca-certificates/crozzo_ca.crt y ejecuta sudo update-ca-certificates. Para el navegador, importalo en sus certificados.';
    }
    // Android / iOS / otros
    return 'En este dispositivo: importa el certificado PEM en los ajustes de seguridad del sistema/navegador (Ajustes > Seguridad > Instalar certificado) y acepta la advertencia. El certificado queda guardado localmente (TOFU).';
  }

  function notifyInstructions(msg, type) {
    type = type || 'warning';
    try {
      if (typeof global.showToast === 'function') { global.showToast(msg, type); return; }
    } catch (_) {}
    try { console.warn('[CrozzoCertTrust] ' + msg); } catch (_) {}
  }

  function saveTrustState(installed, method, error) {
    installed = !!installed;
    try { if (typeof global.localStorage !== 'undefined') global.localStorage.setItem(STORAGE_STATE_KEY, installed ? '1' : '0'); } catch (_) {}
    try { if (typeof global.localStorage !== 'undefined') global.localStorage.setItem(STORAGE_INSTALLED_KEY, installed ? '1' : '0'); } catch (_) {}
    try { if (typeof global.localStorage !== 'undefined' && method) global.localStorage.setItem(STORAGE_METHOD_KEY, String(method)); } catch (_) {}
    try { if (typeof global.localStorage !== 'undefined') global.localStorage.setItem(STORAGE_AT_KEY, String(Date.now())); } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined') {
        if (error) global.localStorage.setItem(STORAGE_ERROR_KEY, String(error));
        else global.localStorage.removeItem(STORAGE_ERROR_KEY);
      }
    } catch (_) {}
    try { global.__CROZZO_CERT_TRUSTED = installed; } catch (_) {}
    try { global.__CROZZO_CERT_TRUST_METHOD = method || null; } catch (_) {}
    try { global.__CROZZO_CERT_INSTALLED = installed; } catch (_) {}
  }

  // Verifica que el resultado nativo confirme instalacion real.
  function verifyNativeResult(r, expectedFp) {
    if (!r || typeof r !== 'object') return false;
    if (r.installed !== true) return false;
    if (r.ok === false) return false;
    if (expectedFp && r.fingerprint) {
      if (String(r.fingerprint).trim().toLowerCase() !== String(expectedFp).trim().toLowerCase()) return false;
    }
    return true;
  }

  async function tryInstallInWebView(certPem, expectedFp) {
    // 1) Tauri (caja/tablet desktop, WebView2 en Windows): comando nativo real.
    //    crozzo_lan_tls_install_ca instala en CurrentUser\Root via PowerShell y
    //    devuelve { ok, installed, method, fingerprint, ... }. Verificamos el
    //    resultado antes de declarar exito.
    if (isTauri()) {
      try {
        var r0 = await global.__TAURI__.core.invoke('crozzo_lan_tls_install_ca', { certPem: certPem, cert_pem: certPem, pem: certPem });
        if (verifyNativeResult(r0, expectedFp)) {
          return {
            installed: true,
            method: (r0 && r0.method) ? r0.method : 'tauri:crozzo_lan_tls_install_ca',
            detail: r0 || null,
            fingerprint: (r0 && r0.fingerprint) ? String(r0.fingerprint).trim().toLowerCase() : (expectedFp || ''),
            thumbprint: (r0 && r0.thumbprint) ? String(r0.thumbprint).trim() : null,
          };
        }
        // El comando respondio pero no confirmo instalacion: fallo nativo real.
        var err0 = (r0 && (r0.error || r0.fallback_error)) ? (r0.error || r0.fallback_error) : 'native_install_not_confirmed';
        return {
          installed: false,
          method: (r0 && r0.method) ? r0.method : 'tauri:crozzo_lan_tls_install_ca',
          detail: r0 || null,
          error: String(err0),
        };
      } catch (e0) {
        // Intentar comandos legacy por compatibilidad.
        var cmds = ['crozzo_install_ca', 'crozzo_trust_ca', 'install_ca_cert', 'crozzo_lan_trust_ca'];
        for (var i = 0; i < cmds.length; i++) {
          try {
            var r = await global.__TAURI__.core.invoke(cmds[i], { certPem: certPem, cert_pem: certPem, pem: certPem });
            if (r && r.ok !== false && r.installed !== false) {
              return { installed: true, method: 'tauri:' + cmds[i], detail: r };
            }
          } catch (_) {}
        }
        return {
          installed: false,
          method: 'tauri:crozzo_lan_tls_install_ca',
          detail: null,
          error: (e0 && e0.message) ? e0.message : String(e0),
        };
      }
    }

    // 2) Puente Android (WebView) opcional.
    try {
      if (global.Android && typeof global.Android.installCa === 'function') {
        global.Android.installCa(certPem);
        return { installed: true, method: 'android' };
      }
      if (global.AndroidBridge && typeof global.AndroidBridge.installCa === 'function') {
        global.AndroidBridge.installCa(certPem);
        return { installed: true, method: 'android-bridge' };
      }
    } catch (eA) {
      return { installed: false, method: 'android', error: (eA && eA.message) ? eA.message : String(eA) };
    }

    // 3) WebView2 / navegador estandar sin API nativa: no se puede instalar desde JS.
    //    Se mantiene el fallback localStorage + instrucciones (TOFU). Se registra
    //    el error para que el estado de confianza refleje el fallo real.
    return {
      installed: false,
      method: isWebView2() ? 'webview2:no-native-api' : 'none',
      error: isWebView2() ? 'webview2_native_install_unavailable' : 'no_native_installer',
    };
  }

  async function install(certPem) {
    certPem = normalizePem(certPem);
    if (!certPem) return { ok: false, reason: 'empty' };
    if (!isPem(certPem)) return { ok: false, reason: 'invalid_pem' };

    savePem(certPem);
    var fp = await fingerprintFromPem(certPem);
    if (fp) saveFingerprint(fp);

    var res = await tryInstallInWebView(certPem, fp);
    var installed = !!res.installed;
    saveTrustState(installed, res.method || 'localStorage', res.error || null);

    var instructions = null;
    if (!installed) {
      instructions = instructionsForPlatform();
      var prefix = isWebView2()
        ? 'No se pudo instalar automaticamente la CA en WebView2. '
        : 'Certificado guardado localmente (TOFU). ';
      // Mostrar instrucciones al usuario (toast) cuando la instalacion nativa falla.
      notifyInstructions(prefix + instructions, 'warning');
    } else {
      // Confirmacion discreta de exito (no bloquea).
      try {
        if (typeof global.showToast === 'function') global.showToast('CA instalada en el almacen de confianza del sistema.', 'success');
      } catch (_) {}
    }

    return {
      ok: true,
      installed: installed,
      method: res.method || 'localStorage',
      fingerprint: (res && res.fingerprint) ? res.fingerprint : (fp || ''),
      thumbprint: (res && res.thumbprint) ? res.thumbprint : null,
      storage: 'localStorage',
      instructions: instructions,
      detail: res.detail || null,
      error: res.error || null,
      webview2: isWebView2(),
    };
  }

  function verify() {
    try {
      var pem = getTrustedPem();
      var fp = getTrustedFingerprint();
      var state = isTrusted();
      return {
        ok: !!pem,
        hasPem: !!pem,
        hasFingerprint: !!fp,
        trusted: state,
        installed: isInstalled(),
        method: (typeof global.localStorage !== 'undefined') ? (global.localStorage.getItem(STORAGE_METHOD_KEY) || null) : (global.__CROZZO_CERT_TRUST_METHOD || null),
      };
    } catch (_) {
      return { ok: false, hasPem: false, hasFingerprint: false, trusted: false, installed: false, method: null };
    }
  }

  global.crozzoCertTrustInstall = install;
  global.crozzoCertTrustGet = getTrustedPem;
  global.crozzoCertTrustGetFingerprint = getTrustedFingerprint;
  global.crozzoCertTrustIsTrusted = isTrusted;
  global.crozzoCertTrustIsInstalled = isInstalled;
  global.crozzoCertTrustVerify = verify;
  global.CrozzoCertTrust = {
    install: install,
    get: getTrustedPem,
    getFingerprint: getTrustedFingerprint,
    isTrusted: isTrusted,
    isInstalled: isInstalled,
    verify: verify,
    isPem: isPem,
    isWebView2: isWebView2,
    instructionsForPlatform: instructionsForPlatform,
  };
})(typeof window !== 'undefined' ? window : globalThis);