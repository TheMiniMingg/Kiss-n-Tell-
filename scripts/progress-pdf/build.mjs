// Builds the progress report PDF from docs/PROGRESS.md.
// Needs pandoc on PATH and Playwright's Chromium (require('playwright')).
// Usage: node scripts/progress-pdf/build.mjs [output.pdf]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(process.argv[2] ?? join(root, "docs/progress-report.pdf"));

const body = execFileSync("pandoc", ["-f", "gfm", "-t", "html5", join(root, "docs/PROGRESS.md")], { encoding: "utf8" });
const css = readFileSync(join(here, "style.css"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Kiss N Tell progress</title><style>${css}</style></head><body>${body}</body></html>`;
const tmp = join(mkdtempSync(join(tmpdir(), "knt-progress-")), "progress.html");
writeFileSync(tmp, html);

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(require.resolve("playwright", { paths: [process.cwd(), "/usr/lib/node_modules", "/usr/local/lib/node_modules"] })); }
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + tmp);
await page.pdf({
  path: out, format: "A4", printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="font-size:7pt;color:#888;width:100%;padding:0 15mm;display:flex;justify-content:space-between;font-family:Arial"><span>Kiss N Tell progress report · generated from docs/PROGRESS.md</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
});
await browser.close();
console.log("Wrote " + out);
