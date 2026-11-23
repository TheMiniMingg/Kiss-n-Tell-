/** The three answer tiers, in ascending rarity. */
export type Tier = "common" | "rare" | "legendary";

export const TIERS: readonly Tier[] = ["common", "rare", "legendary"] as const;

/** Points awarded per tier. Invalid answers and timeouts score 0. */
export const TIER_POINTS: Readonly<Record<Tier, number>> = {
  common: 1,
  rare: 2,
  legendary: 3,
};

/** Number of questions in one run. */
export const QUESTIONS_PER_RUN = 7;
/** Score needed to win and the stage index of the ending image. */
export const WIN_SCORE = 10;
export const FINAL_STAGE = 10;
/** Number of stage images per character: 00 (start) through 10 (ending). */
export const STAGE_COUNT = FINAL_STAGE + 1;
export const DEFAULT_TIMER_SECONDS = 20;
export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 120;
/** Highest possible score: a Legendary answer on every question. */
export const MAX_SCORE = QUESTIONS_PER_RUN * TIER_POINTS.legendary;

export interface Question {
  id: string;
  prompt: string;
  timerSeconds: number;
  answers: Record<Tier, string[]>;
}

export interface Character {
  id: string;
  name: string;
  /** Must be 18 or older. */
  age: number;
  description?: string;
  /** Where the art came from and under what terms. */
  assetRights?: string;
  /** Exactly 11 image URLs or relative paths, index = stage (0-10). */
  stages: string[];
}

export interface Topic {
  id: string;
  title: string;
  description?: string;
  character: Character;
  /** The full question pool. Each run draws QUESTIONS_PER_RUN of them. */
  questions: Question[];
}

/** Outcome of one question. */
export type Outcome = Tier | "miss" | "timeout";

export interface QuestionResult {
  questionId: string;
  prompt: string;
  /** What the player typed (empty on timeout). */
  input: string;
  outcome: Outcome;
  points: number;
  /** Score after this question. */
  scoreAfter: number;
}

/** Why a submission was not accepted. A rejected submission never consumes the question. */
export type Rejection =
  | "blank"
  | "too_short"
  | "multiple_words"
  | "not_accepting";
