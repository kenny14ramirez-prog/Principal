# SITREP HYBRID-FORENSIC - Caja<->Tablets

**Agente:** HYBRID-FORENSIC  
**Fecha:** 2026-10-28T18:52:08.797Z  
**Modo:** SOLO LECTURA

## Hallazgos

- [INFO] **FLAP_CONTROL** (app/infra/CrozzoConnectivityOrchestrator.js): Tiene controles anti-flap
- [CRITICAL] **FANOUT_CORE** (app/infra/CrozzoOpFanout.js): Fanout hibrido Z0 - INTANGIBLE
- [HIGH] **WS_TRANSPORT** (app/infra/CrozzoLanOpsSync.js): Usa WebSocket + poll fallback
- [CRITICAL] **ACK_REGISTRY** (app/infra/CrozzoOpAckRegistry.js): ACK/idempotencia - INTANGIBLE
- [HIGH] **RUNTIME_MERGE_GUARDED** (app/modules/CrozzoPosRuntimeCloud.js): Tiene proteccion skipCartReconcile (correcto segun invariantes)

## Conclusión

Cadena híbrida es compleja pero mayormente bien protegida por invariantes. Mayor riesgo: timing/race conditions entre transports, no lógica errónea.

**Recomendación:** Investigar flap events en runtime, solapamiento WS+poll, y timing de ACKs.
