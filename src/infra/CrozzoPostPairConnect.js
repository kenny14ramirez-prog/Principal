/**
 * Crozzo — Post-QR + Enlace Supremo.
 * Un escaneo → cascada visible de sistemas (identidad, red, caja, nube, catálogo, malla, mente).
 */
(function (global) {
  'use strict';

  var PENDING_KEY = 'crozzo_post_pair_pending';
  var HINTS_KEY = 'crozzo_pair_network_hints';
  var __inflight = null;
  var POLL_MS = 1800;
  var MAX_WAIT_MS = 36000;

  var CASCADE_STEPS = [
    { id: 'identity', label: 'Identidad del local', sub: 'Sede y negocio verificados' },
    { id: 'network', label: 'Red inteligente', sub: 'Wi‑Fi · Bluetooth · LAN' },
    { id: 'caja', label: 'Enlace con la caja', sub: 'Servidor central en vivo' },
    { id: 'cloud', label: 'Canal seguro nube', sub: 'Sincronización híbrida' },
    { id: 'catalog', label: 'Catálogo operativo', sub: 'Productos y equipo' },
    { id: 'mesh', label: 'Malla de respaldo', sub: 'Equipos cercanos en standby' },
    { id: 'mind', label: 'Mente del dispositivo', sub: 'Rutas autónomas activas' },
  ];

  var __supreme = { open: false, stepStates: {}, bizName: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function isRoleB() {
    var md = safe(function () {
      return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    }, {});
    return String(md.role || 'A').toUpperCase() === 'B';
  }

  function wanOnline() {
    try {
      return global.navigator && global.navigator.onLine !== false;
    } catch (_) {
      return true;
    }
  }

  function lanReachable() {
    try {
      var last = global.__CROZZO_LAN_LAST_OK;
      if (last && Date.now() - last < 45000) return true;
    } catch (_) {}
    return String(global.__CROZZO_TIER_LAST || '') === 'lan';
  }

  function cloudOk() {
    return String(global.__CROZZO_TIER_LAST || '') === 'cloud';
  }

  function connectedEnough() {
    return lanReachable() || cloudOk();
  }

  function resolveBizName(payload) {
    payload = payload || {};
    return (
      String(payload.business_name || payload.businessName || '').trim() ||
      safe(function () {
        var md = global.getMultiDeviceConfig ? global.getMultiDeviceConfig() : {};
        return String(md.businessName || '').trim();
      }, '') ||
      safe(function () {
        if (global.CrozzoInstallPremium && global.CrozzoInstallPremium.resolveBusinessName) {
          return String(global.CrozzoInstallPremium.resolveBusinessName() || '').trim();
        }
        return '';
      }, '')
    );
  }

  function playFanfare() {
    safe(function () {
      if (global.CrozzoInstallPremium && typeof global.CrozzoInstallPremium.playPairingSuccessChime === 'function') {
        global.CrozzoInstallPremium.playPairingSuccessChime();
      }
    });
    safe(function () {
      if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.hapticOpen === 'function') {
        global.CrozzoAndroidNative.hapticOpen();
      } else if (global.navigator && typeof global.navigator.vibrate === 'function') {
        global.navigator.vibrate([18, 40, 28]);
      }
    });
  }

  /* ── Enlace Supremo (cascada visual) ── */

  function ensureSupremeOverlay() {
    if (!global.document || !global.document.body) return null;
    var el = global.document.getElementById('crozzoSupremeLink');
    if (el) return el;
    el = global.document.createElement('div');
    el.id = 'crozzoSupremeLink';
    el.className = 'crozzo-supreme-link';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="crozzo-supreme-link__backdrop" aria-hidden="true"></div>' +
      '<div class="crozzo-supreme-link__particles" aria-hidden="true"></div>' +
      '<div class="crozzo-supreme-link__card">' +
      '<div class="crozzo-supreme-link__orb" aria-hidden="true"><span class="crozzo-supreme-link__orb-core"></span></div>' +
      '<p class="crozzo-supreme-link__eyebrow" id="crozzoSupremeEyebrow">Crozzo · enlace supremo</p>' +
      '<h2 class="crozzo-supreme-link__title" id="crozzoSupremeTitle">Activando el ecosistema</h2>' +
      '<p class="crozzo-supreme-link__lead" id="crozzoSupremeLead">Un escaneo · mil conexiones en marcha</p>' +
      '<ul class="crozzo-supreme-link__steps" id="crozzoSupremeSteps"></ul>' +
      '<p class="crozzo-supreme-link__foot" id="crozzoSupremeFoot"></p>' +
      '</div>';
    global.document.body.appendChild(el);
    return el;
  }

  function renderSupremeSteps() {
    var list = global.document.getElementById('crozzoSupremeSteps');
    if (!list) return;
    list.innerHTML = CASCADE_STEPS.map(function (s) {
      var st = __supreme.stepStates[s.id] || 'pending';
      return (
        '<li class="crozzo-supreme-link__step crozzo-supreme-link__step--' +
        st +
        '" data-step="' +
        esc(s.id) +
        '">' +
        '<span class="crozzo-supreme-link__step-dot" aria-hidden="true"></span>' +
        '<span class="crozzo-supreme-link__step-body">' +
        '<span class="crozzo-supreme-link__step-label">' +
        esc(s.label) +
        '</span>' +
        '<span class="crozzo-supreme-link__step-sub">' +
        esc(s.sub) +
        '</span>' +
        '</span></li>'
      );
    }).join('');
  }

  function setStepState(stepId, state) {
    if (!stepId) return;
    __supreme.stepStates[stepId] = state || 'done';
    var row = global.document.querySelector('.crozzo-supreme-link__step[data-step="' + stepId + '"]');
    if (row) {
      row.className = 'crozzo-supreme-link__step crozzo-supreme-link__step--' + (state || 'done');
    } else {
      renderSupremeSteps();
    }
    updateSupremeFoot();
  }

  function countDoneSteps() {
    var n = 0;
    CASCADE_STEPS.forEach(function (s) {
      if (__supreme.stepStates[s.id] === 'done') n++;
    });
    return n;
  }

  function updateSupremeFoot() {
    var foot = global.document.getElementById('crozzoSupremeFoot');
    if (!foot) return;
    var done = countDoneSteps();
    var total = CASCADE_STEPS.length;
    if (__supreme.open && done < total) {
      foot.textContent = done + ' de ' + total + ' sistemas activos…';
    }
  }

  function openSupreme(opts) {
    opts = opts || {};
    var el = ensureSupremeOverlay();
    if (!el) return;
    __supreme.open = true;
    __supreme.bizName = resolveBizName(opts.payload || opts);
    __supreme.stepStates = {};
    CASCADE_STEPS.forEach(function (s, i) {
      __supreme.stepStates[s.id] = i === 0 ? 'active' : 'pending';
    });
    var eyebrow = global.document.getElementById('crozzoSupremeEyebrow');
    var title = global.document.getElementById('crozzoSupremeTitle');
    var lead = global.document.getElementById('crozzoSupremeLead');
    if (eyebrow) eyebrow.textContent = __supreme.bizName ? 'Crozzo · ' + __supreme.bizName : 'Crozzo · enlace supremo';
    if (title) title.textContent = 'Activando el ecosistema';
    if (lead) lead.textContent = 'Un escaneo · mil conexiones en marcha';
    el.classList.remove('crozzo-supreme-link--celebrate', 'crozzo-supreme-link--out');
    renderSupremeSteps();
    updateSupremeFoot();
    el.hidden = false;
    requestAnimationFrame(function () {
      el.classList.add('crozzo-supreme-link--in');
    });
  }

  function closeSupreme(delayMs) {
    delayMs = delayMs == null ? 0 : delayMs;
    global.setTimeout(function () {
      var el = global.document.getElementById('crozzoSupremeLink');
      if (!el) return;
      el.classList.add('crozzo-supreme-link--out');
      global.setTimeout(function () {
        el.hidden = true;
        el.classList.remove('crozzo-supreme-link--in', 'crozzo-supreme-link--out', 'crozzo-supreme-link--celebrate');
        __supreme.open = false;
      }, 420);
    }, delayMs);
  }

  function celebrateSupreme(opts) {
    opts = opts || {};
    var el = global.document.getElementById('crozzoSupremeLink');
    if (!el) {
      playFanfare();
      return Promise.resolve();
    }
    CASCADE_STEPS.forEach(function (s) {
      __supreme.stepStates[s.id] = 'done';
    });
    renderSupremeSteps();
    var title = global.document.getElementById('crozzoSupremeTitle');
    var lead = global.document.getElementById('crozzoSupremeLead');
    var foot = global.document.getElementById('crozzoSupremeFoot');
    if (title) title.textContent = 'Ecosistema activo';
    if (lead) {
      lead.textContent = opts.subtitle || 'Su terminal ya dialoga con la caja, la nube y la malla local.';
    }
    if (foot) {
      foot.textContent =
        CASCADE_STEPS.length + ' sistemas enlazados · listo para operar';
    }
    el.classList.add('crozzo-supreme-link--celebrate');
    playFanfare();
    global.__CROZZO_SUPREME_JUST_CELEBRATED = Date.now();
    return new Promise(function (resolve) {
      closeSupreme(opts.holdMs != null ? opts.holdMs : 2400);
      global.setTimeout(resolve, (opts.holdMs != null ? opts.holdMs : 2400) + 450);
    });
  }

  function runTurboCascade() {
    return new Promise(function (resolve) {
      var i = 0;
      function next() {
        if (i >= CASCADE_STEPS.length) {
          resolve();
          return;
        }
        var id = CASCADE_STEPS[i].id;
        setStepState(id, 'active');
        global.setTimeout(function () {
          setStepState(id, 'done');
          i++;
          next();
        }, 72);
      }
      openSupreme({});
      next();
    });
  }

  function pulseStep(stepId, state) {
    if (!__supreme.open) return;
    if (state === 'active') {
      setStepState(stepId, 'active');
      return;
    }
    setStepState(stepId, 'done');
    var idx = -1;
    for (var i = 0; i < CASCADE_STEPS.length; i++) {
      if (CASCADE_STEPS[i].id === stepId) {
        idx = i;
        break;
      }
    }
    if (idx >= 0 && idx + 1 < CASCADE_STEPS.length) {
      var nextId = CASCADE_STEPS[idx + 1].id;
      if (__supreme.stepStates[nextId] === 'pending') setStepState(nextId, 'active');
    }
  }

  global.crozzoSupremeLinkPulse = function (stepId, state) {
    pulseStep(stepId, state);
  };

  function bindSupremeEvents() {
    if (global.__crozzoSupremeBound) return;
    global.__crozzoSupremeBound = true;
    global.addEventListener('crozzo-supreme-link-begin', function (ev) {
      var d = (ev && ev.detail) || {};
      if (String(d.profile || '').toLowerCase() === 'caja') return;
      openSupreme(d);
    });
    global.addEventListener('crozzo-supreme-link-step', function (ev) {
      var d = (ev && ev.detail) || {};
      if (d.step) pulseStep(d.step, d.state || 'done');
    });
  }

  /* ── Red / hints ── */

  function extractHints(payload) {
    payload = payload || {};
    var primary = payload.network_primary || {};
    var fallback = payload.network_fallback_b || {};
    var lan = payload.lan || {};
    var primaryNote = String(primary.ssid_note || payload.network_ssid || '').trim();
    var fallbackNote = String(fallback.ssid_note || '').trim();
    var ssid = String(fallback.ssid || primary.ssid || '').trim();
    var passphrase = String(fallback.passphrase || fallback.wifi_pass || primary.passphrase || '').trim();
    if (!ssid && fallbackNote && fallbackNote.indexOf('«') >= 0) {
      var m = fallbackNote.match(/«([^»]+)»/);
      if (m) ssid = m[1].trim();
    }
    return {
      primaryNote: primaryNote,
      fallbackNote: fallbackNote,
      ssid: ssid,
      passphrase: passphrase,
      centralIp: String(lan.central_ip || lan.server_ip || payload.central_ip || '').trim(),
      port: Math.max(1, Number(lan.port || payload.port) || 3000),
      cloudSync: payload.cloud_sync !== false,
    };
  }

  function persistHints(payload) {
    var hints = extractHints(payload);
    try {
      global.localStorage.setItem(HINTS_KEY, JSON.stringify({ savedAt: Date.now(), hints: hints, raw: payload }));
    } catch (_) {}
    if (hints.fallbackNote) {
      try {
        global.localStorage.setItem('crozzo_network_fallback_note', hints.fallbackNote);
      } catch (_) {}
    }
    return hints;
  }

  function loadHints() {
    try {
      var raw = global.localStorage.getItem(HINTS_KEY);
      if (!raw) return null;
      return (JSON.parse(raw).hints) || null;
    } catch (_) {
      return null;
    }
  }

  function loadHintsPayload() {
    try {
      var raw = global.localStorage.getItem(HINTS_KEY);
      if (!raw) return null;
      return (JSON.parse(raw).raw) || null;
    } catch (_) {
      return null;
    }
  }

  async function probeCaja(hints, opts) {
    opts = opts || {};
    hints = hints || loadHints() || {};
    var cip = String(hints.centralIp || '').trim();
    var port = Math.max(1, Number(hints.port) || 3000);
    if (!cip) return { ok: false, reason: 'no_ip' };
    if (opts.trustPairingProbe && global.__CROZZO_PAIR_PROBE_OK === true) {
      return { ok: true, via: 'pairing_apply' };
    }
    if (lanReachable()) return { ok: true, via: 'lan_tier' };
    if (typeof global.crozzoPairingProbeCajaHealth === 'function') {
      var r = await global.crozzoPairingProbeCajaHealth(cip, port, {
        retries: opts.retries || 3,
        delayMs: opts.delayMs || 500,
      });
      return r && r.ok ? { ok: true, via: 'health' } : { ok: false, reason: 'no_health' };
    }
    return { ok: false, reason: 'no_probe_fn' };
  }

  function shouldOfferWifiGuide(hints, cajaProbe) {
    hints = hints || {};
    if (cajaProbe && cajaProbe.ok) return false;
    if (lanReachable() || cloudOk()) return false;
    if (wanOnline()) return false;
    return !!(String(hints.ssid || '').trim() || String(hints.passphrase || '').trim());
  }

  /* ── Overlay fallback (sin red) ── */

  function ensureOverlay() {
    if (!global.document || !global.document.body) return null;
    var el = global.document.getElementById('crozzoPostPairConnect');
    if (el) return el;
    el = global.document.createElement('div');
    el.id = 'crozzoPostPairConnect';
    el.className = 'crozzo-backup-assistant crozzo-post-pair-connect';
    el.hidden = true;
    el.innerHTML =
      '<div class="crozzo-backup-assistant__card crozzo-post-pair-connect__card">' +
      '<div class="crozzo-post-pair-connect__spinner" aria-hidden="true"></div>' +
      '<div class="crozzo-backup-assistant__msg" id="crozzoPostPairMsg"></div>' +
      '<div class="crozzo-post-pair-connect__wifi" id="crozzoPostPairWifi" hidden></div>' +
      '<div class="crozzo-backup-assistant__actions" id="crozzoPostPairActions"></div>' +
      '</div>';
    global.document.body.appendChild(el);
    return el;
  }

  function hideOverlay() {
    var el = global.document.getElementById('crozzoPostPairConnect');
    if (!el) return;
    el.hidden = true;
    el.classList.remove('is-open');
  }

  function paintOverlay(opts) {
    closeSupreme(0);
    var el = ensureOverlay();
    if (!el) return;
    var msgEl = el.querySelector('#crozzoPostPairMsg');
    var wifiEl = el.querySelector('#crozzoPostPairWifi');
    var actEl = el.querySelector('#crozzoPostPairActions');
    if (msgEl) msgEl.innerHTML = opts.message || '';
    if (wifiEl) {
      wifiEl.innerHTML = opts.wifiHtml || '';
      wifiEl.hidden = !opts.wifiHtml;
    }
    if (actEl) actEl.innerHTML = opts.actionsHtml || '';
    wireOverlayActions(el);
    el.hidden = false;
    el.classList.add('is-open');
  }

  function openWifiSettings() {
    try {
      if (global.CrozzoAndroidNative && global.CrozzoAndroidNative.openWifiSettings) {
        global.CrozzoAndroidNative.openWifiSettings();
        return true;
      }
    } catch (_) {}
    try {
      if (/Android/i.test(String(global.navigator && global.navigator.userAgent))) {
        global.location.href = 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end';
        return true;
      }
    } catch (_) {}
    if (typeof global.showToast === 'function') global.showToast('Abra Ajustes → Wi‑Fi', 'info');
    return false;
  }

  function wifiGuideHtml(hints) {
    hints = hints || loadHints() || {};
    var ssid = String(hints.ssid || '').trim();
    var pass = String(hints.passphrase || '').trim();
    if (!ssid && !pass) return '';
    var html = '';
    if (ssid) {
      html +=
        '<div class="crozzo-post-pair-connect__row"><span>Red</span><strong id="crozzoPostPairSsid">' +
        esc(ssid) +
        '</strong></div>';
    }
    if (pass) {
      html +=
        '<div class="crozzo-post-pair-connect__row"><span>Clave</span><strong id="crozzoPostPairPass">' +
        esc(pass) +
        '</strong></div>';
    }
    return html;
  }

  function copyText(text) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve(false);
    if (global.navigator && global.navigator.clipboard) {
      return global.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function wireOverlayActions(root) {
    if (!root || root._crozzoPostPairBound) return;
    root._crozzoPostPairBound = true;
    root.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-crozzo-post-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-crozzo-post-act');
      if (act === 'wifi') openWifiSettings();
      if (act === 'copy-ssid') {
        var sEl = global.document.getElementById('crozzoPostPairSsid');
        copyText(sEl ? sEl.textContent : '');
      }
      if (act === 'copy-pass') {
        var pEl = global.document.getElementById('crozzoPostPairPass');
        copyText(pEl ? pEl.textContent : '');
      }
      if (act === 'retry') runSequence(loadHintsPayload(), { force: true, quiet: false }).catch(function () {});
      if (act === 'dismiss') hideOverlay();
    });
  }

  async function requestBluetooth() {
    pulseStep('network', 'active');
    if (global.CrozzoBleMesh && global.CrozzoBleMesh.requestBluetoothEnable) {
      await global.CrozzoBleMesh.requestBluetoothEnable().catch(function () {});
    } else if (global.CrozzoAndroidNative && global.CrozzoAndroidNative.requestBluetoothEnable) {
      await global.CrozzoAndroidNative.requestBluetoothEnable().catch(function () {});
    }
    pulseStep('network', 'done');
  }

  async function runConnectivityStack(source) {
    source = source || 'post_pair';
    if (typeof global.crozzoRunEasyConnect === 'function') {
      await global.crozzoRunEasyConnect({ force: true }).catch(function () {});
    }
    if (typeof global.crozzoPairingAutoConnect === 'function') {
      await global.crozzoPairingAutoConnect(source, { force: true, skipInvalidate: true }).catch(function () {});
    }
    safe(function () {
      if (global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.evaluateNow) {
        global.CrozzoConnectivityOrchestrator.evaluateNow();
      }
    });
    if (typeof global.crozzoWifiZoneResolveCentral === 'function') {
      await global.crozzoWifiZoneResolveCentral({ force: true }).catch(function () {});
    }
    pulseStep('mesh', 'done');
    pulseStep('mind', 'done');
  }

  function waitForLink(deadlineMs) {
    deadlineMs = deadlineMs || MAX_WAIT_MS;
    var started = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        if (connectedEnough()) {
          resolve({ ok: true, mode: lanReachable() ? 'lan' : 'cloud' });
          return;
        }
        if (Date.now() - started >= deadlineMs) {
          resolve({ ok: false });
          return;
        }
        global.setTimeout(tick, POLL_MS);
      }
      tick();
    });
  }

  async function finishWithCelebration(mode, opts) {
    opts = opts || {};
    try {
      global.localStorage.removeItem(PENDING_KEY);
    } catch (_) {}
    pulseStep('caja', 'done');
    if (mode === 'cloud' || cloudOk()) pulseStep('cloud', 'done');
    if (!opts.quiet) {
      if (__supreme.open) {
        await celebrateSupreme({ holdMs: opts.turbo ? 2000 : 2600 });
      } else if (opts.turbo) {
        await runTurboCascade();
        await celebrateSupreme({ holdMs: 1800 });
      } else {
        playFanfare();
        if (typeof global.showToast === 'function') {
          global.showToast(mode === 'lan' ? 'Conectado con la caja' : 'Ecosistema activo', 'success');
        }
      }
    }
    safe(function () {
      if (global.CrozzoEasyConnect && global.CrozzoEasyConnect.evaluate) {
        global.CrozzoEasyConnect.evaluate({ quiet: false });
      }
    });
  }

  async function runSequence(payload, opts) {
    opts = opts || {};
    if (__inflight && !opts.force) return __inflight;
    __inflight = (async function () {
      if (!isRoleB() && !opts.force) return { skipped: true, reason: 'not_role_b' };

      var hints = persistHints(payload || loadHintsPayload() || {});
      if (!opts.quiet && !__supreme.open) openSupreme({ payload: payload });

      var probe = await probeCaja(hints, {
        trustPairingProbe: !!opts.cajaOk,
        retries: opts.cajaOk ? 1 : 3,
      });

      if (probe.ok) {
        await runConnectivityStack(opts.source || 'post_qr');
        await finishWithCelebration(lanReachable() ? 'lan' : 'cloud', opts);
        return { ok: true, mode: 'fast', via: probe.via };
      }

      if (connectedEnough()) {
        runConnectivityStack(opts.source || 'post_qr').catch(function () {});
        await finishWithCelebration(lanReachable() ? 'lan' : 'cloud', opts);
        return { ok: true, mode: 'already_linked' };
      }

      if (!opts.quiet && !__supreme.open) {
        openSupreme({ payload: payload });
      }

      await requestBluetooth();
      await runConnectivityStack(opts.source || 'post_qr');

      probe = await probeCaja(hints, { retries: 4 });
      if (probe.ok) {
        await finishWithCelebration('lan', opts);
        return { ok: true, mode: 'lan' };
      }

      var link = await waitForLink(opts.quick ? 10000 : MAX_WAIT_MS);
      if (link.ok) {
        await finishWithCelebration(link.mode, opts);
        return { ok: true, mode: link.mode };
      }

      closeSupreme(0);
      if (!opts.quiet) {
        if (shouldOfferWifiGuide(hints, probe)) {
          paintOverlay({
            message: '<strong>Sin enlace</strong><br><span class="form-hint">Únase a la red de respaldo de la caja.</span>',
            wifiHtml: wifiGuideHtml(hints),
            actionsHtml:
              '<button type="button" class="btn btn-primary" data-crozzo-post-act="wifi">Abrir Wi‑Fi</button>' +
              '<button type="button" class="btn btn-outline" data-crozzo-post-act="retry">Reintentar</button>' +
              '<button type="button" class="btn btn-outline" data-crozzo-post-act="dismiss">Continuar</button>',
          });
        } else {
          paintOverlay({
            message: wanOnline()
              ? '<strong>Misma Wi‑Fi, caja no responde</strong><br><span class="form-hint">Abra BONA origen en la caja y reintente.</span>'
              : '<strong>Buscando la caja…</strong>',
            actionsHtml:
              '<button type="button" class="btn btn-primary" data-crozzo-post-act="retry">Reintentar</button>' +
              '<button type="button" class="btn btn-outline" data-crozzo-post-act="dismiss">Continuar</button>',
          });
        }
      }
      runConnectivityStack('post_pair_retry').catch(function () {});
      return { ok: false, hints: hints };
    })();
    try {
      return await __inflight;
    } finally {
      global.setTimeout(function () {
        __inflight = null;
      }, 1200);
    }
  }

  function resumeIfPending() {
    try {
      if (global.localStorage.getItem(PENDING_KEY) !== '1') return;
      if (!isRoleB()) {
        global.localStorage.removeItem(PENDING_KEY);
        return;
      }
    } catch (_) {
      return;
    }
    global.setTimeout(function () {
      runSequence(loadHintsPayload(), { source: 'post_pair_resume', force: true }).catch(function () {});
    }, 1600);
  }

  global.crozzoPostPairConnectAfterQr = function (payload, opts) {
    opts = opts || {};
    if (opts.deferOnly) {
      persistHints(payload);
      try {
        global.localStorage.setItem(PENDING_KEY, '1');
      } catch (_) {}
      return Promise.resolve({ deferred: true });
    }
    if (!opts.skipPending) {
      try {
        global.localStorage.setItem(PENDING_KEY, '1');
      } catch (_) {}
    }
    return runSequence(payload, {
      source: opts.source || 'post_qr',
      force: true,
      quiet: !!opts.quiet,
      quick: !!opts.quick,
      turbo: !!opts.turbo || !!opts.cajaOk,
      cajaOk: !!opts.cajaOk,
    });
  };

  global.CrozzoSupremeLink = {
    open: openSupreme,
    close: closeSupreme,
    celebrate: celebrateSupreme,
    pulse: pulseStep,
    isOpen: function () {
      return __supreme.open;
    },
  };

  global.CrozzoPostPairConnect = {
    runAfterPairing: runSequence,
    resumeIfPending: resumeIfPending,
    extractHints: extractHints,
    persistHints: persistHints,
    probeCaja: probeCaja,
    openWifiSettings: openWifiSettings,
  };

  bindSupremeEvents();
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', resumeIfPending);
    } else {
      resumeIfPending();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
