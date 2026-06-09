/**
 * SQL federación — espejo de docs/SUPABASE-SQL-FEDERACION.sql
 */
(function (global) {
  'use strict';
  global.CrozzoFederacionSql = {
    key: 'federacion',
    file: 'docs/SUPABASE-SQL-FEDERACION.sql',
    title: '10. Federación — bodegas y remisiones',
    desc: 'Bodegas, remisiones, bandeja entrante y acuses entre negocios (Opción B). Ejecutar en CADA Supabase de cada sede.',
    required: false,
    order: 10,
    text: null,
  };
  global.CrozzoFederacionSql.loadText = function () {
    if (global.CrozzoFederacionSql.text) return Promise.resolve(global.CrozzoFederacionSql.text);
    return fetch('docs/SUPABASE-SQL-FEDERACION.sql')
      .then(function (r) {
        if (!r.ok) throw new Error('fetch');
        return r.text();
      })
      .then(function (t) {
        global.CrozzoFederacionSql.text = t;
        return t;
      })
      .catch(function () {
        global.CrozzoFederacionSql.text =
          '-- Abra docs/SUPABASE-SQL-FEDERACION.sql en el repositorio y pegue aquí.\n-- Super Admin → Federación → copiar SQL.';
        return global.CrozzoFederacionSql.text;
      });
  };
})(typeof window !== 'undefined' ? window : globalThis);
