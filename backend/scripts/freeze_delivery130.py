#!/usr/bin/env python3
"""
DELIVERY130 — freeze the submission.

Independent verification raised, correctly, that no verification statement can
attach to the NAME "delivery130": the package is live build output and was
rebuilt several times while it was being audited. A verification result can only
attach to CONTENT.

This writes a SHA-256 manifest of every delivered file plus a single package
digest over that manifest, so the submitted artifact is identifiable by hash. Run
it LAST, after every generator, and re-run it if anything changes.
"""
from __future__ import annotations
import csv, hashlib, json, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PKG = ROOT / "delivery130"
MAN = PKG / "12_System_Exports" / "SHA256_MANIFEST.csv"
SEAL = PKG / "12_System_Exports" / "PACKAGE_SEAL.json"

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def main() -> int:
    files = sorted(p for p in PKG.rglob("*")
                   if p.is_file() and p.name not in ("SHA256_MANIFEST.csv", "PACKAGE_SEAL.json"))
    rows = []
    for p in files:
        rows.append({"path": str(p.relative_to(PKG)), "bytes": p.stat().st_size,
                     "sha256": sha256(p)})
    MAN.parent.mkdir(parents=True, exist_ok=True)
    with MAN.open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=["path", "bytes", "sha256"])
        w.writeheader(); w.writerows(rows)

    # one digest over the manifest identifies the whole package
    digest = hashlib.sha256(
        "\n".join("%s %s" % (r["sha256"], r["path"]) for r in rows).encode()).hexdigest()

    csv.field_size_limit(10 ** 9)
    T = "=== PERIOD TOTAL ==="
    rev = [r for r in csv.DictReader((PKG / "04_Datasets/Gross_Streaming_Revenue.csv")
                                     .open(encoding="utf-8")) if r["artist_name"] != T]
    total = sum(float(r["gross_streaming_revenue_usd"] or 0) for r in rev)
    q3 = sum(float(r["gross_streaming_revenue_usd"] or 0) for r in rev if r["period"] == "Q3_2026")

    SEAL.write_text(json.dumps({
        "package": "delivery130",
        "sealed_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "package_sha256": digest,
        "files": len(rows),
        "total_bytes": sum(r["bytes"] for r in rows),
        "artists": len({r["artist_name"] for r in rev}),
        "quarters": len({r["period"] for r in rev}),
        "revenue_rows": len(rev),
        "gross_streaming_revenue_usd_all_quarters": round(total, 2),
        "gross_streaming_revenue_usd_complete_quarters": round(total - q3, 2),
        "incomplete_quarter": {"period": "Q3_2026", "usd": round(q3, 2),
                               "observations_end": "2026-08-11",
                               "days_observed": 42, "days_in_quarter": 92},
        "note": ("Verification attaches to package_sha256, not to the folder name. "
                 "If any file changes, this seal is void and must be regenerated."),
    }, indent=2), encoding="utf-8")

    print("SEALED delivery130")
    print("  files            : %d (%.1f MB)" % (len(rows), sum(r["bytes"] for r in rows) / 1e6))
    print("  package sha256   : %s" % digest)
    print("  gross, all 31 q  : $%s" % format(total, ",.2f"))
    print("  gross, complete  : $%s  (30 quarters)" % format(total - q3, ",.2f"))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
