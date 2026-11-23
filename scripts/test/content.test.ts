import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listTopicDirs, loadTopic } from "../lib/content.js";

const PRESETS = join(import.meta.dirname, "..", "..", "content", "presets");
let tmp: string;

function copyPreset(name = "space"): string {
  tmp = mkdtempSync(join(tmpdir(), "knt-"));
  const dir = join(tmp, name);
  cpSync(join(PRESETS, name), dir, { recursive: true });
  return dir;
}

const errors = (dir: string) => (loadTopic(dir)?.issues ?? []).filter((i) => i.level === "error").map((i) => i.message);

afterEach(() => tmp && rmSync(tmp, { recursive: true, force: true }));

describe("preset content", () => {
  it("every shipped preset is valid", () => {
    const dirs = listTopicDirs(PRESETS);
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    for (const d of dirs) expect(errors(d), d).toEqual([]);
  });

  it("flags a missing stage image", () => {
    const dir = copyPreset();
    unlinkSync(join(dir, "character", "05.svg"));
    expect(errors(dir).join()).toMatch(/Missing stage image 05/);
  });

  it("flags two images for one stage", () => {
    const dir = copyPreset();
    cpSync(join(dir, "character", "05.svg"), join(dir, "character", "05.png"));
    expect(errors(dir).join()).toMatch(/more than one image/);
  });

  it("flags a stage above 10 and unsupported file types", () => {
    const dir = copyPreset();
    cpSync(join(dir, "character", "05.svg"), join(dir, "character", "11.svg"));
    cpSync(join(dir, "character", "05.svg"), join(dir, "character", "06.gif"));
    const e = errors(dir).join();
    expect(e).toMatch(/stages go from 00 to 10/);
    expect(e).toMatch(/unsupported image type/);
  });

  it("flags a different aspect ratio", () => {
    const dir = copyPreset();
    const f = join(dir, "character", "03.svg");
    writeFileSync(f, readFileSync(f, "utf8").replace('width="768" height="1024"', 'width="1024" height="768"'));
    expect(errors(dir).join()).toMatch(/same aspect ratio/);
  });

  it("flags an underage character and a folder/id mismatch", () => {
    const dir = copyPreset();
    const cj = join(dir, "character", "character.json");
    writeFileSync(cj, JSON.stringify({ ...JSON.parse(readFileSync(cj, "utf8")), age: 17 }));
    const tj = join(dir, "topic.json");
    writeFileSync(tj, JSON.stringify({ ...JSON.parse(readFileSync(tj, "utf8")), id: "other" }));
    const e = errors(dir).join();
    expect(e).toMatch(/18 or older/);
    expect(e).toMatch(/must match the folder name/);
  });

  it("flags CSV problems with line numbers", () => {
    const dir = copyPreset();
    writeFileSync(join(dir, "questions.csv"), "question_id,prompt,answer,tier\nq1,Name one,apple,mythic\n");
    const issues = loadTopic(dir)!.issues;
    expect(issues.some((i) => i.where === "space/questions.csv:2" && /Unknown tier/.test(i.message))).toBe(true);
    expect(issues.some((i) => /at least 7 questions/.test(i.message))).toBe(true);
  });

  it("ignores folders starting with an underscore (drafts)", () => {
    copyPreset();
    cpSync(join(tmp, "space"), join(tmp, "_draft"), { recursive: true });
    expect(listTopicDirs(tmp).map((d) => d.split(/[\\/]/).pop())).toEqual(["space"]);
  });
});
