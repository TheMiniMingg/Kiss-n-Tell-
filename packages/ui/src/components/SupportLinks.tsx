import { socialLabel, type SiteConfig } from "@kiss-n-tell/engine";

/** Donate button and social media links from the site settings. Renders nothing until a URL is set. */
export function SupportLinks({ site, compact = false }: { site: SiteConfig; compact?: boolean }) {
  const { donate, socials, text } = site;
  if (!donate.url && socials.length === 0) return null;
  return (
    <section className={`support${compact ? " support--compact" : ""}`} aria-label="Support and social links">
      {text.supportText && <p className="support__text">{text.supportText}</p>}
      <div className="support__links">
        {donate.url && (
          <a className="btn btn--donate" href={donate.url} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">♥</span> {donate.label}
          </a>
        )}
        {socials.map((s, i) => (
          <a
            key={`${s.platform}-${i}`}
            className={`social social--${s.platform}`}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer me"
          >
            {socialLabel(s)}
          </a>
        ))}
      </div>
    </section>
  );
}
