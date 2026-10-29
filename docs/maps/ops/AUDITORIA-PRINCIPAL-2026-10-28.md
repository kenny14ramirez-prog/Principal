# AUDITORÍA PRINCIPAL — OPERACIÓN «MISIÓN CIEN»

| Campo | Valor |
|---|---|
| Fecha | 2026-10-28 |
| Auditor | Estado Mayor (AM-2) |
| Árbol | `task/aligned-20260727` @ `f59eabd` + cambios sin commitear |
| Método | Verificación directa en código y ejecución de suites. No se aceptó ningún documento como evidencia. |
| Alcance | Hechos H-01…H-12 del OPORD + validez de la evidencia de auditoría existente |

> **Regla aplicada:** un hecho solo es VERIFICADO si se reprodujo con comando o se citó archivo:línea en el árbol actual. Si el OPORD afirmaba algo y el código dice otra cosa, manda el código.

---

## 0. RESUMEN EJECUTIVO

| Pregunta | Respuesta |
|---|---|
| ¿El producto está certificado? | **NO.** `docs/maps/CERTIFICACION.md` |
| ¿Se puede declarar «auditado»? | **NO.** La evidencia previa es narrativa; la nueva detecta fallos que nadie había tocado |
| ¿F10 (personas) es ejecutable? | **Parcialmente.** Corrió sobre `src/`: **PASS=10 / FAIL=6**. El cobro no genera factura |
| ¿La app instalada es la que se audita? | **Ahora sí.** Auditoría reorientada a `src/` (Tauri). Antes se auditaba `app/`, que no se empaqueta |
| ¿Escala 100 probada? | **NO.** Máximo real: 10 dispositivos contra mock |
| ¿Riesgo #1? | Factura timbrada que no se persiste + wizard de cobro vacío → pérdida de venta o CUFE duplicado |

**Tres hallazgos que cambian el plan:**

1. **Cobro roto en el árbol desplegado**: el wizard abre vacío (0 caracteres, 0 inputs) y `facturas` no crece. En `app/` la UI incluso anuncia «Cobro registrado».
2. **Cadena fuente→build cortada**: Tauri sirve 151 scripts desde `src/`; contingencia fiscal, OCR y archivo de comandas solo existen en `app/index.html`. El APK no los lleva.
3. **La evidencia histórica no vale**: `jornada-simulator` no navega (comandas=0, ventas `Math.random()`); `test:fleet-escala` corre 6 equipos contra un mock.

**Cinco órdenes inmediatas:** congelar el árbol → unificar HTML canónico con gate de scripts → cerrar persistencia post-timbrado y wizard de cobro → desbloquear Rust → repetir F10 con evidencia y 10 dispositivos físicos.

---

## 1. RESULTADO GLOBAL

| Veredicto | Valor |
|---|---|
| Hechos del OPORD verificados | **9 / 12** |
| Hechos corregidos (el OPORD exageraba o erraba) | **2** |
| Hechos no verificables en este entorno | **1** |
| Estado de la campaña | **NO CERTIFICADA** — hay operación funcional, no hay evidencia de escala real |
| Riesgo dominante | La evidencia de auditoría existente es **mayoritariamente narrativa**, no ejecución real |

---

## 2. HECHOS VERIFICADOS

| ID | Afirmación | Evidencia reproducida | Veredicto |
|---|---|---|---|
| H-01 | `Handle::block_on` dentro de contexto async en el broadcast WS | `src-tauri/src/crozzo_lan_ws.rs:45` — `if handle.block_on(w.send(...))` | ✅ VERIFICADO |
| H-02 | HTTP sin keep-alive | `crozzo_lan_sync_server.rs:308` — `Connection: close` en cada respuesta | ✅ VERIFICADO |
| H-03 | Semáforo fijo en 64 | `crozzo_lan_sync_server.rs:34` — `MAX_CONCURRENT_HTTP: usize = 64` | ✅ VERIFICADO |
| H-04 | Estado caliente en `localStorage` (~5 MB) | `CrozzoStorageHygiene.js:9` + `trimPosRuntimeSnapshot` | ✅ VERIFICADO (ver §4.1) |
| H-05 | Secreto de emparejamiento hardcodeado | `CrozzoPairingSeal.js:14` — `PAIR_KDF_PASS = 'CrozzoBonaOrigenPairSeal2026'` | ✅ VERIFICADO |
| H-06 | Auth LAN opcional + GET abiertos | `crozzo_lan_sync_server.rs:852` — `auth_token.is_empty() \|\| ...`; comentario en 848–850 confirma GET abiertos | ✅ VERIFICADO |
| H-08 | Malla BLE multi-salto pero solo relaya identidad | `CrozzoBleMesh.js:11` `MAX_HOPS=12`; `:23` `RELAY_KINDS = { MESH_NAME_CHANGE: 1 }` | ✅ VERIFICADO |
| H-10 | No existe rol C | `CrozzoBlePeerRegistry.js:125` — `md.role === 'B' ? 'B' : 'A'` (sin rama C) | ✅ VERIFICADO |
| H-11 | Rust no compila en este entorno | `cargo check` → `tauri-winres`: «Are you sure you have RC.EXE in your $PATH…» | ✅ VERIFICADO (bloqueo ambiental) |
| H-12 | `_connectivity-orchestrator-check` con 12 fallos | Ejecutado: **12 fallos / 111 checks** | ✅ VERIFICADO |

---

## 3. HECHOS CORREGIDOS (el OPORD estaba mal)

| ID | Lo que decía el OPORD | Lo que dice el código | Corrección |
|---|---|---|---|
| H-07 | «Cola fiscal **sin** bloqueo de concurrencia; dos drains pueden reenviar la misma factura» | `CrozzoFiscalOutboxDrain.js:9` declara `__draining`; `:99` corta con `{ ok:false, reason:'busy' }`; `:102` lo activa; `:132` lo libera | ❌ **FALSO parcialmente.** Sí hay lock **en proceso**. Lo que falta es lock **entre pestañas/procesos** (dos ventanas del POS, o Tauri + pestaña). Severidad baja de 🟠 a 🟡, pero el riesgo de CUFE duplicado por doble instancia sigue abierto |
| H-09 | «Failover solo a backup fijo, sin elección por capacidad ni epoch» | `CrozzoCentralFailover.js:33` exige `isBackup && isDesktop`; `:51` `PROMOTE_HOLD_MS=18000`; sin `epoch` en todo el archivo | ✅ **CONFIRMADO** pero el OPORD omitía que ya existe *hold* de 18 s (mitiga flapping). La ausencia real es **epoch/fencing** y **elección por capacidad** |

> **Lección de auditoría:** el OPORD se redactó sobre un resumen previo, no sobre lectura línea a línea. Dos afirmaciones eran imprecisas. Esto valida la orden de que **ningún general herede hallazgos sin re-verificarlos**.

---

## 4. HALLAZGOS NUEVOS (no estaban en el OPORD)

### 4.1 La prueba de «100 dispositivos» no prueba 100 dispositivos

| Dato | Valor real |
|---|---|
| Nombre del test | `test:fleet-escala` — «Techo diseño: 100 dispositivos» |
| Preset ejecutado | `pcs: 2`, `tablets: 4` → **6 dispositivos** |
| Horizontes ejecutados | 2, 5 y 10 dispositivos |
| Servidor | `field-mock-lan-central.mjs` (mock), no el Rust real |
| Resultado | `OK=10 FAIL=0 · APROBADA` |

**Consecuencia:** el sistema puede declararse «probado a 10 dispositivos contra un mock». **No** está probado a 100, ni contra el servidor real, ni con WebSocket, auth, persistencia o concurrencia reales.

Evidencia: `scripts/_qa-out/fleet-escala-latest.json` → `preset`, `horizons[].tiers[].devices` (máximo 10), `designCeiling: 100` es una etiqueta, no una carga.

### 4.2 La auditoría de personas existente es narrativa

| Dato | Valor real |
|---|---|
| Reporte | `agents/runs/jornadas-reales/JORNADA-REAL-LUNES-…19-05-36.md` |
| «Facturas atendidas» | 48 |
| «Comandas enviadas» | **0** |
| «Ventas acumuladas» | $2.344.171 COP |
| Errores detectados | 0 |

Un turno que declara 48 facturas y **cero comandas enviadas** no ejecutó el flujo real de mesero→cocina→caja. Los totales se generan en el simulador, no se leen de la base. El veredicto «SIN ERRORES» mide el guion, no el sistema.

**Consecuencia:** no existe hoy una auditoría de personas que pueda citarse como evidencia de confiabilidad. Hay que reconstruirla (ver §7 y el informe de G6).

### 4.3 Fallo real de aislamiento por mesa

`_connectivity-orchestrator-check` falla exactamente en:

- `Por-mesa: meta sin carritos — meta limpia`
- `Por-mesa: round-trip mesa 5 — carrito intacto`
- `Por-mesa: round-trip llevar — L1 intacto`
- `Por-mesa: round-trip directo — directo intacto`
- `Por-mesa: meta restaurada — estado global intacto`
- (+7 checks derivados, total 12)

Esto es **el escenario del mesero que pierde el pedido al cambiar de mesa** — el error humano EH-02 de la auditoría. No es un test obsoleto: es un fallo de aislamiento de carritos entre mesas.

### 4.4 El árbol de trabajo no está congelado

`git status --porcelain` muestra **45 rutas sin commitear** (modificados en `app/` con espejo en `src/` + nuevos: reescritura de cascada, OCR, arnés `agents/`, `config/` y los documentos de esta operación).

**Consecuencia:** cualquier medición de «antes/después» es irreproducible hoy. F0-T01 (congelar) no es burocracia: es requisito de validez.

---

## 5. ESTADO REAL DE LA CAMPAÑA (vs. lo declarado)

| Declarado en `CONTINUIDAD-OPORD.md` | Verificado en disco | Diferencia |
|---|---|---|
| H0–H2, H3a, L★, POE completos (15 frentes) | Existen los módulos y los tests listados | ✅ Coincide |
| «L★ Conectividad legendaria … + flota 100» | `test:fleet-escala` corre a **10** dispositivos contra mock | ❌ Sobrestimación |
| `test:sync-clinical` como gate | El gate no incluye `_connectivity-orchestrator-check` (12 fallos) | ❌ El gate no cubre el fallo de mesas |
| Auditoría humana con curva de aprendizaje | `jornada-simulator` genera relato; «comandas enviadas: 0» | ❌ Evidencia no válida |

**Traducción operativa:** el producto está avanzado en funcionalidad; la **certificación** está al inicio.

---

## 6. CONFLICTO DE MANDO DETECTADO

Existen dos documentos de campaña con nomenclaturas paralelas:

- `docs/maps/CONTINUIDAD-OPORD.md` → fases **H0–H4 / L★ / POE** (campaña histórica)
- `docs/maps/OPORD-MISION-CIEN-100.md` → fases **F0–F11** (esta operación)

Sin reconciliación, dos agentes pueden editar el mismo archivo creyendo estar en campañas distintas. **Resuelto el 2026-10-28:** el OPORD incorpora el **§0 de reconciliación** (12 reglas), `CONTINUIDAD-OPORD.md` queda marcado como histórico y `AGENTS.md` deja de enviarlo como primera lectura. La nomenclatura única es `F#-T##`.

---

## 7. ÓRDENES EMITIDAS

| General | Misión | Estado |
|---|---|---|
| G2 SYNC | Contrato de datos, secuencia, dedup, delta | Informe recibido · IA **A−** |
| G3 COMMS | Cascada, failover, BLE, gateway/lease | Informe recibido · IA **B** |
| G4 SEC/FISC | Emparejamiento, token LAN, CUFE, contingencias | Informe recibido · IA **B−** |
| G5 PERF | Presupuesto de recursos, timers, retención | Informe recibido · IA **C+** |
| G6 QA | Validez de evidencia + auditoría ejecutable | Informe recibido · IA **B−** |
| G7 DOCTRINA | Reconciliación documental | Informe recibido · IA **C** |

Los seis operaron en **solo lectura** y devolvieron hallazgos con evidencia, paquete de tareas y PASS medibles. Todo pasó por Asuntos Internos (§8) antes de convertirse en orden.

---

## 8. INFORMES DE GENERALES (consolidado)

Seis generales operaron en **solo lectura**. Tres equipos de Asuntos Internos (IA-1, IA-2, IA-3) verificaron cada afirmación abriendo el archivo en la línea citada; un general de Asuntos Internos consolidó el veredicto.

### 8.1 Veredicto por general

| General | Dominio | Calidad IA | Afirmaciones falsas | Omisión que cambia el plan | Confianza para ejecutar |
|---|---|---|---|---|---|
| **G2 SYNC** | Contrato de datos, secuencia, delta, dedup | **A−** | 0 / 12 | `upsert_comanda_snapshot` descarta estado si la fila no existe; `/api/comandas` finge frescura (`saved_at=now_ms`); hash Rust UTF-8 vs JS UTF-16 divergen | Alta (75%), con enmienda |
| **G3 COMMS** | Cascada, failover, BLE, gateway | **B** | 0 (B4/B5 con severidad inflada) | No cruzó el digest con el contrato Rust; confió en el intervalo nominal sin medir el piso real | Media (55%) |
| **G4 SEC/FISC** | Cifrado, claves, cola fiscal | **B−** | 1: «contingencia sin llamadores» | El módulo existe y tiene llamador en test, pero **no está embarcado**; `config.save()` no es silencioso: es tardío (post-timbrado) | Baja (35%) |
| **G5 PERF** | RAM/CPU/disco, timers, retención | **C+** | 2: «700 ms fijo», «save silencioso» | `ComandaArchive`/`BlobStore` no están en el índice de arranque | Media (55%) |
| **G6 QA** | Validez de evidencia, auditoría humana | **B−** | 1: `ceo-qa` «narrativo» (está **caído**) | No vio que audita un árbol distinto al que se compila; el gate no cubre los 12 fallos de mesa | Baja (30%) |
| **G7 DOCTRINA** | Reconciliación documental | **C** | 0 | No vio la fractura `app/index.html` vs `app/Crozzo_POS_Completo.html` | Baja-media (45%) |

### 8.2 Arbitraje de discrepancias (versión oficial)

| Disputa | Versión oficial | Razón verificada |
|---|---|---|
| ¿Contingencia fiscal integrada? | **Existe, tiene llamadores, NO se embarca** | Solo en `app/index.html:1211`; el build sale de `app/Crozzo_POS_Completo.html` → `src/index.html`, que no la incluye |
| ¿`config.save()` falla en silencio? | **No silencioso, pero posterior al timbrado** | `save()` solo hace `localStorage.setItem` (`CrozzoPosConfigManager.js:453`); se llama tras `timbrarFactura` (`CrozzoPosMain.js:33249,33301`) y el `catch` muestra toast (`:33365`): el daño ya ocurrió |
| ¿`ceo-qa` narrativo o caído? | **Caído** | `const result` (`ceo-qa.mjs:87`) se reasigna en `:100` → `Assignment to constant variable`; 6/6 P0 en el run real |
| ¿100 dispositivos probados? | **No. 10 como máximo, contra mock** | Preset normal llega a 10 (`qa-fleet-matrix.mjs:14`); el intensivo declara 50/100 sin artefacto |
| ¿Timers de 700 ms? | **Nominal 650/1800; efectivo 700–3200 / 1800–4800** | `CrozzoLanOpsSync.js:380-389` aplica piso y factor por flota |
| ¿`BlobStore` inerte? | **No cargado al arranque** | `src/index.html` no lo referencia; se activa bajo demanda al abrir el bundle de reservorio |

### 8.3 Lista P0 consolidada (ordenada por pérdida real)

| # | Riesgo | Evidencia | Dueño |
|---|---|---|---|
| 1 | **Factura timbrada con CUFE no se persiste** y el carrito no se limpia → recobro o CUFE duplicado | `CrozzoPosMain.js:33249,33301`, `catch :33365`; `CrozzoPosConfigManager.js:453` | G4/G2 |
| 2 | **Se audita un árbol que no se instala**: el APK se compila de 155 scripts; el «integrado» tiene 179 | `sync-frontend-to-src.mjs:140,223`; `tauri.conf.json:7` | G6/G7 |
| 3 | **Contingencia fiscal fuera del APK**: caída DIAN deja venta sin cola legal | `app/index.html:1211`; ausente en `src/index.html` | G4 |
| 4 | **Lock fiscal solo en proceso**: dos ventanas/instancias pueden doble-timbrar | `CrozzoFiscalOutboxDrain.js:9,99` | G4 |
| 5 | **`upsert_comanda_snapshot` descarta el estado** si la fila no existe → comanda atascada o perdida | `crozzo_lan_sync_server.rs:434` | G2 |
| 6 | **Aislamiento por mesa falla 12 checks** → pedido perdido o duplicado al cambiar de mesa | `_connectivity-orchestrator-check` (12/111) | G2 |
| 7 | **`saved_at=now_ms()` + digest FNV UTF-8 vs UTF-16** → pull permanente o datos rancios | `crozzo_lan_sync_server.rs:996,216-223`; `CrozzoLanOpsSync.js:410` | G2/G3 |
| 8 | **GET `/api/comandas` sin token** + secreto de pareo hardcodeado → intruso lee o inyecta comandas | `crozzo_lan_sync_server.rs:852,980`; `CrozzoPairingSeal.js:14` | G4 |
| 9 | **QA de personas caído** (6/6 P0): no hay evidencia válida de uso humano | `ceo-qa.mjs:87,100` | G6 |
| 10 | **«100 dispositivos» no probado**: máximo 10, contra mock | `qa-fleet-matrix.mjs:14,23`; `fleet-escala-latest.json` | G6 |

### 8.4 Hallazgo transversal (el que ningún general vio por separado)

**La cadena fuente → build → auditoría está cortada: se certifica un producto que nunca se instala.**

1. Tauri empaqueta `src/` (`tauri.conf.json:7`).
2. `npm run sync` regenera `src/index.html` desde `app/Crozzo_POS_Completo.html` (155 scripts), **no** desde `app/index.html` (179), que es el único con `CrozzoOcrFactura`, `CrozzoContingenciaFiscal` y `CrozzoComandaArchive`.
3. `src/index.html` tiene ediciones que no están en `HEAD`: se editó el artefacto, no la fuente.
4. El workflow de release ejecuta `sync` y compila, pero **no corre pruebas**.

Resultado: el mock de flota, el `ceo-qa` caído y los PASS narrativos validan un árbol que el APK no contiene. Ningún informe aislado vio las tres piezas juntas.

---

## 9. AUDITORÍAS DE PERSONAS

### 9.1 Arnés y árbol

| Campo | Valor |
|---|---|
| Arnés | `scripts/qa-personas-mision-cien.mjs` (Playwright, DOM real, sin APIs internas) |
| Árbol auditado | **`src/`** — el que empaqueta Tauri (`frontendDist: "../src"`) |
| Ejecución | 2026-10-29T02:23Z · Chromium 1366×768 · sin puente nativo |
| Evidencia | `docs/maps/ops/evidencia/F10-AUD-01/src/resultado.json` + `cajero-cobro.png`, `mesero.png`, `cocina.png`, `admin.png` |
| Comparación | `QA_TREE=app` ejecutado antes: PASS=7 / FAIL=5, con `PAGEERROR: Illegal invocation` |

### 9.2 Resultado sobre el árbol desplegado (`src/`)

**PASS=10 · FAIL=6 · pageErrors=0**

| Rol | Check | Veredicto | Dato observado |
|---|---|---|---|
| SISTEMA | Arranque y login | ✅ PASS | pantalla «Inicio de ventas», `localStorage` 37 KB |
| SISTEMA | Sin errores fatales de página | ✅ PASS | 0 `pageerror` (en `app/` sí había `Illegal invocation`) |
| SISTEMA | Puente nativo Tauri | ❌ **FAIL (límite del arnés)** | Sin IPC: impresoras, BLE y LAN nativa **no auditables** en Chromium |
| CAJERO | Abrir POS de restaurante | ✅ PASS | página abierta |
| CAJERO | Carrito legible | ✅ PASS | total $48.000 |
| CAJERO | Agregar producto | ✅ PASS | total $48.000 → $83.000 |
| CAJERO | **Interfaz de cobro utilizable** | ❌ **FAIL** | wizard con **0 caracteres, 0 inputs, 4 botones** |
| CAJERO | **Cobro genera factura** | ❌ **FAIL** | `facturas` 0 → 0 |
| MESERO | Abrir modo tablets | ✅ PASS | página abierta |
| MESERO | Grilla de mesas visible | ✅ PASS | mesas/salón presentes |
| COCINA | Abrir KDS | ✅ PASS | página abierta |
| COCINA | KDS con contenido | ✅ PASS | 751 caracteres operativos |
| ADMIN | **Abrir reportes** | ❌ **FAIL** | **no navega**: el heading sigue en `Tablets` (en la corrida anterior este check dio un PASS falso; se corrigió la aserción) |
| SISTEMA | `localStorage` bajo 5 MB | ✅ PASS | 39.924 B; mayor clave `pos_dian_config` (19.607 B) |
| SISTEMA | **Módulos críticos embarcados** | ❌ **FAIL** | 151 scripts: OCR=false, contingencia=false, archivoComandas=false, blobStore=false |
| EH-01 | Doble toque | ⚠️ **NO CONCLUYENTE** | tras volver al POS no se encontró producto accesible: fallo del arnés, no del sistema |

### 9.3 Interpretación

1. **El cobro está roto en el árbol que se instala.** El botón abre un wizard vacío (sin texto ni campos) y `pos_dian_config.facturas` no crece: la venta no se registra. Ese es el hallazgo de mayor impacto económico de toda la auditoría, y no lo había detectado ningún informe previo porque nadie había hecho clic.
2. **La UI puede mentir.** En la corrida sobre `app/`, el mismo wizard vacío emitió avisos de «✅ Cobro registrado» mientras las facturas seguían en 0. Un cajero creería que cobró.
3. **Administración no es alcanzable** con la navegación estándar etiquetada «Reportes y dashboard» (el clic no cambia de página). Puede ser un ítem duplicado/colapsado, pero el efecto operativo es el mismo: el rol no llega a su pantalla.
4. **Los módulos fiscales no están en el APK** (151 scripts cargados; contingencia, OCR, archivo de comandas y blob store ausentes). Confirma por ejecución el P0 nº2.
5. **Lo que sí funciona**: login, POS de restaurante, carrito, suma de productos, KDS y modo tablets. La base operativa existe; lo que falla es el cierre transaccional.

### 9.4 Errores humanos ejecutados

| Error | Estado |
|---|---|
| EH-01 doble toque | Automatizado, **no concluyente** (sin producto accesible tras volver al POS) |
| EH-02…EH-12 | **NO EJECUTADOS** — requieren hardware (batería, tablet física, desconexión de red) o cobro funcional |

No se declara ningún PASS de personas. **F10 queda ejecutado parcialmente y su veredicto es FAIL.**

---

**Fin de la auditoría principal. Toda modificación requiere nueva versión.**

---

## 10. PROTOCOLO DE AUDITORÍA DE PERSONAS (aprobado)

Arnés: `scripts/qa-personas-mision-cien.mjs` — Playwright sobre el árbol desplegado (`QA_TREE=src` por defecto; `QA_TREE=app` solo para comparar fuente). No usa APIs internas: login, clic, lectura de DOM y `localStorage`.

### 10.1 Reglas de validez

| Regla | Criterio |
|---|---|
| Árbol | `src/` (lo que instala Tauri). Auditar `app/` es medir un producto que no se entrega |
| Evidencia | `docs/maps/ops/evidencia/F10-AUD-01/<árbol>/resultado.json` + PNG por rol |
| Datos | Totales leídos del DOM y de `pos_dian_config`, nunca de contadores del script |
| PASS | Cambio de estado observable ≤5 s **y** sin `pageerror` |
| FAIL | Acción sin efecto, total que no cuadra, excepción de página o diálogo vacío |
| Límite | Sin puente Tauri (Chromium) **no** se auditan impresoras, BLE ni LAN nativa: se declara `NO AUDITABLE`, no `PASS` |

### 10.2 Errores humanos a inyectar (12)

| # | Error | PASS esperado del sistema |
|---|---|---|
| EH-01 | Doble toque en «Cobrar» | 1 sola factura |
| EH-02 | Mesa equivocada (M3 en vez de M5) | Reasignación sin perder ítems |
| EH-03 | Tablet sin batería a mitad de comanda | Comanda recuperada del carrito local |
| EH-04 | Doble toque en «Comandar» | 1 sola comanda |
| EH-05 | Cierre de caja con mesas abiertas | Bloqueo con aviso, no cierre silencioso |
| EH-06 | Anular ítem ya enviado a cocina | Estado de cocina revertido |
| EH-07 | Cambiar precio manual | Exige permiso y queda auditado |
| EH-08 | Wi-Fi desconectado 30 s | Reconexión sin duplicar |
| EH-09 | Apagar tablet durante el cobro | Cobro no queda a medias |
| EH-10 | Dos meseros, misma mesa | Lock visible, sin sobreescritura |
| EH-11 | Pago mixto mal sumado | Bloquea vuelto negativo |
| EH-12 | Cierre y reapertura de caja | Correlativo y arqueo continúan |

### 10.3 Matriz de escala

| Nivel | Dispositivos | Estado hoy | Qué valida de verdad |
|---|---|---|---|
| N1 | 1 | **EJECUTABLE** | POS real en 1 PC |
| N2 | 2 | **REQUIERE HARDWARE** | PC + tablet por Wi-Fi real |
| N3 | 3 | **REQUIERE HARDWARE** | 2 tablets + caja |
| N4 | 5 | **REQUIERE HARDWARE** | Salón mínimo |
| N5 | 10 | **EMULADO** | 10 contextos Playwright contra mock HTTP |
| N6 | 20 | **EMULADO** | Solo `fetch` en loopback |
| N7 | 50 | **EMULADO** | Sin WS, sin auth, sin disco |
| N8 | 100 | **EMULADO** | Techo de diseño no probado |

**Hoy solo N1 es ejecutable de verdad.** N2–N4 exigen hardware; N5–N8 no son certificables.
