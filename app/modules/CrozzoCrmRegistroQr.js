/**
 * Crozzo POS — QR de autoregistro de clientes (LAN + importación a clientesCrm).
 * El cajero sigue usando el buscador CRM habitual; aquí se genera el QR para el cliente.
 */
(function (global) {
  'use strict';

  var CFG_KEY = 'crmRegistroQr';
  var DEFAULT_PORT = 8765;
  var POLL_MS = 4000;
  var _pollTimer = null;
  var _panelOpen = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke);
  }

  function tauriInvoke(cmd, args) {
    if (!isTauri()) return Promise.reject(new Error('Solo disponible en app de escritorio'));
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function readCfg() {
    try {
      if (global.config && global.config.get) {
        var c = global.config.get(CFG_KEY);
        if (c && typeof c === 'object') return c;
      }
    } catch (_) {}
    return null;
  }

  function writeCfg(patch) {
    if (!global.config || !global.config.get || !global.config.set || !global.config.save) return null;
    var cur = readCfg() || {};
    var next = Object.assign({}, cur, patch || {});
    global.config.set(CFG_KEY, next);
    try {
      global.config.save();
    } catch (_) {}
    return next;
  }

  function randomToken() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = 'crm_';
    for (var i = 0; i < 24; i++) out += a.charAt(Math.floor(Math.random() * a.length));
    return out;
  }

  function ensureCfg() {
    var c = readCfg();
    if (c && c.token && String(c.token).length >= 8) return c;
    return writeCfg({
      token: randomToken(),
      port: DEFAULT_PORT,
      autoStart: true,
      createdAt: new Date().toISOString(),
    });
  }

  function businessLabel() {
    try {
      var emp = (global.config && global.config.get && global.config.get('empresa')) || {};
      return String(emp.nombreComercial || emp.razonSocial || emp.nombre || (typeof global.crozzoAppDisplayName === 'function' ? global.crozzoAppDisplayName() : '') || 'Local').trim();
    } catch (_) {
      return 'Local';
    }
  }

  function buildRegistroUrl(ip, port, token) {
    var host = String(ip || '127.0.0.1').trim();
    var p = Number(port) || DEFAULT_PORT;
    var t = encodeURIComponent(token || '');
    var b = encodeURIComponent(businessLabel());
    return 'http://' + host + ':' + p + '/registro?t=' + t + '&b=' + b;
  }

  function renderQrImg(url, size, hostId) {
    var sz = size || 200;
    var elId = hostId || 'crozzoCrmRegQrCanvas';
    setTimeout(function () {
      var host = document.getElementById(elId);
      if (!host) return;
      host.innerHTML = '';
      if (typeof global.QRCode !== 'undefined') {
        try {
          new global.QRCode(host, {
            text: url,
            width: sz,
            height: sz,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: global.QRCode.CorrectLevel ? global.QRCode.CorrectLevel.M : 0,
          });
          return;
        } catch (_) {}
      }
      host.innerHTML =
        '<img src="https://api.qrserver.com/v1/create-qr-code/?size=' +
        sz +
        'x' +
        sz +
        '&data=' +
        encodeURIComponent(url) +
        '" width="' +
        sz +
        '" height="' +
        sz +
        '" alt="QR registro cliente" style="image-rendering:pixelated;border-radius:8px;"/>';
    }, 80);
    return '<div id="' + elId + '" class="crozzo-crm-reg-qr-canvas" style="margin:0 auto;width:' + sz + 'px;height:' + sz + 'px;"></div>';
  }

  function importPayloadToCrm(payload, meta) {
    meta = meta || {};
    if (typeof global.crozzoCrmValidateRequiredClientFields !== 'function') {
      return { ok: false, msg: 'CRM no disponible' };
    }
    var nitRaw = String(payload.nit || payload.documento || '').trim();
    var nom = String(payload.nombre || payload.razonSocial || '').trim();
    var emails = [];
    if (payload.email) emails.push(String(payload.email).trim());
    if (Array.isArray(payload.emails)) emails = emails.concat(payload.emails.map(String));
    emails = emails.filter(Boolean);
    var req = global.crozzoCrmValidateRequiredClientFields(nitRaw, nom, emails);
    if (!req.ok) return req;

    var list = global.crozzoCrmGetClients ? global.crozzoCrmGetClients() : [];
    if (!Array.isArray(list)) list = [];
    var dup = list.find(function (x) {
      return typeof global.crozzoCrmNitsEquivalent === 'function' && global.crozzoCrmNitsEquivalent(x.nit, req.nit);
    });
    if (dup) {
      dup.nombre = nom || dup.nombre;
      if (req.emails.length) {
        if (typeof global.crozzoCrmApplyEmailsToClientRecord === 'function') {
          global.crozzoCrmApplyEmailsToClientRecord(dup, req.emails);
        } else {
          dup.emails = req.emails;
          dup.email = req.emails[0];
        }
      }
      if (payload.telefono) dup.telefono = String(payload.telefono).trim();
      if (payload.ciudad) dup.ciudad = String(payload.ciudad).trim();
      if (payload.direccion) dup.direccion = String(payload.direccion).trim();
      if (!dup.notas) dup.notas = '';
      if (meta.origen === 'qr_registro' && dup.notas.indexOf('QR') < 0) {
        dup.notas = (dup.notas ? dup.notas + ' · ' : '') + 'Autoregistro QR';
      }
      global.config.save();
      if (typeof global.crozzoCrmEnqueueClientSync === 'function') global.crozzoCrmEnqueueClientSync(dup);
      return { ok: true, client: dup, updated: true };
    }

    var c = {
      id: typeof global.crozzoCrmNewClientId === 'function' ? global.crozzoCrmNewClientId() : 'crm_' + Date.now(),
      nit: req.nit || '',
      nombre: nom,
      telefono: String(payload.telefono || '').trim(),
      email: '',
      emails: [],
      ciudad: String(payload.ciudad || '').trim(),
      direccion: String(payload.direccion || '').trim(),
      notas: meta.origen === 'qr_registro' ? 'Autoregistro QR' : '',
      limiteCredito: 0,
      creditoUsado: 0,
      puntos: 0,
      totalCompras: 0,
      historial: [],
    };
    if (typeof global.crozzoCrmApplyEmailsToClientRecord === 'function') {
      global.crozzoCrmApplyEmailsToClientRecord(c, req.emails);
    } else {
      c.emails = req.emails;
      c.email = req.emails[0] || '';
    }
    list.push(c);
    global.config.set('clientesCrm', list);
    global.config.save();
    if (typeof global.crozzoCrmEnqueueClientSync === 'function') global.crozzoCrmEnqueueClientSync(c);
    try {
      if (typeof global.config.addAudit === 'function') {
        global.config.addAudit('crm_cliente_qr', 'Autoregistro: ' + nom + (req.nit ? ' · ' + req.nit : ''));
      }
    } catch (_) {}
    return { ok: true, client: c, created: true };
  }

  function processSubmissions(subs) {
    if (!Array.isArray(subs) || !subs.length) return 0;
    var n = 0;
    subs.forEach(function (sub) {
      var payload = sub.payload || sub;
      var r = importPayloadToCrm(payload, { origen: 'qr_registro', subId: sub.id });
      if (r.ok) {
        n++;
        var msg = r.created ? 'Cliente nuevo: ' + payload.nombre : 'Cliente actualizado: ' + payload.nombre;
        if (typeof global.showToast === 'function') global.showToast('📲 ' + msg, 'success');
      }
    });
    if (n && typeof global.crozzoCajaClientesRefreshTable === 'function') {
      global.crozzoCajaClientesRefreshTable();
    }
    return n;
  }

  function pollIntakeOnce() {
    if (!isTauri()) return Promise.resolve(0);
    return tauriInvoke('crm_registro_drain_pending')
      .then(function (subs) {
        return processSubmissions(subs);
      })
      .catch(function () {
        return 0;
      });
  }

  function startPolling() {
    stopPolling();
    _pollTimer = setInterval(function () {
      pollIntakeOnce();
    }, POLL_MS);
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function detectIpForQr() {
    if (typeof global.detectLocalIP === 'function') {
      return global.detectLocalIP().then(function (ip) {
        return ip || '127.0.0.1';
      });
    }
    return Promise.resolve('127.0.0.1');
  }

  /** IP que debe usar el QR: central en tablet B, local en caja A. */
  function getDisplayHostIp() {
    try {
      if (typeof global.getMultiDeviceConfig === 'function') {
        var md = global.getMultiDeviceConfig();
        if (md && md.role === 'B') {
          var cip = String(md.centralIp || '').trim();
          if (cip) return Promise.resolve(cip);
        }
        if (md && md.role === 'A') {
          var sip = String(md.serverIp || '').trim();
          if (sip) return Promise.resolve(sip);
        }
      }
    } catch (_) {}
    var cfg = readCfg();
    if (cfg && cfg.lastKnownIp) return Promise.resolve(String(cfg.lastKnownIp).trim());
    return detectIpForQr();
  }

  function isTabletContext() {
    try {
      return typeof global.currentPage !== 'undefined' && global.currentPage === 'tablets';
    } catch (_) {
      return false;
    }
  }

  function serverStatus() {
    if (!isTauri()) {
      return Promise.resolve({ running: false, port: DEFAULT_PORT, token: ensureCfg().token, pendingCount: 0 });
    }
    return tauriInvoke('crm_registro_status').catch(function () {
      return { running: false, port: DEFAULT_PORT, token: ensureCfg().token, pendingCount: 0 };
    });
  }

  function startServer() {
    var cfg = ensureCfg();
    if (!isTauri()) {
      return Promise.reject(new Error('Active el servidor desde la app de escritorio (Tauri)'));
    }
    return detectIpForQr().then(function (ip) {
      writeCfg({ lastKnownIp: ip });
      return tauriInvoke('crm_registro_start', {
        token: cfg.token,
        port: cfg.port || DEFAULT_PORT,
        staticDir: null,
      });
    });
  }

  function stopServer() {
    stopPolling();
    if (!isTauri()) return Promise.resolve();
    return tauriInvoke('crm_registro_stop');
  }

  function refreshPanelUi() {
    var wrap = document.getElementById('crozzoCrmRegPanel');
    if (!wrap) return;
    refreshQrDisplay('crozzoCrmRegQrHost', 'crozzoCrmRegStatus', 'crozzoCrmRegUrl', 196, true);
  }

  function refreshQrDisplay(qrHostId, statusId, urlId, qrSize, adminControls) {
    var cfg = ensureCfg();
    Promise.all([serverStatus(), getDisplayHostIp()])
      .then(function (arr) {
        var st = arr[0] || {};
        var ip = arr[1] || '127.0.0.1';
        var port = st.port || cfg.port || DEFAULT_PORT;
        var url = buildRegistroUrl(ip, port, cfg.token);
        var statusEl = statusId ? document.getElementById(statusId) : null;
        var urlEl = urlId ? document.getElementById(urlId) : null;
        var qrHost = qrHostId ? document.getElementById(qrHostId) : null;
        if (statusEl) {
          if (st.running) {
            statusEl.textContent =
              '🟢 Servidor activo · puerto ' + port + ' · pendientes: ' + (st.pendingCount || st.pending_count || 0);
            statusEl.className = 'crozzo-crm-reg-status is-on';
          } else if (isTauri() && !isTabletContext()) {
            statusEl.textContent = '⚪ Servidor detenido — active para que clientes escaneen en el Wi‑Fi del local';
            statusEl.className = 'crozzo-crm-reg-status';
          } else {
            statusEl.textContent =
              '📲 Muestre este QR al cliente (misma red Wi‑Fi). El central debe tener el servidor activo en Caja → Clientes.';
            statusEl.className = 'crozzo-crm-reg-status';
          }
        }
        if (urlEl) urlEl.textContent = url;
        if (qrHost) {
          qrHost.innerHTML = renderQrImg(url, qrSize || 196, qrHostId + 'Canvas');
        }
        if (adminControls) {
          var btnStart = document.getElementById('crozzoCrmRegBtnStart');
          var btnStop = document.getElementById('crozzoCrmRegBtnStop');
          if (btnStart) btnStart.disabled = !!st.running;
          if (btnStop) btnStop.disabled = !st.running;
          if (st.running && isTauri()) startPolling();
          else if (!st.running && !document.getElementById('crozzoCrmRegModal')) stopPolling();
        }
      })
      .catch(function () {});
  }

  function renderPanelHtml() {
    var cfg = ensureCfg();
    return (
      '<div class="crozzo-crm-reg-panel card" id="crozzoCrmRegPanel" style="margin-top:16px;">' +
      '<div class="card-header" style="padding-bottom:8px;">' +
      '<div><h3 class="card-title" style="font-size:1rem;margin:0;">📲 QR autoregistro de clientes</h3>' +
      '<p class="form-hint" style="margin:6px 0 0;">Imprima o muestre este QR en caja. El cliente escanea, llena datos o sube su RUT, y entra al directorio automáticamente.</p></div></div>' +
      '<div class="crozzo-crm-reg-body" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:20px;align-items:start;">' +
      '<div class="crozzo-crm-reg-qr-col">' +
      '<div id="crozzoCrmRegQrHost"></div>' +
      '<p class="form-hint" style="text-align:center;margin:8px 0 0;font-size:0.75rem;">Token permanente · no expira</p>' +
      '</div>' +
      '<div class="crozzo-crm-reg-meta">' +
      '<p id="crozzoCrmRegStatus" class="crozzo-crm-reg-status">…</p>' +
      '<label class="form-label">Enlace (misma red Wi‑Fi)</label>' +
      '<p id="crozzoCrmRegUrl" class="crozzo-crm-reg-url form-hint" style="word-break:break-all;font-size:0.78rem;"></p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">' +
      '<button type="button" class="btn btn-primary" id="crozzoCrmRegBtnStart">▶ Activar servidor</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCrmRegBtnStop">⏹ Detener</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCrmRegBtnCopy">Copiar enlace</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCrmRegBtnPoll">↻ Revisar ahora</button>' +
      '</div>' +
      '<details class="form-hint" style="margin-top:8px;"><summary>Renovar token (invalida QR anterior)</summary>' +
      '<button type="button" class="btn btn-outline" style="margin-top:8px;" id="crozzoCrmRegBtnNewToken">Generar nuevo token</button></details>' +
      (!isTauri()
        ? '<p class="form-hint" style="color:var(--warning,#f59e0b);margin-top:10px;">⚠️ Abra la app de escritorio para servir el formulario a celulares en la red local.</p>'
        : '') +
      '</div></div></div>'
    );
  }

  function bindPanelEvents() {
    var startBtn = document.getElementById('crozzoCrmRegBtnStart');
    var stopBtn = document.getElementById('crozzoCrmRegBtnStop');
    var copyBtn = document.getElementById('crozzoCrmRegBtnCopy');
    var pollBtn = document.getElementById('crozzoCrmRegBtnPoll');
    var newTokBtn = document.getElementById('crozzoCrmRegBtnNewToken');
    if (startBtn && !startBtn._bound) {
      startBtn._bound = true;
      startBtn.addEventListener('click', function () {
        startBtn.disabled = true;
        startServer()
          .then(function () {
            if (typeof global.showToast === 'function') global.showToast('Servidor de registro activo', 'success');
            refreshPanelUi();
          })
          .catch(function (e) {
            if (typeof global.showToast === 'function') global.showToast(e.message || 'No se pudo iniciar', 'error');
            refreshPanelUi();
          });
      });
    }
    if (stopBtn && !stopBtn._bound) {
      stopBtn._bound = true;
      stopBtn.addEventListener('click', function () {
        stopServer().then(function () {
          if (typeof global.showToast === 'function') global.showToast('Servidor detenido', 'info');
          refreshPanelUi();
        });
      });
    }
    if (copyBtn && !copyBtn._bound) {
      copyBtn._bound = true;
      copyBtn.addEventListener('click', function () {
        var t = document.getElementById('crozzoCrmRegUrl');
        var url = t ? t.textContent : '';
        if (!url) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            if (typeof global.showToast === 'function') global.showToast('Enlace copiado', 'success');
          });
        }
      });
    }
    if (pollBtn && !pollBtn._bound) {
      pollBtn._bound = true;
      pollBtn.addEventListener('click', function () {
        pollIntakeOnce().then(function (n) {
          if (typeof global.showToast === 'function') {
            global.showToast(n ? n + ' registro(s) importados' : 'Sin registros nuevos', n ? 'success' : 'info');
          }
          refreshPanelUi();
        });
      });
    }
    if (newTokBtn && !newTokBtn._bound) {
      newTokBtn._bound = true;
      newTokBtn.addEventListener('click', function () {
        if (!confirm('¿Generar nuevo token? El QR impreso dejará de funcionar.')) return;
        writeCfg({ token: randomToken(), createdAt: new Date().toISOString() });
        stopServer().then(function () {
          refreshPanelUi();
          if (typeof global.showToast === 'function') global.showToast('Token renovado', 'info');
        });
      });
    }
  }

  function fillNewClientFormFromParsed(parsed) {
    if (!parsed) return false;
    if (typeof global.crozzoCrmToggleCreatePanel === 'function') global.crozzoCrmToggleCreatePanel(true);
    var nitEl = document.getElementById('crozzoCrmNewNit');
    var nomEl = document.getElementById('crozzoCrmNewNombre');
    var telEl = document.getElementById('crozzoCrmNewTel');
    var ciuEl = document.getElementById('crozzoCrmNewCiudad');
    var dirEl = document.getElementById('crozzoCrmNewDir');
    var list = document.getElementById('crozzoCrmNewEmailsList');
    if (parsed.identificador && nitEl) {
      nitEl.value = parsed.identificador.display || parsed.identificador.norm || '';
    }
    if (parsed.razonSocial && nomEl) nomEl.value = parsed.razonSocial;
    if (parsed.telefono && telEl) telEl.value = parsed.telefono;
    if (parsed.ciudad && ciuEl) ciuEl.value = parsed.ciudad;
    if (parsed.direccion && dirEl) dirEl.value = parsed.direccion;
    if (parsed.email && list && typeof global.crozzoCrmEmailRowHtml === 'function') {
      list.innerHTML = global.crozzoCrmEmailRowHtml(parsed.email, 'crozzoCrmNewEmailIn');
    }
    setTimeout(function () {
      if (typeof global.CrozzoAdquirienteLookup !== 'undefined' && CrozzoAdquirienteLookup.bindForm) {
        CrozzoAdquirienteLookup.bindForm('crm_new');
      }
    }, 80);
    return true;
  }

  function importRutToNewClient(file) {
    if (!file) return Promise.reject(new Error('Sin archivo'));
    var loadDoc = function () {
      if (global.CrozzoProveedorDocumentos && CrozzoProveedorDocumentos.extractFromFile) {
        return CrozzoProveedorDocumentos.extractFromFile(file);
      }
      if (global.CrozzoLazyModules && typeof CrozzoLazyModules.load === 'function') {
        return CrozzoLazyModules.load('reservorio').then(function () {
          if (global.CrozzoProveedorDocumentos && CrozzoProveedorDocumentos.extractFromFile) {
            return CrozzoProveedorDocumentos.extractFromFile(file);
          }
          throw new Error('Lector RUT no disponible');
        });
      }
      return Promise.reject(new Error('Lector RUT no disponible'));
    };
    return loadDoc().then(function (res) {
      var p = res && res.parsed;
      if (!p || (!p.identificador && !p.razonSocial)) {
        throw new Error('No se pudo leer el RUT. Intente otra foto o escriba los datos.');
      }
      fillNewClientFormFromParsed(p);
      if (typeof global.showToast === 'function') {
        global.showToast('Datos del RUT cargados — revise correo y guarde', 'success');
      }
      return p;
    });
  }

  function openQrModal() {
    ensureCfg();
    var body =
      '<div class="crozzo-crm-reg-modal" id="crozzoCrmRegModal">' +
      '<p id="crozzoCrmRegModalStatus" class="crozzo-crm-reg-status">Cargando QR…</p>' +
      '<div id="crozzoCrmRegModalQrHost" style="display:flex;justify-content:center;margin:12px 0;"></div>' +
      '<p class="form-hint" style="text-align:center;margin:0 0 12px;font-size:0.78rem;">El cliente escanea y registra sus datos, o usted puede usar «Nuevo» / «Subir RUT» abajo.</p>' +
      '<label class="form-label">Enlace</label>' +
      '<p id="crozzoCrmRegModalUrl" class="crozzo-crm-reg-url form-hint" style="word-break:break-all;font-size:0.75rem;"></p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;justify-content:center;">' +
      '<button type="button" class="btn btn-outline" id="crozzoCrmRegModalCopy">Copiar enlace</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCrmRegModalManual" onclick="crozzoCrmToggleCreatePanel(true);closeModal();">✏️ Rellenar manual</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCrmRegModalRut">📄 Subir RUT</button>' +
      '</div>' +
      '<input type="file" id="crozzoCrmRegModalRutFile" accept=".pdf,image/*,application/pdf" style="display:none;">' +
      '</div>';
    if (typeof global.showModal === 'function') {
      global.showModal('QR · Registro de cliente', body, { wide: false });
    }
    setTimeout(function () {
      refreshQrDisplay('crozzoCrmRegModalQrHost', 'crozzoCrmRegModalStatus', 'crozzoCrmRegModalUrl', 220, false);
      var copyBtn = document.getElementById('crozzoCrmRegModalCopy');
      if (copyBtn && !copyBtn._bound) {
        copyBtn._bound = true;
        copyBtn.addEventListener('click', function () {
          var u = document.getElementById('crozzoCrmRegModalUrl');
          var url = u ? u.textContent : '';
          if (url && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              if (typeof global.showToast === 'function') global.showToast('Enlace copiado', 'success');
            });
          }
        });
      }
      var rutBtn = document.getElementById('crozzoCrmRegModalRut');
      var rutIn = document.getElementById('crozzoCrmRegModalRutFile');
      if (rutBtn && rutIn && !rutBtn._bound) {
        rutBtn._bound = true;
        rutBtn.addEventListener('click', function () {
          rutIn.click();
        });
        rutIn.addEventListener('change', function () {
          var f = rutIn.files && rutIn.files[0];
          if (!f) return;
          rutBtn.disabled = true;
          importRutToNewClient(f)
            .then(function () {
              if (typeof global.closeModal === 'function') global.closeModal();
            })
            .catch(function (e) {
              if (typeof global.showToast === 'function') global.showToast(e.message || 'Error RUT', 'error');
            })
            .finally(function () {
              rutBtn.disabled = false;
              rutIn.value = '';
            });
        });
      }
    }, 100);
  }

  function bindNewClientRutInput() {
    var btn = document.getElementById('crozzoCrmNewRutBtn');
    var inp = document.getElementById('crozzoCrmNewRutFile');
    if (!btn || !inp || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', function () {
      inp.click();
    });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      btn.disabled = true;
      importRutToNewClient(f)
        .catch(function (e) {
          if (typeof global.showToast === 'function') global.showToast(e.message || 'Error RUT', 'error');
        })
        .finally(function () {
          btn.disabled = false;
          inp.value = '';
        });
    });
  }

  function mountTabletCrmExtras() {
    bindNewClientRutInput();
    if (isTabletContext() && isTauri()) {
      pollIntakeOnce();
    }
  }

  function mountInClientesPage() {
    var anchor = document.getElementById('crozzoCrmRegMount');
    if (!anchor) return;
    anchor.innerHTML = renderPanelHtml();
    bindPanelEvents();
    refreshPanelUi();
    var cfg = readCfg();
    if (cfg && cfg.autoStart !== false && isTauri()) {
      serverStatus().then(function (st) {
        if (!st.running) {
          startServer()
            .then(function () {
              refreshPanelUi();
            })
            .catch(function () {
              refreshPanelUi();
            });
        }
      });
    }
  }

  function initBoot() {
    if (_panelOpen) return;
    document.addEventListener('crozzo:page-caja-clientes', function () {
      setTimeout(mountInClientesPage, 50);
    });
  }

  global.CrozzoCrmRegistroQr = {
    ensureCfg: ensureCfg,
    buildRegistroUrl: buildRegistroUrl,
    renderPanelHtml: renderPanelHtml,
    mountInClientesPage: mountInClientesPage,
    mountTabletCrmExtras: mountTabletCrmExtras,
    openQrModal: openQrModal,
    importRutToNewClient: importRutToNewClient,
    fillNewClientFormFromParsed: fillNewClientFormFromParsed,
    getDisplayHostIp: getDisplayHostIp,
    startServer: startServer,
    stopServer: stopServer,
    pollIntakeOnce: pollIntakeOnce,
    importPayloadToCrm: importPayloadToCrm,
    refreshPanelUi: refreshPanelUi,
    refreshQrDisplay: refreshQrDisplay,
    initBoot: initBoot,
  };

  global.crozzoCrmImportRegistroPayload = importPayloadToCrm;
  global.crozzoCrmRegistroOpenQrModal = openQrModal;
  global.crozzoCrmRegistroImportRutToNewClient = function () {
    var inp = document.getElementById('crozzoCrmNewRutFile');
    if (inp) inp.click();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBoot);
  } else {
    initBoot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
