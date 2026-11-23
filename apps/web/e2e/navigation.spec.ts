import { answer, expect, next, playRun, startTopic, test, WORDS } from "./fixtures";

test("quit asks first; Keep playing and Escape stay in the run", async ({ page }) => {
  await startTopic(page);
  await answer(page, WORDS.common);
  await page.getByRole("button", { name: /Quit/ }).click();
  const dialog = page.getByRole("dialog", { name: "Leave this run?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep playing" })).toBeFocused();
  await dialog.getByRole("button", { name: "Keep playing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("score")).toHaveText("1");

  await page.getByRole("button", { name: /Quit/ }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /Quit/ }).click();
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
  // Quitting doesn't save a score.
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toContainText("Not played yet");
});

test("browser Back during a run asks before leaving", async ({ page }) => {
  await startTopic(page);
  await page.goBack();
  const dialog = page.getByRole("dialog", { name: "Leave this run?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep playing" }).click();
  await expect(page.locator("#answer")).toBeVisible();
  await page.goBack();
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
});

test("browser Back from results goes to the topic list", async ({ page }) => {
  await startTopic(page);
  await playRun(page, Array(7).fill(WORDS.common));
  await page.goBack();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
});

test("the tab title names the topic during a run", async ({ page }) => {
  await startTopic(page);
  await expect(page).toHaveTitle("Alpha Topic · Kiss N Tell");
});

test("results list every answer and the score is saved as best", async ({ page }) => {
  await startTopic(page);
  await playRun(page, [WORDS.common, WORDS.rare, WORDS.legendary, WORDS.miss, WORDS.common, WORDS.common, WORDS.common]);
  await expect(page.getByTestId("final-score")).toHaveText("9");
  await expect(page.locator(".breakdown__row")).toHaveCount(7);
  await expect(page.getByText("New best")).toBeVisible();

  await page.getByRole("button", { name: "Choose another topic" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toContainText("Best 9/21");

  // A lower score doesn't replace the best.
  await page.getByRole("button", { name: "Play Alpha Topic" }).click();
  await playRun(page, Array(7).fill(WORDS.miss));
  await expect(page.getByText("New best")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Run over" })).toBeVisible();
});

test("playing again draws questions the player hasn't seen", async ({ page }) => {
  await startTopic(page);
  const prompts = async () => {
    const list: string[] = [];
    for (let i = 0; i < 7; i++) {
      list.push((await page.locator(".panel__prompt").textContent()) ?? "");
      await answer(page, WORDS.common);
      await next(page);
    }
    return list;
  };
  const first = await prompts();
  await page.getByRole("button", { name: "Play Alpha Topic again" }).click();
  const second = await prompts();
  expect(new Set(first).size).toBe(7);
  expect(second.filter((p) => first.includes(p))).toEqual([]);

  // Pool of 14 is now used up: the third run reuses questions without crashing.
  await page.getByRole("button", { name: "Play Alpha Topic again" }).click();
  const third = await prompts();
  expect(new Set(third).size).toBe(7);
});

test("a topic with exactly 7 questions can be replayed", async ({ page }) => {
  await startTopic(page, "Beta Topic");
  await playRun(page, Array(7).fill(WORDS.common));
  await page.getByRole("button", { name: "Play Beta Topic again" }).click();
  await expect(page.locator("#answer")).toBeVisible();
});
