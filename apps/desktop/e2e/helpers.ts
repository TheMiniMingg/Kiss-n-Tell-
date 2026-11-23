import { expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

export const WORDS = { common: "apple", rare: "cherry", legendary: "dragonfruit" } as const;

export function stageSvg(stage: number, w = 300, h = 400): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#335"/><text x="${w / 2}" y="${h / 2}" font-size="60" text-anchor="middle" fill="#fff">${stage}</text></svg>`,
  );
}

export function stageFiles(count = 11, w = 300, h = 400) {
  return Array.from({ length: count }, (_, s) => ({
    name: `${String(s).padStart(2, "0")}.svg`,
    mimeType: "image/svg+xml",
    buffer: stageSvg(s, w, h),
  }));
}

export function questionsCsv(count = 8): string {
  const rows = ["question_id,prompt,answer,tier,timer_seconds"];
  for (let i = 1; i <= count; i++) {
    rows.push(`q${i},Test question ${i},${WORDS.common},common,20`);
    rows.push(`q${i},,${WORDS.rare},rare,`);
    rows.push(`q${i},,${WORDS.legendary},legendary,`);
  }
  return rows.join("\n") + "\n";
}

export function packZip(id: string, title: string, extra: Record<string, Uint8Array> = {}, folder = id): Buffer {
  const entries: Record<string, Uint8Array> = {
    [`${folder}/topic.json`]: strToU8(JSON.stringify({ id, title, description: "Zipped" })),
    [`${folder}/questions.csv`]: strToU8(questionsCsv(8)),
    [`${folder}/character/character.json`]: strToU8(JSON.stringify({ id: `${id}-char`, name: "Zed", age: 30, asset_rights: "Test art" })),
    ...extra,
  };
  for (let s = 0; s <= 10; s++) entries[`${folder}/character/${String(s).padStart(2, "0")}.svg`] = new Uint8Array(stageSvg(s));
  return Buffer.from(zipSync(entries));
}

/** Skip the age gate and open the editor. */
export async function openEditor(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("knt:adult-confirmed", "true"));
  await page.goto("./");
  await page.getByRole("button", { name: "Make your own packs" }).click();
  await expect(page.getByRole("heading", { name: "Pack editor" })).toBeVisible();
}

export const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });

/** Build a complete, playable pack through the UI. */
export async function makePack(page: Page, title: string) {
  await page.getByRole("main").getByRole("button", { name: "New pack" }).click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Name", { exact: true }).fill("Test Character");
  await page.getByLabel("Age").fill("25");
  await page.getByLabel("Asset rights").fill("Made for tests");
  await page.getByRole("tab", { name: /Questions/ }).click();
  await page.getByTestId("csv-input").setInputFiles({ name: "questions.csv", mimeType: "text/csv", buffer: Buffer.from(questionsCsv(8)) });
  await expect(page.getByRole("status")).toContainText("Imported 8 questions");
  await page.getByRole("tab", { name: /Images/ }).click();
  await page.getByTestId("image-input").setInputFiles(stageFiles());
  await expect(page.getByRole("status")).toContainText("11 images added");
}
