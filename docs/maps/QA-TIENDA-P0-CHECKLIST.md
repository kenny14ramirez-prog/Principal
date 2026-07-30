# Checklist QA tienda — P0 (ejecutar en sede)

Versión de referencia: `releases/latest.json` + meta `crozzo-app-version` en `app/index.html`.  
Tras cambios frontend: `npm run sync` → reiniciar Tauri → `Ctrl+Shift+R`.

## 0. Antes de probar

- [ ] Misma versión OTA en caja, tablet y cocina
- [ ] `locationId` idéntico en todos (`crozzoAbrirDiagnostico()` o config conexiones)
- [ ] En PC de desarrollo: `npm run test:sync-clinical` en verde
- [ ] Tema visual = **BONA origen** (selector único; no otros skins)
- [ ] Completar [`FLEET-DIAG-SEDE.md`](FLEET-DIAG-SEDE.md) (latencias WAN on/off)

## 1. Login hotelero (Fase C)

- [ ] Pantalla de acceso con atmósfera crema/oro (no fondo plano genérico)
- [ ] Marca BONA dominante; título **Bienvenido**; versión como subtítulo
- [ ] Botón principal **Entrar** (sin emoji ruidoso)
- [ ] Motion suave al aparecer la tarjeta; con «reducir movimiento» del SO, sin drift

## 2. Venta directa (KI-021)

- [ ] En **Restaurante · POS**, pestaña **Directa** → se ven productos + ticket (no grid de mesas)
- [ ] Cambiar a **Mesas** → grid; volver a **Directa** → otra vez venta directa
- [ ] Tras un cobro en directa, sigue en venta directa (no picker)

## 3. Cliente / facturación (caja)

- [ ] Tocá **Cliente / facturación** → el panel ocupa el ticket (sin totales/cobrar tapando)
- [ ] Buscá un NIT → aparecen nombre/ciudad (o formulario Nuevo cliente)
- [ ] Completá correo → **Guardar** → panel se cierra (“guardadito”) y vuelve cobro
- [ ] Cerrar con la flecha del acordeón también restaura carrito/totales

## 4. Mesa → comandar → cocina

- [ ] Abrí mesa → agregá ítem → **Comandar y guardar**
- [ ] En **Comandas/Cocina** aparece el ticket
- [ ] Auto-print (si está ON en ese dispositivo): imprime sola; si OFF, no imprime
- [ ] **LISTO** no borra la cuenta en caja

## 5. Cobro y carrito (Fase A)

- [ ] En caja: botón grande **Cobrar** visible; Precuenta/Cotización en **Cuenta**
- [ ] `Ctrl+Enter` abre cobro
- [ ] Cobrá la mesa → carrito vacío y mesa libre
- [ ] El carrito **no** reaparece solo tras el cobro (KI-003)
- [ ] Tablet ve el mismo estado de mesa (rojo/libre) sin forzar refresh largo
- [ ] Sin banner «Modo operativo» / companion en cajero, tablets, comandas, cocina

## 6. Sync / flota (Fase B — calmada) + BONA Obra

- [ ] En P0: un chip de sync discreto; Legal/Storage/AutoConfig no compiten en el header
- [ ] Texto visible del pill = léxico humano ([D-017](DECISIONS.md)): **Sede lista** / **En local · sincroniza sola** / **Recuperando…** / **Atención · cobro simple** — nunca DEFCON/SEAL/Z0
- [ ] Hover/title del pill puede seguir técnico (mente flota, path, peers)
- [ ] Sin toasts de «Comunicación: …» interrumpiendo cobro/comanda
- [ ] Tras cobro exitoso: sensación de cierre («Cuenta cerrada» / flash oro) — sin duda «¿pasó?»
- [ ] Apagá Wi‑Fi 30s en tablet → pill pasa a **En local…** o **Recuperando…**; al volver, datos se actualizan
- [ ] Sin errores rojos de Realtime en consola tras login (salvo ruido INSERT echo)

### BONA Obra — pase psicológico (obra de arte)

- [ ] Login → hotel caro (crema/oro, Entrar)
- [ ] Caja → silencio + Cobrar oro + pill humano
- [ ] Cobro → ritual de cierre (no ansiedad)
- [ ] Nube off → copy elegante, no pánico
- [ ] Encargado en Diagnóstico → ve «Capacidades de sede» humanas; cajero no

### BONA Aire — minimalismo ([D-018](DECISIONS.md))

- [ ] Al abrir caja: lienzo limpio (sin meta/atajos/IVA a la vista)
- [ ] Expandir **Detalle de cuenta** → subtotal/IVA/descuento/Unir·Dividir
- [ ] Letra/contraste vía menú usuario → Accesibilidad (sin banner permanente)

## 7. Nav por rol (Fase B)

- [ ] **Mesero**: menú centrado en Tablets (sin grupos vacíos ruidosos)
- [ ] **Cocina**: Comandas visible como foco
- [ ] **Caja / encargado**: punto de venta + facturas/comandas según plantilla
- [ ] `document.body.dataset.crozzoRol` coincide con el oficio (DevTools)

## 8. Lógica por rol (ROLE-OPS — KI-027…034)

Mapa: [`ROLE-OPS-INTERACTIONS.md`](ROLE-OPS-INTERACTIONS.md)

### Caja
- [ ] Directa: Limpiar no tumba mesa M1; cobro pide comandar si hay pendientes
- [ ] Mesa abierta: **Cerrar** / cambiar a Directa con consumo → toast, no abandona
- [ ] Precuenta desde **Cuenta** funciona (con `facturar`)
- [ ] Tras cobro: Cerrar panel OK; carrito no revive

### Mesero (tablet)
- [ ] Abrir mesa → +/− / nota / Comandar con feedback
- [ ] − no toca carrito de venta directa
- [ ] Post-comanda: no puede bajar lo enviado (toast encargado)

### Cocina
- [ ] LISTO / Entreg. archiva; mesa no queda morada fantasma
- [ ] Cuenta en caja intacta
- [ ] Reimprimir 🖨️ funciona (tras login cocina; migración v11)

### Encargado
- [ ] − en línea comandada baja qty y cocina refleja void
- [ ] Limpiar total libera mesa
- [ ] Cierre de turno / arqueo con `cierre_arqueo`

### Recepción (si hotel)
- [ ] Cobrar + Unir/Dividir + Precuenta
- [ ] Sin anular comandado
- [ ] Cierre turno si tiene permiso

## 9. Drills de fallo (ops superior — industria offline-first)

No basta el happy path. Simular caos real Colombia:

- [ ] **Wi‑Fi off 30s** en tablet con mesa abierta → comandar o +/− sigue; al volver, caja ve lo mismo sin re-login
- [ ] **Apagar LAN/caja ancla 45s** (o matar proceso Tauri caja) → tablet/cocina siguen o sanan (heal/mesh); al volver, sin duplicar comanda
- [ ] **Doble escritor:** mesero A y caja editan misma mesa → gana LWW; no carrito zombie
- [ ] **LISTO + cobro concurrente:** cocina marca LISTO mientras caja cobra → cuenta no revive; mesa libre coherente
- [ ] **Impresora cocina offline:** comanda visible en KDS; no tumba cobro en caja
- [ ] **Badge sync:** EN LÍNEA / HÍBRIDO / LAN coherente; cero toasts ruidosos en cobro

Ops: ver [`OPS-COMMAND-CENTER.md`](OPS-COMMAND-CENTER.md) §6 kill criteria.

### Conectividad legendaria (pase de campo L1)

Drills firmables D1–D3 (WAN off · ancla caja · recovery masivo):  
[`LEGENDARY-CONNECTIVITY-DRILLS.md`](LEGENDARY-CONNECTIVITY-DRILLS.md) · gate `npm run test:legendary-connectivity`.

## Resultado

| Fecha | Sede | Quién | OK / Fallos |
|-------|------|-------|-------------|
|       |      |       |             |

Si algo falla: `npm run issues:search -- "síntoma"` y anotar consola + dispositivo.
