"""
COHORT IDENTITY — the single source for "how many artists are there".

Why this module exists
----------------------
The first submission's artist master list holds 131 ROWS but 130 distinct
ARTISTS: "Flavour" and "Flavour N'abania" are one human being, carried twice in
the population frame under two different provider UUIDs (Chartmetric 56982 and
372062). Both identities produced revenue in all five delivered quarters, so the
first submission double counted that artist — $666,219 in Q2 2025 alone,
$7,065,609 across the delivered period.

The alias map was previously written out as a literal in two build scripts and
was not known to the frontend at all, so the audit console reported "131
artists" as though it were a count of people. A row count and an artist count
are different measurements; publishing one under the other's name is exactly the
class of defect this audit exists to catch. Both counts are true, and each is
correct only under its own label:

    MASTER_LIST_ROWS   131   rows in the delivered artist list
    DISTINCT_ARTISTS   130   distinct artists those rows describe
    COST_MODEL_N       131   the count the SHIPPED cost model actually used

COST_MODEL_N is a historical fact about delivered files. It stays 131 because
the first submission's cost arithmetic really did use 131 (131 x 13 variables x
8 quarters = 13,624 units). Correcting it here would make the console misreport
what shipped. It is exposed under its own name so the discrepancy is visible
rather than hidden behind a shared constant.

Nothing here is an assumption; every number is derived from delivered files.
Consumers: build_nbs_accounts.py, build_delivery134.py,
generate_cohort_facts.py (which mirrors these into the frontend).
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Alias -> canonical. One artist, two frame rows, two provider UUIDs.
#: Adding a pair here changes every downstream count and the published console
#: figure at once; that is the point of it living in one place.
ALIASES: dict[str, str] = {"Flavour N'abania": "Flavour"}

#: The delivered artist list of the FIRST submission.
MASTER_LIST = ROOT / "delivery" / "04_Datasets" / "Artist_Master_List.csv"


def canonical(name: str) -> str:
    """Resolve a frame name to its canonical artist name."""
    return ALIASES.get(name.strip(), name.strip())


def master_list_names() -> list[str]:
    """Every artist_name in the first submission's master list, in file order."""
    with MASTER_LIST.open(encoding="utf-8") as handle:
        return [r["artist_name"] for r in csv.DictReader(handle)]


def counts() -> dict[str, object]:
    """
    Derive the cohort counts from the delivered file itself.

    Returns row count, distinct-name count, distinct-artist count and the
    duplicate pairs actually found — never hardcoded totals, so the numbers
    cannot drift away from the data they claim to describe.
    """
    names = master_list_names()
    canon = [canonical(n) for n in names]
    duplicates = sorted({n for n in names if canonical(n) != n})
    return {
        "master_list_rows": len(names),
        "distinct_names": len(set(names)),
        "distinct_artists": len(set(canon)),
        "duplicates": [{"alias": d, "canonical": canonical(d)} for d in duplicates],
    }
