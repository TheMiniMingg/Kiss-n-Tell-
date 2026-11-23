import { shuffle, type Rng } from "./random.js";
import { QUESTIONS_PER_RUN, type Question } from "./types.js";

export interface DrawResult {
  questions: Question[];
  /** The seen list to store after this run starts (question ids, oldest first). */
  seenAfter: string[];
  /** True when the pool ran out and the seen list started over with this run. */
  restarted: boolean;
}

/**
 * Draw the questions for a run, preferring questions the player has not seen.
 *
 * - Unseen questions are used first, in random order.
 * - If fewer than `count` are unseen, the rest come from the seen ones,
 *   least recently seen first, and the seen list starts over (the pool is
 *   exhausted, so the cycle restarts).
 * - Seen ids that no longer exist in the pool are dropped.
 */
export function drawQuestions(
  pool: readonly Question[],
  seen: readonly string[],
  rng: Rng,
  count: number = QUESTIONS_PER_RUN,
): DrawResult {
  const byId = new Map(pool.map((q) => [q.id, q]));
  const seenValid = dedupeKeepLast(seen.filter((id) => byId.has(id)));
  const seenSet = new Set(seenValid);
  const unseen = pool.filter((q) => !seenSet.has(q.id));
  const take = Math.min(count, pool.length);

  if (unseen.length >= take) {
    const questions = shuffle(unseen, rng).slice(0, take);
    return { questions, seenAfter: [...seenValid, ...questions.map((q) => q.id)], restarted: false };
  }

  // Pool exhausted: all unseen, topped up with the least recently seen.
  const topUp = seenValid.slice(0, take - unseen.length).map((id) => byId.get(id) as Question);
  const questions = shuffle([...unseen, ...topUp], rng);
  // New cycle: only this run's questions count as seen.
  return { questions, seenAfter: questions.map((q) => q.id), restarted: true };
}

function dedupeKeepLast(ids: string[]): string[] {
  const lastIndex = new Map<string, number>();
  ids.forEach((id, i) => lastIndex.set(id, i));
  return ids.filter((id, i) => lastIndex.get(id) === i);
}
