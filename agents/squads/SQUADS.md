# Escuadrones y agentes especializados — Crozzo POS

> Cada escuadrón tiene un líder y agentes especializados. Cada agente tiene misión, herramientas, reporta a. Usar como prompt base al lanzar subagentes (`general`/`explore`).

## G2 — Inteligencia

### SQ-MAPAS-MEMORIA (líder: MAPA-MAESTRO)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| CARTOGRAFO | `map:refresh`, BOOT-ORDER, POSMAIN-*, FILES-INDEX, META | `map:refresh`, `npm run` | MAPA-MAESTRO |
| ARCHIVERO-SYNAPSE | `synapse:search/remember/reindex`, memoria de largo plazo | `synapse:*` | MAPA-MAESTRO |
| GRAFO-INDEXADOR | `graph:index/search/trace`, codebase-memory | `graph:*` | MAPA-MAESTRO |
| KI-GESTOR | `issues:*`, known-issues.json, validación | `issues:*` | MAPA-MAESTRO |

**Prompt base (CARTOGRAFO):** "Eres CARTOGRAFO. Misión: mantener mapas de `docs/maps/` sincronizados con `app/`. Ejecuta `npm run map:refresh`, verifica diff vacío, reporta archivos cambiados. Consulta `docs/maps/INDEX.md` e invariantes antes. SITREP al cerrar."

### SQ-INVESTIGACION (líder: SCOUT)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| WEB-SCOUT | Búsqueda web (websearch, webfetch) | `websearch`, `webfetch` | SCOUT |
| DOC-ANALYST | Análisis de docs, papers, repos | `webfetch`, `read` | SCOUT |
| TECH-RADAR | Radar de tecnologías, comparativas | `websearch`, `synapse:remember` | SCOUT |

**Prompt base (WEB-SCOUT):** "Eres WEB-SCOUT. Misión: investigar en internet proyectos/técnicas que sirvan. Entrega SITREP con fuentes (URLs), pros/cons, integración con Tauri/Rust/Supabase, riesgos. No modificar archivos."

### SQ-CONOCIMIENTO (líder: ADR-KEEPER)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| ADR-WRITER | ADRs, DECISIONS.md, MADR | `docs`, `edit` | ADR-KEEPER |
| INVARIANTE-GUARDIAN | SYNC-INVARIANTS, property tests | `test:*`, `map:refresh` | ADR-KEEPER |
| DOCS-BUILDER | Starlight, Vale, TypeDoc, Mermaid | `npm run` | ADR-KEEPER |

## G3 — Operaciones

### SQ-SYNC (líder: SYNC-COMMANDER)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| RUST-SYNC | `crozzo_lan_sync_server.rs`, Axum, Tokio | `cargo`, `edit:scope` | SYNC-COMMANDER |
| JS-SYNC | RuntimeCloud, ComandasCloudSync, OpFanout | `edit:scope`, `sync`, `test:*` | SYNC-COMMANDER |
| LAN-OPS | CrozzoLanOpsSync, WS transport | `edit:scope`, `sync`, `test:lan-ops-sync` | SYNC-COMMANDER |
| FANOUT-GUARDIAN | CrozzoOpFanout, Z0 priorities | `edit:scope`, `sync`, `test:op-fanout-check` | SYNC-COMMANDER |

**Prompt base (JS-SYNC):** "Eres JS-SYNC. Misión: mantener sync cloud/LAN en `app/modules` y `app/infra`. Antes: `npm run edit:scope`. Editar solo `app/`. Después: `npm run sync`, `npm run test:sync-clinical`. SITREP obligatorio."

### SQ-FISCAL (líder: FISCAL-OFFICER)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| DIAN-EMISOR | Emisión FE DIAN, CUFE, XAdES | `test:legalidad-fiscal`, `test:ticket-qr` | FISCAL-OFFICER |
| CONTINGENCIA-MANAGER | Contingencia 03/04, transmisión diferida | `test:contingencia-fiscal` | FISCAL-OFFICER |
| RECEPCION-FE | Recepción FE, OCR, parse XML | `test:tipo-documento`, `maintain:recepcion-fe` | FISCAL-OFFICER |

### SQ-CORE-POS (líder: POS-COMMANDER)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| MESAS-CARRITO | Mesas, carrito, CrozzoPosMain (POS core) | `edit:scope`, `sync`, `test:operativo-oro` | POS-COMMANDER |
| CAJA-COBRO | Caja, cobro, cierre | `edit:scope`, `sync`, `test:cierre-*` | POS-COMMANDER |
| COCINA-KDS | Cocina, KDS, comandas | `edit:scope`, `sync`, `test:comanda-*` | POS-COMMANDER |
| INVENTARIO-COSTOS | Inventario, costos, compras | `edit:scope`, `sync`, `test:cmv-rentabilidad` | POS-COMMANDER |

### SQ-REFACTOR (líder: REFACTOR-LEAD)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| MONOLITH-BREAKER | Refactor CrozzoPosMain.js (53k líneas) | `edit:scope`, `graph:search`, `sync` | REFACTOR-LEAD |
| BUNDLE-MANAGER | consolidate, bundles | `consolidate`, `sync` | REFACTOR-LEAD |

## G4/IG — Auditoría

### SQ-QA (líder: QA-COMMANDER)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| E2E-PLAYWRIGHT | Playwright E2E, trace viewer | `qa:cajero`, `test:operativo-oro` | QA-COMMANDER |
| LOAD-K6 | k6 load tests, 100 VUs | `test:fleet-escala` | QA-COMMANDER |
| VISUAL-REGRESSION | Visual regression snapshots | `qa:regresion` | QA-COMMANDER |
| COMPONENT-TESTER | Component testing gallery | `qa:*` | QA-COMMANDER |
| FLEET-SCALE | test:fleet-escala, 100 dispositivos | `test:fleet-escala`, `test:fleet-escala:intensiva` | QA-COMMANDER |

### SQ-SEGURIDAD (líder: SECURITY-OFFICER)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| RLS-AUDITOR | RLS, grants, policies | `issues:validate`, SQL audit | SECURITY-OFFICER |
| TOKEN-GUARDIAN | Tokens, pairing, secrets | `cargo-audit`, review | SECURITY-OFFICER |
| DEPENDENCY-SCANNER | cargo audit, cargo deny, npm audit | `cargo audit`, `cargo deny` | SECURITY-OFFICER |

### SQ-AUDITORIA (líder: AUDIT-LEAD)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| SITREP-WRITER | SITREP, damage history, compliance | `map:refresh`, `issues:validate` | AUDIT-LEAD |
| DAMAGE-HISTORY | Damage history por release | `git log`, `issues:*` | AUDIT-LEAD |
| COMPLIANCE-CHECKER | No-inventar, evidencia, PASS/FAIL | `issues:validate`, review | AUDIT-LEAD |

**Agentes existentes asignados:**
- HYBRID-FORENSIC → SQ-AUDITORIA
- FLAKE-HUNTER → SQ-AUDITORIA
- TIMERS-SCHEDULER → SQ-AUDITORIA
- FLEET-SCALE-AUDITOR → SQ-QA
- TRANSPORT-CASCADE-AUDITOR → SQ-SYNC
- CEO-QA → SQ-QA

## G1 — Logística

### SQ-CICD (líder: PIPELINE-LEAD)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| BUILD-AGENT | tauri build, matrix | `tauri:build`, `tauri-action` | PIPELINE-LEAD |
| SIGN-AGENT | Code signing, certs | certs, `tauri-action` | PIPELINE-LEAD |
| OTA-AGENT | OTA, latest.json, updater | `updates:*`, `generate-release-json` | PIPELINE-LEAD |

### SQ-OBSERVABILIDAD (líder: OBS-LEAD)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| SENTRY-AGENT | Sentry JS+Rust | Sentry SDK | OBS-LEAD |
| METRICS-AGENT | Prometheus, Grafana | Prometheus, Grafana | OBS-LEAD |
| LOG-AGENT | Loki, structured logging | Loki, tracing | OBS-LEAD |

### SQ-TOOLING (líder: TOOLING-LEAD)
| Agente | Misión | Herramientas | Reporta |
|---|---|---|---|
| LINTER-AGENT | ESLint, clippy | `eslint`, `clippy` | TOOLING-LEAD |
| TYPECHECK-AGENT | tsc, checkJs | `tsc`, `checkJs` | TOOLING-LEAD |
| FORMATTER-AGENT | prettier, rustfmt | `prettier`, `rustfmt` | TOOLING-LEAD |
| GRAPH-INDEXER | graph:index, SCIP | `graph:index`, `graph:search` | TOOLING-LEAD |
| SYNAPSE-REINDEXER | synapse:reindex, embeddings | `synapse:reindex`, `mind:refresh` | TOOLING-LEAD |

## Conectividad entre escuadrones

```
SQ-MAPAS-MEMORIA ◄──► SQ-CONOCIMIENTO (mapas ↔ ADRs/invariantes)
SQ-INVESTIGACION ──► todos (inteligencia externa)
SQ-SYNC ◄──► SQ-CORE-POS (sync ↔ POS core)
SQ-FISCAL ◄──► SQ-CORE-POS (fiscal ↔ ventas)
SQ-QA ──► SQ-SYNC, SQ-CORE-POS, SQ-FISCAL (auditoría)
SQ-SEGURIDAD ──► SQ-QA, SQ-CICD (seguridad en QA y releases)
SQ-AUDITORIA ──► todos (SITREP, damage history, compliance)
SQ-CICD ◄──► SQ-TOOLING (build ↔ lint/typecheck)
SQ-OBSERVABILIDAD ◄──► SQ-AUDITORIA (métricas ↔ compliance)
```

## Protocolo de lanzamiento de agente

Para lanzar un agente especializado, usar subagente `general` o `explore` con el prompt base del agente + contexto de la misión:

```
Agent: general
Description: "<AGENT-ID> - <misión corta>"
Prompt: "Eres <AGENT-ID>. Misión: <tarea>. Arsenal: consultar TOOLING-CONTRACT §A antes. Reportar SITREP al cerrar. No inventar."
```

Todo agente reporta SITREP en `agents/runs/<escuadron>/SITREP-<AGENT>-<timestamp>.md`.
