# Madurez Empresarial Crozzo — la rampa progresiva (H1.0)

**Vigencia:** 2026-07-28 · **Módulo:** [`CrozzoNivelesMadurez.js`](../../app/modules/CrozzoNivelesMadurez.js)
**Sandbox:** [`CrozzoSandboxFiscal.js`](../../app/modules/CrozzoSandboxFiscal.js) · **Config:** `madurez.*` en `CrozzoPosConfigManager`
**Doctrina:** [MILITARY-COMMAND-DOCTRINE.md](MILITARY-COMMAND-DOCTRINE.md) §1 · **Fiscal bloqueante:** [FISCAL-CO-BLOQUEANTES.md](FISCAL-CO-BLOQUEANTES.md)

> **El diferenciador estratégico.** Ningún POS en Colombia acompaña al comerciante desde "puesto de empanadas" hasta "cadena multi-sede". Crozzo detecta el crecimiento, avisa de nuevas obligaciones legales y facilita la transición. Cada nivel **SOLO admite legalidad**.

---

## La idea central

Hay **dos dimensiones ortogonales** que antes estaban confundidas:

1. **Perfil operativo** (qué vende y cómo): restaurante, tienda, hotel F&B → [`CrozzoPerfilesBiblioteca`](../../app/modules/CrozzoPerfilesBiblioteca.js)
2. **Nivel de madurez fiscal** (qué obligaciones legales tiene): informal → cadena → **este documento**

Un "restaurante" (perfil operativo) puede estar en Brote (1) o Cadena (4). La combinación define su operación.

---

## Los 5 niveles

| Nivel | Icono | Nombre | Subtítulo fiscal | Régimen legal | Cuándo |
|---|---|---|---|---|---|
| **0** | 🌱 | **SEMILLA** | Capacitación · sin RUT | no_responsable | Probando, sin RUT, entrenando. Puesto de empanadas informal. |
| **1** | 🌿 | **BROTE** | No responsable IVA · empezando | no_responsable | Con RUT pero <3.500 UVT/año. Tienda de barrio, emprendedor. |
| **2** | 🌳 | **PLANTA** | Responsable IVA · o Simple | responsable_iva, simple | Establecido. >3.500 UVT/año o en Simple (art. 908 ET). |
| **3** | 🏛️ | **ROBLE** | Gran contribuyente · agente retenedor | gran_contribuyente | Declarado gran contribuyente por DIAN. |
| **4** | 🏢 | **CADENA** | Multi-sede · corporativo | gran_contribuyente | Cadena multi-sede o franquicia. |

### Capacidades por nivel (qué se habilita / bloquea)

| Capability | 0 Semilla | 1 Brote | 2 Planta | 3 Roble | 4 Cadena |
|---|:---:|:---:|:---:|:---:|:---:|
| `operacion_pos` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `sandbox_dataset` / `tickets_capacitacion` | ✅ | — | — | — | — |
| `timbrado_dian` / `cufe` / `factura_electronica` | ❌ | ✅* | ✅ | ✅ | ✅ |
| `tiquete_electronico` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `iva_por_sku` / `inc_restaurante` / `impuestos_saludables` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `nota_credito_debito` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `retenciones_b2b` / `retefuente` / `reteiva` / `reteica_municipal` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `consolidacion_multi_sede` | ❌ | ❌ | ❌ | ❌ | ✅ |

*Brote emite tiquete electrónico (documento equivalente), no FEV con IVA.

---

## Umbrales legales (INTEL H0 verificada)

| Umbral | Valor | Norma | Dispara |
|---|---|---|---|
| Responsable IVA persona natural | **3.500 UVT/año** (~$192M COP 2026) | Art. 440 ET | Brote → Planta (régimen `responsable_iva`) |
| Simple de Tributación | Rangos por UVT + actividad | Art. 908 ET (Ley 1943/2018) | Opción alternativa en Planta |
| Facturación electrónica obligatoria | **Sin tope** (todos) | Res. DIAN 165/2023 | Brote+ debe emitir electrónico |
| Gran contribuyente | Declaración DIAN (no umbral ingresos) | DIAN | Planta → Roble |
| Multi-sede | ≥2 sedes | Operativo | Roble → Cadena |
| Empleador (PILA) | 1er empleado | CST | Aviso (no nivel) |

> **UVT 2026 ≈ $55.000 COP** (estimación por IPC; confirmar en Resolución DIAN anual). 3.500 UVT ≈ $192-196M/año.

---

## El Sandbox (Nivel 0) — cómo probamos que SOLO admite legalidad

**Doctrina no negociable:** el Nivel 0 **NO simula CUFE**. No genera hash falso.

### Candado duro en código
- `timbrarFactura()` en `CrozzoPosDianLib.js` llama a `CrozzoSandboxFiscal.assertNoSandbox(config)`.
- Si `nivelMadurez === 0` → lanza `SandboxFiscalException`. **Nunca** llama a DIAN ni a Dataico.
- Reemplaza la ruta legacy `mockStamp` (violación C4 documentada en [FISCAL-CO-BLOQUEANTES.md](FISCAL-CO-BLOQUEANTES.md)).

### Tickets de capacitación
- Emitidos por `CrozzoSandboxFiscal.generarTicketCapacitacion()` (no por `timbrarFactura`).
- Marcados visibles: `"NO VÁLIDO PARA USO FISCAL — MODO CAPACITACIÓN"`.
- Sin CUFE, sin QR DIAN, sin número de validación. `esFiscal: false` explícito.

### Dataset ficticio (carga en 1 clic)
- 5 productos con perfiles variados (IVA mixto, INC, propina, saludables).
- 3 clientes demo (mostrador, fidelizado, empresa S.A.S.).
- 1 sede demo. Todo marcado `esDemo: true`.

### Suite de pruebas automatizada (H1.0c)
- `_legalidad-fiscal-check.mjs`: verifica que en Nivel 0 no se genere documento fiscal.
- `_niveles-madurez-check.mjs`: verifica reglas de habilitación/bloqueo por nivel.
- `_rampa-madurez-check.mjs`: simula crecimiento 0→4 y verifica alertas/graduación.

---

## La rampa: cómo sube el comerciante

**El POS no sube solo.** Subir requiere completar requisitos (graduación). Bajar requiere confirmación expresa.

### Detectores automáticos (H1.0d — `CrozzoDetectorMadurez`)
- **Ingresos:** acumula ventas del año; al acercarse a 3.500 UVT → alerta amarilla "Estás cerca del umbral".
- **Empleados:** 1er empleado → aviso "Ahora debes pagar PILA".
- **Sedes:** añadir sede 2 → sugiere Cadena.
- **B2B:** facturar a NIT de gran contribuyente → sugiere activar retenciones.

### Requisitos de graduación
| Subir a | Requiere |
|---|---|
| Brote (1) | `rutCargado` |
| Planta (2) | `rutCargado` + `resolucionDian` + `certificadoCargado` + `habilitacionDian` |
| Roble (3) | (declaración DIAN gran contribuyente) + mismos de Planta |
| Cadena (4) | ≥2 sedes configuradas |

### Panel "Mi crecimiento" (UX)
- Barra de progreso: "Vas en el 67% del umbral de Responsable IVA".
- Checklist: "Para subir a Planta necesitas: ☑ RUT ☑ Habilitación DIAN ☐ Certificado".
- Botón "Subir de nivel" (con confirmación + explicación legal).

---

## API rápida (para código)

```js
// ¿En qué nivel está el comerciante?
const nivel = CrozzoNivelesMadurez.getNivelActivo(configManager);
// → { id: 1, key: 'brote', icon: '🌿', nombre: 'BROTE', ... }

// ¿Puede hacer X en este nivel?
if (CrozzoNivelesMadurez.puede(configManager, 'factura_electronica')) { ... }
if (CrozzoNivelesMadurez.bloqueado(configManager, 'retenciones')) { ... }

// Candado anti-CUFE en paths fiscales
CrozzoSandboxFiscal.assertNoSandbox(configManager); // lanza si nivel 0

// Ticket de capacitación (Nivel 0)
const ticket = CrozzoSandboxFiscal.generarTicketCapacitacion(factura, configManager);

// Cargar dataset ficticio
CrozzoSandboxFiscal.cargarDataset(cargaProductos, cargaClientes, cargaSede);

// Subir de nivel (con candado de requisitos)
const r = CrozzoNivelesMadurez.subirNivel(configManager, 2);
if (!r.ok) console.warn('No se puede subir:', r.motivo);

// Resumen para UI
const resumen = CrozzoNivelesMadurez.resumen(configManager);
```

---

## Migración de configs legacy

`applyMadurezMigration()` en `CrozzoPosConfigManager` infiere nivel/régimen de flags viejos:
- Configs nuevos → Nivel 0 (Semilla), `no_responsable`.
- Configs legacy con `operacionModo: 'electronic'` + `responsableIVA: true` → Nivel 2 (Planta).
- Espejo legacy: `empresa.regimenFiscal` e `impuestos.responsableIVA` se sincronizan con `madurez.regimenFiscal`.

---

## Casos extremos (validación del modelo)

1. **Puesto de empanadas informal** (sin RUT, efectivo) → Nivel 0 (Semilla). Opera, entrena, no factura. Al crecer y sacar RUT → Brote.
2. **Tienda de barrio pequeña** (RUT, <3.500 UVT, 1 empleado) → Nivel 1 (Brote). Tiquete electrónico. Aviso PILA.
3. **Restaurante mediano en Simple** → Nivel 2 (Planta), régimen `simple`. Factura sin trasladar IVA (Simple no es responsable).
4. **Cadena de 5 restaurantes gran contribuyente** → Nivel 4 (Cadena). Retenciones B2B + consolidación.

---

## Pendiente (post H1.0)
- H1.0d: detectores automáticos + panel UX "Mi crecimiento".
- H1.1: `CrozzoMotorImpuestos` consultará el nivel para decidir IVA/INC/Saludables.
- H1.5: eliminar `mockStamp` y providers `siigo`/`facturama`/`mock` (reemplazo total del simulado).
