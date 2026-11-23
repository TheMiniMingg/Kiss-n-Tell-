/**
 * The small part of the GitHub REST API the site editor needs: read the
 * content folder at the branch head, read and create blobs, and make one
 * commit with a set of file changes. A commit to the production branch makes
 * Vercel build and deploy the site again, so content stays in git.
 */

export interface RepoConfig {
  token: string;
  /** "owner/name" */
  repo: string;
  branch: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface TreeFile {
  path: string;
  sha: string;
  size: number;
}

export type Change =
  | { path: string; text: string }
  | { path: string; blobSha: string }
  | { path: string; delete: true };

export class GitHubError extends Error {
  override name = "GitHubError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API = "https://api.github.com";

export class GitHub {
  constructor(
    private cfg: RepoConfig,
    private fetchFn: FetchLike = fetch,
  ) {}

  get repo() {
    return this.cfg.repo;
  }
  get branch() {
    return this.cfg.branch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${API}/repos/${this.cfg.repo}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kiss-n-tell-site-editor",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        /* not JSON */
      }
      throw new GitHubError(`GitHub ${method} ${path.split("?")[0]} failed (${res.status}${detail ? `: ${detail}` : ""})`, res.status);
    }
    return (await res.json()) as T;
  }

  /** Commit sha and tree sha at the branch head. */
  async head(): Promise<{ commit: string; tree: string }> {
    const ref = await this.call<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodeURIComponent(this.cfg.branch)}`);
    const commit = await this.call<{ tree: { sha: string } }>("GET", `/git/commits/${ref.object.sha}`);
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }

  /** Every file under `prefix` in a tree. */
  async files(treeSha: string, prefix: string): Promise<TreeFile[]> {
    const t = await this.call<{ truncated: boolean; tree: { path: string; type: string; sha: string; size?: number }[] }>(
      "GET",
      `/git/trees/${treeSha}?recursive=1`,
    );
    if (t.truncated) throw new GitHubError("The repository tree is too large to list.", 500);
    return t.tree
      .filter((e) => e.type === "blob" && e.path.startsWith(prefix))
      .map((e) => ({ path: e.path, sha: e.sha, size: e.size ?? 0 }));
  }

  async blob(sha: string): Promise<Uint8Array> {
    const b = await this.call<{ content: string; encoding: string }>("GET", `/git/blobs/${sha}`);
    if (b.encoding !== "base64") throw new GitHubError(`Unexpected blob encoding ${b.encoding}.`, 500);
    return new Uint8Array(Buffer.from(b.content, "base64"));
  }

  async createBlob(bytes: Uint8Array): Promise<string> {
    const r = await this.call<{ sha: string }>("POST", "/git/blobs", { content: Buffer.from(bytes).toString("base64"), encoding: "base64" });
    return r.sha;
  }

  /**
   * Apply `changes` on top of the branch head in one commit. Deleting a file
   * that isn't there is skipped. If the branch moves while committing (someone
   * pushed), it starts again from the new head once.
   * Resolves to null when nothing would change.
   */
  async commit(changes: readonly Change[], message: string, prefix: string): Promise<{ sha: string; url: string } | null> {
    for (let attempt = 0; ; attempt++) {
      const head = await this.head();
      const existing = new Map((await this.files(head.tree, prefix)).map((f) => [f.path, f.sha]));
      type Entry = { path: string; mode: "100644"; type: "blob"; sha?: string | null; content?: string };
      const tree = changes.flatMap((c): Entry[] => {
        if ("delete" in c) return existing.has(c.path) ? [{ path: c.path, mode: "100644", type: "blob", sha: null }] : [];
        if ("blobSha" in c) return existing.get(c.path) === c.blobSha ? [] : [{ path: c.path, mode: "100644", type: "blob", sha: c.blobSha }];
        return [{ path: c.path, mode: "100644", type: "blob", content: c.text }];
      });
      if (tree.length === 0) return null;
      const newTree = await this.call<{ sha: string }>("POST", "/git/trees", { base_tree: head.tree, tree });
      if (newTree.sha === head.tree) return null;
      const commit = await this.call<{ sha: string; html_url: string }>("POST", "/git/commits", {
        message,
        tree: newTree.sha,
        parents: [head.commit],
      });
      try {
        await this.call("PATCH", `/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`, { sha: commit.sha, force: false });
        return { sha: commit.sha, url: commit.html_url };
      } catch (e) {
        // 422: not a fast-forward (the branch moved). Retry once on the new head.
        if (e instanceof GitHubError && e.status === 422 && attempt === 0) continue;
        throw e;
      }
    }
  }
}
