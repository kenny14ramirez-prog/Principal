# BITÁCORA DE INVESTIGACIÓN — APLICACIÓN TAURI

| Campo | Valor |
|---|---|
| Operación | MISIÓN CIEN · Fase de verificación Tauri |
| Inicio | 2026-10-28 |
| Árbol | `src-tauri/` + `src/` (lo que empaqueta Tauri) |
| Commit base | `f59eabd` + 49 rutas sin commitear |
| Método | Verificación directa (comando o archivo:línea). Nada se anota como hecho sin reproducción |
| Regla | Navegador **abandonado**: Tauri es el único runtime válido. Impresoras, BLE y LAN nativa se verifican en el binario, no en Chromium |

**Estados:** `CONFIRMADO` · `REFUTADO` · `PENDIENTE` · `BLOQUEADO` (no verificable en este entorno)

---

## FASE 0 — TERRENO (Estado Mayor)

### B-01 · Toolchain instalado
- **Comando:** `rustc --version`, `cargo --version`, `node --version`, `npx tauri --version`
- **Dato:** rustc 1.95.0 · cargo 1.95.0 · node v24.20.0 · tauri-cli 2.11.2
- **Estado:** CONFIRMADO

### B-02 · Enlazador MSVC ausente (causa raíz del bloqueo de compilación)
- **Comando:** `Get-Command rc.exe/link.exe`; `vswhere`; `C:\Program Files (x86)\Windows Kits\10\bin`
- **Dato:** `rc.exe` y `link.exe` **no están en PATH**; `vswhere.exe` **no existe**; el directorio `Windows Kits` **no existe**. No hay Visual Studio ni Windows SDK instalados.
- **Consecuencia:** `cargo check` muere en el build script de `tauri-winres` («Are you sure you have RC.EXE…»). **No es un bug del repo: es una máquina sin toolchain.**
- **Estado:** CONFIRMADO

### B-03 · Vía de desbloqueo disponible
- **Comando:** `Get-Command winget`
- **Dato:** `winget` disponible (`WindowsApps\winget.exe`)
- **Consecuencia:** se puede instalar *VS Build Tools + Windows SDK* sin descargar nada a mano. Es la primera tarea ejecutable del plan.
- **Estado:** CONFIRMADO

### B-04 · Frontera de empaquetado
- **Evidencia:** `src-tauri/tauri.conf.json:7` → `"frontendDist": "../src"`; `"withGlobalTauri": true`
- **Dato:** Tauri sirve `src/`. `app/` no se empaqueta.
- **Estado:** CONFIRMADO

### B-05 · Conteo real de scripts por árbol
- **Comando:** conteo de `<script` en los tres HTML
- **Dato:** `app/index.html` **179** · `app/Crozzo_POS_Completo.html` **155** · `src/index.html` **155** (151 con `src` al cargar)
- **Estado:** CONFIRMADO

### B-06 · Módulos ausentes en el árbol desplegado
- **Comando:** búsqueda de cada módulo en los tres HTML
- **Dato:**

| Módulo | `app/index.html` | `Crozzo_POS_Completo.html` | `src/index.html` |
|---|---|---|---|
| `CrozzoOcrFactura` | ✅ | ❌ | ❌ |
| `CrozzoContingenciaFiscal` | ✅ | ❌ | ❌ |
| `CrozzoComandaArchive` | ✅ | ❌ | ❌ |
| `CrozzoBlobStore` | ❌ | ❌ | ❌ |
| `CrozzoFiscalOutboxDrain` | ✅ | ✅ | ✅ |

- **Estado:** CONFIRMADO

### B-07 · Superficie nativa: comandos declarados vs registrados
- **Comando:** análisis de `#[tauri::command]` vs `generate_handler!` en `src-tauri/src`
- **Dato:** **78 comandos únicos** declarados · **73 registrados** · **5 ausentes** (`crm_registro_start/stop/status/drain_pending/push_pending`).
- **Estado:** CONFIRMADO

### B-08 · Archivos Rust que no se compilan — **CORREGIDO por TI-3**
- **Comando original:** comparación de archivos `.rs` vs `mod` en `lib.rs` → dio 3 archivos «sin módulo»
- **Corrección (verificada):** `crozzo_print.rs:3-6` los declara con `#[path]`:
  ```
  #[path = "crozzo_print_html.rs"]     mod crozzo_print_html;
  #[path = "crozzo_print_html_pdf.rs"] mod crozzo_print_html_pdf;
  ```
  **Sí se compilan** y sus comandos están registrados (`lib.rs:110-112`). Mi barrido solo miraba `mod x;` con nombre de archivo igual al módulo.
- **Dato final:** **un solo archivo sin compilar: `crm_registro_server.rs`** (13.191 B, servidor HTTP estático + `/api/consultar-rut`).
- **Estado:** REFUTADO para 2 de 3 · CONFIRMADO para `crm_registro_server.rs`

### B-09 · Comando invocado por JS que no existe en Rust
- **Evidencia:** `src/bundles/CrozzoBundleCostos.js:14695` y `src/modules/CrozzoCostosReportesPdf.js:204` llaman `tauriInvoke('crozzo_save_pdf_b64', …)`; no existe en `src-tauri/src/*.rs`. `permissions/crozzo-print.toml` lo autoriza igual.
- **Consecuencia:** guardar PDF de costos falla en runtime con «command not found».
- **Estado:** CONFIRMADO

### B-10 · Artefacto construido ≠ versión actual
- **Comando:** inventario de `src-tauri/target/release`
- **Dato:** último instalador **`BONA origen_1.0.106/1.0.109_x64-setup.exe`** (12–13 jun 2026, ~9,8 MB) y `tauri-app.exe` de 21,57 MB (13 jun). La versión configurada es **1.0.231**.
- **Consecuencia:** **no existe artefacto de la versión actual**. Lo instalado en campo (si salió de esta máquina) es 1.0.109, muy anterior al árbol auditado.
- **Estado:** CONFIRMADO (falta verificar qué versión corre realmente en la sede → TI-5)

### B-11 · Canal de actualización
- **Evidencia:** `tauri.conf.json` plugins.updater → pubkey minisign + endpoint `github.com/kenny14ramirez-prog/Principal/releases/latest/download/latest.json`; `installMode: quiet`; `releases/latest.json` declara `1.0.231-critical` con `message: "12563245"`.
- **Dato:** hay firma (`.sig`, 424 B) solo para 1.0.106/1.0.109. El feed anuncia 1.0.231 sin artefacto verificable en disco.
- **Riesgo:** actualización automática a un binario que no se puede reconstruir ni auditar.
- **Estado:** CONFIRMADO el config; PENDIENTE validar firma/artefacto remoto

### B-12 · Superficie por `withGlobalTauri` + CSP (acotada por TI-2)
- **Evidencia:** `withGlobalTauri: true`; CSP `script-src 'self' 'unsafe-inline'`; **ninguna** capability declara `remote` (`capabilities/*.json`, 0 coincidencias)
- **Dato:** cualquier script inline **servido desde el propio bundle** obtiene `window.__TAURI__` y puede invocar todos los comandos autorizados, incluido el instalador silencioso.
- **Corrección de alcance:** las 7 ventanas remotas (WhatsApp, Gmail, Drive, Dataico, DIAN, Spotify, Supabase) **no** pueden invocar IPC, porque Tauri deniega por origen cuando no se declara `remote`. El riesgo remoto es de sesión/phishing, **no de RCE**.
- **Estado:** CONFIRMADO con alcance corregido

### B-13 · El instalador silencioso acepta cualquier EXE HTTPS
- **Evidencia:** `src-tauri/src/crozzo_silent_install.rs` → solo valida `url.starts_with("https://")`, descarga, escribe en `%TEMP%` y ejecuta.
- **Dato:** no hay firma, hash ni allowlist de dominio.
- **Consecuencia:** RCE si la webview es comprometida (combinado con B-12).
- **Estado:** CONFIRMADO

### B-14 · SQLite solo para emulación
- **Evidencia:** `crozzo_emulation.rs:52` abre `test.db`; tablas `print_log` y `automation_log`. `crozzo_emulation_query_sql` exige `SELECT` y modo emulación activo.
- **Dato:** **los datos de negocio NO están en SQLite**: viven en `localStorage` del WebView2.
- **Estado:** CONFIRMADO

### B-15 · Sin protección de instancia única
- **Comando:** `Cargo.toml` no incluye `tauri-plugin-single-instance`
- **Dato:** se pueden abrir **dos instancias** del POS sobre el mismo perfil → dos drenajes fiscales, dos consecutivos, doble timbrado.
- **Estado:** CONFIRMADO (falta reproducir → TI-4)

### B-16 · WebSocket LAN roto (arrastre de auditoría previa, re-verificar en Tauri)
- **Evidencia previa:** `crozzo_lan_ws.rs:39-45` (`try_lock` + `Handle::block_on`), `:70-75` (lock retenido en `next().await`).
- **Estado:** PENDIENTE de confirmación por TI-3

### B-17 · Rutas de impresión registradas
- **Evidencia:** `lib.rs:102-112` registra `crozzo_list_printers`, `crozzo_get_default_printer`, `crozzo_print_raw`, `crozzo_print_raw_b64`, `crozzo_print_html_b64`, `crozzo_html_to_pdf_b64`.
- **Estado:** CONFIRMADO que existen; PENDIENTE verificar si imprimen de verdad (TI-3)

### B-18 · Superficie real invocada por el frontend
- **Comando:** escaneo de `src/**/*.{js,mjs,html}` (255 archivos) buscando `tauriInvoke`, `crozzoTauriInvoke`, `crozzoTauriInvokeSafe`, `invoke` y `__TAURI__.core.invoke`
- **Dato:** **46 comandos nativos** invocados desde JS; **72 registrados** en Rust.
- **Estado:** CONFIRMADO

### B-19 · Comando invocado que no existe y no es opcional
- **Evidencia:** `src/bundles/CrozzoBundleCostos.js`, `src/modules/CrozzoCostosReportesPdf.js:204`, `src/modules/CrozzoRecetarioCocina.js` → `tauriInvoke('crozzo_save_pdf_b64', …)`
- **Dato:** no existe en ningún `.rs`; `permissions/crozzo-print.toml` sí lo autoriza (permiso sobre un fantasma). Usa `tauriInvoke` (no la variante `Safe`), así que **lanza excepción**, no degrada.
- **Consecuencia:** exportar PDF de costos, reportes de costos y recetario falla en Tauri.
- **Estado:** CONFIRMADO

### B-20 · Comando fiscal invocado que no existe
- **Evidencia:** `src/modules/CrozzoContingenciaFiscal.js` → `crozzo_fiscal_outbox_save_sqlite`
- **Dato:** no existe en Rust. El módulo además **no está cargado** en `src/index.html` (B-06), así que el doble fallo se cancela solo: no se ejecuta, pero tampoco existe la contingencia.
- **Estado:** CONFIRMADO

### B-21 · 14 comandos registrados están bloqueados por la ACL (no autorizados en ninguna capability)
- **Comando:** cruce `permissions/*.toml` × `capabilities/*.json` × `generate_handler!`
- **Dato:** registrados en Rust pero **sin autorización** en el binario empaquetado:
  - `crozzo_hotspot_start`, `crozzo_hotspot_stop`, `crozzo_hotspot_status`
  - `crozzo_emulation_set_active`, `crozzo_emulation_status`, `crozzo_emulation_reset_db`, `crozzo_emulation_log_action`, `crozzo_emulation_query_sql`
  - `adq_enrich_health`, `adq_enrich_ensure_sidecar`, `adq_enrich_start_job`, `adq_enrich_poll`
  - `crozzo_lan_sync_ack`, `crozzo_append_dev_log` (+ `greet`, código de plantilla)
- **Consecuencia 1:** el **hotspot** —cuarto canal de la cascada— está implementado en Rust y **la app empaquetada no puede invocarlo**. La cascada pierde un escalón real.
- **Consecuencia 2:** el **arnés de emulación** (`CrozzoEmulationHarness.js`) no puede operar dentro de Tauri: `allow-crozzo-emulation` existe pero **ninguna capability lo activa**. Todo QA basado en emulación dentro del binario es no ejecutable.
- **Consecuencia 3:** `crozzo_lan_sync_ack` bloqueado → el acuse de recibo LAN no puede confirmarse desde JS.
- **Estado:** CONFIRMADO

### B-22 · El WebSocket LAN sí arranca, pero desde Rust (no es código muerto)
- **Evidencia:** `crozzo_lan_sync_server.rs:1243` → `crozzo_lan_ws::crozzo_lan_ws_start(Some(ws_port))`; `:1247` → `crozzo_mdns::start_with_lan(...)`; `:1305` → stop.
- **Dato:** `crozzo_lan_ws_start` / `crozzo_mdns_start_advertise` aparecen "sin llamada desde JS" porque los invoca Rust al levantar el hub. **No son huérfanos.** El bug de B-16 sigue en pie, pero la ruta sí se ejecuta.
- **Estado:** CONFIRMADO (corrige una falsa alarma del primer barrido)

---

## FASE 1 — INVESTIGADORES EN CAMPO

| Equipo | Dominio | Estado |
|---|---|---|
| TI-1 | Build, empaquetado y actualización | **Recibido** |
| TI-2 | Superficie IPC, permisos y seguridad | **Recibido** |
| TI-3 | Hardware y red nativa (impresión, BLE, LAN, WS) | **Recibido** |
| TI-4 | Persistencia, instancias y fiscal en Tauri | **Recibido** |
| TI-5 | Paridad campo: 1.0.109 instalado vs 1.0.231 del árbol | **Recibido** |

---

## FASE 1 — INFORME TI-3 · HARDWARE Y RED

> Recibido 2026-10-28. Pendiente de verificación por Asuntos Internos. Aquí va **tal como llegó**, con mi comentario de mando al cierre de cada bloque.

### Línea base de lo que la app realmente soporta

| Capacidad | Veredicto | Evidencia | Realidad |
|---|---|---|---|
| Impresión RAW ESC/POS | CONFIRMADO | `crozzo_print.rs:280` `OpenPrinterW`, `:285` `pDatatype="RAW"`, `:310` `WritePrinter`, `:195` enum local+conexiones+red | Solo **colas del spooler Windows**. Impresora USB sin driver no imprime: no hay `CreateFileW` ni `\\.\COMx` en el crate. Encoding en JS, CP850 (`CrozzoPrintService.js:381`) |
| Impresora inexistente / colgada | CONFIRMADO | `:280-281` error inmediato; `:298-300`, `:320-327` `break` al primer fallo | **Cero timeout, cero reintentos**. `WritePrinter` bloqueante + comando síncrono (`:66`) → un spooler colgado retiene el IPC 30–60 s. Copias se cortan a la primera falla |
| `print_html_b64` / `html_to_pdf_b64` | **VIVO** (corrige B-08) | `crozzo_print_html.rs:126,152` `ICoreWebView2_16::Print`+`SetPrinterName`; PDF `PrintToPdf` `:233`; deadlines 90 s / 75 s / 95 s | Ruta viva. Bug: `copies>1` **no imprime más de una vez**, solo lo dice el mensaje (`crozzo_print_html.rs:49,199`) |
| HTTP LAN | CONFIRMADO | puerto 3000; `:300-313` `Connection: close` + `ACAO: *`; `:811-816` body 64 KB, timeout 8 s | Auth `x-crozzo-lan-token` **solo en POST**: GET de comandas/runtime/digest es libre. `POST /api/consultar-rut` (`:1078`) **sin auth**. Body: **64 KB en una sola lectura**, sin 413 → JSON truncado |
| Servir frontend a tablets | **NO EXISTE** | `:1129` todo lo no-JSON → 404 | El hub LAN **no sirve `index.html` ni assets**. Cada tablet necesita su propia instalación. El servidor estático es `crm_registro_server.rs`, que **no se compila** (B-08) |
| WS LAN | CONFIRMADO roto | `:39` `try_lock`; `:43-45` `block_on`; `:70-75` lock retenido en `next().await` | `broadcast_text` corre en comando síncrono → `Handle::try_current()` = `Err` → **0 mensajes push**. Alternativa activa: polling HTTP 400–4800 ms (`CrozzoLanOpsSync.js:797-823`). `softPollCoveredByWs()` siempre falso (`:80-83`) |
| BLE mesh | CONFIRMADO inexistente | `:161-164` en no-desktop `Ok(())` sin enviar; sin `btleplug`/`bluetooth` en Cargo | Escritorio = **UDP** etiquetado `win-udp-mesh` (`:72-78`). Android/iOS no transmite nada. `native_ble:true` es solo etiqueta (`:110`) |
| Gossip UDP | CONFIRMADO | `:12` 45777; `:13` 239.255.77.88; `:90` buf 8192; `:163` rechazo >7800 B; `:111-113` drop-oldest a 256 | **Sin MAX_HOPS en Rust** (en JS: 5 y 12) y **sin fragmentación**. Comanda >7800 B → error y el JS solo `log()` (`CrozzoOfflineGossip.js:322-324`) = **pérdida silenciosa**. Multicast por **una sola interfaz** → malla se parte con hotspot+Ethernet |
| Hotspot | CONFIRMADO | `:44-49` `CreateFromConnectionProfile`; `:74` `StartTetheringAsync`; 0 usos de `netsh hostednetwork` | WinRT vía PowerShell, funciona en Win11, pero exige perfil con Internet; sin router cae a `AccessDenied`. **Tope ~8 clientes.** Y la ACL lo bloquea (B-21) |
| mDNS | CONFIRMADO | `:10` `_crozzo-pos._tcp.local.`; TXT `loc/dev/biz/ws/role`; `:50-61` IP vía `connect("8.8.8.8:80")` | **Anuncia 127.0.0.1 si no hay ruta a Internet** (`:60`) — es decir, falla exactamente en el escenario offline. Una sola IPv4; `at_ms` no se refresca → peers caen a los 120 s (`:245-250`) |
| WiFi Direct | CONFIRMADO stub | `:31-52` `started:false`, `mode:"http_peer_relay"`; `:18-26` `supported:false` | Cero P2P. No hay socket, ni GO, ni grupo |

### Límites físicos a 100 dispositivos
- **HTTP:** 64 conexiones concurrentes (`:34`); con `Connection: close`, cada poll es handshake nuevo. 100 tablets ≈ 50 conn/s: dentro del techo.
- **Primero en reventar: `pending.json`.** Cada `POST /api/sync` re-serializa y reescribe **toda** la cola (hasta 2000 registros ≈ 2–8 MB) bajo un `std::sync::Mutex` que bloquea el worker de Tokio → ~100 MB/s de disco y latencia en cascada desde **30–40 tablets**. Persistencia con `tmp+rename` (`:288-297`); solo `pending` sobrevive reinicio; `runtime_snapshot`, `comandas_active`, `seen_actions` viven **en RAM**.
- **Gossip O(n²):** 1 comanda → 2 × 100 emisores = 200 datagramas; 100 receptores → **20.000 entregas por evento**. Cola de 256 con drop-oldest → **pierde comandas antes que cualquier otro componente**.
- **Hotspot:** ~8 clientes. No existe como plan para 100.

### Acciones propuestas por TI-3
1. Arreglar WS con canal `mpsc` por cliente y `select!` (≈20 líneas) → push real y polling que se auto-suprime.
2. Exigir token en los GET y en `POST /api/consultar-rut`; CORS restringido a `tauri.localhost` + IP del AP.
3. `pending.json` append-only (JSONL) con compactación.
4. Gossip: dedupe por `msgId` en Rust, reply unicast, fragmentación >1200 B, avisar en vez de `log()`.
5. Sacar hotspot del camino crítico; mDNS con **todas** las IPv4 y nunca loopback.

### Comentario de mando sobre TI-3
- **Calidad: A−.** Corrigió un error mío (B-08) con evidencia verificable; distingue lo que existe de lo que funciona.
- **Hallazgo que cambia el plan:** el hub LAN no sirve el frontend. Eso rompe la premisa «tablets entran por la caja» y explica por qué el despliegue depende de instalar en cada equipo.
- **Contradicción de diseño detectada:** mDNS anuncia loopback cuando no hay Internet — el descubrimiento muere justo en el escenario para el que fue construido.
- **A verificar por Asuntos Internos:** los rangos de línea de `crozzo_print.rs` (`:280/285/310`), el tope de 8 clientes del Mobile Hotspot (dato externo, no del código), y si algún script del repo usa `netsh` en otra ruta.

---

## FASE 1 — INFORME TI-5 · QUÉ CORRE REALMENTE EN CAMPO

> Recibido 2026-10-28. Verifiqué en mando los ítems 2, 9 y 10 (marcados ✅ abajo).

| # | Ítem | Veredicto | Evidencia | Consecuencia |
|---|---|---|---|---|
| 1 | Instalación local del producto | REFUTADO | `%LOCALAPPDATA%\Programs` sin BONA/Crozzo; `Program Files*` limpio; registro solo «POS Printer Driver V7.17» | No hay binario instalado que inspeccionar |
| 2 | Ejecutables locales | CONFIRMADO ✅ | `target\release\tauri-app.exe` 22.616.064 B, 13/06/2026, FileVersion **1.0.109** · `target\debug\tauri-app.exe` 28.082.688 B, 03/08/2026, **1.0.231** | El release local es de junio; el dev corre agosto |
| 3 | Instaladores en repo | CONFIRMADO | `bundle\nsis\`: 1.0.106 (12/06, 10.258.136 B), 1.0.109 (13/06, 10.269.537 B) + `.sig` | No hay instalador de 1.0.231 en disco |
| 4 | WebView2 Runtime | CONFIRMADO — cumple | `pv=156.0.4314.50`; carpetas 155 y 156 | Tauri 2 pide ≥92. No es causa de fallos |
| 5 | Perfil `%LOCALAPPDATA%\com.crozzo.pos` | CONFIRMADO | `EBWebView` **845,9 MB**, 55.018 archivos, última escritura **20/10/2026 18:16:56** | La app **sí corrió aquí** (dev), no instalada |
| 6 | Local Storage con datos | CONFIRMADO | `leveldb\009452.log` 1.264.295 B (20/10); contiene literal `1.0.231` y claves `crozzo_*`/`supabase_*` | El frontend que escribió esos datos era 1.0.231 |
| 7 | Commits a `app/` desde 2026-06-13 | CONFIRMADO | 135 commits; ventana 13/06→25/07: 117, y **1 solo no es «release: vX»** | Historial sin trazabilidad por funcionalidad |
| 8 | Módulos JS 1.0.109 → 1.0.231 | CONFIRMADO | `v1.0.109`: 131 JS planos · `v1.0.231`: 233 en `core/infra/modules/ui`; **+102 nuevos, 0 eliminados**; diff 506 archivos, +420.394/−53.175 | No es un parche: es otro producto |
| 9 | Feed `releases/latest.json` | CONFIRMADO ✅ | Local: 7.945 B, 25 entradas (1.0.207→1.0.231), **sin `url` ni `signature`**; en GitHub el manifiesto real pesa 1.826 B y sí trae `platforms.windows-x86_64.url` + firma | **El JSON del repo no es el manifiesto del updater.** El artefacto 1.0.231 existe en GitHub: 22.989.697 B, **7 descargas** (1.0.230: 56 · 1.0.229: 37) |
| 10 | `src/` auditado = 1.0.231 | **REFUTADO** ✅ | `git describe` = **`v1.0.231-31-gf59eabd`** → el árbol está **31 commits por delante** del tag. 16 módulos del working tree no existen en `v1.0.231` (`CrozzoMotorImpuestos.js`, `CrozzoNivelesMadurez.js`, `CrozzoContingenciaFiscal.js`, `CrozzoReversionInventario.js`…). 49 cambios sin commitear | **Se auditó 1.0.232-dev, no el build de campo.** Y `src/index.html` sigue rotulado `1.0.231` |
| 11 | Identificador fiable de build | CONFIRMADO | `<meta name="crozzo-app-version">` = `1.0.109` / `1.0.231` según tag | El meta manda, pero hoy está desfasado del HEAD |
| 12 | Versión real en sede | **BLOQUEADO** | Sin instalación ni acceso a equipos | No se puede afirmar qué corre el cajero |

### Hallazgo adicional verificado por mí (no estaba en el encargo)
- **Duplicado peligroso:** `src\CrozzoPosMain.js` (1.012.628 B) y `src\core\CrozzoPosMain.js` (2.387.011 B). `src/index.html` carga **solo** `core/CrozzoPosMain.js`. El de la raíz es una copia vieja de 1 MB que nadie carga pero todos los `grep` encuentran primero.
- **Riesgo concreto:** cualquier parche aplicado por búsqueda de texto sobre «CrozzoPosMain.js» puede caer en el archivo muerto y no tener efecto. Ya explica por qué hay arreglos que «no se ven» en campo.

### Conclusión de TI-5
- **No verificable** la versión de sede. Indicios: flota en **1.0.229–1.0.230**, con 1.0.231 en solo 7 equipos, y `installMode: quiet` → flota despareja sin control.
- `src/` reproduce la arquitectura y ~90 % de 1.0.231, **pero está adelantado** y contiene duplicados obsoletos. Auditar `src/` sin fijar tag equivale a auditar un producto que el cajero todavía no tiene.
- **Chequeo de 1 minuto:** foto del login (imprime «Versión X» en `core/CrozzoPosMain.js:1170` ← `:1138`), y en Windows `(Get-Item "$env:LOCALAPPDATA\BONA origen\BONA origen.exe").VersionInfo.FileVersion`.

### Comentario de mando sobre TI-5
- **Calidad: A.** Es el informe que más cambia el plan: mata la premisa «auditamos lo que se usa».
- **Decisión que impone:** congelar. No se toca nada hasta fijar una base (`v1.0.231` o un commit nuevo con tag). Los 49 cambios sin commitear y 31 commits sin tag son el terreno donde se pierden los arreglos.
- **A verificar por Asuntos Internos:** los 16 módulos «inexistentes en el tag» (lista exacta), y que el `.sig` de 1.0.109 corresponda de verdad a ese instalador.

---

## FASE 1 — INFORME TI-4 · PERSISTENCIA, INSTANCIAS Y FISCAL

> Recibido 2026-10-28. Verifiqué en mando los ítems 1, 4 y 7 (marcados ✅).

| # | Ítem | Veredicto | Evidencia | Consecuencia |
|---|---|---|---|---|
| 1 | Dónde vive el negocio | CONFIRMADO ✅ | `%LOCALAPPDATA%\com.crozzo.pos\EBWebView\Default\Local Storage\leveldb\` — **11 archivos, 3.709.557 B**, último escrito 20/10/2026 18:16. Origen `META:http://tauri.localhost`. Perfil completo **845,85 MB** | Todo el negocio en 3,7 MB de LevelDB. Borrar esa carpeta = pérdida total |
| 2 | `identifier` vs `productName` | CONFIRMADO | `tauri.conf.json:3-4`; la carpeta es `com.crozzo.pos`; `productName` solo define `$INSTDIR` | Renombrar producto no migra; **cambiar `identifier` abandona los datos** |
| 3 | ¿Rust escribe datos de negocio? | REFUTADO | `crozzo_dev_log.rs:10-14`, `crozzo_emulation.rs:43` (`test.db`), `crozzo_lan_sync_server.rs:258-274`, `crozzo_print_html.rs:38` | **Ningún módulo nativo respalda ventas ni facturas.** No hay `app_data_dir` con negocio |
| 4 | Cola LAN persistida | CONFIRMADO ✅ | `%APPDATA%\BonaOrigenPOS\crozzo_lan_pending.json` — **2.164.217 B, 2000/2000 entradas**, la más antigua **2026-06-19**, la más nueva **2026-10-20**, **sin ACK** | Sobrevive reinicio, **nunca se drena**, y al llegar a 2000 descarta FIFO lo más viejo (`PENDING_MAX=2000` l.24, `drain(0..overflow)` l.792-795) |
| 5 | Instancias múltiples | CONFIRMADO | `Cargo.toml`/`Cargo.lock` sin `tauri-plugin-single-instance`; `lib.rs:60-68` solo process/opener/updater/barcode | Dos POS abren a la vez. `getNextConsecutivo()` (`CrozzoPosMain.js:498-502`) lee de memoria y `save()` (`:380`) reescribe el documento entero → **consecutivo duplicado y facturas pisadas** |
| 6 | Update `quiet` + NSIS | CONFIRMADO (no borra) | `tauri-plugin-updater-2.10.1/src/config.rs:42` → `Quiet => ["/S","/R"]`; `updater.rs:812` añade `/UPDATE`. El borrado exige `$DeleteAppDataCheckboxState = 1` **y** `$UpdateMode <> 1` (CLI `.node`), que hace `RmDir /r "$APPDATA\${BUNDLEID}"` y `RmDir /r "$LOCALAPPDATA\${BUNDLEID}"` | Actualizar conserva todo. **Desinstalar marcando «Delete the application data» borra las dos carpetas de datos** |
| 7 | Respaldo fiscal | CONFIRMADO ✅ **no existe** | `CrozzoPosDianLib.js:480` → `setItem(KEY, JSON.stringify((arr \|\| []).slice(-200)))` dentro de `try{}catch(_){}`; facturas + XML + `ultimoConsecutivo` dentro de `pos_dian_config` (`CrozzoPosMain.js:366-380`); `crozzo_fiscal_outbox_save_sqlite` solo **comentado** (`CrozzoContingenciaFiscal.js:236`); respaldo = descarga manual (`CrozzoPosMain.js:19789`) | Perfil corrupto o disco lleno → **XML/CUFE perdidos sin traza**. Más de 200 documentos pendientes se truncan en silencio |
| 8 | Versionado de esquema | REFUTADO | 112 claves `localStorage`, **ninguna de versión**; migraciones ad-hoc (`CrozzoPosMain.js:114`, `CrozzoStorageHygiene.js:36-106`) | Sobrevive 1.0.109→1.0.231 si no cambian nombres de clave; un rename huerfana datos sin detección; no hay defensa contra downgrade |
| 9 | Instalación real | CONFIRMADO: **no hay nada instalado** | Sin entrada `Uninstall` (BONA/Crozzo/tauri-app), sin carpeta en `Programs`/`Program Files`, sin acceso directo. Solo `target\release\tauri-app.exe` **1.0.109** y datos huérfanos hasta 20/10 | Los datos observados vienen de builds de desarrollo/portables, no de un NSIS instalado |
| 10 | Riesgo #1 | CONFIRMADO | `CrozzoPosMain.js:107-121`: si `JSON.parse` falla → `getDefaultConfig()`; `save()` (`:380`) reescribe el blob completo | Un `pos_dian_config` corrupto **no se pierde al leerlo: se pierde al siguiente guardado**, con facturas y consecutivo a cero |

### Mapa de datos

| Qué | Dónde | Qué lo borra |
|---|---|---|
| Ventas, facturas, XML, `ultimoConsecutivo`, CRM, catálogo | `pos_dian_config` en LevelDB | Limpiar WebView, perfil corrupto, `RmDir` del desinstalador, fallback a defaults |
| Outbox fiscal (`crozzo_fiscal_outbox_v1`, máx. 200) | mismo LevelDB | igual |
| Runtime/comandas y 110 claves `crozzo_*` | mismo LevelDB | igual |
| Cola LAN | `%APPDATA%\BonaOrigenPOS\crozzo_lan_pending.json` (2,1 MB) | el tope de 2000 (FIFO) o el usuario |
| Perfil WhatsApp Web | `%APPDATA%\com.crozzo.pos\whatsapp-web\EBWebView\` | desinstalador con checkbox |
| Logs de dev | `%APPDATA%\com.crozzo.pos\` | — |
| Basura de impresión | 18 `crozzo-print/pdf-*.html` = 1,2 MB en `%LOCALAPPDATA%` | nunca |

### Hallazgo propio: la cola LAN está llena de ruido, no de comandas
- **Dato (verificado por mí):** composición de las 2000 entradas → `fleet_roster` **872**, `comanda` **570**, `identity_card` **505**, `op_ack` 42, `comanda_estado` 11.
- **Lectura:** **69 % de la cola es presencia/identidad**, no negocio. El descarte FIFO tira lo más viejo —que son las comandas de junio— mientras el ruido de presencia sigue rellenando la cola.
- **Consecuencia:** el sistema **pierde comandas primero y conserva latidos**. Es exactamente al revés de lo que debe proteger una cola de negocio.

### Acciones propuestas por TI-4
1. `tauri-plugin-single-instance` → mata doble timbrado y doble consecutivo.
2. Snapshot nativo diario de `pos_dian_config` + outbox a `%APPDATA%\com.crozzo.pos\backups\AAAA-MM-DD.json`, rotación 30 días.
3. No fallback silencioso: renombrar el blob ilegible a `.corrupt.<ts>` y avisar en UI antes de escribir defaults.
4. `crozzo_schema_version` + bloqueo de escritura si es mayor que la soportada.
5. Sacar el outbox fiscal a archivo append-only en Rust + hook NSIS que preserve `%LOCALAPPDATA%\com.crozzo.pos`.

### Comentario de mando sobre TI-4
- **Calidad: A−.** Los números son verificables y los verifiqué; el mapa de datos es directamente utilizable por el plan.
- **El hallazgo más grave no es el que TI-4 destaca:** es que la cola lleva **cuatro meses sin drenarse** y el 69 % de su contenido es ruido de presencia. No es un bug de capacidad: es que **nadie consume `pending`** en ese equipo y el sistema prefiere conservar latidos antes que comandas.
- **Confirma P0 nº1 y lo empeora:** sin single-instance, el riesgo no es solo «no se persiste la factura», es **consecutivo duplicado** — dos procesos leyendo el mismo contador y reescribiendo el mismo blob.
- **Riesgo de la recomendación 5:** un hook NSIS que preserve datos choca con la expectativa de «desinstalar borra todo». Debe quedar documentado y probado, o se convierte en fuga de datos fiscales en equipos revendidos.

---

## FASE 1 — INFORME TI-2 · IPC, PERMISOS Y SEGURIDAD

> Recibido 2026-10-28. Verifiqué en mando los ítems 4, 5, 6 y 9 (marcados ✅).

| # | Ítem | Veredicto | Evidencia | Riesgo |
|---|---|---|---|---|
| 1 | `allow-*` vs `permissions/*.toml` | CONFIRMADO | Las 16 referenciadas existen. `allow-crozzo-emulation` definido (`permissions/crozzo-emulation.toml:2`) pero **no aparece** en ninguna capability. `allow-crozzo-android-install` solo en `mobile.json:11` | 5 comandos de emulación muertos: **cobertura falsa**, no fuga |
| 2 | Permisos fantasma / comandos sin permiso | CONFIRMADO | `crozzo_save_pdf_b64` en `crozzo-print.toml:14`, invocado desde JS, **no existe en Rust**. `crozzo_lan_sync_ack` registrado (`lib.rs:176`) y **falta** en `crozzo-commands.toml:19-28`. Sin permiso: `greet`, `crozzo_append_dev_log`, `adq_enrich_*`, `crozzo_hotspot_*` | Comandos fantasma y funciones rotas; falsa sensación de allowlist |
| 3 | Clasificación de 73 comandos | CONFIRMADO | RCE/instalación 5 (`crozzo_silent_install.rs:76,150`, `crozzo_android_install.rs:143,155,241`) · Red arbitraria 5 (`crozzo_http.rs:24,44,130`, `dian_vpfe.rs:111`, `dian_adquiriente.rs:241`) · Impresión 6 · Red local 34 · Docks remotos 9 · Diagnóstico 13 | Superficie amplia con 5 focos P0/P1 |
| 4 | Docks remotos y labels | CONFIRMADO ✅ | 7 `WebviewUrl::External` (`crozzo_external.rs:172,435,620,805,990,1177,1364`). Labels en `default.json:5` y `desktop.json:10-15`… **`crozzo-supabase-dock` no está en ninguna capability** | Ventanas remotas sin CSP propio; Supabase sin ACL declarada |
| 5 | ¿Una página remota puede invocar comandos? | **REFUTADO ✅** | **Ninguna** capability declara `remote` (0 coincidencias en `capabilities/*.json`); el esquema lo exige (`gen/schemas/desktop-schema.json:56-60`); Tauri evalúa el origen en la ACL (`webview/mod.rs:1823`) y deniega aunque el label coincida. `withGlobalTauri` no concede IPC | **Hoy no hay RCE por IPC remoto.** Sí phishing y sesión persistente |
| 6 | Validación de URL de docks | CONFIRMADO ✅ | Comparación por **subcadena**: `crozzo_external.rs:79-84` (`whatsapp.com`, `wa.me`, `google.com`, `gmail.com`), `:368`, `:577`, `:762`, `:947`… `https://evil.tld/?whatsapp.com` pasa | Origen arbitrario en ventana «de confianza»; a un cambio de `remote` se vuelve P0 |
| 7 | `crozzo_http_*` / `nvidia_chat` | CONFIRMADO (SSRF parcial) | Solo prefijo HTTPS (`:29,49`); redirecciones `limited(10)` (`:11`) permiten bajar a `http://169.254.169.254` o `127.0.0.1`; `get_text` sin límite de cuerpo (`:41`); `head` cae a GET Range (`:61`) | SSRF a servicios locales/metadata + DoS de memoria. `file://` directo bloqueado |
| 8 | `crozzo_silent_install.rs` | CONFIRMADO **P0** | Cualquier HTTPS (`:76-81`), redirects 10. `validate_exe` solo exige **≥400 KB y bytes `MZ`** (`:55-65`): sin firma, hash ni Authenticode. Ejecuta `"{installer}" /S` vía `.cmd` con `cmd /C` y `CREATE_NO_WINDOW` (`:100-126`). DMG equivalente (`:150-237`) | Cualquier sitio HTTPS puede servir un EXE y ejecutarlo. UAC solo si el instalador lo pide |
| 9 | `webview_permissions.rs` | CONFIRMADO ✅ | Perfil pre-concede cámara+mic solo a `tauri.localhost` (`:5-8,20-28`), pero el handler del `main` hace `SetState(ALLOW)` para cámara/micrófono **sin comprobar origen** (`:58-64`); instalado en `lib.rs:77-80` | Cualquier origen cargado en `main` obtiene cámara/mic. Único freno: privacidad de Windows |
| 10 | `crozzo_dev_log` / `crozzo_emulation` | CONFIRMADO | Log escribe cualquier línea en `app_data/crozzo-dev-session.jsonl` sin límite ni redacción (`:8-20`); emulación guarda ticket y HTML en base64 (`:111-120`); `query_sql` solo `select` sobre `test.db` (`:244-255`) | Datos sensibles en disco y llenado de disco. Hoy no invocables (sin capability) |
| 11 | Secretos en `src-tauri` | REFUTADO | Sin claves privadas ni `.p12/.pem/.env`. `pubkey` del updater es pública. `api_key` es parámetro (`crozzo_http.rs:92,130`); P12+password por argumentos (`dian_adquiriente.rs:245-246`); anon key de Supabase se **devuelve por LAN** (`crozzo_lan_sync_server.rs:908`) | P12/password en memoria y args IPC; sin secreto persistido en Rust |
| 12 | CSP de ventanas remotas | CONFIRMADO (no hay) | CSP solo en `tauri.conf.json:22-24` (protocolo local); ventanas `External` usan el CSP del sitio. Sin `assetProtocol` ni `dangerousDisableAssetCspModification`. CSP local débil: `script-src 'unsafe-inline'`, `connect-src http: https: ws: wss:` | Docks remotos sin CSP de la app; CSP local habilita la cadena XSS→IPC |
| 13 | LAN sync sin auth | CONFIRMADO **P1** | Escucha en `0.0.0.0` (`:1198`), token **opcional** (vacío = sin auth, `:852,1230`). `GET /api/comandas` (`:980`), `/api/runtime` (`:1004`), `/api/pairing-cloud` (`:893-918`) legibles; POST acepta escrituras con token vacío (`:1083-1086`) | Lectura e invención de comandas; fuga de URL y anon key en la LAN |
| 14 | Corrección al mando sobre impresión | **REFUTADO** ✅ | `crozzo_print_html*.rs` sí compilan vía `#[path]` (`crozzo_print.rs:3-6`) | Coincide con TI-3; B-08 ya corregido |

### P0/P1 ordenados
1. **P0 — Instalador arbitrario:** `install_setup_from_url` acepta cualquier HTTPS, valida solo `MZ` y ejecuta `/S`.
2. **P0 — Cadena XSS local → RCE:** `withGlobalTauri` + `unsafe-inline` + instalador en la capability `default`.
3. **P1 — SSRF** en `crozzo_http_*` sin allowlist y con redirects que bajan a HTTP.
4. **P1 — Docks remotos** validados por subcadena; `crozzo-supabase-dock` sin ACL.
5. **P1 — LAN sync abierto:** `0.0.0.0`, token vacío por defecto, GET sin auth.

### Acciones propuestas por TI-2
1. Verificar el instalador con el canal minisign del updater; rechazar URLs fuera de `github.com/kenny14ramirez-prog/Principal/releases` y toda redirección.
2. Endurecer CSP: fuera `unsafe-inline`, nonces/hashes, `connect-src` cerrado; instalador en capability aparte con confirmación.
3. Allowlist de hosts + bloqueo de rangos privados en `crozzo_http_*`; revalidar cada salto y limitar cuerpo.
4. Sustituir `contains` por comparación de host exacto en los 7 docks; retirar labels remotas de capabilities.
5. Token obligatorio de 32 bytes, bind a interfaz concreta, auth también en GET, rate limit.

### Comentario de mando sobre TI-2
- **Calidad: A−.** Es el único que dio una **buena noticia verificable**: refutó el RCE remoto con evidencia de esquema y código de Tauri. Eso reduce el pánico y enfoca el trabajo donde sí importa.
- **Reordena mis propios hallazgos:** B-12 queda acotado a contenido local. El riesgo real de los docks es phishing y persistencia de sesión, no ejecución nativa.
- **P0 que yo no había visto:** `webview_permissions.rs:58-64` concede cámara y micrófono **sin comprobar origen** en la ventana `main`. Acotado por AI-A: el handler se instala solo en `main` (`lib.rs:82-83`), **no** en los docks remotos; generalizarlo a «cualquier remoto enciende la cámara» sería error mío.
- **A verificar por Asuntos Internos:** que `crozzo_supabase-dock` realmente no esté en ninguna capability, y que el `SetState(ALLOW)` no tenga una comprobación de origen anterior en el flujo.

---
## FASE 4 — OPERACIÓN PEINE (auditoría profunda)

> Cuatro generales desplegados para peinar estabilidad, rendimiento, conectividad e integridad. Complementa Fase 0–3.

### Generales y resultados

| General | Dominio | Hallazgos | Severidad top |
|---|---|---|---|
| G1 | Estabilidad JS | 22 | 2 CRÍTICO: JSON.parse sin try en sbRest (2 archivos); setInterval sin clear en módulo de acceso |
| G2 | Rendimiento | 17 | 5 cuellos: save cada 280 ms, polling 0,65–3,2 s, KDS O(n²), bundle 2,3 MB, 36 módulos muertos |
| G3 | Conectividad | 8 grietas | mDNS loopback, BLE no-op Android, gossip sin fragmentación, hotspot solo Windows, WS broadcast frágil, sin retry REST, cascada no exclusiva |
| G4 | Integridad/Concurrencia | 18 riesgos | Consecutivo no atómico, factura sin guard UUID, outbox trunca/borra, dedup se evapora, sin single-writer, HLC no implementado |

### Invariantes que no se cumplen (G4)
1. Consecutivo único por factura (no atómico, sin lock).
2. Factura única por UUID/intento (sin guard antes de unshift).
3. Outbox durable hasta acuse (trunca a 200, borra tras 6 h).
4. Idempotencia fuerte (dedup se evapora a 6 h / 2400).
5. Single-writer a la nube (no existe lease/epoch).
6. Escrituras atómicas (localStorage.setItem sin transacción).
7. Secuencia global / HLC (solo doctrina).
8. Schema versioning (0 ocurrencias).

### Presupuesto de rendimiento (G2)
Input→visual ≤100 ms; frame ≤16 ms; heap <150 MB en 8 h; localStorage ≤1 escritura por acción; debounce ≥1500 ms; polling ≥2 s runtime / ≥3 s comandas; bundle <1 MB parseado.

### Cadena de fallback real (G3, router apagado)
tier lan (HTTP+WS) → si no hay caja → offline → tras 800 ms sube a mesh (gossip UDP + BroadcastChannel); en Windows puede desplegar hotspot; al recuperar internet → cancelCloudToLanHold + ensureCloud.

### Patrón dominante de inestabilidad (G1)
Fire-and-forget de promesas + JSON.parse sin defensa en rutas calientes: el bloque más peligroso es JSON.parse(localStorage.getItem('crozzo_supabase_config')).url sin default ni try, repetido en dos módulos. Arreglo en bloque: helper safeJsonParse(raw, fallback).

---

### Poda de peso muerto (F0.5)
Candidatos verificados: `app/` (60 MB, árbol abandonado), `target/` (26 GB, artefactos), 13 stale `.js` en raíz de `src/` (362 KB, incluido el duplicado `CrozzoPosMain.js`), 36 módulos no referenciados (636 KB), vendor OCR (~50 MB), print temp files (1.2 MB), IndexedDB huérfanos, `releases/latest.json` (7.9 KB), `crozzo-emulation.toml` (5 comandos sin capability). Detalle en `docs/maps/ops/PODA-PESO-MUERTO.md`. Decisión del comandante requerida antes de F0.5.



## FASE 1 — INFORME TI-1 · BUILD, EMPAQUETADO Y ACTUALIZACIÓN

> Recibido 2026-10-28. Verifiqué en mando las firmas del updater y la divergencia `src`↔`app` (✅).

| # | Ítem | Veredicto | Evidencia | Consecuencia |
|---|---|---|---|---|
| 1 | Comando y hook previo | CONFIRMADO ✅ | `package.json:8` → `tauri:build: tauri build`; CI regenera con `sync-frontend-to-src.mjs` (`tauri-release.yml:141`); **0** `beforeBuildCommand` en `tauri.conf.json` | El build local empaqueta `src/` **tal cual**. Y `src/index.html` (104.362 B, sha `4084606…`) **≠** `app/index.html` (111.168 B, sha `b0c9bdb…`) |
| 2 | Faltantes de compilación | CONFIRMADO | `rustup show`: host y único target `x86_64-pc-windows-msvc`. `Windows Kits\10\{bin,Include,Lib}` no existen; `VS\2022` vacío; sin `link.exe`/`rc.exe`/`gcc`/`clang`. `makensis.exe` y WebView2 sí | Sin BuildTools+SDK no hay build. Comando exacto abajo |
| 2b | Viabilidad de target GNU | **REFUTADO** | `webview2-com-sys-0.38.2/build.rs` solo copia `WebView2LoaderStatic.lib`/`.dll.lib` (MSVC, sin `.a`); `libsqlite3-sys-0.30.1/build.rs:121+` compila `sqlite3.c` con `cc` | GNU exigiría reemplazar el lib de WebView2 e instalar mingw: **no es ruta viable** |
| 3 | ¿La ACL rompe la compilación? | **REFUTADO** | Las 17 ACL resuelven; `tauri-build/acl.rs:389` falla solo por **permiso** inexistente, no por comando | `crozzo_save_pdf_b64` **no bloquea el build**; rompe el guardado de PDF en runtime |
| 4 | Artefactos locales | CONFIRMADO | `bundle/nsis`: 10 instaladores 1.0.51→1.0.109 (3–13 jun); `.sig` solo 106/109; `dist/local/…1.0.109…exe`; conf declara 1.0.231; remoto 1.0.231 = 22.989.697 B | **122 versiones de retraso.** 1.0.231 solo es reproducible desde GitHub |
| 5 | **Updater: confianza** | **CONFIRMADO ✅ — ROTO** | `pubkey` A0EE9D152E5A3C9E; `.sig` de 1.0.106/1.0.109 firmadas con **A0EE9D152E5A3C9E** (coinciden); la firma de 1.0.231 publicada está firmada con **AD59656123565E0B** (otra clave) | **El OTA rechaza su propia actualización desde ≥1.0.160.** `minisign_verify` falla antes de instalar (`updater.rs:1461`). La flota **no puede actualizarse** |
| 5b | Authenticode | CONFIRMADO | Instaladores `NotSigned`; workflow sin certificado ni `signCommand` | SmartScreen advertirá; no hay cadena de confianza de código |
| 6 | `tauri.local.conf.json` | **REFUTADO** (no es muerto) | Usado en `scripts/run-tauri-build-local.mjs:15-30`, llamado desde `herramientas/compilar-instalador.bat:25`; se pasa `-c` solo si falta la clave | Archivo vivo pero condicional |
| 7 | Targets `nsis`+`dmg` | CONFIRMADO (se ignora) | `Settings::package_types` filtra por plataforma (`tauri-bundler settings.rs:1078-1110`); fallback `_ => warn "ignoring"` | En Windows `dmg` se descarta en silencio: no falla ni genera artefacto |
| 8 | Iconos | CONFIRMADO | Los 5 referenciados existen (`icon.ico` 15.348 B, `icon.icns` 97.571 B…) | Sin bloqueo |
| 9 | Riesgo de actualización | CONFIRMADO | `releases/latest.json` del repo **no** es feed Tauri (sin `platforms`); es aviso JS. La instalación real va por `plugin:updater\|check/download_and_install` (`CrozzoTauriUpdater.js:61,83`) | Sin rollback ni downgrade. Si se «arregla» la firma sin control, puede dejar el POS en una versión no reproducible |

### Verificación propia de la firma (la hice porque el informe lo merecía)

```
tauri.conf.json pubkey ............ A0EE9D152E5A3C9E
.sig 1.0.106 / 1.0.109 ............ A0EE9D152E5A3C9E   ✅ coincide
.sig publicado 1.0.231 ............ AD59656123565E0B   ❌ otra clave
```

- **Conclusión:** toda instalación con la `pubkey` actual **rechaza** la actualización a 1.0.231. El updater silencioso falla y no avisa al usuario.
- **Explica el dato de TI-5:** 1.0.231 tiene **7 descargas** y 1.0.230 tiene **56**: la gente no se actualiza sola; alguien instala a mano.
- **Consecuencia operativa:** la flota está **congelada donde quedó**, y no hay forma de empujar un arreglo. Cualquier corrección exige reinstalación manual equipo por equipo.

### Secuencia de build propuesta por TI-1 (con PASS)
1. BuildTools + SDK — **PASS:** `vswhere -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64` devuelve ruta; `where link.exe` y `where rc.exe`; existe `Windows Kits\10\Lib\10.0.*\um\x64\kernel32.lib`.
2. `rustup target list --installed` → `x86_64-pc-windows-msvc` presente.
3. `npm ci` → exit 0; `npx tauri --version` = 2.11.2.
4. Resolver deriva `src`↔`app` → **PASS:** `sha256` iguales y `git diff` revisado.
5. Fijar versión → `version` igual en `tauri.conf.json` y `package.json`.
6. **Gate de clave:** firmar un archivo de prueba y comprobar keynum → **PASS:** keynum esperado y sin warning de `sign_updaters`.
7. `npm run tauri:build` → **PASS:** existe `…_x64-setup.exe` + `.sig` de 424 B con keynum correcto.
8. `Get-AuthenticodeSignature` + nombre normalizado → estado documentado.
9. Smoke en VM limpia: `/S` → `FileVersion` correcta, app abre, `check` devuelve `null`.
10. Publicar y probar actualización real → **PASS:** `platforms["windows-x86_64-nsis"].signature` con keynum correcto y actualización sin error.

### Comando exacto de toolchain (verificado por TI-1)
```
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --add Microsoft.VisualStudio.Component.Windows11SDK.26100"
```
> El SDK suelto en winget solo ofrece 17134/18362 → inservible para MSVC moderno. Debe venir del workload.

### Bloqueos que declara TI-1
- **Crítico:** sin MSVC/SDK no se compila nada.
- **Crítico:** la clave privada de A0EE **no está identificada**. En disco solo hay una `.pub` distinta (`crozzo-pos.key.pub` = 65A8) y el secreto de CI corresponde a 0B5E.
- **Alto:** no hay artefacto local de 1.0.231 ni snapshot reproducible; `src/` y `app/` divergen.
- **Medio:** sin Authenticode, sin rollback.
- **BLOQUEADO:** no se ejecutó compilación; pueden aparecer errores de API (`windows 0.61`, `webview2-com 0.38`) no visibles en revisión estática.

### Comentario de mando sobre TI-1
- **Calidad: A.** Es el informe con mayor consecuencia estratégica y el único que verificó criptografía en vez de suponerla.
- **Cambia la naturaleza del plan:** no estamos ante «una app con bugs», estamos ante **un producto que no se puede construir ni actualizar**. Eso reordena prioridades: sin canal de distribución no hay despliegue posible, por bueno que sea el código.
- **Decisión que fuerza:** o se recupera la clave A0EE, o se asume reinstalación manual de toda la flota con una clave nueva. No hay tercera opción.

---

### AI-B · VEREDICTO SOBRE TI-4 Y TI-5 (verificación propia, AI-B falló por límite de uso)

> AI-B no pudo ejecutarse (límite de uso). Verifiqué yo mismo cada afirmación con los comandos de abajo. Las citas erróneas se registran como violaciones de doctrina.

| Afirmación (resumen) | Veredicto | Evidencia real | Nota |
|---|---|---|---|
| LevelDB ≈3,5 MB, 6 archivos, último 20/10 | **CONFIRMADO** (matiz) | 11 archivos, **3.709.557 B**, último 20/10/2026 18:16 | TI-4 subestimó: 11 archivos, no 6 |
| `%APPDATA%\BonaOrigenPOS\crozzo_lan_pending.json` 2.164.217 B, 2000/2000, más antigua 2026-06-19 | **CONFIRMADO** | Archivo existe; 2000 entradas; rango 2026-06-19 → 2026-10-20; sin ACK | — |
| `PENDING_MAX=2000` y `drain(0..overflow)` | **CONFIRMADO** | `crozzo_lan_sync_server.rs:24,792-795` | — |
| Sin `tauri-plugin-single-instance` en Cargo.toml ni lock | **CONFIRMADO** | 0 coincidencias en `Cargo.toml` y `Cargo.lock` | — |
| `getNextConsecutivo()` lee de memoria y `save()` reescribe el documento | **CITACIÓN ERRÓNEA** | La llamada está en `core/CrozzoPosMain.js:33061`, no en 498-502. `config.save` se define en `:103`. **No se encontró la definición de `getNextConsecutivo` en `src/`** | La afirmación cualitativa puede ser cierta, pero la cita es falsa y la definición es opaca |
| Outbox con `.slice(-200)` en `try{}catch(_){}` | **CONFIRMADO** | `CrozzoPosDianLib.js:480` | Clave: `CROZZO_FISCAL_OUTBOX_KEY` (`crozzo_fiscal_outbox_v1`) |
| `pos_dian_config` con facturas + `ultimoConsecutivo` | **CONFIRMADO (parcial)** | `ConfigManager.js:34` (`facturas` array), `:436` (`ultimoConsecutivo`). XML no se almacena en el config: se genera en `CrozzoPosDianLib.js:154` | TI-4 exageró al decir «facturas+XML»; el XML se genera, no se persiste en el blob |
| `JSON.parse` falla → `getDefaultConfig()` y el siguiente `save()` pisa el blob | **CONFIRMADO** (otra cita) | `ConfigManager.js:37-63` (`loadFromStorage`), no `CrozzoPosMain.js:107-121`. La línea 103 de `CrozzoPosMain.js` es el guard de `save`, no el fallback de parse | Misma afirmación cualitativa, cita distinta y correcta |
| 112 claves `localStorage`, ninguna de versión | **CONFIRMADO** | 0 ocurrencias de `schema_version`/`crozzo_schema` en `src/` | — |
| Actualizar no borra; desinstalar con checkbox sí borra ambas carpetas | **CONFIRMADO** | `cli.win32-x64-msvc.node:59206,59240,59650-59663`: condición `$DeleteAppDataCheckboxState = 1` **y** `$UpdateMode <> 1`, luego `RmDir /r "$APPDATA\${BUNDLEID}"` y `"$LOCALAPPDATA\${BUNDLEID}"` | TI-4 citó @11383285; el contenido coincide exactamente |
| No hay instalación real en el equipo | **CONFIRMADO** | Sin entrada en Uninstall, sin carpeta en `Programs`/`Program Files`, sin acceso directo; solo `target\release\tauri-app.exe` 1.0.109 y datos huérfanos hasta 20/10 | — |
| `target\release\tauri-app.exe` = 1.0.109 (13/06); debug = 1.0.231 (03/08) | **CONFIRMADO** | `FileVersion` verificado en ambos | — |
| `git describe` = `v1.0.231-31-gf59eabd` | **CONFIRMADO** | Salida exacta reproducida | — |
| 16 módulos JS no existen en el tag | **REFUTADO en el número** | Son **15**, no 16: `CrozzoOpsPresenceBus.js`, `CrozzoSedeAutosanable.js`, `CrozzoContingenciaFiscal.js`, `CrozzoDetectorMadurez.js`, `CrozzoMotorImpuestos.js`, `CrozzoNivelesMadurez.js`, `CrozzoPlanProducto.js`, `CrozzoRentabilidad.js`, `CrozzoRentabilidadPage.js`, `CrozzoRetenciones.js`, `CrozzoReversionInventario.js`, `CrozzoSandboxFiscal.js`, `CrozzoSemaforoMargen.js`, `CrozzoTicketQR.js`, `CrozzoTipoDocumento.js` | La lista del informe era correcta en contenido, sobraba uno |
| 131 JS en 1.0.109 → 233 en 1.0.231, +102, 0 eliminados | **CONFIRMADO** | `git ls-tree`: 131 → 233, +102, 0 eliminados | — |
| `src/index.html` carga solo `core/CrozzoPosMain.js` | **CONFIRMADO** | Línea 1146: `<script src="core/CrozzoPosMain.js?v=1.0.231-mvsj5cnh" defer>`; el de la raíz (1.012.628 B) no se carga | — |
| `releases/latest.json` = 7.945 B, 25 entradas, sin `url`/`signature` | **CONFIRMADO** | 7.945 B, 25 entries, `installMode: auto`, sin `platforms`/`url`/`signature` | — |
| `<meta crozzo-app-version>` = 1.0.231 con HEAD 31 commits adelante | **CONFIRMADO** | Meta dice 1.0.231; `git describe` = v1.0.231-31 | — |
| 49 rutas sin commitear | **CONFIRMADO** | `git status --porcelain` → 49 | — |

#### Violaciones de doctrina detectadas por mi verificación de TI-4/TI-5
1. **Citas desfasadas (TI-4, E):** `:498-502` no existe; la llamada real está en `:33061`.
2. **Citas desfasadas (TI-4, H):** `:107-121` no es el fallback de parse; es `ConfigManager.js:37-63`. La línea 103 de `CrozzoPosMain.js` es el guard de `save`.
3. **Afirmación sin evidencia (TI-4, G):** «XML dentro de pos_dian_config» no se sostiene; el XML se genera en `CrozzoPosDianLib.js:154` y no se persiste en el blob.
4. **Número inflado (TI-5, N):** 16 módulos vs 15 reales.
5. **Afirmación sin evidencia (TI-4, I):** «112 claves» no se contó; solo se verificó que no hay `schema_version`.
6. **Generalización (TI-5, Q):** «el JSON del repo no es el manifiesto del updater» es cierto, pero el informe no distingue entre el aviso JS (`CrozzoSystemUpdates.js`) y el feed Tauri (`CrozzoTauriUpdater.js`).

#### Calidad (escala 1→100)
- **TI-4: 88.** El mapa de datos y la cola LAN son el aporte más útil de toda la operación; pierde por citas desfasadas y por sobredimensionar el contenido del blob fiscal.
- **TI-5: 92.** El mejor informe de la operación: verificó versión real, commits, módulos y duplicado. Pierde solo por el +1 en el conteo de módulos y por no distinguir los dos sistemas de actualización.

#### Riesgo material (lo que puede costar dinero o datos en una sede real, hoy)
1. **La cola LAN lleva cuatro meses sin drenarse** y el ACK está bloqueado por ACL: cualquier comanda antigua puede perderse por FIFO en cualquier momento.
2. **Doble instancia sin bloqueo**: dos cajas abiertas = consecutivo duplicado = doble timbrado.
3. **Corrupción con efecto retardado**: un `pos_dian_config` ilegible se borra al siguiente guardado, sin aviso.
4. **Outbox fiscal truncado a 200** en silencio: más de 200 documentos pendientes desaparecen.
5. **Flota congelada por OTA roto**: ningún arreglo llega a las cajas automáticamente.

---

### AI-C · VEREDICTO SOBRE TI-1 (build y empaquetado)

| Afirmación (resumen) | Veredicto | Evidencia real | Nota |
|---|---|---|---|
| `package.json:8` tauri:build; 0 before*; frontendDist ../src | CONFIRMADO | Línea 8 exacta; build solo `frontendDist` | — |
| `src/index.html` 104.362 B ≠ `app/index.html` 111.168 B | CONFIRMADO | Tamaños y SHA verificados | — |
| rustup host/target único x86_64-pc-windows-msvc | CONFIRMADO | `rustup show` | — |
| Sin Windows Kits/VS2022; sin link/rc/gcc/clang | CONFIRMADO | Kits\10 solo UnionMetadata; VS2022 vacío | — |
| `makensis.exe` existe | **REFUTADO** | `Get-Command makensis` → no encontrado | TI-1 dijo que existía: falso. F1 debe instalar NSIS también |
| WebView2 runtime presente | CONFIRMADO | 156.0.4314.50 | — |
| webview2-com-sys build.rs solo .lib; libsqlite usa `cc` | CONFIRMADO | `.dll/.lib` sin `.a`; `cc::Build::new()` en `:120` | — |
| 17 ACL resuelven; `acl.rs:389` falla por permiso | PARCIAL | `acl.rs:389` «Permission … not found»; `crozzo_save_pdf_b64` inexistente | El «17» no se demostró |
| 10 instaladores 1.0.51→1.0.109; .sig solo 106/109; remoto 1.0.231 = 22.989.697 B | CONFIRMADO | 10 `*-setup.exe`; 2 `.sig`; HEAD remoto 22.989.697 B | — |
| **Firma: pubkey A0EE ≠ clave remota AD59** | **CONFIRMADO (P0)** | Pubkey label A0EE; .sig 106/109 key id 9E3C (label A0EE); remota key id 0B5E (label AD59) | OTA roto |
| `tauri.local.conf.json` usado en script:15-30 y bat:25 | PARCIAL | Script líneas 16 y 26-33; bat:25 llama al script, no al conf | Citas imprecisas |
| Targets nsis+dmg: dmg se descarta en Windows | NO VERIFICABLE | No hay «ignoring» en tauri-bundler disponible | Externo |
| Los 5 iconos existen | CONFIRMADO | 32x32, 128x128, 128x128@2x, icon.icns, icon.ico | — |
| `releases/latest.json` del repo no es feed Tauri | CONFIRMADO | Sin `platforms`; `CrozzoTauriUpdater.js` exige `data.platforms` desde GitHub | — |
| Winget ID Microsoft.VisualStudio.2022.BuildTools y componente Windows11SDK.26100 | PARCIAL | ID existe (v17.14.42); componente no verificable offline | — |
| Secreto CI = 0B5E; única .pub en disco = 65A8 | CONFIRMADO | Clave CI key id 0B5E; repo .pub = 65A8; `~/.tauri` .pub = A0EE | — |

#### Violaciones de doctrina
1. Cita inexacta (I): script líneas 15-30 vs 16/26-33; bat:25 no referencia directa al conf.
2. Afirmación no verificada (F): «17 ACL resuelven» sin conteo demostrado.
3. Claim externo no comprobable (J): «ignoring» en tauri-bundler sin evidencia local.
4. Claim externo no comprobable (M): componente Windows11SDK.26100 no validable offline.
5. Confusión de identificadores (H/N): se mezclan etiquetas (A0EE/AD59) con key ids binarios (9E3C/0B5E). La afirmación H es correcta solo en sentido de etiqueta.

#### Calidad (escala 1→100)
- **TI-1: 86.** Cadena de build y hallazgo H son correctos y verificables; pierde por citas imprecisas, un claim no verificado (J) y un conteo no demostrado (F).

#### Riesgo material (H confirmado)
1. La flota con app ≥1.0.160 no se auto-actualiza: `minisign_verify` falla por pubkey embebida A0EE ≠ clave de firma AD59.
2. Solo instalación manual funciona.
3. OTA queda roto hasta alinear claves.
4. La clave CI (0B5E/AD59) no tiene `.pub` en disco: auditoría y recuperación difíciles.

---

### AI-A · VEREDICTO SOBRE TI-2 Y TI-3

| Afirmación auditada | Veredicto | Corrección |
|---|---|---|
| Ninguna capability declara `remote` → sin IPC remoto | CONFIRMADO | — |
| `allow-crozzo-emulation` sin activar = comandos «muertos» | CONFIRMADO con matiz | **No son código sin uso**: `CrozzoEmulationHarness.js:123,154,160,210,217` los invoca y recibe *deny*. Son **regresiones vivas**, no código muerto |
| `crozzo_save_pdf_b64` fantasma | CONFIRMADO | 3 llamadas reales: `CrozzoCostosReportesPdf.js:204`, `CrozzoRecetarioCocina.js:1056`, `CrozzoBundleCostos.js:14695` |
| `crozzo_lan_sync_ack` sin permiso | CONFIRMADO | Ver cadena causal abajo |
| Validación por `contains` en docks | PARCIAL | Dos citas corridas: los `contains` reales están en `:1134` y `:1321`. Sin `host_str` ni allowlist: `evil.com/?x=whatsapp.com` pasa |
| `crozzo_http_*` solo prefijo https | CONFIRMADO | Omisión de TI-2: hay **timeout global de 120 s** (`:10`); `get_text` sigue sin tope de bytes |
| `validate_exe` solo `MZ` ≥400 KB, ejecuta `/S` | CONFIRMADO | 0 `WinVerifyTrust`/Authenticode en todo `.rs`. La firma minisign del updater **no** cubre esta ruta |
| Cámara con `SetState(ALLOW)` sin origen | CONFIRMADO (alcance) | Solo ventana `main` (`lib.rs:82-83`), **no** los docks. Mi generalización fue exceso |
| `crozzo-supabase-dock` sin capability | CONFIRMADO | Se crea en runtime (`crozzo_external.rs:1309,1364`); nace sin ACL |
| Impresión por spooler, sin `CreateFileW`/`COMn` | CONFIRMADO | `pDatatype` real en `:289`, no `:285` |
| Cero timeout / reintentos en RAW | CONFIRMADO | El `for copy` (`:295`) son copias, no reintentos. Bloqueo del spooler: NO VERIFICABLE aquí |
| `copies>1` imprime una sola vez | CONFIRMADO | `crozzo_print_html.rs:49` (clamp 1-5), `:152` (un `Print`), `:199` (mensaje «N copias») |
| «Todo lo no-JSON → 404» | **PARCIAL** | Falso como universal: `:625,:640` → 400, `:668` → 500, `:822-823` → 204. Correcto en lo esencial: **no sirve HTML** (`text/html` solo en `crm_registro_server.rs`, que no se compila) |
| WS sin push | CONFIRMADO | Matiz: **sí hay** ruta de emisión (`crozzo_lan_sync_server.rs:527-535`, llamada en `:727,:733`). Muere en el lock y en `block_on` |
| Gossip >7800 B sin fragmentación | CONFIRMADO | Sin `MAX_HOPS` en Rust; la fragmentación IP del SO no es fragmentación de aplicación |
| mDNS con `connect("8.8.8.8")` y fallback loopback | CONFIRMADO | Sin enumeración de interfaces ni fallback a IPs locales |
| BLE `send` no-op en no-desktop | CONFIRMADO | — |
| WiFi Direct stub | **PARCIAL** | Solo desktop: Android reporta `supported:true` y `started:true` (`:10-16,35-41`), aunque sigue sin P2P nativo |

#### Cadena causal confirmada (el hallazgo más caro de la operación)

```
permissions/crozzo-commands.toml  omite  crozzo_lan_sync_ack
      ↓
la ACL deniega el comando en el binario
      ↓
CrozzoLanSyncBridge.js:743 lo invoca y :744 hace  catch (_) {}
      ↓
el central NUNCA borra lo ya aplicado de su cola persistida
      ↓
crozzo_lan_pending.json llega a 2000/2000 (PENDING_MAX)
      ↓
drain(0..overflow) descarta FIFO lo más viejo
      ↓
se pierden comandas de junio; sobrevive el ruido de presencia
```

- **Verificado por mí:** `CrozzoLanSyncBridge.js:740` lo dice explícito —«confirmar al central lo aplicado para que lo borre de su cola persistida»—, `:743` invoca, `:744` se traga el error.
- **Consecuencia:** **una línea ausente en un TOML** produjo cuatro meses de pérdida silenciosa de datos de negocio. No es un bug de red, ni de capacidad, ni de diseño de la cola.
- **Corolario:** el 69 % de ruido en la cola (TI-4) es el *síntoma*; la causa es el ACK denegado.

#### Violaciones de doctrina detectadas por AI-A
1. Generalización desde un caso (TI-3, WiFi Direct: solo desktop).
2. Cuantificador universal sin prueba (TI-3, «todo lo no-JSON»).
3. Citas desfasadas una línea (TI-2, `:1133`/`:1320`).
4. Llamar «muertos» a comandos que el frontend invoca (TI-2, B/C/D): oculta regresión viva.
5. Alcance inventado (TI-2, cámara): cierto en la función, falso en los docks.
6. Dato externo presentado como hecho del repo (TI-3: límites del spooler, MTU, alcanzabilidad de 8.8.8.8).
7. PASS sin reproducción: los veredictos de B/C/D son estáticos; no se reprodujo el síntoma en ejecución.

#### Calidad (escala 1→100)
- **TI-2: 84.** Preciso en ACL y permisos; pierde por citas corridas, «muertos» sin revisar llamadas, omitir el timeout de 120 s y ampliar el alcance de cámara.
- **TI-3: 76.** Citas casi exactas en impresión y red, hallazgos reales; falla al generalizar, no ve la ruta de push y desfasa `:285`.

#### Errores del mando que destapa AI-A
1. «Comando muerto» ≠ bajo riesgo: son **tres regresiones activas**.
2. La división IPC/hardware ocultó el bug de push: el emisor vive en el servidor HTTP y muere en el WS.
3. **El inventario estaba contaminado:** `crozzo-print.toml` declara un comando inexistente y `crozzo-commands.toml` omite uno registrado. Inventariar por TOML miente; hay que inventariar por `generate_handler!`.
4. El riesgo de cámara estaba sobredimensionado por mí.
5. Si el plan asume IPC dentro de `crozzo-supabase-dock`, fallará: ese dock no tiene ACL.

---

## TABLA DE CALIDADES (consolidada)

| Investigador | Dominio | Calidad (1→100) | Auditor |
|---|---|---|---|
| TI-1 | Build/empaquetado/actualización | **86** | AI-C |
| TI-2 | IPC/permisos/seguridad | **84** | AI-A |
| TI-3 | Hardware y red | **76** | AI-A |
| TI-4 | Persistencia/instancias/fiscal | **88** | self (AI-B falló) |
| TI-5 | Paridad de campo | **92** | self (AI-B falló) |

**Promedio: 85,2.** El más débil (TI-3) es también el que más cambió el plan: la malla BLE inexistente, el hub que no sirve frontend, el mDNS loopback. El más fuerte (TI-5) es el que mata la premisa «auditamos lo que se usa».

---

## FASE 3 — PLAN REFORMULADO

> Emitido: `docs/maps/ops/PLAN-EJECUCION-TAURI-v2.md`. Se actualiza con los veredictos de AI-B y TI-1.

