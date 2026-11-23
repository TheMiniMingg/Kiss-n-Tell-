import { expect, mockContent, test } from "./fixtures";

test.describe("age gate", () => {
  test.use({ adult: false });

  test("blocks the game until confirmed and remembers the answer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Are you 18 or older?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Play/ })).toHaveCount(0);

    await page.getByRole("button", { name: "I'm under 18" }).click();
    await expect(page.getByRole("heading", { name: /for adults/ })).toBeVisible();
    await page.getByRole("button", { name: "Go back" }).click();

    await page.getByRole("button", { name: "I'm 18 or older" }).click();
    await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Are you 18 or older?" })).toHaveCount(0);
  });
});

test("home lists every topic with its character and best score", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kiss N Tell" })).toBeVisible();
  for (const t of ["Alpha Topic", "Beta Topic"]) {
    const card = page.getByRole("button", { name: `Play ${t}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`${t} Girl`);
    await expect(card).toContainText("Not played yet");
  }
  await expect(page).toHaveTitle("Kiss N Tell");
});

test("how to play opens and closes", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "How to play" });
  await toggle.click();
  await expect(page.locator("#rules")).toContainText("Common");
  await expect(page.locator("#rules")).toContainText("Legendary");
  await page.getByRole("button", { name: "Hide how to play" }).click();
  await expect(page.locator("#rules")).toHaveCount(0);
});

test("footer links to the source code and downloads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Source code on GitHub" })).toHaveAttribute("href", /github\.com\/TheMiniMingg\/Kiss-n-Tell-/);
  await expect(page.getByRole("link", { name: "Desktop downloads" })).toHaveAttribute("href", /releases/);
});

test("shows an error and recovers when content fails to load", async ({ page }) => {
  await page.unrouteAll();
  await mockContent(page, { failManifest: 1 });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
});
