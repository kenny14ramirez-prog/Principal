# HANDOFF — Continuidad entre chats

**Última actualización:** 2026-10-29
**Rama:** task/aligned-20260727 @ f59eabd + cambios sin commitear

## Memoria persistente habilitada
- Synapse (synapse/memory.db) — 158 memorias activas. Buscar con `npm run synapse:search -- "..."` o MCP `search_memory`.
- Este archivo + OPORD-MISION-CIEN-100.md + CONTINUIDAD-OPORD.md (histórico) + AGENTS.md.

## Estado actual (MISIÓN CIEN)
- Operación vigente: docs/maps/OPORD-MISION-CIEN-100.md (F0–F11). CONTINUIDAD-OPORD.md es histórico, no certifica.
- Auditoría F10-AUD-01: PASS=10 / FAIL=6 sobre src/. Cobro roto: click en producto actualiza total en DOM pero getActiveCart() retorna [] (cartDirecto vacío), por lo que iniciarCobroDesdeCaja retorna temprano y no abre modal de cobro. El diálogo detectado por el arnés es el wizard de configuración, no el cobro.
- Árbol desplegado: src/ (151 scripts). app/ es fuente de edición (179 scripts). sync con npm run sync.
- Rust no compila (RC.EXE/link.exe ausentes) → H-11 bloqueo ambiental.

## Próximo paso concreto
Arreglar que el click de producto en POS restaurante agregue al cartDirecto (src/ y app/), luego sync + re-ejecutar qa-personas-mision-cien.mjs hasta PASS en "Interfaz de cobro utilizable" y "Cobro genera factura".

## Comandos clave
- npm run sync (app/ → src/)
- node scripts/qa-personas-mision-cien.mjs (F10)
- npm run test:sync-clinical
EOF