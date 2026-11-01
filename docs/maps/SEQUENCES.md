# Secuencias críticas — Crozzo POS (auto-generado / manual)

> Secuencias de flujos críticos. Auto-generar desde `trace_path` del grafo cuando esté disponible. Actualizar manualmente hasta entonces.

## 1. Venta mesa → cocina → cobro

```mermaid
sequenceDiagram
  participant M as Mesa (tablet)
  participant C as Cocina (KDS)
  participant J as Caja
  M->>M: agregar items al carrito
  M->>C: enviar comanda (fanout LAN + nube)
  C->>C: preparar (LISTO)
  C->>M: notificación LISTO (LAN pulse)
  M->>J: cerrar cuenta
  J->>J: cobro + cierre de mesa
```

## 2. Sync runtime (nube ↔ LAN)

```mermaid
sequenceDiagram
  participant A as Dispositivo A
  participant L as LAN Sync Server
  participant N as Supabase (nube)
  A->>L: POST /api/sync (runtime)
  L->>L: persistir pending
  L->>N: drain (si cloud reachable)
  N-->>L: ACK
  L->>A: OK + nextSeq
  L->>L: broadcast lan_ops_pulse (WS)
```

## 3. Comanda cloud sync

```mermaid
sequenceDiagram
  participant D as Dispositivo
  participant CC as CrozzoComandasCloudSync
  participant RT as Runtime Cloud
  D->>CC: enviar comanda
  CC->>RT: upsert comanda
  RT->>CC: confirmación
  CC->>D: status OK
```

## 4. Fanout híbrido (Z0)

```mermaid
sequenceDiagram
  participant O as CrozzoOpFanout
  participant L as LAN
  participant N as Nube
  O->>L: push (Z0)
  O->>N: push (Z0)
  L-->>O: ACK
  N-->>O: ACK
  O->>O: marcar synced
```

## Notas
- Generar automáticamente con `npm run graph:search -- --name_pattern ".*"` + trace_path cuando codebase-memory esté indexado para todo el stack.
- Actualizar manualmente si cambia un flujo crítico.
- Referenciado por `docs/maps/INDEX.md`.
