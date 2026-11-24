# Kiss N Tell: project progress

**Last updated:** 24 November 2026, 06:10 UTC  
**Live site:** https://kiss-n-tell-chi.vercel.app  
**Repo:** https://github.com/TheMiniMingg/Kiss-n-Tell- (public, MIT)

This is the living record of where the whole project stands. It is updated whenever a pull request merges or a phase changes, and the PDF progress report is generated from it (`scripts/progress-pdf/`).

## At a glance

Everything built so far is merged to `main`: the web game, the desktop app with its pack editor, the owner edit mode with donate and social buttons, and the secret image for a perfect 21. The site is live from `main` with three sample topics, and the first Windows and macOS installers built successfully. What's left is mostly yours: content, links, a GitHub token for on-site saving, and reviewing 53 decisions. The main thing the project waits on is your content: topics, characters, art and the question CSVs.

| Area | Status | Where |
| --- | --- | --- |
| Web game (rules, screens, share card) | **Merged to `main`** 23 Nov 09:42, two audits done | PR #1 |
| Hosting | Live on Vercel, built from `main`, updates on every merge | kiss-n-tell-chi.vercel.app |
| Desktop app and pack editor | **Merged to `main`** 23 Nov 09:52, audited | PR #2 |
| Owner edit mode, donate and social buttons | **Merged to `main`** 23 Nov 10:05. Saving needs a GitHub token from you | PR #4 |
| Secret image for a perfect 21 | **Merged to `main`** 24 Nov, audited | PR #5 |
| Real topics, characters, art, questions | Waiting on you | `content/presets/` |
| Decisions made for you (53) | Waiting on your review | decisions-for-review.pdf |
| Desktop installers (Windows, macOS) | Proof build passed 10:00. A version tag makes a draft release | GitHub Releases |

## Roadmap phases

The roadmap was reordered on 23 November for a web-first launch, so the editor no longer has to wait for the desktop app.

| Phase | Scope | Status |
| --- | --- | --- |
| P0 Decisions and fixtures | Name, MIT license, pack schema, CSV-to-game script, placeholder topics and images, scoring tests | **Done** (PR #1) |
| P1 Engine and play | Topic select, shuffled questions, 20 s timer, one guess, tier feedback, stage images, results, share card, replay | **Done**, merged to `main` (PR #1) |
| P2 Content | 3 real topics with fact-checked Q&A, 33 character images (11 per character) | **Waiting on you**. Sample topics stand in |
| P3 Website launch | Static site, phone layout, 18+ notice, hosting | **Live from `main`** with sample topics. Full launch = real content |
| P4 Desktop app and editor | Tauri shell, offline pack editor, ZIP import/export, unsigned installers | **Done**, merged to `main` (PR #2). Proof installer build passed |
| Extra: owner tools | On-site owner edit mode behind a password, donate and social buttons | **Done**, merged to `main` (PR #4). Needs your GitHub token and links |
| Extra: secret image | Optional 12th image per topic, unlocked only by a perfect 21 | **Done**, merged to `main` (PR #5). Placeholder secrets on the samples |
| P5 Later | Bring-your-own-API question generation and image providers | Not started (after V1) |

**V1 ship gate:** 3 complete topics, 33 validated images, passing tests, working website.

## What's built

**Game rules** (`packages/engine`)
- 7 questions drawn at random from a bigger pool per topic, 20 second timer that keeps running in background tabs.
- One final guess per question. Common +1, Rare +2, Legendary +3. Typo, unknown word or timeout scores 0.
- Blank, one-letter and multi-word answers are rejected without using up the question.
- At 10 points the ending image (stage 10) shows straight away. Play continues and the score can reach 21.
- Recently seen questions are skipped until the topic's pool runs out.
- A perfect run (Legendary on all 7, 21 points) unlocks the topic's optional secret image, if it has one. No hint before then.
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
- Whole repo after PR #5: 146 unit tests, 114 web browser tests (2 skipped on purpose), 19 desktop browser tests, 6 Rust tests and clippy, all green.

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

**Secret image for a perfect 21** (PR #5, see `docs/content-guide.md`)
- Optional `character/secret.webp` (or png, jpg, svg) per topic, same size and shape rules as the stages.
- On the 7th answer of a perfect run the image switches to the secret with a gold "Secret" frame. Results say "Secret unlocked!", the share card uses it, and the topic card shows "Best 21/21 · secret unlocked".
- It's only downloaded once a player reaches question 7 with every answer Legendary, and the build names it by a hash so its address can't be guessed.
- Works in the desktop editor and owner edit mode: a secret slot under the stages, preview toggle, ZIP import/export, copying a built-in topic.
- The three sample topics have a gold-star placeholder secret, so it can be tried on the live site.

**Owner edit mode** (`api/`, `packages/editor`, `content/site.json`, see `docs/owner-mode.md`)
- A footer "Edit site" link or `/#edit` opens a password screen. The password is checked on the server and never sent to the browser.
- The owner can edit topics, questions, answers and images (the same editor as the desktop app) and the site text.
- Each save becomes one commit to the repo, which redeploys the site. Topics with errors are saved as hidden drafts.
- Lockout: 5 wrong tries per address per 15 minutes (doubling), 25 overall.
- Donate and social buttons on the home and results screens, https links only, hidden until a link is set.
- Audit fixes: desktop links open in the system browser, phone editor spacing, site wording, donate button edge, footer tap target, image security policy.

## What's live

| Item | State |
| --- | --- |
| Site | https://kiss-n-tell-chi.vercel.app, public, no login |
| Hosting account | Your own Vercel (team "ming-street", same as minime.design), Hobby plan |
| Source of the live build | `main` (since PR #1 merged at 09:42 UTC) |
| Content on the site | 3 sample topics (Ancient Greece, Space, Animals) with placeholder art, marked "Sample" |
| Updates | Every merge to `main` redeploys. Each pull request gets its own preview link |
| Owner edit mode | Live: footer "Edit site" link. Signing in works; saving starts working once the GitHub token is added |
| Donate and social buttons | Built, hidden until you add the links |

## Pull requests

| PR | What | State |
| --- | --- | --- |
| [#1](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/1) | Web game, content tooling, tests, Vercel config | **Merged** 09:42 UTC |
| [#2](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/2) | Desktop app and pack editor | **Merged** 09:52 UTC |
| [#4](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/4) | Owner edit mode, donate and social buttons | **Merged** 10:05 UTC |
| [#3](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/3) | This file and the PDF generator | **Merged** 10:10 UTC |
| [#5](https://github.com/TheMiniMingg/Kiss-n-Tell-/pull/5) | Secret image for a perfect 21 | **Merged** 24 Nov |

All build work is merged.

## Decisions pending your review

53 choices were made with the recommended option so the build didn't stop. Each has alternatives in **decisions-for-review.pdf**. To change one, reply with its number and letter, for example "3A, 9B". Anything you don't mention stays as built.

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

| # | Owner edit mode decision (as built) |
| --- | --- |
| 35 | Website edits are saved as a commit to the repo, then Vercel rebuilds |
| 36 | 5 wrong passwords from one address lock it for 15 minutes, doubling each time |
| 37 | Password kept only as a sensitive Vercel setting |
| 38 | Owner stays signed in for 12 hours (secure cookie) |
| 39 | Edit mode opens from a small footer link or /#edit |
| 40 | A topic with errors is saved as a hidden draft |
| 41 | An edit that would break a live topic is refused |
| 42 | Images uploaded on the website: up to 4 MB each |
| 43 | Saves go straight to `main` and go live after the rebuild |
| 44 | Donate and social text buttons on home and results, hidden until set |
| 45 | Five editable site text fields (logo, tagline, topics heading, support line, footer note) |
| 46 | Links in the desktop app open in your normal browser |

| # | Secret image decision (as built) |
| --- | --- |
| 47 | Only a perfect run (Legendary on all 7, 21 points) unlocks it |
| 48 | Optional `character/secret.<ext>`, same rules as the stages |
| 49 | Revealed on the 7th answer and kept on the results screen |
| 50 | No hint before unlocking; downloaded only on a perfect track at question 7 |
| 51 | The share card uses the secret image |
| 52 | Topic card shows "secret unlocked"; no gallery to view it again |
| 53 | Sample topics have placeholder secrets |

## What needs you

- [ ] **Pick the 3 topics and their characters.** You mentioned demon, snake and slime girls and humans; all must read as clearly adult.
- [ ] **Make the art:** 11 images per character (00 = start, 10 = ending), 33 in total, plus an optional secret image per character for a perfect 21. Swimwear at most, no nudity. Portrait 3:4 (for example 768x1024), WebP preferred, up to 8 MB each.
- [ ] **Write the question CSVs:** at least 7 questions per topic (15+ recommended for replay), ideally 20 to 50 answers per question, tiered Common/Rare/Legendary. Fact-check AI output. See `docs/content-guide.md`.
- [ ] **Add a `GITHUB_TOKEN` setting to the Vercel project** so on-site edits can save. Steps are in `docs/owner-mode.md`.
- [ ] **Add your donation link and social profile URLs**, either in owner edit mode or by sending them.
- [ ] **Review the 53 decisions** and reply with any number and letter you want changed.
- [ ] **Optional: pick a domain** (decision 23), for example kissntell.minime.design.

## Next steps

1. Add the GitHub token on Vercel and test a save in owner edit mode. PRs #1, #2 and #4 are merged.
2. Update this doc and the PDF with the merged state.
3. Add your topics, art and CSVs, either through the owner edit mode on the site or as files in `content/presets/`. Sample topics can then be hidden (decision 11).
4. Push a version tag (for example `v0.1.0`) to build the Windows and macOS installers into a draft release, then publish it. The proof build already passed.
5. After V1: bring-your-own-API question and image generation (P5).

## Risks and notes

- **Ending and secret images are discoverable.** A static site can't hide them from someone using developer tools, because scoring happens in the browser. Accepted, since there are no prizes.
- **Unsigned installers.** Windows SmartScreen and macOS Gatekeeper warn the first time. Signing needs paid certificates.
- **Art must read as adult**, whatever age is written in `character.json`.
- **AI-generated art** may not be protected by copyright, so the image tool's terms matter more than the art license.
- **Vercel Hobby plan** is for non-commercial use. Worth a quick check against Vercel's terms once the donate button goes live.
- **The owner edit password** lives only as a server-side setting on Vercel, never in the repo or in documents.

## Timeline

| When (UTC) | What happened |
| --- | --- |
| 24 Nov 06:10 | Secret image for a perfect 21 opened as PR #5 after tests and an audit; decisions 47 to 53 added |
| 24 Nov 04:01 | You asked for a secret final image unlocked by a perfect 21 |
| 23 Nov 10:05 | PR #4 (owner edit mode, donate and social buttons) merged after its audit |
| 23 Nov 10:00 | First Windows and macOS installer proof build passed |
| 23 Nov 09:52 | PR #2 merged after its audit |
| 23 Nov 09:42 | PR #1 merged after a second audit (10 fixes); site now builds from `main` |
| 23 Nov 09:32 | Progress report and this doc opened as PR #3 |
| 23 Nov 09:30 | Final audits started in all three build threads |
| 23 Nov 09:26 | Owner edit mode, donate and social buttons started; password stored on Vercel only |
| 23 Nov 09:22 | Desktop app and pack editor opened as PR #2; CI green by 09:26 |
| 23 Nov 09:17 | Site live on Vercel; desktop decisions added to the review PDF (items 24 to 34) |
| 23 Nov 09:06 | You chose Vercel hosting on your own account |
| 23 Nov 09:01 | Web game audited (56 unit + 67 browser tests) and PR #1 marked ready; decisions PDF sent |
| 23 Nov 08:53 | First playable web game opened as PR #1; desktop thread started |
| 23 Nov 08:40 | You approved building the whole roadmap in parallel threads |
| 23 Nov 08:13 to 08:35 | Three rounds of answers settled the rules, the name and the web-first order |
| 23 Nov 07:56 | Roadmap audit delivered with 12 clarifying questions |
| 23 Nov 07:53 | Project started from the v1.1 roadmap and an empty repo |
