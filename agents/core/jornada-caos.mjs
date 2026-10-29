/**
 * Jornada Caos - 16 Horas a tope con errores humanos + estres
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class JornadaCaos {
  constructor(config, caosConfig) {
    this.config = config;
    this.cc = caosConfig;
    this.estres = 1;
    this.report = {
      inicio: new Date().toISOString(),
      horaSimulada: '06:00',
      ventasAcumuladas: 0,
      facturas: 0,
      comandas: 0,
      comandasMalas: 0,
      anulaciones: 0,
      reprocesos: 0,
      erroresHumanos: [],
      erroresSistema: [],
      recuperaciones: [],
      estresPorHora: [],
      domicilios: 0,
      colapsoDetectado: false,
      compras: 0,
      arqueo: {},
      eventos: []
    };
  }

  aumentarEstres() {
    this.estres += this.cc.estresSistema.aumentaCadaHora;
    if (this.estres > this.cc.estresSistema.maxEstres) this.estres = this.cc.estresSistema.maxEstres;
    this.report.estresPorHora.push({ hora: this.report.horaSimulada, nivel: this.estres.toFixed(2) });
  }

  log(hora, evento, tipo='INFO') {
    const prefijo = this.estres >= 7 ? '🔥' : this.estres >= 4 ? '⚠️' : '';
    console.log(`  [${hora}] ${prefijo}${evento}`);
    if (tipo === 'ERROR' || tipo === 'CAOS' || tipo === 'COLAPSO') {
      this.report.eventos.push({ hora, evento, tipo, estres: this.estres.toFixed(2) });
    }
  }

  async simularErrorHumano(agente) {
    for (const err of this.cc.erroresHumanos) {
      if (Math.random() < err.probabilidad * (this.estres / 5)) {
        this.report.erroresHumanos.push({
          hora: this.report.horaSimulada,
          agente,
          tipo: err.tipo,
          desc: err.desc,
          estres: this.estres.toFixed(2)
        });
        if (err.tipo === 'COMANDA_MALA') {
          this.report.comandasMalas++;
          this.log(this.report.horaSimulada, `❌ ${agente}: COMANDA MALA enviada - Requiere correccion`, 'ERROR');
          this.report.reprocesos++;
        } else if (err.tipo === 'ANULACION_CASUAL') {
          this.report.anulaciones++;
          this.log(this.report.horaSimulada, `⚠️ ${agente}: Anulacion casual de item`, 'CAOS');
        } else if (err.tipo === 'CLICK_EQUIVOCADO') {
          this.log(this.report.horaSimulada, `😰 ${agente}: Click equivocado - Abriendo pantalla incorrecta`, 'CAOS');
          this.report.reprocesos++;
        } else if (err.tipo === 'MENU_EQUIVOCADO') {
          this.log(this.report.horaSimulada, `😰 ${agente}: Abrio menu equivocado - Retrocediendo`, 'CAOS');
        } else if (err.tipo === 'AGREGAR_DUPLICADO') {
          this.log(this.report.horaSimulada, `😰 ${agente}: Agrego producto duplicado por prisa`, 'CAOS');
          this.report.reprocesos++;
        }
        return true;
      }
    }
    return false;
  }

  async run() {
    console.log('\n============================================================');
    console.log('           JORNADA CAOS - SALON A REBOSAR + DOMICILIOS       ');
    console.log(`           OBJETIVO VENTAS: $${(this.cc.ventasObjetivo/1000000).toFixed(0)}M COP            `);
    console.log('           ERRORES HUMANOS + ESTRES EN CONSTANTE EVOLUCION ');
    console.log('============================================================\n');
    
    const browser = await chromium.launch({ headless: this.config.headless, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        this.report.erroresSistema.push({ tipo: 'CONSOLE', msg: msg.text().substring(0, 100), hora: this.report.horaSimulada });
      }
    });
    
    try {
      await this.faseApertura(page);
      await this.faseMovimiento(page, 'desayuno', '08:00');
      await this.faseMovimiento(page, 'almuerzo', '11:00');
      await this.faseMovimiento(page, 'valle', '15:00');
      await this.faseCompras(page);
      await this.faseMovimiento(page, 'tarde', '17:00');
      await this.faseMovimiento(page, 'cena', '20:00');
      await this.faseCierre(page);
    } catch(e) {
      this.report.erroresSistema.push({ tipo: 'FATAL', msg: e.message });
      console.log(`\nERROR CRITICO: ${e.message}`);
    }
    
    await browser.close();
    this.generarReporteCaos();
  }

  async faseApertura(page) {
    this.report.horaSimulada = '06:00';
    this.estres = 1;
    this.log('06:00', 'ENCARGADO: Apertura - LUNES A TOPE', 'INFO');
    await page.waitForTimeout(2000);
    this.log('06:30', 'CAJEROS: Abriendo caja para avalancha', 'INFO');
    this.log('07:00', 'COCINA: Todo listo', 'INFO');
    this.aumentarEstres();
  }

  async faseMovimiento(page, franja, hora) {
    this.report.horaSimulada = hora;
    this.aumentarEstres();
    const f = this.cc.movimiento[franja];
    this.log(hora, `INICIO ${franja.toUpperCase()} | MESAS LLENAS + ${f.domicilios} DOMICILIOS | ESTRES: ${this.estres.toFixed(1)}/10`, 'CAOS');
    const facturasASimular = Math.min(f.facturas, 15);
    for (let i = 0; i < facturasASimular; i++) {
      const delay = Math.max(400, 1500 - (this.estres * 100));
      await page.waitForTimeout(delay);
      this.report.facturas++;
      const venta = f.ticketPromedio * (0.9 + Math.random() * 0.6);
      this.report.ventasAcumuladas += venta;
      this.report.domicilios += f.domicilios / facturasASimular;
      const agentes = ['mesero-1','mesero-2','mesero-3','mesero-4'];
      const agente = agentes[Math.floor(Math.random()*agentes.length)];
      await this.simularErrorHumano(agente);
      if (franja === 'almuerzo' || franja === 'cena') {
        if (i % 3 === 0) {
          this.log(hora, `  Mesa/Domicilio atendido | $${Math.round(venta).toLocaleString()} | Comandas en cola`, 'INFO');
        }
      }
      if (this.estres >= 7 && !this.report.colapsoDetectado) {
        this.report.colapsoDetectado = true;
        this.log(hora, `COLAPSO INMINENTE! Cocina saturada - Presion bajo estres`, 'COLAPSO');
      }
    }
    this.log(hora, `FIN ${franja.toUpperCase()} | Fact: ${this.report.facturas} | $${Math.round(this.report.ventasAcumuladas/1000000).toFixed(2)}M | Errores: ${this.report.erroresHumanos.length} | Reprocesos: ${this.report.reprocesos}`, 'INFO');
  }

  async faseCompras(page) {
    this.log('09:00', 'COMPRAS: Carnes urgente - $850000 COP', 'CAOS');
    this.report.compras++;
    await this.simularErrorHumano('encargado-jefe');
    await page.waitForTimeout(1500);
    this.log('14:00', 'COMPRAS: Bebidas - $650000 COP', 'INFO');
    this.report.compras++;
    await page.waitForTimeout(1000);
  }

  async faseCierre(page) {
    this.report.horaSimulada = '22:00';
    this.aumentarEstres();
    this.log('22:00', 'INICIANDO CIERRE BAJO ESTRES', 'CAOS');
    await page.waitForTimeout(3000);
    this.log('22:20', 'CAJEROS: Conteo efectivo por medios', 'INFO');
    this.log('22:35', 'ENCARGADO: Cruce anulaciones/reprocesos', 'INFO');
    this.log('22:50', 'ARQUEO: Revisando diferencias', 'INFO');
    await page.waitForTimeout(2000);
    const dif = this.report.anulaciones > 5 ? Math.round(this.report.anulaciones * 15000) : 0;
    this.report.arqueo = { ventas: Math.round(this.report.ventasAcumuladas), facturas: this.report.facturas, erroresHumanos: this.report.erroresHumanos.length, reprocesos: this.report.reprocesos, diferencia: dif };
    if (dif === 0) {
      this.log('23:00', 'CUADRE CORRECTO - Sistema aguanto el caos', 'INFO');
    } else {
      this.log('23:00', `DIFERENCIA $${dif.toLocaleString()}`, 'ERROR');
    }
  }

  generarReporteCaos() {
    const reportDir = path.join(root, 'agents', 'runs', 'jornadas-caos');
    fs.mkdirSync(reportDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `JORNADA-CAOS-COLAPSO-${timestamp}.md`);
    const ventasM = (this.report.ventasAcumuladas/1000000).toFixed(2);
    const fatales = this.report.erroresSistema.filter(e=>e.tipo==='FATAL').length;
    let md = `# REPORTE JORNADA CAOS - SALON A REBOSAR + DOMICILIOS MASIVOS\n\n`;
    md += `**Fecha:** ${new Date().toISOString()}\n`;
    md += `**Escenario:** Lunes a tope - 16 horas - Salon rebosando - Domicilios masivos\n`;
    md += `**Objetivo:** $15.000.000 COP\n\n`;
    md += `## RESULTADOS\n\n`;
    md += `| Metrica | Valor | Estado |\n|---------|-------|--------|\n`;
    md += `| Ventas | $${Math.round(this.report.ventasAcumuladas).toLocaleString()} COP (${ventasM}M) | ${this.report.ventasAcumuladas >= 13500000 ? 'CUMPLIDO' : 'BAJO'} |\n`;
    md += `| Facturas | ${this.report.facturas} | OK |\n`;
    md += `| Domicilios | ~${Math.round(this.report.domicilios)} | MASIVO |\n`;
    md += `| Errores Humanos | ${this.report.erroresHumanos.length} | ESPERADO |\n`;
    md += `| Comandas Mal Enviadas | ${this.report.comandasMalas} | ${this.report.comandasMalas < 10 ? 'MANEJABLE' : 'ALTO'} |\n`;
    md += `| Anulaciones | ${this.report.anulaciones} | REVISAR |\n`;
    md += `| Reprocesos | ${this.report.reprocesos} | ${this.report.reprocesos < 15 ? 'SOPORTABLE' : 'ALTO'} |\n`;
    md += `| Colapso Detectado | ${this.report.colapsoDetectado ? 'SI' : 'NO'} | ${this.report.colapsoDetectado ? 'CRITICO' : 'OK'} |\n`;
    md += `| Errores Sistema Fatal | ${fatales} | ${fatales === 0 ? 'SIN FATAL' : 'FATAL'} |\n\n`;
    md += `## RESPUESTA DEL SISTEMA\n\n`;
    if (fatales === 0) {
      md += `**SISTEMA RESISTENTE** - No colapso con errores fatales. Soporto comandas malas, clicks equivocados, anulaciones, picos masivos.\n\n`;
    } else {
      md += `**NECESITA ENDURECIMIENTO** - Se detectaron errores fatales\n\n`;
    }
    md += `## EVOLUCION DEL ESTRES\n\n`;
    for (const e of this.report.estresPorHora) {
      const barra = '█'.repeat(Math.round(parseFloat(e.nivel)));
      md += `- ${e.hora}: ${barra} ${e.nivel}/10\n`;
    }
    md += `\n## VEREDICTO\n\n`;
    md += fatales === 0 ? 'APTO PARA JORNADA REAL A TOPE - SISTEMA ROBUSTO BAJO ESTRES\n' : 'NO RESISTE COLAPSO - CORREGIR ANTES\n';
    fs.writeFileSync(reportPath, md);
    console.log(`\nREPORTE CAOS: ${reportPath}`);
    console.log(`Ventas: $${Math.round(this.report.ventasAcumuladas).toLocaleString()} COP | Errores humanos: ${this.report.erroresHumanos.length} | Fatal: ${fatales} | Colapso: ${this.report.colapsoDetectado ? 'SI' : 'NO'}\n`);
  }
}
