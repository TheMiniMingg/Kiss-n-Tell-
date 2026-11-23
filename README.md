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
packages/engine/     Game rules: scoring, answer matching, question draw, timer, validation (unit-tested, no UI)
packages/ui/         React screens and components shared by web and desktop
content/presets/     Topics, questions and character art
scripts/             Content build/validation and placeholder art generator
docs/                Content guide and design notes
```

The desktop app (Tauri, with an offline pack editor) is planned to share `packages/engine` and `packages/ui`.

## Licenses

- **Code** is MIT licensed (see [LICENSE](LICENSE)).
- **Art and question content** are not covered by the code license. Each character's `character.json` records where its art came from in `asset_rights`.

People who build their own packs or use their own AI providers with this code are responsible for what they create and share.
