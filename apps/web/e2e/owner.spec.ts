import { createHash } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { MANIFEST, WORDS, expect, playRun, test } from "./fixtures";

/**
 * Owner mode against a fake /api/edit: the real server is covered by the unit
 * tests in api/test. This checks the screens and what they send.
 */
const PASSWORD = "e2e-only-password";

function stageSvg(label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#335"/><text x="150" y="200" font-size="60" text-anchor="middle" fill="#fff">${label}</text></svg>`;
}

function seedFiles(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const put = (p: string, s: string) => files.set(p, Buffer.from(s));
  put("content/site.json", JSON.stringify({ text: { title: "Kiss N Tell" }, donate: { label: "Donate", url: "" }, socials: [{ platform: "instagram", url: "" }] }, null, 2) + "\n");
  put("content/presets/alpha/topic.json", JSON.stringify({ id: "alpha", title: "Alpha Topic", description: "First", order: 1 }, null, 2) + "\n");
  put("content/presets/alpha/character/character.json", JSON.stringify({ id: "alpha-girl", name: "Alpha Girl", age: 25, asset_rights: "test" }, null, 2) + "\n");
  const rows = ["question_id,prompt,answer,tier,timer_seconds"];
  for (let i = 1; i <= 8; i++) {
    rows.push(`q${i},Alpha question ${i},apple,common,20`, `q${i},,cherry,rare,`, `q${i},,dragonfruit,legendary,`);
  }
  put("content/presets/alpha/questions.csv", rows.join("\n") + "\n");
  for (let s = 0; s <= 10; s++) put(`content/presets/alpha/character/${String(s).padStart(2, "0")}.svg`, stageSvg(String(s)));
  return files;
}

const gitSha = (b: Buffer) => createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");

interface FakeServer {
  files: Map<string, Buffer>;
  commits: { summary: string; changes: Record<string, unknown>[] }[];
  unlocked: boolean;
  failures: number;
  github: boolean;
}

async function fakeEditApi(page: Page, opts: { github?: boolean } = {}): Promise<FakeServer> {
  const server: FakeServer = { files: seedFiles(), commits: [], unlocked: false, failures: 0, github: opts.github ?? true };
  const blobs = new Map<string, Buffer>();
  await page.route("**/api/edit?**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const op = url.searchParams.get("op");
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (req.headers()["x-knt-editor"] !== "1") return json(403, { error: "Forbidden." });
    if (op === "session") return json(200, { configured: true, github: server.github, unlocked: server.unlocked, repo: "o/r", branch: "main" });
    if (op === "unlock") {
      if (server.failures >= 5) return json(429, { error: "Too many wrong passwords. Try again later.", retryAfter: 900 });
      if ((req.postDataJSON() as { password: string }).password !== PASSWORD) {
        server.failures++;
        if (server.failures >= 5) return json(429, { error: "Too many wrong passwords. Try again later.", retryAfter: 900 });
        return json(401, { error: "Wrong password.", remaining: 5 - server.failures });
      }
      server.unlocked = true;
      return json(200, { unlocked: true });
    }
    if (op === "lock") {
      server.unlocked = false;
      return json(200, { unlocked: false });
    }
    if (!server.unlocked) return json(401, { error: "Locked. Enter the password again." });
    if (op === "list") {
      const files = [...server.files].map(([path, b]) => {
        const sha = gitSha(b);
        blobs.set(sha, b);
        return { path, sha, size: b.length };
      });
      return json(200, { repo: "o/r", branch: "main", head: "h", files });
    }
    if (op === "raw") return route.fulfill({ status: 200, contentType: "application/octet-stream", body: blobs.get(url.searchParams.get("sha")!)! });
    if (op === "blob") {
      const b = req.postDataBuffer()!;
      blobs.set(gitSha(b), b);
      return json(200, { sha: gitSha(b) });
    }
    if (op === "commit") {
      const body = req.postDataJSON() as { summary: string; changes: Record<string, unknown>[] };
      server.commits.push(body);
      for (const c of body.changes) {
        const path = c.path as string;
        if (c.delete) server.files.delete(path);
        else if (typeof c.text === "string") server.files.set(path, Buffer.from(c.text));
        else server.files.set(path, blobs.get(c.blobSha as string)!);
      }
      return json(200, { commit: "abc" });
    }
    return json(404, { error: "Unknown request." });
  });
  return server;
}

async function unlock(page: Page) {
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("navigation", { name: "Owner mode" })).toBeVisible();
}

test("the footer's Edit site link asks for the password, and wrong ones count down to a lockout", async ({ page }) => {
  const server = await fakeEditApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit site" }).click();
  await expect(page.getByRole("heading", { name: "Owner login" })).toBeVisible();
  await expect(page).toHaveTitle("Edit site · Kiss N Tell");

  const unlockBtn = page.getByRole("button", { name: "Unlock" });
  await expect(unlockBtn).toBeDisabled(); // nothing typed yet
  await page.getByLabel("Password").fill("wrong");
  await unlockBtn.click();
  await expect(page.getByRole("alert")).toHaveText("Wrong password. 4 tries left before a lockout.");
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.getByLabel("Password")).toBeFocused();

  for (const left of ["3 tries", "2 tries", "1 try"]) {
    await page.getByLabel("Password").fill("wrong");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText(`Wrong password. ${left} left before a lockout.`);
  }
  await page.getByLabel("Password").fill("wrong");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Too many wrong passwords. Try again in 15 minutes.");
  await expect(page.getByLabel("Password")).toBeDisabled();
  expect(server.unlocked).toBe(false);

  await page.getByRole("button", { name: "Back to game" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
});

test("unlocking shows the topics from the repo; edits are saved as one commit with only what changed", async ({ page }) => {
  const server = await fakeEditApi(page);
  await page.goto("/#edit");
  await unlock(page);

  const side = page.getByRole("complementary", { name: "Topics" });
  await expect(side.getByRole("button", { name: /Alpha Topic/ })).toContainText("8 questions · 11/11 images · Playable");
  await side.getByRole("button", { name: /Alpha Topic/ }).click();
  await page.getByLabel("Title", { exact: true }).fill("Alpha Renamed");
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to the site");

  expect(server.commits).toHaveLength(1);
  expect(server.commits[0]!.summary).toBe("update topic alpha");
  expect(server.commits[0]!.changes.map((c) => c.path)).toEqual(["content/presets/alpha/topic.json"]);
  expect(JSON.parse(server.files.get("content/presets/alpha/topic.json")!.toString())).toMatchObject({ id: "alpha", title: "Alpha Renamed", order: 1 });
});

test("a new topic with errors is saved as a hidden draft", async ({ page }) => {
  const server = await fakeEditApi(page);
  await page.goto("/#edit");
  await unlock(page);
  await page.getByRole("button", { name: "New pack" }).first().click();
  await page.getByRole("button", { name: "Blank pack" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Moons");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved as a hidden draft");
  expect([...server.files.keys()].filter((p) => p.includes("moons"))).toEqual(
    expect.arrayContaining(["content/presets/_moons/topic.json", "content/presets/_moons/questions.csv"]),
  );
  await expect(page.getByRole("complementary", { name: "Topics" }).getByRole("button", { name: /Moons/ })).toBeVisible();
});

test("site text and links: bad links block saving, good ones are committed to site.json", async ({ page }) => {
  const server = await fakeEditApi(page);
  await page.goto("/#edit");
  await unlock(page);
  await page.getByRole("tab", { name: "Site text & links" }).click();

  await page.getByLabel("Tagline under the logo").fill("New tagline");
  await page.getByLabel("Donation link").fill("ko-fi.com/me");
  await expect(page.getByRole("alert")).toContainText("Fix these links before saving: Donate link.");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();

  await page.getByLabel("Donation link").fill("https://ko-fi.com/me");
  await page.getByLabel("Profile link").first().fill("https://instagram.com/me");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link 2: platform").selectOption("tiktok");
  await page.getByLabel("Profile link").nth(1).fill("https://www.tiktok.com/@me");
  // The preview shows the buttons players will see.
  const preview = page.getByRole("region", { name: "Support and social links" });
  await expect(preview.getByRole("link", { name: /Donate/ })).toHaveAttribute("href", "https://ko-fi.com/me");
  await expect(preview.getByRole("link", { name: "TikTok" })).toBeVisible();

  await save.click();
  await expect(page.getByRole("status")).toContainText("Saved.");
  const site = JSON.parse(server.files.get("content/site.json")!.toString());
  expect(site.text.tagline).toBe("New tagline");
  expect(site.donate).toEqual({ label: "Donate", url: "https://ko-fi.com/me" });
  expect(site.socials).toEqual([
    { platform: "instagram", url: "https://instagram.com/me" },
    { platform: "tiktok", url: "https://www.tiktok.com/@me" },
  ]);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("leaving with unsaved changes asks first, and Lock goes back to the password", async ({ page }) => {
  await fakeEditApi(page);
  await page.goto("/#edit");
  await unlock(page);
  await page.getByRole("tab", { name: "Site text & links" }).click();
  await page.getByLabel("Footer note").fill("Changed");

  await page.getByRole("tab", { name: "Topics & questions" }).click();
  await expect(page.getByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Footer note")).toHaveValue("Changed");

  await page.getByRole("button", { name: "Lock" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("heading", { name: "Owner login" })).toBeVisible();
});

test("Back to game leaves owner mode and drops the #edit link", async ({ page }) => {
  await fakeEditApi(page);
  await page.goto("/#edit");
  await unlock(page);
  await page.getByRole("navigation", { name: "Owner mode" }).getByRole("button", { name: "Back to game" }).click();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.reload();
  await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
});

test("without a GitHub token, owner mode explains what's missing", async ({ page }) => {
  await fakeEditApi(page, { github: false });
  await page.goto("/#edit");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "Saving isn't set up yet" })).toBeVisible();
  await expect(page.getByText(/GITHUB_TOKEN/)).toBeVisible();
});

test("owner mode says so when there's no edit server (e.g. a static preview)", async ({ page }) => {
  await page.route("**/api/edit?**", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.goto("/#edit");
  await expect(page.getByRole("alert")).toContainText("Owner mode only works on the deployed site");
});

test.describe("donate and social buttons", () => {
  test("are hidden until a link is set", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Play Alpha Topic" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Support and social links" })).toHaveCount(0);
  });

  test("show on home and results with the site's text", async ({ page }) => {
    const site = {
      text: { title: "My Trivia", tagline: "Custom tagline", topicsHeading: "Pick one", supportText: "Buy me a coffee", footerNote: "Custom note" },
      donate: { label: "Tip me", url: "https://ko-fi.com/me" },
      socials: [{ platform: "x", url: "https://x.com/me" }, { platform: "instagram", url: "" }, { platform: "website", url: "javascript:alert(1)" }],
    };
    await page.route("**/content/manifest.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...MANIFEST, site }) }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "My Trivia" })).toBeVisible();
    await expect(page).toHaveTitle("My Trivia");
    await expect(page.getByText("Custom tagline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pick one" })).toBeVisible();
    await expect(page.getByText("Custom note")).toBeVisible();
    const support = page.getByRole("region", { name: "Support and social links" });
    await expect(support).toContainText("Buy me a coffee");
    const donate = support.getByRole("link", { name: /Tip me/ });
    await expect(donate).toHaveAttribute("href", "https://ko-fi.com/me");
    await expect(donate).toHaveAttribute("target", "_blank");
    await expect(donate).toHaveAttribute("rel", /noopener/);
    await expect(support.getByRole("link")).toHaveCount(2); // empty and unsafe links are left out
    await expect(support.getByRole("link", { name: "X" })).toHaveAttribute("href", "https://x.com/me");

    await page.getByRole("button", { name: "Play Alpha Topic" }).click();
    await playRun(page, Array(7).fill(WORDS.miss));
    await expect(page.getByRole("region", { name: "Support and social links" }).getByRole("link", { name: /Tip me/ })).toBeVisible();
    await expect(page).toHaveTitle("Alpha Topic · My Trivia");
  });
});
