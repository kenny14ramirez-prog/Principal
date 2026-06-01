/**
 * Comprobaciones compartidas: release estable para Windows, macOS y Android.
 */
export const OWNER = 'kenny14ramirez-prog';
export const REPO = 'Principal';
export const PRODUCT = 'Proyecto';
export const RELEASE_BASE = `https://github.com/${OWNER}/${REPO}/releases/download`;
export const API_TAG = `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/`;

export const MIN_BYTES = {
  exe: 400 * 1024,
  dmg: 1024 * 1024,
  apk: 800 * 1024,
};

export function semverCore(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split('-')[0]
    .trim();
}

export function norm(v) {
  const s = String(v || '').trim();
  return s.indexOf('v') === 0 ? s : 'v' + s;
}

export async function fetchJson(url, ms = 20000, token) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + '_=' + Date.now(), {
      cache: 'no-store',
      signal: ctrl.signal,
      headers,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, error: e.message, data: null };
  }
}

export async function headUrl(url) {
  try {
    const res = await fetch(url + '?_=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    return { ok: res.ok, status: res.status, bytes: len };
  } catch (e) {
    return { ok: false, status: 0, bytes: 0, error: e.message };
  }
}

export function pickApkFromAssets(assets) {
  if (!Array.isArray(assets)) return null;
  const signed = assets.filter((a) => {
    const n = String(a.name || a.url || '');
    return /\.apk$/i.test(n) && !/unsigned/i.test(n);
  });
  const pool = signed.length ? signed : assets;
  const preferred = pool.find((a) => {
    const n = String(a.name || a.url || '');
    return /\.apk$/i.test(n) && (/aarch64|arm64|arm-v8|universal|Proyecto_/i.test(n) || !/x86|x86_64/i.test(n));
  });
  if (preferred) return preferred;
  return pool.find((a) => /\.apk$/i.test(a.name || a.url || '')) || null;
}

export function pickMacDmgs(assets) {
  if (!Array.isArray(assets)) return { arm: null, intel: null, any: null };
  const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name || a.url || ''));
  const arm = dmgs.find((a) => /aarch64|arm64|apple|universal/i.test(a.name || ''));
  const intel = dmgs.find((a) => /x86_64|intel|x64/i.test(a.name || ''));
  return { arm: arm || null, intel: intel || null, any: dmgs[0] || null };
}

export function assetOk(asset, minBytes) {
  if (!asset) return false;
  const size = asset.size || asset.bytes || 0;
  if (size > 0 && size < minBytes) return false;
  return !!(asset.url || asset.browser_download_url || asset.name);
}

export async function fetchReleaseAssets(ver, token) {
  const tag = 'v' + semverCore(ver);
  const r = await fetchJson(API_TAG + encodeURIComponent(tag), 20000, token);
  if (!r.ok || !r.data) return null;
  return {
    tag: r.data.tag_name || tag,
    assets: (r.data.assets || []).map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
    })),
    html: r.data.html_url,
  };
}

export async function probeLatestJson(ver) {
  const tag = 'v' + semverCore(ver);
  const url = `${RELEASE_BASE}/${tag}/latest.json`;
  const r = await fetchJson(url);
  if (!r.ok || !r.data?.platforms) return null;
  const p = r.data.platforms;
  return {
    version: norm(r.data.version || ver),
    windows:
      p['windows-x86_64-nsis'] ||
      p['windows-x86_64'] ||
      p['windows-x86_64-msi'],
    darwinArm: p['darwin-aarch64'],
    darwinX64: p['darwin-x86_64'],
    darwinUniversal: p['darwin-universal'],
  };
}

/**
 * Evalúa si un tag de release es estable para la mayoría de dispositivos Crozzo.
 */
export async function evaluateReleaseStability(ver, token) {
  const version = norm(ver);
  const api = await fetchReleaseAssets(version, token);
  const latest = await probeLatestJson(version);

  const assets = api?.assets || [];
  const setup = assets.find((a) => /setup\.exe/i.test(a.name || ''));
  const dmgs = pickMacDmgs(assets);
  const apk = pickApkFromAssets(assets);

  const windows = {
    ok: assetOk(setup, MIN_BYTES.exe),
    name: setup?.name || '',
    size: setup?.size || 0,
    url: setup?.url || '',
  };

  const mac = {
    ok: assetOk(dmgs.arm, MIN_BYTES.dmg) || assetOk(dmgs.intel, MIN_BYTES.dmg) || assetOk(dmgs.any, MIN_BYTES.dmg),
    arm: dmgs.arm?.name || '',
    intel: dmgs.intel?.name || '',
    any: dmgs.any?.name || '',
  };

  const android = {
    ok: assetOk(apk, MIN_BYTES.apk),
    name: apk?.name || '',
    size: apk?.size || 0,
    url: apk?.url || '',
  };

  const latestJson = {
    ok: !!(latest?.windows?.url),
    windowsExe: latest?.windows?.url ? /setup\.exe/i.test(latest.windows.url) : false,
    macEntries: !!(latest?.darwinArm?.url || latest?.darwinX64?.url || latest?.darwinUniversal?.url),
  };

  const platformsOk = [windows.ok, mac.ok, android.ok].filter(Boolean).length;
  const complete = windows.ok && mac.ok && android.ok && latestJson.ok && latestJson.windowsExe;

  return {
    version,
    windows,
    mac,
    android,
    latestJson,
    complete,
    majorityStable: platformsOk >= 2,
    platformsOk,
    tagFound: !!api,
  };
}
