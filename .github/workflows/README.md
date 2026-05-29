# Workflows GitHub Actions

## Tauri Release (`tauri-release.yml`)

**Único** workflow que debe ejecutarse al subir un tag `v*`.

- Compila el instalador Windows (NSIS)
- Publica el release en GitHub
- Genera `latest.json` del **updater Tauri** (formato con `platforms` y firmas)

## OTA (avisos en la app)

Los archivos `releases/latest.json` y `releases/registry.json` en la rama **main** los sube el script local:

- `scripts/herramientas/publicar-actualizacion-auto.bat`
- `scripts/_git-push-latest.bat`

**No** subir el `latest.json` OTA al asset del release: tiene formato distinto y rompe la auto-actualización.

## Eliminado: `release.yml` (Publicar Crozzo POS)

Era un duplicado que compilaba dos veces y podía sobrescribir `latest.json` del release con el formato OTA.
