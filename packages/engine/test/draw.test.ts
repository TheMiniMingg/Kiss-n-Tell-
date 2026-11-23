import { describe, expect, it } from "vitest";
import { drawQuestions, seededRng } from "../src/index.js";
import { makeQuestion } from "./helpers.js";

const pool = (n: number) => Array.from({ length: n }, (_, i) => makeQuestion(`q${i + 1}`));

describe("drawQuestions", () => {
  it("draws 7 distinct questions", () => {
    const { questions } = drawQuestions(pool(20), [], seededRng(1));
    expect(questions).toHaveLength(7);
    expect(new Set(questions.map((q) => q.id)).size).toBe(7);
  });
  it("avoids seen questions while enough unseen remain", () => {
    const p = pool(20);
    let seen: string[] = [];
    const rng = seededRng(2);
    const first = drawQuestions(p, seen, rng);
    seen = first.seenAfter;
    const second = drawQuestions(p, seen, rng);
    const overlap = second.questions.filter((q) => first.questions.some((f) => f.id === q.id));
    expect(overlap).toHaveLength(0);
    expect(second.seenAfter).toHaveLength(14);
  });
  it("tops up with the least recently seen and restarts the cycle when the pool runs out", () => {
    const p = pool(10);
    const rng = seededRng(3);
    const a = drawQuestions(p, [], rng); // 7 seen, 3 unseen
    const b = drawQuestions(p, a.seenAfter, rng);
    const unseenAfterA = p.filter((q) => !a.seenAfter.includes(q.id)).map((q) => q.id);
    for (const id of unseenAfterA) expect(b.questions.map((q) => q.id)).toContain(id);
    const topUp = b.questions.map((q) => q.id).filter((id) => !unseenAfterA.includes(id));
    expect(topUp).toEqual(expect.arrayContaining(a.seenAfter.slice(0, 4)));
    expect(b.seenAfter).toHaveLength(7);
    expect(a.restarted).toBe(false);
    expect(b.restarted).toBe(true);
  });
  it("ignores seen ids that are no longer in the pool", () => {
    const { questions } = drawQuestions(pool(7), ["gone1", "gone2"], seededRng(4));
    expect(questions).toHaveLength(7);
  });
  it("uses the whole pool when it is exactly 7", () => {
    const p = pool(7);
    const a = drawQuestions(p, [], seededRng(5));
    const b = drawQuestions(p, a.seenAfter, seededRng(6));
    expect(b.questions).toHaveLength(7);
  });
  it("shuffles", () => {
    const p = pool(30);
    const orders = new Set<string>();
    for (let s = 0; s < 10; s++) orders.add(drawQuestions(p, [], seededRng(s)).questions.map((q) => q.id).join());
    expect(orders.size).toBeGreaterThan(5);
  });
});
