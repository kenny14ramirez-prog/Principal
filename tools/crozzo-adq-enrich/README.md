# Crozzo POS — enriquecimiento FE en fondo (RUES + Scrapling + Obscura opcional)

Servicio local **solo loopback** `127.0.0.1:18765`.

## Arranque

```powershell
cd tools/crozzo-adq-enrich
.\start.ps1
```

Con Obscura (piloto; default off):

```powershell
$env:CROZZO_OBSCURA = "1"
.\start.ps1
```

Binario (no va al git): descargar `obscura-x86_64-windows.zip` desde
[releases de Obscura](https://github.com/h4ckf0r0day/obscura/releases) y dejar
`obscura.exe` + `obscura-worker.exe` en `tools/crozzo-adq-enrich/bin/`.
Opcional: `CROZZO_OBSCURA_PATH` apunta al exe.

## API

- `GET /health` → `{ ok, obscura: { enabled, bin } }`
- `GET /stats` → contadores piloto (`enrich_ok`, `timeouts`, `engine_*`, `hop_ok`)
- `POST /enrich` `{ "nit": "900319753", "nombre_hint": "..." }` → contacto + `engine` + `source`

Orden de fetch HTML: **Scrapling → urllib → Obscura** (solo si `CROZZO_OBSCURA=1` y binario presente).
Si el SERP no trae contacto, hace **1 hop** a un link corporativo público (no DIAN/RUES auth).

## Límites

- No scrapea portales DIAN autenticados.
- El POS no depende de este proceso: si está caído, solo no enriquece.
- Spike 2026-07: Obscura no ganó a urllib en DDG sin proxy → flag **default off**. Activar solo en piloto si hay bot-check real.

## Piloto (Fase 3)

```powershell
$env:CROZZO_OBSCURA = "1"
.\start.ps1
# otra terminal:
.\.venv\Scripts\python.exe piloto_metrics.py
```

Comparar `/stats` y `piloto_metrics.json`. Si timeouts > ~20% o no mejora email/tel → `CROZZO_OBSCURA=0`.
