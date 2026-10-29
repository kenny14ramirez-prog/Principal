# SOLUCIONES DE CONTENCIÓN — P0 PENDIENTES (investigación profunda)

**Fecha:** 2026-10-29 · **Fuentes:** 5 investigadores (P0-01, P0-03, P0-11, P0-18, P0-25) + internet.
**Memoria:** Synapse (5 memorias nuevas).

## P0-01 — Cobro no genera factura (cartDirecto vacío)

**Causa raíz:** purga por heurística de recencia (`__crozzoLocalEdit` 5 min) en `crozzoPrepareDirectSaleSession` (línea 7193) y `applyPosRuntimeSnapshot` (línea 9026-9032); round-trip de sync borra la marca; ramas de apply sobrescriben con remoto; confirmación depende de carrito mutable.

**Contención inmediata (hotfix, bajo riesgo):**
1. `app/core/CrozzoPosMain.js:7193` — no vaciar `cartDirecto` si tiene ítems y `!forceClear`.
2. `app/core/CrozzoPosMain.js:9014-9032` — no sobrescribir con remoto si local tiene consumo; merge con `crozzoMergeCloudCartWithLocalEdits`.
3. `app/modules/CrozzoPosRuntimeCloud.js:221-247` — preservar `__crozzoLocalEdit` en compactación (`ext.e`).
4. `app/core/CrozzoPosMain.js:9625-9633` y `CrozzoOperativeSyncGate.js:316-318` — no purgar si `cartDirecto.length > 0`.

**Solución robusta (F2/F3):** snapshot inmutable de venta con `cartSaleId`/`__cobroUuid` al primer item; estados explícitos (draft/comandado/en_cobro/cerrado); purga solo por acción explícita; sync por versión/HLC con merge. Requiere cambio de arquitectura.

**Riesgos:** carritos stale más tiempo; duplicar estado; concurrencia multi-equipo (depende de P0-03 idempotencia).

**Esfuerzo:** hotfix 2-3 días; robusta 2-3 semanas.

## P0-03 — Consecutivo no atómico

**Causa raíz:** estado local no compartido; `save()` reescribe blob completo sin merge/lock; sin autoridad remota ni idempotencia; multi-instancia sin single-instance.

**Solución:** secuenciador atómico PostgreSQL vía RPC transaccional (`UPDATE ... RETURNING` con row-lock + idempotency key por venta) + reserva por bloques para offline (leases). No usar `SEQUENCE` puro (huecos).

**Prerrequisitos:** P0-21 (single-instance), P0-02 (guard UUID).
**Esfuerzo:** 5-8 días.
**Riesgos:** latencia por venta (mitigar con bloques), huecos por aborts (asignar solo al persistir factura), colisión offline (validar rangos de lease).

## P0-11 — OTA roto (pubkey mismatch)

**Causa raíz:** pubkey embebida `A0EE9D152E5A3C9E` ≠ clave que firma releases `AD59656123565E0B`. La privada `A0EE` existe en `%USERPROFILE%\.tauri\crozzo-pos.key` (password vacío, verificado).

**Remediación (sin tocar código):**
1. GitHub → Secrets → `TAURI_SIGNING_PRIVATE_KEY` = contenido de `crozzo-pos.key`.
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = vacío.
3. Publicar release nuevo (tag > 1.0.231) firmado con `A0EE`.
4. Verificar `.sig` key id = `A0EE9D152E5A3C9E` en el release.
5. Prueba en VM antes de anunciar.

**Rotación futura (si se sospecha compromiso):** bridge firmado con clave vieja; si se pierde la privada vieja → reinstalación manual.

**Riesgos:** secreto mal pegado, release sin verificación, versiones mezcladas en campo, sin rollback/downgrade.
**Esfuerzo:** 1 día (configuración + publicación).

## P0-18 — HTTP sin keep-alive

**Causa raíz:** `handle_connection` una sola lectura + `Connection: close` + no bucle; cada request abre TCP nueva.

**Solución Fase 1 (recomendada):** refactor a loop manual sobre dispatch existente + `Connection: keep-alive` opt-in + timeouts + max requests/conn. Sin nuevas dependencias.
**Fase 2:** migrar I/O a hyper (ya en lock, v1.9.0) — robusto, reduce código HTTP manual.
**No recomendado:** axum (no en lock, requiere red).

**Riesgos:** semáforo 64 + conexiones persistentes (ajustar a 256), slowloris (timeouts), body framing (Content-Length exacto), regresión de dispatch, sin tests Rust.

**Esfuerzo:** Fase 1: 2-3 sem dev + 1-2 sem QA. Fase 2: 4-6 sem.

**Impacto latencia:** −1 RTT por request, throughput x2-x4 en polling masivo, p99 −30-60%.

## P0-25 — Secreto hardcodeado (emparejamiento)

**Causa raíz:** `PAIR_KDF_PASS = 'CrozzoBonaOrigenPairSeal2026'` pública → ofuscación, no cifrado. Cualquiera recomputa la clave AES-256-GCM. Fallback texto plano (`JSON.parse` sin validación). `BOF.` emite datos en claro.

**Solución:** ECDH efímero por QR + firma de identidad del hub (Ed25519/ECDSA) + expiración estricta + rechazo de v<5 y texto plano. Eliminar `PAIR_KDF_PASS`/`PAIR_KDF_SALT`. Almacenar identidad de caja en storage seguro del OS (Tauri stronghold/keychain).

**Migración:** ventana de compatibilidad v4 (aceptar v4 solo dentro de expiración con aviso), feature flag `PAIRING_QR_MIN_VERSION`, actualización coordinada de flota, purgar slots v4.

**Riesgos:** QR v4 en circulación, lockout por OTA desalineado, dispositivos ya emparejados (no afectados), tamaño del QR, tests/scripts a actualizar.

**Esfuerzo:** 4-6 semanas (1 dev senior) o 2-3 sprints con 2 devs.

## Orden de ejecución recomendado (contención)

1. **P0-11 (OTA)** — 1 día, sin código, desbloquea actualizaciones para toda la flota.
2. **P0-01 hotfix (A)** — 2-3 días, desbloquea cobro (factura).
3. **P0-18 Fase 1 (keep-alive)** — 2-3 sem, mejora latencia polling masivo.
4. **P0-03 (consecutivo)** — 5-8 días, depende de P0-21 y P0-02 (ya hecho).
5. **P0-01 robusto (B)** — 2-3 sem, cambio de arquitectura.
6. **P0-25 (secreto)** — 4-6 sem, seguridad de emparejamiento.
7. **P0-16 (hotspot multi-plat)** — paralelo con P0-18.

**P0-21 (single-instance)** se implementa junto con P0-03 (prerrequisito).

## Memoria persistente
- Synapse: 5 memorias nuevas (una por P0). Handoff y plan v2 actualizados.
- Cualquier chat nuevo retoma con `npm run synapse:search -- "MISIÓN CIEN"` o leyendo este documento.