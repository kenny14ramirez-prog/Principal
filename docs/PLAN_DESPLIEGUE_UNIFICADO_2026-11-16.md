# Plan de Despliegue Unificado — BONA origen POS

## Visión

Un sistema unificado con **3 caras** que reemplace todos los wizards, diagnósticos y ayudas fragmentados:

1. **Despliegue Inicial** — Configuración paso a paso según tipo de negocio
2. **Solucionador de Problemas** — Detección y solución automática de problemas de hardware
3. **Diagnóstico en Tiempo Real** — Monitoreo y alerta de problemas del sistema

---

## Cara 1: Despliegue Inicial

### Flujo de Despliegue

```
Super Admin (KENNY) abre Centro de Despliegue
  ↓
Selecciona tipo de negocio:
  ├─ Restaurante (pequeño / mediano / grande)
  ├─ Tienda / Supermercado
  ├─ Hotel (F&B)
  ├─ Bodega / Suministros
  └─ Demo (datos ficticios)
  ↓
Selecciona nivel de facturación:
  ├─ Factura simple (sin DIAN)
  ├─ Facturación electrónica (DIAN)
  └─ Solo POS (sin facturación)
  ↓
Asistente paso a paso:
  1. Datos de empresa (nombre, NIT, dirección, teléfono, email, logo)
  2. Impuestos (IVA, INC, perfil fiscal)
  3. Facturación (resolución DIAN, rangos, certificado)
  4. Usuarios (crear admin, cajeros, meseros según tipo de negocio)
  5. Impresoras (detectar, configurar, probar)
  6. Red y conexión (rol A/B, IP, puertos)
  7. Nube (Supabase, sync, backup)
  8. Verificación final (test de impresión, test de venta, test de sync)
  ↓
Sistema desplegado ✅
```

### Detección Automática de Impresoras

```
Usuario conecta impresora USB/Ethernet
  ↓
Sistema detecta nuevo dispositivo (via WebUSB o polling)
  ↓
Muestra: "Se detectó un nuevo dispositivo: [nombre]"
  ↓
Busca en base de datos de impresoras conocidas:
  ├─ Epson TM-T20/TM-T88 → Driver Epson, puerto USB/Serial
  ├─ Star TSP100/TSP650 → Driver Star, puerto USB
  ├─ Bixolon SRP-350 → Driver Bixolon, puerto USB
  ├─ Xprinter XP-80 → Driver Generic/Text Only
  ├─ HP, Canon, Brother → Driver del fabricante
  └─ Desconocido → Guía manual
  ↓
Descarga e instala driver automáticamente (si disponible)
  ↓
Configura puerto (USB001, COM6, TCP/IP)
  ↓
Prueba de impresión
  ↓
Pregunta: "¿Para qué necesita esta impresora?"
  ├─ Recibos de caja
  ├─ Comandas de cocina
  ├─ Comandas de bar
  ├─ Facturas
  └─ Etiquetas
  ↓
Asigna a pantalla/módulo correspondiente
  ↓
✅ Impresora configurada
```

### Tipos de Negocio Predefinidos

| Tipo | Roles creados | Módulos activos | Impresoras sugeridas |
|------|--------------|-----------------|---------------------|
| Restaurante pequeño | Admin, Cajero, Mesero, Cocina | Caja, Comandas, Cocina, Inventario | 1 recibo + 1 cocina |
| Restaurante mediano | Admin, Encargado, 2 Cajeros, 3 Meseros, 2 Cocina, Inventario | Todos | 2 recibos + 2 cocina + 1 bar |
| Restaurante grande | Admin, Encargado, 3+ Cajeros, 5+ Meseros, 3+ Cocina, Inventario, Compras | Todos + Costos | 3+ recibos + 3+ cocina + 2 bar + etiquetas |
| Tienda pequeña | Admin, Cajero | Venta comercial, Inventario básico | 1 recibo |
| Supermercado | Admin, 2+ Cajeros, Inventario, Compras | Venta comercial, Inventario completo, Compras | 2+ recibos + etiquetas |
| Hotel F&B | Admin, Recepción, Meseros, Cocina | Caja, Comandas, Cocina, Habitaciones | 2+ recibos + 2+ cocina + bar |
| Bodega | Admin, Jefe de Bodega, Auxiliares, Conductores | Inventario, Compras, Pedidos internos | 1 recibo + etiquetas |

---

## Cara 2: Solucionador de Problemas

### Detección de Problemas de Hardware

```
Sistema monitorea continuamente:
  ├─ Impresoras (estado, conexión, errores)
  ├─ Conexión de red (LAN, WAN, internet)
  ├─ Base de datos (Supabase, local)
  ├─ Dispositivos conectados (tablets, POS)
  └─ Periféricos (escáner, cajón, etc.)
  ↓
Si detecta problema:
  ├─ Muestra alerta no invasiva
  ├─ Intenta solución automática
  │   ├─ Reintentar conexión
  │   ├─ Reiniciar servicio
  │   ├─ Reconfigurar puerto
  │   └─ Usar impresora alternativa
  ├─ Si no se resuelve → Guía paso a paso
  │   ├─ "La impresora de cocina (Epson TM-T88) dejó de responder"
  │   ├─ "Verifique que esté encendida y conectada"
  │   ├─ "¿Está el cable USB conectado? [Sí] [No]"
  │   ├─ "¿La impresora tiene papel? [Sí] [No]"
  │   └─ "Intentando reconectar... [Progreso]"
  └─ Si persiste → Sugerir contacto con soporte
```

### Tipos de Problemas Detectables

| Problema | Detección | Solución automática |
|----------|-----------|---------------------|
| Impresora desconectada | Polling de estado cada 30s | Reintentar conexión, usar impresora alternativa |
| Impresora sin papel | Estado del dispositivo | Alertar usuario, sugerir recarga |
| Error de driver | Fallo de impresión | Reinstalar driver, usar Generic/Text Only |
| Puerto incorrecto | Fallo de impresión | Detectar puerto correcto automáticamente |
| Red caída | Ping a servidor | Usar modo offline, cola de sync |
| Base de datos inaccesible | Health check | Usar cache local, reintentar |
| Tablet desconectada | Heartbeat | Notificar, reintentar conexión |
| Impresora atascada | Timeout de impresión | Cancelar trabajo, reintentar |

---

## Cara 3: Diagnóstico en Tiempo Real

### Dashboard de Salud del Sistema

```
┌─────────────────────────────────────────────────┐
│  🏥 Salud del Sistema                           │
├─────────────────────────────────────────────────┤
│  Impresoras:                                    │
│    ✅ Recibo (Epson TM-T88) — OK                │
│    ⚠️ Cocina (Star TSP650) — Sin papel          │
│    ❌ Bar (Bixolon SRP-350) — Desconectada      │
│                                                 │
│  Conexión:                                      │
│    ✅ LAN — OK (12ms)                           │
│    ✅ Internet — OK                             │
│    ✅ Supabase — OK                             │
│                                                 │
│  Base de datos:                                 │
│    ✅ Local — OK (245 registros)                │
│    ✅ Nube — OK (sincronizado)                  │
│                                                 │
│  Dispositivos:                                  │
│    ✅ Caja Principal — Online                   │
│    ✅ Tablet Mesero 1 — Online                  │
│    ⚠️ Tablet Mesero 2 — Desconectada            │
│                                                 │
│  Rendimiento:                                   │
│    ✅ CPU — 12%                                 │
│    ✅ Memoria — 45%                             │
│    ✅ Disco — 67% libre                         │
│                                                 │
│  Errores recientes:                             │
│    ⚠️ 2 errores en las últimas 24h              │
│    [Ver detalles]                               │
└─────────────────────────────────────────────────┘
```

### Historial de Problemas

```
Para cada problema detectado, guardar:
  - Fecha y hora
  - Tipo de problema
  - Dispositivo afectado
  - Causa probable
  - Solución aplicada
  - Tiempo de resolución
  - Usuario que lo resolvió

Esto permite:
  - Identificar patrones (ej: impresora se desconecta cada lunes)
  - Predecir problemas (ej: impresora con 5000 impresiones, próxima a fallar)
  - Mejorar el sistema (ej: agregar más papel, cambiar cable, etc.)
```

---

## Integración con Sistemas Existentes

### Módulos a Integrar

| Sistema existente | Integración |
|-------------------|-------------|
| Wizard de conexión (wizardOpen) | Reutilizar lógica de red/dispositivos |
| EasyConnect | Reutilizar detección de dispositivos |
| FieldDiagnostic | Reutilizar diagnóstico de campo |
| ErrorMonitor | Alimentar diagnóstico en tiempo real |
| Config de impresoras (config-comandas) | Integrar en paso de impresoras |
| Config de empresa (config-empresa) | Integrar en paso de empresa |
| Config de impuestos (config-impuestos) | Integrar en paso de impuestos |
| Usuarios (config-usuarios) | Integrar en paso de usuarios |
| Auditoría | Filtrar y mostrar en diagnóstico |
| Honeypot | No integrar (es independiente) |

### Módulos a Eliminar/Consolidar

| Sistema fragmentado | Acción |
|---------------------|--------|
| Wizard de conexión (5 pasos) | Integrar en Cara 1 (paso de red) |
| EasyConnect | Integrar en Cara 2 (solucionador) |
| FieldDiagnostic | Integrar en Cara 3 (diagnóstico) |
| Config de impresoras (separado) | Integrar en Cara 1 (paso de impresoras) |
| Diagnóstico de comunicación | Integrar en Cara 3 |
| Pruebas de sistema (super-admin-diagnostics) | Integrar en Cara 3 |

---

## Plan de Implementación (Fases)

### Fase 1: Estructura Base (1-2 días)
- [ ] Crear módulo `CrozzoDeploymentCenter.js` con las 3 caras
- [ ] Integrar en menú de Super Admin
- [ ] Crear UI con tabs: Despliegue / Solucionador / Diagnóstico
- [ ] Guardar estado en localStorage

### Fase 2: Despliegue Inicial (3-5 días)
- [ ] Paso 1: Empresa (reutilizar config-empresa)
- [ ] Paso 2: Impuestos (reutilizar config-impuestos)
- [ ] Paso 3: Facturación (reutilizar config-dian, certificado)
- [ ] Paso 4: Usuarios (reutilizar config-usuarios + plantillas por tipo de negocio)
- [ ] Paso 5: Impresoras (nuevo: detección + configuración)
- [ ] Paso 6: Red (reutilizar wizard de conexión)
- [ ] Paso 7: Nube (reutilizar config de Supabase)
- [ ] Paso 8: Verificación final (test de venta, impresión, sync)

### Fase 3: Solucionador de Problemas (3-5 días)
- [ ] Detección de impresoras (WebUSB, polling)
- [ ] Base de datos de impresoras conocidas (Epson, Star, Bixolon, HP, etc.)
- [ ] Instalación automática de drivers
- [ ] Configuración de puertos
- [ ] Prueba de impresión
- [ ] Asignación a módulo (recibo, cocina, bar, etc.)
- [ ] Solución de problemas de red
- [ ] Solución de problemas de base de datos

### Fase 4: Diagnóstico en Tiempo Real (2-3 días)
- [ ] Dashboard de salud del sistema
- [ ] Monitoreo de impresoras (estado, conexión, errores)
- [ ] Monitoreo de red (latencia, conectividad)
- [ ] Monitoreo de base de datos (sync status, errores)
- [ ] Historial de problemas
- [ ] Alertas proactivas (email a KENNY)
- [ ] Integración con ErrorMonitor

### Fase 5: Unificación y Limpieza (2-3 días)
- [ ] Eliminar wizards fragmentados
- [ ] Consolidar diagnósticos
- [ ] Unificar configuración de impresoras
- [ ] Actualizar documentación
- [ ] Testing completo

### Tiempo total estimado: 11-18 días

---

## Tecnologías a Investigar

| Tecnología | Uso | Compatibilidad |
|-----------|-----|---------------|
| WebUSB API | Detección de impresoras USB | Chrome/Edge (Tauri WebView) |
| Web Serial API | Comunicación serial con impresoras | Chrome/Edge |
| navigator.usb.getDevices() | Listar dispositivos USB conectados | Chrome/Edge |
| Print API (window.print) | Impresión básica | Todos los navegadores |
| Electron/Tauri printer API | Impresión nativa en desktop | Tauri (Rust) |
| Web Bluetooth | Impresoras Bluetooth | Chrome/Edge (limitado) |
| Network discovery (mDNS) | Detectar impresoras en red | Requiere backend |

---

## Decisiones Pendientes

1. **¿WebUSB o polling?** WebUSB es más moderno pero requiere permisos. Polling es más compatible.
2. **¿Base de datos de impresoras local o en nube?** Local es más rápido, nube es más actualizable.
3. **¿Instalación automática de drivers?** Requiere permisos de admin del SO. En Tauri (desktop) es posible.
4. **¿Monitoreo en tiempo real o bajo demanda?** Tiempo real consume más recursos.

---

## Próximos Pasos

1. Investigar WebUSB API para detección de impresoras
2. Crear base de datos de impresoras conocidas (JSON)
3. Implementar detección automática
4. Implementar solución automática de problemas
5. Integrar diagnóstico en tiempo real
6. Testing y refinamiento
