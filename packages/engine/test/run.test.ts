import { describe, expect, it } from "vitest";
import {
  checkTimeout,
  isPerfect,
  MAX_SCORE,
  onPerfectTrack,
  nextQuestion,
  stageForScore,
  startRun,
  submitAnswer,
  summarize,
  timeLeftMs,
  type RunState,
} from "../src/index.js";
import { makeTopic, WORD } from "./helpers.js";

type Pick = keyof typeof WORD | "timeout";

/** Play a full run with the given picks and return the final state. */
function play(picks: Pick[]): { state: RunState; stages: number[] } {
  const topic = makeTopic(picks.length);
  let now = 1000;
  let state = startRun(topic.id, topic.questions, now);
  const stages: number[] = [];
  picks.forEach((p, i) => {
    if (p === "timeout") {
      now += 20_000;
      state = checkTimeout(state, now).state;
    } else {
      now += 1000;
      const r = submitAnswer(state, WORD[p], now);
      expect(r.accepted).toBe(true);
      state = r.state;
    }
    stages.push(stageForScore(state.score));
    if (i < picks.length - 1) state = nextQuestion(state, now);
  });
  return { state, stages };
}

const rep = <T,>(x: T, n: number) => Array<T>(n).fill(x);

describe("balance fixtures (roadmap v1.1)", () => {
  const cases: [string, Pick[], number, boolean][] = [
    ["7 Common", rep<Pick>("common", 7), 7, false],
    ["5 Common + 2 Rare", [...rep<Pick>("common", 5), "rare", "rare"], 9, false],
    ["4 Common + 3 Rare", [...rep<Pick>("common", 4), "rare", "rare", "rare"], 10, true],
    ["5 Common + 1 Rare + 1 Legendary", [...rep<Pick>("common", 5), "rare", "legendary"], 10, true],
    ["5 Common + 2 Legendary", [...rep<Pick>("common", 5), "legendary", "legendary"], 11, true],
    ["7 Legendary", rep<Pick>("legendary", 7), 21, true],
    ["7 misses", rep<Pick>("miss", 7), 0, false],
    ["7 timeouts", rep<Pick>("timeout", 7), 0, false],
  ];
  for (const [name, picks, score, won] of cases) {
    it(`${name} = ${score} (${won ? "win" : "loss"})`, () => {
      const { state } = play(picks);
      const s = summarize(state);
      expect(state.phase).toBe("finished");
      expect(s.score).toBe(score);
      expect(s.won).toBe(won);
      expect(s.stage).toBe(Math.min(10, score));
    });
  }
  it("max score is 21", () => expect(MAX_SCORE).toBe(21));
});

describe("perfect run (secret image)", () => {
  it("7 Legendary answers is perfect", () => {
    const { state } = play(rep<Pick>("legendary", 7));
    expect(isPerfect(state)).toBe(true);
    expect(summarize(state).perfect).toBe(true);
    expect(summarize(state).score).toBe(MAX_SCORE);
  });
  it("one Rare answer (20 points) is not perfect", () => {
    const { state } = play([...rep<Pick>("legendary", 6), "rare"]);
    expect(state.score).toBe(20);
    expect(summarize(state).perfect).toBe(false);
  });
  it("a slip on the first question is not perfect", () => {
    const { state } = play(["timeout", ...rep<Pick>("legendary", 6)]);
    expect(summarize(state).perfect).toBe(false);
  });
  it("is never perfect before the run is finished", () => {
    const topic = makeTopic(7);
    let state = startRun(topic.id, topic.questions, 0);
    for (let i = 0; i < 6; i++) {
      state = submitAnswer(state, WORD.legendary, 1).state;
      expect(isPerfect(state)).toBe(false);
      expect(onPerfectTrack(state)).toBe(true);
      state = nextQuestion(state, 1);
    }
    expect(onPerfectTrack(state)).toBe(true);
    state = submitAnswer(state, WORD.legendary, 2).state;
    expect(isPerfect(state)).toBe(true);
  });
  it("leaves the perfect track after any non-Legendary answer", () => {
    const topic = makeTopic(7);
    let state = startRun(topic.id, topic.questions, 0);
    expect(onPerfectTrack(state)).toBe(true);
    state = submitAnswer(state, WORD.common, 1).state;
    expect(onPerfectTrack(state)).toBe(false);
  });
});

describe("stages and early win", () => {
  it("scores exactly +1/+2/+3 and 0", () => {
    const { state } = play(["common", "rare", "legendary", "miss", "timeout", "common", "common"]);
    expect(state.results.map((r) => r.points)).toEqual([1, 2, 3, 0, 0, 1, 1]);
  });
  it("shows the ending as soon as the score reaches 10, and keeps scoring", () => {
    const { state, stages } = play(["legendary", "legendary", "legendary", "common", "legendary", "rare", "common"]);
    expect(stages).toEqual([3, 6, 9, 10, 10, 10, 10]);
    expect(state.wonAtQuestion).toBe(4);
    expect(state.score).toBe(16);
    expect(summarize(state).won).toBe(true);
  });
  it("never shows stage 10 on a loss (9 after Q7)", () => {
    const { stages, state } = play([...rep<Pick>("common", 5), "rare", "rare"]);
    expect(Math.max(...stages)).toBe(9);
    expect(state.wonAtQuestion).toBeNull();
  });
  it("stage never exceeds 10", () => {
    for (let s = 0; s <= 21; s++) expect(stageForScore(s)).toBeLessThanOrEqual(10);
  });
  it("requires all 7 questions even after winning", () => {
    let { state } = play(["legendary", "legendary", "legendary", "common"]);
    // play() with 4 picks makes a 4-question topic; check a 7-question run instead:
    const topic = makeTopic(7);
    state = startRun(topic.id, topic.questions, 0);
    for (let i = 0; i < 4; i++) {
      state = submitAnswer(state, WORD.legendary, 1).state;
      state = nextQuestion(state, 1);
    }
    expect(state.score).toBe(12);
    expect(state.phase).toBe("question");
    expect(state.index).toBe(4);
  });
});

describe("submissions", () => {
  const fresh = () => {
    const t = makeTopic(7);
    return startRun(t.id, t.questions, 0);
  };
  it("rejects blank, one-letter and multi-word input without consuming the question", () => {
    const s = fresh();
    for (const [input, reason] of [
      ["", "blank"],
      ["   ", "blank"],
      ["s", "too_short"],
      ["alpha bravo", "multiple_words"],
    ] as const) {
      const r = submitAnswer(s, input, 1);
      expect(r.accepted).toBe(false);
      if (!r.accepted) expect(r.reason).toBe(reason);
      expect(r.state).toBe(s);
    }
  });
  it("a typo consumes the question and scores 0", () => {
    const r = submitAnswer(fresh(), "alpah", 1);
    expect(r.accepted).toBe(true);
    if (r.accepted) {
      expect(r.result.outcome).toBe("miss");
      expect(r.result.points).toBe(0);
    }
  });
  it("matches whole words only, case-insensitively", () => {
    expect(submitAnswer(fresh(), "ALPHA", 1).accepted && submitAnswer(fresh(), "ALPHA", 1).state.score).toBe(1);
    const sub = submitAnswer(fresh(), "alph", 1);
    expect(sub.accepted && sub.result.outcome).toBe("miss");
    const sup = submitAnswer(fresh(), "alphas", 1);
    expect(sup.accepted && sup.result.outcome).toBe("miss");
  });
  it("accepts only one submission per question", () => {
    const first = submitAnswer(fresh(), WORD.common, 1);
    const second = submitAnswer(first.state, WORD.legendary, 2);
    expect(second.accepted).toBe(false);
    if (!second.accepted) expect(second.reason).toBe("not_accepting");
    expect(second.state.score).toBe(1);
  });
  it("a submission after the deadline is a timeout", () => {
    const s = fresh();
    const r = submitAnswer(s, WORD.legendary, 20_000);
    expect(r.accepted && r.result.outcome).toBe("timeout");
    expect(r.state.score).toBe(0);
  });
  it("a submission just before the deadline counts", () => {
    const r = submitAnswer(fresh(), WORD.legendary, 19_999);
    expect(r.accepted && r.result.outcome).toBe("legendary");
  });
  it("timeLeft counts down from the question's timer", () => {
    const s = fresh();
    expect(timeLeftMs(s, 0)).toBe(20_000);
    expect(timeLeftMs(s, 5_000)).toBe(15_000);
    expect(timeLeftMs(s, 30_000)).toBe(0);
  });
  it("checkTimeout is a no-op before the deadline", () => {
    const s = fresh();
    expect(checkTimeout(s, 10_000).state).toBe(s);
  });
  it("uses a per-question timer", () => {
    const t = makeTopic(7);
    t.questions[1]!.timerSeconds = 45;
    let s = startRun(t.id, t.questions, 0);
    s = submitAnswer(s, WORD.common, 1).state;
    s = nextQuestion(s, 100);
    expect(s.deadline).toBe(100 + 45_000);
  });
});
