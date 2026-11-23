import { describe, expect, it } from "vitest";
import { defaultSiteConfig, isSafeLinkUrl, parseSiteConfig, socialLabel } from "../src/site.js";

describe("site settings", () => {
  it("falls back to the defaults", () => {
    expect(parseSiteConfig(undefined)).toEqual({ config: defaultSiteConfig(), issues: [] });
    expect(parseSiteConfig({})).toEqual({ config: defaultSiteConfig(), issues: [] });
    expect(parseSiteConfig([]).issues[0]?.level).toBe("error");
  });

  it("reads text, donate and socials, hiding empty placeholders", () => {
    const { config, issues } = parseSiteConfig({
      text: { title: "  My Game ", tagline: "", footerNote: "Adults only." },
      donate: { label: "Tip jar", url: "https://ko-fi.com/me" },
      socials: [
        { platform: "instagram", url: "" },
        { platform: "x", url: "https://x.com/me", label: "Twitter" },
        { platform: "tiktok", url: "https://www.tiktok.com/@me" },
      ],
    });
    expect(issues).toEqual([]);
    expect(config.text.title).toBe("My Game");
    expect(config.text.tagline).toBe("");
    expect(config.text.topicsHeading).toBe("Choose a topic");
    expect(config.donate).toEqual({ label: "Tip jar", url: "https://ko-fi.com/me" });
    expect(config.socials).toEqual([
      { platform: "x", url: "https://x.com/me", label: "Twitter" },
      { platform: "tiktok", url: "https://www.tiktok.com/@me" },
    ]);
    expect(config.socials.map(socialLabel)).toEqual(["Twitter", "TikTok"]);
  });

  it("keeps the default title when it's left empty", () => {
    expect(parseSiteConfig({ text: { title: " " } }).config.text.title).toBe("Kiss N Tell");
  });

  it("only links to https URLs", () => {
    expect(isSafeLinkUrl("https://ko-fi.com/me")).toBe(true);
    for (const bad of ["http://ko-fi.com", "javascript:alert(1)", "https://", "ko-fi.com/me", "https://user:pw@x.com", " data:text/html,hi"]) {
      expect(isSafeLinkUrl(bad), bad).toBe(false);
    }
    const { config, issues } = parseSiteConfig({
      donate: { url: "javascript:alert(1)" },
      socials: [{ platform: "x", url: "http://x.com/me" }, { platform: "myspace", url: "https://myspace.com" }],
    });
    expect(config.donate.url).toBe("");
    expect(config.socials).toEqual([]);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(3);
  });

  it("flags text that's too long or not text", () => {
    const { issues } = parseSiteConfig({ text: { title: "x".repeat(41), tagline: 5 } });
    expect(issues.map((i) => i.message)).toEqual(["text.title is longer than 40 characters.", "text.tagline must be text."]);
  });

  it("caps the number of social links", () => {
    const socials = Array.from({ length: 14 }, (_, i) => ({ platform: "website", url: `https://site${i}.example` }));
    const { config, issues } = parseSiteConfig({ socials });
    expect(config.socials).toHaveLength(12);
    expect(issues[0]?.level).toBe("warning");
  });
});
