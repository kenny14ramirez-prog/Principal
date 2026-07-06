/**
 * Matriz de escala de flota — techo diseño 100 dispositivos.
 * Escalones progresivos + horizontes simulados (días) + capas de conectividad.
 */

export const DESIGN_DEVICE_CEILING = 100;

export const FLEET_INTENSITY = {
  normal: {
    label: 'Normal',
    pcs: 2,
    tablets: 4,
    browserParallelMax: 4,
    httpTiers: [2, 5, 10],
    horizons: ['1d', '8d'],
    adversarial: true,
  },
  intensiva: {
    label: 'Intensiva · salón cargado',
    pcs: 5,
    tablets: 10,
    browserParallelMax: 10,
    httpTiers: [2, 5, 10, 20, 30, 40, 50, 100],
    horizons: ['1d', '8d', '15d', '30d', '365d'],
    adversarial: true,
  },
};

/** Dispositivos básicos 1→6, luego de 10 en 10 hasta techo. */
export const PROGRESSIVE_TIERS = [1, 2, 3, 4, 5, 6, 10, 20, 30, 40, 50, 100];

export const TIME_HORIZONS = [
  {
    id: '1d',
    label: '1 día · arranque básico',
    tiers: [1, 2, 3, 4, 5, 6],
    loopMultiplier: 1,
  },
  {
    id: '8d',
    label: '8 días · primeras mesas saturadas',
    tiers: [10],
    loopMultiplier: 2,
  },
  {
    id: '15d',
    label: '15 días · fin de semana',
    tiers: [20],
    loopMultiplier: 3,
  },
  {
    id: '30d',
    label: '30 días · operación estable',
    tiers: [30, 40],
    loopMultiplier: 4,
  },
  {
    id: '365d',
    label: '1 año · techo de diseño',
    tiers: [50, 100],
    loopMultiplier: 5,
  },
];

/** Capas de comunicación que el QA debe verificar (presencia de APIs + comportamiento). */
export const CONNECTIVITY_LAYERS = [
  {
    id: 'lan-router',
    label: 'LAN · router local sin Internet',
    probeKeys: ['lanPost', 'lanPull', 'lanOpsSync'],
    humanStory: 'Tablets y PCs en la misma red hablan con la caja central',
  },
  {
    id: 'tablet-pc',
    label: 'Tablet ↔ PC central',
    probeKeys: ['lanPost', 'multiDeviceConfig'],
    humanStory: 'Comanda en tablet llega a caja sin pisar carritos ajenos',
  },
  {
    id: 'tablet-tablet',
    label: 'Tablet ↔ Tablet (presencia + runtime)',
    probeKeys: ['slotLockPeer', 'runtimeFanout'],
    humanStory: 'Dos meseros no pisan la misma mesa; runtime coherente',
  },
  {
    id: 'wifi-zone',
    label: 'Zona Wi‑Fi del local',
    probeKeys: ['wifiZoneResolve'],
    humanStory: 'Resolución automática de central por SSID/zona',
  },
  {
    id: 'ble-mesh',
    label: 'Bluetooth / malla BLE',
    probeKeys: ['bleMesh', 'blePeerRegistry'],
    humanStory: 'Respaldo cuando LAN falla; peers por nombre',
  },
  {
    id: 'cloud-wan',
    label: 'Nube · WAN',
    probeKeys: ['cloudPush', 'cloudPull', 'connectivityDirector'],
    humanStory: 'Sync remoto cuando hay Internet; degradación elegante sin WAN',
  },
];

export function parseFleetIntensity(argv) {
  const raw = (argv || []).find((a) => a.startsWith('--intensity='));
  const key = raw ? raw.split('=')[1] : 'normal';
  return FLEET_INTENSITY[key] || FLEET_INTENSITY.normal;
}

export function horizonsForIntensity(intensity) {
  const ids = intensity.horizons || ['1d'];
  return TIME_HORIZONS.filter((h) => ids.includes(h.id));
}

export function tiersForHorizon(horizon, intensity) {
  const allowed = new Set(intensity.httpTiers || PROGRESSIVE_TIERS);
  return (horizon.tiers || []).filter((t) => allowed.has(t));
}
