import { DEFAULT_TIMER_SECONDS, MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, validateQuestion, type Issue, type Question } from "@kiss-n-tell/engine";
import { useMemo, useRef, useState } from "react";
import { newQuestion, type PackDraft } from "../pack/index.js";
import { NumberField, TextField, WordListField } from "./fields.js";
import { IssueList } from "./IssueList.js";

interface Props {
  draft: PackDraft;
  selected: number;
  onSelect: (index: number) => void;
  onChange: (fn: (d: PackDraft) => void) => void;
  onImportCsv: (file: File) => void;
  onExportCsv: () => void;
}

function questionIssues(q: Question): Issue[] {
  return validateQuestion(q, `question ${q.id}`);
}

export function QuestionsPanel({ draft, selected, onSelect, onChange, onImportCsv, onExportCsv }: Props) {
  const [filter, setFilter] = useState("");
  const csvInput = useRef<HTMLInputElement>(null);
  const questions = draft.questions;
  const current = questions[selected];
  const issuesById = useMemo(() => new Map(questions.map((q) => [q.id, questionIssues(q)])), [questions]);
  const dupIds = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const q of questions) (seen.has(q.id) ? dup : seen).add(q.id);
    return dup;
  }, [questions]);

  const visible = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => {
      const f = filter.trim().toLowerCase();
      if (!f) return true;
      return (
        q.prompt.toLowerCase().includes(f) ||
        q.id.includes(f) ||
        [...q.answers.common, ...q.answers.rare, ...q.answers.legendary].some((a) => a.toLowerCase() === f)
      );
    });

  const add = () => {
    const q = newQuestion(questions.map((x) => x.id));
    onChange((d) => void d.questions.push(q));
    onSelect(questions.length);
    setFilter("");
    // Focus the prompt of the new question once it renders.
    setTimeout(() => document.getElementById("ed-q-prompt")?.focus(), 0);
  };

  const move = (delta: number) => {
    const to = selected + delta;
    if (!current || to < 0 || to >= questions.length) return;
    onChange((d) => {
      const [q] = d.questions.splice(selected, 1);
      d.questions.splice(to, 0, q as Question);
    });
    onSelect(to);
  };

  const duplicate = () => {
    if (!current) return;
    const copy = newQuestion(questions.map((x) => x.id));
    onChange((d) =>
      void d.questions.splice(selected + 1, 0, {
        ...copy,
        prompt: current.prompt,
        timerSeconds: current.timerSeconds,
        answers: { common: [...current.answers.common], rare: [...current.answers.rare], legendary: [...current.answers.legendary] },
      }),
    );
    onSelect(selected + 1);
  };

  const remove = () => {
    if (!current) return;
    onChange((d) => void d.questions.splice(selected, 1));
    onSelect(Math.max(0, Math.min(selected, questions.length - 2)));
  };

  const set = (fn: (q: Question) => void) => onChange((d) => fn(d.questions[selected] as Question));

  return (
    <div className="ed-questions">
      <aside className="ed-qlist" aria-label="Questions">
        <div className="ed-qlist__tools">
          <button type="button" className="btn btn--primary btn--small" onClick={add}>Add question</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => csvInput.current?.click()}>Import CSV…</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onExportCsv} disabled={questions.length === 0}>Export CSV</button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            data-testid="csv-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onImportCsv(f);
            }}
          />
        </div>
        <input
          className="ed-input ed-qlist__filter"
          type="search"
          placeholder="Filter by prompt, id or answer"
          aria-label="Filter questions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <p className="ed-qlist__count muted">
          {questions.length} question{questions.length === 1 ? "" : "s"}
          {filter && ` · ${visible.length} shown`}
        </p>
        {questions.length === 0 ? (
          <p className="ed-empty">No questions yet. Add one, or import a questions.csv written in a spreadsheet.</p>
        ) : (
          <ol className="ed-qlist__items">
            {visible.map(({ q, i }) => {
              const iss = issuesById.get(q.id) ?? [];
              const hasError = iss.some((x) => x.level === "error") || dupIds.has(q.id);
              return (
                <li key={`${q.id}-${i}`}>
                  <button
                    type="button"
                    className={`ed-qitem${i === selected ? " ed-qitem--on" : ""}`}
                    aria-current={i === selected ? "true" : undefined}
                    onClick={() => onSelect(i)}
                  >
                    <span className="ed-qitem__num">{i + 1}</span>
                    <span className="ed-qitem__prompt">{q.prompt || <em className="muted">No prompt yet</em>}</span>
                    <span className="ed-qitem__counts" aria-label={`${q.answers.common.length} common, ${q.answers.rare.length} rare, ${q.answers.legendary.length} legendary`}>
                      <span className="t-common">{q.answers.common.length}</span>
                      <span className="t-rare">{q.answers.rare.length}</span>
                      <span className="t-legendary">{q.answers.legendary.length}</span>
                    </span>
                    {hasError && <span className="ed-dot ed-dot--error" title="Has errors" aria-label="Has errors" />}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </aside>

      <section className="ed-qedit" aria-label="Edit question">
        {!current ? (
          <p className="ed-empty">Select a question to edit it.</p>
        ) : (
          <>
            <div className="ed-qedit__head">
              <h3 className="ed-card__title">Question {selected + 1}</h3>
              <div className="ed-row">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => move(-1)} disabled={selected === 0} aria-label="Move question up">Move up</button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => move(1)} disabled={selected >= questions.length - 1} aria-label="Move question down">Move down</button>
                <button type="button" className="btn btn--ghost btn--small" onClick={duplicate}>Duplicate</button>
                <button type="button" className="btn btn--danger btn--small" onClick={remove}>Delete</button>
              </div>
            </div>
            <div className="ed-grid">
              <div className="ed-grid__wide">
                <label htmlFor="ed-q-prompt" className="ed-field__label">Prompt</label>
                <textarea
                  id="ed-q-prompt"
                  className="ed-input ed-input--area"
                  rows={2}
                  maxLength={200}
                  value={current.prompt}
                  placeholder="e.g. Name an Olympian god"
                  onChange={(e) => set((q) => void (q.prompt = e.target.value))}
                />
              </div>
              <TextField
                label="Question id"
                mono
                value={current.id}
                maxLength={64}
                hint="Used to remember which questions a player has seen."
                onChange={(v) => set((q) => void (q.id = v.trim().toLowerCase()))}
              />
              <NumberField
                label="Timer (seconds)"
                min={MIN_TIMER_SECONDS}
                max={MAX_TIMER_SECONDS}
                value={current.timerSeconds}
                hint={`Default ${DEFAULT_TIMER_SECONDS}. Between ${MIN_TIMER_SECONDS} and ${MAX_TIMER_SECONDS}.`}
                onChange={(v) => set((q) => void (q.timerSeconds = v ?? Number.NaN))}
              />
            </div>
            <p className="ed-hint">
              One word per answer, one per line (pasting a comma-separated list works too). Players must spell it exactly; capitals and accents don't matter.
            </p>
            <div className="ed-tiers">
              <WordListField
                label={<><b className="t-common">Common</b> +1</>}
                tierClass="ed-words--common"
                listKey={`${selected}-common`}
                value={current.answers.common}
                onChange={(v) => set((q) => void (q.answers.common = v))}
              />
              <WordListField
                label={<><b className="t-rare">Rare</b> +2</>}
                tierClass="ed-words--rare"
                listKey={`${selected}-rare`}
                value={current.answers.rare}
                onChange={(v) => set((q) => void (q.answers.rare = v))}
              />
              <WordListField
                label={<><b className="t-legendary">Legendary</b> +3</>}
                tierClass="ed-words--legendary"
                listKey={`${selected}-legendary`}
                value={current.answers.legendary}
                onChange={(v) => set((q) => void (q.answers.legendary = v))}
              />
            </div>
            <IssueList
              issues={[
                ...(issuesById.get(current.id) ?? []),
                ...(dupIds.has(current.id) ? [{ level: "error" as const, where: `question ${current.id}`, message: `Another question also uses the id "${current.id}".` }] : []),
              ]}
              empty="This question looks good."
            />
          </>
        )}
      </section>
    </div>
  );
}
