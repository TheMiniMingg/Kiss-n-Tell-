import { NumberField, TextField } from "./fields.js";
import type { PackDraft } from "./pack/index.js";

interface Props {
  draft: PackDraft;
  isNew: boolean;
  /** The topic id still follows the title. */
  idLinked: boolean;
  onChange: (fn: (d: PackDraft) => void, opts?: { idEdited?: boolean; charIdEdited?: boolean }) => void;
}

export function TopicForm({ draft, isNew, idLinked, onChange }: Props) {
  const t = draft.topic;
  const c = draft.character;
  return (
    <div className="ed-form">
      <section className="ed-card" aria-labelledby="ed-topic-h">
        <h3 id="ed-topic-h" className="ed-card__title">Topic</h3>
        <div className="ed-grid">
          <TextField label="Title" value={t.title} placeholder="e.g. Ancient Greece" maxLength={80} onChange={(v) => onChange((d) => void (d.topic.title = v))} />
          <TextField
            label="Topic id"
            mono
            value={t.id}
            maxLength={64}
            hint={
              idLinked
                ? "Made from the title until you edit it. Lowercase letters, digits, - and _."
                : isNew
                  ? "Lowercase letters, digits, - and _. Also the pack's folder name."
                  : "Also the pack's folder name. Changing it renames the pack when you save."
            }
            onChange={(v) => onChange((d) => void (d.topic.id = v.trim().toLowerCase()), { idEdited: true })}
          />
          <TextField
            label="Description"
            className="ed-grid__wide"
            multiline
            maxLength={300}
            value={t.description ?? ""}
            placeholder="One line shown under the title on the topic list."
            onChange={(v) => onChange((d) => void (d.topic.description = v))}
          />
          <NumberField
            label="Sort order (optional)"
            value={t.order}
            hint="Lower numbers are listed first when added to the presets."
            onChange={(v) => onChange((d) => {
              if (v === undefined) delete d.topic.order;
              else d.topic.order = v;
            })}
          />
        </div>
      </section>

      <section className="ed-card" aria-labelledby="ed-char-h">
        <h3 id="ed-char-h" className="ed-card__title">Character</h3>
        <div className="ed-grid">
          <TextField label="Name" value={c.name} maxLength={60} onChange={(v) => onChange((d) => void (d.character.name = v))} />
          <TextField
            label="Character id"
            mono
            value={c.id}
            maxLength={64}
            onChange={(v) => onChange((d) => void (d.character.id = v.trim().toLowerCase()), { charIdEdited: true })}
          />
          <NumberField label="Age" min={18} value={c.age} hint="Characters must be adults: 18 or older." onChange={(v) => onChange((d) => void (d.character.age = v ?? 0))} />
          <TextField label="Species (optional)" value={c.species ?? ""} placeholder="e.g. demon, snake, slime, human" maxLength={40} onChange={(v) => onChange((d) => void (d.character.species = v))} />
          <TextField
            label="Description (optional)"
            className="ed-grid__wide"
            multiline
            maxLength={300}
            value={c.description ?? ""}
            onChange={(v) => onChange((d) => void (d.character.description = v))}
          />
          <TextField
            label="Asset rights"
            className="ed-grid__wide"
            multiline
            maxLength={500}
            value={c.asset_rights ?? ""}
            placeholder="Where the art came from and under what terms, e.g. 'Generated with <tool> on 2026-11-20; owned by the pack author.'"
            hint="Recorded in character.json so anyone reusing the pack knows where the images came from."
            onChange={(v) => onChange((d) => void (d.character.asset_rights = v))}
          />
        </div>
      </section>
    </div>
  );
}
