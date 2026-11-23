import type { PackFiles } from "./pack/index.js";

/**
 * Where packs live. The desktop app uses the app data folder; plain browsers (dev, tests) use IndexedDB;
 * the website's owner mode commits to the game's own content in git ("site").
 */
export interface PackStore {
  readonly kind: "tauri" | "browser" | "site";
  /** Human-readable location of the packs, shown in the editor. */
  location(): Promise<string>;
  /** Folder names of the saved packs. */
  list(): Promise<string[]>;
  load(folder: string): Promise<PackFiles>;
  /**
   * Save a pack as `folder`. `replaces` is the folder it was loaded from
   * (null for a new pack). Fails if `folder` is taken by a different pack.
   * `playable` says whether the pack has no errors. A store may resolve to the
   * folder it actually used (the site keeps unplayable packs as hidden drafts).
   */
  save(folder: string, files: PackFiles, replaces: string | null, opts?: { playable: boolean }): Promise<string | void>;
  /** Remove a pack (the desktop app moves it to a trash folder). */
  remove(folder: string): Promise<void>;
  /** Save a file for the user (exports, share cards). Resolves to where it went. */
  saveFile(bytes: Uint8Array, filename: string): Promise<string>;
  /** Show the packs folder in the system file manager, when there is one. */
  openFolder?: () => Promise<void>;
  /**
   * Native window only: call `ask` when the user tries to close the window,
   * instead of closing. `ask` gets a function that really closes it.
   * Resolves to a function that stops listening.
   */
  onCloseRequested?: (ask: (quit: () => void) => void) => Promise<() => void>;
}

export class StoreError extends Error {
  override name = "StoreError";
}
