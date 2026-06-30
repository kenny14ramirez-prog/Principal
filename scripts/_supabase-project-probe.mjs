#!/usr/bin/env node
/**
 * Comprueba tablas críticas en un proyecto Supabase (misma lógica que Super Admin → Comprobar tablas).
 *
 * Uso:
 *   set SUPABASE_URL=https://xxxx.supabase.co
 *   set SUPABASE_ANON_KEY=sb_publishable_...
 *   node scripts/_supabase-project-probe.mjs
 *
 *   node scripts/_supabase-project-probe.mjs https://xxxx.supabase.co sb_publishable_...
 */
const urlRaw = (process.env.SUPABASE_URL || process.argv[2] || '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_ANON_KEY || process.argv[3] || '').trim();

const CRITICAL = [
  { table: 'devices', col: 'id' },
  { table: 'products', col: 'id' },
  { table: 'sales', col: 'id' },
  { table: 'comandas', col: 'id' },
  { table: 'company_config', col: 'id' },
  { table: 'pos_staff', col: 'id' },
  { table: 'sync_queue', col: 'id' },
  { table: 'crozzo_sede_runtime', col: 'location_id' },
  { table: 'crozzo_mesa_runtime', col: 'location_id' },
  { table: 'crozzo_device_qr_slots', col: 'id' },
  { table: 'crozzo_business_registry', col: 'business_id' },
];

if (!urlRaw || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY (env o argv).');
  process.exit(2);
}

async function probeOne(table, col) {
  const u = `${urlRaw}/rest/v1/${encodeURIComponent(table)}?limit=0&select=${encodeURIComponent(col)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(u, {
      method: 'GET',
      signal: c.signal,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'count=exact',
      },
    });
    clearTimeout(t);
    const ok = !!(res && (res.ok || res.status === 200 || res.status === 206));
    return { table, status: res.status, ok };
  } catch (e) {
    clearTimeout(t);
    const msg = String(e?.message || e || '');
    const dns = /ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/i.test(msg);
    return { table, status: dns ? 'DNS_FAIL' : 'ERR', ok: false, error: msg };
  }
}

let okN = 0;
let failN = 0;
console.log('[probe] Proyecto:', urlRaw);
for (const p of CRITICAL) {
  const r = await probeOne(p.table, p.col);
  const tag = r.ok ? 'OK' : 'FALTA';
  if (r.ok) okN++;
  else failN++;
  console.log(`  ${tag.padEnd(6)} ${p.table.padEnd(28)} ${r.status}${r.error ? ' · ' + r.error.slice(0, 60) : ''}`);
}
console.log(`\n[probe] ${okN}/${CRITICAL.length} tablas críticas alcanzables`);
process.exit(failN === 0 ? 0 : 1);
