# Content guide

## questions.csv

One row per accepted answer. Save it from any spreadsheet as **CSV UTF-8**.

| column | required | notes |
| --- | --- | --- |
| `question_id` | every row | Lowercase letters, digits, `-` or `_`. Rows with the same id belong to the same question. |
| `prompt` | once per question | The question text. Later rows of the same question can leave it blank. |
| `answer` | every answer row | One word, 2 to 40 characters. Matching ignores case, surrounding spaces and surrounding punctuation, and treats curly apostrophes (’) as straight ones (') so phone keyboards match. |
| `tier` | every answer row | `common`, `rare` or `legendary` (or `c`/`r`/`l`, or `1`/`2`/`3`). |
| `timer_seconds` | optional | 5 to 120. Defaults to 20. Only needs to be on one row of the question. |

Example:

```csv
question_id,prompt,answer,tier,timer_seconds
olympians,Name one of the twelve Olympian gods,Zeus,common,20
olympians,,Athena,common,
olympians,,Hephaestus,rare,
olympians,,Hestia,legendary,
```

### Rules the validator enforces

- A topic needs at least **7 questions**. More is better: each run draws 7 at random and avoids questions the player has seen recently.
- No blank, one-letter or multi-word answers.
- No duplicates within a question, and no word in two tiers (after ignoring case and surrounding punctuation).
- Only the exact spelling counts. If you want both "Kronos" and "Cronus" to score, list both.
- Warnings (not errors): fewer than 20 answers on a question (the target is about 50), or no Rare/Legendary answers.

### Fact-check AI output

If you generate answers with an AI, read them before adding them. Models often accept near-misses (for example, Nyx is a primordial goddess, not an Olympian).

## Character art

- Exactly 11 images named `00` to `10` with the same extension family: `.webp` (recommended), `.png`, `.jpg` or `.svg`.
- `00` is the starting image and `10` is the ending, shown as soon as the player reaches 10 points.
- All images must have the same aspect ratio; ideally the same size. Portrait 3:4 (for example 768x1024) fits the layout best.
- Max 8 MB per image.
- `character.json` must have `age` 18 or older and should record `asset_rights` (where the art came from and under what terms).

## Secret image (optional)

Add `character/secret.webp` (or `.png`, `.jpg`, `.svg`) to give a topic a hidden reward for a **perfect run**: Legendary on all 7 questions, 21 points.

- It replaces the ending on the 7th answer and on the results screen, with a gold "Secret" frame, and the share card uses it.
- Nothing in the game hints at it before then. It's only downloaded once a player reaches question 7 with every answer Legendary.
- Same rules as the stages: one file, max 8 MB, same aspect ratio as 00 to 10. Same art rules too: swimwear at most, no nudity.
- A topic without one plays exactly as before; a perfect run there just says "Perfect run!" over the ending.
- The build copies it under a name made from its content hash, so its address can't be guessed from the stage names. Like every image on a static site, someone using developer tools can still find it.

## Commands

```bash
pnpm content:check        # validate all topics
pnpm content:build        # validate and write apps/web/public/content
pnpm content:placeholders # regenerate the sample SVG art (stages and secret)
```

## Drafts

Folders in `content/presets` whose name starts with `_` (for example `_my-draft`) are ignored by the build, so you can work on a topic without it appearing in the game.
