import { MAX_SCORE, QUESTIONS_PER_RUN, WIN_SCORE, type SiteConfig } from "@kiss-n-tell/engine";
import { useState } from "react";
import type { GameTopic } from "../content.js";
import { storage } from "../storage.js";
import type { AppLinks, EditorEntry } from "../App.js";
import { SupportLinks } from "../components/SupportLinks.js";

interface Props {
  topics: GameTopic[];
  links?: AppLinks;
  site: SiteConfig;
  onPlay: (topic: GameTopic) => void;
  /** Open the editor (desktop pack editor, or the website's owner mode). */
  editor?: EditorEntry & { open: () => void };
}

export function Home({ topics, links, site, onPlay, editor }: Props) {
  const [showRules, setShowRules] = useState(false);
  const { text } = site;
  return (
    <main className="home">
      <header className="home__hero">
        <h1 className="logo">{text.title}</h1>
        {text.tagline && <p className="home__tagline">{text.tagline}</p>}
        <button className="link-btn" aria-expanded={showRules} aria-controls="rules" onClick={() => setShowRules((s) => !s)}>
          {showRules ? "Hide how to play" : "How to play"}
        </button>
        {showRules && (
          <ul id="rules" className="rules">
            <li>Pick a topic. You get {QUESTIONS_PER_RUN} random questions from it.</li>
            <li>Type one word per question before the timer runs out. You only get one guess, so check your spelling.</li>
            <li>
              <b className="t-common">Common</b> answers are worth +1, <b className="t-rare">Rare</b> +2 and <b className="t-legendary">Legendary</b> +3.
              Anything not on the list scores 0.
            </li>
            <li>Every point moves the character one stage. Reach {WIN_SCORE} points to unlock the ending.</li>
            <li>Keep answering after you win to push your score toward {MAX_SCORE}, then share your result.</li>
          </ul>
        )}
      </header>

      <section aria-labelledby="topics-title">
        <div className="home__topics-head">
          <h2 id="topics-title" className="section-title">{text.topicsHeading || "Choose a topic"}</h2>
          {editor?.placement === "topics" && (
            <button className="btn btn--ghost btn--small" onClick={editor.open}>{editor.label}</button>
          )}
        </div>
        {topics.length === 0 ? (
          <p className="muted">No topics are available yet.</p>
        ) : (
          <ul className="topics">
            {topics.map((t) => {
              const best = storage.getBest(t.id);
              return (
                <li key={t.id} className="topic">
                  <button className="topic__btn" onClick={() => onPlay(t)} aria-label={`Play ${t.title}`}>
                    <img className="topic__thumb" src={t.character.stages[0]} alt="" loading="lazy" />
                    <span className="topic__body">
                      <span className="topic__title">
                        {t.title}
                        {t.sample && <span className="pill">Sample</span>}
                        {t.local && <span className="pill pill--mine">My pack</span>}
                      </span>
                      {t.description && <span className="topic__desc">{t.description}</span>}
                      <span className="topic__meta">
                        <span>{t.character.name}</span>
                        {best ? (
                          <span className={best.won ? "topic__best topic__best--won" : "topic__best"}>
                            Best {best.score}/{MAX_SCORE}
                            {best.score >= MAX_SCORE && t.character.secret ? " · secret unlocked" : best.won ? " · ending unlocked" : ""}
                          </span>
                        ) : (
                          <span className="topic__best">Not played yet</span>
                        )}
                      </span>
                      <span className="topic__play" aria-hidden="true">Play</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SupportLinks site={site} />

      <footer className="footer">
        {links?.source && <a href={links.source} target="_blank" rel="noreferrer">Source code on GitHub</a>}
        {links?.downloads && <a href={links.downloads} target="_blank" rel="noreferrer">Desktop downloads</a>}
        {text.footerNote && <span className="muted">{text.footerNote}</span>}
        {editor?.placement === "footer" && (
          <button type="button" className="link-btn footer__edit" onClick={editor.open}>{editor.label}</button>
        )}
      </footer>
    </main>
  );
}
