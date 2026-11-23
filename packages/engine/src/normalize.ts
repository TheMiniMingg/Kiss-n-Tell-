import type { Rejection } from "./types.js";

/** Leading/trailing punctuation and symbols (quotes, periods, emoji-like symbols, etc.). */
const SURROUNDING_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const WHITESPACE = /\s/u;
/** Curly and modifier apostrophes that phone keyboards insert ("smart punctuation"). */
const APOSTROPHES = /[\u2018\u2019\u02BC\u2032]/gu;
/** Unicode hyphen and non-breaking hyphen. */
const HYPHENS = /[\u2010\u2011]/gu;

/**
 * Normalize an answer for comparison: Unicode NFC, trim, strip surrounding
 * punctuation, case-fold. Inner characters (hyphens, apostrophes, accents) are kept,
 * but typographic apostrophes and hyphens become the plain ' and - so a phone's
 * smart punctuation doesn't turn a right answer into a miss.
 */
export function normalizeAnswer(raw: string): string {
  let s = raw.normalize("NFC").replace(APOSTROPHES, "'").replace(HYPHENS, "-").trim();
  // Strip, then trim again in case punctuation hid whitespace ("  'zeus' ").
  s = s.replace(SURROUNDING_PUNCTUATION, "").trim();
  return s.toLowerCase();
}

/** Count user-perceived characters so "é" or an emoji counts as one. */
export function graphemeLength(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    let n = 0;
    for (const _ of new Seg(undefined, { granularity: "grapheme" }).segment(s)) n++;
    return n;
  }
  return Array.from(s).length;
}

export const MIN_ANSWER_LENGTH = 2;
/** Longest answer the game's input box accepts. Content answers must fit. */
export const MAX_ANSWER_LENGTH = 40;

/**
 * Check whether a normalized string is a usable single word.
 * Returns the rejection reason, or null when it is a valid word.
 */
export function checkWord(normalized: string): Exclude<Rejection, "not_accepting"> | null {
  if (normalized.length === 0) return "blank";
  if (WHITESPACE.test(normalized)) return "multiple_words";
  if (graphemeLength(normalized) < MIN_ANSWER_LENGTH) return "too_short";
  return null;
}
