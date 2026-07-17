#!/usr/bin/env python3
"""
Synapse mind CLI — segunda mente Crozzo (fallback si MCP no está disponible).

Uso:
  python scripts/synapse-mind.py status
  python scripts/synapse-mind.py search "cliente facturación caja"
  python scripts/synapse-mind.py remember --path crozzo/crm --title "..." --content "..."
  python scripts/synapse-mind.py seed
  python scripts/synapse-mind.py reindex
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SYNAPSE_ROOT = REPO_ROOT / "synapse"
VENV_PY = SYNAPSE_ROOT / "synapse" / "venv" / "Scripts" / "python.exe"

if str(SYNAPSE_ROOT) not in sys.path:
    sys.path.insert(0, str(SYNAPSE_ROOT))

os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def _engine():
    from synapse.engine import SynapseEngine
    from synapse.paths import resolve_memory_db_path

    return SynapseEngine(resolve_memory_db_path())


def cmd_status(_: argparse.Namespace) -> int:
    from synapse.embeddings import ollama_reachable, _embed_model, _ollama_base
    from synapse.paths import resolve_memory_db_path, SYNAPSE_ROOT as SR

    db = resolve_memory_db_path()
    print("Synapse segunda mente — status")
    print(f"  root:     {SR}")
    print(f"  db:       {db}")
    print(f"  mcp.json: {REPO_ROOT / '.cursor' / 'mcp.json'}")
    print(f"  venv py:  {VENV_PY} ({'OK' if VENV_PY.is_file() else 'MISSING'})")
    print(f"  ollama:   {_ollama_base()} ({'OK' if ollama_reachable() else 'DOWN'})")
    print(f"  embed:    {_embed_model()}")
    print(f"  llm:      {os.environ.get('SYNAPSE_LLM_MODEL', 'qwen2.5:3b')}")

    eng = _engine()
    try:
        n = eng.conn.execute("SELECT COUNT(*) AS c FROM memory WHERE status='active'").fetchone()["c"]
        emb = eng.conn.execute(
            "SELECT COUNT(*) AS c FROM memory WHERE status='active' AND embedding IS NOT NULL AND embedding!=''"
        ).fetchone()["c"]
        print(f"  memories: {n} active ({emb} with embeddings)")
    finally:
        eng.close()
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    eng = _engine()
    try:
        result = eng.search(args.prompt)
        memories = [m for m in result.context.get("memories", []) if not m.get("missing")]
        if not memories:
            print("Sin memorias relevantes.")
            return 0
        for mem in memories:
            print(f"--- [{mem.get('path')}] {mem.get('title') or 'Sin título'} id={mem.get('id')}")
            print(mem.get("content", ""))
            print()
        if args.json:
            print(json.dumps({"selected": result.selected_ids, "timings_ms": result.timings_ms}, ensure_ascii=False))
    finally:
        eng.close()
    return 0


def cmd_remember(args: argparse.Namespace) -> int:
    content = args.content
    if args.file:
        content = Path(args.file).read_text(encoding="utf-8")
    if not content or not str(content).strip():
        print("Error: content vacío", file=sys.stderr)
        return 2
    eng = _engine()
    try:
        mid = eng.add_memory(path=args.path, title=args.title or None, content=str(content).strip())
        print(f"OK id={mid} path={args.path}")
    finally:
        eng.close()
    return 0


SEED_MEMORIES = [
    {
        "path": "crozzo/canon",
        "title": "Fuente canónica app/ → sync",
        "content": (
            "Editar siempre app/ (core, modules, infra, css). Tauri sirve src/ (espejo). "
            "Tras editar app/: npm run sync. No editar src/ directo. "
            "Archivos críticos requieren npm run edit:scope antes del primer patch. "
            "Cambios sync/LAN/runtime: npm run test:sync-clinical."
        ),
    },
    {
        "path": "crozzo/sync",
        "title": "Z0 operativo sync",
        "content": (
            "Pantallas P0: cajero, tablets, comandas, cocina, mesas. "
            "Escritura: crozzoSyncPosRuntimeCritical. Lectura: applyPosRuntimeSnapshot → "
            "crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true }) cuando aplica. "
            "Tablas: crozzo_mesa_runtime preferida; fallback crozzo_sede_runtime + comandas. "
            "Mapas: docs/maps/INDEX.md, SYNC-INVARIANTS, KNOWN-ISSUES."
        ),
    },
    {
        "path": "crozzo/crm",
        "title": "Cliente/facturación en caja",
        "content": (
            "En cajero NO hay popover comercial: usar acordeón #crozzoRetailCliente + crozzoRetailToggleCliente. "
            "KI-022: no delegar solo a popover. "
            "Preservar panel: window.__crozzoCajaClientePanelOpen + __crozzoCrmSearchDraft; "
            "initCajero NO debe forzar cierre. "
            "Patch remota venta directa: renderCart si hay #cartItems (evitar renderPage completo). "
            "Dropdown CRM: hermano del toolbar, ancho 100% del panel (no dentro del search-wrap)."
        ),
    },
    {
        "path": "crozzo/crm",
        "title": "Lookup adquiriente — sin Scrapling",
        "content": (
            "CrozzoAdquirienteLookup: local CRM → DIAN GetAcquirer (Tauri+p12) → "
            "Supabase rpc/crozzo_lookup_adquiriente → RUES datos.gov.co + DetalleRM. "
            "Scrapling NO está integrado en el repo (cero referencias). "
            "Fragmentos cortos (ej. '900') priorizan directorio local; NIT completo dispara remoto."
        ),
    },
    {
        "path": "crozzo/css",
        "title": "CSS ticket CRM solapado",
        "content": (
            "Causa: dropdown position absolute + overflow hidden del ticket/acordeón + carrito encima. "
            "Fix: resultados en flujo relative, panel is-open con scroll interno y z-index alto, "
            "duplicar reglas en ambas secciones del CSS monolito. Verificar crozzo-android-apk / touch-shell."
        ),
    },
    {
        "path": "crozzo/caja",
        "title": "Venta directa vs mesas picker",
        "content": (
            "KI-021: directSaveMenuOpen debe quedar false en setCajaMode('directa'), "
            "crozzoPrepareDirectSaleSession y post-cobro. Si queda true, renderCajero muestra mesas/llevar."
        ),
    },
    {
        "path": "crozzo/print",
        "title": "Autoprint comanda por dispositivo",
        "content": (
            "Auto-print por dispositivo (pantalla fija + impresora local + LS crozzo_device_auto_print), "
            "no por rol caja/cocina. attemptAutoPrintOnIngest en ComandasCloudSync; "
            "printComandaNow({ silent, requireAutoPrint }). isOwnPush no bloquea print."
        ),
    },
    {
        "path": "crozzo/synapse",
        "title": "Segunda mente Synapse + Ollama",
        "content": (
            "DB canónica: synapse/memory.db. MCP: .cursor/mcp.json → synapse_memory. "
            "Embeddings: nomic-embed-text. LLM ayudante: qwen2.5:3b. "
            "CLI fallback: npm run synapse:status|search|remember|seed|reindex. "
            "Synapse = contexto/preferencias/lecciones de sesión. "
            "KNOWN-ISSUES = anti-patrones de código (no duplicar)."
        ),
    },
    {
        "path": "crozzo/preferencias",
        "title": "Preferencias de trabajo agente",
        "content": (
            "Commits solo si el usuario lo pide. PowerShell: ; no &&. "
            "No editar plan files adjuntos. Respuestas concisas. "
            "Arquitecto: causa raíz, no parches ciegos. Fuente app/ siempre."
        ),
    },
]


def cmd_seed(_: argparse.Namespace) -> int:
    eng = _engine()
    try:
        # Evitar duplicar seed si ya hay crozzo/*
        existing = eng.conn.execute(
            "SELECT COUNT(*) AS c FROM memory WHERE path LIKE 'crozzo/%' AND status='active'"
        ).fetchone()["c"]
        if existing >= len(SEED_MEMORIES):
            print(f"Seed ya presente ({existing} memorias crozzo/*). Usa remember para agregar.")
            return 0
        for item in SEED_MEMORIES:
            mid = eng.add_memory(path=item["path"], title=item["title"], content=item["content"])
            print(f"  + {item['path']} / {item['title']} → {mid}")
        n = eng.reindex_embeddings(limit=200)
        print(f"Seed OK. Embeddings actualizados en este paso/reindex: {n}")
    finally:
        eng.close()
    return 0


def cmd_reindex(_: argparse.Namespace) -> int:
    eng = _engine()
    try:
        n = eng.reindex_embeddings(limit=500)
        print(f"Reindex embeddings: {n} memorias")
    finally:
        eng.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    from synapse.paths import load_synapse_env

    load_synapse_env()

    p = argparse.ArgumentParser(description="Synapse segunda mente (Crozzo)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("status", help="Estado Ollama + DB + MCP")
    s.set_defaults(func=cmd_status)

    s = sub.add_parser("search", help="Buscar memorias")
    s.add_argument("prompt")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_search)

    s = sub.add_parser("remember", help="Guardar memoria")
    s.add_argument("--path", required=True)
    s.add_argument("--title", default="")
    s.add_argument("--content", default="")
    s.add_argument("--file", default="")
    s.set_defaults(func=cmd_remember)

    s = sub.add_parser("seed", help="Sembrar memorias base Crozzo")
    s.set_defaults(func=cmd_seed)

    s = sub.add_parser("reindex", help="Calcular embeddings faltantes")
    s.set_defaults(func=cmd_reindex)

    args = p.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
