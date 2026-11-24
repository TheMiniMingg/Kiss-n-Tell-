import { DEFAULT_TIMER_SECONDS, STAGE_COUNT, type Question } from "@kiss-n-tell/engine";

/** Image types a stage can use, matching the preset build script. */
export const IMAGE_TYPES = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
} as const;
export type ImageExt = keyof typeof IMAGE_TYPES;

export function isImageExt(ext: string): ext is ImageExt {
  return Object.prototype.hasOwnProperty.call(IMAGE_TYPES, ext);
}

/** topic.json. Unknown keys are kept so a round trip through the editor never drops data. */
export interface TopicMeta {
  id: string;
  title: string;
  description?: string;
  order?: number;
  sample?: boolean;
  [key: string]: unknown;
}

/** character/character.json, same field names as the presets. */
export interface CharacterMeta {
  id: string;
  name: string;
  age: number;
  species?: string;
  description?: string;
  asset_rights?: string;
  [key: string]: unknown;
}

export interface StageImage {
  ext: ImageExt;
  bytes: Uint8Array;
  /** Filled in once the image has been decoded (the editor does this in the webview). */
  width?: number;
  height?: number;
}

/** Everything in one pack: the same content as a content/presets/<id> folder. */
export interface PackDraft {
  topic: TopicMeta;
  character: CharacterMeta;
  questions: Question[];
  /** Always STAGE_COUNT long; index = stage (00-10). */
  images: (StageImage | null)[];
  /** Optional character/secret.<ext>, shown only after a perfect run. */
  secret: StageImage | null;
}

export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const MAX_ID_LENGTH = 64;

/** Turn free text into an id: "Ancient Greece!" -> "ancient-greece". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ID_LENGTH)
    .replace(/-+$/g, "");
}

/** First id of the form `${base}`, `${base}-2`, `${base}-3`... not in `taken`. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "item";
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const id = `${root}-${n}`;
    if (!used.has(id)) return id;
  }
}

export function emptyImages(): (StageImage | null)[] {
  return Array.from({ length: STAGE_COUNT }, () => null);
}

export function newQuestion(taken: Iterable<string>): Question {
  const used = new Set(taken);
  let n = used.size + 1;
  while (used.has(`q${String(n).padStart(2, "0")}`)) n++;
  return {
    id: `q${String(n).padStart(2, "0")}`,
    prompt: "",
    timerSeconds: DEFAULT_TIMER_SECONDS,
    answers: { common: [], rare: [], legendary: [] },
  };
}

export function newPack(id: string, title: string): PackDraft {
  return {
    topic: { id, title, description: "" },
    character: { id: `${id}-character`.slice(0, MAX_ID_LENGTH), name: "", age: 18, species: "", asset_rights: "" },
    questions: [],
    images: emptyImages(),
    secret: null,
  };
}

export function clonePack(p: PackDraft): PackDraft {
  return {
    topic: { ...p.topic },
    character: { ...p.character },
    questions: p.questions.map((q) => ({
      ...q,
      answers: { common: [...q.answers.common], rare: [...q.answers.rare], legendary: [...q.answers.legendary] },
    })),
    images: p.images.map((img) => (img ? { ...img } : null)),
    secret: p.secret ? { ...p.secret } : null,
  };
}

export function stageName(stage: number): string {
  return String(stage).padStart(2, "0");
}

/**
 * Split a word list typed or pasted by the author. One answer per line;
 * commas, semicolons and tabs also separate (answers are single words, so
 * none of these can be part of one). Empty entries are dropped.
 */
export function parseWordList(text: string): string[] {
  return text
    .split(/[\r\n,;\t]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}
