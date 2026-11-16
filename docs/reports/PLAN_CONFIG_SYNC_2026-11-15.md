# Plan de sincronización de configuración con autorización — 2026-11-15

## Objetivo
Implementar un sistema de sincronización de configuración entre puntos (restaurante, oficina, dispositivos) donde:
1. Los cambios NO se propagan automáticamente sin autorización
2. KENNY o el admin del negocio aprueba/rechaza cambios
3. Cada punto puede proponer cambios pero no imponerlos
4. Las notificaciones informan al usuario de cambios disponibles

## Principios

1. **Config global → todos (automático):** KENNY cambia tarifas de IVA, impuestos, integraciones → se propaga a todos los puntos
2. **Config empresa → puntos de la empresa (automático):** Admin cambia mesas, productos, usuarios → se propaga a los puntos de esa empresa
3. **Config local → solo local:** Cambio de impresora, resolución → solo afecta al punto actual
4. **Propuesta de cambio:** Cualquier punto puede proponer un cambio → requiere aprobación
5. **Conflicto de versiones:** Si hay conflicto, se pregunta al usuario
6. **Notificación:** Cada cambio remoto notifica al usuario

## Tipos de configuración

| Tipo | Ejemplos | Quién puede cambiar | Propagación |
|------|----------|-------------------|-------------|
| Global | Tarifas IVA, impuestos, integraciones (Siigo, Alegra) | Solo KENNY | Automática a todos |
| Empresa | Mesas, productos, precios, usuarios, permisos | Admin del negocio | Automática a puntos de la empresa |
| Local | Impresoras, resolución, preferencias UI | Cualquier usuario con permiso | Solo al punto actual |
| Propuesta | Cualquier cambio propuesto por un punto | Cualquier usuario | Requiere aprobación |

## Fases de implementación

### Fase 1: Notificaciones de config (1-2 días)
- Al detectar config más reciente, mostrar toast: "Nueva configuración disponible. ¿Aplicar?"
- Botón "Aplicar" → descarga y aplica
- Botón "Ignorar" → mantiene la config actual
- Mostrar qué cambió (diff resumido)

### Fase 2: Propuestas de cambio (2-3 días)
- Añadir botón "Proponer cambio" en config
- Guardar la propuesta en Supabase Central
- Notificar a KENNY/admin

### Fase 3: Dashboard de aprobaciones (2-3 días)
- Panel en config-seguridad para ver propuestas pendientes
- Botones "Aprobar" / "Rechazar"
- Historial de cambios

### Fase 4: Resolución de conflictos (3-4 días)
- Detectar cambios concurrentes
- Mostrar diff de cambios
- Permitir merge o rollback

## Tablas en Supabase Central

```sql
-- Configuración versionada por negocio
CREATE TABLE crozzo_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id UUID REFERENCES crozzo_negocios(id),
  version INTEGER NOT NULL,
  config JSONB NOT NULL,
  tipo TEXT NOT NULL, -- 'global', 'empresa', 'local'
  creado_por TEXT NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now(),
  aprobado BOOLEAN DEFAULT false,
  aprobado_por TEXT,
  aprobado_en TIMESTAMPTZ
);

-- Propuestas de cambio
CREATE TABLE crozzo_config_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id UUID REFERENCES crozzo_negocios(id),
  punto_origen TEXT NOT NULL,
  tipo TEXT NOT NULL,
  cambios JSONB NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  creado_por TEXT NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now(),
  revisado_por TEXT,
  revisado_en TIMESTAMPTZ
);
```

## Implementación inmediata (Fase 1)

### 1. Modificar sincronizarConfiguracion() en CrozzoSuperAdminCentral.js
- Al detectar config más reciente, NO aplicar automáticamente
- Mostrar toast con botón "Aplicar"
- Guardar la config remota en memoria para aplicar después

### 2. Añadir función aplicarConfigRemota()
- Descarga y aplica la config remota
- Actualiza la versión local
- Notifica al usuario

### 3. Añadir función ignorarConfigRemota()
- Mantiene la config actual
- Guarda que se ignoró (para no volver a notificar)

### 4. Modificar el boot en CrozzoPosMain.js
- Al arranque, verificar si hay config más reciente
- Si hay, mostrar toast (no aplicar automáticamente)

## Lo que NO se debe hacer
- NO aplicar cambios automáticamente sin notificar
- NO permitir que un punto cambie la config de otro punto
- NO sobrescribir cambios locales sin confirmación

---

*Generado: 2026-11-15*
*Autor: Análisis automatizado*
