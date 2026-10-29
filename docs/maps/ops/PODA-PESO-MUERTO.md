# PODA DE PESO MUERTO — TAURI

| Campo | Valor |
|---|---|
| Operación | MISIÓN CIEN · Operación Peine |
| Fecha | 2026-10-29 |
| Principio | Tauri es el único runtime. Lo que no sirve a Tauri se archiva o se elimina. |

> **Regla:** nada se borra sin verificar que no se carga en `src/index.html` ni en `CrozzoLazyModules.js` ni por `createElement('script')` dinámico. Cada poda tiene un PASS medible.

---

## §1 · CANDIDATOS A PODA (verificados)

### A. Directorio `app/` — 60 MB — ELIMINAR (archivar antes)

| Dato | Valor |
|---|---|
| Tamaño | 59.992.083 B (~60 MB) |
| Scripts en `app/index.html` | 179 |
| ¿Se empaqueta? | **No.** `tauri.conf.json:7` → `frontendDist: "../src"` |
| ¿Se usa en build? | Solo por `scripts/sync-frontend-to-src.mjs` (genera `src/index.html` desde `app/Crozzo_POS_Completo.html`) |
| ¿Es necesario para Tauri? | **No**, si se deja de usar el sync y se mantiene `src/` directamente |

**Riesgo:** perder la "fuente de verdad" del navegador (abandonado). Mitigación: archivar en branch `archive/browser-legacy` antes de borrar.

**PASS:** `git rm -r app/` + `git commit` + build sigue funcionando (`npm run tauri build` exit 0).

**Esfuerzo:** 1 h. **Valor:** 60 MB, elimina la confusión de dos árboles.

---

### B. `src-tauri/target/` — 26 GB — LIMPIAR

| Dato | Valor |
|---|---|
| Tamaño | 26.118.009.627 B (~26 GB) |
| Contenido | `debug/` (binario 1.0.231) + `release/` (10 instaladores 1.0.51–1.0.109) + cache de dependencias |
| ¿Es código? | No. Son artefactos de compilación |

**Recomendación:** `cargo clean` (elimina todo) o borrar `target/release/bundle` (instaladores viejos) y `target/debug` (si no se necesita debugging). Mantener `target/release` del último build bueno.

**PASS:** `cargo build` sigue funcionando; espacio liberado ≥20 GB.

**Esfuerzo:** 5 min. **Valor:** 20+ GB liberados.

---

### C. Root-level stale `.js` en `src/` — 362 KB — ELIMINAR

| Archivo | Tamaño | ¿Se carga en `src/index.html`? |
|---|---|---|
| `src/CrozzoPosMain.js` | 1.012.628 B | **No** (carga `core/CrozzoPosMain.js`) |
| `src/CrozzoModulosIntegrados.js` | 40.9 KB | No |
| `src/CrozzoModulosIntegradosAcceso.js` | 40.2 KB | No |
| `src/CrozzoModulosIntegradosPedidos.js` | 23.5 KB | No |
| `src/CrozzoSistemaCostos.js` | 36.4 KB | No |
| `src/CrozzoPlanilla2026.js` | 49.1 KB | No |
| `src/CrozzoReservorio.js` | 23.9 KB | No |
| `src/CrozzoReservorioOffline.js` | 5.9 KB | No |
| `src/CrozzoReservorioSql.js` | 11.7 KB | No |
| `src/CrozzoComprasLocal.js` | 10.6 KB | No |
| `src/CrozzoCostosEngine.js` | 8.0 KB | No |
| `src/CrozzoCentroCompras.js` | 12.8 KB | No |
| `src/CrozzoCentroProcesos.js` | 25.8 KB | No |

**Riesgo:** bajo (no se cargan), pero el duplicado `CrozzoPosMain.js` es una trampa para parches por búsqueda de texto.

**PASS:** `Get-ChildItem src -Filter CrozzoPosMain.js` → 0 resultados en la raíz; build sigue funcionando.

**Esfuerzo:** 2 h (verificar que ninguno se carga dinámicamente). **Valor:** 362 KB + elimina la trampa.

---

### D. Módulos no referenciados (G2) — 36 módulos, ~636 KB — AUDITAR Y PODAR

G2 identificó 36 módulos no referenciados por `src/index.html` ni por `CrozzoLazyModules.js`. Algunos se cargan dinámicamente (bundles). Candidatos a poda confirmados (0 referencias en todo el corpus):

| Módulo | Tamaño | Verificado sin refs |
|---|---|---|
| `modules/CrozzoOcrFactura.js` | 8.4 KB | 0 refs → **OCR muerto en Tauri** |
| `modules/CrozzoContingenciaFiscal.js` | 9.8 KB | 0 refs → **necesario (P0 nº3), hay que EMBARCARLO, no podarlo** |
| `modules/CrozzoBlobStore.js` | 12.9 KB | 1 ref (string) |
| `modules/CrozzoComandaArchive.js` | 13.7 KB | 1 ref (string) |

**Decisión:** `CrozzoContingenciaFiscal.js` se embarca (F6), no se poda. `CrozzoOcrFactura.js` se poda si OCR no es feature core (o se hace plugin lazy). Los demás se auditan uno por uno.

**PASS:** cada módulo podado tiene 0 referencias en `src/` y el build pasa.

**Esfuerzo:** 1 d. **Valor:** hasta 636 KB.

---

### E. Vendor OCR — ~50 MB — CONVERTIR A PLUGIN LAZY O ELIMINAR

| Componente | Tamaño | Usado por |
|---|---|---|
| Tesseract core (6 variantes wasm) | ~24 MB | `CrozzoTesseract.worker.min.js` (lazy) |
| OpenCV | ~9 MB | `CrozzoOcrFactura.js` (no cargado) |
| Tesseract worker + min | ~0.2 MB | lazy |

**Decisión:** como `CrozzoOcrFactura` no se carga en `src/index.html`, el OCR completo es peso muerto para el arranque. Opciones:
- **A:** Eliminar OCR del build (amputar) → -50 MB.
- **B:** Hacer OCR un plugin que se descarga on-demand → mantiene la feature sin bloat.

**Recomendación:** Opción B si OCR es feature de negocio; Opción A si no lo es. Decidir en F0.

**PASS:** Si se elimina, no hay referencias rotas. Si se hace plugin, el módulo se carga solo cuando se invoca.

**Esfuerzo:** 2 d (plugin) o 1 h (amputar). **Valor:** hasta 50 MB.

---

### F. Print temp files — 1.2 MB — LIMPIAR EN STARTUP

18 archivos `crozzo-print/pdf-*.html` en `%LOCALAPPDATA%`. No se borran nunca.

**Fix:** añadir limpieza en startup de la app (Rust `std::fs::remove_dir_all` o JS `localStorage` cleanup).

**PASS:** tras arrancar la app, no quedan archivos `crozzo-print/pdf-*.html` de sesiones anteriores.

**Esfuerzo:** 1 h. **Valor:** 1.2 MB + higiene.

---

### G. IndexedDB huérfanos — dev artifacts — LIMPIAR

`http_127.0.0.1_1430/1431/1432`, `localhost_1420` — artefactos de `tauri dev`.

**Fix:** borrar manualmente (no es código, es perfil de dev).

**Esfuerzo:** 5 min. **Valor:** higiene.

---

### H. `releases/latest.json` — 7.9 KB — ARCHIVAR O ELIMINAR

No es el feed Tauri (sin `platforms`). Es el aviso JS (`CrozzoSystemUpdates.js`). Misleading.

**Fix:** renombrar a `releases/legacy-notice.json` o eliminar si el aviso JS se retira.

**Esfuerzo:** 15 min.

---

### I. `src-tauri/permissions/crozzo-emulation.toml` — 5 comandos sin capability

Define 5 comandos de emulación que ninguna capability activa. O se activan (para QA) o se eliminan.

**Fix:** decidir en F0. Si se eliminan, también se elimina `CrozzoEmulationHarness.js` (o se deja como código muerto).

**Esfuerzo:** 1 h.

---

### J. `docs/maps/CONTINUIDAD-OPORD.md` — degradado, ya marcado histórico

Ya tiene banner «NO CERTIFICA». Archivar en `docs/maps/ops/historico/` para no confundir.

**Esfuerzo:** 5 min.

---

## §2 · RESUMEN DE PODA

| Candidato | Tamaño | Riesgo | Esfuerzo | Decisión |
|---|---|---|---|---|
| A. `app/` | 60 MB | Bajo (archivar antes) | 1 h | **Archivar + eliminar** |
| B. `target/` | 26 GB | Bajo | 5 min | **Limpiar** |
| C. Root stale `.js` | 362 KB | Bajo | 2 h | **Eliminar** |
| D. 36 módulos no referenciados | 636 KB | Medio | 1 d | **Auditar y podar** |
| E. Vendor OCR | ~50 MB | Alto | 2 d o 1 h | **Decidir en F0** |
| F. Print temp files | 1.2 MB | Bajo | 1 h | **Limpiar en startup** |
| G. IndexedDB huérfanos | dev artifacts | Bajo | 5 min | **Limpiar** |
| H. `releases/latest.json` | 7.9 KB | Bajo | 15 min | **Archivar o eliminar** |
| I. `crozzo-emulation.toml` | 5 comandos | Medio | 1 h | **Decidir en F0** |
| J. `CONTINUIDAD-OPORD.md` | histórico | Bajo | 5 min | **Archivar** |

**Poda mínima (sin riesgo):** A + B + C + F + G + H + J → **~86 MB + 26 GB liberados**, eliminando la trampa del duplicado `CrozzoPosMain.js`.

**Poda completa (con decisión):** + D + E + I → hasta **~137 MB** adicionales, si se amputa OCR.

---

## §3 · INTEGRACIÓN EN EL PLAN QUIRÚRGICO

La poda se ejecuta como **F0.5** (entre F0 y F1), después de congelar y antes de compilar. No se poda nada que no esté verificado como no cargado. Cada poda tiene su PASS medible.

**F0.5 · Poda de peso muerto**
- Duración: 1 d
- Requiere: F0 completado (base congelada)
- Dueño: 1 dev + 1 verificador
- Tareas: ejecutar podas A–J en orden, verificar build después de cada una.
- PASS: `npm run tauri build` exit 0 tras cada poda; `git status` limpio; tamaño del árbol reducido según tabla.
- FAIL: si cualquier poda rompe el build → revertir ese commit y documentar.

---

## §4 · LO QUE NO SE PUEDE PODAR (y por qué)

| Componente | Por qué no se poda |
|---|---|
| `src/core/CrozzoPosMain.js` (2,4 MB) | Es el core del POS. Se carga en `index.html:1146` |
| `src/bundles/*.js` (2 MB) | Se cargan dinámicamente (lazy) |
| `src/vendor/*.js` (38 MB) | Usados por bundles (OCR, PDF, Tesseract) |
| `src-tauri/src/*.rs` (26 archivos) | Código nativo, todos necesarios |
| `app/` (sin archivar antes) | Es la única referencia del navegador abandonado |

---

## §5 · DECISIÓN REQUERIDA DEL COMANDANTE

Antes de F0.5, el comandante debe decidir:

1. **¿OCR es feature core?** Si sí → plugin lazy. Si no → amputar (ahorra 50 MB).
2. **¿Se archiva `app/` o se mantiene como referencia?** Recomendación: archivar en branch, eliminar del working tree.
3. **¿Se elimina `CrozzoEmulationHarness.js` si se elimina `crozzo-emulation.toml`?** Recomendación: sí, para no dejar código muerto.

Sin estas tres decisiones, F0.5 no puede cerrarse.
