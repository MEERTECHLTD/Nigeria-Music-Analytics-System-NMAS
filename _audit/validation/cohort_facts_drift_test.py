#!/usr/bin/env python3
"""
COHORT FACTS DRIFT TEST.

Fails (exit 1) if:
  A. frontend/src/generated/cohortFacts.ts disagrees with the counts derived
     from the delivered files by nmas.cohort, or
  B. the alias map is redeclared as a literal anywhere outside nmas/cohort.py
     (it used to be copy-pasted into two build scripts and was unknown to the
     frontend, which is how "131 rows" came to be published as "131 artists"), or
  C. a console panel asserts a bare artist HEADCOUNT of 131. 131 is the row
     count of the master list; the artist count is 130. Saying "131 rows" or
     "131 artist rows" is correct and permitted; saying "131 artists" is not.

Historical facts are deliberately NOT policed: the shipped cost model really did
bill 131, and 131 x 13 x 8 = 13,624 units really was the run's decomposition.
Those must keep saying 131, which is why this test targets the word "artists"
rather than the number.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from nmas.cohort import ALIASES, counts  # noqa: E402

failures = []
c = counts()

# ---- A. generated artifact matches the derived truth ----------------------
gen_path = ROOT / "frontend/src/generated/cohortFacts.ts"
if not gen_path.exists():
    failures.append("A: cohortFacts.ts missing — run backend/scripts/generate_cohort_facts.py")
else:
    gen = gen_path.read_text(encoding="utf-8")
    expected = {
        "MASTER_LIST_ROWS": c["master_list_rows"],
        "DISTINCT_ARTISTS": c["distinct_artists"],
        "COST_MODEL_N": c["master_list_rows"],
    }
    for name, want in expected.items():
        m = re.search(r"export const %s = (\d+);" % name, gen)
        if not m:
            failures.append("A: %s missing from cohortFacts.ts" % name)
        elif int(m.group(1)) != want:
            failures.append("A: %s drifted — artifact %s vs derived %s"
                            % (name, m.group(1), want))
    for pair in c["duplicates"]:
        if pair["alias"] not in gen:
            failures.append("A: duplicate %r absent from cohortFacts.ts" % pair["alias"])

# ---- B. the alias map has exactly one definition --------------------------
alias_literal = re.compile(r"ALIASES\s*[:=]\s*\{")
for path in sorted((ROOT / "backend").rglob("*.py")):
    if path.name == "cohort.py" or ".venv" in path.parts:
        continue
    if alias_literal.search(path.read_text(encoding="utf-8")):
        failures.append("B: %s redeclares ALIASES — import it from nmas.cohort"
                        % path.relative_to(ROOT))

# ---- C. no bare artist headcount of 131 in the console --------------------
# Permitted: "131 rows", "131 artist rows", "131/131 rows", "131 master-list rows".
# Rejected:  "131 artists", "131-artist roster", "the 131 artists".
headcount = re.compile(r"131[\s -]*artists\b|131-artist\b")
src = ROOT / "frontend/src"
for path in sorted(src.rglob("*.ts")) + sorted(src.rglob("*.tsx")):
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if "artist rows" in line or "roster rows" in line or "master-list rows" in line:
            continue
        if headcount.search(line):
            failures.append("C: %s:%d publishes a 131 artist HEADCOUNT — the count is %d"
                            % (path.relative_to(ROOT), i, c["distinct_artists"]))

# ---- D. no INTERPOLATED headcount, e.g. "{stats.universe} artists" -------
# Arm C only sees the literal 131. The first pass of this fix missed two live
# claims that read "{stats.universe} artists" in JSX and rendered as "131
# artists" in the browser, so the rendered string is policed here too: a roster
# ROW count must never be immediately labelled "artists".
interpolated = re.compile(
    r"(?:stats\.universe|ARTIST_UNIVERSE|MASTER_LIST_ROWS|COST_MODEL_N)\}"
    r"(?:</[A-Za-z][^>]*>|\{'\s*'\}|[\s.,—-])*artists\b")
for path in sorted(src.rglob("*.tsx")):
    text = path.read_text(encoding="utf-8")
    for m in interpolated.finditer(text):
        line = text[:m.start()].count("\n") + 1
        failures.append("D: %s:%d interpolates a ROW count labelled \"artists\" — "
                        "render it as rows, or use DISTINCT_ARTISTS"
                        % (path.relative_to(ROOT), line))

if failures:
    print("COHORT FACTS DRIFT TEST: FAIL")
    for f in failures:
        print("  " + f)
    raise SystemExit(1)

print("COHORT FACTS DRIFT TEST: PASS — %d rows / %d distinct artists / %d duplicate(s); "
      "alias map single-sourced; no headcount misstatements"
      % (c["master_list_rows"], c["distinct_artists"], len(ALIASES)))
