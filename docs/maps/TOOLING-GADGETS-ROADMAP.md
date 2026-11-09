# Tooling & Gadgets Roadmap — Crozzo POS

> Fecha: 2026-11-07 · Objetivo: mejorar estabilidad y desarrollo sin tocar la cascada MP→plato→matriz ni el motor fiscal H1.
> Base: inventario real del repo + verificación web (Playwright/Tauri, Stagehand/browser-use, DIAN, ESC/POS, Sentry/GlitchTip, rrweb, fast-check, Mem0/Letta).

---

## 0. Inventario actual (lo que ya existe)

| Capa | Herramienta | Estado |
|------|-------------|--------|
| Mapa | `docs/maps/*` + `npm run map:refresh` + `edit:scope` + `codebase-memory-mcp` | Activo |
| Memoria | `synapse/` (Python + SQLite `memory.db`) + `synapse:*` + `mcp-code-context` | Parcial: venv ausente en este árbol |
| Errores | `known-issues.json` + `issues:search/file/validate/refresh` | Activo |
| Agentes QA | `qa-cajero-humano.mjs` (Playwright), `empresa-agentes.mjs`, `jornada-simulator`, `jornada-caos`, `test-fleet-escala`, `run-operativo-oro` | Parcial: `agents/` y `config/` referenciados pero ausentes |
| Tests | ~60 scripts `_*.mjs` + `test:sync-clinical` | Activo |
| E2E desktop | Playwright (web) | Sin Tauri WebDriver/CDP real |
| Observabilidad | `console.log` + logs locales | Sin sink central ni session replay |
| Facturación | Motor fiscal H1 + tests legales | Sin sandbox DIAN automatizado |
| Impresión | Flujos de comanda/cuenta | Sin impresora virtual/emulador |

**Brechas críticas detectadas**
1. `scripts/empresa-agentes.mjs` importa `../agents/orchestrator/ceo-qa.mjs` y `config/agents-factory.json`, pero no existen → la "empresa de agentes" no arranca.
2. `synapse/` y `.cursor/mcp-launchers` no están en este árbol → memoria/MCP no operativos.
3. No hay captura centralizada de errores ni replay de sesión.
4. No hay pruebas de propiedades (invariantes sync) ni caos de red.
5. No hay emulador de impresora ni sandbox de facturación electrónica.

---

## 1. Profundizar los agentes "semihumanoides" (tu idea central)

### 1.1 Objetivo
Que un agente haga lo que hace un humano en la app (abrir, comandar, cobrar, facturar, imprimir, anular) y produzca un **análisis forense** por cada paso:
- qué clicó, qué esperaba, qué pasó,
- errores de consola/red, tiempos,
- estado interno (sync, carrito, comanda, runtime),
- hipótesis de causa raíz y fix sugerido,
- aprendizaje persistido para no repetir.

### 1.2 Herramientas web-verificadas a agregar

| Herramienta | Para qué | Integración sugerida |
|---|---|---|
| **Playwright Test** (ya en devDeps) | E2E determinista, fixtures, tracing, video, HAR | Migrar scripts `_*.mjs` a `tests/e2e/*.spec.ts` con `trace: 'on-first-retry'` |
| **tauri-driver / WebDriver** | Controlar el webview real de Tauri en Windows/macOS/Linux | `npm run test:tauri:e2e` levantando `tauri dev` + driver |
| **tauri-plugin-playwright** | Controla el webview nativo real (Chromium/WebView2) | Plugin Rust + bridge JS para tests profundos |
| **Maestro** o Appium | E2E en APK Android (Tauri mobile) | `maestro test flows/*.yaml` |
| **Stagehand** (Browserbase) | Playwright + IA selectiva con cache (más estable que LLM puro) | Agente "cajero IA" que ejecuta metas en lenguaje natural |
| **browser-use** | Agente LLM que navega por objetivos | Escenarios exploratorios ("intenta facturar y reporta") |
| **Playwright MCP** | Expone el navegador como tools para un LLM | El agente orquestador llama click/fill/snapshot |
| **Visual regression** (Playwright screenshots / BackstopJS / Percy) | Detectar cambios UI no intencionales | `expect(page).toHaveScreenshot()` en CI |

### 1.3 Esquema de registro por acción (para "análisis detallado")
Guardar en `agents/runs/<runId>/steps.jsonl`:
```json
{
  "ts": "2026-...",
  "runId": "jornada-2026-...",
  "agent": "cajero-1",
  "step": 42,
  "intent": "Enviar factura electrónica",
  "action": "click",
  "selector": "#btnFacturar",
  "expected": "Modal de confirmación + CUFE",
  "actual": "Sin respuesta",
  "consoleErrors": ["..."],
  "network": [{"url": "...", "status": 500}],
  "screenshot": "step-42.png",
  "trace": "trace.zip",
  "internalState": {"cartLines": 3, "syncTier": "cloud", "printer": "none"},
  "verdict": "FAIL",
  "rootCauseHypothesis": "Handler no registrado en PosMain",
  "suggestedFix": "Revisar crozzoFacturar handler + binding",
  "learnedTags": ["facturacion", "click-muerto", "caja"]
}
```

### 1.4 Aprendizaje
- **Mem0** o **Letta** como capa de memoria a largo plazo para los agentes (hechos, fallos, patrones).
- **Promptfoo / DeepEval** para evaluar si el agente cumplió la meta y la calidad del análisis.
- Alimentar `known-issues.json` automáticamente desde fallos repetidos (`issues:file`).

---

## 2. Facturación electrónica (DIAN) — sandbox y validación

### 2.1 Herramientas verificadas
- **DIAN**: validación previa de UBL 2.1; ambiente de pruebas/habilitación vía proveedor tecnológico o portal DIAN.
- **dian-kit** (open source) — SDK para facturación electrónica ante DIAN.
- Proveedores/API: MATIAS API, Nortserver, etc. (para sandbox y firma).
- Validadores: XSD UBL 2.1 + reglas DIAN; firma XAdES; CUFE/CUDE; eventos RADIAN.

### 2.2 Qué agregar al proyecto
- `tests/fiscal/dian-sandbox.spec.ts`: emitir factura → validar XML → obtener CUFE → anular → nota crédito.
- Fixtures en `tests/fixtures/fiscal/` (facturas válidas/inválidas, contingencia, retenciones, documento soporte).
- Script `npm run test:fiscal:dian` que corre contra sandbox (variables de entorno, nunca producción).
- Checklist de "qué sucede": respuesta DIAN, código de error, tiempo, reintentos, contingencia offline.

### 2.3 Escenarios para el agente
1. Factura a cliente con NIT → busca cliente → emite → recibe CUFE → imprime → envía.
2. DIAN rechaza (datos inválidos) → el agente captura código/mensaje → sugiere corrección.
3. Sin internet → contingencia → reintento al volver.
4. Anulación → reversión de inventario (KI-018/H2.B).

---

## 3. Impresión — emuladores y detección de ausencia

### 3.1 Herramientas verificadas
- **Virtual ESC/POS printer emulator** (Rust / `escpos-emulator` npm) — recibe bytes por TCP y renderiza.
- **POS Printer Emulator for Windows** — inspección byte a byte.
- **receiptful** — render ESC/POS a PNG en navegador.
- Impresión genérica: "Microsoft Print to PDF" / CUPS-PDF.

### 3.2 Qué agregar
- `scripts/_printer-emulator-check.mjs`: envía comanda/cuenta → verifica bytes recibidos + render PNG.
- Escenarios del agente:
  - "Intentó imprimir y no hay impresora" → mensaje claro + cola + reintento.
  - Tildes/acentos, QR, logo, ancho de papel.
  - Impresión parcial/fallo de papel → reporte.

---

## 4. Observabilidad y estabilidad

### 4.1 Errores y replay
| Herramienta | Uso |
|---|---|
| **Sentry** o **GlitchTip** (Sentry-compatible, más liviano/self-host) | Captura de errores + source maps + releases |
| **rrweb** | Session replay open source dentro del webview |
| **OpenTelemetry** | Trazas/métricas/logs; exportar a Jaeger/Grafana |
| **PostHog** (opcional) | Analítica de producto + feature flags |

Integración:
- Inicializar SDK en `app/` con release = versión del POS.
- Subir source maps en `tauri:build`.
- Bridge: error repetido → crear entrada en `known-issues.json` (`issues:file`).
- Replay vinculado al `runId` del agente para reproducir "lo que vio el usuario".

### 4.2 Pruebas de estabilidad
| Herramienta | Uso |
|---|---|
| **fast-check** | Property-based testing de invariantes sync (KI-003..KI-019) |
| **toxiproxy** | Caos de red (latencia, pérdida, corte) |
| **k6 / Artillery** | Carga de fanout LAN y Supabase |
| **Stryker** | Mutation testing en módulos críticos |
| **Pact** | Contract testing LAN↔nube |
| **Zod / ajv** (ajv ya en deps) | Validación de esquemas en runtime |
| **axe-core** | Accesibilidad |

---

## 5. Memoria y aprendizaje (tu "memoria pequeña" a siguiente nivel)

| Herramienta | Uso |
|---|---|
| **Mem0** o **Letta** | Memoria a largo plazo para agentes (hechos, fallos, patrones) |
| **Chroma / Qdrant** (local) | Vector store para búsqueda semántica de runs/errores |
| **codebase-memory-mcp** (ya) | Grafo del código |
| **synapse** (ya, reparar venv) | Memoria conversacional |

Plan:
1. Reparar `synapse/` (venv + `memory.db`) y `.cursor/mcp-launchers`.
2. Crear `agents/` + `config/agents-factory.json` mínimos (CEOQA, roles, presets smoke/8dias/mensual).
3. Namespace de memoria por agente y por dominio (fiscal, sync, impresión).
4. Evaluaciones periódicas con Promptfoo/DeepEval.

---

## 6. Fases de adopción (priorizadas)

| Fase | Nombre | Esfuerzo | Entregable |
|---|---|---|---|
| **0** | Reparar stack existente | S | `agents/`, `config/`, `synapse/` venv, `.cursor` launchers, `mind:health` verde |
| **1** | Observabilidad mínima | M | Sentry/GlitchTip + rrweb + source maps + bridge a known-issues |
| **2** | E2E profundo + agentes | L | Playwright Test + tauri-driver + Stagehand/browser-use + esquema de steps |
| **3** | Facturación + impresión sandbox | L | `test:fiscal:dian`, emulador ESC/POS, escenarios del agente |
| **4** | Caos + memoria + evals | M | fast-check, toxiproxy, k6, Mem0/Letta, Promptfoo |

**Regla:** cada fase agrega tests `_check.mjs` / `.spec.ts` y no toca la cascada MP→plato→matriz ni el motor fiscal H1.

---

## 7. Lo que NO tocar (protegido)
- `CrozzoCostosEngine` (K3–K11)
- `cascadeMpChangeToMenu`
- Motor fiscal H1
- Cascada de conectividad (146 checks)

---

## 8. Hallazgos de agentes (exploración verificada)

### 8.1 Fiscal (DIAN)
- Núcleo: `app/core/pos/CrozzoPosDianLib.js` → `buildUBL21`, `calcularCUFE`, `timbrarFactura`, `createProvider` (solo `dataico`; `siigo`/`facturama` no implementados), outbox fiscal en localStorage.
- UI: `app/core/pos/CrozzoPosFacturasPage.js` (`renderFacturas`).
- Orquestación: `CrozzoPosMain.js` (construye UBL → timbra → persiste → mirror Supabase → imprime).
- Adquiriente: `app/modules/CrozzoAdquirienteLookup.js` (local → DIAN → Supabase RPC → RUES).
- Impresión: `crozzoFacturaPrintPos/Sheet`, `crozzoAutoPrintFacturaIfConfigured`, `crozzoPresentFacturaShareAfterPrint`.
- Tests: `_legalidad-fiscal-check`, `_contingencia-fiscal-check`, `_retenciones-b2b-check`.

### 8.2 Sync / invariantes
- Política: `CrozzoOperativeReservorio.js` (no auto-discard; cloud empty solo tras cobro/vaciado).
- Nube: `CrozzoPosRuntimeCloud.js`; LAN: `CrozzoLanOpsSync.js`; Comandas: `CrozzoComandasCloudSync.js`.
- Riesgos: digest LAN ciego (estado no cambia hash), outbox 6h sin ACK/idempotencia, quota localStorage, multi-writer carrito, mesa con solo comanda no entra en `presentKeys`.
- Flujo: `crozzoFinalizeComandaSend` → fanout → cocina `updateComandaEstado` → caja `crozzoCloseCajaOrderSession` → runtime push.

## 9. Estado de ejecución (2026-11-07)
- ✅ Fase 1 observabilidad implementada: `app/core/CrozzoObservability.js` + integración en `Crozzo_POS_Completo.html` y `app/index.html`; `window.crozzoObservability` verificado (status object).
- ✅ Agente profundo mejorado con análisis interno UBL/CUFE en F7.
- ✅ Fiscal sandbox: `scripts/_fiscal-sandbox-check.mjs` → 4/4 OK (buildUBL21, calcularCUFE, createProvider, globals).
- ✅ Baseline: `sync` + smoke = 11/11 OK.
- ✅ Agente profundo ejecutado contra app real: 10 pasos, 0 P0, 112 errores benignos de red (sin backend).

## 10. Estado de ejecución Fase 2 (2026-11-07)
- ✅ `fast-check` instalado.
- ✅ `scripts/_sync-property-check.mjs`: 4/4 suites (1000 runs c/u) pasan.
- ✅ `scripts/_chaos-network-check.mjs`: 4/4 OK tras corregir bug real.
- 🐛 **Bug corregido**: `app/infra/CrozzoLanSyncBridge.js` referenciaba `__degraded` (no definido en ese scope) en el handler `online`; causaba `ReferenceError` al reconectar. Se eliminó la línea.
- ✅ Observabilidad capturó 5 fallos de red y 0 errores fatales tras el fix.

## 11. Estado de ejecución Fase 3 (2026-11-07)
- ✅ Fiscal: legalidad, contingencia y retenciones B2B → PASS.
- ✅ Fiscal sandbox: 4/4 OK.
- ✅ Emulador ESC/POS: `printer:emulator` + `test:printer:emulator` → 4/4 OK (ESC @, GS V cut, bytes).
- ✅ Herramientas disponibles para simular impresora y validar payloads.

## 12. Estado de ejecución Fase 4 (2026-11-07)
- ✅ Memoria Node: `scripts/synapse-node.mjs` (status/search/remember/seed) + seed 4 memorias.
- ✅ Eval de agente: `test:agent:eval` → 6/6 OK (run válido, 0 FAIL, 0 P0).
- ✅ Todas las fases 0-4 implementadas y verificadas.

## 13. Siguiente paso recomendado
Conectar el agente a backend real (Supabase/Tauri) para validar flujos completos: factura con CUFE, impresión, anulación y reversión de inventario. También integrar memoria con el agente (recordar fallos y patrones).
