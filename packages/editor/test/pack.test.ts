import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  CHARACTER_FILE,
  QUESTIONS_FILE,
  TOPIC_FILE,
  ZIP_LIMITS,
  PackZipError,
  exportPackZip,
  importPackZip,
  isPackPath,
  newPack,
  newQuestion,
  normalizeEntryNames,
  packFromFiles,
  packToFiles,
  parseWordList,
  readPackZip,
  slugify,
  uniqueId,
  validatePack,
  type PackDraft,
  type PackFiles,
} from "../src/pack/index.js";

const PRESETS = join(import.meta.dirname, "..", "..", "..", "content", "presets");

function presetFiles(id: string): PackFiles {
  const dir = join(PRESETS, id);
  const files: PackFiles = new Map();
  files.set(TOPIC_FILE, readFileSync(join(dir, TOPIC_FILE)));
  files.set(QUESTIONS_FILE, readFileSync(join(dir, QUESTIONS_FILE)));
  for (const f of readdirSync(join(dir, "character"))) files.set(`character/${f}`, readFileSync(join(dir, "character", f)));
  return files;
}

function validPack(): PackDraft {
  const { pack } = packFromFiles(presetFiles("animals"));
  return pack;
}

describe("pack paths", () => {
  it("accepts only the preset layout", () => {
    for (const ok of ["topic.json", "questions.csv", "character/character.json", "character/00.webp", "character/10.svg", "character/05.jpeg", "character/secret.webp", "character/secret.svg"]) {
      expect(isPackPath(ok), ok).toBe(true);
    }
    for (const bad of ["character/11.png", "character/5.png", "character/00.gif", "../topic.json", "a/topic.json", "character/x.png", "notes.txt", "character/00.PNG", "character/secret.gif", "secret.png", "character/Secret.png", "character/secret-2.png"]) {
      expect(isPackPath(bad), bad).toBe(false);
    }
  });
});

describe("files round trip", () => {
  it("loads every preset without errors", () => {
    for (const id of readdirSync(PRESETS)) {
      const { pack, issues } = packFromFiles(presetFiles(id));
      expect(issues.filter((i) => i.level === "error"), id).toEqual([]);
      expect(pack.images.every(Boolean)).toBe(true);
      expect(validatePack(pack).filter((i) => i.level === "error"), id).toEqual([]);
    }
  });

  it("writes and reads back the same pack, keeping unknown keys", () => {
    const pack = validPack();
    pack.character.placeholder_color = "#123456";
    const again = packFromFiles(packToFiles(pack)).pack;
    expect(again.topic).toEqual(JSON.parse(JSON.stringify(pack.topic)));
    expect(again.character.placeholder_color).toBe("#123456");
    expect(again.questions).toEqual(pack.questions);
    expect(again.images.map((i) => i?.bytes.length)).toEqual(pack.images.map((i) => i?.bytes.length));
    expect(pack.secret).not.toBeNull();
    expect(again.secret?.ext).toBe(pack.secret?.ext);
    expect(again.secret?.bytes).toEqual(pack.secret?.bytes);
  });

  it("the secret image is optional and only written when present", () => {
    const pack = validPack();
    expect([...packToFiles(pack).keys()]).toContain("character/secret.svg");
    pack.secret = null;
    const files = packToFiles(pack);
    expect([...files.keys()].some((k) => k.includes("secret"))).toBe(false);
    const again = packFromFiles(files);
    expect(again.pack.secret).toBeNull();
    expect(validatePack(again.pack).filter((i) => i.level === "error")).toEqual([]);
  });

  it("keeps the first of two secret images", () => {
    const files = presetFiles("animals");
    files.set("character/secret.png", new Uint8Array([1, 2, 3]));
    const { pack, issues } = packFromFiles(files);
    expect(pack.secret).not.toBeNull();
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/More than one secret image/) }));
  });

  it("reports missing and broken files instead of throwing", () => {
    const files: PackFiles = new Map([[TOPIC_FILE, strToU8("{not json")]]);
    const { pack, issues } = packFromFiles(files, "fallback");
    expect(pack.topic.id).toBe("fallback");
    const text = issues.map((i) => i.message).join("\n");
    expect(text).toMatch(/topic.json is not valid JSON/);
    expect(text).toMatch(/Missing character\/character.json/);
    expect(text).toMatch(/Missing questions.csv/);
  });

  it("tolerates a UTF-8 BOM (files saved from Excel)", () => {
    const files = presetFiles("animals");
    const csv = files.get(QUESTIONS_FILE) as Uint8Array;
    files.set(QUESTIONS_FILE, new Uint8Array([0xef, 0xbb, 0xbf, ...csv]));
    const topic = files.get(TOPIC_FILE) as Uint8Array;
    files.set(TOPIC_FILE, new Uint8Array([0xef, 0xbb, 0xbf, ...topic]));
    const { issues } = packFromFiles(files);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("ZIP export and import", () => {
  it("round-trips a pack through a ZIP inside a topic folder", () => {
    const pack = validPack();
    const zip = exportPackZip(pack);
    const { files } = readPackZip(zip);
    expect([...files.keys()].sort()).toContain(TOPIC_FILE);
    const { pack: back, issues } = importPackZip(zip);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(back.questions).toEqual(pack.questions);
    expect(back.topic.id).toBe(pack.topic.id);
    expect(Array.from(back.secret?.bytes ?? [])).toEqual(Array.from(pack.secret?.bytes ?? []));
  });

  it("is reproducible", () => {
    const pack = validPack();
    expect(exportPackZip(pack)).toEqual(exportPackZip(pack));
  });

  it("accepts files at the ZIP root and ignores OS clutter", () => {
    const files = presetFiles("space");
    const entries: Record<string, Uint8Array> = { "__MACOSX/._topic.json": strToU8("x"), ".DS_Store": strToU8("x") };
    for (const [p, d] of files) entries[p] = d;
    const { pack, issues } = importPackZip(zipSync(entries));
    expect(pack.topic.id).toBe("space");
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("ignores stray files with a warning", () => {
    const entries: Record<string, Uint8Array> = { "pack/readme.txt": strToU8("hi") };
    for (const [p, d] of presetFiles("space")) entries[`pack/${p}`] = d;
    const { issues } = importPackZip(zipSync(entries));
    expect(issues).toContainEqual(expect.objectContaining({ level: "warning", message: expect.stringMatching(/readme.txt/) }));
  });

  it("refuses zip-slip paths", () => {
    for (const evil of ["../topic.json", "pack/../../evil.json", "/etc/topic.json", "C:/x/topic.json", "pack\\..\\..\\x"]) {
      const zip = zipSync({ [evil]: strToU8("{}"), "topic.json": strToU8("{}") });
      expect(() => readPackZip(zip), evil).toThrow(/unsafe paths/);
    }
  });

  it("refuses too many entries", () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i <= ZIP_LIMITS.maxEntries; i++) entries[`f${i}.txt`] = strToU8("x");
    expect(() => readPackZip(zipSync(entries))).toThrow(/more than/);
  });

  it("refuses oversized files before inflating them", () => {
    const big = new Uint8Array(ZIP_LIMITS.maxTextBytes + 1); // zeros compress to almost nothing
    const zip = zipSync({ "topic.json": big });
    expect(zip.length).toBeLessThan(100_000);
    expect(() => readPackZip(zip)).toThrow(/topic.json is .* the limit/);
  });

  it("cannot be inflated past the size its header declares (zip bomb)", () => {
    const real = new Uint8Array(4 * 1024 * 1024).fill(65);
    const zip = zipSync({ "questions.csv": [real, { level: 9 }] });
    // Patch the declared uncompressed size in the central directory to 10 bytes.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let cd = -1;
    for (let i = zip.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x02014b50) { cd = i; break; }
    expect(cd).toBeGreaterThan(0);
    view.setUint32(cd + 24, 10, true);
    const { files } = readPackZip(zip);
    expect(files.get("questions.csv")?.length).toBe(10);
  });

  it("refuses a huge ZIP and garbage", () => {
    expect(() => readPackZip(new Uint8Array(ZIP_LIMITS.maxZipBytes + 1))).toThrow(PackZipError);
    expect(() => readPackZip(strToU8("definitely not a zip file at all, no sir"))).toThrow(/not a readable ZIP/);
  });

  it("explains an empty ZIP", () => {
    expect(() => importPackZip(zipSync({ "notes.txt": strToU8("x") }))).toThrow(/No pack files/);
  });
});

describe("entry name normalization", () => {
  it("strips one shared top folder only", () => {
    expect([...normalizeEntryNames(["a/topic.json", "a/character/00.png"]).map.values()]).toEqual(["topic.json", "character/00.png"]);
    expect([...normalizeEntryNames(["topic.json", "character/00.png"]).map.values()]).toEqual(["topic.json", "character/00.png"]);
    expect([...normalizeEntryNames(["a/topic.json", "b/topic.json"]).map.values()]).toEqual(["a/topic.json", "b/topic.json"]);
    expect([...normalizeEntryNames(["a\\topic.json", "a/"]).map.values()]).toEqual(["topic.json"]);
  });
});

describe("validatePack", () => {
  it("reports missing images by stage", () => {
    const pack = validPack();
    pack.images[3] = null;
    pack.images[10] = null;
    const issues = validatePack(pack);
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", message: "Missing stage images 03, 10." }));
    expect(issues.some((i) => /Needs exactly 11/.test(i.message))).toBe(false);
  });

  it("checks image shape and size", () => {
    const pack = validPack();
    pack.images.forEach((img) => img && Object.assign(img, { width: 768, height: 1024 }));
    Object.assign(pack.images[1]!, { width: 384, height: 512 });
    Object.assign(pack.images[2]!, { width: 1024, height: 768 });
    pack.images[4] = { ext: "png", bytes: new Uint8Array(ZIP_LIMITS.maxImageBytes + 1) };
    const issues = validatePack(pack);
    expect(issues).toContainEqual(expect.objectContaining({ level: "warning", message: expect.stringMatching(/Stage 01 .*same shape/) }));
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/Stage 02 .*same shape/) }));
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/Stage 04 is 8.0 MB/) }));
  });

  it("checks the secret image's shape and size like a stage", () => {
    const pack = validPack();
    pack.images.forEach((img) => img && Object.assign(img, { width: 768, height: 1024 }));
    pack.secret = { ext: "png", bytes: new Uint8Array(10), width: 1024, height: 768 };
    expect(validatePack(pack)).toContainEqual(
      expect.objectContaining({ level: "error", message: expect.stringMatching(/The secret image is 1024x768 but stage 00 is 768x1024/) }),
    );
    pack.secret = { ext: "png", bytes: new Uint8Array(ZIP_LIMITS.maxImageBytes + 1) };
    expect(validatePack(pack)).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/secret image is 8.0 MB/) }));
  });

  it("flags id clashes and an underage character", () => {
    const pack = validPack();
    pack.character.age = 17;
    const issues = validatePack(pack, { otherPackIds: ["animals"], presetIds: ["animals"] });
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/Another of your packs/) }));
    expect(issues).toContainEqual(expect.objectContaining({ level: "warning", message: expect.stringMatching(/built-in topic id/) }));
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringMatching(/18 or older/) }));
  });

  it("a new empty pack explains what is missing", () => {
    const msgs = validatePack(newPack("", "")).map((i) => i.message);
    expect(msgs).toContain("Topic id is empty.");
    expect(msgs).toContain("Title is empty.");
    expect(msgs).toContain("No stage images yet (00-10).");
    expect(msgs.some((m) => /at least 7 questions/.test(m))).toBe(true);
  });
});

describe("helpers", () => {
  it("slugify", () => {
    expect(slugify("Ancient Greece!")).toBe("ancient-greece");
    expect(slugify("  Café   Crème ")).toBe("cafe-creme");
    expect(slugify("***")).toBe("");
    expect(slugify("a".repeat(100)).length).toBe(64);
  });
  it("uniqueId", () => {
    expect(uniqueId("x", [])).toBe("x");
    expect(uniqueId("x", ["x", "x-2"])).toBe("x-3");
  });
  it("newQuestion picks an unused id", () => {
    expect(newQuestion([]).id).toBe("q01");
    expect(newQuestion(["q01", "q02"]).id).toBe("q03");
    expect(newQuestion(["q02"]).id).toBe("q03");
  });
  it("parseWordList", () => {
    expect(parseWordList("Lion\nTiger, Puma;\t Ocelot\n\n")).toEqual(["Lion", "Tiger", "Puma", "Ocelot"]);
    expect(parseWordList("  ")).toEqual([]);
  });
});
