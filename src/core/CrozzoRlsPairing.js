/**
 * Crozzo POS — RLS Pairing (Fase -2/P0)
 * -------------------------------------
 * Maneja la obtención y almacenamiento de JWT por dispositivo
 * durante el flujo de pairing (QR). Se integra con CrozzoRlsJwt.
 */
(function (global) {
  'use strict';

  async function onPairingSuccess(pairingData) {
    // pairingData puede contener un JWT o un token de emparejamiento
    try {
      if (pairingData && pairingData.jwt) {
        if (global.CrozzoRlsJwt) {
          await global.CrozzoRlsJwt.setJwt(pairingData.jwt);
          console.log('[RLS] JWT almacenado desde pairing');
        }
      }
      // Si no hay JWT, modo compatibilidad (business_id = 'default')
      if (global.CrozzoRlsCompat) {
        global.CrozzoRlsCompat.setMode(pairingData && pairingData.jwt ? 'jwt' : 'compat');
      }
    } catch (e) {
      console.warn('[RLS] Error en onPairingSuccess', e);
    }
  }

  async function ensureJwt() {
    if (!global.CrozzoRlsJwt) return null;
    var jwt = await global.CrozzoRlsJwt.getJwt();
    if (jwt) return jwt;
    // Si no hay JWT, modo compatibilidad
    return null;
  }

  function status() {
    return {
      hasJwt: (global.CrozzoRlsJwt) ? 'checking...' : false,
      compatMode: (global.CrozzoRlsCompat) ? global.CrozzoRlsCompat.isCompatMode() : true,
      businessId: (global.CrozzoRlsCompat) ? global.CrozzoRlsCompat.getBusinessId() : 'default'
    };
  }

  global.CrozzoRlsPairing = {
    onPairingSuccess: onPairingSuccess,
    ensureJwt: ensureJwt,
    status: status
  };
})(typeof window !== 'undefined' ? window : globalThis);
