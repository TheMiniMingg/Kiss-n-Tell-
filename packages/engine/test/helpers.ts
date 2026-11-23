import type { Question, Topic } from "../src/index.js";

export function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    prompt: `Prompt ${id}`,
    timerSeconds: 20,
    answers: { common: ["alpha", "bravo"], rare: ["charlie"], legendary: ["delta"] },
    ...overrides,
  };
}

export function makeTopic(n = 7): Topic {
  return {
    id: "sample",
    title: "Sample",
    character: {
      id: "char",
      name: "Char",
      age: 25,
      assetRights: "test",
      stages: Array.from({ length: 11 }, (_, i) => `${String(i).padStart(2, "0")}.webp`),
    },
    questions: Array.from({ length: n }, (_, i) => makeQuestion(`q${i + 1}`)),
  };
}

/** Answer words for each tier in makeQuestion. */
export const WORD = { common: "alpha", rare: "charlie", legendary: "delta", miss: "zulu" } as const;
