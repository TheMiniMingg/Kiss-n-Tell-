import { FINAL_STAGE, STAGE_COUNT } from "@kiss-n-tell/engine";
import { StageViewer } from "@kiss-n-tell/ui";
import { useRef, useState, type DragEvent } from "react";
import { ImageUrls } from "../images.js";
import { stageName, type PackDraft, type StageImage } from "../pack/index.js";

interface Props {
  draft: PackDraft;
  urls: ImageUrls;
  /** Files dropped or picked for a slot (or for the grid when stage is null). */
  onFiles: (files: File[], stage: number | null) => void;
  onRemove: (stage: number) => void;
}

const LABELS: Record<number, string> = { 0: "Start", [FINAL_STAGE]: "Ending" };

function sizeText(img: StageImage) {
  const kb = img.bytes.length / 1024;
  const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  return img.width && img.height ? `${img.width}×${img.height} · ${size}` : size;
}

export function ImagesPanel({ draft, urls, onFiles, onRemove }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | "grid" | null>(null);
  const [view, setView] = useState(0);
  const count = draft.images.filter(Boolean).length;

  const pick = (stage: number | null) => {
    target.current = stage;
    if (picker.current) {
      picker.current.multiple = stage === null;
      picker.current.click();
    }
  };

  const drop = (e: DragEvent, stage: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files, files.length === 1 ? stage : null);
  };

  const character = {
    ...draft.character,
    assetRights: draft.character.asset_rights,
    stages: draft.images.map((img) => (img ? urls.get(img) : "")),
    width: draft.images.find((i) => i?.width)?.width,
    height: draft.images.find((i) => i?.height)?.height,
  };

  return (
    <div className="ed-images">
      <div className="ed-images__main">
        <div className="ed-row ed-images__tools">
          <button type="button" className="btn btn--primary btn--small" onClick={() => pick(null)}>Add images…</button>
          <span className="muted">
            {count}/{STAGE_COUNT} stages. Pick several at once: files named 00-10 go to that stage, others fill the empty slots in order.
          </span>
          <input
            ref={picker}
            type="file"
            accept=".webp,.png,.jpg,.jpeg,.svg,image/webp,image/png,image/jpeg,image/svg+xml"
            multiple
            hidden
            data-testid="image-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              e.target.multiple = true;
              const stage = target.current;
              target.current = null;
              if (files.length) onFiles(files, stage);
            }}
          />
        </div>
        <ol
          className={`ed-slots${dragOver === "grid" ? " ed-slots--drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver((d) => (d === null ? "grid" : d));
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragOver(null);
          }}
          onDrop={(e) => drop(e, null)}
        >
          {draft.images.map((img, stage) => (
            <li
              key={stage}
              className={`ed-slot${img ? "" : " ed-slot--empty"}${dragOver === stage ? " ed-slot--drag" : ""}${view === stage ? " ed-slot--view" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(stage);
              }}
              onDrop={(e) => drop(e, stage)}
            >
              <button
                type="button"
                className="ed-slot__img"
                onClick={() => (img ? setView(stage) : pick(stage))}
                aria-label={img ? `Show stage ${stageName(stage)} in the preview` : `Choose an image for stage ${stageName(stage)}`}
              >
                {img ? <img src={urls.get(img)} alt="" draggable={false} /> : <span className="ed-slot__plus">+</span>}
              </button>
              <div className="ed-slot__meta">
                <span className="ed-slot__name">
                  {stageName(stage)}
                  {LABELS[stage] && <span className="muted"> · {LABELS[stage]}</span>}
                </span>
                <span className="ed-slot__info muted">{img ? sizeText(img) : "Empty"}</span>
              </div>
              {img && (
                <div className="ed-slot__actions">
                  <button type="button" className="link-btn" onClick={() => pick(stage)} aria-label={`Replace stage ${stageName(stage)}`}>Replace</button>
                  <button type="button" className="link-btn" onClick={() => onRemove(stage)} aria-label={`Remove stage ${stageName(stage)}`}>Remove</button>
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="ed-hint">
          WebP, PNG, JPG or SVG, up to 8 MB each. All 11 must have the same shape; portrait 3:4 (for example 768×1024) fits the game best.
        </p>
      </div>
      <aside className="ed-images__preview" aria-label="Preview as in the game">
        <StageViewer character={character} stage={view} celebrate={view === FINAL_STAGE} />
        <label className="ed-field__label" htmlFor="ed-stage-range">
          Stage {view} of {FINAL_STAGE}
        </label>
        <input
          id="ed-stage-range"
          type="range"
          min={0}
          max={FINAL_STAGE}
          value={view}
          onChange={(e) => setView(Number(e.target.value))}
        />
      </aside>
    </div>
  );
}
