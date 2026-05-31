# Actualización automática del instalador (.exe)

## Dos canales

| Canal | Archivo | Dónde | Qué hace |
|-------|---------|-------|----------|
| **OTA (avisos)** | `registry.json`, `latest.json` | Rama `main` en GitHub | Franja / modal crítica u opcional |
| **Tauri (programa)** | `latest.json` (del **Release**, no de main) | **GitHub Release** (tag `v*`) | Descarga e instala el `.exe` al pulsar **Instalar** |

No se pisan: el OTA vive en `main` (`registry.json`); el updater usa el `latest.json` adjunto al release (formato Tauri con `platforms` y firmas).

### Entradas en `registry.json`

| Campo | Crítica | Opcional |
|-------|---------|----------|
| `type` | `"critical"` | `"optional"` (o omitir) |
| `installMode` | `"auto"` (alternativa) | no usar `"auto"` |
| Comportamiento cliente | Instala y registra sola | Franja: el usuario elige instalar, posponer u ocultar |

Ejemplo opcional:

```json
{
  "id": "1.0.31-optional",
  "version": "v1.0.31",
  "semver": "1.0.31",
  "type": "optional",
  "message": "Mejoras de rendimiento",
  "publishedAt": "2026-05-30T12:00:00.000Z",
  "changelog": ["Comandas más rápidas", "Correcciones menores"]
}
```

## Primera vez (firma)

1. Ejecute **`Generar claves firma Tauri.bat`** (crea claves en `%USERPROFILE%\.tauri\crozzo-pos.key`).
2. En GitHub → repo **Principal** → Settings → Secrets → Actions:
   - `TAURI_SIGNING_PRIVATE_KEY`: contenido del archivo `.key` (texto completo).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: vacío si no puso contraseña.

La clave pública ya está en `src-tauri/tauri.conf.json`. **No suba el archivo `.key` al repo.**

## Publicar un instalador nuevo

**Plataformas incluidas en cada tag `vX.Y.Z`:**

| Cliente | Artefacto | Actualización |
|---------|-----------|---------------|
| Windows PC | `Proyecto_*_x64-setup.exe` | Tauri updater (Plan A) + Plan C silencioso |
| Mac (Apple Silicon / Intel) | `.dmg` por arquitectura | Tauri updater (Plan A) |
| Android (tablets) | `.apk` ARM64 | Descargar del release e instalar (sideload / MDM) |
| Tablet / navegador | HTML servido desde su servidor | OTA `registry.json` → **recarga** la página |

**Workflow GitHub:** al subir tag `vX.Y.Z` corren **4 jobs** (Windows + Mac ARM + Mac Intel + **Android APK**) en un mismo release.

No debe existir `release.yml` duplicado (evita sobrescribir `latest.json`).

**Importante:** subir solo `releases/latest.json` a `main` muestra el aviso OTA, pero **no cambia el binario** hasta que exista el **Release** con tag `vX.Y.Z`.

1. Sincronice frontend (`Sincronizar frontend.bat` o `npm run sync`).
2. Actualice `version` en `src-tauri/tauri.conf.json` (ej. `1.0.15`).
3. En la carpeta del proyecto:

```cmd
set TAURI_SIGNING_PRIVATE_KEY_PATH=%USERPROFILE%\.tauri\crozzo-pos.key
npm run tauri build
```

En Mac local: `npm run tauri build -- --target aarch64-apple-darwin`

En Android local (requiere Android SDK + NDK): `npx tauri android init --ci` y luego `npm run tauri android build -- --apk --target aarch64-linux-android`

4. Suba a GitHub con tag:

```cmd
git tag v1.0.15
git push origin v1.0.15
```

El workflow **Tauri Release** crea el release con `.exe`, `.dmg` (×2) y `.apk`, más `latest.json` del updater (Windows + macOS).

**Tablets Android (app nativa):** instale el `.apk` del release de GitHub. **Tablets en navegador:** despliegue `src/` en su servidor; OTA vía `registry.json` recarga la interfaz.

**Importante (Windows):** el `latest.json` del release debe apuntar al **setup.exe (NSIS)**, no al `.msi`. En el workflow: `updaterJsonPreferNsis: true` y `"targets": ["nsis", "dmg"]`.

## En los clientes

### Plan A (automático — recomendado)
- **Crítica** (`type: "critical"` o `installMode: "auto"` en `registry.json`): se instala sola en segundo plano, se registra en el historial local y reinicia al terminar. **Espera a que no haya venta en curso** (carrito con ítems o modal de cobro abierto) antes de descargar/instalar/reiniciar.
- **Opcional** (`type: "optional"` o sin `installMode: "auto"`): franja superior con **Instalar ahora**, **Instalar después** (pospone ~6 h) o **×** (oculta hasta restablecer avisos). Si el usuario acepta instalar, también espera caja libre antes del reinicio.
- Modo silencioso: `installMode: quiet` en `tauri.conf.json`.
- Si Plan A falla por firma u otro error, **Plan C** descarga el `setup.exe` del release y lo ejecuta con `/S` (sin pasos manuales).
- Si el release aún no existe, la app **espera** a que termine GitHub Actions (hasta ~20 min) antes de instalar.

### Error «signature was created with a different key»
Significa que el **.exe instalado** espera una clave pública y el **release en GitHub** fue firmado con otra clave privada.

1. En su PC: `node scripts/verify-signing-key.mjs` (debe decir OK).
2. En GitHub → **Principal** → Settings → Secrets → `TAURI_SIGNING_PRIVATE_KEY`: pegue el **contenido completo** de `%USERPROFILE%\.tauri\crozzo-pos.key` (la misma que generó la pubkey de `tauri.conf.json`).
3. Vuelva a publicar un tag (`v1.0.30`…) para recompilar con la clave correcta.
4. Mientras tanto, en el cliente: **Plan B manual** → descargar `Proyecto_X.Y.Z_x64-setup.exe` e instalar (no usa el updater firmado).

La app intenta **Plan C** automáticamente (descarga `setup.exe` e instala en silencio) cuando falla la firma o la red del Plan A.

### Cadena automática (cliente)

| Plan | Qué hace | Cuándo |
|------|----------|--------|
| **A** | Updater Tauri firmado (`latest.json` del release) | Primero |
| **C** | Descarga `Proyecto_X.Y.Z_x64-setup.exe` + `/S` silencioso | Si A falla (firma, red, timeout) |
| **B** | Enlace manual en pantalla / Super Admin | Si C también falla |

Reintentos: descarga Plan A (3×), Plan C (3×), críticas fallidas (cada ~10 min en segundo plano).

### Diagnóstico en el cliente

Super Admin → **Actualizaciones del sistema** → **Diagnosticar cadena**. Comprueba release en GitHub, URL del `.exe` y updater firmado. El historial local guarda el resultado.

### Fallos frecuentes

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| «Archivo demasiado pequeño» | Release aún compilando, o enlace roto | Espere GitHub Actions; verifique tag `vX.Y.Z` |
| «signature different key» | Clave GitHub ≠ pubkey del .exe instalado | Re-secreto + nuevo tag |
| «No hay setup.exe» | Solo hay MSI o release incompleto | `updaterJsonPreferNsis: true`, `targets: ["nsis"]` |
| Aviso OTA pero no instala | Solo `registry.json` en main, sin release | `git push origin vX.Y.Z` |
| Plan C no existe | .exe antiguo sin comando Rust | Una instalación manual; luego automático |

### Plan B (manual — respaldo)
Si Plan A falla (sin release, red, permisos, antivirus, firma):
1. En la pantalla de error: **Plan B manual** → **Abrir descarga** o **Copiar enlace**.
2. Ejecute el instalador descargado y cierre la app antigua por completo.
3. En **Actualizaciones del sistema** (Super Admin): tarjeta **Plan B — Respaldo manual**.

- Navegador / PWA: recarga la página (sin .exe).
