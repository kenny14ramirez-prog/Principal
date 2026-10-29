# OPORD — OPERACIÓN «MISIÓN CIEN»

**Documento de mando para agentes. No es un documento para el cliente final.**

| Campo | Valor |
|---|---|
| Operación | MISIÓN CIEN |
| Objeto | Operación a escala de 100 dispositivos con degradación controlada y auditoría continua |
| Autoridad | Alto Mando (AM) |
| Redactor | Estado Mayor |
| Versión | 1.0 |
| Fecha | 2026-10-28 |
| Vigencia | Hasta cierre de F11 o nueva versión del OPORD |
| Clasificación | Interna — agentes y generales |
| Repo | `sistema pos` (rama de trabajo: `task/aligned-20260727`) |
| Fuente canónica | **Edición:** `app/` → publica a `src/` con `npm run sync`. **Auditoría y empaquetado:** `src/` (Tauri `frontendDist`). Navegador abandonado. |

> **Regla de oro:** ningún agente cierra una tarea sin evidencia reproducible y sin PASS medido. «Casi», «debería» y «probado luego» están prohibidos como cierre.

---

## §0. ANEXO DE RECONCILIACIÓN DOCUMENTAL — leer antes de cualquier fase

**Vigente desde 2026-10-28. Sustituye cualquier instrucción previa que contradiga este anexo.**

1. **Este OPORD (F0–F11) manda** sobre alcance, método, criterios PASS y formato de evidencia de MISIÓN CIEN.
2. `docs/maps/CONTINUIDAD-OPORD.md` **deja de ser autoridad de estado**: queda como archivo histórico de la campaña H0–H4 / L★ / POE. Se lee para contexto, nunca para certificar.
3. **«✅ COMPLETO» en CONTINUIDAD significa «código entregado», jamás «verificado».** Prohibido citarlo como PASS. La frase «flota 100» debe escribirse siempre como **«10 dispositivos / servidor mock»**.
4. **Nomenclatura única:** toda tarea se registra como `F#-T##`. Lo heredado se anota «cubre F#-T##» o «fuera de alcance». Informe sin ID de fase no existe.
5. **Mapa vinculante:** F0←H0 · F8←H1.5/H1.6 · F9←H2.D/H2.E · **F10 reemplaza toda QA previa**. H2.F, H3b, H3c y H4 quedan congeladas hasta F11 o nueva versión.
6. **Árbol auditado = árbol desplegado.** Tauri empaqueta `src/` (`src-tauri/tauri.conf.json:7`, `frontendDist: "../src"`). El navegador está **abandonado** por limitaciones de impresoras POS y conectividad. Toda auditoría se hace sobre `src/`; `app/` es fuente de edición, no objeto de certificación.
7. **Cadena fuente→build degradada (P0-2):** `src/index.html` se regenera de `app/Crozzo_POS_Completo.html` (155 scripts), no de `app/index.html` (179 scripts). Por eso `CrozzoOcrFactura`, `CrozzoContingenciaFiscal` y `CrozzoComandaArchive` existen en `app/` y **no llegan al APK**. Ningún PASS fiscal o de OCR es válido hasta que el set de scripts coincida.
8. **Bloqueo de compilación vigente:** `cargo check` falla por `RC.EXE`/`link.exe` ausentes (`tauri-winres`). F2, F3, F4, F6 y F7 se **planifican**; su PASS contra el servidor Rust real queda prohibido hasta desbloquear el toolchain.
9. **Evidencia válida:** solo `docs/maps/ops/evidencia/<TASK-ID>/` con `commit`, comando, salida, `hash` y timestamp (§12). `agents/runs/**`, BITACORA, STRESS y CONTINUIDAD **no son evidencia**: son guiones.
10. **QA previa invalidada:** `jornada-simulator.mjs` no navega ni crea facturas; `comandas` nunca se incrementa y «OK» está hardcodeado. `test:fleet-escala` corre 2 PCs + 4 tablets contra `field-mock-lan-central`. Ninguna de las dos certifica nada.
11. **Ninguna medición anterior al commit de F0-T01 vale como línea base.** Hay 45 entradas sin commitear: congelar es requisito de validez, no burocracia.
12. **Jerarquía probatoria:** si dos documentos discrepan, manda el código del árbol actual; si el código no alcanza, manda este OPORD; si el OPORD calla, arbitra AM-2. Cambiar este anexo exige OPORD v2 y firma de AM-1.

---

## 1. SITUACIÓN

### 1.1 Hechos verificados (no repetir investigación)

| ID | Hecho | Evidencia |
|---|---|---|
| H-01 | El broadcast WebSocket llama `Handle::block_on` dentro de contexto async → panic con ≥1 cliente | `src-tauri/src/crozzo_lan_ws.rs:45` |
| H-02 | HTTP sin keep-alive: cada request abre y cierra TCP | `crozzo_lan_sync_server.rs:308` (`Connection: close`) |
| H-03 | Semáforo HTTP fijo en 64; sin delta ni `since` en `/api/comandas` y `/api/runtime` | `crozzo_lan_sync_server.rs:34`, rutas 980–1020 |
| H-04 | Estado caliente en `localStorage` (~5 MB) con fallo silencioso al llenarse | `CrozzoStorageHygiene.js:9`, `trimPosRuntimeSnapshot` |
| H-05 | Secreto de emparejamiento hardcodeado en código distribuido | `CrozzoPairingSeal.js:14` |
| H-06 | LAN en texto plano; auth opcional (`auth_token.is_empty()`) y GET sin auth | `crozzo_lan_sync_server.rs:852` |
| H-07 | Cola fiscal sin bloqueo de concurrencia | `CrozzoFiscalOutboxDrain.js:97–120` |
| H-08 | Malla BLE multi-salto existe (`MAX_HOPS=12`) pero solo relaya identidad | `CrozzoBleMesh.js:11,23` |
| H-09 | Failover de caja solo a *backup* predefinido, sin elección por capacidad ni epoch | `CrozzoCentralFailover.js:36`, `PROMOTE_HOLD_MS=18000` |
| H-10 | Roles solo A y B; no existe rol C (estación de impresión) | `CrozzoBlePeerRegistry.js:125` |
| H-11 | Toolchain Rust no compila en el entorno actual (`RC.EXE`/`link.exe` ausentes) | `cargo check` falla |
| H-12 | Suite `_connectivity-orchestrator-check` con 12 fallos / 111 checks | ejecución previa |

### 1.2 Amenazas

**Técnicas:** caída de AP, saturación de aire Wi-Fi, reinicio del hub, disco lleno, reloj desfasado, nube caída o lenta, batería agotada, Doze de Android, interferencia BLE, IP duplicada, mDNS falsificado, token vencido.

**Humanas:** doble toque en «enviar», mesa equivocada, tablet sin batería a mitad de pedido, cambio de turno sin traspaso, cancelación tras impresión, cobro duplicado, cierre de caja con mesas abiertas, cambio de precio en hora pico, impresora sin papel, dispositivo perdido.

**Organizativas:** cambios sin commitear, pruebas contra mocks, ausencia de evidencia, presión por cerrar sin verificar.

### 1.3 Supuestos

- A-01: la caja puede ser Windows con Tauri; las tablets, Android con WebView.
- A-02: existe al menos un router; el hotspot es respaldo, no primario.
- A-03: el cliente opera en Colombia y factura electrónicamente (DIAN).
- A-04: no hay 100 dispositivos físicos disponibles; se combina emulación + 3–5 equipos reales.
- A-05: el presupuesto de hardware es de gama media, no de centro de datos.

---

## 2. MISIÓN

Diseñar, implementar y **certificar** que un restaurante o tienda puede operar con **hasta 100 dispositivos simultáneos**, degradándose de forma explícita y sin pérdida de información, con auditorías de personas y de escala que demuestren confiabilidad operativa.

---

## 3. INTENCIÓN DEL ALTO MANDO (ESTADO FINAL)

1. **Cero pérdida** de comandas, pagos o facturas en cualquier escenario de caos.
2. **Cero duplicados** por reintento.
3. **Degradación explícita**: el usuario sabe qué puede y qué no en cada canal.
4. **Recursos acotados**: RAM, disco y batería dentro de presupuesto medido.
5. **Operación invisible**: el usuario no percibe errores continuos.
6. **Evidencia**: cada afirmación respaldada por comando, métrica o captura.

**Criterio de éxito:** un mesero, un cajero, cocina y administración completan un turno completo bajo caos inyectado sin notar fallos, y el sistema converge al 100 % al restablecerse la red.

---

## 4. ORGANIZACIÓN DE MANDO

### 4.1 Alto Mando (AM)

| Rol | Autoridad |
|---|---|
| **AM-1 Decisión** | Aprueba alcance, fases y release. Único que autoriza tocar `app/` en archivos críticos. |
| **AM-2 Estado Mayor** | Mantiene este OPORD, arbitra conflictos entre generales, valida evidencia. |
| **AM-3 Auditor** | Puede detener cualquier fase. Veto sobre PASS sin evidencia. |

### 4.2 Generales y sus dominios

| General | Dominio | Autoridad técnica |
|---|---|---|
| **G1 — INTEL** | Investigación externa, fuentes, verificación | Ninguna sobre código; entrega informes |
| **G2 — SYNC** | Contrato de datos, log, delta, rooms | `app/infra/CrozzoSync*`, servidor Rust |
| **G3 — COMMS** | LAN, WS, BLE, P2P, hotspot, gateway/lease | Transportes y orquestador |
| **G4 — SEC/FISC** | Cifrado, claves, fiscal DIAN | Seguridad y cola fiscal |
| **G5 — PERF** | Recursos, almacenamiento, compresión | Presupuesto y perfilado |
| **G6 — QA/AUDIT** | Auditorías de personas, escala y caos | Puede reprobar cualquier entrega |
| **G7 — DOCTRINA** | Documentación, runbooks, formación | Este OPORD y anexos |

### 4.3 Agentes especializados

| Agente | Grupo | Especialidad | Subgrupo |
|---|---|---|---|
| **A-INT-1** | G1 | Fuentes primarias (RFC, specs, docs oficiales) | Normas |
| **A-INT-2** | G1 | Benchmarks y límites de hardware | Rendimiento |
| **A-INT-3** | G1 | Fiscal/legal (DIAN, estatuto) | Normativo |
| **A-INT-4** | G1 | POS comerciales y competencia | Mercado |
| **A-SYNC-1** | G2 | Esquema y versionado del sobre | Datos |
| **A-SYNC-2** | G2 | Log idempotente, HLC, secuencias | Datos |
| **A-SYNC-3** | G2 | Delta, rooms, snapshots | Datos |
| **A-SYNC-4** | G2 | Servidor Rust (endpoints, concurrencia) | Backend |
| **A-COMM-1** | G3 | WebSocket y fan-out | Tiempo real |
| **A-COMM-2** | G3 | HTTP, mDNS, hotspot | Red local |
| **A-COMM-3** | G3 | BLE mesh, fragmentación, store-and-forward | Malla |
| **A-COMM-4** | G3 | P2P/WebRTC y señalización | P2P |
| **A-COMM-5** | G3 | Gateway, lease, epoch, elección | Consenso |
| **A-SEC-1** | G4 | Emparejamiento, claves, Noise/TLS | Cripto |
| **A-SEC-2** | G4 | Cifrado en reposo y Keystore/DPAPI | Cripto |
| **A-FISC-1** | G4 | Emisión, CUFE, contingencias | Fiscal |
| **A-FISC-2** | G4 | Idempotencia y auditoría fiscal | Fiscal |
| **A-PERF-1** | G5 | Presupuesto RAM/CPU/disco/batería | Perfilado |
| **A-PERF-2** | G5 | Compresión, diccionarios, framing | Compresión |
| **A-PERF-3** | G5 | Retención, compactación, cuotas | Almacenamiento |
| **A-QA-1** | G6 | Auditoría de personas | Operación |
| **A-QA-2** | G6 | Auditoría de escala | Carga |
| **A-QA-3** | G6 | Inyección de fallos y caos | Resiliencia |
| **A-QA-4** | G6 | Evidencia y trazabilidad | Certificación |
| **A-DOC-1** | G7 | Runbooks y formación | Documentación |

### 4.4 Matriz RACI (resumen)

| Fase | R | A | C | I |
|---|---|---|---|---|
| F0 Baseline | A-SYNC-4 | G2 | G5, G6 | AM |
| F1 Recursos | A-PERF-1/3 | G5 | G6 | AM |
| F2 Contrato datos | A-SYNC-1 | G2 | G3, G4 | G1 |
| F3 Log/HLC | A-SYNC-2 | G2 | G6 | G3 |
| F4 Delta/Rooms | A-SYNC-3 | G2 | G5 | G3 |
| F5 Compresión | A-PERF-2 | G5 | G3 | G2 |
| F6 Cifrado | A-SEC-1/2 | G4 | G3 | AM |
| F7 Gateway/Lease | A-COMM-5 | G3 | G4, G6 | AM |
| F8 Fiscal | A-FISC-1/2 | G4 | G1 | AM |
| F9 UX capacidades | A-COMM-2 | G3 | G6 | G7 |
| F10 Auditorías | A-QA-1/2/3 | G6 | Todos | AM |
| F11 Cierre | A-DOC-1 | G7 | G6 | AM |

---

## 5. RECURSOS

### 5.1 Entornos

| ID | Entorno | Contenido | Uso |
|---|---|---|---|
| **E1** | Dev Windows | Node 20+, Playwright, VS Code, Git | Desarrollo JS y pruebas |
| **E2** | Toolchain Rust | MSVC Build Tools, Windows SDK, `RC.EXE`, `link.exe` | Compilar Tauri y tests Rust |
| **E3** | Android | 3 equipos reales (gama baja/media/alta) + AVD | Pruebas de cliente |
| **E4** | Red de laboratorio | Router + 3 APs cableados, VLAN POS, 5 GHz | Escala y aire |
| **E5** | Nube staging | Supabase staging + proveedor fiscal sandbox | Fiscal y sync nube |

**Bloqueo conocido:** E2 no está disponible hoy (H-11). Hasta resolverlo, todo lo Rust se marca **NO VERIFICADO**.

### 5.2 Recursos por grupo

| Grupo | Herramientas | Fixtures | Hardware |
|---|---|---|---|
| G1 | `websearch`, `webfetch`, registro de fuentes | — | — |
| G2 | Node, `cargo`, SQLite CLI, `jq` | 2.000 productos, 800 comandas | E1, E2 |
| G3 | `wireshark`, `tcpdump`, `nRF Connect`, Chrome DevTools | 3 APs, 6 nodos BLE | E3, E4 |
| G4 | OpenSSL, `openssl s_client`, SQLCipher, sandbox DIAN | Facturas de prueba, rangos autorizados | E5 |
| G5 | Chrome Performance, `heaptrack`, `ps`, `iostat` | Perfiles de carga | E1, E3 |
| G6 | Playwright, `k6`/`artillery`, scripts de caos | Guiones de personas | E3, E4 |
| G7 | Markdown, plantillas | — | — |

### 5.3 Presupuesto de tiempo (referencia)

| Fase | Duración objetivo |
|---|---|
| F0–F1 | 2 sesiones |
| F2–F4 | 4 sesiones |
| F5–F7 | 4 sesiones |
| F8–F9 | 3 sesiones |
| F10 | 4 sesiones |
| F11 | 1 sesión |

---

## 6. DOCTRINA Y REGLAS DE ENFRENTAMIENTO

1. **Fuente canónica:** editar `app/`; publicar con `npm run sync`. Prohibido editar `src/` directo.
2. **Archivos críticos:** `npm run edit:scope -- <archivo> <símbolo>` antes del primer edit.
3. **Cierre:** `npm run test:sync-clinical` verde o justificación documentada de bloqueo ambiental.
4. **Prohibido el mock en validación final.** Los mocks sirven para desarrollo; la certificación usa el servidor Rust real.
5. **Una tarea = un commit lógico.** Mensaje con ID de tarea (`F3-T02`).
6. **Nada de cambios silenciosos.** Todo cambio de comportamiento se documenta en el reporte.
7. **Sin dependencias nuevas** sin aprobación de AM y análisis de tamaño (WebView).
8. **Sin secretos en código.** Cualquier secreto hardcodeado es P0.
9. **No se acepta PASS sin evidencia** (ver §12).
10. **Detención obligatoria** si aparece P0/P1 nuevo durante una fase.

---

## 7. PROTOCOLO DE INTELIGENCIA (VERIFICACIÓN WEB CONSTANTE)

### 7.1 Jerarquía de fuentes

1. **Primaria:** RFC, especificación del fabricante, documentación oficial, normativa (DIAN, NIST, Bluetooth SIG, W3C, WHATWG).
2. **Secundaria técnica:** ingeniería de producto (Slack, Discord, Meta, Matrix), papers.
3. **Terciaria:** blogs, foros. **Solo para hipótesis**, nunca para PASS.

### 7.2 Frescura

| Tipo de dato | Re-verificación |
|---|---|
| Límites de hardware/OS | ≤ 30 días |
| Versiones de librería | ≤ 30 días |
| Normativa fiscal | ≤ 30 días o ante cambio publicado |
| Arquitectura/patrones | ≤ 6 meses |
| Benchmarks | ≤ 90 días |

### 7.3 Regla de doble fuente

Toda cifra que sustente una decisión debe tener **dos fuentes independientes** o una fuente primaria explícita. Si no, se marca `ESTIMADO` y no se usa como criterio de PASS.

### 7.4 Registro de fuentes

Cada agente de G1 mantiene `docs/maps/ops/fuentes-<tema>.md`:

| Campo | Obligatorio |
|---|---|
| URL | Sí |
| Título | Sí |
| Autor/organización | Sí |
| Fecha de consulta | Sí |
| Fecha del documento | Si existe |
| Hallazgo | 1–3 líneas |
| Aplicabilidad | Alta/Media/Baja |
| Estado | Vigente / Revisar / Obsoleto |

### 7.5 Fuentes ya validadas (punto de partida)

| Tema | Fuente |
|---|---|
| Tokio `block_on` en async | https://docs.rs/tokio/latest/tokio/runtime/struct.Handle.html |
| Tungstenite `WebSocketConfig` | https://docs.rs/tungstenite/latest/tungstenite/protocol/struct.WebSocketConfig.html |
| Límite BLE GATT Android | https://stackoverflow.com/questions/41365009/ |
| Densidad Wi-Fi | https://documentation.meraki.com/ |
| zstd diccionarios | https://github.com/facebook/zstd/blob/dev/programs/zstd.1.md |
| Compression Dictionary Transport | https://datatracker.ietf.org/doc/draft-ietf-httpbis-compression-dictionary/ |
| Noise Protocol | https://noiseprotocol.org/noise.html |
| NIST GCM | https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf |
| DIAN Res. 000227/2025 | https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0227_2025.htm |
| Anexo Técnico FE v1.9 | https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf |
| Toast offline | https://support.toasttab.com/en/article/Using-Toast-in-Offline-Mode |
| Square offline | https://squareup.com/help/us/en/article/5453-offline-payments |

---

## 8. FASES

> Formato: **ID · Tarea · Responsable · Recursos · Entregable · PASS**. Ninguna fase inicia sin el PASS de la anterior, salvo autorización de AM.

### F0 — BASELINE Y DESBLOQUEO

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F0-T01 | Congelar cambios sin commitear en `wip/cascada-estricta` | G2 | Git | Rama creada | `git status` limpio en rama de trabajo |
| F0-T02 | Instalar toolchain Rust (E2) | G2 | E2 | `cargo check` OK | Compila sin error ambiental |
| F0-T03 | Medir volúmenes reales por entidad | G5 | E1, script | `docs/maps/ops/volumenes.md` | Tabla con bytes y frecuencia |
| F0-T04 | Dejar `_connectivity-orchestrator-check` en 0 fallos | G6 | E1 | Reporte | 111/111 |
| F0-T05 | Registrar línea base de recursos | G5 | E1, E3 | `metricas-base.json` | RSS/CPU/disco/batería por dispositivo |

### F1 — PRESUPUESTO DE RECURSOS Y RETENCIÓN

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F1-T01 | Sacar estado caliente de `localStorage` a IndexedDB/SQLite | A-PERF-3 | E1, E3 | Migración | `localStorage` < 100 KB |
| F1-T02 | Manejo de `QuotaExceededError` con purga y aviso | A-PERF-3 | E1 | Código + test | 0 fallos silenciosos |
| F1-T03 | Política de retención por dispositivo | A-PERF-3 | — | Documento | Tabla aprobada por AM |
| F1-T04 | Topes duros y test que falle al superarlos | A-PERF-1 | E1 | Test | Falla si RAM/disco > presupuesto |
| F1-T05 | Perfilado 8 h continuo | A-PERF-1 | E3 | Métricas | RAM ±5 %, disco < 5 MB/día |

### F2 — CONTRATO DE DATOS

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F2-T01 | Definir sobre versionado `{v,kind,deviceId,seq,hlc,epoch,dictId}` | A-SYNC-1 | — | Esquema | Revisado por G3/G4 |
| F2-T02 | Implementar codec posicional/CBOR | A-SYNC-1 | E1 | `CrozzoWireCodec.js`, `crozzo_wire.rs` | Comanda ≤ 130 B |
| F2-T03 | Compatibilidad de dos versiones | A-SYNC-1 | E1 | Test | v1 y v2 conviven |
| F2-T04 | Rechazo limpio de versión desconocida | A-SYNC-1 | E1 | Test | Sin crash, error explícito |

### F3 — LOG IDEMPOTENTE Y RELOJ

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F3-T01 | `op_id` UUIDv7 + HLC + `seq` de hub | A-SYNC-2 | E1, E2 | Módulo | Orden total verificable |
| F3-T02 | Append-only en SQLite/IndexedDB con `fsync` | A-SYNC-2 | E2, E3 | Módulo | Reinicio no pierde |
| F3-T03 | Idempotencia `deviceId:localSeq` | A-SYNC-2 | E1 | Test | 0 duplicados en 1.000 ops |
| F3-T04 | Compactación y checkpoint | A-SYNC-2 | E1 | Test | Disco estable |

### F4 — DELTA, ROOMS Y HTTP

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F4-T01 | `since` + `nextSeq` en `/api/comandas` y `/api/runtime` | A-SYNC-4 | E2 | Endpoints | Cliente converge |
| F4-T02 | Keep-alive y ETag/304 | A-SYNC-4 | E2 | Servidor | ≥60 % menos req/s |
| F4-T03 | Rooms por `locationId:zona:rol` | A-SYNC-3 | E1, E2 | Suscripciones | No-suscrito recibe 0 |
| F4-T04 | Corregir broadcast WS (`block_on`) | A-COMM-1 | E2 | Código | 100 clientes, 0 panics |

### F5 — COMPRESIÓN Y FRAMING

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F5-T01 | Entrenar diccionario zstd 8 KB con ≥100 muestras | A-PERF-2 | E1 | Diccionario | Comanda ≤ 130 B |
| F5-T02 | Integrar wasm con fallback gzip nativo | A-PERF-2 | E3 | Módulo | CPU < 3 ms/mensaje |
| F5-T03 | Fragmentación BLE 244 B + reensamblado | A-COMM-3 | E3, nRF | Módulo | 5 % pérdida → 0 corrupción |
| F5-T04 | Regla: no comprimir < 120 B | A-PERF-2 | E1 | Test | Presencia sin comprimir |

### F6 — CIFRADO Y CLAVES

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F6-T01 | **Eliminar secreto hardcodeado** de `CrozzoPairingSeal.js` | A-SEC-1 | E1 | Código | Grep sin secretos |
| F6-T02 | QR con clave pública + código corto | A-SEC-1 | E1, E3 | Flujo | Emparejamiento autenticado |
| F6-T03 | Identidad X25519/Ed25519 no exportable | A-SEC-2 | E3 | Keystore/DPAPI | Clave no exportable |
| F6-T04 | Canal LAN autenticado (Noise/TLS + pinning) | A-SEC-1 | E2 | Canal | Handshake < 200 ms |
| F6-T05 | Revocación y rotación | A-SEC-1 | E1 | Procedimiento | Corte < 1 min |
| F6-T06 | Cifrado en reposo (SQLCipher) | A-SEC-2 | E3 | Config | BD ilegible sin clave |

### F7 — HUB, GATEWAY Y LEASE

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F7-T01 | Separar rol Hub de rol Gateway | A-COMM-5 | E1 | Config + director | Tablet con 4G escribe |
| F7-T02 | `gateway_lease` con `epoch` y TTL 15 s | A-COMM-5 | E5 | Tabla + RPC | Escritura vieja rechazada |
| F7-T03 | Elección por capacidad + hold 18 s | A-COMM-5 | E1 | Algoritmo | Sin flapping 1 h |
| F7-T04 | Handoff al volver la caja | A-COMM-5 | E1 | Procedimiento | 0 doble escritura |

### F8 — FISCAL OFFLINE

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F8-T01 | Emitir y firmar en local; transmitir después | A-FISC-1 | E5 | Flujo | Venta no espera red |
| F8-T02 | Lock de drain + idempotencia por documento | A-FISC-2 | E1 | Código | 0 CUFE duplicados |
| F8-T03 | Contador de numeración persistido y replicado | A-FISC-2 | E2 | Módulo | 0 huecos |
| F8-T04 | Distinguir contingencia 03 vs 04 | A-FISC-1 | — | Reglas | Sin declarar 04 una caída propia |
| F8-T05 | Transmisión < 48 h tras restablecer | A-FISC-1 | E5 | Job | 500/500 transmitidas |

> **Aviso:** la norma no fija duración máxima de contingencia ni tope de facturas. **Requiere validación contable/legal antes de producción.**

### F9 — UX DE CAPACIDADES

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F9-T01 | Exponer contrato por nivel | A-COMM-2 | E1 | UI | Usuario ve límites |
| F9-T02 | Bloquear acciones no soportadas | A-COMM-2 | E1 | UI | «Facturar» bloqueado en BLE |
| F9-T03 | Rehabilitar al recuperar canal | A-COMM-2 | E1 | UI | Sin recargar |

### F10 — AUDITORÍAS (PERSONAS, ESCALA, CAOS)

Ver §9, §10 y §11.

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F10-T01 | Auditoría de personas | A-QA-1 | E3, E4 | `auditoria-personas.md` | 4/4 roles sin P0/P1 |
| F10-T02 | Auditoría de escala 1→100 | A-QA-2 | E3, E4 | `auditoria-escala.md` | Matriz §10 aprobada |
| F10-T03 | Inyección de fallos | A-QA-3 | E3, E4 | `auditoria-caos.md` | ≥95 % escenarios PASS |
| F10-T04 | Certificación de evidencia | A-QA-4 | E1 | `certificado.md` | Trazabilidad completa |

### F11 — CIERRE

| ID | Tarea | Resp. | Recursos | Entregable | PASS |
|---|---|---|---|---|---|
| F11-T01 | Runbook operativo | A-DOC-1 | — | `RUNBOOK.md` | Cubre §11 completo |
| F11-T02 | Formación por rol | A-DOC-1 | — | Guías | Una página por rol |
| F11-T03 | Tablero de observabilidad | A-PERF-1 | E1 | Panel | Métricas §12 visibles |
| F11-T04 | Acta de cierre | AM | — | Acta | Firma de AM-1/2/3 |

---

## 9. AUDITORÍA DE PERSONAS

**Objetivo:** verificar que cada rol completa su trabajo real, con errores humanos incluidos, sin pérdida ni duplicación.

### 9.1 Matriz de información por rol

| Rol | Qué entra | Qué se mueve | Qué sale | Frecuencia | Criticidad |
|---|---|---|---|---|---|
| **Cajero** | Apertura, pedidos, pagos, facturas | Comandas, pagos, estado de caja | Factura al cliente, XML DIAN, cierre | 30–50 facturas/día | Crítica |
| **Mesero** | Mesa, pedido, modificaciones | Comanda, líneas, estado, mesa | Nada (todo al hub) | 50–200 ops/día/tablet | Alta |
| **Administración** | Catálogo, precios, usuarios, config | Catálogo, precios, permisos | Reportes | Baja, picos | Alta |
| **Cocina** | Comandas, cancelaciones | Estados de preparación | Ticket impreso | 40–80/día | Alta |
| **Cliente** (opcional) | QR de mesa, pedido | Pedido | Confirmación | Variable | Media |
| **Técnico de sede** | Diagnóstico, configuración | Config, logs | Reporte | Baja | Media |

### 9.2 Guiones de auditoría

#### A-QA-1.1 — Cajero

**Escenario:** turno completo de 8 h con 50 clientes, 2 caídas de internet y 1 reinicio del hub.

| Paso | Acción | Verificación |
|---|---|---|
| 1 | Abrir turno con fondo inicial | Estado persistido tras reinicio |
| 2 | Cobrar 30 facturas (efectivo, tarjeta, mixto) | 0 duplicados, 0 huecos |
| 3 | Cortar internet 10 min y cobrar 5 | Facturas emitidas y encoladas |
| 4 | Reiniciar hub en mitad de un cobro | Recuperación sin doble cobro |
| 5 | Aplicar descuento y anular | Auditoría registra autor |
| 6 | Cerrar caja con 1 mesa abierta | Bloqueo o advertencia explícita |
| 7 | Arqueo | Cuadre exacto |

**PASS:** 0 pérdidas, 0 duplicados, arqueo exacto, factura ≤ 3 s.

#### A-QA-1.2 — Mesero

| Paso | Acción | Verificación |
|---|---|---|
| 1 | Abrir mesa y enviar pedido | Cocina recibe ≤ 2 s |
| 2 | Doble toque en «enviar» | 1 sola comanda |
| 3 | Modificar cantidades | Delta correcto, sin duplicar líneas |
| 4 | Trasladar mesa | Mesa origen libre, destino con líneas |
| 5 | Tablet sin batería a mitad | Reanudar en otra tablet sin perder |
| 6 | Perder Wi-Fi 2 min | Cola local y sincronización al volver |
| 7 | Anular tras impresión | Cocina ve cancelación, no doble ticket |

**PASS:** 0 comandas perdidas, 0 duplicadas, reasignación íntegra.

#### A-QA-1.3 — Administración

| Paso | Acción | Verificación |
|---|---|---|
| 1 | Cambiar precio en hora pico | Líneas abiertas conservan precio |
| 2 | Borrar producto con comandas abiertas | Bloqueado con motivo |
| 3 | Crear usuario duplicado | Rechazado |
| 4 | Cambiar impuesto | Solo afecta nuevas ventas |
| 5 | Consultar auditoría | Quién, qué, cuándo |

**PASS:** 0 alteraciones retroactivas, auditoría completa.

#### A-QA-1.4 — Cocina

| Paso | Acción | Verificación |
|---|---|---|
| 1 | Recibir 20 comandas | Todas, en orden |
| 2 | Impresora sin papel | Reintento sin duplicar |
| 3 | Marcar listo | Mesero ve estado |
| 4 | Cancelación tardía | Ticket de cancelación, no reimpresión |
| 5 | Reinicio de estación C | Cola recuperada |

**PASS:** 0 tickets perdidos, 0 duplicados, reimpresión idempotente.

### 9.3 Catálogo de error humano

| ID | Error | Cómo se simula | Resultado esperado |
|---|---|---|---|
| EH-01 | Doble toque en enviar | Doble click < 300 ms | 1 operación (idempotencia) |
| EH-02 | Mesa equivocada | Enviar a mesa B desde A | Traslado reversible |
| EH-03 | Tablet sin batería | Apagar en mitad | Reanudar en otra |
| EH-04 | Cambio de turno sin traspaso | Cerrar sesión con mesa abierta | Advertencia y bloqueo |
| EH-05 | Cancelar tras imprimir | Anular comanda impresa | Ticket de cancelación |
| EH-06 | Cobro duplicado | Reintentar pago | 1 solo cobro |
| EH-07 | Cierre con mesas abiertas | Cerrar caja | Bloqueo explícito |
| EH-08 | Precio cambiado en pico | Editar precio | Líneas abiertas intactas |
| EH-09 | Impresora sin papel | Quitar papel | Reintento sin duplicar |
| EH-10 | Dispositivo perdido | Revocar tablet | Acceso cortado < 1 min |
| EH-11 | Cambio de contraseña Wi-Fi | Rotar SSID | Guía de reconexión |
| EH-12 | Reloj mal ajustado | Cambiar hora | HLC mantiene orden |

---

## 10. AUDITORÍA DE ESCALA (1 → 100)

### 10.1 Matriz

| Nivel | Dispositivos | Duración | Condición | Métricas | PASS |
|---|---|---|---|---|---|
| N1 | 1 hub + 1 tablet | 2 h | Normal | Latencia, correctitud | p99 < 100 ms, 0 pérdidas |
| N2 | 2 tablets | 2 h | Mesa compartida | Conflictos, leases | 0 duplicados |
| N3 | 5 | 4 h | Turno pequeño | p99, RAM | p99 < 150 ms |
| N4 | 10 | 8 h | Turno completo | RAM, disco, batería | RAM ±5 %, < 5 MB/día |
| N5 | 25 | 4 h | Hora pico | CPU, egress | CPU < 40 %, 0 pérdidas |
| N6 | 50 | 2 h | Pico + caos | p99, reconexión | p99 < 300 ms |
| N7 | 75 | 1 h | Sin WAN | Cola fiscal | 0 huecos |
| N8 | 100 | 1 h + 2 h soak | Todo + caos | Todo | p99 < 300 ms, 0 split-brain |

### 10.2 Condiciones obligatorias por nivel

1. **Normal:** todos los canales disponibles.
2. **Sin WAN:** solo LAN.
3. **Partición:** hub aislado 60 s.
4. **Caos:** caída de AP + reinicio de hub + pérdida BLE.
5. **Pico:** 3× la tasa media durante 5 min.

### 10.3 Qué se mide siempre

- Latencia p50/p95/p99 por operación.
- Pérdidas y duplicados por tipo de dato.
- RAM y CPU del hub y de cada tablet.
- Crecimiento de disco por hora.
- Consumo de batería por hora.
- Bytes por mensaje y por día.
- Tiempo de convergencia tras reconexión.
- Número de escritores simultáneos a la nube (debe ser **1**).

### 10.4 Criterio de aprobación

- 0 pérdidas y 0 duplicados en todos los niveles.
- Convergencia < 30 s tras restablecer.
- 1 solo escritor a la nube en todo momento.
- Recursos dentro del presupuesto de §5.

> **Limitación declarada:** sin 100 equipos físicos, N7/N8 se ejecutan con emulación + 5 equipos reales. Se marca `EMULADO` y no sustituye una prueba física futura.

---

## 11. INYECCIÓN DE FALLOS

| ID | Fallo | Simulación | Esperado |
|---|---|---|---|
| FT-01 | Reinicio de AP | Apagar AP 30 s | Reconexión escalonada, 0 pérdidas |
| FT-02 | Saturación Wi-Fi | 3× tráfico | Backpressure, sin caída |
| FT-03 | Reinicio de hub | Matar proceso | Failover < 20 s |
| FT-04 | Disco lleno | Llenar volumen | Purga + aviso, sin corrupción |
| FT-05 | Nube caída | Bloquear dominio | Cola local, sin bloqueo |
| FT-06 | Nube lenta | Latencia 5 s | Timeout y reintento |
| FT-07 | Reloj desfasado | ±5 min | HLC mantiene orden |
| FT-08 | IP duplicada | Segundo DHCP | Detección y aviso |
| FT-09 | mDNS falso | Anuncio malicioso | Rechazo por pinning |
| FT-10 | Token vencido | Expirar | Re-auth sin perder cola |
| FT-11 | BLE interferencia | Ruido 2.4 GHz | Reintento, 0 corrupción |
| FT-12 | Doze Android | Pantalla off 30 min | Reconexión al despertar |
| FT-13 | Batería crítica | 5 % | Guardado y aviso |
| FT-14 | Split-brain | Aislar gateway | Un solo escritor (epoch) |
| FT-15 | Duplicado de red | Reenviar paquete | Idempotencia |
| FT-16 | Corrupción de log | Alterar byte | Detección por hash |
| FT-17 | Cliente lento | 1 Mbps | No bloquea a los demás |
| FT-18 | 100 reconexiones | Reiniciar AP | Jitter, sin estampida |
| FT-19 | Cambio de hora | DST | Orden correcto |
| FT-20 | Apagón | Corte eléctrico | Recuperación desde disco |

---

## 12. PROTOCOLO DE EVIDENCIA

### 12.1 Estructura por tarea

```
docs/maps/ops/evidencia/<TASK-ID>/
  reporte.md
  comandos.log
  metricas.json
  evidencia/*.png
  hash.txt
```

### 12.2 Plantilla de reporte

```markdown
# Reporte <TASK-ID>
- Agente:
- General:
- Fecha/hora:
- Entorno (E1..E5):
- Commit:
- Objetivo:
- Comandos ejecutados:
- Resultado: PASS | FAIL | BLOQUEADO
- Métricas:
- Evidencia (rutas):
- Riesgos abiertos:
- Siguiente paso:
```

### 12.3 Reglas

1. Todo PASS requiere comando reproducible y salida.
2. Las capturas deben incluir fecha/hora.
3. Un FAIL se documenta, no se oculta.
4. Un BLOQUEADO indica causa externa y responsable de desbloqueo.
5. AM-3 puede repetir cualquier comando sin aviso.

---

## 13. ANEXOS

### A. Glosario

| Término | Definición |
|---|---|
| Hub | Nodo que sirve el estado local a la LAN |
| Gateway | Único nodo que escribe a la nube |
| Lease/Epoch | Arriendo y token de fencing del Gateway |
| HLC | Hybrid Logical Clock |
| Delta | Cambios desde una secuencia |
| Room | Suscripción por zona/rol |
| Store-and-forward | Guardar antes de enviar, borrar con ACK |
| P0/P1 | Fallo crítico / alto |

### B. Archivos objetivo

| Área | Archivos |
|---|---|
| Transporte | `crozzo_lan_ws.rs`, `crozzo_lan_sync_server.rs`, `CrozzoLanOpsSync.js`, `CrozzoLanWebSocketBridge.js` |
| Malla | `CrozzoBleMesh.js`, `CrozzoOfflineGossip.js`, `crozzo_ble_mesh.rs`, `crozzo_gossip_udp.rs` |
| Orquestación | `CrozzoConnectivityOrchestrator.js`, `CrozzoConnectivityDirector.js`, `CrozzoCapabilityMatrix.js`, `CrozzoBrainPolicy.js`, `CrozzoCentralFailover.js` |
| Fiscal | `CrozzoFiscalOutboxDrain.js`, `CrozzoContingenciaFiscal.js`, `CrozzoDianVpfeDock.js` |
| Almacenamiento | `CrozzoStorageHygiene.js`, `CrozzoComandaArchive.js`, `CrozzoLocalData` |
| Seguridad | `CrozzoPairingSeal.js`, nuevo `CrozzoKeyVault.js` |

### C. Comandos de referencia

```bash
npm run edit:scope -- app/ruta/archivo.js simbolo
npm run sync
npm run test:sync-clinical
node scripts/_connectivity-orchestrator-check.mjs
node scripts/_central-failover-check.mjs
node scripts/_lan-cascade-check.mjs
node scripts/_legendary-connectivity-check.mjs
cargo check --manifest-path src-tauri/Cargo.toml
```

### D. Scorecard de certificación

| Criterio | Peso | Umbral |
|---|---|---|
| Correctitud (0 pérdidas/duplicados) | 30 | 100 % |
| Resiliencia (caos) | 25 | ≥95 % escenarios |
| Rendimiento (latencias/recursos) | 20 | Dentro de presupuesto |
| Usabilidad (auditoría de personas) | 15 | 4/4 roles |
| Seguridad (sin P0/P1) | 10 | 0 hallazgos |

**Release:** ≥90 y 0 P0/P1. **Condicional:** 80–89. **No-go:** <80.

### E. Plantilla de handoff entre sesiones

```markdown
# Handoff <fecha>
- Fase actual:
- Último PASS:
- Bloqueos:
- Decisiones tomadas:
- Archivos modificados:
- Siguiente tarea:
```

---

**Fin del OPORD. Toda modificación requiere versión nueva y aprobación de AM-1.**
