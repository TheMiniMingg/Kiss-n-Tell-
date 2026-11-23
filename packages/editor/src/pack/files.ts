import { STAGE_COUNT, isSafeRelativePath, questionsFromCsv, questionsToCsv, type Issue } from "@kiss-n-tell/engine";
import { emptyImages, isImageExt, stageName, type CharacterMeta, type PackDraft, type TopicMeta } from "./model.js";

/**
 * A pack on disk or in a ZIP uses the preset layout:
 *
 *   topic.json
 *   questions.csv
 *   character/character.json
 *   character/00.webp ... character/10.webp
 */
export const TOPIC_FILE = "topic.json";
export const QUESTIONS_FILE = "questions.csv";
export const CHARACTER_FILE = "character/character.json";
const STAGE_PATH = /^character\/(\d{2})\.([a-z0-9]+)$/;

export type PackFiles = Map<string, Uint8Array>;

/** True for the only paths a pack may contain. The Rust side enforces the same list. */
export function isPackPath(path: string): boolean {
  if (path === TOPIC_FILE || path === QUESTIONS_FILE || path === CHARACTER_FILE) return true;
  const m = STAGE_PATH.exec(path);
  return !!m && Number(m[1]) < STAGE_COUNT && isImageExt(m[2] as string);
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

function json(value: unknown): Uint8Array {
  return enc.encode(JSON.stringify(value, null, 2) + "\n");
}

/** Drop empty optional strings so saved JSON stays tidy. */
function tidy<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || (typeof v === "string" && v.trim() === "" && k !== "id" && k !== "name" && k !== "title")) continue;
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out as T;
}

export function packToFiles(pack: PackDraft): PackFiles {
  const files: PackFiles = new Map();
  files.set(TOPIC_FILE, json(tidy(pack.topic)));
  files.set(QUESTIONS_FILE, enc.encode(questionsToCsv(pack.questions)));
  files.set(CHARACTER_FILE, json(tidy(pack.character)));
  pack.images.forEach((img, stage) => {
    if (img) files.set(`character/${stageName(stage)}.${img.ext}`, img.bytes);
  });
  return files;
}

function parseJson<T>(bytes: Uint8Array | undefined, file: string, issues: Issue[]): T | null {
  if (!bytes) {
    issues.push({ level: "error", where: file, message: `Missing ${file}.` });
    return null;
  }
  try {
    const v = JSON.parse(dec.decode(bytes).replace(/^﻿/, "")) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("expected an object");
    return v as T;
  } catch (e) {
    issues.push({ level: "error", where: file, message: `${file} is not valid JSON (${(e as Error).message}).` });
    return null;
  }
}

/**
 * Build a pack from its files. Never throws: problems come back as issues and
 * the draft is filled with whatever could be read, so the author can fix it in
 * the editor.
 */
export function packFromFiles(files: PackFiles, fallbackId = "pack"): { pack: PackDraft; issues: Issue[] } {
  const issues: Issue[] = [];
  const topicRaw = parseJson<Partial<TopicMeta>>(files.get(TOPIC_FILE), TOPIC_FILE, issues) ?? {};
  const charRaw = parseJson<Partial<CharacterMeta>>(files.get(CHARACTER_FILE), CHARACTER_FILE, issues) ?? {};

  const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
  const topic: TopicMeta = { ...topicRaw, id: str(topicRaw.id) || fallbackId, title: str(topicRaw.title) };
  if (topicRaw.order !== undefined && typeof topicRaw.order !== "number") {
    issues.push({ level: "warning", where: TOPIC_FILE, message: `"order" should be a number; it was ignored.` });
    delete topic.order;
  }
  const age = typeof charRaw.age === "number" ? charRaw.age : Number(charRaw.age);
  const character: CharacterMeta = { ...charRaw, id: str(charRaw.id), name: str(charRaw.name), age: Number.isFinite(age) ? age : 0 };

  let questions: PackDraft["questions"] = [];
  const csv = files.get(QUESTIONS_FILE);
  if (!csv) issues.push({ level: "error", where: QUESTIONS_FILE, message: `Missing ${QUESTIONS_FILE}.` });
  else {
    const parsed = questionsFromCsv(dec.decode(csv).replace(/^﻿/, ""), QUESTIONS_FILE);
    questions = parsed.questions;
    issues.push(...parsed.issues);
  }

  const images = emptyImages();
  for (const [path, bytes] of files) {
    const m = STAGE_PATH.exec(path);
    if (!m) continue;
    const stage = Number(m[1]);
    const ext = m[2] as string;
    if (stage >= STAGE_COUNT || !isImageExt(ext)) continue;
    if (images[stage]) {
      issues.push({ level: "error", where: "character", message: `Stage ${stageName(stage)} has more than one image; kept the first.` });
      continue;
    }
    images[stage] = { ext, bytes };
  }
  for (const path of files.keys()) {
    if (!isPackPath(path)) issues.push({ level: "warning", where: path, message: `Ignored ${path}: not part of a pack.` });
  }
  return { pack: { topic, character, questions, images }, issues };
}

/**
 * Normalize ZIP entry names: forward slashes, no directory entries, and a
 * single shared top folder ("animals/topic.json") removed. Returns null for
 * an entry that would escape the pack (zip-slip) so the caller can refuse it.
 */
export function normalizeEntryNames(names: readonly string[]): { map: Map<string, string>; unsafe: string[] } {
  const unsafe: string[] = [];
  const clean: [string, string][] = [];
  for (const raw of names) {
    const name = raw.replace(/\\/g, "/");
    if (name.endsWith("/")) continue; // directory entry
    if (!isSafeRelativePath(name) || name.split("/").some((s) => s === ".")) {
      unsafe.push(raw);
      continue;
    }
    clean.push([raw, name]);
  }
  // Skip OS clutter before looking for a shared folder.
  const useful = clean.filter(([, n]) => !isClutter(n));
  const tops = new Set(useful.map(([, n]) => (n.includes("/") ? n.slice(0, n.indexOf("/")) : "")));
  const strip = tops.size === 1 && !tops.has("") && !useful.some(([, n]) => n.split("/").length === 1);
  const prefix = strip ? `${[...tops][0]}/` : "";
  const map = new Map<string, string>();
  for (const [raw, n] of clean) {
    if (isClutter(n)) continue;
    map.set(raw, prefix && n.startsWith(prefix) ? n.slice(prefix.length) : n);
  }
  return { map, unsafe };
}

function isClutter(name: string): boolean {
  const base = name.slice(name.lastIndexOf("/") + 1);
  return name.startsWith("__MACOSX/") || base === ".DS_Store" || base === "Thumbs.db" || base === "desktop.ini";
}
