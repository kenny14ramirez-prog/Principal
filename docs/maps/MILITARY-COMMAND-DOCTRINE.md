# Doctrina de mando — Crozzo como armamento de sede

**Vigencia:** 2026-07-17 · **Barra:** calidad mission-critical / DDIL · **OTA:** v1.0.230  
**Ops:** [OPS-COMMAND-CENTER.md](OPS-COMMAND-CENTER.md) · Scorecard: `crozzoCommandScorecard()` · Seal: `crozzoSedeReadiness()`

---

## 1. Premisa (no negociable)

Crozzo **no se mide** como “otro POS de Colombia”.  
Se mide como **sistema de borde mission-critical**: potente, robusto, confiable bajo red degradada (DDIL).

| Principio | Regla |
|-----------|--------|
| Offline-first | La sede cobra/comanda/imprime sin nube |
| Honestidad de combate | Nunca CUFE/pago falso; estados `pendiente_*` |
| Redundancia | LAN WS → HTTP → mesh → nube |
| Idempotencia | OpAck + digital pay keys |
| Observabilidad | Seal DEFCON + scorecard en diag (sin banners P0) |
| Verificación | `mind:health` + `test:sync-clinical` + `test:sede-combat` + QA sede |

**Sensación objetivo:** infinitamente más potente que Alegra/Gestro/Loggro — **otra categoría**, no “similar”.

---

## 2. INTEL mercado CO (adversarios)

| Sistema | Arma principal | Techo / flanco |
|---------|----------------|----------------|
| **Alegra** | FE + TTV + Wompi | Offline superficial |
| **Siigo Gastrobar** | Contable + DIAN marca | Flota híbrida débil |
| **Loggro** | Marca restobar + Rappi + soporte | Precio/complejidad; cloud |
| **Gestro** | Multi-KDS + Bridge LAN print + Taxxa + QR + cierre ciego | Menos food-cost/flota mesh |
| **Fudo / Vendty** | Delivery / precio | Ops presencial menos profunda |

### Alternativas evaluadas (mando)

| Decisión | COA A | COA B | Elección doctrina |
|----------|-------|-------|-------------------|
| Habilitador FE | Dataico (ya dock) | Taxxa (vía Gestro) | **Dataico real + cola**; Taxxa como plan B si piloto lo exige |
| Pago digital | Nequi API directa | **Wompi** (Nequi+PSE+QR) | **Wompi** (menos certs, multipago) |
| Sync conflictos | CRDT (Otter/Yjs) | **LWW + OpAck** | Mantener LWW hasta fallo real en piloto |
| Print LAN | Bridge tipo Gestro | Tauri + auto-print actual | **Ya tenemos** print LAN/Tauri — empaquetar narrativa “Bridge Crozzo” |

---

## 3. Superioridad (dónde debemos aplastar)

| Dimensión | Peso | Crozzo arma | Vs mercado |
|-----------|------|-------------|------------|
| Flota offline multi-radio | ×2.5 | WS/HTTP/gossip/BLE/Wi‑Fi Direct + seal | **Ventaja asimétrica** |
| Ops sala Z0 | ×2 | Mesas/KDS/roles/reservorio | Empate alto / ventaja profundidad |
| Fiscal honesto | ×2 | Dataico real + outbox drain | Cerrar one-shot vs Alegra |
| Pago digital | ×1.5 | Conduit + idempotency | Cerrar Wompi keys |
| Food-cost | ×1.5 | Compras/OCR/matriz | **Ventaja** vs Gestro/Alegra |
| TTV / UX | ×1 | BONA + silencio P0 | **Cerrar** vs Alegra |
| Delivery | ×0.8 | — | Después de H0/H1 |

Consola de mando: `crozzoCommandScorecard()` → `verdict` + deltas vs Gestro/Alegra.

---

## 4. Ciclo de verificación (cada oleada)

```text
1 OBSERVE  mind:health · issues:search · scorecard · seal · tesis del síntoma
2 ORIENT   ¿rezago DIAN/pay/TTV o ventaja flota? · 2 COA máx
3 DECIDE   Plan visible al mando (archivos, pasos, criterio PASS)
4 ACT      edit:scope · app/ · sync · clinical+combat · pie de la letra
5 VERIFY   esperado vs obtenido · si FAIL → volver a 1 hasta PASS
```

**Kill agente:** no declarar listo / “funciona” sin evidencia. Entrega a medias = fallo de mando.  
**Kill producto:** no declarar superioridad de mercado sin QA sede + timbre real + un pago conciliable.

Regla Cursor: `.cursor/rules/crozzo-military-delivery.mdc`.

---

## 5. Sistemas de mando en código

**Fachada única (no parches sueltos):** `CrozzoCommandBridge`

| API | Uso |
|-----|-----|
| `crozzoCommandBriefing()` | Briefing GO/NO-GO + seal + score + colas |
| `crozzoCommandRecover()` | Drenaje fiscal (+ sync opcional) |
| `CrozzoAutomation.commandBriefing()` | QA / Playwright |
| Diag comunicación | Consume `CommandBridge.diagRows()` |

| Subsistema | Función |
|------------|---------|
| `CrozzoSedeReadiness` | DEFCON / seal pre-turno |
| `CrozzoCommandScorecard` | Ranking ponderado vs mercado |
| `CrozzoFiscalOutboxDrain` | Drenar cola fiscal al volver WAN |
| `CrozzoDigitalPayConduit` | Pagos idempotentes |
| `CrozzoTransportPathHealth` | Path scoreboard |
| `test:sede-combat` | Gate clínico de armamento |

**Integridad de suite:** `FULL_SPECTRUM` | `MISSION_CAPABLE` | `DEGRADED_SUITE` | `CRITICAL_GAPS`

---

## 6. Narrativa de presentación (demo)

> Crozzo es el **sistema operativo de sede** para Colombia inestable.  
> Cuando cae internet, la flota sigue. Cuando vuelve, fiscal y pagos drenan con cola e idempotencia.  
> El encargado ve el **sello de combate** y el **scorecard de mando** — no un dashboard SaaS.

No digas “también facturamos”. Di **supervivencia + honestidad + mando**.
