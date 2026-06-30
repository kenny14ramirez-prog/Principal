/**
 * Verifica que scheduleComandaOperationalUiRefresh resuelva la página activa
 * (crozzoGetActivePageId) y no dependa de global.currentPage inexistente.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const syncJs = readFileSync(join(root, 'app/modules/CrozzoComandasCloudSync.js'), 'utf8');
const priJs = readFileSync(join(root, 'app/infra/CrozzoCloudSyncPriorities.js'), 'utf8');
const mainJs = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');

const checks = [
  {
    name: 'activePosPage helper',
    ok: syncJs.includes('function activePosPage()') && syncJs.includes('crozzoGetActivePageId'),
  },
  {
    name: 'scheduleComandaOperationalUiRefresh uses activePosPage',
    ok: /function scheduleComandaOperationalUiRefresh[\s\S]*?var pg = activePosPage\(\)/.test(syncJs),
  },
  {
    name: 'pull batch uses activePosPage not global.currentPage guard',
    ok: syncJs.includes('var pgPull = activePosPage()') && !syncJs.includes('global.currentPage === \'comandas\''),
  },
  {
    name: 'activePageNow falls back to crozzoGetActivePageId',
    ok: priJs.includes('crozzoGetActivePageId') && /if \(watchPg\) return watchPg/.test(priJs),
  },
  {
    name: 'KDS hub patch helpers',
    ok: mainJs.includes('function crozzoPatchKdsBoardDom') && mainJs.includes('function crozzoPatchComandasHubDom'),
  },
  {
    name: 'selectComandasArea syncs PageCloudWatch',
    ok: /function selectComandasArea[\s\S]*?crozzoPageCloudWatchSetPage\('comandas'\)/.test(mainJs),
  },
  {
    name: 'kiosk enter forces ops sync Z0',
    ok: mainJs.includes("crozzoEnsureOpsSyncActive({ source: 'kiosk_comandas', force: true })"),
  },
];

let failed = 0;
for (const c of checks) {
  const mark = c.ok ? 'OK' : 'FAIL';
  if (!c.ok) failed++;
  console.log(`${mark}  ${c.name}`);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll kiosk comanda UI refresh checks passed.');
