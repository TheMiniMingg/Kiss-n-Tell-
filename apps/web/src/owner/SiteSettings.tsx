import {
  MAX_SOCIALS,
  SITE_TEXT_FIELDS,
  SOCIAL_PLATFORMS,
  defaultSiteConfig,
  isSafeLinkUrl,
  parseSiteConfig,
  type SiteText,
  type SocialPlatform,
} from "@kiss-n-tell/engine";
import { Field, TextField } from "@kiss-n-tell/editor";
import { SupportLinks } from "@kiss-n-tell/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SITE_FILE, type SiteStore } from "./siteStore.js";

/** What the form edits. Socials keep rows with empty URLs (placeholders) so they can be filled in later. */
interface Draft {
  text: SiteText;
  donate: { label: string; url: string };
  socials: { platform: SocialPlatform; url: string; label: string }[];
}

function draftFrom(raw: unknown): Draft {
  const { config } = parseSiteConfig(raw);
  const r = (raw && typeof raw === "object" ? raw : {}) as { socials?: unknown; donate?: { url?: unknown } };
  // Keep placeholder rows (empty url) that parseSiteConfig leaves out.
  const socials = Array.isArray(r.socials)
    ? r.socials
        .filter((s): s is { platform: SocialPlatform; url?: unknown; label?: unknown } =>
          !!s && typeof s === "object" && Object.prototype.hasOwnProperty.call(SOCIAL_PLATFORMS, (s as { platform?: string }).platform ?? ""),
        )
        .map((s) => ({ platform: s.platform, url: typeof s.url === "string" ? s.url : "", label: typeof s.label === "string" ? s.label : "" }))
        .slice(0, MAX_SOCIALS)
    : [];
  // The raw donate URL too, so a bad link is shown (and can be fixed) rather than silently dropped.
  const donateUrl = typeof r.donate?.url === "string" ? r.donate.url : "";
  return { text: { ...config.text }, donate: { label: config.donate.label, url: donateUrl }, socials };
}

function toJson(d: Draft): string {
  const out = {
    text: Object.fromEntries(SITE_TEXT_FIELDS.map((f) => [f.key, d.text[f.key].trim()])),
    donate: { label: d.donate.label.trim() || "Donate", url: d.donate.url.trim() },
    socials: d.socials.map((s) => (s.label.trim() ? { platform: s.platform, url: s.url.trim(), label: s.label.trim() } : { platform: s.platform, url: s.url.trim() })),
  };
  return JSON.stringify(out, null, 2) + "\n";
}

const urlProblem = (url: string) => (url.trim() && !isSafeLinkUrl(url.trim()) ? "Use a full link that starts with https://" : null);

interface Props {
  store: SiteStore;
  onDirtyChange: (dirty: boolean) => void;
}

export function SiteSettings({ store, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const text = await store.readText(SITE_FILE);
      let raw: unknown = undefined;
      if (text) {
        try {
          raw = JSON.parse(text);
        } catch {
          setStatus({ tone: "error", text: "content/site.json isn't valid JSON, so the form starts from the defaults. Saving replaces it." });
        }
      }
      const d = draftFrom(raw ?? { ...defaultSiteConfig(), socials: [] });
      setDraft(d);
      setSavedJson(text && raw !== undefined ? toJson(d) : "");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [store]);

  useEffect(() => void load(), [load]);

  const json = useMemo(() => (draft ? toJson(draft) : ""), [draft]);
  const dirty = !!draft && json !== savedJson;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const problems = useMemo(() => {
    if (!draft) return [];
    const p: string[] = [];
    if (urlProblem(draft.donate.url)) p.push("Donate link");
    draft.socials.forEach((s, i) => urlProblem(s.url) && p.push(`Social link ${i + 1}`));
    return p;
  }, [draft]);

  const preview = useMemo(() => (draft ? parseSiteConfig(JSON.parse(json)).config : null), [draft, json]);

  const save = async () => {
    if (!draft || busy || problems.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const changed = await store.writeText(SITE_FILE, json, "update site text and links");
      setSavedJson(json);
      setStatus({ tone: "ok", text: changed ? "Saved. The live site shows it after the next deploy (usually 1 to 2 minutes)." : "Nothing changed." });
    } catch (e) {
      setStatus({ tone: "error", text: `Could not save: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  // Ctrl+S / Cmd+S saves here too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loadError) {
    return (
      <div className="owner-page">
        <p className="ed-status ed-status--error" role="alert">Could not load the site settings: {loadError}</p>
        <button type="button" className="btn btn--primary" onClick={() => void load()}>Try again</button>
      </div>
    );
  }
  if (!draft || !preview) return <div className="owner-page"><p className="muted" aria-busy="true">Loading…</p></div>;

  const set = (fn: (d: Draft) => void) =>
    setDraft((d) => {
      if (!d) return d;
      const next: Draft = { text: { ...d.text }, donate: { ...d.donate }, socials: d.socials.map((s) => ({ ...s })) };
      fn(next);
      return next;
    });

  return (
    <div className="owner-page">
      <header className="ed-head">
        <div className="ed-head__title">
          <h1>Site text &amp; links</h1>
          <span className={`pill ${dirty ? "pill--dirty" : ""}`}>{dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
        <div className="ed-row">
          <button type="button" className="btn btn--primary btn--small" onClick={() => void save()} disabled={busy || !dirty || problems.length > 0} title="Ctrl+S">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </header>
      {status && <p className={`ed-status ed-status--${status.tone}`} role="status">{status.text}</p>}
      {problems.length > 0 && <p className="ed-status ed-status--error" role="alert">Fix these links before saving: {problems.join(", ")}.</p>}

      <div className="ed-form">
        <section className="ed-card" aria-labelledby="site-text-h">
          <h2 id="site-text-h" className="ed-card__title">Text</h2>
          <div className="ed-grid">
            {SITE_TEXT_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                className="ed-grid__wide"
                value={draft.text[f.key]}
                maxLength={f.max}
                hint={f.key === "title" ? "Shown as the big logo and in the browser tab. Leave empty to use Kiss N Tell." : "Leave empty to hide it."}
                onChange={(v) => set((d) => void (d.text[f.key] = v))}
              />
            ))}
          </div>
        </section>

        <section className="ed-card" aria-labelledby="site-donate-h">
          <h2 id="site-donate-h" className="ed-card__title">Donate button</h2>
          <div className="ed-grid">
            <TextField label="Button text" value={draft.donate.label} maxLength={40} onChange={(v) => set((d) => void (d.donate.label = v))} />
            <TextField
              label="Donation link"
              mono
              value={draft.donate.url}
              placeholder="https://ko-fi.com/yourname"
              hint={urlProblem(draft.donate.url) ?? "Ko-fi, Patreon, Buy Me a Coffee, PayPal.me… Leave empty to hide the button."}
              onChange={(v) => set((d) => void (d.donate.url = v))}
            />
          </div>
        </section>

        <section className="ed-card" aria-labelledby="site-social-h">
          <div className="ed-row ed-row--between">
            <h2 id="site-social-h" className="ed-card__title">Social links</h2>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={draft.socials.length >= MAX_SOCIALS}
              onClick={() => set((d) => void d.socials.push({ platform: "instagram", url: "", label: "" }))}
            >
              Add link
            </button>
          </div>
          <p className="muted">Links with no URL are kept here but not shown to players.</p>
          {draft.socials.length === 0 ? (
            <p className="ed-empty">No social links yet.</p>
          ) : (
            <ol className="owner-socials">
              {draft.socials.map((s, i) => (
                <li key={i} className="owner-social">
                  <Field label={`Link ${i + 1}: platform`}>
                    {(id) => (
                      <select
                        id={id}
                        className="ed-input"
                        value={s.platform}
                        onChange={(e) => set((d) => void (d.socials[i]!.platform = e.target.value as SocialPlatform))}
                      >
                        {Object.entries(SOCIAL_PLATFORMS).map(([key, name]) => (
                          <option key={key} value={key}>{name}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <TextField
                    label="Profile link"
                    mono
                    value={s.url}
                    placeholder="https://"
                    hint={urlProblem(s.url) ?? undefined}
                    onChange={(v) => set((d) => void (d.socials[i]!.url = v))}
                  />
                  <TextField
                    label="Button text (optional)"
                    value={s.label}
                    maxLength={40}
                    placeholder={SOCIAL_PLATFORMS[s.platform]}
                    onChange={(v) => set((d) => void (d.socials[i]!.label = v))}
                  />
                  <div className="owner-social__actions">
                    <button type="button" className="btn btn--ghost btn--small" aria-label={`Move link ${i + 1} up`} disabled={i === 0} onClick={() => set((d) => void d.socials.splice(i - 1, 0, ...d.socials.splice(i, 1)))}>↑</button>
                    <button type="button" className="btn btn--ghost btn--small" aria-label={`Move link ${i + 1} down`} disabled={i === draft.socials.length - 1} onClick={() => set((d) => void d.socials.splice(i + 1, 0, ...d.socials.splice(i, 1)))}>↓</button>
                    <button type="button" className="btn btn--danger btn--small" aria-label={`Remove link ${i + 1}`} onClick={() => set((d) => void d.socials.splice(i, 1))}>Remove</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="ed-card" aria-labelledby="site-preview-h">
          <h2 id="site-preview-h" className="ed-card__title">Preview</h2>
          <p className="logo logo--small owner-preview__logo">{preview.text.title}</p>
          {preview.text.tagline && <p className="home__tagline">{preview.text.tagline}</p>}
          {preview.donate.url || preview.socials.length ? <SupportLinks site={preview} /> : <p className="muted">Add a donation or profile link to see the buttons.</p>}
        </section>
      </div>
    </div>
  );
}
