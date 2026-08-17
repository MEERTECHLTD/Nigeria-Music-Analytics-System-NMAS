#!/usr/bin/env python3
"""
ENTITY RESOLUTION: population frame -> Soundcharts artist UUIDs.

The frame carries Chartmetric ids but no Spotify ids (verified: 0 of 855), so
resolution goes through name search and is then adjudicated on country and
exact-name agreement. Every decision is written with its confidence class so a
statistician can audit or override it rather than trusting a silent match.

Confidence classes, strongest first:
  exact_ng     name matches exactly (case/punctuation-folded) AND countryCode NG
  exact_other  name matches exactly, provider says another country
  ng_only      no exact name match, but exactly one Nigerian candidate
  ambiguous    several plausible candidates — first Nigerian one taken, flagged
  unmatched    provider returned nothing usable

Resumable: re-running skips artists already present in the output.
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from nmas.services.soundcharts import client_from_env  # noqa: E402

ROOT = BACKEND.parent
FRAME = ROOT / "delivery" / "04_Datasets" / "Artist_Population_Frame.csv"
OUT = ROOT / "backend" / "data" / "soundcharts" / "artist_resolution.csv"

FIELDS = [
    "artist_name", "cm_artist_id", "sc_uuid", "sc_name", "sc_slug",
    "sc_country", "sc_career_stage", "match_confidence", "candidates_seen",
]


def fold(name: str) -> str:
    """Case, accent and punctuation folded form for exact-match comparison."""
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "", text)


def resolve(client, row: dict[str, str]) -> dict[str, str]:
    name = (row.get("artist_name") or "").strip()
    out = {k: "" for k in FIELDS}
    out["artist_name"] = name
    out["cm_artist_id"] = (row.get("cm_artist_id") or "").strip()

    try:
        candidates = client.search_artist(name, limit=10)
    except Exception as exc:  # noqa: BLE001 - record and move on
        out["match_confidence"] = f"error:{type(exc).__name__}"
        return out

    out["candidates_seen"] = str(len(candidates))
    if not candidates:
        out["match_confidence"] = "unmatched"
        return out

    target = fold(name)
    exact = [c for c in candidates if fold(c.get("name", "")) == target]
    nigerian = [c for c in candidates if (c.get("countryCode") or "") == "NG"]
    exact_ng = [c for c in exact if (c.get("countryCode") or "") == "NG"]

    if exact_ng:
        pick, confidence = exact_ng[0], "exact_ng"
    elif exact:
        # An exact name match is strong evidence on its own. The provider's
        # country code is its own classification and is frequently blank or
        # set to a diaspora country for Nigerian artists (Aṣa=FR, Crayon=FR,
        # Nonso Amadi=CA, Maleek Berry=GB). The population frame — built from
        # Nigerian sources — is the authority on who is in scope, and diaspora
        # artists are precisely what export revenue measures. Kept, but the
        # class records which case it was so it stays auditable.
        pick = exact[0]
        confidence = "exact_no_country" if not (pick.get("countryCode") or "") else "exact_foreign"
    elif len(nigerian) == 1:
        pick, confidence = nigerian[0], "ng_only"
    elif nigerian:
        pick, confidence = nigerian[0], "ambiguous"
    else:
        out["match_confidence"] = "unmatched"
        return out

    out.update({
        "sc_uuid": pick.get("uuid", ""),
        "sc_name": pick.get("name", ""),
        "sc_slug": pick.get("slug", ""),
        "sc_country": pick.get("countryCode", "") or "",
        "sc_career_stage": pick.get("careerStage", "") or "",
        "match_confidence": confidence,
    })
    return out


def main() -> int:
    rows = list(csv.DictReader(FRAME.open(encoding="utf-8")))
    OUT.parent.mkdir(parents=True, exist_ok=True)

    done: set[str] = set()
    if OUT.exists():
        existing = list(csv.DictReader(OUT.open(encoding="utf-8")))
        # A transport failure is not a resolution. Rows that errored are dropped
        # and retried, otherwise a bad run permanently orphans those artists.
        keep = [r for r in existing if not r["match_confidence"].startswith("error:")]
        dropped = len(existing) - len(keep)
        if dropped:
            with OUT.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=FIELDS)
                writer.writeheader()
                writer.writerows(keep)
            print(f"dropped {dropped} errored rows for retry", flush=True)
        done = {r["artist_name"] for r in keep}
        print(f"resuming: {len(done)} already resolved", flush=True)

    todo = [r for r in rows if (r.get("artist_name") or "").strip() not in done]
    print(f"frame={len(rows)} todo={len(todo)}", flush=True)
    if not todo:
        return 0

    client = client_from_env(calls_per_minute=3000)
    write_header = not OUT.exists()
    counts: dict[str, int] = {}

    with OUT.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        if write_header:
            writer.writeheader()
        with ThreadPoolExecutor(max_workers=12) as pool:
            futures = {pool.submit(resolve, client, r): r for r in todo}
            for index, future in enumerate(as_completed(futures), start=1):
                record = future.result()
                writer.writerow(record)
                counts[record["match_confidence"]] = counts.get(record["match_confidence"], 0) + 1
                if index % 25 == 0:
                    handle.flush()
                    print(
                        f"  {index}/{len(todo)}  quota_left={client.quota.quota_remaining}  {counts}",
                        flush=True,
                    )

    print("\nRESOLUTION SUMMARY")
    for key in sorted(counts):
        print(f"  {key:14} {counts[key]}")
    print(f"calls made: {client.quota.calls_made}  quota remaining: {client.quota.quota_remaining}")
    print(f"written: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
