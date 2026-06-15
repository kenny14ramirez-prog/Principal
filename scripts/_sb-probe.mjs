/**
 * Sonda de Supabase en vivo: verifica qué tablas existen y son accesibles con la
 * anon/publishable key. Diagnóstico de "sincroniza pero no trae todos los datos".
 *
 *   node scripts/_sb-probe.mjs <SUPABASE_URL> <ANON_O_PUBLISHABLE_KEY>
 *
 * No guarda credenciales: se pasan por argumento.
 */
const url = (process.argv[2] || '').trim();
const key = (process.argv[3] || '').trim();
if (!url || !key) {
  console.error('Uso: node scripts/_sb-probe.mjs <url> <key>');
  process.exit(2);
}
const base = url.replace(/\/$/, '');
const headers = {
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
  Prefer: 'count=exact',
};

// Tablas que la app espera, clasificadas por nivel:
//   critico = la conexión NO está lista sin esto · recomendado · opcional (módulos)
const tables = [
  { t: 'devices', level: 'critico' },
  { t: 'products', level: 'critico' },
  { t: 'company_config', level: 'critico' },
  { t: 'pos_staff', level: 'critico' },
  { t: 'comandas', level: 'critico' },
  { t: 'sync_queue', level: 'critico' },
  { t: 'sales', level: 'critico' },
  { t: 'crozzo_sede_runtime', level: 'critico' },
  { t: 'profiles', level: 'recomendado' },
  { t: 'crozzo_mesa_runtime', level: 'recomendado' },
  { t: 'clients', level: 'opcional' },
  { t: 'taxes', level: 'opcional' },
  { t: 'categories', level: 'opcional' },
];

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

(async () => {
  console.log('\n=== Sonda Supabase ===');
  console.log('URL :', base);
  console.log('Key :', key.slice(0, 12) + '…(' + key.length + ' chars)');
  console.log('');

  // Alcanzabilidad básica del endpoint REST.
  try {
    const root = await fetch(base + '/rest/v1/', { method: 'HEAD', headers: { apikey: key } });
    console.log('REST alcanzable -> HTTP', root.status, '(responde = internet + Supabase OK)');
  } catch (e) {
    console.log('REST NO alcanzable -> error de red:', e.message || e);
  }
  console.log('');

  const lv = {
    critico: { ok: 0, total: 0, falta: [] },
    recomendado: { ok: 0, total: 0, falta: [] },
    opcional: { ok: 0, total: 0, falta: [] },
  };
  tables.forEach((x) => {
    lv[x.level].total++;
  });

  for (const x of tables) {
    const t = x.t;
    try {
      const res = await fetch(base + '/rest/v1/' + encodeURIComponent(t) + '?select=*&limit=1', { headers });
      const cr = res.headers.get('content-range') || '';
      const count = cr.includes('/') ? cr.split('/')[1] : '?';
      let mark = 'OK';
      let note = '';
      if (res.ok) {
        lv[x.level].ok++;
        note = 'filas=' + count;
        if (count === '0') note += ' (vacía o RLS sin filas visibles)';
      } else {
        mark = 'XX';
        lv[x.level].falta.push(t);
        if (res.status === 404) note = 'NO EXISTE (404) -> falta ejecutar SQL';
        else if (res.status === 401 || res.status === 403) note = 'PERMISO (' + res.status + ') -> key inválida o RLS';
        else note = 'HTTP ' + res.status;
      }
      console.log(mark, pad('[' + x.level + ']', 14), pad(t, 22), note);
    } catch (e) {
      lv[x.level].falta.push(t);
      console.log('XX', pad('[' + x.level + ']', 14), pad(t, 22), 'error red: ' + (e.message || e));
    }
  }

  console.log('');
  console.log('— RESUMEN POR NIVEL —');
  console.log('  Críticos    : ' + lv.critico.ok + '/' + lv.critico.total + (lv.critico.falta.length ? '  faltan: ' + lv.critico.falta.join(', ') : ''));
  console.log('  Recomendados: ' + lv.recomendado.ok + '/' + lv.recomendado.total + (lv.recomendado.falta.length ? '  faltan: ' + lv.recomendado.falta.join(', ') : ''));
  console.log('  Opcionales  : ' + lv.opcional.ok + '/' + lv.opcional.total + (lv.opcional.falta.length ? '  faltan: ' + lv.opcional.falta.join(', ') : ''));
  console.log('');
  const lista = lv.critico.ok === lv.critico.total;
  console.log(
    lista
      ? '✅ VEREDICTO: Conexión LISTA y adecuada (todos los críticos OK).'
      : '⛔ VEREDICTO: Conexión NO lista — faltan críticos: ' + lv.critico.falta.join(', ') + '. Ejecute los scripts obligatorios (1–4 y 10).'
  );
  console.log('');
})();
