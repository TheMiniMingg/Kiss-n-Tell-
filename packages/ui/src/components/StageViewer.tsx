import { FINAL_STAGE } from "@kiss-n-tell/engine";
import { useState } from "react";
import type { GameCharacter } from "../content.js";

interface Props {
  character: GameCharacter;
  stage: number;
  /** Highlight the ending reveal. */
  celebrate?: boolean;
}

export function StageViewer({ character, stage, celebrate }: Props) {
  const src = character.stages[stage];
  const [failed, setFailed] = useState<string | null>(null);
  const ratio = character.width && character.height ? `${character.width} / ${character.height}` : "3 / 4";
  return (
    <figure className={`stage${celebrate ? " stage--celebrate" : ""}`} style={{ aspectRatio: ratio }}>
      {src && failed !== src ? (
        <img
          key={src}
          className="stage__img"
          src={src}
          alt={`${character.name}, stage ${stage} of ${FINAL_STAGE}`}
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        <div className="stage__missing" role="img" aria-label="Image unavailable">Image unavailable</div>
      )}
      <figcaption className="stage__caption">
        <span className="stage__name">{character.name}</span>
        <span className="stage__count">{stage === FINAL_STAGE ? "Ending" : `Stage ${stage}/${FINAL_STAGE}`}</span>
      </figcaption>
    </figure>
  );
}

export function StageMeter({ stage }: { stage: number }) {
  return (
    <div className="meter" role="img" aria-label={`Stage ${stage} of ${FINAL_STAGE}`}>
      {Array.from({ length: FINAL_STAGE }, (_, i) => (
        <span key={i} className={`meter__seg${i < stage ? " meter__seg--on" : ""}${i === FINAL_STAGE - 1 ? " meter__seg--final" : ""}`} />
      ))}
    </div>
  );
}
