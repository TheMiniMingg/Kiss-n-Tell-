import { summarize, type RunState } from "@kiss-n-tell/engine";
import { useMemo, useRef, useState } from "react";
import type { GameTopic } from "../content.js";
import { StageViewer } from "../components/StageViewer.js";
import { TierBadge } from "../components/TierBadge.js";
import {
  canCopyImage,
  canNativeShareFiles,
  copyCard,
  downloadBlob,
  nativeShare,
  renderShareCard,
} from "../share.js";

interface Props {
  topic: GameTopic;
  run: RunState;
  isNewBest: boolean;
  siteLabel: string;
  onReplay: () => void;
  onHome: () => void;
}

export function Results({ topic, run, isNewBest, siteLabel, onReplay, onHome }: Props) {
  const summary = useMemo(() => summarize(run), [run]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<Promise<Blob> | null>(null);

  const makeCard = () => {
    cardRef.current ??= renderShareCard({
      imageUrl: topic.character.stages[summary.stage] as string,
      topicTitle: topic.title,
      characterName: topic.character.name,
      summary,
      siteLabel,
    });
    return cardRef.current;
  };

  const act = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await fn());
    } catch (e) {
      cardRef.current = null;
      setStatus(`Sorry, that didn't work: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const shareText = `I scored ${summary.score}/${summary.maxScore} on ${topic.title} in Kiss N Tell${summary.won ? " and unlocked the ending" : ""}.`;

  return (
    <main className="results">
      <div className="results__layout">
        <div className="results__art">
          <StageViewer character={topic.character} stage={summary.stage} celebrate={summary.won} />
        </div>
        <section className="panel">
          <p className="panel__kicker">{topic.title}</p>
          <h1 className="results__title">{summary.won ? "Ending unlocked!" : "So close"}</h1>
          <p className="results__score">
            <span className="results__num" data-testid="final-score">{summary.score}</span>
            <span className="results__max">/ {summary.maxScore} points</span>
            {isNewBest && <span className="pill pill--accent">New best</span>}
          </p>
          <p className="muted">
            {summary.won
              ? summary.wonAtQuestion && summary.wonAtQuestion < run.questions.length
                ? `You reached 10 points on question ${summary.wonAtQuestion}.`
                : "You reached 10 points on the last question."
              : `You reached stage ${summary.stage} of 10. You need 10 points to unlock the ending.`}
          </p>

          <div className="share" role="group" aria-label="Share your result">
            {canCopyImage() && (
              <button className="btn btn--primary" disabled={busy} onClick={() => act(async () => {
                const r = await copyCard(makeCard);
                return r === "copied" ? "Image copied. Paste it anywhere." : "Copying isn't supported here, so the image was downloaded.";
              })}>Copy image</button>
            )}
            <button className={`btn ${canCopyImage() ? "btn--ghost" : "btn--primary"}`} disabled={busy} onClick={() => act(async () => {
              downloadBlob(await makeCard(), `kiss-n-tell-${topic.id}-${summary.score}.png`);
              return "Image downloaded.";
            })}>Download image</button>
            {canNativeShareFiles() && (
              <button className="btn btn--ghost" disabled={busy} onClick={() => act(async () => {
                const r = await nativeShare(await makeCard(), shareText);
                return r === "shared" ? "Shared." : null;
              })}>Share…</button>
            )}
          </div>
          <p className="share__status" role="status">{status}</p>

          <ol className="breakdown">
            {run.results.map((r, i) => (
              <li key={r.questionId} className="breakdown__row">
                <span className="breakdown__num">{i + 1}</span>
                <span className="breakdown__q">
                  <span className="breakdown__prompt">{r.prompt}</span>
                  <span className="breakdown__answer">{r.input ? r.input : "No answer"}</span>
                </span>
                <TierBadge outcome={r.outcome} points={r.points} />
              </li>
            ))}
          </ol>

          <div className="results__actions">
            <button className="btn btn--primary" onClick={onReplay}>Play {topic.title} again</button>
            <button className="btn btn--ghost" onClick={onHome}>Choose another topic</button>
          </div>
        </section>
      </div>
    </main>
  );
}
