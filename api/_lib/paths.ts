/**
 * The only files the site editor may write. Everything else in the repo
 * (code, config, workflows) is out of reach even with a valid session.
 */

export const CONTENT_PREFIX = "content/";
export const SITE_FILE = "content/site.json";
export const PRESETS_DIR = "content/presets/";

/** Topic folder: the topic id, or "_" + id for a hidden draft (the build skips "_" folders). */
export const FOLDER_PATTERN = /^_?[a-z0-9][a-z0-9_-]{0,63}$/;
const PACK_FILE = /^(topic\.json|questions\.csv|character\/character\.json|character\/(0\d|10|secret)\.(webp|png|jpg|jpeg|svg))$/;
const TEXT_FILE = /\.(json|csv)$/;

export const LIMITS = {
  /** One uploaded image (request bodies on Vercel are capped at 4.5 MB). */
  maxBlobBytes: 4 * 1024 * 1024,
  /** One text file sent inline (topic.json, questions.csv, site.json). */
  maxTextBytes: 1024 * 1024,
  /** Files touched by one save. */
  maxChanges: 80,
  maxMessage: 200,
} as const;

export function isEditablePath(path: string): boolean {
  if (path === SITE_FILE) return true;
  if (!path.startsWith(PRESETS_DIR)) return false;
  const rest = path.slice(PRESETS_DIR.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return false;
  return FOLDER_PATTERN.test(rest.slice(0, slash)) && PACK_FILE.test(rest.slice(slash + 1));
}

export function isTextPath(path: string): boolean {
  return TEXT_FILE.test(path);
}

export const SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface ChangeInput {
  path?: unknown;
  text?: unknown;
  blobSha?: unknown;
  delete?: unknown;
}

export type ValidChange = { path: string; text: string } | { path: string; blobSha: string } | { path: string; delete: true };

/** Check a client's change list. Returns the changes or an error message. */
export function validateChanges(input: unknown): { changes: ValidChange[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "No changes to save." };
  if (input.length > LIMITS.maxChanges) return { error: `Too many files in one save (max ${LIMITS.maxChanges}).` };
  const seen = new Set<string>();
  const out: ValidChange[] = [];
  for (const raw of input as ChangeInput[]) {
    const path = typeof raw?.path === "string" ? raw.path : "";
    if (!isEditablePath(path)) return { error: `Not an editable file: ${path || "(no path)"}` };
    if (seen.has(path)) return { error: `${path} is listed twice.` };
    seen.add(path);
    if (raw.delete === true) {
      if (path === SITE_FILE) return { error: "site.json can't be deleted." };
      out.push({ path, delete: true });
    } else if (typeof raw.text === "string") {
      if (!isTextPath(path)) return { error: `${path} must be uploaded as a file.` };
      if (Buffer.byteLength(raw.text, "utf8") > LIMITS.maxTextBytes) return { error: `${path} is larger than 1 MB.` };
      if (path.endsWith(".json")) {
        try {
          const v = JSON.parse(raw.text) as unknown;
          if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("expected an object");
        } catch (e) {
          return { error: `${path} is not valid JSON (${(e as Error).message}).` };
        }
      }
      out.push({ path, text: raw.text });
    } else if (typeof raw.blobSha === "string" && SHA_PATTERN.test(raw.blobSha)) {
      out.push({ path, blobSha: raw.blobSha });
    } else {
      return { error: `${path}: nothing to write.` };
    }
  }
  return { changes: out };
}

/** One-line commit message from the client's summary. */
export function commitMessage(summary: unknown): string {
  const s = typeof summary === "string" ? summary.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim() : "";
  return `Site editor: ${(s || "update content").slice(0, LIMITS.maxMessage)}`;
}
