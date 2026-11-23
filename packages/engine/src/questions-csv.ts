import { parseCsv } from "./csv.js";
import { DEFAULT_TIMER_SECONDS, type Question, type Tier } from "./types.js";
import type { Issue } from "./validate.js";

const TIER_ALIASES: Record<string, Tier> = {
  common: "common",
  c: "common",
  "1": "common",
  "+1": "common",
  rare: "rare",
  r: "rare",
  "2": "rare",
  "+2": "rare",
  legendary: "legendary",
  l: "legendary",
  "3": "legendary",
  "+3": "legendary",
};

export const CSV_COLUMNS = ["question_id", "prompt", "answer", "tier", "timer_seconds"] as const;

export function parseTier(raw: string): Tier | null {
  return TIER_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Turn a questions CSV into questions. One row per accepted answer:
 *
 *   question_id,prompt,answer,tier,timer_seconds
 *   olympians,Name an Olympian god,Zeus,common,20
 *   olympians,,Hestia,legendary,
 *
 * `prompt` and `timer_seconds` only need to appear once per question.
 * `tier` accepts common/rare/legendary, c/r/l or 1/2/3.
 * Questions keep the order in which their id first appears.
 */
export function questionsFromCsv(text: string, file = "questions.csv"): { questions: Question[]; issues: Issue[] } {
  const issues: Issue[] = [];
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { questions: [], issues: [{ level: "error", where: file, message: (e as Error).message }] };
  }
  const header = rows.shift();
  if (!header) {
    return { questions: [], issues: [{ level: "error", where: file, message: "File is empty." }] };
  }
  const cols = header.map((h) => h.trim().toLowerCase());
  const col = (name: string) => cols.indexOf(name);
  for (const required of ["question_id", "answer", "tier"]) {
    if (col(required) < 0) {
      issues.push({ level: "error", where: file, message: `Missing column "${required}". Expected: ${CSV_COLUMNS.join(", ")}.` });
    }
  }
  if (issues.length) return { questions: [], issues };

  const byId = new Map<string, Question & { _timerSet: boolean }>();
  rows.forEach((row, i) => {
    const line = i + 2; // 1-based, after header
    const where = `${file}:${line}`;
    const get = (name: string) => (col(name) >= 0 ? (row[col(name)] ?? "").trim() : "");
    const id = get("question_id");
    if (!id) {
      issues.push({ level: "error", where, message: "Missing question_id." });
      return;
    }
    let q = byId.get(id);
    if (!q) {
      q = { id, prompt: "", timerSeconds: DEFAULT_TIMER_SECONDS, answers: { common: [], rare: [], legendary: [] }, _timerSet: false };
      byId.set(id, q);
    }
    const prompt = get("prompt");
    if (prompt) {
      if (q.prompt && q.prompt !== prompt) {
        issues.push({ level: "error", where, message: `Question "${id}" has two different prompts.` });
      } else q.prompt = prompt;
    }
    const timer = get("timer_seconds");
    if (timer) {
      const n = Number(timer);
      if (!Number.isFinite(n)) {
        issues.push({ level: "error", where, message: `timer_seconds "${timer}" is not a number.` });
      } else if (q._timerSet && q.timerSeconds !== n) {
        issues.push({ level: "error", where, message: `Question "${id}" has two different timer_seconds values.` });
      } else {
        q.timerSeconds = n;
        q._timerSet = true;
      }
    }
    const answer = get("answer");
    const tierRaw = get("tier");
    if (!answer && !tierRaw) return; // a prompt-only row is fine
    if (!answer) {
      issues.push({ level: "error", where, message: "Row has a tier but no answer." });
      return;
    }
    const tier = parseTier(tierRaw);
    if (!tier) {
      issues.push({ level: "error", where, message: `Unknown tier "${tierRaw}" for "${answer}". Use common, rare or legendary.` });
      return;
    }
    q.answers[tier].push(answer);
  });

  const questions = [...byId.values()].map(({ _timerSet, ...q }) => q);
  return { questions, issues };
}

/** Serialize questions back to the CSV format (used by the editor and for round-trip tests). */
export function questionsToCsv(questions: readonly Question[]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [CSV_COLUMNS.join(",")];
  for (const q of questions) {
    let first = true;
    for (const tier of ["common", "rare", "legendary"] as const) {
      for (const a of q.answers[tier]) {
        lines.push([q.id, first ? q.prompt : "", a, tier, first ? String(q.timerSeconds) : ""].map(esc).join(","));
        first = false;
      }
    }
    if (first) lines.push([q.id, q.prompt, "", "", String(q.timerSeconds)].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
