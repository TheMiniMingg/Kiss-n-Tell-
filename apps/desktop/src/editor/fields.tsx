import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { parseWordList } from "../pack/index.js";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: (id: string, hintId: string | undefined) => ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`ed-field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className="ed-field__label">{label}</label>
      {children(id, hintId)}
      {hint && <p id={hintId} className="ed-field__hint">{hint}</p>}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  maxLength?: number;
}

export function TextField({ label, value, onChange, hint, multiline, placeholder, className, mono, maxLength }: TextProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, hintId) =>
        multiline ? (
          <textarea
            id={id}
            className="ed-input ed-input--area"
            value={value}
            placeholder={placeholder}
            aria-describedby={hintId}
            maxLength={maxLength}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            className={`ed-input${mono ? " ed-input--mono" : ""}`}
            value={value}
            placeholder={placeholder}
            aria-describedby={hintId}
            maxLength={maxLength}
            spellCheck={!mono}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

interface NumberProps {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  hint?: ReactNode;
  min?: number;
  max?: number;
  className?: string;
}

/** Number input that lets the field be empty while typing. */
export function NumberField({ label, value, onChange, hint, min, max, className }: NumberProps) {
  const [text, setText] = useState(value === undefined || Number.isNaN(value) ? "" : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      const parsed = text.trim() === "" ? undefined : Number(text);
      if (parsed !== value) setText(value === undefined || Number.isNaN(value) ? "" : String(value));
    }
  }, [value, text]);
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, hintId) => (
        <input
          id={id}
          className="ed-input ed-input--num"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={text}
          aria-describedby={hintId}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim() === "" ? undefined : Number(e.target.value);
            last.current = v;
            onChange(v === undefined || Number.isNaN(v) ? undefined : v);
          }}
        />
      )}
    </Field>
  );
}

interface WordListProps {
  label: ReactNode;
  tierClass: string;
  /** Identifies the list being edited; the text resets when it changes. */
  listKey: string;
  value: string[];
  onChange: (v: string[]) => void;
}

/**
 * One answer per line. Keeps the raw text while typing (so a new empty
 * line isn't swallowed) and tidies it on blur.
 */
export function WordListField({ label, tierClass, listKey, value, onChange }: WordListProps) {
  const id = useId();
  const [text, setText] = useState(value.join("\n"));
  const key = useRef(listKey);
  useEffect(() => {
    const same = parseWordList(text).join("\n") === value.join("\n");
    if (key.current !== listKey || !same) {
      key.current = listKey;
      setText(value.join("\n"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, value]);
  return (
    <div className={`ed-words ${tierClass}`}>
      <label htmlFor={id} className="ed-words__label">
        <span>{label}</span>
        <span className="ed-words__count" aria-label={`${value.length} answers`}>{value.length}</span>
      </label>
      <textarea
        id={id}
        className="ed-input ed-input--words"
        value={text}
        spellCheck={false}
        placeholder="One answer per line"
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseWordList(e.target.value));
        }}
        onBlur={() => setText(value.join("\n"))}
      />
    </div>
  );
}
