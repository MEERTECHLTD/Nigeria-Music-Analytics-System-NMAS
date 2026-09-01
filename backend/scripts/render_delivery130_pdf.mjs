/**
 * DELIVERY130 — render every document to PDF.
 *
 * The submission goes to statisticians, not to people reading Markdown in a
 * text editor. pandoc converts Markdown to HTML (it handles the tables
 * correctly); Chromium paginates, numbers the pages and repeats table headers
 * across page breaks.
 *
 * The .md files are KEPT beside the PDFs: they are the generated source, and
 * removing them would leave the PDFs unreproducible.
 */
import { createRequire } from 'node:module';
// Playwright is a build-time dependency and is not vendored into the repo.
// PLAYWRIGHT_PATH points at whatever node_modules holds it.
const _req = createRequire(process.env.PLAYWRIGHT_PATH
  ? process.env.PLAYWRIGHT_PATH.replace(/\/?$/, '/package.json')
  : import.meta.url);
const { chromium } = _req('playwright');
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';

const PKG = process.argv[2];
if (!PKG) { console.error('usage: node render_delivery130_pdf.mjs <package-dir>'); process.exit(1); }

const TITLES = {
  'README.md': ['Delivery 130', 'Package overview'],
  'Executive_Summary.md': ['Executive Summary', 'Delivery 130'],
  'Methodology_and_Sources.md': ['Methodology and Sources', 'Delivery 130'],
  'NBS_Statistical_Handbook.md': ['Statistical Handbook', 'Every metric, every decision, and the reason for it'],
  'Quality_Check_Report.md': ['Quality Check Report', 'Delivery 130'],
  'Verification_Report.md': ['Verification Report', 'Independent recomputation and reconciliation'],
  'References_and_Proof.md': ['References and Proof', 'Sources and reproducibility'],
  'AI_Disclosure.md': ['AI Disclosure', 'How this submission was produced'],
  'NMAS_NBS_Delivery130_Presentation.md': ['Presentation Brief', 'Delivery 130'],
  'Projection_Method.md': ['Growth Projection', 'Model, fit and sensitivity'],
};

const CSS = `
  @page { size: A4; margin: 20mm 16mm 18mm 16mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Georgia,"Times New Roman",serif; font-size:10pt; line-height:1.5;
         color:#1a1a1a; margin:0; }
  h1 { font-size:17pt; color:#1F3864; border-bottom:2px solid #1F3864;
       padding-bottom:2mm; margin:0 0 5mm; line-height:1.25; break-after:avoid; }
  h2 { font-size:12.5pt; color:#1F3864; margin:8mm 0 2.5mm; break-after:avoid;
       border-bottom:.5px solid #c9d2e3; padding-bottom:1mm; }
  h3 { font-size:10.5pt; color:#2b4a7d; margin:5mm 0 2mm; break-after:avoid; }
  p { margin:0 0 2.6mm; orphans:2; widows:2; }
  strong { color:#10233f; }
  table { border-collapse:collapse; width:100%; margin:3mm 0 5mm; font-size:8.5pt; }
  thead { display:table-header-group; }
  tr { break-inside:avoid; }
  th { background:#1F3864; color:#fff; text-align:left; font-weight:bold;
       padding:1.7mm 2mm; border:.4px solid #1F3864; }
  td { padding:1.5mm 2mm; border:.4px solid #c8ccd4; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#f4f6fa; }
  td:nth-child(n+2) { font-variant-numeric:tabular-nums; }
  code { font-family:"SF Mono",Menlo,Consolas,monospace; font-size:8.4pt;
         background:#eef1f6; padding:.4mm 1mm; border-radius:1mm; }
  pre { background:#f4f6fa; border-left:2.5px solid #1F3864; padding:2.5mm 3mm;
        font-size:8.4pt; white-space:pre-wrap; overflow-wrap:anywhere; break-inside:avoid; }
  blockquote { margin:3mm 0; padding:2mm 4mm; border-left:2.5px solid #b08d3f;
               background:#fdf9f0; color:#443a24; break-inside:avoid; }
  blockquote p { margin:0 0 1.5mm; }
  hr { border:0; border-top:.5px solid #c8ccd4; margin:6mm 0; }
  ul,ol { margin:0 0 3mm; padding-left:6mm; }
  li { margin-bottom:1.2mm; }
  .cover { break-after:page; padding-top:52mm; text-align:center; }
  .cover .org { font-size:10pt; letter-spacing:2.6pt; text-transform:uppercase;
                color:#6b6b6b; margin-bottom:12mm; }
  .cover .title { font-size:27pt; color:#1F3864; line-height:1.2; margin-bottom:5mm; }
  .cover .sub { font-size:12.5pt; color:#444; font-style:italic; margin-bottom:20mm; }
  .cover .rule { width:42mm; height:2.5px; background:#b08d3f; margin:0 auto 20mm; }
  .cover .meta { font-size:9.5pt; color:#555; line-height:1.9; }
  .cover .meta strong { color:#1F3864; }
`;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const files = walk(PKG).sort();
const browser = await chromium.launch();
const page = await browser.newPage();
let ok = 0;

for (const md of files) {
  const name = basename(md);
  const [title, sub] = TITLES[name] || [name.replace(/\.md$/, '').replace(/_/g, ' '), 'Delivery 130'];
  let body;
  try {
    body = execFileSync('pandoc', [md, '-f', 'gfm', '-t', 'html5'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  } catch (e) { console.log(`  FAILED (pandoc) ${name}: ${e.message}`); continue; }

  const cover = `<div class="cover"><div class="org">National Bureau of Statistics</div>
    <div class="title">${title}</div><div class="sub">${sub}</div><div class="rule"></div>
    <div class="meta"><strong>Nigeria Music Analytics System</strong><br>
    Delivery 130 &nbsp;&middot;&nbsp; 129 artists &nbsp;&middot;&nbsp; Q1 2019 &ndash; Q3 2026<br>
    ${stamp}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>${CSS}</style></head><body>${cover}${body}</body></html>`;
  const tmp = join(dirname(md), `.${name}.render.html`);
  writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  const pdf = md.replace(/\.md$/, '.pdf');
  await page.pdf({
    path: pdf, format: 'A4', printBackground: true,
    margin: { top: '20mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-family:Georgia,serif;font-size:8pt;color:#7a7a7a;
      padding:0 16mm;"><span class="pageNumber" style="visibility:hidden"></span>
      <div style="text-align:center;">${title} &nbsp;&middot;&nbsp; Delivery 130</div></div>`,
    footerTemplate: `<div style="width:100%;font-family:Georgia,serif;font-size:8pt;color:#7a7a7a;
      padding:0 16mm;text-align:center;">Page <span class="pageNumber"></span> of
      <span class="totalPages"></span></div>`,
  });
  execFileSync('rm', ['-f', tmp]);
  ok++;
  console.log(`  ${relative(PKG, pdf).padEnd(48)} ${(statSync(pdf).size / 1024).toFixed(0).padStart(5)} KB`);
}
await browser.close();
console.log(`\nrendered ${ok} of ${files.length} documents to PDF`);
process.exit(ok === files.length ? 0 : 1);
