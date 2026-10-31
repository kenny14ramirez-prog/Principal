# RESERVORIO DE EMERGENCIA — Doctrina de recuperación ante daño crítico

**Clasificación:** Interna — agentes y generales.
**Estado:** Diseño (refuerzo teórico). No implementado como código ejecutable.

## 1. Concepto

El **Reservorio** es una copia protegida de versiones del sistema que **funcionaron en algún momento**, mantenida como último recurso ante daño crítico (corrupción del árbol principal, pérdida de datos, OTA roto, regresión irrecuperable).

Analogía: como el reservorio de agua de una ciudad — no se usa en operación normal, pero garantiza supervivencia si falla la fuente principal.

## 2. Principios (no negociables)

1. **Inmutable en operación normal.** El reservorio NO se edita, NO se sincroniza, NO se empaqueta. Solo se lee en emergencia.
2. **Solo versiones verificadas.** Solo entra al reservorio código que pasó `test:sync-clinical` (44/44) + `cargo check` (EXIT 0) + `_connectivity-orchestrator-check` (111/111).
3. **Versionado explícito.** Cada snapshot lleva tag de versión OTA + commit hash + fecha.
4. **Aislamiento físico.** El reservorio vive fuera del árbol de trabajo (`app/`, `src/`), en un directorio protegido que NO se incluye en sync ni en build.
5. **Activación manual.** Solo AM-1 (Decisión) autoriza activar el reservorio. No es automático.

## 3. Estructura propuesta

```
reservorio/
├── README.md                 # índice de snapshots + procedimiento de activación
├── v1.0.234/                 # snapshot verificado (release actual)
│   ├── commit.txt            # hash del commit
│   ├── fecha.txt             # 2026-10-29
│   ├── verificacion.txt      # salida de tests (44/44, 111/111, cargo EXIT 0)
│   ├── app/                  # copia completa de app/ en ese commit
│   ├── src/                  # copia completa de src/ en ese commit
│   └── src-tauri/            # copia de src-tauri/ (Cargo.toml + src/)
└── v1.0.235/                 # siguiente snapshot verificado
    └── ...
```

## 4. Procedimiento de creación de snapshot

1. Verificar que el árbol está limpio: `git status` sin cambios sin commitear (congelar WIP).
2. Ejecutar gate completo:
   - `npm run test:sync-clinical` → 44/44
   - `node scripts/_connectivity-orchestrator-check.mjs` → 111/111
   - `cargo check` (con PATH MSVC) → EXIT 0
3. Crear directorio `reservorio/v<version>/`.
4. Copiar `app/`, `src/`, `src-tauri/` (excluyendo `target/`, `node_modules/`).
5. Guardar `commit.txt`, `fecha.txt`, `verificacion.txt`.
6. Guardar memoria en Synapse: `npm run synapse:remember -- --path crozzo/reservorio --title "Snapshot v<version>" --content "..."`.
7. **NO commitear** el reservorio al repo principal (está en `.gitignore` o en repo separado).

## 5. Procedimiento de activación (emergencia)

**Solo AM-1 autoriza.** Ejecutar en estación afectada:

1. Detener la app.
2. Renombrar árbol actual: `mv "sistema pos" "sistema pos.broken-<fecha>"`.
3. Copiar snapshot: `cp -r reservorio/v<version> "sistema pos"`.
4. Verificar: `npm run test:sync-clinical` → 44/44.
5. Arrancar app y validar flujo crítico (login, venta, cobro, impresión).
6. Documentar en bitácora: qué falló, qué snapshot se activó, por qué.

## 6. Mantenimiento

- **Frecuencia:** crear snapshot tras cada release verificado (v1.0.234, v1.0.235, ...).
- **Retención:** mantener últimos 3 snapshots + el último "estable conocido" (v1.0.234 actual).
- **Limpieza:** AM-2 autoriza borrar snapshots antiguos (> 3 versiones).
- **Verificación periódica:** cada 30 días, re-ejecutar gate sobre el snapshot más antiguo para confirmar que sigue válido.

## 7. Relación con otros mecanismos

| Mecanismo | Propósito | Relación con Reservorio |
|---|---|---|
| Git (rama `wip/macro-20261029`) | Historial de desarrollo | Reservorio es copia física, no depende de git |
| OTA (v1.0.234, firma A0EE) | Actualización remota | Reservorio es fallback si OTA rompe |
| Synapse (memoria) | Contexto/decisiones | Reservorio guarda código, Synapse guarda conocimiento |
| `reservorio/` (existente, si hay) | Copias de respaldo antiguas | Reforzar: migrar a esta estructura versionada |

## 8. Estado actual

- **NO existe** `reservorio/` versionado en el repo actual (los directorios mencionados en AGENTS.md no están presentes).
- **Acción inmediata:** crear primer snapshot `v1.0.234` siguiendo §4, para tener un punto de recuperación real.
- **Responsable:** G7 DOCTRINA (documentación) + AM-2 (validación).

## 9. Refuerzo teórico (lo que el usuario pidió)

El concepto de "casas que funcionaron en algún momento" se formaliza aquí como **snapshots versionados e inmutables**, con:
- Verificación obligatoria antes de entrar.
- Activación manual y documentada.
- Aislamiento físico del árbol de trabajo.
- Trazabilidad (commit, fecha, evidencia de tests).

Esto convierte "código viejo que funcionaba" en un **sistema de recuperación de primer nivel**, no en desorden. El reservorio deja de ser "basura acumulada" y pasa a ser "última línea de defensa".

---

**Próximo paso sugerido:** crear el primer snapshot `v1.0.234` siguiendo §4, antes de cualquier cambio mayor (P0-16, F10, F11). Así, si algo se rompe, hay un punto de retorno verificado. ¿Lo ejecuto?