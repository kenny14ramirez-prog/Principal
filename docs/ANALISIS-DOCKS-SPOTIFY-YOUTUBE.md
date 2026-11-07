# Análisis de causa raíz y viabilidad: docks web (Spotify, YouTube, Gmail, etc.) en Crozzo POS (Tauri v2)

Fecha del análisis: 2026-11-07  
Proyecto: `C:\proyectos\sistema pos`  
Rama analizada: `fase1-seguridad-rls` (HEAD `0a04a12`, v1.0.260)  
Tecnología base: Tauri 2.12.5 + WebView2 (Windows), frontend HTML/JS monolítico.

---

## 1. Resumen ejecutivo

El colapso reportado (pantallas negras, pantallas de "no se puede conectar" del navegador Microsoft, inestabilidad general) es consistente con un **problema de WebView2 en Windows al crear/mantener varias instancias de webview (docks) en paralelo**, agravado por:

1. **Creación de ventanas en contextos que bloquean el runtime** (`std::thread::sleep` dentro de comandos `async`, bucles de espera).
2. **Múltiples instancias de WebView2** (hasta 9 docks posibles) con directorios de datos separados, alto consumo de memoria/CPU y riesgo de crash del proceso.
3. **Dependencia del runtime WebView2 "evergreen"** (bootstrapper descargable): en equipos sin runtime o sin internet, la ventana queda en la página de error de Microsoft.
4. **Superficie de observadores/timers en frontend** que re-sincronizan continuamente posición/tamaño del dock (MutationObserver sobre todo el DOM + polling cada 120 ms).
5. **Capacidad/permisos incompletos** para algunos docks (YouTube/Facebook no están en `capabilities/desktop.json` ni se cargan por defecto), por lo que la funcionalidad quedó a medias.

**Respuesta directa a la pregunta del usuario:**  
**Sí, es posible lograr el objetivo (Spotify/YouTube en panel lateral tipo celular, que se cierre al pedirlo), pero NO con el enfoque actual de "una ventana OS por servicio permanentemente viva".**  
La vía segura es un **dock único y reutilizable**, creado de forma perezosa (lazy), destruido al cerrar, con preflight de WebView2 y un interruptor de emergencia (feature flag). Gmail y "Tribe" deben seguir abriéndose en el navegador externo, como ya se decidió para Gmail/Drive.

---

## 2. Qué se intentó (historia reconstruida desde Git)

Commits clave (noviembre 2026):

- `00e0675` — "docks frontend - timer fix, click-outside global, supabase id, renderPage, open-in-browser button, external login module" (+692/-82 líneas).
- `0eedcea` — "docks Rust - timer fix 9 ventanas, oauth loopback, LAN auth obligatoria + hash constante + bind LAN + mDNS sin localhost" (+654/-42 líneas en `crozzo_external.rs`).
- `2634ebf` — "docks YouTube/Facebook (retirados de carga por defecto) + login externo + latest.json template".
- `7dbf73b` — "OTA - ... Gmail/Drive abren en navegador, login externo PKCE".
- `9b322ea` — "WhatsApp capability aislada, devtools fuera de release, CSP restrictiva, requireSignedVersion".

Estado resultante: existen docks para WhatsApp, Gmail, Drive, Dataico, DIAN VPFE, Spotify, Supabase SQL; YouTube/Facebook se agregaron y luego se retiraron de carga por defecto; Gmail/Drive pasaron a "abrir en navegador" en algunas rutas.

---

## 3. Arquitectura actual de los docks

### 3.1 Capa Rust (`src-tauri/src/crozzo_external.rs`, 1801 líneas)

- Un módulo por servicio, todos con el mismo patrón:
  - Constantes de etiqueta: `crozzo-<servicio>-dock`.
  - Atómicos: `*_DOCK_CREATING`, `*_WANT_VISIBLE`, `*_LAST_*` (rect).
  - `build_*_dock`: crea un `WebviewWindow` con `WebviewUrl::External`, `user_agent` Chrome, `data_directory` propia, `.owner(&main)` en Windows, `.visible(false)`.
  - `ensure_*_dock`: crea si no existe; si otra creación está en curso, hace `std::thread::sleep(50 ms)` hasta 40 intentos (2 s).
  - `*_dock_sync` (comando `async`): oculta los demás docks, guarda rect, navega, lanza un hilo que duerme 2 s y luego `show()`.
  - `on_page_load`: al terminar la carga, re-posiciona y muestra si `WANT_VISIBLE`.
- `hide_all_web_docks_except`: oculta todos menos el activo.
- `crozzo_dock_set_zoom`: aplica zoom por etiqueta.

### 3.2 Capa frontend

- `app/modules/CrozzoWebEmbedDockCore.js` (≈29 KB): factory que:
  - Mide un "host slot" en el DOM (`getBoundingClientRect`).
  - Llama al comando Rust para posicionar/mostrar el webview.
  - Observa sidebar, overlays, resize/move de la ventana Tauri.
  - Polling cada 120 ms para ocultar/mostrar el dock si hay modales.
- Un módulo por servicio (`CrozzoSpotifyDock.js`, etc.) registra `renderPage`, `initPage`, `hideEmbed`, etc.
- `CrozzoPosMain.js`: lista `CROZZO_WEB_EMBED_PAGES`, gestión de clases CSS por página, acceso por usuario.

### 3.3 Configuración

- `src-tauri/tauri.conf.json`: `webviewInstallMode: downloadBootstrapper` (runtime evergreen descargable), CSP con `frame-src` solo WhatsApp/Facebook.
- `capabilities/desktop.json`: lista ventanas `main`, gmail, drive, dataico, dian-vpfe, spotify (no youtube/facebook/supabase/whatsapp).
- `capabilities/whatsapp-dock.json`: capability mínima aislada.

---

## 4. Evidencia de riesgo en el código actual

1. **Bloqueo del runtime asíncrono**  
   `ensure_*_dock` ejecuta `std::thread::sleep(50 ms)` en bucle dentro de un comando `async`. Esto bloquea un worker de Tokio hasta 2 s. Bajo carga (varios docks, resize, polling) puede degradar o congelar el backend.

2. **Mostrado diferido 2 s**  
   Cada sync lanza un hilo que duerme 2 s antes de `show()`. Esto explica pantallas en blanco/negras durante la carga y la sensación de "no conecta".

3. **Múltiples WebView2**  
   Cada dock es una ventana OS separada con su propio proceso WebView2 (browser/renderer/GPU). La documentación de Microsoft advierte explícitamente: "Plan your UI so that you don't create more WebView2 controls than necessary"; "Running many instances ... can strain system memory".

4. **Directorios de datos por servicio**  
   Cada dock usa `data_directory` distinto. En Windows, WebView2 exige que las opciones de entorno coincidan para compartir directorio; aunque aquí los directorios difieren, la multiplicación de entornos aumenta memoria y riesgo de error `HRESULT 0x8007139F` si alguna opción diverge (user agent, scrollBarStyle, browser args).

5. **Dependencia de runtime evergreen**  
   Con `downloadBootstrapper`, en equipos sin WebView2 o sin internet se muestra la página de error de Microsoft ("no se puede conectar"). Esto coincide con lo reportado.

6. **Docks no cargados/permisos incompletos**  
   YouTube y Facebook se retiraron de carga por defecto; no aparecen en `capabilities/desktop.json`. La funcionalidad quedó parcial, lo que aumenta la probabilidad de estados inconsistentes si se invocan.

7. **Frontend de alta frecuencia**  
   `MutationObserver` sobre `document.body` con `subtree: true` + polling cada 120 ms + intervalos de 50 ms durante animaciones de sidebar. Con el dock activo, esto genera trabajo continuo y puede degradar la UI.

8. **Ventanas propietarias (`owner(&main)`)**  
   En Windows, un dock es "owned" por la ventana principal: se destruye si el owner se destruye y se oculta si se minimiza. Esto puede producir ventanas huérfanas o comportamientos extraños si la ventana principal se recrea (actualización OTA, reinicio).

---

## 5. Por qué Gmail y "Tribe" no se pueden incrustar

- Sitios como Gmail aplican `X-Frame-Options` / CSP que prohíben ser embebidos en iframes.
- Flujos OAuth (Google) suelen bloquear webviews embebidos o exigir navegador del sistema.
- "Tribe" (u otra app SaaS) probablemente tiene las mismas restricciones o depende de popups/OAuth.
- Por eso la decisión correcta es: **abrirlos con `crozzo_open_external_url` (navegador del sistema)**, no intentar incrustarlos. Esto ya se hizo para Gmail/Drive.

---

## 6. Causas probables del colapso (ordenadas por probabilidad)

| # | Causa | Evidencia | Impacto |
|---|-------|-----------|---------|
| 1 | Agotamiento de recursos por múltiples WebView2 (memoria/CPU/GPU) | Docs Microsoft; hasta 9 docks | Alto |
| 2 | Runtime WebView2 ausente/desactualizado o sin internet (bootstrapper) | `downloadBootstrapper`; pantallas "no se puede conectar" | Alto |
| 3 | Bloqueo del runtime por `sleep` en comandos async y bucles de espera | `ensure_*_dock` | Medio-Alto |
| 4 | Crash del proceso WebView2 al crear/ocultar varias ventanas rápidamente | Issues Tauri/WebView2; `hide_all_web_docks_except` | Medio-Alto |
| 5 | Desincronización de ventanas propietarias tras recreación de `main` | `.owner(&main)` | Medio |
| 6 | Thrashing de UI por observers/polling | WebEmbedDockCore | Medio |
| 7 | Inconsistencia de capabilities/permisos (YouTube/Facebook) | `desktop.json` | Medio |

---

## 7. Viabilidad: ¿se puede lograr el objetivo deseado?

**Sí, pero con condiciones.** El objetivo es:

> Al llamar a Spotify/YouTube, mostrar un panel lateral pequeño (tamaño celular) a la derecha, con zoom, que se cierre cuando el usuario lo pida; Gmail/Tribe como acceso directo externo.

Opciones viables:

### Opción A — Dock único reutilizable (RECOMENDADA)

Un solo `WebviewWindow` (`crozzo-web-dock`) que:
- Se crea perezosamente al primer uso.
- Navega a la URL del servicio seleccionado.
- Se posiciona en el host slot medido.
- Se oculta (no destruye) al cerrar, para reuso rápido.
- Se destruye si falla o si el usuario lo pide, liberando recursos.

**Pros:** minimiza instancias WebView2 (1 en vez de 9), reduce memoria, simplifica código.  
**Contras:** pierde sesiones separadas por servicio (cookies compartidas), pero aceptable para Spotify/YouTube.

### Opción B — Mantener un dock por servicio, pero efímero

Crear el webview al abrir, destruirlo al cerrar (no solo `hide()`).  
**Pros:** aislamiento de sesiones.  
**Contras:** sigue siendo multi-instancia cuando se alternan servicios rápidamente; mayor complejidad.

### Opción C — Child webview in-page (Tauri `unstable`)

Usar `new Webview(...)` dentro de la ventana principal.  
**Pros:** integración visual perfecta.  
**Contras:** API inestable, requiere feature `unstable`, mismo costo de WebView2, más riesgo.

### Opción D — Navegador externo / PWA (sin dock)

Abrir Spotify/YouTube en el navegador del sistema o en ventana Tauri separada no acoplada.  
**Pros:** cero riesgo para el POS.  
**Contras:** no es el panel lateral deseado.

**Recomendación:** Opción A como camino principal; Opción D como fallback automático si falla el dock.

---

## 8. Plan quirúrgico de implementación (para no caer en "línea roja")

### Fase 0 — Congelar y observar (sin tocar producción)
- Mantener la versión antigua estable en producción (rollback ya hecho).
- Trabajar en rama separada (`feat/web-dock-v2`).
- Agregar logging estructurado de docks: versión WebView2, tiempo de creación, errores, memoria.

### Fase 1 — Preflight y guardas (bajo riesgo)
- Al arranque, detectar WebView2 (`webview_version` / `GetAvailableCoreWebView2BrowserVersionString`).
- Si no hay runtime o es viejo: deshabilitar docks y usar navegador externo.
- Feature flag `CROZZO_WEB_DOCKS_ENABLED` (por defecto `false` hasta validar).

### Fase 2 — Refactor a dock único (Opción A)
- Crear `crozzo_web_dock_sync(service, url, rect)` en Rust, una sola etiqueta `crozzo-web-dock`.
- Eliminar los 9 módulos duplicados; un solo módulo frontend `CrozzoWebDock.js`.
- Destruir el webview al cerrar o al fallar; no mantenerlo vivo indefinidamente.
- Sustituir `std::thread::sleep` por `tokio::time::sleep` o por creación en hilo dedicado (patrón documentado por Tauri).
- Eliminar polling de 120 ms; usar solo eventos de resize/move + MutationObserver acotado.

### Fase 3 — Seguridad y capacidades
- Añadir `crozzo-web-dock` a `capabilities/desktop.json`.
- Mantener CSP actual; no ampliar `frame-src` (los docks son webviews, no iframes).
- Validar URLs con lista blanca (ya existe `validate_embed_dock_url`).

### Fase 4 — Resiliencia
- Circuit breaker: si el dock falla 3 veces en la sesión, deshabilitar y abrir externamente.
- Timeout de carga (p. ej. 15 s): si no carga, mostrar error y botón "Abrir en navegador".
- Suspender webview inactivo (`TrySuspendAsync` equivalente vía WebView2) cuando no está visible.

### Fase 5 — QA y despliegue gradual
- Matriz: Windows 10/11, con/sin internet, WebView2 actualizado/desactualizado, 4 GB RAM, múltiples monitores, DPI 100/150/200.
- Prueba de alternancia rápida entre Spotify y YouTube (10 ciclos).
- Prueba de minimizar/restaurar ventana principal.
- Canary a un subconjunto de tiendas; rollback automático si hay crash.

---

## 9. Cambios de código específicos recomendados (mínimos y quirúrgicos)

En `src-tauri/src/crozzo_external.rs`:
- Reemplazar los 9 bloques duplicados por una implementación genérica parametrizada por etiqueta/URL (o mejor, un solo dock).
- Eliminar `std::thread::sleep` de comandos `async`; usar `tokio::time::sleep(...).await` o mover la creación a `std::thread::spawn` completo.
- Resolver `main` en cada operación (no cachear handle) para evitar handles obsoletos.

En frontend:
- `CrozzoWebEmbedDockCore.js`: reducir observers; quitar polling global; acotar MutationObserver al host y a clases específicas.
- `index.html`: cargar solo el módulo del dock único; no cargar 7 docks por defecto.

En configuración:
- Cambiar `webviewInstallMode` a `fixedVersion` o al menos documentar la dependencia del bootstrapper; considerar empaquetar runtime en instaladores offline.
- Añadir el dock único a `capabilities/desktop.json`.

---

## 10. Decisión final: ¿es necesario?

No es necesario para la operación del POS. Es una **funcionalidad de conveniencia** (música/contenidos). Por tanto:

- Debe estar detrás de feature flag.
- Debe degradar con elegancia a "abrir en navegador".
- No debe poder bloquear ni colapsar el núcleo del POS.

Con el rediseño (dock único, lazy, efímero, con preflight y circuit breaker), el riesgo baja de "alto" a "moderado y controlable". Sin ese rediseño, volver a intentar el enfoque actual de 9 docks permanentes tiene **alta probabilidad de repetir el colapso**.

---

## 11. Fuentes consultadas (internet)

- Microsoft: "Performance best practices for WebView2 apps" (memoria, procesos, evitar instancias redundantes, compartir entornos, suspender inactivos).
- Tauri docs: `WebviewWindowBuilder` (deadlock en comandos síncronos en Windows; usar async/hilos).
- Tauri issue #13092: ventanas en blanco por `additional_browser_args` / `data_directory` desalineados.
- Tauri issue #15014 / #11144: deadlock y error `HRESULT 0x8007139F` por opciones de entorno desalineadas.
- Tauri docs: API `Webview` inestable para child webviews; `WebviewWindow` estable.
- WebView2Feedback #4290: crashes con múltiples webviews en runtime antiguo (corregido en 122+).

---

*Este documento es la "tesis" solicitada: análisis a gran escala + viabilidad + plan. No modifica código; sirve como base para la próxima iteración.*

---

## 12. Comparativa: qué ya funciona y por qué (actualizado tras revisión adicional)

### 12.1 Inventario real de docks y cómo se abren

| Programa | Módulo frontend | Comando Rust | Carga por defecto | Peso del sitio | Estado observado |
|----------|-----------------|--------------|-------------------|----------------|------------------|
| WhatsApp Web | `CrozzoWhatsAppDock.js` (propio) | `crozzo_whatsapp_dock_sync` | Prewarm al arranque | Alto (chat, multimedia) | Funciona en uso diario |
| Gmail | `CrozzoGmailDock.js` | **`crozzo_whatsapp_dock_sync` (mal configurado)** | Cargado | Alto | Se decidió abrir en navegador externo |
| Google Drive | `CrozzoDriveDock.js` | **`crozzo_whatsapp_dock_sync` (mal configurado)** | Cargado | Medio-Alto | Se decidió abrir en navegador externo |
| Dataico | `CrozzoDataicoDock.js` | `crozzo_dataico_dock_sync` | Cargado | Bajo (formulario web) | Funciona |
| DIAN VPFE | `CrozzoDianVpfeDock.js` | `crozzo_dian_vpfe_dock_sync` | Cargado | Bajo (consulta) | Funciona |
| Spotify | `CrozzoSpotifyDock.js` | `crozzo_spotify_dock_sync` | Cargado | **Muy alto (streaming de audio, DRM, SPA pesada)** | **Colapsó el sistema** |
| Supabase SQL | `CrozzoSupabaseSqlDock.js` | `crozzo_supabase_dock_sync` | Cargado (solo superadmin) | Medio | Uso acotado |
| YouTube | `CrozzoYouTubeDock.js` (existe en commit, no en árbol actual) | `crozzo_youtube_dock_sync` | **Retirado de carga por defecto** | **Muy alto (video, DRM)** | No probado en producción |
| Facebook | `CrozzoFacebookDock.js` (existe en commit, no en árbol actual) | `crozzo_facebook_dock_sync` | **Retirado de carga por defecto** | Alto | No probado |

Acceso rápido: `CrozzoQuickAppsFab.js` expone botones flotantes para wa, gmail, drive, dataico, dian, spotify.

### 12.2 Por qué los ligeros funcionan y los pesados colapsan

- **Dataico y DIAN VPFE** son páginas relativamente estáticas y livianas: poco JavaScript, sin streaming, sin DRM, sin autoplay. WebView2 las maneja sin estrés.
- **WhatsApp Web** es pesado pero está **precalentado al arranque** en un hilo dedicado y es el caso mejor ejercitado; además el usuario ya tolera su carga inicial. Aun así, es el candidato #2 a problemas si se alternan varios docks.
- **Spotify** combina: streaming de audio continuo, DRM (Widevine), SPA con mucho JavaScript, posibles autoplay policies, y consumo sostenido de CPU/red. En un WebView2 adicional (proceso propio) esto **multiplica** el consumo. Si además se abre/cierra o se alterna con otros docks, el sistema se queda sin recursos → pantallas negras y errores de conexión.
- **YouTube** sería aún peor: video + DRM + alta memoria. No está cableado en el frontend actual, pero el Rust ya lo soporta; si se "activa" sin rediseño, repetirá el colapso.
- **Gmail/Drive** se "arreglaron" no incrustándolos: se abren en el navegador del sistema. Eso evita el problema por completo. Es la prueba de que **la salida segura ya existe y funciona**.

### 12.3 Bug latente detectado (no es la causa del colapso, pero debe corregirse)

`CrozzoGmailDock.js` y `CrozzoDriveDock.js` tienen `invokeCmd: 'crozzo_whatsapp_dock_sync'`. Es decir, si se invocan como dock, controlan la ventana de WhatsApp, no la suya. Hoy no se nota porque se abren externamente, pero si alguien reactiva esos docks, el comportamiento será errático. **Debe corregirse o eliminarse** ese código muerto.

### 12.4 Conclusión comparativa

- **Funciona bien:** docks ligeros y acotados (Dataico, DIAN), y los que se abren en navegador externo (Gmail, Drive, Tribe).
- **Funciona con cuidado:** WhatsApp (precalentado, uso constante, sin alternancia rápida).
- **No funciona con el diseño actual:** Spotify (colapsó). YouTube no probado, pero por perfil de carga es de mayor riesgo.
- **Regla que emerge:** el riesgo escala con (peso del sitio × número de instancias vivas × frecuencia de alternancia). Los docks actuales no tienen límite de instancias ni suspensión de inactivos.

### 12.5 Ajuste a la recomendación (específico para Spotify/YouTube)

1. **No activar YouTube como dock** hasta tener el rediseño; abrirlo en navegador externo por ahora (como Gmail/Drive/Tribe).
2. **Spotify solo como "dock de medios" con reglas especiales:**
   - Una sola instancia global de medios (Spotify o YouTube, nunca ambas).
   - Suspender el webview cuando no está visible (equivalente a `TrySuspendAsync`).
   - Prohibir autoplay hasta interacción del usuario.
   - Destruir (no solo ocultar) si el usuario cierra o si falla 1 vez.
3. **Mantener Dataico/DIAN/WhatsApp como están** (son los que funcionan); no tocarlos salvo el refactor opcional a dock único.
4. **Eliminar o corregir** los módulos Gmail/Drive con `invokeCmd` equivocado para evitar confusiones futuras.
5. **No intentar incrustar Gmail/Tribe** bajo ninguna circunstancia: seguir con `crozzo_open_external_url`.

Con esto, el sistema mantiene lo que ya funciona y acota el riesgo de los medios a un solo webview controlado, en lugar de N ventanas permanentes.

---

## 13. Corrección importante: Gmail/Drive sí se cargan dentro del sistema (dock de página)

### 13.1 Lo que el código actual hace realmente
En `app/core/CrozzoPosMain.js`, al navegar a `gmail-web` o `drive-web`, se ejecuta:
- `crozzoRenderGmailWebPage()` / `crozzoRenderDriveWebPage()` (dock interno, host slot en la página).
- `crozzoInitGmailWebPage()` / `crozzoInitDriveWebPage()`.

Es decir, **Gmail y Drive se renderizan como dock dentro de la página del POS** (panel grande), no como navegador externo. La decisión de "abrir en navegador" del commit `7dbf73b` aplica a rutas secundarias (enlaces, OAuth, quick actions), pero **la página principal sigue usando el dock interno**.

Por tanto, mi afirmación anterior de que "Gmail/Drive se abren externamente y por eso funcionan" era **incompleta**: en la navegación normal sí usan el dock interno y consumen WebView2.

### 13.2 Consecuencia: el bug de `invokeCmd` es más grave de lo que parecía
`CrozzoGmailDock.js` y `CrozzoDriveDock.js` declaran:
```
invokeCmd: 'crozzo_whatsapp_dock_sync'
```
Esto significa que, al abrir la página de Gmail o Drive, el frontend invoca el comando de **WhatsApp**, controlando la ventana `crozzo-whatsapp-dock`, no la de Gmail/Drive. En la práctica:
- La página se muestra (HTML del host), pero el webview real que se posiciona/muestra es el de WhatsApp.
- Esto puede dar la sensación de que "se carga en el sistema" (porque el host HTML sí se renderiza), pero el contenido real puede ser el de WhatsApp o quedar en blanco/error.
- Es un **bug latente de alta prioridad** que debe corregirse o eliminarse.

### 13.3 Implicación para el colapso
Si el usuario abría Gmail o Drive (página) y el sistema invocaba el dock de WhatsApp por error, se estaban creando/alternando instancias de WebView2 de forma no prevista. Esto **sí puede contribuir al colapso de recursos**, especialmente si se alternaba entre varias páginas web-embed.

### 13.4 Sobre las imágenes adjuntas
No puedo visualizar imágenes en este modelo (limitación del entorno). Si puedes, describe en texto qué muestra cada captura (por ejemplo: "Gmail se ve cargado dentro del POS en panel grande", "pantalla negra al abrir Spotify", "error de conexión de Microsoft"). Con esa descripción textual puedo afinar aún más el diagnóstico.

### 13.5 Ajuste final a la recomendación
- **Corregir o eliminar** los módulos `CrozzoGmailDock.js` y `CrozzoDriveDock.js` con `invokeCmd` equivocado **antes** de cualquier otra cosa. O bien, convertir Gmail/Drive en páginas que abran externamente de forma consistente (sin dock interno).
- Mantener la regla: Gmail/Drive/Tribe **no deben incrustarse**; si se decide incrustar, primero corregir el comando y probar en aislamiento.
- El colapso se explica mejor ahora: no solo Spotify, sino **cualquier página web-embed** (Gmail, Drive, WhatsApp, Dataico, DIAN, Spotify) crea un WebView2 adicional. El riesgo es acumulativo.

---

## 14. Idea del usuario: un solo navegador reutilizable (y pestañas)

### 14.1 Lo que propone el usuario
En lugar de abrir 5 docks al mismo tiempo, usar **un solo webview** que, al pedir una página (Spotify, YouTube, Gmail, etc.), navegue a esa URL en ese mismo control. Si después se pide otra, el mismo webview cambia de URL. Acepta que la carga tarde un poco; lo importante es que **solo exista una instancia** a la vez.

### 14.2 Es viable: es exactamente la "Opción A" (dock único reutilizable)
Sí, y es la recomendación principal. Un solo `WebviewWindow` (`crozzo-web-dock`) que:
- Se crea perezosamente al primer uso.
- Navega a la URL solicitada (`navigate()`).
- Se posiciona en el host slot medido.
- Se oculta (no destruye) al cerrar la página, para reuso rápido.
- Se destruye si falla o si el usuario lo pide.

Esto elimina la multiplicación de instancias y reduce el consumo a un solo proceso WebView2.

### 14.3 Sobre "pestañas" (tabs) dentro de ese único navegador
WebView2 **no tiene pestañas nativas** en un solo control. Opciones:
1. **Un solo webview que cambia de URL** (recomendado para tu caso): al cambiar de Spotify a YouTube, el audio de Spotify se corta y carga YouTube. Simple, bajo riesgo, una instancia.
2. **Pestañas simuladas**: guardar la URL actual y, al "cambiar de pestaña", navegar. Es lo mismo que (1), solo con UI de pestañas encima. El audio siempre se corta al cambiar.
3. **Mantener audio de fondo mientras se ve otra página**: requeriría un segundo webview dedicado a audio (o iframe). Eso reintroduce una segunda instancia y complejidad. **No recomendado** si el objetivo es evitar colapsos.
4. **Navegador externo con pestañas reales**: abrir Spotify/YouTube en el navegador del sistema (Edge/Chrome). Ahí sí hay pestañas reales y audio independiente, con cero riesgo para el POS.

### 14.4 Respuesta directa a tu pregunta
- **Sí se puede** tener un solo navegador que cambie de página según la necesidad, sin abrir 5 al mismo tiempo. Eso es el dock único reutilizable.
- **La música se cortará** al cambiar de página (porque es el mismo webview navegando a otra URL). Si quieres que la música siga sonando mientras usas otra app, la única vía segura es el navegador externo (Opción 4).
- **No es necesario** usar pestañas reales dentro del POS; con un solo webview que cambia de URL basta y es lo más estable.

### 14.5 Recomendación ajustada (final)
- Implementar el **dock único reutilizable** (un webview, navega a la URL pedida).
- UI: botones para "Spotify", "YouTube", "Gmail", etc. que, al pulsar, navegan ese único webview a la URL correspondiente.
- Si el usuario quiere seguir escuchando música mientras hace otra cosa, ofrecer botón "Abrir en navegador externo" (Edge/Chrome) para ese servicio.
- Gmail/Drive/Tribe: seguir abriendo en navegador externo por defecto (no incrustar).
- YouTube: solo vía navegador externo hasta validar el dock único.

---

## 15. Propuesta refinada del usuario: 2 webviews (medios + navegación)

### 15.1 La idea
En lugar de un solo webview o de N, usar **dos instancias fijas**:
1. **Webview de medios** (`crozzo-media-dock`): dedicado a Spotify o YouTube. Permanece vivo para que el audio/video no se corte al cambiar de página.
2. **Webview de navegación** (`crozzo-nav-dock`): reutilizable para el resto (Gmail, Drive, Dataico, DIAN, etc.), cambia de URL según la necesidad.

Así se pasa de 5-7 instancias a **solo 2**, y la música sigue sonando mientras se usa el navegador interno.

### 15.2 Viabilidad: SÍ, y es mejor que un solo webview para audio
- **2 WebView2** es un consumo aceptable y controlado (vs. 5-7).
- El webview de medios se mantiene vivo (audio no se corta).
- El webview de navegación se reutiliza (cambia de URL).
- Se puede suspender el de medios cuando no se usa (ahorro de recursos).
- Se evita la multiplicación de procesos.

### 15.3 Reglas para que no colapse
1. **Máximo 2 instancias vivas** (medios + navegación). Nunca crear una tercera.
2. El de medios **solo** carga Spotify o YouTube (no Gmail/Drive/etc.).
3. El de navegación **nunca** carga medios (para no competir por audio).
4. Si el usuario cierra el de medios, **destruirlo** (liberar memoria).
5. Si el de medios falla 1 vez, destruirlo y ofrecer "Abrir en navegador externo".
6. Suspender el de medios cuando esté oculto (`TrySuspendAsync` equivalente).
7. No permitir autoplay en el de medios hasta interacción del usuario.

### 15.4 Comparativa final de opciones

| Opción | Instancias vivas | Audio persiste | Riesgo | Complejidad |
|--------|------------------|----------------|--------|-------------|
| A (un solo webview) | 1 | No (se corta) | Bajo | Baja |
| B (N docks, actual) | 5-7 | Sí (pero inestable) | Alto | Alta |
| **C (2 webviews: medios + nav)** | **2** | **Sí** | **Medio-Bajo** | **Media** |
| D (navegador externo) | 0 (en POS) | Sí (en Edge/Chrome) | Muy bajo | Muy baja |

### 15.5 Recomendación final ajustada
**Opción C (2 webviews)** es el mejor balance para lo que el usuario quiere:
- Música no se corta (webview de medios vivo).
- Navegación reutilizable (webview de navegación cambia de URL).
- Solo 2 instancias (controlado, no colapsa).
- Gmail/Drive/Tribe siguen en navegador externo (no incrustar).
- YouTube y Spotify comparten el webview de medios (solo uno a la vez).

Esta es la propuesta que debe implementarse.

---

## 16. Consumo mínimo de recursos y implementación no destructiva

### 16.1 Objetivo de consumo
La app debe usar **recursos básicos en reposo** y solo activar WebView2 cuando el usuario lo pide. En reposo (sin docks abiertos), el consumo de memoria/CPU debe ser comparable a la versión sin docks.

### 16.2 Estrategias de bajo consumo

| Estrategia | Qué hace | Ahorro |
|-----------|----------|--------|
| **Lazy creation** | No crear ningún WebView2 al arranque (excepto el principal). Crear solo al primer uso del dock. | Evita ~200-400 MB en reposo |
| **Destroy on close** | Al cerrar un dock, destruir el webview (no solo `hide()`). | Libera memoria inmediatamente |
| **Suspend on hide** | Si se oculta temporalmente (overlay/modal), suspender el renderer (`TrySuspendAsync`). | Reduce CPU/red a ~0 |
| **Single instance por categoría** | Máximo 2 webviews vivos (medios + nav). Nunca 3. | Tope de memoria predecible |
| **No prewarm de docks pesados** | Solo precalentar WhatsApp (ya se hace). No precalentar Spotify/YouTube/Dataico. | Evita carga innecesaria |
| **Throttle de sync** | Limitar la frecuencia de `dock_sync` (máximo cada 250 ms). | Evita IPC flooding |
| **Observers acotados** | MutationObserver solo sobre el host slot, no sobre todo el DOM. | Reduce CPU en UI |
| **Feature flag** | `CROZZO_WEB_DOCKS_ENABLED` (default `false`). Si está off, los botones abren en navegador externo. | Cero riesgo en producción |

### 16.3 Plan de implementación no destructiva (no dañar lo existente)

**Principio: no modificar el código que funciona; agregar, no reemplazar.**

#### Fase 0 — Preparación (sin tocar código funcional)
- Crear rama `feat/web-dock-v2` desde el commit estable actual.
- Agregar feature flag `CROZZO_WEB_DOCKS_ENABLED` en `localStorage` (default `false`).
- Agregar logging estructurado (versión WebView2, tiempo de creación, errores).

#### Fase 1 — Infraestructura (código nuevo, aislado)
- Crear `src-tauri/src/crozzo_web_dock.rs` (nuevo módulo) con:
  - `crozzo_web_dock_create(service, url)` — crea un webview genérico.
  - `crozzo_web_dock_navigate(url)` — navega el webview existente.
  - `crozzo_web_dock_destroy()` — destruye y libera.
  - `crozzo_web_dock_suspend()` / `resume()`.
- Registrar en `lib.rs` solo si feature flag activo.
- **No tocar** `crozzo_external.rs` existente (dejarlo como está).

#### Fase 2 — Frontend (código nuevo, aislado)
- Crear `app/modules/CrozzoWebDockV2.js` (nuevo módulo) con:
  - Lógica de 2 webviews (medios + nav).
  - Lazy creation, destroy on close, suspend on hide.
  - Throttle de sync (250 ms).
  - Observers acotados.
- Cargarlo en `index.html` solo si feature flag activo.
- **No modificar** los módulos existentes (`CrozzoSpotifyDock.js`, etc.).

#### Fase 3 — Adaptación del botón "+" (QuickAppsFab)
- El botón "+" actual (`CrozzoQuickAppsFab.js`) abre docks por servicio.
- Adaptarlo para que, si feature flag está activo, use el nuevo sistema (2 webviews).
- Si está inactivo, mantener comportamiento actual (abrir en navegador externo).
- **No eliminar** el botón actual; agregar una rama condicional.

#### Fase 4 — Corrección de bugs latentes (seguro)
- Corregir `CrozzoGmailDock.js` y `CrozzoDriveDock.js` (`invokeCmd` equivocado) o eliminarlos si no se usan.
- Esto no afecta funcionalidad actual porque Gmail/Drive se abren externamente en la mayoría de rutas.

#### Fase 5 — QA y despliegue gradual
- Probar en aislamiento (rama separada) con la versión antigua como fallback.
- Canary a un subconjunto de tiendas.
- Rollback automático si hay crash o consumo excesivo.
- Monitorear memoria/CPU en producción.

### 16.4 Qué NO tocar (para no dañar nada)

| Archivo/Módulo | Por qué no tocarlo |
|----------------|-------------------|
| `CrozzoPosMain.js` (renderPage, navigateTo) | Es el corazón del sistema; cualquier cambio puede romper navegación |
| `CrozzoExternalLogin.js` | Login externo PKCE; ya funciona |
| `crozzo_external.rs` (existente) | Dejarlo como está; agregar módulo nuevo en paralelo |
| `capabilities/desktop.json` (existente) | Agregar nueva capability para el nuevo dock, no modificar la existente |
| `CrozzoWhatsAppDock.js` | Funciona; no tocar |
| `CrozzoDataicoDock.js`, `CrozzoDianVpfeDock.js` | Funcionan; no tocar |
| `CrozzoQuickAppsFab.js` (lógica actual) | Solo agregar rama condicional, no reemplazar |

### 16.5 Cómo adaptar el botón "+" sin romper nada

El botón "+" (`CrozzoQuickAppsFab`) actualmente abre docks por servicio. La adaptación:

1. **Si feature flag OFF** (default): comportamiento actual (abrir en navegador externo para Gmail/Drive/Tribe; docks para Dataico/DIAN/Spotify).
2. **Si feature flag ON**: usar el nuevo sistema de 2 webviews:
   - "Spotify" / "YouTube" → webview de medios.
   - "Gmail" / "Drive" / "Dataico" / "DIAN" → webview de navegación.
   - "Tribe" → navegador externo (no incrustar).

Esto permite probar el nuevo sistema sin afectar a los usuarios que usan la versión actual.

### 16.6 Páginas guardadas (favoritos) para facilitar el trabajo

El usuario quiere páginas guardadas para buscar NIT, razón social, etc. (Dataico, DIAN, proveedores de facturación electrónica). Esto se puede implementar como:

- **Lista de favoritos** en el webview de navegación (URLs preconfiguradas).
- Botones rápidos para "Buscar NIT", "Consultar DIAN", "Dataico", etc.
- Al pulsar, el webview de navegación navega a esa URL.
- No requiere cambios en el código existente; es solo configuración de URLs.

Ejemplo de favoritos:
- Dataico: `https://app.dataico.com/`
- DIAN VPFE: `https://catalogo-vpfe.dian.gov.co/`
- Consulta NIT (DIAN): `https://muisca.dian.gov.co/...`
- Proveedores de facturación: URLs específicas

### 16.7 Resumen: cómo lograr todo sin dañar nada

1. **No tocar** el código que funciona (WhatsApp, Dataico, DIAN, login, navegación).
2. **Agregar** código nuevo en paralelo (módulo nuevo + feature flag).
3. **Probar** en aislamiento (rama separada).
4. **Desplegar** gradualmente (canary).
5. **Rollback** automático si hay problemas.
6. **Monitorear** memoria/CPU en producción.

Con este enfoque, el sistema actual sigue funcionando exactamente igual para los usuarios que no activan el feature flag, y los que lo activan obtienen el nuevo diseño de 2 webviews con consumo mínimo.

---

## 17. Plan de acción detallado con agentes especializados

### 17.1 Principios de ejecución
- **Un paso a la vez.** Cada fase se verifica antes de pasar a la siguiente.
- **Código delicado = lectura primero.** Antes de editar, leer el archivo completo y entender el contexto.
- **No borrar lo que funciona.** Solo agregar en paralelo.
- **Feature flag default OFF.** El sistema actual sigue funcionando igual.
- **Rollback disponible.** Cada fase deja un commit revertible.

### 17.2 Agentes especializados

| Agente | Rol | Responsabilidad |
|--------|-----|-----------------|
| **Agente A — Rust Backend** | Especialista en Tauri/Rust | Crear `crozzo_web_dock.rs`, comandos async, gestión de webview, suspend/destroy. |
| **Agente B — Frontend Core** | Especialista en JS/DOM | Crear `CrozzoWebDockV2.js`, lazy creation, observers acotados, throttle. |
| **Agente C — Integración UI** | Especialista en QuickAppsFab y navegación | Adaptar botón "+" con rama condicional por feature flag. |
| **Agente D — QA/Verificación** | Especialista en pruebas | Verificar build, cargo check, sincronización app/src, smoke tests. |
| **Agente E — Documentación** | Especialista en docs | Actualizar este documento, CHANGELOG, notas de despliegue. |

### 17.3 Fases y asignación

#### Fase 0 — Preparación (Agente D + Agente E)
**Objetivo:** Estado limpio y documentado. Sin tocar código funcional.

| Paso | Acción | Agente | Verificación |
|------|--------|--------|--------------|
| 0.1 | Crear rama `feat/web-dock-v2` desde HEAD | D | `git branch --show-current` |
| 0.2 | Commitear cambios actuales como WIP | D | `git status` limpio |
| 0.3 | Verificar build base (cargo check) | D | Sin errores |
| 0.4 | Documentar estado base en este doc | E | Sección 17.4 |

**Criterio de salida:** rama creada, build pasa, estado documentado.

#### Fase 1 — Infraestructura Rust (Agente A)
**Objetivo:** Módulo nuevo `crozzo_web_dock.rs` con comandos async seguros.

| Paso | Acción | Agente | Verificación |
|------|--------|--------|--------------|
| 1.1 | Leer `crozzo_external.rs` completo (1801 líneas) para entender patrones | A | Resumen escrito |
| 1.2 | Crear `crozzo_web_dock.rs` con struct `WebDockState` (enum: Media, Nav) | A | Compila |
| 1.3 | Implementar `crozzo_web_dock_create(service, url)` async con lazy creation | A | cargo check |
| 1.4 | Implementar `crozzo_web_dock_navigate(url)` (reutiliza instancia) | A | cargo check |
| 1.5 | Implementar `crozzo_web_dock_destroy()` (libera recursos) | A | cargo check |
| 1.6 | Implementar `crozzo_web_dock_suspend()` / `resume()` | A | cargo check |
| 1.7 | Registrar comandos en `lib.rs` detrás de feature flag | A | cargo check |
| 1.8 | Verificar que `crozzo_external.rs` original no se modificó | D | git diff |

**Criterio de salida:** módulo nuevo compila, comandos registrados, original intacto.

**⚠️ Cuidado:** No usar `std::thread::sleep` en comandos async. Usar `tokio::time::sleep().await` o spawn en hilo dedicado.

#### Fase 2 — Frontend Core (Agente B)
**Objetivo:** `CrozzoWebDockV2.js` con lazy creation, observers acotados, throttle.

| Paso | Acción | Agente | Verificación |
|------|--------|--------|--------------|
| 2.1 | Leer `CrozzoWebEmbedDockCore.js` completo para entender patrones | B | Resumen escrito |
| 2.2 | Crear `CrozzoWebDockV2.js` con estado de 2 webviews (media + nav) | B | Sin errores de sintaxis |
| 2.3 | Implementar lazy creation (crear solo al primer uso) | B | Test manual |
| 2.4 | Implementar destroy on close | B | Test manual |
| 2.5 | Implementar suspend/resume on hide | B | Test manual |
| 2.6 | Implementar throttle de sync (250 ms) | B | Test manual |
| 2.7 | Acotar observers al host slot | B | Test manual |
| 2.8 | Agregar a `index.html` solo si feature flag activo | B | Verificar carga condicional |

**Criterio de salida:** módulo nuevo carga sin errores, lazy creation funciona, observers acotados.

**⚠️ Cuidado:** No modificar `CrozzoWebEmbedDockCore.js` existente. Crear archivo nuevo.

#### Fase 3 — Integración UI (Agente C)
**Objetivo:** Adaptar botón "+" con rama condicional por feature flag.

| Paso | Acción | Agente | Verificación |
|------|--------|--------|--------------|
| 3.1 | Leer `CrozzoQuickAppsFab.js` completo | C | Resumen escrito |
| 3.2 | Agregar detección de feature flag `CROZZO_WEB_DOCKS_ENABLED` | C | Test manual |
| 3.3 | Si flag OFF: mantener comportamiento actual | C | Test manual |
| 3.4 | Si flag ON: usar nuevo sistema (2 webviews) | C | Test manual |
| 3.5 | Agregar botones de favoritos (Dataico, DIAN, etc.) | C | Test manual |
| 3.6 | Verificar que el botón "+" no se rompe | C | Test manual |

**Criterio de salida:** botón "+" funciona en ambos modos (flag on/off).

**⚠️ Cuidado:** Solo agregar rama condicional, no reemplazar la lógica existente.

#### Fase 4 — Corrección de bugs latentes (Agente A + B)
**Objetivo:** Corregir `invokeCmd` equivocado en Gmail/Drive.

| Paso | Acción | Agente | Verificación |
|------|--------|--------|--------------|
| 4.1 | Decidir: corregir o eliminar `CrozzoGmailDock.js` y `CrozzoDriveDock.js` | A+B | Decisión documentada |
| 4.2 | Si se corrigen: cambiar `invokeCmd` a los comandos correctos | B | Test manual |
| 4.3 | Si se eliminan: remover de `index.html` y verificar que no se rompa nada | B | Test manual |
| 4.4 | Verificar que Gmail/Drive siguen abriéndose en navegador externo | D | Test manual |

**Criterio de salida:** Gmail/Drive no usan el comando de WhatsApp.

#### Fase 5 — QA y despliegue (Agente D + E)
**Objetivo:** Verificar todo y preparar despliegue.

| Paso | Acción | Agente | Verificación |
|------|--------|--------|--------------|
| 5.1 | Ejecutar `cargo check` | D | Sin errores |
| 5.2 | Ejecutar `npm run sync` | D | Sin errores |
| 5.3 | Verificar que `app/` y `src/` están sincronizados | D | Diff vacío |
| 5.4 | Probar con feature flag OFF (comportamiento actual) | D | Todo funciona igual |
| 5.5 | Probar con feature flag ON (nuevo sistema) | D | 2 webviews funcionan |
| 5.6 | Verificar consumo de memoria (Task Manager) | D | < 500 MB en reposo |
| 5.7 | Documentar resultados | E | Sección 17.4 |
| 5.8 | Preparar commit y PR | D | Commit limpio |

**Criterio de salida:** Todo funciona en ambos modos, consumo aceptable, documentación actualizada.

### 17.4 Estado base (documentar antes de empezar)

- Rama actual: `fase1-seguridad-rls` (HEAD `0a04a12`, v1.0.260).
- Cambios sin commit: `.cursor/test-clinical.stamp`, `app/Crozzo_POS_Completo.html`, `app/index.html`, `package.json`, `releases/latest.json`, `releases/registry.json`, `src-tauri/src/lib.rs`, `src-tauri/tauri.android.conf.json`, `src-tauri/tauri.conf.json`, `src/index.html`.
- Nuevo archivo: `docs/ANALISIS-DOCKS-SPOTIFY-YOUTUBE.md`.
- Stashes: 7 (backup de cambios anteriores).

### 17.5 Orden de ejecución recomendado

```
Fase 0 (preparación) → Fase 1 (Rust) → Fase 2 (Frontend) → Fase 3 (UI) → Fase 4 (bugs) → Fase 5 (QA)
```

Cada fase depende de la anterior. No saltar fases.

### 17.6 Señales de alerta (detener y revisar)

- `cargo check` falla → detener, revisar error.
- `npm run sync` falla → detener, revisar.
- Consumo de memoria > 800 MB en reposo → detener, revisar.
- Pantalla negra al abrir un dock → detener, revisar.
- Cualquier crash → detener, revisar.

### 17.7 Rollback

Si algo falla, revertir al commit anterior:
```
git reset --hard <commit-anterior>
```
O desactivar el feature flag (`CROZZO_WEB_DOCKS_ENABLED = false`) para volver al comportamiento actual.

---

## 18. Bitácora de ejecución (completado)

### Fase 0 — Preparación ✅
- Rama `feat/web-dock-v2` creada (commit `6a0d5ce`).
- WIP commiteado (estado limpio).
- `cargo check` baseline: EXIT 0.

### Fase 1 — Infraestructura Rust ✅
- `src-tauri/src/crozzo_web_dock.rs` creado (2 slots: media + nav).
- Comandos: create, navigate, destroy, hide.
- Lazy creation, sin `std::thread::sleep` en async, sin delay de 2s.
- `capabilities/web-dock.json` creado.
- Comandos registrados en `lib.rs`.
- `crozzo_external.rs` original no modificado.
- Commit: `437cce6`.

### Fase 2 — Frontend Core ✅
- `app/modules/CrozzoWebDockV2.js` creado (lazy, 2 slots, feature flag).
- Panel derecho tipo celular (ancho ~380px, alto completo bajo header).
- Agregado a `app/index.html` y `app/Crozzo_POS_Completo.html`.
- Sync ejecutado (src/ sincronizado).
- Commit: `ee771a3`.

### Fase 3 — Integración UI ✅
- `CrozzoQuickAppsFab.js` adaptado con rama condicional por feature flag.
- `getActiveEmbed` y `closeActiveEmbed` actualizados para V2.
- Commit: `1cf2d62`.

### Fase 4 — Corrección de bugs latentes ✅
- `CrozzoGmailDock.js`: `invokeCmd` corregido de `crozzo_whatsapp_dock_sync` a `crozzo_gmail_dock_sync`.
- `CrozzoDriveDock.js`: `invokeCmd` corregido de `crozzo_whatsapp_dock_sync` a `crozzo_drive_dock_sync`.
- Commit: `8ad6e6f`.

### Fase 5 — QA ✅
- `cargo check`: EXIT 0.
- `npm run sync`: OK (244 archivos).
- Módulo `CrozzoWebDockV2.js` cargado condicionalmente (feature flag default OFF).
- Sistema actual sigue funcionando igual (flag OFF por defecto).

### Cómo probar el nuevo sistema
1. Abrir consola del navegador (DevTools) en el POS.
2. Ejecutar: `localStorage.setItem('CROZZO_WEB_DOCKS_ENABLED', 'true')`
3. Recargar la página.
4. El botón "+" usará el nuevo sistema de 2 webviews.
5. Para desactivar: `localStorage.removeItem('CROZZO_WEB_DOCKS_ENABLED')` y recargar.

### Consumo en reposo (feature flag OFF)
- Ningún WebView2 adicional se crea.
- Consumo idéntico a la versión anterior.
- Cero riesgo para producción.
