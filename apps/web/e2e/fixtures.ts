import { test as base, expect, type Page } from "@playwright/test";

/**
 * A deterministic test manifest: every question accepts the same words, so
 * tests don't depend on which 7 questions are drawn or on the real content.
 */
export const WORDS = { common: "apple", common2: "berry", rare: "cherry", legendary: "dragonfruit", miss: "zucchini" } as const;

function question(i: number, timer = 20) {
  return {
    id: `q${i}`,
    prompt: `Test question ${i}`,
    timerSeconds: timer,
    answers: { common: [WORDS.common, WORDS.common2], rare: [WORDS.rare], legendary: [WORDS.legendary] },
  };
}

function topic(id: string, title: string, poolSize: number) {
  return {
    id,
    title,
    description: `${title} description`,
    sample: false,
    questions: Array.from({ length: poolSize }, (_, i) => question(i + 1)),
    character: {
      id: `${id}-char`,
      name: `${title} Girl`,
      age: 25,
      width: 300,
      height: 400,
      stages: Array.from({ length: 11 }, (_, s) => `content/test/${id}/${String(s).padStart(2, "0")}.svg`),
    },
  };
}

export const MANIFEST = {
  schemaVersion: 1,
  topics: [topic("alpha", "Alpha Topic", 14), topic("beta", "Beta Topic", 7)],
};

function stageSvg(label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#444"/><text x="150" y="200" font-size="60" text-anchor="middle" fill="#fff">${label}</text></svg>`;
}

export async function mockContent(page: Page, opts: { failManifest?: number; brokenStage?: number } = {}) {
  let failures = opts.failManifest ?? 0;
  await page.route("**/content/manifest.json", async (route) => {
    if (failures > 0) {
      failures--;
      return route.fulfill({ status: 500, body: "boom" });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(MANIFEST) });
  });
  await page.route("**/content/test/**", async (route) => {
    const name = route.request().url().split("/").pop() as string;
    const stage = Number(name.slice(0, 2));
    if (opts.brokenStage !== undefined && stage === opts.brokenStage) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: "image/svg+xml", body: stageSvg(name) });
  });
}

export const test = base.extend<{ adult: boolean }>({
  adult: [true, { option: true }],
  page: async ({ page, adult }, use) => {
    if (adult) await page.addInitScript(() => window.localStorage.setItem("knt:adult-confirmed", "true"));
    await mockContent(page);
    await use(page);
  },
});
export { expect };

/** Start a run on a topic from the home screen. */
export async function startTopic(page: Page, title = "Alpha Topic") {
  await page.goto("/");
  await page.getByRole("button", { name: `Play ${title}` }).click();
  await expect(page.locator("#answer")).toBeFocused();
}

/** Submit an answer and wait for its feedback. */
export async function answer(page: Page, word: string) {
  await page.locator("#answer").fill(word);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("result")).toBeVisible();
}

export async function next(page: Page) {
  // Wait past the double-press guard.
  await page.waitForTimeout(400);
  await page.getByTestId("result").getByRole("button").click();
}

export async function score(page: Page) {
  return Number(await page.getByTestId("score").textContent());
}

export async function stageSrc(page: Page) {
  return (await page.locator(".play .stage__img, .results .stage__img").getAttribute("src")) ?? "";
}

/** Play a whole run with the given words and land on the results screen. */
export async function playRun(page: Page, words: string[]) {
  for (let i = 0; i < words.length; i++) {
    await answer(page, words[i] as string);
    await next(page);
  }
  await expect(page.getByTestId("final-score")).toBeVisible();
}
