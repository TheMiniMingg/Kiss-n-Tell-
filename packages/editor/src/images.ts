import { IMAGE_TYPES, isImageExt, type ImageExt, type StageImage } from "./pack/index.js";

/** Image type from a picked file's name, falling back to its MIME type. */
export function imageExtOf(file: { name: string; type: string }): ImageExt | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (isImageExt(ext)) return ext === "jpeg" ? "jpg" : ext;
  const byMime = Object.entries(IMAGE_TYPES).find(([, mime]) => mime === file.type);
  return byMime ? (byMime[0] as ImageExt) : null;
}

/** Stage number from a file name like "03.webp", "stage-3.png" or "char_10.jpg". */
export function stageFromName(name: string): number | null {
  const base = name.replace(/\.[^.]+$/, "");
  const m = /(\d{1,2})(?!.*\d)/.exec(base);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 10 ? n : null;
}

/** Decode an image in the webview to learn its size. Resolves null if it can't be decoded. */
export function measureImage(img: Pick<StageImage, "bytes" | "ext">): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: IMAGE_TYPES[img.ext] }));
    const el = new Image();
    const done = (v: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.onload = () => done(el.naturalWidth && el.naturalHeight ? { width: el.naturalWidth, height: el.naturalHeight } : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** Fill in width/height on every image that doesn't have them yet. */
export async function measureAll(images: (StageImage | null)[]): Promise<(StageImage | null)[]> {
  return Promise.all(
    images.map(async (img) => {
      if (!img || (img.width && img.height)) return img;
      const size = await measureImage(img);
      return size ? { ...img, ...size } : img;
    }),
  );
}

/**
 * Object URLs for stage images. Each owner keeps one of these and calls
 * `retain` with the images still in use, so replaced images are released.
 */
export class ImageUrls {
  private urls = new Map<Uint8Array, string>();

  get(img: StageImage): string {
    let url = this.urls.get(img.bytes);
    if (!url) {
      url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: IMAGE_TYPES[img.ext] }));
      this.urls.set(img.bytes, url);
    }
    return url;
  }

  retain(images: Iterable<StageImage | null>): void {
    const keep = new Set<Uint8Array>();
    for (const img of images) if (img) keep.add(img.bytes);
    for (const [bytes, url] of this.urls) {
      if (!keep.has(bytes)) {
        URL.revokeObjectURL(url);
        this.urls.delete(bytes);
      }
    }
  }
}

/**
 * Decide where picked images go. Files whose name has a stage number (00-10)
 * go to that stage (first one wins); the rest fill empty stages in order.
 * `forced` puts a single file on a chosen stage.
 */
export function placeImages<T>(
  current: readonly (unknown | null)[],
  files: readonly { name: string; value: T }[],
  forced: number | null = null,
): { placed: Map<number, T>; unplaced: string[] } {
  const placed = new Map<number, T>();
  const unplaced: string[] = [];
  if (forced !== null && files.length === 1) {
    placed.set(forced, (files[0] as { value: T }).value);
    return { placed, unplaced };
  }
  const rest: { name: string; value: T }[] = [];
  for (const f of files) {
    const stage = stageFromName(f.name);
    if (stage !== null && !placed.has(stage)) placed.set(stage, f.value);
    else rest.push(f);
  }
  for (const f of rest) {
    const free = current.findIndex((img, i) => !img && !placed.has(i));
    if (free < 0) unplaced.push(f.name);
    else placed.set(free, f.value);
  }
  return { placed, unplaced };
}
