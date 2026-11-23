import type { Character, Topic } from "@kiss-n-tell/engine";

export interface GameCharacter extends Character {
  width?: number;
  height?: number;
}

export interface GameTopic extends Topic {
  sample?: boolean;
  character: GameCharacter;
}

export interface Manifest {
  schemaVersion: number;
  topics: GameTopic[];
}

export async function loadManifest(url: string, signal?: AbortSignal): Promise<Manifest> {
  const res = await fetch(url, { signal, cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load game content (HTTP ${res.status}).`);
  const data = (await res.json()) as Manifest;
  if (!data || !Array.isArray(data.topics)) throw new Error("Game content is malformed.");
  // Resolve stage paths relative to the manifest so the app works from any base path.
  const base = new URL(url, document.baseURI);
  const root = new URL("..", base);
  for (const t of data.topics) {
    t.character.stages = t.character.stages.map((s) => new URL(s, root).href);
  }
  return data;
}

const preloaded = new Set<string>();
/** Start downloading images so stage changes are instant. */
export function preloadImages(urls: readonly string[]): void {
  for (const u of urls) {
    if (preloaded.has(u)) continue;
    preloaded.add(u);
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  }
}
