"""Sanitize Flow / labs.google HAR captures for safe sharing.

Removes cookies, auth headers, API keys, sensitive query params.
Truncates huge base64 media blobs. Keeps status codes, timings,
error reason enums, and structure needed for reliability analysis.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

REDACT = "<<REDACTED>>"
HDR_BLOCK = {
    "cookie",
    "set-cookie",
    "authorization",
    "proxy-authorization",
    "x-client-data",
    "x-goog-api-key",
    "sapisid",
}
HDR_SUBSTR = ("auth-token", "api-key", "apikey", "id-token", "session-id")
QS_BLOCK = {
    "key",
    "access_token",
    "token",
    "auth",
    "id_token",
    "oauth_token",
}
URL_RE = re.compile(
    r"([?&](?:key|access_token|token|auth|id_token|oauth_token)=)[^&#]+",
    re.I,
)
# reCAPTCHA tokens are ~2–3k; media is huge
B64_RE = re.compile(r"[A-Za-z0-9+/=_\-]{8000,}")
# Scrub live captcha tokens in JSON bodies when sharing externally
TOKEN_JSON_RE = re.compile(
    r'("token"\s*:\s*")([^"]{80,})(")',
    re.I,
)
# Scrub account-ish identifiers often present in Flow HARs
PROJECT_ID_RE = re.compile(
    r'("projectId"\s*:\s*")([0-9a-fA-F-]{20,})(")',
)
SESSION_ID_RE = re.compile(
    r'("sessionId"\s*:\s*")([^"]+)(")',
)
# Real credit balances are account fingerprint; zero them in shared HARs
CREDITS_NUM_RE = re.compile(
    r'("(?:credits|topUpCredits|subscriptionCredits)"\s*:\s*)(\d+)',
)


def _clean_headers(headers: list[dict[str, Any]] | None, stats: dict[str, int]) -> None:
    for h in headers or []:
        n = (h.get("name") or "").lower()
        if n in HDR_BLOCK or any(s in n for s in HDR_SUBSTR):
            h["value"] = REDACT
            stats["headers"] += 1


def _clean_cookies(cookies: list[dict[str, Any]] | None, stats: dict[str, int]) -> None:
    for c in cookies or []:
        if "value" in c:
            c["value"] = REDACT
            stats["cookies"] += 1


def _truncate_b64(text: str, stats: dict[str, int]) -> str:
    def repl(m: re.Match[str]) -> str:
        stats["b64_blobs"] += 1
        stats["b64_chars"] += len(m.group(0))
        return f"<BASE64_TRUNCATED_{len(m.group(0))}_chars>"

    return B64_RE.sub(repl, text)


def _scrub_tokens(text: str, stats: dict[str, int], scrub_tokens: bool) -> str:
    if not scrub_tokens:
        return text

    def repl(m: re.Match[str]) -> str:
        stats["tokens"] += 1
        return f"{m.group(1)}<TOKEN_REDACTED_len={len(m.group(2))}>{m.group(3)}"

    return TOKEN_JSON_RE.sub(repl, text)


def _scrub_account_fields(text: str, stats: dict[str, int]) -> str:
    """Redact project/session IDs and numeric credit balances (account fingerprint)."""

    def proj(m: re.Match[str]) -> str:
        stats["project_ids"] += 1
        return f"{m.group(1)}<PROJECT_ID_REDACTED>{m.group(3)}"

    def sess(m: re.Match[str]) -> str:
        stats["session_ids"] += 1
        return f"{m.group(1)}<SESSION_ID_REDACTED>{m.group(3)}"

    def cred(m: re.Match[str]) -> str:
        stats["credit_nums"] += 1
        return f"{m.group(1)}0"

    text = PROJECT_ID_RE.sub(proj, text)
    text = SESSION_ID_RE.sub(sess, text)
    text = CREDITS_NUM_RE.sub(cred, text)
    return text


def sanitize_har(
    data: dict[str, Any],
    *,
    scrub_tokens: bool = True,
) -> tuple[dict[str, Any], dict[str, int]]:
    """Return sanitized HAR dict + stats."""
    stats = {
        "entries": 0,
        "headers": 0,
        "cookies": 0,
        "qs": 0,
        "b64_blobs": 0,
        "b64_chars": 0,
        "tokens": 0,
        "project_ids": 0,
        "session_ids": 0,
        "credit_nums": 0,
    }

    for e in data.get("log", {}).get("entries", []):
        stats["entries"] += 1
        req, resp = e.get("request", {}), e.get("response", {})
        _clean_headers(req.get("headers"), stats)
        _clean_headers(resp.get("headers"), stats)
        _clean_cookies(req.get("cookies"), stats)
        _clean_cookies(resp.get("cookies"), stats)

        for q in req.get("queryString") or []:
            if (q.get("name") or "").lower() in QS_BLOCK:
                q["value"] = REDACT
                stats["qs"] += 1

        if "url" in req:
            # Redact project UUIDs embedded in REST paths
            url = req["url"]
            url = URL_RE.sub(r"\1" + REDACT, url)
            url = re.sub(
                r"(projects/)[0-9a-fA-F-]{20,}",
                r"\1<PROJECT_ID_REDACTED>",
                url,
            )
            if "<PROJECT_ID_REDACTED>" in url:
                stats["project_ids"] += 1
            req["url"] = url

        pd = req.get("postData")
        if pd and pd.get("text"):
            t = _truncate_b64(pd["text"], stats)
            t = _scrub_tokens(t, stats, scrub_tokens)
            pd["text"] = _scrub_account_fields(t, stats)

        ct = resp.get("content")
        if ct and ct.get("text"):
            t = _truncate_b64(ct["text"], stats)
            t = _scrub_tokens(t, stats, scrub_tokens)
            ct["text"] = _scrub_account_fields(t, stats)

    return data, stats


def sanitize_file(
    src: Path,
    dst: Path,
    *,
    scrub_tokens: bool = True,
) -> dict[str, int]:
    raw = json.loads(src.read_text(encoding="utf-8"))
    cleaned, stats = sanitize_har(raw, scrub_tokens=scrub_tokens)
    dst.write_text(json.dumps(cleaned, indent=1), encoding="utf-8")
    stats["out_bytes"] = dst.stat().st_size
    stats["in_bytes"] = src.stat().st_size
    return stats
