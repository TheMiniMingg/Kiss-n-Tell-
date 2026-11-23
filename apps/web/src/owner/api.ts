/** Client for /api/edit (see api/_lib/handler.ts). */

export interface SessionInfo {
  configured: boolean;
  github: boolean;
  unlocked: boolean;
  repo: string;
  branch: string;
}

export interface RepoFile {
  path: string;
  sha: string;
  size: number;
}

export type Change = { path: string; text: string } | { path: string; blobSha: string } | { path: string; delete: true };

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const BASE = "/api/edit";

async function call<T>(op: string, init: RequestInit = {}, query = ""): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}?op=${op}${query}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-KNT-Editor": "1", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* not JSON (e.g. the static host has no /api) */
    }
    const message =
      typeof data.error === "string"
        ? data.error
        : res.status === 404 || res.status === 405
          ? "The edit server isn't available here. Owner mode only works on the deployed site."
          : `The server answered ${res.status}.`;
    throw new ApiError(message, res.status, data);
  }
  return op === "raw" ? ((await res.arrayBuffer()) as T) : ((await res.json()) as T);
}

const jsonInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const editApi = {
  session: () => call<SessionInfo>("session"),
  unlock: (password: string) => call<{ unlocked: true }>("unlock", jsonInit({ password })),
  lock: () => call<{ unlocked: false }>("lock", { method: "POST" }),
  list: () => call<{ repo: string; branch: string; head: string; files: RepoFile[] }>("list"),
  raw: async (sha: string) => new Uint8Array(await call<ArrayBuffer>("raw", {}, `&sha=${encodeURIComponent(sha)}`)),
  blob: (bytes: Uint8Array) =>
    call<{ sha: string }>("blob", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit }),
  commit: (summary: string, changes: Change[]) => call<{ commit?: string; url?: string; unchanged?: boolean }>("commit", jsonInit({ summary, changes })),
};

export type EditApi = typeof editApi;

/** Git's blob id for some bytes, so unchanged files aren't uploaded again. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const all = new Uint8Array(header.byteLength + bytes.byteLength);
  all.set(header, 0);
  all.set(bytes, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
