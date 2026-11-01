#!/usr/bin/env node
// Spike: LanceDB vector store (multi-scope) para Synapse.
import { connect } from '@lancedb/lancedb';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'synapse', 'lancedb');
const db = await connect(dbPath);
console.log('LanceDB connected:', dbPath);

// Create table if not exists
const schema = {
  id: 'string',
  text: 'string',
  vector: 'float32[4]',
  scope_user: 'string',
  scope_agent: 'string',
  scope_run: 'string',
  category: 'string',
  timestamp: 'string',
};
let table;
try {
  table = await db.openTable('synapse_memory');
  console.log('Opened existing table');
} catch (e) {
  table = await db.createTable('synapse_memory', [
    { id: '1', text: 'carrito revierte al cobrar', vector: [0.1,0.2,0.3,0.4], scope_user: 'cajero', scope_agent: 'JS-SYNC', scope_run: 'run-1', category: 'issue', timestamp: new Date().toISOString() },
  ]);
  console.log('Created table');
}

// Insert
await table.add([
  { id: '2', text: 'fanout LAN-only early-return', vector: [0.5,0.6,0.7,0.8], scope_user: 'admin', scope_agent: 'FANOUT-GUARDIAN', scope_run: 'run-2', category: 'issue', timestamp: new Date().toISOString() },
]);
console.log('Inserted row');

// Vector search
const results = await table.search([0.1,0.2,0.3,0.4]).limit(5).toArray();
console.log('Search results:', results.length);
for (const r of results) console.log('  ', r.id, r.text, r._distance);

// Filtered search
const filtered = await table.search([0.1,0.2,0.3,0.4]).where("scope_agent = 'JS-SYNC'").limit(5).toArray();
console.log('Filtered (JS-SYNC):', filtered.length);

console.log('SPIKE OK');
