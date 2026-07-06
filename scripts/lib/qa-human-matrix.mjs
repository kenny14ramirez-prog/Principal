/**
 * Matriz humana QA — roles, experiencia operativa y expectativas de acompañamiento.
 * Integra CrozzoOperativePsyche (perfil empresa) + Companion (rol/página).
 */

export const INTENSITY = {
  normal: { salesLoop: 1, allPersonas: false, adversarial: true, label: 'Normal' },
  intensiva: { salesLoop: 5, allPersonas: true, adversarial: true, label: 'Intensiva' },
  maraton: { salesLoop: 12, allPersonas: true, adversarial: true, label: 'Maratón (simula turno largo)' },
};

/** Encargado de turno — supervisor operativo (NO superadmin). */
export const OPERATIONAL_SUPERVISOR = {
  id: 'encargado',
  label: 'Encargado de turno',
  userId: 'ENC1',
  rol: 'encargado',
  perfilEmpresa: 'basico_restaurante',
  home: 'inicio-operacion',
  pagesOk: ['cajero', 'tablets', 'centro-compras'],
  pagesDenied: [],
  companionPage: 'cajero',
  humanExpect: 'Supervisión de turno, arqueo y desbloqueos sin bypass de superadmin',
};

export const PERSONAS = [
  {
    id: 'cajero-novato',
    label: 'Cajero · primer turno',
    userId: 'CAJNOV',
    rol: 'caja',
    perfilEmpresa: 'basico_restaurante',
    home: 'cajero',
    pagesOk: ['cajero', 'inicio-operacion', 'cierre-caja'],
    pagesDenied: ['admin', 'gestion-perfiles-menus'],
    companionPage: 'cajero',
    humanExpect: 'Guía paso a paso, tono calmado, bloqueos explicados sin jerga',
  },
  {
    id: 'cajero-experto',
    label: 'Cajero · veterano',
    userId: 'CAJEXP',
    rol: 'caja',
    perfilEmpresa: 'personalizado',
    home: 'cajero',
    pagesOk: ['cajero', 'inicio-operacion', 'facturas'],
    pagesDenied: ['gestion-perfiles-menus'],
    companionPage: 'cajero',
    humanExpect: 'Menos hand-holding, ritmo rápido, atajos visibles',
  },
  {
    id: 'mesero-novato',
    label: 'Mesero · aprendiz',
    userId: 'MESNOV',
    rol: 'mesero',
    perfilEmpresa: 'basico_restaurante',
    home: 'tablets',
    pagesOk: ['tablets'],
    pagesDenied: ['cierre-caja', 'admin', 'comandas'],
    companionPage: 'tablets',
    humanExpect: 'Tablet clara, aviso antes/después de comandar',
  },
  {
    id: 'mesero-experto',
    label: 'Mesero · sala experta',
    userId: 'MESEXP',
    rol: 'mesero',
    perfilEmpresa: 'personalizado',
    home: 'tablets',
    pagesOk: ['tablets'],
    pagesDenied: ['cierre-caja'],
    companionPage: 'tablets',
    humanExpect: 'Flujo rápido, mínima fricción en precuenta',
  },
  {
    id: 'cocina',
    label: 'Cocina / producción',
    userId: 'COCINA1',
    rol: 'cocina',
    perfilEmpresa: 'basico_restaurante',
    home: 'comandas',
    pagesOk: ['comandas'],
    pagesDenied: ['cajero', 'cierre-caja', 'cocina'],
    companionPage: 'comandas',
    humanExpect: 'LISTO visible, receta a mano, sin editar pedido ajeno',
  },
  {
    id: 'encargado',
    label: 'Encargado de turno',
    userId: 'ENC1',
    rol: 'encargado',
    perfilEmpresa: 'basico_restaurante',
    home: 'inicio-operacion',
    pagesOk: ['cajero', 'tablets', 'centro-compras'],
    pagesDenied: ['gestion-perfiles-menus'],
    companionPage: 'centro-compras',
    humanExpect: 'Puede corregir errores ajenos con trazabilidad',
  },
  {
    id: 'gf-compras',
    label: 'Jefe de compras / GF',
    userId: 'GF1',
    rol: 'inventario',
    perfilEmpresa: 'basico_restaurante',
    home: 'centro-compras',
    pagesOk: ['centro-compras', 'inventarios'],
    pagesDenied: ['cajero'],
    companionPage: 'centro-compras',
    humanExpect: 'Conciliación clara, cajero carga — GF revisa',
  },
  {
    id: 'admin',
    label: 'Administrador/a local',
    userId: 'ADM1',
    rol: 'admin',
    perfilEmpresa: 'personalizado',
    home: 'admin',
    pagesOk: ['admin', 'inicio-operacion'],
    pagesDenied: [],
    companionPage: 'admin',
    humanExpect: 'Configura una vez; equipo opera con comodidad',
  },
];

export function parseIntensity(argv) {
  const arg = (argv || []).find((a) => a.startsWith('--intensity='));
  const key = arg ? arg.split('=')[1] : 'normal';
  return INTENSITY[key] ? { key, ...INTENSITY[key] } : { key: 'normal', ...INTENSITY.normal };
}

export function selectPersonas(intensity) {
  if (intensity.allPersonas) return PERSONAS.slice();
  return PERSONAS.filter((p) => ['cajero-novato', 'mesero-novato', 'cocina', 'encargado'].includes(p.id));
}

export const ADVERSARIAL_SCENARIOS = [
  {
    id: 'post-comandar-block',
    label: 'Mesero intenta quitar plato ya en cocina',
    humanStory: 'Error humano típico: tocar "-" después de comandar',
    severity: 'must-block',
  },
  {
    id: 'double-cobro-guard',
    label: 'Doble cobro simultáneo',
    humanStory: 'Doble clic ansioso en cobrar',
    severity: 'must-block',
  },
  {
    id: 'nav-spam',
    label: 'Navegación errática entre pantallas',
    humanStory: 'Usuario perdido o impaciente saltando menús',
    severity: 'must-survive',
  },
  {
    id: 'arqueo-desbalance',
    label: 'Arqueo con conteo incorrecto',
    humanStory: 'Error de conteo — sistema debe mostrar diferencia',
    severity: 'must-detect',
  },
  {
    id: 'empty-comandar',
    label: 'Comandar carrito vacío',
    humanStory: 'Botón comandar sin sentido',
    severity: 'must-graceful',
  },
];
