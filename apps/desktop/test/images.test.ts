import { describe, expect, it } from "vitest";
import { imageExtOf, placeImages, stageFromName } from "../src/images.js";

describe("stageFromName", () => {
  it("reads the last number in the name", () => {
    expect(stageFromName("03.webp")).toBe(3);
    expect(stageFromName("stage-10.png")).toBe(10);
    expect(stageFromName("char_v2_07.jpg")).toBe(7);
    expect(stageFromName("portrait.png")).toBeNull();
    expect(stageFromName("stage-11.png")).toBeNull();
  });
});

describe("imageExtOf", () => {
  it("uses the extension, then the MIME type", () => {
    expect(imageExtOf({ name: "a.JPEG", type: "" })).toBe("jpg");
    expect(imageExtOf({ name: "a.webp", type: "" })).toBe("webp");
    expect(imageExtOf({ name: "blob", type: "image/png" })).toBe("png");
    expect(imageExtOf({ name: "a.gif", type: "image/gif" })).toBeNull();
  });
});

describe("placeImages", () => {
  const empty = Array(11).fill(null);
  it("puts numbered files on their stage and fills gaps in order", () => {
    const current = [...empty];
    current[0] = "taken";
    const { placed, unplaced } = placeImages(current, [
      { name: "10.png", value: "ten" },
      { name: "a.png", value: "a" },
      { name: "b.png", value: "b" },
    ]);
    expect([...placed.entries()]).toEqual([[10, "ten"], [1, "a"], [2, "b"]]);
    expect(unplaced).toEqual([]);
  });
  it("a single file can be forced onto a stage", () => {
    expect([...placeImages(empty, [{ name: "03.png", value: "x" }], 7).placed]).toEqual([[7, "x"]]);
  });
  it("reports files with no room", () => {
    const full = Array(11).fill("x");
    expect(placeImages(full, [{ name: "extra.png", value: 1 }]).unplaced).toEqual(["extra.png"]);
  });
  it("the first file for a stage wins; a second one fills a gap", () => {
    const { placed } = placeImages(empty, [{ name: "05.png", value: "a" }, { name: "5.png", value: "b" }]);
    expect(placed.get(5)).toBe("a");
    expect(placed.get(0)).toBe("b");
  });
});
