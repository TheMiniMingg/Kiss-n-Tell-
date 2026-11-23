import type { Page } from "@playwright/test";
import { answer, expect, playRun, startTopic, test, WORDS } from "./fixtures";

const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

async function noHorizontalScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(scroll, "page scrolls sideways").toBeLessThanOrEqual(inner);
}

async function noOverlap(page: Page, a: string, b: string) {
  const ra = await page.locator(a).first().boundingBox();
  const rb = await page.locator(b).first().boundingBox();
  expect(ra && rb).toBeTruthy();
  if (!ra || !rb) return;
  const overlaps = ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height;
  expect(overlaps, `${a} overlaps ${b}`).toBe(false);
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("home, play and results fit without overlap or sideways scroll", async ({ page }) => {
      await page.goto("/");
      await noHorizontalScroll(page);

      await startTopic(page);
      await noHorizontalScroll(page);
      await noOverlap(page, ".play__art", ".panel");
      await noOverlap(page, ".play__bar", ".play__art");
      // The answer box and Submit are fully on screen without scrolling on load.
      for (const sel of ["#answer", ".answer button[type=submit]"]) {
        const box = await page.locator(sel).boundingBox();
        expect(box).toBeTruthy();
        expect(box!.y + box!.height, `${sel} is below the fold`).toBeLessThanOrEqual(size.height);
        expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      }

      await answer(page, WORDS.common);
      await noHorizontalScroll(page);
      await page.waitForTimeout(400);
      await page.getByTestId("result").getByRole("button").click();

      await playRun(page, Array(6).fill(WORDS.legendary));
      await noHorizontalScroll(page);
      await noOverlap(page, ".results__art", ".results .panel");
    });
  });
}

test("long prompts and answers wrap instead of overflowing", async ({ page }) => {
  await page.route("**/content/manifest.json", async (route) => {
    const res = await route.fetch().catch(() => null);
    void res;
    const { MANIFEST } = await import("./fixtures");
    const m = structuredClone(MANIFEST);
    for (const q of m.topics[0]!.questions) {
      q.prompt = "Name something with an extraordinarily long prompt that keeps going and going " + "x".repeat(60);
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(m) });
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await startTopic(page);
  await answer(page, "Pneumonoultramicroscopicsilicovolcanoconiosis");
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(inner);
});
