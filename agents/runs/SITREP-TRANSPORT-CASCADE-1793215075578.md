# SITREP TRANSPORT-CASCADE-AUDITOR

**Fecha:** 2026-10-28T19:17:55.578Z

## Hallazgos

- [INFO] (app/infra/CrozzoConnectivityOrchestrator.js): Menciona hotspot/AP
- [INFO] (app/infra/CrozzoWifiDirectBridge.js): WifiDirectBridge existe
- [INFO] (app/infra/CrozzoBleMesh.js): BleMesh existe - evaluar para pedidos mínimos

## Cascada Deseada vs Actual

1. DB/Cloud -> OK
2. LAN Router -> OK (LanOpsSync)
3. Hotspot directo desde Caja -> Verificar
4. BLE Mesh -> Existe pero integrar en cascada
5. QR/Outbox -> Existe pero formalizar

