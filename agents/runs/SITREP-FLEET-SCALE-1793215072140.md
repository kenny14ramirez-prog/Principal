# SITREP FLEET-SCALE-AUDITOR - 100 DISPOSITIVOS

**Fecha:** 2026-10-28T19:17:52.140Z

## Hallazgos

- [HIGH] **FANOUT** (app/infra/CrozzoOpFanout.js): Revisar broadcast a todos los peers vs room-based
- [MEDIUM] **ACK** (app/infra/CrozzoOpAckRegistry.js): Ver limpieza de ACKs antiguos

## Recomendaciones

1. **Room-based subscriptions** - Solo enviar a interesados
2. **Delta sync** - No enviar snapshot completo
3. **Fanout selectivo** - Evitar broadcast masivo
4. **Throttle/Backpressure** - Por dispositivo
5. **Conexión límite + queue** - En Rust server

