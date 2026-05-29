# Actualización automática del instalador (.exe)

## Dos canales

| Canal | Archivo | Dónde | Qué hace |
|-------|---------|-------|----------|
| **OTA (avisos)** | `registry.json`, `latest.json` | Rama `main` en GitHub | Franja / modal crítica u opcional |
| **Tauri (programa)** | `latest.json` (del **Release**, no de main) | **GitHub Release** (tag `v*`) | Descarga e instala el `.exe` al pulsar **Instalar** |

No se pisan: el OTA vive en `main` (`registry.json`); el updater usa el `latest.json` adjunto al release (formato Tauri con `platforms` y firmas).

## Primera vez (firma)

1. Ejecute **`Generar claves firma Tauri.bat`** (crea claves en `%USERPROFILE%\.tauri\crozzo-pos.key`).
2. En GitHub → repo **Principal** → Settings → Secrets → Actions:
   - `TAURI_SIGNING_PRIVATE_KEY`: contenido del archivo `.key` (texto completo).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: vacío si no puso contraseña.

La clave pública ya está en `src-tauri/tauri.conf.json`. **No suba el archivo `.key` al repo.**

## Publicar un instalador nuevo

**Un solo workflow en GitHub:** al subir tag `vX.Y.Z` solo debe correr **Tauri Release** (`tauri-release.yml`).  
No debe existir `release.yml` (“Publicar Crozzo POS”): compilaba dos veces y podía sobrescribir `latest.json` del updater.

**Importante:** subir solo `releases/latest.json` a `main` muestra el aviso, pero **no cambia la interfaz** hasta que exista un **Release** con el `.exe` compilado (tag `vX.Y.Z`).

1. Sincronice frontend (`Sincronizar frontend.bat` o `npm run publicar-actualizacion`).
2. Actualice `version` en `src-tauri/tauri.conf.json` (ej. `1.0.15`).
3. En la carpeta del proyecto:

```cmd
set TAURI_SIGNING_PRIVATE_KEY_PATH=%USERPROFILE%\.tauri\crozzo-pos.key
npm run tauri build
```

4. Suba a GitHub con tag:

```cmd
git tag v1.0.15
git push origin v1.0.15
```

El workflow **Tauri Release** crea el release, el `.exe` y el `latest.json` del updater.

**Importante (Windows):** el `latest.json` del release debe apuntar al **setup.exe (NSIS)**, no al `.msi`. Si apunta al MSI, el botón «Instalar» falla (bug conocido del updater Tauri). En `.github/workflows/tauri-release.yml` debe estar `updaterJsonPreferNsis: true` y en `tauri.conf.json` conviene `"targets": ["nsis"]`.

## En los clientes

### Plan A (automático — recomendado)
- **Crítica:** se instala sola en segundo plano; el usuario no ve el asistente de Windows ni pantallas de la app (solo reinicio al terminar).
- **Opcional:** el usuario elige Instalar o posponer; si acepta, progreso dentro de la app (sin wizard NSIS).
- Modo silencioso: `installMode: quiet` en `tauri.conf.json`.

### Plan B (manual — respaldo)
Si Plan A falla (sin release, red, permisos, antivirus):
1. En la pantalla de error: **Plan B manual** → **Abrir descarga** o **Copiar enlace**.
2. Ejecute el instalador descargado y cierre la app antigua por completo.
3. En **Actualizaciones del sistema** (Super Admin): tarjeta **Plan B — Respaldo manual**.

- Navegador / PWA: recarga la página (sin .exe).
