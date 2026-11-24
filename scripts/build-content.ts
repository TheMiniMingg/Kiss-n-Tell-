/**
 * Validates every preset in content/presets and writes the web build's
 * content to apps/web/public/content:
 *
 *   manifest.json          site settings (content/site.json), all topics, questions and stage image URLs
 *   <topic-id>/NN.<ext>     stage images
 *   <topic-id>/<hash>.<ext> the optional secret image (named by content hash, so the URL isn't guessable from the stage names)
 *
 * Usage:
 *   pnpm content:build      validate + write (fails on errors)
 *   pnpm content:check      validate only
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseSiteConfig, type Issue } from "@kiss-n-tell/engine";
import { listTopicDirs, loadTopic, stageExt, type LoadedTopic } from "./lib/content.js";

const ROOT = join(import.meta.dirname, "..");
const PRESETS = join(ROOT, "content", "presets");
const SITE = join(ROOT, "content", "site.json");
const OUT = join(ROOT, "apps", "web", "public", "content");
const checkOnly = process.argv.includes("--check");
const quiet = process.argv.includes("--quiet");

const loaded = listTopicDirs(PRESETS)
  .map(loadTopic)
  .filter((t): t is LoadedTopic => t !== null)
  .sort((a, b) => (a.meta.order ?? 999) - (b.meta.order ?? 999) || a.meta.id.localeCompare(b.meta.id));

const issues: Issue[] = loaded.flatMap((t) => t.issues);
const ids = new Set<string>();
for (const t of loaded) {
  if (ids.has(t.meta.id)) issues.push({ level: "error", where: `topic ${t.meta.id}`, message: "Duplicate topic id." });
  ids.add(t.meta.id);
}
let siteRaw: unknown = undefined;
if (existsSync(SITE)) {
  try {
    siteRaw = JSON.parse(readFileSync(SITE, "utf8"));
  } catch (e) {
    issues.push({ level: "error", where: "content/site.json", message: `Not valid JSON: ${(e as Error).message}` });
  }
}
const site = parseSiteConfig(siteRaw);
issues.push(...site.issues);
if (loaded.length === 0) issues.push({ level: "error", where: "content/presets", message: "No topics found." });

const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");
if (!quiet || errors.length) {
  for (const i of [...errors, ...warnings]) {
    console.log(`${i.level === "error" ? "ERROR" : "warn "}  ${i.where}: ${i.message}`);
  }
}
const summary = loaded.map((t) => `${t.meta.id} (${t.topic?.questions.length ?? 0} questions)`).join(", ");
console.log(`\n${loaded.length} topic(s): ${summary}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);

if (errors.length) process.exit(1);
if (checkOnly) process.exit(0);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = {
  schemaVersion: 1,
  site: site.config,
  topics: loaded.map((t) => {
    const outDir = join(OUT, t.meta.id);
    mkdirSync(outDir, { recursive: true });
    const stages = t.stageFiles.map((f) => {
      const name = `${String(f.stage).padStart(2, "0")}${stageExt(f)}`;
      copyFileSync(f.absPath, join(outDir, name));
      return `content/${t.meta.id}/${name}?v=${f.hash}`;
    });
    const first = t.stageFiles[0];
    let secret: string | undefined;
    if (t.secretFile) {
      const name = `${t.secretFile.hash}${extname(t.secretFile.file).toLowerCase()}`;
      copyFileSync(t.secretFile.absPath, join(outDir, name));
      secret = `content/${t.meta.id}/${name}`;
    }
    const { secret: _src, ...character } = t.topic.character;
    return {
      ...t.topic,
      sample: t.meta.sample ?? false,
      character: { ...character, stages, ...(secret ? { secret } : {}), width: first?.width, height: first?.height },
    };
  }),
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log(`Wrote ${join("apps", "web", "public", "content")}`);
