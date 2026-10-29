# CERTIFICACIÓN — BONA origen / Crozzo POS

| Campo | Valor |
|---|---|
| Producto | BONA origen `1.0.231` (identifier `com.crozzo.pos`) |
| Árbol auditado | `src/` (Tauri `frontendDist: "../src"`) |
| Commit base | `f59eabd` — 2026-10-27T18:01:33-05:00 |
| Árbol de trabajo | **SUCIO**: 45 rutas sin commitear (+ arnés F10 y documentación de esta auditoría) |
| Fecha de esta acta | 2026-10-28 |
| Auditor | Estado Mayor + Asuntos Internos (3 equipos) |

---

## ESTADO: ❌ NO CERTIFICADO

Ninguna fase F0–F11 tiene PASS certificable hoy. Lo que existe es **código avanzado**, no producto verificado.

### Pruebas NO ejecutadas o NO válidas

| Área | Estado | Motivo |
|---|---|---|
| Compilación Rust (`cargo check`) | **BLOQUEADA** | `tauri-winres`: falta `RC.EXE` / `link.exe` |
| Servidor LAN/WS real (Tauri) | **NO EJECUTADO** | Depende de la compilación bloqueada |
| 100 dispositivos | **EMULADO** | El test corre 2 PCs + 4 tablets contra `field-mock-lan-central` |
| WebSocket con clientes | **FALLA** | `try_lock` + `Handle::block_on` (`crozzo_lan_ws.rs:39-45`) |
| Aislamiento por mesa | **FALLA** | 12 checks de 111 (`_connectivity-orchestrator-check`) |
| Impresoras POS / BLE / LAN nativa | **NO AUDITABLE** | El arnés es Chromium, sin puente Tauri |
| Contingencia fiscal | **NO EMBARCADA** | Solo en `app/index.html`; ausente en `src/index.html` |
| OCR de facturas | **NO EMBARCADO** | Solo en `app/index.html` |
| Auditoría de personas | **INCOMPLETA** | Ver `docs/maps/ops/AUDITORIA-PRINCIPAL-2026-10-28.md` §9 |
| Cierre de caja / CUFE / DIAN real | **NO EJECUTADO** | Requiere PT y sede |

### Evidencia que NO certifica

- `agents/runs/**` — guiones narrativos (sin commit, comando ni hash).
- `CONTINUIDAD-OPORD.md` — histórico: «COMPLETO» = código entregado.
- `test:fleet-escala` — mock HTTP en memoria: sin WS, auth, persistencia ni concurrencia real.
- `ceo-qa.mjs` — caído (`Assignment to constant variable`).

### Condiciones mínimas para emitir certificación

1. Congelar el árbol (commit + hash) y usarlo como línea base única.
2. Unificar el HTML canónico y hacer que `sync` **falle** si el set de scripts difiere.
3. Verificar dentro del APK/instalador que los módulos fiscales y de archivo están presentes.
4. Desbloquear el toolchain Rust y correr el servidor real con 10 dispositivos físicos (N5).
5. Cerrar los P0 1–8 de la auditoría principal.
6. Repetir F10 con evidencia `docs/maps/ops/evidencia/<TASK-ID>/` y gate *fail-closed*.

> **Regla:** todo ✅ sin comando, salida y hash en el mismo bloque es mercancía no verificada.
