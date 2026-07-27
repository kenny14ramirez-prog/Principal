"""Fase 3 piloto: enrich batch + resumen tasa contacto / engines / timeouts."""
from __future__ import annotations

import json
import time

from server import _obscura_bin, _obscura_enabled, _stats, do_enrich

NITS = [
    ("860002180", None),
    ("890900608", None),
    ("900319753", None),
    ("860007738", None),
    ("800153993", None),
]


def main() -> None:
    rows = []
    for nit, hint in NITS:
        t0 = time.time()
        r = do_enrich(nit, hint)
        rows.append(
            {
                "nit": nit,
                "ok": bool(r.get("ok")),
                "email": bool(r.get("email")),
                "tel": bool(r.get("telefono")),
                "dir": bool(r.get("direccion")),
                "source": r.get("source"),
                "engine": r.get("engine"),
                "ms": int((time.time() - t0) * 1000),
            }
        )
        print(json.dumps(rows[-1], ensure_ascii=False), flush=True)

    n = len(rows) or 1
    pct_email = round(100 * sum(1 for r in rows if r["email"]) / n, 1)
    pct_tel = round(100 * sum(1 for r in rows if r["tel"]) / n, 1)
    pct_dir = round(100 * sum(1 for r in rows if r["dir"]) / n, 1)
    pct_contact = round(100 * sum(1 for r in rows if r["email"] or r["tel"]) / n, 1)

    if not _obscura_enabled():
        reco = "mantener CROZZO_OBSCURA=0 (default; spike sin wins)"
    elif _stats.get("timeouts", 0) > max(1, len(rows) // 5):
        reco = "apagar Obscura (timeouts altos)"
    elif pct_contact == 0:
        reco = "apagar Obscura (sin mejora email/tel en muestra)"
    else:
        reco = "seguir midiendo 1-2 semanas en piloto"

    summary = {
        "obscura_enabled": _obscura_enabled(),
        "obscura_bin": bool(_obscura_bin()),
        "n": len(rows),
        "pct_email": pct_email,
        "pct_tel": pct_tel,
        "pct_dir": pct_dir,
        "pct_contact": pct_contact,
        "avg_ms": int(sum(r["ms"] for r in rows) / n),
        "stats": dict(_stats),
        "rows": rows,
        "recomendacion": reco,
    }
    with open("piloto_metrics.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("---SUMMARY---", flush=True)
    print(json.dumps({k: summary[k] for k in summary if k != "rows"}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
