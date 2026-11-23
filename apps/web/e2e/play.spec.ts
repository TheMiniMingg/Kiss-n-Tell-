import { answer, expect, next, playRun, score, stageSrc, startTopic, test, WORDS } from "./fixtures";

test("rejected inputs don't use up the question", async ({ page }) => {
  await startTopic(page);
  const input = page.locator("#answer");
  for (const [value, message] of [
    ["", "Type an answer first."],
    ["   ", "Type an answer first."],
    ["s", "One letter isn't an answer"],
    ["two words", "One word only"],
  ] as const) {
    await input.fill(value);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByTestId("result")).toHaveCount(0);
    await expect(page.locator(".play__stats")).toContainText("1/7");
  }
  // Typing clears the error.
  await input.fill("a");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await score(page)).toBe(0);
});

test("scores +1 / +2 / +3 and 0 for a typo, and tracks the run", async ({ page }) => {
  await startTopic(page);
  await answer(page, WORDS.common);
  await expect(page.getByTestId("result")).toContainText("Common+1");
  expect(await score(page)).toBe(1);
  await next(page);

  await answer(page, "  CHERRY! ");
  await expect(page.getByTestId("result")).toContainText("Rare+2");
  expect(await score(page)).toBe(3);
  await next(page);

  await answer(page, WORDS.legendary);
  await expect(page.getByTestId("result")).toContainText("Legendary+3");
  expect(await score(page)).toBe(6);
  await next(page);

  await answer(page, "aple");
  await expect(page.getByTestId("result")).toContainText("Not on the list+0");
  expect(await score(page)).toBe(6);
  await expect(page.getByTestId("result")).toContainText("You said aple");

  // Run history shows each answer.
  const history = page.getByRole("region", { name: "This run so far" });
  await expect(history.locator("li")).toHaveCount(4);
  await expect(history).toContainText("CHERRY!");
});

test("only one guess per question", async ({ page }) => {
  await startTopic(page);
  await answer(page, WORDS.miss);
  await expect(page.locator("#answer")).toHaveCount(0);
  expect(await score(page)).toBe(0);
});

test("a fast double Enter doesn't skip the feedback", async ({ page }) => {
  await startTopic(page);
  await page.locator("#answer").fill(WORDS.common);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("result")).toBeVisible();
  await expect(page.locator(".play__stats")).toContainText("1/7");
  // A deliberate Enter after the pause moves on, and the input is focused again.
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await expect(page.locator(".play__stats")).toContainText("2/7");
  await expect(page.locator("#answer")).toBeFocused();
});

test("early win shows the ending at once and keeps scoring to the end", async ({ page }) => {
  await startTopic(page);
  for (const w of [WORDS.legendary, WORDS.legendary, WORDS.legendary]) {
    await answer(page, w);
    expect(await stageSrc(page)).not.toContain("10.svg");
    await next(page);
  }
  await answer(page, WORDS.common);
  expect(await score(page)).toBe(10);
  expect(await stageSrc(page)).toContain("10.svg");
  await expect(page.getByTestId("result")).toContainText("Ending unlocked!");
  await expect(page.locator(".stage__count")).toHaveText("Ending");
  await next(page);

  // Still playing questions 5-7.
  await expect(page.locator(".play__stats")).toContainText("5/7");
  await expect(page.locator("#answer")).toBeVisible();
  await answer(page, WORDS.legendary);
  expect(await score(page)).toBe(13);
  expect(await stageSrc(page)).toContain("10.svg");
  await next(page);
  await answer(page, WORDS.legendary);
  await next(page);
  await answer(page, WORDS.legendary);
  await next(page);

  await expect(page.getByTestId("final-score")).toHaveText("19");
  await expect(page.getByRole("heading", { name: "Ending unlocked!" })).toBeVisible();
  await expect(page.getByText("You reached 10 points on question 4.")).toBeVisible();
});

test("a loss at 9 points never shows the ending", async ({ page }) => {
  await startTopic(page);
  const words = [WORDS.common, WORDS.common, WORDS.common, WORDS.common, WORDS.common, WORDS.rare, WORDS.rare];
  const seen: string[] = [];
  for (const w of words) {
    await answer(page, w);
    seen.push(await stageSrc(page));
    await next(page);
  }
  expect(seen.some((s) => s.includes("10.svg"))).toBe(false);
  await expect(page.getByTestId("final-score")).toHaveText("9");
  await expect(page.getByRole("heading", { name: "So close!" })).toBeVisible();
  expect(await stageSrc(page)).toContain("09.svg");
});

test("7 Legendary answers score the maximum 21", async ({ page }) => {
  await startTopic(page);
  await playRun(page, Array(7).fill(WORDS.legendary));
  await expect(page.getByTestId("final-score")).toHaveText("21");
});

test("the stage image follows the score", async ({ page }) => {
  await startTopic(page);
  expect(await stageSrc(page)).toContain("00.svg");
  await answer(page, WORDS.rare);
  expect(await stageSrc(page)).toContain("02.svg");
  await expect(page.locator(".meter__seg--on")).toHaveCount(2);
});

test("a missing stage image shows a placeholder instead of a broken image", async ({ page }) => {
  await page.unrouteAll();
  const { mockContent } = await import("./fixtures");
  await page.addInitScript(() => window.localStorage.setItem("knt:adult-confirmed", "true"));
  await mockContent(page, { brokenStage: 1 });
  await startTopic(page);
  await answer(page, WORDS.common);
  await expect(page.getByRole("img", { name: "Image unavailable" })).toBeVisible();
});
