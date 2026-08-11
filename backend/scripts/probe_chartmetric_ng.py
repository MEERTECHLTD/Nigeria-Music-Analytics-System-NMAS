"""Probe Chartmetric API to find an endpoint that returns a bulk list of NG artists.

Tries several documented/likely endpoints with small limits, prints the first
non-empty response shape. No data is written — this is exploratory only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[0].parent))

from nmas.services.chartmetric import ChartmetricClient, ChartmetricRequestError


CANDIDATES: list[tuple[str, dict]] = [
    # Country-filtered rankings / charts
    ("/api/charts/artist", {"type": "trend", "domain": "spotify", "country_code": "NG", "limit": 10}),
    ("/api/charts/artists", {"type": "trend", "domain": "spotify", "country_code": "NG", "limit": 10}),
    ("/api/artist/ranking", {"country_code": "NG", "limit": 10}),
    ("/api/artist/top/NG", {"limit": 10}),
    ("/api/artist", {"country_code": "NG", "limit": 10}),
    ("/api/artists", {"country_code": "NG", "limit": 10}),
    ("/api/charts/artists/top", {"country_code": "NG", "limit": 10}),
    ("/api/country/NG/artists", {"limit": 10}),
    # Search by a generic Nigerian-context term
    ("/api/search", {"q": "afrobeats", "type": "artists", "limit": 10}),
    # Playlist-based discovery (Nigerian editorial list)
    ("/api/playlist/editorial", {"country_code": "NG", "limit": 10}),
]


def main() -> None:
    client = ChartmetricClient()
    client.ensure_access_token()
    print("Token acquired. Probing endpoints...\n")

    for endpoint, params in CANDIDATES:
        try:
            r = client.request_json(endpoint, params)
            payload = r.payload
            # Summarise shape
            if isinstance(payload, dict):
                keys = list(payload.keys())[:6]
                obj = payload.get("obj")
                sample_len = (
                    len(obj) if isinstance(obj, list)
                    else len(payload.get("data", [])) if isinstance(payload.get("data"), list)
                    else None
                )
                print(f"OK  {endpoint:35s}  keys={keys}  approx_len={sample_len}")
                # Print a single sample record to understand shape
                if isinstance(obj, list) and obj:
                    print("    sample:", json.dumps(obj[0], default=str)[:300])
                elif isinstance(payload.get("data"), list) and payload["data"]:
                    print("    sample:", json.dumps(payload["data"][0], default=str)[:300])
            elif isinstance(payload, list):
                print(f"OK  {endpoint:35s}  list len={len(payload)}")
                if payload:
                    print("    sample:", json.dumps(payload[0], default=str)[:300])
            else:
                print(f"OK  {endpoint:35s}  other type={type(payload).__name__}")
        except ChartmetricRequestError as e:
            print(f"ERR {endpoint:35s}  status={e.status_code} retryable={e.retryable}")
        except Exception as e:  # noqa: BLE001
            print(f"EXC {endpoint:35s}  {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
