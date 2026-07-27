#!/usr/bin/env node
/** Launcher MCP mcp-code-context */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = join(root, 'node_modules', 'mcp-code-context', 'dist', 'src', 'index.js');

if (!existsSync(entry)) {
  process.stderr.write('[crozzo-mcp] mcp-code-context no instalado. npm i -D mcp-code-context\n');
  process.exit(1);
}

const child = spawn(process.execPath, [entry], {
  cwd: root,
  env: { ...process.env, LOG_LEVEL: process.env.LOG_LEVEL || 'warn' },
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (err) => {
  process.stderr.write('[crozzo-mcp] code-context spawn: ' + err.message + '\n');
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
