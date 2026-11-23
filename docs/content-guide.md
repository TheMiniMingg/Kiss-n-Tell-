# Content guide

## questions.csv

One row per accepted answer. Save it from any spreadsheet as **CSV UTF-8**.

| column | required | notes |
| --- | --- | --- |
| `question_id` | every row | Lowercase letters, digits, `-` or `_`. Rows with the same id belong to the same question. |
| `prompt` | once per question | The question text. Later rows of the same question can leave it blank. |
| `answer` | every answer row | One word, at least 2 characters. Matching ignores case, surrounding spaces and surrounding punctuation. |
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

## Commands

```bash
pnpm content:check        # validate all topics
pnpm content:build        # validate and write apps/web/public/content
pnpm content:placeholders # regenerate the sample SVG art
```
