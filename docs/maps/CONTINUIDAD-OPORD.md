# 📋 CONTINUIDAD DE CAMPAÑA — Crozzo POS

**Última actualización:** 2026-07-29 · **Rama:** `task/aligned-20260727` · **HEAD:** ver `git log -1`
**Documento maestro para retomar el trabajo desde cualquier chat (ZCode/Cursor/Aider).**

> **Si abres este archivo primero, tienes TODO lo necesario para continuar.**
> Lee la sección "Cómo continuar" abajo para arrancar en 30 segundos.

---

## 🎯 ESTADO ACTUAL DE LA CAMPAÑA

### Fases completadas (con evidencia)

| Fase | Nombre | Commits | Tests | Estado |
|---|---|---|---|---|
| **H0** | Estabilizar campo | 9 | mind:health verde | ✅ COMPLETO |
| **H1.0** | Madurez empresarial + Sandbox | 3 | 3/3 PASS | ✅ COMPLETO |
| **H1.1** | Impuestos Saludables Ley 2277 | 1 | 18/18 PASS | ✅ COMPLETO |
| **H1.2** | Tiquete + Nota crédito/débito | 1 | 18/18 PASS | ✅ COMPLETO |
| **H1.3** | Firma XAdES propia | — | — | ⏸️ DEFERIDO (sin .p12 DIAN; usar Dataico PT) |
| **H1.4** | Retenciones B2B DANE | 1 | 17/17 PASS | ✅ COMPLETO |
| **H1.5** | Contingencia + eliminar mockStamp | 1 | 24/24 PASS | ✅ COMPLETO |
| **H1.6** | Renderer QR DIAN ticket | 1 | 17/17 PASS | ✅ COMPLETO |
| **H2.A** | Perfiles barrio rotos | 1 | 17/17 PASS | ✅ COMPLETO |
| **H2.B** | Reversión inventario al anular | 1 | 21/21 PASS | ✅ COMPLETO |
| **H2.C** | CMV + rentabilidad | 1 | 18/18 PASS | ✅ COMPLETO |
| **H2.D** | Semáforo 🟢🟡🔴 + card hub | 1 | 28/28 PASS | ✅ COMPLETO |
| **H2.E** | planProducto (basico/medio/grande) | 1 | 32/32 + clinical | ✅ COMPLETO |
| **H3a** | Offline real G1 (narrativa + demo) | 1 | offline-combat + sede-combat 21/21 | ✅ COMPLETO |
| **L★** | Conectividad legendaria L1+L2+L3 | 1 | legendary 34 + clinical + flota 100 | ✅ COMPLETO |

**Balance H1+H2+H3a+L★:** 14 frentes completos, 1 diferida (H1.3).

### Fases PENDIENTES (lo que queda por hacer)

| Fase | Nombre | Esfuerzo | Prioridad | Estado técnico |
|---|---|---|---|---|
| **H2.F** | OCR facturas proveedor (Tesseract) | L | MEDIA | Plan detallado abajo |
| **H3b** | Transparencia precio vs mercado | S | MEDIA | Grieta mercado G3 |
| **H3c** | iFood + multi-delivery unificado | L | BAJA | Grieta mercado G2 |
| **H4** | Cumplimiento no-fiscal (Ley 1581, PCI, sanitaria) | M | MEDIA | Ver plan OPORD original |
| **H1.3** | Firma XAdES propia .p12 | XL | BAJA | Cuando haya certificado DIAN |

---

## 🏗️ MÓDULOS NUEVOS CREADOS (inventario de código)

### Módulos H1 (Fiscal) — en `app/modules/` + `app/core/pos/`
| Archivo | Función | Boot position |
|---|---|---|
| `CrozzoNivelesMadurez.js` | 5 niveles (Semilla→Cadena) + reglas habilitación/bloqueo | 43 |
| `CrozzoSandboxFiscal.js` | Nivel 0 Sandbox + candado anti-CUFE-real + dataset ficticio | 44 |
| `CrozzoDetectorMadurez.js` | Detectores crecimiento (ingresos/PILA/sedes/B2B) + resumenPanel | 45 |
| `CrozzoMotorImpuestos.js` | IVA + INC + Saludables SEPARADOS (Ley 2277/2022) | 46 |
| `CrozzoTipoDocumento.js` | Decisor FEV vs tiquete automático | 47 |
| `CrozzoContingenciaFiscal.js` | Offline + evento significativo + SLA 48h | 48 |
| `CrozzoRetenciones.js` | B2B ReteFuente/IVA/ICA por municipio DANE | 49 |
| `CrozzoTicketQR.js` | Renderer QR VPFE DIAN + nº validación | 50 |
| `CrozzoReversionInventario.js` | Anular factura restaura stock + auditoría | 51 |
| `CrozzoRentabilidad.js` | CMV por factura + rentabilidad período/categoría/plato | 52 |
| `app/data/tarifas_saludables_2026.json` | Tabla tarifas bebidas azucaradas + ultraprocesados | data |

### Tests en `scripts/` (suite fiscal + costeo)
`_legalidad-fiscal-check`, `_niveles-madurez-check`, `_rampa-madurez-check`, `_impuestos-saludables-check`, `_tipo-documento-check`, `_contingencia-fiscal-check`, `_retenciones-b2b-check`, `_ticket-qr-check`, `_perfiles-barrio-check`, `_reversion-inventario-check`, `_cmv-rentabilidad-check`

### Extensiones a existentes
- `CrozzoPosConfigManager.js`: bloque `madurez` (nivel 0-4 + regimenFiscal + planProducto pendiente) + migración + getters
- `CrozzoPosDianLib.js`: candado Sandbox en `timbrarFactura`, `mockStamp` neutralizado (C4 resuelto), `buildNotaCredito/DebitoUBL21`, `WithholdingTaxTotal`
- `CrozzoPerfilesOperativos.js`: 3 perfiles barrio (frutería/abasto/minimarket) + menús por rol
- `CrozzoPerfilesBiblioteca.js`: grupo 'comercios-barrio' en catálogo
- `CrozzoOnboardingOperativo.js`: `maybeSeedSandboxDataset` + `renderMiCrecimientoPanelHtml` (⚠️ este último NO tiene caller — enchufar en H2.D/E)
- `CrozzoPosMain.js`: `crozzoIsBasicoEmpresaPerfil` arreglado (6 perfiles)

---

## 🚀 CÓMO CONTINUAR (paso a paso para nuevo chat/sesión)

### Paso 1: Verificar el campo (2 min)
```bash
cd "C:\proyectos\sistema pos"
git status -sb                    # debe estar limpio en task/aligned-20260727
npm run mind:health               # Stack mente LISTO
npm run test:madurez              # 3 tests fiscales PASS
node scripts/_cmv-rentabilidad-check.mjs   # CMV PASS
```

### Paso 2: Leer los recuerdos de Synapse
```bash
npm run synapse:search -- "H1 H2 costeo madurez fiscal"
```
Ahí están todos los recuerdos de las fases completadas con detalles técnicos.

### Paso 3: Elegir la siguiente fase
Ir a la sección "PLANES DETALLADOS PENDIENTES" abajo y ejecutar la fase elegida.

### Paso 4: Doctrina de ejecución (OODA por fase)
1. Crear módulo nuevo en `app/modules/`
2. Crear test en `scripts/_<nombre>-check.mjs`
3. Integrar al boot en `app/index.html` (posición correcta)
4. Añadir al `package.json` (test:sync-clinical + script npm)
5. `npm run map:refresh && npm run sync`
6. `git commit` con mensaje detallado
7. Guardar recuerdo en Synapse

### Paso 5: Comandos esenciales
```bash
npm run sync              # app/ → src/ (TRAS editar app/)
npm run map:refresh       # regenerar mapas
npm run test:sync-clinical # gate clínico completo (todos los tests)
npm run synapse:remember -- --path crozzo/canon --title "..." --content "..."
npm run tauri:dev         # levantar app desktop (5-10min primera vez)
```

---

## 📐 PLANES DETALLADOS PENDIENTES

### H2.D — SEMÁFORO 🟢🟡🔴 DE MARGEN ✅ COMPLETO (2026-07-30)

**Entregado:**
- `app/modules/CrozzoSemaforoMargen.js` + boot tras Rentabilidad
- Puente `semaforoDesdeRentabilidad` en `CrozzoRentabilidad.js`
- Hub: `crozzoInicioOpRentabilidadHoyHtml` (peek siempre; detalle al pedir; forceOpen solo 🔴 con ventas)
- Enchufe `renderMiCrecimientoPanelHtml` dentro del reveal
- Toast 🔴 en `cascadeMpChangeToMenu`
- CMV al cobrar (`enriquecerFacturaConCmv` en path de factura)
- `scripts/_semaforo-margen-check.mjs` 28/28 + `test:semaforo-margen` en clinical

---

### H2.E — planProducto (basico/medio/grande) ✅ COMPLETO (2026-07-30)

**Entregado (filtro ortogonal — NO mutar `crozzoIsBasicoEmpresaPerfil`):**
- `app/modules/CrozzoPlanProducto.js` + boot en `index.html` (antes de PosMain)
- `madurez.planProducto` default `basico` + `getPlanProducto`/`setPlanProducto` en ConfigManager
- Gates: `crozzoUserCanAccessOperationalPage`, cinturón `renderMenusByRole`, `auditoria` en `currentUserCanSeePage`
- Panel «Mi crecimiento»: plan actual + sugerencia subir (manual)
- Deny basico: conexiones, fed, nómina, `compras-dashboard`, auditoría — **sin** tocar `centro-compras` (caja)
- Superadmin bypass intacto
- `scripts/_plan-producto-check.mjs` 32/32 + `test:plan-producto` en clinical
- `test:perfiles-barrio` PASS (frutería caja = 4 ítems)

---

### H2.F — OCR DE FACTURAS PROVEEDOR (con confidence score)

**Objetivo:** setup de catálogo de 90 días → 1 tarde. Feature #1 que enamora.

**Archivos a crear:**
- `app/modules/CrozzoOcrFactura.js`:
  - `escanearFactura(imagen)`: usa `tesseract.js` (ya en devDeps) para OCR
  - `parsearFactura(texto)`: regex/heurística → proveedor, fecha, items (desc, qty, precio)
  - `confidenceScore(linea)`: 0-100 por línea (basado en nitidez, completitud)
  - `sugerirCatalogo(facturaParseada)`: crea items de catálogo MP desde la factura
- `scripts/_ocr-factura-check.mjs`: test con imagen sintética

**UX de corrección de 1 toque:**
- Tras escanear: líneas con badge 🟢 95% / 🟡 70% / 🔴 40%
- Chef corrige solo 🟡🔴; 🟢 se aceptan bulk
- Psicología: honestidad (confidence visible) → confianza → apego

**Integración:**
- `CrozzoCatalogoMp.applyRecepcionItems` (existe): recibe items del OCR
- Flujo: escanear → parsear → corregir → aplicar (dispara cascada MP→plato)

**NOTA Tesseract:** `tesseract.js` está en devDeps. Funciona en navegador (WebAssembly). Para APK puede requerir ajuste (ver `app/vendor/tesseract-core`).

**PASS criteria:**
- Imagen sintética de factura → parseo detecta items + precios
- Confidence score por línea (no 100% ciego)
- Sugerencia de catálogo desde factura parseada
- Test 12+ verificaciones PASS

---

### H3 — GRIETAS DE MERCADO

**H3a — Offline real (G1) ✅ COMPLETO (2026-07-30):**
- `scripts/_offline-combat-demo.mjs` + `npm run test:offline-combat`
- Scorecard label **Offline real** (= `offline_fleet`, sin cambiar pesos)
- Narrativa [`OFFLINE-COMBAT-NARRATIVE.md`](OFFLINE-COMBAT-NARRATIVE.md)
- Gate `test:sede-combat` incluye demo + narrativa (21 checks)

**H3b — Transparencia precio (G3):** comparador visible "Costo real Fudo: $X · Crozzo: $Y". Doc `docs/maps/PRICING-VS-MERCADO-CO.md`. Esfuerzo S.

**H3c — iFood + multi-delivery (G2):** research API iFood Colombia, inbox unificado Rappi+iFood+DiDi. Esfuerzo L. Mayor investigación.

---

### H4 — CUMPLIMIENTO NO-FISCAL
- H4.1 Ley 1581/2012 (datos personales): consentimiento CRM + RNBD
- H4.2 PCI DSS v4.0 (pagos): auditar no almacenar CVV/track, PAN truncado
- H4.3 Sanitaria: trazabilidad lote/caducidad, bloqueo alcohol menores/horario
- H4.4 Retención 5 años (ET art. 632): backups 3-2-1

---

## 🔌 GAPS DE UI DETECTADOS (enchufar motores a pantallas)

Los **motores** funcionan (tests PASS) pero faltan las **pantallas** que los muestran:

| Motor | Estado | UI faltante | Dónde enchufar |
|---|---|---|---|
| Reversión inventario (H2.B) | ✅ motor+UI | Botón Anular en Facturas | `CrozzoPosFacturasPage.js` (2026-07-30) |
| CMV + rentabilidad (H2.C) | ✅ motor+UI | Página Gestión → Rentabilidad | `CrozzoRentabilidadPage.js` (2026-07-30) |
| Semáforo (H2.D) | ✅ motor+UI | Peek + reveal en hub | `crozzoInicioOpRentabilidadHoyHtml` |
| Mi crecimiento (H1.0g) | ✅ motor+UI | En reveal rentabilidad | caller en hub H2.D |
| planProducto (H2.E) | ✅ motor+gating | Plan en «Mi crecimiento»; set vía `setPlanProducto` | filtro ortogonal (NO mutar isBasico) |

**Prioridad restante:** H2.F OCR · H3b pricing · H3c iFood · H4.  
**Cola mando (jul-30):** … → H2.E ✅ → **Conectividad legendaria L1–L3 ✅** (falta firma humana D1–D3 en sede).

### Conectividad legendaria (L★) ✅ COMPLETO (código 2026-07-30)

- L1: [`LEGENDARY-CONNECTIVITY-DRILLS.md`](LEGENDARY-CONNECTIVITY-DRILLS.md) + `test:legendary-connectivity`
- L2: jitter deviceId (WS + healAnchorSilence) + purge Rust `COMANDAS_ACTIVE_MAX` 800
- L3: [`CrozzoSedeAutosanable.js`](../../app/infra/CrozzoSedeAutosanable.js) — Diag Reparar; sin FleetReconcile (KI-016)
- Gate: clinical PASS · fleet-escala intensiva 100 OK=17

---

## 📚 DOCTRINA Y REFERENCIAS CLAVE

| Documento | Qué contiene |
|---|---|
| `AGENTS.md` | Guía para agentes (Cursor/ZCode) — empezar aquí |
| `docs/maps/FISCAL-CO-BLOQUEANTES.md` | Los 12 requisitos fiscales DIAN + estado código |
| `docs/maps/MADUREZ-EMPRESARIAL-CO.md` | Los 5 niveles Semilla→Cadena + API |
| `docs/maps/MILITARY-COMMAND-DOCTRINE.md` | Doctrina DDIL + INTEL mercado (WARO/Cuenti/iFood) |
| `docs/maps/INDEX.md` | Índice de mapas (4 secciones) |
| `docs/maps/known-issues.json` | 38 issues (28 resolved, 10 watch) |

### Lo que NO se toca (preservar siempre)
- `CrozzoCostosEngine.js` (fórmulas K3-K11 del QyC profesional)
- `cascadeMpChangeToMenu` (recosteo en vivo MP→plato→matriz)
- Cascada de conectividad (146 checks PASS, aguanta 100 dispositivos)
- Motor fiscal H1 (8 tests PASS)

### INTEL mercado clave (jul 2026)
- **Nuevos entrantes:** WARO ($7.992/mes), Cuenti, POS Colombia — amenazan low-end
- **3 grietas:** G1 offline real (único en CO), G2 iFood nativo (nadie), G3 transparencia precio
- **3 amenazas:** A1 migración DIAN 2026, A2 IA como piso, A3 consolidación Bancolombia

---

## ⚠️ NOTAS OPERACIONALES IMPORTANTES

1. **`src/` es espejo autogenerado.** Editar SIEMPRE `app/`, luego `npm run sync`.
2. **Ollama debe estar corriendo** para Synapse semántico. Sin él, cae a BM25 (sigue funcionando).
3. **`synapse/` es repo externo anidado** (RaffaelFerro/synapse), ignorado en git. La DB es local.
4. **Workflow CI clínico** (`.github/workflows/sync-clinical-check.yml`) corre todos los tests en PR.
5. **Backup de seguridad:** branch `backup/pre-align-20260727` + stash + tags `archive/wt1-*`/`archive/wt2-*`.
6. **Push a origin:** los 21 commits están LOCALES en `task/aligned-20260727`. Hacer `git push -u origin task/aligned-20260727` cuando se quiera respaldar.

---

## 🎖️ RESUMEN PARA EL COMANDANTE

**Lo logrado (H0 + H1 + H2.A-C):**
- Campo estabilizado (git limpio, Synapse sano, mapas frescos)
- Motor fiscal completo (12 requisitos DIAN cubiertos, C4 CUFE simulado eliminado)
- Sistema de madurez (frutería → cadena multi-sede, acompañamiento progresivo)
- Costeo cerrado (CMV + rentabilidad + reversión al anular)
- 153 tests PASS verificando todo

**Lo que falta (H2.E-F + H3b-c + H4):**
- planProducto (3 fases; filtro ortogonal)
- OCR facturas (vs WARO)
- H3b transparencia precio + H3c iFood
- H4 no-fiscal

**La base es sólida.** El núcleo (cascada costeo + conectividad + motor fiscal) está preservado y verificado. Lo que queda es aditivo.
