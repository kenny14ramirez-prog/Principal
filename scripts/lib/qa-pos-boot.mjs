/**
 * Arranque común Playwright — servidor estático src/ + init demo restaurante.
 */
import { createFieldPosHttpServer } from './field-pos-http-server.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONAL_SUPERVISOR } from './qa-human-matrix.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const SRC_ROOT = join(root, 'src');

export function qaDemoInitScript() {
  return () => {
    localStorage.setItem('crozzo_perfil_empresa', 'basico_restaurante');
    localStorage.setItem('crozzo_device_paired_v1', '1');
    localStorage.setItem('crozzo_theme_user_v1', '1');
    localStorage.setItem('crozzo_theme', 'bona-origen');
    localStorage.removeItem('crozzo_shift_turn_history_v1');
    localStorage.removeItem('crozzo_day_session_v2');
    localStorage.removeItem('crozzo_shift_turn_v1');
    localStorage.removeItem('crozzo_operative_journal_v1');
    const staff = [
      { id: 'CAJNOV', nombre: 'Ana Cajero', rol: 'caja', activo: true, clave: 'qa123456' },
      { id: 'CAJEXP', nombre: 'Luis Cajero', rol: 'caja', activo: true, clave: 'qa123456' },
      { id: 'MESNOV', nombre: 'Sofía Mesera', rol: 'mesero', activo: true, clave: 'qa123456' },
      { id: 'MESEXP', nombre: 'Carlos Mesero', rol: 'mesero', activo: true, clave: 'qa123456' },
      { id: 'COCINA1', nombre: 'María Cocina', rol: 'cocina', activo: true, clave: 'qa123456' },
      { id: 'ENC1', nombre: 'Patricia Encargada', rol: 'encargado', activo: true, clave: 'qa123456' },
      { id: 'GF1', nombre: 'Jorge Compras', rol: 'inventario', activo: true, clave: 'qa123456' },
      { id: 'ADM1', nombre: 'Diana Admin', rol: 'admin', activo: true, clave: 'qa123456' },
    ];
    localStorage.setItem(
      'pos_dian_config',
      JSON.stringify({
        empresa: { nombreComercial: 'QA Crozzo', razonSocial: 'QA SAS', nit: '900000001', direccion: 'Calle QA 1' },
        seguridad: { requiereLogin: false, bloquearClavePlanoEnLogin: false },
        operacion: { modo: 'demo', demoSubmodo: 'pos' },
        dian: { resolucion: 'QA-000', prefijo: 'QA', rangoDesde: 1, rangoHasta: 99999 },
        productos: [
          {
            id: 1,
            nombre: 'Hamburguesa',
            nombreVenta: 'Hamburguesa clásica',
            precio: 15000,
            categoria: 'Platos',
            stock: 200,
            activo: true,
            areaComanda: 'COCINA',
            iva: 0,
          },
        ],
        comandas: { areas: [{ id: 'COCINA', nombre: 'Cocina' }], autoPrint: false },
        facturas: [],
        facturasFiscal: [],
        usuarios: { staff: staff },
      })
    );
    window.__CROZZO_IS_TAURI__ = true;
    window.__TAURI__ = window.__TAURI__ || {
      core: { invoke: () => Promise.resolve({ ok: true, saved_path: '/mock/qa.pdf' }) },
    };
    window.__crozzoSkipAllComandaGuards = true;
    window.__crozzoSkipDupCheck = true;
    window.__crozzoSkipNoviceArqueoGuard = true;
    window.confirm = () => true;
  };
}

export async function startQaPosServer() {
  const srv = createFieldPosHttpServer(SRC_ROOT);
  const info = await srv.listen('127.0.0.1');
  return { ...srv, ...info };
}

export async function waitAppReady(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () =>
      typeof window.navigateTo === 'function' &&
      typeof window.config !== 'undefined' &&
      typeof window.getActiveCart === 'function',
    null,
    { timeout: timeoutMs }
  );
  await page.waitForTimeout(2500);
}

export async function dismissShellOverlays(page) {
  await page.evaluate(() => {
    const lo = document.getElementById('loginOverlay');
    if (lo) lo.setAttribute('hidden', '');
    const pair = document.getElementById('crozzoPairingOverlay');
    if (pair) pair.setAttribute('hidden', '');
    document.body.classList.remove('crozzo-login-open');
    if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
    if (typeof window.crozzoClosePairingModal === 'function') window.crozzoClosePairingModal();
  });
}

export async function loginAsStaff(page, persona) {
  const r = await page.evaluate(async (p) => {
    localStorage.setItem('crozzo_perfil_empresa', p.perfilEmpresa || 'basico_restaurante');
    if (typeof window.logoutCurrentUser === 'function') {
      try {
        window.logoutCurrentUser({ force: true });
      } catch (_) {}
    }
    if (typeof window.loginWithCredentials === 'function') {
      const login = await window.loginWithCredentials(p.userId, 'qa123456');
      if (login && login.ok) {
        if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
        if (typeof window.applyAccessControl === 'function') window.applyAccessControl();
        const u = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : login.user;
        var exp = 'mixed';
        try {
          if (typeof window.crozzoGetPerfilOperativo === 'function') {
            var m = window.crozzoGetPerfilOperativo(localStorage.getItem('crozzo_perfil_empresa'));
            exp = (m && m.experiencia) || 'mixed';
          }
        } catch (_) {}
        return { ok: true, userId: u && u.id, rol: u && u.rol, experienciaPerfil: exp, via: 'loginWithCredentials' };
      }
    }
    sessionStorage.setItem('crozzo_session_user', p.userId);
    const Auth = window.CrozzoAuthSecurity;
    if (Auth && typeof Auth.crozzoIssueAuthProof === 'function') Auth.crozzoIssueAuthProof(p.userId);
    if (typeof window.crozzoIssueSessionProof === 'function') window.crozzoIssueSessionProof(p.userId);
    window.__crozzoAuthInteractiveThisBoot = true;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const u = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    if (!u) return { ok: false, error: 'sin_usuario' };
    if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
    if (typeof window.applyAccessControl === 'function') window.applyAccessControl();
    var exp2 = 'mixed';
    try {
      if (typeof window.crozzoGetPerfilOperativo === 'function') {
        var m2 = window.crozzoGetPerfilOperativo(localStorage.getItem('crozzo_perfil_empresa'));
        exp2 = (m2 && m2.experiencia) || 'mixed';
      }
    } catch (_) {}
    return { ok: true, userId: u.id, rol: u.rol, experienciaPerfil: exp2, via: 'sessionProof' };
  }, persona);
  if (!r.ok) throw new Error('Login ' + persona.userId + ' falló: ' + JSON.stringify(r));
  await page.waitForTimeout(400);
  return r;
}

/** Supervisor operativo de turno (encargado). KENNY/superadmin NO se usa en flujos POS. */
export async function loginEncargado(page) {
  return loginAsStaff(page, OPERATIONAL_SUPERVISOR);
}

/** Solo auditorías de superadmin / rescate. No usar en Hora Maestra ni flujos caja/tablet. */
export async function loginKenny(page) {
  const r = await page.evaluate(async () => {
    try {
      if (typeof window.ensureSuperAdminUser === 'function') window.ensureSuperAdminUser();
    } catch (_) {}
    if (typeof window.logoutCurrentUser === 'function') {
      try {
        window.logoutCurrentUser({ force: true });
      } catch (_) {}
    }
    let login = null;
    if (typeof window.loginWithCredentials === 'function') {
      const Auth = window.CrozzoAuthSecurity;
      const pin = Auth && Auth.LEGACY_KENNY_PIN ? Auth.LEGACY_KENNY_PIN : '141414';
      login = await window.loginWithCredentials('KENNY', pin);
    }
    if (!login || !login.ok) {
      sessionStorage.setItem('crozzo_session_user', 'KENNY');
      localStorage.setItem('crozzo_user_role', 'superadmin');
      const Auth = window.CrozzoAuthSecurity;
      if (Auth && typeof Auth.crozzoIssueAuthProof === 'function') Auth.crozzoIssueAuthProof('KENNY');
      if (typeof window.crozzoIssueSessionProof === 'function') window.crozzoIssueSessionProof('KENNY');
    }
    if (typeof window.crozzoCajaSessionMarkLogin === 'function') window.crozzoCajaSessionMarkLogin();
    if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
    if (typeof window.applyAccessControl === 'function') window.applyAccessControl();
    if (typeof window.crozzoFinishLoginSuccess === 'function') {
      window.crozzoFinishLoginSuccess({ channel: 'qa', toastMessage: '' });
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    const u = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    if (!u) {
      return {
        ok: false,
        error: 'getCurrentUser_null',
        kennyProof: typeof window.crozzoKennySessionProofValid === 'function' && window.crozzoKennySessionProofValid(),
      };
    }
    return { ok: true, user: u.id, rol: u.rol };
  });
  if (!r.ok) throw new Error('Sesión KENNY falló: ' + JSON.stringify(r));
  await page.waitForTimeout(500);
  return r;
}
