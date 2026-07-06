/**
 * Metadatos de cadenas (Node). Evaluadores en qa-action-chains-browser.mjs
 */
export {
  evalChainMesaEstados,
  evalChainComandaRamas,
  evalChainCobroRamificaciones,
  evalChainVentaInventarioMeta,
  evalChainDualTabletLock,
} from './qa-action-chains-browser.mjs';

export const ACTION_CHAINS = [
  {
    id: 'mesa-estados-comanda-cobro',
    label: 'Mesa · pendiente → morado → rojo → verde',
    humanStory: 'Comandar, cocina entrega, caja cobra — colores de mesa coherentes',
    required: true,
  },
  {
    id: 'comanda-ramas-cocina',
    label: 'Comanda · carrito + área + historial',
    humanStory: 'Al comandar nace ticket cocina; al entregar pasa a historial sin perder trazabilidad',
    required: true,
  },
  {
    id: 'cobro-ramificaciones',
    label: 'Cobro · factura + slot pagado + carrito vacío',
    humanStory: 'El cobro debe cerrar mesa, emitir comprobante y dejar caja lista',
    required: true,
  },
  {
    id: 'venta-inventario-meta',
    label: 'Venta · meta inventario / reservorio',
    humanStory: 'Tras cobrar debe quedar registro de qué ramas de inventario se aplicaron u omitieron',
    required: true,
  },
  {
    id: 'tablet-dual-slot-lock',
    label: '2 meseros · misma mesa · anti-pisoteo',
    humanStory: 'Un segundo dispositivo debe ver que otro mesero ya ocupa la mesa antes de pisarla',
    required: true,
  },
];
