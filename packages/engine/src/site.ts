import type { Issue } from "./validate.js";

/**
 * Site-wide settings the owner can change without touching code:
 * a few lines of UI text, the donate button and social media links.
 * Stored in content/site.json and copied into the content manifest by the build.
 */
export interface SiteConfig {
  text: SiteText;
  donate: { label: string; url: string };
  socials: SocialLink[];
}

export interface SiteText {
  /** Big logo text on the home screen. */
  title: string;
  /** Line under the logo. */
  tagline: string;
  /** Heading above the topic list. */
  topicsHeading: string;
  /** Line above the donate and social buttons. */
  supportText: string;
  /** Small print in the footer. */
  footerNote: string;
}

export const SOCIAL_PLATFORMS = {
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitch: "Twitch",
  discord: "Discord",
  bluesky: "Bluesky",
  threads: "Threads",
  reddit: "Reddit",
  patreon: "Patreon",
  kofi: "Ko-fi",
  github: "GitHub",
  website: "Website",
} as const;
export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  /** Overrides the platform name on the button. */
  label?: string;
}

export const SITE_TEXT_FIELDS: readonly { key: keyof SiteText; label: string; max: number }[] = [
  { key: "title", label: "Logo text", max: 40 },
  { key: "tagline", label: "Tagline under the logo", max: 200 },
  { key: "topicsHeading", label: "Heading above the topics", max: 60 },
  { key: "supportText", label: "Line above the donate and social buttons", max: 160 },
  { key: "footerNote", label: "Footer note", max: 200 },
];

export const MAX_SOCIALS = 12;

export function defaultSiteConfig(): SiteConfig {
  return {
    text: {
      title: "Kiss N Tell",
      tagline: "Name the rarest answer you can. 7 questions, 10 stages, one guess each.",
      topicsHeading: "Choose a topic",
      supportText: "Enjoying the game? Support it or come say hi.",
      footerNote: "All characters are fictional adults.",
    },
    donate: { label: "Donate", url: "" },
    socials: [],
  };
}

/** True for an absolute https:// URL (the only kind the buttons will link to). */
export function isSafeLinkUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

function isPlatform(p: unknown): p is SocialPlatform {
  return typeof p === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_PLATFORMS, p);
}

/**
 * Read a site.json value. Never throws: anything missing falls back to the
 * default, and anything wrong is dropped and reported as an issue.
 * Empty URLs are allowed and simply hide the button.
 */
export function parseSiteConfig(raw: unknown, where = "content/site.json"): { config: SiteConfig; issues: Issue[] } {
  const config = defaultSiteConfig();
  const issues: Issue[] = [];
  if (raw === undefined || raw === null) return { config, issues };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({ level: "error", where, message: "site.json must be a JSON object." });
    return { config, issues };
  }
  const r = raw as Record<string, unknown>;

  const text = r.text && typeof r.text === "object" && !Array.isArray(r.text) ? (r.text as Record<string, unknown>) : {};
  for (const f of SITE_TEXT_FIELDS) {
    const v = text[f.key];
    if (v === undefined) continue;
    if (typeof v !== "string") {
      issues.push({ level: "error", where, message: `text.${f.key} must be text.` });
      continue;
    }
    const t = v.trim();
    if (t.length > f.max) issues.push({ level: "error", where, message: `text.${f.key} is longer than ${f.max} characters.` });
    else if (t || f.key !== "title") config.text[f.key] = t;
  }

  if (r.donate !== undefined) {
    const d = r.donate as Record<string, unknown>;
    if (!d || typeof d !== "object") issues.push({ level: "error", where, message: "donate must be an object with label and url." });
    else {
      if (typeof d.label === "string" && d.label.trim()) config.donate.label = d.label.trim().slice(0, 40);
      const url = typeof d.url === "string" ? d.url.trim() : "";
      if (url && !isSafeLinkUrl(url)) issues.push({ level: "error", where, message: `donate.url must start with https:// (got "${url}").` });
      else config.donate.url = url;
    }
  }

  if (r.socials !== undefined) {
    if (!Array.isArray(r.socials)) issues.push({ level: "error", where, message: "socials must be a list." });
    else {
      for (const [i, s] of r.socials.entries()) {
        const at = `socials[${i}]`;
        const item = (s ?? {}) as Record<string, unknown>;
        if (!isPlatform(item.platform)) {
          issues.push({ level: "error", where, message: `${at}: unknown platform "${String(item.platform)}". Use one of ${Object.keys(SOCIAL_PLATFORMS).join(", ")}.` });
          continue;
        }
        const url = typeof item.url === "string" ? item.url.trim() : "";
        if (!url) continue; // placeholder: hidden until filled in
        if (!isSafeLinkUrl(url)) {
          issues.push({ level: "error", where, message: `${at}: url must start with https:// (got "${url}").` });
          continue;
        }
        if (config.socials.length >= MAX_SOCIALS) {
          issues.push({ level: "warning", where, message: `Only the first ${MAX_SOCIALS} social links are shown.` });
          break;
        }
        const label = typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 40) : undefined;
        config.socials.push(label ? { platform: item.platform, url, label } : { platform: item.platform, url });
      }
    }
  }
  return { config, issues };
}

/** Name shown on a social button. */
export function socialLabel(link: SocialLink): string {
  return link.label || SOCIAL_PLATFORMS[link.platform];
}
