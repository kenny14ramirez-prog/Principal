"""
Crozzo POS — sidecar enriquecimiento adquiriente (RUES + Scrapling + Obscura opcional).
Solo loopback 127.0.0.1:18765. No bloquea el POS.
Obscura: 3er fallback de fetch (CROZZO_OBSCURA=1). Nunca scrapea DIAN auth.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import traceback
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = "127.0.0.1"
PORT = 18765
RUES_OPENDATA = "https://www.datos.gov.co/resource/c82u-588k.json"
RUES_DETALLE = "https://ruesapi.rues.org.co/WEB2/api/Expediente/DetalleRM/"

_ROOT = Path(__file__).resolve().parent
_lock = threading.Lock()
_busy = False
_last_fetch_engine = "none"
_stats_lock = threading.Lock()
_stats: dict[str, int] = {
    "enrich_ok": 0,
    "enrich_fail": 0,
    "timeouts": 0,
    "engine_scrapling": 0,
    "engine_urllib": 0,
    "engine_obscura": 0,
    "engine_obscura_attempt": 0,
    "hop_ok": 0,
}


def _env_flag(name: str, default: bool = False) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


def _obscura_enabled() -> bool:
    return _env_flag("CROZZO_OBSCURA", False)


def _obscura_bin() -> Path | None:
    custom = (os.environ.get("CROZZO_OBSCURA_PATH") or "").strip()
    candidates = []
    if custom:
        candidates.append(Path(custom))
    candidates.append(_ROOT / "bin" / "obscura.exe")
    candidates.append(_ROOT / "bin" / "obscura")
    for p in candidates:
        if p.is_file():
            return p
    return None


def _digits(s: str) -> str:
    return re.sub(r"\D+", "", s or "")


def _pick(*vals: Any) -> str:
    for v in vals:
        t = str(v or "").strip()
        if t:
            return t
    return ""


def _build_rm_id(cod_camara: str, matricula: str) -> str:
    cam = _digits(cod_camara)
    mat = _digits(matricula)
    if not cam or not mat:
        return ""
    width = 12 - len(cam)
    if width < 1:
        return ""
    if len(mat) < width:
        mat = mat.zfill(width)
    elif len(mat) > width:
        mat = mat[-width:]
    return cam + mat


def _http_json(url: str, timeout: float = 8.0) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "CrozzoAdqEnrich/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else None


def enrich_rues(nit: str) -> dict[str, Any]:
    nit = _digits(nit)
    out: dict[str, Any] = {
        "nombre": "",
        "email": "",
        "telefono": "",
        "ciudad": "",
        "direccion": "",
        "source": "rues_enrich",
        "ok": False,
    }
    if len(nit) < 6:
        return out
    url = f"{RUES_OPENDATA}?nit={urllib.parse.quote(nit)}&$limit=3"
    try:
        rows = _http_json(url, timeout=8.0)
    except Exception:
        rows = None
    if not isinstance(rows, list) or not rows:
        return out
    hit = rows[0]
    out["nombre"] = _pick(hit.get("razon_social"), hit.get("nombre"), hit.get("representante_legal"))
    out["ciudad"] = _pick(hit.get("municipio"), hit.get("municipio_comercial"), hit.get("camara_comercio"))
    rm = _build_rm_id(str(hit.get("codigo_camara") or ""), str(hit.get("matricula") or ""))
    if rm:
        try:
            body = _http_json(RUES_DETALLE + urllib.parse.quote(rm), timeout=8.0)
            if isinstance(body, dict) and body.get("codigo_error") == "0000":
                det = body.get("registros") or {}
                if isinstance(det, dict):
                    out["email"] = _pick(det.get("email_com"), det.get("email_fiscal"))
                    out["telefono"] = _pick(
                        det.get("tel_com_1"),
                        det.get("tel_com_2"),
                        det.get("tel_com_3"),
                        det.get("tel_fiscal_1"),
                    )
                    out["ciudad"] = _pick(out["ciudad"], det.get("mun_comercial"), det.get("mun_fiscal"), det.get("camara"))
                    out["direccion"] = _pick(det.get("dir_comercial"), det.get("dir_fiscal"))
                    if not out["nombre"]:
                        out["nombre"] = _pick(det.get("razon_social"))
        except Exception:
            pass
    out["ok"] = bool(out["nombre"] or out["email"] or out["direccion"] or out["telefono"])
    return out


_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(
    r"(?:\+?57[\s\-.]*)?(?:3(?:0[0-5]|1[0-9]|2[0-4]|5[0-1])\d[\s\-.]?\d{3}[\s\-.]?\d{4}|60[1-8][\s\-.]?\d{3}[\s\-.]?\d{4})"
)
_ADDR_RE = re.compile(
    r"(?:Calle|Carrera|Cra\.?|Cl\.?|Av\.?|Avenida|Transversal|Tv\.?|Diagonal|Dg\.?|Circular)"
    r"[\s\.]*\d+[A-Za-z]?(?:\s*(?:#|No\.?|Nº)\s*\d+\w*(?:\s*[-–]\s*\d+\w*)?)?",
    re.IGNORECASE,
)
_BAD_EMAIL_PARTS = (
    "example.com",
    "email.com",
    "sentry.io",
    "wixpress",
    "schema.org",
    "googleapis",
    "gstatic",
    "facebook",
    "googlemail",
    "google.com",
    "gmail.google",
    "w3.org",
    "placeholder",
    "duckduckgo.com",
    "bing.com",
    "noreply",
    "no-reply",
    "donotreply",
    "error-",
    "abuse@",
)
_CHALLENGE_MARKERS = (
    "captcha",
    "cf-challenge",
    "just a moment",
    "enable javascript",
    "access denied",
    "bot detection",
    "unusual traffic",
    "error-lite@duckduckgo.com",
    "checking your browser",
)
_HOP_BLOCK_HOSTS = (
    "duckduckgo.com",
    "google.",
    "bing.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "linkedin.com",
    "datos.gov.co",
    "rues.org.co",
    "dian.gov.co",
)
_HOP_TLDS = (".co", ".com", ".com.co", ".org", ".net", ".io")


def _looks_like_challenge(text: str) -> bool:
    if not text:
        return True
    low = text.lower()
    if len(text) < 80:
        return True
    return any(m in low for m in _CHALLENGE_MARKERS)


def _fetch_text_urllib(url: str, timeout: float = 10.0) -> str:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/json",
                "User-Agent": "Mozilla/5.0 (compatible; CrozzoAdqEnrich/1.2)",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return ""


def _fetch_text_scrapling(url: str) -> str:
    try:
        from scrapling.fetchers import Fetcher  # type: ignore

        page = Fetcher.get(url, stealthy_headers=True)
        text = getattr(page, "body", None) or getattr(page, "html_content", None) or str(page)
        if isinstance(text, bytes):
            text = text.decode("utf-8", errors="replace")
        return str(text or "")
    except Exception:
        return ""


def _fetch_text_obscura(url: str, timeout: float = 15.0) -> str:
    """Invoke local Obscura binary (child process). Returns '' if disabled/missing/fail."""
    if not _obscura_enabled():
        return ""
    bin_path = _obscura_bin()
    if not bin_path:
        return ""
    try:
        cmd = [
            str(bin_path),
            "--stealth",
            "fetch",
            url,
            "--dump",
            "html",
            "--timeout",
            str(max(5, int(timeout))),
            "--quiet",
        ]
        # Worker must sit next to obscura.exe for scrape; fetch usually needs only obscura.exe
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout + 5,
            cwd=str(bin_path.parent),
            check=False,
        )
        raw = (proc.stdout or b"").decode("utf-8", errors="replace")
        if not raw.strip() and proc.returncode != 0:
            with _stats_lock:
                _stats["timeouts"] += 1
            return ""
        return raw
    except subprocess.TimeoutExpired:
        with _stats_lock:
            _stats["timeouts"] += 1
        return ""
    except Exception:
        return ""


def _fetch_text(url: str, timeout: float = 10.0) -> str:
    """HTML/text fetch: Scrapling → urllib → Obscura (flag). Tracks last engine."""
    global _last_fetch_engine
    text = _fetch_text_scrapling(url)
    if text and not _looks_like_challenge(text):
        _last_fetch_engine = "scrapling"
        with _stats_lock:
            _stats["engine_scrapling"] += 1
        return text
    text_u = _fetch_text_urllib(url, timeout=timeout)
    if text_u and not _looks_like_challenge(text_u):
        _last_fetch_engine = "urllib"
        with _stats_lock:
            _stats["engine_urllib"] += 1
        return text_u
    # Prefer non-empty urllib over empty even if challenge-ish (for SERP parse attempts)
    preferred = text_u or text
    text_o = ""
    if _obscura_enabled() and _obscura_bin():
        with _stats_lock:
            _stats["engine_obscura_attempt"] += 1
        text_o = _fetch_text_obscura(url, timeout=max(timeout, 15.0))
    if text_o and (not _looks_like_challenge(text_o) or len(text_o) > len(preferred or "")):
        if not _looks_like_challenge(text_o) or not preferred:
            _last_fetch_engine = "obscura"
            with _stats_lock:
                _stats["engine_obscura"] += 1
            return text_o
    if preferred:
        _last_fetch_engine = "urllib" if text_u else "scrapling"
        with _stats_lock:
            if text_u:
                _stats["engine_urllib"] += 1
            else:
                _stats["engine_scrapling"] += 1
        return preferred
    if text_o:
        _last_fetch_engine = "obscura"
        with _stats_lock:
            _stats["engine_obscura"] += 1
        return text_o
    _last_fetch_engine = "none"
    return ""


def _extract_contacts_from_text(text: str, prefer_near: str | None = None) -> dict[str, str]:
    out = {"email": "", "telefono": "", "direccion": ""}
    if not text:
        return out
    prefer = (prefer_near or "").lower().strip()
    email_cands: list[str] = []
    for m in _EMAIL_RE.findall(text):
        low = m.lower()
        if any(b in low for b in _BAD_EMAIL_PARTS):
            continue
        if low.endswith((".png", ".jpg", ".gif", ".svg", ".webp", ".css", ".js")):
            continue
        email_cands.append(m.strip())
    if prefer and email_cands:
        scored: list[tuple[int, str]] = []
        for e in email_cands:
            score = 0
            el = e.lower()
            idx = text.lower().find(el)
            if prefer and idx >= 0:
                window = text.lower()[max(0, idx - 180) : idx + 180]
                if prefer[:12] in window or any(p.isdigit() and p in window for p in [prefer]):
                    score += 5
            if any(tok and tok in el for tok in re.findall(r"[a-z]{4,}", prefer)[:4]):
                score += 3
            scored.append((score, e))
        scored.sort(key=lambda x: (-x[0], len(x[1])))
        if scored and scored[0][0] > 0:
            out["email"] = scored[0][1]
    elif email_cands:
        out["email"] = email_cands[0]

    for m in _PHONE_RE.findall(text):
        digits = _digits(m)
        if digits.startswith("57") and len(digits) >= 12:
            digits = digits[2:]
        if len(digits) == 10 and (digits.startswith("3") or digits.startswith("60")):
            out["telefono"] = digits
            break
    for m in _ADDR_RE.findall(text):
        cand = re.sub(r"\s+", " ", m).strip()
        if len(cand) >= 8:
            out["direccion"] = cand[:120]
            break
    return out


def _host_allowed_for_hop(host: str) -> bool:
    h = (host or "").lower().strip(".")
    if not h:
        return False
    for b in _HOP_BLOCK_HOSTS:
        if b in h:
            return False
    return any(h.endswith(t) or ("." + h).endswith(t) for t in _HOP_TLDS) or "." in h


def _extract_hop_urls(html: str, limit: int = 3) -> list[str]:
    """Pick public corporate links from SERP HTML (uddg= unwrap or plain href)."""
    if not html:
        return []
    found: list[str] = []
    seen: set[str] = set()
    # DuckDuckGo lite: uddg= encoded target
    for m in re.finditer(r"[?&]uddg=([^&\"']+)", html, re.IGNORECASE):
        try:
            u = urllib.parse.unquote(m.group(1))
        except Exception:
            continue
        if u.startswith("http") and u not in seen:
            seen.add(u)
            found.append(u)
        if len(found) >= limit:
            return found
    for m in re.finditer(r'href=["\'](https?://[^"\']+)["\']', html, re.IGNORECASE):
        u = m.group(1)
        if u in seen:
            continue
        try:
            host = urllib.parse.urlparse(u).hostname or ""
        except Exception:
            continue
        if not _host_allowed_for_hop(host):
            continue
        seen.add(u)
        found.append(u)
        if len(found) >= limit:
            break
    return found


def _hop_fetch_contacts(html: str, prefer_near: str) -> tuple[dict[str, str], str]:
    """1-hop to corporate site from SERP. Returns (contacts, engine_used)."""
    engines_used: list[str] = []
    merged = {"email": "", "telefono": "", "direccion": ""}
    for url in _extract_hop_urls(html, limit=2):
        try:
            host = (urllib.parse.urlparse(url).hostname or "").lower()
        except Exception:
            continue
        if not _host_allowed_for_hop(host):
            continue
        # Prefer contact-ish path if homepage
        path = urllib.parse.urlparse(url).path or "/"
        targets = [url]
        if path in ("/", "") or len(path) < 2:
            targets = [
                urllib.parse.urljoin(url, "/contacto"),
                urllib.parse.urljoin(url, "/contact"),
                url,
            ]
        for t in targets[:2]:
            page = _fetch_text(t, timeout=12.0)
            engines_used.append(_last_fetch_engine)
            if not page or _looks_like_challenge(page):
                continue
            got = _extract_contacts_from_text(page, prefer_near=prefer_near)
            for k in ("email", "telefono", "direccion"):
                if not merged[k] and got.get(k):
                    merged[k] = got[k]
            if merged["email"] or merged["telefono"]:
                with _stats_lock:
                    _stats["hop_ok"] += 1
                eng = engines_used[-1] if engines_used else "none"
                return merged, eng
    eng = engines_used[-1] if engines_used else "none"
    return merged, eng


def enrich_scrapling(nit: str, nombre_hint: str | None) -> dict[str, Any]:
    """Best-effort web contact scrape; never raises to caller."""
    out: dict[str, Any] = {
        "nombre": nombre_hint or "",
        "email": "",
        "telefono": "",
        "ciudad": "",
        "direccion": "",
        "source": "scrapling_enrich",
        "ok": False,
        "engine": "none",
    }
    nit = _digits(nit)
    if len(nit) < 6:
        return out
    nombre = (nombre_hint or "").strip()
    queries = [
        f'{nit} NIT Colombia email OR correo OR teléfono OR "calle" OR carrera',
    ]
    if nombre:
        short = re.sub(r"\s+", " ", nombre)[:80]
        queries.insert(0, f'"{short}" {nit} Colombia contacto correo teléfono dirección')
        queries.append(f'"{short}" Colombia email teléfono')

    blobs: list[str] = []
    engines: list[str] = []
    for q in queries[:2]:
        url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": q})
        html = _fetch_text(url, timeout=12.0)
        engines.append(_last_fetch_engine)
        if html:
            blobs.append(html)
        if any(_extract_contacts_from_text(b, prefer_near=f"{nombre} {nit}".strip()).get("email") for b in blobs):
            break

    merged = {"email": "", "telefono": "", "direccion": ""}
    for blob in blobs:
        got = _extract_contacts_from_text(blob, prefer_near=f"{nombre} {nit}".strip())
        for k in ("email", "telefono", "direccion"):
            if not merged[k] and got.get(k):
                merged[k] = got[k]

    used_obscura = "obscura" in engines
    engine = engines[-1] if engines else "none"

    # Fase 4: 1-hop sitio corporativo si SERP no dio contacto útil
    if not (merged.get("email") or merged.get("telefono") or merged.get("direccion")) and blobs:
        hop, hop_eng = _hop_fetch_contacts(blobs[0], prefer_near=f"{nombre} {nit}".strip())
        for k in ("email", "telefono", "direccion"):
            if not merged[k] and hop.get(k):
                merged[k] = hop[k]
        if hop_eng and hop_eng != "none":
            engine = hop_eng
            if hop_eng == "obscura":
                used_obscura = True

    # Nominatim (OSM): dirección aproximada si hay razón social
    if not merged["direccion"] and nombre:
        try:
            q = f"{nombre}, Colombia"
            osm = (
                "https://nominatim.openstreetmap.org/search?"
                + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "addressdetails": 1})
            )
            req = urllib.request.Request(
                osm,
                headers={"User-Agent": "CrozzoAdqEnrich/1.2 (local POS enrich)", "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                rows = json.loads(resp.read().decode("utf-8", errors="replace") or "[]")
            if isinstance(rows, list) and rows:
                disp = str(rows[0].get("display_name") or "").strip()
                if disp and len(disp) > 12:
                    if any(x in disp.lower() for x in ("calle", "carrera", "avenida", "#", " cra", " cl ")):
                        merged["direccion"] = disp[:160]
                    elif not out.get("ciudad"):
                        parts = [p.strip() for p in disp.split(",") if p.strip()]
                        if len(parts) >= 2:
                            out["ciudad"] = parts[-3] if len(parts) >= 3 else parts[0]
        except Exception:
            pass

    out["email"] = merged["email"]
    out["telefono"] = merged["telefono"]
    out["direccion"] = merged["direccion"]
    out["engine"] = engine
    if used_obscura and (out["email"] or out["telefono"] or out["direccion"]):
        out["source"] = "obscura_enrich"
    out["ok"] = bool(out["email"] or out["telefono"] or out["direccion"] or out["nombre"])
    return out


def do_enrich(nit: str, nombre_hint: str | None = None) -> dict[str, Any]:
    global _busy
    with _lock:
        if _busy:
            return {"ok": False, "error": "busy", "source": "scrapling_enrich", "engine": "none"}
        _busy = True
    try:
        base = enrich_rues(nit)
        base["engine"] = "rues"
        need = not (base.get("email") and base.get("direccion") and base.get("telefono"))
        if need:
            extra = enrich_scrapling(nit, nombre_hint or base.get("nombre"))
            for k in ("nombre", "email", "telefono", "ciudad", "direccion"):
                if not base.get(k) and extra.get(k):
                    base[k] = extra[k]
            if extra.get("engine"):
                base["engine"] = extra.get("engine")
            if extra.get("ok") and not base.get("ok"):
                base["source"] = extra.get("source") or "scrapling_enrich"
            elif base.get("ok") and extra.get("ok") and need:
                if extra.get("email") or extra.get("direccion") or extra.get("telefono"):
                    if base.get("source") == "rues_enrich" and not (
                        base.get("email") or base.get("direccion") or base.get("telefono")
                    ):
                        base["source"] = extra.get("source") or "scrapling_enrich"
                    elif extra.get("source") == "obscura_enrich":
                        base["source"] = "obscura_enrich"
        base["ok"] = bool(base.get("nombre") or base.get("email") or base.get("direccion") or base.get("telefono"))
        base["obscura"] = {
            "enabled": _obscura_enabled(),
            "bin": bool(_obscura_bin()),
        }
        with _stats_lock:
            if base.get("ok"):
                _stats["enrich_ok"] += 1
            else:
                _stats["enrich_fail"] += 1
        return base
    finally:
        with _lock:
            _busy = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _send(self, code: int, obj: Any) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/health":
            self._send(
                200,
                {
                    "ok": True,
                    "service": "crozzo-adq-enrich",
                    "port": PORT,
                    "obscura": {"enabled": _obscura_enabled(), "bin": bool(_obscura_bin())},
                },
            )
            return
        if path == "/stats":
            with _stats_lock:
                snap = dict(_stats)
            self._send(
                200,
                {
                    "ok": True,
                    "stats": snap,
                    "obscura": {"enabled": _obscura_enabled(), "bin": bool(_obscura_bin())},
                },
            )
            return
        self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/enrich":
            self._send(404, {"ok": False, "error": "not_found"})
            return
        try:
            n = int(self.headers.get("Content-Length") or "0")
            body = self.rfile.read(n) if n > 0 else b"{}"
            payload = json.loads(body.decode("utf-8") or "{}")
        except Exception:
            self._send(400, {"ok": False, "error": "bad_json"})
            return
        nit = _digits(str(payload.get("nit") or ""))
        nombre_hint = payload.get("nombre_hint") or payload.get("nombreHint")
        if len(nit) < 6:
            self._send(400, {"ok": False, "error": "nit_corto"})
            return
        try:
            result = do_enrich(nit, str(nombre_hint) if nombre_hint else None)
            self._send(200, result)
        except Exception as e:
            self._send(500, {"ok": False, "error": str(e), "trace": traceback.format_exc()[-500:]})


def main() -> None:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(
        f"[crozzo-adq-enrich] listening http://{HOST}:{PORT} "
        f"obscura={_obscura_enabled()} bin={bool(_obscura_bin())}",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
