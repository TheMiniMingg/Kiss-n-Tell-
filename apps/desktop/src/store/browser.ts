import type { PackFiles } from "../pack/index.js";
import { StoreError, type PackStore } from "./types.js";

/**
 * IndexedDB store used when the editor runs in a plain browser
 * (`pnpm --filter @kiss-n-tell/desktop dev`, Playwright tests).
 */
const DB_NAME = "knt-packs";
const STORE = "packs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StoreError(`Could not open browser storage: ${req.error?.message}`));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? req.result : (undefined as T));
    };
    t.onerror = () => {
      db.close();
      reject(new StoreError(t.error?.message ?? "Storage error"));
    };
  });
}

type Stored = Record<string, Uint8Array>;

export const browserStore: PackStore = {
  kind: "browser",
  location: async () => "this browser's storage",
  list: async () => ((await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as string[]).sort(),
  async load(folder) {
    const v = await tx<Stored | undefined>("readonly", (s) => s.get(folder));
    if (!v) throw new StoreError(`Pack "${folder}" not found.`);
    return new Map(Object.entries(v));
  },
  async save(folder, files, replaces) {
    const keys = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as string[];
    if (keys.includes(folder) && folder !== replaces) {
      throw new StoreError(`A pack with the id "${folder}" already exists. Pick another id.`);
    }
    const value: Stored = Object.fromEntries(files);
    await tx("readwrite", (s) => {
      s.put(value, folder);
      if (replaces && replaces !== folder) s.delete(replaces);
    });
  },
  remove: (folder) => tx("readwrite", (s) => void s.delete(folder)),
  async saveFile(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return `your downloads (${filename})`;
  },
};
