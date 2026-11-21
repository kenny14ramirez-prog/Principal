/**
 * Crozzo AI Chat History - persistencia de conversaciones (SQLite data/ai/chat.db cuando disponible, localStorage fallback).
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_ai_chat_history_v1';
  var MAX = 300;

  function load() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(LS_KEY) : null;
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function save(history) {
    try {
      if (!global.localStorage) return false;
      var arr = Array.isArray(history) ? history.slice(-MAX) : [];
      global.localStorage.setItem(LS_KEY, JSON.stringify(arr));
      return true;
    } catch (_) { return false; }
  }

  function clear() {
    try { if (global.localStorage) global.localStorage.removeItem(LS_KEY); } catch (_) {}
  }

  async function loadAsync() {
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        var r = await global.__TAURI__.core.invoke('crozzo_chat_history_load');
        if (Array.isArray(r)) return r;
      }
    } catch (_) {}
    return load();
  }

  async function saveAsync(history) {
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        await global.__TAURI__.core.invoke('crozzo_chat_history_save', { history: history });
        return true;
      }
    } catch (_) {}
    return save(history);
  }

  global.CrozzoAiChatHistory = {
    load: load,
    save: save,
    clear: clear,
    loadAsync: loadAsync,
    saveAsync: saveAsync,
    dbPath: 'data/ai/chat.db'
  };
})(typeof window !== 'undefined' ? window : globalThis);