import { expect, startTopic, test, WORDS } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

test("the timer counts down from 20 and times out at 0 for +0", async ({ page }) => {
  await startTopic(page);
  await expect(page.getByRole("timer")).toHaveAccessibleName("20 seconds left");
  await page.clock.fastForward(5_000);
  await expect(page.getByRole("timer")).toHaveAccessibleName("15 seconds left");
  await page.clock.fastForward(15_500);
  await expect(page.getByTestId("result")).toContainText("Time's up+0");
  await expect(page.getByTestId("score")).toHaveText("0");
});

test("the timer turns urgent in the last 5 seconds", async ({ page }) => {
  await startTopic(page);
  await expect(page.locator(".timer--urgent")).toHaveCount(0);
  await page.clock.fastForward(15_200);
  await expect(page.locator(".timer--urgent")).toHaveCount(1);
});

test("the timer keeps running while the tab is hidden", async ({ page }) => {
  await startTopic(page);
  // Simulate leaving the tab: time passes with no ticks, then the tab is shown again.
  await page.clock.pauseAt(Date.now() + 1000);
  await page.clock.setSystemTime(Date.now() + 30_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByTestId("result")).toContainText("Time's up");
});

test("an answer typed but not submitted before time runs out scores 0", async ({ page }) => {
  await startTopic(page);
  await page.locator("#answer").fill(WORDS.legendary);
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId("result")).toContainText("Time's up+0");
});

test("the next question gets a fresh timer", async ({ page }) => {
  await startTopic(page);
  await page.clock.fastForward(10_000);
  await page.locator("#answer").fill(WORDS.common);
  await page.keyboard.press("Enter");
  await page.clock.fastForward(1_000);
  await page.getByTestId("result").getByRole("button").click();
  await expect(page.getByRole("timer")).toHaveAccessibleName("20 seconds left");
});

test("after a timeout the next question starts with an empty box and no old warning", async ({ page }) => {
  await startTopic(page);
  await page.locator("#answer").fill("a");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId("result")).toContainText("Time's up");
  await page.clock.fastForward(1_000);
  await page.getByTestId("result").getByRole("button").click();
  await expect(page.locator("#answer")).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
