# Doctrina de mando — Crozzo como armamento de sede

**Vigencia:** 2026-07-27 (J2-M INTEL actualizada) · **Barra:** calidad mission-critical / DDIL · **OTA:** ver [`META.json`](META.json)
**Ops:** [OPS-COMMAND-CENTER.md](OPS-COMMAND-CENTER.md) · Scorecard: `crozzoCommandScorecard()` · Seal: `crozzoSedeReadiness()`
**Fiscal bloqueante:** [FISCAL-CO-BLOQUEANTES.md](FISCAL-CO-BLOQUEANTES.md) (12 requisitos DIAN, lectura obligatoria)

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

## 2. INTEL mercado CO (adversarios) — actualizado 2026-07-27 (J2-M)

### Adversarios establecidos

| Sistema | Arma principal | Techo / flanco |
|---------|----------------|----------------|
| **Alegra** | FE + TTV + Wompi · 1M+ usuarios LATAM | POS gastronómico débil: sin food cost, sin KDS, soporte criticado. Cloud puro. |
| **Siigo Gastrobar** | Contable 38 años + DIAN marca · menú QR | Lanzado ago-2025, madurez temprana. Requiere Siigo Nube aparte (~$187K real). Cloud puro. |
| **Loggro** | Marca restobar + Rappi + soporte 24/7 | Precio alto ($390K+ primer mes). Cloud puro. |
| **Gestro** | Multi-KDS (bar+cocina) + cierre ciego + QR | **SIN offline** (cloud 100%). Subió a $79K base. Sin Rappi/iFood directo. |
| **Fudo** | Delivery (Rappi+DiDi+Uber+iFood+PedidosYa) | Costos ocultos ($62.9→$109.8K real). Fallos stock en picos. Cloud puro. |
| **Vendty** | Veterano 10+ años, offline 3h, Rappi nativo | Reputación dañada (“licencia vitalicia” engañosa). Offline solo 3h. |

### 🚨 Nuevos entrantes (C2 — no estaban en doctrine previa)

| Sistema | Precio | Por qué amenazan |
|---------|--------|------------------|
| **WARO** | **$7.992/mes** | Líder low-cost warocol. IA que lee facturas proveedor (OCR), food cost, domicilios sin comisión. Debilidad: sin Rappi/iFood. |
| **Cuenti** | $33.300/mes | Por contadores CO: POS + DIAN + **nómina electrónica** + contabilidad en uno. |
| **POS Colombia** | Freemium | Bot IA WhatsApp + OCR facturas. Crece por freemium. |
| **POS by Finanwise** | Cotización | POS+IA+DIAN, informes gerenciales con IA. |

### GRIETAS detectadas (dónde Crozzo aplasta — H3)

| # | Grieta | Por qué es asimétrica |
|---|--------|----------------------|
| **G1** | **Operación offline REAL** | TODOS los líderes cloud puros caen con internet. Vendty solo 3h. Crozzo con Bridge LAN opera 100% offline con cola fiscal. **Único en CO.** → H3a |
| **G2** | **iFood nativo + multi-delivery unificado** | **Ningún POS integra iFood bien** (12K restaurantes, 30 ciudades post-fusión Domicilios). Crozzo primer inbox unificado Rappi+iFood+DiDi. → H3c |
| **G3** | **Transparencia de precio (anti-costos ocultos)** | Patrón más odiado en reviews: Fudo $62.9→$109.8, Siigo requiere Nube aparte, Vendty “vitalicio” engañoso. Crozzo precio único honesto. → H3b |

### AMENAZAS estratégicas (a vigilar)

| # | Amenaza | Impacto |
|---|---------|---------|
| **A1** | **Migración DIAN 2026** (Decreto 0240/2026) está vaciando low-end hacia WARO/Cuenti ANTES que Crozzo llegue | Si no hay plan entrada <$50K/mes con DIAN incluida, perdemos la migración más grande en años |
| **A2** | **IA + WhatsApp como nuevo estándar** (POS Colombia ya lo hace; WARO OCR facturas) | En 12 meses, un POS sin capa IA parecerá obsoleto. No es opcional, es el piso nuevo |
| **A3** | **Consolidación Bancolombia** (Wompi + Botón “dale!” sin comisión + datáfonos físicos + Tap to Phone) | Si Siigo (aliado ecosistema bancario) toma el “Botón dale! sin comisión” primero, desplaza a todos los dependientes de Wompi 2.65% |

### Alternativas evaluadas (mando)

| Decisión | COA A | COA B | Elección doctrina |
|----------|-------|-------|-------------------|
| Habilitador FE | Dataico (ya dock) | Taxxa (vía Gestro) | **Dataico real + cola**; Taxxa como plan B si piloto lo exige |
| Pago digital | Nequi API directa | **Wompi** (Nequi+PSE+QR) | **Wompi** (menos certs, multipago). **A3:** añadir Botón “dale!” sin comisión como diferenciador |
| Sync conflictos | CRDT (Otter/Yjs) | **LWW + OpAck** | Mantener LWW hasta fallo real en piloto |
| Print LAN | Bridge tipo Gestro | Tauri + auto-print actual | **Ya tenemos** print LAN/Tauri — empaquetar narrativa “Bridge Crozzo” |

---

## 3. Superioridad (dónde debemos aplastar) — actualizado 2026-07-27

| Dimensión | Peso | Crozzo arma | Vs mercado |
|-----------|------|-------------|------------|
| **Flota offline multi-radio** | ×2.5 | WS/HTTP/gossip/BLE/Wi‑Fi Direct + seal | **Ventaja asimétrica** (G1 — único offline real) |
| Ops sala Z0 | ×2 | Mesas/KDS/roles/reservorio | Empate alto / ventaja profundidad |
| **Fiscal honesto** | ×2 | Dataico real + outbox drain + VPFE | **H1 cierre one-shot vs Alegra** — ver [FISCAL-CO-BLOQUEANTES.md](FISCAL-CO-BLOQUEANTES.md) |
| Pago digital | ×1.5 | Conduit + idempotency + **Botón “dale!”** | Cerrar Wompi keys + explotar A3 |
| Food-cost | ×1.5 | Compras/OCR/matriz | **Ventaja** vs Gestro/Alegra |
| TTV / UX | ×1 | BONA + silencio P0 | **Cerrar** vs Alegra |
| **Multi-delivery** | ×1.2 | Inbox unificado Rappi+iFood+DiDi | **G2 — primer POS con iFood bien** |
| **IA operacional** (C3) | ×1 | OCR facturas + reportes conversacionales | **Cerrar brecha vs WARO/POS Colombia** (piso nuevo) |
| Transparencia precio (G3) | ×0.8 | Plan único honesto, todo incluido | **Diferenciador de marca** vs Fudo/Siigo |

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
