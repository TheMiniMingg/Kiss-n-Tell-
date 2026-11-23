import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@kiss-n-tell/ui";
import "@kiss-n-tell/ui/styles.css";

// Owner mode (password-protected editing) is its own chunk, so players never download it.
const OwnerMode = lazy(() => import("./owner/OwnerMode.js"));

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App
      contentUrl="content/manifest.json"
      features={{ editor: true }}
      editorEntry={{ label: "Edit site", placement: "footer", hash: "#edit" }}
      renderEditor={(host) => (
        <Suspense fallback={<main className="center" aria-busy="true"><p className="muted">Loading…</p></main>}>
          <OwnerMode onClose={host.close} />
        </Suspense>
      )}
      links={{
        source: "https://github.com/TheMiniMingg/Kiss-n-Tell-",
        downloads: "https://github.com/TheMiniMingg/Kiss-n-Tell-/releases",
      }}
    />
  </StrictMode>,
);
