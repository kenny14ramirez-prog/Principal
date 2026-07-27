# Diagnóstico flota sede (Sprint 0)

Versión canónica repo: `releases/latest.json` + meta `crozzo-app-version` en `app/index.html` (hoy **1.0.229**).

Ejecutar en cada equipo (caja PC, tablet mesero, cocina/bar) antes de declarar sync “estable”.

## 1. Identidad

En consola DevTools / `crozzoAbrirDiagnostico()`:

| Campo | Cómo verlo | Criterio OK |
|-------|------------|-------------|
| Versión app | meta / diag | Igual en todos |
| `locationId` | Multi-device / diag | **Idéntico** (KI-010) |
| Rol MD | A = caja central, B = tablet/cocina | Solo 1 rol A por sede |
| `centralIp` | en B | IP LAN de la caja |

## 2. Latencias oro (cronómetro)

| Escenario | Acción | Meta |
|-----------|--------|------|
| WAN on | Tablet comanda → aparece en caja | &lt; 2 s |
| WAN on | Misma comanda → cocina/KDS | &lt; 3 s |
| WAN off (mismo Wi‑Fi) | Repetir | &lt; 2 s vía LAN |
| WAN off 30 s luego on | Datos recuperan | reconnect sync sin carrito fantasma |

Anotar: fecha, sede, quién, OK/fallo, tier en cada equipo (`En línea` / `Red local` / `Malla`).

## 3. Señales de cascada

| Señal | Esperado en Z0 (cajero/tablets/comandas) |
|-------|----------------------------------------|
| OpFanout | Nube **y** LAN en mutaciones |
| LAN WS | Conectado o standby vivo (no muerto) |
| Pulse | Tras pulse → **pull** en peers (KI-006) |
| Mesh | Solo listen si cloud+LAN sanos |
| Toasts flota | Sin spam en P0 |

## 4. Resultado

| Fecha | Sede | Equipos | WAN on | WAN off | Notas |
|-------|------|---------|--------|---------|-------|
|       |      |         |        |         |       |

Si falla: `npm run issues:search -- "síntoma"` + pegar tier + `locationId` + rol.

## 5. Multi-área (cocina / bar / fríos)

En cada pantalla KDS: Config comandas → pantalla fija del área (o `TODAS`).  
Verificar: comanda con `areaId=COCINA` solo en cocina; bar en bar; sin área → todas.

## 6. Capacidad LAN

El server Rust ya usa Tokio async. Si hay &gt;10 tablets con latencia alta: anotar peers WS y `pending_count` en `/status` — no asumir “sync roto” por WAN sola.
