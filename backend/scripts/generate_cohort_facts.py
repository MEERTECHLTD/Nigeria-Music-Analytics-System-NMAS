#!/usr/bin/env python3
"""
Generate frontend/src/generated/cohortFacts.ts from delivered files.

The audit console reported "131 artists" in ~25 places. 131 is the ROW count of
the first submission's artist master list; the ARTIST count is 130, because
"Flavour" and "Flavour N'abania" are one person carried under two provider
UUIDs. This script derives both counts (plus the duplicate pairs and the
revenue rows each identity produced) from the delivered artifacts and mirrors
them into a generated TypeScript module, so the console can state each figure
under its own name instead of publishing a row count as a headcount.

Mirrors the existing generate_frontend_assumptions.py pattern; guarded by
_audit/validation/cohort_facts_drift_test.py.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from nmas.cohort import canonical, counts  # noqa: E402

CONSOLE = ROOT / "frontend" / "public" / "api" / "v1" / "console"
OUT = ROOT / "frontend" / "src" / "generated" / "cohortFacts.ts"


def _rows(payload):
    if isinstance(payload, list):
        return payload
    for key in ("rows", "data", "artists", "revenue"):
        if isinstance(payload.get(key), list):
            return payload[key]
    raise SystemExit("unrecognised artifact shape")


def main() -> int:
    c = counts()
    artists = _rows(json.loads((CONSOLE / "artists.json").read_text(encoding="utf-8")))
    revenue = _rows(json.loads((CONSOLE / "revenue.json").read_text(encoding="utf-8")))

    by_name = {a["artist_name"]: a for a in artists}
    rev_rows = Counter(r["artist_name"] for r in revenue)

    def money(row):
        return sum(float(row.get(f) or 0) for f in
                   ("spotify_revenue_usd", "youtube_revenue_usd", "deezer_revenue_usd"))

    dupes = []
    for pair in c["duplicates"]:
        alias, canon = pair["alias"], pair["canonical"]
        members = [alias, canon]
        dupes.append({
            "alias": alias,
            "canonical": canon,
            "aliasProviderId": (by_name.get(alias) or {}).get("chartmetric_artist_id"),
            "canonicalProviderId": (by_name.get(canon) or {}).get("chartmetric_artist_id"),
            "revenueRows": sum(rev_rows.get(m, 0) for m in members),
            "duplicatedRevenueUsd": round(
                sum(money(r) for r in revenue if r["artist_name"] == alias), 2),
        })

    # The console's own artifacts, counted rather than asserted.
    artifact_rows = len(artists)
    artifact_artists = len({canonical(a["artist_name"]) for a in artists})
    periods = sorted({r["period"] for r in revenue})

    ts = datetime.now(timezone.utc).isoformat()
    lines = [
        "// GENERATED FILE — do not edit. Source of truth: backend/nmas/cohort.py",
        "// Regenerate with: backend/scripts/generate_cohort_facts.py",
        "// Generated %s" % ts,
        "//",
        "// A row count and an artist count are different measurements. The first",
        "// submission's master list holds %d rows describing %d distinct artists:"
        % (c["master_list_rows"], c["distinct_artists"]),
        "// one artist is carried twice under two provider UUIDs. The console imports",
        "// these so it can state each figure under its own name (GAP-033).",
        "",
        "export interface DuplicateArtist {",
        "  /** the frame name that is a second identity for the same person */",
        "  alias: string;",
        "  /** the name kept when the two are merged */",
        "  canonical: string;",
        "  aliasProviderId: number | null;",
        "  canonicalProviderId: number | null;",
        "  /** delivered revenue rows carried across BOTH identities */",
        "  revenueRows: number;",
        "  /** revenue delivered under the alias, i.e. counted a second time */",
        "  duplicatedRevenueUsd: number;",
        "}",
        "",
        "/** Rows in the delivered artist master list. */",
        "export const MASTER_LIST_ROWS = %d;" % c["master_list_rows"],
        "",
        "/** Distinct artists those rows describe, after the documented merge. */",
        "export const DISTINCT_ARTISTS = %d;" % c["distinct_artists"],
        "",
        "/**",
        " * The artist count the SHIPPED cost model used. A historical fact about",
        " * delivered files: %d x 13 variables x 8 quarters = 13,624 units. It is a row"
        % c["master_list_rows"],
        " * count, so the delivered cost model charged one artist twice. Never",
        " * 'correct' this to %d — that would misreport what was delivered."
        % c["distinct_artists"],
        " */",
        "export const COST_MODEL_N = %d;" % c["master_list_rows"],
        "",
        "/** Rows in the console's artists.json artifact. */",
        "export const ARTIFACT_ARTIST_ROWS = %d;" % artifact_rows,
        "",
        "/** Distinct artists in that artifact. */",
        "export const ARTIFACT_DISTINCT_ARTISTS = %d;" % artifact_artists,
        "",
        "/** Delivered artist-quarter revenue rows. */",
        "export const REVENUE_ROWS = %d;" % len(revenue),
        "",
        "/** Quarters the first submission delivered revenue for. */",
        "export const REVENUE_PERIODS = %d;" % len(periods),
        "",
        "export const DUPLICATE_ARTISTS: DuplicateArtist[] = %s;"
        % json.dumps(dupes, indent=2).replace("null", "null"),
        "",
        "/** Revenue counted twice because of the duplicate identities above. */",
        "export const DUPLICATED_REVENUE_USD = %.2f;"
        % sum(d["duplicatedRevenueUsd"] for d in dupes),
        "",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote %s" % OUT.relative_to(ROOT))
    print("  master list rows %d | distinct artists %d | duplicates %d"
          % (c["master_list_rows"], c["distinct_artists"], len(dupes)))
    for d in dupes:
        print("  dup: %s -> %s (ids %s/%s, %d revenue rows, $%s counted twice)"
              % (d["alias"], d["canonical"], d["aliasProviderId"],
                 d["canonicalProviderId"], d["revenueRows"],
                 format(d["duplicatedRevenueUsd"], ",.2f")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
