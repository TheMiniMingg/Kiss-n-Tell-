import { drawQuestions, startRun, type RunState } from "@kiss-n-tell/engine";
import { Play, Results, type GameTopic } from "@kiss-n-tell/ui";
import { useCallback, useEffect, useState } from "react";

interface Props {
  topic: GameTopic;
  onClose: () => void;
  /** Saves the share card (desktop: to Downloads). */
  saveFile?: (blob: Blob, filename: string) => Promise<string>;
}

type View = { kind: "play"; run: RunState; key: number } | { kind: "results"; run: RunState };

function newRun(topic: GameTopic): View {
  const { questions } = drawQuestions(topic.questions, [], Math.random);
  return { kind: "play", run: startRun(topic.id, questions, Date.now()), key: Date.now() };
}

/** A real run of the pack being edited, using the game's own screens. Nothing is recorded. */
export function PreviewRun({ topic, onClose, saveFile }: Props) {
  const [view, setView] = useState<View>(() => newRun(topic));
  const replay = useCallback(() => setView(newRun(topic)), [topic]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view.kind]);

  return (
    <div className="ed-preview" role="region" aria-label="Preview run">
      <div className="ed-preview__bar">
        <span>
          <b>Preview</b> <span className="muted">· {topic.title || "Untitled pack"} · scores aren't saved</span>
        </span>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>Back to editor</button>
      </div>
      {view.kind === "play" ? (
        <Play
          key={view.key}
          topic={topic}
          initialRun={view.run}
          onQuestionShown={() => undefined}
          onFinish={(run) => setView({ kind: "results", run })}
          onQuit={onClose}
        />
      ) : (
        <Results topic={topic} run={view.run} isNewBest={false} siteLabel="Kiss N Tell" onReplay={replay} onHome={onClose} saveFile={saveFile} />
      )}
    </div>
  );
}
