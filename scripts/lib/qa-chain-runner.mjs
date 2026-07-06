/**
 * Runner de cadenas de acción — registra eslabones, ramas y punto de fallo.
 */

export function initActionChainsReport(report) {
  report.actionChains = {
    premise:
      'Cada acción operativa debe desencadenar efectos observables; si una rama no entrega, el reporte indica eslabón y rama.',
    chains: [],
    summary: { total: 0, passed: 0, failed: 0, softFailed: 0 },
  };
  return report.actionChains;
}

/**
 * @param {object} report
 * @param {object} phase
 * @param {object} chainMeta - from ACTION_CHAINS
 * @param {object} result - from browser evaluator
 */
export function recordChainResult(report, phase, chainMeta, result) {
  const ac = report.actionChains || initActionChainsReport(report);
  ac.summary.total++;

  const entry = {
    id: chainMeta.id,
    label: chainMeta.label,
    humanStory: chainMeta.humanStory,
    ok: !!result.ok,
    soft: !!result.soft,
    failedAt: result.failedAt || null,
    failedBranch: result.failedBranch || null,
    failureMessage: result.failureMessage || null,
    links: result.links || [],
    branches: result.branches || [],
    durationMs: result.durationMs || null,
  };

  ac.chains.push(entry);

  if (entry.ok) {
    ac.summary.passed++;
  } else if (entry.soft) {
    ac.summary.softFailed++;
  } else {
    ac.summary.failed++;
  }

  return entry;
}

export function printChainSummary(report, opts) {
  opts = opts || {};
  const ac = report.actionChains;
  if (!ac) return;
  console.log('\n▶ Cadenas de acción · resumen');
  for (const c of ac.chains) {
    const mark = c.ok ? '✓' : c.soft ? '~' : '✗';
    const fail =
      !c.ok && c.failedAt
        ? ` → falló en «${c.failedAt}»${c.failedBranch ? ' · rama ' + c.failedBranch : ''}`
        : '';
    console.log(`    ${mark} ${c.label}${fail}`);
    if (!c.ok && c.failureMessage) console.log(`      ${c.failureMessage}`);
    const showLinks = opts.verbose || !c.ok;
    if (showLinks && c.links && c.links.length) {
      for (const l of c.links) {
        const lm = l.ok ? '·' : '✗';
        const branchHint = l.branches && l.branches.length ? ' → ' + l.branches.join(' → ') : '';
        console.log(`      ${lm} ${l.node}${branchHint}`);
        if (!l.ok) console.log(`        esperado ${JSON.stringify(l.expected)} · actual ${JSON.stringify(l.actual)}`);
      }
    }
    if (opts.verbose && c.branches && c.branches.length) {
      for (const b of c.branches) {
        console.log(`      ↳ rama ${b.name}: ${JSON.stringify(b.detail)}`);
      }
    }
  }
  console.log(
    `    Total: ${ac.summary.passed}/${ac.summary.total} OK` +
      (ac.summary.softFailed ? ` · ${ac.summary.softFailed} blando(s)` : '') +
      (ac.summary.failed ? ` · ${ac.summary.failed} FAIL` : '')
  );
}

export function assertChainsHealthy(report, opts) {
  opts = opts || {};
  const ac = report.actionChains;
  if (!ac) return;
  const hardFails = ac.chains.filter((c) => !c.ok && !c.soft);
  if (hardFails.length && !opts.soft) {
    const first = hardFails[0];
    throw new Error(
      `Cadena «${first.label}» falló en ${first.failedAt || '?'}: ${first.failureMessage || 'sin detalle'}`
    );
  }
}
