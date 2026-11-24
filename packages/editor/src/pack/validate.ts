import {
  QUESTIONS_PER_RUN,
  STAGE_COUNT,
  hasErrors,
  validateTopic,
  type Issue,
  type Topic,
} from "@kiss-n-tell/engine";
import { ID_PATTERN, MAX_ID_LENGTH, stageName, type PackDraft } from "./model.js";
import { ZIP_LIMITS } from "./zip.js";

/**
 * Engine topic for a pack. `stageUrls` (and `secretUrl`) are whatever the
 * viewer can load (blob: URLs in the app).
 */
export function packToTopic(pack: PackDraft, stageUrls: readonly string[], secretUrl?: string): Topic {
  return {
    id: pack.topic.id,
    title: pack.topic.title,
    description: pack.topic.description || undefined,
    character: {
      id: pack.character.id,
      name: pack.character.name,
      age: pack.character.age,
      description: pack.character.description || undefined,
      assetRights: pack.character.asset_rights || undefined,
      stages: [...stageUrls],
      ...(secretUrl ? { secret: secretUrl } : {}),
    },
    questions: pack.questions,
  };
}

export interface ValidateOptions {
  /** Ids of the author's other packs: the same id would overwrite one of them. */
  otherPackIds?: readonly string[];
  /** Ids of the bundled presets: allowed, but it would clash if the pack were added to content/presets. */
  presetIds?: readonly string[];
}

/**
 * Everything the preset build checks, for a pack in the editor: the engine's
 * validateTopic plus image checks (all 11 stages, size, matching shape, and
 * the same size and shape rules for the optional secret image).
 */
export function validatePack(pack: PackDraft, opts: ValidateOptions = {}): Issue[] {
  const where = `topic ${pack.topic.id || "(no id)"}`;
  const issues: Issue[] = [];
  const missing = pack.images.flatMap((img, i) => (img ? [] : [stageName(i)]));
  const placeholder = missing.length === 0 ? pack.images.map((_, i) => `stage-${i}`) : [];
  issues.push(
    ...validateTopic(packToTopic(pack, placeholder)).filter((i) => !(missing.length > 0 && /stage images/.test(i.message))),
  );
  if (pack.topic.id.length > MAX_ID_LENGTH) {
    issues.push({ level: "error", where, message: `Topic id is longer than ${MAX_ID_LENGTH} characters.` });
  }
  if (!ID_PATTERN.test(pack.topic.id)) {
    // validateTopic already reports a bad pattern; an empty id gets a clearer message.
    if (!pack.topic.id) issues.push({ level: "error", where, message: "Topic id is empty." });
  }
  if (opts.otherPackIds?.includes(pack.topic.id)) {
    issues.push({ level: "error", where, message: `Another of your packs already uses the id "${pack.topic.id}".` });
  }
  if (opts.presetIds?.includes(pack.topic.id)) {
    issues.push({
      level: "warning",
      where,
      message: `"${pack.topic.id}" is also a built-in topic id. That's fine here, but rename it before adding it to content/presets.`,
    });
  }
  if (pack.questions.length > 0 && pack.questions.length < QUESTIONS_PER_RUN * 2) {
    issues.push({
      level: "warning",
      where,
      message: `Only ${pack.questions.length} questions. With ${QUESTIONS_PER_RUN} per run, players will see repeats quickly.`,
    });
  }

  const charWhere = `${where} / character ${pack.character.id || "(no id)"}`;
  if (missing.length) {
    issues.push({
      level: "error",
      where: `${charWhere} / images`,
      message: missing.length === STAGE_COUNT ? "No stage images yet (00-10)." : `Missing stage image${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`,
    });
  }
  const sized: { name: string; w: number; h: number }[] = [];
  pack.images.forEach((img, stage) => {
    if (!img) return;
    if (img.bytes.length > ZIP_LIMITS.maxImageBytes) {
      issues.push({
        level: "error",
        where: `${charWhere} / images`,
        message: `Stage ${stageName(stage)} is ${(img.bytes.length / 1048576).toFixed(1)} MB (max 8 MB).`,
      });
    }
    if (img.width && img.height) sized.push({ name: `Stage ${stageName(stage)}`, w: img.width, h: img.height });
  });
  if (pack.secret) {
    if (pack.secret.bytes.length > ZIP_LIMITS.maxImageBytes) {
      issues.push({
        level: "error",
        where: `${charWhere} / images`,
        message: `The secret image is ${(pack.secret.bytes.length / 1048576).toFixed(1)} MB (max 8 MB).`,
      });
    }
    if (pack.secret.width && pack.secret.height) sized.push({ name: "The secret image", w: pack.secret.width, h: pack.secret.height });
  }
  const first = sized[0];
  if (first) {
    const ratio = (s: { w: number; h: number }) => s.w / s.h;
    for (const s of sized.slice(1)) {
      if (s.w === first.w && s.h === first.h) continue;
      const sameShape = Math.abs(ratio(s) - ratio(first)) < 0.01;
      issues.push({
        level: sameShape ? "warning" : "error",
        where: `${charWhere} / images`,
        message: `${s.name} is ${s.w}x${s.h} but ${first.name.charAt(0).toLowerCase()}${first.name.slice(1)} is ${first.w}x${first.h}${sameShape ? " (same shape, different size)." : ". All images need the same shape."}`,
      });
    }
  }
  return issues;
}

export function isPlayable(issues: readonly Issue[]): boolean {
  return !hasErrors(issues);
}
