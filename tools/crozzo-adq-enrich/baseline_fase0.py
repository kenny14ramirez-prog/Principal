"""Fase 0 baseline: RUES vs DDG/Scrapling capas (sin Obscura)."""
from __future__ import annotations

import json
import time
import urllib.parse
from collections import Counter

from server import _extract_contacts_from_text, _fetch_text, enrich_rues

# NITs públicos conocidos (contacto puede faltar en RUES — eso no es bug)
NITS = [
    ("860002180", "BAVARIA"),
    ("890900608", "ALMACENES EXITO"),
    ("890903940", "POSTOBON"),
    ("800153993", "AVIANCA"),
    ("830113515", "RAPPI"),
    ("860007738", "BANCO POPULAR"),
    ("890903407", "CEMEX"),
    ("900156264", "NU COLOMBIA"),
    ("900319753", "SAMPLE"),
    ("800197268", "GRUPO NUTRESA"),
]


def layer_for(rues: dict, html: str, contacts: dict) -> list[str]:
    layers: list[str] = []
    if not rues.get("ok"):
        layers.append("rues_empty")
    elif not (rues.get("email") or rues.get("telefono") or rues.get("direccion")):
        layers.append("rues_no_contact")
    else:
        layers.append("rues_has_contact")
    low = (html or "").lower()
    if not html:
        layers.append("ddg_empty")
    elif any(
        x in low
        for x in (
            "captcha",
            "cf-challenge",
            "just a moment",
            "enable javascript",
            "access denied",
            "bot detection",
            "unusual traffic",
        )
    ):
        layers.append("ddg_bot_check")
    elif not (contacts.get("email") or contacts.get("telefono") or contacts.get("direccion")):
        layers.append("extract_miss")
    else:
        layers.append("ddg_ok")
    return layers


def main() -> None:
    rows = []
    for nit, hint in NITS:
        t0 = time.time()
        rues = enrich_rues(nit)
        nombre = (rues.get("nombre") or hint).strip()
        q = f'{nit} NIT Colombia email OR correo OR teléfono OR "calle" OR carrera'
        if nombre:
            q = f'"{nombre[:60]}" {nit} Colombia contacto correo teléfono'
        ddg = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": q})
        html = _fetch_text(ddg, timeout=12.0)
        contacts = _extract_contacts_from_text(html or "", prefer_near=f"{nombre} {nit}")
        layers = layer_for(rues, html or "", contacts)
        row = {
            "nit": nit,
            "nombre": nombre[:60],
            "rues_email": bool(rues.get("email")),
            "rues_tel": bool(rues.get("telefono")),
            "rues_dir": bool(rues.get("direccion")),
            "html_len": len(html or ""),
            "ddg_email": contacts.get("email") or "",
            "ddg_tel": contacts.get("telefono") or "",
            "ddg_dir": (contacts.get("direccion") or "")[:80],
            "layers": layers,
            "ddg_url": ddg,
            "ms": int((time.time() - t0) * 1000),
        }
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    c: Counter[str] = Counter()
    for r in rows:
        for L in r["layers"]:
            c[L] += 1
    out = {"summary": dict(c), "rows": rows}
    with open("baseline_fase0.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("---SUMMARY---", flush=True)
    print(json.dumps(dict(c), indent=2), flush=True)
    print("wrote baseline_fase0.json", flush=True)


if __name__ == "__main__":
    main()
