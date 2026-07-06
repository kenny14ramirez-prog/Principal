#!/usr/bin/env node
/**
 * HORA MAESTRA · Escenario Oro + matriz humana
 *
 *   npm run test:operativo-oro
 *   node scripts/test-operativo-oro.mjs --intensity=intensiva
 *   node scripts/test-operativo-oro.mjs --intensity=maraton
 */
import { chromium } from 'playwright';
import {
  startQaPosServer,
  qaDemoInitScript,
  waitAppReady,
  dismissShellOverlays,
  loginAsStaff,
  loginEncargado,
} from './lib/qa-pos-boot.mjs';
import { qaEnsureStaffPermisosScript, qaEnsurePersonaPermisosScript } from './lib/qa-staff-permisos.mjs';
import { parseIntensity, selectPersonas, ADVERSARIAL_SCENARIOS, OPERATIONAL_SUPERVISOR } from './lib/qa-human-matrix.mjs';
import {
  createMasterReport,
  phaseStart,
  runStep,
  observe,
  printBanner,
  finishMasterReport,
} from './lib/qa-human-runner.mjs';
import {
  evalPersonaPageAccess,
  evalCompanionOnPage,
  evalSaleFlowMesa,
  evalAdversarialPack,
  evalJournalSnapshot,
} from './lib/qa-browser-flows.mjs';
import {
  ACTION_CHAINS,
  evalChainMesaEstados,
  evalChainComandaRamas,
  evalChainCobroRamificaciones,
  evalChainVentaInventarioMeta,
  evalChainDualTabletLock,
} from './lib/qa-action-chains.mjs';
import {
  initActionChainsReport,
  recordChainResult,
  printChainSummary,
  assertChainsHealthy,
} from './lib/qa-chain-runner.mjs';

const argv = process.argv.slice(2);
const intensity = parseIntensity(argv);
const chainsVerbose = argv.some((a) => a === '--chains-verbose' || a === '--verbose-chains');
const report = createMasterReport(intensity);
initActionChainsReport(report);
const pageErrors = [];
let browser;
let page;
let server;

printBanner(intensity);

try {
  server = await startQaPosServer();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));

  await page.addInitScript(qaDemoInitScript());
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // ── Fase 1: Arranque ──
  const phBoot = phaseStart(report, 'boot', 'Arranque y módulos humanos');
  console.log('\n▶ Fase 1 · Arranque\n');
  await runStep(report, phBoot, 'boot-ready', 'App lista (POS + config)', async () => {
    await waitAppReady(page);
    await dismissShellOverlays(page);
    if (pageErrors.length) throw new Error('JS boot: ' + pageErrors.slice(0, 2).join(' | '));
    return { modules: await page.evaluate(() => ({
      psyche: !!(window.CrozzoOperativePsyche),
      companion: !!(window.CrozzoOperativeCompanion),
      automation: !!(window.CrozzoAutomation),
      journal: !!(window.CrozzoOperativeJournal),
    })) };
  });

  await runStep(report, phBoot, 'boot-human-modules', 'Capa humana cargada', async () => {
    const m = await page.evaluate(() => ({
      psyche: !!(window.CrozzoOperativePsyche),
      companion: typeof window.crozzoCompanionOnPage === 'function',
    }));
    if (!m.psyche || !m.companion) throw new Error('Falta Psyche o Companion');
    return m;
  });

  await runStep(report, phBoot, 'boot-staff-permisos', 'Staff QA con permisos de rol', async () => {
    return page.evaluate(qaEnsureStaffPermisosScript());
  });

  // ── Fase 2: Matriz de personas ──
  const personas = selectPersonas(intensity);
  const phPersonas = phaseStart(report, 'personas', 'Matriz humana por rol y experiencia');
  console.log('\n▶ Fase 2 · Personas (' + personas.length + ')\n');

  for (const persona of personas) {
    await runStep(report, phPersonas, 'persona-' + persona.id, persona.label, async () => {
      await page.evaluate(qaEnsurePersonaPermisosScript(), persona);
      const login = await loginAsStaff(page, persona);
      const access = await page.evaluate(evalPersonaPageAccess(persona), { persona });
      if (access.denied.length) {
        observe(report, 'warn', persona.id, 'ACL inesperado', access.denied);
      }
      await page.evaluate((p) => {
        if (typeof window.navigateTo === 'function') window.navigateTo(p.companionPage || p.home);
      }, persona);
      await page.waitForTimeout(900);
      const companion = await page.evaluate(evalCompanionOnPage(persona.companionPage), {
        pageId: persona.companionPage,
      });
      const psyche = await page.evaluate(() => {
        if (!window.CrozzoOperativePsyche) return {};
        return {
          human: CrozzoOperativePsyche.shouldApplyHumanLayer && CrozzoOperativePsyche.shouldApplyHumanLayer(),
          comfort: CrozzoOperativePsyche.shouldApplyComfortUx && CrozzoOperativePsyche.shouldApplyComfortUx(),
        };
      });
      const row = {
        persona: persona.id,
        login,
        access,
        companion,
        psyche,
        humanExpect: persona.humanExpect,
      };
      report.humanPsychology.personasTested.push(row);
      if (!companion.hasRail && persona.companionPage) {
        observe(report, 'warn', persona.id, 'Sin rail companion en ' + persona.companionPage, companion);
      } else if (companion.hint) {
        report.humanPsychology.comfortSignals.push({
          persona: persona.id,
          hint: companion.hint.slice(0, 100),
        });
      }
      return row;
    });
  }

  // ── Fase 3: Oro operativo (encargado — flujo completo sin superadmin) ──
  const phOro = phaseStart(report, 'oro', 'Escenario oro · venta mesa → cocina → cobro');
  console.log('\n▶ Fase 3 · Escenario oro (' + intensity.salesLoop + ' venta(s))\n');

  await runStep(report, phOro, 'oro-login', 'Encargado abre turno operativo', async () =>
    loginAsStaff(page, OPERATIONAL_SUPERVISOR)
  );

  const sales = [];
  for (let i = 0; i < intensity.salesLoop; i++) {
    const mesaId = 'M' + ((i % 8) + 1);
    await runStep(report, phOro, 'oro-venta-' + (i + 1), 'Venta mesa ' + mesaId + ' (ciclo ' + (i + 1) + ')', async () => {
      const sale = await page.evaluate(evalSaleFlowMesa(), {
        mesaId,
        qty: 1 + (i % 3),
        skipGuards: true,
      });
      sales.push(sale);
      return sale;
    });
  }
  report.context.sales = sales;

  // ── Fase 4: Cadenas de acción (rama por rama) ──
  const phChains = phaseStart(report, 'action-chains', 'Cadenas de acción · efectos en cascada');
  console.log('\n▶ Fase 4 · Cadenas de acción (rama → rama)\n');
  await loginEncargado(page);

  const CHAIN_EVALUATORS = {
    'mesa-estados-comanda-cobro': evalChainMesaEstados,
    'comanda-ramas-cocina': evalChainComandaRamas,
    'cobro-ramificaciones': evalChainCobroRamificaciones,
    'venta-inventario-meta': evalChainVentaInventarioMeta,
    'tablet-dual-slot-lock': evalChainDualTabletLock,
  };

  const chainMesas = ['M7', 'M8', 'M9', 'M6', 'M10'];
  let chainIdx = 0;

  for (const chainMeta of ACTION_CHAINS) {
    const evaluator = CHAIN_EVALUATORS[chainMeta.id];
    if (!evaluator) continue;
    const mesaId = chainMesas[chainIdx++] || 'M' + (chainIdx + 6);

    await runStep(
      report,
      phChains,
      'chain-' + chainMeta.id,
      chainMeta.label,
      async () => {
        const result = await page.evaluate(evaluator, { mesaId });
        const entry = recordChainResult(report, phChains, chainMeta, result);
        if (!result.ok && chainMeta.required) {
          const err = new Error(
            (result.failureMessage || 'Cadena fallida') +
              ' · eslabón «' +
              (result.failedAt || '?') +
              '»' +
              (result.failedBranch ? ' · rama ' + result.failedBranch : '')
          );
          err.chainDetail = entry;
          throw err;
        }
        if (!result.ok && !chainMeta.required) {
          observe(report, 'warn', 'action-chains', chainMeta.label, {
            failedAt: result.failedAt,
            failedBranch: result.failedBranch,
            message: result.failureMessage,
            links: result.links,
          });
        }
        return entry;
      },
      { soft: !chainMeta.required }
    );
  }

  printChainSummary(report, { verbose: chainsVerbose });
  assertChainsHealthy(report);

  await page.evaluate(() => {
    try {
      localStorage.setItem('crozzo_device_id', 'qa-desktop-caja');
      localStorage.setItem('device_id', 'qa-desktop-caja');
      window.CROZZO_DEVICE_ID = 'qa-desktop-caja';
    } catch (_) {}
    window.__crozzoSkipAllComandaGuards = true;
    window.__crozzoSkipDupCheck = true;
    try {
      if (typeof window.crozzoReleaseOrderSlotSession === 'function') {
        window.crozzoReleaseOrderSlotSession('mesa', 'M10');
        window.crozzoReleaseOrderSlotSession('mesa', 'M5');
      }
    } catch (_) {}
  });
  await loginEncargado(page);

  // ── Fase 5: Abuso / errores humanos ──
  if (intensity.adversarial) {
    const phAdv = phaseStart(report, 'adversarial', 'Errores humanos y intentos de romper flujo');
    console.log('\n▶ Fase 5 · Adversarial / humano orgánico\n');

    const adv = await runStep(report, phAdv, 'adversarial-pack', 'Paquete adversarial', async () => {
      await page.evaluate(() => {
        window.__crozzoSkipAllComandaGuards = false;
        window.__crozzoSkipDupCheck = false;
        if (typeof window.navigateTo === 'function') window.navigateTo('cajero');
      });
      await page.waitForTimeout(400);
      return page.evaluate(evalAdversarialPack());
    });

    for (const spec of ADVERSARIAL_SCENARIOS) {
      const key =
        spec.id === 'post-comandar-block'
          ? 'postComandarBlocked'
          : spec.id === 'double-cobro-guard'
            ? 'doubleCobroGuard'
            : spec.id === 'nav-spam'
              ? 'navSpamSurvived'
              : spec.id === 'empty-comandar'
                ? 'emptyComandarGraceful'
                : null;
      const passed = key ? !!adv[key] : true;
      report.humanPsychology.adversarialOutcomes.push({
        id: spec.id,
        label: spec.label,
        humanStory: spec.humanStory,
        passed,
        detail: key ? adv[key] : null,
      });
      if (!passed && spec.severity === 'must-block') {
        throw new Error('Adversarial falló: ' + spec.label);
      }
      if (!passed && spec.severity === 'must-survive') {
        throw new Error('Sistema no sobrevivió: ' + spec.label);
      }
      if (!passed) {
        observe(report, 'warn', 'adversarial', spec.label, adv);
      } else {
        console.log('    ✓ ' + spec.label);
      }
    }
    report.context.adversarial = adv;
  }

  // ── Fase 6: Cierre ──
  const phCierre = phaseStart(report, 'cierre', 'Cierre de caja · arqueo');
  console.log('\n▶ Fase 6 · Cierre de turno\n');
  await loginEncargado(page);
  await dismissShellOverlays(page);

  await runStep(report, phCierre, 'cierre-arqueo', 'Arqueo mañana coherente con ventas', async () => {
    const seed = await page.evaluate(() => {
      function localTodayKey() {
        var x = new Date();
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
      }
      var today = localTodayKey();
      var nowIso = new Date().toISOString();
      var facturas = typeof window.config.getFacturas === 'function' ? window.config.getFacturas() : [];
      localStorage.removeItem('crozzo_shift_turn_history_v1');
      localStorage.setItem(
        'crozzo_day_session_v2',
        JSON.stringify({
          businessDate: today,
          openedAt: nowIso,
          activeShift: 'manana',
          shifts: {
            manana: { type: 'manana', openedAt: nowIso, status: 'open' },
            tarde: { type: 'tarde', status: 'pending' },
            dia: { type: 'dia', status: 'pending' },
          },
        })
      );
      localStorage.setItem(
        'crozzo_shift_turn_v1',
        JSON.stringify({ id: 'TRN-HM', openedAt: nowIso, cashOpen: 100000, closed: false, businessDate: today, shiftType: 'manana' })
      );
      if (facturas.length && typeof window.config.set === 'function') {
        window.config.set('facturas', facturas);
        window.config.set('facturasFiscal', facturas);
      }
      const ventaTotal = facturas.reduce((s, f) => s + (Number(f.total) || 0), 0);
      return { ventaTotal, facturas: facturas.length };
    });

    await page.evaluate(() => window.navigateTo('cierre-caja'));
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.crozzoShiftOpenArqueoType('manana'));
    await page.waitForTimeout(600);
    await page.waitForSelector('#crozzo-shift-fondo', { state: 'visible', timeout: 15000 });

    const fondo = 100000;
    const actual = fondo + (Number(seed.ventaTotal) || 30000);
    await page.fill('#crozzo-shift-fondo', String(fondo));
    await page.fill('#crozzo-shift-count', String(actual));

    const cierre = await page.evaluate(() => {
      window.crozzoShiftCalcArqueo();
      var notes = document.getElementById('crozzo-shift-notes');
      if (notes) notes.value = 'Hora Maestra QA';
      window.__crozzoSkipNoviceArqueoGuard = true;
      const before = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]').length;
      window.crozzoShiftFinalize();
      const after = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]').length;
      const day = JSON.parse(localStorage.getItem('crozzo_day_session_v2') || '{}');
      return {
        grew: after > before,
        mananaClosed: day.shifts && day.shifts.manana && day.shifts.manana.status,
      };
    });
    if (!cierre.grew || cierre.mananaClosed !== 'closed') throw new Error('Cierre incompleto');
    return cierre;
  });

  // ── Fase 7: Diario operativo ──
  const phJournal = phaseStart(report, 'journal', 'Diario automático (memoria de incidentes)');
  console.log('\n▶ Fase 7 · Diario operativo\n');

  await runStep(report, phJournal, 'journal-snapshot', 'Journal local accesible', async () => {
    const j = await page.evaluate(evalJournalSnapshot());
    report.context.journal = j;
    return j;
  }, { soft: true });

  report.ok = report.metrics.stepsFail === 0;
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(report.ok ? '║  ✅ HORA MAESTRA — APROBADA                                  ║' : '║  ❌ HORA MAESTRA — REVISAR REPORTE                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
} catch (e) {
  report.context.pageErrors = pageErrors.slice(0, 25);
  if (!report.errors.some((x) => x.message === (e.message || String(e)))) {
    report.errors.push({ step: 'fatal', message: e.message || String(e) });
  }
  report.metrics.stepsFail++;
  console.error('\n❌ HORA MAESTRA interrumpida:', e.message || e, '\n');
} finally {
  const paths = finishMasterReport(report, report.metrics.stepsFail === 0);
  console.log('Reporte maestro:', paths.latest);
  console.log(
    'Resumen: OK=' + report.metrics.stepsOk + ' WARN=' + report.metrics.stepsWarn + ' FAIL=' + report.metrics.stepsFail +
      ' · ' + Math.round(report.metrics.durationMs / 1000) + 's\n'
  );
  if (browser) await browser.close();
  if (server && typeof server.close === 'function') await server.close();
  process.exit(report.metrics.stepsFail === 0 ? 0 : 1);
}
