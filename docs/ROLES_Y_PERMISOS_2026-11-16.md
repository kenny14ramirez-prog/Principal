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

### Restaurante

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

### Análisis de Riesgo de Robo

| Riesgo | Rol vulnerable | Mitigación |
|--------|---------------|------------|
| Cajero anula comandas para robar | Cajero (si tuviera anular_comandado) | ❌ Cajero NO tiene anular_comandado |
| Mesero borra productos sin rastro | Mesero (si tuviera eliminar_item) | ❌ Mesero NO tiene eliminar_item |
| Mesero cobra y se queda con dinero | Mesero (si tuviera facturar) | ❌ Mesero NO tiene facturar |
| Cocinero modifica pedidos | Cocinero (si tuviera comandas) | ❌ Cocinero NO tiene comandas (solo KDS) |
| Inventario modifica precios | Inventario (si tuviera config) | ❌ Inventario NO tiene config |
| Admin crea usuarios sin control | Admin (si pudiera crear superadmin) | ❌ Admin NO puede crear superadmin (solo KENNY) |

### Regla de Oro de Permisos

> **Solo KENNY (superadmin) y el Admin del POS pueden:**
> 1. Crear, modificar o eliminar usuarios
> 2. Cambiar roles y permisos de otros usuarios
> 3. Acceder a la configuración de la empresa
> 4. Ver la auditoría completa
> 5. Configurar impuestos y facturación
>
> **Ningún otro rol puede modificar permisos, ni siquiera los suyos.**

### Verificación en Navegador (Pendiente)

Se deben probar los siguientes roles en el navegador:
- [ ] Cajero: verificar que no puede anular comandado, no puede facturar en tablets, no puede modificar precios
- [ ] Mesero: verificar que no puede facturar, no puede eliminar ítems comandados, no puede acceder a caja
- [ ] Cocinero: verificar que solo ve comandas KDS, no puede comandar ni cobrar
- [ ] Inventario: verificar que puede recibir facturas pero no vender
- [ ] Admin: verificar que puede crear usuarios y configurar, pero no ver KENNY
- [ ] Super Admin (KENNY): verificar que ve todo y es invisible para los demás
