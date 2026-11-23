import { drawQuestions, startRun, summarize, type RunState } from "@kiss-n-tell/engine";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadManifest, preloadImages, type GameTopic, type Manifest } from "./content.js";
import { AgeGate } from "./screens/AgeGate.js";
import { Home } from "./screens/Home.js";
import { Play } from "./screens/Play.js";
import { Results } from "./screens/Results.js";
import { storage } from "./storage.js";

export interface AppFeatures {
  /** Show the local pack editor (desktop only). */
  editor: boolean;
}

/** What the host's editor can ask the game shell to do. */
export interface EditorHost {
  /** Leave the editor and go back to the topic list. */
  close: () => void;
}

export interface AppLinks {
  source?: string;
  downloads?: string;
}

interface Props {
  contentUrl: string;
  features: AppFeatures;
  links?: AppLinks;
  /** Shown on share cards. */
  siteLabel?: string;
  /** Extra topics supplied by the host (desktop: the player's own packs), listed after the presets. */
  localTopics?: GameTopic[];
  /** Renders the pack editor. Only used when `features.editor` is on. */
  renderEditor?: (host: EditorHost) => ReactNode;
  /** Host override for saving files such as the share card. Resolves to a description of where it went. */
  saveFile?: (blob: Blob, filename: string) => Promise<string>;
}

type Screen =
  | { kind: "home" }
  | { kind: "editor" }
  | { kind: "play"; topic: GameTopic; run: RunState; key: number }
  | { kind: "results"; topic: GameTopic; run: RunState; isNewBest: boolean };

export function App({ contentUrl, features, links, siteLabel, localTopics, renderEditor, saveFile }: Props) {
  const [adult, setAdult] = useState(() => storage.isAdultConfirmed());
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [attempt, setAttempt] = useState(0);
  const [quitRequest, setQuitRequest] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    loadManifest(contentUrl, ctrl.signal)
      .then((m) => {
        setManifest(m);
        preloadImages(m.topics.map((t) => t.character.stages[0] as string));
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [contentUrl, attempt]);

  // Scroll to top and set the tab title on every screen change.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title =
      screen.kind === "home" ? "Kiss N Tell" : screen.kind === "editor" ? "Pack editor · Kiss N Tell" : `${screen.topic.title} · Kiss N Tell`;
  }, [screen]);

  // Browser Back: from a run it asks before leaving; from results it goes home.
  // Each non-home screen gets one history entry so Back never leaves the site mid-game.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const leavingRef = useRef(false);
  useEffect(() => {
    if (screen.kind !== "home" && !window.history.state?.knt) {
      window.history.pushState({ knt: true }, "");
    }
  }, [screen]);
  useEffect(() => {
    const onPop = () => {
      if (leavingRef.current) {
        leavingRef.current = false;
        return;
      }
      const current = screenRef.current;
      if (current.kind === "play") {
        window.history.pushState({ knt: true }, "");
        setQuitRequest((n) => n + 1);
      } else if (current.kind === "editor") {
        // The editor may hold unsaved work; it has its own Back button that asks first.
        window.history.pushState({ knt: true }, "");
      } else if (current.kind === "results") {
        setScreen({ kind: "home" });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const play = useCallback((topic: GameTopic) => {
    const { questions, restarted } = drawQuestions(topic.questions, storage.getSeen(topic.id), Math.random);
    if (restarted) storage.setSeen(topic.id, []);
    preloadImages(topic.character.stages);
    setScreen({ kind: "play", topic, run: startRun(topic.id, questions, Date.now()), key: Date.now() });
  }, []);

  const markSeen = useCallback((topicId: string, questionId: string) => {
    const seen = storage.getSeen(topicId).filter((id) => id !== questionId);
    storage.setSeen(topicId, [...seen, questionId]);
  }, []);

  const finish = useCallback((topic: GameTopic, run: RunState) => {
    const s = summarize(run);
    const isNewBest = storage.recordScore(topic.id, s.score, s.won);
    setScreen({ kind: "results", topic, run, isNewBest });
  }, []);

  const home = useCallback(() => {
    // Drop our history entry so Back from home leaves the site as expected.
    if (window.history.state?.knt) {
      leavingRef.current = true;
      window.history.back();
    }
    setScreen({ kind: "home" });
  }, []);
  const editorEnabled = features.editor && !!renderEditor;
  const openEditor = useCallback(() => setScreen({ kind: "editor" }), []);
  const topics = useMemo(
    () => [...(manifest?.topics ?? []), ...(localTopics ?? []).map((t) => ({ ...t, local: true }))],
    [manifest, localTopics],
  );
  const label = siteLabel ?? (typeof window !== "undefined" ? window.location.host || "Kiss N Tell" : "Kiss N Tell");

  if (!adult) {
    return (
      <AgeGate
        onConfirm={() => {
          storage.confirmAdult();
          setAdult(true);
        }}
      />
    );
  }
  if (error) {
    return (
      <main className="center">
        <h1 className="logo logo--small">Kiss N Tell</h1>
        <p role="alert">{error}</p>
        <button className="btn btn--primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      </main>
    );
  }
  if (!manifest) {
    return (
      <main className="center" aria-busy="true">
        <h1 className="logo logo--small">Kiss N Tell</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  switch (screen.kind) {
    case "home":
      return <Home topics={topics} links={links} onPlay={play} onOpenEditor={editorEnabled ? openEditor : undefined} />;
    case "editor":
      return editorEnabled && renderEditor ? <>{renderEditor({ close: home })}</> : null;
    case "play":
      return (
        <Play
          key={screen.key}
          topic={screen.topic}
          initialRun={screen.run}
          onQuestionShown={(id) => markSeen(screen.topic.id, id)}
          onFinish={(run) => finish(screen.topic, run)}
          onQuit={home}
          quitRequest={quitRequest}
        />
      );
    case "results":
      return (
        <Results
          topic={screen.topic}
          run={screen.run}
          isNewBest={screen.isNewBest}
          siteLabel={label}
          onReplay={() => play(screen.topic)}
          onHome={home}
          saveFile={saveFile}
        />
      );
  }
}
