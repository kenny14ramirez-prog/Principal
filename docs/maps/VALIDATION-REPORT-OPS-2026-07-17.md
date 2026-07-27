# Reporte de validación + INTEL — Ops Superior

**Fecha:** 2026-07-17 · **OTA:** v1.0.230 · **Branch:** `task/-20260706-1846`  
**Doctrina:** [OPS-COMMAND-CENTER.md](OPS-COMMAND-CENTER.md) · Plan: [MEJORA-SUPERIOR-MERCADO-CO-PLAN.md](MEJORA-SUPERIOR-MERCADO-CO-PLAN.md)

---

## 0. Veredicto ejecutivo

| Capa | Resultado |
|------|-----------|
| **Pruebas automáticas (clinical / mind)** | **PASS** |
| **Listo para declarar H0 sede cerrado** | **FAIL** (falta QA humana + drills campo) |
| **Listo para demo fiscal DIAN one-shot** | **FAIL** (`dataicoStamp` stub) |
| **Listo para cobro digital conciliable** | **FAIL** (UI sí, pasarela no) |
| **Arquitectura sync vs industria** | **PASS parcial** (outbox/LWW/WS/mesh fuertes; CRDT no — y no es urgente) |

**Conclusión:** El laboratorio (código + clinical) **pasa**. El producto de mercado Colombia **aún no**. Siguiente batalla = campo + fiscal real + un pago (Wompi/Nequi).

---

## 1. Resultados de pruebas

### 1.1 Mind stack

| Check | Resultado |
|-------|-----------|
| Synapse venv + DB | OK |
| mcp-code-context | OK |
| codebase-memory / grafo | OK |
| MCP launchers + mcp.json | OK |
| hooks stack | OK |
| Ollama + embeddings (sesión previa) | OK |

### 1.2 `npm run test:sync-clinical`

| Suite | Checks | Resultado |
|-------|--------|-----------|
| Equilibrio conectividad | 13 | Todo OK |
| LAN ops sync | (incluido) | OK |
| Operative journal | (incluido) | OK |
| Fleet coordination | 30 | Todo OK |
| Op-fanout ACK | 20 | Todo OK |
| Standby LAN | 8 | Todo OK |
| **Exit code** | | **0 PASS** |

### 1.3 Known issues

| Métrica | Valor |
|---------|-------|
| Total KI | 34 |
| Resolved | 24 |
| Watch | 10 |
| Open | 0 |
| Critical no-resolved | **KI-002** (watch = git stale) |

Watch relevantes a sede: KI-010 (locationId), KI-019 (reservorio/mesas), KI-009 (fanout LAN-only), KI-014 (permiso en transporte).

### 1.4 Git / frescura

| Ítem | Valor |
|------|-------|
| vs `origin/main` | **7 behind / 2 ahead** |
| Riesgo | KI-002 activo — demo sede sobre código desalineado |

### 1.5 Pruebas que NO se corrieron (límites)

- QA tienda multi-dispositivo en sede física  
- Timbre DIAN real / habilitación proveedor  
- Sandbox Nequi/Wompi  
- APK en dispositivos piloto  

---

## 2. INTEL externo (4 ejes) vs Crozzo

### 2.1 Técnicas (arquitectura)

| Técnica industria | Fuente | Crozzo hoy | Gap / mejora |
|-------------------|--------|------------|--------------|
| Offline-first + outbox durable | SaleFlex, Educba, microservices.io | Outbox comandas + standby + OpAck | Mantener; auditar estados Pending/In-Flight/Synced en UI encargado |
| Idempotency keys | ApexEdge / Stripe pattern | OpAck + dedup LAN | Extender idempotency a cobro/FE cuando haya pasarela |
| LWW / field-level merge | Lithium CRDT blog, Voxire | LWW por `_slotUpdatedAt` (ADR D-002) | Suficiente para mesas; no CRDT aún |
| CRDT full (Yjs/Automerge/Lithium) | Otter/Atoms, TENJIN, GhostNode | **No** | **No adoptar ahora** — ADR: LWW+OpAck basta; CRDT = H4 si tablets low-end fallan |
| Temp→permanent checkout | SaleFlex | Cobro/factura local | Formalizar “borrador cobro” vs “factura sellada” al meter FE real |
| Path health / anti-solape poll-WS | — | COMM-CASCADE hecho | Exponer solo a encargado |

### 2.2 Sistemas POS (Colombia + ref.)

| Sistema | Gana en | Pierde vs Crozzo | Lección |
|---------|---------|------------------|---------|
| **Alegra** | FE/DIAN, time-to-value, Wompi/Nequi | Offline flota/KDS profundos | One-shot fiscal + pago automático |
| **Siigo Gastrobar** | Contabilidad + DIAN marca | Flota híbrida | Export contable / conector |
| **Loggro Restobar** | Ops maduro, Wompi/Credibanco/PayU | Mesh offline Crozzo | Producto “aburrido” estable |
| **Gestro** | Multi-KDS, Bridge LAN print, DEE Taxxa, menú QR, cierre ciego | Backoffice food-cost Crozzo | Impresión LAN + DIAN nativo + QR menú |
| **Fudo** | Delivery aggregators | Presencial CO | 1 aggregator después H0 |
| Otter/TENJIN (intl) | CRDT edge | No DIAN CO | Inspiración sync, no copiar stack |

### 2.3 Protocolos / integraciones

| Protocolo | Uso mercado | Crozzo | Acción |
|-----------|-------------|--------|--------|
| WebSocket sede | KDS/rooms (KitchenAsty, Gestro) | LAN WS + HTTP + fanout | Mantener; rooms por área = mejora H3 |
| DEE POS / FE DIAN (Res. 000165) | Obligatorio CO | Stub Dataico | **P0 fiscal** |
| Nequi API QR/push | Directo o vía Wompi | Solo UI label | Elegir: **Wompi** (multipago Nequi+PSE+QR Bancolombia) vs Nequi puro |
| Wompi REST `/transactions` | Alegra/Loggro path | Ausente | **COA-PAY preferida actualizada:** Wompi como fachada (menos certs) |
| Taxxa (Gestro) | Habilitador FE | Dataico dock | Evaluar Taxxa vs Dataico real en H1-D1 |
| mDNS / BLE / Wi‑Fi Direct | Raro en SaaS CO | Crozzo tiene | Diferenciador — no apagar |

### 2.4 Ideas accionables (priorizadas)

1. **Wompi en Cobrar** (Nequi + QR Bancolombia + PSE) — mismo patrón Alegra; conciliación automática.  
2. **Reemplazar stub `dataicoStamp`** por habilitador real + cola si DIAN cae.  
3. **Gestro Bridge equivalente:** impresión LAN ya hay — empaquetar como “siempre cocina aunque caiga nube”.  
4. **Cierre a ciegas** (Gestro/Loggro) en H2.  
5. **Menú QR** pedido → comanda Z0 (H2.6).  
6. **Idempotency en pagos** antes de reintentos.  
7. **No CRDT** hasta evidencia de fallo LWW en piloto.  
8. **Gemelo turno** (path health + aging comandas) como producto encargado.

---

## 3. Scorecard validación vs auditoría

| Dimensión | Score auditoría | ¿Pasan pruebas lab? | ¿Pasa mercado? |
|-----------|-----------------|---------------------|----------------|
| Offline CO | 5 | Sí (clinical + infra) | Parcial (falta sede) |
| Ops restaurante | 4 | Sí (ROLE-OPS código) | Parcial (falta sede) |
| DIAN / FE | 3 | No (stub) | No |
| Pagos | 1 | No | No |
| UX madurez | 2 | N/A lab | No medido sede |
| Mantenibilidad | 1 | Clinical sí; monolito sigue | Deuda abierta |

---

## 4. Plan de mejora residual (post-validación)

Nombre corto: **PLAN-R1** — *Cerrar el laboratorio → abrir el mercado*.

| # | Entrega | Por qué (INTEL) | Gate | Horizonte |
|---|---------|-----------------|------|-----------|
| R1.1 | Alinear git (0 behind) | KI-002 | OK dueño | H0 |
| R1.2 | QA sede + drills §9 | Industria: fallo = reconexión | Checklist firmado | H0 |
| R1.3 | Fixes 1×1 de fallos sede | No batch | Clinical tras cada fix | H0 |
| R1.4 | Timbre real (Dataico/Taxxa) en Cobrar | Res. 000165 / Gestro Taxxa | CUIDE/CUFE real | H1 |
| R1.5 | Wompi v1 (Nequi+QR) en Cobrar | Alegra/Loggro path | getStatus + conciliación día | H1 |
| R1.6 | Idempotency keys en pago/FE | Outbox industry | Sin doble cobro en retry | H1 |
| R1.7 | Cierre ciego + export contable | Gestro/Siigo | Encargado cierra sin Excel | H2 |
| R1.8 | Menú QR → comanda | Gestro/Fudo | 1 canal propio | H2 |
| R1.9 | Slice PosMain cobro/DIAN | Deuda 1/5 | Clinical + sin cambio comportamiento | H2 |
| R1.10 | CRDT / rooms KDS | Otter/KitchenAsty | Solo si LWW falla en piloto | H3/H4 |

**Kill criteria R1:** no empezar R1.4–R1.5 si R1.2 no está verde.

---

## 5. Respuesta directa a “¿ya quedó o vas a iniciar?”

| Pregunta | Respuesta |
|----------|-----------|
| ¿Terminó el montaje ops + plan? | **Sí** — Command Center + plan H0–H4 + progress JSON |
| ¿Inicia implementación fiscal/pagos ahora? | **No** hasta R1.1–R1.2 (git + sede) |
| ¿Pasaron las pruebas de validación lab? | **Sí — PASS** (`mind:health` + `test:sync-clinical`) |
| ¿Pasó validación de producto mercado? | **No — FAIL** (campo + DIAN real + pago) |
| ¿Hay otro plan? | **Sí — PLAN-R1** (§4 de este documento) |

---

## 6. Próximo paso único (orden)

1. Dueño: **OK git align** + fecha sede.  
2. Campo: checklist + drills.  
3. Dev: R1.3 fixes.  
4. Paralelo diseño: elegir **Wompi vs Nequi directo** y **Dataico vs Taxxa**.

Sin eso, cualquier “mejora wow” es teatro.
