/**
 * Versión canónica Crozzo POS: máximo entre tauri.conf, OTA local y release GitHub.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_GITHUB_RELEASES_API =
  'https://api.github.com/repos/kenny14ramirez-prog/Principal/releases/latest';

export function parseCore(v) {
  const s = String(v || '').replace(/^v/i, '').trim();
  const core = s.split('-')[0];
  const parts = core.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

export function compareSemver(a, b) {
  const pa = parseCore(a);
  const pb = parseCore(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export function formatSemver(parts) {
  return parts.join('.');
}

export function bumpPatchSemver(v) {
  const p = parseCore(v);
  p[2] += 1;
  return formatSemver(p);
}

export function readTauriVersion(root) {
  try {
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    return String(conf.version || '').trim();
  } catch (_) {
    return '';
  }
}

export function readOtaMaxVersion(root) {
  const paths = [join(root, 'releases', 'latest.json'), join(root, 'releases', 'registry.json')];
  let max = '';
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const list = Array.isArray(data.entries) ? data.entries : data.version ? [data] : [];
      for (const e of list) {
        const v = e.semver || String(e.version || '').replace(/^v/i, '');
        if (v && (!max || compareSemver(v, max) > 0)) max = v;
      }
      const top = data.semver || String(data.version || '').replace(/^v/i, '');
      if (top && (!max || compareSemver(top, max) > 0)) max = top;
    } catch (_) {}
  }
  return max;
}

export async function fetchGitHubReleaseVersion(apiUrl) {
  const url = apiUrl || DEFAULT_GITHUB_RELEASES_API;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CrozzoPOS-VersionSync/1.0' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return String(data.tag_name || data.name || '')
      .replace(/^v/i, '')
      .trim();
  } catch (_) {
    return '';
  }
}

export async function resolveMaxVersion(root, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  const includeRemote = opts.includeRemote !== false;
  let max = readTauriVersion(root) || '1.0.0';
  const ota = readOtaMaxVersion(root);
  if (ota && compareSemver(ota, max) > 0) max = ota;
  if (includeRemote) {
    const remote = await fetchGitHubReleaseVersion(opts.githubReleasesApi);
    if (remote && compareSemver(remote, max) > 0) max = remote;
  }
  return max;
}

export function resolveMaxVersionLocal(root) {
  let max = readTauriVersion(root) || '1.0.0';
  const ota = readOtaMaxVersion(root);
  if (ota && compareSemver(ota, max) > 0) max = ota;
  return max;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const mode = process.argv[2] || '';
  const localOnly = mode === '--local';
  const max = localOnly ? resolveMaxVersionLocal(root) : await resolveMaxVersion(root);
  if (mode === '--next') {
    process.stdout.write(bumpPatchSemver(max));
  } else {
    process.stdout.write(max);
  }
}
