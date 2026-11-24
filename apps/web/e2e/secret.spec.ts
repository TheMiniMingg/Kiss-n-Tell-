import { answer, expect, next, playRun, SECRET_FILE, stageSrc, startTopic, test, WORDS } from "./fixtures";

const PERFECT = Array<string>(7).fill(WORDS.legendary);

test("a perfect 21 reveals the secret image on the last answer and on the results", async ({ page }) => {
  await startTopic(page);
  for (let i = 0; i < 6; i++) {
    await answer(page, WORDS.legendary);
    await expect(page.locator(".stage--secret")).toHaveCount(0);
    await next(page);
  }
  await answer(page, WORDS.legendary);
  await expect(page.getByTestId("result")).toContainText("Perfect 21! You unlocked the secret image.");
  expect(await stageSrc(page)).toContain(SECRET_FILE);
  await expect(page.locator(".stage__count")).toHaveText("Secret");
  await next(page);

  await expect(page.getByTestId("final-score")).toHaveText("21");
  await expect(page.getByRole("heading", { name: "Secret unlocked!" })).toBeVisible();
  await expect(page.getByText("Legendary on all 7 questions. Only a perfect run reveals this image.")).toBeVisible();
  expect(await stageSrc(page)).toContain(SECRET_FILE);
  await expect(page.locator(".results .stage__img")).toHaveAttribute("alt", /secret image/);

  // The topic list remembers it.
  await page.getByRole("button", { name: "Choose another topic" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toContainText("Best 21/21 · secret unlocked");
});

test("nothing about the secret shows, and it isn't downloaded, on a run that isn't perfect", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(SECRET_FILE)) fetched.push(r.url());
  });
  await startTopic(page);
  // Perfect until the last question, then a Rare answer: 20 points.
  await playRun(page, [...Array<string>(6).fill(WORDS.legendary), WORDS.rare]);
  await expect(page.getByTestId("final-score")).toHaveText("20");
  await expect(page.getByRole("heading", { name: "Ending unlocked!" })).toBeVisible();
  expect(await stageSrc(page)).toContain("10.svg");
  await expect(page.locator("body")).not.toContainText(/secret/i);
  await page.getByRole("button", { name: "Choose another topic" }).click();
  await expect(page.locator("body")).not.toContainText(/secret/i);
  // Reaching Q7 on a perfect track fetches it ahead of time; nothing earlier does.
  expect(fetched.length).toBeLessThanOrEqual(1);
});

test("the secret is never fetched once the run can no longer be perfect", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(SECRET_FILE)) fetched.push(r.url());
  });
  await startTopic(page);
  await playRun(page, [WORDS.common, ...Array<string>(6).fill(WORDS.legendary)]);
  await expect(page.getByTestId("final-score")).toHaveText("19");
  expect(fetched).toEqual([]);
});

test("a perfect run on a topic without a secret image shows the ending", async ({ page }) => {
  await startTopic(page, "Beta Topic");
  await playRun(page, PERFECT);
  await expect(page.getByTestId("final-score")).toHaveText("21");
  await expect(page.getByRole("heading", { name: "Perfect run!" })).toBeVisible();
  expect(await stageSrc(page)).toContain("10.svg");
  await expect(page.locator(".stage--secret")).toHaveCount(0);
  await page.getByRole("button", { name: "Choose another topic" }).click();
  await expect(page.getByRole("button", { name: "Play Beta Topic" })).toContainText("Best 21/21 · ending unlocked");
});

test("the share card from a perfect run downloads (drawn from the secret image)", async ({ page }) => {
  await startTopic(page);
  await playRun(page, PERFECT);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image" }).click();
  expect((await download).suggestedFilename()).toBe("kiss-n-tell-alpha-21.png");
  await expect(page.getByRole("status").filter({ hasText: "Image downloaded." })).toBeVisible();
});
