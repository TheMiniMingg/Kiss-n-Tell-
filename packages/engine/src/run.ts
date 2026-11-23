import { buildAnswerIndex, lookupTier, type AnswerIndex } from "./answers.js";
import { checkWord, normalizeAnswer } from "./normalize.js";
import {
  FINAL_STAGE,
  TIER_POINTS,
  WIN_SCORE,
  type Question,
  type QuestionResult,
  type Rejection,
} from "./types.js";

/**
 * Phases of a run:
 * - "question": a question is open and its timer is running.
 * - "feedback": the question is resolved; waiting for the player to continue.
 * - "finished": all questions are resolved.
 */
export type RunPhase = "question" | "feedback" | "finished";

export interface RunState {
  readonly topicId: string;
  readonly questions: readonly Question[];
  /** Index of the current (or last) question. */
  readonly index: number;
  readonly phase: RunPhase;
  readonly score: number;
  readonly results: readonly QuestionResult[];
  /** Epoch ms when the current question times out (only in "question"). */
  readonly deadline: number | null;
  /** 1-based question number on which the score first reached WIN_SCORE, or null. */
  readonly wonAtQuestion: number | null;
}

export type SubmitResult =
  | { accepted: true; state: RunState; result: QuestionResult }
  | { accepted: false; state: RunState; reason: Rejection };

const indexCache = new WeakMap<Question, AnswerIndex>();
function indexFor(q: Question): AnswerIndex {
  let idx = indexCache.get(q);
  if (!idx) {
    idx = buildAnswerIndex(q);
    indexCache.set(q, idx);
  }
  return idx;
}

/** The stage image to show for a score. The ending (stage 10) shows as soon as the score reaches 10. */
export function stageForScore(score: number): number {
  return Math.max(0, Math.min(FINAL_STAGE, Math.floor(score)));
}

export function hasWon(score: number): boolean {
  return score >= WIN_SCORE;
}

export function startRun(topicId: string, questions: readonly Question[], now: number): RunState {
  if (questions.length === 0) throw new Error("A run needs at least one question.");
  const first = questions[0] as Question;
  return {
    topicId,
    questions,
    index: 0,
    phase: "question",
    score: 0,
    results: [],
    deadline: now + first.timerSeconds * 1000,
    wonAtQuestion: null,
  };
}

export function currentQuestion(state: RunState): Question {
  return state.questions[state.index] as Question;
}

/** Milliseconds left on the current question (0 when not in "question"). */
export function timeLeftMs(state: RunState, now: number): number {
  if (state.phase !== "question" || state.deadline === null) return 0;
  return Math.max(0, state.deadline - now);
}

function resolve(state: RunState, input: string, outcome: QuestionResult["outcome"]): { state: RunState; result: QuestionResult } {
  const q = currentQuestion(state);
  const points = outcome === "miss" || outcome === "timeout" ? 0 : TIER_POINTS[outcome];
  const score = state.score + points;
  const result: QuestionResult = {
    questionId: q.id,
    prompt: q.prompt,
    input,
    outcome,
    points,
    scoreAfter: score,
  };
  const wonAtQuestion =
    state.wonAtQuestion ?? (hasWon(score) ? state.index + 1 : null);
  const isLast = state.index >= state.questions.length - 1;
  return {
    result,
    state: {
      ...state,
      score,
      results: [...state.results, result],
      phase: isLast ? "finished" : "feedback",
      deadline: null,
      wonAtQuestion,
    },
  };
}

/**
 * Submit an answer. Blank, one-letter and multi-word inputs are rejected and
 * do NOT consume the question. Any other word consumes it: a listed word
 * scores its tier, an unlisted word (including typos) scores 0.
 * A submission at or after the deadline resolves as a timeout.
 */
export function submitAnswer(state: RunState, rawInput: string, now: number): SubmitResult {
  if (state.phase !== "question") return { accepted: false, state, reason: "not_accepting" };
  if (state.deadline !== null && now >= state.deadline) {
    const r = resolve(state, "", "timeout");
    return { accepted: true, ...r };
  }
  const normalized = normalizeAnswer(rawInput);
  const problem = checkWord(normalized);
  if (problem) return { accepted: false, state, reason: problem };
  const tier = lookupTier(indexFor(currentQuestion(state)), normalized);
  const r = resolve(state, rawInput.trim(), tier ?? "miss");
  return { accepted: true, ...r };
}

/** Resolve the current question as a timeout if its deadline has passed. No-op otherwise. */
export function checkTimeout(state: RunState, now: number): { state: RunState; result: QuestionResult | null } {
  if (state.phase !== "question" || state.deadline === null || now < state.deadline) {
    return { state, result: null };
  }
  return resolve(state, "", "timeout");
}

/** Move from feedback to the next question and start its timer. */
export function nextQuestion(state: RunState, now: number): RunState {
  if (state.phase !== "feedback") return state;
  const index = state.index + 1;
  const q = state.questions[index] as Question;
  return { ...state, index, phase: "question", deadline: now + q.timerSeconds * 1000 };
}

export interface RunSummary {
  score: number;
  maxScore: number;
  won: boolean;
  stage: number;
  wonAtQuestion: number | null;
  counts: Record<QuestionResult["outcome"], number>;
}

export function summarize(state: RunState): RunSummary {
  const counts = { common: 0, rare: 0, legendary: 0, miss: 0, timeout: 0 };
  for (const r of state.results) counts[r.outcome]++;
  return {
    score: state.score,
    maxScore: state.questions.length * TIER_POINTS.legendary,
    won: hasWon(state.score),
    stage: stageForScore(state.score),
    wonAtQuestion: state.wonAtQuestion,
    counts,
  };
}
