#!/usr/bin/env node
/**
 * beforeShellExecution — hard-gates Crozzo:
 *  - niega git push --force / -f hacia main|master
 *  - niega escritura/borrado directo en src/ (espejo), no src-tauri/
 *  - permite npm run sync (copia canónica app→src)
 */
import { readFileSync } from 'node:fs';

function allow() {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

function deny(msg) {
  process.stdout.write(
    JSON.stringify({ permission: 'deny', user_message: msg, agent_message: msg })
  );
  process.exit(2);
}

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

const payload = readStdinSync();
const cmd = String(payload.command || payload.cmd || '').trim();
if (!cmd) allow();

// sync canónico: debe poder escribir src/
if (/\bnpm(?:\.cmd)?\s+run\s+sync\b/i.test(cmd)) allow();
if (/\bnode\b[\s\S]*scripts[\\/].*sync/i.test(cmd)) allow();

// Force push a ramas protegidas
if (/\bgit\b[\s\S]*\bpush\b[\s\S]*(--force\b|-f\b)/i.test(cmd) && /\b(main|master)\b/i.test(cmd)) {
  deny(
    'Shell bloqueado: git push --force a main/master. Si hace falta, hazlo tú manualmente.'
  );
}

// ¿Menciona path bajo src/ que no sea src-tauri?
const srcHits = cmd.match(/(?:^|[\s"'`])((?:\.\.?[\\/])*(?:src)[\\/](?!tauri)[^\s"'`]*)/gi) || [];
if (srcHits.length === 0) allow();

const writeLike =
  /\b(Set-Content|Add-Content|Out-File|tee|New-Item|\bni\b|Copy-Item|\bcp\b|Move-Item|\bmv\b|Remove-Item|\brm\b|\bdel\b|ren|Rename-Item)\b/i.test(
    cmd
  ) ||
  /(^|[;&|])\s*(?:echo|printf|cat)\b[\s\S]*>\s*/i.test(cmd) ||
  />\s*["']?(?:\.\.?[\\/])*src[\\/]/i.test(cmd) ||
  /\b(?:sed|perl)\b[\s\S]*\s-i\b/i.test(cmd);

const readOnly =
  /\b(Get-Content|gc\b|type\b|cat\b|rg\b|ripgrep|findstr|Select-String|grep\b|ls\b|dir\b|Get-ChildItem|git\s+diff|git\s+show|git\s+log)\b/i.test(
    cmd
  ) && !writeLike;

if (writeLike && !readOnly) {
  deny(
    'Shell bloqueado: no escribir/borrar en src/ (espejo). Edita app/ y corre npm run sync. src-tauri/ está permitido.'
  );
}

allow();
