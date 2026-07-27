# Requisitos fiscales bloqueantes — Colombia (DIAN / ET)

**Vigencia:** 2026-07-27 · **Fuente:** INTEL J2-F (auditoría código + marco legal verificado)
**Doctrina:** [MILITARY-COMMAND-DOCTRINE.md](MILITARY-COMMAND-DOCTRINE.md) §1 "Honestidad de combate"
**Plan derivado:** H1 (OPORD CROZZO) — ver [MEJORA-SUPERIOR-MERCADO-CO-PLAN.md](MEJORA-SUPERIOR-MERCADO-CO-PLAN.md)

> **Lectura obligatoria antes de tocar el módulo fiscal.** Sin estos 12 requisitos, **ningún peso se factura legalmente en Colombia** a julio 2026. La validación previa (VPFE) es obligatoria; no existe "validación posterior".

---

## Marco normativo canónico

| Norma | Qué define |
|-------|------------|
| **Res. DIAN 165/2023** | Texto compilado FEV, documento equivalente, nota crédito/débito, contenedor electrónico |
| **Res. DIAN 008/2024** | Modifica calendario obligatoriedad documento equivalente POS |
| **Res. DIAN 202/2025** | Actualiza obligaciones de transmisión y calendarios |
| **Res. DIAN 0247/2025** | Tarifas bebidas azucaradas 2026 ($/L por rangos de azúcar) |
| **Anexo Técnico FEV v1.9** | Especificaciones UBL 2.1, eventos significativos, representación gráfica |
| **Art. 616-1 ET** | Validación previa obligatoria (VPFE) — base del CUFE/CUDE |
| **Art. 632 ET** | Conservación comprobantes 5 años |
| **Art. 437 ET** | Responsable de IVA |
| **Art. 468-468-3 ET** | Tarifas IVA (19%/5%/0%/excluido) |
| **Art. 512-1 ET** (Ley 1819/2016) | Impuesto Nacional al Consumo 8% restaurantes/bares/cervezas |
| **Art. 908 ET** (Ley 1943/2018) | Simple de Tributación |
| **Ley 2277/2022 art. 54** | Impuestos Saludables (bebidas azucaradas + ultraprocesados 20%) |
| **Ley 1935/2018** | Propina voluntaria (≤10% sugerida, fuera de base gravable) |
| **Art. 652 y 652-1 ET** | Sanciones por no facturar / factura sin requisitos (1 UVT/factura) |

**Consulta pública de validez CUFE:** https://catalogo-vpfe.dian.gov.co/

---

## Los 12 requisitos bloqueantes — estado actual en código

Auditoría J2-F (2026-07-27): **1 ✅ · 6 🟡 · 5 ❌** + 1 violación de doctrina (CUFE simulado).

| # | Requisito | Norma | Estado | Evidencia código | Esfuerzo |
|---|-----------|-------|--------|------------------|----------|
| 1 | **VPFE validación previa** (CUFE antes de entregar al cliente) | Art. 616-1 ET; Res. 165/2023 | 🟡 PARCIAL | Consulta ✅ (`dian_vpfe.rs`); emisión ❌ (`CrozzoPosMain.js:33037` timbra sin validar) | M |
| 2 | **UBL 2.1 + transmisión** Dataico/PT | Anexo Técnico v1.9 | 🟡 PARCIAL | UBL ✅ (`CrozzoPosDianLib.js:149`); Dataico real ✅ (`:378`); **falta firma XAdES propia** | L |
| 3 | **Representación gráfica** (frase + CUFE + QR + nº validación) | Res. 165/2023; Concepto 4232/2024 | 🟡 PARCIAL | Frase ✅ (`CrozzoTermicaColombia.js:408`); bloque QR ✅ (`:1245`); **renderer QR NO vinculado** | S |
| 4 | **Contingencia offline + 48h + evento significativo** | Art. 37 Res. 165/2023 | 🟡 PARCIAL | Cola ✅ (`CrozzoFiscalOutboxDrain.js`); **localStorage** (no SQLite); **0 reporte evento significativo** | M |
| 5 | **IVA por producto** (19/5/0/excluido) | Art. 468 ET | 🟡 PARCIAL | `ivaRate` ✅ (`CrozzoPosMain.js:22916`); **forzado por perfil**, no por SKU | S |
| 6 | **INC 8%** restaurantes/bares/cervezas | Art. 512-1 ET (Ley 1819/2016) | 🟡 PARCIAL | `impuestoAlConsumo` ✅ config; **tasa fija única**, no por SKU | S |
| 7 | **Impuestos Saludables** (bebidas $/L + ultraprocesados 20%) | Ley 2277/2022 art. 54 | ❌ FALTA | **0 hits** en `app/` y `src-tauri/` | **L** |
| 8 | **Propina voluntaria ≤10%** fuera base gravable | Ley 1935/2018; Oficios DIAN 77297/2013, 902460/2022 | ✅ OK | `CrozzoPosMain.js:28210-28370` (propina fuera base); revisar tope UX 30%→10% | — |
| 9 | **Tiquete electrónico** (doc. equivalente) vs FEV | Res. 165/2023 art. 1 num. 14 | ❌ FALTA | `tipoDocumento:'01'` forzado (`CrozzoPosMain.js:32854`) — solo emite FEV | M |
| 10 | **Nota crédito + nota débito** electrónicas | Res. 165/2023 art. 1 num. 16 | ❌ FALTA | **0 emisión** (solo lectura en Compras); `buildUBL21` sin rama CreditNote | L |
| 11 | **Config régimen tributario** (Responsable/No/Simple) | Arts. 437, 908 ET | 🟡 PARCIAL | `regimenTributario` solo en proveedores; sin `TaxLevelCode` emisor | S |
| 12 | **Retenciones B2B** (ReteFuente/IVA/ICA por municipio) | ET; normas ICA municipales | ❌ FALTA | **0 en emisión** (solo en compras a proveedores); sin base DANE municipal | L |

---

## 🚨 VIOLACIÓN DE DOCTRINA — CUFE simulado (C4)

**La doctrina "honestidad de combate" prohíbe simular facturación. Hoy existe:**

- `mockStamp()` en `app/core/pos/CrozzoPosDianLib.js:280-293`: genera un hash SHA-384 sobre campos equivocados y lo etiqueta `cufe`. El CUFE DIAN real exige 38 campos. **Nunca producirá un CUFE válido.**
- `calcularCUFE()` en `CrozzoPosDianLib.js:112-127`: algoritmo incorrecto.
- Se invoca en `modoDemo` y providers `Siigo`/`Facturama`/default.
- Es honesto en etiquetar (`isDemo:true`, warning `allowSimulatedStamp`), pero el hash en sí es una falsificación.

**Fix H1.5 (no negociable):** eliminar `mockStamp`. Sin PT/cert configurado = **bloqueo duro + cola**, nunca CUFE falso. La integridad de Crozzo depende de esto.

---

## Plan H1 (orden de batalla J2-F)

Priorizado por riesgo legal + dependencias. **H1 es lo que hace a Crozzo legal en CO.**

| Fase | Requisito(s) | Esfuerzo | Detalle |
|------|--------------|----------|---------|
| **H1.1** | 5, 6, 7 (Impuestos Saludables + tarifa real por SKU) | XL | Nuevo `CrozzoMotorImpuestos.js`; campos catálogo `ivaRate`/`incRate`/`saludableTipo`/`saludableBase`; tabla `tarifas_saludables_2026` (Res. 0247/2025); refactor `crozzoLineaTasaImpuesto` |
| **H1.2** | 9, 10 (Tiquete + Nota crédito/débito) | L | Decisión auto FEV vs Doc. Equivalente; extender `buildUBL21` con CreditNote/DebitNote |
| **H1.3** | 2 (Firma XAdES propia) | L | Nuevo `crozzo_firma_xades.rs` (carga .p12, XAdES-BES); independencia del PT |
| **H1.4** | 12 (Retenciones B2B DANE) | L | Tabla `rete_ica_municipal`; `WithholdingTaxTotal` en UBL |
| **H1.5** | 1, 4 + C4 (VPFE + evento significativo + eliminar mockStamp) | M | Validar CUFE vs VPFE antes de imprimir; migrar cola localStorage→SQLite; SLA 48h; reporte evento significativo |
| **H1.6** | 3 (Renderer QR + nº validación) | S | Vincular `jsqr` al bloque `{t:'qr'}`; nº validación DIAN |

**CRITERIO PASS H1:** emitir FEV + tiquete + nota crédito en lab, todos con CUFE consultable en VPFE, online Y offline (cola drena <48h con evento reportado). **Cero CUFE simulado en código.**

---

## Verificación post-H1

```bash
# Tras cada fase H1.x:
npm run edit:scope -- app/core/pos/CrozzoPosDianLib.js <símbolo>
npm run sync
npm run test:sync-clinical

# Validación fiscal end-to-end (cuando H1 completo):
# 1. Emitir FEV en modo online → verificar CUFE en catalogo-vpfe.dian.gov.co
# 2. Cortar WAN → emitir 10 facturas en contingencia → volver WAN → drenar <48h
# 3. Generar nota crédito sobre factura anterior → CUFE de nota consultable
# 4. Cuenta mixta (cerveza INC + gaseosa saludable + comida 0%) → impuestos correctos
```

---

## Fuentes oficiales (verificar antes de release)

- Res. DIAN 165/2023: https://www.dian.gov.co/normatividad/Normatividad/Resolución%20000165%20de%2001-11-2023.pdf
- Res. DIAN 008/2024: https://www.dian.gov.co/normatividad/Normatividad/Resolución%20000008%20de%2031-01-2024.pdf
- Res. DIAN 0247/2025 (bebidas 2026): https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0247_2025.htm
- Anexo Técnico v1.9: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf
- Catálogo VPFE (consulta CUFE): https://catalogo-vpfe.dian.gov.co/
- Concepto DIAN 4232/2024 (representación gráfica): https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_4232_2024.htm
- Ley 2277/2022 (impuestos saludables): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=199883
- Ley 1935/2018 (propina voluntaria): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=87873

**Items a confirmar en fuente primaria antes de release:** montos exactos UVT de sanciones (arts. 652, 652-1 ET vigente 2026), numeración canónica 1–14 de eventos significativos del Anexo 1.9, tarifas exactas $/L bebidas azucaradas 2026 (Res. 0247/2025).
