import { describe, expect, it } from "vitest";
import { checkWord, normalizeAnswer } from "../src/index.js";

describe("normalizeAnswer", () => {
  it("trims, case-folds and strips surrounding punctuation", () => {
    expect(normalizeAnswer("  Zeus  ")).toBe("zeus");
    expect(normalizeAnswer("ZEUS!")).toBe("zeus");
    expect(normalizeAnswer('"zeus."')).toBe("zeus");
    expect(normalizeAnswer("  'Zeus'  ")).toBe("zeus");
  });
  it("keeps inner punctuation and accents", () => {
    expect(normalizeAnswer("X-Ray")).toBe("x-ray");
    expect(normalizeAnswer("don't")).toBe("don't");
    expect(normalizeAnswer("Café")).toBe("café");
    expect(normalizeAnswer("Café")).not.toBe("cafe");
  });
  it("treats phone smart punctuation as plain apostrophes and hyphens", () => {
    expect(normalizeAnswer("O\u2019Neill")).toBe("o'neill");
    expect(normalizeAnswer("O\u2018Neill")).toBe("o'neill");
    expect(normalizeAnswer("aye\u2010aye")).toBe("aye-aye");
    expect(normalizeAnswer("aye\u2011aye")).toBe("aye-aye");
  });
  it("treats composed and decomposed accents as the same word", () => {
    expect(normalizeAnswer("cafe\u0301")).toBe(normalizeAnswer("caf\u00e9"));
  });
});

describe("checkWord", () => {
  it("rejects blank, one letter and multiple words", () => {
    expect(checkWord(normalizeAnswer("   "))).toBe("blank");
    expect(checkWord(normalizeAnswer("!!!"))).toBe("blank");
    expect(checkWord(normalizeAnswer("s"))).toBe("too_short");
    expect(checkWord(normalizeAnswer(" s. "))).toBe("too_short");
    expect(checkWord(normalizeAnswer("new york"))).toBe("multiple_words");
    expect(checkWord(normalizeAnswer("new\tyork"))).toBe("multiple_words");
  });
  it("accepts two-character words", () => {
    expect(checkWord("ox")).toBeNull();
    expect(checkWord("zeus")).toBeNull();
  });
});
