/**
 * Crozzo POS — Fase 0 PoC (Estabilización crítica)
 * ------------------------------------------------
 * Encapsula tareas de Fase 0 de bajo riesgo:
 * - Validación de permiso 'comandar' (PoC).
 * - Registro de faltantes de stock (PoC).
 * - canGoLive() estricto (PoC).
 * Verificable por asuntos internos.
 */
(function (global) {
  'use strict';

  // 1. Validación de permiso comandar (PoC)
  function hasComandarPermiso() {
    try {
      if (global.crozzoHasCajaPermiso) return !!global.crozzoHasCajaPermiso('comandar');
    } catch (_) {}
    // Fallback: si no existe el permiso, permitir (compatibilidad)
    return true;
  }

  // 2. Registro de faltantes de stock (PoC)
  function registrarFaltante(productId, nombre, cantidadFaltante, facturaId) {
    try {
      var mov = {
        tipo: 'faltante_stock',
        productId: productId,
        nombre: nombre || '',
        cantidad: cantidadFaltante,
        facturaId: facturaId || null,
        timestamp: new Date().toISOString(),
        por: (typeof global.crozzoGetCurrentUserLabel === 'function') ? global.crozzoGetCurrentUserLabel() : 'sistema'
      };
      // Intentar registrar en reservorio si existe
      if (global.CrozzoReservorio && typeof global.CrozzoReservorio.addInventarioMovimiento === 'function') {
        global.CrozzoReservorio.addInventarioMovimiento(mov);
      }
      // Auditoría
      if (global.config && typeof global.config.addAudit === 'function') {
        global.config.addAudit('faltante_stock', JSON.stringify(mov));
      }
      return mov;
    } catch (e) {
      console.warn('registrarFaltante failed', e);
      return null;
    }
  }

  // 3. canGoLive estricto (PoC)
  function canGoLiveStrict(config) {
    try {
      var cfg = config || (global.config ? global.config.getFacturacionAdminConfig ? global.config.getFacturacionAdminConfig() : null : null);
      if (!cfg) return { ok: false, reason: 'no_config' };
      var prov = cfg.proveedor || {};
      if (prov.type !== 'dataico') return { ok: false, reason: 'proveedor_no_dataico' };
      if (!prov.apiKey) return { ok: false, reason: 'sin_api_key' };
      var cert = cfg.certificado || {};
      if (!cert.encrypted) return { ok: false, reason: 'cert_no_cifrado' };
      if (cert.expiryDate && new Date(cert.expiryDate) < new Date()) return { ok: false, reason: 'cert_vencido' };
      var dian = cfg.dian || {};
      if (!dian.resolucion || !dian.prefijo) return { ok: false, reason: 'dian_incompleto' };
      return { ok: true, reason: 'ok' };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  global.CrozzoFase0PoC = {
    hasComandarPermiso: hasComandarPermiso,
    registrarFaltante: registrarFaltante,
    canGoLiveStrict: canGoLiveStrict
  };
})(typeof window !== 'undefined' ? window : globalThis);
