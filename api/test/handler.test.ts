import { describe, expect, it } from "vitest";
import { Lockout } from "../_lib/auth.js";
import { createHandler, repoConfig, type Env } from "../_lib/handler.js";
import { FakeGitHub } from "./fake-github.js";

const PW = "test-only-password";
const ORIGIN = "https://game.example";

function setup(env: Partial<Env> = {}) {
  const gh = new FakeGitHub({
    "README.md": "# hi\n",
    "content/site.json": "{}\n",
    "content/presets/space/topic.json": '{"id":"space"}\n',
    "content/presets/space/character/00.svg": "<svg/>",
  });
  let t = 1_800_000_000_000;
  const handle = createHandler({
    env: { EDIT_PASSWORD: PW, GITHUB_TOKEN: "test-token", GITHUB_REPO: "o/r", EDIT_BRANCH: "main", ...env },
    fetch: gh.fetch,
    now: () => t,
    sleep: async () => undefined,
    lockout: new Lockout(),
  });
  let cookie = "";
  const req = async (op: string, init: RequestInit & { headers?: Record<string, string> } = {}, query = "") => {
    const res = await handle(
      new Request(`${ORIGIN}/api/edit?op=${op}${query}`, {
        ...init,
        headers: { "x-knt-editor": "1", "x-forwarded-proto": "https", "x-real-ip": "1.1.1.1", host: "game.example", ...(cookie ? { cookie } : {}), ...init.headers },
      }),
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return res;
  };
  const post = (op: string, body: unknown, headers: Record<string, string> = {}) =>
    req(op, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  return { gh, req, post, advance: (ms: number) => (t += ms), getCookie: () => cookie, setCookie: (c: string) => (cookie = c) };
}

describe("edit API", () => {
  it("refuses requests without the editor header or from another site", async () => {
    const { req } = setup();
    expect((await req("session", { headers: { "x-knt-editor": "" } })).status).toBe(403);
    expect((await req("session", { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await req("session", { headers: { origin: ORIGIN } })).status).toBe(200);
  });

  it("reports the session state without leaking the password", async () => {
    const { req } = setup();
    const res = await req("session");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ configured: true, github: true, unlocked: false, repo: "o/r", branch: "main" });
    expect(text).not.toContain(PW);
  });

  it("unlocks with the right password and sets a secure HttpOnly cookie", async () => {
    const { post, req, getCookie } = setup();
    const res = await post("unlock", { password: PW });
    expect(res.status).toBe(200);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).not.toContain(PW);
    expect(getCookie()).toMatch(/^knt_edit=/);
    expect(await (await req("session")).json()).toMatchObject({ unlocked: true });
  });

  it("counts down wrong passwords, then locks out", async () => {
    const { post, advance } = setup();
    for (let left = 4; left >= 1; left--) {
      const r = await post("unlock", { password: "nope" });
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "Wrong password.", remaining: left });
    }
    const locked = await post("unlock", { password: "nope" });
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBe("900");
    // Even the right password is refused while locked out.
    expect((await post("unlock", { password: PW })).status).toBe(429);
    advance(15 * 60_000 + 1);
    expect((await post("unlock", { password: PW })).status).toBe(200);
  });

  it("locks only the IP that guessed wrong", async () => {
    const { post } = setup();
    for (let i = 0; i < 5; i++) await post("unlock", { password: "nope" });
    expect((await post("unlock", { password: PW })).status).toBe(429);
    expect((await post("unlock", { password: PW }, { "x-real-ip": "2.2.2.2" })).status).toBe(200);
  });

  it("is off when no password is set", async () => {
    const { req, post } = setup({ EDIT_PASSWORD: "" });
    expect(await (await req("session")).json()).toMatchObject({ configured: false });
    expect((await post("unlock", { password: "" })).status).toBe(503);
    expect((await req("list")).status).toBe(401);
  });

  it("needs a session for every content operation", async () => {
    const { req, post, setCookie } = setup();
    expect((await req("list")).status).toBe(401);
    expect((await req("raw", {}, `&sha=${"a".repeat(40)}`)).status).toBe(401);
    expect((await post("commit", { changes: [] })).status).toBe(401);
    setCookie("knt_edit=forged.token");
    expect((await req("list")).status).toBe(401);
  });

  it("expires sessions", async () => {
    const { req, post, advance } = setup();
    await post("unlock", { password: PW });
    advance(12 * 60 * 60_000 + 1000);
    expect((await req("list")).status).toBe(401);
  });

  it("signs everyone out when the password changes", async () => {
    const a = setup();
    await a.post("unlock", { password: PW });
    const b = setup({ EDIT_PASSWORD: "a-new-password" });
    b.setCookie(a.getCookie());
    expect((await b.req("list")).status).toBe(401);
  });

  it("lists, reads, uploads and commits content", async () => {
    const { gh, req, post } = setup();
    await post("unlock", { password: PW });

    const list = (await (await req("list")).json()) as { files: { path: string; sha: string }[]; branch: string };
    expect(list.branch).toBe("main");
    expect(list.files.map((f) => f.path).sort()).toEqual(["content/presets/space/character/00.svg", "content/presets/space/topic.json", "content/site.json"]);

    const topic = list.files.find((f) => f.path.endsWith("topic.json"))!;
    expect(await (await req("raw", {}, `&sha=${topic.sha}`)).text()).toBe('{"id":"space"}\n');
    expect((await req("raw", {}, "&sha=../../etc")).status).toBe(400);

    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const blob = (await (await req("blob", { method: "POST", body: png })).json()) as { sha: string };
    expect(blob.sha).toMatch(/^[0-9a-f]{40}$/);

    const res = await post("commit", {
      summary: "add topic animals",
      changes: [
        { path: "content/presets/animals/topic.json", text: '{"id":"animals"}\n' },
        { path: "content/presets/animals/character/00.png", blobSha: blob.sha },
        { path: "content/presets/space/character/00.svg", delete: true },
        { path: "content/presets/gone/topic.json", delete: true },
      ],
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { commit: string; url: string };
    expect(out.url).toContain(out.commit);
    expect(gh.commits.get(gh.ref)!.message).toBe("Site editor: add topic animals");
    expect(gh.text("content/presets/animals/topic.json")).toBe('{"id":"animals"}\n');
    expect(gh.headFiles().has("content/presets/animals/character/00.png")).toBe(true);
    expect(gh.headFiles().has("content/presets/space/character/00.svg")).toBe(false);
    expect(gh.text("README.md")).toBe("# hi\n"); // untouched

    // Saving the same thing again changes nothing.
    const again = await post("commit", { changes: [{ path: "content/presets/animals/topic.json", text: '{"id":"animals"}\n' }] });
    expect(await again.json()).toEqual({ unchanged: true });
  });

  it("refuses to write outside the content folder", async () => {
    const { gh, post } = setup();
    await post("unlock", { password: PW });
    const before = gh.ref;
    for (const path of ["README.md", "api/edit.ts", "content/presets/../../vercel.json", ".github/workflows/x.yml"]) {
      const r = await post("commit", { changes: [{ path, text: "{}" }] });
      expect(r.status, path).toBe(400);
    }
    expect(gh.ref).toBe(before);
  });

  it("retries once when the branch moves during a save", async () => {
    const { gh, post } = setup();
    await post("unlock", { password: PW });
    gh.raceOnce = true;
    const r = await post("commit", { changes: [{ path: "content/site.json", text: '{"text":{}}\n' }] });
    expect(r.status).toBe(200);
    expect(gh.text("content/site.json")).toBe('{"text":{}}\n');
    expect(gh.commits.get(gh.ref)!.parents[0]).not.toBe(undefined);
  });

  it("explains GitHub token problems", async () => {
    const { req, post } = setup({ GITHUB_TOKEN: "wrong" });
    await post("unlock", { password: PW });
    const r = await req("list");
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toMatch(/GITHUB_TOKEN/);
  });

  it("asks for a token when none is set", async () => {
    const { req, post } = setup({ GITHUB_TOKEN: "" });
    await post("unlock", { password: PW });
    expect((await req("list")).status).toBe(503);
  });

  it("rejects oversized uploads", async () => {
    const { req, post } = setup();
    await post("unlock", { password: PW });
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    expect((await req("blob", { method: "POST", body: big })).status).toBe(413);
  });
});

describe("repo config", () => {
  it("edits main in production and the preview's own branch elsewhere", () => {
    expect(repoConfig({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toEqual({ repo: "TheMiniMingg/Kiss-n-Tell-", branch: "main" });
    expect(repoConfig({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature" }).branch).toBe("feature");
    expect(repoConfig({ EDIT_BRANCH: "content", VERCEL_ENV: "production" }).branch).toBe("content");
    expect(repoConfig({ VERCEL_GIT_REPO_OWNER: "a", VERCEL_GIT_REPO_SLUG: "b" }).repo).toBe("a/b");
    expect(repoConfig({ GITHUB_REPO: "c/d", VERCEL_GIT_REPO_OWNER: "a", VERCEL_GIT_REPO_SLUG: "b" }).repo).toBe("c/d");
  });
});
