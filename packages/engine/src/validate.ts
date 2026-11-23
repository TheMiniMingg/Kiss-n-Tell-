import { checkWord, graphemeLength, MAX_ANSWER_LENGTH, normalizeAnswer } from "./normalize.js";
import {
  MAX_TIMER_SECONDS,
  MIN_TIMER_SECONDS,
  QUESTIONS_PER_RUN,
  STAGE_COUNT,
  TIERS,
  type Character,
  type Question,
  type Tier,
  type Topic,
} from "./types.js";

export interface Issue {
  level: "error" | "warning";
  /** Human-readable location, e.g. "olympians / question zeus" or "questions.csv:12". */
  where: string;
  message: string;
}

/** Soft target from the roadmap (~50 answers per question). Below the minimum is a warning, not an error. */
export const RECOMMENDED_MIN_ANSWERS = 20;
export const ALLOWED_IMAGE_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "svg"] as const;
const ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;

export function isSafeRelativePath(p: string): boolean {
  if (!p || p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:/.test(p)) return false;
  if (p.includes("\0")) return false;
  return !p.split(/[\\/]/).some((seg) => seg === ".." || seg === "");
}

export function validateQuestion(q: Question, where: string): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ level: "error", where, message });
  const warn = (message: string) => issues.push({ level: "warning", where, message });

  if (!ID_PATTERN.test(q.id)) err(`Question id "${q.id}" should use lowercase letters, digits, - or _.`);
  if (!q.prompt.trim()) err("Prompt is empty.");
  if (!Number.isFinite(q.timerSeconds) || q.timerSeconds < MIN_TIMER_SECONDS || q.timerSeconds > MAX_TIMER_SECONDS) {
    err(`timer_seconds must be between ${MIN_TIMER_SECONDS} and ${MAX_TIMER_SECONDS} (got ${q.timerSeconds}).`);
  }

  const seen = new Map<string, Tier>();
  let total = 0;
  for (const tier of TIERS) {
    for (const raw of q.answers[tier]) {
      const norm = normalizeAnswer(raw);
      const problem = checkWord(norm);
      if (problem === "blank") err(`Blank answer in ${tier}.`);
      else if (problem === "multiple_words") err(`"${raw}" (${tier}) has more than one word. Answers must be a single word.`);
      else if (problem === "too_short") err(`"${raw}" (${tier}) is one letter. Answers need at least 2 characters.`);
      if (problem) continue;
      if (graphemeLength(norm) > MAX_ANSWER_LENGTH) {
        err(`"${raw}" (${tier}) is longer than ${MAX_ANSWER_LENGTH} characters, so players can't type it.`);
        continue;
      }
      const prev = seen.get(norm);
      if (prev === tier) err(`"${raw}" is listed twice in ${tier}.`);
      else if (prev) err(`"${raw}" is in both ${prev} and ${tier}. Pick one tier.`);
      else {
        seen.set(norm, tier);
        total++;
      }
    }
  }
  if (total === 0) err("No accepted answers.");
  else if (total < RECOMMENDED_MIN_ANSWERS) warn(`Only ${total} answers (aim for about 50).`);
  if (total > 0 && q.answers.rare.length === 0) warn("No Rare answers.");
  if (total > 0 && q.answers.legendary.length === 0) warn("No Legendary answers.");
  return issues;
}

export function validateCharacter(c: Character, where: string): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ level: "error", where, message });
  if (!ID_PATTERN.test(c.id)) err(`Character id "${c.id}" should use lowercase letters, digits, - or _.`);
  if (!c.name?.trim()) err("Character name is empty.");
  if (typeof c.age !== "number" || !Number.isFinite(c.age) || c.age < 18) {
    err("Character age must be a number, 18 or older.");
  }
  if (!c.assetRights?.trim()) {
    issues.push({ level: "warning", where, message: "No asset_rights recorded for the art." });
  }
  if (c.stages.length !== STAGE_COUNT) {
    err(`Needs exactly ${STAGE_COUNT} stage images (00-10), found ${c.stages.length}.`);
  }
  return issues;
}

export function validateTopic(t: Topic): Issue[] {
  const where = `topic ${t.id}`;
  const issues: Issue[] = [];
  if (!ID_PATTERN.test(t.id)) issues.push({ level: "error", where, message: `Topic id "${t.id}" should use lowercase letters, digits, - or _.` });
  if (!t.title.trim()) issues.push({ level: "error", where, message: "Title is empty." });
  if (t.questions.length < QUESTIONS_PER_RUN) {
    issues.push({ level: "error", where, message: `Needs at least ${QUESTIONS_PER_RUN} questions, found ${t.questions.length}.` });
  }
  const ids = new Set<string>();
  const prompts = new Map<string, string>();
  for (const q of t.questions) {
    if (ids.has(q.id)) issues.push({ level: "error", where, message: `Duplicate question id "${q.id}".` });
    ids.add(q.id);
    const key = q.prompt.trim().toLowerCase();
    if (key && prompts.has(key)) {
      issues.push({ level: "warning", where, message: `Questions "${prompts.get(key)}" and "${q.id}" have the same prompt.` });
    } else prompts.set(key, q.id);
    issues.push(...validateQuestion(q, `${where} / question ${q.id}`));
  }
  issues.push(...validateCharacter(t.character, `${where} / character ${t.character.id}`));
  return issues;
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}
