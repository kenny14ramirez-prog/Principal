#!/usr/bin/env node
// Spike Fase 4: @dian-kit (DIAN facturación electrónica) — import + config requerida.
import { DianKit } from '@dian-kit/sdk-node';

console.log('DianKit imported OK');
console.log('Methods:', Object.getOwnPropertyNames(DianKit.prototype));

console.log('\nConfig requerida para instanciar:');
console.log('  certificate: Buffer (.p12)');
console.log('  certificatePassword: string');
console.log('  supplier: { nit, name, address, ... }');
console.log('  software: { id, pin, providerNit, providerName }');
console.log('  environment: "1" (habilitación) o "2" (producción)');
console.log('  numbering: { prefix, from, to, ... }');
console.log('  timeoutMs: number (opcional)');

console.log('\nSin certificado .p12 real no se puede instanciar. Spike de import OK.');
console.log('SPIKE OK (import)');
