/**
 * Registro de impresoras por equipo — enruta comandas al sistema que tiene térmica local.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_print_device_registry_v1';
  var STALE_MS = 120000;
  var HEARTBEAT_MS = 45000;
  var __timer = null;

  function deviceId() {
    if (typeof global.ensureCrozzoDeviceId === 'function') return global.ensureCrozzoDeviceId();
    try {
      return String(localStorage.getItem('crozzo_device_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function deviceName() {
    try {
      var cs =
        typeof global.config !== 'undefined' && global.config && typeof global.config.get === 'function'
          ? global.config.get('conexionSistemas') || {}
          : {};
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
      return String(cs.tabletName || md.lanDeviceName || cs.businessName || 'POS').trim() || 'POS';
    } catch (_) {
      return 'POS';
    }
  }

  function pantallaId() {
    if (typeof global.crozzoGetDevicePantallaId === 'function') {
      return String(global.crozzoGetDevicePantallaId() || '').trim();
    }
    return '';
  }

  function comandasAreas() {
    try {
      if (typeof global.getComandasConfig === 'function') {
        var cfg = global.getComandasConfig();
        return Array.isArray(cfg.areas) ? cfg.areas : [];
      }
    } catch (_) {}
    return [];
  }

  function areaEffectivePrinter(area) {
    if (typeof global.crozzoComandaAreaEffectivePrinter === 'function') {
      return String(global.crozzoComandaAreaEffectivePrinter(area) || '').trim();
    }
    var own = String((area && area.impresora) || '').trim();
    if (own) return own;
    try {
      if (typeof global.getFacturacionAdminConfig === 'function') {
        return String(global.getFacturacionAdminConfig().impresoraComandas || '').trim();
      }
    } catch (_) {}
    return '';
  }

  function resolvesLocally(printerName, role) {
    var name = String(printerName || '').trim();
    if (!name) return '';
    if (typeof global.crozzoResolvePrinterForJob === 'function') {
      return String(global.crozzoResolvePrinterForJob(name, role || 'comanda') || '').trim();
    }
    return name;
  }

  function areaHasOwnPrinter(areaId) {
    var areas = comandasAreas();
    for (var i = 0; i < areas.length; i++) {
      if (areas[i].id === areaId && String(areas[i].impresora || '').trim()) return true;
    }
    return false;
  }

  function collectLocalAreas() {
    var areas = comandasAreas();
    var out = {};
    areas.forEach(function (area) {
      if (!area || !area.id) return;
      var cfgName = areaEffectivePrinter(area);
      var resolved = resolvesLocally(cfgName, 'comanda');
      if (resolved) {
        out[area.id] = { printer: cfgName, resolved: resolved };
      }
    });
    try {
      if (typeof global.getFacturacionAdminConfig === 'function') {
        var globalPrn = String(global.getFacturacionAdminConfig().impresoraComandas || '').trim();
        var globalResolved = resolvesLocally(globalPrn, 'comanda');
        if (globalResolved) {
          out['*'] = { printer: globalPrn, resolved: globalResolved };
        }
      }
    } catch (_) {}
    return out;
  }

  function buildLocalEntry() {
    return {
      deviceId: deviceId(),
      deviceName: deviceName(),
      pantallaId: pantallaId(),
      updatedAt: Date.now(),
      areas: collectLocalAreas(),
    };
  }

  function readPersistedRegistry() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writePersistedRegistry(map) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function pruneStale(map) {
    var now = Date.now();
    var out = {};
    Object.keys(map || {}).forEach(function (id) {
      var e = map[id];
      if (!e || !e.deviceId) return;
      if (now - Number(e.updatedAt || 0) > STALE_MS * 4) return;
      out[id] = e;
    });
    return out;
  }

  function mergeEntry(map, entry) {
    if (!entry || !entry.deviceId) return map;
    map = pruneStale(map || readPersistedRegistry());
    map[entry.deviceId] = entry;
    writePersistedRegistry(map);
    global.__CROZZO_PRINT_DEVICE_REGISTRY = map;
    return map;
  }

  function getRegistryMap() {
    var local = buildLocalEntry();
    var map = pruneStale(readPersistedRegistry());
    map[local.deviceId] = local;
    global.__CROZZO_PRINT_DEVICE_REGISTRY = map;
    return map;
  }

  function listRegistryEntries() {
    var map = getRegistryMap();
    var now = Date.now();
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .filter(function (e) {
        return e && e.deviceId && now - Number(e.updatedAt || 0) <= STALE_MS;
      });
  }

  function entryCanPrintArea(entry, areaId) {
    if (!entry || !entry.areas) return false;
    if (entry.areas[areaId]) return true;
    if (!areaHasOwnPrinter(areaId) && entry.areas['*']) return true;
    return false;
  }

  function scoreEntry(entry, areaId) {
    var score = 0;
    if (!entryCanPrintArea(entry, areaId)) return -1;
    if (entry.areas[areaId]) score += 100;
    if (String(entry.pantallaId || '') === String(areaId)) score += 60;
    if (String(entry.pantallaId || '') === 'TODAS') score += 15;
    if (String(entry.pantallaId || '') === '') score += 5;
    score += Math.min(10, Math.floor(Number(entry.updatedAt || 0) / 600000));
    return score;
  }

  function findPrintTargetForArea(areaId) {
    areaId = String(areaId || '').trim();
    if (!areaId) return null;
    var entries = listRegistryEntries().filter(function (e) {
      return entryCanPrintArea(e, areaId);
    });
    if (!entries.length) {
      var local = buildLocalEntry();
      return entryCanPrintArea(local, areaId) ? local : null;
    }
    entries.sort(function (a, b) {
      return scoreEntry(b, areaId) - scoreEntry(a, areaId);
    });
    return entries[0] || null;
  }

  function isLocalPrintTargetForArea(areaId) {
    var target = findPrintTargetForArea(areaId);
    var my = deviceId();
    return !!(target && my && String(target.deviceId) === String(my));
  }

  function ingestRemoteEntry(entry, opts) {
    opts = opts || {};
    if (!entry || !entry.deviceId) return false;
    entry.updatedAt = Number(entry.updatedAt || Date.now());
    entry.areas = entry.areas && typeof entry.areas === 'object' ? entry.areas : {};
    mergeEntry(getRegistryMap(), entry);
    if (!opts.skipBroadcast && typeof broadcastPrintCaps === 'function') {
      broadcastPrintCaps(entry);
    }
    return true;
  }

  function isDesktopTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function broadcastPrintCaps(entry) {
    entry = entry || buildLocalEntry();
    var cfg = md();
    var body = JSON.stringify({
      event: 'lan_push',
      endpoint: '/api/sync',
      payload: { type: 'print_caps', data: entry },
    });
    if (cfg.role === 'A' && isDesktopTauri()) {
      invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
      return true;
    }
    return false;
  }

  function pushPrintCapsLanHttp(entry) {
    var cfg = md();
    if (cfg.role !== 'B') return Promise.resolve(false);
    var ip = String(cfg.centralIp || '').trim();
    if (!ip) return Promise.resolve(false);
    var port = Number(cfg.port) || 3000;
    var body = { type: 'print_caps', data: entry || buildLocalEntry() };
    try {
      return global
        .fetch('http://' + ip + ':' + port + '/api/sync', {
          method: 'POST',
          headers:
            typeof global.crozzoLanAuthHeaders === 'function'
              ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
              : { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        })
        .then(function (res) {
          return !!(res && res.ok);
        })
        .catch(function () {
          return false;
        });
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function publishLocalPrintCaps(opts) {
    opts = opts || {};
    var entry = buildLocalEntry();
    mergeEntry(getRegistryMap(), entry);
    var cfg = md();
    if (cfg.role === 'A') {
      broadcastPrintCaps(entry);
    } else if (cfg.role === 'B') {
      pushPrintCapsLanHttp(entry).catch(function () {});
    }
    if (typeof global.BroadcastChannel !== 'undefined') {
      try {
        var bc = global.__crozzoPrintCapsBc || new global.BroadcastChannel('crozzo_print_caps');
        global.__crozzoPrintCapsBc = bc;
        bc.postMessage({ type: 'print_caps', entry: entry });
      } catch (_) {}
    }
    return entry;
  }

  function applyIncomingPrintCaps(raw) {
    var pay = raw && (raw.data || raw.payload || raw.entry || raw);
    if (!pay || !pay.deviceId) return false;
    return ingestRemoteEntry(pay, { skipBroadcast: true });
  }

  function afterMainInit() {
    publishLocalPrintCaps({ silent: true });
    if (__timer) return;
    __timer = global.setInterval(function () {
      publishLocalPrintCaps({ silent: true });
    }, HEARTBEAT_MS);
    if (!global.__crozzoPrintCapsPrintersBound) {
      global.__crozzoPrintCapsPrintersBound = true;
      global.addEventListener('crozzo:printers-updated', function () {
        publishLocalPrintCaps({ silent: true });
      });
    }
    if (typeof global.BroadcastChannel !== 'undefined' && !global.__crozzoPrintCapsBcListen) {
      global.__crozzoPrintCapsBcListen = true;
      try {
        var bc = new global.BroadcastChannel('crozzo_print_caps');
        bc.onmessage = function (ev) {
          var msg = ev && ev.data;
          if (msg && msg.type === 'print_caps' && msg.entry) ingestRemoteEntry(msg.entry, { skipBroadcast: true });
        };
      } catch (_) {}
    }
  }

  global.CrozzoPrintDeviceRegistry = {
    buildLocalEntry: buildLocalEntry,
    publishLocalPrintCaps: publishLocalPrintCaps,
    applyIncomingPrintCaps: applyIncomingPrintCaps,
    findPrintTargetForArea: findPrintTargetForArea,
    isLocalPrintTargetForArea: isLocalPrintTargetForArea,
    getRegistryEntries: listRegistryEntries,
    afterMainInit: afterMainInit,
    broadcastPrintCaps: broadcastPrintCaps,
  };

  global.crozzoFindPrintTargetForArea = findPrintTargetForArea;
  global.crozzoIsLocalPrintTargetForArea = isLocalPrintTargetForArea;
  global.crozzoPublishLocalPrintCaps = publishLocalPrintCaps;
})(typeof window !== 'undefined' ? window : globalThis);
