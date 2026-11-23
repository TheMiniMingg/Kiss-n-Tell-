import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";

/** A fake /api/edit for browser tests (the real server is unit-tested in api/test). */
export const PASSWORD = "e2e-only-password";

function stageSvg(label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#335"/><text x="150" y="200" font-size="60" text-anchor="middle" fill="#fff">${label}</text></svg>`;
}

function seedFiles(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const put = (p: string, s: string) => files.set(p, Buffer.from(s));
  put("content/site.json", JSON.stringify({ text: { title: "Kiss N Tell" }, donate: { label: "Donate", url: "" }, socials: [{ platform: "instagram", url: "" }] }, null, 2) + "\n");
  put("content/presets/alpha/topic.json", JSON.stringify({ id: "alpha", title: "Alpha Topic", description: "First", order: 1 }, null, 2) + "\n");
  put("content/presets/alpha/character/character.json", JSON.stringify({ id: "alpha-girl", name: "Alpha Girl", age: 25, asset_rights: "test" }, null, 2) + "\n");
  const rows = ["question_id,prompt,answer,tier,timer_seconds"];
  for (let i = 1; i <= 8; i++) {
    rows.push(`q${i},Alpha question ${i},apple,common,20`, `q${i},,cherry,rare,`, `q${i},,dragonfruit,legendary,`);
  }
  put("content/presets/alpha/questions.csv", rows.join("\n") + "\n");
  for (let s = 0; s <= 10; s++) put(`content/presets/alpha/character/${String(s).padStart(2, "0")}.svg`, stageSvg(String(s)));
  return files;
}

const gitSha = (b: Buffer) => createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");

export interface FakeServer {
  files: Map<string, Buffer>;
  commits: { summary: string; changes: Record<string, unknown>[] }[];
  unlocked: boolean;
  failures: number;
  github: boolean;
}

export async function fakeEditApi(page: Page, opts: { github?: boolean } = {}): Promise<FakeServer> {
  const server: FakeServer = { files: seedFiles(), commits: [], unlocked: false, failures: 0, github: opts.github ?? true };
  const blobs = new Map<string, Buffer>();
  await page.route("**/api/edit?**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const op = url.searchParams.get("op");
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (req.headers()["x-knt-editor"] !== "1") return json(403, { error: "Forbidden." });
    if (op === "session") return json(200, { configured: true, github: server.github, unlocked: server.unlocked, repo: "o/r", branch: "main" });
    if (op === "unlock") {
      if (server.failures >= 5) return json(429, { error: "Too many wrong passwords. Try again later.", retryAfter: 900 });
      if ((req.postDataJSON() as { password: string }).password !== PASSWORD) {
        server.failures++;
        if (server.failures >= 5) return json(429, { error: "Too many wrong passwords. Try again later.", retryAfter: 900 });
        return json(401, { error: "Wrong password.", remaining: 5 - server.failures });
      }
      server.unlocked = true;
      return json(200, { unlocked: true });
    }
    if (op === "lock") {
      server.unlocked = false;
      return json(200, { unlocked: false });
    }
    if (!server.unlocked) return json(401, { error: "Locked. Enter the password again." });
    if (op === "list") {
      const files = [...server.files].map(([path, b]) => {
        const sha = gitSha(b);
        blobs.set(sha, b);
        return { path, sha, size: b.length };
      });
      return json(200, { repo: "o/r", branch: "main", head: "h", files });
    }
    if (op === "raw") return route.fulfill({ status: 200, contentType: "application/octet-stream", body: blobs.get(url.searchParams.get("sha")!)! });
    if (op === "blob") {
      const b = req.postDataBuffer()!;
      blobs.set(gitSha(b), b);
      return json(200, { sha: gitSha(b) });
    }
    if (op === "commit") {
      const body = req.postDataJSON() as { summary: string; changes: Record<string, unknown>[] };
      server.commits.push(body);
      for (const c of body.changes) {
        const path = c.path as string;
        if (c.delete) server.files.delete(path);
        else if (typeof c.text === "string") server.files.set(path, Buffer.from(c.text));
        else server.files.set(path, blobs.get(c.blobSha as string)!);
      }
      return json(200, { commit: "abc" });
    }
    return json(404, { error: "Unknown request." });
  });
  return server;
}

