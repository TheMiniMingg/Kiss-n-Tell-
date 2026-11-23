import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Owner unlock for the on-site editor.
 *
 * The password lives only in the EDIT_PASSWORD environment variable on Vercel.
 * A correct password gets a signed, HttpOnly session cookie. Sessions are
 * signed with a key derived from the password (plus the optional
 * EDIT_SESSION_SECRET), so changing the password signs everyone out.
 */

export const COOKIE_NAME = "knt_edit";
export const SESSION_SECONDS = 12 * 60 * 60;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Constant-time password comparison (hashing first makes the lengths equal). */
export function passwordMatches(given: string, expected: string): boolean {
  if (!expected) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

function signingKey(password: string, extraSecret = ""): Buffer {
  return createHmac("sha256", `knt-edit-session\0${extraSecret}`).update(password, "utf8").digest();
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function createSessionToken(password: string, extraSecret: string | undefined, nowMs: number): string {
  const payload = b64url(JSON.stringify({ v: 1, iat: Math.floor(nowMs / 1000), exp: Math.floor(nowMs / 1000) + SESSION_SECONDS }));
  const sig = b64url(createHmac("sha256", signingKey(password, extraSecret)).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined, password: string, extraSecret: string | undefined, nowMs: number): boolean {
  if (!token || !password) return false;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return false;
  const want = createHmac("sha256", signingKey(password, extraSecret)).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: number; exp?: number };
    return data.v === 1 && typeof data.exp === "number" && data.exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearedCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

/**
 * Brute-force protection for the unlock.
 *
 * - Per client IP: after MAX_PER_IP wrong passwords within WINDOW, that IP is
 *   locked out for LOCK_MS (doubling for each further lockout, up to a day).
 * - Overall: after MAX_GLOBAL wrong passwords within WINDOW from any IPs, every
 *   unlock is refused for LOCK_MS, which slows down attacks spread over many IPs.
 *
 * State is kept in the function instance's memory. Vercel reuses instances
 * between requests, but a cold start resets the counters, so this is a speed
 * bump rather than a hard guarantee (see docs/owner-mode.md for a firewall rule
 * that adds a durable limit).
 */
export interface LockoutOptions {
  maxPerIp: number;
  maxGlobal: number;
  windowMs: number;
  lockMs: number;
  maxLockMs: number;
}

export const DEFAULT_LOCKOUT: LockoutOptions = {
  maxPerIp: 5,
  maxGlobal: 25,
  windowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
  maxLockMs: 24 * 60 * 60_000,
};

interface Entry {
  failures: number[];
  lockedUntil: number;
  lockouts: number;
}

export class Lockout {
  private ips = new Map<string, Entry>();
  private global: Entry = { failures: [], lockedUntil: 0, lockouts: 0 };

  constructor(private opts: LockoutOptions = DEFAULT_LOCKOUT) {}

  /** Milliseconds until this IP may try again; 0 if it may try now. */
  retryAfter(ip: string, now: number): number {
    const e = this.ips.get(ip);
    return Math.max(0, (e?.lockedUntil ?? 0) - now, this.global.lockedUntil - now);
  }

  /** Record a wrong password. Returns ms until the next attempt is allowed (0 if not locked yet). */
  fail(ip: string, now: number): number {
    const e = this.ips.get(ip) ?? { failures: [], lockedUntil: 0, lockouts: 0 };
    this.ips.set(ip, e);
    this.bump(e, this.opts.maxPerIp, now);
    this.bump(this.global, this.opts.maxGlobal, now);
    this.prune(now);
    return this.retryAfter(ip, now);
  }

  /** A correct password clears that IP's record. */
  succeed(ip: string): void {
    this.ips.delete(ip);
  }

  /** Attempts left before this IP is locked out. */
  remaining(ip: string, now: number): number {
    const e = this.ips.get(ip);
    if (!e) return this.opts.maxPerIp;
    return Math.max(0, this.opts.maxPerIp - e.failures.filter((t) => now - t < this.opts.windowMs).length);
  }

  private bump(e: Entry, max: number, now: number) {
    e.failures = e.failures.filter((t) => now - t < this.opts.windowMs);
    e.failures.push(now);
    if (e.failures.length >= max) {
      e.lockouts++;
      e.lockedUntil = now + Math.min(this.opts.lockMs * 2 ** (e.lockouts - 1), this.opts.maxLockMs);
      e.failures = [];
    }
  }

  private prune(now: number) {
    if (this.ips.size < 5000) return;
    for (const [ip, e] of this.ips) {
      if (e.lockedUntil < now && e.failures.every((t) => now - t >= this.opts.windowMs)) this.ips.delete(ip);
    }
  }
}

/** The caller's IP as Vercel reports it. */
export function clientIp(headers: Headers): string {
  // Vercel sets these itself and overwrites values sent by the client.
  const ip = headers.get("x-real-ip") ?? headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  return ip ? ip.split(",")[0]!.trim() : "unknown";
}
