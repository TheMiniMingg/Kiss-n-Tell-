import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { strToU8, unzipSync } from "fflate";
import { WORDS, makePack, openEditor, packZip, questionsCsv, saveButton, stageFiles } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("build a pack from scratch, save it and play it", async ({ page }) => {
  await makePack(page, "My Test Pack");
  await page.getByRole("tab", { name: /Topic/ }).click();
  await expect(page.getByLabel("Topic id")).toHaveValue("my-test-pack");
  await expect(page.locator(".ed-head .pill--good")).toHaveText("Playable");

  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(page.locator(".ed-head .pill").first()).toHaveText("Saved");
  await expect(page.getByRole("complementary", { name: "Your packs" })).toContainText("My Test Pack");

  // It survives a reload (stored, not just in memory).
  await page.reload();
  await page.getByRole("button", { name: "Make your own packs" }).click();
  await expect(page.getByRole("button", { name: /My Test Pack.*Playable/ })).toBeVisible();

  // And shows up on the topic list as "My pack" and plays.
  await page.getByRole("button", { name: /Back to game/ }).click();
  const card = page.getByRole("button", { name: "Play My Test Pack" });
  await expect(card).toContainText("My pack");
  await card.click();
  await page.getByPlaceholder("One word").fill(WORDS.legendary);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByTestId("result")).toContainText("+3");
});

test("a pack with errors is saved but not playable", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Half Done");
  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("Fix");
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No stage images yet (00-10).");
  await expect(page.getByRole("tabpanel")).toContainText("Needs at least 7 questions");
  // Show jumps to the right tab.
  await page.locator(".ed-issue", { hasText: "No stage images" }).getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("tab", { name: /Images/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: /Back to game/ }).click();
  await expect(page.getByRole("button", { name: "Play Half Done" })).toHaveCount(0);
});

test("question editing: add, type answers, duplicates are flagged", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByRole("tab", { name: /Questions/ }).click();
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByLabel("Prompt")).toBeFocused();
  await page.getByLabel("Prompt").fill("Name a fruit");
  const common = page.getByRole("textbox", { name: /Common/ });
  await common.fill("Apple\nPear\n");
  await expect(common).toHaveValue("Apple\nPear\n"); // a new empty line isn't swallowed while typing
  await page.getByRole("textbox", { name: /Rare/ }).fill("Quince, pear");
  await expect(page.getByRole("region", { name: "Edit question" })).toContainText('"pear" is in both common and rare');
  await expect(page.locator(".ed-qitem").first()).toContainText("Name a fruit");
  await expect(page.locator(".ed-qitem .ed-dot--error")).toHaveCount(1);
  await page.getByRole("textbox", { name: /Rare/ }).fill("Quince");
  await expect(page.locator(".ed-qitem .ed-dot--error")).toHaveCount(0);
  // Two-word answers are errors.
  await page.getByRole("textbox", { name: /Legendary/ }).fill("Star fruit");
  await expect(page.getByRole("region", { name: "Edit question" })).toContainText("more than one word");
});

test("unsaved changes are protected", async ({ page }) => {
  await makePack(page, "Guarded");
  await page.getByRole("button", { name: /Back to game/ }).click();
  await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByRole("button", { name: /Back to game/ }).click();
  await expect(page.getByRole("heading", { name: "Kiss N Tell" })).toBeVisible();
});

test("export a pack as a ZIP and import it again", async ({ page }) => {
  await makePack(page, "Round Trip");
  await saveButton(page).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("round-trip.zip");
  const zip = readFileSync((await download.path()) as string);
  const names = Object.keys(unzipSync(new Uint8Array(zip))).sort();
  expect(names).toContain("round-trip/topic.json");
  expect(names).toContain("round-trip/questions.csv");
  expect(names).toContain("round-trip/character/character.json");
  expect(names).toContain("round-trip/character/10.svg");

  await page.getByTestId("zip-input").setInputFiles({ name: "round-trip.zip", mimeType: "application/zip", buffer: zip });
  await expect(page.getByRole("status")).toContainText("Imported round-trip.zip");
  // Same id as an existing pack: renamed rather than overwritten.
  await page.getByRole("tab", { name: /Topic/ }).click();
  await expect(page.getByLabel("Topic id")).toHaveValue("round-trip-2");
  await saveButton(page).click();
  await expect(page.getByRole("complementary", { name: "Your packs" }).locator(".ed-pack")).toHaveCount(2);
});

test("imports a ZIP made outside the app", async ({ page }) => {
  await page.getByTestId("zip-input").setInputFiles({ name: "outside.zip", mimeType: "application/zip", buffer: packZip("outside", "Outside Pack", { "outside/readme.txt": strToU8("hi") }) });
  await expect(page.getByRole("status")).toContainText("Imported outside.zip");
  await expect(page.locator(".ed-head .pill--good")).toHaveText("Playable");
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Ignored outside/readme.txt");
});

test("refuses unsafe or oversized ZIPs", async ({ page }) => {
  await page.getByTestId("zip-input").setInputFiles({
    name: "evil.zip",
    mimeType: "application/zip",
    buffer: packZip("evil", "Evil", { "evil/../../escape.txt": strToU8("x") }),
  });
  await expect(page.getByRole("status")).toContainText("unsafe paths");
  await page.getByTestId("zip-input").setInputFiles({ name: "junk.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip at all, nope, nothing here") });
  await expect(page.getByRole("status")).toContainText("not a readable ZIP");
  await expect(page.getByRole("heading", { name: "Pack editor" })).toBeVisible();
});

test("images: named files go to their stage, others fill gaps; bad files are skipped", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByRole("tab", { name: /Images/ }).click();
  const [s0, , , , , , , , , , s10] = stageFiles();
  await page.getByTestId("image-input").setInputFiles([
    { ...s10!, name: "ending-10.svg" },
    { ...s0!, name: "portrait.svg" },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
  ]);
  await expect(page.getByRole("status")).toContainText("Added 2");
  await expect(page.getByRole("status")).toContainText("notes.txt");
  await expect(page.getByRole("button", { name: "Show stage 10 in the preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show stage 00 in the preview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Images/ })).toContainText("2/11");

  // A different shape is an error.
  await page.getByTestId("image-input").setInputFiles(stageFiles(11, 400, 300).slice(1, 2));
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("All images need the same shape");
});

test("copy a built-in topic as a starting point", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: /Copy “Animals”/ }).click();
  await expect(page.getByRole("status")).toContainText('Copied "Animals"');
  await expect(page.getByRole("tab", { name: /Images/ })).toContainText("11/11");
  await expect(page.locator(".ed-head .pill--good")).toHaveText("Playable");
});

test("preview a run without recording a score", async ({ page }) => {
  await makePack(page, "Preview Me");
  await page.getByRole("button", { name: "Preview run" }).click();
  await expect(page.getByRole("region", { name: "Preview run" })).toContainText("scores aren't saved");
  for (let i = 0; i < 7; i++) {
    await page.getByPlaceholder("One word").fill(WORDS.legendary);
    await page.getByRole("button", { name: "Submit" }).click();
    // The game ignores "Next" for a moment after answering so a double Enter can't skip feedback.
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Next question|See results/ }).click();
  }
  await expect(page.getByTestId("final-score")).toHaveText("21");
  await expect(page.getByText("New best")).toHaveCount(0);
  // The share card can be saved from the preview too.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image" }).click();
  expect((await download).suggestedFilename()).toBe("kiss-n-tell-preview-21.png");
  await page.getByRole("button", { name: "Back to editor" }).click();
  await expect(page.getByRole("tab", { name: /Images/ })).toBeVisible();
});

test("rename on save, clash with another pack is refused, delete", async ({ page }) => {
  await makePack(page, "First");
  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByRole("complementary").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Second");
  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  // Give "second" the id "first": flagged and refused.
  await page.getByLabel("Topic id").fill("first");
  await expect(page.locator(".ed-head .pill--bad")).toBeVisible();
  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("already exists");

  // Rename to a free id works and replaces the old folder.
  await page.getByLabel("Topic id").fill("second-renamed");
  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(page.getByRole("complementary").locator(".ed-pack")).toHaveCount(2);

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete pack" }).click();
  await expect(page.getByRole("status")).toContainText("Pack deleted");
  await expect(page.getByRole("complementary").locator(".ed-pack")).toHaveCount(1);
});

test("CSV export and import keep the questions", async ({ page }) => {
  await makePack(page, "Csv Pack");
  await page.getByRole("tab", { name: /Questions/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = readFileSync((await (await downloadPromise).path()) as string, "utf8");
  expect(csv).toBe(questionsCsv(8));
  // Importing over existing questions asks first.
  await page.getByTestId("csv-input").setInputFiles({ name: "q.csv", mimeType: "text/csv", buffer: Buffer.from(questionsCsv(9)) });
  await page.getByRole("dialog").getByRole("button", { name: "Replace all" }).click();
  await expect(page.getByRole("tab", { name: /Questions/ })).toContainText("9");
  // Adding keeps the existing ones and renumbers clashing ids.
  await page.getByTestId("csv-input").setInputFiles({ name: "more.csv", mimeType: "text/csv", buffer: Buffer.from(questionsCsv(2)) });
  await page.getByRole("dialog").getByRole("button", { name: "Add to the end" }).click();
  await expect(page.getByRole("tab", { name: /Questions/ })).toContainText("11");
  await expect(page.getByRole("status")).toContainText("2 question ids were already used");
  await expect(page.getByLabel("Question id")).toHaveValue("q1-2");
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(page.getByRole("tabpanel")).not.toContainText("Duplicate question id");
});

test("drop a pack ZIP anywhere in the editor to import it", async ({ page }) => {
  const zip = packZip("dropped", "Dropped Pack");
  const dt = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "dropped.zip", { type: "application/zip" }));
    return data;
  }, zip.toString("base64"));
  const target = page.getByRole("heading", { name: "Pack editor" });
  await target.dispatchEvent("dragover", { dataTransfer: dt });
  await target.dispatchEvent("drop", { dataTransfer: dt });
  await expect(page.getByRole("status")).toContainText("Imported dropped.zip");
  await expect(page.getByRole("heading", { name: "Dropped Pack" })).toBeVisible();
});

test("tabs work with the arrow keys", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByRole("tab", { name: /Topic/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Questions/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /Questions/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: /Check/ })).toHaveAttribute("aria-selected", "true");
});

test("narrow window: no sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await makePack(page, "Narrow");
  for (const tab of ["Topic", "Questions", "Images", "Check"]) {
    await page.getByRole("tab", { name: new RegExp(tab) }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, tab).toBeLessThanOrEqual(0);
  }
});

test("secret image: optional slot, picked by name or directly, saved, exported and shown after a perfect preview run", async ({ page }) => {
  await makePack(page, "Secret Pack");
  // Playable without a secret.
  await expect(page.locator(".ed-head .pill--good")).toHaveText("Playable");
  await expect(page.getByRole("button", { name: "Choose a secret image" })).toBeVisible();

  // A file named "secret" picked with others goes to the secret slot, not a stage.
  await page.getByTestId("image-input").setInputFiles([{ name: "secret.svg", mimeType: "image/svg+xml", buffer: Buffer.from(stageFiles(1)[0]!.buffer) }]);
  await expect(page.getByRole("status")).toContainText("Image added");
  await expect(page.getByRole("button", { name: "Show the secret image in the preview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Images/ })).toContainText("11/11");

  // Preview toggle.
  await page.getByRole("checkbox", { name: "Show the secret image" }).check();
  await expect(page.locator(".ed-images__preview .stage__count")).toHaveText("Secret");
  await page.getByRole("checkbox", { name: "Show the secret image" }).uncheck();
  await expect(page.locator(".ed-images__preview .stage__count")).not.toHaveText("Secret");

  // A different shape is an error, like a stage.
  await page.getByRole("button", { name: "Replace the secret image" }).click();
  await page.getByTestId("image-input").setInputFiles(stageFiles(1, 400, 300));
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("The secret image is 400x300");
  await page.getByRole("tab", { name: /Images/ }).click();
  await page.getByRole("button", { name: "Replace the secret image" }).click();
  await page.getByTestId("image-input").setInputFiles(stageFiles(1));
  await expect(page.locator(".ed-head .pill--good")).toHaveText("Playable");

  // Saved, and still there after a reload.
  await saveButton(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.reload();
  await page.getByRole("button", { name: "Make your own packs" }).click();
  await page.getByRole("complementary", { name: "Your packs" }).getByRole("button", { name: /Secret Pack/ }).click();
  await page.getByRole("tab", { name: /Images/ }).click();
  await expect(page.getByRole("button", { name: "Show the secret image in the preview" })).toBeVisible();

  // In the exported ZIP.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP" }).click();
  const zip = unzipSync(new Uint8Array(readFileSync(await (await download).path())));
  expect(Object.keys(zip)).toContain("secret-pack/character/secret.svg");

  // A perfect preview run reveals it.
  await page.getByRole("button", { name: "Preview run" }).click();
  for (let i = 0; i < 7; i++) {
    await page.getByPlaceholder("One word").fill(WORDS.legendary);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Next question|See results/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Secret unlocked!" })).toBeVisible();
  await page.getByRole("button", { name: "Back to editor" }).first().click();

  // Remove it again.
  await page.getByRole("tab", { name: /Images/ }).click();
  await page.getByRole("button", { name: "Remove the secret image" }).click();
  await expect(page.getByRole("button", { name: "Choose a secret image" })).toBeVisible();
});

test("a single file dropped on a stage slot goes to that stage even if it's named secret", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByRole("tab", { name: /Images/ }).click();
  await page.getByRole("button", { name: "Choose an image for stage 04" }).click();
  await page.getByTestId("image-input").setInputFiles([{ name: "secret.svg", mimeType: "image/svg+xml", buffer: stageFiles(1)[0]!.buffer }]);
  await expect(page.getByRole("button", { name: "Show stage 04 in the preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a secret image" })).toBeVisible();
});

test("imports a ZIP with a secret image", async ({ page }) => {
  await page.getByTestId("zip-input").setInputFiles({
    name: "zipped.zip",
    mimeType: "application/zip",
    buffer: packZip("zipped", "Zipped", { "zipped/character/secret.svg": new Uint8Array(stageFiles(1)[0]!.buffer) }),
  });
  await page.getByRole("tab", { name: /Images/ }).click();
  await expect(page.getByRole("button", { name: "Show the secret image in the preview" })).toBeVisible();
});

test("copying a built-in topic keeps its secret image", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: /Copy “Animals”/ }).click();
  await expect(page.getByRole("status")).toContainText('Copied "Animals"');
  await page.getByRole("tab", { name: /Images/ }).click();
  await expect(page.getByRole("button", { name: "Show the secret image in the preview" })).toBeVisible();
});
