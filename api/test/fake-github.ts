import { createHash } from "node:crypto";

/** A tiny in-memory stand-in for the parts of the GitHub git data API the editor uses. */
export class FakeGitHub {
  blobs = new Map<string, Buffer>();
  trees = new Map<string, Map<string, string>>(); // tree sha -> path -> blob sha
  commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  ref: string;
  calls: string[] = [];
  /** Make the next ref update fail as if someone pushed in between. */
  raceOnce = false;

  constructor(files: Record<string, string>) {
    const tree = new Map<string, string>();
    for (const [p, text] of Object.entries(files)) tree.set(p, this.putBlob(Buffer.from(text)));
    const treeSha = this.putTree(tree);
    this.ref = this.putCommit(treeSha, [], "initial");
  }

  putBlob(buf: Buffer): string {
    const sha = createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
    this.blobs.set(sha, buf);
    return sha;
  }
  putTree(entries: Map<string, string>): string {
    const sha = createHash("sha1").update(JSON.stringify([...entries].sort())).digest("hex");
    this.trees.set(sha, entries);
    return sha;
  }
  putCommit(tree: string, parents: string[], message: string): string {
    const sha = createHash("sha1").update(`${tree}${parents.join()}${message}${this.commits.size}`).digest("hex");
    this.commits.set(sha, { tree, parents, message });
    return sha;
  }
  headFiles(): Map<string, string> {
    return this.trees.get(this.commits.get(this.ref)!.tree)!;
  }
  text(path: string): string | undefined {
    const sha = this.headFiles().get(path);
    return sha ? this.blobs.get(sha)!.toString("utf8") : undefined;
  }

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "");
    this.calls.push(`${method} ${path}`);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const ok = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
    const auth = (init.headers as Record<string, string>).Authorization;
    if (auth !== "Bearer test-token") return ok({ message: "Bad credentials" }, 401);

    if (method === "GET" && path.startsWith("/git/ref/heads/")) return ok({ object: { sha: this.ref } });
    if (method === "GET" && path.startsWith("/git/commits/")) {
      const c = this.commits.get(path.split("/").pop()!);
      return c ? ok({ tree: { sha: c.tree } }) : ok({ message: "Not Found" }, 404);
    }
    if (method === "GET" && path.startsWith("/git/trees/")) {
      const t = this.trees.get(path.split("/").pop()!)!;
      return ok({ truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, type: "blob", sha, size: this.blobs.get(sha)!.length })) });
    }
    if (method === "GET" && path.startsWith("/git/blobs/")) {
      const b = this.blobs.get(path.split("/").pop()!);
      return b ? ok({ content: b.toString("base64"), encoding: "base64" }) : ok({ message: "Not Found" }, 404);
    }
    if (method === "POST" && path === "/git/blobs") return ok({ sha: this.putBlob(Buffer.from(String(body.content), "base64")) }, 201);
    if (method === "POST" && path === "/git/trees") {
      const base = new Map(this.trees.get(String(body.base_tree))!);
      for (const e of body.tree as { path: string; sha?: string | null; content?: string }[]) {
        if (e.sha === null) {
          if (!base.has(e.path)) return ok({ message: "path not found" }, 422);
          base.delete(e.path);
        } else if (e.content !== undefined) base.set(e.path, this.putBlob(Buffer.from(e.content)));
        else {
          if (!this.blobs.has(e.sha!)) return ok({ message: "bad sha" }, 422);
          base.set(e.path, e.sha!);
        }
      }
      return ok({ sha: this.putTree(base) }, 201);
    }
    if (method === "POST" && path === "/git/commits") {
      const sha = this.putCommit(String(body.tree), body.parents as string[], String(body.message));
      return ok({ sha, html_url: `https://github.com/x/y/commit/${sha}` }, 201);
    }
    if (method === "PATCH" && path.startsWith("/git/refs/heads/")) {
      const c = this.commits.get(String(body.sha))!;
      if (this.raceOnce) {
        this.raceOnce = false;
        // Someone else pushed: move the branch so this update is no longer a fast-forward.
        this.ref = this.putCommit(this.commits.get(this.ref)!.tree, [this.ref], "someone else");
        return ok({ message: "Update is not a fast forward" }, 422);
      }
      if (c.parents[0] !== this.ref) return ok({ message: "Update is not a fast forward" }, 422);
      this.ref = String(body.sha);
      return ok({ ref: "refs/heads/main" });
    }
    return ok({ message: `unhandled ${method} ${path}` }, 500);
  };
}
