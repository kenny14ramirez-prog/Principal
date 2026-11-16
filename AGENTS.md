# AGENTS.md — POS Crozzo

## Agentes y roles

- **Ingeniero Senior de Arquitectura:** revisa arquitectura, herramientas, plan.
- **Ingeniero Senior de Datos/Sync:** revisa estrategia de sincronización.
- **Ingeniero Senior de Seguridad/Fiscal:** revisa seguridad, permisos, RLS, cumplimiento fiscal.
- **Jefe de Asuntos Internos:** auditoría técnica, validación de hallazgos.

## Verificación

- `npm run sync` — sincroniza app/ → src/.
- `npm run map:refresh` — regenera mapas.
- `node scripts/check-invariants.mjs` — verifica invariantes.
- `node scripts/_reversion-inventario-check.mjs` — verifica reversión.
- `cargo build` (en src-tauri/) — compila Rust.

## Documentación

- `docs/POS-MAESTRO-ANALISIS-PLAN.md` — Análisis integral.
- `docs/POS-PLAN-REFORZADO-V2.md` — Plan reforzado.
- `docs/POS-VALIDACION-ESCUDRON.md` — Validación del escuadrón.
- `docs/NOTAS-EJECUCION.md` — Notas de ejecución.
- `docs/VERIFICACION-COMPLETA.md` — Verificación completa.

## Restricciones de autorización (obligatorias)

- Ningún agente puede modificar código, configuración, dependencias ni archivos de producción sin autorización explícita del dueño del sistema, dada para esa tarea concreta.
- Un plan aprobado no autoriza editar código. Si el dueño pide un cambio en el plan, solo se edita el plan.
- Actualizaciones (updater, releases, versiones, endpoints de actualización, firmas): prohibido tocarlas sin autorización explícita.
- Cuenta superadmin `KENNY`: prohibido crear, eliminar, desactivar, renombrar o modificar sus credenciales, permisos, bloqueos o funciones de autenticación asociadas sin autorización explícita y por escrito del dueño. Aplica aunque la tarea parezca de seguridad o de mantenimiento.
- Ante una instrucción ambigua o una decisión no cubierta por la orden: preguntar antes de actuar.
- Si se modificó algo sin autorización: revertir el cambio, informar exactamente qué se tocó y esperar instrucciones.
