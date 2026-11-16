# Reporte Validación: Seguridad / RLS / 2FA / Auth

Directorio: `C:\proyectos\sistema pos`
Ejecución secuencial de los 14 checks. No se modificó código fuente.

## Resultados

| # | Check | Exit code | Estado |
|---|-------|-----------|--------|
| 1 | rbac-security | 0 | PASS |
| 2 | rls-compat | 0 | PASS |
| 3 | rls-integration | 0 | PASS |
| 4 | rls-pairing | 0 | PASS |
| 5 | rls-payload-enricher | 0 | PASS |
| 6 | 2fa-modal | 0 | PASS |
| 7 | 2fa-integration | 0 | PASS |
| 8 | tls-pinning | 0 | PASS |
| 9 | cert-trust | 0 | PASS |
| 10 | supabase-auth | 0 | PASS |
| 11 | configmanager-dualwrite | 0 | PASS |
| 12 | config-wrapper | 0 | PASS |
| 13 | device-mind | 0 | PASS |
| 14 | sql-panel | 1 | FAIL |

## Detalle por check

### 1. rbac-security — PASS (exit 0)
```
OK: 23
  ✓ cajero preset sin eliminar_item
  ... (23 checks)
Todos los checks pasaron.
```

### 2. rls-compat — PASS (exit 0)
```
  ✓ Default: compat mode — true
  ✓ Default: business_id=default — default
  ✓ Status: compat+default — {"compatMode":true,"businessId":"default","cutoffDate":"2026-12-31","cutoffPassed":false,"hasJwt":false}
  ✓ After setMode jwt: not compat — false
  ✓ JWT: business_id extracted — biz-123
  ✓ isCutoffPassed exists
✅ RLS COMPAT: PASS
```

### 3. rls-integration — PASS (exit 0)
```
  ✓ init existe
  ✓ getBusinessId default — default
  ✓ enrichPayload añade business_id — {"id":1,"business_id":"default"}
  ✓ enrichPayload no sobrescribe — biz-x
  ✓ isRlsActive existe
✅ RLS INTEGRATION: PASS
```

### 4. rls-pairing — PASS (exit 0)
```
[RLS] JWT almacenado desde pairing
  ✓ onPairingSuccess: no lanza error
  ✓ status: retorna objeto — {"hasJwt":"checking...","compatMode":false,"businessId":"biz-pair"}
  ✓ ensureJwt: retorna null o string — h.eyJidXNpbmVzc19pZCI6ImJpei1wYWlyIn0.s
✅ RLS PAIRING: PASS
```

### 5. rls-payload-enricher — PASS (exit 0)
```
  ✓ patchFetch existe
  ✓ isPatched existe
✅ RLS PAYLOAD ENRICHER: PASS
```

### 6. 2fa-modal — PASS (exit 0)
```
  ✓ isEnabled existe
  ✓ isEnabled default: false
  ✓ show: no lanza error
  ✓ hide: no lanza error
  ✓ bindHandlers: no lanza error
  ✓ use2faAdmin default: false
✅ 2FA MODAL: PASS
```

### 7. 2fa-integration — PASS (exit 0)
```
  ✓ isEnabled default: false
  ✓ admin: true
  ✓ caja: false
  ✓ shouldPrompt2FA sin secreto: false
  ✓ shouldPrompt2FA con secreto+flag: true
✅ 2FA INTEGRATION: PASS
```

### 8. tls-pinning — PASS (exit 0)
```
✓ API — crozzoTlsVerifyFingerprint
✓ API — crozzoTlsSaveFingerprint
✓ API — crozzoTlsGetPairedFingerprint
✓ API — verifyConnection
✓ API — trustOnFirstUse
TOFU save: true verify match: true verify mismatch: false
✓ TOFU match — true
✓ TOFU mismatch — false
Todo OK
```

### 9. cert-trust — PASS (exit 0)
```
✓ API — crozzoCertTrustInstall
✓ API — crozzoCertTrustGet
✓ API — crozzoCertTrustGetFingerprint
✓ API — isTrusted
✓ API — isInstalled
APIs disponibles: [ 'install', 'get', 'getFingerprint', 'isTrusted', 'isInstalled', 'verify', 'isPem', 'isWebView2', 'instructionsForPlatform' ]
get result:
✓ get — OK
Todo OK
```

### 10. supabase-auth — PASS (exit 0)
```
  ✓ patchFetch existe
  ✓ isPatched existe
  ✓ Flag off: not patched — false
✅ SUPABASE AUTH: PASS
```

### 11. configmanager-dualwrite — PASS (exit 0)
```
⚠️ No se pudo instanciar; verificando source.
  ✓ save() con dual-write presente en source
```

### 12. config-wrapper — PASS (exit 0)
```
  ✓ wrap: isWrapped=true
  ✓ wrap: idempotente
  ✓ save: original llamado — 1
  ✓ save con flag: original llamado — 2
✅ CONFIG WRAPPER: PASS
```

### 13. device-mind — PASS (exit 0)
```
DEVICE-MIND CHECK: OK
```

### 14. sql-panel — FAIL (exit 1)
```
Resultado: {
  "hasExtras": true,
  "found": false
}
Errores de página: 0 []
PANEL FALLO
```

Análisis del fallo: el módulo `CrozzoSupabaseSqlExtras` carga correctamente en `src/index.html` (`hasExtras: true`) y sin errores de página, pero `list()` no contiene una entrada con `key === 'comunicacion_repair'`. Las keys presentes en `app/modules/CrozzoSupabaseSqlExtras.js` y `src/modules/CrozzoSupabaseSqlExtras.js` (idénticos) son: pos_runtime, federacion, mesa_runtime, profiles_auth, business_registry, device_qr_slots, pos_staff_business_id, pos_facturas_share_storage, crm_registro_qr, ai_insights. No existe 'comunicacion_repair' en ningún módulo. El check adicionalmente exige `hasSedeRuntime`, `hasComandas`, `hasWriteRls`, pero el fallo principal es `found === false`. Requiere agregar la entrada 'comunicacion_repair' al módulo (o ajustar el check) para cumplir el invariante esperado.

## Resumen

- 13/14 checks PASS.
- 1/14 FAIL: `sql-panel` (exit 1) por ausencia de la entrada `comunicacion_repair` en `CrozzoSupabaseSqlExtras`.

REPORTE ESCRITO