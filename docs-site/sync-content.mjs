#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[1], '../..');
const srcMaps = path.join(root, 'docs/maps');
const srcHC = path.join(root, 'agents/high-command');
const dest = path.join(path.dirname(process.argv[1]), 'src/content/docs');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else {
      let content = fs.readFileSync(s, 'utf8');
      // Remove existing frontmatter if present
      content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      const title = e.name.replace(/\.md$/, '').replace(/[-_]/g, ' ');
      content = `---\ntitle: "${title}"\n---\n\n` + content;
      fs.writeFileSync(d, content);
    }
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
copyDir(srcMaps, path.join(dest, 'maps'));
copyDir(srcHC, path.join(dest, 'high-command'));
// Create index
fs.writeFileSync(path.join(dest, 'index.md'), '---\ntitle: Crozzo POS — Documentación\n---\n\n# Crozzo POS — Documentación\n\n- [Mapas](./maps/)\n- [Alto Mando](./high-command/)\n');
console.log('Content synced from docs/maps and agents/high-command');
