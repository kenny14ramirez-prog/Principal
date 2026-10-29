#!/usr/bin/env node
/**
 * F10-AUD-01 — Auditoría de personas MISIÓN CIEN (DOM real, sin mocks).
 *
 * Diferencia con `jornada-simulator.mjs`: este arnés NO inventa ventas.
 * Abre la app real en Chromium, inicia sesión, navega como cada rol y
 * verifica estado leyendo el DOM y localStorage antes/después.
 *
 * Uso:
 *   node scripts/qa-personas-mision-cien.mjs
 *   QA_HEADLESS=false node scripts/qa-personas-mision-cien.mjs   (ver la pantalla)
 *
 * Salida:
 *   docs/maps/ops/evidencia/F10-AUD-01/resultado.json
 *   docs/maps/ops/evidencia/F10-AUD-01/<rol>.png
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
/* Tauri sirve `src/` (frontendDist en src-tauri/tauri.conf.json). El navegador
 * quedó abandonado: auditar `app/` mide un árbol que no se instala.
 * QA_TREE=app queda solo para comparar fuente vs build. */
const TREE = process.env.QA_TREE || 'src';
const APP = path.join(ROOT, TREE);
const OUT = path.join(ROOT, 'docs', 'maps', 'ops', 'evidencia', 'F10-AUD-01', TREE);
const PORT = Number(process.env.QA_PORT || 46010);
const HEADLESS = process.env.QA_HEADLESS !== 'false';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

const results = [];
const consoleErrors = [];
let pageErrors = 0;

function record(role, check, pass, detail) {
  results.push({ role, check, pass, detail: String(detail ?? '').slice(0, 400), at: new Date().toISOString() });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${role} · ${check} — ${String(detail ?? '').slice(0, 160)}`);
}

function server() {
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(String(req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(APP, p);
    if (!file.startsWith(APP)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => s.listen(PORT, () => resolve(s)));
}

async function snapshot(page) {
  return page.evaluate(() => {
    const parse = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
    const cfg = parse('pos_dian_config') || {};
    const rt = parse('crozzo_pos_runtime_v1') || {};
    const sizes = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      sizes[k] = (localStorage.getItem(k) || '').length;
    }
    const main = document.querySelector('main') || document.body;
    return {
      heading: (document.querySelector('h1,h2,.page-title')?.innerText || '').trim(),
      text: (main.innerText || '').replace(/\s+/g, ' ').slice(0, 1500),
      facturas: Array.isArray(cfg.facturas) ? cfg.facturas.length : -1,
      ultimoConsecutivo: cfg.ultimoConsecutivo ?? null,
      comandasCfg: Array.isArray(cfg.comandas) ? cfg.comandas.length : -1,
      runtimeKeys: Object.keys(rt).slice(0, 20),
      lsBytes: Object.values(sizes).reduce((a, b) => a + b, 0),
      lsLargest: Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 5),
      dialog: (() => {
        const d = [...document.querySelectorAll('.wizard-shell,.modal,[role="dialog"],dialog[open]')]
          .find((e) => e.offsetParent !== null);
        return d ? { text: (d.innerText || '').replace(/\s+/g, ' ').slice(0, 300), inputs: d.querySelectorAll('input,select').length, buttons: d.querySelectorAll('button').length } : null;
      })(),
      total: (() => {
        const m = (main.innerText || '').match(/Total\s*\$?\s*([\d.,]+)/i);
        return m ? Number(String(m[1]).replace(/\./g, '').replace(',', '.')) : null;
      })()
    };
  });
}

async function login(page) {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.locator('input[placeholder*="Usuario" i]:visible').first().fill('DEMO');
  await page.locator('input[type="password"]:visible').first().fill('demo');
  await page.locator('button,.btn,[role="button"]').filter({ hasText: /entrar/i }).first().click();
  await page.waitForTimeout(7000);
}

async function nav(page, label) {
  const item = page.locator('button,a,[role="button"]').filter({ hasText: new RegExp(label, 'i') }).first();
  if (!(await item.count())) return false;
  try {
    await item.scrollIntoViewIfNeeded({ timeout: 3000 });
    await item.click({ timeout: 8000 });
  } catch {
    // El ítem puede estar dentro de un grupo colapsado: abrir y reintentar.
    const group = page.locator('button,a,[role="button"]').filter({ hasText: /^GESTIÓN$|^OPERACIÓN$|CONFIGURACIÓN/i }).first();
    if (await group.count()) { try { await group.click({ timeout: 2000 }); } catch {} }
    await item.click({ force: true, timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(3500);
  return true;
}

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }); } catch {}
}

async function main() {
  console.log(`\n=== F10-AUD-01 · Auditoría de personas (DOM real) · ${RUN_ID} ===\n`);
  const srv = await server();
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 120 });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();

  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => { pageErrors++; consoleErrors.push('PAGEERROR: ' + e.message.slice(0, 200)); });

  try {
    await login(page);

    // ---------- R0 · Arranque ----------
    const boot = await snapshot(page);
    record('SISTEMA', 'Arranque y login', !!(boot.heading || boot.text), `pantalla="${boot.heading}" lsBytes=${boot.lsBytes}`);
    record('SISTEMA', 'Sin errores fatales de página', pageErrors === 0, `${pageErrors} pageerror · ${consoleErrors.slice(0, 3).join(' | ')}`);
    // El navegador está abandonado: sin puente Tauri no hay impresoras, BLE ni LAN nativa.
    const native = await page.evaluate(() => ({ tauri: typeof window.__TAURI__ !== 'undefined' || typeof window.__TAURI_INTERNALS__ !== 'undefined' }));
    record('SISTEMA', `Puente nativo Tauri (árbol ${TREE})`, native.tauri, native.tauri ? 'IPC disponible' : 'SIN puente nativo: impresoras/BLE/LAN no auditables aquí');

    // ---------- R1 · CAJERO ----------
    const okPos = await nav(page, 'Restaurante · POS');
    record('CAJERO', 'Abrir POS de restaurante', okPos, okPos ? 'página abierta' : 'no se encontró el ítem de navegación');
    const before = await snapshot(page);
    record('CAJERO', 'Carrito demo legible', before.total !== null, `total=${before.total}`);

    // Añadir un producto real (botón/tarjeta con precio en el cuerpo, no nav)
    const PRODUCT_SEL = 'main button, main [role="button"], main .product-card, main .crozzo-rest-pos__item, main .crozzo-rest-pos__product';
    const product = page.locator(PRODUCT_SEL).filter({ hasText: /\$\s?[\d.]+/ }).first();
    const hasProduct = await product.count();
    if (hasProduct) {
      await product.click();
      await page.waitForTimeout(1200);
      const afterAdd = await snapshot(page);
      const grew = before.total === null || afterAdd.total === null ? false : afterAdd.total > before.total;
      record('CAJERO', 'Agregar producto al pedido', grew, `total ${before.total} → ${afterAdd.total}`);
    } else {
      record('CAJERO', 'Agregar producto al pedido', false, 'no se encontró botón de producto');
    }

    // Cobrar
    const payCta = page.locator('button').filter({ hasText: /Cobrar Venta Directa|Cobrar$/i }).first();
    if (await payCta.count()) {
      const pre = await snapshot(page);
      await payCta.click();
      await page.waitForTimeout(3000);
      const post = await snapshot(page);
      const dialogUsable = !!(post.dialog && post.dialog.text.trim().length > 20 && (post.dialog.inputs > 0 || post.dialog.buttons > 1));
      record('CAJERO', 'Interfaz de cobro utilizable', dialogUsable,
        post.dialog ? `diálogo texto=${post.dialog.text.trim().length} chars, inputs=${post.dialog.inputs}, botones=${post.dialog.buttons}` : 'sin diálogo visible');
      record('CAJERO', 'Cobro genera factura', post.facturas > pre.facturas, `facturas ${pre.facturas} → ${post.facturas}`);
      await shot(page, 'cajero-cobro');
      if (post.dialog) {
        const close = page.locator('.wizard-close,[aria-label*="cerrar" i],button:has-text("×")').first();
        if (await close.count()) { try { await close.click({ timeout: 2000 }); } catch {} }
      }
    } else {
      record('CAJERO', 'Interfaz de cobro utilizable', false, 'no se encontró el botón de cobro');
    }

    // ---------- R2 · MESERO ----------
    await page.keyboard.press('Escape').catch(() => {});
    const okTablets = await nav(page, 'Tablets · pedidos');
    record('MESERO', 'Abrir modo tablets', okTablets, okTablets ? 'página abierta' : 'no disponible');
    if (okTablets) {
      const t = await snapshot(page);
      record('MESERO', 'Grilla de mesas visible', /mesa|salón|salon|llevar/i.test(t.text), t.text.slice(0, 120));
      await shot(page, 'mesero');
    }

    // ---------- R3 · COCINA ----------
    const okKitchen = await nav(page, 'Preparaciones de cocina');
    record('COCINA', 'Abrir KDS', okKitchen, okKitchen ? 'página abierta' : 'no disponible');
    if (okKitchen) {
      const k = await snapshot(page);
      record('COCINA', 'KDS muestra contenido operativo', k.text.length > 80, `texto=${k.text.length} chars`);
      await shot(page, 'cocina');
    }

    // ---------- R4 · ADMINISTRACIÓN ----------
    const okReports = await nav(page, 'Reportes y dashboard');
    const r = await snapshot(page);
    // PASS estricto: la página debe haber cambiado de verdad, no basta con que el texto contenga "$".
    const reportsOpen = okReports && /reporte|dashboard/i.test(r.heading);
    record('ADMIN', 'Abrir reportes', reportsOpen, reportsOpen ? `heading="${r.heading}"` : `NO navegó: heading="${r.heading}"`);
    if (reportsOpen) {
      const hasData = /venta|total|factura|ingreso|\$/i.test(r.text);
      record('ADMIN', 'Reportes muestran datos', hasData, r.text.slice(0, 120));
      await shot(page, 'admin');
    }

    // ---------- R5 · Higiene de recursos ----------
    const fin = await snapshot(page);
    record('SISTEMA', 'localStorage bajo 5 MB', fin.lsBytes < 5 * 1024 * 1024, `bytes=${fin.lsBytes} mayores=${JSON.stringify(fin.lsLargest)}`);

    // ---------- R5b · Módulos críticos realmente embarcados ----------
    // Tauri sirve src/: si un módulo no está aquí, no existe en la app instalada.
    const mods = await page.evaluate(() => {
      const srcs = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') || '');
      return {
        scripts: srcs.length,
        ocr: srcs.some((s) => /CrozzoOcrFactura/i.test(s)),
        contingencia: srcs.some((s) => /CrozzoContingenciaFiscal/i.test(s)),
        archivo: srcs.some((s) => /CrozzoComandaArchive/i.test(s)),
        blob: srcs.some((s) => /CrozzoBlobStore/i.test(s))
      };
    });
    record('SISTEMA', `Módulos críticos embarcados (${TREE})`,
      mods.contingencia && mods.ocr && mods.archivo,
      `scripts=${mods.scripts} OCR=${mods.ocr} contingencia=${mods.contingencia} archivoComandas=${mods.archivo} blobStore=${mods.blob}`);

    // ---------- R6 · Errores humanos automatizables ----------
    // EH-01: doble clic en el mismo botón de producto (volver al POS primero)
    await nav(page, 'Restaurante · POS');
    const ehBase = await snapshot(page);
    const ehPrev = ehBase.total;
    const p2 = page.locator(PRODUCT_SEL).filter({ hasText: /\$\s?[\d.]+/ }).first();
    if (await p2.count()) {
      await p2.dblclick({ delay: 60 });
      await page.waitForTimeout(1200);
      const ehPost = await snapshot(page);
      record('EH-01', 'Doble toque no bloquea la UI', ehPost.total !== null, `total ${ehPrev} → ${ehPost.total}`);
    } else {
      record('EH-01', 'Doble toque no bloquea la UI', false, 'sin producto accesible');
    }

  } catch (e) {
    record('SISTEMA', 'Ejecución completa', false, 'EXCEPCIÓN: ' + e.message);
  } finally {
    const summary = {
      runId: RUN_ID,
      at: new Date().toISOString(),
      url: `http://127.0.0.1:${PORT}/index.html`,
      headless: HEADLESS,
      pageErrors,
      consoleErrors: [...new Set(consoleErrors)].slice(0, 25),
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length,
      results
    };
    fs.writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(summary, null, 2));
    console.log(`\nRESUMEN: PASS=${summary.pass} FAIL=${summary.fail} pageErrors=${pageErrors}`);
    console.log(`Evidencia: ${path.join(OUT, 'resultado.json')}\n`);
    await browser.close();
    srv.close();
    process.exitCode = summary.fail ? 1 : 0;
  }
}

main();
