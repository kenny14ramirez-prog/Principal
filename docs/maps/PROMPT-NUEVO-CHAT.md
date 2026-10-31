# PROMPT PARA NUEVO CHAT — DESARROLLO DEDICADO MISIÓN CIEN

## Contexto
Proyecto: Crozzo POS (`sistema pos`). Rama: `wip/macro-20261029`. Stack: Tauri + Rust (src-tauri/), JS vanilla (app/ → sync → src/), Supabase/Postgres, IndexedDB local, sync LAN WebSocket+HTTP.

## Memoria persistente (leer primero)
1. `npm run synapse:search -- "MISIÓN CIEN"` → 37+ memorias activas.
2. `docs/maps/HANDOFF-CONTINUIDAD.md` → estado actual + próximo paso.
3. `docs/maps/PLAN-ACCION-MAESTRO-PERFECTO.md` → plan maestro (95 hallazgos, F0-F11).
4. `docs/maps/CONTENCION-P0-PENDIENTES.md` → soluciones de contención por P0.
5. `docs/maps/BITACORA-AUDITORIA-COMPLEJA.md` → auditoría completa 10 dimensiones.
6. `docs/maps/RUNBOOK-OTA-P0-11.md` → OTA reactivado (release v1.0.234, firma A0EE).

## Estado actual
- 34 P0/F0 completados con verificación (sync-clinical 44/44, cargo check OK, connectivity 111/111).
- Release v1.0.234 publicado en GitHub con firma correcta (A0EE).
- 1 P0 pendiente (desarrollo dedicado):
  - **P0-16:** Hotspot Android (1-2 semanas) — UX guiada + stubs honestos ya implementados. Falta: implementación nativa Android (WifiManager LocalOnlyHotspot) + bridge en Rust + capability. Plan: `docs/maps/RUNBOOK-P0-16-HOTSPOT-ANDROID.md`. Bloqueado por ausencia de Android SDK en la estación.
- **P0-25:** Crypto redesign — Fase 4.1/4.2/4.3 implementadas: buildFastQrText async + firma ECDSA v:5, callers async, compatibilidad v4→v5, migración a almacén del SO (DPAPI) para claves privadas. Pendiente: subir PAIR_QR_MIN_VERSION a 5 tras rotación de flota (F6) y purgar slots v4.

## Doctrina de ejecución (no negociable)
1. Fuente canónica: editar `app/`, publicar con `npm run sync` → `src/`. Prohibido editar `src/` directo.
2. Archivos críticos: `npm run edit:scope -- <archivo> <símbolo>` antes del primer edit.
3. Cierre: `npm run test:sync-clinical` verde o justificación documentada.
4. Prohibido el mock en validación final.
5. Una tarea = un commit lógico con ID de fase (`F3-T02`).
6. Nada de cambios silenciosos.
7. Sin dependencias nuevas sin aprobación de AM.
8. Sin secretos en código.
9. No se acepta PASS sin evidencia (comando, métrica o captura en `docs/maps/ops/evidencia/<TASK-ID>/`).
10. Detención obligatoria si aparece P0/P1 nuevo.

## Sistema de plan del alto mando
- **AM-1 Decisión:** aprueba alcance, fases y release.
- **AM-2 Estado Mayor:** mantiene OPORD, arbitra conflictos, valida evidencia.
- **AM-3 Auditor:** puede detener cualquier fase. Veto sobre PASS sin evidencia.
- **Generales:** G1 INTEL (investigación), G2 SYNC (datos), G3 COMMS (transportes), G4 SEC/FISC (seguridad/fiscal), G5 PERF (recursos), G6 QA (auditorías), G7 DOCTRINA (docs).
- **Agentes especialistas:** A-SYNC-1..4, A-COMM-1..5, A-SEC-1..2, A-FISC-1..2, A-PERF-1..3, A-QA-1..4, A-DOC-1, A-INT-1..4.

## Ejecución dedicada (paso a paso)
1. Investigar (`app/`, KI, Synapse, mapas) — tesis corta.
2. Mostrar plan (causa, archivos, pasos, criterio PASS/FAIL).
3. Ejecutar al pie de la letra (`edit:scope`, `app/` → `npm run sync`).
4. Verificar hasta PASS — si falla, repetir; prohibido "casi"/"prueba luego".
5. Prohibido responder "no se puede"/"solo básico" a trabajo legítimo.

## Comandos clave
- `npm run sync` (app/ → src/)
- `npm run test:sync-clinical` (gate 44 checks)
- `node scripts/_connectivity-orchestrator-check.mjs` (111 checks)
- `npm run mind:health` (stack mente)
- `npm run synapse:search -- "..."` (memoria)
- `npm run synapse:remember -- --path crozzo/mision-cien --title "..." --content "..."` (guardar memoria)
- `cargo check` / `cargo build` (Rust, con PATH de MSVC)

## PATH Rust (Windows)
```
C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64
C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64
```

## Tarea inmediata
**P0-25 Fase 4 completada** (F4.1/F4.2/F4.3). Siguiente: **P0-16 hotspot Android** — requiere estación con Android SDK/NDK. Plan en `docs/maps/RUNBOOK-P0-16-HOTSPOT-ANDROID.md`. Mientras tanto: evidencia final (F10) y auditoría.

## Memoria persistente
Este prompt + los documentos anteriores permiten a cualquier chat nuevo retomar sin repetir investigación. Guardar progreso con `npm run synapse:remember` después de cada fase completada.