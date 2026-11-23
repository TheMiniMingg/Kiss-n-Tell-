/**
 * Validates every preset in content/presets and writes the web build's
 * content to apps/web/public/content:
 *
 *   manifest.json          all topics, questions and stage image URLs
 *   <topic-id>/NN.<ext>     stage images
 *
 * Usage:
 *   pnpm content:build      validate + write (fails on errors)
 *   pnpm content:check      validate only
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "@kiss-n-tell/engine";
import { listTopicDirs, loadTopic, stageExt, type LoadedTopic } from "./lib/content.js";

const ROOT = join(import.meta.dirname, "..");
const PRESETS = join(ROOT, "content", "presets");
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
  topics: loaded.map((t) => {
    const outDir = join(OUT, t.meta.id);
    mkdirSync(outDir, { recursive: true });
    const stages = t.stageFiles.map((f) => {
      const name = `${String(f.stage).padStart(2, "0")}${stageExt(f)}`;
      copyFileSync(f.absPath, join(outDir, name));
      return `content/${t.meta.id}/${name}?v=${f.hash}`;
    });
    const first = t.stageFiles[0];
    return {
      ...t.topic,
      sample: t.meta.sample ?? false,
      character: { ...t.topic.character, stages, width: first?.width, height: first?.height },
    };
  }),
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log(`Wrote ${join("apps", "web", "public", "content")}`);
