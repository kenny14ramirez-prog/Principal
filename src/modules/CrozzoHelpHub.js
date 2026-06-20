/**
 * Crozzo POS — Centro de ayuda unificado (búsqueda, contexto por pantalla, acciones rápidas).
 */
(function (global) {
  'use strict';

  var CATEGORIES = [
    { id: 'all', label: 'Todo', icon: '✦' },
    { id: 'inicio', label: 'Inicio', icon: '🚀' },
    { id: 'ventas', label: 'Ventas', icon: '💳' },
    { id: 'cocina', label: 'Cocina', icon: '👨‍🍳' },
    { id: 'impresion', label: 'Impresión', icon: '🖨️' },
    { id: 'facturacion', label: 'Facturación', icon: '🧾' },
    { id: 'config', label: 'Config', icon: '⚙️' },
    { id: 'problemas', label: 'Problemas', icon: '🔧' },
  ];

  var ARTICLES = [
    {
      id: 'checklist-apertura',
      cat: 'inicio',
      title: 'Checklist de apertura (Día 0)',
      summary: 'Pasos esenciales antes del primer servicio: perfil, catálogo, usuarios y comanda de prueba.',
      tags: ['checklist', 'apertura', 'configurar', 'inicio', 'nuevo'],
      pages: ['inicio-operacion'],
      steps: ['Elija perfil operativo del negocio', 'Complete datos de empresa', 'Cargue al menos 5 productos', 'Cree 2 usuarios con roles distintos', 'Envíe una comanda de prueba a cocina'],
      action: { type: 'view', view: 'checklist' },
      actionLabel: 'Abrir checklist',
    },
    {
      id: 'perfil-operativo',
      cat: 'inicio',
      title: 'Elegir perfil del negocio',
      summary: 'Restaurante pequeño, retail o grande: adapta menú y módulos visibles por rol.',
      tags: ['perfil', 'restaurante', 'retail', 'menú'],
      pages: ['inicio-operacion', 'gestion-perfiles-menus'],
      steps: ['Inicio → Perfiles o Configuración → Perfiles operativos', 'Seleccione el tamaño y tipo de negocio', 'Verifique que caja, mesero y cocina vean lo correcto'],
      action: { type: 'fn', fn: 'CrozzoOnboardingOperativo.openPerfilesModal' },
      actionLabel: 'Elegir perfil',
    },
    {
      id: 'modo-demo',
      cat: 'inicio',
      title: 'Practicar en modo DEMO',
      summary: 'Entrene al equipo sin riesgo fiscal: ventas y comandas de prueba.',
      tags: ['demo', 'practica', 'capacitacion', 'simple'],
      pages: ['inicio-operacion', 'config-empresa'],
      steps: ['Configuración → Empresa → Modo de operación', 'Active DEMO o SIMPLE los primeros días', 'Repita cobros y comandas hasta que el equipo domine el flujo'],
      action: { type: 'navigate', page: 'config-empresa' },
      actionLabel: 'Ir a empresa',
    },
    {
      id: 'cobrar-mesa',
      cat: 'ventas',
      title: 'Cobrar una mesa',
      summary: 'Mesa → productos → comandar (opcional) → cobrar con efectivo, datáfono o mixto.',
      tags: ['mesa', 'cobro', 'caja', 'pago', 'restaurante'],
      pages: ['cajero', 'inicio-operacion'],
      steps: ['Abra Punto de venta', 'Seleccione Mesa y el número', 'Agregue productos al pedido', 'Pulse Cobrar y elija método de pago', 'Confirme — puede imprimir ticket'],
      action: { type: 'navigate', page: 'cajero' },
      actionLabel: 'Abrir caja',
    },
    {
      id: 'venta-directa',
      cat: 'ventas',
      title: 'Venta directa (mostrador)',
      summary: 'Cobro inmediato sin mesa: ideal para cafeterías y retail.',
      tags: ['directa', 'mostrador', 'rapida', 'retail'],
      pages: ['cajero'],
      steps: ['En caja elija Venta directa', 'Busque o toque productos', 'Cobrar → método de pago → listo'],
      action: { type: 'navigate', page: 'cajero' },
      actionLabel: 'Ir a caja',
    },
    {
      id: 'pedido-tablet',
      cat: 'ventas',
      title: 'Tomar pedido en tablet',
      summary: 'Mesero agrega ítems, observaciones y confirma; la cocina recibe la comanda.',
      tags: ['tablet', 'mesero', 'pedido', 'mesa'],
      pages: ['tablets'],
      steps: ['Tablets → elija mesa o llevar', 'Toque productos (Ctrl+K busca rápido)', 'Agregue notas o alérgenos si aplica', 'Confirmar pedido — llega a comandas/cocina'],
      action: { type: 'navigate', page: 'tablets' },
      actionLabel: 'Abrir tablets',
    },
    {
      id: 'cierre-turno',
      cat: 'ventas',
      title: 'Cierre de caja y arqueo',
      summary: 'Cuente efectivo, datáfonos y documentos; cierre el turno con diferencia visible.',
      tags: ['cierre', 'arqueo', 'turno', 'efectivo', 'cuadre'],
      pages: ['cierre-caja'],
      steps: ['Cierre de caja → Abrir turno si no hay uno activo', 'Registre ventas del turno', 'Cuadre efectivo y medios de pago', 'Cierre y guarde el reporte'],
      action: { type: 'navigate', page: 'cierre-caja' },
      actionLabel: 'Ir a cierre',
    },
    {
      id: 'corcho-comandas',
      cat: 'cocina',
      title: 'Panel de comandas (corcho)',
      summary: 'Vea pedidos por área, tiempos de espera, notas y estado LISTO.',
      tags: ['comandas', 'corcho', 'cocina', 'bar', 'areas'],
      pages: ['comandas', 'cocina'],
      steps: ['Abra Comandas o Cocina KDS', 'Filtre por área si tiene varias estaciones', 'Toque un pedido para ver platos y notas', 'Marque LISTO cuando termine cada ítem'],
      action: { type: 'navigate', page: 'comandas' },
      actionLabel: 'Ver comandas',
    },
    {
      id: 'reimprimir-comanda',
      cat: 'cocina',
      title: 'Reimprimir ticket de cocina',
      summary: 'Si la impresora falló o se perdió el papel, reenvíe desde comandas.',
      tags: ['reimprimir', 'ticket', 'cocina', 'impresora'],
      pages: ['comandas'],
      steps: ['Comandas → localice el pedido', 'Use Reimprimir o el menú del ticket', 'Verifique impresora de comandas en Configuración'],
      action: { type: 'navigate', page: 'comandas' },
      actionLabel: 'Ir a comandas',
    },
    {
      id: 'alergenos-comanda',
      cat: 'cocina',
      title: 'Alérgenos en comanda',
      summary: 'Declare gluten, lacteos, etc. en el catálogo; cocina los ve resaltados.',
      tags: ['alergeno', 'alergia', 'nota', 'seguridad'],
      pages: ['productos', 'comandas', 'tablets'],
      steps: ['Gestión → Catálogo → edite el producto', 'Marque alérgenos aplicables', 'En pedido agregue observación si el cliente lo pide'],
      action: { type: 'navigate', page: 'productos' },
      actionLabel: 'Ir al catálogo',
    },
    {
      id: 'config-impresoras',
      cat: 'impresion',
      title: 'Configurar impresoras',
      summary: 'Asigne térmica de caja, comandas y facturas desde Configuración.',
      tags: ['impresora', 'termica', 'configurar', 'windows'],
      pages: ['admin', 'facturas'],
      steps: ['Configuración → Facturas e impresión', 'Detecte impresoras de Windows', 'Asigne caja, comandas y diseño de ticket', 'Imprima prueba desde cada módulo'],
      action: { type: 'navigate', page: 'admin' },
      actionLabel: 'Config. impresión',
    },
    {
      id: 'rescate-impresora',
      cat: 'impresion',
      title: 'Impresora no reconocida',
      summary: 'Si Windows no ve la impresora, instale el driver primero. Luego asígnela en Crozzo.',
      tags: ['rescate', 'driver', 'epson', 'sat', 'star', 'digital pos', 'digitalpos', 'no imprime', 'usb', 'lan'],
      pages: ['admin', 'comandas', 'facturas'],
      steps: [
        'Abra Impresora no reconocida',
        'Elija «Windows NO la ve» si la lista está vacía',
        'Siga los 4 pasos: cable, etiqueta, Impresoras en Windows, Actualizar lista',
        'Busque marca/modelo de la etiqueta → Buscar cómo instalar driver',
        'Cuando Windows la vea: «Windows SÍ la ve» → asignar → Probar',
      ],
      action: { type: 'fn', fn: 'openPrinterRescue', args: ['admin'] },
      actionLabel: 'Abrir asistente',
    },
    {
      id: 'cola-impresion',
      cat: 'impresion',
      title: 'Cola de impresión atascada',
      summary: 'Si un trabajo tarda más de ~45 s, cancele o vacíe la cola.',
      tags: ['cola', 'atascada', 'error', 'cancelar', 'no responde'],
      pages: ['cajero', 'comandas'],
      steps: ['Observe la barra de cola de impresión arriba', 'Abra detalle si hay error', 'Cancele el trabajo bloqueado', 'Reinicie impresora y reimprima'],
      action: { type: 'view', view: 'home' },
      actionLabel: 'Entendido',
    },
    {
      id: 'guia-fe',
      cat: 'facturacion',
      title: 'Activar facturación electrónica',
      summary: 'Pasos DIAN: certificado, resolución, prefijos y prueba en ambiente habilitación.',
      tags: ['fe', 'dian', 'electronica', 'factura', 'resolucion'],
      pages: ['admin', 'facturas', 'config-empresa'],
      steps: ['Siga la guía FE paso a paso', 'Configure proveedor tecnológico y datos DIAN', 'Pruebe en habilitación antes de producción'],
      action: { type: 'fn', fn: 'CrozzoGuiaFeElectronica.openGuideModal' },
      actionLabel: 'Guía FE',
    },
    {
      id: 'usuarios-permisos',
      cat: 'config',
      title: 'Usuarios y permisos',
      summary: 'Mesero solo tablets; caja POS y cierre; admin acceso completo.',
      tags: ['usuario', 'permiso', 'rol', 'mesero', 'admin', 'clave'],
      pages: ['admin'],
      steps: ['Administración → Usuarios', 'Cree usuario con rol base', 'Marque áreas y acciones permitidas', 'En tablet (rol B) solo aplica caja/tablet'],
      action: { type: 'navigate', page: 'admin' },
      actionLabel: 'Gestionar usuarios',
    },
    {
      id: 'sync-nube',
      cat: 'config',
      title: 'Respaldo y sync en nube',
      summary: 'Conecte Supabase para multi-dispositivo y backup del negocio.',
      tags: ['nube', 'supabase', 'sync', 'backup', 'lan'],
      pages: ['config-multidispositivo', 'super-admin-nube'],
      steps: ['Multi-dispositivo → URL y clave Supabase', 'Valide conexión y business_id', 'Pruebe sync con otro equipo en la misma red'],
      action: { type: 'navigate', page: 'config-multidispositivo' },
      actionLabel: 'Config. nube',
    },
    {
      id: 'pareo-tablets',
      cat: 'config',
      title: 'Parear tablets con el central',
      summary: 'Central LAN (rol A) + tablets (rol B) por QR o red local.',
      tags: ['tablet', 'pareo', 'qr', 'lan', 'central', 'rol a', 'rol b'],
      pages: ['config-multidispositivo', 'tablets'],
      steps: ['Configure rol A en el PC central', 'Genere QR de pareo', 'En tablet escanee o busque IP del central', 'Pruebe envío de pedido demo'],
      action: { type: 'navigate', page: 'config-multidispositivo' },
      actionLabel: 'Multi-dispositivo',
    },
    {
      id: 'marcacion-personal',
      cat: 'config',
      title: 'Marcación de personal',
      summary: 'Kiosk con PIN para entrada/salida; independiente del login POS.',
      tags: ['marcacion', 'pin', 'empleado', 'asistencia', 'kiosk'],
      pages: ['control-acceso'],
      steps: ['Marcación → configure clave admin', 'Registre empleados con PIN de 4 dígitos', 'Use kiosk en tablet o PC dedicado'],
      action: { type: 'fn', fn: 'CrozzoOnboardingOperativo.openMarcacionTour' },
      actionLabel: 'Tour marcación',
    },
    {
      id: 'sin-internet',
      cat: 'problemas',
      title: 'Operar sin internet',
      summary: 'La caja sigue en LAN/offline; la cola sincroniza al reconectar.',
      tags: ['offline', 'internet', 'caido', 'red', 'sin conexion'],
      pages: ['inicio-operacion', 'config-multidispositivo'],
      steps: ['Ventas y comandas locales siguen funcionando', 'Verifique badge de conectividad', 'Al volver internet, espere drenaje de cola nube'],
      action: { type: 'navigate', page: 'config-multidispositivo' },
      actionLabel: 'Ver conexión',
    },
    {
      id: 'impresora-no-imprime',
      cat: 'problemas',
      title: 'La impresora no imprime',
      summary: 'Revise nombre en Windows, cable/USB, cola y driver.',
      tags: ['no imprime', 'error', 'termica', 'usb', 'driver'],
      pages: ['admin', 'comandas', 'cajero'],
      steps: ['¿Windows ve la impresora? Configuración → Impresoras', '¿Nombre coincide en Crozzo?', '¿Hay error en cola de impresión?', 'Use Configurar impresora (drivers solo si hace falta)'],
      action: { type: 'fn', fn: 'openPrinterRescue', args: ['admin'] },
      actionLabel: 'Configurar impresora',
    },
    {
      id: 'comanda-duplicada',
      cat: 'problemas',
      title: 'Evitar comanda duplicada',
      summary: 'Doble clic es común con personal nuevo; el sistema puede alertar.',
      tags: ['duplicado', 'doble', 'comanda', 'error'],
      pages: ['cajero', 'tablets'],
      steps: ['Espere confirmación antes de tocar de nuevo', 'Si aparece alerta de duplicado, revise el pedido anterior', 'Capacite: un clic = una comanda'],
      action: { type: 'view', view: 'home' },
      actionLabel: 'Entendido',
    },
    {
      id: 'atajos-teclado',
      cat: 'ventas',
      title: 'Atajos útiles',
      summary: 'Buscar producto, confirmar pedido y navegar más rápido.',
      tags: ['atajo', 'teclado', 'ctrl', 'rapido'],
      pages: ['tablets', 'cajero'],
      steps: ['Tablets: Ctrl+K buscar producto', 'Tablets: Ctrl+Enter confirmar pedido', 'Menú lateral: buscar módulo arriba del menú', 'Ayuda: tecla ? (fuera de campos de texto)'],
      action: { type: 'view', view: 'home' },
      actionLabel: 'Entendido',
    },
  ];

  var QUICK_ACTIONS = [
    { label: 'Checklist apertura', icon: '📋', view: 'checklist' },
    { label: 'Impresora no reconocida', icon: '🖨️', fn: 'openPrinterRescue', args: ['admin'] },
    { label: 'Guía factura electrónica', icon: '🧾', fn: 'CrozzoGuiaFeElectronica.openGuideModal' },
    { label: 'Config. impresión', icon: '⚙️', page: 'admin' },
    { label: 'Multi-dispositivo', icon: '📡', page: 'config-multidispositivo' },
    { label: 'Asistente configuración', icon: '🔧', fn: 'wizardOpen' },
  ];

  var state = {
    view: 'home',
    query: '',
    category: 'all',
    articleId: null,
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeQuery(q) {
    return String(q || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function articleHaystack(a) {
    return normalizeQuery(
      [a.title, a.summary, (a.tags || []).join(' '), (a.pages || []).join(' ')].join(' ')
    );
  }

  function articleMatches(a, q) {
    if (!q) return true;
    var hay = articleHaystack(a);
    return q.split(/\s+/).filter(Boolean).every(function (t) {
      return hay.indexOf(t) !== -1;
    });
  }

  function getCurrentPage() {
    return typeof global.currentPage !== 'undefined' ? global.currentPage : '';
  }

  function getContextArticles(limit) {
    limit = limit || 4;
    var page = getCurrentPage();
    if (!page) return [];
    var scored = ARTICLES.map(function (a) {
      var score = 0;
      if ((a.pages || []).indexOf(page) >= 0) score += 10;
      if (page.indexOf('cajero') >= 0 && a.cat === 'ventas') score += 2;
      if (page.indexOf('comanda') >= 0 && a.cat === 'cocina') score += 3;
      if (page.indexOf('admin') >= 0 && a.cat === 'config') score += 2;
      return { a: a, score: score };
    })
      .filter(function (x) {
        return x.score > 0;
      })
      .sort(function (x, y) {
        return y.score - x.score;
      });
    return scored.slice(0, limit).map(function (x) {
      return x.a;
    });
  }

  function filterArticles() {
    var q = normalizeQuery(state.query);
    var cat = state.category;
    return ARTICLES.filter(function (a) {
      if (cat !== 'all' && a.cat !== cat) return false;
      return articleMatches(a, q);
    });
  }

  function resolveFn(path, args) {
    if (!path) return;
    var parts = String(path).split('.');
    var ctx = global;
    for (var i = 0; i < parts.length; i++) {
      ctx = ctx[parts[i]];
      if (ctx == null) return;
    }
    if (typeof ctx === 'function') {
      if (typeof global.closeModal === 'function') global.closeModal();
      ctx.apply(parts.length > 1 ? global[parts[0]] : global, args || []);
    }
  }

  function runAction(action) {
    if (!action) return;
    if (action.type === 'navigate' && action.page && typeof global.navigateTo === 'function') {
      if (typeof global.closeModal === 'function') global.closeModal();
      global.navigateTo(action.page);
      return;
    }
    if (action.type === 'view') {
      open(action.view || 'home');
      return;
    }
    if (action.type === 'fn') {
      resolveFn(action.fn, action.args);
    }
  }

  function renderArticleCard(a, opts) {
    opts = opts || {};
    var catMeta = CATEGORIES.find(function (c) {
      return c.id === a.cat;
    });
    var icon = catMeta ? catMeta.icon : '•';
    return (
      '<button type="button" class="crozzo-help-card' +
      (opts.compact ? ' crozzo-help-card--compact' : '') +
      '" data-help-article="' +
      esc(a.id) +
      '">' +
      '<span class="crozzo-help-card__icon" aria-hidden="true">' +
      icon +
      '</span>' +
      '<span class="crozzo-help-card__body">' +
      '<strong class="crozzo-help-card__title">' +
      esc(a.title) +
      '</strong>' +
      '<span class="crozzo-help-card__summary">' +
      esc(a.summary) +
      '</span></span>' +
      '<span class="crozzo-help-card__chev" aria-hidden="true">›</span></button>'
    );
  }

  function renderChecklistEmbed() {
    if (global.CrozzoOnboardingOperativo && typeof global.CrozzoOnboardingOperativo.renderChecklistPanelHtml === 'function') {
      return global.CrozzoOnboardingOperativo.renderChecklistPanelHtml();
    }
    return '<p class="form-hint">Checklist no disponible. Recargue la aplicación.</p>';
  }

  function renderArticleDetail(a) {
    var steps =
      (a.steps || []).length > 0
        ? '<ol class="crozzo-help-steps">' +
          a.steps
            .map(function (s) {
              return '<li>' + esc(s) + '</li>';
            })
            .join('') +
          '</ol>'
        : '';
    var catMeta = CATEGORIES.find(function (c) {
      return c.id === a.cat;
    });
    var actionBtn = a.action
      ? '<button type="button" class="btn btn-primary" data-help-run-action="' +
        esc(a.id) +
        '">' +
        esc(a.actionLabel || 'Ir') +
        '</button>'
      : '';
    return (
      '<div class="crozzo-help-detail">' +
      '<button type="button" class="crozzo-help-back" data-help-view="home">← Volver</button>' +
      '<div class="crozzo-help-detail__head">' +
      '<span class="crozzo-help-detail__cat">' +
      (catMeta ? catMeta.icon + ' ' + esc(catMeta.label) : '') +
      '</span>' +
      '<h3 class="crozzo-help-detail__title">' +
      esc(a.title) +
      '</h3>' +
      '<p class="crozzo-help-detail__summary">' +
      esc(a.summary) +
      '</p></div>' +
      steps +
      '<div class="crozzo-help-detail__actions">' +
      actionBtn +
      '</div></div>'
    );
  }

  function renderHomeArticlesListHtml(filtered) {
    return filtered.length > 0
      ? '<div class="crozzo-help-cards crozzo-help-cards--list" id="crozzoHelpResults">' +
          filtered
            .map(function (a) {
              return renderArticleCard(a);
            })
            .join('') +
          '</div>'
      : '<div class="crozzo-help-empty" id="crozzoHelpResults">Sin resultados. Pruebe otras palabras — ej. «impresora», «mesa», «FE», «tablet».</div>';
  }

  function renderHomeBody() {
    var q = state.query.trim();
    var filtered = filterArticles();
    var context = !q && state.category === 'all' ? getContextArticles(4) : [];
    var contextHtml =
      context.length > 0
        ? '<section class="crozzo-help-section" id="crozzoHelpContextSection">' +
          '<h4 class="crozzo-help-section__title">Para esta pantalla</h4>' +
          '<div class="crozzo-help-cards">' +
          context.map(function (a) {
            return renderArticleCard(a, { compact: true });
          }).join('') +
          '</div></section>'
        : '';

    var catsHtml = CATEGORIES.map(function (c) {
      return (
        '<button type="button" class="crozzo-help-cat' +
        (state.category === c.id ? ' is-active' : '') +
        '" data-help-cat="' +
        esc(c.id) +
        '">' +
        esc(c.icon + ' ' + c.label) +
        '</button>'
      );
    }).join('');

    var listHtml = renderHomeArticlesListHtml(filtered);

    var quickHtml = QUICK_ACTIONS.map(function (qa) {
      var data =
        qa.view != null
          ? ' data-help-view="' + esc(qa.view) + '"'
          : qa.page
            ? ' data-help-nav="' + esc(qa.page) + '"'
            : ' data-help-fn="' + esc(qa.fn) + '"' + (qa.args ? ' data-help-args="' + esc(JSON.stringify(qa.args)) + '"' : '');
      return (
        '<button type="button" class="crozzo-help-quick"' +
        data +
        '><span aria-hidden="true">' +
        esc(qa.icon) +
        '</span> ' +
        esc(qa.label) +
        '</button>'
      );
    }).join('');

    return (
      contextHtml +
      '<section class="crozzo-help-section">' +
      '<div class="crozzo-help-search-wrap">' +
      '<input type="search" id="crozzoHelpSearch" class="form-input crozzo-help-search" placeholder="Buscar ayuda… (impresora, cobro, FE, tablet)" value="' +
      esc(state.query) +
      '" autocomplete="off" aria-label="Buscar en centro de ayuda">' +
      '<span class="crozzo-help-search__count" id="crozzoHelpSearchCount">' +
      filtered.length +
      ' tema(s)</span></div>' +
      '<div class="crozzo-help-cats" role="tablist">' +
      catsHtml +
      '</div>' +
      listHtml +
      '</section>' +
      '<section class="crozzo-help-section crozzo-help-section--quick">' +
      '<h4 class="crozzo-help-section__title">Acciones rápidas</h4>' +
      '<div class="crozzo-help-quick-grid">' +
      quickHtml +
      '</div></section>'
    );
  }

  function renderBody() {
    if (state.view === 'checklist') {
      return (
        '<div class="crozzo-help-checklist">' +
        '<button type="button" class="crozzo-help-back" data-help-view="home">← Centro de ayuda</button>' +
        renderChecklistEmbed() +
        '</div>'
      );
    }
    if (state.view === 'article' && state.articleId) {
      var art = ARTICLES.find(function (a) {
        return a.id === state.articleId;
      });
      if (art) return renderArticleDetail(art);
      state.view = 'home';
    }
    return renderHomeBody();
  }

  var __crozzoHelpSearchTimer = null;

  function crozzoHelpUpdateSearchResultsOnly() {
    var root = document.getElementById('modalContent');
    if (!root || !root.classList.contains('modal--help-hub')) return;
    var filtered = filterArticles();
    var countEl = root.querySelector('#crozzoHelpSearchCount');
    if (countEl) countEl.textContent = filtered.length + ' tema(s)';
    var resultsEl = root.querySelector('#crozzoHelpResults');
    if (resultsEl) {
      var tmp = document.createElement('div');
      tmp.innerHTML = renderHomeArticlesListHtml(filtered);
      var next = tmp.firstElementChild;
      if (next) resultsEl.replaceWith(next);
    }
    var ctxSection = root.querySelector('#crozzoHelpContextSection');
    if (ctxSection) {
      var q = state.query.trim();
      var showCtx = !q && state.category === 'all' && getContextArticles(4).length > 0;
      ctxSection.style.display = showCtx ? '' : 'none';
    }
    root.querySelectorAll('[data-help-article]').forEach(function (btn) {
      if (btn._crozzoHelpArticleBound) return;
      btn._crozzoHelpArticleBound = true;
      btn.addEventListener('click', function () {
        state.articleId = btn.getAttribute('data-help-article');
        state.view = 'article';
        refreshModal();
      });
    });
  }

  function wireHelpModal() {
    var root = document.getElementById('modalContent');
    if (!root) return;
    var body = root.querySelector('.modal-body');
    if (!body) return;

    body.querySelectorAll('[data-help-article]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.articleId = btn.getAttribute('data-help-article');
        state.view = 'article';
        refreshModal();
      });
    });

    body.querySelectorAll('[data-help-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.getAttribute('data-help-cat') || 'all';
        refreshModal();
      });
    });

    body.querySelectorAll('[data-help-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-help-view') || 'home';
        state.view = v;
        if (v === 'home') state.articleId = null;
        refreshModal();
      });
    });

    body.querySelectorAll('[data-help-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = btn.getAttribute('data-help-nav');
        if (typeof global.closeModal === 'function') global.closeModal();
        if (page && typeof global.navigateTo === 'function') global.navigateTo(page);
      });
    });

    body.querySelectorAll('[data-help-fn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fn = btn.getAttribute('data-help-fn');
        var argsRaw = btn.getAttribute('data-help-args');
        var args = [];
        try {
          if (argsRaw) args = JSON.parse(argsRaw);
        } catch (_) {}
        resolveFn(fn, args);
      });
    });

    body.querySelectorAll('[data-help-run-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-help-run-action');
        var art = ARTICLES.find(function (a) {
          return a.id === id;
        });
        if (art && art.action) runAction(art.action);
      });
    });

    var search = body.querySelector('#crozzoHelpSearch');
    if (search) {
      search.focus();
      var len = search.value.length;
      try {
        search.setSelectionRange(len, len);
      } catch (_) {}
      if (!search.dataset.helpBound) {
        search.dataset.helpBound = '1';
        search.addEventListener('input', function () {
          state.query = search.value;
          clearTimeout(__crozzoHelpSearchTimer);
          __crozzoHelpSearchTimer = setTimeout(function () {
            crozzoHelpUpdateSearchResultsOnly();
          }, 160);
        });
        search.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            var first = body.querySelector('[data-help-article]');
            if (first) first.click();
          }
        });
      }
    }
  }

  function refreshModal(preserveSearchFocus) {
    if (typeof global.showModal !== 'function') return;
    var titles = {
      home: 'Centro de ayuda',
      checklist: 'Checklist de apertura',
      article: 'Guía',
    };
    global.showModal(
      titles[state.view] || 'Centro de ayuda',
      '<div class="crozzo-help-hub">' + renderBody() + '</div>',
      { modalClass: 'modal--help-hub', wide: true }
    );
    wireHelpModal();
    if (preserveSearchFocus) {
      var search = document.getElementById('crozzoHelpSearch');
      if (search) {
        search.focus();
        var len = search.value.length;
        try {
          search.setSelectionRange(len, len);
        } catch (_) {}
      }
    }
  }

  function open(view) {
    state.view = view || 'home';
    state.query = '';
    state.category = 'all';
    state.articleId = null;
    refreshModal();
  }

  function toggleFab(show) {
    var fab = document.getElementById('crozzoHelpFab');
    if (!fab) return;
    var loginOpen = document.querySelector('.login-overlay:not([hidden])');
    var hidden = !show || !!loginOpen;
    fab.hidden = hidden;
  }

  function injectFab() {
    if (document.getElementById('crozzoHelpFab')) return;
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'crozzoHelpFab';
    fab.className = 'crozzo-help-fab';
    fab.title = 'Centro de ayuda (? )';
    fab.setAttribute('aria-label', 'Abrir centro de ayuda');
    fab.innerHTML = '<span aria-hidden="true">?</span>';
    fab.addEventListener('click', function () {
      open('home');
    });
    document.body.appendChild(fab);
    toggleFab(true);
  }

  function bindShortcuts() {
    if (global.__crozzoHelpShortcutBound) return;
    global.__crozzoHelpShortcutBound = true;
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== '?' && ev.key !== 'F1') return;
      var t = ev.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      ev.preventDefault();
      open('home');
    });
  }

  function init() {
    injectFab();
    bindShortcuts();
    toggleFab(true);
  }

  global.CrozzoHelpHub = {
    init: init,
    open: open,
    toggleFab: toggleFab,
    getArticles: function () {
      return ARTICLES.slice();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        injectFab();
        bindShortcuts();
      } catch (_) {}
    });
  } else {
    try {
      injectFab();
      bindShortcuts();
    } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
