# Checklist de Prueba Física — Crozzo POS (Bona Origen)

> Objetivo: validar el sistema en condiciones reales con 2+ dispositivos, impresora y backend.
> Probabilidad de éxito estimada (con testing virtual): ~90-95%.

---

## PRE-REQUISITOS

### Hardware necesario
- [ ] 1 PC (Windows) como caja (Rol A)
- [ ] 1-2 tablets/celulares (Android o iOS) como meseros (Rol B)
- [ ] 1 impresora térmica (USB o Bluetooth) — opcional para fase de impresión
- [ ] Router WiFi (para fase LAN)
- [ ] Cable USB para impresora (si es USB)

### Software necesario
- [ ] App instalada en PC (versión más reciente)
- [ ] App instalada en tablet/celular (misma versión)
- [ ] Credenciales de Supabase (URL + anon key) — para fase Cloud
- [ ] Credenciales de Dataico/DIAN (sandbox) — para fase fiscal

### Preparación
- [ ] PC y tablet en la misma red WiFi
- [ ] Firewall de Windows permite puerto 3000 (la app lo pide al iniciar)
- [ ] Impresora conectada y encendida (si se prueba impresión)
- [ ] Anotar IP del PC (para verificar mDNS)

---

## FASE 1: Arranque y configuración (PC)

### 1.1 Arranque de la app en PC
- [ ] App abre sin errores fatales
- [ ] Pantalla de login aparece
- [ ] Login con credenciales de admin funciona
- [ ] Pantalla principal (POS) carga correctamente
- [ ] No hay popups de error invasivos

### 1.2 Configuración de empresa
- [ ] Configurar nombre de empresa
- [ ] Configurar NIT
- [ ] Configurar dirección
- [ ] Guardar configuración → se persiste

### 1.3 Configuración de impresora (si aplica)
- [ ] Ir a configuración de impresoras
- [ ] Detectar impresora (USB/Bluetooth)
- [ ] Seleccionar impresora por defecto
- [ ] Guardar configuración
- [ ] Verificar que la impresora aparece en la lista

### 1.4 Base de datos
- [ ] Verificar que la DB se crea correctamente (SQLite)
- [ ] Verificar que no hay errores de migración

### 1.5 QR de pareo
- [ ] La app genera un QR de pareo automáticamente
- [ ] El QR se muestra en pantalla
- [ ] El QR contiene: supabase_url, central_ip, port, device_id, tls_fingerprint
- [ ] El QR es legible (no cortado, no pixelado)

**Criterio de éxito Fase 1:** App arranca, se configura, genera QR. ✅/❌

---

## FASE 2: Pareo (Celular/Tablet)

### 2.1 Instalación y permisos
- [ ] App se instala correctamente en Android/iOS
- [ ] App abre sin errores
- [ ] Se piden permisos: red, cámara, Bluetooth (una sola vez)
- [ ] Permisos se conceden

### 2.2 Escaneo de QR
- [ ] Abrir función de escaneo QR en la app
- [ ] Apuntar cámara al QR de la PC
- [ ] QR se detecta y decodifica (< 2 segundos)
- [ ] Mensaje de "emparejado correctamente" aparece
- [ ] Credenciales se guardan (no se pide de nuevo)

### 2.3 Conexión automática
- [ ] El celular se conecta automáticamente a la caja
- [ ] Indicador de conexión muestra 🟢 (LAN)
- [ ] La caja muestra "Tablet X se unió"
- [ ] No se requiere configuración manual

### 2.4 Verificación de conexión
- [ ] Enviar un ping/health check desde el celular a la caja
- [ ] Respuesta OK (< 1 segundo)
- [ ] El celular puede ver el menú/productos de la caja

**Criterio de éxito Fase 2:** Escanear QR → conexión automática sin configuración manual. ✅/❌

---

## FASE 3: Comunicación LAN (misma red WiFi)

### 3.1 Envío de comanda
- [ ] En el celular: seleccionar mesa → agregar productos → enviar comanda
- [ ] La comanda llega a la caja (< 2 segundos)
- [ ] La caja muestra la comanda en cocina/bar
- [ ] No hay duplicados (verificar count)

### 3.2 Cambio de estado
- [ ] En cocina: marcar comanda como "en preparación"
- [ ] El estado se actualiza en el celular del mesero (< 2 segundos)
- [ ] En cocina: marcar como "listo"
- [ ] El mesero recibe notificación de "listo"

### 3.3 Cobro
- [ ] Mesero cobra la mesa
- [ ] El cobro se registra en la caja
- [ ] El estado de la mesa cambia a "libre"
- [ ] El inventario se descuenta (verificar stock)

### 3.4 Sincronización de mesas
- [ ] Cambiar estado de mesa en un dispositivo → se refleja en el otro
- [ ] Agregar item a carrito en un dispositivo → se refleja en el otro (si multi-writer)
- [ ] No hay pérdida de datos

### 3.5 Indicador de conexión
- [ ] Indicador muestra 🟢 durante operación normal
- [ ] Indicador muestra 🟡 si la conexión se degrada
- [ ] Indicador muestra 🔴 si se pierde la conexión
- [ ] Banner aparece al perder conexión
- [ ] Sonido se reproduce al perder/reconectar

**Criterio de éxito Fase 3:** Comanda llega a cocina en < 2s, sin duplicados, indicador funciona. ✅/❌

---

## FASE 4: Offline (sin red)

### 4.1 Desconexión
- [ ] Desconectar WiFi del celular (modo avión o apagar router)
- [ ] Indicador cambia a 🔴
- [ ] Banner "Sin conexión — operando en modo local" aparece
- [ ] Sonido de alerta se reproduce

### 4.2 Operación offline
- [ ] Seleccionar mesa → agregar productos → enviar comanda
- [ ] La comanda se guarda localmente
- [ ] El celular sigue funcionando (no crashea)
- [ ] Se puede navegar entre pantallas

### 4.3 Reconexión
- [ ] Reconectar WiFi
- [ ] Indicador cambia a 🟢
- [ ] Banner "Conexión restaurada" aparece
- [ ] Sonido de confirmación se reproduce
- [ ] Las comandas offline se sincronizan automáticamente
- [ ] La caja recibe las comandas pendientes
- [ ] No hay duplicados

### 4.4 Verificación de sincronización
- [ ] Verificar que todas las comandas offline llegaron a la caja
- [ ] Verificar que el inventario se actualizó
- [ ] Verificar que no hay datos perdidos

**Criterio de éxito Fase 4:** Offline → operar → reconectar → sync automático sin pérdida. ✅/❌

---

## FASE 5: Impresión (si aplica)

### 5.1 Impresión de comanda
- [ ] Enviar comanda → se imprime automáticamente en cocina
- [ ] El ticket contiene: mesa, productos, cantidades, hora
- [ ] El formato es correcto (no cortado, no desalineado)

### 5.2 Impresión de cuenta
- [ ] Cobrar mesa → se imprime cuenta
- [ ] El ticket contiene: mesa, productos, subtotales, total, método de pago
- [ ] El formato es correcto

### 5.3 Cola de impresión con retry
- [ ] Desconectar impresora → enviar comanda → se encola
- [ ] Reconectar impresora → se imprime automáticamente
- [ ] No se pierde la comanda

### 5.4 Impresión manual
- [ ] Imprimir comanda manualmente desde la app
- [ ] Imprimir cuenta manualmente desde la app
- [ ] Ambos funcionan correctamente

**Criterio de éxito Fase 5:** Impresión automática y manual funcionan, cola con retry. ✅/❌

---

## FASE 6: Inventario y costeo

### 6.1 Descuento de inventario al vender
- [ ] Verificar stock inicial de un producto
- [ ] Vender 1 unidad del producto
- [ ] Verificar que el stock se descuentó en 1
- [ ] Verificar en la caja que el stock se actualizó

### 6.2 Costeo
- [ ] Cambiar precio de una materia prima
- [ ] Verificar que el plato se recostea
- [ ] Verificar que el margen se actualiza
- [ ] Verificar que el semáforo (🟢🟡🔴) se actualiza

### 6.3 Compra
- [ ] Registrar compra de materia prima
- [ ] Verificar que el stock se incrementa
- [ ] Verificar que el costeo se actualiza

**Criterio de éxito Fase 6:** Inventario se descuenta al vender, costeo se actualiza. ✅/❌

---

## FASE 7: Cierre de caja

### 7.1 Cierre
- [ ] Ir a cierre de caja
- [ ] Verificar arqueo (efectivo, tarjeta, etc.)
- [ ] Ejecutar cierre
- [ ] Verificar que el reporte se genera

### 7.2 Verificación post-cierre
- [ ] Verificar que las mesas se liberan
- [ ] Verificar que el inventario se actualiza
- [ ] Verificar que el reporte tiene los datos correctos

**Criterio de éxito Fase 7:** Cierre de caja funciona end-to-end. ✅/❌

---

## FASE 8: Facturación electrónica (si aplica)

### 8.1 Factura
- [ ] Crear factura para un cliente
- [ ] Verificar que se genera UBL 2.1
- [ ] Verificar que se calcula CUFE
- [ ] Verificar que se timbra (sandbox primero)
- [ ] Verificar que se envía por email (si configurado)

### 8.2 Contingencia fiscal
- [ ] Desconectar internet → intentar facturar → se encola
- [ ] Reconectar → se drena la cola
- [ ] Verificar que no se pierde la factura

**Criterio de éxito Fase 8:** Facturación funciona con sandbox, contingencia funciona. ✅/❌

---

## FASE 9: Multi-dispositivo (2+ tablets)

### 9.1 Sincronización entre 3+ dispositivos
- [ ] 2 tablets + 1 caja en la misma red
- [ ] Enviar comanda desde tablet 1 → llega a caja y tablet 2
- [ ] Cambiar estado en tablet 2 → se refleja en tablet 1 y caja
- [ ] No hay duplicados (verificar count)
- [ ] No hay pérdida de datos

### 9.2 Rendimiento
- [ ] Enviar 10 comandas rápidamente → todas llegan
- [ ] Cambiar estados rápidamente → todos se sincronizan
- [ ] No hay lag perceptible (< 2s)

### 9.3 Conflicto de mesa
- [ ] Dos meseros editan la misma mesa simultáneamente
- [ ] El sistema detecta conflicto
- [ ] Se mergean las comandas (no se pierde ninguna)
- [ ] Se notifica al usuario (sin ser invasivo)

**Criterio de éxito Fase 9:** 3+ dispositivos sincronizados sin duplicados ni pérdida. ✅/❌

---

## FASE 10: Hotspot (si router cae)

### 10.1 Activación de hotspot
- [ ] Desconectar router (simular caída)
- [ ] La caja activa hotspot automáticamente (Windows)
- [ ] Las tablets se conectan al hotspot
- [ ] mDNS funciona sobre hotspot
- [ ] Las comandas siguen llegando

### 10.2 Fallback
- [ ] Si hotspot no se activa, las tablets intentan cloud
- [ ] Si cloud no disponible, modo offline
- [ ] Al volver el router, se reconecta automáticamente

**Criterio de éxito Fase 10:** Hotspot se activa y las comandas siguen llegando. ✅/❌

---

## REGISTRO DE RESULTADOS

### Fecha de prueba: _______________

### Dispositivos usados:
- PC: ____________________ (modelo, SO)
- Tablet 1: _______________ (modelo, SO)
- Tablet 2: _______________ (modelo, SO)
- Impresora: ______________ (modelo, conexión)

### Resultados por fase:
| Fase | Resultado | Notas |
|------|-----------|-------|
| 1. Arranque y configuración | ✅/❌ | |
| 2. Pareo | ✅/❌ | |
| 3. Comunicación LAN | ✅/❌ | |
| 4. Offline | ✅/❌ | |
| 5. Impresión | ✅/❌ | |
| 6. Inventario y costeo | ✅/❌ | |
| 7. Cierre de caja | ✅/❌ | |
| 8. Facturación electrónica | ✅/❌ | |
| 9. Multi-dispositivo | ✅/❌ | |
| 10. Hotspot | ✅/❌ | |

### Bugs encontrados:
1. ________________________________
2. ________________________________
3. ________________________________

### Observaciones:
________________________________________
________________________________________
________________________________________

---

## CRITERIOS DE ÉXITO GLOBAL

| Criterio | Cómo verificar | Estado |
|----------|----------------|--------|
| Escanear QR → conexión automática | Probar en 2 dispositivos reales | ⏳ |
| Comanda llega a cocina en < 2s | Medir tiempo end-to-end | ⏳ |
| Sin duplicados en 3+ dispositivos | Enviar 50 comandas, verificar count | ⏳ |
| Offline → sync al volver | Desconectar WiFi, operar, reconectar | ⏳ |
| 3+ dispositivos sin colapso | Probar con 3+ dispositivos | ⏳ |
| Cifrado en LAN | Capturar tráfico, verificar ilegible | ⏳ |
| Permisos se piden una vez | Instalar en Android/iOS | ⏳ |
| Indicador visible sin ser invasivo | Probar en dispositivo real | ⏳ |
| Órdenes llegan a cocina SIEMPRE | Probar todos los canales de fallback | ⏳ |
| Inventario se descuenta al vender | Compra → venta → verificar stock | ⏳ |
| Costeo se actualiza al comprar MP | Cambiar precio MP → verificar plato | ⏳ |
| Cierre de caja funciona | Cerrar → verificar reporte | ⏳ |
| Facturación DIAN timbra | Timbrar con proveedor real | ⏳ |

**Leyenda:** ⏳ Pendiente · ✅ Pass · ❌ Fail

---

## NOTAS IMPORTANTES

1. **No modificar código durante la prueba** — solo observar y registrar.
2. **Si algo falla, registrar el error exacto** (mensaje, pantalla, paso).
3. **Tomar screenshots** de cada paso exitoso y fallido.
4. **Probar en orden** — las fases posteriores dependen de las anteriores.
5. **Si la Fase 2 (Pareo) falla, detener** — no tiene sentido probar lo demás sin conexión.
6. **El indicador 🟢🟡🔴 es tu guía** — si está en 🔴, algo falló.
7. **La regla de oro:** las órdenes deben llegar a cocina/caja SIEMPRE que haya algún canal de comunicación disponible.

---

**Preparado por:** Alto Mando de Crozzo POS  
**Fecha:** 2026-11-09  
**Versión del sistema:** 1.0.260  
**Probabilidad de éxito estimada:** ~90-95% (con testing virtual exhaustivo)
