import { FINAL_STAGE, MAX_SCORE, STAGE_COUNT } from "@kiss-n-tell/engine";
import { StageViewer } from "@kiss-n-tell/ui";
import { useRef, useState, type DragEvent } from "react";
import { ImageUrls } from "./images.js";
import { stageName, type PackDraft, type StageImage } from "./pack/index.js";

/** A stage slot (0-10) or the optional secret image. */
export type ImageSlot = number | "secret";

interface Props {
  draft: PackDraft;
  urls: ImageUrls;
  /** Files dropped or picked for a slot (or for the grid when slot is null). */
  onFiles: (files: File[], slot: ImageSlot | null) => void;
  onRemove: (slot: ImageSlot) => void;
}

const LABELS: Record<number, string> = { 0: "Start", [FINAL_STAGE]: "Ending" };

function sizeText(img: StageImage) {
  const kb = img.bytes.length / 1024;
  const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  return img.width && img.height ? `${img.width}×${img.height} · ${size}` : size;
}

export function ImagesPanel({ draft, urls, onFiles, onRemove }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<ImageSlot | null>(null);
  const [dragOver, setDragOver] = useState<ImageSlot | "grid" | null>(null);
  const [stageView, setView] = useState(0);
  const [showSecret, setShowSecret] = useState(false);
  const count = draft.images.filter(Boolean).length;
  const secretOn = showSecret && !!draft.secret;
  const view: ImageSlot = secretOn ? "secret" : stageView;
  const showStage = (stage: number) => {
    setView(stage);
    setShowSecret(false);
  };

  const pick = (stage: ImageSlot | null) => {
    target.current = stage;
    if (picker.current) {
      picker.current.multiple = stage === null;
      picker.current.click();
    }
  };

  const drop = (e: DragEvent, stage: ImageSlot | null) => {
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
    secret: draft.secret ? urls.get(draft.secret) : undefined,
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
                onClick={() => (img ? showStage(stage) : pick(stage))}
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

        <section className="ed-secret" aria-labelledby="ed-secret-title">
          <div
            className={`ed-slot ed-slot--secret${draft.secret ? "" : " ed-slot--empty"}${dragOver === "secret" ? " ed-slot--drag" : ""}${view === "secret" ? " ed-slot--view" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver("secret");
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(null);
            }}
            onDrop={(e) => drop(e, "secret")}
          >
            <button
              type="button"
              className="ed-slot__img"
              onClick={() => (draft.secret ? setShowSecret(true) : pick("secret"))}
              aria-label={draft.secret ? "Show the secret image in the preview" : "Choose a secret image"}
            >
              {draft.secret ? <img src={urls.get(draft.secret)} alt="" draggable={false} /> : <span className="ed-slot__plus">+</span>}
            </button>
            <div className="ed-slot__meta">
              <span className="ed-slot__name">Secret</span>
              <span className="ed-slot__info muted">{draft.secret ? sizeText(draft.secret) : "None"}</span>
            </div>
            {draft.secret && (
              <div className="ed-slot__actions">
                <button type="button" className="link-btn" onClick={() => pick("secret")} aria-label="Replace the secret image">Replace</button>
                <button type="button" className="link-btn" onClick={() => onRemove("secret")} aria-label="Remove the secret image">Remove</button>
              </div>
            )}
          </div>
          <div className="ed-secret__text">
            <h3 id="ed-secret-title" className="ed-secret__title">Secret image <span className="muted">(optional)</span></h3>
            <p className="muted">
              Shown only after a perfect run: Legendary on all 7 questions, {MAX_SCORE} points. The game never hints that it exists until
              then. Same shape and size rules as the stages. A file named <code>secret</code> (for example secret.webp) picked with the
              others lands here.
            </p>
          </div>
        </section>
      </div>
      <aside className="ed-images__preview" aria-label="Preview as in the game">
        <StageViewer character={character} stage={stageView} celebrate={!secretOn && stageView === FINAL_STAGE} secret={secretOn} />
        <label className="ed-field__label" htmlFor="ed-stage-range">
          {secretOn ? "Secret image (perfect run)" : `Stage ${stageView} of ${FINAL_STAGE}`}
        </label>
        <input
          id="ed-stage-range"
          type="range"
          min={0}
          max={FINAL_STAGE}
          value={stageView}
          onChange={(e) => showStage(Number(e.target.value))}
        />
        {draft.secret && (
          <label className="ed-check-row">
            <input type="checkbox" checked={secretOn} onChange={(e) => setShowSecret(e.target.checked)} /> Show the secret image
          </label>
        )}
      </aside>
    </div>
  );
}
