import { describe, expect, it } from "vitest";
import { Lockout, clientIp, createSessionToken, passwordMatches, readCookie, SESSION_SECONDS, verifySessionToken } from "../_lib/auth.js";

const PW = "correct horse";

describe("password and session tokens", () => {
  it("compares passwords exactly", () => {
    expect(passwordMatches(PW, PW)).toBe(true);
    expect(passwordMatches("correct hors", PW)).toBe(false);
    expect(passwordMatches(`${PW} `, PW)).toBe(false);
    expect(passwordMatches("", "")).toBe(false);
  });

  it("accepts its own token until it expires", () => {
    const t0 = 1_800_000_000_000;
    const token = createSessionToken(PW, undefined, t0);
    expect(token).not.toContain(PW);
    expect(verifySessionToken(token, PW, undefined, t0 + 1000)).toBe(true);
    expect(verifySessionToken(token, PW, undefined, t0 + SESSION_SECONDS * 1000 + 1)).toBe(false);
  });

  it("rejects tampered tokens, other passwords and other secrets", () => {
    const t0 = 1_800_000_000_000;
    const token = createSessionToken(PW, "s1", t0);
    const [payload, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ v: 1, iat: 0, exp: 9_999_999_999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, PW, "s1", t0)).toBe(false);
    expect(verifySessionToken(`${payload}.${sig}x`, PW, "s1", t0)).toBe(false);
    expect(verifySessionToken(token, "other", "s1", t0)).toBe(false);
    expect(verifySessionToken(token, PW, "s2", t0)).toBe(false);
    expect(verifySessionToken(`${token}.extra`, PW, "s1", t0)).toBe(false);
    expect(verifySessionToken(undefined, PW, "s1", t0)).toBe(false);
    expect(verifySessionToken(token, "", "s1", t0)).toBe(false);
  });

  it("reads cookies", () => {
    expect(readCookie("a=1; knt_edit=abc.def; b=2", "knt_edit")).toBe("abc.def");
    expect(readCookie("knt_editx=1", "knt_edit")).toBeUndefined();
    expect(readCookie(null, "knt_edit")).toBeUndefined();
  });

  it("uses the IP Vercel reports", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("lockout", () => {
  const opts = { maxPerIp: 3, maxGlobal: 5, windowMs: 1000, lockMs: 10_000, maxLockMs: 25_000 };

  it("locks an IP after too many failures, then lets it try again", () => {
    const l = new Lockout(opts);
    expect(l.fail("a", 0)).toBe(0);
    expect(l.remaining("a", 0)).toBe(2);
    expect(l.fail("a", 1)).toBe(0);
    expect(l.fail("a", 2)).toBe(10_000);
    expect(l.retryAfter("a", 5000)).toBe(5002);
    expect(l.retryAfter("b", 5000)).toBe(0);
    expect(l.retryAfter("a", 10_002)).toBe(0);
  });

  it("doubles the lockout each time, up to the cap", () => {
    const l = new Lockout(opts);
    let t = 0;
    const lockOut = () => {
      l.fail("a", t);
      l.fail("a", t);
      const wait = l.fail("a", t);
      t += wait;
      return wait;
    };
    expect(lockOut()).toBe(10_000);
    expect(lockOut()).toBe(20_000);
    expect(lockOut()).toBe(25_000);
  });

  it("forgets failures outside the window and after a success", () => {
    const l = new Lockout(opts);
    l.fail("a", 0);
    l.fail("a", 1);
    expect(l.fail("a", 2000)).toBe(0); // the first two are outside the window
    l.succeed("a");
    expect(l.remaining("a", 2000)).toBe(3);
  });

  it("locks everyone after too many failures from many IPs", () => {
    const l = new Lockout(opts);
    for (let i = 0; i < 4; i++) expect(l.fail(`ip${i}`, i)).toBe(0);
    expect(l.fail("ip9", 5)).toBe(10_000);
    expect(l.retryAfter("fresh", 6)).toBe(9999);
  });
});
