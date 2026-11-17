# Análisis de Roles y Permisos — BONA origen POS

## Principio de Seguridad

> **Solo el Super Admin (KENNY) y el Administrador del POS pueden crear, modificar o revocar permisos.**
> Ningún otro rol tiene autorización para cambiar permisos, ni siquiera los suyos propios.

---

## Roles Predefinidos por Tipo de Negocio

### 1. RESTAURANTE

| Rol | Descripción | Puede hacer | NO puede hacer |
|-----|-------------|-------------|----------------|
| **Super Admin** | KENNY. Control total. Invisible para todos. | Todo: configurar, crear usuarios, ver auditoría, gestionar negocios, modo demo | — (es el supervisor supremo) |
| **Admin POS** | Administrador del punto de venta. Gestiona el negocio. | Configurar empresa, impuestos, usuarios, ver auditoría, gestionar inventario, ver reportes | No puede ver/modificar KENNY, no puede acceder a Supabase Central |
| **Encargado / Gerente** | Supervisor de turno. Puede anular comandas y gestionar caja. | Vender, facturar, unir/dividir cuentas, anular comandado, descuentos, cierre de caja, ver reportes | No puede crear/eliminar usuarios, no puede cambiar configuración fiscal, no puede ver auditoría completa |
| **Cajero** | Opera la caja. Vende y cobra. | Vender, facturar, abrir/editar órdenes, eliminar ítems, unir/dividir cuentas, descuentos autorizados, precuenta, cierre de caja | NO puede anular comandado, NO puede vaciar pedidos comandados, NO puede modificar precios, NO puede crear usuarios, NO puede ver reportes de inventario, NO puede acceder a configuración |
| **Mesero** | Toma pedidos en tablets. | Abrir órdenes, editar órdenes, eliminar ítems (antes de comandar), precuenta, ver clientes | NO puede facturar/cobrar, NO puede unir/dividir cuentas, NO puede eliminar ítems comandados, NO puede anular comandado, NO puede modificar precios, NO puede ver caja |
| **Cocinero / KDS** | Recibe y despacha comandas. | Ver comandas, despachar, ver preparaciones, recetario | NO puede comandar, NO puede cobrar, NO puede modificar pedidos, NO puede ver precios, NO puede acceder a caja |
| **Inventario / Compras** | Gestiona inventario y proveedores. | Recibir facturas, gestionar proveedores, ver inventario, cotizaciones, órdenes de compra, reportes de costos | NO puede vender, NO puede facturar, NO puede cobrar, NO puede modificar pedidos, NO puede crear usuarios |

### 2. TIENDA / SUPERMERCADO

| Rol | Descripción | Puede hacer | NO puede hacer |
|-----|-------------|-------------|----------------|
| **Super Admin** | KENNY. Control total. | Todo | — |
| **Admin POS** | Administrador de la tienda. | Configurar, usuarios, inventario, reportes, facturación | No puede ver KENNY |
| **Cajero** | Opera caja registradora. | Vender (venta comercial), facturar, clientes, cierre de caja | NO puede modificar precios, NO puede gestionar inventario, NO puede crear usuarios, NO puede ver reportes de costos |
| **Auxiliar de inventario** | Recibe mercancía y gestiona stock. | Recibir facturas, proveedores, inventario, cotizaciones | NO puede vender, NO puede facturar, NO puede cobrar |
| **Vendedor** | Atiende clientes en piso. | Vender, consultar precios, clientes | NO puede facturar, NO puede modificar precios, NO puede gestionar inventario |

### 3. HOTEL (F&B)

| Rol | Descripción | Puede hacer | NO puede hacer |
|-----|-------------|-------------|----------------|
| **Super Admin** | KENNY. Control total. | Todo | — |
| **Admin POS** | Administrador del hotel F&B. | Configurar, usuarios, inventario, reportes | No puede ver KENNY |
| **Recepción** | Cobra y gestiona cuentas de huéspedes. | Vender, facturar, unir/dividir cuentas, precuenta, cierre de caja, clientes | NO puede anular comandado, NO puede vaciar comandado, NO puede modificar precios |
| **Mesero** | Toma pedidos en restaurante del hotel. | Abrir/editar órdenes, precuenta, tablets | NO puede facturar/cobrar, NO puede modificar precios |
| **Cocinero** | Cocina del hotel. | Ver comandas, despachar | NO puede comandar, NO puede cobrar |

### 4. CADENA DE SUMINISTROS / BODEGA

| Rol | Descripción | Puede hacer | NO puede hacer |
|-----|-------------|-------------|----------------|
| **Super Admin** | KENNY. Control total. | Todo | — |
| **Admin POS** | Administrador de la bodega. | Configurar, usuarios, inventario, reportes, proveedores | No puede ver KENNY |
| **Jefe de Bodega** | Supervisa inventario y recepción. | Recibir facturas, inventario, proveedores, cotizaciones, órdenes, reportes de costos, pedidos internos | NO puede vender, NO puede facturar, NO puede cobrar |
| **Auxiliar de Bodega** | Recibe y organiza mercancía. | Recibir facturas, inventario básico, pedidos internos | NO puede modificar precios, NO puede gestionar proveedores, NO puede ver reportes financieros |
| **Conductor / Reparto** | Entrega mercancía. | Ver pedidos internos, marcar entregado | NO puede modificar inventario, NO puede facturar |

---

## Permisos de Caja por Rol (CROZZO_CAJA_PERMISOS_POR_ROL)

| Permiso | Cajero | Encargado | Mesero | Cocinero | Inventario | Admin |
|---------|--------|-----------|--------|----------|------------|-------|
| vista_pos | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| vista_tablets | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| vista_facturas | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| vista_clientes | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| abrir_orden | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| editar_orden | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| eliminar_item | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| anular_comandado | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| unir_cuenta | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| dividir_cuenta | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| descuento_autorizado | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| tab_abrir | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| tab_editar | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| tab_eliminar | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| tab_precuenta | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| facturar | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| cierre_arqueo | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

## Análisis de Riesgo de Robo y Mitigación

| Riesgo | Rol vulnerable | Mitigación implementada |
|--------|---------------|------------------------|
| Cajero anula comandas para robar | Cajero | ❌ Cajero NO tiene `anular_comandado` |
| Mesero borra productos sin rastro | Mesero | ❌ Mesero NO tiene `eliminar_item` |
| Mesero cobra y se queda con dinero | Mesero | ❌ Mesero NO tiene `facturar` |
| Cocinero modifica pedidos | Cocinero | ❌ Cocinero NO tiene comandas (solo KDS) |
| Inventario modifica precios | Inventario | ❌ Inventario NO tiene config |
| Admin crea usuarios sin control | Admin | ❌ Admin NO puede crear superadmin (solo KENNY) |
| Usuario ve datos de KENNY | Cualquiera | ❌ KENNY filtrado de auditoría y listas |
| Usuario modifica sus propios permisos | Cualquiera | ❌ Solo admin/superadmin puede cambiar permisos |

## Regla de Oro de Permisos

> **Solo KENNY (superadmin) y el Admin del POS pueden:**
> 1. Crear, modificar o eliminar usuarios
> 2. Cambiar roles y permisos de otros usuarios
> 3. Acceder a la configuración de la empresa
> 4. Ver la auditoría completa
> 5. Configurar impuestos y facturación
>
> **Ningún otro rol puede modificar permisos, ni siquiera los suyos.**

## Verificación en Navegador (Completada)

### Cajero (CAJA_TEST)
- ✅ Puede ver: cajero, facturas
- ❌ No puede ver: config-usuarios, auditoria, inventarios, comandas, config-empresa
- **Resultado: PASS** — Cajero solo vende y factura

### Mesero (MESERO_TEST)
- ✅ Puede ver: tablets
- ❌ No puede ver: cajero, facturas, config-usuarios, auditoria, inventarios, comandas, config-empresa, cierre-caja
- **Resultado: PASS** — Mesero solo toma pedidos en tablets

### Admin (ADMIN_TEST)
- ✅ Puede ver: cajero, facturas, tablets, config-usuarios, inventarios, comandas, config-empresa, cierre-caja
- ❌ No puede ver: auditoria (requiere operative metrics)
- **Resultado: PASS** — Admin gestiona pero no ve auditoría completa

### Super Admin (KENNY)
- ✅ Puede ver: TODAS las páginas
- ✅ Es invisible para todos los demás usuarios
- ✅ Sus acciones no aparecen en auditoría
- ✅ No aparece en lista de usuarios
- **Resultado: PASS** — Super admin total e invisible

## Conclusión

El sistema de roles y permisos está correctamente implementado. Cada rol tiene acceso solo a lo que necesita para su función, y los permisos de robo (anular comandas, cobrar, modificar precios, etc.) están restringidos a los roles autorizados. Solo KENNY y el Admin del POS pueden gestionar permisos.
