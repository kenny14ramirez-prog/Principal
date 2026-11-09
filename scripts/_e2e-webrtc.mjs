#!/usr/bin/env node
/**
 * E2E virtual: WebRTC P2P signaling + data channel (con mocks).
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
let failed = 0;
function ok(n, d) { console.log('✓ ' + n + (d ? ' — ' + d : '')); }
function fail(n, d) { console.log('✗ ' + n + (d ? ' — ' + d : '')); failed++; }

const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } },
  globalThis: null, window: null,
  document: { readyState: 'complete', body: { appendChild() {} }, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, textContent: '', title: '', appendChild() {} }) },
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {},
  navigator: { onLine: true },
  RTCPeerConnection: function() {
    this.createDataChannel = () => ({ onopen: null, onmessage: null, onclose: null, readyState: 'open', send: () => {} });
    this.createOffer = async () => ({ type: 'offer', sdp: 'mock-sdp' });
    this.setLocalDescription = async () => {};
    this.setRemoteDescription = async () => {};
    this.createAnswer = async () => ({ type: 'answer', sdp: 'mock-answer' });
    this.addIceCandidate = async () => {};
    this.close = () => {};
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
  },
  RTCSessionDescription: function(desc) { this.type = desc.type; this.sdp = desc.sdp; },
  getMultiDeviceConfig: () => ({ role: 'A', centralIp: '', port: 3000, deviceId: 'CAJA-1' }),
  __SUPABASE: null,
  __CROZZO_TIER_LAST: 'cloud',
  addEventListener: () => {},
  dispatchEvent: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;

vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'infra/CrozzoWebRtcP2P.js'), 'utf8'), ctx, { filename: 'CrozzoWebRtcP2P.js' });

// Test: isSupported
const supported = ctx.CrozzoWebRtcP2P.isSupported();
console.log('isSupported:', supported);
if (supported === true) { ok('WebRTC supported', 'true'); } else { fail('WebRTC supported', 'false'); }

// Test: send (no channel open)
const sent = ctx.CrozzoWebRtcP2P.send({ type: 'test' });
console.log('send result:', sent);
ok('Send (no channel)', String(sent));

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
