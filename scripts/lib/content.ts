import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { imageSize } from "image-size";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  STAGE_COUNT,
  questionsFromCsv,
  validateTopic,
  type Issue,
  type Topic,
} from "@kiss-n-tell/engine";

export interface TopicMeta {
  id: string;
  title: string;
  description?: string;
  order?: number;
  sample?: boolean;
}

export interface CharacterMeta {
  id: string;
  name: string;
  age: number;
  species?: string;
  description?: string;
  asset_rights?: string;
}

export interface StageFile {
  stage: number;
  file: string;
  absPath: string;
  hash: string;
  width?: number;
  height?: number;
}

export interface LoadedTopic {
  dir: string;
  meta: TopicMeta;
  topic: Topic;
  stageFiles: StageFile[];
  issues: Issue[];
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const STAGE_FILE = /^(\d{2})\.([a-z0-9]+)$/i;

function readJson<T>(path: string, issues: Issue[], where: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    issues.push({ level: "error", where, message: `Cannot read ${path}: ${(e as Error).message}` });
    return null;
  }
}

/** Load and validate one preset topic folder. */
export function loadTopic(dir: string): LoadedTopic | null {
  const folder = dir.split(/[\\/]/).pop() as string;
  const issues: Issue[] = [];
  const where = `topic ${folder}`;
  const meta = readJson<TopicMeta>(join(dir, "topic.json"), issues, where);
  const charDir = join(dir, "character");
  const charMeta = existsSync(join(charDir, "character.json"))
    ? readJson<CharacterMeta>(join(charDir, "character.json"), issues, `${where} / character`)
    : (issues.push({ level: "error", where, message: "Missing character/character.json." }), null);
  const csvPath = join(dir, "questions.csv");
  const { questions, issues: csvIssues } = existsSync(csvPath)
    ? questionsFromCsv(readFileSync(csvPath, "utf8"), `${folder}/questions.csv`)
    : { questions: [], issues: [{ level: "error" as const, where, message: "Missing questions.csv." }] };
  issues.push(...csvIssues);
  if (!meta || !charMeta) return { dir, meta: meta ?? { id: folder, title: folder }, topic: null as unknown as Topic, stageFiles: [], issues };

  if (meta.id !== folder) issues.push({ level: "error", where, message: `topic.json id "${meta.id}" must match the folder name "${folder}".` });

  // Stage images: exactly one file per stage 00..10.
  const stageFiles: StageFile[] = [];
  const byStage = new Map<number, string[]>();
  if (existsSync(charDir)) {
    for (const f of readdirSync(charDir)) {
      const m = STAGE_FILE.exec(f);
      if (!m) continue;
      const stage = Number(m[1]);
      const ext = (m[2] as string).toLowerCase();
      if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
        issues.push({ level: "error", where: `${where} / character`, message: `${f}: unsupported image type .${ext}. Use ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}.` });
        continue;
      }
      if (stage >= STAGE_COUNT) {
        issues.push({ level: "error", where: `${where} / character`, message: `${f}: stages go from 00 to 10.` });
        continue;
      }
      byStage.set(stage, [...(byStage.get(stage) ?? []), f]);
    }
  }
  for (let s = 0; s < STAGE_COUNT; s++) {
    const files = byStage.get(s) ?? [];
    const name = String(s).padStart(2, "0");
    if (files.length === 0) {
      issues.push({ level: "error", where: `${where} / character`, message: `Missing stage image ${name} (e.g. ${name}.webp).` });
      continue;
    }
    if (files.length > 1) {
      issues.push({ level: "error", where: `${where} / character`, message: `Stage ${name} has more than one image: ${files.join(", ")}.` });
      continue;
    }
    const file = files[0] as string;
    const absPath = join(charDir, file);
    const buf = readFileSync(absPath);
    if (buf.length > MAX_IMAGE_BYTES) {
      issues.push({ level: "error", where: `${where} / character`, message: `${file} is ${(buf.length / 1048576).toFixed(1)} MB (max 8 MB).` });
    }
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dim = imageSize(buf);
      width = dim.width;
      height = dim.height;
    } catch {
      issues.push({ level: "error", where: `${where} / character`, message: `${file} is not a readable image.` });
    }
    stageFiles.push({ stage: s, file, absPath, hash: createHash("sha256").update(buf).digest("hex").slice(0, 10), width, height });
  }
  const sized = stageFiles.filter((f) => f.width && f.height);
  if (sized.length > 1) {
    const [first] = sized as [StageFile];
    const ratio = (f: StageFile) => (f.width as number) / (f.height as number);
    for (const f of sized) {
      if (f.width !== first.width || f.height !== first.height) {
        const sameRatio = Math.abs(ratio(f) - ratio(first)) < 0.01;
        issues.push({
          level: sameRatio ? "warning" : "error",
          where: `${where} / character`,
          message: `${f.file} is ${f.width}x${f.height} but ${first.file} is ${first.width}x${first.height}${sameRatio ? " (same shape, different size)" : ". All stages must have the same aspect ratio"}.`,
        });
      }
    }
  }

  const topic: Topic = {
    id: meta.id,
    title: meta.title ?? "",
    description: meta.description,
    character: {
      id: charMeta.id,
      name: charMeta.name,
      age: charMeta.age,
      description: charMeta.description,
      assetRights: charMeta.asset_rights,
      stages: stageFiles.length === STAGE_COUNT ? stageFiles.map((f) => f.file) : [],
    },
    questions,
  };
  issues.push(...validateTopic(topic).filter((i) => !(topic.character.stages.length === 0 && /stage images/.test(i.message))));
  return { dir, meta, topic, stageFiles, issues };
}

export function listTopicDirs(presetsDir: string): string[] {
  if (!existsSync(presetsDir)) return [];
  return readdirSync(presetsDir)
    .map((d) => join(presetsDir, d))
    .filter((d) => statSync(d).isDirectory() && !d.split(/[\\/]/).pop()!.startsWith("_"));
}

export function stageExt(f: StageFile): string {
  return extname(f.file).toLowerCase();
}
