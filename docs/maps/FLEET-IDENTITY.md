# Identidad y descubrimiento de flota

Fecha: 2026-07-14 · ADR: D-011, D-012

## Problema

Las vías (cloud, LAN WS/HTTP, gossip, BLE) no sirven si los equipos no saben **quién** es del mismo sistema ni **por dónde** alcanzarlo. El fallo “no se comunican” suele ser **roster incompleto**, no falta de WebSocket.

## Carnet canónico (`identity_card` v3)

Publicado por `CrozzoPeerDirectory.buildIdentityCard()` / `announceIdentity()`:

| Campo | Significado |
|-------|-------------|
| `deviceId` | Identidad estable del equipo |
| `businessId` + `locationId` | Mismo sistema / sede (filtro duro) |
| `role` | A = caja, B = tablet/pantalla |
| `name` | Nombre humano |
| `lanIp` | IP propia en Wi‑Fi (Rol B **nunca** usa `centralIp` como propia — D-011) |
| `centralIp` | IP de la caja ancla |
| `transports` | `{ cloud, lanHttp, lanWs, gossip, ble, wifiDirect, pathLabel }` |
| `btId` | Opcional BLE |

## Cuándo se anuncia

1. **Post-QR** (`crozzoPairingApplyLanFromPayload`) — force + ingest `fleet_peers` del QR + issuer caja  
2. **Boot** (`PeerDirectory.afterMainInit` ~2.8s)  
3. **`crozzo-lan-up` / silencio ancla** — invalida cache IP + re-anuncio  
4. **Diag Reparar** — `announceIdentity({ force, pull })` + `rediscoverCentral` (Rol B)  
5. **PostPair / AutoConnect** — si `peerCount ≤ 1` tras stack de conectividad  
6. **Soft-heal** (Rol B, flota `solo_este_equipo`, 1×/min) — announce → rediscover → Director (**sin** reconcile operativo)

Canales: nube (`peer-roster-{locationId}`) + LAN `type:identity_card` + gossip `IDENTITY`/`HELLO` + BLE profile.

## Eco de roster (D-012)

Cuando la **caja (Rol A)** ingiere un `identity_card` (WS o HTTP):

1. Ingest del peer en PeerDirectory  
2. Responde **una vez** (throttle ~12s por `deviceId`) con `type: fleet_roster` = self + `peersForQrHint(12)`  
3. Tablets ingieren la lista con `ingestFleetRoster`

Así una tablet nueva post-QR, sin nube, conoce otras tablets que la caja ya vio (patrón hub relay-peers). Rust no upserta `fleet_roster` / `identity_card` como comanda.

## Sede divergente

Si un peer se descarta por `locationId` distinta → contador `getSedeMismatchCount()` + fila warn en diag Comunicación. **No** se mezclan sedes (KI-010).

## QR

`CrozzoPairingSeal.buildFastQrText` incluye `fp[]` (hasta 5 peers: `d,n,r,ip`) para sembrar el directorio del nuevo equipo.

## Fuente de verdad

`CrozzoPeerDirectory` (local) + espejo `company_config` `peer-roster-{locationId}`.  
BLE registry / InternalQr siguen siendo caches de dominio, no un segundo roster.

## Diag

- Fila **Flota conocida (identidad)** — `crozzoFleetSnapshot()`  
- Fila **Sede divergente** si hay mismatches  
- **Reparar** → anuncio forzado + rediscover  
- API: `crozzoAnnounceFleetIdentity({ force: true })`
