/**
 * Crozzo POS — WebRTC P2P (complemento de baja latencia).
 * Signaling vía Supabase (broadcast). DataChannel para sync de comandas/runtime.
 * Fallback automático a HTTP/WS si WebRTC no disponible o falla (timeout 5s).
 * Reconexión automática (exponential backoff) + transferencia de archivos grandes por chunks (16KB) con ACK.
 */
(function (global) {
  'use strict';

  var __pc = null;
  var __dc = null;
  var __signaling = null;
  var __started = false;
  var __p2pOpen = false;
  var __makingOffer = false;
  var __ignoreOffer = false;
  var __fallbackTimer = null;
  var __fallbackDone = false;
  var __lastPeerId = '';
  var __reconnectTimer = null;
  var __reconnectAttempt = 0;
  var __reconnectMaxDelay = 30000;
  var __intentionalClose = false;
  var __fileAckWaiters = {};
  var __fileTransfers = {};

  function md() { return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {}; }

  function myId() {
    try {
      var c = md();
      if (c && c.deviceId) return String(c.deviceId);
    } catch (_) {}
    try {
      return String(global.localStorage.getItem('crozzo_device_id') || global.localStorage.getItem('device_id') || '');
    } catch (_) {}
    return '';
  }

  function isSupported() {
    return !!(global.RTCPeerConnection && global.RTCSessionDescription);
  }

  function isOfferer() {
    try {
      var c = md();
      if (c && c.role === 'B') return false;
      if (c && c.role === 'A') return true;
    } catch (_) {}
    return true;
  }

  function isPolite() {
    try { return md().role === 'B'; } catch (_) { return false; }
  }

  function clearFallback() {
    if (__fallbackTimer) { try { global.clearTimeout(__fallbackTimer); } catch (_) {} __fallbackTimer = null; }
  }

  function startFallbackTimer() {
    clearFallback();
    __fallbackTimer = global.setTimeout(function () {
      if (!__p2pOpen && !__fallbackDone) {
        __fallbackDone = true;
        try { global.dispatchEvent(new CustomEvent('crozzo-p2p-fallback')); } catch (_) {}
      }
    }, 5000);
  }

  function clearReconnect() {
    if (__reconnectTimer) { try { global.clearTimeout(__reconnectTimer); } catch (_) {} __reconnectTimer = null; }
  }

  function signalSend(payload) {
    if (!__signaling || typeof __signaling.send !== 'function') return false;
    try {
      __signaling.send({ type: 'broadcast', event: 'signal', payload: payload });
      return true;
    } catch (_) { return false; }
  }

  function bytesToBase64(bytes) {
    if (!bytes || !bytes.length) return '';
    var bin = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      var sub = bytes.subarray ? bytes.subarray(i, Math.min(i + chunk, bytes.length)) : bytes.slice(i, Math.min(i + chunk, bytes.length));
      bin += String.fromCharCode.apply(null, sub);
    }
    try { return global.btoa(bin); } catch (_) { return ''; }
  }

  function base64ToBytes(b64) {
    if (!b64) return new Uint8Array(0);
    try {
      var bin = global.atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (_) { return new Uint8Array(0); }
  }

  function readFileBytes(file) {
    return new Promise(function (resolve, reject) {
      try {
        if (!file) { reject(new Error('no file')); return; }
        if (file instanceof ArrayBuffer) { resolve(new Uint8Array(file)); return; }
        if (file && file.buffer instanceof ArrayBuffer && typeof file.byteLength === 'number') {
          resolve(new Uint8Array(file.buffer, file.byteOffset || 0, file.byteLength));
          return;
        }
        if (typeof Blob !== 'undefined' && file instanceof Blob) {
          var fr = new FileReader();
          fr.onload = function () { try { resolve(new Uint8Array(fr.result)); } catch (e) { reject(e); } };
          fr.onerror = function () { reject(fr.error || new Error('read error')); };
          fr.readAsArrayBuffer(file);
          return;
        }
        if (typeof file === 'string') {
          try {
            if (typeof global.TextEncoder === 'function') {
              resolve(new global.TextEncoder().encode(file));
              return;
            }
          } catch (_) {}
          var arr = new Uint8Array(file.length);
          for (var i = 0; i < file.length; i++) arr[i] = file.charCodeAt(i) & 0xff;
          resolve(arr);
          return;
        }
        if (file && typeof file.arrayBuffer === 'function') {
          file.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }).catch(reject);
          return;
        }
        if (file && (file.data || file.base64)) {
          var b64 = file.data || file.base64;
          if (typeof b64 === 'string') { resolve(base64ToBytes(b64)); return; }
        }
        reject(new Error('unsupported file'));
      } catch (e) { reject(e); }
    });
  }

  function handleFileMessage(msg) {
    if (!msg) return false;
    var type = String(msg.type || '').toLowerCase();
    if (type === 'file_start') {
      if (!msg.transferId) return true;
      __fileTransfers[msg.transferId] = {
        transferId: msg.transferId,
        name: msg.name || 'file',
        size: Number(msg.size) || 0,
        mime: msg.mime || 'application/octet-stream',
        totalChunks: Number(msg.totalChunks) || 1,
        chunkSize: Number(msg.chunkSize) || 16384,
        chunks: new Array(Number(msg.totalChunks) || 1),
        received: 0,
        finalized: false
      };
      return true;
    }
    if (type === 'file_chunk') {
      var tr = __fileTransfers[msg.transferId];
      if (!tr) return true;
      var idx = Number(msg.index);
      if (isNaN(idx) || idx < 0 || idx >= tr.totalChunks) return true;
      if (!tr.chunks[idx]) {
        tr.chunks[idx] = base64ToBytes(msg.data);
        tr.received++;
      }
      try { send({ type: 'file_ack', transferId: msg.transferId, index: idx }); } catch (_) {}
      if (tr.received >= tr.totalChunks) finalizeFile(tr);
      return true;
    }
    if (type === 'file_ack') {
      var key = String(msg.transferId) + ':' + String(msg.index);
      var waiter = __fileAckWaiters[key];
      if (waiter) {
        delete __fileAckWaiters[key];
        try { waiter.resolve(true); } catch (_) {}
      }
      return true;
    }
    if (type === 'file_end') {
      var tr2 = __fileTransfers[msg.transferId];
      if (tr2 && tr2.received >= tr2.totalChunks) finalizeFile(tr2);
      return true;
    }
    return false;
  }

  function finalizeFile(tr) {
    if (!tr || tr.finalized) return;
    tr.finalized = true;
    try {
      var totalLen = 0;
      for (var i = 0; i < tr.chunks.length; i++) {
        if (tr.chunks[i] && tr.chunks[i].length) totalLen += tr.chunks[i].length;
      }
      var out = new Uint8Array(totalLen);
      var off = 0;
      for (var j = 0; j < tr.chunks.length; j++) {
        var c = tr.chunks[j];
        if (c && c.length) { out.set(c, off); off += c.length; }
      }
      var blob = null;
      try { blob = new Blob([out], { type: tr.mime || 'application/octet-stream' }); } catch (_) { blob = null; }
      var detail = { transferId: tr.transferId, name: tr.name, size: tr.size || totalLen, mime: tr.mime, bytes: out, blob: blob };
      try { global.dispatchEvent(new CustomEvent('crozzo-p2p-file', { detail: detail })); } catch (_) {}
      if (typeof global.__crozzoP2PHandleFile === 'function') {
        try { global.__crozzoP2PHandleFile(detail); } catch (_) {}
      }
    } catch (_) {}
    delete __fileTransfers[tr.transferId];
  }

  function wireDataChannel(dc) {
    if (!dc) return;
    __dc = dc;
    dc.onopen = function () {
      __p2pOpen = true;
      __reconnectAttempt = 0;
      clearReconnect();
      clearFallback();
      try { global.dispatchEvent(new CustomEvent('crozzo-p2p-open')); } catch (_) {}
    };
    dc.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (handleFileMessage(msg)) return;
        if (typeof global.__crozzoP2PHandleMessage === 'function') global.__crozzoP2PHandleMessage(msg);
      } catch (_) {}
    };
    dc.onclose = function () {
      __p2pOpen = false;
      try { global.dispatchEvent(new CustomEvent('crozzo-p2p-close')); } catch (_) {}
      global.setTimeout(function () { scheduleReconnect(); }, 250);
    };
    dc.onerror = function () { };
  }

  function setupPeer(offerer) {
    if (!isSupported()) return false;
    try {
      __pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      __pc.onicecandidate = function (e) {
        if (e.candidate && __signaling) {
          signalSend({ type: 'ice', candidate: e.candidate, from: myId(), to: __lastPeerId || 'all' });
        }
      };
      __pc.ondatachannel = function (ev) {
        if (ev && ev.channel) wireDataChannel(ev.channel);
      };
      __pc.onconnectionstatechange = function () {
        try {
          var st = __pc && __pc.connectionState;
          if (st === 'failed' || st === 'disconnected') {
            __p2pOpen = false;
            scheduleReconnect();
          }
        } catch (_) {}
      };
      if (offerer) {
        __dc = __pc.createDataChannel('crozzo', { ordered: true });
        wireDataChannel(__dc);
      }
      startFallbackTimer();
      return true;
    } catch (_) { return false; }
  }

  function scheduleReconnect() {
    if (!__started || __intentionalClose) return;
    if (__p2pOpen) return;
    if (__reconnectTimer) return;
    __reconnectAttempt = Math.min((__reconnectAttempt || 0) + 1, 10);
    var base = Math.min(1000 * Math.pow(2, __reconnectAttempt - 1), __reconnectMaxDelay);
    var jitter = Math.floor(Math.random() * 500);
    var delay = base + jitter;
    __reconnectTimer = global.setTimeout(function () {
      __reconnectTimer = null;
      reconnectNow();
    }, delay);
  }

  function teardownPeer() {
    __p2pOpen = false;
    try {
      if (__dc) {
        try { __dc.onopen = null; } catch (_) {}
        try { __dc.onmessage = null; } catch (_) {}
        try { __dc.onclose = null; } catch (_) {}
        try { __dc.onerror = null; } catch (_) {}
        try { __dc.close(); } catch (_) {}
      }
    } catch (_) {}
    __dc = null;
    try {
      if (__pc) { try { __pc.close(); } catch (_) {} }
    } catch (_) {}
    __pc = null;
    __makingOffer = false;
  }

  function reconnectNow() {
    if (!__started || __intentionalClose) return false;
    if (__p2pOpen) return true;
    teardownPeer();
    var ok = setupPeer(isOfferer());
    if (!ok) { scheduleReconnect(); return false; }
    if (isOfferer()) {
      global.setTimeout(function () { createOffer(); }, 500);
    }
    return true;
  }

  function createOffer() {
    if (!__pc) {
      if (!setupPeer(true)) return Promise.resolve(false);
    }
    if (!__signaling) return Promise.resolve(false);
    __makingOffer = true;
    return __pc.createOffer().then(function (offer) {
      return __pc.setLocalDescription(offer);
    }).then(function () {
      signalSend({ type: 'offer', sdp: __pc.localDescription, from: myId(), to: 'all' });
      return true;
    }).catch(function () {
      __makingOffer = false;
      return false;
    });
  }

  function createAnswer() {
    if (!__pc) return Promise.resolve(false);
    return __pc.createAnswer().then(function (answer) {
      return __pc.setLocalDescription(answer);
    }).then(function () {
      signalSend({ type: 'answer', sdp: __pc.localDescription, from: myId(), to: __lastPeerId || 'all' });
      return true;
    }).catch(function () {
      return false;
    });
  }

  function handleOffer(msg) {
    if (!msg || !msg.sdp) return;
    if (!__pc || __pc.connectionState === 'closed' || __pc.connectionState === 'failed') {
      setupPeer(false);
    }
    if (!__pc) return;
    __lastPeerId = msg.from || __lastPeerId;
    var collision = __makingOffer || (__pc.signalingState !== 'stable');
    if (collision && !isPolite()) {
      return;
    }
    var p = Promise.resolve();
    if (collision && isPolite()) {
      p = __pc.setLocalDescription({ type: 'rollback' }).catch(function () {});
    }
    p.then(function () {
      return __pc.setRemoteDescription(new global.RTCSessionDescription(msg.sdp));
    }).then(function () {
      return createAnswer();
    }).catch(function () {});
  }

  function handleAnswer(msg) {
    if (!__pc || !msg || !msg.sdp) return;
    if (__pc.signalingState !== 'have-local-offer') return;
    __pc.setRemoteDescription(new global.RTCSessionDescription(msg.sdp)).catch(function () {});
  }

  function handleIce(msg) {
    if (!__pc || !msg || !msg.candidate) return;
    __pc.addIceCandidate(msg.candidate).catch(function () {});
  }

  function handleSignal(msg) {
    if (!msg || !__pc) {
      // intentar crear peer receptor si llega señal sin peer
      if (msg && msg.type === 'offer') {
        setupPeer(false);
      }
      if (!__pc) return;
    }
    var self = myId();
    if (msg.from && self && msg.from === self) return;
    if (msg.to && msg.to !== 'all' && self && msg.to !== self) return;
    if (msg.type === 'offer') {
      handleOffer(msg);
    } else if (msg.type === 'answer') {
      handleAnswer(msg);
    } else if (msg.type === 'ice') {
      handleIce(msg);
    }
  }

  function send(obj) {
    if (__dc && __dc.readyState === 'open') {
      try { __dc.send(JSON.stringify(obj)); return true; } catch (_) {}
    }
    return false;
  }

  function sendFile(file) {
    return new Promise(function (resolve, reject) {
      if (!__dc || __dc.readyState !== 'open') {
        reject(new Error('p2p not open'));
        return;
      }
      readFileBytes(file).then(function (bytes) {
        var name = (file && file.name) ? String(file.name) : 'file';
        var mime = (file && file.type) ? String(file.type) : 'application/octet-stream';
        var size = bytes.length;
        var chunkSize = 16 * 1024;
        var total = Math.ceil(size / chunkSize);
        if (total < 1) total = 1;
        var transferId = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        if (!send({ type: 'file_start', transferId: transferId, name: name, size: size, mime: mime, totalChunks: total, chunkSize: chunkSize })) {
          reject(new Error('send start failed'));
          return;
        }
        var index = 0;
        var sendNext = function () {
          if (index >= total) {
            try { send({ type: 'file_end', transferId: transferId }); } catch (_) {}
            resolve({ transferId: transferId, name: name, size: size, chunks: total });
            return;
          }
          var start = index * chunkSize;
          var end = Math.min(start + chunkSize, size);
          var chunkBytes = bytes.subarray ? bytes.subarray(start, end) : bytes.slice(start, end);
          var b64 = bytesToBase64(chunkBytes);
          var currentIndex = index;
          var attempts = 0;
          var tryChunk = function () {
            attempts++;
            var key = transferId + ':' + currentIndex;
            var ackPromise = new Promise(function (res, rej) {
              __fileAckWaiters[key] = { resolve: res, reject: rej };
              var to = global.setTimeout(function () {
                var w = __fileAckWaiters[key];
                if (w) {
                  delete __fileAckWaiters[key];
                  try { w.reject(new Error('ack timeout')); } catch (_) {}
                }
              }, 5000);
              // store timeout handle for cleanup (not strictly needed)
              __fileAckWaiters[key]._to = to;
            });
            var ok = send({ type: 'file_chunk', transferId: transferId, index: currentIndex, total: total, data: b64 });
            if (!ok) {
              delete __fileAckWaiters[key];
              reject(new Error('send chunk failed'));
              return;
            }
            ackPromise.then(function () {
              index++;
              sendNext();
            }).catch(function (err) {
              if (attempts < 3) {
                tryChunk();
              } else {
                delete __fileAckWaiters[key];
                reject(err || new Error('chunk failed'));
              }
            });
          };
          tryChunk();
        };
        // small delay to let start arrive
        global.setTimeout(sendNext, 50);
      }).catch(reject);
    });
  }

  function start() {
    if (__started) return;
    __started = true;
    if (!isSupported()) return;
    try {
      if (global.__SUPABASE && typeof global.__SUPABASE.channel === 'function') {
        __signaling = global.__SUPABASE.channel('crozzo-p2p-signaling');
        __signaling.on('broadcast', { event: 'signal' }, function (payload) {
          handleSignal(payload && payload.payload);
        });
        __signaling.subscribe();
      }
    } catch (_) {}
    setupPeer(isOfferer());
    if (isOfferer()) {
      global.setTimeout(function () { createOffer(); }, 1200);
    }
  }

  // Handler por defecto para mensajes P2P entrantes (baja latencia).
  if (typeof global.__crozzoP2PHandleMessage !== 'function') {
    global.__crozzoP2PHandleMessage = function (msg) {
      try {
        if (!msg) return;
        var type = String(msg.type || msg.event || '').toLowerCase();
        var data = msg.data || msg.payload || msg;
        if (type === 'comanda' || type === 'comanda_new') {
          if (data && data.id != null && typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
            global.__crozzoEmergencyApplyComandaSnapshot(data, { source: 'p2p', skipPrint: false, skipRender: false });
          }
        } else if (type === 'comanda_estado') {
          if (data && global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.applyComandaEstado === 'function') {
            global.CrozzoOperationalIngest.applyComandaEstado(data, { via: 'p2p' });
          }
        } else if (type === 'runtime') {
          if (data && typeof global.crozzoApplyRemoteRuntimeRow === 'function') {
            global.crozzoApplyRemoteRuntimeRow(data, data.savedAt ? new Date(Number(data.savedAt)).toISOString() : null, { quiet: true });
            if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
          }
        }
      } catch (_) {}
    };
  }

  global.CrozzoWebRtcP2P = { start: start, send: send, sendFile: sendFile, isSupported: isSupported, createOffer: createOffer, createAnswer: createAnswer, isOpen: function () { return __p2pOpen; }, reconnect: reconnectNow };
  global.crozzoP2PSend = send;
  global.crozzoP2PSendFile = sendFile;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 2000); });
  } else {
    setTimeout(start, 2000);
  }
})(typeof window !== 'undefined' ? window : globalThis);