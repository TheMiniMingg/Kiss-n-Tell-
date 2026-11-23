import {
  checkTimeout,
  currentQuestion,
  nextQuestion,
  stageForScore,
  submitAnswer,
  timeLeftMs,
  type Rejection,
  type RunState,
} from "@kiss-n-tell/engine";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { GameTopic } from "../content.js";
import { Modal } from "../components/Modal.js";
import { StageMeter, StageViewer } from "../components/StageViewer.js";
import { TierBadge } from "../components/TierBadge.js";

const REJECTION_TEXT: Record<Rejection, string> = {
  blank: "Type an answer first.",
  too_short: "One letter isn't an answer. Try a full word.",
  multiple_words: "One word only. Remove the spaces.",
  not_accepting: "This question is already answered.",
};

/** Ignore "Next" presses this soon after an answer, so a held or double Enter can't skip the feedback. */
const ADVANCE_GUARD_MS = 350;
const TICK_MS = 100;

interface Props {
  topic: GameTopic;
  initialRun: RunState;
  onQuestionShown: (questionId: string) => void;
  onFinish: (run: RunState) => void;
  onQuit: () => void;
}

export function Play({ topic, initialRun, onQuestionShown, onFinish, onQuit }: Props) {
  const [run, setRun] = useState(initialRun);
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState("");
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const resolvedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const q = currentQuestion(run);
  const answering = run.phase === "question";
  const last = run.results[run.results.length - 1];
  const showingResult = !answering && last?.questionId === q.id;
  const stage = stageForScore(run.score);
  const justWon = showingResult && run.wonAtQuestion === run.index + 1;

  // Record each question as seen when it is shown (once per question).
  const shownRef = useRef(onQuestionShown);
  shownRef.current = onQuestionShown;
  useEffect(() => {
    shownRef.current(q.id);
  }, [q.id]);

  // Timer: a deadline, so it keeps running while the tab is hidden.
  useEffect(() => {
    if (!answering) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setRun((r) => {
        const res = checkTimeout(r, t);
        if (res.result) resolvedAt.current = t;
        return res.state;
      });
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [answering, run.index]);

  // Focus management.
  useEffect(() => {
    if (answering) inputRef.current?.focus();
    else nextRef.current?.focus();
  }, [answering, run.index]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = Date.now();
    const r = submitAnswer(run, input, t);
    if (!r.accepted) {
      setRejection(r.reason);
      inputRef.current?.focus();
      return;
    }
    resolvedAt.current = t;
    setRejection(null);
    setInput("");
    setRun(r.state);
  };

  const advance = useCallback(() => {
    if (Date.now() - resolvedAt.current < ADVANCE_GUARD_MS) return;
    if (run.phase === "finished") onFinish(run);
    else setRun((r) => nextQuestion(r, Date.now()));
  }, [run, onFinish]);

  const msLeft = timeLeftMs(run, now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const fraction = answering ? msLeft / (q.timerSeconds * 1000) : 0;
  const urgent = answering && msLeft <= 5000;

  return (
    <main className="play">
      <header className="play__bar">
        <button className="btn btn--ghost btn--small" onClick={() => setConfirmQuit(true)}>
          <span aria-hidden="true">←</span> Quit
        </button>
        <div className="play__topic">{topic.title}</div>
        <div className="play__stats">
          <span className="stat">
            <span className="stat__label">Question</span>
            <span className="stat__value">{run.index + 1}/{run.questions.length}</span>
          </span>
          <span className="stat">
            <span className="stat__label">Score</span>
            <span className="stat__value" data-testid="score">{run.score}</span>
          </span>
        </div>
      </header>

      <div className="play__layout">
        <div className="play__art">
          <StageViewer character={topic.character} stage={stage} celebrate={justWon} />
          <StageMeter stage={stage} />
        </div>

        <section className="panel" aria-live="polite">
          <p className="panel__kicker">Question {run.index + 1}</p>
          <h1 className="panel__prompt">{q.prompt}</h1>

          {answering ? (
            <form className="answer" onSubmit={submit} noValidate>
              <div
                className={`timer${urgent ? " timer--urgent" : ""}`}
                role="timer"
                aria-label={`${secondsLeft} seconds left`}
              >
                <div className="timer__bar" style={{ transform: `scaleX(${fraction})` }} />
                <span className="timer__text" aria-hidden="true">{secondsLeft}s</span>
              </div>
              <label className="sr-only" htmlFor="answer">Your answer (one word)</label>
              <div className="answer__row">
                <input
                  id="answer"
                  ref={inputRef}
                  className="answer__input"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (rejection) setRejection(null);
                  }}
                  placeholder="One word"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  maxLength={40}
                  aria-invalid={rejection ? true : undefined}
                  aria-describedby={rejection ? "answer-error" : "answer-hint"}
                />
                <button className="btn btn--primary" type="submit">Submit</button>
              </div>
              {rejection ? (
                <p id="answer-error" className="answer__error" role="alert">{REJECTION_TEXT[rejection]}</p>
              ) : (
                <p id="answer-hint" className="answer__hint">One guess. Rarer answers score more.</p>
              )}
            </form>
          ) : (
            last && (
              <div className="result" data-testid="result">
                <TierBadge outcome={last.outcome} points={last.points} large />
                {last.input && <p className="result__answer">You said <b>{last.input}</b></p>}
                {justWon && <p className="result__win">Ending unlocked! Keep going to raise your score.</p>}
                <button ref={nextRef} className="btn btn--primary btn--wide" onClick={advance}>
                  {run.phase === "finished" ? "See results" : "Next question"}
                </button>
              </div>
            )
          )}
        </section>
      </div>

      {confirmQuit && (
        <Modal
          title="Leave this run?"
          onClose={() => setConfirmQuit(false)}
          actions={
            <>
              <button className="btn btn--ghost" data-autofocus onClick={() => setConfirmQuit(false)}>Keep playing</button>
              <button className="btn btn--danger" onClick={onQuit}>Leave</button>
            </>
          }
        >
          <p>Your score for this run won't be saved. The timer keeps running while this is open.</p>
        </Modal>
      )}
    </main>
  );
}
