# Web Dock V2 — Panel Lateral Tipo Celular

## Resumen
Panel lateral derecho (~360px) para servicios web (Spotify, YouTube, Dataico, DIAN, Gmail, Drive, WhatsApp) en la app POS Tauri v2. Se abre on-demand sin colapsar el sistema, con bajo consumo de recursos.

## Arquitectura
- **2 slots (WebView2)**: `media` (Spotify/YouTube) + `nav` (Dataico/DIAN/Gmail/Drive/WhatsApp).
- **Lazy creation**: los webviews se crean solo cuando se usan.
- **Destroy on close**: al cerrar el panel se destruyen los webviews (libera memoria).
- **Audio persistente**: Spotify/YouTube siguen sonando al cambiar a otra pestaña (el slot media no se destruye, solo se oculta).

## Archivos clave
- `src-tauri/src/crozzo_web_dock.rs`: módulo Rust (2 slots, lazy, zoom, show/hide/navigate/destroy).
- `src-tauri/permissions/crozzo-external.toml`: ACL con comandos web_dock.
- `src-tauri/src/lib.rs`: registro de comandos + devtools (temp).
- `src-tauri/capabilities/web-dock.json`: capability.
- `app/modules/CrozzoWebDockV2.js`: panel frontend (tabs, controles, margin, mobile UA).
- `app/modules/CrozzoQuickAppsFab.js`: integración V2 (botón + abre servicio en reproducción).
- `app/css/CrozzoPosStyles.css`: CSS del panel (360px, margin 384px).
- `app/Crozzo_POS_Completo.html`: script V2 incluido.

## Feature flag
- `CROZZO_WEB_DOCKS_ENABLED` en localStorage. Default ON (null → true). Se puede deshabilitar.

## Controles del panel
- Tabs: Spotify, YouTube, Dataico, DIAN, Gmail, Drive, WhatsApp.
- Cerrar (×): oculta el panel (audio sigue en Spotify/YouTube).
- Detener (⏹): destruye el slot de media (corta audio).
- Zoom (slider 50-200%): afecta al slot activo.
- Vista (📱): alterna teléfono/escritorio.
- Abrir en navegador (🌐): abre el servicio activo en navegador externo.

## WhatsApp
- Se abre a pantalla completa (no en panel de 360px).
- Respeta el área principal (sidebar + panel derecho).
- Menú izquierdo se bloquea mientras WhatsApp está abierto.
- Clic en item de navegación cierra WhatsApp.
- Botones de salida: Volver (página anterior) / Inicio (inicio BONA).

## Bloqueo de anuncios
- Red: bloquea dominios de anuncios (doubleclick, googlesyndication, etc.) y endpoints de YouTube ads.
- Cliente: auto-skip ads en YouTube, oculta banners en Spotify.

## Cambios temporales (revertir antes de producción)
- DevTools auto-open deshabilitado (era diagnóstico).
- Updater deshabilitado (version mismatch 2.10.1 vs 2.14.1).
- `@tauri-apps/plugin-updater` removido de package.json.

## Cómo probar
1. Ejecutar `tauri-app.exe`.
2. Login → rápido, sin lag.
3. Botón + → abre Spotify/YouTube, panel con pestañas.
4. Pestaña WhatsApp → pantalla completa.
5. Spotify/YouTube → × oculta (audio sigue) → ⏹ detiene.
6. Expandir menú izquierdo → WhatsApp se encoge.
7. Clic en opción del menú → WhatsApp se cierra y navega.