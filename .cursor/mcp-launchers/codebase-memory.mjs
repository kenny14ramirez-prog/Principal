#!/usr/bin/env node
/** Launcher MCP codebase-memory */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = join(root, 'node_modules', 'codebase-memory-mcp', 'bin.js');

if (!existsSync(entry)) {
  process.stderr.write('[crozzo-mcp] codebase-memory-mcp no instalado. npm i -D codebase-memory-mcp\n');
  process.exit(1);
}

const child = spawn(process.execPath, [entry], {
  cwd: root,
  env: { ...process.env },
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (err) => {
  process.stderr.write('[crozzo-mcp] codebase-memory spawn: ' + err.message + '\n');
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
