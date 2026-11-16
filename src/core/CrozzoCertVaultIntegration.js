/**
 * Crozzo POS — Cert Vault Integration (Fase -2/P0)
 * -----------------------------------------------
 * Verifica el certificado en vault antes de facturar (async).
 * Se integra con canGoLiveAsync.
 */
(function (global) {
  'use strict';

  async function verifyCertBeforeFacturar() {
    if (!global.CrozzoCertVault) return { ok: true, reason: 'no_vault' };
    try {
      var cert = await global.CrozzoCertVault.get();
      if (!cert) return { ok: false, reason: 'cert_not_in_vault' };
      // Verificar vigencia
      var cfg = (global.config && global.config.getFacturacionAdminConfig) ? global.config.getFacturacionAdminConfig() : null;
      var certCfg = (cfg && cfg.certificado) || {};
      if (certCfg.expiryDate && new Date(certCfg.expiryDate) < new Date()) {
        return { ok: false, reason: 'cert_vencido' };
      }
      return { ok: true, reason: 'ok' };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  global.CrozzoCertVaultIntegration = {
    verifyCertBeforeFacturar: verifyCertBeforeFacturar
  };
})(typeof window !== 'undefined' ? window : globalThis);
