import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@kiss-n-tell/ui";
import "@kiss-n-tell/ui/styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App
      contentUrl="content/manifest.json"
      features={{ editor: false }}
      links={{
        source: "https://github.com/TheMiniMingg/Kiss-n-Tell-",
        // Add `downloads: "https://github.com/TheMiniMingg/Kiss-n-Tell-/releases"`
        // once the first desktop release is published; until then the page is empty.
      }}
    />
  </StrictMode>,
);
