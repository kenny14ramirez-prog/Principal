const fs = require('fs');
const p = 'app/modules/CrozzoHoneypotJaula.js';
let s = fs.readFileSync(p, 'utf8');

// 1. Add module-level vars after "var jaula = {" block's closing? Instead, add before interceptarConfig
const marker = '  // ── Interceptores de datos ──────────────────────────────────────';
const vars = `  // ── Interceptores de datos ──────────────────────────────────────
  var _origConfigGet = null;
  var _origGetUsuariosConfig = null;
  var _origCrozzoGetProductos = null;
  var _origCrozzoGetClientes = null;
  var _origCrozzoGetVentas = null;
  var _intercepted = false;
`;
if (!s.includes(marker)) { console.log('marker not found'); process.exit(1); }
s = s.replace(marker, vars, 1);

// 2. Guard interceptarConfig against double-wrap
const icMarker = '  function interceptarConfig() {\n    if (!jaula.active) return;';
const icNew = '  function interceptarConfig() {\n    if (!jaula.active) return;\n    if (_intercepted) return;\n    _intercepted = true;';
if (!s.includes(icMarker)) { console.log('ic marker not found'); process.exit(1); }
s = s.replace(icMarker, icNew, 1);

// 3. In interceptarConfig, before overwriting config.get, store original
const cfgMarker = "    if (typeof global.config !== 'undefined' && typeof global.config.get === 'function') {\n      const origGet = global.config.get.bind(global.config);";
const cfgNew = "    if (typeof global.config !== 'undefined' && typeof global.config.get === 'function') {\n      _origConfigGet = global.config.get.bind(global.config);\n      const origGet = _origConfigGet;";
if (s.includes(cfgMarker)) s = s.replace(cfgMarker, cfgNew, 1);

// Store originals for other functions (insert before each overwrite)
s = s.replace(
  "    if (typeof global.getUsuariosConfig === 'function') {\n      global.getUsuariosConfig = function () {",
  "    if (typeof global.getUsuariosConfig === 'function') {\n      _origGetUsuariosConfig = global.getUsuariosConfig;\n      global.getUsuariosConfig = function () {",
  1
);
s = s.replace(
  "    if (typeof global.crozzoGetProductos === 'function') {\n      global.crozzoGetProductos = function () {",
  "    if (typeof global.crozzoGetProductos === 'function') {\n      _origCrozzoGetProductos = global.crozzoGetProductos;\n      global.crozzoGetProductos = function () {",
  1
);
s = s.replace(
  "    if (typeof global.crozzoGetClientes === 'function') {\n      global.crozzoGetClientes = function () {",
  "    if (typeof global.crozzoGetClientes === 'function') {\n      _origCrozzoGetClientes = global.crozzoGetClientes;\n      global.crozzoGetClientes = function () {",
  1
);
s = s.replace(
  "    if (typeof global.crozzoGetVentas === 'function') {\n      global.crozzoGetVentas = function () {",
  "    if (typeof global.crozzoGetVentas === 'function') {\n      _origCrozzoGetVentas = global.crozzoGetVentas;\n      global.crozzoGetVentas = function () {",
  1
);

// 4. Make wrappers delegate to original when jaula not active
// config.get wrapper: add guard at start of function body
s = s.replace(
  "      global.config.get = function (key) {\n        if (key === 'usuarios') {",
  "      global.config.get = function (key) {\n        if (!jaula.active && _origConfigGet) return _origConfigGet(key);\n        if (key === 'usuarios') {",
  1
);
s = s.replace(
  "      global.getUsuariosConfig = function () {\n        return { staff: [jaula.fakeUser] };",
  "      global.getUsuariosConfig = function () {\n        if (!jaula.active && _origGetUsuariosConfig) return _origGetUsuariosConfig();\n        return { staff: [jaula.fakeUser] };",
  1
);
s = s.replace(
  "      global.crozzoGetProductos = function () {\n        return jaula.fakeProducts.map(function (p) {",
  "      global.crozzoGetProductos = function () {\n        if (!jaula.active && _origCrozzoGetProductos) return _origCrozzoGetProductos();\n        return jaula.fakeProducts.map(function (p) {",
  1
);
s = s.replace(
  "      global.crozzoGetClientes = function () {\n        return jaula.fakeClientes.map(function (c, i) {",
  "      global.crozzoGetClientes = function () {\n        if (!jaula.active && _origCrozzoGetClientes) return _origCrozzoGetClientes();\n        return jaula.fakeClientes.map(function (c, i) {",
  1
);
s = s.replace(
  "      global.crozzoGetVentas = function () {\n        return jaula.fakeVentas.map(function (v, i) {",
  "      global.crozzoGetVentas = function () {\n        if (!jaula.active && _origCrozzoGetVentas) return _origCrozzoGetVentas();\n        return jaula.fakeVentas.map(function (v, i) {",
  1
);

// 5. In desactivar(), restore originals and reset _intercepted
const desactMarker = "  function desactivar() {\n    jaula.active = false;";
const desactNew = "  function desactivar() {\n    jaula.active = false;\n    // Restaurar funciones originales\n    if (_origConfigGet && typeof global.config !== 'undefined') global.config.get = _origConfigGet;\n    if (_origGetUsuariosConfig) global.getUsuariosConfig = _origGetUsuariosConfig;\n    if (_origCrozzoGetProductos) global.crozzoGetProductos = _origCrozzoGetProductos;\n    if (_origCrozzoGetClientes) global.crozzoGetClientes = _origCrozzoGetClientes;\n    if (_origCrozzoGetVentas) global.crozzoGetVentas = _origCrozzoGetVentas;\n    _origConfigGet = null; _origGetUsuariosConfig = null; _origCrozzoGetProductos = null; _origCrozzoGetClientes = null; _origCrozzoGetVentas = null;\n    _intercepted = false;";
if (!s.includes(desactMarker)) { console.log('desact marker not found'); process.exit(1); }
s = s.replace(desactMarker, desactNew, 1);

fs.writeFileSync(p, s, 'utf8');
console.log('done');