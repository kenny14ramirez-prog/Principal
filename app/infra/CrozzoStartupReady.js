/**
 * Crozzo — Arranque "todo listo" (no bloqueante).
 *
 * Al iniciar la app: detecta capacidades del equipo, pide los permisos
 * necesarios de forma amable, arranca el orquestador de conectividad y corre
 * una autoprueba silenciosa de la nube + LAN, dejando un snapshot consultable.
 * Nunca bloquea ni interrumpe la operacion (todo diferido y con try/catch).
 */
(function (global) {
  'use strict';

  var __ran = false;
  var LS_CAM_ASKED = 'crozzo_perm_cam_asked_v1';
  var LS_SNAPSHOT = 'crozzo_startup_ready_v1';
  var LS_CLOUDIO_AT = 'crozzo_cloud_io_selftest_at_v1';
  var CLOUDIO_THROTTLE_MS = 21600000; // autoprueba activa de escritura: 1 cada 6 h

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  function isTauri() {
    return !!(global.__TAURI__ || global.__TAURI_INTERNALS__ || global.__CROZZO_IS_TAURI__);
  }

  function isAndroidApk() {
    if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.isAndroidApk === 'function') {
      return safe(function () {
        return global.CrozzoAndroidNative.isAndroidApk();
      }) || false;
    }
    if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.isAndroidApk === 'function') {
      return safe(function () {
        return global.CrozzoDeviceForm.isAndroidApk();
      }) || false;
    }
    return false;
  }

  function canDeployHotspot() {
    return isTauri() && !isAndroidApk();
  }

  function roleNow() {
    var r = safe(function () {
      return (global.getMultiDeviceConfig && global.getMultiDeviceConfig().role) || '';
    });
    return r === 'B' ? 'B' : 'A';
  }

  /**
   * Caja de escritorio (Windows): deja el hotspot automatico activado por
   * defecto la primera vez, para que despliegue su zona Wi-Fi sin intervencion
   * si se cae el router. No pisa una eleccion previa del usuario.
   */
  function ensureAutoHotspotDefault() {
    if (roleNow() !== 'A' || !canDeployHotspot()) return;
    safe(function () {
      var cur = global.localStorage.getItem('crozzo_auto_hotspot_v1');
      if (cur === null || cur === undefined) {
        global.localStorage.setItem('crozzo_auto_hotspot_v1', '1');
      }
    });
  }

  /**
   * Pre-pide el permiso de camara (para escanear el QR del dia) una sola vez por
   * instalacion, en APK/tablet. En navegador/escritorio se deja on-demand para
   * no molestar; getUserMedia pedira su propio permiso al usarse.
   */
  function prewarmBluetoothMesh() {
    safe(function () {
      if (!global.CrozzoBlePeerRegistry) return;
      if (isAndroidApk()) {
        global.setTimeout(function () {
          if (typeof global.CrozzoBlePeerRegistry.prewarmBluetoothOnApkBoot === 'function') {
            global.CrozzoBlePeerRegistry.prewarmBluetoothOnApkBoot().catch(function () {});
          }
        }, 1400);
      } else if (typeof global.CrozzoBlePeerRegistry.prewarmDesktopMesh === 'function') {
        // Diferido: no compite con el primer render ni con el orquestador de conectividad.
        // Con nube activa la malla solo se levanta si cae internet/LAN (fase mesh).
        global.setTimeout(function () {
          var wan =
            typeof global.crozzoWanOnline === 'function' ? global.crozzoWanOnline() : !!global.navigator.onLine;
          if (wan && cloudConfigured()) return;
          global.CrozzoBlePeerRegistry.prewarmDesktopMesh();
        }, 5000);
      }
    });
  }

  function prewarmCameraPermission() {
    if (isAndroidApk()) {
      var asked = safe(function () {
        return global.localStorage.getItem(LS_CAM_ASKED) === '1';
      });
      if (asked) return;
      if (roleNow() !== 'B') return;
      safe(function () {
        global.localStorage.setItem(LS_CAM_ASKED, '1');
      });
      safe(function () {
        if (
          global.CrozzoPairingQrReader &&
          typeof global.CrozzoPairingQrReader.ensureOsCameraPermission === 'function'
        ) {
          global.CrozzoPairingQrReader.ensureOsCameraPermission().catch(function () {});
        }
      });
      return;
    }
    if (!isTauri()) return;
    safe(function () {
      var core = global.__TAURI__ && global.__TAURI__.core;
      if (!core || typeof core.invoke !== 'function') return;
      global.setTimeout(function () {
        core.invoke('cxf_reset_webview_camera_permission').catch(function () {});
      }, 900);
    });
  }

  function readCloudConfig() {
    return safe(function () {
      return typeof global.readCrozzoSupabaseJson === 'function' ? global.readCrozzoSupabaseJson() : null;
    }) || null;
  }

  function cloudConfigured() {
    var j = readCloudConfig();
    if (!j || !j.syncEnabled) return false;
    var key = safe(function () {
      return typeof global.crozzoSupabaseEffectiveAnonKey === 'function'
        ? global.crozzoSupabaseEffectiveAnonKey(j)
        : String(j.key || j.anonKey || '').trim();
    }) || '';
    var url = String(j.url || '').trim();
    if (typeof global.isValidSupabasePair === 'function') return global.isValidSupabasePair(url, key);
    return /supabase\.co/i.test(url) && key.length >= 20;
  }

  function cloudReady() {
    return !!(
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      global.__SUPABASE
    );
  }

  async function probeLanQuick() {
    if (typeof global.crozzoProbeLocalLanReachable !== 'function') return null;
    try {
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
      var r = await global.crozzoProbeLocalLanReachable(md);
      return !!(r && r.ok);
    } catch (e) {
      return null;
    }
  }

  function cloudIoThrottled() {
    var last = safe(function () {
      return Number(global.localStorage.getItem(LS_CLOUDIO_AT)) || 0;
    }) || 0;
    return last && Date.now() - last < CLOUDIO_THROTTLE_MS;
  }

  async function runSelfTest(snapshot) {
    // Autoprueba activa de envio/recepcion (headless). Escribe en la nube, asi
    // que se limita a una vez cada 6 h para no generar churn en cada arranque.
    if (cloudReady() && typeof global.crozzoRunCloudIoSelfTest === 'function') {
      if (cloudIoThrottled()) {
        var prev = getSnapshot();
        snapshot.cloudIo = (prev && prev.cloudIo) || 'omitido_reciente';
        snapshot.cloudIoSummary = (prev && prev.cloudIoSummary) || '';
      } else {
        try {
          var res = await global.crozzoRunCloudIoSelfTest();
          snapshot.cloudIo = (res && res.level) || 'unknown';
          snapshot.cloudIoSummary = (res && res.summary) || '';
          safe(function () {
            global.localStorage.setItem(LS_CLOUDIO_AT, String(Date.now()));
          });
        } catch (e) {
          snapshot.cloudIo = 'error';
        }
      }
    } else {
      snapshot.cloudIo = cloudReady() ? 'sin_prueba' : 'nube_off';
    }
    snapshot.lanOk = await probeLanQuick();
  }

  function notifyIfCritical(snapshot) {
    var msg = '';
    if (snapshot.cloudConfigured && !snapshot.cloudReady) {
      msg = 'La nube esta configurada pero no inicio: revise credenciales en Super Admin > Nube.';
    } else if (snapshot.cloudReady && (snapshot.cloudIo === 'fail' || snapshot.cloudIo === 'error')) {
      msg = 'La nube responde pero no acepta datos: revise tablas/RLS en Diagnostico (Pruebas de sistema).';
    }
    if (!msg) return;
    // "Sin aceptar a cada rato": el aviso se muestra como maximo 1 vez al dia por
    // mensaje, no en cada arranque. La operacion nunca se bloquea por esto.
    var sig = '';
    try {
      var d = new Date();
      sig = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() + '|' + msg.slice(0, 24);
      if (global.localStorage.getItem('crozzo_startup_notice_v1') === sig) return;
      global.localStorage.setItem('crozzo_startup_notice_v1', sig);
    } catch (_) {}
    safe(function () {
      if (typeof global.showToast === 'function') global.showToast(msg, 'warning');
    });
  }

  function persistSnapshot(snapshot) {
    safe(function () {
      global.__CROZZO_STARTUP_READY = snapshot;
    });
    safe(function () {
      global.localStorage.setItem(LS_SNAPSHOT, JSON.stringify(snapshot));
    });
  }

  async function pipeline() {
    var snapshot = {
      at: Date.now(),
      isTauri: isTauri(),
      isAndroid: isAndroidApk(),
      role: roleNow(),
      canDeployHotspot: canDeployHotspot(),
      cloudConfigured: cloudConfigured(),
      cloudReady: cloudReady(),
      cloudIo: 'pending',
      lanOk: null,
    };

    ensureAutoHotspotDefault();
    prewarmCameraPermission();
    prewarmBluetoothMesh();

    // Corrige el reloj local si esta mal puesto (afecta caducidad de QR y sync).
    safe(function () {
      if (global.CrozzoClockSync && typeof global.CrozzoClockSync.start === 'function') {
        global.CrozzoClockSync.start();
      }
    });

    // Arranca el orquestador de la cascada de conectividad.
    safe(function () {
      if (global.CrozzoConnectivityOrchestrator && typeof global.CrozzoConnectivityOrchestrator.start === 'function') {
        global.CrozzoConnectivityOrchestrator.start();
      }
    });

    // Diario operativo + dev tap (antes de autoguarda).
    safe(function () {
      if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.start === 'function') {
        global.CrozzoOperativeJournal.start();
      }
      if (global.CrozzoDevTap && typeof global.CrozzoDevTap.start === 'function') {
        global.CrozzoDevTap.start();
      }
    });

    safe(function () {
      if (global.CrozzoDevicePerf && typeof global.CrozzoDevicePerf.startContinuousProbe === 'function') {
        global.CrozzoDevicePerf.startContinuousProbe();
      }
    });

    safe(function () {
      if (global.CrozzoFleetOperationalReconcile && typeof global.CrozzoFleetOperationalReconcile.start === 'function') {
        global.CrozzoFleetOperationalReconcile.start();
      }
    });

    safe(function () {
      global.setTimeout(function () {
        try {
          var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
          if (md.allowLan === false) return;
          if (typeof global.crozzoPairingAutoConnect === 'function') {
            global.crozzoPairingAutoConnect('startup', { force: false, skipInvalidate: true }).catch(function () {});
          } else if (typeof global.crozzoActivateLocalSyncPath === 'function') {
            global.crozzoActivateLocalSyncPath('startup').catch(function () {});
          }
        } catch (_) {}
      }, 5000);
    });

    // Autoguarda Z0: autoevalúa y recupera sync operativa sin intervención del usuario.
    safe(function () {
      if (global.CrozzoZ0AutoGuard && typeof global.CrozzoZ0AutoGuard.start === 'function') {
        global.CrozzoZ0AutoGuard.start();
      }
    });

    // Sync nube: postInitCloud (CrozzoPosCloud) ya lo dispara; aqui solo respaldo si aun no arranco.
    safe(function () {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
      var can = '';
      var loc = '';
      safe(function () {
        var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
        loc = String(md.locationId || '').trim();
        if (typeof global.crozzoCanonicalLocationFromBusiness === 'function') {
          can = String(global.crozzoCanonicalLocationFromBusiness(md.businessId) || '').trim();
        }
      });
      if (can && loc && loc !== 'default' && loc !== can && typeof global.crozzoForceSedeCanonical === 'function') {
        global.crozzoForceSedeCanonical();
      }
    });
    safe(function () {
      if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
        global.setTimeout(function () {
          if (global.__crozzoCloudSyncBootstrapped) return;
          var wan =
            typeof global.crozzoWanOnline === 'function' ? global.crozzoWanOnline() : !!global.navigator.onLine;
          var cloudOk =
            typeof global.crozzoCloudBackgroundSyncAllowed === 'function'
              ? global.crozzoCloudBackgroundSyncAllowed({ force: true, kind: 'startup' })
              : wan;
          if (wan && cloudConfigured() && cloudOk) {
            global.crozzoEnsureCloudSyncActive({ source: 'startup', resetTableMissing: true }).catch(function () {});
          }
        }, 3500);
      }
    });

    // Registro interno de QRs (todos los dispositivos, cada 4 h).
    safe(function () {
      if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.start === 'function') {
        global.CrozzoInternalQrRegistry.start();
      } else if (global.CrozzoDailyPairing && typeof global.CrozzoDailyPairing.ensureToday === 'function') {
        global.CrozzoDailyPairing.ensureToday();
      }
    });

    await runSelfTest(snapshot);
    snapshot.cloudReady = cloudReady();
    persistSnapshot(snapshot);
    notifyIfCritical(snapshot);
    return snapshot;
  }

  function run() {
    if (__ran) return;
    __ran = true;
    // Diferido: no retrasa el primer render ni el login.
    var kick = function () {
      pipeline().catch(function (e) {
        safe(function () {
          console.warn('[startup-ready] pipeline', e);
        });
      });
    };
    if (typeof global.requestIdleCallback === 'function') {
      global.requestIdleCallback(kick, { timeout: 2500 });
    } else {
      global.setTimeout(kick, 1200);
    }
  }

  function getSnapshot() {
    if (global.__CROZZO_STARTUP_READY) return global.__CROZZO_STARTUP_READY;
    return safe(function () {
      var raw = global.localStorage.getItem(LS_SNAPSHOT);
      return raw ? JSON.parse(raw) : null;
    }) || null;
  }

  global.CrozzoStartupReady = {
    run: run,
    getSnapshot: getSnapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
