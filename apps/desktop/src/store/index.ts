import { isTauri } from "@tauri-apps/api/core";
import { browserStore } from "./browser.js";
import { tauriStore } from "./tauri.js";
import type { PackStore } from "@kiss-n-tell/editor";

export function pickStore(): PackStore {
  return isTauri() ? tauriStore : browserStore;
}

export { StoreError, type PackStore } from "@kiss-n-tell/editor";
