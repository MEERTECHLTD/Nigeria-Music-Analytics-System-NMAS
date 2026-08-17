"""
SOUNDCHARTS CONNECTOR

Second provider alongside Chartmetric. Exists because Chartmetric's archive
floor is 2024-01-01 while the NBS series must start 2019-01-01, and because
Chartmetric's subscription tier denies Boomplay, Audiomack and radio airplay —
all three of which Soundcharts answers on this account.

Verified against the live account 2026-08-11:
  - legacy header auth (x-app-id / x-api-key) reaches PRODUCTION data
  - x-quota-remaining: 4,000,000 calls
  - x-ratelimit-limit: 10,000 per minute

Transport is stdlib urllib on purpose. The official `soundcharts` SDK is
installed and is the documented client, but its aiohttp layer fails TLS
verification on this machine (SSLCertVerificationError: unable to get local
issuer certificate) while urllib against the same host succeeds. Extraction
must not depend on a broken trust store.
"""

from __future__ import annotations

import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


DEFAULT_BASE_URL = "https://customer.api.soundcharts.com"


def _ssl_context() -> ssl.SSLContext:
    """TLS context with a CA bundle that actually exists on this machine.

    The python.org 3.14 framework build in backend/.venv ships no root
    certificates, so both aiohttp (inside the official SDK) and a bare
    urllib call fail with CERTIFICATE_VERIFY_FAILED while curl succeeds.
    certifi supplies the bundle; SSL_CERT_FILE still wins if the operator
    set one deliberately.
    """
    override = os.environ.get("SSL_CERT_FILE")
    if override and Path(override).exists():
        return ssl.create_default_context(cafile=override)
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


class SoundchartsError(RuntimeError):
    """Non-retryable provider failure."""


class SoundchartsAuthError(SoundchartsError):
    """Credentials rejected."""


class SoundchartsQuotaError(SoundchartsError):
    """Billing quota exhausted — stop the run, do not retry."""


@dataclass
class RateLimiter:
    """Token bucket honouring the documented 10,000 calls/minute ceiling.

    Held well under the ceiling by default: a backfill that trips the limiter
    wastes retries, and the run is measured in hours either way.
    """

    calls_per_minute: int = 6000
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _allowance: float = field(default=0.0, repr=False)
    _last: float = field(default=0.0, repr=False)

    def __post_init__(self) -> None:
        self._allowance = float(self.calls_per_minute)
        self._last = time.monotonic()

    def acquire(self) -> None:
        while True:
            with self._lock:
                now = time.monotonic()
                elapsed = now - self._last
                self._last = now
                self._allowance = min(
                    float(self.calls_per_minute),
                    self._allowance + elapsed * (self.calls_per_minute / 60.0),
                )
                if self._allowance >= 1.0:
                    self._allowance -= 1.0
                    return
                deficit = (1.0 - self._allowance) * (60.0 / self.calls_per_minute)
            time.sleep(max(deficit, 0.01))


@dataclass
class QuotaState:
    """Last quota/rate figures the provider reported back."""

    quota_remaining: int | None = None
    ratelimit_remaining: int | None = None
    ratelimit_limit: int | None = None
    calls_made: int = 0

    def snapshot(self) -> dict[str, Any]:
        return {
            "quota_remaining": self.quota_remaining,
            "ratelimit_remaining": self.ratelimit_remaining,
            "ratelimit_limit": self.ratelimit_limit,
            "calls_made": self.calls_made,
        }


class SoundchartsClient:
    """Thin, thread-safe, retrying JSON client for the Soundcharts v2 API."""

    def __init__(
        self,
        app_id: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: int | None = None,
        max_retries: int | None = None,
        calls_per_minute: int = 6000,
        raw_archive_root: str | Path | None = None,
    ) -> None:
        self.app_id = app_id or os.environ.get("SOUNDCHARTS_APP_ID", "")
        self.api_key = api_key or os.environ.get("SOUNDCHARTS_API_KEY", "")
        if not self.app_id or not self.api_key:
            raise SoundchartsAuthError(
                "SOUNDCHARTS_APP_ID / SOUNDCHARTS_API_KEY missing. "
                "They live in backend/.env, which is gitignored."
            )
        self.base_url = (base_url or os.environ.get("SOUNDCHARTS_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = int(timeout or os.environ.get("SOUNDCHARTS_TIMEOUT_SECONDS", 30))
        self.max_retries = int(max_retries or os.environ.get("SOUNDCHARTS_MAX_RETRIES", 3))
        self.limiter = RateLimiter(calls_per_minute=calls_per_minute)
        self.quota = QuotaState()
        self._quota_lock = threading.Lock()
        self.ssl_context = _ssl_context()
        self.raw_archive_root = Path(raw_archive_root) if raw_archive_root else None
        if self.raw_archive_root:
            self.raw_archive_root.mkdir(parents=True, exist_ok=True)

    # -- internals ---------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "x-app-id": self.app_id,
            "x-api-key": self.api_key,
            "Accept": "application/json",
            "User-Agent": "NMAS-NBS/1.0 (+statistical production pipeline)",
        }

    def _record_quota(self, headers: Any) -> None:
        def as_int(name: str) -> int | None:
            raw = headers.get(name)
            try:
                return int(raw) if raw is not None else None
            except (TypeError, ValueError):
                return None

        with self._quota_lock:
            self.quota.calls_made += 1
            for attr, header in (
                ("quota_remaining", "x-quota-remaining"),
                ("ratelimit_remaining", "x-ratelimit-remaining"),
                ("ratelimit_limit", "x-ratelimit-limit"),
            ):
                value = as_int(header)
                if value is not None:
                    setattr(self.quota, attr, value)

    def _archive(self, path: str, payload: dict[str, Any]) -> None:
        if not self.raw_archive_root:
            return
        slug = path.lstrip("/").replace("/", "_").replace("?", "__").replace("&", "_")[:180]
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        target = self.raw_archive_root / f"{slug}__{stamp}.json"
        try:
            target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass  # archiving is evidence, not control flow

    # -- public ------------------------------------------------------------

    def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """GET a JSON document. Raises on auth/quota; returns {} on hard 404."""
        query = ""
        if params:
            clean = {k: v for k, v in params.items() if v is not None}
            if clean:
                query = "?" + urllib.parse.urlencode(clean)
        full = f"{path}{query}"
        url = f"{self.base_url}{full}"

        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self.limiter.acquire()
            request = urllib.request.Request(url, headers=self._headers())
            try:
                with urllib.request.urlopen(
                    request, timeout=self.timeout, context=self.ssl_context
                ) as response:
                    self._record_quota(response.headers)
                    body = json.load(response)
                    self._archive(full, body)
                    return body
            except urllib.error.HTTPError as exc:
                self._record_quota(exc.headers or {})
                status = exc.code
                try:
                    detail = json.load(exc)
                except Exception:
                    detail = {}
                message = ""
                errors = detail.get("errors") or []
                if errors and isinstance(errors, list) and isinstance(errors[0], dict):
                    message = str(errors[0].get("message", ""))

                if status in (401, 403):
                    raise SoundchartsAuthError(f"{status} on {full}: {message}") from exc
                if status == 402 or "quota" in message.lower():
                    raise SoundchartsQuotaError(f"{status} on {full}: {message}") from exc
                if status in (400, 404):
                    # Unsupported platform / no account for artist. A fact, not a fault.
                    return {"items": [], "errors": errors, "_status": status, "_message": message}
                if status == 429 or status >= 500:
                    last_error = exc
                    time.sleep(min(2 ** attempt, 30))
                    continue
                raise SoundchartsError(f"{status} on {full}: {message}") from exc
            except urllib.error.URLError as exc:
                if isinstance(getattr(exc, "reason", None), ssl.SSLCertVerificationError):
                    raise SoundchartsError(
                        "TLS trust store cannot verify the Soundcharts certificate. "
                        "Install certifi in this interpreter or set SSL_CERT_FILE. "
                        "Retrying would not help."
                    ) from exc
                last_error = exc
                time.sleep(min(2 ** attempt, 30))
                continue
            except (TimeoutError, json.JSONDecodeError, OSError) as exc:
                last_error = exc
                time.sleep(min(2 ** attempt, 30))
                continue

        raise SoundchartsError(f"exhausted {self.max_retries} retries on {full}: {last_error}")

    def paginate(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        page_size: int = 100,
        max_pages: int = 200,
    ) -> Iterator[dict[str, Any]]:
        """Yield every item across pages. Soundcharts caps limit at 100."""
        offset = 0
        for _ in range(max_pages):
            page_params = dict(params or {})
            page_params.update({"offset": offset, "limit": page_size})
            body = self.get(path, page_params)
            items = body.get("items") or []
            for item in items:
                yield item
            page = body.get("page") or {}
            if not items or not page.get("next"):
                return
            offset += page_size

    # -- entity resolution -------------------------------------------------

    def search_artist(self, term: str, limit: int = 10) -> list[dict[str, Any]]:
        encoded = urllib.parse.quote(term, safe="")
        body = self.get(f"/api/v2/artist/search/{encoded}", {"offset": 0, "limit": limit})
        return body.get("items") or []

    def artist_by_platform(self, platform: str, identifier: str) -> dict[str, Any]:
        body = self.get(f"/api/v2/artist/by-platform/{platform}/{identifier}")
        return body.get("object") or {}

    def artist_metadata(self, uuid: str) -> dict[str, Any]:
        body = self.get(f"/api/v2.9/artist/{uuid}")
        return body.get("object") or {}

    def artist_identifiers(self, uuid: str) -> list[dict[str, Any]]:
        body = self.get(f"/api/v2/artist/{uuid}/identifiers")
        return body.get("items") or []


def client_from_env(raw_archive_root: str | Path | None = None, calls_per_minute: int = 6000) -> SoundchartsClient:
    """Build a client from backend/.env, loading it if the vars aren't exported."""
    if not os.environ.get("SOUNDCHARTS_APP_ID"):
        env_path = Path(__file__).resolve().parents[2] / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())
    return SoundchartsClient(raw_archive_root=raw_archive_root, calls_per_minute=calls_per_minute)
