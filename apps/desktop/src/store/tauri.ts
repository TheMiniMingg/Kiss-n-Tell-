import { invoke } from "@tauri-apps/api/core";
import { StoreError, type PackFiles, type PackStore } from "@kiss-n-tell/editor";

async function call<T>(cmd: string, args?: Parameters<typeof invoke>[1], options?: Parameters<typeof invoke>[2]): Promise<T> {
  try {
    return await invoke<T>(cmd, args, options);
  } catch (e) {
    throw new StoreError(typeof e === "string" ? e : (e as Error).message ?? String(e));
  }
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  throw new StoreError("Unexpected data from the app.");
}

/** Packs in the app data folder, through the Rust commands in src-tauri/src/lib.rs. */
export const tauriStore: PackStore = {
  kind: "tauri",
  location: () => call<string>("packs_dir"),
  list: () => call<string[]>("list_packs"),
  async load(folder) {
    const paths = await call<string[]>("list_pack_files", { id: folder });
    const files: PackFiles = new Map();
    await Promise.all(
      paths.map(async (path) => {
        files.set(path, toBytes(await call<unknown>("read_pack_file", { id: folder, path })));
      }),
    );
    return files;
  },
  async save(folder, files, replaces) {
    const token = await call<string>("begin_pack_save");
    try {
      for (const [path, bytes] of files) {
        await call("write_pack_file", bytes, { headers: { "x-token": token, "x-path": path } });
      }
      await call("commit_pack_save", { token, id: folder, replaces });
    } catch (e) {
      await call("cancel_pack_save", { token }).catch(() => undefined);
      throw e;
    }
  },
  remove: (folder) => call("delete_pack", { id: folder }),
  saveFile: (bytes, filename) => call<string>("save_to_downloads", bytes, { headers: { "x-name": filename } }),
  openFolder: () => call("open_packs_folder"),
  async onCloseRequested(ask) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    return win.onCloseRequested((event) => {
      event.preventDefault();
      ask(() => void win.destroy());
    });
  },
};
