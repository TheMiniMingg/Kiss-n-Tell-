import type { PackFiles } from "../pack/index.js";

/** Where packs live. The desktop app uses the app data folder; plain browsers (dev, tests) use IndexedDB. */
export interface PackStore {
  readonly kind: "tauri" | "browser";
  /** Human-readable location of the packs, shown in the editor. */
  location(): Promise<string>;
  /** Folder names of the saved packs. */
  list(): Promise<string[]>;
  load(folder: string): Promise<PackFiles>;
  /**
   * Save a pack as `folder`. `replaces` is the folder it was loaded from
   * (null for a new pack). Fails if `folder` is taken by a different pack.
   */
  save(folder: string, files: PackFiles, replaces: string | null): Promise<void>;
  /** Remove a pack (the desktop app moves it to a trash folder). */
  remove(folder: string): Promise<void>;
  /** Save a file for the user (exports, share cards). Resolves to where it went. */
  saveFile(bytes: Uint8Array, filename: string): Promise<string>;
  /** Show the packs folder in the system file manager, when there is one. */
  openFolder?: () => Promise<void>;
}

export class StoreError extends Error {
  override name = "StoreError";
}
