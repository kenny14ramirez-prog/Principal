/**
 * Crozzo POS — Centro de mando · Perfiles y menús ocultos
 * Grafo de dependencias, validación matemática, psicología operativa (carga cognitiva / cadena de custodia).
 */
(function (global) {
  'use strict';

  var VENTAS_SOURCE = ['punto-venta', 'venta-comercial', 'tablets'];
  var COMPROBANTES = ['facturas'];
  var CAJA_CHAIN = VENTAS_SOURCE.concat(COMPROBANTES).concat(['cierre-caja']);
  var ADMIN_ONLY = ['facturas-admin', 'config-empresa', 'impuestos', 'conexion-sistemas', 'admin'];
  var INVENTARIO_FORBIDDEN = ['punto-venta', 'venta-comercial', 'cierre-caja', 'facturas', 'tablets', 'caja'];
  var ROLES = ['caja', 'mesero', 'cocina', 'inventario', 'user', 'admin'];

  var NODE_META = {
    'inicio-operacion': { tier: 0, chain: 'hub', label: 'Hub operativo' },
    'punto-venta': { tier: 1, chain: 'ventas', label: 'Ventas restaurante' },
    'venta-comercial': { tier: 1, chain: 'ventas', label: 'Ventas tienda' },
    tablets: { tier: 1, chain: 'ventas', label: 'Tablets mesero' },
    facturas: { tier: 2, chain: 'comprobantes', label: 'Comprobantes' },
    'cierre-caja': { tier: 3, chain: 'arqueo', label: 'Cierre / arqueo' },
    caja: { tier: 2, chain: 'clientes', label: 'Clientes FE' },
    comandas: { tier: 1, chain: 'cocina', label: 'Comandas' },
    cocina: { tier: 1, chain: 'cocina', label: 'KDS cocina' },
    inventarios: { tier: 2, chain: 'gestion', label: 'Inventarios' },
    productos: { tier: 2, chain: 'gestion', label: 'Catálogo' },
    'facturas-admin': { tier: 4, chain: 'admin', label: 'Impresión admin' },
    admin: { tier: 4, chain: 'admin', label: 'Usuarios' },
    'config-empresa': { tier: 4, chain: 'admin', label: 'Config empresa' },
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getCatalogGroups() {
    if (typeof global.CROZZO_MENU_CATALOG !== 'undefined' && global.CROZZO_MENU_CATALOG.length) {
      return global.CROZZO_MENU_CATALOG;
    }
    return [];
  }

  function allMenuIds() {
    var seen = {};
    var out = [];
    getCatalogGroups().forEach(function (grp) {
      (grp.items || []).forEach(function (it) {
        if (it && it.id && !seen[it.id]) {
          seen[it.id] = true;
          out.push(it.id);
        }
      });
    });
    return out;
  }

  function menuLabel(id) {
    if (typeof global.crozzoMenuLabelById === 'function') return global.crozzoMenuLabelById(id);
    return id;
  }

  function roleLabel(role) {
    if (typeof global.CROZZO_ROLES_MENU_CONFIG !== 'undefined') {
      var d = global.CROZZO_ROLES_MENU_CONFIG.find(function (r) {
        return r.id === role;
      });
      if (d) return d.label;
    }
    return role;
  }

  function recommendedForRole(perfil, role) {
    if (global.CrozzoPerfilesOperativos && global.CrozzoPerfilesOperativos.resolveRoleMenus) {
      return global.CrozzoPerfilesOperativos.resolveRoleMenus(perfil, role) || [];
    }
    return [];
  }

  function collectStateFromDom(root) {
    root = root || document.getElementById('gestion-perfiles');
    var state = { client: {}, roles: {} };
    if (!root) return state;
    ROLES.forEach(function (r) {
      state.roles[r] = {};
    });
    root.querySelectorAll('input[data-client-menu][data-menu]').forEach(function (cb) {
      state.client[cb.getAttribute('data-menu')] = cb.checked;
    });
    root.querySelectorAll('input[data-role][data-menu]').forEach(function (cb) {
      var role = cb.getAttribute('data-role');
      var menu = cb.getAttribute('data-menu');
      if (!state.roles[role]) state.roles[role] = {};
      state.roles[role][menu] = cb.checked;
    });
    return state;
  }

  function clientAllows(state, menuId) {
    if (state.client[menuId] === false) return false;
    if (state.client[menuId] === true) return true;
    return true;
  }

  function roleHas(state, role, menuId) {
    var r = state.roles[role] || {};
    if (r[menuId] === true) return true;
    if (r[menuId] === false) return false;
    return null;
  }

  function anyClientEnabled(state, ids) {
    return ids.some(function (id) {
      return state.client[id] !== false;
    });
  }

  function anyRoleEnabled(state, role, ids) {
    return ids.some(function (id) {
      return roleHas(state, role, id) === true;
    });
  }

  function analyze(state, opts) {
    opts = opts || {};
    var perfil = opts.perfil || 'basico_restaurante';
    var issues = [];
    var chainSteps = { ventas: false, comprobantes: false, arqueo: false };

    if (state.client['cierre-caja'] !== false) {
      chainSteps.arqueo = true;
      if (!anyClientEnabled(state, VENTAS_SOURCE)) {
        issues.push({
          severity: 'critical',
          code: 'CIERRE_SIN_VENTAS',
          message: 'Cierre de caja activo sin módulo de ventas (POS, tienda o tablets). No hay base para arquear.',
          fix: { type: 'enable_client', menus: [VENTAS_SOURCE[0]] },
        });
      }
      if (!anyClientEnabled(state, COMPROBANTES)) {
        issues.push({
          severity: 'warn',
          code: 'CIERRE_SIN_FACTURAS',
          message: 'Cierre sin Facturas: el arqueo no tendrá huella de comprobantes (facturasHash débil).',
          fix: { type: 'enable_client', menus: ['facturas'] },
        });
      }
    }
    if (anyClientEnabled(state, VENTAS_SOURCE)) chainSteps.ventas = true;
    if (anyClientEnabled(state, COMPROBANTES)) chainSteps.comprobantes = true;

    INVENTARIO_FORBIDDEN.forEach(function (mid) {
      if (roleHas(state, 'inventario', mid) === true) {
        issues.push({
          severity: 'critical',
          code: 'INV_CAJA_LEAK',
          message: 'Rol inventario tiene «' + menuLabel(mid) + '» — fuga de cadena de caja (debe estar aislado).',
          fix: { type: 'disable_role', role: 'inventario', menus: [mid] },
        });
      }
    });

    ADMIN_ONLY.forEach(function (mid) {
      ROLES.filter(function (r) {
        return r !== 'admin';
      }).forEach(function (role) {
        if (roleHas(state, role, mid) === true) {
          issues.push({
            severity: 'critical',
            code: 'ADMIN_SURFACE',
            message: '«' + menuLabel(mid) + '» expuesto a rol ' + roleLabel(role) + ' — superficie de ataque innecesaria.',
            fix: { type: 'disable_role', role: role, menus: [mid] },
          });
        }
      });
    });

    if (roleHas(state, 'mesero', 'comandas') === true) {
      issues.push({
        severity: 'warn',
        code: 'MESERO_CON_COMANDAS',
        message: 'Mesero con Comandas en menú — use Tablets; comandas es pantalla de cocina/bar.',
        fix: { type: 'disable_role', role: 'mesero', menus: ['comandas'] },
      });
    }
    if (
      roleHas(state, 'cocina', 'compras-cortes') !== true &&
      roleHas(state, 'cocina', 'compras-recetario-cocina') !== true
    ) {
      issues.push({
        severity: 'warn',
        code: 'COCINA_SIN_PREP',
        message: 'Rol cocina sin Cortes ni Recetario — no verá preparaciones ni fichas técnicas.',
        fix: { type: 'enable_role', role: 'cocina', menus: ['compras-cortes', 'compras-recetario-cocina'] },
      });
    }
    if (roleHas(state, 'cocina', 'comandas') !== true) {
      issues.push({
        severity: 'info',
        code: 'COCINA_SIN_COMANDAS',
        message: 'Cocina sin Comandas en menú — normal si usan kiosko KDS; útil como respaldo si falla la pantalla.',
        fix: { type: 'enable_role', role: 'cocina', menus: ['comandas'] },
      });
    }

    ROLES.forEach(function (role) {
      Object.keys(state.roles[role] || {}).forEach(function (mid) {
        if (state.roles[role][mid] && state.client[mid] === false) {
          issues.push({
            severity: 'warn',
            code: 'ORPHAN_ROLE_MENU',
            message: roleLabel(role) + ' tiene «' + menuLabel(mid) + '» pero el módulo está desactivado a nivel negocio.',
            fix: { type: 'disable_role', role: role, menus: [mid] },
          });
        }
      });
    });

    var coverage = {};
    ROLES.forEach(function (role) {
      var rec = recommendedForRole(perfil, role);
      if (!rec.length) {
        coverage[role] = { pct: 100, enabled: 0, total: 0 };
        return;
      }
      var enabled = 0;
      rec.forEach(function (mid) {
        if (roleHas(state, role, mid) === true && clientAllows(state, mid)) enabled++;
      });
      coverage[role] = {
        pct: Math.round((enabled / rec.length) * 100),
        enabled: enabled,
        total: rec.length,
      };
    });

    var exposure = 0;
    var exposureMax = 0;
    ROLES.filter(function (r) {
      return r !== 'admin';
    }).forEach(function (role) {
      allMenuIds().forEach(function (mid) {
        var meta = NODE_META[mid] || { tier: 1 };
        var w = (meta.tier + 1) * 10;
        exposureMax += w;
        if (roleHas(state, role, mid) === true && clientAllows(state, mid)) exposure += w;
      });
    });
    var exposurePct = exposureMax ? Math.round((exposure / exposureMax) * 100) : 0;

    var chainScore =
      (chainSteps.ventas ? 34 : 0) + (chainSteps.comprobantes ? 33 : 0) + (chainSteps.arqueo ? 33 : 0);
    var critical = issues.filter(function (i) {
      return i.severity === 'critical';
    }).length;
    var warns = issues.filter(function (i) {
      return i.severity === 'warn';
    }).length;

    var status = 'operational';
    if (critical > 0) status = 'critical';
    else if (warns > 0 || exposurePct > 55) status = 'alert';

    return {
      status: status,
      chainScore: chainScore,
      chainSteps: chainSteps,
      exposurePct: exposurePct,
      coverage: coverage,
      issues: issues,
      critical: critical,
      warns: warns,
    };
  }

  function applyFixes(state, fixes) {
    fixes = fixes || [];
    fixes.forEach(function (fix) {
      if (!fix || !fix.type) return;
      if (fix.type === 'enable_client') {
        (fix.menus || []).forEach(function (m) {
          state.client[m] = true;
        });
      } else if (fix.type === 'disable_role') {
        (fix.menus || []).forEach(function (m) {
          if (!state.roles[fix.role]) state.roles[fix.role] = {};
          state.roles[fix.role][m] = false;
        });
      } else if (fix.type === 'enable_role') {
        (fix.menus || []).forEach(function (m) {
          if (!state.roles[fix.role]) state.roles[fix.role] = {};
          state.roles[fix.role][m] = true;
        });
      }
    });
    return state;
  }

  function applyStateToDom(state, root) {
    root = root || document.getElementById('gestion-perfiles');
    if (!root) return;
    Object.keys(state.client).forEach(function (mid) {
      var cb = root.querySelector('input[data-client-menu][data-menu="' + mid + '"]');
      if (cb) cb.checked = !!state.client[mid];
    });
    ROLES.forEach(function (role) {
      Object.keys(state.roles[role] || {}).forEach(function (mid) {
        var cb = root.querySelector('input[data-role="' + role + '"][data-menu="' + mid + '"]');
        if (cb) cb.checked = !!state.roles[role][mid];
      });
    });
  }

  function computeReadiness(analysis) {
    var covSum = 0;
    var covN = 0;
    ROLES.forEach(function (r) {
      if (analysis.coverage[r] && analysis.coverage[r].total > 0) {
        covSum += analysis.coverage[r].pct;
        covN++;
      }
    });
    var avgCov = covN ? covSum / covN : 100;
    return Math.min(
      100,
      Math.max(
        0,
        Math.round(analysis.chainScore * 0.42 + avgCov * 0.33 + Math.max(0, 100 - analysis.exposurePct) * 0.25)
      )
    );
  }

  function missionId() {
    try {
      var d = new Date();
      return (
        'OPS-' +
        d.toISOString().slice(0, 10).replace(/-/g, '') +
        '-' +
        String(d.getHours()).padStart(2, '0') +
        String(d.getMinutes()).padStart(2, '0')
      );
    } catch (_) {
      return 'OPS-VAULT';
    }
  }

  function getEnabledMenusForRole(state, role) {
    var out = [];
    allMenuIds().forEach(function (mid) {
      if (roleHas(state, role, mid) === true && clientAllows(state, mid)) out.push(mid);
    });
    if (!out.length && role === 'admin') {
      getCatalogGroups().forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (it && it.id && clientAllows(state, it.id) && out.indexOf(it.id) < 0) out.push(it.id);
        });
      });
    }
    return out.slice(0, 24);
  }

  function renderMissionHero(clientName, perfil) {
    var mid = missionId();
    var labBtn = '';
    return (
      '<header class="crozzo-vault-hero">' +
      '<div class="crozzo-vault-hero__grid-bg" aria-hidden="true"></div>' +
      '<div class="crozzo-vault-hero__scan" aria-hidden="true"></div>' +
      '<div class="crozzo-vault-hero__inner">' +
      '<div class="crozzo-vault-hero__seal" aria-hidden="true"><span>◆</span></div>' +
      '<div class="crozzo-vault-hero__copy">' +
      '<p class="crozzo-vault-hero__eyebrow">CANAL SEGURO · PLATAFORMA CROZZO</p>' +
      '<h2 class="crozzo-vault-hero__title">Política de acceso operativa</h2>' +
      '<p class="crozzo-vault-hero__lead">Despliegue de módulos, roles y permisos con validación en tiempo real. Lo que configure aquí es exactamente lo que verá cada usuario en producción.</p>' +
      '<div class="crozzo-vault-hero__meta">' +
      '<span><strong>Misión</strong> ' +
      esc(mid) +
      '</span>' +
      '<span><strong>Activo</strong> ' +
      esc(clientName || '—') +
      '</span>' +
      '<span><strong>Perfil</strong> ' +
      esc(perfil || '—') +
      '</span></div>' +
      labBtn +
      '</div>' +
      '<div class="crozzo-vault-hero__shield" aria-hidden="true">' +
      '<svg viewBox="0 0 120 120" class="crozzo-vault-radar"><circle cx="60" cy="60" r="54" class="crozzo-vault-radar__ring"/><circle cx="60" cy="60" r="38" class="crozzo-vault-radar__ring"/><circle cx="60" cy="60" r="22" class="crozzo-vault-radar__ring"/><line x1="60" y1="6" x2="60" y2="114" class="crozzo-vault-radar__axis"/><line x1="6" y1="60" x2="114" y2="60" class="crozzo-vault-radar__axis"/><g class="crozzo-vault-radar__sweep"><line x1="60" y1="60" x2="60" y2="8" class="crozzo-vault-radar__beam"/><circle cx="60" cy="60" r="3" class="crozzo-vault-radar__core"/></g></svg></div></div></header>'
    );
  }

  function renderRoleSimulator(state, activeRole) {
    activeRole = activeRole || 'caja';
    var roles = ['caja', 'mesero', 'cocina', 'inventario', 'admin'];
    var pills = roles
      .map(function (r) {
        return (
          '<button type="button" class="crozzo-vault-sim__pill' +
          (r === activeRole ? ' is-active' : '') +
          '" data-sim-role="' +
          r +
          '">' +
          esc(roleLabel(r)) +
          '</button>'
        );
      })
      .join('');
    var menus = getEnabledMenusForRole(state, activeRole);
    var chips =
      menus.length > 0
        ? menus
            .map(function (mid) {
              return '<span class="crozzo-vault-sim__chip">' + esc(menuLabel(mid)) + '</span>';
            })
            .join('')
        : '<p class="crozzo-vault-sim__empty">Sin módulos visibles para este rol con la configuración actual.</p>';
    return (
      '<section class="crozzo-vault-sim" id="crozzo-cmd-simulator">' +
      '<div class="crozzo-vault-sim__head"><div><h3 class="crozzo-vault-sim__title">Simulador de despliegue</h3>' +
      '<p class="crozzo-vault-sim__sub">Vista previa humana: qué menú verá cada rol al iniciar sesión (sin salir de aquí).</p></div>' +
      '<span class="crozzo-vault-sim__count">' +
      menus.length +
      ' módulo(s)</span></div>' +
      '<div class="crozzo-vault-sim__pills" role="tablist">' +
      pills +
      '</div>' +
      '<div class="crozzo-vault-sim__viewport" id="crozzo-cmd-sim-view">' +
      chips +
      '</div></section>'
    );
  }

  function renderHud(analysis) {
    analysis.readiness = computeReadiness(analysis);
    var st = analysis.status;
    var statusLbl =
      st === 'operational' ? 'OPERATIVO' : st === 'alert' ? 'ALERTA TÁCTICA' : 'BLOQUEO CRÍTICO';
    var statusCls = 'crozzo-cmd-hud__status--' + st;
    var readyCls = analysis.readiness >= 85 ? 'ok' : analysis.readiness >= 60 ? 'mid' : 'low';

    var chainHtml =
      '<div class="crozzo-cmd-chain">' +
      ['ventas', 'comprobantes', 'arqueo'].map(function (k, i) {
        var labels = ['Ventas', 'Comprobantes', 'Arqueo'];
        var on = analysis.chainSteps[k];
        return (
          '<div class="crozzo-cmd-chain__step' +
          (on ? ' is-on' : '') +
          '"><span class="crozzo-cmd-chain__dot"></span><span>' +
          labels[i] +
          '</span></div>' +
          (i < 2 ? '<div class="crozzo-cmd-chain__wire' + (on && analysis.chainSteps[['comprobantes', 'arqueo'][i]] ? ' is-on' : '') + '"></div>' : '')
        );
      }).join('') +
      '</div>';

    var covRows = ROLES.filter(function (r) {
      return analysis.coverage[r] && analysis.coverage[r].total > 0;
    })
      .map(function (r) {
        var c = analysis.coverage[r];
        var cls = c.pct >= 80 ? 'ok' : c.pct >= 50 ? 'mid' : 'low';
        return (
          '<div class="crozzo-cmd-cov__row"><span>' +
          esc(roleLabel(r)) +
          '</span><div class="crozzo-cmd-cov__bar"><div class="crozzo-cmd-cov__fill crozzo-cmd-cov__fill--' +
          cls +
          '" style="width:' +
          c.pct +
          '%"></div></div><strong>' +
          c.pct +
          '%</strong></div>'
        );
      })
      .join('');

    var issueList = analysis.issues.slice(0, 8).map(function (iss) {
      return (
        '<li class="crozzo-cmd-issue crozzo-cmd-issue--' +
        iss.severity +
        '"><span class="crozzo-cmd-issue__code">' +
        esc(iss.code) +
        '</span>' +
        esc(iss.message) +
        '</li>'
      );
    }).join('');

    return (
      '<div class="crozzo-cmd-hud crozzo-vault-hud" id="crozzo-cmd-hud" data-status="' +
      st +
      '">' +
      '<div class="crozzo-cmd-hud__head">' +
      '<div class="crozzo-cmd-hud__brand">' +
      '<span class="crozzo-cmd-hud__icon" aria-hidden="true">◆</span>' +
      '<div><strong class="crozzo-cmd-hud__title">Telemetría de despliegue</strong>' +
      '<p class="crozzo-cmd-hud__sub">Integridad · exposición · cobertura · diagnóstico en vivo</p></div></div>' +
      '<div class="crozzo-vault-hud__readiness crozzo-vault-hud__readiness--' +
      readyCls +
      '">' +
      '<svg viewBox="0 0 80 80" class="crozzo-vault-ready-ring" aria-hidden="true">' +
      '<circle cx="40" cy="40" r="34" class="crozzo-vault-ready-ring__track"/>' +
      '<circle cx="40" cy="40" r="34" class="crozzo-vault-ready-ring__prog" style="stroke-dashoffset:' +
      (213 - (213 * analysis.readiness) / 100) +
      '"/></svg>' +
      '<div class="crozzo-vault-ready-ring__lbl"><strong>' +
      analysis.readiness +
      '</strong><span>READY</span></div></div>' +
      '<div class="crozzo-cmd-hud__status ' +
      statusCls +
      '"><span class="crozzo-cmd-hud__led"></span>' +
      statusLbl +
      '</div></div>' +
      '<div class="crozzo-cmd-hud__grid crozzo-vault-hud__grid">' +
      '<div class="crozzo-cmd-hud__panel crozzo-vault-panel">' +
      '<span class="crozzo-cmd-hud__lbl">Cadena de custodia caja</span>' +
      '<strong class="crozzo-cmd-hud__val">' +
      analysis.chainScore +
      '<small>/100</small></strong>' +
      chainHtml +
      '<p class="crozzo-cmd-hud__hint">Ventas → comprobantes → arqueo. Sin eslabones rotos, menos carga cognitiva en cierre.</p></div>' +
      '<div class="crozzo-cmd-hud__panel crozzo-vault-panel">' +
      '<span class="crozzo-cmd-hud__lbl">Superficie de exposición</span>' +
      '<strong class="crozzo-cmd-hud__val crozzo-cmd-hud__val--' +
      (analysis.exposurePct > 55 ? 'warn' : 'ok') +
      '">' +
      analysis.exposurePct +
      '<small>%</small></strong>' +
      '<div class="crozzo-vault-exposure-bar"><div class="crozzo-vault-exposure-bar__fill" style="width:' +
      analysis.exposurePct +
      '%"></div></div>' +
      '<p class="crozzo-cmd-hud__hint">Menor = menos pantallas = menos error humano (principio de mínima exposición).</p></div>' +
      '<div class="crozzo-cmd-hud__panel crozzo-vault-panel crozzo-cmd-hud__panel--wide">' +
      '<span class="crozzo-cmd-hud__lbl">Cobertura por rol</span>' +
      '<div class="crozzo-cmd-cov">' +
      (covRows || '<p class="form-hint">Sin preset activo.</p>') +
      '</div></div></div>' +
      (analysis.issues.length
        ? '<div class="crozzo-cmd-hud__issues crozzo-vault-issues"><div class="crozzo-cmd-hud__issues-head">' +
          '<strong><i data-lucide="radar"></i> Diagnóstico · ' +
          analysis.issues.length +
          ' hallazgo(s)</strong>' +
          '<div class="crozzo-vault-issues__actions">' +
          (analysis.critical
            ? '<button type="button" class="btn btn-outline btn-sm" id="crozzo-cmd-auto-fix">Autocorrección táctica</button>'
            : '') +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzo-cmd-scroll-modulos">Ir a módulos</button></div></div>' +
          '<ul class="crozzo-cmd-issue-list">' +
          issueList +
          (analysis.issues.length > 8 ? '<li class="form-hint">+' + (analysis.issues.length - 8) + ' adicionales…</li>' : '') +
          '</ul></div>'
        : '<div class="crozzo-vault-clear"><span class="crozzo-vault-clear__icon">✓</span><div><strong>Configuración coherente</strong><p>Listo para despliegue. Cada rol verá exactamente lo configurado.</p></div></div>') +
      '</div>'
    );
  }

  function renderMatrixPreview(state) {
    var roles = ['caja', 'mesero', 'cocina', 'inventario', 'admin'];
    var cols = ['punto-venta', 'venta-comercial', 'facturas', 'cierre-caja', 'comandas', 'inventarios', 'facturas-admin'];
    var head =
      '<tr><th class="crozzo-cmd-matrix__corner">Rol \\ Módulo</th>' +
      cols
        .map(function (c) {
          return '<th class="crozzo-cmd-matrix__col" title="' + esc(menuLabel(c)) + '">' + esc(c.replace('punto-venta', 'POS').replace('venta-comercial', 'Tienda').replace('cierre-caja', 'Cierre').replace('facturas-admin', 'Impresión')) + '</th>';
        })
        .join('') +
      '</tr>';
    var body = roles
      .map(function (role) {
        return (
          '<tr><th class="crozzo-cmd-matrix__row">' +
          esc(roleLabel(role)) +
          '</th>' +
          cols
            .map(function (mid) {
              var on = roleHas(state, role, mid) === true && clientAllows(state, mid);
              var orphan = roleHas(state, role, mid) === true && state.client[mid] === false;
              var cls = orphan ? 'orphan' : on ? 'on' : 'off';
              return '<td class="crozzo-cmd-matrix__cell crozzo-cmd-matrix__cell--' + cls + '"></td>';
            })
            .join('') +
          '</tr>'
        );
      })
      .join('');
    return (
      '<details class="crozzo-cmd-matrix-wrap crozzo-vault-matrix" open><summary><i data-lucide="grid-3x3"></i> Matriz táctica rol × módulo</summary>' +
      '<div class="crozzo-rep-table-wrap"><table class="crozzo-cmd-matrix"><thead>' +
      head +
      '</thead><tbody>' +
      body +
      '</tbody></table></div>' +
      '<p class="form-hint">■ verde = activo y coherente · ■ ámbar = rol marcado pero módulo desactivado en negocio · vacío = sin acceso</p></details>'
    );
  }

  function refreshHud(root, perfil) {
    root = root || document.getElementById('gestion-perfiles');
    if (!root) return null;
    var state = collectStateFromDom(root);
    var analysis = analyze(state, { perfil: perfil });
    var hud = root.querySelector('#crozzo-cmd-hud');
    if (hud) {
      var wrap = document.createElement('div');
      wrap.innerHTML = renderHud(analysis);
      var newHud = wrap.firstElementChild;
      if (newHud) hud.replaceWith(newHud);
    }
    var matrix = root.querySelector('#crozzo-cmd-matrix-host');
    if (matrix) matrix.innerHTML = renderMatrixPreview(state);
    var sim = root.querySelector('#crozzo-cmd-simulator');
    if (sim) {
      var activeRole =
        (sim.querySelector('.crozzo-vault-sim__pill.is-active') &&
          sim.querySelector('.crozzo-vault-sim__pill.is-active').getAttribute('data-sim-role')) ||
        'caja';
      var simWrap = document.createElement('div');
      simWrap.innerHTML = renderRoleSimulator(state, activeRole);
      var newSim = simWrap.firstElementChild;
      if (newSim) sim.replaceWith(newSim);
    }
    markCatalogItems(root, analysis);
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [root] });
    } catch (_) {}
    return analysis;
  }

  function markCatalogItems(root, analysis) {
    var orphanMenus = {};
    analysis.issues.forEach(function (iss) {
      if (iss.code === 'ORPHAN_ROLE_MENU' && iss.fix && iss.fix.menus) {
        iss.fix.menus.forEach(function (m) {
          orphanMenus[m] = true;
        });
      }
    });
    root.querySelectorAll('.crozzo-menu-catalog-item').forEach(function (lbl) {
      lbl.classList.remove('crozzo-menu-catalog-item--risk', 'crozzo-menu-catalog-item--chain');
      var cb = lbl.querySelector('input[data-menu]');
      if (!cb) return;
      var mid = cb.getAttribute('data-menu');
      if (CAJA_CHAIN.indexOf(mid) >= 0) lbl.classList.add('crozzo-menu-catalog-item--chain');
      if (orphanMenus[mid]) lbl.classList.add('crozzo-menu-catalog-item--risk');
    });
  }

  function bind(root, getPerfil) {
    root = root || document.getElementById('gestion-perfiles');
    if (!root || root._crozzoCmdBound) return;
    root._crozzoCmdBound = true;

    function tick() {
      var p = typeof getPerfil === 'function' ? getPerfil() : 'basico_restaurante';
      refreshHud(root, p);
    }

    root.addEventListener('change', function (e) {
      if (!e.target || !e.target.matches('input[data-menu]')) return;
      var mid = e.target.getAttribute('data-menu');
      if (e.target.hasAttribute('data-client-menu') && !e.target.checked) {
        root.querySelectorAll('input[data-role][data-menu="' + mid + '"]').forEach(function (cb) {
          cb.checked = false;
        });
        if (mid === 'cierre-caja' || VENTAS_SOURCE.indexOf(mid) >= 0 || COMPROBANTES.indexOf(mid) >= 0) {
          var cierreClient = root.querySelector('input[data-client-menu][data-menu="cierre-caja"]');
          if (cierreClient && cierreClient.checked && (VENTAS_SOURCE.indexOf(mid) >= 0 || COMPROBANTES.indexOf(mid) >= 0)) {
            cierreClient.checked = false;
            root.querySelectorAll('input[data-role][data-menu="cierre-caja"]').forEach(function (cb) {
              cb.checked = false;
            });
            if (typeof global.showToast === 'function') {
              global.showToast('Cadena rota: cierre desactivado al quitar ventas o comprobantes', 'info');
            }
          }
        }
      }
      clearTimeout(root._crozzoCmdDebounce);
      root._crozzoCmdDebounce = setTimeout(tick, 120);
    });

    root.addEventListener('click', function (e) {
      var pill = e.target && e.target.closest && e.target.closest('[data-sim-role]');
      if (pill) {
        e.preventDefault();
        root.querySelectorAll('[data-sim-role]').forEach(function (p) {
          p.classList.toggle('is-active', p === pill);
        });
        var role = pill.getAttribute('data-sim-role');
        var st = collectStateFromDom(root);
        var view = document.getElementById('crozzo-cmd-sim-view');
        if (view) {
          var menus = getEnabledMenusForRole(st, role);
          view.innerHTML =
            menus.length > 0
              ? menus
                  .map(function (mid) {
                    return '<span class="crozzo-vault-sim__chip">' + esc(menuLabel(mid)) + '</span>';
                  })
                  .join('')
              : '<p class="crozzo-vault-sim__empty">Sin módulos para este rol.</p>';
        }
        var cnt = root.querySelector('.crozzo-vault-sim__count');
        if (cnt) cnt.textContent = menus.length + ' módulo(s)';
        return;
      }
      if (e.target && e.target.id === 'crozzo-cmd-scroll-modulos') {
        e.preventDefault();
        var tab = root.querySelector('[data-gestion-tab="modulos"]');
        if (tab && typeof tab.click === 'function') tab.click();
        var card = document.getElementById('crozzo-cliente-menus-card');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (e.target && e.target.id === 'crozzo-cmd-auto-fix') {
        e.preventDefault();
        var state = collectStateFromDom(root);
        var analysis = analyze(state, { perfil: typeof getPerfil === 'function' ? getPerfil() : '' });
        var fixes = analysis.issues
          .filter(function (i) {
            return i.fix && (i.severity === 'critical' || i.severity === 'warn');
          })
          .map(function (i) {
            return i.fix;
          });
        applyFixes(state, fixes);
        applyStateToDom(state, root);
        tick();
        if (typeof global.showToast === 'function') {
          global.showToast('Correcciones tácticas aplicadas — revise y guarde', 'success');
        }
      }
    });

    tick();
  }

  function validateBeforeSave(client, root, perfil) {
    root = root || document.getElementById('gestion-perfiles');
    var state = collectStateFromDom(root);
    var analysis = analyze(state, { perfil: perfil });
    if (analysis.critical > 0) {
      return {
        ok: false,
        analysis: analysis,
        message:
          analysis.critical +
          ' inconsistencia(s) crítica(s). Use «Corregir automáticamente» o ajuste manualmente antes de desplegar.',
      };
    }
    return { ok: true, analysis: analysis, state: state };
  }

  function applySavePipeline(client, root, perfil) {
    var v = validateBeforeSave(client, root, perfil);
    if (!v.ok) return v;
    return { ok: true, analysis: v.analysis, state: v.state };
  }

  /** Puerta PIN supremo (Ctrl+Shift+R → Laboratorio). */
  function renderLabVaultGate(opts) {
    opts = opts || {};
    var title = opts.stealth ? 'Acceso vault · sesión interna' : 'Acceso vault · laboratorio';
    return (
      '<div class="crozzo-vault-gate" role="dialog" aria-modal="true" aria-labelledby="crozzo-vault-gate-title">' +
      '<div class="crozzo-vault-gate__grid" aria-hidden="true"></div>' +
      '<div class="crozzo-vault-gate__scan" aria-hidden="true"></div>' +
      '<button type="button" class="crozzo-vault-gate__close" onclick="crozzoLabCloseGate()" aria-label="Cerrar"><i data-lucide="x"></i></button>' +
      '<div class="crozzo-vault-gate__seal" aria-hidden="true"><span>◆</span></div>' +
      '<p class="crozzo-vault-gate__channel">CANAL CIFRADO · ADMINISTRADORES AUTORIZADOS</p>' +
      '<h3 class="crozzo-vault-gate__title" id="crozzo-vault-gate-title">' +
      esc(title) +
      '</h3>' +
      '<p class="crozzo-vault-gate__hint">Ingrese PIN de 4 dígitos. Protección local en este equipo.</p>' +
      '<div class="crozzo-vault-pin-dots" id="crozzo-vault-pin-dots" aria-hidden="true">' +
      '<span></span><span></span><span></span><span></span></div>' +
      '<input type="password" id="crozzo-lab-gate-pin" class="crozzo-vault-pin-input" maxlength="4" inputmode="numeric" autocomplete="off" placeholder="••••" aria-label="PIN de acceso">' +
      '<div class="crozzo-vault-keypad" id="crozzo-vault-keypad" role="group" aria-label="Teclado numérico">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓']
        .map(function (k) {
          var cls = 'crozzo-vault-keypad__key';
          if (k === '⌫') cls += ' crozzo-vault-keypad__key--del';
          if (k === '✓') cls += ' crozzo-vault-keypad__key--go';
          return (
            '<button type="button" class="' +
            cls +
            '" data-vault-key="' +
            k +
            '">' +
            k +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<button type="button" class="btn btn-primary crozzo-vault-gate__submit" onclick="crozzoLabGateSubmit()"><i data-lucide="shield-check"></i> Autorizar acceso</button>' +
      '<p class="crozzo-vault-gate__foot">Atajo <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> · PIN fábrica disponible para soporte</p></div>'
    );
  }

  function bindVaultPinInput(overlay) {
    if (!overlay) return;
    var inp = overlay.querySelector('#crozzo-lab-gate-pin');
    var dots = overlay.querySelectorAll('#crozzo-vault-pin-dots span');
    if (!inp || !dots.length) return;
    function syncDots() {
      var v = String(inp.value || '').replace(/\D/g, '').slice(0, 4);
      dots.forEach(function (d, i) {
        d.classList.toggle('is-filled', i < v.length);
      });
    }
    inp.addEventListener('input', syncDots);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (typeof global.crozzoLabGateSubmit === 'function') global.crozzoLabGateSubmit();
      }
    });
    syncDots();
    var keypad = overlay.querySelector('#crozzo-vault-keypad');
    if (keypad) {
      keypad.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-vault-key]');
        if (!btn) return;
        var key = btn.getAttribute('data-vault-key');
        var v = String(inp.value || '').replace(/\D/g, '');
        if (key === '⌫') {
          inp.value = v.slice(0, -1);
        } else if (key === '✓') {
          if (typeof global.crozzoLabGateSubmit === 'function') global.crozzoLabGateSubmit();
          return;
        } else {
          if (v.length >= 4) return;
          inp.value = v + key;
        }
        syncDots();
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    setTimeout(function () {
      inp.focus();
    }, 80);
  }

  function openLabVaultGate(opts) {
    injectStyles();
    var html = renderLabVaultGate(opts || {});
    var ov = document.getElementById('crozzo-lab-pin-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'crozzo-lab-pin-overlay';
      ov.className = 'crozzo-lab-pin-overlay crozzo-vault-pin-overlay';
      document.body.appendChild(ov);
    }
    ov.className = 'crozzo-lab-pin-overlay crozzo-vault-pin-overlay';
    ov.innerHTML = html;
    ov.hidden = false;
    ov.removeAttribute('hidden');
    bindVaultPinInput(ov);
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [ov] });
    } catch (_) {}
  }

  function showDeployRitual(analysis, onConfirm) {
    injectStyles();
    var existing = document.getElementById('crozzo-vault-deploy-overlay');
    if (existing) existing.remove();
    var ready = analysis.readiness != null ? analysis.readiness : computeReadiness(analysis);
    var ov = document.createElement('div');
    ov.id = 'crozzo-vault-deploy-overlay';
    ov.className = 'crozzo-vault-deploy-overlay';
    ov.innerHTML =
      '<div class="crozzo-vault-deploy" role="dialog" aria-modal="true">' +
      '<div class="crozzo-vault-deploy__glow" aria-hidden="true"></div>' +
      '<p class="crozzo-vault-deploy__eyebrow">CONFIRMAR DESPLIEGUE</p>' +
      '<h3>Autorizar cambios en producción</h3>' +
      '<p class="crozzo-vault-deploy__lead">Esta acción actualiza menús, roles y permisos para todos los usuarios de este negocio en este equipo.</p>' +
      '<div class="crozzo-vault-deploy__stats">' +
      '<div><span>Readiness</span><strong>' +
      ready +
      '%</strong></div>' +
      '<div><span>Cadena caja</span><strong>' +
      analysis.chainScore +
      '/100</strong></div>' +
      '<div><span>Exposición</span><strong>' +
      analysis.exposurePct +
      '%</strong></div>' +
      '<div><span>Alertas</span><strong>' +
      analysis.issues.length +
      '</strong></div></div>' +
      '<div class="crozzo-vault-deploy__actions">' +
      '<button type="button" class="btn btn-outline" id="crozzo-vault-deploy-cancel">Abortar</button>' +
      '<button type="button" class="btn btn-primary crozzo-vault-deploy__go" id="crozzo-vault-deploy-go"><i data-lucide="rocket"></i> Desplegar ahora</button></div></div>';
    document.body.appendChild(ov);
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [ov] });
    } catch (_) {}
    ov.querySelector('#crozzo-vault-deploy-cancel').addEventListener('click', function () {
      ov.remove();
    });
    ov.querySelector('#crozzo-vault-deploy-go').addEventListener('click', function () {
      ov.remove();
      if (typeof onConfirm === 'function') onConfirm();
    });
    ov.addEventListener('click', function (e) {
      if (e.target === ov) ov.remove();
    });
  }

  function armDeployButton(btn, getPerfil, runSave) {
    if (!btn || btn._crozzoVaultArmed) return;
    btn._crozzoVaultArmed = true;
    btn.classList.add('crozzo-vault-deploy-btn');
    var handler = function (e) {
      var root = document.getElementById('gestion-perfiles');
      var perfil = typeof getPerfil === 'function' ? getPerfil() : 'basico_restaurante';
      var state = collectStateFromDom(root);
      var analysis = analyze(state, { perfil: perfil });
      if (analysis.critical > 0) {
        if (typeof global.showToast === 'function') {
          global.showToast(
            analysis.critical + ' bloqueo(s) crítico(s). Corrija antes de desplegar.',
            'warning'
          );
        }
        refreshHud(root, perfil);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      showDeployRitual(analysis, function () {
        if (typeof runSave === 'function') runSave();
      });
    };
    btn.addEventListener('click', handler, true);
  }

  function activateVaultShell(root) {
    injectStyles();
    if (document.body) document.body.classList.add('crozzo-vault-shell-active');
    if (root) root.classList.add('crozzo-vault-shell');
  }

  function deactivateVaultShell() {
    if (document.body) document.body.classList.remove('crozzo-vault-shell-active', 'crozzo-vault-deploy-flash');
    var root = document.getElementById('gestion-perfiles');
    if (root) root.classList.remove('crozzo-vault-shell');
  }

  function flashDeploySuccess() {
    if (!document.body) return;
    document.body.classList.add('crozzo-vault-deploy-flash');
    setTimeout(function () {
      if (document.body) document.body.classList.remove('crozzo-vault-deploy-flash');
    }, 1200);
  }

  function injectStyles() {
    var st = document.getElementById('crozzo-cmd-styles');
    if (!st) {
      st = document.createElement('style');
      st.id = 'crozzo-cmd-styles';
      document.head.appendChild(st);
    }
    st.textContent = getVaultCss();
  }

  function getVaultCss() {
    return (
      '.crozzo-vault-shell-active .main-content{background:linear-gradient(180deg,rgba(12,14,10,.4),transparent 120px)}' +
      '.crozzo-vault-shell{position:relative}' +
      '.crozzo-vault-hero{position:relative;border:1px solid rgba(201,169,98,.4);border-radius:16px;padding:20px 22px;margin-bottom:14px;overflow:hidden;background:linear-gradient(135deg,rgba(22,26,18,.98),rgba(34,30,24,.94))}' +
      '.crozzo-vault-hero__grid-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(201,169,98,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(201,169,98,.06) 1px,transparent 1px);background-size:24px 24px;opacity:.5}' +
      '.crozzo-vault-hero__scan{position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(201,169,98,.08),transparent);animation:crozzoVaultScan 4s ease-in-out infinite;pointer-events:none}' +
      '@keyframes crozzoVaultScan{0%,100%{transform:translateY(-100%)}50%{transform:translateY(100%)}}' +
      '.crozzo-vault-hero__inner{position:relative;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;z-index:1}' +
      '.crozzo-vault-hero__seal{width:44px;height:44px;border-radius:12px;border:1px solid rgba(201,169,98,.5);display:flex;align-items:center;justify-content:center;color:var(--accent,#c9a962);font-size:1.2rem;background:rgba(0,0,0,.25)}' +
      '.crozzo-vault-hero__eyebrow{margin:0 0 6px;font-size:.68rem;letter-spacing:.14em;color:rgba(201,169,98,.85)}' +
      '.crozzo-vault-hero__title{margin:0 0 8px;font-size:1.35rem;letter-spacing:.02em}' +
      '.crozzo-vault-hero__lead{margin:0;font-size:.84rem;color:var(--text-secondary);max-width:560px;line-height:1.5}' +
      '.crozzo-vault-hero__meta{display:flex;flex-wrap:wrap;gap:12px 18px;margin-top:12px;font-size:.72rem;color:var(--text-secondary)}' +
      '.crozzo-vault-hero__meta strong{color:var(--text-primary);margin-right:4px;font-weight:600}' +
      '.crozzo-vault-radar{width:100px;height:100px;opacity:.85}.crozzo-vault-radar__ring{fill:none;stroke:rgba(201,169,98,.25);stroke-width:1}' +
      '.crozzo-vault-radar__axis{stroke:rgba(201,169,98,.15);stroke-width:1}.crozzo-vault-radar__core{fill:var(--accent,#c9a962)}' +
      '.crozzo-vault-radar__beam{stroke:var(--accent,#c9a962);stroke-width:2;stroke-linecap:round;opacity:.75}' +
      '.crozzo-vault-radar__sweep{transform-origin:60px 60px;animation:crozzoVaultRadar 4s linear infinite}' +
      '@keyframes crozzoVaultRadar{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
      '.crozzo-vault-hero__lab{margin-top:14px;border-color:rgba(201,169,98,.35)!important;color:var(--accent,#c9a962)!important}' +
      '.crozzo-vault-shell-active .crozzo-gestion-wizard-tabs{border:1px solid rgba(201,169,98,.25);border-radius:12px;padding:6px;background:rgba(0,0,0,.2);margin:14px 0;gap:4px}' +
      '.crozzo-vault-shell-active .crozzo-gestion-wizard-tab{border-radius:8px;font-size:.78rem;letter-spacing:.02em;border:1px solid transparent;background:transparent}' +
      '.crozzo-vault-shell-active .crozzo-gestion-wizard-tab--active{background:rgba(201,169,98,.18)!important;border-color:rgba(201,169,98,.45)!important;color:var(--accent,#c9a962)!important;box-shadow:0 0 12px rgba(201,169,98,.15)}' +
      '.crozzo-vault-shell-active .crozzo-gestion-page__card{border-color:rgba(201,169,98,.12)!important}' +
      '.crozzo-vault-shell-active .crozzo-gestion-page__card-title{letter-spacing:.04em;font-size:.9rem;text-transform:uppercase}' +
      'body.crozzo-vault-deploy-flash .main-content{animation:crozzoVaultFlash .9s ease}' +
      '@keyframes crozzoVaultFlash{0%,100%{box-shadow:none}40%{box-shadow:inset 0 0 0 2px rgba(107,203,138,.45),inset 0 0 40px rgba(107,203,138,.08)}}' +
      '.crozzo-vault-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:240px;margin:0 auto 14px;position:relative;z-index:1}' +
      '.crozzo-vault-keypad__key{min-height:44px;border-radius:10px;border:1px solid rgba(201,169,98,.25);background:rgba(0,0,0,.35);color:inherit;font-size:1.05rem;font-variant-numeric:tabular-nums;cursor:pointer;transition:all .12s}' +
      '.crozzo-vault-keypad__key:active,.crozzo-vault-keypad__key:hover{background:rgba(201,169,98,.15);border-color:rgba(201,169,98,.5)}' +
      '.crozzo-vault-keypad__key--del{font-size:.9rem;opacity:.85}.crozzo-vault-keypad__key--go{color:var(--accent,#c9a962);font-weight:700}' +
      '.crozzo-vault-hud{border:1px solid rgba(201,169,98,.35);border-radius:14px;padding:18px;background:linear-gradient(145deg,rgba(16,20,14,.97),rgba(28,32,24,.92));box-shadow:0 12px 40px rgba(0,0,0,.28);margin-bottom:14px}' +
      '.crozzo-vault-hud__grid{margin-top:4px}' +
      '.crozzo-vault-panel{border-color:rgba(201,169,98,.12)!important}' +
      '.crozzo-vault-hud__readiness{position:relative;width:72px;height:72px;flex-shrink:0}' +
      '.crozzo-vault-ready-ring{width:100%;height:100%;transform:rotate(-90deg)}' +
      '.crozzo-vault-ready-ring__track{fill:none;stroke:rgba(255,255,255,.08);stroke-width:6}' +
      '.crozzo-vault-ready-ring__prog{fill:none;stroke:var(--accent,#c9a962);stroke-width:6;stroke-linecap:round;stroke-dasharray:213;transition:stroke-dashoffset .5s ease}' +
      '.crozzo-vault-hud__readiness--ok .crozzo-vault-ready-ring__prog{stroke:#6bcb8a}' +
      '.crozzo-vault-hud__readiness--mid .crozzo-vault-ready-ring__prog{stroke:#e8c547}' +
      '.crozzo-vault-hud__readiness--low .crozzo-vault-ready-ring__prog{stroke:#e57373}' +
      '.crozzo-vault-ready-ring__lbl{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:.62rem;line-height:1.1}' +
      '.crozzo-vault-ready-ring__lbl strong{font-size:1.1rem;font-variant-numeric:tabular-nums}' +
      '.crozzo-vault-exposure-bar{height:6px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:8px;overflow:hidden}' +
      '.crozzo-vault-exposure-bar__fill{height:100%;background:linear-gradient(90deg,#6bcb8a,#e8c547,#e57373);border-radius:3px;transition:width .4s ease}' +
      '.crozzo-vault-clear{display:flex;gap:12px;align-items:flex-start;margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(107,203,138,.1);border:1px solid rgba(107,203,138,.25)}' +
      '.crozzo-vault-clear__icon{font-size:1.2rem;color:#6bcb8a}.crozzo-vault-clear p{margin:4px 0 0;font-size:.78rem;color:var(--text-secondary)}' +
      '.crozzo-vault-sim{border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;margin-bottom:14px;background:rgba(0,0,0,.15)}' +
      '.crozzo-vault-sim__head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-bottom:12px}' +
      '.crozzo-vault-sim__title{margin:0;font-size:.95rem}.crozzo-vault-sim__sub{margin:4px 0 0;font-size:.75rem;color:var(--text-secondary)}' +
      '.crozzo-vault-sim__count{font-size:.72rem;padding:4px 10px;border-radius:999px;background:rgba(201,169,98,.12);color:var(--accent,#c9a962);align-self:flex-start}' +
      '.crozzo-vault-sim__pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
      '.crozzo-vault-sim__pill{border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;font-size:.75rem;cursor:pointer;transition:all .15s}' +
      '.crozzo-vault-sim__pill.is-active{background:rgba(201,169,98,.2);border-color:rgba(201,169,98,.5);color:var(--accent,#c9a962)}' +
      '.crozzo-vault-sim__viewport{display:flex;flex-wrap:wrap;gap:6px;min-height:48px;padding:10px;border-radius:10px;background:rgba(0,0,0,.2)}' +
      '.crozzo-vault-sim__chip{font-size:.72rem;padding:5px 10px;border-radius:8px;background:rgba(201,169,98,.12);border:1px solid rgba(201,169,98,.2)}' +
      '.crozzo-vault-sim__empty{margin:0;font-size:.78rem;color:var(--text-secondary)}' +
      '.crozzo-vault-matrix summary{cursor:pointer;font-weight:600;font-size:.82rem;padding:8px 0}' +
      '.crozzo-vault-deploy-btn{position:relative;overflow:hidden;box-shadow:0 0 20px rgba(201,169,98,.25)!important}' +
      '.crozzo-vault-pin-overlay{background:rgba(4,6,8,.88)!important;backdrop-filter:blur(8px)}' +
      '.crozzo-vault-gate{position:relative;width:min(380px,92vw);padding:28px 24px 22px;border-radius:18px;border:1px solid rgba(201,169,98,.45);background:linear-gradient(160deg,rgba(18,22,16,.98),rgba(32,28,22,.96));text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.5);overflow:hidden}' +
      '.crozzo-vault-gate__grid{position:absolute;inset:0;background-image:linear-gradient(rgba(201,169,98,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(201,169,98,.05) 1px,transparent 1px);background-size:20px 20px;pointer-events:none}' +
      '.crozzo-vault-gate__scan{position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(201,169,98,.1),transparent);animation:crozzoVaultScan 3s ease-in-out infinite;pointer-events:none}' +
      '.crozzo-vault-gate__close{position:absolute;top:10px;right:10px;border:none;background:transparent;color:inherit;cursor:pointer;opacity:.7;z-index:2}' +
      '.crozzo-vault-gate__seal{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;border:2px solid rgba(201,169,98,.5);display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:var(--accent,#c9a962);position:relative;z-index:1}' +
      '.crozzo-vault-gate__channel{margin:0 0 6px;font-size:.62rem;letter-spacing:.16em;color:rgba(201,169,98,.8);position:relative;z-index:1}' +
      '.crozzo-vault-gate__title{margin:0 0 8px;font-size:1.15rem;position:relative;z-index:1}' +
      '.crozzo-vault-gate__hint{margin:0 0 14px;font-size:.78rem;color:var(--text-secondary);position:relative;z-index:1}' +
      '.crozzo-vault-pin-dots{display:flex;justify-content:center;gap:12px;margin-bottom:10px;position:relative;z-index:1}' +
      '.crozzo-vault-pin-dots span{width:14px;height:14px;border-radius:50%;border:2px solid rgba(201,169,98,.45);transition:all .15s}' +
      '.crozzo-vault-pin-dots span.is-filled{background:var(--accent,#c9a962);box-shadow:0 0 10px rgba(201,169,98,.5)}' +
      '.crozzo-vault-pin-input{width:100%;max-width:200px;margin:0 auto 14px;text-align:center;font-size:1.5rem;letter-spacing:.35em;padding:10px;border-radius:12px;border:1px solid rgba(201,169,98,.35);background:rgba(0,0,0,.3);position:relative;z-index:1}' +
      '.crozzo-vault-gate__submit{width:100%;position:relative;z-index:1}' +
      '.crozzo-vault-gate__foot{margin:12px 0 0;font-size:.68rem;color:var(--text-secondary);position:relative;z-index:1}' +
      '.crozzo-vault-gate__foot kbd{padding:2px 5px;border-radius:4px;background:rgba(255,255,255,.08);font-size:.65rem}' +
      '.crozzo-vault-deploy-overlay{position:fixed;inset:0;z-index:13000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}' +
      '.crozzo-vault-deploy{position:relative;width:min(440px,100%);padding:24px;border-radius:16px;border:1px solid rgba(201,169,98,.4);background:linear-gradient(145deg,rgba(20,24,18,.98),rgba(30,26,20,.95));text-align:center}' +
      '.crozzo-vault-deploy__glow{position:absolute;inset:-1px;border-radius:16px;background:radial-gradient(circle at 50% 0,rgba(201,169,98,.15),transparent 60%);pointer-events:none}' +
      '.crozzo-vault-deploy__eyebrow{margin:0 0 8px;font-size:.68rem;letter-spacing:.14em;color:rgba(201,169,98,.85)}' +
      '.crozzo-vault-deploy__lead{font-size:.82rem;color:var(--text-secondary);margin:0 0 16px;line-height:1.45}' +
      '.crozzo-vault-deploy__stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}' +
      '.crozzo-vault-deploy__stats div{padding:8px;border-radius:8px;background:rgba(0,0,0,.2);font-size:.68rem}' +
      '.crozzo-vault-deploy__stats strong{display:block;font-size:1rem;margin-top:4px;font-variant-numeric:tabular-nums}' +
      '.crozzo-vault-deploy__actions{display:flex;gap:10px;justify-content:center}.crozzo-vault-deploy__go{min-width:160px}' +
      '.crozzo-cmd-hud__head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}' +
      '.crozzo-cmd-hud__brand{display:flex;gap:12px;align-items:flex-start;flex:1;min-width:200px}' +
      '.crozzo-cmd-hud__icon{font-size:1.4rem;color:var(--accent,#c9a962);line-height:1}' +
      '.crozzo-cmd-hud__title{display:block;font-size:1.05rem;letter-spacing:.03em}' +
      '.crozzo-cmd-hud__sub{margin:4px 0 0;font-size:.78rem;color:var(--text-secondary);max-width:520px}' +
      '.crozzo-cmd-hud__status{display:flex;align-items:center;gap:8px;font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12)}' +
      '.crozzo-cmd-hud__led{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor;animation:crozzoVaultPulse 2s ease infinite}' +
      '@keyframes crozzoVaultPulse{0%,100%{opacity:1}50%{opacity:.45}}' +
      '.crozzo-cmd-hud__status--operational{color:#6bcb8a;border-color:rgba(107,203,138,.4);background:rgba(107,203,138,.08)}' +
      '.crozzo-cmd-hud__status--alert{color:#e8c547;border-color:rgba(232,197,71,.4);background:rgba(232,197,71,.08)}' +
      '.crozzo-cmd-hud__status--critical{color:#e57373;border-color:rgba(229,115,115,.45);background:rgba(229,115,115,.1)}' +
      '.crozzo-cmd-hud__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}' +
      '.crozzo-cmd-hud__panel{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px 14px}' +
      '.crozzo-cmd-hud__panel--wide{grid-column:1/-1}' +
      '.crozzo-cmd-hud__lbl{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-secondary);margin-bottom:6px}' +
      '.crozzo-cmd-hud__val{font-size:1.75rem;font-variant-numeric:tabular-nums;line-height:1.1}' +
      '.crozzo-cmd-hud__val small{font-size:.45em;opacity:.65;font-weight:500}' +
      '.crozzo-cmd-hud__val--warn{color:#e8c547}.crozzo-cmd-hud__val--ok{color:#6bcb8a}' +
      '.crozzo-cmd-hud__hint{margin:8px 0 0;font-size:.72rem;color:var(--text-secondary);line-height:1.4}' +
      '.crozzo-cmd-chain{display:flex;align-items:center;gap:4px;margin-top:10px;flex-wrap:wrap}' +
      '.crozzo-cmd-chain__step{display:flex;align-items:center;gap:4px;font-size:.72rem;opacity:.45}' +
      '.crozzo-cmd-chain__step.is-on{opacity:1;color:var(--accent,#c9a962)}' +
      '.crozzo-cmd-chain__dot{width:6px;height:6px;border-radius:50%;background:currentColor}' +
      '.crozzo-cmd-chain__wire{width:16px;height:2px;background:rgba(255,255,255,.15)}.crozzo-cmd-chain__wire.is-on{background:var(--accent,#c9a962)}' +
      '.crozzo-cmd-cov{display:flex;flex-direction:column;gap:6px;margin-top:4px}' +
      '.crozzo-cmd-cov__row{display:grid;grid-template-columns:100px 1fr 42px;gap:8px;align-items:center;font-size:.78rem}' +
      '.crozzo-cmd-cov__bar{height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}' +
      '.crozzo-cmd-cov__fill{height:100%;border-radius:3px}.crozzo-cmd-cov__fill--ok{background:#6bcb8a}.crozzo-cmd-cov__fill--mid{background:#e8c547}.crozzo-cmd-cov__fill--low{background:#e57373}' +
      '.crozzo-cmd-hud__issues{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}' +
      '.crozzo-vault-issues__actions{display:flex;flex-wrap:wrap;gap:6px}' +
      '.crozzo-cmd-issue-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}' +
      '.crozzo-cmd-issue{font-size:.78rem;line-height:1.4;padding:8px 10px;border-radius:8px;border-left:3px solid transparent;background:rgba(0,0,0,.15)}' +
      '.crozzo-cmd-issue--critical{border-left-color:#e57373}.crozzo-cmd-issue--warn{border-left-color:#e8c547}.crozzo-cmd-issue--info{border-left-color:#7eb8da}' +
      '.crozzo-cmd-issue__code{display:inline-block;font-family:ui-monospace,monospace;font-size:.65rem;opacity:.75;margin-right:6px}' +
      '.crozzo-cmd-matrix{font-size:.72rem;width:100%}' +
      '.crozzo-cmd-matrix__cell{width:28px;height:22px;text-align:center;padding:0}' +
      '.crozzo-cmd-matrix__cell--on{background:rgba(107,203,138,.35)}.crozzo-cmd-matrix__cell--orphan{background:rgba(232,197,71,.45)}.crozzo-cmd-matrix__cell--off{background:rgba(255,255,255,.03)}' +
      '.crozzo-menu-catalog-item--chain{border-left:2px solid rgba(201,169,98,.45)}' +
      '.crozzo-menu-catalog-item--risk{background:rgba(229,115,115,.08);outline:1px dashed rgba(229,115,115,.35)}' +
      '.ccp.bona .crozzo-vault-hud,.ccp.bona .crozzo-vault-hero{border-color:rgba(201,169,98,.45)}'
    );
  }

  global.CrozzoGestionCommandCenter = {
    analyze: analyze,
    collectStateFromDom: collectStateFromDom,
    computeReadiness: computeReadiness,
    renderHud: renderHud,
    renderMissionHero: renderMissionHero,
    renderRoleSimulator: renderRoleSimulator,
    renderMatrixPreview: renderMatrixPreview,
    renderLabVaultGate: renderLabVaultGate,
    openLabVaultGate: openLabVaultGate,
    refreshHud: refreshHud,
    bind: bind,
    armDeployButton: armDeployButton,
    activateVaultShell: activateVaultShell,
    deactivateVaultShell: deactivateVaultShell,
    flashDeploySuccess: flashDeploySuccess,
    showDeployRitual: showDeployRitual,
    validateBeforeSave: validateBeforeSave,
    applySavePipeline: applySavePipeline,
    applyFixes: applyFixes,
    injectStyles: injectStyles,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})(typeof window !== 'undefined' ? window : globalThis);
