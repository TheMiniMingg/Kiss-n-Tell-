import { StoreError, type PackFiles, type PackStore } from "@kiss-n-tell/editor";
import { gitBlobSha, type Change, type EditApi, type RepoFile } from "./api.js";

export const PRESETS = "content/presets/";
export const SITE_FILE = "content/site.json";
const TEXT = /\.(json|csv)$/;
/** Matches the server's limit (Vercel caps request bodies at 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Hidden drafts are kept in "_<id>" folders, which the build skips. */
export const isDraftFolder = (folder: string) => folder.startsWith("_");

function download(bytes: Uint8Array, filename: string): string {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `your downloads (${filename})`;
}

/**
 * The game's own topics (content/presets in git) as a pack store. Every save
 * or delete is one commit through /api/edit; files that didn't change aren't
 * sent again. Topics with errors are saved as hidden drafts so a half-done
 * topic never breaks the live site's build.
 */
export class SiteStore implements PackStore {
  readonly kind = "site" as const;
  private files = new Map<string, RepoFile>();

  constructor(
    private api: EditApi,
    private where: { repo: string; branch: string },
  ) {}

  async refresh(): Promise<void> {
    const r = await this.api.list();
    this.where = { repo: r.repo, branch: r.branch };
    this.files = new Map(r.files.map((f) => [f.path, f]));
  }

  async location(): Promise<string> {
    return `GitHub: ${this.where.repo} (${this.where.branch})`;
  }

  private folderFiles(folder: string): RepoFile[] {
    const prefix = `${PRESETS}${folder}/`;
    return [...this.files.values()].filter((f) => f.path.startsWith(prefix));
  }

  private folders(): string[] {
    const out = new Set<string>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(PRESETS)) continue;
      const rest = path.slice(PRESETS.length);
      const slash = rest.indexOf("/");
      if (slash > 0) out.add(rest.slice(0, slash));
    }
    return [...out].sort();
  }

  async list(): Promise<string[]> {
    await this.refresh();
    return this.folders();
  }

  async load(folder: string): Promise<PackFiles> {
    const files = this.folderFiles(folder);
    if (files.length === 0) throw new StoreError(`Topic "${folder}" not found.`);
    const prefix = `${PRESETS}${folder}/`;
    const out: PackFiles = new Map();
    await Promise.all(files.map(async (f) => out.set(f.path.slice(prefix.length), await this.api.raw(f.sha))));
    return out;
  }

  /** Read a text file such as content/site.json. Resolves to null if it doesn't exist. */
  async readText(path: string): Promise<string | null> {
    if (this.files.size === 0) await this.refresh();
    const f = this.files.get(path);
    return f ? new TextDecoder().decode(await this.api.raw(f.sha)) : null;
  }

  async writeText(path: string, text: string, summary: string): Promise<boolean> {
    const r = await this.api.commit(summary, [{ path, text }]);
    await this.refresh();
    return !r.unchanged;
  }

  async save(folder: string, files: PackFiles, replaces: string | null, opts?: { playable: boolean }): Promise<string> {
    await this.refresh();
    const playable = opts?.playable ?? true;
    const id = isDraftFolder(folder) ? folder.slice(1) : folder;
    const target = playable ? id : `_${id}`;
    const taken = this.folders();
    if (!playable && replaces === id) {
      throw new StoreError("This topic is live and now has errors. Fix them before saving (see the Check tab), so players don't lose the topic.");
    }
    const other = playable ? `_${id}` : id;
    if ((taken.includes(target) && target !== replaces) || (taken.includes(other) && other !== replaces)) {
      throw new StoreError(`A topic with the id "${id}" already exists. Pick another id.`);
    }

    const changes: Change[] = [];
    const prefix = `${PRESETS}${target}/`;
    const uploads: { path: string; bytes: Uint8Array }[] = [];
    // Blobs already in the repo (e.g. images of a topic being renamed or published) are reused, not uploaded again.
    const known = new Set([...this.files.values()].map((f) => f.sha));
    for (const [rel, bytes] of files) {
      const path = prefix + rel;
      const sha = await gitBlobSha(bytes);
      if (this.files.get(path)?.sha === sha) continue;
      if (TEXT.test(rel)) changes.push({ path, text: new TextDecoder().decode(bytes) });
      else if (known.has(sha)) changes.push({ path, blobSha: sha });
      else if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        throw new StoreError(
          `${rel} is ${(bytes.byteLength / 1048576).toFixed(1)} MB. The site editor takes images up to 4 MB; save it as WebP or a smaller JPG and add it again.`,
        );
      } else uploads.push({ path, bytes });
    }
    for (const u of uploads) changes.push({ path: u.path, blobSha: (await this.api.blob(u.bytes)).sha });
    const uploaded = uploads.length;
    for (const f of this.folderFiles(target)) {
      if (!files.has(f.path.slice(prefix.length))) changes.push({ path: f.path, delete: true });
    }
    if (replaces && replaces !== target) {
      for (const f of this.folderFiles(replaces)) changes.push({ path: f.path, delete: true });
    }
    if (changes.length > 0) {
      const verb = replaces === null ? "add" : replaces === target ? "update" : playable && isDraftFolder(replaces) ? "publish" : "rename";
      const what = `${verb} topic ${id}${playable ? "" : " (draft)"}${uploaded ? `, ${uploaded} image${uploaded === 1 ? "" : "s"}` : ""}`;
      await this.api.commit(what, changes);
      await this.refresh();
    }
    return target;
  }

  async remove(folder: string): Promise<void> {
    await this.refresh();
    const files = this.folderFiles(folder);
    if (files.length === 0) return;
    await this.api.commit(`delete topic ${folder.replace(/^_/, "")}`, files.map((f) => ({ path: f.path, delete: true as const })));
    await this.refresh();
  }

  async saveFile(bytes: Uint8Array, filename: string): Promise<string> {
    return download(bytes, filename);
  }
}
