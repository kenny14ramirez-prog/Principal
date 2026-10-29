# PLAN DE EJECUCIÓN TAURI — v2

| Campo | Valor |
|---|---|
| Operación | MISIÓN CIEN · recuperación del POS sobre Tauri |
| Fecha | 2026-10-28 |
| Base auditada | `f59eabd` = `v1.0.231-31` (**31 commits sin tag**) |
| Runtime vinculante | Tauri 2 · Windows (WebView2) · Android |
| Navegador | **ABANDONADO.** No es entregable, no es respaldo, no cuenta |
| Estado | **NO CERTIFICADO** |
| Documento hermano | `docs/maps/ops/BITACORA-INVESTIGACION-TAURI.md` (evidencia) |

> **Regla de oro:** este plan no avanza por opiniones. Cada paso tiene un PASS que se ejecuta y se pega como evidencia. Si no hay comando, no hay PASS.

---

## §0 · REGLAS QUE NO SE NEGOCIAN

1. **Congelar antes de tocar.** Hay 49 rutas sin commitear y 31 commits sin tag. Cualquier arreglo aplicado antes de fijar base se pierde.
2. **Un solo escritor de la verdad.** El código manda; los documentos se corrigen cuando el código los contradice (ya pasó con B-08).
3. **Nada se prueba en Chromium.** Impresora, cámara, BLE, LAN y spooler solo valen en el binario Tauri.
4. **No se publica nada al feed sin artefacto reproducible.** El updater es `installMode: quiet`: un release malo se instala solo en toda la flota.
5. **Los datos del negocio son sagrados.** Antes de tocar persistencia, debe existir respaldo y protección de instancia única.
6. **Nadie escribe en `src/index.html` a mano.** Se genera; editarlo rompe la trazabilidad (ya ocurrió).

---

## §1 · ESTADO VERIFICADO

### Confirmado por mando (comando reproducible)

| # | Hecho | Evidencia |
|---|---|---|
| 1 | No hay toolchain MSVC: ni Visual Studio, ni Windows SDK, ni `rc.exe`/`link.exe`; `vswhere` no existe | `Get-Command rc.exe`, `link.exe`; ausencia de `Windows Kits\10\bin` |
| 2 | `winget` disponible → desbloqueo sin descargas manuales | `C:\Users\Andre\...\WindowsApps\winget.exe` |
| 3 | El árbol auditado **no es** 1.0.231: está 31 commits adelante, sin tag | `git describe` → `v1.0.231-31-gf59eabd` |
| 4 | Duplicado peligroso: `src\CrozzoPosMain.js` (1.012.628 B, **no se carga**) vs `src\core\CrozzoPosMain.js` (2.387.011 B, **sí**) | `src/index.html` carga `core/…` |
| 5 | 78 comandos nativos declarados; 73 registrados; 5 huérfanos (`crm_registro_*`) | cruce `#[tauri::command]` × `generate_handler!` |
| 6 | `crozzo_save_pdf_b64` se invoca desde JS, está autorizado en ACL y **no existe en Rust** | `crozzo-print.toml:14`, `CrozzoBundleCostos.js:14695` |
| 7 | 14 comandos registrados **sin autorización ACL** (hotspot ×3, emulación ×5, adq_enrich ×4, `lan_sync_ack`, `dev_log`) | cruce capabilities × permissions × handler |
| 8 | La cola LAN lleva 4 meses sin drenarse: 2000/2000 entradas, 2,16 MB, más antigua 2026-06-19 | `%APPDATA%\BonaOrigenPOS\crozzo_lan_pending.json` |
| 9 | El **69 %** de esa cola es ruido de presencia (`fleet_roster` 872 + `identity_card` 505) vs 570 comandas | conteo por `kind` |
| 10 | El hub LAN **no sirve el frontend**: todo lo no-JSON → 404 | `crozzo_lan_sync_server.rs:1129` |
| 11 | WS LAN sin push: `try_lock` + `block_on`; todo sincroniza por polling HTTP | `crozzo_lan_ws.rs:39,43-45,70-75` |
| 12 | mDNS anuncia `127.0.0.1` cuando no hay ruta a Internet | `crozzo_mdns.rs:50-61` |
| 13 | Ninguna capability declara `remote` → **no hay IPC remoto** (sin RCE por docks) | `capabilities/*.json` |
| 14 | `install_setup_from_url` acepta cualquier HTTPS y solo valida `MZ` ≥400 KB | `crozzo_silent_install.rs:55-65,76-126` |
| 15 | Cámara/mic se conceden con `SetState(ALLOW)` sin comprobar origen | `webview_permissions.rs:58-64` |
| 16 | Sin `tauri-plugin-single-instance` → dos POS simultáneos, consecutivo duplicado | `Cargo.toml`, `Cargo.lock` |
| 17 | Todo el negocio vive en 3,7 MB de LevelDB; ningún módulo Rust lo respalda | `EBWebView\...\leveldb` (11 archivos) |
| 18 | Outbox fiscal truncado a 200 con `slice(-200)` en `catch` vacío | `CrozzoPosDianLib.js:480` |
| 19 | Último instalador: 1.0.109 (13-jun). No existe artefacto de 1.0.231 en disco | `bundle\nsis\` |
| 20 | No hay instalación real en este equipo: datos huérfanos de builds de desarrollo | registro `Uninstall`, `Programs` limpios |
| 21 | **Causa raíz de la pérdida de comandas:** `crozzo_lan_sync_ack` falta en la ACL → el ACK se traga (`CrozzoLanSyncBridge.js:743-744`) → el central nunca purga su cola → 2000/2000 → FIFO descarta lo antiguo | cadena verificada por mando y AI-A |
| 22 | Los comandos «muertos» son **regresiones vivas**: el frontend los invoca y recibe *deny* | `CrozzoEmulationHarness.js:123`, `CrozzoLanSyncBridge.js:743`, `CrozzoCostosReportesPdf.js:204` |
| 23 | El inventario por TOML miente: hay un permiso sin comando y un comando sin permiso | `crozzo-print.toml:14` vs `lib.rs:176` |
| 24 | El push LAN **sí tiene emisor** (`crozzo_lan_sync_server.rs:527-535`); muere en el lock/`block_on` del WS | AI-A |
| 25 | **OTA roto desde ≥1.0.160:** la pubkey embebida (A0EE9D152E5A3C9E) ≠ la clave que firma las releases publicadas (AD59656123565E0B). El updater rechaza su propia actualización | verificado con doble decodificación minisign |
| 26 | `src/index.html` (104.362 B, sha `4084606…`) ≠ `app/index.html` (111.168 B, sha `b0c9bdb…`): el build publica frontend divergente | `Get-Item` + sha256 |
| 27 | `beforeBuildCommand` ausente: `npm run tauri:build` no regenera `src/` | `tauri.conf.json` (0 coincidencias) |
| 28 | `makensis.exe` **no está instalado** (AI-C refutó a TI-1): sin él no se genera el instalador NSIS aunque compile | `Get-Command makensis` → vacío |

### Correcciones aplicadas tras auditoría AI-A

| Se decía | Se corrige a |
|---|---|
| «Todo lo no-JSON → 404» | Hay 400/500/204; lo esencial es que **no sirve HTML** |
| «Cámara para cualquier origen» | Solo ventana `main` (`lib.rs:82-83`), no los docks |
| «Comandos muertos» | Regresiones activas con *deny* en runtime |
| «WiFi Direct stub» | Stub solo en desktop; Android reporta `true` sin P2P nativo |

### Hallazgos de la Operación Peine (G1–G4) — nuevos críticos

| # | Hallazgo | Evidencia |
|---|---|---|
| P-1 | **`JSON.parse(localStorage.getItem('crozzo_supabase_config'))` sin try** en `sbRest` → crash si config corrupto | `BundleCostos.js:8861`, `SistCostos.js:3632` |
| P-2 | **Consecutivo no atómico** → dos cajas obtienen el mismo número | `ConfigManager.js:661-666` |
| P-3 | **Factura POS sin guard por UUID** → duplicado en reintento | `CrozzoPosMain.js:33083,33118-33119` |
| P-4 | **Outbox fiscal trunca a 200 en silencio** | `CrozzoPosDianLib.js:480` |
| P-5 | **Outbox de comandas borra tras 6 h sin ACK** | `ComandasCloudSync.js:426,578-580` |
| P-6 | **`comanda_estado` ID incluye `lastUpdateAt`** → dos ediciones concurrentes ambas aplican | `CrozzoLanActionDedup.js:84-92` |
| P-7 | **Sin single-writer/lease a la nube** | `ComandasCloudSync.js:144-179` |
| P-8 | **HLC/secuencia global no implementado** (solo doctrina) | búsqueda `hlc`/`lease`/`epoch` → 0 |
| P-9 | **Save runtime cada 280 ms** (stringify + setItem, 100 KB–1 MB) | `CrozzoPosMain.js:8709` |
| P-10 | **Polling LAN/cloud runtime cada 0,65–3,2 s** duplica costo | `CrozzoLanOpsSync.js:775,797` |
| P-11 | **Timers KDS cada 1 s con O(n²) `.find`** | `CrozzoPosMain.js:8933,8939,8787` |
| P-12 | **Bundle monolítico 2,3 MB** + 204 `innerHTML` sin diffing | `CrozzoPosMain.js` |
| P-13 | **36 módulos no referenciados** (~636 KB de JS muerto) | cruce `src/index.html` vs disco |
| P-14 | **mDNS anuncia 127.0.0.1 sin internet** | `crozzo_mdns.rs:50-61` |
| P-15 | **BLE no transmite en Android** | `crozzo_ble_mesh.rs:148-165` |
| P-16 | **Gossip sin fragmentación** (límite 7800 B) | `crozzo_gossip_udp.rs:163-165` |
| P-17 | **Hub LAN no sirve el frontend** | `crozzo_lan_sync_server.rs:1129` |
| P-18 | **WS sin push** (`try_lock` + `block_on`) | `crozzo_lan_ws.rs:39,43-45,70-75` |
| P-19 | **Cascada no es exclusiva** (solapamientos) | `CrozzoConnectivityOrchestrator.js:2` |
| P-20 | **Sin retry en Supabase REST** | `src/infra`, `src/core` |

> El plan quirúrgico detallado está en `docs/maps/ops/PLAN-QUIRURGICO.md` (9 fases F0–F9, 32 cortes, 6 amputaciones, criterio de cierre con 10 puntos). Este plan (v2) queda como referencia de ejecución; el quirúrgico es el que manda.

### Verificación completada (Asuntos Internos)

| Equipo | Investigadores | Resultado |
|---|---|---|
| AI-A | TI-2, TI-3 | 18 afirmaciones: 12 CONFIRMADO, 3 PARCIAL, 1 REFUTADO, 2 NO VERIFICABLE. Calidades 84 y 76 |
| AI-C | TI-1 | 16 afirmaciones: 10 CONFIRMADO, 2 PARCIAL, 1 REFUTADO (`makensis`), 1 NO VERIFICABLE, 2 CONFIRMADO (P0 firma). Calidad 86 |
| self | TI-4, TI-5 | AI-B falló por límite de uso. Verifiqué yo: 18 afirmaciones, 14 CONFIRMADO, 1 REFUTADO en el número (15 vs 16), 3 CITACIÓN ERRÓNEA. Calidades 88 y 92 |

**Hallazgos refutados que se retiran del plan:** «comandos muertos» (son regresiones vivas), «makensis existe», «16 módulos» (son 15), «todo lo no-JSON → 404» (hay 400/500/204), «cámara para cualquier origen» (solo `main`).

**Hallazgo nuevo que entra al plan:** OTA roto desde ≥1.0.160 por desalineación de firma (P0 de operación).


---

## §2 · LO QUE HOY NO EXISTE (y hay que dejar de suponer)

| Se creía | Realidad |
|---|---|
| «Las tablets entran por la caja» | El hub no sirve el frontend. Cada equipo necesita su instalación |
| «Hay push en tiempo real por WebSocket» | 0 mensajes. Solo polling HTTP de 0,4 a 4,8 s |
| «La malla BLE funciona sin central» | En Android no transmite nada; en escritorio es UDP con etiqueta BLE |
| «El hotspot es el respaldo» | ~8 clientes, exige perfil con Internet y **la ACL lo bloquea** |
| «La nube recibe todo» | La cola LAN nunca se drena: 2000 registros de junio a octubre |
| «Los datos están respaldados» | 3,7 MB en LevelDB, sin copia, y el desinstalador los borra |
| «Auditamos lo que usa el cajero» | Auditamos 1.0.232-dev; la flota está en 1.0.229–1.0.231 |
| «WiFi Direct da P2P» | Stub: `started:false`, `supported:false` |

---

## §2bis · DECISIÓN DE FIRMA (bloqueante para toda la operación)

**Hecho verificado:** la pubkey embebida en el binario es `A0EE9D152E5A3C9E`. Las releases publicadas desde ~1.0.160 están firmadas con `AD59656123565E0B`. El updater ejecuta `minisign_verify` y **falla** antes de instalar. Resultado: **la flota no se actualiza sola**. Las 7 descargas de 1.0.231 son instalaciones manuales.

Hay exactamente **dos** salidas. No hay tercera.

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A — Recuperar la clave A0EE** | Encontrar la privada que corresponde a la pubkey embebida (en backups, CI antiguo, disco de algún dev) | Bajo si aparece | Si no aparece, se pierde tiempo |
| **B — Rotar a una clave nueva** | Generar clave nueva, publicar 1.0.232 firmada con ella, **reinstalar a mano en cada equipo** de la flota | Alto: reinstalación manual por equipo | La flota queda congelada en su versión actual hasta que alguien vaya físicamente |

**Decisión requerida antes de F2.** Sin ella, F2 no tiene sentido: se puede construir un instalador que nadie puede recibir por OTA.

**Pista:** la única `.pub` en disco es `crozzo-pos.key.pub` = 65A8 (distinta a A0EE). El secreto de CI corresponde a 0B5E/AD59. Ninguno es A0EE. La clave A0EE probablemente está en un backup antiguo, un correo o un pendrive del dev original.

**Corolario:** hasta que esto se resuelva, **ningún arreglo llega a las cajas**. Por eso la acción 0 del plan (fix del ACK de la cola LAN) es la única que se puede aplicar sin OTA, porque se ejecuta en el código local del hub.

---

## §3 · FASES

Dependencias: **F0 → F1 → F2 → {F3, F4} → F5 → F6 → F7 → F8**.
F3 antes que F4: primero no perder datos, después cobrar bien.

### F0 · Congelar y fijar base
| | |
|---|---|
| Duración | 0,5 día |
| Requiere | Nada (sin hardware, sin build) |
| Dueño | 1 dev senior con permiso de git |
| Riesgo si se salta | Todo arreglo posterior se pierde o se duplica |

**Tareas**
1. Revisar las 49 rutas sin commitear y separar: basura / trabajo real / artefactos.
2. Resolver el duplicado `src/CrozzoPosMain.js` (borrar o mover a `_legacy/`, nunca dejar dos).
3. Alinear el `<meta name="crozzo-app-version">` con la versión real.
4. Tag de base: `v1.0.232-base`.
5. Congelar `src/index.html` como generado (marcar en cabecera «no editar a mano»).

**PASS**
- `git status --porcelain` → **0 líneas**.
- `git describe --tags --exact-match` → `v1.0.232-base`.
- `Get-ChildItem src -Filter CrozzoPosMain.js` → **0 resultados** en la raíz.
- El meta de versión coincide con el tag.

**FAIL** si queda cualquier ruta sin commitear o existen dos `CrozzoPosMain.js`.

---

### F1 · Toolchain de compilación
| | |
|---|---|
| Duración | 2–4 h (descarga ~7 GB) |
| Requiere | PC Windows con permisos de administrador, Internet |
| Dueño | 1 dev |
| Riesgo si se salta | No se puede construir ni verificar nada nativo |

**Tareas**
1. `winget install Microsoft.VisualStudio.2022.BuildTools` con workload **Desktop development with C++** (MSVC v143 + Windows 11 SDK).
2. `winget install NSIS.NSIS` (falta en la máquina; sin él no se genera el instalador).
3. Reabrir consola y verificar `rc.exe`/`link.exe`/`makensis.exe`.
4. `rustup show` → confirmar target `x86_64-pc-windows-msvc`.
5. `cargo check` en `src-tauri`.

**PASS**
- `Get-Command rc.exe`, `link.exe` y `makensis.exe` devuelven ruta.
- `cargo check` → **exit 0** sin error de `tauri-winres`.

**FAIL** si `cargo check` falla por cualquier otra causa: se documenta el error exacto y se abre incidencia, no se improvisa.

**Decisión pendiente:** no intentar target GNU. Las dependencias (`webview2-com`, `windows 0.61`, `rusqlite bundled`) asumen MSVC; cambiar de target multiplica el riesgo sin beneficio.

---

### F2 · Primer build reproducible
| | |
|---|---|
| Duración | 1 día |
| Requiere | F1 |
| Dueño | 1 dev + 1 verificador |
| Riesgo si se salta | Se sigue distribuyendo un binario que nadie puede reconstruir |

**Tareas**
1. Resolver la deriva `src/`↔`app/` (`npm run sync`) y revisar `git diff`.
2. Fijar la versión (`node scripts/set-tauri-version.mjs X.Y.Z`) con X.Y.Z > 1.0.231.
3. **Gate de clave:** firmar un archivo de prueba con la clave privada y comprobar que el keynum coincide con el de la pubkey embebida (A0EE…). **Si no coincide, parar: no hay build útil.**
4. `npm run tauri build` (sin tocar `src/` a mano).
5. Registrar SHA-256 del instalador y del `.exe`.
6. Instalar en una máquina limpia (VM o PC de prueba).
7. Comprobar que la versión visible coincide con el tag.

**PASS**
- Existe instalador NSIS con la versión del tag + `.sig` de 424 B.
- El keynum del `.sig` coincide con la pubkey embebida (sin warning de `sign_updaters`).
- Hash registrado en `docs/maps/ops/evidencia/`.
- En máquina limpia: la app abre, el login muestra la versión del tag.
- `plugin:updater|check` devuelve `null` (sin error de firma).

**FAIL** si el instalador no arranca, si la versión visible no coincide, o si el build exige tocar archivos a mano.

---

### F3 · Integridad de datos
| | |
|---|---|
| Duración | 1 día |
| Requiere | F2 |
| Dueño | 1 dev Rust + 1 dev frontend |
| Riesgo si se salta | Pérdida total de ventas y facturas; doble consecutivo |

**Tareas**
1. Añadir `tauri-plugin-single-instance`.
2. Respaldo nativo diario de `pos_dian_config` + `crozzo_fiscal_outbox_v1` a `%APPDATA%\com.crozzo.pos\backups\AAAA-MM-DD.json`, rotación 30 días.
3. Prohibido el fallback silencioso: si `JSON.parse` falla, renombrar el blob a `.corrupt.<ts>` y avisar en pantalla antes de escribir defaults.
4. `crozzo_schema_version` con bloqueo de escritura si la versión es mayor que la soportada.
5. Quitar el `slice(-200)` ciego: si el outbox fiscal llega al tope, **detener y avisar**, no truncar.

**PASS**
- Abrir el POS dos veces → la segunda enfoca la primera; **una sola** instancia en el administrador de tareas.
- Tras 24 h de uso, existe al menos un archivo en `backups\`.
- Corromper `pos_dian_config` a propósito → la app avisa, guarda copia `.corrupt.*` y **no** borra facturas.
- Insertar 201 documentos en el outbox → la app avisa; no pierde ninguno.

**FAIL** si dos instancias corren a la vez, si el respaldo no aparece, o si un archivo corrupto termina en datos vacíos.

---

### F4 · Cobro y factura (P0 de negocio)
| | |
|---|---|
| Duración | 2–3 días |
| Requiere | F2 (y F3 para no agravar el riesgo) |
| Dueño | 1 dev frontend + 1 tester de caja |
| Riesgo si se salta | No se puede cobrar. Es el corazón del producto |

**Problema medido:** el wizard de cobro abre vacío (0 caracteres, 0 campos, 4 botones) y no genera factura; «Reportes y dashboard» no navega para administración.

**Tareas**
1. Reproducir el cobro en el binario Tauri y capturar la traza exacta del wizard vacío.
2. Reparar la ruta de render del wizard (no el HTML: el contenido no se inyecta).
3. Garantizar el orden fiscal: **persistir → firmar → limpiar carrito**. Nunca al revés.
4. Reparar la navegación de administración a Reportes.
5. `crozzo_save_pdf_b64`: implementarlo o retirar las 3 llamadas. No dejar el fantasma.

**PASS**
- 20 ventas consecutivas: cada una genera factura con CUFE, persiste, limpia el carrito y sube el consecutivo exactamente +1.
- Cerrar la app entre venta y venta no duplica ni pierde ninguna.
- El rol administración abre Reportes en ≤2 clics.
- Exportar PDF de costos: funciona o el botón no existe (sin excepción en consola).

**FAIL** si hay un solo CUFE duplicado, una factura sin persistir o un carrito que no se limpia.

---

### F5 · Red local real
| | |
|---|---|
| Duración | 2–3 días |
| Requiere | F2 · hardware: 1 PC caja + 2 tablets + router |
| Dueño | 1 dev Rust + 1 dev frontend |
| Riesgo si se salta | Sin LAN no hay operación multi-dispositivo sin Internet |

**Tareas**
1. Servir el frontend desde el hub (o aceptar formalmente que cada equipo se instala — hay que decidirlo, no dejarlo ambiguo).
2. Token obligatorio también en GET; CORS restringido a `tauri.localhost` + IP del AP; cerrar `POST /api/consultar-rut`.
3. Arreglar WS con canal por cliente y `select!` (≈20 líneas) para que el push exista y el polling se auto-suprima.
4. mDNS con todas las IPv4 y **nunca** loopback; refrescar `at_ms`.
5. Cola LAN: descartar ruido de presencia antes que comandas; append-only en disco.
6. Abrir hotspot en ACL **solo si** se decide que es canal soportado; si no, retirarlo del discurso.

**PASS**
- Una tablet carga el POS desde la caja por LAN (si se decide servir) o queda documentado que no.
- Comanda creada en tablet aparece en caja en **<2 s** por push (no por poll).
- Sin token → **401** en todos los endpoints.
- Con el router apagado y sin Internet, caja y tablets se descubren por mDNS con IP válida (nunca 127.0.0.1).
- 20 comandas seguidas: 0 pérdidas, 0 duplicados.

**FAIL** si se descubre por loopback, si un endpoint queda abierto, o si se pierde una comanda.

---

### F6 · Fiscal y contingencia
| | |
|---|---|
| Duración | 3–5 días |
| Requiere | F3, F4 |
| Dueño | 1 dev + asesoría contable/DIAN |
| Riesgo si se salta | Venta sin cola legal ante caída de DIAN |

**Tareas**
1. Embarcar `CrozzoContingenciaFiscal` (hoy no está en `src/index.html`).
2. Outbox fiscal append-only en Rust, fuera de `localStorage`.
3. Firmar y emitir local; transmitir después; reintento con backoff y acuse persistente.
4. Retención declarada: caja 90 días + fiscal; tablet 7; impresora 48 h; nube histórico.

**PASS**
- Simular DIAN caída → la venta se emite, se firma y queda en cola con evidencia.
- Al volver DIAN → se transmite y se marca acuse; el documento no se duplica.
- Reiniciar la app con 50 documentos en cola → los 50 siguen ahí.

**FAIL** si una venta queda sin representación fiscal o si el reintento duplica un CUFE.

---

### F7 · Seguridad
| | |
|---|---|
| Duración | 1–2 días |
| Requiere | F2 |
| Dueño | 1 dev Rust + 1 revisor |
| Riesgo si se salta | RCE por instalador, SSRF, cámara sin consentimiento |

**Tareas**
1. `install_setup_from_url`: verificar firma/hash del manifiesto, allowlist de host, `redirect none`.
2. CSP sin `'unsafe-inline'`; `connect-src` cerrado; instalador en capability aparte.
3. `crozzo_http_*`: allowlist de hosts, bloquear rangos privados/loopback/link-local, límite de cuerpo, revalidar cada redirección.
4. Docks: comparar host exacto, no subcadena. Añadir `crozzo-supabase-dock` a una capability o retirarlo.
5. Cámara/mic: comprobar origen antes de `SetState(ALLOW)`.
6. Limpiar ACL: borrar `crozzo_save_pdf_b64` fantasma, decidir explícitamente sobre hotspot/emulación/dev-log.

**PASS**
- URL de instalador no firmada → **rechazada** con mensaje.
- `http://169.254.169.254` y `http://127.0.0.1` → **rechazadas**.
- Script inline inyectado → **no ejecuta** (CSP) y no alcanza IPC.
- Origen remoto en `main` → cámara **denegada**.

**FAIL** si cualquiera de los cuatro pasa.

---

### F8 · Verificación en sede
| | |
|---|---|
| Duración | 1 día en sitio |
| Requiere | F2–F7 · hardware real · personal real |
| Dueño | 1 verificador + encargado de sede |
| Riesgo si se salta | Se certifica algo que no aguanta un turno real |

**Tareas**
1. Capturar los 5 datos de versión (login, `FileVersion`, Configuración→Aplicaciones, tamaño del perfil, manifiesto servido).
2. Correr el arnés de personas sobre el **binario**, no sobre Chromium.
3. Probar impresora térmica real, apertura de cajón, corte.
4. Probar 2 tablets + caja con el router de la sede, y luego sin Internet.

**PASS**
- 5/5 datos de versión capturados y coincidentes.
- Personas: **PASS ≥ 12/16** (hoy 10/16).
- Ticket impreso legible, con corte y cajón.
- 20 comandas sin pérdida en LAN, con y sin Internet.

---

## §4 · LO QUE SE PUEDE HACER HOY (sin hardware, sin MSVC)

| # | Acción | Esfuerzo | Valor |
|---|---|---|---|
| **0** | **Añadir `crozzo_lan_sync_ack` a `permissions/crozzo-commands.toml`** | **10 min** | **Detiene la pérdida de comandas en curso.** Una línea |
| 0b | Buscar la clave privada A0EE en backups/correos/pendrives del dev original | 1–3 días | Decide si la flota se actualiza por OTA o a mano |
| 1 | Congelar base y resolver el duplicado `CrozzoPosMain.js` | 2 h | Elimina una clase entera de «arreglos que no se ven» |
| 2 | Instalar toolchain con `winget` | 2–4 h | Desbloquea todo lo demás |
| 3 | Limpiar ACL: quitar `crozzo_save_pdf_b64`, añadir `lan_sync_ack` | 1 h | Cierra permisos fantasma |
| 4 | Reproducir el wizard de cobro vacío y capturar la traza | 2 h | Convierte «no cobra» en un bug con causa |
| 5 | Añadir `single-instance` (código listo, build pendiente) | 2 h | Elimina doble consecutivo de raíz |
| 6 | Documentar la decisión «LAN sirve frontend: sí/no» | 1 h | Mata una ambigüedad que bloquea F5 |

---

## §5 · LO QUE REQUIERE HARDWARE O PERSONAS

- Impresora térmica POS real (USB y red) → F5, F8.
- 2 tablets Android de gama baja + 1 router de sede → F5, F8.
- Cajón de dinero → F8.
- Personal de sede (cajero, mesero, administración, cocina) → F8.
- Acceso a un equipo de sede para leer versión instalada → F8 (hoy **BLOQUEADO**).

---

## §6 · PROHIBIDO EN LAS PRÓXIMAS 48 H

1. **Publicar release o tocar el feed.** El updater es silencioso: un release malo entra solo en toda la flota.
2. **Ejecutar `npm run sync`.** Sobrescribe `src/index.html` y borra trabajo.
3. **Editar `src/index.html` a mano.**
4. **Instalar 1.0.231 en una sede.** El artefacto no es reproducible en esta máquina.
5. **Borrar `app/`.** Es la única referencia de lo que existió.
6. **Aplicar parches por búsqueda de texto sobre `CrozzoPosMain.js`.** Hay dos archivos con ese nombre y el más grande no es el que se carga.
7. **Declarar cualquier cosa «certificada».** Hoy el acta dice NO CERTIFICADO.

---

## §7 · AUDITORÍA DE PERSONAS (escala 1→100)

Se mantiene el arnés `scripts/qa-personas-mision-cien.mjs` con `QA_TREE=src`, pero **solo vale si corre contra el binario**. Estado actual: **PASS 10 · FAIL 6**, 0 errores de página.

| Rol | Qué se audita | Escala | Estado |
|---|---|---|---|
| Cajero | Cobro completo, arqueo, cierre de turno | 1→100 | Fallando: wizard vacío, 0 facturas |
| Mesero | Tomar comanda, enviar a cocina, cobrar mesa | 1→100 | Parcial: comandas no llegan en tiempo real |
| Administración | Reportes, dashboard, permisos | 1→100 | Fallando: no navega |
| Cocina | Recibir comanda, marcar listo | 1→100 | Parcial: depende de polling |

**Criterio de certificación:** ≥ 12/16 PASS y ningún FAIL en cobro o fiscal.

---

## §8 · CRITERIO DE CIERRE

La operación se declara **CERTIFICADA** solo si:
1. F0–F7 tienen PASS registrado con evidencia pegada.
2. F8 se ejecutó en sede con hardware real.
3. Existe instalador reproducible con hash y versión coincidente.
4. 20 ventas consecutivas sin CUFE duplicado.
5. 20 comandas sin pérdida en LAN, con y sin Internet.
6. Un archivo corrupto no destruye datos.
7. Personas ≥ 12/16.

Cualquier punto en FAIL → **NO CERTIFICADO**, y se documenta qué falta.
