# Reporte Validación — Mesa/Slot/Comandas/Impresión

Directorio: C:\proyectos\sistema pos
Fecha: 2026-11-13

## 1. slot-presence-merge — OK
Exit: 0
Últimas líneas:
```
17/17 checks
```

## 2. mesa-ui-remote — OK
Exit: 0
Últimas líneas:
```
0 fallos — mesa-ui-remote-check OK
```

## 3. kiosk-comanda-ui-refresh — OK
Exit: 0
Últimas líneas:
```
All kiosk comanda UI refresh checks passed.
```

## 4. cierre-flow — OK
Exit: 0
Últimas líneas:
```
OK cierre de caja
{ ... mananaClosed: "closed", tardeOpen: "open", modalHidden: true, pillManana: "Cerrado" }
```

## 5. cierre-print — OK
Exit: 0
Últimas líneas:
```
OK cierre print checks
{ errors: [], keyOld: "TRN-OLD|...", oldShift: "Tarde", prepTotalReal: 125000, oldActual: 125000 }
```

## 6. print-queue — OK
Exit: 0
Últimas líneas:
```
Todo OK
```

## 7. printer-emulator — OK
Exit: 0
Últimas líneas:
```
4/4 OK
```

## 8. tablet-qr-parity — OK
Exit: 0
Últimas líneas:
```
{ RESULTADO: "OK — mismo código BOF en ambos caminos", length: 690, prefix: "BOF.eyJ2Ijo1" }
```

## 9. tablet-qr-quick — FAIL
Exit: 1
Últimas líneas:
```
FAIL: no se encontró revealQrNode
```

## 10. pairing-flow — FAIL
Exit: 1
Últimas líneas:
```
page.goto: Timeout 90000ms exceeded.
navigating to "http://127.0.0.1:65105/index.html", waiting until "networkidle"
Node.js v24.20.0
```

## 11. pairing-livecam — OK con error menor
Exit: 0
Últimas líneas:
```
ok: true, steps: 6/6 ok
errors: ["Cannot read properties of null (reading 'classList')"]
```

## 12. lan-cascade — OK
Exit: 0
Últimas líneas:
```
10/10 checks
```

## 13. lan-mdns-ws — OK
Exit: 0
Últimas líneas:
```
LAN-MDNS-WS CHECK: OK
```

## Resumen
- Total: 13 checks
- OK: 11
- FAIL: 2 (tablet-qr-quick, pairing-flow)
- OK con error menor: 1 (pairing-livecam)

REPORTE ESCRITO