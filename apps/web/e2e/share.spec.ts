import { expect, playRun, startTopic, test, WORDS } from "./fixtures";

test("download saves a PNG share card", async ({ page }) => {
  await startTopic(page);
  await playRun(page, Array(7).fill(WORDS.rare));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("kiss-n-tell-alpha-14.png");
  await expect(page.getByRole("status").filter({ hasText: "Image downloaded." })).toBeVisible();
});

test("copy puts the share card on the clipboard", async ({ page, context, browserName }, info) => {
  test.skip(info.project.name === "phone", "Clipboard images are a desktop feature in Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await startTopic(page);
  await playRun(page, Array(7).fill(WORDS.legendary));
  await page.getByRole("button", { name: "Copy image" }).click();
  await expect(page.getByText("Image copied. Paste it anywhere.")).toBeVisible();
  const types = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.flatMap((i) => i.types);
  });
  expect(types).toContain("image/png");
  void browserName;
});

test("the share card is a 1080x1350 image", async ({ page }) => {
  await startTopic(page);
  await playRun(page, Array(7).fill(WORDS.common));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const fs = await import("node:fs");
  const buf = fs.readFileSync(path);
  // PNG IHDR width/height
  expect(buf.readUInt32BE(16)).toBe(1080);
  expect(buf.readUInt32BE(20)).toBe(1350);
});
