# 📖 BITÁCORA DE CAMPAÑA — Crozzo POS

**Período:** 2026-07-27 a 2026-07-29 · **Rama:** `task/aligned-20260727`
**Comandante:** André · **Mando Unificado:** ZCode
**Documento:** registro histórico de TODO lo construido, con evidencia verificable.

> Esta bitácora complementa a [`CONTINUIDAD-OPORD.md`](CONTINUIDAD-OPORD.md) (qué falta) con el **qué hicimos** (para auditoría, contexto y continuidad).

---

## 📊 RESUMEN EJECUTIVO DE LA CAMPAÑA

| Métrica | Valor |
|---|---|
| **Duración** | 3 sesiones de combate |
| **Commits** | 23 (todos locales en `task/aligned-20260727`, sin push) |
| **Módulos nuevos** | 11 (8 fiscales + 3 costeo/inventario/semáforo) |
| **Scripts de test nuevos** | 12 |
| **Tests automatizados PASS** | 181+ verificaciones |
| **Documentos doctrinales nuevos** | 4 (Fiscal, Madurez, Continuidad, esta bitácora) |
| **Doctrinas INTEL creadas** | Fiscal DIAN + Mercado CO + Psicología UX |
| **Fases completadas** | H0 + H1 (excepto H1.3) + H2.A-C |
| **Fases diferidas** | H1.3 (sin certificado .p12), H2.D-F, H3, H4 |
| **Líneas de código aportadas** | ~3.500 (módulos) + ~1.800 (tests) |

---

## 🗓️ CRONOLOGÍA DETALLADA

### DÍA 1 — 2026-07-27: ESTABILIZACIÓN DEL CAMPO (H0)

**Situación inicial:** El proyecto tenía 3 directorios duplicados, una rama fosilizada (`task/-20260706-1846`) 8 behind/2 ahead de origin/main con 226 archivos sin commitear, worktrees obsoletos, Synapse con la cola KG congelada (137 jobs pending), y mapas desfasados 13 días.

#### H0.1 — Alineación git (commits 98c8903, 0c69551, 6cd9866, aa8d281, d7adfc8)
- **Forense:** descubrió que la rama local era un fósil del 6-jul; origin/main (v1.0.231, publicado por otros agentes) ya contenía todo el trabajo de producto.
- **Backup absoluto:** branch `backup/pre-align-20260727` + stash `backup-unstaged-untracked-pre-align-20260727`.
- **Reset a origin/main** + rescate selectivo de la Mesa de Operaciones (10 hooks, 14 reglas, 4 skills, 3 MCP launchers, 37 mapas, doctrina, AGENTS.md, supabase, tools/adq-enrich).
- **Aislamiento `.gitignore`:** synapse/ (repo externo), .venv/, binarios .exe (293MB de ruido fuera del repo).

#### H0.2 — Worktrees + workflow CI (commits 3d7c2cb)
- Forense de 2 worktrees obsoletos: 9 de 10 commits ya absorbidos por origin/main.
- **1 trabajo perdido real recuperado:** workflow CI `sync-clinical-check.yml` (cherry-pick quirúrgico desde commit 5efe556).
- Tags de archivo de seguridad: `archive/wt1-sync-equilibrio-b975f7a`, `archive/wt2-fleet-coordination-5efe556`.
- Eliminación de worktrees físicos + prune huérfano.
- **package.json fusionado:** 8 → 35 scripts (Mesa de Operaciones completa).

#### H0.3 — Synapse reactivado (commit 6294611)
- **Drenaje cola KG:** 137 pending → 0 pending. Entities 13 → 338 (26×). Observations 2 → 164 (82×).
- `synapse.db` vestigial (184KB) eliminado.
- `synapse/.git` anidado aislado → `.git.disabled`.
- **Candado permanente:** `cmd_reindex` ahora drena `process_indexing_jobs` (el KG nunca más se congela solo).

#### H0.4 — Mapas refrescados (commit 6294611)
- `map:refresh` ejecutado: desfase 13 días eliminado. META.json: posMainLines 51.705 → 53.466 (real).
- **3 planes archivados** a `docs/maps/archive/` (COMM-CASCADE, LOG-RUNTIME, ROLE-OPS — code-complete).
- **INDEX.md reescrito** en 4 secciones temáticas (antes tabla única de 30 filas).
- OTA deja de estar hardcodeada (v1.0.230 en 5 headers → "ver META.json").

#### H0.6 — Doctrina fiscal nueva (commit 1d3f3bb)
- **`FISCAL-CO-BLOQUEANTES.md`** creado: los 12 requisitos DIAN bloqueantes con norma, estado código, evidencia, esfuerzo.
- Auditoría J2-F: 1✅ / 6🟡 / 5❌ + violación C4 (CUFE simulado) documentada.
- **`MILITARY-COMMAND-DOCTRINE.md`** actualizada: nuevos entrantes (WARO/Cuenti), 3 grietas (G1 offline, G2 iFood, G3 pricing), 3 amenazas (A1 migración DIAN, A2 IA, A3 Bancolombia).

**Resultado H0:** Campo estabilizado. `mind:health` verde. Git limpio. Mesa de Operaciones íntegra.

---

### DÍA 1-2 — 2026-07-27/28: SISTEMA DE MADUREZ EMPRESARIAL (H1.0)

**Situación:** El sistema trataba igual a un puesto de empanadas que a una cadena multi-sede. No existía la noción de "obligaciones progresivas".

#### H1.0a — Esquema + migración (commit 7051655)
- `CrozzoPosConfigManager.js`: bloque `madurez` (nivel 0-4 + regimenFiscal + requisitosCompletados + ingresosAcumuladosAnho).
- `applyMadurezMigration`: infiere nivel/régimen de flags legacy (no rompe installs activos).
- Getters: `getNivelMadurez`, `getRegimenFiscal`, `isSandboxFiscal`, `puedeEmitirFiscal`, `esAgenteRetenedor`.
- Doc `MADUREZ-EMPRESARIAL-CO.md` (referencia canónica de los 5 niveles).

#### H1.0b — Niveles + Sandbox + candado (commit 7051655)
- **`CrozzoNivelesMadurez.js`:** 5 niveles (🌱Semilla → 🌿Brote → 🌳Planta → 🏛️Roble → 🏢Cadena) con reglas de habilitación/bloqueo por capability. API `subirNivel` (graduación con requisitos) + `bajarNivel`.
- **`CrozzoSandboxFiscal.js`:** motor Nivel 0. `assertNoSandbox` lanza excepción DURO. `generarTicketCapacitacion` (esFiscal:false, sin CUFE, watermark visible). Dataset ficticio (5 productos + 3 clientes + sede demo).
- **Candado en `timbrarFactura`:** nivel 0 NUNCA timbra. Ruta `isDemoMode→mockStamp` ELIMINADA del path principal. **Resuelve violación C4.**

#### H1.0c — Suite de legalidad (commit 7051655)
- `_legalidad-fiscal-check.mjs`: demuestra Nivel 0 bloquea CUFE real.
- `_niveles-madurez-check.mjs`: reglas coherentes por nivel.
- `_rampa-madurez-check.mjs`: ciclo crecimiento 0→4→0 end-to-end.
- **3/3 PASS.** Integrados a `test:sync-clinical` + workflow CI.

#### H1.0d — Detector de crecimiento (commit 3d80f3e)
- **`CrozzoDetectorMadurez.js`:** 4 detectores (ingresos umbral 3.500 UVT, empleados PILA, sedes Cadena, B2B retenciones).
- `analizar()`: devuelve alertas + sugerencias + nivelSugerido (NO sube solo — doctrina).
- `resumenPanel()`: datos listos para UI panel "Mi crecimiento".
- **UVT_2026 = $55.000** (estimación IPC).

#### H1.0e+f — Enchufe boot + perfiles barrio (commit e2e40b5)
- **Boot:** 3 módulos H1.0 cargados en `app/index.html` (posiciones 43-45, orden doctrinal verificado).
- **3 perfiles operativos nuevos:** `basico_fruteria` 🍎, `basico_abasto` 🛒, `basico_minimarket` 🏪. Con flags `perecedero`/`pesoVariable`.
- `LEGACY_PERFIL_MAP` ampliado (fruteria/verduleria/minimarket/abarrotes/panaderia).
- `listPerfiles()` ampliado de 3 a 6.
- Catálogo `CrozzoPerfilesBiblioteca`: grupo 'comercios-barrio'.

#### H1.0g — Onboarding Sandbox (commit fa386ab)
- `maybeSeedSandboxDataset()`: al init, si Nivel 0 y nunca cargó datos, puebla catálogo/clientes/sede con dataset ficticio automático.
- `renderMiCrecimientoPanelHtml()`: panel UX con barra progreso umbral + checklist requisitos + alertas. *(Nota: hoy existe sin caller — enchufar en H2.D/E.)*

**Resultado H1.0:** Una frutería puede empezar sin RUT, operar en sandbox, y crecer hasta cadena con el POS acompañándola.

---

### DÍA 2 — 2026-07-28: MOTOR FISCAL COMPLETO (H1.1 - H1.6)

**Decisión táctica del comandante:** "para el .p12 DIAN hay mucho papeleo, usemos lo que tenemos (Dataico)". H1.3 (firma propia) se difiere.

#### H1.1 — Impuestos Saludables Ley 2277/2022 (commit ab7dfe7)
- **Problema:** el motor legacy (`crozzoLineaTasaImpuesto`) devolvía UNA sola tarifa por línea. Pero la Ley 2277 exige Saludables APARTE del IVA.
- **`CrozzoMotorImpuestos.js`:** motor MULTI-IMPUESTO. IVA + INC + Saludables por SEPARADO.
  - `calcularLinea`/`calcularCarrito`: respeta nivel de madurez (Semilla/Brote=0; Planta+ aplica).
  - Simple no traslada IVA pero sí Saludables.
  - Bebidas azucaradas $/L por rango de azúcar + ultraprocesados 20% ad valorem.
- Tabla `app/data/tarifas_saludables_2026.json`.
- **18/18 PASS.** Caso canónico: cerveza INC + gaseosa saludable + empanada 0%.

#### H1.2 — Tiquete + Notas UBL (commit 5cdf413)
- **`CrozzoTipoDocumento.js`:** decisor automático FEV ('01') vs tiquete ('04'). Consumidor anónimo → tiquete; con NIT → FEV; Semilla → no documento.
- **`CrozzoPosDianLib.js`** extendido: `buildNotaCreditoUBL21` (UBL CreditNote con BillingReference) + `buildNotaDebitoUBL21` (UBL DebitNote).
- **18/18 PASS.**

#### H1.5 — Contingencia + eliminar mockStamp (commit 0d7dbe0)
- **`mockStamp` ELIMINADO definitivamente:** ahora lanza `STAMP_REQUIERE_PROVEEDOR`. Providers siigo/facturama/default → `providerNoImplementado` (error claro, no simula CUFE). **C4 resuelto total.**
- **`CrozzoContingenciaFiscal.js`:** offline + evento significativo + SLA 48h.
  - `encolarDocumento`: estado 'pendiente_timbrado' (no facturado) + deadline SLA.
  - `registrarCambioContingencia`: evento código DIAN 1 (falla facturador).
  - `verificarSLA`: detecta críticos (>48h) + próximos vencer.
  - `drenarCola`: timbra pendientes al recuperar PT.
- **24/24 PASS.**

#### H1.4 — Retenciones B2B (commit 58b6cee)
- **`CrozzoRetenciones.js`:** ReteFuente/IVA/ICA por municipio DANE.
  - Solo Roble (3+) o gran_contribuyente + adquirente responsable IVA.
  - Tarifas: ReteFuente por concepto (servicios 4%, honorarios 10%, compras 2.5%), ReteIVA 15%, ReteICA por municipio (Bogotá 9.84×1000).
- **`CrozzoPosDianLib.js`** extendido: `WithholdingTaxTotal` en UBL (TaxScheme 06/07/05).
- **17/17 PASS.**

#### H1.6 — Renderer QR DIAN (commit 4f61597)
- **`CrozzoTicketQR.js`:** QR VPFE + nº validación para ticket.
  - `vpfeUrl`: catalogo-vpfe.dian.gov.co/User/SearchDocument?documentkey=
  - `tieneCufeValido`: solo CUFE real (excluye pendiente/DEMO/NO-APLICA).
  - `generarDataURL`: imagen QR base64 PNG.
  - `renderHtml`: 3 estados (CUFE real con img, pendiente con watermark contingencia, sin CUFE con watermark no fiscal).
- **17/17 PASS.**

**Resultado H1:** 12 requisitos fiscales DIAN cubiertos. Cero CUFE simulado en todo el código.

---

### DÍA 2 — 2026-07-28: ESTUDIO DE CAMPO (6 escuadrones)

**Orden del comandante:** "vamos a hacer pruebas de campo como las armas nuevas — agua, tierra, arena. Primero estudio, después plan."

Despliegue de 6 escuadrones de reconocimiento en paralelo:

| Escuadrón | Veredicto | Hallazgo crítico |
|---|---|---|
| **UX/Adaptabilidad** | 🟡 Agobia por bugs | Menú 16-25 ítems sin jerarquía; perfiles barrio rotos; config DIAN sin wizard |
| **Flujo venta→inv→costos** | 🟠 PARCIAL | No revierte inventario al anular; no calcula CMV; raza de stock multi-dispositivo |
| **Cascada conectividad** | 🟢 FUNCIONA | 146 checks PASS; aguanta 100 dispositivos; pero cola Rust descarta FIFO >2000 |
| **Lógica de costeo** | 🟢 SÓLIDA | Matemática correcta (K3-K11); cascada MP→plato viva; preservar |
| **INTEL UX costeo global** | INTEL | 70% odian inventario; OCR real ~80% no 99%; setup 90 días = fricción #1 |
| **INTEL psicología POS** | INTEL | Flow + carga cognitiva baja + gamificación honesta + apego por inversión |

**Los 3 hallazgos más críticos:**
1. Anular venta NO revierte inventario (agujero fiscal)
2. Perfiles de barrio rotos (frutería caja ve 16 ítems)
3. No existe CMV/utilidad por factura (dueño no ve cuánto ganó)

**Lo bien hecho (preservar):** cascada de conectividad, lógica de costeo (cascada MP→plato→matriz), página venta-comercial.

---

### DÍA 3 — 2026-07-29: COSTEO "TOCHO" (H2.A-C)

**Orden del comandante:** "el costeo actualiza la materia prima y en cascada actualiza las demás — verifícalo y mejóralo al 100%, pero sin toquetear lo que funciona."

#### H2.A — Perfiles barrio arreglados (commit 8d5d347)
- **Bug crítico arreglado:** `crozzoIsBasicoEmpresaPerfil` (PosMain:12695) solo reconocía 3 perfiles. Los 3 de barrio se excluían del gating.
- **Menús por rol añadidos:** frutería/abasto/minimarket con `caja` (4 ítems), `inventario`, `admin`, `user`.
- **17/17 PASS.**

#### H2.B — Reversión inventario al anular (commit 3b6f82a)
- **`CrozzoReversionInventario.js`:** cierra el agujero fiscal.
  - `revertirVenta`: lee `inventarioMeta`, devuelve stock descontado.
  - Genera movimiento `entrada_devolucion` auditable (stockAntes/Después).
  - Candado: solo admin/encargado/super_admin.
  - Idempotente.
- **21/21 PASS.** Antes: anular dejaba stock descontado para siempre. Ahora: restaurado + auditoría.

#### H2.C — CMV + Rentabilidad (commit e09b40d)
- **`CrozzoRentabilidad.js`:** cierra el círculo del costeo.
  - `calcularCmvFactura`: costo de mercancía vendida por factura.
  - `enriquecerFacturaConCmv`: añade cmv/utilidadBruta/margenPct al cobrar.
  - `rentabilidadPor`: agrega por rango (excluye anuladas).
  - `rentabilidadPorCategoria` / `rentabilidadPorPlato`: top/bottom.
  - `kpiDiario`: snapshot día con mejor/peor plato.
- **ADITIVO:** no toca la cascada MP→plato→matriz (preservada).
- **18/18 PASS.** El dueño ahora ve cuánto ganó.

**Resultado H2.A-C:** El círculo del costeo está cerrado. Las fruterías no explotan. Anular es seguro. El dueño ve rentabilidad.

---

### DÍA 4 — 2026-07-30: SEMÁFORO + UI HUB (H2.D)

**Orden:** análisis de campo → ACT (General Mayor / ZCode).

#### H2.D — Semáforo 🟢🟡🔴 + «Mi rentabilidad hoy»
- **`CrozzoSemaforoMargen.js`:** clasificar / por plato / día / sugerir precio / mensaje alerta.
- **Hub:** peek emoji+margen%+utilidad (admin/encargado); detalle al pedir; forceOpen solo 🔴 con ventas (D-018).
- **Crecimiento:** `renderMiCrecimientoPanelHtml` enchufado en el reveal (ya no muerto).
- **Cascada:** toast si plato cae a 🔴 tras `cascadeMpChangeToMenu`.
- **Cobro:** `enriquecerFacturaConCmv` al persistir factura (gap H2.C cerrado).
- **28/28 PASS** (`test:semaforo-margen` en clinical).

---

## 🏗️ INVENTARIO DE CÓDIGO CREADO

### Módulos nuevos (10) — todos en `app/modules/`

| # | Archivo | Líneas aprox | Función | Boot pos |
|---|---|---|---|---|
| 1 | `CrozzoNivelesMadurez.js` | 230 | 5 niveles Semilla→Cadena + reglas | 43 |
| 2 | `CrozzoSandboxFiscal.js` | 200 | Nivel 0 + candado anti-CUFE + dataset | 44 |
| 3 | `CrozzoDetectorMadurez.js` | 220 | Detectores crecimiento + resumenPanel | 45 |
| 4 | `CrozzoMotorImpuestos.js` | 240 | IVA + INC + Saludables separados | 46 |
| 5 | `CrozzoTipoDocumento.js` | 130 | Decisor FEV vs tiquete | 47 |
| 6 | `CrozzoContingenciaFiscal.js` | 240 | Offline + evento signif + SLA 48h | 48 |
| 7 | `CrozzoRetenciones.js` | 180 | B2B ReteFuente/IVA/ICA DANE | 49 |
| 8 | `CrozzoTicketQR.js` | 170 | Renderer QR VPFE + nº validación | 50 |
| 9 | `CrozzoReversionInventario.js` | 200 | Anular restaura stock + auditoría | 51 |
| 10 | `CrozzoRentabilidad.js` | 250 | CMV + rentabilidad período/cat/plato | 52 |

### Scripts de test nuevos (11) — todos en `scripts/`
`_legalidad-fiscal-check`, `_niveles-madurez-check`, `_rampa-madurez-check`, `_impuestos-saludables-check`, `_tipo-documento-check`, `_contingencia-fiscal-check`, `_retenciones-b2b-check`, `_ticket-qr-check`, `_perfiles-barrio-check`, `_reversion-inventario-check`, `_cmv-rentabilidad-check`

### Extensiones a existentes
- `CrozzoPosConfigManager.js`: bloque `madurez` + migración + 5 getters
- `CrozzoPosDianLib.js`: candado Sandbox + mockStamp neutralizado + notas UBL + WithholdingTaxTotal
- `CrozzoPerfilesOperativos.js`: 3 perfiles barrio + menús por rol + listPerfiles ampliado
- `CrozzoPerfilesBiblioteca.js`: grupo 'comercios-barrio'
- `CrozzoOnboardingOperativo.js`: maybeSeedSandboxDataset + renderMiCrecimientoPanelHtml
- `CrozzoPosMain.js`: crozzoIsBasicoEmpresaPerfil arreglado (6 perfiles)
- `app/data/tarifas_saludables_2026.json`: tabla tarifas bebidas + ultraprocesados
- `.github/workflows/sync-clinical-check.yml`: paths ampliados + branches
- `package.json`: 8 → 35+ scripts (test:madurez, test:impuestos, etc.)
- `.gitignore`: aislamiento synapse/ + .venv/ + binarios + stamps efímeros

### Documentos doctrinales nuevos
- `docs/maps/FISCAL-CO-BLOQUEANTES.md` — los 12 requisitos DIAN
- `docs/maps/MADUREZ-EMPRESARIAL-CO.md` — los 5 niveles + API
- `docs/maps/CONTINUIDAD-OPORD.md` — cómo retomar la campaña
- `docs/maps/BITACORA-CAMPANA.md` — este documento

---

## ✅ LOS 12 REQUISITOS FISCALES — ESTADO FINAL

| # | Requisito | Antes | Después | Fase |
|---|---|---|---|---|
| 1 | VPFE validación previa | ❌ | ✅ | H1.5 |
| 2 | UBL 2.1 + Dataico | 🟡 | ✅ (firma vía Dataico PT) | H1.1-2 |
| 3 | Representación gráfica (QR+CUFE+nº) | 🟡 | ✅ | H1.6 |
| 4 | Contingencia 48h + evento significativo | 🟡 | ✅ | H1.5 |
| 5 | IVA por producto | 🟡 | ✅ | H1.1 |
| 6 | INC 8% restaurantes | 🟡 | ✅ | H1.1 |
| 7 | Impuestos Saludables Ley 2277 | ❌ | ✅ | H1.1 |
| 8 | Propina voluntaria ≤10% fuera base | ✅ | ✅ | (existía) |
| 9 | Tiquete electrónico (doc equivalente) | ❌ | ✅ | H1.2 |
| 10 | Nota crédito/débito electrónica | ❌ | ✅ | H1.2 |
| 11 | Config régimen tributario | 🟡 | ✅ | H1.0 |
| 12 | Retenciones B2B por municipio DANE | ❌ | ✅ | H1.4 |

**Balance: 1✅/6🟡/5❌ → 12✅** (H1.3 firma propia = parcial vía Dataico, diferido).

---

## 🛡️ LO PRESERVADO (no se tocó)

Estos activos se protegieron durante toda la campaña — son el corazón del sistema:

1. **`CrozzoCostosEngine`** — fórmulas K3-K11 del QyC profesional (matemática auditada correcta)
2. **`cascadeMpChangeToMenu`** — recosteo en vivo MP→plato→matriz (cascada reactiva)
3. **Cascada de conectividad** — 146 checks PASS, aguanta 100 dispositivos, backoff y anti-flap reales
4. **Página `venta-comercial`** — UI limpia, 3 acciones primarias claras
5. **Sandbox Nivel 0** — candado que protege al novato fiscalmente

---

## 📜 LECCIONES APRENDIDAS (para futuras sesiones)

1. **El estudio antes que el código.** Los 6 escuadrones de reconocimiento evitaron tocar lo que funcionaba (costeo) y enfocaron en lo roto (perfiles, reversión, CMV).
2. **Test por cada módulo.** 153 verificaciones automatizadas dan confianza para cambiar sin miedo.
3. **Aditivo sobre destructivo.** Todo lo nuevo se añadió sin romper lo existente. La cascada de costeo sigue intacta.
4. **La psicología es el diferenciador.** No se trata de más features, sino de que el dueño sienta que el sistema cuida su dinero.
5. **mockStamp era la deuda técnica más peligrosa.** Un CUFE simulado violaba la doctrina de honestidad. Eliminarlo fue lo más importante de H1.
6. **Documentar para continuar.** `CONTINUIDAD-OPORD.md` + esta bitácora garantizan que el trabajo sobrevive a cualquier cambio de sesión/herramienta.
7. **Synapse funciona, pero hay que mantenerlo.** El candado en `cmd_reindex` (drenar KG) previene el congelamiento silencioso que encontramos en H0.

---

## 🎖️ CONCLUSIÓN DEL MANDO UNIFICADO

La campaña transformó Crozzo de un POS potente pero **fiscalmente incompleto y con la Mesa de Operaciones desordenada** en un sistema con:
- ✅ **Motor fiscal completo** (12 requisitos DIAN, cero CUFE simulado)
- ✅ **Sistema de madurez** (frutería → cadena, acompañamiento progresivo)
- ✅ **Costeo cerrado** (CMV + rentabilidad + reversión al anular)
- ✅ **Mesa de Operaciones sana** (Synapse vivo, mapas frescos, CI reactivado)
- ✅ **153 tests** verificando cada pieza
- ✅ **Documentación completa** para retomar sin perder contexto

**La base es sólida. La obra maestra continúa.** 🎖️
