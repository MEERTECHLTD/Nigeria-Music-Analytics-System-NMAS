#!/usr/bin/env python3
"""
PLAUSIBILITY SWEEP — pipeline stage producing the guard's rulings.

Runs BEFORE merge_final_delivery.py. Compares every (artist, metric) series the
two providers both hold, applies the two defect signatures in
nmas/plausibility.py, and writes a rulings file the merge consults. The merge
never decides plausibility itself; it applies rulings produced here, so the
decision is a rule that regenerates output rather than a hand edit.

Outputs
  backend/data/soundcharts/plausibility_rulings.csv     consumed by the merge
  NBS FINAL delivery/07_Quality_Checks/Plausibility_Rulings.csv   delivered copy
  _audit/registers/plausibility_triggers.csv            audit register, same rows

Ruling semantics
  category 2: provider_excluded names the defective side. The merge drops that
              provider's rows for that (artist, metric) series entirely — a
              defective ingestion is not trustworthy on any date.
  category 3: neither side proved defective. No exclusion; incumbent precedence
              stands; the series is carried as documented-unresolved.
  category 4: both defective. Both sides dropped; the series becomes UNK and the
              gap is registered, never filled.

Directional balance is printed on every run: if the rule starts excluding one
provider disproportionately beyond the characterised Deezer cluster, that is
visible immediately rather than discovered later.
"""

from __future__ import annotations

import csv
import glob
import statistics
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from nmas.plausibility import Thresholds, resolve, TRIGGER_RATIO  # noqa: E402

CM_OBS = ROOT / "delivery" / "04_Datasets" / "Daily_Metric_Observations.csv"
SHARDS = BACKEND / "data" / "soundcharts" / "shards"
OUT = BACKEND / "data" / "soundcharts" / "plausibility_rulings.csv"
DELIVERED = ROOT / "NBS FINAL delivery" / "07_Quality_Checks" / "Plausibility_Rulings.csv"
AUDIT = ROOT / "_audit" / "registers" / "plausibility_triggers.csv"

MIN_COMMON_DAYS = 10

FIELDS = ["artist", "metric", "days", "chartmetric_median", "soundcharts_median",
          "ratio_sc_over_cm", "floor_p5", "category", "provider_excluded", "reason"]


def main() -> int:
    cm: dict[tuple, dict] = defaultdict(dict)
    with CM_OBS.open(encoding="utf-8") as handle:
        for r in csv.DictReader(handle):
            cm[(r["entity_name"], r["variable_name"])][r["date"]] = float(r["variable_value"])
    sc: dict[tuple, dict] = defaultdict(dict)
    for path in glob.glob(str(SHARDS / "*.csv")):
        with open(path, encoding="utf-8") as handle:
            for r in csv.DictReader(handle):
                key = (r["entity_name"], r["variable_name"])
                if key in cm:
                    sc[key][r["date"]] = float(r["variable_value"])

    population: dict[str, list] = defaultdict(list)
    profile: dict[str, dict] = {"cm": defaultdict(dict), "sc": defaultdict(dict)}
    for side, store in (("cm", cm), ("sc", sc)):
        for (artist, metric), days in store.items():
            median = statistics.median(days.values())
            profile[side][artist][metric] = median
            if median > 0:
                population[metric].append(median)
    thresholds = Thresholds.from_population(population)

    rows = []
    comparable = 0
    for key in cm:
        if key not in sc:
            continue
        days = set(cm[key]) & set(sc[key])
        ratios = [sc[key][d] / cm[key][d] for d in days if cm[key][d] > 0 and sc[key][d] > 0]
        if len(ratios) < MIN_COMMON_DAYS:
            continue
        comparable += 1
        median_ratio = statistics.median(ratios)
        if not (median_ratio > TRIGGER_RATIO or median_ratio < 1 / TRIGGER_RATIO):
            continue
        artist, metric = key
        category, excluded, reason = resolve(
            metric, profile["cm"][artist], profile["sc"][artist], thresholds)
        rows.append({
            "artist": artist, "metric": metric, "days": len(days),
            "chartmetric_median": round(statistics.median([cm[key][d] for d in days]), 2),
            "soundcharts_median": round(statistics.median([sc[key][d] for d in days]), 2),
            "ratio_sc_over_cm": round(median_ratio, 4),
            "floor_p5": round(thresholds.floor.get(metric, 0), 2),
            "category": category, "provider_excluded": excluded, "reason": reason,
        })
    rows.sort(key=lambda r: (r["category"], -abs(r["ratio_sc_over_cm"])))

    for target in (OUT, DELIVERED, AUDIT):
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    categories = defaultdict(int)
    excluded = defaultdict(int)
    for r in rows:
        categories[r["category"]] += 1
        if r["category"] == "2":
            excluded[r["provider_excluded"]] += 1
    print("comparable series: %d   triggers: %d" % (comparable, len(rows)))
    for c in sorted(categories):
        print("  category %s: %d" % (c, categories[c]))
    print("directional balance (category 2): %s" % dict(excluded))
    print("rulings written to %s" % OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
