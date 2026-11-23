/**
 * Writes placeholder stage images (00.svg ... 10.svg) for every preset
 * character that has a `placeholder_color` in character.json and no real art.
 * Run: pnpm content:placeholders
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PRESETS = join(import.meta.dirname, "..", "content", "presets");
const W = 768;
const H = 1024;

function svg(stage: number, name: string, color: string): string {
  const pct = stage / 10;
  const final = stage === 10;
  // Ring showing progress toward the ending.
  const r = 300;
  const circ = 2 * Math.PI * r;
  const dash = (circ * pct).toFixed(1);
  const sparkles = final
    ? Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const x = (W / 2 + Math.cos(a) * 340).toFixed(0);
        const y = (H / 2 - 40 + Math.sin(a) * 340).toFixed(0);
        return `<circle cx="${x}" cy="${y}" r="${i % 2 ? 6 : 10}" fill="#fff" opacity="0.85"/>`;
      }).join("")
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="${(0.35 + pct * 0.5).toFixed(2)}"/>
      <stop offset="1" stop-color="#120a16"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#120a16"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W / 2}" cy="${H / 2 - 40}" r="${r}" fill="none" stroke="#ffffff22" stroke-width="18"/>
  <circle cx="${W / 2}" cy="${H / 2 - 40}" r="${r}" fill="none" stroke="#fff" stroke-width="18"
    stroke-dasharray="${dash} ${circ.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${W / 2} ${H / 2 - 40})"/>
  ${sparkles}
  <g fill="#ffffffd0">
    <circle cx="${W / 2}" cy="${H / 2 - 190}" r="70"/>
    <path d="M ${W / 2 - 150} ${H / 2 + 190} Q ${W / 2 - 140} ${H / 2 - 90} ${W / 2} ${H / 2 - 100} Q ${W / 2 + 140} ${H / 2 - 90} ${W / 2 + 150} ${H / 2 + 190} Z"/>
  </g>
  <text x="${W / 2}" y="${H / 2 + 70}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="150" font-weight="800" fill="${color}">${String(stage).padStart(2, "0")}</text>
  <text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="44" font-weight="700" fill="#fff">${escape(name)}</text>
  <text x="${W / 2}" y="${H - 95}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" fill="#ffffffb0">${final ? "Ending image (placeholder)" : `Stage ${stage} of 10 (placeholder)`}</text>
</svg>
`;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

let written = 0;
for (const topic of readdirSync(PRESETS)) {
  const dir = join(PRESETS, topic, "character");
  const metaPath = join(dir, "character.json");
  if (!existsSync(metaPath)) continue;
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { name: string; placeholder_color?: string };
  if (!meta.placeholder_color) continue;
  const hasRealArt = readdirSync(dir).some((f) => /^\d\d\.(webp|png|jpe?g)$/i.test(f));
  if (hasRealArt) {
    console.log(`skip ${topic}: real art present`);
    continue;
  }
  for (let s = 0; s <= 10; s++) {
    writeFileSync(join(dir, `${String(s).padStart(2, "0")}.svg`), svg(s, meta.name, meta.placeholder_color));
    written++;
  }
}
console.log(`Wrote ${written} placeholder images.`);
