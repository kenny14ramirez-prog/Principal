/**
 * Crozzo — Niveles de Madurez Empresarial (H1.0)
 * --------------------------------------------------------------------------
 * 5 niveles que acompañan al comerciante desde "puesto de empanadas" hasta
 * "cadena multi-sede", habilitando obligaciones fiscales de forma progresiva.
 *
 * Doctrina: CADA NIVEL SOLO ADMITE LEGALIDAD. El Nivel 0 (Semilla) NO simula
 * CUFE — emite tickets de capacitación explícitamente inválidos. Cero
 * ambigüedad fiscal. Resuelve la violación C4 (mockStamp).
 *
 * Referencia canónica: docs/maps/MADUREZ-EMPRESARIAL-CO.md
 * Config: CrozzoPosConfigManager.config.madurez
 *
 * Dimensión ORTOGONAL al perfil operativo (restaurante/tienda/hotel):
 *   - Perfil operativo = QUÉ vende y cómo (CrozzoPerfilesBiblioteca)
 *   - Nivel de madurez = QUÉ obligaciones legales tiene (este módulo)
 */
(function (global) {
  'use strict';

  // ─── Definición canónica de los 5 niveles ──────────────────────────────────
  // Naming HÍBRIDO: icono + nombre memorable + subtítulo fiscal visible.
  // Umbrales basados en INTEL H0: 3.500 UVT ≈ $192M COP/año (2026); art. 908 ET (Simple).
  var NIVELES = [
    {
      id: 0,
      key: 'semilla',
      icon: '🌱',
      nombre: 'SEMILLA',
      subtitulo: 'Capacitación · sin RUT',
      desc: 'Modo Sandbox. Operación POS completa con datos ficticios para entrenar. Sin componente fiscal.',
      regimenes: ['no_responsable'],
      puedeFacturarLegal: false,   // Candado duro: nunca timbra
      requiereRut: false,
      umbrales: null,
      habilita: ['operacion_pos', 'sandbox_dataset', 'tickets_capacitacion'],
      bloquea: ['timbrado_dian', 'cufe', 'envio_dian', 'dataico', 'factura_electronica'],
      requisitosSubir: ['rutCargado']
    },
    {
      id: 1,
      key: 'brote',
      icon: '🌿',
      nombre: 'BROTE',
      subtitulo: 'No responsable IVA · empezando',
      desc: 'Comerciante pequeño con RUT pero bajo umbral (<3.500 UVT/año). Emite tiquete electrónico (documento equivalente).',
      regimenes: ['no_responsable'],
      puedeFacturarLegal: true,
      requiereRut: true,
      umbrales: { ingresosUvtMax: 3500 },
      habilita: ['tiquete_electronico', 'operacion_pos', 'rampa_visible'],
      bloquea: ['factura_con_iva', 'nota_credito_b2b', 'retenciones', 'inc_restaurante'],
      requisitosSubir: ['rutCargado']
    },
    {
      id: 2,
      key: 'planta',
      icon: '🌳',
      nombre: 'PLANTA',
      subtitulo: 'Responsable IVA · o Simple',
      desc: 'Establecido, creciendo. Responsable de IVA (>3.500 UVT/año) o en Simple de Tributación (art. 908 ET). FEV con IVA por SKU.',
      regimenes: ['responsable_iva', 'simple'],
      puedeFacturarLegal: true,
      requiereRut: true,
      umbrales: { ingresosUvtMin: 3500 },
      habilita: ['factura_electronica', 'iva_por_sku', 'inc_restaurante', 'impuestos_saludables', 'nota_credito_debito', 'tiquete_electronico'],
      bloquea: ['retenciones'],
      requisitosSubir: ['rutCargado', 'resolucionDian', 'certificadoCargado', 'habilitacionDian']
    },
    {
      id: 3,
      key: 'roble',
      icon: '🏛️',
      nombre: 'ROBLE',
      subtitulo: 'Gran contribuyente · agente retenedor',
      desc: 'Declarado gran contribuyente por DIAN. Agente de retención (ReteFuente/ReteIVA/ReteICA por municipio DANE).',
      regimenes: ['gran_contribuyente'],
      puedeFacturarLegal: true,
      requiereRut: true,
      umbrales: null, // Declaración DIAN, no umbral de ingresos
      habilita: ['retenciones_b2b', 'retefuente', 'reteiva', 'reteica_municipal', 'todo_planta'],
      bloquea: [],
      requisitosSubir: ['rutCargado', 'resolucionDian', 'certificadoCargado', 'habilitacionDian']
    },
    {
      id: 4,
      key: 'cadena',
      icon: '🏢',
      nombre: 'CADENA',
      subtitulo: 'Multi-sede · corporativo',
      desc: 'Cadena multi-sede o franquicia gran contribuyente. Consolidación fiscal corporativa.',
      regimenes: ['gran_contribuyente'],
      puedeFacturarLegal: true,
      requiereRut: true,
      umbrales: { sedesMin: 2 },
      habilita: ['consolidacion_multi_sede', 'reportes_corporativos', 'todo_roble'],
      bloquea: [],
      requisitosSubir: []
    }
  ];

  var NIVEL_POR_KEY = {};
  NIVELES.forEach(function (n) { NIVEL_POR_KEY[n.key] = n; });

  // ─── API pública ───────────────────────────────────────────────────────────
  var CrozzoNivelesMadurez = {
    NIVELES: NIVELES,

    /** Devuelve la definición completa de un nivel por id (0-4). */
    getNivel: function (id) {
      var n = Number(id);
      if (!Number.isInteger(n) || n < 0 || n > 4) return NIVELES[0];
      return NIVELES[n];
    },

    /** Devuelve el nivel por key ('semilla'|'brote'|...). */
    getNivelPorKey: function (key) {
      return NIVEL_POR_KEY[key] || NIVELES[0];
    },

    /** Lee el nivel activo desde el ConfigManager inyectado. */
    getNivelActivo: function (configManager) {
      if (!configManager || typeof configManager.getNivelMadurez !== 'function') return NIVELES[0];
      return this.getNivel(configManager.getNivelMadurez());
    },

    /** ¿La capability X está habilitada en el nivel activo? */
    puede: function (configManager, capability) {
      var nivel = this.getNivelActivo(configManager);
      return nivel.habilita.indexOf(capability) !== -1;
    },

    /** ¿La capability X está explícitamente bloqueada en el nivel activo? */
    bloqueado: function (configManager, capability) {
      var nivel = this.getNivelActivo(configManager);
      return nivel.bloquea.indexOf(capability) !== -1;
    },

    /** ¿El régimen fiscal es válido para el nivel activo? */
    regimenValidoParaNivel: function (configManager) {
      var nivel = this.getNivelActivo(configManager);
      var regimen = configManager && typeof configManager.getRegimenFiscal === 'function'
        ? configManager.getRegimenFiscal()
        : 'no_responsable';
      return nivel.regimenes.indexOf(regimen) !== -1;
    },

    /**
     * Verifica si se cumplen los requisitos para subir al nivel indicado.
     * @returns {{ok: boolean, faltantes: string[]}}
     */
    requisitosParaSubir: function (configManager, nivelDestinoId) {
      var destino = this.getNivel(nivelDestinoId);
      var madurez = configManager && configManager.config && configManager.config.madurez;
      var completados = (madurez && madurez.requisitosCompletados) || {};
      var faltantes = [];
      destino.requisitosSubir.forEach(function (req) {
        if (!completados[req]) faltantes.push(req);
      });
      return { ok: faltantes.length === 0, faltantes: faltantes };
    },

    /**
     * Sube de nivel (con candado: solo si requisitos cumplidos y destino > actual).
     * No baja solo — bajar requiere confirmación expresa (bajarNivel).
     * @returns {{ok: boolean, motivo: string, nivel: object|null}}
     */
    subirNivel: function (configManager, nivelDestinoId) {
      var actual = this.getNivelActivo(configManager);
      var destino = this.getNivel(nivelDestinoId);
      if (destino.id <= actual.id) {
        return { ok: false, motivo: 'destino_no_mayor', nivel: null };
      }
      var req = this.requisitosParaSubir(configManager, destino.id);
      if (!req.ok) {
        return { ok: false, motivo: 'requisitos_faltantes:' + req.faltantes.join(','), nivel: null };
      }
      // Coherencia régimen: si el nivel exige régimen específico y el actual no encaja, lo ajusta al primero válido
      var regimenActual = configManager.getRegimenFiscal();
      if (destino.regimenes.indexOf(regimenActual) === -1) {
        configManager.config.madurez.regimenFiscal = destino.regimenes[0];
      }
      configManager.config.madurez.nivel = destino.id;
      configManager.config.madurez.fechaCambioNivel = new Date().toISOString();
      if (typeof configManager.save === 'function') configManager.save();
      return { ok: true, motivo: 'ok', nivel: destino };
    },

    /**
     * Baja de nivel (requiere confirmación expresa — el POS no baja solo).
     * Casos: ingresos caen sostenidamente, o cierre de sede.
     */
    bajarNivel: function (configManager, nivelDestinoId) {
      var actual = this.getNivelActivo(configManager);
      var destino = this.getNivel(nivelDestinoId);
      if (destino.id >= actual.id) {
        return { ok: false, motivo: 'destino_no_menor', nivel: null };
      }
      configManager.config.madurez.nivel = destino.id;
      configManager.config.madurez.fechaCambioNivel = new Date().toISOString();
      // Bajar a Semilla limpia banderas fiscales (vuelve a Sandbox)
      if (destino.id === 0) {
        configManager.config.madurez.regimenFiscal = 'no_responsable';
        configManager.config.madurez.nivelSugerido = null;
      }
      if (typeof configManager.save === 'function') configManager.save();
      return { ok: true, motivo: 'ok', nivel: destino };
    },

    /** Marca un requisito como completado (graduación). */
    marcarRequisito: function (configManager, requisitoKey, valor) {
      var m = configManager && configManager.config && configManager.config.madurez;
      if (!m || !m.requisitosCompletados) return false;
      m.requisitosCompletados[requisitoKey] = !!valor;
      if (typeof configManager.save === 'function') configManager.save();
      return true;
    },

    /**
     * Resumen legible del estado de madurez (para UI panel "Mi crecimiento").
     * @returns {{nivel, icon, nombre, subtitulo, regimen, puedeFacturarLegal, esAgenteRetenedor}}
     */
    resumen: function (configManager) {
      var nivel = this.getNivelActivo(configManager);
      var regimen = configManager.getRegimenFiscal();
      return {
        nivel: nivel.id,
        key: nivel.key,
        icon: nivel.icon,
        nombre: nivel.nombre,
        subtitulo: nivel.subtitulo,
        regimen: regimen,
        puedeFacturarLegal: nivel.puedeFacturarLegal,
        esAgenteRetenedor: nivel.id >= 3 || regimen === 'gran_contribuyente',
        desc: nivel.desc
      };
    }
  };

  global.CrozzoNivelesMadurez = CrozzoNivelesMadurez;
})(typeof window !== 'undefined' ? window : globalThis);
