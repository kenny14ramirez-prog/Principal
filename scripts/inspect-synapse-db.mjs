import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('synapse/memory.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('tables:', tables.map(t=>t.name).join(', '));
for (const t of tables) {
  console.log('---', t.name);
  console.log(db.prepare('PRAGMA table_info('+t.name+')').all().map(c=>c.name+':'+c.type).join(', '));
  const cnt = db.prepare('SELECT COUNT(*) as n FROM '+t.name).get();
  console.log('rows:', cnt.n);
}
