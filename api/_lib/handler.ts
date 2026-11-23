import {
  Lockout,
  clearedCookie,
  clientIp,
  COOKIE_NAME,
  createSessionToken,
  passwordMatches,
  readCookie,
  sessionCookie,
  verifySessionToken,
} from "./auth.js";
import { GitHub, GitHubError, type FetchLike } from "./github.js";
import { CONTENT_PREFIX, LIMITS, SHA_PATTERN, commitMessage, validateChanges } from "./paths.js";

/**
 * /api/edit?op=...  The owner-only backend for the on-site editor.
 *
 *   GET  session   is edit mode set up, and is this browser unlocked?
 *   POST unlock    { password } -> session cookie (rate limited, locks out)
 *   POST lock      forget the session cookie
 *   GET  list      files under content/ at the branch head       (unlocked)
 *   GET  raw       &sha=<blob sha> -> file bytes                  (unlocked)
 *   POST blob      raw bytes (an image) -> { sha }                (unlocked)
 *   POST commit    { summary, changes } -> one commit              (unlocked)
 *
 * Every request must carry the X-KNT-Editor header. Browsers can't add that
 * header cross-site without a CORS preflight, which this endpoint never
 * approves, so other sites can't drive it with the owner's cookie.
 */

export interface Env {
  EDIT_PASSWORD?: string;
  EDIT_SESSION_SECRET?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  EDIT_BRANCH?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_GIT_REPO_OWNER?: string;
  VERCEL_GIT_REPO_SLUG?: string;
}

export interface Deps {
  env: Env;
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  lockout?: Lockout;
}

export const EDITOR_HEADER = "x-knt-editor";
const FAIL_DELAY_MS = 600;
const DEFAULT_REPO = "TheMiniMingg/Kiss-n-Tell-";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function repoConfig(env: Env): { repo: string; branch: string } {
  const repo =
    env.GITHUB_REPO || (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : DEFAULT_REPO);
  // Production edits go to main (which deploys production). A preview deployment edits its own branch.
  const branch = env.EDIT_BRANCH || (env.VERCEL_ENV === "production" ? "main" : env.VERCEL_GIT_COMMIT_REF) || "main";
  return { repo, branch };
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin GETs may omit it; the custom header still applies
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isSecure(req: Request): boolean {
  return (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
}

async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(buf)) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createHandler(deps: Deps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const lockout = deps.lockout ?? new Lockout();

  return async function handle(req: Request): Promise<Response> {
    const env = deps.env;
    const password = env.EDIT_PASSWORD ?? "";
    const url = new URL(req.url);
    const op = url.searchParams.get("op") ?? "";
    const method = req.method.toUpperCase();

    if (req.headers.get(EDITOR_HEADER) !== "1" || !sameOrigin(req)) return json(403, { error: "Forbidden." });

    const unlocked = verifySessionToken(readCookie(req.headers.get("cookie"), COOKIE_NAME), password, env.EDIT_SESSION_SECRET, now());
    const { repo, branch } = repoConfig(env);

    if (op === "session" && method === "GET") {
      return json(200, { configured: !!password, github: !!env.GITHUB_TOKEN, unlocked, repo, branch });
    }

    if (op === "unlock" && method === "POST") {
      if (!password) return json(503, { error: "Edit mode isn't set up: EDIT_PASSWORD is missing on the server." });
      const ip = clientIp(req.headers);
      const wait = lockout.retryAfter(ip, now());
      if (wait > 0) {
        const retryAfter = Math.ceil(wait / 1000);
        return json(429, { error: "Too many wrong passwords. Try again later.", retryAfter }, { "Retry-After": String(retryAfter) });
      }
      const body = await readJson(req, 4096);
      const given = typeof body?.password === "string" ? body.password : "";
      if (!given || !passwordMatches(given, password)) {
        await sleep(FAIL_DELAY_MS);
        const locked = lockout.fail(ip, now());
        if (locked > 0) {
          const retryAfter = Math.ceil(locked / 1000);
          return json(429, { error: "Too many wrong passwords. Try again later.", retryAfter }, { "Retry-After": String(retryAfter) });
        }
        return json(401, { error: "Wrong password.", remaining: lockout.remaining(ip, now()) });
      }
      lockout.succeed(ip);
      return json(200, { unlocked: true }, { "Set-Cookie": sessionCookie(createSessionToken(password, env.EDIT_SESSION_SECRET, now()), isSecure(req)) });
    }

    if (op === "lock" && method === "POST") {
      return json(200, { unlocked: false }, { "Set-Cookie": clearedCookie(isSecure(req)) });
    }

    if (!["list", "raw", "blob", "commit"].includes(op)) return json(404, { error: "Unknown request." });
    if (!unlocked) return json(401, { error: "Locked. Enter the password again." });
    if (!env.GITHUB_TOKEN) return json(503, { error: "Saving isn't set up: GITHUB_TOKEN is missing on the server." });
    const gh = new GitHub({ token: env.GITHUB_TOKEN, repo, branch }, deps.fetch ?? fetch);

    try {
      if (op === "list" && method === "GET") {
        const head = await gh.head();
        return json(200, { repo, branch, head: head.commit, files: await gh.files(head.tree, CONTENT_PREFIX) });
      }
      if (op === "raw" && method === "GET") {
        const sha = url.searchParams.get("sha") ?? "";
        if (!SHA_PATTERN.test(sha)) return json(400, { error: "Bad file id." });
        const bytes = await gh.blob(sha);
        return new Response(bytes as BodyInit, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" },
        });
      }
      if (op === "blob" && method === "POST") {
        const declared = Number(req.headers.get("content-length") ?? 0);
        if (declared > LIMITS.maxBlobBytes) return json(413, { error: "That file is larger than 4 MB." });
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (bytes.byteLength === 0) return json(400, { error: "Empty file." });
        if (bytes.byteLength > LIMITS.maxBlobBytes) return json(413, { error: "That file is larger than 4 MB." });
        return json(200, { sha: await gh.createBlob(bytes) });
      }
      if (op === "commit" && method === "POST") {
        const body = await readJson(req, 5 * 1024 * 1024);
        if (!body) return json(400, { error: "Bad request." });
        const checked = validateChanges(body.changes);
        if ("error" in checked) return json(400, { error: checked.error });
        const result = await gh.commit(checked.changes, commitMessage(body.summary), CONTENT_PREFIX);
        return json(200, result ? { commit: result.sha, url: result.url } : { unchanged: true });
      }
      return json(405, { error: "Method not allowed." });
    } catch (e) {
      if (e instanceof GitHubError) {
        const hint =
          e.status === 401 || e.status === 403
            ? " Check that GITHUB_TOKEN is valid and can write to the repository's contents."
            : e.status === 404
              ? ` Check GITHUB_REPO (${repo}) and the branch (${branch}).`
              : "";
        return json(502, { error: `${e.message}.${hint}` });
      }
      return json(500, { error: "Something went wrong on the server." });
    }
  };
}
