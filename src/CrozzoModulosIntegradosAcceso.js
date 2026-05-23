/**
 * Control de acceso integrado — flujo completo (home, confirmación, cámara, fotos).
 * Depende de CrozzoIntApi (CrozzoModulosIntegrados.js).
 */
(function (global) {
  'use strict';

  var api = function () { return global.CrozzoIntApi; };
  var acc = {
    screen: 'home',
    adminTab: 'hoy',
    search: '',
    pinBuf: '',
    curEmp: null,
    pendingAction: null,
    pendingNow: null,
    camStream: null,
    cdTimer: null,
    refreshIv: null,
    mensajeUniforme: 'Recuerda estar con el uniforme puesto antes de marcar.',
    requiereFoto: true,
    kioskFullscreen: false,
    logoDataUrl: ''
  };

  var EMP_PLANTILLA = [
    { name: 'Lorena Fonseca', pin: '1001', cargo: 'Aux. Cocina', full_name: 'Lorena Alejandra Fonseca Mota' },
    { name: 'Diana García', pin: '1002', cargo: 'Aux. Cocina' },
    { name: 'Carolina Lozada', pin: '1003', cargo: 'Aux. Cocina' },
    { name: 'Jackeline Cardona', pin: '1004', cargo: 'Aux. Cocina' },
    { name: 'Jorge Trejos', pin: '1005', cargo: 'Barista' },
    { name: 'Maria Guerrero', pin: '1006', cargo: 'Barista' },
    { name: 'Kevin Bueno', pin: '1007', cargo: 'Barista' },
    { name: 'Laura Herrera', pin: '1008', cargo: 'Cajera' },
    { name: 'Ruben Escobar', pin: '1009', cargo: 'Cajero' },
    { name: 'Mirla Fajardo', pin: '1010', cargo: 'Fríos' },
    { name: 'Ana Lame', pin: '1011', cargo: 'Fríos' },
    { name: 'Andres Ramirez', pin: '1012', cargo: 'J. Compras' },
    { name: 'Ximena González', pin: '1013', cargo: 'J. Cocina' },
    { name: 'Juan Herrera', pin: '1014', cargo: 'J. Personal' },
    { name: 'Ángela García', pin: '1015', cargo: 'Mesero' },
    { name: 'José Páez', pin: '1016', cargo: 'Mesero' },
    { name: 'Anyela Valencia', pin: '1017', cargo: 'Mesero' },
    { name: 'Jhoan Urino', pin: '1018', cargo: 'Mesero' },
    { name: 'Luis Naranjos', pin: '1019', cargo: 'Panadera' },
    { name: 'Juan Carlos Vargas', pin: '1020', cargo: 'Steward' }
  ];

  function st() { return api().state; }
  function esc(s) { return api().esc(s); }
  function toast(m, t) { api().toast(m, t); }

  function injectAccesoStyles() {
    api().injectStyles();
    if (document.getElementById('crozzo-int-acceso-styles')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-int-acceso-styles';
    el.textContent =
      '.crozzo-acceso-app{--ca-accent:var(--accent,#c9a227);max-width:920px;margin:0 auto}' +
      '.crozzo-int-kiosk-fullscreen .crozzo-acceso-app{max-width:none}' +
      '.crozzo-int-kiosk-fullscreen #sidebar,.crozzo-int-kiosk-fullscreen .sidebar,.crozzo-int-kiosk-fullscreen #crozzoMobileBottomNav{display:none!important}' +
      '.crozzo-int-kiosk-fullscreen .main-wrapper,.crozzo-int-kiosk-fullscreen .app-main{margin-left:0!important;width:100%!important}' +
      '.crozzo-int-kiosk-fullscreen .main-header{display:none!important}' +
      '.ca-sync{padding:6px 12px;font-size:11px;font-weight:700;text-align:center;border-radius:8px;margin-bottom:10px;display:none}' +
      '.ca-sync.show{display:block}.ca-sync.ok{background:rgba(16,185,129,.15);color:#10b981}.ca-sync.err{background:rgba(239,68,68,.12);color:#ef4444}.ca-sync.load{background:var(--bg-card);color:var(--ca-accent)}' +
      '.ca-home-head{text-align:center;padding:12px 0 8px}.ca-logo{max-height:120px;width:auto;margin:0 auto 8px;display:block}' +
      '.ca-clock{font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ca-accent)}' +
      '.ca-date{font-size:12px;opacity:.75;margin-top:4px}' +
      '.ca-net{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;margin-top:8px;border:1px solid var(--border)}' +
      '.ca-net .dot{width:8px;height:8px;border-radius:50%;background:#10b981}.ca-net.off .dot{background:#ef4444}' +
      '.ca-search{width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border);margin:12px 0;background:var(--bg-card)}' +
      '.ca-emp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}' +
      '.ca-emp-card{padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;text-align:center;transition:border-color .2s,transform .15s}' +
      '.ca-emp-card:hover{border-color:var(--ca-accent);transform:translateY(-2px)}' +
      '.ca-emp-card.is-idle{opacity:.7;cursor:default}' +
      '.ca-av{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--ca-accent),#888);color:#111;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:14px}' +
      '.ca-badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;text-transform:uppercase}' +
      '.ca-badge.work{background:rgba(16,185,129,.2);color:#10b981}.ca-badge.out{background:rgba(148,163,184,.2);color:#94a3b8}.ca-badge.in{background:rgba(59,130,246,.2);color:#60a5fa}' +
      '.ca-screen{display:none}.ca-screen.active{display:block}' +
      '.ca-confirm-card{max-width:400px;margin:24px auto;padding:24px;border-radius:16px;border:1px solid var(--border);background:var(--bg-card);text-align:center}' +
      '.ca-av-lg{width:72px;height:72px;border-radius:50%;font-size:24px;margin:0 auto 12px}' +
      '.ca-msg-box{text-align:left;font-size:13px;padding:12px;border-radius:10px;background:var(--bg-secondary);margin:16px 0;line-height:1.5}' +
      '.ca-cam-wrap{position:relative;border-radius:12px;overflow:hidden;background:#000;max-width:560px;margin:0 auto}' +
      '.ca-cam-wrap video{width:100%;height:min(58vh,480px);object-fit:cover;display:block}' +
      '.ca-face-guide{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center}' +
      '.ca-face-guide::before{content:"";width:54%;height:72%;border:2px dashed var(--ca-accent);border-radius:40% 40% 44% 44%/52% 52% 42% 42%;box-shadow:0 0 0 9999px rgba(0,0,0,.35)}' +
      '.ca-countdown{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:72px;font-weight:800;color:#fff;text-shadow:0 4px 24px #000;display:none}' +
      '.ca-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}' +
      '.ca-pin-dots{font-size:22px;letter-spacing:8px;text-align:center;margin:12px 0}' +
      '.ca-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:280px;margin:0 auto}' +
      '.ca-keypad button{padding:14px;font-size:18px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer}' +
      '.ca-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}' +
      '.ca-foto-thumb{width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--ca-accent)}';
    document.head.appendChild(el);
  }

  function ini(n) {
    return String(n || '')
      .split(' ')
      .slice(0, 2)
      .map(function (w) { return (w[0] || '').toUpperCase(); })
      .join('');
  }

  function fmt(ts) {
    return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function glsTipo(empId) {
    var rs = st().marcaciones.filter(function (x) { return String(x.empleado_id) === String(empId); });
    return rs.length ? rs[rs.length - 1].tipo : null;
  }

  function estadoEmpleado(emp) {
    var ult = glsTipo(emp.id);
    if (ult === 'entrada') {
      var ent = st().marcaciones.filter(function (r) { return String(r.empleado_id) === String(emp.id) && r.tipo === 'entrada'; }).pop();
      return { label: 'Trabajando', badge: 'work', accion: 'salida', sub: ent ? 'Entró ' + fmt(ent.timestamp) : '' };
    }
    if (ult === 'salida') {
      return { label: 'Fuera', badge: 'out', accion: 'entrada', sub: 'Puede marcar entrada' };
    }
    return { label: 'Sin marcar', badge: 'in', accion: 'entrada', sub: 'Marcar entrada' };
  }

  function showSync(msg, kind) {
    var bar = document.getElementById('ca-sync-bar');
    if (!bar) return;
    bar.textContent = msg;
    bar.className = 'ca-sync show ' + (kind || '');
  }

  function setScreen(name) {
    acc.screen = name;
    document.querySelectorAll('.ca-screen').forEach(function (s) {
      s.classList.toggle('active', s.getAttribute('data-ca-screen') === name);
    });
    if (name === 'camera') setTimeout(startCamera, 80);
    if (name === 'home') {
      detenerCamara();
      renderEmpGrid();
      tickClock();
    }
  }

  function applyKioskFullscreen(on) {
    acc.kioskFullscreen = !!on;
    if (document.body) document.body.classList.toggle('crozzo-int-kiosk-fullscreen', acc.kioskFullscreen);
  }

  function tickClock() {
    var c = document.getElementById('ca-clock');
    var d = document.getElementById('ca-date-iso');
    if (c) c.textContent = new Date().toLocaleTimeString('es-CO');
    if (d) {
      d.textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    var net = document.getElementById('ca-net');
    if (net) {
      var st = api().cloudStatusLabel ? api().cloudStatusLabel() : { ok: api().cloudReady(), text: '—' };
      net.classList.toggle('off', !st.ok);
      var t = net.querySelector('.ca-net-txt');
      if (t) t.textContent = st.ok ? 'Nube activa' : 'Sin nube (Super Admin)';
    }
  }

  function renderEmpGrid() {
    var g = document.getElementById('ca-emp-grid');
    if (!g) return;
    var q = acc.search.toLowerCase();
    var list = st().empleados.filter(function (e) {
      return !q || (e.name || '').toLowerCase().indexOf(q) >= 0 || (e.cargo || '').toLowerCase().indexOf(q) >= 0;
    });
    g.innerHTML = list
      .map(function (e) {
        var stt = estadoEmpleado(e);
        var cls = 'ca-emp-card' + (stt.accion ? '' : ' is-idle');
        return (
          '<div class="' + cls + '" data-ca-emp="' + e.id + '">' +
          '<div class="ca-av">' + esc(ini(e.name)) + '</div>' +
          '<div style="font-weight:700;font-size:13px">' + esc(e.name) + '</div>' +
          '<div style="font-size:11px;opacity:.7">' + esc(e.cargo || '') + '</div>' +
          '<span class="ca-badge ' + stt.badge + '">' + esc(stt.label) + '</span>' +
          (stt.sub ? '<div style="font-size:10px;margin-top:6px;opacity:.65">' + esc(stt.sub) + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
    g.querySelectorAll('[data-ca-emp]').forEach(function (card) {
      card.onclick = function () {
        var id = card.getAttribute('data-ca-emp');
        var emp = st().empleados.find(function (x) { return String(x.id) === String(id); });
        if (!emp) return;
        var stt = estadoEmpleado(emp);
        if (!stt.accion) return;
        openConfirm(emp, stt.accion);
      };
    });
  }

  function renderMensajeHtml(txt) {
    var t = String(txt || acc.mensajeUniforme || '');
    return t.replace(/\n/g, '<br>').replace(/img:(\S+)/gi, '<br><img src="$1" style="max-width:100%;border-radius:8px;margin-top:8px" alt=""/>');
  }

  function openConfirm(emp, action) {
    acc.curEmp = emp;
    acc.pendingAction = action;
    acc.pendingNow = Date.now();
    var av = document.getElementById('ca-ce-av');
    var nm = document.getElementById('ca-ce-nm');
    var rl = document.getElementById('ca-ce-rl');
    var act = document.getElementById('ca-ce-act');
    var msg = document.getElementById('ca-ce-msg');
    if (av) av.textContent = ini(emp.name);
    if (nm) nm.textContent = emp.name;
    if (rl) rl.textContent = emp.cargo || '';
    if (act) act.textContent = 'Registrar ' + action;
    if (msg) msg.innerHTML = renderMensajeHtml(acc.mensajeUniforme);
    setScreen('confirm');
  }

  function confirmarSiSoyYo() {
    acc.pendingNow = Date.now();
    if (acc.requiereFoto !== false) {
      var av = document.getElementById('ca-cam-av');
      var nm = document.getElementById('ca-cam-nm');
      var rl = document.getElementById('ca-cam-rl');
      var act = document.getElementById('ca-cam-act');
      if (av) av.textContent = ini(acc.curEmp.name);
      if (nm) nm.textContent = acc.curEmp.name;
      if (rl) rl.textContent = acc.curEmp.cargo || '';
      if (act) act.textContent = 'Registrando ' + acc.pendingAction;
      setScreen('camera');
    } else {
      guardarMarcacion(null);
    }
  }

  function dataURLtoBlob(dataUrl) {
    var arr = dataUrl.split(',');
    var mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bstr = atob(arr[1]);
    var n = bstr.length;
    var u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  }

  async function uploadFoto(dataUrl, empId) {
    var p = api().sbPair();
    if (!p || !dataUrl) return null;
    var id = empId != null ? empId : (acc.curEmp && acc.curEmp.id);
    if (!id) return null;
    try {
      var blob = dataURLtoBlob(dataUrl);
      var fname = api().tkey() + '_' + id + '_' + acc.pendingNow + '.jpg';
      var url = p.url + '/storage/v1/object/fotos-marcaciones/' + encodeURIComponent(fname);
      var key = p.key;
      var res = await fetch(url, {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'image/jpeg' },
        body: blob
      });
      if (res.ok) return p.url + '/storage/v1/object/public/fotos-marcaciones/' + fname;
    } catch (_) {}
    return null;
  }

  function adminKioskPassword() {
    var c = (api().state && api().state.intConfig) || {};
    return String(c.adminKioskPw || 'admin2024').trim();
  }

  async function guardarMarcacion(fotoDataUrl) {
    if (!acc.curEmp || !acc.pendingAction) return;
    showSync('Guardando marcación…', 'load');
    var empId = acc.curEmp.id;
    if (api().cloudReady()) {
      empId = await api().ensureEmpleadoEnNube(acc.curEmp);
      if (!empId) {
        showSync('Empleado no registrado en nube — revise empleados o conexión', 'err');
        setTimeout(function () { setScreen('home'); showSync('', ''); }, 2400);
        return;
      }
      acc.curEmp.id = empId;
    }
    var rec = {
      business_id: api().businessId(),
      empleado_id: empId,
      nombre: acc.curEmp.name,
      cargo: acc.curEmp.cargo || '',
      pin: String(acc.curEmp.pin || ''),
      tipo: acc.pendingAction,
      timestamp: acc.pendingNow,
      fecha: api().tkey()
    };
    if (fotoDataUrl && acc.requiereFoto !== false) {
      var fotoUrl = await uploadFoto(fotoDataUrl, empId);
      if (fotoUrl) rec.foto_url = fotoUrl;
    }
    var r = await api().rest('crozzo_marcaciones', '', { method: 'POST', body: rec, prefer: 'return=representation' });
    if (r.ok && Array.isArray(r.data) && r.data[0]) st().marcaciones.push(r.data[0]);
    else {
      rec.id = 'local_' + Date.now();
      rec._pending = true;
      st().marcaciones.push(rec);
      try {
        var all = JSON.parse(localStorage.getItem(api().LS_RRHH + '_recs') || '[]');
        all.push(rec);
        localStorage.setItem(api().LS_RRHH + '_recs', JSON.stringify(all));
      } catch (_) {}
      showSync('Guardado local — se subirá con conexión', 'err');
    }
    if (r.ok) showSync('Marcación guardada', 'ok');
    var ic = document.getElementById('ca-done-ic');
    var dn = document.getElementById('ca-done-nm');
    var dd = document.getElementById('ca-done-det');
    var dt = document.getElementById('ca-done-t');
    if (ic) ic.textContent = acc.pendingAction === 'entrada' ? '✅' : '👋';
    if (dn) dn.textContent = acc.curEmp.name;
    if (dd) dd.textContent = (acc.pendingAction === 'entrada' ? 'Entrada' : 'Salida') + ' registrada';
    if (dt) dt.textContent = fmt(acc.pendingNow);
    setScreen('done');
    setTimeout(function () { setScreen('home'); showSync('', ''); }, 2800);
  }

  function detenerCamara() {
    if (acc.cdTimer) { clearInterval(acc.cdTimer); acc.cdTimer = null; }
    if (acc.camStream) {
      acc.camStream.getTracks().forEach(function (t) { t.stop(); });
      acc.camStream = null;
    }
    var v = document.getElementById('ca-cam-video');
    if (v) v.srcObject = null;
  }

  function startCamera() {
    detenerCamara();
    var status = document.getElementById('ca-cam-status');
    var cd = document.getElementById('ca-cam-cd');
    if (status) status.textContent = 'Preparando cámara…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (status) status.textContent = 'Sin cámara — guardando sin foto';
      setTimeout(function () { guardarMarcacion(null); }, 800);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (stream) {
        acc.camStream = stream;
        var video = document.getElementById('ca-cam-video');
        if (video) {
          video.srcObject = stream;
          video.onloadedmetadata = function () {
            if (status) status.textContent = 'Mira a la cámara…';
            if (cd) {
              cd.style.display = 'block';
              var n = 3;
              cd.textContent = String(n);
              acc.cdTimer = setInterval(function () {
                n--;
                if (n > 0) cd.textContent = String(n);
                else {
                  clearInterval(acc.cdTimer);
                  acc.cdTimer = null;
                  cd.style.display = 'none';
                  tomarFoto();
                }
              }, 1000);
            }
          };
        }
      })
      .catch(function () {
        if (status) status.textContent = 'Cámara no disponible — guardando sin foto';
        setTimeout(function () { guardarMarcacion(null); }, 1200);
      });
  }

  function tomarFoto() {
    var video = document.getElementById('ca-cam-video');
    var canvas = document.getElementById('ca-cam-canvas');
    var status = document.getElementById('ca-cam-status');
    if (!video || !canvas) { guardarMarcacion(null); return; }
    var maxW = 320, maxH = 240;
    var w = video.videoWidth, h = video.videoHeight;
    if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
    if (h > maxH) { w = Math.round((w * maxH) / h); h = maxH; }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    var flash = document.getElementById('ca-cam-flash');
    if (flash) {
      flash.style.transition = 'opacity .1s';
      flash.style.opacity = '1';
      setTimeout(function () { flash.style.opacity = '0'; }, 120);
    }
    var dataUrl = canvas.toDataURL('image/jpeg', 0.62);
    detenerCamara();
    if (status) status.textContent = 'Foto tomada — guardando…';
    guardarMarcacion(dataUrl);
  }

  function verFoto(url, nombre) {
    if (!url) return;
    var m = document.createElement('div');
    m.className = 'modal-overlay active';
    m.setAttribute('data-ca-foto-modal', '1');
    m.innerHTML =
      '<div class="modal" style="max-width:360px;text-align:center">' +
      '<img src="' + esc(url) + '" style="width:100%;border-radius:12px;border:2px solid var(--accent)"/>' +
      '<p style="font-weight:700;margin:12px 0">' + esc(nombre) + '</p>' +
      '<button type="button" class="btn btn-outline btn-sm" data-ca-close-foto>Cerrar</button></div>';
    document.body.appendChild(m);
    m.querySelector('[data-ca-close-foto]').onclick = function () { m.remove(); };
    m.onclick = function (e) { if (e.target === m) m.remove(); };
  }

  async function loadRrhhExtras() {
    var id = 'rrhh_' + api().businessId();
    var r = await api().rest('crozzo_rrhh_config', 'id=eq.' + encodeURIComponent(id) + '&select=payload');
    var payload = {};
    if (r.ok && Array.isArray(r.data) && r.data[0]) payload = r.data[0].payload || {};
    acc.mensajeUniforme = payload.mensajeUniforme || st().intConfig.mensajeUniforme || acc.mensajeUniforme;
    acc.requiereFoto = payload.requiereFoto !== false && st().intConfig.requiereFoto !== false;
    acc.logoDataUrl = (payload.logo && payload.logo.dataUrl) || '';
    acc.kioskFullscreen = !!st().intConfig.kioskFullscreen;
    applyKioskFullscreen(acc.kioskFullscreen);
  }

  async function saveRrhhExtras() {
    var id = 'rrhh_' + api().businessId();
    var payload = {
      mensajeUniforme: acc.mensajeUniforme,
      requiereFoto: acc.requiereFoto,
      logo: { dataUrl: acc.logoDataUrl }
    };
    st().intConfig.mensajeUniforme = acc.mensajeUniforme;
    st().intConfig.requiereFoto = acc.requiereFoto;
    st().intConfig.kioskFullscreen = acc.kioskFullscreen;
    await api().saveIntegracionConfig();
    if (!api().cloudReady()) return;
    await api().rest('crozzo_rrhh_config', '', {
      method: 'POST',
      body: { id: id, business_id: api().businessId(), payload: payload, updated_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }

  async function importarPlantilla() {
    if (!confirm('¿Importar los 20 empleados de la plantilla QyC? (solo agrega los que no existan por PIN)')) return;
    var pins = {};
    st().empleados.forEach(function (e) { pins[String(e.pin)] = true; });
    var n = 0;
    for (var i = 0; i < EMP_PLANTILLA.length; i++) {
      var s = EMP_PLANTILLA[i];
      if (pins[String(s.pin)]) continue;
      var body = {
        business_id: api().businessId(),
        name: s.name,
        full_name: s.full_name || s.name,
        pin: s.pin,
        cargo: s.cargo || '',
        activo: true
      };
      await api().rest('crozzo_empleados', '', { method: 'POST', body: body, prefer: 'return=minimal' });
      n++;
    }
    await api().loadEmpleados();
    renderEmpGrid();
    toast(n ? 'Importados ' + n + ' empleados' : 'Todos los PIN ya existían', 'success');
  }

  function renderAdminPanel() {
    var root = document.getElementById('ca-admin-root');
    if (!root) return;
    if (acc.adminTab === 'hoy') {
      var rows = st().marcaciones
        .map(function (r) {
          var foto = r.foto_url
            ? '<img class="ca-foto-thumb" src="' + esc(r.foto_url) + '" data-foto="' + esc(r.foto_url) + '" data-nom="' + esc(r.nombre) + '" alt=""/>'
            : '—';
          return (
            '<tr><td>' + foto + '</td><td>' + esc(r.nombre) + '</td><td>' + esc(r.cargo || '') + '</td>' +
            '<td><span class="crozzo-int-badge ' + (r.tipo === 'entrada' ? 'in' : 'out') + '">' + r.tipo + '</span></td>' +
            '<td>' + fmt(r.timestamp) + '</td></tr>'
          );
        })
        .join('');
      root.innerHTML =
        '<table class="crozzo-int-table"><thead><tr><th>Foto</th><th>Empleado</th><th>Cargo</th><th>Tipo</th><th>Hora</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="5">Sin marcaciones hoy</td></tr>') + '</tbody></table>';
      root.querySelectorAll('[data-foto]').forEach(function (img) {
        img.onclick = function () { verFoto(img.getAttribute('data-foto'), img.getAttribute('data-nom')); };
      });
      return;
    }
    if (acc.adminTab === 'empleados') {
      root.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr 100px auto;gap:8px;margin-bottom:12px">' +
        '<input id="ca-ne-name" class="form-input" placeholder="Nombre" /><input id="ca-ne-cargo" class="form-input" placeholder="Cargo" />' +
        '<input id="ca-ne-pin" class="form-input" placeholder="PIN" /><button type="button" class="btn btn-primary btn-sm" id="ca-ne-add">Agregar</button></div>' +
        '<button type="button" class="btn btn-outline btn-sm" id="ca-import-pl" style="margin-bottom:12px">Importar plantilla QyC (20)</button>' +
        '<table class="crozzo-int-table"><thead><tr><th>Nombre</th><th>Cargo</th><th>PIN</th></tr></thead><tbody>' +
        st().empleados.map(function (e) {
          return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.cargo || '') + '</td><td>' + esc(e.pin) + '</td></tr>';
        }).join('') +
        '</tbody></table>';
      document.getElementById('ca-import-pl').onclick = importarPlantilla;
      document.getElementById('ca-ne-add').onclick = async function () {
        var name = String((document.getElementById('ca-ne-name') || {}).value || '').trim();
        var cargo = String((document.getElementById('ca-ne-cargo') || {}).value || '').trim();
        var pin = String((document.getElementById('ca-ne-pin') || {}).value || '').trim();
        if (!name || !pin) { toast('Nombre y PIN requeridos', 'error'); return; }
        await api().rest('crozzo_empleados', '', {
          method: 'POST',
          body: { business_id: api().businessId(), name: name, cargo: cargo, pin: pin, activo: true },
          prefer: 'return=representation'
        });
        await api().loadEmpleados();
        renderAdminPanel();
        toast('Empleado agregado', 'success');
      };
      return;
    }
    if (acc.adminTab === 'config') {
      var tg = st().intConfig.telegram || {};
      root.innerHTML =
        '<div class="form-group"><label>Mensaje antes de marcar (uniforme)</label><textarea id="ca-cfg-msg" class="form-input" rows="3">' + esc(acc.mensajeUniforme) + '</textarea></div>' +
        '<label style="display:flex;align-items:center;gap:8px;margin:12px 0;font-size:13px"><input type="checkbox" id="ca-cfg-foto" ' + (acc.requiereFoto !== false ? 'checked' : '') + '> Exigir foto al marcar</label>' +
        '<label style="display:flex;align-items:center;gap:8px;margin:12px 0;font-size:13px"><input type="checkbox" id="ca-cfg-kiosk" ' + (acc.kioskFullscreen ? 'checked' : '') + '> Modo kiosk (pantalla completa, oculta menú POS)</label>' +
        '<div class="form-group"><label>Logo kiosk (opcional)</label><input type="file" id="ca-cfg-logo" accept="image/*" class="form-input"/>' +
        (acc.logoDataUrl ? '<img src="' + acc.logoDataUrl + '" class="ca-logo" style="max-height:80px;margin-top:8px"/>' : '') + '</div>' +
        '<hr style="margin:16px 0;border-color:var(--border)"/>' +
        '<p style="font-size:12px;font-weight:700;margin-bottom:8px">Telegram (pedidos internos)</p>' +
        '<div class="form-group"><label>Bot token</label><input id="ca-tg-token" class="form-input" value="' + esc(tg.botToken || '') + '"/></div>' +
        '<div class="form-group"><label>Chat id</label><input id="ca-tg-chat" class="form-input" value="' + esc(tg.chatId || '') + '"/></div>' +
        '<div class="form-group"><label>Clave panel admin kiosk</label><input id="ca-cfg-admin-pw" class="form-input" type="password" value="' + esc(st().intConfig.adminKioskPw || 'admin2024') + '" autocomplete="new-password"/></div>' +
        '<p style="font-size:11px;opacity:.65">Bucket Supabase: <code>fotos-marcaciones</code> (público). Ver docs/SUPABASE-STORAGE-FOTOS-MARCACIONES.sql</p>' +
        '<button type="button" class="btn btn-primary" id="ca-cfg-save" style="margin-top:12px">Guardar</button>';
      document.getElementById('ca-cfg-save').onclick = async function () {
        acc.mensajeUniforme = String((document.getElementById('ca-cfg-msg') || {}).value || '').trim();
        acc.requiereFoto = !!(document.getElementById('ca-cfg-foto') || {}).checked;
        acc.kioskFullscreen = !!(document.getElementById('ca-cfg-kiosk') || {}).checked;
        st().intConfig.adminKioskPw = String((document.getElementById('ca-cfg-admin-pw') || {}).value || '').trim() || 'admin2024';
        st().intConfig.telegram = {
          botToken: String((document.getElementById('ca-tg-token') || {}).value || '').trim(),
          chatId: String((document.getElementById('ca-tg-chat') || {}).value || '').trim()
        };
        applyKioskFullscreen(acc.kioskFullscreen);
        await saveRrhhExtras();
        toast('Configuración guardada', 'success');
      };
      document.getElementById('ca-cfg-logo').onchange = function (ev) {
        var f = ev.target.files && ev.target.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          acc.logoDataUrl = rd.result;
          renderAdminPanel();
        };
        rd.readAsDataURL(f);
      };
    }
  }

  function bindShell() {
    var search = document.getElementById('ca-search');
    if (search) search.oninput = function () { acc.search = search.value; renderEmpGrid(); };
    document.getElementById('ca-btn-refresh').onclick = async function () {
      await api().loadMarcacionesHoy();
      renderEmpGrid();
      toast('Actualizado', 'success');
    };
    document.getElementById('ca-btn-admin').onclick = function () {
      var ing = prompt('Clave de administración (marcación):');
      if (ing === null) return;
      if (String(ing).trim() !== adminKioskPassword()) {
        toast('Clave incorrecta', 'error');
        return;
      }
      acc.screen = 'admin';
      document.getElementById('ca-app-kiosk').style.display = 'none';
      document.getElementById('ca-app-admin').style.display = 'block';
      renderAdminPanel();
    };
    document.getElementById('ca-btn-back-kiosk').onclick = function () {
      document.getElementById('ca-app-kiosk').style.display = 'block';
      document.getElementById('ca-app-admin').style.display = 'none';
      acc.screen = 'home';
      setScreen('home');
    };
    document.querySelectorAll('[data-ca-admin-tab]').forEach(function (btn) {
      btn.onclick = function () {
        acc.adminTab = btn.getAttribute('data-ca-admin-tab');
        document.querySelectorAll('[data-ca-admin-tab]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-ca-admin-tab') === acc.adminTab);
        });
        renderAdminPanel();
      };
    });
    document.getElementById('ca-ce-yes').onclick = confirmarSiSoyYo;
    document.getElementById('ca-ce-no').onclick = function () { setScreen('home'); };
    document.getElementById('ca-cam-cancel').onclick = function () { detenerCamara(); setScreen('home'); };
    document.getElementById('ca-pin-check').onclick = function () {
      var emp = st().empleados.find(function (e) { return String(e.pin) === acc.pinBuf; });
      if (!emp) {
        toast('PIN incorrecto', 'error');
        acc.pinBuf = '';
        document.getElementById('ca-pin-dots').textContent = '— — — —';
        return;
      }
      var stt = estadoEmpleado(emp);
      openConfirm(emp, stt.accion || 'entrada');
    };
    document.querySelectorAll('[data-ca-pin]').forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute('data-ca-pin');
        if (k === 'bk') acc.pinBuf = acc.pinBuf.slice(0, -1);
        else if (acc.pinBuf.length < 4) acc.pinBuf += k;
        document.getElementById('ca-pin-dots').textContent = acc.pinBuf ? '•'.repeat(acc.pinBuf.length) : '— — — —';
      };
    });
    document.getElementById('ca-go-pin').onclick = function () { setScreen('pin'); acc.pinBuf = ''; };
  }

  function renderShell() {
    var logo = acc.logoDataUrl ? '<img class="ca-logo" src="' + acc.logoDataUrl + '" alt="Logo"/>' : '';
    return (
      '<section class="content-section crozzo-int crozzo-acceso-app">' +
      '<div id="ca-sync-bar" class="ca-sync"></div>' +
      '<div id="ca-app-kiosk">' +
      '<div class="ca-toolbar">' +
      '<button type="button" class="btn btn-outline btn-sm" id="ca-go-pin">Ingresar con PIN</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ca-btn-refresh">↻ Actualizar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="ca-btn-admin" style="margin-left:auto">Panel admin</button>' +
      '</div>' +
      '<div class="ca-screen active" data-ca-screen="home">' +
      '<div class="ca-home-head">' + logo +
      '<div class="ca-clock" id="ca-clock">00:00:00</div>' +
      '<div class="ca-date" id="ca-date-iso"></div>' +
      '<span class="ca-net" id="ca-net"><span class="dot"></span><span class="ca-net-txt">—</span></span></div>' +
      '<input class="ca-search" id="ca-search" placeholder="Buscar empleado…" />' +
      '<div class="ca-emp-grid" id="ca-emp-grid"></div></div>' +
      '<div class="ca-screen" data-ca-screen="pin">' +
      '<div class="ca-confirm-card"><p style="font-weight:700">Ingrese PIN (4 dígitos)</p>' +
      '<div class="ca-pin-dots" id="ca-pin-dots">— — — —</div>' +
      '<div class="ca-keypad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 'bk', 0, 'ok'].map(function (k) {
        var lab = k === 'bk' ? '⌫' : k === 'ok' ? '✓' : String(k);
        var attr = k === 'ok' ? '' : ' data-ca-pin="' + (k === 'bk' ? 'bk' : k) + '"';
        var id = k === 'ok' ? ' id="ca-pin-check"' : '';
        return '<button type="button"' + attr + id + '>' + lab + '</button>';
      }).join('') +
      '</div><button type="button" class="btn btn-outline btn-sm" style="margin-top:16px" onclick="CrozzoModulosIntegradosAcceso.goHome()">Volver</button></div></div>' +
      '<div class="ca-screen" data-ca-screen="confirm">' +
      '<div class="ca-confirm-card"><div class="ca-av ca-av-lg" id="ca-ce-av">?</div>' +
      '<div style="font-size:22px;font-weight:800" id="ca-ce-nm"></div>' +
      '<div style="font-size:12px;opacity:.75" id="ca-ce-rl"></div>' +
      '<div style="font-size:11px;color:var(--accent);font-weight:700;margin:12px 0;text-transform:uppercase" id="ca-ce-act"></div>' +
      '<div class="ca-msg-box" id="ca-ce-msg"></div>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn btn-primary" style="flex:1" id="ca-ce-yes">Sí, soy yo</button>' +
      '<button type="button" class="btn btn-outline" style="flex:1" id="ca-ce-no">No</button></div></div></div>' +
      '<div class="ca-screen" data-ca-screen="camera">' +
      '<div class="ca-confirm-card" style="max-width:600px">' +
      '<div class="ca-av ca-av-lg" id="ca-cam-av">?</div>' +
      '<div style="font-weight:700" id="ca-cam-nm"></div><div style="font-size:12px" id="ca-cam-rl"></div>' +
      '<div style="font-size:11px;font-weight:700;color:var(--accent);margin:8px 0" id="ca-cam-act"></div>' +
      '<div class="ca-cam-wrap"><video id="ca-cam-video" autoplay playsinline></video>' +
      '<div class="ca-face-guide"></div><div class="ca-countdown" id="ca-cam-cd">3</div><div class="ca-flash" id="ca-cam-flash"></div></div>' +
      '<canvas id="ca-cam-canvas" style="display:none"></canvas>' +
      '<p id="ca-cam-status" style="font-size:12px;margin-top:8px">—</p>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ca-cam-cancel">Cancelar</button></div></div>' +
      '<div class="ca-screen" data-ca-screen="done">' +
      '<div class="ca-confirm-card"><div style="font-size:48px" id="ca-done-ic">✅</div>' +
      '<div style="font-size:20px;font-weight:800" id="ca-done-nm"></div>' +
      '<div id="ca-done-det"></div><div style="font-size:28px;color:var(--accent);font-weight:800;margin-top:8px" id="ca-done-t"></div></div></div>' +
      '</div>' +
      '<div id="ca-app-admin" style="display:none">' +
      '<div class="ca-toolbar"><button type="button" class="btn btn-outline btn-sm" id="ca-btn-back-kiosk">← Volver al kiosk</button></div>' +
      '<div class="crozzo-int-tabs">' +
      ['hoy', 'empleados', 'config'].map(function (t) {
        var lab = { hoy: 'Marcaciones hoy', empleados: 'Empleados', config: 'Configuración' };
        return '<button type="button" class="' + (acc.adminTab === t ? 'active' : '') + '" data-ca-admin-tab="' + t + '">' + lab[t] + '</button>';
      }).join('') +
      '</div><div id="ca-admin-root"></div></div></section>'
    );
  }

  global.crozzoIntAccesoTeardown = function () {
    detenerCamara();
    applyKioskFullscreen(false);
    if (acc.refreshIv) { clearInterval(acc.refreshIv); acc.refreshIv = null; }
  };

  global.CrozzoModulosIntegradosAcceso = {
    goHome: function () { setScreen('home'); },
    render: function () {
      injectAccesoStyles();
      return renderShell();
    },
    init: async function () {
      if (!api()) { console.warn('[acceso] Falta CrozzoIntApi'); return; }
      await api().loadIntegracionConfig();
      await loadRrhhExtras();
      await api().loadEmpleados();
      await api().loadMarcacionesHoy();
      var n = await api().syncPendingMarcaciones();
      if (n > 0) toast('Sincronizadas ' + n + ' marcaciones pendientes', 'success');
      bindShell();
      setScreen('home');
      tickClock();
      if (acc.refreshIv) clearInterval(acc.refreshIv);
      acc.refreshIv = setInterval(async function () {
        if (acc.screen !== 'home' && acc.screen !== 'confirm') return;
        await api().loadMarcacionesHoy();
        if (acc.screen === 'home') renderEmpGrid();
        tickClock();
      }, 30000);
      setInterval(tickClock, 1000);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
