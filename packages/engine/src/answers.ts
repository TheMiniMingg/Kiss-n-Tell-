import { normalizeAnswer } from "./normalize.js";
import { TIERS, type Question, type Tier } from "./types.js";

/** Map of normalized answer -> tier for one question. */
export type AnswerIndex = ReadonlyMap<string, Tier>;

/**
 * Build a lookup index for a question. If an answer appears in more than one
 * tier (content validation should prevent this), the first tier wins in
 * common -> rare -> legendary order so the result is deterministic.
 */
export function buildAnswerIndex(question: Question): AnswerIndex {
  const index = new Map<string, Tier>();
  for (const tier of TIERS) {
    for (const answer of question.answers[tier]) {
      const key = normalizeAnswer(answer);
      if (key && !index.has(key)) index.set(key, tier);
    }
  }
  return index;
}

/** Look up an already-normalized answer. Whole-word exact match only. */
export function lookupTier(index: AnswerIndex, normalized: string): Tier | null {
  return index.get(normalized) ?? null;
}
