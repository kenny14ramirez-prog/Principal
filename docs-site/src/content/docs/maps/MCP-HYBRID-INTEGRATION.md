---
title: "MCP HYBRID INTEGRATION"
---

# Integración MCP Synapse — Hybrid Search (Fase ejército)

> Fecha: 2026-11-01. Cambio aplicado en `synapse/synapse/mcp_server.py` (directorio gitignored, no commiteable). Este documento preserva la integración.

## Cambio realizado

Se añadió la tool `search_memory_hybrid(prompt, limit=5)` al servidor MCP FastMCP `SynapseMemory`, que ejecuta `node scripts/synapse-hybrid.mjs search ... --json` via subprocess y devuelve resultados formateados.

### Diff aplicado (en `synapse/synapse/mcp_server.py`)

```python
import json
import logging
import subprocess
import sys

from dotenv import load_dotenv
from synapse.engine import SynapseEngine, SynapseError
from synapse.paths import SYNAPSE_ROOT, load_synapse_env, resolve_memory_db_path

REPO_ROOT = SYNAPSE_ROOT.parent
```

```python
@mcp.tool()
def search_memory_hybrid(prompt: str, limit: int = 5) -> str:
    """
    Búsqueda híbrida en la memoria de largo plazo: BM25 (SQLite) + vector (LanceDB) + recencia.
    ...
    """
    try:
        logger.info("Buscando memorias (hybrid) para: %r", prompt)
        proc = subprocess.run(
            ["node", "scripts/synapse-hybrid.mjs", "search", prompt, f"--limit={limit}", "--json"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            return f"Error al ejecutar hybrid search: {proc.stderr or proc.stdout}"
        try:
            data = json.loads(proc.stdout)
        except Exception:
            return f"Salida no JSON: {proc.stdout[:500]}"
        if not data:
            return "Ninguna memoria relevante (hybrid)."
        out = "Memorias encontradas (hybrid: BM25 + vector + recencia):\\n\\n"
        for item in data:
            out += f"--- id={item.get('id')} score={item.get('score', 0):.4f} [{item.get('source', '?')}] ---\\n"
            out += f"{item.get('title', '')}\\n"
            if item.get('content'):
                out += f"{item['content'][:300]}\\n"
            out += "\\n"
        return out
    except Exception as e:
        logger.error("Error en search_memory_hybrid: %s", e)
        return f"Error interno en hybrid search: {e}"
```

## Verificación
- `import synapse.mcp_server` con PYTHONPATH=synapse → OK (SynapseEngine initialized).
- La tool `search_memory_hybrid` queda registrada en FastMCP.

## Notas
- `synapse/` está en `.gitignore`; el cambio es local. Para preservarlo en otro entorno, aplicar el diff de este documento.
- Requiere Node.js y `scripts/synapse-hybrid.mjs` en el repo root.
- Timeout 60s para el subprocess.

## Recomendación
- Considerar mover el servidor MCP a un módulo trackeado (fuera de `synapse/`) o añadir excepción en `.gitignore` para `synapse/synapse/mcp_server.py`.
