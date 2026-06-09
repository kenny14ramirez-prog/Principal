/**
 * Super Admin — Federación / remisiones entre negocios (Opción B).
 */
(function (global) {
  'use strict';

  var LS_STEP = 'crozzo_fed_wizard_step';
  var LS_SQL_DONE = 'crozzo_fed_sql_done';

  var FED_PROBE = [
    { table: 'crozzo_bodegas', label: 'Bodegas', required: true },
    { table: 'crozzo_remisiones', label: 'Remisiones', required: true },
    { table: 'crozzo_federacion_entrante', label: 'Bandeja entrante', required: true },
    { table: 'crozzo_federacion_acuse', label: 'Acuses', required: true },
    { table: 'crozzo_federacion_socios', label: 'Socios (nube)', required: false },
  ];

  function eng() {
    return global.CrozzoFederacionEngine;
  }

  function esc(s) {
    return eng() ? eng().esc(s) : String(s == null ? '' : s);
  }

  function toast(m, t) {
    if (eng()) eng().toast(m, t);
  }

  function renderWizardNav(step) {
    var steps = [
      { id: 1, label: '1. Identidad', icon: '🏷️' },
      { id: 2, label: '2. SQL', icon: '📝' },
      { id: 3, label: '3. Socios', icon: '🤝' },
      { id: 4, label: '4. Verificar', icon: '✅' },
    ];
    return (
      '<nav class="crozzo-nube-wizard-nav crozzo-fed-wizard-nav" role="tablist">' +
      steps
        .map(function (st) {
          return (
            '<button type="button" class="crozzo-nube-wizard-nav__item' +
            (st.id === step ? ' crozzo-nube-wizard-nav__item--active' : '') +
            '" data-fed-step="' +
            st.id +
            '">' +
            st.icon +
            ' ' +
            esc(st.label) +
            '</button>'
          );
        })
        .join('') +
      '</nav>'
    );
  }

  function renderStepIdentity() {
    var E = eng();
    if (!E) return '';
    var st = E.loadStore().negocio;
    var cfg = E.loadFedConfig();
    return (
      '<div class="card" data-fed-panel="1">' +
      '<div class="card-header"><span class="card-title">Paso 1 — Identidad de este negocio</span></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p><strong>Requisito:</strong> configure primero <button type="button" class="btn btn-outline btn-sm" id="fedGoNube">Nube global</button> ' +
      '(URL + anon key de <em>este</em> Supabase). La federación usa esas credenciales para tablas locales y verificación.</p></div>' +
      '<div class="crozzo-nube-callout">' +
      '<p><strong>Opción B:</strong> cada sede (Álamos, Pinares, Centro…) tiene su propio Supabase. ' +
      'Este ID es cómo los socios reconocen quién envía remisiones. Comparta la clave API solo con socios autorizados.</p></div>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label class="form-label">ID del negocio</label>' +
      '<input class="form-input" id="fedNegocioId" value="' +
      esc(st.id) +
      '" placeholder="ej: alamos" /></div>' +
      '<div class="form-group"><label class="form-label">Nombre visible</label>' +
      '<input class="form-input" id="fedNegocioNombre" value="' +
      esc(st.nombre) +
      '" placeholder="Restaurante Álamos" /></div>' +
      '<div class="form-group full"><label class="form-label">Clave API (opcional, validación futura)</label>' +
      '<input class="form-input" id="fedClaveApi" value="' +
      esc(st.claveApi) +
      '" placeholder="Generada o acordada con el socio" autocomplete="off" /></div>' +
      '<div class="form-group"><label class="form-label">Sync automático (min)</label>' +
      '<input type="number" class="form-input" id="fedSyncMin" min="1" max="60" value="' +
      esc(cfg.syncIntervalMin) +
      '" /></div>' +
      '<div class="form-group full"><label class="md-toggle">' +
      '<input type="checkbox" id="fedAutoSync"' +
      (cfg.autoSync ? ' checked' : '') +
      '><span>Sincronizar remisiones en segundo plano</span></label></div>' +
      '</div>' +
      '<div class="btn-group" style="margin-top:12px">' +
      '<button type="button" class="btn btn-primary" id="fedSaveIdentity">💾 Guardar identidad</button></div></div>'
    );
  }

  function renderStepSql() {
    return (
      '<div class="card" data-fed-panel="2">' +
      '<div class="card-header"><span class="card-title">Paso 2 — Crear tablas en ESTE Supabase</span></div>' +
      '<ol class="crozzo-nube-steps-overview">' +
      '<li>Abra el proyecto Supabase <strong>de este negocio</strong> (no mezcle Álamos con Pinares).</li>' +
      '<li>SQL Editor → New query → pegue el script → Run.</li>' +
      '<li>Repita el mismo archivo en <strong>cada</strong> sede que participará.</li>' +
      '<li>Marque «SQL ejecutado» y pase a Verificar.</li></ol>' +
      '<p class="form-hint">Archivo: <code>docs/SUPABASE-SQL-FEDERACION.sql</code></p>' +
      '<textarea class="form-input" id="fedSqlTextarea" rows="14" readonly style="font-family:monospace;font-size:11px;margin-top:8px">Cargando SQL…</textarea>' +
      '<div class="btn-group" style="margin-top:10px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-outline" id="fedCopySql">📋 Copiar SQL</button>' +
      '<button type="button" class="btn btn-outline" id="fedDownloadSql">⬇ Descargar</button>' +
      '<label class="md-toggle" style="margin-left:8px"><input type="checkbox" id="fedSqlDone"> SQL ejecutado en este proyecto</label></div></div>'
    );
  }

  function renderSocioRow(s) {
    s = s || {};
    return (
      '<tr data-fed-socio-row="' +
      esc(s.id || '') +
      '">' +
      '<td><input class="form-input fed-socio-nombre" value="' +
      esc(s.partnerNombre || '') +
      '" placeholder="Pinares" /></td>' +
      '<td><input class="form-input fed-socio-pid" value="' +
      esc(s.partnerNegocioId || '') +
      '" placeholder="pinares" /></td>' +
      '<td><input class="form-input fed-socio-url" value="' +
      esc(s.partnerSupabaseUrl || '') +
      '" placeholder="https://xxx.supabase.co" /></td>' +
      '<td><input class="form-input fed-socio-key" type="password" value="' +
      esc(s.partnerAnonKey || '') +
      '" placeholder="anon key del socio" autocomplete="off" /></td>' +
      '<td style="white-space:nowrap"><label><input type="checkbox" class="fed-socio-env"' +
      (s.puedeEnviar !== false ? ' checked' : '') +
      '> Env</label> ' +
      '<label><input type="checkbox" class="fed-socio-rec"' +
      (s.puedeRecibir !== false ? ' checked' : '') +
      '> Rec</label></td>' +
      '<td><button type="button" class="btn btn-outline btn-sm fed-socio-del">✕</button></td></tr>'
    );
  }

  function renderStepSocios() {
    var E = eng();
    var socios = E ? E.listSocios() : [];
    var all = E ? E.loadStore().socios : [];
    var rows = (all.length ? all : [{}]).map(renderSocioRow).join('');
    return (
      '<div class="card" data-fed-panel="3">' +
      '<div class="card-header"><span class="card-title">Paso 3 — Socios comerciales (otras bases)</span></div>' +
      '<p class="form-hint">Para enviar a otro negocio necesita la <strong>URL</strong> y <strong>anon key</strong> del Supabase del socio. ' +
      'Solo se usa para escribir en <code>crozzo_federacion_entrante</code> y leer acuses — no replica toda la base.</p>' +
      '<div class="table-container" style="margin-top:12px;overflow:auto">' +
      '<table class="data-table"><thead><tr><th>Nombre</th><th>ID negocio</th><th>Supabase URL</th><th>Anon key</th><th>Permisos</th><th></th></tr></thead>' +
      '<tbody id="fedSociosBody">' +
      rows +
      '</tbody></table></div>' +
      '<div class="btn-group" style="margin-top:10px">' +
      '<button type="button" class="btn btn-outline" id="fedAddSocio">+ Agregar socio</button>' +
      '<button type="button" class="btn btn-primary" id="fedSaveSocios">💾 Guardar socios</button></div>' +
      '<p class="form-hint" style="margin-top:10px">En el socio destino, agregue este negocio con la URL y anon key de <strong>este</strong> equipo para respuestas (acuses).</p></div>'
    );
  }

  function renderStepVerify() {
    var rows = FED_PROBE.map(function (p) {
      return (
        '<tr data-fed-probe="' +
        esc(p.table) +
        '"><td>' +
        esc(p.label) +
        '</td><td><code>' +
        esc(p.table) +
        '</code></td><td class="crozzo-fed-probe-status">—</td></tr>'
      );
    }).join('');
    return (
      '<div class="card" data-fed-panel="4">' +
      '<div class="card-header"><span class="card-title">Paso 4 — Verificar tablas locales</span></div>' +
      '<p class="form-hint" id="fedProbeSummary">Use las mismas credenciales de Nube global (paso 1 de Nube global).</p>' +
      '<table class="data-table"><thead><tr><th>Módulo</th><th>Tabla</th><th>Estado</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>' +
      '<div class="btn-group" style="margin-top:12px">' +
      '<button type="button" class="btn btn-primary" id="fedProbeBtn">🔌 Comprobar tablas</button>' +
      '<button type="button" class="btn btn-outline" id="fedTestSync">↻ Probar sync remisiones</button></div></div>'
    );
  }

  function renderHero() {
    return (
      '<div class="crozzo-nube-hero card">' +
      '<div class="crozzo-nube-hero__body">' +
      '<h2 class="crozzo-nube-hero__title">🔗 Federación — Remisiones entre sedes</h2>' +
      '<p class="form-hint crozzo-nube-hero__lead">Configure bodegas, socios y el puente mínimo entre Supabase separados (Opción B). ' +
      'Los usuarios operan remisiones y préstamos en <strong>Gestión → Bodegas y remisiones</strong>.</p>' +
      '<ol class="crozzo-nube-steps-overview">' +
      '<li>Identidad del negocio en este equipo</li>' +
      '<li>SQL de federación en el Supabase de esta sede</li>' +
      '<li>Registrar socios (URL + anon key del otro proyecto)</li>' +
      '<li>Verificar y probar sincronización</li></ol>' +
      '<p class="form-hint"><strong>Campos clave:</strong> ID negocio (slug único), nombre visible, clave API opcional, URL Supabase del socio, anon key del socio, permisos Enviar/Recibir.</p></div></div>'
    );
  }

  function renderAll(step) {
    step = step || 1;
    return (
      '<div class="crozzo-fed-admin" id="crozzo-fed-admin">' +
      renderHero() +
      renderWizardNav(step) +
      renderStepIdentity() +
      renderStepSql() +
      renderStepSocios() +
      renderStepVerify() +
      '</div>'
    );
  }

  function setStep(n) {
    n = Math.max(1, Math.min(4, n));
    try {
      localStorage.setItem(LS_STEP, String(n));
    } catch (_) {}
    var root = document.getElementById('crozzo-fed-admin');
    if (!root) return;
    root.querySelectorAll('[data-fed-panel]').forEach(function (p) {
      p.style.display = parseInt(p.getAttribute('data-fed-panel'), 10) === n ? '' : 'none';
    });
    root.querySelectorAll('[data-fed-step]').forEach(function (btn) {
      btn.classList.toggle('crozzo-nube-wizard-nav__item--active', parseInt(btn.getAttribute('data-fed-step'), 10) === n);
    });
  }

  async function probeTables() {
    var E = eng();
    if (!E) return;
    var creds = E.localSupabaseCreds();
    var summary = document.getElementById('fedProbeSummary');
    if (!creds.url || !creds.key) {
      if (summary) summary.textContent = 'Configure primero Nube global (URL + anon key).';
      toast('Faltan credenciales Supabase locales.', 'warning');
      return;
    }
    if (summary) summary.textContent = 'Comprobando…';
    var ok = 0;
    for (var i = 0; i < FED_PROBE.length; i++) {
      var p = FED_PROBE[i];
      var cell = document.querySelector('[data-fed-probe="' + p.table + '"] .crozzo-fed-probe-status');
      try {
        var res = await fetch(creds.url + '/rest/v1/' + encodeURIComponent(p.table) + '?limit=0&select=id', {
          headers: { apikey: creds.key, Authorization: 'Bearer ' + creds.key },
        });
        if (res.ok) {
          ok++;
          if (cell) cell.innerHTML = '<span class="badge badge-success">OK</span>';
        } else if (cell) cell.innerHTML = '<span class="badge badge-warning">HTTP ' + res.status + '</span>';
      } catch (_) {
        if (cell) cell.innerHTML = '<span class="badge badge-warning">Error</span>';
      }
    }
    if (summary) summary.textContent = ok + ' de ' + FED_PROBE.length + ' tablas accesibles.';
    toast(ok >= 3 ? 'Federación lista para operar.' : 'Ejecute el SQL del paso 2.', ok >= 3 ? 'success' : 'warning');
  }

  function collectSociosFromDom() {
    var E = eng();
    if (!E) return;
    document.querySelectorAll('#fedSociosBody tr').forEach(function (tr) {
      var id = tr.getAttribute('data-fed-socio-row') || '';
      E.upsertSocio({
        id: id || undefined,
        partnerNombre: (tr.querySelector('.fed-socio-nombre') || {}).value,
        partnerNegocioId: (tr.querySelector('.fed-socio-pid') || {}).value,
        partnerSupabaseUrl: (tr.querySelector('.fed-socio-url') || {}).value,
        partnerAnonKey: (tr.querySelector('.fed-socio-key') || {}).value,
        puedeEnviar: (tr.querySelector('.fed-socio-env') || {}).checked,
        puedeRecibir: (tr.querySelector('.fed-socio-rec') || {}).checked,
      });
    });
    toast('Socios guardados', 'success');
  }

  function bindAdmin() {
    var root = document.getElementById('crozzo-fed-admin');
    if (!root || root._fedBound) return;
    root._fedBound = true;

    var step = 1;
    try {
      step = parseInt(localStorage.getItem(LS_STEP) || '1', 10) || 1;
    } catch (_) {}
    setStep(step);

    root.addEventListener('click', function (ev) {
      var stBtn = ev.target.closest('[data-fed-step]');
      if (stBtn) setStep(parseInt(stBtn.getAttribute('data-fed-step'), 10));
    });

    document.getElementById('fedSaveIdentity')?.addEventListener('click', function () {
      var E = eng();
      if (!E) return;
      E.saveNegocioIdentity({
        id: document.getElementById('fedNegocioId')?.value,
        nombre: document.getElementById('fedNegocioNombre')?.value,
        claveApi: document.getElementById('fedClaveApi')?.value,
      });
      E.saveFedConfig({
        syncIntervalMin: Number(document.getElementById('fedSyncMin')?.value) || 5,
        autoSync: !!document.getElementById('fedAutoSync')?.checked,
      });
      toast('Identidad guardada', 'success');
    });

    document.getElementById('fedGoNube')?.addEventListener('click', function () {
      if (typeof global.navigateTo === 'function') global.navigateTo('super-admin-nube');
    });

    document.getElementById('fedCopySql')?.addEventListener('click', function () {
      var ta = document.getElementById('fedSqlTextarea');
      if (!ta || !ta.value) return;
      navigator.clipboard?.writeText(ta.value).then(
        function () { toast('SQL copiado', 'success'); },
        function () { ta.select(); document.execCommand('copy'); toast('SQL copiado', 'success'); }
      );
    });

    document.getElementById('fedDownloadSql')?.addEventListener('click', function () {
      var ta = document.getElementById('fedSqlTextarea');
      if (!ta) return;
      var blob = new Blob([ta.value], { type: 'text/sql' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'SUPABASE-SQL-FEDERACION.sql';
      a.click();
    });

    document.getElementById('fedSqlDone')?.addEventListener('change', function (ev) {
      try {
        if (ev.target.checked) localStorage.setItem(LS_SQL_DONE, String(Date.now()));
        else localStorage.removeItem(LS_SQL_DONE);
      } catch (_) {}
    });

    document.getElementById('fedAddSocio')?.addEventListener('click', function () {
      var tbody = document.getElementById('fedSociosBody');
      if (!tbody) return;
      tbody.insertAdjacentHTML('beforeend', renderSocioRow({ id: 'new_' + Date.now() }));
    });

    document.getElementById('fedSaveSocios')?.addEventListener('click', collectSociosFromDom);

    root.addEventListener('click', function (ev) {
      if (ev.target.classList.contains('fed-socio-del')) {
        ev.target.closest('tr')?.remove();
      }
    });

    document.getElementById('fedProbeBtn')?.addEventListener('click', function () {
      void probeTables();
    });

    document.getElementById('fedTestSync')?.addEventListener('click', function () {
      var E = eng();
      if (!E) return;
      E.syncAll().then(function () {
        toast('Sync completado — revise bandeja entrante en operaciones', 'success');
      });
    });

    if (global.CrozzoFederacionSql && global.CrozzoFederacionSql.loadText) {
      global.CrozzoFederacionSql.loadText().then(function (sql) {
        var ta = document.getElementById('fedSqlTextarea');
        if (ta) ta.value = sql;
      });
    }
    try {
      var done = localStorage.getItem(LS_SQL_DONE);
      var chk = document.getElementById('fedSqlDone');
      if (chk && done) chk.checked = true;
    } catch (_) {}
  }

  global.renderSuperAdminFederacionHTML = function () {
    return renderAll(1);
  };

  global.initSuperAdminFederacion = function () {
    bindAdmin();
  };
})(typeof window !== 'undefined' ? window : globalThis);
