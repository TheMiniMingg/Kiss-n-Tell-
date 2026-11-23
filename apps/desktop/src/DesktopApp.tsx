import { invoke, isTauri } from "@tauri-apps/api/core";
import { App, loadManifest } from "@kiss-n-tell/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, ImageUrls, loadAllPacks, playableTopics, type LoadResult } from "@kiss-n-tell/editor";
import { pickStore } from "./store/index.js";

const CONTENT_URL = "content/manifest.json";

export function DesktopApp() {
  const store = useMemo(() => pickStore(), []);
  const urls = useRef(new ImageUrls());
  const [loaded, setLoaded] = useState<LoadResult>({ packs: [], failures: [] });
  const [presets, setPresets] = useState<{ id: string; title: string }[]>([]);
  const presetIds = useMemo(() => presets.map((p) => p.id), [presets]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoaded(await loadAllPacks(store));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [store]);

  useEffect(() => {
    void reload();
    // Preset ids, so the editor can warn about clashes. The game loads its own copy.
    loadManifest(CONTENT_URL)
      .then((m) => setPresets(m.topics.map((t) => ({ id: t.id, title: t.title }))))
      .catch(() => undefined);
  }, [reload]);

  // The native webview doesn't open new windows, so send https links that would
  // (source code, donate, social profiles) to the system browser instead.
  useEffect(() => {
    if (!isTauri()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !/^https:\/\//i.test(a.href) || a.target !== "_blank") return;
      e.preventDefault();
      void invoke("open_url", { url: a.href }).catch(() => undefined);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const localTopics = useMemo(() => playableTopics(loaded.packs, presetIds, urls.current), [loaded, presetIds]);

  const saveFile = useCallback(
    async (blob: Blob, filename: string) => store.saveFile(new Uint8Array(await blob.arrayBuffer()), filename),
    [store],
  );

  return (
    <App
      contentUrl={CONTENT_URL}
      features={{ editor: true }}
      siteLabel="Kiss N Tell"
      links={{ source: "https://github.com/TheMiniMingg/Kiss-n-Tell-" }}
      localTopics={localTopics}
      saveFile={saveFile}
      renderEditor={(host) => (
        <Editor
          store={store}
          saved={loaded}
          loadError={loadError}
          presets={presets}
          reload={reload}
          onClose={host.close}
        />
      )}
    />
  );
}
