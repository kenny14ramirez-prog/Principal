/**
 * Crozzo POS — Idiomas (i18n)
 * Predeterminado: español (Colombia) · es-CO
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_locale';
  var DEFAULT_LOCALE = 'es-CO';
  var _locale = DEFAULT_LOCALE;

  var LOCALE_CATALOG = [
    { id: 'es-CO', label: 'Español Latino (Colombiano)', native: 'Español Latino (Colombiano)', region: 'América', terms: 'español colombia colombiano es co latino' },
    { id: 'es-MX', label: 'Español Latino (México)', native: 'Español Latino (México)', region: 'América', terms: 'español mexico méxico mx latino' },
    { id: 'es-419', label: 'Español (Latinoamérica)', native: 'Español (Latinoamérica)', region: 'América', terms: 'español latino america latam neutral' },
    { id: 'es-ES', label: 'Español (España)', native: 'Español (España)', region: 'Europa', terms: 'español spain castellano es' },
    { id: 'en-US', label: 'English (United States)', native: 'English (US)', region: 'América', terms: 'english american usa en' },
    { id: 'en-GB', label: 'English (United Kingdom)', native: 'English (UK)', region: 'Europa', terms: 'english british uk en' },
    { id: 'pt-BR', label: 'Português (Brasil)', native: 'Português (Brasil)', region: 'América', terms: 'portugues português brasil pt' },
    { id: 'pt-PT', label: 'Português (Portugal)', native: 'Português (Portugal)', region: 'Europa', terms: 'portugues portugal pt' },
    { id: 'fr-FR', label: 'Français (France)', native: 'Français', region: 'Europa', terms: 'francais french france fr' },
    { id: 'de-DE', label: 'Deutsch (Deutschland)', native: 'Deutsch', region: 'Europa', terms: 'deutsch german alemania de' },
    { id: 'it-IT', label: 'Italiano (Italia)', native: 'Italiano', region: 'Europa', terms: 'italiano italy italia it' },
    { id: 'zh-CN', label: '中文 (简体)', native: '简体中文', region: 'Asia', terms: 'chinese mandarin china zh' },
    { id: 'ja-JP', label: '日本語', native: '日本語', region: 'Asia', terms: 'japanese japan ja nippon' },
    { id: 'ko-KR', label: '한국어', native: '한국어', region: 'Asia', terms: 'korean korea ko hangul' },
    { id: 'ar-SA', label: 'العربية', native: 'العربية', region: 'Asia', terms: 'arabic ar sa' },
    { id: 'hi-IN', label: 'हिन्दी', native: 'हिन्दी', region: 'Asia', terms: 'hindi india hi' }
  ];

  /** Base: español colombiano (ortografía y tono regional). */
  var MSGS_ES_CO = {
    'app.skip': 'Saltar al contenido principal',
    'nav.search.placeholder': 'Buscar módulo…',
    'nav.search.aria': 'Buscar en el menú',
    'menu.user': 'Menú de usuario',
    'menu.account': 'Cuenta de usuario',
    'menu.activeUser': 'Usuario activo',
    'menu.mainCashier': 'Caja principal',
    'menu.changePassword': 'Cambiar contraseña',
    'menu.logout': 'Cerrar sesión',
    'menu.language': 'Idioma',
    'lang.search': 'Buscar idioma…',
    'lang.current': 'Actual',
    'lang.changed': 'Idioma actualizado',
    'pwd.title': 'Cambiar contraseña',
    'pwd.current': 'Contraseña actual',
    'pwd.new': 'Nueva contraseña',
    'pwd.confirm': 'Confirmar nueva contraseña',
    'pwd.hint': 'Mínimo 8 caracteres',
    'pwd.cancel': 'Cancelar',
    'pwd.save': 'Guardar',
    'pwd.ok': 'Contraseña actualizada correctamente',
    'pwd.err.noSession': 'No hay sesión activa.',
    'pwd.err.currentRequired': 'Ingresa tu contraseña actual.',
    'pwd.err.currentWrong': 'La contraseña actual no coincide.',
    'pwd.err.minLength': 'La nueva contraseña debe tener al menos 8 caracteres.',
    'pwd.err.confirm': 'La confirmación no coincide con la nueva contraseña.',
    'pwd.err.save': 'No se pudo guardar.',
    'logout.confirm': '¿Seguro que deseas salir?',
    'logout.done': 'Sesión cerrada',
    'nav.group.operacion': 'Operación',
    'nav.group.procesos': 'Preparaciones de cocina',
    'nav.group.gestion': 'Gestión',
    'nav.group.costos': 'Costos',
    'nav.group.administrativo': 'Administrativo',
    'nav.group.compras': 'Compras',
    'nav.group.configuracion': 'Configuración',
    'nav.group.super-admin': 'Super Admin',
    'nav.item.inicio-operacion': 'Inicio ventas',
    'nav.item.cajero': 'Restaurante · POS',
    'nav.item.venta-comercial': 'Tienda / Comercial',
    'nav.item.tablets': 'Tablets · pedidos',
    'nav.item.comandas': 'Comandas',
    'nav.item.compras-cortes': '¿Qué hago hoy?',
    'nav.item.compras-recetario-cocina': 'Recetario',
    'nav.item.compras-proceso-sesion': 'Anotar preparación',
    'nav.item.compras-proceso-historial': 'Lo preparé antes',
    'nav.item.facturas': 'Facturas',
    'nav.item.cierre-caja': 'Cierre de caja',
    'nav.item.inventarios': 'Reportes y dashboard',
    'nav.item.productos': 'Catálogo · platos',
    'nav.item.catalogo-mp': 'Catálogo · materias primas',
    'nav.item.costos-matriz': 'Costos y márgenes',
    'nav.item.centro-compras': 'Centro de compras',
    'nav.item.config-empresa': 'Configuración empresa',
    'nav.item.config-usuarios': 'Usuarios y permisos',
    'page.inicio-operacion.title': 'Inicio de ventas',
    'page.inicio-operacion.sub': 'Elija restaurante (mesas/comandas) o tienda comercial (mostrador)',
    'page.cajero.title': 'Restaurante · POS',
    'page.cajero.sub': 'Mesas, domicilios, comandas y cobro en sala',
    'page.venta-comercial.title': 'Tienda / Comercial',
    'page.venta-comercial.sub': 'Venta directa por mostrador sin mesas ni cocina',
    'page.compras-cortes.title': '¿Qué hago hoy?',
    'page.compras-cortes.sub': 'Partir carnes, cocinar, salsas y bases',
    'page.compras-recetario-cocina.title': 'Recetario de cocina',
    'page.compras-recetario-cocina.sub': 'Ingredientes y pesos para bodega — sin costos',
    'page.compras-proceso-sesion.title': 'Anotar preparación',
    'page.compras-proceso-sesion.sub': 'Salsas, bases, despiece y cocción',
    'page.compras-proceso-historial.title': 'Lo preparé antes',
    'page.compras-proceso-historial.sub': 'Preparaciones y diferencias de peso',
    'page.cierre-caja.title': 'Cierre de caja',
    'page.cierre-caja.sub': 'Arqueo mañana / tarde / día e historial',
    'page.facturas.title': 'Facturas',
    'page.facturas.sub': 'Historial de facturas electrónicas emitidas',
    'page.comandas.title': 'Comandas',
    'page.comandas.sub': 'Vista por áreas de producción',
    'page.cocina.title': 'Cocina',
    'page.cocina.sub': 'Comandas entrantes y estado de preparación'
  };

  var MSGS_ES_MX = Object.assign({}, MSGS_ES_CO, {
    'nav.item.compras-proceso-historial': 'Lo preparé antes',
    'page.cajero.sub': 'Mesas, para llevar, comandas y cobro en sala',
    'page.compras-proceso-historial.title': 'Lo preparé antes',
    'pwd.hint': 'Mínimo 8 caracteres (sin contraseñas obvias)'
  });

  var MSGS_ES_419 = Object.assign({}, MSGS_ES_CO, {
    'nav.item.cajero': 'Restaurante · Punto de venta',
    'page.cajero.sub': 'Mesas, para llevar, comandas y cobro'
  });

  var MSGS_ES_ES = Object.assign({}, MSGS_ES_CO, {
    'nav.item.tablets': 'Tablets · pedidos',
    'page.cajero.sub': 'Mesas, comandas y cobro en sala',
    'menu.mainCashier': 'Caja principal',
    'nav.item.cierre-caja': 'Cierre de caja'
  });

  var MSGS_EN_US = {
    'app.skip': 'Skip to main content',
    'nav.search.placeholder': 'Search module…',
    'nav.search.aria': 'Search menu',
    'menu.user': 'User menu',
    'menu.account': 'User account',
    'menu.activeUser': 'Active user',
    'menu.mainCashier': 'Main cashier',
    'menu.changePassword': 'Change password',
    'menu.logout': 'Log out',
    'menu.language': 'Language',
    'lang.search': 'Search language…',
    'lang.current': 'Current',
    'lang.changed': 'Language updated',
    'pwd.title': 'Change password',
    'pwd.current': 'Current password',
    'pwd.new': 'New password',
    'pwd.confirm': 'Confirm new password',
    'pwd.hint': 'Minimum 8 characters',
    'pwd.cancel': 'Cancel',
    'pwd.save': 'Save',
    'pwd.ok': 'Password updated successfully',
    'pwd.err.noSession': 'No active session.',
    'pwd.err.currentRequired': 'Enter your current password.',
    'pwd.err.currentWrong': 'Current password does not match.',
    'pwd.err.minLength': 'New password must be at least 8 characters.',
    'pwd.err.confirm': 'Confirmation does not match the new password.',
    'pwd.err.save': 'Could not save.',
    'logout.confirm': 'Are you sure you want to log out?',
    'logout.done': 'Session closed',
    'nav.group.operacion': 'Operations',
    'nav.group.procesos': 'Kitchen preparations',
    'nav.group.gestion': 'Management',
    'nav.group.costos': 'Costs',
    'nav.group.administrativo': 'Administrative',
    'nav.group.compras': 'Purchasing',
    'nav.group.configuracion': 'Settings',
    'nav.group.super-admin': 'Super Admin',
    'nav.item.inicio-operacion': 'Sales home',
    'nav.item.cajero': 'Restaurant · POS',
    'nav.item.venta-comercial': 'Store / Retail',
    'nav.item.tablets': 'Tablets · orders',
    'nav.item.comandas': 'Kitchen tickets',
    'nav.item.compras-cortes': 'What do I do today?',
    'nav.item.compras-proceso-sesion': 'Log preparation',
    'nav.item.compras-proceso-historial': 'Past preparations',
    'nav.item.facturas': 'Invoices',
    'nav.item.cierre-caja': 'Cash closing',
    'nav.item.inventarios': 'Reports & dashboard',
    'nav.item.productos': 'Catalog · dishes',
    'nav.item.catalogo-mp': 'Catalog · raw materials',
    'nav.item.costos-matriz': 'Costs & margins',
    'nav.item.centro-compras': 'Purchasing hub',
    'nav.item.config-empresa': 'Company settings',
    'nav.item.config-usuarios': 'Users & permissions',
    'page.inicio-operacion.title': 'Sales home',
    'page.inicio-operacion.sub': 'Choose restaurant (tables/tickets) or retail store',
    'page.cajero.title': 'Restaurant · POS',
    'page.cajero.sub': 'Tables, takeout, tickets and checkout',
    'page.venta-comercial.title': 'Store / Retail',
    'page.venta-comercial.sub': 'Direct counter sales without tables',
    'page.compras-cortes.title': 'What do I do today?',
    'page.compras-cortes.sub': 'Butchering, cooking, sauces and bases',
    'page.compras-proceso-sesion.title': 'Log preparation',
    'page.compras-proceso-sesion.sub': 'Sauces, bases, butchering and cooking',
    'page.compras-proceso-historial.title': 'Past preparations',
    'page.compras-proceso-historial.sub': 'Preparations and weight differences',
    'page.cierre-caja.title': 'Cash closing',
    'page.cierre-caja.sub': 'Morning / afternoon / day count and history',
    'page.facturas.title': 'Invoices',
    'page.facturas.sub': 'Electronic invoice history',
    'page.comandas.title': 'Kitchen tickets',
    'page.comandas.sub': 'View by production area',
    'page.cocina.title': 'Kitchen',
    'page.cocina.sub': 'Incoming tickets and prep status'
  };

  var MSGS_EN_GB = Object.assign({}, MSGS_EN_US, {
    'nav.item.facturas': 'Invoices',
    'nav.item.cierre-caja': 'Till closing',
    'page.cierre-caja.title': 'Till closing'
  });

  var MSGS_PT_BR = {
    'app.skip': 'Ir para o conteúdo principal',
    'nav.search.placeholder': 'Buscar módulo…',
    'menu.changePassword': 'Alterar senha',
    'menu.logout': 'Sair',
    'menu.language': 'Idioma',
    'lang.search': 'Buscar idioma…',
    'lang.changed': 'Idioma atualizado',
    'pwd.title': 'Alterar senha',
    'pwd.current': 'Senha atual',
    'pwd.new': 'Nova senha',
    'pwd.confirm': 'Confirmar nova senha',
    'pwd.cancel': 'Cancelar',
    'pwd.save': 'Salvar',
    'nav.group.operacion': 'Operação',
    'nav.group.procesos': 'Preparaciones de cozinha',
    'nav.item.cajero': 'Restaurante · PDV',
    'nav.item.compras-cortes': 'O que faço hoje?',
    'nav.item.compras-proceso-sesion': 'Registrar preparação',
    'nav.item.compras-proceso-historial': 'Preparações anteriores',
    'page.cajero.title': 'Restaurante · PDV',
    'page.cierre-caja.title': 'Fechamento de caixa'
  };

  var PACKS = {
    'es-CO': MSGS_ES_CO,
    'es-MX': MSGS_ES_MX,
    'es-419': MSGS_ES_419,
    'es-ES': MSGS_ES_ES,
    'en-US': MSGS_EN_US,
    'en-GB': MSGS_EN_GB,
    'pt-BR': MSGS_PT_BR,
    'pt-PT': Object.assign({}, MSGS_PT_BR, { 'pwd.save': 'Guardar', 'menu.logout': 'Terminar sessão' }),
    'fr-FR': {
      'menu.language': 'Langue',
      'lang.search': 'Rechercher une langue…',
      'menu.changePassword': 'Changer le mot de passe',
      'menu.logout': 'Se déconnecter',
      'pwd.title': 'Changer le mot de passe',
      'pwd.save': 'Enregistrer',
      'pwd.cancel': 'Annuler'
    },
    'de-DE': {
      'menu.language': 'Sprache',
      'lang.search': 'Sprache suchen…',
      'menu.changePassword': 'Passwort ändern',
      'menu.logout': 'Abmelden',
      'pwd.title': 'Passwort ändern',
      'pwd.save': 'Speichern',
      'pwd.cancel': 'Abbrechen'
    },
    'it-IT': {
      'menu.language': 'Lingua',
      'lang.search': 'Cerca lingua…',
      'menu.changePassword': 'Cambia password',
      'menu.logout': 'Esci',
      'pwd.title': 'Cambia password',
      'pwd.save': 'Salva',
      'pwd.cancel': 'Annulla'
    },
    'zh-CN': {
      'menu.language': '语言',
      'lang.search': '搜索语言…',
      'menu.changePassword': '更改密码',
      'menu.logout': '退出登录',
      'pwd.title': '更改密码',
      'pwd.save': '保存',
      'pwd.cancel': '取消'
    },
    'ja-JP': {
      'menu.language': '言語',
      'lang.search': '言語を検索…',
      'menu.changePassword': 'パスワードを変更',
      'menu.logout': 'ログアウト',
      'pwd.title': 'パスワードを変更',
      'pwd.save': '保存',
      'pwd.cancel': 'キャンセル'
    },
    'ko-KR': {
      'menu.language': '언어',
      'lang.search': '언어 검색…',
      'menu.changePassword': '비밀번호 변경',
      'menu.logout': '로그아웃',
      'pwd.title': '비밀번호 변경',
      'pwd.save': '저장',
      'pwd.cancel': '취소'
    },
    'ar-SA': {
      'menu.language': 'اللغة',
      'lang.search': 'بحث عن لغة…',
      'menu.changePassword': 'تغيير كلمة المرور',
      'menu.logout': 'تسجيل الخروج',
      'pwd.title': 'تغيير كلمة المرور',
      'pwd.save': 'حفظ',
      'pwd.cancel': 'إلغاء'
    },
    'hi-IN': {
      'menu.language': 'भाषा',
      'lang.search': 'भाषा खोजें…',
      'menu.changePassword': 'पासवर्ड बदलें',
      'menu.logout': 'लॉग आउट',
      'pwd.title': 'पासवर्ड बदलें',
      'pwd.save': 'सहेजें',
      'pwd.cancel': 'रद्द करें'
    }
  };

  function normSearch(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function readStoredLocale() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw && PACKS[raw]) return raw;
    } catch (_) {}
    return DEFAULT_LOCALE;
  }

  function writeStoredLocale(id) {
    try {
      localStorage.setItem(LS_KEY, id);
    } catch (_) {}
  }

  function resolve(key, locale) {
    var loc = locale || _locale;
    var pack = PACKS[loc];
    if (pack && pack[key] != null) return pack[key];
    if (loc !== DEFAULT_LOCALE && MSGS_ES_CO[key] != null) return MSGS_ES_CO[key];
    if (PACKS['en-US'] && PACKS['en-US'][key] != null) return PACKS['en-US'][key];
    return key;
  }

  function t(key, params) {
    var s = resolve(key);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
      });
    }
    return s;
  }

  function catalogEntry(id) {
    for (var i = 0; i < LOCALE_CATALOG.length; i++) {
      if (LOCALE_CATALOG[i].id === id) return LOCALE_CATALOG[i];
    }
    return null;
  }

  function searchLocales(q) {
    var n = normSearch(q);
    return LOCALE_CATALOG.filter(function (entry) {
      if (!n) return true;
      var hay = normSearch(entry.label + ' ' + entry.native + ' ' + entry.region + ' ' + entry.terms + ' ' + entry.id);
      return hay.indexOf(n) >= 0;
    });
  }

  function applyDom(root) {
    root = root || document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
    applySidebarNav(root);
    updateLangCurrentLabel();
  }

  function applySidebarNav(root) {
    root.querySelectorAll('.nav-group-li[data-group], .nav-group[data-nav-group]').forEach(function (g) {
      var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group');
      if (!id) return;
      var title = g.querySelector('.nav-group-title');
      if (title) {
        var k = 'nav.group.' + id;
        if (resolve(k) !== k) title.textContent = t(k);
      }
    });
    root.querySelectorAll('.nav-item[data-page]').forEach(function (item) {
      var page = item.getAttribute('data-page');
      var label = item.querySelector('.nav-item-label');
      if (!page || !label) return;
      var k = 'nav.item.' + page;
      if (resolve(k) !== k) label.textContent = t(k);
    });
  }

  function pageTitle(pageId) {
    var p = String(pageId || '');
    var titleKey = 'page.' + p + '.title';
    var subKey = 'page.' + p + '.sub';
    var title = resolve(titleKey);
    var sub = resolve(subKey);
    if (title === titleKey) return null;
    return [title, sub === subKey ? '' : sub];
  }

  function applyDocumentLocale(id) {
    var html = document.documentElement;
    if (!html) return;
    html.setAttribute('lang', id.split('-')[0]);
    html.setAttribute('data-crozzo-locale', id);
    html.classList.remove.apply(
      html.classList,
      Array.prototype.slice.call(html.classList).filter(function (c) {
        return c.indexOf('crozzo-locale-') === 0;
      })
    );
    html.classList.add('crozzo-locale-' + id.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    if (id === 'ar-SA') html.setAttribute('dir', 'rtl');
    else html.removeAttribute('dir');
  }

  function updateLangCurrentLabel() {
    var el = document.getElementById('userMenuLangCurrent');
    if (!el) return;
    var entry = catalogEntry(_locale);
    el.textContent = entry ? entry.native : _locale;
  }

  function renderLangList(filter) {
    var list = document.getElementById('userMenuLangList');
    if (!list) return;
    var items = searchLocales(filter);
    list.innerHTML = items
      .map(function (entry) {
        var active = entry.id === _locale;
        return (
          '<li role="presentation">' +
          '<button type="button" class="user-menu__lang-opt' +
          (active ? ' is-active' : '') +
          '" role="option" aria-selected="' +
          (active ? 'true' : 'false') +
          '" data-locale-id="' +
          entry.id +
          '">' +
          '<span class="user-menu__lang-opt-native">' +
          entry.native +
          '</span>' +
          '<span class="user-menu__lang-opt-meta">' +
          entry.label +
          '</span>' +
          (active ? '<span class="user-menu__lang-opt-badge">' + t('lang.current') + '</span>' : '') +
          '</button></li>'
        );
      })
      .join('');
    list.querySelectorAll('[data-locale-id]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setLocale(btn.getAttribute('data-locale-id'));
      });
    });
  }

  function bindLanguageMenu() {
    var search = document.getElementById('userMenuLangSearch');
    if (search && !search._crozzoI18nBound) {
      search._crozzoI18nBound = true;
      search.addEventListener('input', function () {
        renderLangList(search.value);
      });
      search.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    renderLangList('');
  }

  function setLocale(id, opts) {
    opts = opts || {};
    if (!id || !PACKS[id]) id = DEFAULT_LOCALE;
    _locale = id;
    writeStoredLocale(id);
    applyDocumentLocale(id);
    applyDom(document);
    if (!opts.silent && typeof global.showToast === 'function') {
      global.showToast(t('lang.changed') + ': ' + (catalogEntry(id) ? catalogEntry(id).native : id), 'success');
    }
    try {
      global.dispatchEvent(new CustomEvent('crozzo-locale-change', { detail: { locale: id } }));
    } catch (_) {}
    if (typeof global.currentPage !== 'undefined' && typeof global.navigateTo === 'function') {
      try {
        global.navigateTo(global.currentPage);
      } catch (_) {}
    }
  }

  function init() {
    _locale = readStoredLocale();
    applyDocumentLocale(_locale);
    bindLanguageMenu();
    applyDom(document);
    global.addEventListener('crozzo-locale-change', function () {
      renderLangList(document.getElementById('userMenuLangSearch')?.value || '');
    });
  }

  global.CrozzoI18n = {
    t: t,
    getLocale: function () {
      return _locale;
    },
    setLocale: setLocale,
    searchLocales: searchLocales,
    catalog: LOCALE_CATALOG,
    applyDom: applyDom,
    pageTitle: pageTitle,
    refreshLanguageMenu: renderLangList,
    init: init,
    DEFAULT_LOCALE: DEFAULT_LOCALE
  };
  global.crozzoT = t;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
