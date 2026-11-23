import { useState } from "react";

export function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  const [declined, setDeclined] = useState(false);
  return (
    <div className="gate">
      <div className="gate__card" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <div className="logo logo--small" aria-hidden="true">Kiss N Tell</div>
        {declined ? (
          <>
            <h1 id="gate-title" className="gate__title">Sorry, this game is for adults</h1>
            <p className="gate__text">Kiss N Tell is only for players aged 18 or older. You can close this tab.</p>
            <button className="btn btn--ghost" onClick={() => setDeclined(false)}>Go back</button>
          </>
        ) : (
          <>
            <h1 id="gate-title" className="gate__title">Are you 18 or older?</h1>
            <p className="gate__text">
              Kiss N Tell is a trivia game with suggestive art of fictional adult characters (swimwear, no nudity).
              You must be 18 or older to play.
            </p>
            <div className="gate__actions">
              <button className="btn btn--primary" autoFocus onClick={onConfirm}>I'm 18 or older</button>
              <button className="btn btn--ghost" onClick={() => setDeclined(true)}>I'm under 18</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
