import { unzipSync, zipSync, type Zippable } from "fflate";
import type { Issue } from "@kiss-n-tell/engine";
import { isPackPath, normalizeEntryNames, packFromFiles, packToFiles, type PackFiles } from "./files.js";
import type { PackDraft } from "./model.js";

export const ZIP_LIMITS = {
  /** Largest ZIP file accepted. */
  maxZipBytes: 150 * 1024 * 1024,
  /** Most entries a pack ZIP may list (a pack has 14 files, 15 with a secret image). */
  maxEntries: 100,
  /** Per stage image, same as the preset build. */
  maxImageBytes: 8 * 1024 * 1024,
  /** Per JSON or CSV file. */
  maxTextBytes: 5 * 1024 * 1024,
  /** All files together, uncompressed. */
  maxTotalBytes: 100 * 1024 * 1024,
} as const;

export class PackZipError extends Error {
  override name = "PackZipError";
}

const MB = (n: number) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;

/**
 * Read a pack ZIP safely:
 * - entries that would land outside the pack (absolute paths, "..") reject the whole file;
 * - only the pack's own files are extracted, everything else is ignored with a warning;
 * - sizes are checked from the ZIP directory before anything is inflated, and each
 *   file is inflated into a buffer of exactly its declared size, so a lying header
 *   cannot make it grow (zip bomb).
 */
export function readPackZip(bytes: Uint8Array): { files: PackFiles; issues: Issue[] } {
  if (bytes.length > ZIP_LIMITS.maxZipBytes) {
    throw new PackZipError(`The ZIP is ${MB(bytes.length)}; the limit is ${MB(ZIP_LIMITS.maxZipBytes)}.`);
  }
  const issues: Issue[] = [];
  const listed: { name: string; size: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        listed.push({ name: f.name, size: f.originalSize });
        if (listed.length > ZIP_LIMITS.maxEntries) {
          throw new PackZipError(`The ZIP has more than ${ZIP_LIMITS.maxEntries} files. A pack has 14 (15 with a secret image).`);
        }
        return false; // first pass: directory only
      },
    });
  } catch (e) {
    if (e instanceof PackZipError) throw e;
    throw new PackZipError(`This is not a readable ZIP file (${(e as Error).message}).`);
  }

  const { map, unsafe } = normalizeEntryNames(listed.map((f) => f.name));
  if (unsafe.length) {
    throw new PackZipError(`The ZIP contains unsafe paths (${unsafe.slice(0, 3).join(", ")}). Nothing was imported.`);
  }

  let total = 0;
  const wanted = new Set<string>();
  for (const { name, size } of listed) {
    const path = map.get(name);
    if (path === undefined) continue;
    if (!isPackPath(path)) {
      issues.push({ level: "warning", where: name, message: `Ignored ${name}: not part of a pack.` });
      continue;
    }
    const limit = path.endsWith(".json") || path.endsWith(".csv") ? ZIP_LIMITS.maxTextBytes : ZIP_LIMITS.maxImageBytes;
    if (size > limit) throw new PackZipError(`${path} is ${MB(size)}; the limit is ${MB(limit)}.`);
    total += size;
    if (total > ZIP_LIMITS.maxTotalBytes) throw new PackZipError(`The pack is larger than ${MB(ZIP_LIMITS.maxTotalBytes)} unzipped.`);
    if (wanted.has(name)) throw new PackZipError(`${name} appears twice in the ZIP.`);
    wanted.add(name);
  }

  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
  } catch (e) {
    throw new PackZipError(`The ZIP is damaged (${(e as Error).message}).`);
  }
  const files: PackFiles = new Map();
  for (const [name, data] of Object.entries(raw)) {
    const path = map.get(name) as string;
    if (files.has(path)) throw new PackZipError(`${path} appears twice in the ZIP.`);
    files.set(path, data);
  }
  return { files, issues };
}

export function importPackZip(bytes: Uint8Array, fallbackId?: string): { pack: PackDraft; issues: Issue[] } {
  const { files, issues } = readPackZip(bytes);
  if (files.size === 0) throw new PackZipError("No pack files found in the ZIP. It needs topic.json, questions.csv and a character folder.");
  const res = packFromFiles(files, fallbackId);
  return { pack: res.pack, issues: [...issues, ...res.issues] };
}

/**
 * Write a pack as a ZIP. Files go in a folder named after the topic id, so
 * unzipping it gives a folder that can be dropped into content/presets.
 * Images are stored as-is (already compressed); text is deflated.
 */
export function exportPackZip(pack: PackDraft): Uint8Array {
  const folder = pack.topic.id || "pack";
  const entries: Zippable = {};
  // Fixed timestamp keeps exports reproducible.
  const mtime = new Date("2020-01-01T00:00:00Z");
  for (const [path, data] of packToFiles(pack)) {
    const isText = path.endsWith(".json") || path.endsWith(".csv");
    entries[`${folder}/${path}`] = [data, { level: isText ? 6 : 0, mtime }];
  }
  return zipSync(entries);
}
