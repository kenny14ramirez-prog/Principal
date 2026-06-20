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
async function dataicoStamp(xml, config) {
  const prov = config.proveedor;
  if (!prov.apiKey) throw new Error('API Key de Dataico no configurada');
  
  // Simulación de llamada a Dataico (en producción sería fetch real)
  await new Promise(r => setTimeout(r, 1500));
  const cufe = await calcularCUFE({});
  const qrUrl = generarQRDIAN({ cufe, vendedorNit: config.empresa.nit, tipoDocumento: '01', consecutivo: '1', fechaEmision: new Date().toISOString(), totalFactura: 0 });
  
  return {
    success: true,
    uuid: `DT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    cufe,
    qrUrl,
    fechaTimbrado: new Date().toISOString(),
    isDemo: false,
    xml
  };
}
// ==========================================
// packages/shared-dian/providers/provider-factory.ts
// ==========================================
function createProvider(type) {
  switch(type) {
    case 'dataico': return { name: 'Dataico', stamp: dataicoStamp };
    case 'siigo': return { name: 'Siigo', stamp: async (xml) => mockStamp(xml, {}) };
    case 'facturama': return { name: 'Facturama', stamp: async (xml) => mockStamp(xml, {}) };
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
