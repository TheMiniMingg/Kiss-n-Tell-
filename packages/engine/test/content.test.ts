import { describe, expect, it } from "vitest";
import {
  hasErrors,
  isSafeRelativePath,
  parseCsv,
  questionsFromCsv,
  questionsToCsv,
  validateQuestion,
  validateTopic,
} from "../src/index.js";
import { makeQuestion, makeTopic } from "./helpers.js";

describe("parseCsv", () => {
  it("handles quotes, commas, newlines, CRLF and BOM", () => {
    const rows = parseCsv('\ufeffa,b,c\r\n"x, y","he said ""hi""","multi\nline"\r\n\r\n1,2,3');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "multi\nline"],
      ["1", "2", "3"],
    ]);
  });
  it("throws on an unclosed quote", () => {
    expect(() => parseCsv('a,"b')).toThrow();
  });
});

describe("questionsFromCsv", () => {
  const csv = [
    "question_id,prompt,answer,tier,timer_seconds",
    "olympians,Name an Olympian god,Zeus,common,20",
    "olympians,,Hera,1,",
    "olympians,,Hestia,legendary,",
    "rivers,Name a river,Nile,c,30",
    "rivers,,Lena,R,",
  ].join("\n");
  it("groups rows by question and inherits prompt and timer", () => {
    const { questions, issues } = questionsFromCsv(csv);
    expect(issues).toEqual([]);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toEqual({
      id: "olympians",
      prompt: "Name an Olympian god",
      timerSeconds: 20,
      answers: { common: ["Zeus", "Hera"], rare: [], legendary: ["Hestia"] },
    });
    expect(questions[1]!.timerSeconds).toBe(30);
    expect(questions[1]!.answers.rare).toEqual(["Lena"]);
  });
  it("defaults the timer to 20 seconds", () => {
    const { questions } = questionsFromCsv("question_id,prompt,answer,tier\nq,P,word,common\n");
    expect(questions[0]!.timerSeconds).toBe(20);
  });
  it("reports unknown tiers, conflicting prompts and missing columns with line numbers", () => {
    const bad = questionsFromCsv("question_id,prompt,answer,tier\nq,A,word,epic\nq,B,other,common\n");
    expect(bad.issues.map((i) => i.where)).toEqual(["questions.csv:2", "questions.csv:3"]);
    expect(questionsFromCsv("id,answer\n").issues[0]!.message).toMatch(/question_id/);
  });
  it("round-trips through questionsToCsv", () => {
    const { questions } = questionsFromCsv(csv);
    const again = questionsFromCsv(questionsToCsv(questions));
    expect(again.questions).toEqual(questions);
    expect(again.issues).toEqual([]);
  });
  it("round-trips answers containing commas and quotes", () => {
    const q = [makeQuestion("q1", { prompt: 'Say "hi", please' })];
    expect(questionsFromCsv(questionsToCsv(q)).questions).toEqual(q);
  });
});

describe("validation", () => {
  it("accepts a valid topic", () => {
    const issues = validateTopic(makeTopic(7));
    expect(hasErrors(issues)).toBe(false);
  });
  it("requires at least 7 questions", () => {
    expect(hasErrors(validateTopic(makeTopic(6)))).toBe(true);
  });
  it("blocks duplicates and conflicting tiers after normalization", () => {
    const dup = validateQuestion(makeQuestion("q", { answers: { common: ["Zeus", "zeus!"], rare: [], legendary: [] } }), "q");
    expect(dup.some((i) => i.level === "error" && /twice/.test(i.message))).toBe(true);
    const conflict = validateQuestion(makeQuestion("q", { answers: { common: ["Zeus"], rare: ["ZEUS"], legendary: [] } }), "q");
    expect(conflict.some((i) => i.level === "error" && /both/.test(i.message))).toBe(true);
  });
  it("blocks blank, one-letter and multi-word answers", () => {
    const issues = validateQuestion(makeQuestion("q", { answers: { common: ["", "s", "new york", "ok"], rare: [], legendary: [] } }), "q");
    expect(issues.filter((i) => i.level === "error")).toHaveLength(3);
  });
  it("requires exactly 11 stages and an adult character", () => {
    const t = makeTopic(7);
    t.character.stages = t.character.stages.slice(0, 10);
    t.character.age = 17;
    const errors = validateTopic(t).filter((i) => i.level === "error");
    expect(errors).toHaveLength(2);
  });
  it("rejects unsafe paths", () => {
    expect(isSafeRelativePath("00.webp")).toBe(true);
    expect(isSafeRelativePath("art/00.webp")).toBe(true);
    for (const p of ["../00.webp", "a/../../b", "/etc/passwd", "C:\\x", "a//b", ""]) {
      expect(isSafeRelativePath(p)).toBe(false);
    }
  });
  it("blocks answers too long to type in the game", () => {
    const long = "a".repeat(41);
    const issues = validateQuestion(makeQuestion("q", { answers: { common: [long, "ok"], rare: [], legendary: [] } }), "q");
    expect(issues.some((i) => i.level === "error" && /longer than 40/.test(i.message))).toBe(true);
    expect(hasErrors(validateQuestion(makeQuestion("q", { answers: { common: ["a".repeat(40)], rare: [], legendary: [] } }), "q"))).toBe(false);
  });
  it("checks timer bounds", () => {
    expect(hasErrors(validateQuestion(makeQuestion("q", { timerSeconds: 2 }), "q"))).toBe(true);
    expect(hasErrors(validateQuestion(makeQuestion("q", { timerSeconds: 20 }), "q"))).toBe(false);
  });
});
