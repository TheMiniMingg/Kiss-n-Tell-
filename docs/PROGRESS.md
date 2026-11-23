# Kiss N Tell: project progress

**Last updated:** 23 November 2026, 09:55 UTC  
**Live site:** https://kiss-n-tell-chi.vercel.app  
**Repo:** https://github.com/TheMiniMingg/Kiss-n-Tell- (public, MIT)

This is the living record of where the whole project stands. It is updated whenever a pull request merges or a phase changes, and the PDF progress report is generated from it (`scripts/progress-pdf/`).

## At a glance

The web game and the desktop app with its pack editor are both merged to `main`. The site is live from `main` with three sample topics. The owner edit mode is the last piece still being built. The main thing the project waits on is your content: topics, characters, art and the question CSVs.

| Area | Status | Where |
| --- | --- | --- |
| Web game (rules, screens, share card) | **Merged to `main`** 23 Nov 09:42, two audits done | PR #1 |
| Hosting | Live on Vercel, built from `main`, updates on every merge | kiss-n-tell-chi.vercel.app |
| Desktop app and pack editor | **Merged to `main`** 23 Nov 09:52, audited | PR #2 |
| Owner edit mode, donate and social buttons | Being built | Owner edit thread (no PR yet) |
| Real topics, characters, art, questions | Waiting on you | `content/presets/` |
| Decisions made for you (34) | Waiting on your review | decisions-for-review.pdf |
| Desktop installers (Windows, macOS) | First proof build running on `main`; a version tag makes a release | GitHub Releases |

## Roadmap phases

The roadmap was reordered on 23 November for a web-first launch, so the editor no longer has to wait for the desktop app.

| Phase | Scope | Status |
| --- | --- | --- |
| P0 Decisions and fixtures | Name, MIT license, pack schema, CSV-to-game script, placeholder topics and images, scoring tests | **Done** (PR #1) |
| P1 Engine and play | Topic select, shuffled questions, 20 s timer, one guess, tier feedback, stage images, results, share card, replay | **Done**, merged to `main` (PR #1) |
| P2 Content | 3 real topics with fact-checked Q&A, 33 character images (11 per character) | **Waiting on you**. Sample topics stand in |
| P3 Website launch | Static site, phone layout, 18+ notice, hosting | **Live from `main`** with sample topics. Full launch = real content |
| P4 Desktop app and editor | Tauri shell, offline pack editor, ZIP import/export, unsigned installers | **Done**, merged to `main` (PR #2). Proof installer build running |
| Extra: owner tools | On-site owner edit mode behind a password, donate and social buttons | **In progress** |
| P5 Later | Bring-your-own-API question generation and image providers | Not started (after V1) |

**V1 ship gate:** 3 complete topics, 33 validated images, passing tests, working website.

## What's built

**Game rules** (`packages/engine`)
- 7 questions drawn at random from a bigger pool per topic, 20 second timer that keeps running in background tabs.
- One final guess per question. Common +1, Rare +2, Legendary +3. Typo, unknown word or timeout scores 0.
- Blank, one-letter and multi-word answers are rejected without using up the question.
- At 10 points the ending image (stage 10) shows straight away. Play continues and the score can reach 21.
- Recently seen questions are skipped until the topic's pool runs out.
- Content checks: at least 7 questions per topic, no duplicates, no word in two tiers, 11 images per character, age 18+.

**Website** (`apps/web`, `packages/ui`)
- 18+ notice, topic cards with best score, play screen with stage images and a "This run" list, results screen.
- Share card (1080x1350) with the image reached, score out of 21 and topic: Copy, Download and Share on phones.
- Browser Back asks before leaving a run, phone layout keeps the answer box on screen, broken images fall back cleanly.

**Desktop app and pack editor** (`apps/desktop`)
- The same game plus your own packs, shown as "My pack".
- Editor for topic, character, questions (Common/Rare/Legendary lists, CSV import/export), the 11 stage images, a Check tab and a preview run.
- Packs saved as folders in the app data folder. ZIP import/export with safety limits.
- Release workflow: pushing a `v*` tag builds unsigned Windows and macOS installers into a draft GitHub Release.

**Content tooling** (`scripts/`, `docs/content-guide.md`)
- One CSV per topic (`question_id, prompt, answer, tier, timer_seconds`) is converted to game files by `pnpm content:build`.
- Topic folders starting with `_` are drafts and stay off the site.

**Tests**
- Web: 58 unit tests and 80 browser tests on computer and phone sizes (2 phone clipboard tests skipped on purpose), plus typecheck, content check and build, run on every pull request. All passed on the merged code.
- Desktop: 15 editor browser tests, 5 Rust storage tests (clippy clean) and a native Linux build in CI.
- Whole repo after both merges: 88 unit tests, 80 web browser tests, 15 desktop browser tests, all green.

**Fixed in the second web audit** (8 screen sizes, 320 to 1920 px, plus a code review)
- Text typed before a timeout no longer carries into the next question.
- A Back press in one run no longer opens the quit dialog at the start of the next.
- Tab can reach Leave in the quit dialog, and the dialog only mentions the timer when one is running.
- A first score of 0 no longer shows "New best".
- Copy image falls back to a download if the browser refuses the clipboard. The share card shades the art more behind its text.
- Curly apostrophes and Unicode hyphens from phone keyboards match plain ones.
- The content check rejects answers over 40 characters (the input box limit).
- The "Desktop downloads" link stays hidden until a release exists. Link preview tags added.

**Fixed in the desktop audit**
- CSV import can add to the end as well as replace all (clashing question ids are renamed).
- Drop a ZIP anywhere to import it. Import problems are labelled by the file they came from.
- The preview run's share card saves to Downloads.
- Arrow keys move between editor tabs, and the selected question scrolls into view.
- Layout fixes: tabs don't wrap, words aren't split, medium window widths work, the New pack list scrolls.
- Pack storage refuses symlinks.

## What's live

| Item | State |
| --- | --- |
| Site | https://kiss-n-tell-chi.vercel.app, public, no login |
| Hosting account | Your own Vercel (team "ming-street", same as minime.design), Hobby plan |
| Source of the live build | `main` (since PR #1 merged at 09:42 UTC) |
| Content on the site | 3 sample topics (Ancient Greece, Space, Animals) with placeholder art, marked "Sample" |
| Updates | Every merge to `main` redeploys. Each pull request gets its own preview link |

## Pull requests

| PR | What | State |
| --- | --- | --- |
| [#1](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/1) | Web game, content tooling, tests, Vercel config | **Merged** 09:42 UTC |
| [#2](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/2) | Desktop app and pack editor | **Merged** 09:52 UTC |
| Owner edit mode | Password-protected on-site editing, donate and social buttons | Not opened yet. Merges after #2 |
| Progress doc | This file and the PDF generator | Opened from the progress thread. Merges after the others |

Merge order: #1 (done), #2 (done), then owner edit mode, then this progress doc with final numbers.

## Decisions pending your review

34 choices were made with the recommended option so the build didn't stop. Each has alternatives in **decisions-for-review.pdf**. To change one, reply with its number and letter, for example "3A, 9B". Anything you don't mention stays as built.

| # | Decision (as built) | # | Decision (as built) |
| --- | --- | --- | --- |
| 1 | Multi-word input rejected, question not used | 18 | Share card 1080x1350 portrait |
| 2 | Accents count (café ≠ cafe) | 19 | Saved data only in the player's browser |
| 3 | Hyphens and apostrophes kept | 20 | pnpm monorepo |
| 4 | Press Next after each answer | 21 | Chromium browser tests only |
| 5 | Timer keeps running in the Quit dialog | 22 | Hosted on your Vercel |
| 6 | Quitting asks first, saves no score | 23 | No custom domain yet |
| 7 | Gold border and "Ending unlocked!" at 10 points | 24 | Packs stored as folders |
| 8 | Question counts as seen once shown | 25 | Exports go to Downloads |
| 9 | CSV, one row per answer | 26 | Windows .exe and universal Mac .dmg, unsigned |
| 10 | 7 questions minimum; under 20 answers only warns | 27 | Version tag builds a draft Release |
| 11 | 3 sample topics shown, marked "Sample" | 28 | Packs with errors saved but hidden |
| 12 | 11 images 00 to 10, portrait 3:4, 8 MB max | 29 | Imported ZIP opens as a draft, id renamed on clash |
| 13 | `_folder` topics are drafts | 30 | Delete moves to a trash folder |
| 14 | Dark theme, pink-orange accents | 31 | ZIP limits 150 MB, 100 files |
| 15 | Image left on computers, on top on phones | 32 | One answer per line in the editor |
| 16 | Topic cards show character and best score | 33 | No auto-update in V1 |
| 17 | 18+ check remembered per device | 34 | Editor extras (copy topic, Ctrl+S, unsaved warning) |

Choices from the owner edit mode thread will be added here and to the decisions PDF when that thread reports.

## What needs you

- [ ] **Pick the 3 topics and their characters.** You mentioned demon, snake and slime girls and humans; all must read as clearly adult.
- [ ] **Make the art:** 11 images per character (00 = start, 10 = ending), 33 in total. Swimwear at most, no nudity. Portrait 3:4 (for example 768x1024), WebP preferred, up to 8 MB each.
- [ ] **Write the question CSVs:** at least 7 questions per topic (15+ recommended for replay), ideally 20 to 50 answers per question, tiered Common/Rare/Legendary. Fact-check AI output. See `docs/content-guide.md`.
- [ ] **Send your donation link and social profile URLs** for the new buttons.
- [ ] **Review the 34 decisions** and reply with any number and letter you want changed.
- [ ] **Optional: pick a domain** (decision 23), for example kissntell.minime.design.

## Next steps

1. Merge the owner edit mode PR after its final audit (running now). PRs #1 and #2 are merged.
2. Update this doc and the PDF with the merged state.
3. Add your topics, art and CSVs, either through the owner edit mode on the site or as files in `content/presets/`. Sample topics can then be hidden (decision 11).
4. Check the first proof installer build, then push a version tag (for example `v0.1.0`) to build the Windows and macOS installers into a draft release and publish it.
5. After V1: bring-your-own-API question and image generation (P5).

## Risks and notes

- **Ending image is discoverable.** A static site can't hide stage 10 from someone using developer tools. Accepted, since there are no prizes.
- **Unsigned installers.** Windows SmartScreen and macOS Gatekeeper warn the first time. Signing needs paid certificates.
- **Art must read as adult**, whatever age is written in `character.json`.
- **AI-generated art** may not be protected by copyright, so the image tool's terms matter more than the art license.
- **Vercel Hobby plan** is for non-commercial use. Worth a quick check against Vercel's terms once the donate button goes live.
- **The owner edit password** lives only as a server-side setting on Vercel, never in the repo or in documents.

## Timeline

| When (23 Nov 2026, UTC) | What happened |
| --- | --- |
| 09:52 | PR #2 merged after its audit; first proof installer build started on `main` |
| 09:42 | PR #1 merged after a second audit (10 fixes); site now builds from `main` |
| 09:32 | Progress report and this doc opened as PR #3 |
| 09:30 | Final audits started in all three build threads |
| 09:26 | Owner edit mode, donate and social buttons started; password stored on Vercel only |
| 09:22 | Desktop app and pack editor opened as PR #2; CI green by 09:26 |
| 09:17 | Site live on Vercel; desktop decisions added to the review PDF (items 24 to 34) |
| 09:06 | You chose Vercel hosting on your own account |
| 09:01 | Web game audited (56 unit + 67 browser tests) and PR #1 marked ready; decisions PDF sent |
| 08:53 | First playable web game opened as PR #1; desktop thread started |
| 08:40 | You approved building the whole roadmap in parallel threads |
| 08:13 to 08:35 | Three rounds of answers settled the rules, the name and the web-first order |
| 07:56 | Roadmap audit delivered with 12 clarifying questions |
| 07:53 | Project started from the v1.1 roadmap and an empty repo |
