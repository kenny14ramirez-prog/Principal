# OPS COMMAND CENTER — Crozzo Superior (doctrina de ejecución)

**OPORD:** MEJORA-SUPERIOR · **Fecha activación:** 2026-07-17 · **OTA:** v1.0.230  
**Planes orquestados:** [MEJORA-SUPERIOR-MERCADO-CO-PLAN.md](MEJORA-SUPERIOR-MERCADO-CO-PLAN.md) · progreso [`mejora-superior-progress.json`](mejora-superior-progress.json)  
**Auditoría:** [`AUDITORIA-CROZZO-POS-MERCADO-CO-2026-07.pdf`](../AUDITORIA-CROZZO-POS-MERCADO-CO-2026-07.pdf)

> Doctrina: *No improvisar parches. Cada acción tiene INTEL → COA → GATE → EXECUTE → VERIFY.*  
> Preferencia dueño: sentir costoso/profesional; QA sede humana es puerta; no “listo” solo con clinical.

---

## 1. Arsenal (stack mente — inventariado)

| Capa | Herramienta | Uso en ops |
|------|-------------|------------|
| Memoria proyecto | Synapse MCP / `npm run synapse:*` | Lecciones, preferencias, no secretos |
| Anti-patrones | `npm run issues:search` + known-issues.json | Antes de diagnosticar o parchear |
| Símbolos / PosMain | mcp-code-context (`read_file_surgical`, `search_symbols`) | No tragar 51k LOC |
| Grafo llamadas | codebase-memory (`search_graph`, `trace_path`) | Quién llama a quién |
| Mapas humanos | `docs/maps/INDEX.md` | CONNECTIONS, SEQUENCES, ADRs |
| Anti-parche ciego | `npm run edit:scope` | Obligatorio en críticos |
| Verificación Z0 | `npm run test:sync-clinical` | Gate duro sync/LAN/runtime |
| Salud stack | `npm run mind:health` | Synapse + MCP + grafo + hooks |
| Campo | QA-TIENDA-P0 + FLEET-DIAG + ROLE-OPS | Puerta humana sede |

**SITREP stack (2026-07-17 noche):** `mind:health` = LISTO · Synapse 59 memorias · Ollama OK · grafo `crozzo-pos` ready · clinical **verde** (checks OK).

---

## 2. Ciclo OODA (cómo se pelea cada eje)

```text
OBSERVE  → Synapse + issues:search + mapas + grafo/símbolos + (si campo) checklist
ORIENT   → causa raíz vs síntoma; ¿ya hay KI/ADR?
DECIDE   → COA A/B; kill criteria; ¿bloquea H0?
ACT      → edit:scope → app/ mínimo → sync → clinical → (sede si Z0 UX)
```

**Reglas duras**

1. H0 bloquea H1–H3 producto “wow”.
2. Un eje / un PR / un dominio.
3. Transporte nunca filtra por rol (KI-014).
4. No editar `src/` ni Reservorio sin pedido.
5. Critical sync “open” = stop-the-line. `watch` = monitorear en sede, no inventar rewrite.

---

## 3. INTEL consolidado (por qué cada eje)

### 3.1 Offline / flota (ventaja — no regalar)

**Fuentes:** industria offline-first POS (P2P/local hub, outbox, LWW); IFBTA POS 2026 pide offline ininterrumpible.  
**Crozzo ya tiene:** IndexedDB + LAN WS/HTTP + gossip/BLE/Wi‑Fi Direct + OpAck/LWW + COMM-CASCADE.  
**Razón de integrar más heal/path-health como producto:** el mercado vende “modo offline”; nosotros debemos vender **sede que no se cae** — solo después de QA campo (H0).  
**No hacer:** CRDT/SWIM ahora; apagar LAN en Z0.

### 3.2 Estabilidad sede (H0)

**Fuentes:** DEV/ops POS — el fallo duro es reconexión y doble aplicación (comanda/print), no el happy path.  
**Crozzo:** criticals de sync/caja/cocina en código mayormente `resolved`; **0 open**; 10 `watch` (incl. KI-002 git stale, KI-010 locationId, KI-019 reservorio).  
**Razón:** La auditoría: *un POS que casi sincroniza es peor que uno simple que sí cobra.*  
**Gate:** checklist sede firmado + clinical verde + locationId idéntico.

### 3.3 DEE POS / FE (H1.1) — **prioridad fiscal**

**Fuentes:** DIAN Res. 000165/2023; micrositio DEE; Alegra 2026 (obligatoriedad DEE POS, CUIDE/CUFE, numeración distinta a FE venta, informe diario).  
**Crozzo hoy:** UI cobro electrónica (`crozzoCobroStudioEsElectronica`), dock Dataico, `CrozzoPosDianLib.dataicoStamp`.  
**HALLAZGO OPS (código):** `dataicoStamp` **simula** timbrado (`setTimeout` + CUFE local) — **no es llamada real al habilitador**. Esto explica score DIAN 3/5: capaz en UI, no listo-y-olvidado.  
**Razón de integrar one-shot real:** sin DEE/FE validado, el dueño formaliza en Alegra/Siigo y nos deja en cocina.  
**COA recomendada H1:** reemplazar stub por proveedor real (Dataico u otro en listado DIAN) **dentro del modal Cobrar**, con cola offline si DIAN cae.

### 3.4 Pagos digitales (H1.4)

**Fuentes:** Nequi Negocios API (QR dinámico + push + getStatus + sandbox/certificación).  
**Crozzo hoy:** medios UI (`datafono`, `qr_nequi`, `transferencia_pse`) sin pasarela conciliable.  
**Razón:** score pagos 1/5; mercado Loggro/Gestro ya cobra digital.  
**COA A (recomendada piloto restaurante):** Nequi QR dinámico — alineado a tablet/caja sin hardware datafono.  
**COA B:** SDK datafono si el piloto ya tiene terminal.  
**Kill:** no integrar 3 agregadores a la vez; un medio + conciliación del día.

### 3.5 UX / time-to-value (H2)

**Fuentes:** preferencia Synapse “sentir costoso”; auditoría UX 2/5; IFBTA — operadores cambian POS por fricción.  
**Razón:** BONA origen + silencio companion + Cobrar CTA ya encaminados; falta onboarding &lt;1 día y cierre/propinas.

### 3.6 Mantenibilidad (transversal)

**Fuentes:** auditoría 1/5; PosMain ~51k.  
**Razón:** cada feature sobre monolito eleva regresión de turno.  
**COA:** extracción por dominio (`app/core/pos/` ya iniciado) en H2.5, no big-bang React.

---

## 4. COAs activas (cursos de acción)

| COA | Nombre | Cuándo | Riesgo |
|-----|--------|--------|--------|
| **COA-FIELD** | Campo primero | Ahora | Bajo código / alto valor verdad |
| **COA-FISCAL** | DEE/FE real en Cobrar | Tras o paralelo diseño a FIELD | Alto (proveedor, habilitación DIAN) |
| **COA-PAY** | Nequi QR v1 | Tras FIELD verde parcial | Medio (cert Nequi) |
| **COA-WOW** | Gemelo/autosanable producto | Bloqueado hasta H0 | Alto scope |

**Decisión ops vigente:** **COA-FIELD** como eje principal; **INTEL+diseño COA-FISCAL** en paralelo (sin merge a producción hasta FIELD).  
Motivo: git branch `task/-20260706-1846` con **7 behind / 2 ahead** vs `origin/main` (KI-002 watch) — alinear versión sede antes de feature fiscal grande.

---

## 5. Gates (no negociables)

| Gate | Comando / artefacto | Bloquea |
|------|---------------------|---------|
| G0 Mind | `npm run mind:health` | Sesión larga sin stack |
| G1 Anti-regresión | `issues:search` + KI open=0 critical | Parche ciego |
| G2 Scope | `edit:scope` en críticos | Write en PosMain/sync |
| G3 Clinical | `npm run test:sync-clinical` | Merge Z0 |
| G4 Campo | QA-TIENDA-P0 firmado | Declarar H0 done |
| G5 Fiscal | Timbre real (no stub) + CUIDE/CUFE persistido | Declarar H1.1 done |
| G6 Pago | getStatus/webhook + fila conciliación | Declarar H1.4 done |

---

## 6. OPORD — Fase H0 (ejecución inmediata)

### Misión
Dejar la sede piloto en estado **turno aburrido**: multi-dispositivo sin drama de sync/cobro/cocina.

### Situación (SITREP 2026-07-17)

| Ítem | Estado |
|------|--------|
| Clinical | ✅ Verde |
| Critical KI open | ✅ 0 (11 resolved; KI-002 critical **watch** = git) |
| ROLE-OPS código | ✅ ready_sede |
| QA sede firmado | ❌ Pendiente |
| locationId flota | ❓ Verificar en campo |
| Git vs origin/main | ⚠️ 7 behind, 2 ahead — alinear antes de demo sede |
| dataicoStamp | 🔴 Stub simulado — H1 bloqueado a nivel producto real |

### Tareas (orden)

| # | Quién | Tarea | Verify |
|---|-------|-------|--------|
| H0-T1 | Ops/dev | Alinear branch con política equipo (pull/rebase o cherry) — **pedir OK dueño** | `git status -sb` 0 behind |
| H0-T2 | Campo | Misma OTA v1.0.230 + `locationId` en caja/tablet/cocina | FLEET-DIAG |
| H0-T3 | Campo | Ejecutar [QA-TIENDA-P0-CHECKLIST](QA-TIENDA-P0-CHECKLIST.md) §§1–8 + drills §9 | Tabla Resultado |
| H0-T4 | Ops | Cada fallo → `issues:search` → KI nuevo o reopen watch | known-issues |
| H0-T5 | Dev | Solo fixes mínimos de fallos sede; clinical tras cada uno | G3 |

### Drills de fallo (industria → sede)

Ver checklist §9 (añadido). Simular: Wi‑Fi 30s, caja LAN caído, doble mesero misma mesa, LISTO+cobro concurrente.

### Kill criteria H0
- Carrito revive post-cobro → stop, KI-003 path.
- LISTO borra cuenta caja → stop, KI-017 path.
- locationId distinta → no debuggear merge hasta igualar (KI-010).

---

## 7. Diseño paralelo H1 (sin code-merge hasta G4)

### H1-D1 DEE/FE one-shot
1. Contratar/confirmar habilitador (Dataico u otro listado DIAN).  
2. Sustituir stub `dataicoStamp` por API real + manejo error/cola.  
3. UX: en `confirmarCobroDesdeCaja` / studio cobro → emitir DEE o FE según reglas; mostrar CUIDE/CUFE.  
4. Numeración DEE ≠ FE venta (MUISCA).  
5. Informe diario ventas al cierre (requisito mercado 2026).

### H1-D2 Nequi QR
1. Portal desarrolladores Nequi → sandbox.  
2. Flujo: generar QR → poll getStatus → stamp pago en factura.  
3. Conciliación mínima en cierre.

---

## 8. Cadencia (battle rhythm)

| Momento | Ritual |
|---------|--------|
| Inicio sesión ops | `mind:health` + Synapse search tema del día |
| Antes de editar crítico | `edit:scope` + 1 referencia |
| Tras fix Z0 | `sync` + `test:sync-clinical` |
| Fin oleada | Actualizar `mejora-superior-progress.json` |
| Tras sede | Firmar checklist + KI nuevos |

---

## 9. ROE (reglas de enfrentamiento)

- **Prohibido:** “de paso” tocar Reservorio, rewrite React, PMS hotel, 3 pasarelas, force-push main.  
- **Permitido sin sede:** clinical, mapas, stubs→diseño, docs ops, extracción PosMain no-Z0 con tests.  
- **Requiere sede:** declarar H0 done, cerrar watch KI de campo (010, 019).  
- **Commits/PR:** solo si el dueño lo pide.

---

## 10. Próxima orden (FRAGO)

**AHORA (esta sesión / mañana campo):**

1. Dueño: OK para alinear git (H0-T1) — sí/no.  
2. Campo: correr QA-TIENDA-P0 + drills §9 en piloto.  
3. Ops: al volver fallos, abrir oleada de fixes uno a uno (no batch).  
4. En paralelo papel: elegir habilitador DIAN + track Nequi sandbox (sin merge).

**Éxito de la operación esta semana:** checklist sede con ≤2 fallos menores y cero criticals de turno.
