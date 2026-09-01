#!/usr/bin/env python3
"""
DELIVERY130 — render every document to PDF.

The submission goes to statisticians, not to people reading Markdown in a text
editor. Every .md in the package is rendered to a paginated PDF with the same
typography, a title page, running headers, page numbers and table headers that
repeat across page breaks.

pandoc converts Markdown to HTML (it handles the tables correctly); WeasyPrint
paginates. The .md files are KEPT beside the PDFs: they are the generated
source, and deleting them would leave the PDFs unreproducible.
"""
from __future__ import annotations
import subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]; ROOT = BACKEND.parent
PKG = ROOT / "delivery130"

TITLES = {
    "README.md": ("Delivery 130", "Package overview"),
    "Executive_Summary.md": ("Executive Summary", "Delivery 130"),
    "Methodology_and_Sources.md": ("Methodology and Sources", "Delivery 130"),
    "NBS_Statistical_Handbook.md": ("Statistical Handbook", "Every metric, every decision, and the reason for it"),
    "Quality_Check_Report.md": ("Quality Check Report", "Delivery 130"),
    "Verification_Report.md": ("Verification Report", "Independent recomputation and reconciliation"),
    "References_and_Proof.md": ("References and Proof", "Sources and reproducibility"),
    "AI_Disclosure.md": ("AI Disclosure", "How this submission was produced"),
    "NMAS_NBS_Delivery130_Presentation.md": ("Presentation Brief", "Delivery 130"),
    "Projection_Method.md": ("Growth Projection", "Model, fit and sensitivity"),
}

CSS = """
@page {
  size: A4; margin: 20mm 18mm 18mm 18mm;
  @top-center { content: string(doctitle); font-family: Georgia, serif;
                font-size: 8.5pt; color: #6b6b6b; padding-bottom: 3mm; }
  @bottom-center { content: counter(page) " of " counter(pages);
                   font-family: Georgia, serif; font-size: 8.5pt; color: #6b6b6b; }
}
@page :first { @top-center { content: ""; } @bottom-center { content: ""; } }
body { font-family: Georgia, "Times New Roman", serif; font-size: 10pt;
       line-height: 1.5; color: #1a1a1a; }
h1 { string-set: doctitle content(); font-size: 17pt; color: #1F3864;
     border-bottom: 2pt solid #1F3864; padding-bottom: 2mm; margin: 0 0 5mm;
     line-height: 1.25; }
h2 { font-size: 12.5pt; color: #1F3864; margin: 8mm 0 2.5mm;
     break-after: avoid; border-bottom: 0.5pt solid #c9d2e3; padding-bottom: 1mm; }
h3 { font-size: 10.5pt; color: #2b4a7d; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.6mm; orphans: 2; widows: 2; }
strong { color: #10233f; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0 5mm;
        font-size: 8.6pt; break-inside: auto; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #1F3864; color: #fff; text-align: left; font-weight: bold;
     padding: 1.7mm 2mm; border: 0.4pt solid #1F3864; }
td { padding: 1.5mm 2mm; border: 0.4pt solid #c8ccd4; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f4f6fa; }
td:nth-child(n+2) { font-variant-numeric: tabular-nums; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.4pt;
       background: #eef1f6; padding: 0.4mm 1mm; border-radius: 1mm; }
pre { background: #f4f6fa; border-left: 2.5pt solid #1F3864; padding: 2.5mm 3mm;
      font-size: 8.4pt; overflow-wrap: anywhere; white-space: pre-wrap;
      break-inside: avoid; }
blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 2.5pt solid #b08d3f;
             background: #fdf9f0; color: #443a24; break-inside: avoid; }
blockquote p { margin: 0 0 1.5mm; }
hr { border: 0; border-top: 0.5pt solid #c8ccd4; margin: 6mm 0; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
.cover { break-after: page; padding-top: 55mm; text-align: center; }
.cover .org { font-size: 10pt; letter-spacing: 2.6pt; text-transform: uppercase;
              color: #6b6b6b; margin-bottom: 12mm; }
.cover .title { font-size: 27pt; color: #1F3864; line-height: 1.2;
                margin-bottom: 5mm; }
.cover .sub { font-size: 12.5pt; color: #444; font-style: italic; margin-bottom: 22mm; }
.cover .rule { width: 42mm; height: 2.5pt; background: #b08d3f; margin: 0 auto 22mm; }
.cover .meta { font-size: 9.5pt; color: #555; line-height: 1.8; }
.cover .meta strong { color: #1F3864; }
"""


def cover(title, sub, stamp):
    return ('<div class="cover"><div class="org">National Bureau of Statistics</div>'
            '<div class="title">%s</div><div class="sub">%s</div>'
            '<div class="rule"></div><div class="meta">'
            '<strong>Nigeria Music Analytics System</strong><br>'
            'Delivery 130 &nbsp;&middot;&nbsp; 129 artists &nbsp;&middot;&nbsp; '
            'Q1 2019 &ndash; Q3 2026<br>%s</div></div>' % (title, sub, stamp))


def main() -> int:
    try:
        from weasyprint import HTML, CSS as WCSS
    except ImportError:
        print("WeasyPrint not importable from this interpreter"); return 1

    stamp = datetime.now(timezone.utc).strftime("%d %B %Y")
    mds = sorted(PKG.rglob("*.md"))
    if not mds:
        print("no markdown found"); return 1

    ok = 0
    for md in mds:
        title, sub = TITLES.get(md.name, (md.stem.replace("_", " "), "Delivery 130"))
        try:
            body = subprocess.run(
                ["pandoc", str(md), "-f", "gfm", "-t", "html5"],
                capture_output=True, text=True, check=True).stdout
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            print("  FAILED (pandoc) %s: %s" % (md.name, e)); continue

        html = ("<!doctype html><html><head><meta charset='utf-8'><title>%s</title>"
                "</head><body>%s%s</body></html>" % (title, cover(title, sub, stamp), body))
        pdf = md.with_suffix(".pdf")
        try:
            HTML(string=html, base_url=str(md.parent)).write_pdf(
                str(pdf), stylesheets=[WCSS(string=CSS)])
        except Exception as e:                                    # noqa: BLE001
            print("  FAILED (weasyprint) %s: %s" % (md.name, e)); continue
        ok += 1
        print("  %-46s %6.0f KB" % (str(pdf.relative_to(PKG)), pdf.stat().st_size / 1024))

    print("\nrendered %d of %d documents to PDF" % (ok, len(mds)))
    return 0 if ok == len(mds) else 1


if __name__ == "__main__":
    raise SystemExit(main())
