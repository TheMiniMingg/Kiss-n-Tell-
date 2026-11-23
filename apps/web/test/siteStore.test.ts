import { describe, expect, it } from "vitest";
import { packToFiles, packFromFiles } from "@kiss-n-tell/editor";
import { gitBlobSha, type Change, type RepoFile } from "../src/owner/api.js";
import { SiteStore } from "../src/owner/siteStore.js";

const enc = new TextEncoder();

/** An in-memory /api/edit. */
function fakeApi(initial: Record<string, Uint8Array | string>) {
  const files = new Map<string, Uint8Array>();
  for (const [p, v] of Object.entries(initial)) files.set(p, typeof v === "string" ? enc.encode(v) : v);
  const blobs = new Map<string, Uint8Array>();
  const commits: { summary: string; changes: Change[] }[] = [];
  let uploads = 0;
  const api = {
    session: async () => ({ configured: true, github: true, unlocked: true, repo: "o/r", branch: "main" }),
    unlock: async () => ({ unlocked: true as const }),
    lock: async () => ({ unlocked: false as const }),
    async list() {
      const out: RepoFile[] = [];
      for (const [path, bytes] of files) {
        const sha = await gitBlobSha(bytes);
        blobs.set(sha, bytes);
        out.push({ path, sha, size: bytes.length });
      }
      return { repo: "o/r", branch: "main", head: "h", files: out };
    },
    raw: async (sha: string) => blobs.get(sha)!,
    async blob(bytes: Uint8Array) {
      uploads++;
      const sha = await gitBlobSha(bytes);
      blobs.set(sha, bytes);
      return { sha };
    },
    async commit(summary: string, changes: Change[]) {
      commits.push({ summary, changes });
      for (const c of changes) {
        if ("delete" in c) files.delete(c.path);
        else if ("text" in c) files.set(c.path, enc.encode(c.text));
        else files.set(c.path, blobs.get(c.blobSha)!);
      }
      return { commit: "c" };
    },
  };
  return { api, files, commits, uploads: () => uploads };
}

const topic = (id: string) => `{"id":"${id}","title":"${id}"}\n`;
const IMG = new Uint8Array([1, 2, 3, 4]);

function seed() {
  return fakeApi({
    "content/site.json": "{}\n",
    "content/presets/space/topic.json": topic("space"),
    "content/presets/space/questions.csv": "question_id,prompt,answer,tier,timer_seconds\n",
    "content/presets/space/character/character.json": '{"id":"c","name":"C","age":30}\n',
    "content/presets/space/character/00.png": IMG,
    "content/presets/_draft/topic.json": topic("draft"),
  });
}

describe("SiteStore", () => {
  it("lists topic folders, drafts included, and loads one", async () => {
    const { api } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    expect(await store.list()).toEqual(["_draft", "space"]);
    const files = await store.load("space");
    expect([...files.keys()].sort()).toEqual(["character/00.png", "character/character.json", "questions.csv", "topic.json"]);
    expect(files.get("character/00.png")).toEqual(IMG);
    expect(await store.location()).toBe("GitHub: o/r (main)");
    await expect(store.load("nope")).rejects.toThrow(/not found/);
  });

  it("sends only what changed, and nothing when nothing did", async () => {
    const { api, commits, uploads } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const files = await store.load("space");
    expect(await store.save("space", files, "space", { playable: true })).toBe("space");
    expect(commits).toHaveLength(0);

    files.set("topic.json", enc.encode(topic("space").replace('"title":"space"', '"title":"Space!"')));
    files.set("character/01.png", new Uint8Array([9, 9]));
    await store.save("space", files, "space", { playable: true });
    expect(commits).toHaveLength(1);
    expect(commits[0]!.summary).toBe("update topic space, 1 image");
    expect(commits[0]!.changes.map((c) => c.path).sort()).toEqual(["content/presets/space/character/01.png", "content/presets/space/topic.json"]);
    expect(uploads()).toBe(1);
  });

  it("deletes files that were removed in the editor", async () => {
    const { api, commits, files: repo } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const files = await store.load("space");
    files.delete("character/00.png");
    await store.save("space", files, "space", { playable: true });
    expect(commits[0]!.changes).toEqual([{ path: "content/presets/space/character/00.png", delete: true }]);
    expect(repo.has("content/presets/space/character/00.png")).toBe(false);
  });

  it("keeps unplayable new topics as hidden drafts and publishes them when fixed", async () => {
    const { api, files: repo, uploads } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const files = new Map([["topic.json", enc.encode(topic("moon"))], ["character/00.png", IMG]]);
    expect(await store.save("moon", files, null, { playable: false })).toBe("_moon");
    expect(repo.has("content/presets/_moon/topic.json")).toBe(true);
    expect(uploads()).toBe(0); // the image is already in the repo, so it's reused

    expect(await store.save("moon", files, "_moon", { playable: true })).toBe("moon");
    expect([...repo.keys()].filter((p) => p.includes("moon")).sort()).toEqual(["content/presets/moon/character/00.png", "content/presets/moon/topic.json"]);
  });

  it("won't hide a live topic that now has errors", async () => {
    const { api, commits } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    await expect(store.save("space", await store.load("space"), "space", { playable: false })).rejects.toThrow(/live and now has errors/);
    expect(commits).toHaveLength(0);
  });

  it("refuses an id that's taken, as a topic or as a draft", async () => {
    const { api } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const files = new Map([["topic.json", enc.encode(topic("space"))]]);
    await expect(store.save("space", files, null, { playable: true })).rejects.toThrow(/already exists/);
    await expect(store.save("draft", files, null, { playable: true })).rejects.toThrow(/already exists/);
  });

  it("renames a topic in one commit", async () => {
    const { api, files: repo, commits } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const files = await store.load("space");
    files.set("topic.json", enc.encode(topic("planets")));
    expect(await store.save("planets", files, "space", { playable: true })).toBe("planets");
    expect(commits).toHaveLength(1);
    expect(commits[0]!.summary).toMatch(/^rename topic planets/);
    expect([...repo.keys()].some((p) => p.includes("/space/"))).toBe(false);
    expect(repo.get("content/presets/planets/character/00.png")).toEqual(IMG);
  });

  it("refuses images over 4 MB before uploading", async () => {
    const { api, commits, uploads } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const files = await store.load("space");
    files.set("character/02.png", new Uint8Array(4 * 1024 * 1024 + 1));
    await expect(store.save("space", files, "space", { playable: true })).rejects.toThrow(/4 MB/);
    expect(uploads()).toBe(0);
    expect(commits).toHaveLength(0);
  });

  it("deletes a whole topic", async () => {
    const { api, files: repo } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.remove("space");
    expect([...repo.keys()].some((p) => p.includes("/space/"))).toBe(false);
    expect(repo.has("content/site.json")).toBe(true);
  });

  it("reads and writes site.json", async () => {
    const { api, files: repo } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    expect(await store.readText("content/site.json")).toBe("{}\n");
    expect(await store.writeText("content/site.json", '{"a":1}\n', "x")).toBe(true);
    expect(new TextDecoder().decode(repo.get("content/site.json"))).toBe('{"a":1}\n');
  });

  it("never re-sends unchanged images when the editor rewrites a pack", async () => {
    const { api, commits } = seed();
    const store = new SiteStore(api, { repo: "o/r", branch: "main" });
    await store.list();
    const { pack } = packFromFiles(await store.load("space"), "space");
    await store.save("space", packToFiles(pack), "space", { playable: true });
    // topic.json and character.json are rewritten in the editor's format; images never are.
    for (const c of commits.flatMap((x) => x.changes)) expect(c.path).not.toMatch(/\.png$/);
  });
});

describe("gitBlobSha", () => {
  it("matches git's blob ids", async () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(await gitBlobSha(enc.encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});
