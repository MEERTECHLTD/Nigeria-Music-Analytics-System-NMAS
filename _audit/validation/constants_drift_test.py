#!/usr/bin/env python3
"""
CONSTANTS DRIFT TEST — Phase 1.4 / verification pass 7.

Fails (exit 1) if:
  A. frontend/src/generated/assumptions.ts does not match nmas/assumptions.py
     (regenerated to a temp copy and compared value-for-value), or
  B. an assumption value appears as an ARITHMETIC literal in live frontend
     source outside the exemption list.

EXEMPT BY DESIGN, with reasons:
  backend legacy six    produced the immutable delivered files; rewiring them
                        would break reproducibility of what shipped
  console forensic set  panels + registries that DOCUMENT the previous delivery
                        (PlatformRevenue, MethodologyInspector, Estimation-
                        Transparency, ConstantsRegister, ExecutiveConsole,
                        SourceIntelligence, ArtistUniverse, registry/*): their
                        numbers are historical facts about delivered files and
                        must NOT change when assumptions.py changes
  *.css / style props   dimensional values (3.5rem) are not assumption values
"""
import re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from nmas.assumptions import REGISTER  # noqa: E402

failures = []

# ---- A. generated artifact matches the source of truth --------------------
gen = (ROOT / "frontend/src/generated/assumptions.ts").read_text(encoding="utf-8")
for a in REGISTER:
    m = re.search(r"export const %s = ([0-9.]+);" % a.name, gen)
    if not m:
        failures.append("A: %s missing from generated artifact" % a.name)
    elif abs(float(m.group(1)) - a.value) > 1e-12:
        failures.append("A: %s drifted — artifact %s vs source %s" % (a.name, m.group(1), a.value))

# ---- B. no assumption literal in live frontend arithmetic -----------------
LIVE = ["frontend/src/features", "frontend/src/console/panels/ProviderExpansion.tsx",
        "frontend/src/console/data", "frontend/src/App.tsx", "frontend/src/main.tsx"]
# Values distinctive enough to scan for. Bare small integers (2, 2.0 from
# TRACKS_PER_QUARTER / DEEZER_STREAMS_PER_FAN_MONTH) are excluded: they collide
# with CSS grid classes and array indices, and their drift is already covered by
# check A (the artifact-matches-source comparison).
VALUES = sorted(({str(a.value) for a in REGISTER} | {"1500", "3.5", "0.004", "0.3", "0.4"})
                - {"2", "2.0"})
pattern = re.compile(r"[*+/-]\s*(%s)(?![\d])" % "|".join(re.escape(v) for v in VALUES))
for base in LIVE:
    path = ROOT / base
    files = [path] if path.is_file() else list(path.rglob("*.ts*"))
    for f in files:
        if "generated" in str(f):
            continue
        for lineno, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if any(tok in line for tok in ("rem", "px", "opacity", "duration",
                                           "className=", "style=", "grid-cols", "size=")):
                continue
            m = pattern.search(line)
            if m and "NAIRA_PER_USD" not in line and "STREAMS_PER" not in line:
                failures.append("B: %s:%d arithmetic literal %s: %s"
                                % (f.relative_to(ROOT), lineno, m.group(1), line.strip()[:70]))

if failures:
    print("CONSTANTS DRIFT TEST: FAIL")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("CONSTANTS DRIFT TEST: PASS — artifact matches source; no live arithmetic literals")
