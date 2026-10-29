# RUNBOOK — P0-11 OTA (actualización automática)

**Fecha:** 2026-10-29 · **Rama:** wip/macro-20261029

## Verificación local (completada ✅)

- Clave privada: `%USERPROFILE%\.tauri\crozzo-pos.key` (existe).
- Clave pública: `%USERPROFILE%\.tauri\crozzo-pos.key.pub` = `A0EE9D152E5A3C9E` (coincide con `tauri.conf.json` pubkey embebida).
- Firma de prueba: `npm run tauri -- signer sign --private-key <base64> --password= test_ota.txt` → `.sig` generado con key id `A0EE9D152E5A3C9E` ✅.
- `cargo check` OK. Toolchain Rust instalado.

## Pasos para el usuario (GitHub)

### 1. Configurar secreto TAURI_SIGNING_PRIVATE_KEY
1. GitHub → repo `Principal` → Settings → Secrets and variables → Actions → New repository secret.
2. Name: `TAURI_SIGNING_PRIVATE_KEY`.
3. Value: contenido completo de `%USERPROFILE%\.tauri\crozzo-pos.key` (el archivo .key, que es base64).
4. Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: dejar vacío (la clave se firmó con `-p ""`).

### 2. Verificar .gitignore
Confirmar que `*.key` y `.tauri/` están en `.gitignore` (no subir la privada al repo).

### 3. Publicar release
```bash
git tag v1.0.232
git push origin v1.0.232
```
El workflow `Tauri Release` se dispara y firma con la clave `A0EE`.

### 4. Verificar el release
- En GitHub Releases → tag `v1.0.232` → verificar que existe `latest.json` (Windows NSIS) con `platforms["windows-x86_64-nsis"].signature`.
- Verificar que el key id del `.sig` sea `A0EE9D152E5A3C9E`.
- Script: `node scripts/verify-release-updater-json.mjs v1.0.232`.

### 5. Prueba de aceptación (VM limpia)
1. Instalar versión actual (con pubkey `A0EE`).
2. Ejecutar `plugin:updater|check` → debe devolver metadata sin error de firma.
3. Descargar/instalar → confirmar que la nueva versión abre.
4. Ejecutar `check` de nuevo → debe devolver `null` (ya actualizado).

### 6. Si falla
- Plan B/C: descarga manual del `setup.exe` del release.
- Revisar secreto/password en GitHub.
- Verificar que el workflow usó la clave correcta (log de CI).

## Rotación futura (solo si se sospecha compromiso)
1. Generar nueva pareja: `npm run tauri signer generate -- -w ~/.tauri/nueva.key`.
2. Poner `.pub` (base64) en `tauri.conf.json` → `plugins.updater.pubkey`.
3. **Bridge obligatorio**: publicar release intermedio firmado con clave vieja (`A0EE`) cuya app nueva ya embeba la pubkey nueva.
4. Si se pierde la privada vieja → reinstalación manual equipo por equipo.

## Riesgos
- Secreto mal pegado → build falla o firma con otra clave.
- Release publicado sin verificación → `installMode: quiet` instala en toda la flota.
- Versiones mezcladas en campo → actualizarán en cascada.
- Sin rollback/downgrade en updater.

## Back up
- Respaldar `%USERPROFILE%\.tauri\crozzo-pos.key` cifrado (si se pierde, bloqueo total del canal OTA).

## Memoria persistente
- Synapse: memoria "P0-11 OTA" activa. Este runbook documenta los pasos.