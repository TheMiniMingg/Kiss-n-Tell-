import type { Issue } from "@kiss-n-tell/engine";
import type { GameTopic } from "@kiss-n-tell/ui";
import { measureAll, type ImageUrls } from "./images.js";
import { isPlayable, packFromFiles, packToTopic, validatePack, type PackDraft } from "./pack/index.js";
import type { PackStore } from "./store.js";

export interface SavedPack {
  /** Folder (storage key) it was loaded from. Usually equals pack.topic.id. */
  folder: string;
  pack: PackDraft;
  /** Problems found while reading the files (bad JSON, CSV errors...). */
  loadIssues: Issue[];
}

export interface LoadResult {
  packs: SavedPack[];
  /** Packs that could not be read at all. */
  failures: { folder: string; message: string }[];
}

export async function loadAllPacks(store: PackStore): Promise<LoadResult> {
  const folders = await store.list();
  const failures: LoadResult["failures"] = [];
  const packs = (
    await Promise.all(
      folders.map(async (folder): Promise<SavedPack | null> => {
        try {
          const { pack, issues } = packFromFiles(await store.load(folder), folder);
          pack.images = await measureAll(pack.images);
          pack.secret = (await measureAll([pack.secret]))[0] ?? null;
          return { folder, pack, loadIssues: issues };
        } catch (e) {
          failures.push({ folder, message: (e as Error).message });
          return null;
        }
      }),
    )
  ).filter((p): p is SavedPack => p !== null);
  packs.sort((a, b) => (a.pack.topic.title || a.folder).localeCompare(b.pack.topic.title || b.folder));
  return { packs, failures };
}

export function packIssues(saved: SavedPack, all: readonly SavedPack[], presetIds: readonly string[]): Issue[] {
  const otherPackIds = all.filter((p) => p.folder !== saved.folder).map((p) => p.pack.topic.id);
  // Problems from reading the files (e.g. a dropped CSV row) are shown in the editor's Check tab;
  // whether the pack plays depends only on what was loaded.
  return validatePack(saved.pack, { otherPackIds, presetIds });
}

/** Local topic ids get a prefix that preset ids can't contain, so best scores never mix. */
export const LOCAL_PREFIX = "local.";

/** The packs that can be played, as game topics. */
export function playableTopics(packs: readonly SavedPack[], presetIds: readonly string[], urls: ImageUrls): GameTopic[] {
  const out: GameTopic[] = [];
  for (const saved of packs) {
    if (!isPlayable(packIssues(saved, packs, presetIds))) continue;
    out.push(packGameTopic(saved.pack, urls, `${LOCAL_PREFIX}${saved.folder}`));
  }
  urls.retain(packs.flatMap((p) => [...p.pack.images, p.pack.secret]));
  return out;
}

/** A pack as a game topic, with object URLs for its images. Missing images become empty strings. */
export function packGameTopic(pack: PackDraft, urls: ImageUrls, id: string): GameTopic {
  const stages = pack.images.map((img) => (img ? urls.get(img) : ""));
  const topic = packToTopic(pack, stages, pack.secret ? urls.get(pack.secret) : undefined);
  const first = pack.images.find((i) => i?.width && i?.height);
  return {
    ...topic,
    id,
    local: true,
    character: { ...topic.character, width: first?.width, height: first?.height },
  };
}
