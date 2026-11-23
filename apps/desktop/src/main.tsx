import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@kiss-n-tell/ui/styles.css";
import "./editor/editor.css";
import { DesktopApp } from "./DesktopApp.js";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
