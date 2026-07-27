# Plantilla EDIT-PACKET (copiar al pedir cambio al editor)

```markdown
## Objetivo
(1 frase: comportamiento esperado en caja/tablet/cocina)

## Alcance
- Archivo: app/...
- Función: nombreExacto (~línea N según POSMAIN-SYNC-SYMBOLS.md)
- Mapas leídos: CONNECTIONS / SEQUENCES S?

## Pre-requisitos ejecutados
- [ ] npm run issues:search -- "síntoma clave" (¿ya existe KI-???)
- [ ] npm run edit:scope -- app/... nombreFuncion
- [ ] Leído: (archivo caller de edit:scope) + KNOWN-ISSUES si aplica

## Cambio técnico
- Técnica: (reutilizar patrón X en función Y — no inventar)
- Ancla old_string: (≥5 líneas únicas)
- Casos borde: null / offline / permiso mesero

## NO tocar
- CrozzoReservorio*
- (otros)

## Criterio de hecho
- [ ] npm run sync
- [ ] npm run test:sync-clinical (si sync)
- [ ] Si bug nuevo resuelto: entrada en known-issues.json + issues:refresh
- [ ] Comportamiento: (observable en tienda)
```
