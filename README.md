# Kiss N Tell

A rare-answer trivia game. Pick a topic, answer 7 random questions with one word each, and score more for rarer answers. Every point moves the topic's character one stage forward; reach 10 points to unlock the ending image.

- **Common** answer: +1
- **Rare** answer: +2
- **Legendary** answer: +3
- Not on the list, typo or timeout: 0

You get one guess per question and 20 seconds (by default). Blank, one-letter and multi-word inputs are rejected without using up the question. The ending (stage 10) shows as soon as you reach 10 points; you keep answering to push your score toward 21, then share your result card.

> Kiss N Tell is for adults (18+). All characters are fictional adults; the art is suggestive (swimwear) with no nudity.

## Quick start

Requires Node 20+ and pnpm 10.

```bash
pnpm install
pnpm dev          # builds content, starts the web game at http://localhost:5173
pnpm build        # production build in apps/web/dist
pnpm check        # typecheck + unit tests + content validation
pnpm test:e2e     # browser tests (needs a Playwright Chromium)
pnpm test:e2e:desktop  # browser tests for the desktop pack editor
pnpm desktop:dev  # desktop app with hot reload (needs Rust + Tauri prerequisites)
```

## Adding content

Each topic lives in `content/presets/<topic-id>/`:

```
content/presets/<topic-id>/
  topic.json            # id, title, description, order
  questions.csv         # one row per accepted answer
  character/
    character.json      # id, name, age (18+), species, asset_rights
    00.webp ... 10.webp # stage images: 00 = start, 10 = ending
```

See [docs/content-guide.md](docs/content-guide.md) for the CSV format, image rules and validation. Run `pnpm content:check` to validate everything without building.

## Project layout

```
apps/web/            Website (Vite + React), preset play only
apps/desktop/        Desktop app (Tauri v2): the same game plus an offline pack editor
packages/engine/     Game rules: scoring, answer matching, question draw, timer, validation (unit-tested, no UI)
packages/ui/         React screens and components shared by web and desktop
content/presets/     Topics, questions and character art
scripts/             Content build/validation and placeholder art generator
docs/                Content guide and design notes
```

## Desktop app

The desktop app plays the same presets and adds a pack editor: make your own topics (questions, character, 11 stage images), check them, preview a run, and import or export them as ZIP files. Packs are saved in the app's data folder and show up on the topic list as "My pack".

- **Download:** installers for Windows and macOS are attached to each [GitHub Release](https://github.com/TheMiniMingg/Kiss-n-Tell-/releases). They are unsigned, so Windows SmartScreen and macOS Gatekeeper will warn the first time; see [apps/desktop/README.md](apps/desktop/README.md#installing-the-unsigned-builds).
- **Run from source:** `pnpm desktop:dev` (needs Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).
- **Editor in a browser:** `pnpm --filter @kiss-n-tell/desktop dev:frontend` runs the editor without the native shell, storing packs in the browser.

See [apps/desktop/README.md](apps/desktop/README.md) for the pack format, where packs are stored, and how releases are built.

## Licenses

- **Code** is MIT licensed (see [LICENSE](LICENSE)).
- **Art and question content** are not covered by the code license. Each character's `character.json` records where its art came from in `asset_rights`.

People who build their own packs or use their own AI providers with this code are responsible for what they create and share.
