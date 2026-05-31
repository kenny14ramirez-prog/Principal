# Workflows GitHub Actions

## Tauri Release (`tauri-release.yml`)

**Único** workflow que debe ejecutarse al subir un tag `v*`.

- Compila **Windows** (NSIS `.exe`), **macOS** (`.dmg` ×2) y **Android** (`.apk` ARM64 para tablets)
- Publica un **único** release en GitHub con todos los instaladores
- Genera `latest.json` del **updater Tauri** (Windows + Mac; Android se publica como `.apk` en assets)

**Tablets:** instale el `.apk` del release, o use el navegador con OTA `registry.json` (recarga automática).

## OTA (avisos en la app)

Los archivos `releases/latest.json` y `releases/registry.json` en la rama **main** los sube el script local:

- `scripts/herramientas/publicar-actualizacion-auto.bat`
- `scripts/_git-push-latest.bat`

**No** subir el `latest.json` OTA al asset del release: tiene formato distinto y rompe la auto-actualización.

## Eliminado: `release.yml` (Publicar Crozzo POS)

Era un duplicado que compilaba dos veces y podía sobrescribir `latest.json` del release con el formato OTA.
