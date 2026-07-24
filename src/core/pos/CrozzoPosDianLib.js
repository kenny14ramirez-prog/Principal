// Libreria DIAN compartida (extraida de CrozzoPosMain.js, cirugia de modularizacion).
// Funciones globales puras: validador NIT, CUFE, QR DIAN, UBL 2.1, proveedores y timbrado.
// ==========================================
// packages/shared-dian/validators/nit-validator.ts
// ==========================================
function normalizarEntradaNit(raw) {
  var s = String(raw || '').trim();
  if (!s) return s;
  var sep = s.match(/^(\d{8,14})[\s,.\u00B7\-]+(\d)$/);
  if (sep) return sep[1] + '-' + sep[2];
  return s;
}
function intentarSepararNitDv(digits) {
  if (!/^[0-9]{10,11}$/.test(digits)) return null;
  var base = digits.slice(0, -1);
  var dv = digits.slice(-1);
  var dvCalc = calcularDV(base);
  if (dvCalc === parseInt(dv, 10)) {
    return { base: base, dv: dv, display: base + '-' + dv };
  }
  return null;
}
function inferirNitDesdeSoloBase(digits) {
  if (!/^[0-9]{9}$/.test(digits)) return null;
  if (digits.charAt(0) !== '8' && digits.charAt(0) !== '9') return null;
  var dv = calcularDV(digits);
  return { base: digits, dv: String(dv), display: digits + '-' + dv };
}
function validarNIT(nit, opciones) {
  var opts = opciones || {};
  var relajado = !!opts.relajado;
  var raw = normalizarEntradaNit(nit);
  if (!raw) {
    return relajado ? { valido: true, modo: 'vacio' } : { valido: false, error: 'NIT requerido' };
  }
  var clean = raw.replace(/[^0-9-]/g, '');
  if (!clean) {
    return relajado ? { valido: true, modo: 'vacio' } : { valido: false, error: 'NIT requerido' };
  }
  var hyphenParts = clean.split('-');
  if (hyphenParts.length === 2 && hyphenParts[0].length >= 1 && hyphenParts[1].length === 1) {
    var base = hyphenParts[0];
    var dvInput = hyphenParts[1];
    if (base.length < 1 || base.length > 15) return { valido: false, error: 'NIT fuera de rango' };
    if (!/^[0-9]+$/.test(base) || !/^[0-9]$/.test(dvInput)) {
      return relajado
        ? { valido: true, modo: 'referencia' }
        : { valido: false, error: 'NIT: solo números y un dígito de verificación tras el guion.' };
    }
    var primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    var suma = 0;
    for (var i = 0; i < base.length; i++) {
      var digito = parseInt(base[base.length - 1 - i], 10);
      suma += digito * primos[i % primos.length];
    }
    var residuo = suma % 11;
    var dvCalculado = residuo <= 1 ? 0 : 11 - residuo;
    if (dvCalculado !== parseInt(dvInput, 10)) {
      if (relajado) {
        return {
          valido: true,
          modo: 'dv_no_verificado',
          base: base,
          dv: parseInt(dvInput, 10),
          advertencia:
            'El dígito de verificación no coincide con el algoritmo DIAN; se guarda como referencia. Para factura electrónica válida corrige el NIT o usa consumidor final.',
        };
      }
      return { valido: false, error: 'Dígito verificador incorrecto. Esperado: ' + dvCalculado };
    }
    return { valido: true, dv: dvCalculado, base: base, modo: 'nit_dian' };
  }
  if (/^[0-9]{10,11}$/.test(clean)) {
    var sp = intentarSepararNitDv(clean);
    if (sp) {
      return { valido: true, dv: parseInt(sp.dv, 10), base: sp.base, modo: 'nit_dian' };
    }
  }
  if (/^[0-9]{9}$/.test(clean)) {
    var inf = inferirNitDesdeSoloBase(clean);
    if (inf) {
      return { valido: true, dv: parseInt(inf.dv, 10), base: inf.base, modo: 'nit_dian', inferido: true };
    }
  }
  if (relajado && /^[0-9]{4,15}$/.test(clean)) {
    return { valido: true, modo: 'cedula_o_documento', base: clean };
  }
  if (relajado) {
    return {
      valido: false,
      error: 'Persona sin NIT: solo números (cédula, 4–15 dígitos, sin guion) o vacío. Empresa: formato NIT-DV (ej. 830123456-7).',
    };
  }
  return {
    valido: false,
    error: 'Formato DIAN: NIT-DV (números, guion, un dígito). Sin NIT en factura: deja vacío (consumidor final).',
  };
}
function calcularDV(nitBase) {
  const primos = [3,7,13,17,19,23,29,37,41,43,47,53,59,67,71];
  let suma = 0;
  for (let i = 0; i < nitBase.length; i++) {
    const digito = parseInt(nitBase[nitBase.length - 1 - i]);
    suma += digito * primos[i % primos.length];
  }
  const residuo = suma % 11;
  return residuo <= 1 ? 0 : 11 - residuo;
}
// ==========================================
// packages/shared-dian/cufe-calculator.ts
// ==========================================
async function calcularCUFE(factura) {
  const cadena = [
    factura.numeroResolucion || '',
    factura.fechaEmision || '',
    factura.tipoDocumento || '01',
    factura.vendedorNit || '',
    factura.compradorNit || '',
    (factura.totalFactura || 0).toFixed(2),
    factura.cufePrevio || ''
  ].join('');
  const encoder = new TextEncoder();
  const data = encoder.encode(cadena);
  const hashBuffer = await crypto.subtle.digest('SHA-384', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
// ==========================================
// packages/shared-dian/qr-dian-generator.ts
// ==========================================
var CROZZO_DIAN_QR_VPFE_BASE = 'https://catalogo-vpfe.dian.gov.co/document/searchqr';
function generarQRDIAN(factura) {
  var cufe = String((factura && factura.cufe) || '').trim();
  if (!cufe) return '';
  return CROZZO_DIAN_QR_VPFE_BASE + '?documentkey=' + encodeURIComponent(cufe);
}
function crozzoFacturaQrUrlResolve(f) {
  if (!f) return '';
  var cufe = String(f.cufe || '').trim();
  if (!cufe || cufe === 'NO-APLICA-POS' || /^pendiente/i.test(cufe)) return '';
  var raw = String(f.qrUrl || '').trim();
  if (/catalogo-vpfe\.dian\.gov\.co/i.test(raw) && /documentkey/i.test(raw)) return raw;
  if (/facturaelectronica\.dian\.gov\.co/i.test(raw) || !raw) return generarQRDIAN({ cufe: cufe });
  return raw;
}
// ==========================================
// packages/shared-dian/ubl-2.1-builder.ts
// ==========================================
function buildUBL21(factura, config) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const emp = config.empresa;
  const dian = config.dian;
  const impuestos = config.impuestos;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${esc(dian.resolucion)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${esc(dian.fechaDesde)}</cbc:StartDate>
              <cbc:EndDate>${esc(dian.fechaVencimiento)}</cbc:EndDate>
            </sts:AuthorizationPeriod>
          </sts:InvoiceControl>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>01</cbc:CustomizationID>
  <cbc:ID>${esc(dian.prefijo)}${String(factura.consecutivo).padStart(8, '0')}</cbc:ID>
  <cbc:IssueDate>${esc(factura.fechaEmision?.split('T')[0])}</cbc:IssueDate>
  <cbc:IssueTime>${esc(factura.fechaEmision?.split('T')[1] || '00:00:00')}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="${esc(factura.tipoDocumento)}">${esc(factura.tipoOperacion)}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="9" schemeName="31">${esc(emp.nit)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${esc(emp.razonSocial)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(emp.direccion)}</cbc:StreetName>
        <cbc:CityName>Bogotá D.C.</cbc:CityName>
        <cbc:CountrySubentity>Bogotá</cbc:CountrySubentity>
        <cac:Country>
          <cbc:IdentificationCode>CO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:ID>O-99</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(emp.razonSocial)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="9" schemeName="31">${esc(factura.compradorNit || '222222222')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(factura.compradorNombre || 'Consumidor Final')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
  let taxTotal = 0;
  let subtotal = 0;
  const opUbl = crozzoImpuestosCajaOpciones(impuestos);
  factura.items.forEach((item, idx) => {
    const m = crozzoLineMontosFiscales(item, opUbl);
    const itemSubtotal = m.base;
    const itemTax = m.tax;
    const pct = (m.rate * 100).toFixed(2);
    const qty = Number(item.cantidad) || 1;
    const unitBase = qty ? m.base / qty : m.base;
    const taxSchemeName =
      opUbl.consumoAplica && m.rate > 0 && Math.abs(m.rate - opUbl.consumoTarifa) < 0.0001
        ? 'INC'
        : 'IVA';
    const taxSchemeId = taxSchemeName === 'INC' ? '04' : '01';
    taxTotal += itemTax;
    subtotal += itemSubtotal;
    xml += `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${item.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>${itemSubtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(item.nombre)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount>${unitBase.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
    <cac:TaxTotal>
      <cbc:TaxAmount>${itemTax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount>${itemSubtotal.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount>${itemTax.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${pct}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>${taxSchemeId}</cbc:ID>
            <cbc:Name>${esc(taxSchemeName)}</cbc:Name>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </cac:InvoiceLine>`;
  });
  const total = subtotal + taxTotal;
  xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount>${taxTotal.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount>${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount>${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount>${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount>${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
  return xml;
}
// ==========================================
// packages/shared-dian/providers/mock-dian-adapter.ts
// ==========================================
async function mockStamp(xml, factura) {
  await new Promise(r => setTimeout(r, 800));
  const cufe = await calcularCUFE(factura);
  const qrUrl = generarQRDIAN({ ...factura, cufe });
  return {
    success: true,
    uuid: `DEMO-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
    cufe,
    qrUrl,
    fechaTimbrado: new Date().toISOString(),
    isDemo: true,
    xml
  };
}
// ==========================================
// packages/shared-dian/providers/dataico-adapter.ts
// ==========================================
var CROZZO_FISCAL_OUTBOX_KEY = 'crozzo_fiscal_outbox_v1';
var DATAICO_INVOICES_URL = 'https://api.dataico.com/direct/dataico_api/v2/invoices';

function crozzoFiscalOutboxLoad() {
  try {
    var raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CROZZO_FISCAL_OUTBOX_KEY) : null;
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}
function crozzoFiscalOutboxSave(arr) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CROZZO_FISCAL_OUTBOX_KEY, JSON.stringify((arr || []).slice(-200)));
    }
  } catch (_) {}
}
function crozzoFiscalOutboxEnqueue(entry) {
  var all = crozzoFiscalOutboxLoad();
  all.push(entry);
  crozzoFiscalOutboxSave(all);
  return entry;
}

function crozzoResolveDataicoAuth(config, prov) {
  prov = prov || {};
  var accountId =
    prov.accountId ||
    prov.dataicoAccountId ||
    prov.apiSecret ||
    (config && config.get && config.get('dataicoAccountId')) ||
    '';
  var token = prov.apiKey || prov.authToken || prov.token || '';
  var baseUrl = String(prov.baseUrl || DATAICO_INVOICES_URL).replace(/\/$/, '');
  if (baseUrl.indexOf('/invoices') < 0) baseUrl = baseUrl + '/invoices';
  return { accountId: String(accountId || ''), token: String(token || ''), url: baseUrl };
}

function crozzoBuildDataicoInvoiceBody(factura, xml, config) {
  var emp =
    (config && typeof config.getEmpresa === 'function' && config.getEmpresa()) ||
    (config && config.empresa) ||
    {};
  var dian = (config && typeof config.getDian === 'function' && config.getDian()) || {};
  var items = (factura && factura.items) || [];
  return {
    invoice: {
      number: String((factura && (factura.consecutivo || factura.number)) || ''),
      prefix: String((dian && dian.prefijo) || (factura && factura.prefijo) || ''),
      document_type: 'FV',
      send_dian: true,
      send_email: false,
      customer: {
        identification: String((factura && (factura.clienteNit || factura.nit)) || '222222222222'),
        identification_type: 'NIT',
        name: String((factura && (factura.clienteNombre || factura.cliente)) || 'CONSUMIDOR FINAL'),
      },
      company_nit: String((emp && emp.nit) || ''),
      notes: 'Crozzo POS',
      xml_ubl: xml ? String(xml).slice(0, 500000) : undefined,
      items: items.map(function (it) {
        return {
          sku: String(it.sku || it.id || 'ITEM'),
          description: String(it.nombreVenta || it.nombre || 'Item'),
          quantity: Number(it.cantidad || 1),
          price: Number(it.precio || it.price || 0),
        };
      }),
    },
    actions: { send_dian: true, send_email: false },
  };
}

/**
 * Timbre Dataico real (POST invoices). Firma: (xml, factura, config).
 * Si no hay Auth-token → cola fiscal + error explícito (nunca fingir isDemo:false).
 * Si allowSimulatedStamp en proveedor (solo lab) → mock marcado isDemo:true.
 */
async function dataicoStamp(xml, factura, config) {
  var prov =
    (config && typeof config.getProveedor === 'function' && config.getProveedor()) ||
    (config && config.proveedor) ||
    {};
  var auth = crozzoResolveDataicoAuth(config, prov);
  if (!auth.token) {
    var queued = crozzoFiscalOutboxEnqueue({
      id: 'fisc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      provider: 'dataico',
      reason: 'missing_auth_token',
      consecutivo: factura && factura.consecutivo,
      createdAt: new Date().toISOString(),
      xml: xml ? String(xml).slice(0, 200000) : '',
    });
    var err = new Error(
      'Dataico: falta Auth-token (proveedor.apiKey). Venta puede quedar en cola fiscal #' + queued.id
    );
    err.code = 'DATAICO_AUTH_MISSING';
    err.fiscalQueued = queued;
    throw err;
  }

  // Lab explícito: nunca pasar por alto en producción
  if (prov.allowSimulatedStamp === true) {
    var sim = await mockStamp(xml, factura || {});
    sim.provider = 'dataico_simulated';
    sim.warning = 'allowSimulatedStamp=true — no es CUFE DIAN real';
    return sim;
  }

  var headers = {
    'Content-Type': 'application/json',
    'Auth-token': auth.token,
  };
  if (auth.accountId) headers['Dataico_account_id'] = auth.accountId;

  var body = crozzoBuildDataicoInvoiceBody(factura || {}, xml, config);
  var res;
  try {
    res = await fetch(auth.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    var qNet = crozzoFiscalOutboxEnqueue({
      id: 'fisc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      status: 'retry',
      provider: 'dataico',
      reason: 'network',
      error: netErr && netErr.message ? netErr.message : String(netErr),
      consecutivo: factura && factura.consecutivo,
      createdAt: new Date().toISOString(),
      payload: body,
    });
    // Offline-first: la venta no se pierde; queda pendiente fiscal.
    return {
      success: true,
      pending: true,
      uuid: qNet.id,
      cufe: '',
      qrUrl: '',
      fechaTimbrado: new Date().toISOString(),
      isDemo: false,
      xml: xml,
      provider: 'dataico',
      fiscalQueued: qNet,
      dianStatus: 'QUEUED_OFFLINE',
      warning: 'Dataico sin red — cola fiscal #' + qNet.id,
    };
  }

  var json = {};
  try {
    json = await res.json();
  } catch (_) {
    json = {};
  }
  if (!res.ok) {
    var qFail = crozzoFiscalOutboxEnqueue({
      id: 'fisc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      status: 'retry',
      provider: 'dataico',
      reason: 'http_' + res.status,
      error: JSON.stringify(json).slice(0, 2000),
      consecutivo: factura && factura.consecutivo,
      createdAt: new Date().toISOString(),
    });
    var eHttp = new Error(
      'Dataico HTTP ' + res.status + ' — cola #' + qFail.id + ': ' + (json.error || json.message || 'ver outbox')
    );
    eHttp.code = 'DATAICO_HTTP';
    eHttp.fiscalQueued = qFail;
    throw eHttp;
  }

  var data = json.invoice || json.data || json;
  var cufe = data.cufe || data.CUFE || data.uuid_cufe || '';
  var uuid = data.uuid || data.id || data.invoice_id || '';
  var qrUrl = data.qrcode || data.qr_url || data.qr || '';
  if (!cufe && typeof calcularCUFE === 'function') {
    // Respuesta parcial: no inventar éxito DIAN
    var qPartial = crozzoFiscalOutboxEnqueue({
      id: 'fisc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      provider: 'dataico',
      reason: 'missing_cufe_in_response',
      consecutivo: factura && factura.consecutivo,
      createdAt: new Date().toISOString(),
      raw: data,
    });
    return {
      success: true,
      pending: true,
      uuid: uuid || qPartial.id,
      cufe: '',
      qrUrl: qrUrl,
      fechaTimbrado: new Date().toISOString(),
      isDemo: false,
      xml: xml,
      provider: 'dataico',
      fiscalQueued: qPartial,
      dianStatus: data.dian_status || data.dianStatus || 'PENDING',
    };
  }
  if (!qrUrl && typeof generarQRDIAN === 'function') {
    qrUrl = generarQRDIAN({
      cufe: cufe,
      vendedorNit: (config.getEmpresa && config.getEmpresa().nit) || '',
      tipoDocumento: '01',
      consecutivo: String((factura && factura.consecutivo) || ''),
      fechaEmision: new Date().toISOString(),
      totalFactura: Number((factura && factura.total) || 0),
    });
  }
  return {
    success: true,
    pending: false,
    uuid: uuid || 'DT-' + Date.now(),
    cufe: cufe,
    qrUrl: qrUrl,
    fechaTimbrado: new Date().toISOString(),
    isDemo: false,
    xml: xml,
    provider: 'dataico',
    dianStatus: data.dian_status || data.dianStatus || 'OK',
    raw: data,
  };
}
// ==========================================
// packages/shared-dian/providers/provider-factory.ts
// ==========================================
function createProvider(type) {
  switch(type) {
    case 'dataico': return { name: 'Dataico', stamp: dataicoStamp };
    case 'siigo': return { name: 'Siigo', stamp: async (xml, factura) => mockStamp(xml, factura || {}) };
    case 'facturama': return { name: 'Facturama', stamp: async (xml, factura) => mockStamp(xml, factura || {}) };
    default: return { name: 'Mock', stamp: mockStamp };
  }
}
// ==========================================
// packages/shared-dian/invoice-service.ts
// ==========================================
async function timbrarFactura(xml, factura, config) {
  if (typeof config.isDemoMode === 'function' ? config.isDemoMode() : config.modoDemo) {
    return await mockStamp(xml, factura);
  }
  const validation = config.canGoLive();
  if (!validation.valid) {
    throw new Error(`Configuración incompleta: ${validation.missing.join(', ')}`);
  }
  const provider = createProvider(config.getProveedor().type);
  return await provider.stamp(xml, factura, config);
}
function crozzoFiscalOutboxUpdate(id, patch) {
  var all = crozzoFiscalOutboxLoad();
  var hit = false;
  for (var i = 0; i < all.length; i++) {
    if (all[i] && all[i].id === id) {
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) all[i][k] = patch[k];
      }
      all[i].updatedAt = new Date().toISOString();
      hit = true;
      break;
    }
  }
  if (hit) crozzoFiscalOutboxSave(all);
  return hit;
}
if (typeof window !== 'undefined') {
  window.crozzoFiscalOutboxLoad = crozzoFiscalOutboxLoad;
  window.crozzoFiscalOutboxSave = crozzoFiscalOutboxSave;
  window.crozzoFiscalOutboxUpdate = crozzoFiscalOutboxUpdate;
  window.crozzoFiscalOutboxEnqueue = crozzoFiscalOutboxEnqueue;
  window.crozzoDataicoStamp = dataicoStamp;
}
