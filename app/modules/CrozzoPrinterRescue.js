(function (global) {
  'use strict';
  function escUserAttr(s) {
    if (typeof global.escUserAttr === 'function') return global.escUserAttr(s);
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function showToast(msg, type) {
    if (typeof global.showToast === 'function') global.showToast(msg, type);
  }
  function showModal(title, content, options) {
    if (typeof global.showModal === 'function') return global.showModal(title, content, options);
  }
  function getAvailablePrintersList() {
    return typeof global.getAvailablePrintersList === 'function' ? global.getAvailablePrintersList() : [];
  }
  function getFacturacionAdminConfig() {
    return typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
  }
/** Catálogo rescate impresoras POS — marcas frecuentes en Colombia y Latinoamérica (crece con el tiempo) */
const PRINTER_RESCUE_DB = {
  Aclas: {
    support: 'https://www.aclas.com/support/download/',
    models: ['PP-8800', 'PP-8802', 'PP-7000', 'PP-6900', 'PP-6800']
  },
  Axiohm: {
    support: 'https://www.honeywellaidc.com/support-downloads',
    models: ['A794', 'A795', 'A796', 'A798', 'A799', 'A794-80']
  },
  Bematech: {
    support: 'https://www.elgin.com.br/Produtos/impressoras',
    models: ['MP-4200 TH', 'MP-2800 TH', 'MP-2500 TH', 'MP-4000 TH', 'MP-20 MI', 'MP-2100 TH']
  },
  Bixolon: {
    support: 'https://www.bixolon.com/page.php?menu_id=102',
    models: ['SRP-350III', 'SRP-350plusIII', 'SRP-E300', 'SRP-S300', 'SRP-Q300', 'SRP-275III', 'SRP-330II', 'SRP-340II', 'SPP-R200III', 'SPP-R310']
  },
  Brother: {
    support: 'https://support.brother.com/',
    models: ['QL-820NWB', 'QL-1110NWB', 'TD-4410D', 'TD-4550DN', 'TD-2130N', 'RJ-4250WB', 'RJ-3250WB']
  },
  Cashino: {
    support: 'https://www.cashino.com/download/',
    models: ['CSN-A1', 'CSN-A2', 'CSN-A4', 'CSN-C1', 'CSN-C2', 'CSN-80']
  },
  Citizen: {
    support: 'https://www.citizen-systems.com/en/support/download/',
    models: ['CT-S310II', 'CT-S4000', 'CT-S601', 'CT-S651', 'CT-E351', 'CT-E651', 'CT-S2000', 'CT-S4500']
  },
  'Control iD': {
    support: 'https://www.controlid.com.br/suporte/',
    models: ['Print iD', 'Print iD Touch', 'Print iD Touch Pro', 'Print iD Pro']
  },
  Custom: {
    support: 'https://www.custom.it/en/support/downloads/',
    models: ['VKP80III', 'VKP80II', 'KPM180H', 'KPM180H CUBE', 'TG2480-H', 'P3L', 'Q3X']
  },
  Daruma: {
    support: 'https://www.daruma.com.br/suporte/',
    models: ['DR700', 'DR800', 'DR800L', 'DR600', 'DR800L-USB', 'FS700 LPT']
  },
  Datecs: {
    support: 'https://www.datecs.bg/en/support/downloads',
    models: ['DP-25', 'DP-35', 'DP-50', 'WP-50', 'WP-500', 'FP-700']
  },
  'Digital POS': {
    support: 'https://www.digitalinc.com.co/descargas2.php',
    modelUrls: {
      'DIG-D300I': 'https://www.digitalinc.com.co/DIG-D300I.php',
      'DIG-F350 PRO': 'https://www.digitalinc.com.co/DIG-F350PRO.php',
      'DIG-ISH58': 'https://www.digitalinc.com.co/DIG-ISH58.php',
      'DIG-K200L': 'https://www.digitalinc.com.co/DIG-K200L.php',
      'DIG-K260L': 'https://www.digitalinc.com.co/DIG-K260L.php'
    },
    models: [
      'DIG-D300I',
      'DIG-F350 PRO',
      'DIG-ISH58',
      'DIG-K200L',
      'DIG-K260L',
      'DIG-M324',
      'DIG-381',
      'DIG-V330',
      'DIG-2406T PRO'
    ]
  },
  Elgin: {
    support: 'https://www.elgin.com.br/Produtos/impressoras',
    models: ['i9', 'i7 PLUS', 'i8', 'M10', 'L42 PRO FULL', 'L42 PRO', 'Fitpos L42']
  },
  Epson: {
    support: 'https://download.ebz.epson.net/dsc/search/01/search/',
    models: ['TM-T20III', 'TM-T20II', 'TM-T82III', 'TM-T82II', 'TM-T88VI', 'TM-T88VII', 'TM-m30II', 'TM-m30III', 'TM-U220', 'TM-U220B', 'TM-T70', 'TM-P20', 'TM-P60II', 'TM-P80', 'TM-L100']
  },
  Fujitsu: {
    support: 'https://www.fujitsu.com/global/support/products/computing/peripheral/printers/downloads/',
    models: ['FP-1000', 'FP-1100', 'FP-510', 'FP-530KII', 'FP-830']
  },
  'Generic POS-58/80': {
    support: 'ms-settings:printers',
    models: ['POS-58', 'POS-80', 'POS-80C', 'POS-5890K', 'RP80USE', 'POS-58III', 'POS-80III']
  },
  GOOJPRT: {
    support: 'https://www.goojprt.com/pages/download',
    models: ['PT-210', 'PT-280', 'MTP-3', 'MTP-II', 'JP-Q1', 'JP-58H']
  },
  Gprinter: {
    support: 'https://www.gprinter.net/download/',
    models: ['GP-8020III', 'GP-9126T', 'GP-5890XIII', 'GP-U80300I', 'GP-L80160I', 'GP-8020I', 'GP-58MBIII']
  },
  Hasar: {
    support: 'https://www.hasar.com/soporte/',
    models: ['PR-F', 'SMH/P-715F', 'SMH/P-715', 'RG-3560-F', 'RG-3560-H', 'P-715F']
  },
  Honeywell: {
    support: 'https://www.honeywellaidc.com/support-downloads',
    models: ['PC42t', 'PC42d', 'PM42', 'PM43', 'PD45', 'RP2', 'RP4']
  },
  HOIN: {
    support: 'https://www.hoinprinter.com/download/',
    models: ['HOP-H58', 'HOP-H80', 'HOP-E801', 'HOP-E802', 'HOP-H801', 'HOP-H802']
  },
  HPRT: {
    support: 'https://www.hprt.com/Download/',
    models: ['TP808', 'TP806', 'TP801', 'TP805', 'MPT-II', 'MPT-III']
  },
  Jolimark: {
    support: 'https://www.jolimark.com/en/service/download/',
    models: ['TP510', 'TP820', 'TP860', 'TP850', 'TP801', 'TP802']
  },
  'Logic Controls': {
    support: 'https://www.logiccontrols.com/support/downloads/',
    models: ['LE1000', 'LE3000', 'LT1000', 'LT4000', 'EP6000', 'EP8000']
  },
  Metapace: {
    support: 'https://www.metapace.de/en/support/downloads/',
    models: ['T-1', 'T-2', 'T-3', 'T-4', 'T-25', 'T-40']
  },
  Mindeo: {
    support: 'https://www.mindeo.com/support/download/',
    models: ['MD-280AT', 'MD-280BT', 'MD-5800', 'MD-6800', 'MD-8800']
  },
  MUNBYN: {
    support: 'https://www.munbyn.com/pages/download',
    models: ['ITPP047', 'ITPP047P', 'ITPP047S', 'ITPP047A', 'ITPP047B', 'ITPP047C']
  },
  NCR: {
    support: 'https://www.ncr.com/support',
    models: ['7197', '7199', '7167', '7168', '7169', 'RealPOS 7197']
  },
  Ocom: {
    support: 'https://www.ocominc.com/download/',
    models: ['OCPP-80C', 'OCPP-58C', 'OCPP-80D', 'OCPP-588', 'POS-5890K']
  },
  OKI: {
    support: 'https://www.okidata.com/support/printers/index.html',
    models: ['PT390', 'PT390F', 'PT390W', 'ML320', 'ML339']
  },
  Olivetti: {
    support: 'https://www.olivetti.com/support',
    models: ['PR2 PLUS', 'PR2', 'PR4 SL', 'PR4', 'PG-306']
  },
  'Partner Tech': {
    support: 'https://www.partnertech.com/support/download/',
    models: ['RP-320', 'RP-330', 'RP-600', 'RP-700', 'CD-7220', 'CD-7220-II']
  },
  Posiflex: {
    support: 'https://www.posiflex.com/en-global/support/download',
    models: ['PP-8800', 'PP-8802', 'PP-7000', 'PP-6900', 'Aura-6900', 'PP-7600', 'PP-9000']
  },
  Posnet: {
    support: 'https://www.posnet.com.ar/soporte/',
    models: ['Thermal 2', 'Thermal 3', 'Duo', 'Thermal 1', 'T4000F', 'T5000F']
  },
  Quorion: {
    support: 'https://www.quorion.com/support/downloads/',
    models: ['QPrint', 'QPrint Plus', 'QPrint BT', 'QPrint Mini', 'QPrint Pro']
  },
  Rongta: {
    support: 'https://www.rongtatech.com/download-center/',
    models: ['RP806', 'RP588', 'RP410', 'RP850', 'RP326', 'RP328', 'RP850P']
  },
  SAT: {
    support: 'https://satpos.com/soporte/',
    models: ['SAT-900', 'SAT-800C', 'SAT-Q80', 'SAT-22T', 'SAT-20T', 'SAT-30T', 'SAT-40T', 'SAT-50T']
  },
  Sewoo: {
    support: 'https://www.miniprinter.com/download/',
    models: ['LK-TE203', 'LK-TE212', 'LK-TL322', 'LK-P20II', 'LK-P12II', 'LK-TE322', 'LK-D31']
  },
  SNBC: {
    support: 'https://www.snbc.cn/en/service/download/',
    models: ['BTP-R880NPV', 'BTP-R580', 'BTP-R880', 'BTP-L525', 'BTP-M300', 'BTP-R180II']
  },
  'Star Micronics': {
    support: 'https://www.starmicronics.com/support/',
    models: ['TSP100III', 'TSP143III', 'TSP654II', 'TSP700II', 'mC-Print3', 'mPOP', 'BSC10', 'SK1-211', 'SK1-311', 'TSP650II']
  },
  Sunmi: {
    support: 'https://www.sunmi.com/en/support/',
    models: ['V2 Pro', 'V2s', 'V3', 'T2', 'T2s', 'T2s Lite', 'D2s', 'D2s Plus']
  },
  Sweda: {
    support: 'https://www.sweda.com.br/suporte/',
    models: ['SI-300S', 'SI-300L', 'SI-150S', 'SI-150L', 'SI-250S', 'SI-250L']
  },
  Tanca: {
    support: 'https://www.tanca.com.br/suporte/',
    models: ['TP-620', 'TP-650', 'TP-820', 'TP-650R', 'TP-620R', 'TP-820R']
  },
  'Toshiba TEC': {
    support: 'https://www.toshibatec.com/support/download/',
    models: ['TRST-A10', 'TRST-A15', 'TRST-A20', 'TRST-A25', 'B-EV4T', 'B-EX4T1']
  },
  TSC: {
    support: 'https://www.tscprinters.com/EN/support/download',
    models: ['TE200', 'TE210', 'TE300', 'TE310', 'TDP-225', 'TDP-247', 'DA210', 'DA220']
  },
  'TVS Electronics': {
    support: 'https://www.tvs-e.in/support/downloads/',
    models: ['RP 3160 Star', 'RP 3200 Plus', 'RP 3220 Star', 'RP 45 Shoppe', 'MLP-250']
  },
  Urovo: {
    support: 'https://www.urovo.com/support/download/',
    models: ['K329', 'K388', 'K419', 'i9000s', 'i6310', 'DT50']
  },
  Woosim: {
    support: 'https://www.woosim.com/download/',
    models: ['WSP-i250', 'WSP-R241', 'WSP-R350', 'WSP-R400', 'WSP-R410', 'WSP-i350']
  },
  Xprinter: {
    support: 'https://www.xprinterglobal.com/support/download/',
    models: ['XP-58IIH', 'XP-80C', 'XP-Q200III', 'XP-N160II', 'XP-80', 'XP-58', 'XP-Q300', 'XP-420B', 'XP-460B', 'XP-P810']
  },
  Zebra: {
    support: 'https://www.zebra.com/us/en/support-downloads/printers.html',
    models: ['ZD220', 'ZD421', 'ZD621', 'GK420t', 'GK420d', 'ZT230', 'ZT411', 'ZQ520', 'ZQ630']
  },
  Zjiang: {
    support: 'https://www.zjiang.com/download/',
    models: ['ZJ-5890K', 'ZJ-8250', 'ZJ-8250BT', 'ZJ-5805', 'ZJ-8220', 'ZJ-5890T', 'ZJ-8330']
  }
};
/** Enlace directo al driver/página del modelo (no descarga nada desde Crozzo). */
function crozzoRescueIsVerifiedSupport(brand) {
  return (
    ['Digital POS', 'Epson', 'Star Micronics', 'SAT', 'Generic POS-58/80', 'Bixolon', 'Citizen', 'Xprinter'].indexOf(
      String(brand || '')
    ) !== -1
  );
}
function crozzoRescueDriverSearchUrl(brand, model) {
  return (
    'https://www.google.com/search?q=' +
    encodeURIComponent(String(brand || '') + ' ' + String(model || '') + ' driver Windows descargar')
  );
}
function crozzoRescueSupportUrl(brand, model) {
  var entry = PRINTER_RESCUE_DB[brand];
  if (!entry) return '';
  var m = String(model || '').trim();
  if (entry.modelUrls && m && entry.modelUrls[m]) return entry.modelUrls[m];
  if (brand === 'Digital POS' && m) {
    return 'https://www.digitalinc.com.co/' + m.replace(/\s+/g, '') + '.php';
  }
  if (brand === 'Epson' && m) {
    var q = m.replace(/\s+/g, '').replace(/-/g, '');
    return 'https://download.ebz.epson.net/dsc/search/01/search/?PID=&s=' + encodeURIComponent(q);
  }
  if (brand === 'Star Micronics' && m) {
    return 'https://www.starmicronics.com/support/?s=' + encodeURIComponent(m);
  }
  if (brand === 'SAT' && m) {
    return 'https://satpos.com/soporte/';
  }
  return entry.support || '';
}
function crozzoRescueOpenExternal(url) {
  url = String(url || '').trim();
  if (!url) return Promise.resolve(false);
  if (url.indexOf('ms-settings:') === 0) {
    try {
      window.location.href = url;
    } catch (_) {}
    return Promise.resolve(true);
  }
  var tu = typeof CrozzoTauriUpdater !== 'undefined' ? CrozzoTauriUpdater : null;
  if (tu && typeof tu.openExternalUrl === 'function') {
    return tu.openExternalUrl(url).then(function (ok) {
      if (!ok) {
        try {
          window.open(url, '_blank', 'noopener');
        } catch (_) {}
      }
      return true;
    });
  }
  try {
    window.open(url, '_blank', 'noopener');
    return Promise.resolve(true);
  } catch (_) {
    return Promise.resolve(false);
  }
}
function openWindowsPrintersSettings() {
  if (typeof showToast === 'function') showToast('Abriendo Impresoras en Windows…', 'info');
  void crozzoRescueOpenExternal('ms-settings:printers');
}
function getPrinterRescueBrands() {
  return Object.keys(PRINTER_RESCUE_DB).sort((a, b) => a.localeCompare(b, 'es'));
}
function normalizePrinterRescueSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function printerRescueQueryMatches(query, brand, model) {
  const q = normalizePrinterRescueSearch(query);
  if (!q) return true;
  const hay = normalizePrinterRescueSearch(String(brand) + ' ' + String(model));
  return q.split(/\s+/).filter(Boolean).every(function (token) {
    return hay.indexOf(token) !== -1;
  });
}
function getPrinterRescueFilteredBrands(query) {
  const all = getPrinterRescueBrands();
  const q = normalizePrinterRescueSearch(query);
  if (!q) return all;
  return all.filter(function (brand) {
    if (normalizePrinterRescueSearch(brand).indexOf(q) !== -1) return true;
    return (PRINTER_RESCUE_DB[brand].models || []).some(function (model) {
      return printerRescueQueryMatches(query, brand, model);
    });
  });
}
function getPrinterRescueFilteredModels(brand, query) {
  const models = PRINTER_RESCUE_DB[brand]?.models || [];
  const q = normalizePrinterRescueSearch(query);
  if (!q) return models;
  return models.filter(function (model) {
    return printerRescueQueryMatches(query, brand, model);
  });
}
function getPrinterRescueSearchHits(query, limit) {
  limit = limit || 24;
  const q = normalizePrinterRescueSearch(query);
  if (!q || q.length < 2) return [];
  const hits = [];
  getPrinterRescueBrands().forEach(function (brand) {
    (PRINTER_RESCUE_DB[brand].models || []).forEach(function (model) {
      if (printerRescueQueryMatches(query, brand, model)) {
        hits.push({ brand: brand, model: model });
      }
    });
  });
  return hits.slice(0, limit);
}
function renderPrinterRescueSearchResultsHtml(query) {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return '';
  const hits = getPrinterRescueSearchHits(q);
  if (!hits.length) {
    return (
      '<div class="crozzo-rescue-search-empty">Sin coincidencias para «' +
      escUserAttr(q) +
      '». Revise la etiqueta del equipo. Pruebe solo el código (ej. PP-8800, DIG-D300I) o una marca frecuente abajo.</div>'
    );
  }
  return (
    '<ul class="crozzo-rescue-search-list" role="listbox" aria-label="Resultados de búsqueda">' +
    hits
      .map(function (hit) {
        const active =
          hit.brand === printerRescueState.brand && hit.model === printerRescueState.model ? ' is-active' : '';
        return (
          '<li role="presentation">' +
          '<button type="button" class="crozzo-rescue-search-hit' +
          active +
          '" role="option" data-rescue-action="pick" data-brand="' +
          escUserAttr(hit.brand) +
          '" data-model="' +
          escUserAttr(hit.model) +
          '">' +
          '<span class="crozzo-rescue-search-hit__brand">' +
          escUserAttr(hit.brand) +
          '</span>' +
          '<span class="crozzo-rescue-search-hit__model">' +
          escUserAttr(hit.model) +
          '</span>' +
          '</button></li>'
        );
      })
      .join('') +
    '</ul>'
  );
}
let printerRescueState = {
  brand: 'Digital POS',
  model: 'DIG-D300I',
  connectionType: 'USB',
  printerIp: '',
  searchQuery: '',
  sourceLabel: 'sistema',
  phase: 'windows_missing',
};
function crozzoRescueSanitizeSearchQuery(value) {
  var q = String(value || '');
  if (/getAttribute|onclick|function\s*\(/i.test(q)) return '';
  return q;
}
function crozzoPrinterRescueModalRoot() {
  var modal = document.getElementById('modalContent');
  return modal && modal.classList.contains('modal--printer-rescue') ? modal : null;
}
function crozzoRescueNotifySelection(kind) {
  /* Sin toast en cada cambio — evita ruido; feedback solo al guardar/probar. */
}
function openPrinterRescue(source) {
  printerRescueState.sourceLabel = source || 'sistema';
  printerRescueState.searchQuery = '';
  const brands = getPrinterRescueBrands();
  if (!brands.length) {
    showToast('No hay marcas configuradas para rescate', 'warning');
    return;
  }
  if (!PRINTER_RESCUE_DB[printerRescueState.brand]) {
    printerRescueState.brand = 'Digital POS';
    if (!PRINTER_RESCUE_DB[printerRescueState.brand]) printerRescueState.brand = brands[0];
  }
  const models = PRINTER_RESCUE_DB[printerRescueState.brand].models || [];
  if (!models.includes(printerRescueState.model)) {
    printerRescueState.model = models[0] || '';
  }
  var winList = typeof getAvailablePrintersList === 'function' ? getAvailablePrintersList() : [];
  printerRescueState.phase = winList.length ? 'windows_ok' : 'windows_missing';
  var modalTitle =
    printerRescueState.phase === 'windows_missing' ? 'Impresora no reconocida' : 'Configurar impresora';
  showModal(modalTitle, renderPrinterRescueModal(printerRescueState.sourceLabel || 'sistema'), {
    modalClass: 'modal--printer-rescue',
    showClose: true,
  });
  crozzoWirePrinterRescueModal();
}
var __crozzoRescueSearchTimer = null;
function patchPrinterRescueModal(focusOpts) {
  focusOpts = focusOpts || {};
  const modal = crozzoPrinterRescueModalRoot();
  if (!modal) return false;
  const body = modal.querySelector('.modal-body');
  if (!body) return false;
  const scrollEl = body.querySelector('.crozzo-rescue-scroll');
  const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
  body.innerHTML = renderPrinterRescueModal(printerRescueState.sourceLabel || 'sistema');
  const newScroll = body.querySelector('.crozzo-rescue-scroll');
  if (newScroll && scrollTop) newScroll.scrollTop = scrollTop;
  crozzoWirePrinterRescueModal();
  if (focusOpts.focusSearch) initPrinterRescueModal({ focusSearch: true });
  return true;
}
function refreshPrinterRescueModal(resetSearch, focusOpts) {
  if (resetSearch) printerRescueState.searchQuery = '';
  if (!patchPrinterRescueModal(focusOpts || (resetSearch ? { focusSearch: true } : {}))) {
    openPrinterRescue(printerRescueState.sourceLabel || 'sistema');
  }
}
function initPrinterRescueModal(focusOpts) {
  focusOpts = focusOpts || {};
  if (!focusOpts.focusSearch) return;
  const root = crozzoPrinterRescueModalRoot();
  const input = root ? root.querySelector('#rescueSearchInput') : null;
  if (!input) return;
  setTimeout(function () {
    try {
      input.focus();
    } catch (_) {}
  }, 40);
}
function crozzoRescueUpdateSearchUi() {
  var root = crozzoPrinterRescueModalRoot();
  if (!root) return;
  var query = crozzoRescueSanitizeSearchQuery(printerRescueState.searchQuery || '');
  printerRescueState.searchQuery = query;
  var qTrim = String(query).trim();
  var hint = root.querySelector('#rescueSearchHint');
  if (hint) {
    hint.textContent = qTrim
      ? getPrinterRescueSearchHits(qTrim, 30).length + ' resultado(s) — haga clic en el suyo'
      : 'Escriba al menos 2 letras del modelo';
  }
  var results = root.querySelector('#rescueSearchResults');
  if (results) results.innerHTML = renderPrinterRescueSearchResultsHtml(query);
}
function crozzoRescueUpdateSelectionUi() {
  var root = crozzoPrinterRescueModalRoot();
  if (!root) return;
  var slot = root.querySelector('#rescueSelectionSlot');
  if (!slot) return;
  var brand = printerRescueState.brand;
  var model = printerRescueState.model;
  if (brand && model) {
    slot.innerHTML =
      '<div class="crozzo-rescue-selection">Equipo seleccionado: <strong>' +
      escUserAttr(brand) +
      ' · ' +
      escUserAttr(model) +
      '</strong></div>';
  } else {
    slot.innerHTML =
      '<p class="crozzo-rescue-search-hint crozzo-rescue-search-hint--idle">Escriba el modelo de la etiqueta y elija un resultado de la lista.</p>';
  }
}
function crozzoRescueSetSearchInputValue(value) {
  var input = document.getElementById('rescueSearchInput');
  if (!input) return;
  window.__crozzoRescueIgnoreInput = true;
  input.value = value;
  window.__crozzoRescueIgnoreInput = false;
}
function crozzoRescueIntroHtml() {
  return (
    '<div class="crozzo-rescue-intro">' +
    '<p><strong>Crozzo no instala drivers.</strong> Primero Windows debe ver la impresora; después la asigna aquí.</p>' +
    '</div>'
  );
}
function crozzoRescuePhaseToggleHtml() {
  var phase = printerRescueState.phase || 'windows_missing';
  return (
    '<div class="crozzo-rescue-phase" role="tablist" aria-label="Situación con Windows">' +
    '<button type="button" class="crozzo-rescue-phase__btn' +
    (phase === 'windows_missing' ? ' is-active' : '') +
    '" data-rescue-action="phase" data-phase="windows_missing">Windows NO la ve</button>' +
    '<button type="button" class="crozzo-rescue-phase__btn' +
    (phase === 'windows_ok' ? ' is-active' : '') +
    '" data-rescue-action="phase" data-phase="windows_ok">Windows SÍ la ve</button>' +
    '</div>'
  );
}
function crozzoRescueMissingWindowsHtml() {
  return (
    '<section class="crozzo-rescue-step crozzo-rescue-step--alert">' +
    '<h4 class="crozzo-rescue-step__title">Paso 1 · Hacer que Windows la reconozca</h4>' +
    '<ol class="crozzo-rescue-checklist">' +
    '<li>Encienda la impresora y conecte USB firmemente (o verifique cable de red).</li>' +
    '<li>Lea el <strong>modelo exacto</strong> en la etiqueta (ej. DIG-D300I, TM-T20, PP-8800).</li>' +
    '<li>Abra Impresoras en Windows → <strong>Agregar impresora</strong> o instale el driver del fabricante.</li>' +
    '<li>Regrese aquí y pulse <strong>Actualizar lista</strong> abajo.</li>' +
    '</ol>' +
    '<div class="crozzo-rescue-winprn__actions">' +
    '<button type="button" class="btn btn-primary btn-sm" data-rescue-action="win-settings">Abrir Impresoras en Windows</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-rescue-action="refresh-list">Actualizar lista</button>' +
    '</div></section>'
  );
}
function crozzoRescueWinPrintersHtml() {
  var list = typeof getAvailablePrintersList === 'function' ? getAvailablePrintersList() : [];
  var conf = typeof getFacturacionAdminConfig === 'function' ? getFacturacionAdminConfig() : {};
  var current = String(conf.impresoraCajaPos || conf.impresoraComandas || '').trim();
  var emptyHint =
    list.length === 0
      ? '<p class="crozzo-rescue-empty">Windows aún no reporta impresoras. Complete el paso 1 y pulse <strong>Actualizar lista</strong>.</p>'
      : '';
  var opts =
    '<option value="">— Elija impresora —</option>' +
    list
      .map(function (p) {
        var name = String(p || '').trim();
        if (!name) return '';
        return (
          '<option value="' +
          escUserAttr(name) +
          '"' +
          (name === current ? ' selected' : '') +
          '>' +
          escUserAttr(name) +
          '</option>'
        );
      })
      .join('');
  return (
    '<section class="crozzo-rescue-step">' +
    '<h4 class="crozzo-rescue-step__title">Paso 2 · Asignar en Crozzo</h4>' +
    emptyHint +
    '<label class="form-label" for="rescueWinPrinter">Impresora que Windows detecta</label>' +
    '<select id="rescueWinPrinter" class="form-select">' +
    opts +
    '</select>' +
    '<div class="crozzo-rescue-winprn__actions">' +
    '<button type="button" class="btn btn-primary btn-sm" data-rescue-action="assign" data-role="caja">Usar en caja</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-rescue-action="assign" data-role="comandas">Usar en comandas</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-rescue-action="test-print">Probar impresión</button>' +
    '<button type="button" class="btn btn-link btn-sm" data-rescue-action="refresh-list">Actualizar lista</button>' +
    '</div></section>'
  );
}
function crozzoRescueDriverSectionHtml(brand, model) {
  var query = crozzoRescueSanitizeSearchQuery(printerRescueState.searchQuery || '');
  printerRescueState.searchQuery = query;
  var qTrim = String(query).trim();
  var searchResultsHtml = renderPrinterRescueSearchResultsHtml(query);
  var hitsCount = qTrim ? getPrinterRescueSearchHits(qTrim, 30).length : 0;
  var verified = crozzoRescueIsVerifiedSupport(brand);
  var quickHtml = crozzoRescueQuickBrandIds()
    .filter(function (id) {
      return PRINTER_RESCUE_DB[id];
    })
    .map(function (id) {
      var active = id === brand && !qTrim ? ' is-active' : '';
      return (
        '<button type="button" class="crozzo-rescue-quick__btn' +
        active +
        '" data-rescue-action="quick-brand" data-brand="' +
        escUserAttr(id) +
        '">' +
        escUserAttr(id) +
        '</button>'
      );
    })
    .join('');
  var selectionHtml = '<div id="rescueSelectionSlot">';
  selectionHtml +=
    brand && model
      ? '<div class="crozzo-rescue-selection">Equipo seleccionado: <strong>' +
        escUserAttr(brand) +
        ' · ' +
        escUserAttr(model) +
        '</strong></div>'
      : '<p class="crozzo-rescue-search-hint crozzo-rescue-search-hint--idle">Escriba el modelo de la etiqueta y elija un resultado de la lista.</p>';
  selectionHtml += '</div>';
  var driverHelpNote = verified
    ? 'Abriremos la página oficial del fabricante (si responde) o una búsqueda en internet.'
    : 'Muchas webs de fabricantes fallan. Usaremos búsqueda en internet con su marca y modelo.';
  return (
    '<section class="crozzo-rescue-step crozzo-rescue-step--drivers">' +
    '<h4 class="crozzo-rescue-step__title">Paso ' +
    (printerRescueState.phase === 'windows_missing' ? '1b' : '3') +
    ' · Buscar driver (si Windows no la agrega solo)</h4>' +
    '<ol class="crozzo-rescue-checklist crozzo-rescue-checklist--compact">' +
    '<li>Mire la etiqueta de la impresora y escriba marca o modelo abajo.</li>' +
    '<li>Elija su equipo en los resultados.</li>' +
    '<li>Pulse <strong>Buscar cómo instalar driver</strong> y siga las instrucciones de Windows o del fabricante.</li>' +
    '</ol>' +
    '<div class="crozzo-rescue-search-wrap">' +
    '<label class="form-label" for="rescueSearchInput">Marca o modelo (de la etiqueta)</label>' +
    '<input type="search" id="rescueSearchInput" class="form-input crozzo-rescue-search" placeholder="Ej: Digital POS, DIG-D300I, Aclas PP-8800, Epson TM-T20" value="' +
    escUserAttr(query) +
    '" autocomplete="off" aria-label="Buscar impresora por letras">' +
    '<div class="crozzo-rescue-search-hint" id="rescueSearchHint">' +
    (qTrim ? hitsCount + ' resultado(s) — haga clic en el suyo' : 'Escriba al menos 2 letras del modelo') +
    '</div>' +
    '<div id="rescueSearchResults">' +
    searchResultsHtml +
    '</div>' +
    '</div>' +
    '<div class="crozzo-rescue-quick" aria-label="Marcas frecuentes en Colombia">' +
    quickHtml +
    '</div>' +
    selectionHtml +
    '<p class="crozzo-rescue-note">' +
    escUserAttr(driverHelpNote) +
    '</p>' +
    '<div class="crozzo-rescue-winprn__actions">' +
    '<button type="button" class="btn btn-primary btn-sm" data-rescue-action="driver-help">Buscar cómo instalar driver</button>' +
    '<button type="button" class="btn btn-outline btn-sm" data-rescue-action="win-settings">Impresoras en Windows</button>' +
    '</div></section>'
  );
}
function crozzoRescueQuickBrandIds() {
  return ['Digital POS', 'Epson', 'SAT', 'Star Micronics', 'Generic POS-58/80'];
}
function renderPrinterRescueModal(sourceLabel) {
  const allBrands = getPrinterRescueBrands();
  let brand = PRINTER_RESCUE_DB[printerRescueState.brand] ? printerRescueState.brand : allBrands[0];
  let modelOptions = PRINTER_RESCUE_DB[brand].models || [];
  const model = modelOptions.includes(printerRescueState.model) ? printerRescueState.model : modelOptions[0] || '';
  printerRescueState.brand = brand;
  printerRescueState.model = model;
  var phase = printerRescueState.phase || 'windows_missing';
  var phaseBody =
    phase === 'windows_ok'
      ? crozzoRescueWinPrintersHtml() + crozzoRescueDriverSectionHtml(brand, model)
      : crozzoRescueMissingWindowsHtml() + crozzoRescueDriverSectionHtml(brand, model);
  return (
    '<div class="crozzo-rescue-modal">' +
    '<div class="crozzo-rescue-scroll">' +
    crozzoRescueIntroHtml() +
    crozzoRescuePhaseToggleHtml() +
    phaseBody +
    '</div>' +
    '<div class="crozzo-rescue-footer">' +
    '<p class="crozzo-rescue-note">Crozzo no instala software externo. Solo guía y abre Windows o internet.</p>' +
    '</div></div>'
  );
}
function onRescueSearchInput(value) {
  if (window.__crozzoRescueIgnoreInput) return;
  printerRescueState.searchQuery = crozzoRescueSanitizeSearchQuery(value);
  clearTimeout(__crozzoRescueSearchTimer);
  __crozzoRescueSearchTimer = setTimeout(function () {
    crozzoRescueUpdateSearchUi();
  }, 150);
}
function onRescuePhaseChange(phase) {
  phase = String(phase || '').trim();
  if (phase !== 'windows_ok' && phase !== 'windows_missing') return;
  printerRescueState.phase = phase;
  patchPrinterRescueModal({});
}
function onRescuePickHit(brand, model) {
  if (!brand || !model || !PRINTER_RESCUE_DB[brand]) return;
  printerRescueState.brand = brand;
  printerRescueState.model = model;
  printerRescueState.searchQuery = brand + ' · ' + model;
  crozzoRescueSetSearchInputValue(printerRescueState.searchQuery);
  crozzoRescueUpdateSelectionUi();
  crozzoRescueUpdateSearchUi();
  if (typeof showToast === 'function') showToast('Equipo: ' + brand + ' ' + model, 'success');
}
function onRescueQuickBrandSearch(brand) {
  if (!brand || !PRINTER_RESCUE_DB[brand]) return;
  printerRescueState.searchQuery = brand;
  printerRescueState.brand = brand;
  var models = PRINTER_RESCUE_DB[brand].models || [];
  printerRescueState.model = models[0] || '';
  crozzoRescueSetSearchInputValue(brand);
  crozzoRescueUpdateSelectionUi();
  crozzoRescueUpdateSearchUi();
  initPrinterRescueModal({ focusSearch: true });
}
function crozzoRescueRefreshPrinterList() {
  if (typeof global.crozzoAdminRefreshSystemPrinters === 'function') global.crozzoAdminRefreshSystemPrinters();
  setTimeout(function () {
    var list = typeof getAvailablePrintersList === 'function' ? getAvailablePrintersList() : [];
    if (list.length) printerRescueState.phase = 'windows_ok';
    patchPrinterRescueModal({});
    if (typeof showToast === 'function') {
      showToast(
        list.length ? list.length + ' impresora(s) detectada(s) en Windows' : 'Aún no hay impresoras en Windows',
        list.length ? 'success' : 'warning'
      );
    }
  }, 600);
}
function crozzoRescueOpenDriverHelp() {
  var brand = printerRescueState.brand;
  var model = printerRescueState.model;
  if (!brand || !model) {
    if (typeof showToast === 'function') showToast('Primero elija su equipo en la lista de búsqueda', 'warning');
    return;
  }
  var url = crozzoRescueIsVerifiedSupport(brand)
    ? crozzoRescueSupportUrl(brand, model) || crozzoRescueDriverSearchUrl(brand, model)
    : crozzoRescueDriverSearchUrl(brand, model);
  if (url.indexOf('ms-settings:') === 0) {
    openWindowsPrintersSettings();
    return;
  }
  if (typeof showToast === 'function') showToast('Abriendo ayuda para ' + brand + ' ' + model + '…', 'info');
  void crozzoRescueOpenExternal(url);
}
function onRescueBrandChange(brand) {
  if (!brand || !PRINTER_RESCUE_DB[brand]) return;
  printerRescueState.brand = brand;
  const models = PRINTER_RESCUE_DB[brand].models || [];
  printerRescueState.model = models[0] || '';
  patchPrinterRescueModal({});
}
function onRescueModelChange(model) {
  printerRescueState.model = String(model || '').trim();
  patchPrinterRescueModal({});
}
function onRescueConnTypeChange(type) {
  printerRescueState.connectionType = type;
  patchPrinterRescueModal({});
}
function onRescueWinPrinterChange(name) {
  /* sin toast — el usuario guarda con el botón */
}
function onRescueAssignPrinter(role) {
  var sel = document.getElementById('rescueWinPrinter');
  var name = sel ? String(sel.value || '').trim() : '';
  if (!name) {
    if (typeof showToast === 'function') showToast('Elija primero la impresora de Windows', 'warning');
    return;
  }
  var conf = typeof getFacturacionAdminConfig === 'function' ? getFacturacionAdminConfig() : {};
  var next = Object.assign({}, conf);
  if (role === 'comandas') next.impresoraComandas = name;
  else next.impresoraCajaPos = name;
  if (typeof global.config !== 'undefined' && global.config.set) global.config.set('facturacionAdmin', next);
  var cajaSel = document.getElementById('adminCajaPosPrinter');
  var comSel = document.getElementById('adminComandaPrinter');
  var studioSel = document.getElementById('crozzoPsStudioPrinter');
  if (role === 'comandas' && comSel) comSel.value = name;
  else {
    if (cajaSel) cajaSel.value = name;
    if (studioSel) studioSel.value = name;
  }
  if (typeof global.crozzoFacturasAdminPersistPrinters === 'function') global.crozzoFacturasAdminPersistPrinters({ silent: true });
  if (typeof showToast === 'function') {
    showToast(
      'Impresora «' + name + '» asignada a ' + (role === 'comandas' ? 'comandas' : 'caja/facturas'),
      'success'
    );
  }
}
function onRescueTestPrinter() {
  var sel = document.getElementById('rescueWinPrinter');
  var name = sel ? String(sel.value || '').trim() : '';
  if (!name) {
    if (typeof showToast === 'function') showToast('Elija primero la impresora de Windows', 'warning');
    return;
  }
  if (typeof global.crozzoFacturasAdminTestPrint === 'function') {
    var cajaSel = document.getElementById('adminCajaPosPrinter');
    if (cajaSel) cajaSel.value = name;
    void global.crozzoFacturasAdminTestPrint('thermal');
    return;
  }
  if (typeof showToast === 'function') showToast('Servicio de prueba no disponible', 'warning');
}
function crozzoHandleRescueModalClick(ev) {
  var btn = ev.target && ev.target.closest ? ev.target.closest('[data-rescue-action]') : null;
  if (!btn) return;
  ev.preventDefault();
  ev.stopPropagation();
  var act = btn.getAttribute('data-rescue-action');
  if (act === 'pick') {
    var b = btn.getAttribute('data-brand');
    var m = btn.getAttribute('data-model');
    if (b && m) onRescuePickHit(b, m);
    return;
  }
  if (act === 'quick-brand') {
    var qb = btn.getAttribute('data-brand');
    if (qb) onRescueQuickBrandSearch(qb);
    return;
  }
  if (act === 'phase') {
    onRescuePhaseChange(btn.getAttribute('data-phase'));
    return;
  }
  if (act === 'win-settings') {
    openWindowsPrintersSettings();
    return;
  }
  if (act === 'refresh-list') {
    crozzoRescueRefreshPrinterList();
    return;
  }
  if (act === 'assign') {
    onRescueAssignPrinter(btn.getAttribute('data-role') || 'caja');
    return;
  }
  if (act === 'test-print') {
    onRescueTestPrinter();
    return;
  }
  if (act === 'driver-help') {
    crozzoRescueOpenDriverHelp();
    return;
  }
  if (act === 'download') downloadRescueScript();
  else if (act === 'support') openRescueSupportPage();
  else if (act === 'flow') runFullRescueFlow();
}
function crozzoWirePrinterRescueModal() {
  var root = crozzoPrinterRescueModalRoot();
  if (!root) return;
  var body = root.querySelector('.modal-body');
  if (!body) return;
  if (body._crozzoRescueClickFn) body.removeEventListener('click', body._crozzoRescueClickFn);
  body._crozzoRescueClickFn = crozzoHandleRescueModalClick;
  body.addEventListener('click', body._crozzoRescueClickFn);
  if (body._crozzoRescueInputFn) body.removeEventListener('input', body._crozzoRescueInputFn);
  body._crozzoRescueInputFn = function (ev) {
    var t = ev.target;
    if (!t) return;
    if (t.id === 'rescueSearchInput') onRescueSearchInput(t.value);
    else if (t.id === 'rescuePrinterIp') printerRescueState.printerIp = String(t.value || '').trim();
  };
  body.addEventListener('input', body._crozzoRescueInputFn);
}
function crozzoEnsurePrinterRescueModalEvents() {
  /* Obsoleto: modalContent hace stopPropagation; usar crozzoWirePrinterRescueModal(). */
}

function buildRescueScript() {
  const brand = printerRescueState.brand;
  const model = printerRescueState.model;
  const connection = printerRescueState.connectionType;
  const ip = (printerRescueState.printerIp || '').trim();
  const supportUrl = PRINTER_RESCUE_DB[brand]?.support || '';
  if (connection === 'LAN' && !ip) {
    showToast('Debes ingresar IP para conexión LAN', 'warning');
    return null;
  }
  let script = '#requires -RunAsAdministrator\n';
  script += '$ErrorActionPreference = "Stop"\n';
  script += `$Brand = "${brand}"\n`;
  script += `$Model = "${model}"\n`;
  script += `$ConnectionType = "${connection}"\n`;
  script += `$PrinterIP = "${ip}"\n`;
  script += `$SupportUrl = "${supportUrl}"\n\n`;
  script += 'Write-Host "=== RESCATE DE IMPRESORA POS ===" -ForegroundColor Cyan\n';
  script += 'Write-Host "Marca: $Brand | Modelo: $Model | Conexion: $ConnectionType"\n';
  script += 'if ($ConnectionType -eq "LAN") {\n';
  script += '  $portName = "IP_$PrinterIP"\n';
  script += '  if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {\n';
  script += '    Add-PrinterPort -Name $portName -PrinterHostAddress $PrinterIP\n';
  script += '    Write-Host "Puerto de red creado: $portName" -ForegroundColor Green\n';
  script += '  }\n';
  script += '}\n';
  script += 'Start-Process $SupportUrl\n';
  script += 'Write-Host "Se abrió la web oficial del driver. Instálalo y valida impresión de prueba."\n';
  script += 'Pause\n';
  return script;
}
function downloadRescueScript() {
  const script = buildRescueScript();
  if (!script) return;
  const safeName = `${printerRescueState.brand}_${printerRescueState.model}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const blob = new Blob([script], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rescate_Impresora_${safeName}.ps1`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Script de texto descargado (.ps1). Revíselo y ejecútelo usted como admin si lo necesita.', 'success');
}
function openRescueSupportPage() {
  crozzoRescueOpenDriverHelp();
}
function runFullRescueFlow() {
  downloadRescueScript();
  setTimeout(function () {
    openRescueSupportPage();
  }, 300);
}
  global.openPrinterRescue = openPrinterRescue;
  global.downloadRescueScript = downloadRescueScript;
  global.openRescueSupportPage = openRescueSupportPage;
  global.runFullRescueFlow = runFullRescueFlow;
  global.onRescueSearchInput = onRescueSearchInput;
  global.onRescueBrandChange = onRescueBrandChange;
  global.onRescueModelChange = onRescueModelChange;
  global.onRescueConnTypeChange = onRescueConnTypeChange;
  global.onRescuePickHit = onRescuePickHit;
  global.onRescueQuickBrandSearch = onRescueQuickBrandSearch;
  global.onRescuePhaseChange = onRescuePhaseChange;
  global.crozzoRescueRefreshPrinterList = crozzoRescueRefreshPrinterList;
  global.crozzoRescueOpenDriverHelp = crozzoRescueOpenDriverHelp;
  global.onRescueWinPrinterChange = onRescueWinPrinterChange;
  global.onRescueAssignPrinter = onRescueAssignPrinter;
  global.onRescueTestPrinter = onRescueTestPrinter;
  global.openWindowsPrintersSettings = openWindowsPrintersSettings;
  global.crozzoRescueSupportUrl = crozzoRescueSupportUrl;
  global.patchPrinterRescueModal = patchPrinterRescueModal;
  global.crozzoWirePrinterRescueModal = crozzoWirePrinterRescueModal;
  global.CrozzoPrinterRescue = { open: openPrinterRescue };
})(typeof window !== 'undefined' ? window : globalThis);
