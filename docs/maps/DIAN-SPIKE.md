# Spike DIAN — @dian-kit (Fase 4)

> Import verificado OK. Instanciación requiere certificado .p12 real + config.

## Requisitos para instanciar DianKit
- `certificate`: Buffer (.p12) emitido por CA acreditada ante la ONAC.
- `certificatePassword`: string.
- `supplier`: { nit, name, address, ... }.
- `software`: { id, pin, providerNit, providerName } (asignados por la DIAN).
- `environment`: '1' (habilitación) o '2' (producción).
- `numbering`: { prefix, from, to, ... } (resolución DIAN).
- `timeoutMs`: number (opcional).

## Próximos pasos
1. Completar habilitación ante la DIAN (software ID, PIN, set de pruebas, resolución).
2. Obtener certificado .p12 de CA acreditada.
3. Implementar módulo fiscal en `app/core/pos/CrozzoPosDianLib.js` usando @dian-kit.
4. Cola persistente + worker + circuit breaker + contingencia (patrón Dian-Service).
5. Recepción FE: parsear XML AttachedDocument (preferir sobre OCR).

## Riesgos
- Licencia MIT (@dian-kit) → uso comercial libre.
- Ambiente de habilitación requiere proceso formal ante la DIAN.
- Certificado .p12 debe protegerse (Vault Transit en producción).
