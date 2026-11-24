import { describe, expect, it } from "vitest";
import { commitMessage, isEditablePath, validateChanges } from "../_lib/paths.js";

describe("editable paths", () => {
  it("allows only content files", () => {
    for (const p of [
      "content/site.json",
      "content/presets/space/topic.json",
      "content/presets/space/questions.csv",
      "content/presets/space/character/character.json",
      "content/presets/space/character/00.webp",
      "content/presets/space/character/10.svg",
      "content/presets/_draft-1/character/05.jpeg",
      "content/presets/space/character/secret.webp",
    ]) {
      expect(isEditablePath(p), p).toBe(true);
    }
    for (const p of [
      "package.json",
      "api/edit.ts",
      ".github/workflows/ci.yml",
      "content/presets/space/notes.txt",
      "content/presets/space/character/11.webp",
      "content/presets/space/character/5.webp",
      "content/presets/space/character/00.gif",
      "content/presets/space/character/secret.gif",
      "content/presets/space/character/Secret.webp",
      "content/presets/space/secret.webp",
      "content/presets/../../api/edit.ts",
      "content/presets/Space/topic.json",
      "content/presets/space/../space/topic.json",
      "content/presets/__x/topic.json",
      "content/presets//topic.json",
      "content/presets/space/sub/topic.json",
      "content/site.json/x",
    ]) {
      expect(isEditablePath(p), p).toBe(false);
    }
  });

  it("checks a change list", () => {
    expect(validateChanges([])).toEqual({ error: "No changes to save." });
    expect(validateChanges("x")).toEqual({ error: "No changes to save." });
    expect(validateChanges([{ path: "package.json", text: "{}" }])).toHaveProperty("error");
    expect(validateChanges([{ path: "content/site.json", delete: true }])).toHaveProperty("error");
    expect(validateChanges([{ path: "content/site.json", text: "[1]" }])).toHaveProperty("error");
    expect(validateChanges([{ path: "content/site.json", text: "{nope" }])).toHaveProperty("error");
    expect(validateChanges([{ path: "content/presets/a/character/00.png", text: "x" }])).toHaveProperty("error");
    expect(validateChanges([{ path: "content/presets/a/character/00.png", blobSha: "abc" }])).toHaveProperty("error");
    expect(validateChanges([{ path: "content/presets/a/topic.json", text: "{}" }, { path: "content/presets/a/topic.json", delete: true }])).toHaveProperty("error");
    const sha = "a".repeat(40);
    expect(
      validateChanges([
        { path: "content/site.json", text: "{}" },
        { path: "content/presets/a/character/00.png", blobSha: sha },
        { path: "content/presets/b/topic.json", delete: true },
      ]),
    ).toEqual({
      changes: [
        { path: "content/site.json", text: "{}" },
        { path: "content/presets/a/character/00.png", blobSha: sha },
        { path: "content/presets/b/topic.json", delete: true },
      ],
    });
    expect(validateChanges(Array.from({ length: 81 }, (_, i) => ({ path: `content/presets/t${i}/topic.json`, text: "{}" })))).toHaveProperty("error");
  });

  it("makes one-line commit messages", () => {
    expect(commitMessage("update topic space\nsecond line")).toBe("Site editor: update topic space second line");
    expect(commitMessage(undefined)).toBe("Site editor: update content");
    expect(commitMessage("x".repeat(500)).length).toBe("Site editor: ".length + 200);
  });
});
