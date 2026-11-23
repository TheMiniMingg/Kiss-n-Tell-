import type { Outcome } from "@kiss-n-tell/engine";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  common: "Common",
  rare: "Rare",
  legendary: "Legendary",
  miss: "Not on the list",
  timeout: "Time's up",
};

export function TierBadge({ outcome, points, large }: { outcome: Outcome; points?: number; large?: boolean }) {
  return (
    <span className={`badge badge--${outcome}${large ? " badge--large" : ""}`}>
      {OUTCOME_LABEL[outcome]}
      {points !== undefined && <span className="badge__pts">+{points}</span>}
    </span>
  );
}
