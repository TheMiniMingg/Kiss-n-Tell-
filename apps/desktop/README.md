# Kiss N Tell desktop

A [Tauri v2](https://v2.tauri.app) app that wraps the game from `packages/ui` and adds an offline **pack editor**. It uses the same engine (`packages/engine`) and the same preset content as the website.

## What the editor does

- **Topic & character:** title, id, description, sort order; character name, id, age (18+), species, description and `asset_rights`.
- **Questions:** prompt, question id, timer (5-120 s) and the Common (+1), Rare (+2) and Legendary (+3) word lists, one word per line. Import or export the whole list as `questions.csv` (the same format as the presets, so you can write questions in a spreadsheet).
- **Images:** the 11 stage images `00` (start) to `10` (ending) with thumbnails and an in-game preview. Pick several files at once: files with a stage number in the name go to that stage, others fill the empty slots. WebP, PNG, JPG or SVG, max 8 MB each, all the same shape.
- **Check:** runs the engine's `validateTopic` plus the image checks from the preset build. Errors block play; warnings are advice. "Show" jumps to the problem.
- **Preview run:** plays a real 7-question run of the pack being edited, with the game's own screens. Nothing is recorded.
- **Copy a built-in topic** as a starting point, **import** a pack ZIP, **export** a pack ZIP.

Saved packs with no errors appear on the topic list as **My pack**. Best scores for packs are kept separately from the presets.

## Pack format

A pack is a folder with the same layout as `content/presets/<id>`:

```
<id>/
  topic.json
  questions.csv
  character/
    character.json
    00.webp ... 10.webp
```

An exported ZIP contains that folder, so unzipping it into `content/presets/` adds it to the website (run `pnpm content:check` afterwards). Import accepts the files inside a single folder or at the root of the ZIP.

**ZIP safety:** imports refuse entries with absolute paths or `..` (zip-slip), read only the files listed above, and enforce limits before anything is unpacked: 150 MB per ZIP, 100 entries, 8 MB per image, 5 MB per JSON/CSV file and 100 MB in total. Each file is unpacked into a buffer of the size its header declares, so a lying header can't make it grow. The Rust side checks pack ids, file names and sizes again before writing.

## Where packs are stored

In the app data folder, under `packs/`:

| OS | Folder |
| --- | --- |
| Windows | `%APPDATA%\io.github.theminimingg.kissntell\packs` |
| macOS | `~/Library/Application Support/io.github.theminimingg.kissntell/packs` |
| Linux | `~/.local/share/io.github.theminimingg.kissntell/packs` |

The editor shows the exact path and has an **Open packs folder** button. Each pack is a plain folder, so you can also edit `questions.csv` in a spreadsheet and reopen the editor. Saves are written to a staging folder and swapped in at the end, so an interrupted save never leaves a half-written pack. Deleted packs are moved to `trash/` next to `packs/`.

Exports (pack ZIPs, question CSVs and share cards) are saved to your **Downloads** folder; the editor shows the full path.

## Development

Needs Node 20+, pnpm 10, Rust (stable) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install
pnpm desktop:dev                                  # native app with hot reload
pnpm --filter @kiss-n-tell/desktop dev:frontend   # editor in a browser (packs stored in IndexedDB)
pnpm test:e2e:desktop                             # Playwright tests for the editor (browser mode)
cd apps/desktop/src-tauri && cargo test           # Rust tests for pack storage
pnpm desktop:build                                # installer for the current OS
```

The pack logic (`src/pack/`) is plain TypeScript with unit tests in `test/`, run by `pnpm test` at the root.

## Releases

`.github/workflows/desktop-release.yml` runs when a tag like `v0.1.0` is pushed. It checks that the tag matches the `version` in `apps/desktop/package.json`, runs `pnpm check`, then builds:

- **Windows:** an NSIS installer (`.exe`) that installs for the current user, no admin needed.
- **macOS:** a universal `.dmg` (Apple Silicon and Intel), ad-hoc signed so it runs on Apple Silicon.

Both are attached to a **draft** GitHub Release, so you can review it before publishing. Running the workflow by hand from the Actions tab builds the same installers as downloadable artifacts without making a release.

To release: bump `version` in `apps/desktop/package.json`, commit, then `git tag v<version> && git push origin v<version>`.

## Installing the unsigned builds

The builds aren't code-signed (that needs paid certificates), so the OS warns the first time:

- **Windows:** SmartScreen says "Windows protected your PC". Click **More info**, then **Run anyway**.
- **macOS:** "Kiss N Tell can't be opened because Apple cannot check it for malicious software." Right-click the app in Applications and choose **Open**, then **Open** again. On recent macOS, go to **System Settings → Privacy & Security** and click **Open Anyway**.
