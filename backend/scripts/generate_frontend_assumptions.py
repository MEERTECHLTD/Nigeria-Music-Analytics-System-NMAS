#!/usr/bin/env python3
"""
Generate the frontend's assumption constants from nmas/assumptions.py.

The UI must not carry its own copies of assumption values: D-11 (uplift 0.40 in
the pipeline vs 0.30 in the UI) stayed hidden precisely because the two layers
could disagree. This writes frontend/src/generated/assumptions.ts from the same
module the pipeline imports, so the UI cannot drift from the computation.

The generated file is COMMITTED (the Vercel build has no Python), and the
constants drift test in _audit/validation/ fails if the committed artifact does
not match nmas/assumptions.py, or if an assumption value appears as a literal in
non-exempt frontend source.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from nmas.assumptions import REGISTER  # noqa: E402

OUT = BACKEND.parent / "frontend" / "src" / "generated" / "assumptions.ts"


def main() -> int:
    lines = [
        "// GENERATED FILE — do not edit. Source of truth: backend/nmas/assumptions.py",
        "// Regenerate with: backend/scripts/generate_frontend_assumptions.py",
        "// Generated %s" % datetime.now(timezone.utc).isoformat(),
        "//",
        "// Every value here is an ASSUMPTION, not a measurement. The UI imports these",
        "// so it can never disagree with what the pipeline actually computed (D-11).",
        "",
        "export interface AssumptionMeta {",
        "  value: number;",
        "  unit: string;",
        "  meaning: string;",
        "  source: string;",
        "  classification: 'EST' | 'ASM';",
        "  limitation: string;",
        "}",
        "",
    ]
    for a in REGISTER:
        lines.append("export const %s = %s;" % (a.name, a.value))
    lines.append("")
    lines.append("export const ASSUMPTIONS: Record<string, AssumptionMeta> = {")
    for a in REGISTER:
        lines.append("  %s: {" % a.name)
        lines.append("    value: %s," % a.value)
        for key, val in (("unit", a.unit), ("meaning", a.meaning), ("source", a.source),
                         ("classification", a.classification), ("limitation", a.limitation)):
            lines.append("    %s: %s," % (key, repr(val).replace("'", '"', 2) if False else __import__("json").dumps(val)))
        lines.append("  },")
    lines.append("};")
    lines.append("")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote %s (%d constants)" % (OUT, len(REGISTER)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
