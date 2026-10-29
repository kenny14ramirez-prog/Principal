# PLAN QUIRÚRGICO — MISIÓN CIEN (Operación Peine)

| Campo | Valor |
|---|---|
| Operación | MISIÓN CIEN · recuperación quirúrgica del POS sobre Tauri |
| Fecha | 2026-10-29 |
| Base | `f59eabd` = `v1.0.231-31` (31 commits sin tag, 49 rutas sin commitear) |
| Mapa de errores | `docs/maps/ops/MAPA-ERRORES-ESTABILIDAD-RENDIMIENTO-CONECTIVIDAD.md` (~172 hallazgos) |
| Bitácora | `docs/maps/ops/BITACORA-INVESTIGACION-TAURI.md` |
| Estado | **NO CERTIFICADO** |

> **Principio quirúrgico:** no se reescribe. Se corta lo que sangra, se sutura lo que se rompe, se amputa lo que no se puede salvar. Cada corte tiene un PASS medible. Cada general rinde cuentas a Asuntos Internos.

---

## §0 · SITUACIÓN Y MISIÓN

**Situación:** el POS no se puede construir (sin toolchain), no se puede actualizar (OTA roto), pierde comandas (ACK bloqueado), duplica consecutivos (sin lock), corrompe datos (sin atomicidad), se congela en tablets (save cada 280 ms), y su cascada de conectividad tiene 8 grietas. La doctrina (HLC, single-writer, lease) existe solo en papel.

**Misión:** recuperar la operación en campo con cambios mínimos y verificables, sin reescribir la app. **Quirúrgico, no reconstructivo.**

**Restricción:** no se toca código hasta F0 (congelar). No se publica nada al feed. No se declara certificado hasta F-final.

---

## §1 · RECURSOS DESPLEGADOS

### Generales (dominio, solo lectura hasta que se les asigne corte)

| General | Dominio | Responsabilidad | Informe |
|---|---|---|---|
| **G1** | Estabilidad JS | Timers, listeners, promesas, JSON.parse, null derefs | Entregado (22 hallazgos) |
| **G2** | Rendimiento | Hot paths, bundle, memoria, polling | Entregado (17 hallazgos) |
| **G3** | Conectividad | Cascada, fallback, timeouts, retries, WS, gossip, BLE, mDNS | Entregado (8 grietas) |
| **G4** | Integridad/Concurrencia | Consecutivos, facturas, comandas, sync, fiscal, single-writer | Entregado (18 riesgos) |
| **G-T** | Toolchain/Build | MSVC, SDK, NSIS, firma, OTA | TI-1 (86/100) |

### Asuntos Internos (verificación independiente, read-only)

| Equipo | Cubre | Calidad auditada |
|---|---|---|
| **AI-A** | TI-2, TI-3 | 84, 76 |
| **AI-B** | TI-4, TI-5 | (self) 88, 92 |
| **AI-C** | TI-1 | 86 |

### Roles operativos

| Rol | Persona | Función |
|---|---|---|
| Comandante | 1 dev senior | Decide cortes, firma releases, gate de clave |
| Cirujano Rust | 1 dev Rust/Tauri | F1, F3 (single-instance), F5 (WS/mDNS/LAN) |
| Cirujano Frontend | 1 dev frontend | F4 (cobro), F6 (fiscal), F7 (seguridad) |
| Verificador | 1 QA | Ejecuta PASS, captura evidencia |
| Asuntos Internos | 2 auditores | Verifica cada corte contra código |
| Personal de sede | cajero, mesero, admin, cocina | F-final |

---

## §2 · FASES (orden de ejecución)

Dependencias: **F0 → F0.5 → F1 → F2 → {F3, F4} → F5 → F6 → F7 → F8 → F9 → F-final**.

### F0 · Congelar y fijar base (0,5 d, sin hardware)
**Tareas**
1. Revisar las 49 rutas sin commitear: separar basura / trabajo real / artefactos.
2. Resolver el duplicado `src/CrozzoPosMain.js` (borrar o `_legacy/`).
3. Alinear `<meta crozzo-app-version>` con la versión real.
4. Tag de base: `v1.0.232-base`.
5. Marcar `src/index.html` como generado (no editar a mano).
6. **Acción 0 (10 min):** añadir `crozzo_lan_sync_ack` a `permissions/crozzo-commands.toml` → detiene la pérdida de comandas en curso.

**PASS**
- `git status --porcelain` → 0 líneas.
- `git describe --tags --exact-match` → `v1.0.232-base`.
- `Get-ChildItem src -Filter CrozzoPosMain.js` → 0 resultados en la raíz.
- Meta de versión coincide con el tag.
- `crozzo_lan_sync_ack` está en `permissions/crozzo-commands.toml`.

**FAIL** si queda cualquier ruta sin commitear o existen dos `CrozzoPosMain.js`.

---

### F0.5 · Poda de peso muerto (1 d, requiere F0)

**Tareas**
1. Archivar `app/` en branch `archive/browser-legacy` y eliminar del working tree (60 MB).
2. `cargo clean` o borrar `target/release/bundle` + `target/debug` (26 GB).
3. Eliminar los 13 root-level stale `.js` en `src/` (362 KB), incluido `src/CrozzoPosMain.js`.
4. Auditar y podar los 36 módulos no referenciados (636 KB).
5. Decidir OCR: plugin lazy o amputar (50 MB).
6. Limpiar print temp files en startup (1.2 MB).
7. Limpiar IndexedDB huérfanos y `releases/latest.json`.
8. Decidir sobre `crozzo-emulation.toml` (5 comandos sin capability).

**PASS**
- `npm run tauri build` exit 0 tras cada poda.
- `git status` limpio.
- Tamaño del árbol reducido según `PODA-PESO-MUERTO.md`.
- No hay referencias rotas.

**FAIL** si cualquier poda rompe el build → revertir ese commit y documentar.

**Decisión requerida del comandante** (antes de F0.5):
1. ¿OCR es feature core? (plugin lazy vs amputar)
2. ¿Se archiva `app/` o se mantiene?
3. ¿Se elimina `CrozzoEmulationHarness.js` si se elimina `crozzo-emulation.toml`?

---

### F1 · Toolchain de compilación (2-4 h, requiere admin + 7 GB)
**Tareas**
1. `winget install Microsoft.VisualStudio.2022.BuildTools` con workload Desktop development with C++ (MSVC v143 + Windows 11 SDK).
2. `winget install NSIS.NSIS` (falta en la máquina; sin él no se genera el instalador).
3. Reabrir consola y verificar `rc.exe`/`link.exe`/`makensis.exe`.
4. `rustup show` → confirmar target `x86_64-pc-windows-msvc`.
5. `cargo check` en `src-tauri`.

**PASS**
- `Get-Command rc.exe`, `link.exe`, `makensis.exe` devuelven ruta.
- `cargo check` → exit 0 sin error de `tauri-winres`.

**FAIL** si `cargo check` falla por cualquier otra causa: se documenta el error exacto.

**Decisión:** no intentar target GNU. Las dependencias asumen MSVC.

---

### F2 · Primer build reproducible + gate de clave (1 d)
**Tareas**
1. Resolver deriva `src/`↔`app/` (`npm run sync`) y revisar `git diff`.
2. Fijar versión (`node scripts/set-tauri-version.mjs X.Y.Z`) con X.Y.Z > 1.0.231.
3. **Gate de clave:** firmar un archivo de prueba con la clave privada y comprobar que el keynum coincide con el de la pubkey embebida (A0EE…). **Si no coincide, parar: no hay build útil.**
4. `npm run tauri build`.
5. Registrar SHA-256 del instalador y del `.exe`.
6. Instalar en máquina limpia (VM o PC de prueba).
7. Comprobar que la versión visible coincide con el tag.

**PASS**
- Existe instalador NSIS con la versión del tag + `.sig` de 424 B.
- El keynum del `.sig` coincide con la pubkey embebida (sin warning de `sign_updaters`).
- Hash registrado en `docs/maps/ops/evidencia/`.
- En máquina limpia: la app abre, el login muestra la versión del tag.
- `plugin:updater|check` devuelve `null` (sin error de firma).

**FAIL** si el instalador no arranca, si la versión visible no coincide, o si el build exige tocar archivos a mano.

**Decisión de firma (bloqueante):** o se recupera la clave A0EE (buscar en backups/correos/pendrives del dev original), o se rota a una clave nueva y se reinstala la flota a mano. Sin esto, F2 no tiene sentido.

---

### F3 · Integridad de datos (1 d)
**Tareas**
1. Añadir `tauri-plugin-single-instance`.
2. Respaldo nativo diario de `pos_dian_config` + outbox a `%APPDATA%\com.crozzo.pos\backups\AAAA-MM-DD.json`, rotación 30 días.
3. Prohibido el fallback silencioso: si `JSON.parse` falla, renombrar a `.corrupt.<ts>` y avisar.
4. `crozzo_schema_version` con bloqueo de escritura si la versión es mayor.
5. Quitar el `slice(-200)` ciego: si el outbox llega al tope, detener y avisar.
6. Envolver todos los `JSON.parse(localStorage...)` en un helper `safeJsonParse(raw, fallback)` y usarlo en `sbRest` (ambos archivos) y en `decompressRecord`.

**PASS**
- Abrir el POS dos veces → la segunda enfoca la primera; una sola instancia.
- Tras 24 h, existe al menos un archivo en `backups\`.
- Corromper `pos_dian_config` → la app avisa, guarda copia `.corrupt.*`, no borra facturas.
- Insertar 201 documentos en el outbox → la app avisa; no pierde ninguno.
- `JSON.parse(null)` en `sbRest` → no crashea (devuelve fallback).

**FAIL** si dos instancias corren a la vez, si el respaldo no aparece, o si un archivo corrupto termina en datos vacíos.

---

### F4 · Cobro y factura (2–3 d) — P0 de negocio
**Problema medido:** el wizard de cobro abre vacío (0 chars, 0 inputs, 4 botones) y no genera factura; Reportes no navega para admin.

**Tareas**
1. Reproducir el cobro en el binario Tauri y capturar la traza del wizard vacío.
2. Reparar la ruta de render del wizard.
3. Garantizar el orden fiscal: **persistir → firmar → limpiar carrito**. Nunca al revés.
4. Reparar la navegación de administración a Reportes.
5. `crozzo_save_pdf_b64`: implementarlo o retirar las 3 llamadas. No dejar el fantasma.
6. Guard por UUID antes de `unshift` de factura (evitar duplicado en reintento).

**PASS**
- 20 ventas consecutivas: cada una genera factura con CUFE, persiste, limpia carrito, consecutivo +1.
- Cerrar la app entre venta y venta no duplica ni pierde ninguna.
- El rol admin abre Reportes en ≤2 clics.
- Exportar PDF de costos: funciona o el botón no existe (sin excepción en consola).

**FAIL** si hay un solo CUFE duplicado, una factura sin persistir o un carrito que no se limpia.

---

### F5 · Red local real (2–3 d) — requiere hardware
**Tareas**
1. Decidir: ¿el hub sirve el frontend o cada equipo se instala? Documentar la decisión.
2. Token obligatorio también en GET; CORS restringido; cerrar `POST /api/consultar-rut`.
3. Arreglar WS con canal por cliente y `select!` (≈20 líneas) → push real.
4. mDNS con todas las IPv4 y **nunca** loopback; refrescar `at_ms`.
5. Cola LAN: descartar ruido de presencia antes que comandas; append-only en disco.
6. Gossip: añadir dedup en Rust por `msgId`, reply unicast, fragmentación >1200 B, avisar en vez de `log()`.
7. Abrir hotspot en ACL **solo si** se decide que es canal soportado; si no, retirarlo del discurso.
8. Arreglar el ACK: añadir `crozzo_lan_sync_ack` a `permissions/crozzo-commands.toml` (ya en F0, verificar que funciona).

**PASS**
- Comanda creada en tablet aparece en caja en **<2 s** por push.
- Sin token → **401** en todos los endpoints.
- Con router apagado y sin Internet, caja y tablets se descubren por mDNS con IP válida (nunca 127.0.0.1).
- 20 comandas seguidas: 0 pérdidas, 0 duplicados.
- Gossip: comanda de 5 KB se fragmenta y llega completa.

**FAIL** si se descubre por loopback, si un endpoint queda abierto, o si se pierde una comanda.

---

### F6 · Fiscal y contingencia (3–5 d)
**Tareas**
1. Embarcar `CrozzoContingenciaFiscal` (hoy no está en `src/index.html`).
2. Outbox fiscal append-only en Rust, fuera de `localStorage`.
3. Firmar y emitir local; transmitir después; reintento con backoff y acuse persistente.
4. Resolver el outbox de comandas: TTL configurable, no borrar sin ACK, merge en vez de sobrescribir.
5. Retención declarada: caja 90 días + fiscal; tablet 7; impresora 48 h; nube histórico.

**PASS**
- Simular DIAN caída → la venta se emite, se firma y queda en cola con evidencia.
- Al volver DIAN → se transmite y se marca acuse; el documento no se duplica.
- Reiniciar la app con 50 documentos en cola → los 50 siguen ahí.
- Dos tablets editan el mismo estado → no se pierde ningún campo (merge).

**FAIL** si una venta queda sin representación fiscal o si el reintento duplica un CUFE.

---

### F7 · Seguridad (1–2 d)
**Tareas**
1. `install_setup_from_url`: verificar firma/hash del manifiesto, allowlist de host, `redirect none`.
2. CSP sin `'unsafe-inline'`; `connect-src` cerrado; instalador en capability aparte.
3. `crozzo_http_*`: allowlist de hosts, bloquear rangos privados/loopback/link-local, límite de cuerpo, revalidar cada redirección.
4. Docks: comparar host exacto, no subcadena. Añadir `crozzo-supabase-dock` a una capability o retirarlo.
5. Cámara/mic: comprobar origen antes de `SetState(ALLOW)`.
6. Limpiar ACL: borrar `crozzo_save_pdf_b64` fantasma, decidir explícitamente sobre hotspot/emulación/dev-log.
7. `safeJsonParse` en todos los `JSON.parse(localStorage...)` (G1).

**PASS**
- URL de instalador no firmada → rechazada con mensaje.
- `http://169.254.169.254` y `http://127.0.0.1` → rechazadas.
- Script inline inyectado → no ejecuta (CSP) y no alcanza IPC.
- Origen remoto en `main` → cámara denegada.
- `JSON.parse(null)` en `sbRest` → no crashea.

**FAIL** si cualquiera de los cinco pasa.

---

### F8 · Rendimiento (2–3 d)
**Tareas**
1. Debounce de save a ≥1500 ms; pausar con `document.hidden`.
2. Eliminar deep-clone `JSON.parse(JSON.stringify(...))` en `collectPosRuntimeState`.
3. Timers KDS: reducir a 2–3 s o usar `requestAnimationFrame`/IntersectionObserver.
4. Reemplazar `.find` O(n) por `Map` indexado por id.
5. Pausar polling LAN/cloud con `document.hidden`; intervalos ≥2 s runtime, ≥3 s comandas.
6. Poda de bundle: eliminar los 36 módulos no referenciados (~636 KB).
7. Code-splitting: cargar módulos pesados (costos, reservorio) bajo demanda.

**PASS**
- Save runtime no bloquea >50 ms (medido en DevTools).
- Memoria heap <150 MB tras 2 h de uso continuo.
- KDS con 50 comandas activas: CPU <30 % promedio.
- Bundle inicial <1 MB parseado.

**FAIL** si el hilo principal se bloquea >50 ms en cualquier operación de usuario.

---

### F9 · Estabilidad (1–2 d)
**Tareas**
1. Envolver todos los `JSON.parse(localStorage/sessionStorage...)` en `safeJsonParse`.
2. Añadir `.catch()` a todas las promesas sin manejo (WebRTC, syncOfflineQueue).
3. Limpiar timers en desmontaje: `clearInterval` en cada módulo que registra timers.
4. Añadir `removeEventListener` donde falte.
5. Proteger globals mutados con guards (`__crozzoPendingComanda`).
6. Envolver `sbRest` config parse en try/catch.

**PASS**
- 0 `unhandledrejection` en consola durante 30 min de uso.
- Corromper `crozzo_supabase_config` → no crashea, usa fallback.
- Abrir/cerrar módulo de acceso 10 veces → no se acumulan timers (verificar en DevTools).

**FAIL** si aparece un `unhandledrejection` o un timer duplicado.

---

### F-final · Verificación en sede (1 d en sitio)
**Tareas**
1. Capturar los 5 datos de versión (login, `FileVersion`, Configuración→Aplicaciones, tamaño del perfil, manifiesto servido).
2. Correr el arnés de personas sobre el **binario**, no sobre Chromium.
3. Probar impresora térmica real, apertura de cajón, corte.
4. Probar 2 tablets + caja con el router de la sede, y luego sin Internet.
5. Auditar a 4 personas (cajero, mesero, admin, cocina) con escala 1→100.

**PASS**
- 5/5 datos de versión capturados y coincidentes.
- Personas: **PASS ≥ 12/16** (hoy 10/16).
- Ticket impreso legible, con corte y cajón.
- 20 comandas sin pérdida en LAN, con y sin Internet.
- 20 ventas sin CUFE duplicado.

---

## §3 · DECISIONES QUIRÚRGICAS (qué se corta, qué se sutura, qué se amputa)

### Se corta (fix mínimo, alto impacto)
| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 1 | Añadir `crozzo_lan_sync_ack` a ACL | `crozzo-commands.toml` | 10 min |
| 2 | `safeJsonParse` en `sbRest` (2 archivos) | `BundleCostos.js:8861`, `SistCostos.js:3632` | 30 min |
| 3 | Guard por UUID antes de `unshift` de factura | `CrozzoPosMain.js:33118` | 1 h |
| 4 | `tauri-plugin-single-instance` | `Cargo.toml` + `lib.rs` | 2 h |
5 | Debounce de save a ≥1500 ms | `CrozzoPosMain.js:8733` | 15 min |
6 | Eliminar deep-clone en `collectPosRuntimeState` | `CrozzoPosMain.js:8651-8677` | 1 h |
7 | Envolver `JSON.parse(localStorage...)` en helper | todos | 2 h |
8 | Añadir `.catch()` a promesas sin manejo | WebRTC, syncOfflineQueue | 1 h |

### Se sutura (mejora estructural, impacto medio)
| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 9 | Arreglar WS con canal por cliente + `select!` | `crozzo_lan_ws.rs` | 1 d |
| 10 | mDNS con todas las IPv4, nunca loopback | `crozzo_mdns.rs:50-61` | 4 h |
| 11 | Gossip: dedup + fragmentación + unicast | `crozzo_gossip_udp.rs` | 2 d |
| 12 | Cola LAN append-only + descartar ruido antes que comandas | `crozzo_lan_sync_server.rs` | 1 d |
13 | CSP sin `unsafe-inline`, `connect-src` cerrado | `tauri.conf.json` | 4 h |
14 | `install_setup_from_url` con firma/hash/allowlist | `crozzo_silent_install.rs` | 1 d |
15 | Docks: comparar host exacto, no subcadena | `crozzo_external.rs` | 4 h |
16 | Cámara/mic: comprobar origen antes de ALLOW | `webview_permissions.rs:58-64` | 2 h |
17 | Limpiar ACL: borrar fantasma, añadir ack, decidir sobre hotspot/emulación | `permissions/*.toml` | 2 h |
18 | Outbox fiscal append-only en Rust | nuevo módulo | 2 d |
19 | Respaldo nativo diario + no-fallback + schema_version | `ConfigManager.js` + Rust | 1 d |
20 | Poda de bundle (36 módulos no referenciados) | `src/` | 1 d |

### Se amputa (no se puede salvar con esfuerzo razonable)
| # | Qué | Por qué | Alternativa |
|---|---|---|---|
| 1 | **BLE real en Android** | No hay GATT nativo; `send` es no-op | Usar gossip UDP (desktop) o documentar que BLE no existe |
| 2 | **WiFi Direct** | Stub puro, sin P2P nativo | Retirar del discurso de la cascada |
| 3 | **Hotspot como canal para 100 dispositivos** | ~8 clientes, depende de perfil con Internet, bloqueado por ACL | Exigir AP/router dedicado; documentar tope |
| 4 | **Target GNU** | `webview2-com` y `rusqlite` asumen MSVC | Solo MSVC |
| 5 | **CRDT genérico** | No implementado, no necesario | Hub autoritativo + log idempotente + HLC (implementar) |
| 6 | **MLS (cifrado grupal)** | Descartado en doctrina | AES-256-GCM/Noise IK por dispositivo |

---

## §4 · LO PROHIBIDO

1. **Publicar release o tocar el feed.** El updater es silencioso.
2. **Ejecutar `npm run sync`.** Sobrescribe `src/index.html`.
3. **Editar `src/index.html` a mano.**
4. **Instalar 1.0.231 en una sede.** El artefacto no es reproducible.
5. **Borrar `app/`.** Es la única referencia de lo que existió.
6. **Aplicar parches por búsqueda de texto sobre `CrozzoPosMain.js`.** Hay dos archivos con ese nombre.
7. **Declarar cualquier cosa «certificada».** Hoy el acta dice NO CERTIFICADO.
8. **Tocar código antes de F0.**
9. **Inventar datos en los informes.** Todo PASS requiere comando reproducible.

---

## §5 · AUDITORÍA DE PERSONAS (escala 1→100)

Se mantiene el arnés `scripts/qa-personas-mision-cien.mjs` con `QA_TREE=src`, pero **solo vale si corre contra el binario**.

| Rol | Qué se audita | Escala | Estado actual |
|---|---|---|---|
| Cajero | Cobro completo, arqueo, cierre de turno | 1→100 | Fallando: wizard vacío, 0 facturas |
| Mesero | Tomar comanda, enviar a cocina, cobrar mesa | 1→100 | Parcial: comandas no llegan en tiempo real |
| Administración | Reportes, dashboard, permisos | 1→100 | Fallando: no navega |
| Cocina | Recibir comanda, marcar listo | 1→100 | Parcial: depende de polling |

**Criterio de certificación:** ≥ 12/16 PASS y ningún FAIL en cobro o fiscal.

---

## §6 · CRITERIO DE CIERRE

La operación se declara **CERTIFICADA** solo si:
1. F0–F9 tienen PASS registrado con evidencia pegada.
2. F-final se ejecutó en sede con hardware real.
3. Existe instalador reproducible con hash y versión coincidente.
4. 20 ventas consecutivas sin CUFE duplicado.
5. 20 comandas sin pérdida en LAN, con y sin Internet.
6. Un archivo corrupto no destruye datos.
7. Personas ≥ 12/16.
8. 0 `unhandledrejection` en 30 min de uso.
9. Memoria heap <150 MB tras 2 h.
10. OTA funcional (keynum coincide).

Cualquier punto en FAIL → **NO CERTIFICADO**, y se documenta qué falta.

---

## §7 · RESUMEN DE RECURSOS

| Fase | Duración | Requiere | Dueño |
|---|---|---|---|
| F0 | 0,5 d | nada | 1 dev senior |
| F0.5 | 1 d | F0 | 1 dev + 1 verificador |
| F1 | 2–4 h | admin + 7 GB | 1 dev |
| F2 | 1 d | F1 + clave A0EE | 1 dev + 1 verificador |
| F3 | 1 d | F2 | 1 dev Rust + 1 dev frontend |
| F4 | 2–3 d | F2·F3 | 1 dev frontend + 1 tester |
| F5 | 2–3 d | hardware | 1 dev Rust + 1 dev frontend |
| F6 | 3–5 d | F3·F4 | 1 dev + asesoría |
| F7 | 1–2 d | F2 | 1 dev Rust + 1 revisor |
| F8 | 2–3 d | F2 | 1 dev frontend |
| F9 | 1–2 d | F2 | 1 dev frontend |
| F-final | 1 d | hardware + personas | 1 verificador + sede |

**Total estimado:** 16–24 días-hombre, más 1 día en sitio.

---

> **Última palabra:** este plan no es una reescritura. Es un conjunto de incisiones precisas sobre un paciente que sangra por 172 heridas. Cada incisión tiene un PASS. Si el PASS falla, se documenta y se detiene. No se improvisa.
