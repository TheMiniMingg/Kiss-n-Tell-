import { parseSiteConfig, type Character, type SiteConfig, type Topic } from "@kiss-n-tell/engine";

export interface GameCharacter extends Character {
  width?: number;
  height?: number;
}

export interface GameTopic extends Topic {
  sample?: boolean;
  /** A pack made in the desktop editor rather than a bundled preset. */
  local?: boolean;
  character: GameCharacter;
}

export interface Manifest {
  schemaVersion: number;
  /** Owner-editable text and links. Always filled in (defaults when the manifest has none). */
  site: SiteConfig;
  topics: GameTopic[];
}

export async function loadManifest(url: string, signal?: AbortSignal): Promise<Manifest> {
  const res = await fetch(url, { signal, cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load game content (HTTP ${res.status}).`);
  const data = (await res.json()) as Manifest;
  if (!data || !Array.isArray(data.topics)) throw new Error("Game content is malformed.");
  data.site = parseSiteConfig(data.site).config;
  // Resolve stage paths relative to the manifest so the app works from any base path.
  const base = new URL(url, document.baseURI);
  const root = new URL("..", base);
  for (const t of data.topics) {
    t.character.stages = t.character.stages.map((s) => new URL(s, root).href);
    if (t.character.secret) t.character.secret = new URL(t.character.secret, root).href;
    else delete t.character.secret;
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
