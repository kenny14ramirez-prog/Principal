// ConfigManager (extraido de CrozzoPosMain.js, cirugia de modularizacion).
// Clase singleton de configuracion + hash de auditoria. Debe cargarse antes de
// CrozzoPosMain, donde el estado global hace ConfigManager.getInstance().
// ==========================================
// packages/shared-config/config-manager.ts
// ==========================================
/** Hash encadenado ligero para auditoría (integridad entre entradas consecutivas). */
function crozzoAuditChainHash(str) {
  let h = 5381 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return 'c' + h.toString(16).padStart(8, '0');
}
class ConfigManager {
  constructor() {
    if (ConfigManager.instance) return ConfigManager.instance;
    ConfigManager.instance = this;
    this.config = this.loadFromStorage();
  }
  static getInstance() {
    return new ConfigManager();
  }
  /** Asegura bloques empresa/dian/certificado/proveedor cuando pos_dian_config está parcial (p. ej. solo seguridad). */
  applyCoreSectionsMigration(cfg) {
    const c = cfg || {};
    const d = this.getDefaultConfig();
    ['empresa', 'dian', 'certificado', 'proveedor', 'impuestos', 'comandas', 'salon', 'seguridad', 'usuarios'].forEach(function (k) {
      if (!c[k] || typeof c[k] !== 'object') {
        c[k] = JSON.parse(JSON.stringify(d[k]));
      } else if (d[k] && typeof d[k] === 'object') {
        c[k] = Object.assign({}, d[k], c[k]);
      }
    });
    if (!Array.isArray(c.auditoria)) c.auditoria = [];
    if (!Array.isArray(c.facturas)) c.facturas = [];
    return c;
  }
  loadFromStorage() {
    try {
      const stored = localStorage.getItem('pos_dian_config');
      let cfg = stored ? JSON.parse(stored) : this.getDefaultConfig();
      if (typeof window.__crozzoApplyStandaloneSupabaseToConfig === 'function') {
        cfg = window.__crozzoApplyStandaloneSupabaseToConfig(cfg) || cfg;
      }
      return this.applyImpuestosMigration(
        this.applyPosExtensionsMigration(
          this.applyCrmLiteMigration(this.applyOperacionModoMigration(this.applyCoreSectionsMigration(cfg)))
        )
      );
    } catch (e) {
      let cfg = this.getDefaultConfig();
      if (typeof window.__crozzoApplyStandaloneSupabaseToConfig === 'function') {
        cfg = window.__crozzoApplyStandaloneSupabaseToConfig(cfg) || cfg;
      }
      return this.applyImpuestosMigration(
        this.applyPosExtensionsMigration(
          this.applyCrmLiteMigration(this.applyOperacionModoMigration(this.applyCoreSectionsMigration(cfg)))
        )
      );
    }
  }
  /** Tarifas IVA, impuesto al consumo y modo precios carta (IVA / impuesto incluido o no). */
  applyImpuestosMigration(cfg) {
    const c = cfg || {};
    const dImp = this.getDefaultConfig().impuestos;
    if (!c.impuestos || typeof c.impuestos !== 'object') {
      c.impuestos = JSON.parse(JSON.stringify(dImp));
      return c;
    }
    const imp = c.impuestos;
    if (!Array.isArray(imp.tarifasIVA)) imp.tarifasIVA = JSON.parse(JSON.stringify(dImp.tarifasIVA));
    if (!imp.impuestoAlConsumo || typeof imp.impuestoAlConsumo !== 'object') {
      imp.impuestoAlConsumo = { aplica: false, tarifa: 0.08 };
    } else {
      if (typeof imp.impuestoAlConsumo.aplica !== 'boolean') imp.impuestoAlConsumo.aplica = false;
      const tr = Number(imp.impuestoAlConsumo.tarifa);
      imp.impuestoAlConsumo.tarifa = Number.isFinite(tr) ? Math.max(0, Math.min(0.5, tr)) : 0.08;
    }
    if (typeof imp.ivaIncluidoEnPrecios !== 'boolean') imp.ivaIncluidoEnPrecios = false;
    if (!imp.perfilFiscal) imp.perfilFiscal = imp.impuestoAlConsumo.aplica ? 'restaurante' : 'comercio';
    try {
      const opPerfil = String(
        (typeof localStorage !== 'undefined' && localStorage.getItem('crozzo_perfil_empresa')) || ''
      ).toLowerCase();
      const meta = typeof global !== 'undefined' && global.CROZZO_PERFIL_META ? global.CROZZO_PERFIL_META[opPerfil] : null;
      if (
        meta &&
        meta.tipo === 'restaurante' &&
        imp.perfilFiscal === 'comercio' &&
        !imp.impuestoAlConsumo.aplica
      ) {
        imp.perfilFiscal = 'restaurante';
        imp.impuestoAlConsumo.aplica = true;
        if (!(Number(imp.impuestoAlConsumo.tarifa) > 0)) imp.impuestoAlConsumo.tarifa = 0.08;
      }
    } catch (_) {}
    return c;
  }
  /** Proveedores locales, órdenes de compra y modo runtime de sync (online / híbrido / offline). */
  applyPosExtensionsMigration(cfg) {
    const c = cfg || {};
    const modes = ['online', 'hybrid', 'offline'];
    if (!modes.includes(c.runtimeSyncModo)) c.runtimeSyncModo = 'hybrid';
    if (!Array.isArray(c.proveedoresOC)) c.proveedoresOC = [];
    if (!Array.isArray(c.ordenesCompra)) c.ordenesCompra = [];
    if (!c.seguridad || typeof c.seguridad !== 'object') c.seguridad = { requiereLogin: true, ultimoLoginAt: null };
    if (typeof c.seguridad.kioskExitPin !== 'string') c.seguridad.kioskExitPin = '';
    if (typeof c.seguridad.kennyPasswordChanged !== 'boolean') c.seguridad.kennyPasswordChanged = false;
    if (typeof c.seguridad.sessionIdleMinutes !== 'number') c.seguridad.sessionIdleMinutes = 30;
    if (!c.seguridad.honeypot || typeof c.seguridad.honeypot !== 'object') {
      c.seguridad.honeypot = {
        enabled: true,
        lockMinutes: 45,
        theaterSeconds: 8,
        harvestMinMinutes: 1,
        harvestMaxMinutes: 5,
        wipeSecrets: false,
        tripCount: 0,
        lockUntil: 0,
      };
    }
    c.seguridad.requiereLogin = true;
    c.seguridad.honeypot.enabled = true;
    var hpBoot = c.seguridad.honeypot;
    if (
      hpBoot &&
      (hpBoot.legendaryActive ||
        (hpBoot.lockUntil && hpBoot.lockUntil > Date.now()) ||
        hpBoot.produccionEstricta === true ||
        c.seguridad.bloquearClavePlanoEnLogin === true)
    ) {
      hpBoot.legendaryActive = false;
      hpBoot.lockUntil = 0;
      hpBoot.tripCount = 0;
      hpBoot.produccionEstricta = false;
      c.seguridad.bloquearClavePlanoEnLogin = false;
    }
    if (window.CrozzoAuthSecurity && typeof CrozzoAuthSecurity.crozzoEnforceSeguridadPolicy === 'function') {
      c.seguridad = CrozzoAuthSecurity.crozzoEnforceSeguridadPolicy(c.seguridad);
    }
    if (!c.certificado || typeof c.certificado !== 'object') c.certificado = {};
    if (typeof c.certificado.p12Sha256 !== 'string') c.certificado.p12Sha256 = '';
    return c;
  }
  applyCrmLiteMigration(cfg) {
    const c = cfg || {};
    if (!Array.isArray(c.clientesCrm)) c.clientesCrm = [];
    if (!c.crmLite || typeof c.crmLite !== 'object') {
      c.crmLite = { loyaltyMode: 'percent', loyaltyPercent: 0.05, loyaltyFixed: 0 };
    } else {
      if (c.crmLite.loyaltyMode !== 'fixed') c.crmLite.loyaltyMode = 'percent';
      if (typeof c.crmLite.loyaltyPercent !== 'number' || Number.isNaN(c.crmLite.loyaltyPercent)) c.crmLite.loyaltyPercent = 0.05;
      if (typeof c.crmLite.loyaltyFixed !== 'number' || Number.isNaN(c.crmLite.loyaltyFixed)) c.crmLite.loyaltyFixed = 0;
    }
    return c;
  }
  /** Migra modoDemo (legacy) → operacionModo; mantiene modoDemo sincronizado. */
  applyOperacionModoMigration(cfg) {
    const c = cfg || {};
    const allowed = ['demo', 'simple', 'electronic'];
    if (!allowed.includes(c.operacionModo)) {
      if (c.modoDemo === true) c.operacionModo = 'demo';
      else if (c.modoDemo === false) c.operacionModo = 'electronic';
      else c.operacionModo = 'simple';
    }
    c.modoDemo = c.operacionModo === 'demo';
    if (!c.demoSubmodo || (c.demoSubmodo !== 'fe' && c.demoSubmodo !== 'pos')) c.demoSubmodo = 'pos';
    return c;
  }
  getDefaultConfig() {
    return {
      operacionModo: 'simple',
      modoDemo: false,
      demoSubmodo: 'pos',
      empresa: {
        nit: '',
        dv: '',
        razonSocial: '',
        nombreComercial: '',
        direccion: '',
        telefono: '',
        email: '',
        codigoPostal: '',
        departamento: '',
        ciudad: '',
        regimenFiscal: 'responsable_iva',
        matriculaMercantil: '',
        actividadEconomica: ''
      },
      dian: {
        resolucion: '',
        prefijo: '',
        rangoDesde: 1,
        rangoHasta: 0,
        fechaDesde: '',
        fechaVencimiento: '',
        tipoDocumento: '01',
        tipoOperacion: '01'
      },
      certificado: {
        filename: '',
        expiryDate: '',
        issuer: '',
        encrypted: false,
        p12Sha256: ''
      },
      proveedor: {
        type: 'mock',
        apiKey: '',
        apiSecret: '',
        baseUrl: '',
        ambiente: 'test'
      },
      impuestos: {
        tarifasIVA: [
          { rate: 0.19, description: 'General', activo: true },
          { rate: 0.05, description: 'Reducido', activo: true },
          { rate: 0, description: 'Exento', activo: true }
        ],
        responsableIVA: true,
        retencionFuente: { aplica: false, tarifa: 0.025 },
        retencionICA: { aplica: false, tarifa: 0 },
        impuestoAlConsumo: { aplica: false, tarifa: 0.08 },
        ivaIncluidoEnPrecios: false,
        perfilFiscal: 'comercio'
      },
      comandas: {
        autoPrint: true,
        areas: [
          { id: 'COCINA', nombre: 'Cocina', impresora: '', estilo: { fontSize: 12, showPrice: false, showHeader: true } },
          { id: 'BAR', nombre: 'Bar', impresora: '', estilo: { fontSize: 12, showPrice: false, showHeader: true } }
        ]
      },
      salon: {
        mesaCount: 40,
        llevarCount: 10,
        mesaEtiquetaTablet: 'solo_numero',
        llevarEtiquetaTablet: 'solo_numero',
        mesaNombres: {},
        llevarNombres: {},
      },
      facturacionAdmin: {
        impresoraCajaPos: '',
        impresoraComandas: '',
        copiasFactura: 1,
        autoImprimir: true,
        impresorasCustom: [],
        detalleImpresion: ''
      },
      conexionSistemas: {
        role: 'A',
        serverIp: '',
        centralIp: '',
        port: 3000,
        mode: 'demo',
        businessName: '',
        tabletName: '',
        dianNit: '',
        dianResolution: '',
        dianRange: '',
        deviceId: ''
      },
      multidispositivo: {
        role: 'A',
        businessId: '',
        deviceId: '',
        serverIp: '',
        centralIp: '',
        port: 3000,
        allowLan: true,
        offlineEnabled: true,
        cloudPriority: true,
        supabase: {
          url: '',
          anonKey: '',
          schema: 'public',
          deviceConfigsTable: 'device_configs',
          syncQueueTable: 'sync_queue'
        }
      },
      auditoria: [],
      facturasArchivo: {
        enabled: true,
        maxActivas: 2500,
        minAgeDays: 60,
        autoOnBoot: true,
        keepMonths: 24,
      },
      seguridad: {
        requiereLogin: true,
        ultimoLoginAt: null,
        kioskExitPin: '',
        kennyPasswordChanged: false,
        sessionIdleMinutes: 30,
        honeypot: {
          enabled: true,
          lockMinutes: 45,
          theaterSeconds: 8,
          harvestMinMinutes: 1,
          harvestMaxMinutes: 5,
          wipeSecrets: false,
          tripCount: 0,
          lockUntil: 0,
        },
      },
      usuarios: {
        staff: [
          {
            id: 'CAJERO',
            nombre: 'Cajero',
            requiereClaveInicial: true,
            rol: 'caja',
            activo: true,
            permisos: {
              caja: [
                'vista_pos',
                'vista_facturas',
                'vista_clientes',
                'abrir_orden',
                'editar_orden',
                'facturar',
                'cierre_arqueo',
              ],
              comandas: [],
              admin: []
            }
          },
          {
            id: 'MESERO1',
            nombre: 'Mesero 1',
            requiereClaveInicial: true,
            rol: 'mesero',
            activo: true,
            permisos: {
              caja: ['vista_tablets', 'vista_clientes', 'tab_abrir', 'tab_editar'],
              comandas: ['ver'],
              admin: []
            }
          },
          {
            id: 'MESERO2',
            nombre: 'Mesero 2',
            requiereClaveInicial: true,
            rol: 'mesero',
            activo: true,
            permisos: {
              caja: ['vista_tablets', 'vista_clientes', 'tab_abrir', 'tab_editar'],
              comandas: ['ver'],
              admin: []
            }
          }
        ]
      },
      facturas: [],
      ultimoConsecutivo: 0,
      clientesCrm: [],
      crmLite: {
        loyaltyMode: 'percent',
        loyaltyPercent: 0.05,
        loyaltyFixed: 0
      },
      runtimeSyncModo: 'hybrid',
      proveedoresOC: [],
      ordenesCompra: []
    };
  }
  save() {
    localStorage.setItem('pos_dian_config', JSON.stringify(this.config));
  }
  get(key) {
    return this.config[key];
  }
  set(key, value) {
    this.config[key] = value;
    this.save();
  }
  update(path, value) {
    const keys = path.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }
  getEmpresa() {
    const d = this.getDefaultConfig().empresa;
    return (this.config && this.config.empresa) || d;
  }
  getDian() { return this.config.dian; }
  getProveedor() { return this.config.proveedor; }
  getCertificado() { return this.config.certificado; }
  getImpuestos() {
    if (!this.config || typeof this.config !== 'object') {
      return JSON.parse(JSON.stringify(this.getDefaultConfig().impuestos));
    }
    if (!this.config.impuestos || typeof this.config.impuestos !== 'object') {
      this.config.impuestos = JSON.parse(JSON.stringify(this.getDefaultConfig().impuestos));
    }
    return this.config.impuestos;
  }
  /** Legacy: true solo en modo 🧪 DEMO (simulación, sin validez fiscal). */
  isDemoMode() { return this.config.operacionModo === 'demo'; }
  getOperacionModo() {
    return this.config.operacionModo || 'simple';
  }
  setOperacionModo(modo) {
    const allowed = ['demo', 'simple', 'electronic'];
    if (!allowed.includes(modo)) return;
    this.config.operacionModo = modo;
    this.config.modoDemo = modo === 'demo';
    this.save();
  }
  isSimpleMode() { return this.getOperacionModo() === 'simple'; }
  isElectronicMode() { return this.getOperacionModo() === 'electronic'; }
  getDemoSubmodo() {
    const s = String(this.config.demoSubmodo || 'pos').toLowerCase();
    return s === 'fe' ? 'fe' : 'pos';
  }
  setDemoSubmodo(sub) {
    this.config.demoSubmodo = sub === 'fe' ? 'fe' : 'pos';
    this.save();
  }
  isDemoFePrueba() {
    return this.isDemoMode() && this.getDemoSubmodo() === 'fe';
  }
  getFacturas() {
    if (!this.config || typeof this.config !== 'object') return [];
    if (!Array.isArray(this.config.facturas)) this.config.facturas = [];
    return this.config.facturas;
  }
  getCrmLite() {
    const d = { loyaltyMode: 'percent', loyaltyPercent: 0.05, loyaltyFixed: 0 };
    const x = this.config.crmLite;
    if (!x || typeof x !== 'object') return { ...d };
    const mode = x.loyaltyMode === 'fixed' ? 'fixed' : 'percent';
    const loyaltyPercent = typeof x.loyaltyPercent === 'number' && !Number.isNaN(x.loyaltyPercent) ? x.loyaltyPercent : d.loyaltyPercent;
    const loyaltyFixed = typeof x.loyaltyFixed === 'number' && !Number.isNaN(x.loyaltyFixed) ? x.loyaltyFixed : d.loyaltyFixed;
    return { loyaltyMode: mode, loyaltyPercent, loyaltyFixed };
  }
  canGoLive() {
    const missing = [];
    const emp = (this.config && this.config.empresa) || {};
    const dian = (this.config && this.config.dian) || {};
    const cert = (this.config && this.config.certificado) || {};
    const prov = (this.config && this.config.proveedor) || { type: 'mock' };
    if (!emp.nit) missing.push('NIT de empresa');
    if (!emp.razonSocial) missing.push('Razón social');
    if (!emp.codigoPostal) missing.push('Código postal');
    if (!dian.resolucion) missing.push('Resolución DIAN');
    if (!dian.prefijo) missing.push('Prefijo de resolución');
    if (!dian.rangoHasta) missing.push('Rango de facturación');
    if (!dian.fechaVencimiento) missing.push('Fecha de vencimiento');
    if (!cert.encrypted) missing.push('Certificado digital');
    if (prov.type !== 'mock' && !prov.apiKey) missing.push('Credenciales del proveedor');
    return { valid: missing.length === 0, missing };
  }
  addAudit(action, details, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    if (o.synthetic || o.channel === 'honeypot') {
      this.appendHoneypotTripLog(String(action || 'evento'), String(details == null ? '' : details), o);
      return;
    }
    if (!this.config || typeof this.config !== 'object') {
      try {
        this.config = this.loadFromStorage();
      } catch (_) {
        return;
      }
    }
    let auditLog = this.config.auditoria;
    if (!Array.isArray(auditLog)) auditLog = [];
    this.config.auditoria = auditLog;
    let userLabel = 'admin';
    try {
      if (typeof getCurrentUser === 'function') {
        const u = getCurrentUser();
        if (u) userLabel = String(u.nombre || u.id || 'admin');
      }
    } catch (_) {}
    const prevHead = auditLog[0];
    let prevHash = 'GENESIS';
    if (prevHead) {
      prevHash = prevHead.chainHash || 'LEGACY-' + String(prevHead.timestamp || '');
    }
    const stamp = new Date().toISOString();
    const payload = [prevHash, stamp, String(action), String(details == null ? '' : details), userLabel].join('|');
    const chainHash =
      typeof crozzoAuditChainHash === 'function' ? crozzoAuditChainHash(payload) : 'n/a';
    const entry = {
      timestamp: stamp,
      user: userLabel,
      action,
      details,
      modo: this.getOperacionModo(),
      prevHash,
      chainHash,
      synthetic: false,
      channel: o.channel || 'operational',
    };
    auditLog.unshift(entry);
    if (auditLog.length > 300) auditLog.pop();
    this.save();
    try {
      if (typeof crozzoTryMirrorAuditToSupabase === 'function') {
        crozzoTryMirrorAuditToSupabase(entry);
      }
    } catch (_) {}
  }
  /** Registro forense honeypot (no contamina cadena operativa de auditoría). */
  appendHoneypotTripLog(action, details, meta) {
    const seg = this.get('seguridad') || {};
    const hp = seg.honeypot && typeof seg.honeypot === 'object' ? { ...seg.honeypot } : {};
    const log = Array.isArray(hp.tripLog) ? hp.tripLog.slice() : [];
    const m = meta && typeof meta === 'object' ? meta : {};
    const entry = {
      at: new Date().toISOString(),
      action: String(action || ''),
      details: String(details == null ? '' : details),
      tripId: m.tripId ? String(m.tripId) : null,
      decoyUser: m.decoyUser ? String(m.decoyUser) : null,
    };
    if (m.trapSource) entry.trapSource = String(m.trapSource);
    if (m.scanUnique != null) entry.scanUnique = m.scanUnique;
    if (m.scanTotal != null) entry.scanTotal = m.scanTotal;
    if (m.userAgent) entry.userAgent = String(m.userAgent).slice(0, 220);
    if (m.device && typeof m.device === 'object') entry.device = m.device;
    log.unshift(entry);
    if (log.length > 250) log.length = 250;
    hp.tripLog = log;
    window.__crozzoHpConfigWriteBypass = true;
    try {
      this.set('seguridad', { ...seg, honeypot: hp });
    } finally {
      window.__crozzoHpConfigWriteBypass = false;
    }
  }
  getNextConsecutivo() {
    const next = (this.config.ultimoConsecutivo || this.config.dian.rangoDesde - 1) + 1;
    this.config.ultimoConsecutivo = next;
    this.save();
    return next;
  }
  getFacturasRestantes() {
    if (!this.config.dian.rangoHasta) return Infinity;
    const used = (this.config.ultimoConsecutivo || this.config.dian.rangoDesde - 1) - this.config.dian.rangoDesde + 1;
    return Math.max(0, this.config.dian.rangoHasta - (this.config.dian.rangoDesde - 1) - used);
  }
}
