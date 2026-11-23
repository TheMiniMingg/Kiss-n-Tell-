import { STAGE_COUNT, questionsFromCsv, questionsToCsv, type Issue } from "@kiss-n-tell/engine";
import { Modal, loadManifest, type GameTopic } from "@kiss-n-tell/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageUrls, imageExtOf, measureAll, measureImage, placeImages } from "./images.js";
import {
  PackZipError,
  ZIP_LIMITS,
  clonePack,
  emptyImages,
  exportPackZip,
  importPackZip,
  isImageExt,
  isPlayable,
  newPack,
  packToFiles,
  slugify,
  uniqueId,
  validatePack,
  type PackDraft,
  type StageImage,
} from "./pack/index.js";
import { packGameTopic, packIssues, type LoadResult, type SavedPack } from "./packs.js";
import type { PackStore } from "./store.js";
import { ImagesPanel } from "./ImagesPanel.js";
import { IssueList, countIssues, issueTarget, type EditorTab } from "./IssueList.js";
import { PreviewRun } from "./PreviewRun.js";
import { QuestionsPanel } from "./QuestionsPanel.js";
import { TopicForm } from "./TopicForm.js";

/**
 * "local": the desktop app's own packs, listed as "My pack" next to the built-in topics.
 * "site": the website's owner mode, where every pack is one of the game's topics.
 */
export type EditorVariant = "local" | "site";

interface Props {
  store: PackStore;
  variant?: EditorVariant;
  saved: LoadResult;
  loadError: string | null;
  /** Built-in topics, for id clash warnings and "copy a built-in topic". */
  presets: { id: string; title: string }[];
  reload: () => Promise<void>;
  onClose: () => void;
  /** Told whenever the open pack gains or loses unsaved changes, so the host can ask before leaving. */
  onDirtyChange?: (dirty: boolean) => void;
}

interface OpenPack {
  /** Folder it was loaded from; null until first saved. */
  folder: string | null;
  draft: PackDraft;
  version: number;
  savedVersion: number;
  /** Ids follow the title/name until the author edits them. */
  idLinked: boolean;
  charIdLinked: boolean;
  /** Problems found while importing (ZIP or CSV), shown on the Check tab until dismissed. */
  importIssues: Issue[];
}

type Status = { tone: "ok" | "error" | "info"; text: string } | null;
type Pending = { title: string; body: string; confirm: string; danger?: boolean; run: () => void } | null;

const TABS: { id: EditorTab; label: string }[] = [
  { id: "topic", label: "Topic & character" },
  { id: "questions", label: "Questions" },
  { id: "images", label: "Images" },
  { id: "check", label: "Check" },
];

const CONTENT_URL = "content/manifest.json";

async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function Editor({ store, variant = "local", saved, loadError, presets, reload, onClose, onDirtyChange }: Props) {
  const site = variant === "site";
  const presetIds = useMemo(() => presets.map((p) => p.id), [presets]);
  const [open, setOpen] = useState<OpenPack | null>(null);
  const [tab, setTab] = useState<EditorTab>("topic");
  const [question, setQuestion] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [preview, setPreview] = useState<GameTopic | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [location, setLocation] = useState("");
  const urls = useRef(new ImageUrls());
  const zipInput = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    store.location().then(setLocation, () => undefined);
  }, [store]);

  const dirty = !!open && open.version !== open.savedVersion;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const otherIds = useMemo(
    () => saved.packs.filter((p) => p.folder !== open?.folder).map((p) => p.pack.topic.id),
    [saved.packs, open?.folder],
  );
  const issues = useMemo(
    () => (open ? validatePack(open.draft, { otherPackIds: otherIds, presetIds }) : []),
    [open, otherIds, presetIds],
  );
  const counts = countIssues(issues);

  // Release object URLs of images no longer in the open pack.
  useEffect(() => {
    urls.current.retain(open?.draft.images ?? []);
  }, [open?.draft.images]);

  // Clear a status message after a while.
  useEffect(() => {
    if (!status || status.tone === "error") return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  /** Run `next` now, or after confirming that unsaved changes may be dropped. */
  const guard = useCallback(
    (next: () => void) => {
      if (!dirty) return next();
      setPending({
        title: "Discard unsaved changes?",
        body: `"${open?.draft.topic.title || "This pack"}" has changes that haven't been saved.`,
        confirm: "Discard changes",
        danger: true,
        run: next,
      });
    },
    [dirty, open],
  );

  const update = useCallback((fn: (d: PackDraft) => void, opts: { idEdited?: boolean; charIdEdited?: boolean } = {}) => {
    setOpen((o) => {
      if (!o) return o;
      const draft = clonePack(o.draft);
      fn(draft);
      let { idLinked, charIdLinked } = o;
      if (opts.idEdited) idLinked = false;
      if (opts.charIdEdited) charIdLinked = false;
      if (idLinked) draft.topic.id = slugify(draft.topic.title);
      if (charIdLinked) draft.character.id = slugify(draft.character.name);
      return { ...o, draft, version: o.version + 1, idLinked, charIdLinked };
    });
  }, []);

  const openPack = (p: SavedPack) =>
    guard(() => {
      setOpen({
        folder: p.folder,
        draft: clonePack(p.pack),
        version: 0,
        savedVersion: 0,
        idLinked: false,
        charIdLinked: false,
        importIssues: p.loadIssues,
      });
      setQuestion(0);
      setTab("topic");
      setStatus(null);
    });

  const startNew = (draft: PackDraft, note: string, importIssues: Issue[] = [], linked = false) => {
    setOpen({ folder: null, draft, version: 1, savedVersion: 0, idLinked: linked, charIdLinked: linked, importIssues });
    setQuestion(0);
    setTab(linked ? "topic" : importIssues.some((i) => i.level === "error") ? "check" : "topic");
    setStatus({ tone: "info", text: note });
  };

  const takenIds = () => [...saved.packs.map((p) => p.pack.topic.id), ...saved.packs.map((p) => p.folder)];

  const newBlank = () => {
    setNewDialog(false);
    const draft = newPack("", "");
    draft.character.id = "";
    startNew(draft, "New pack. Give it a title, then add questions and images.", [], true);
  };

  const newFromPreset = async (presetId: string) => {
    setNewDialog(false);
    setBusy(true);
    try {
      const manifest = await loadManifest(CONTENT_URL);
      const t = manifest.topics.find((x) => x.id === presetId);
      if (!t) throw new Error("That topic is no longer available.");
      const images = emptyImages();
      await Promise.all(
        t.character.stages.map(async (url, stage) => {
          const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
          if (!isImageExt(ext)) return;
          const res = await fetch(url);
          if (res.ok) images[stage] = { ext, bytes: new Uint8Array(await res.arrayBuffer()) };
        }),
      );
      const id = uniqueId(`${t.id}-copy`, takenIds());
      const draft: PackDraft = {
        topic: { id, title: `${t.title} (copy)`, description: t.description ?? "" },
        character: { id: t.character.id, name: t.character.name, age: t.character.age, description: t.character.description ?? "", asset_rights: t.character.assetRights ?? "" },
        questions: t.questions.map((q) => ({ ...q, answers: { common: [...q.answers.common], rare: [...q.answers.rare], legendary: [...q.answers.legendary] } })),
        images: await measureAll(images),
      };
      startNew(draft, `Copied "${t.title}". Change what you like, then save.`);
    } catch (e) {
      setStatus({ tone: "error", text: `Could not copy the topic: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const importZip = async (file: File) => {
    if (file.size > ZIP_LIMITS.maxZipBytes) {
      setStatus({ tone: "error", text: `${file.name} is too large (limit ${ZIP_LIMITS.maxZipBytes / 1048576} MB).` });
      return;
    }
    setBusy(true);
    try {
      const { pack, issues: found } = importPackZip(await readFile(file), slugify(file.name.replace(/\.zip$/i, "")) || "imported");
      pack.images = await measureAll(pack.images);
      const notes: Issue[] = [...found];
      const original = pack.topic.id;
      if (takenIds().includes(original)) {
        pack.topic.id = uniqueId(original, takenIds());
        notes.push({ level: "warning", where: "topic.json", message: `You already have a pack with the id "${original}", so this one was renamed to "${pack.topic.id}".` });
      }
      startNew(pack, `Imported ${file.name}. Review it, then save to keep it.`, notes);
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof PackZipError ? e.message : `Could not import ${file.name}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const save = useCallback(async () => {
    if (!open || busy) return;
    const id = open.draft.topic.id;
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id) || id.length > 64) {
      setTab("topic");
      setStatus({ tone: "error", text: "Give the pack a valid topic id before saving: lowercase letters, digits, - and _." });
      return;
    }
    setBusy(true);
    try {
      const playable = isPlayable(issues);
      const folder = (await store.save(id, packToFiles(open.draft), open.folder, { playable })) || id;
      const version = open.version;
      setOpen((o) => (o ? { ...o, folder, savedVersion: version, idLinked: false, charIdLinked: false } : o));
      await reload();
      const fix = `Fix ${counts.errors} error${counts.errors === 1 ? "" : "s"} to make it playable.`;
      setStatus({
        tone: "ok",
        text: site
          ? playable
            ? "Saved to the site. Players see it after the next deploy (usually 1 to 2 minutes)."
            : `Saved as a hidden draft. ${fix}`
          : playable
            ? "Saved. It's on the topic list as \"My pack\"."
            : `Saved. ${fix}`,
      });
    } catch (e) {
      setStatus({ tone: "error", text: `Could not save: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [open, busy, store, reload, issues, counts.errors, site]);

  // Ctrl+S / Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!preview) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, preview]);

  // Native window: ask before closing with unsaved work.
  useEffect(() => {
    if (!dirty || !store.onCloseRequested) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void store
      .onCloseRequested((quit) =>
        setPending({
          title: "Quit with unsaved changes?",
          body: `"${openRef.current?.draft.topic.title || "This pack"}" has changes that haven't been saved.`,
          confirm: "Quit without saving",
          danger: true,
          run: quit,
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dirty, store]);

  // Warn before the window closes with unsaved work (browser builds).
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const exportZip = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const where = await store.saveFile(exportPackZip(open.draft), `${open.draft.topic.id || "pack"}.zip`);
      setStatus({
        tone: counts.errors ? "info" : "ok",
        text: `Exported to ${where}.${counts.errors ? ` It still has ${counts.errors} error${counts.errors === 1 ? "" : "s"}, so it won't be playable until they're fixed.` : ""}`,
      });
    } catch (e) {
      setStatus({ tone: "error", text: `Could not export: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const deletePack = () => {
    if (!open) return;
    const { folder, draft } = open;
    setPending({
      title: "Delete this pack?",
      body: folder
        ? site
          ? `"${draft.topic.title || folder}" will be removed from the site. Git history keeps a copy.`
          : `"${draft.topic.title || folder}" will be removed from your packs.${store.kind === "tauri" ? " A copy is kept in the app's trash folder." : ""}`
        : "This pack hasn't been saved, so it will be discarded.",
      confirm: "Delete pack",
      danger: true,
      run: async () => {
        try {
          if (folder) await store.remove(folder);
          setOpen(null);
          await reload();
          setStatus({ tone: "ok", text: site ? "Topic deleted. The site updates after the next deploy." : "Pack deleted." });
        } catch (e) {
          setStatus({ tone: "error", text: `Could not delete: ${(e as Error).message}` });
        }
      },
    });
  };

  const addImages = async (files: File[], stage: number | null) => {
    if (!open) return;
    const problems: string[] = [];
    const loaded: { img: StageImage; name: string }[] = [];
    for (const f of files) {
      const ext = imageExtOf(f);
      if (!ext) {
        problems.push(`${f.name}: use WebP, PNG, JPG or SVG`);
        continue;
      }
      if (f.size > ZIP_LIMITS.maxImageBytes) {
        problems.push(`${f.name} is ${(f.size / 1048576).toFixed(1)} MB (max 8 MB)`);
        continue;
      }
      const img: StageImage = { ext, bytes: await readFile(f) };
      const size = await measureImage(img);
      if (!size) {
        problems.push(`${f.name} could not be opened as an image`);
        continue;
      }
      loaded.push({ img: { ...img, ...size }, name: f.name });
    }
    const current = openRef.current?.draft.images ?? [];
    const { placed, unplaced } = placeImages(current, loaded.map((l) => ({ name: l.name, value: l.img })), files.length === 1 ? stage : null);
    for (const name of unplaced) problems.push(`no empty stage left for ${name}`);
    if (placed.size) update((d) => placed.forEach((img, s) => void (d.images[s] = img)));
    const count = placed.size;
    setStatus(
      problems.length
        ? { tone: "error", text: `${count ? `Added ${count}. ` : ""}Skipped: ${problems.join("; ")}.` }
        : { tone: "ok", text: count === 1 ? "Image added." : `${count} images added.` },
    );
  };

  const importCsv = async (file: File) => {
    if (!open) return;
    if (file.size > ZIP_LIMITS.maxTextBytes) {
      setStatus({ tone: "error", text: `${file.name} is larger than 5 MB.` });
      return;
    }
    const text = new TextDecoder().decode(await readFile(file)).replace(/^﻿/, "");
    const { questions, issues: found } = questionsFromCsv(text, file.name);
    if (questions.length === 0) {
      setStatus({ tone: "error", text: found[0]?.message ?? `${file.name} has no questions.` });
      return;
    }
    const apply = () => {
      update((d) => void (d.questions = questions));
      setQuestion(0);
      setOpen((o) => (o ? { ...o, importIssues: found } : o));
      const errs = found.filter((i) => i.level === "error").length;
      setStatus(
        errs
          ? { tone: "error", text: `Imported ${questions.length} questions, but ${errs} row${errs === 1 ? "" : "s"} had problems. See the Check tab.` }
          : { tone: "ok", text: `Imported ${questions.length} questions from ${file.name}.` },
      );
    };
    if (open.draft.questions.length === 0) apply();
    else
      setPending({
        title: "Replace all questions?",
        body: `${file.name} has ${questions.length} questions. They will replace the ${open.draft.questions.length} questions in this pack.`,
        confirm: "Replace questions",
        run: apply,
      });
  };

  const exportCsv = async () => {
    if (!open) return;
    try {
      const where = await store.saveFile(new TextEncoder().encode(questionsToCsv(open.draft.questions)), `${open.draft.topic.id || "pack"}-questions.csv`);
      setStatus({ tone: "ok", text: `Questions saved to ${where}.` });
    } catch (e) {
      setStatus({ tone: "error", text: `Could not save the CSV: ${(e as Error).message}` });
    }
  };

  const goToIssue = (issue: Issue) => {
    const t = issueTarget(issue);
    setTab(t.tab);
    if (t.questionId && open) {
      const i = open.draft.questions.findIndex((q) => q.id === t.questionId);
      if (i >= 0) setQuestion(i);
    }
  };

  const canPreview = !!open && open.draft.questions.some((q) => q.prompt.trim() && (q.answers.common.length + q.answers.rare.length + q.answers.legendary.length) > 0);

  const startPreview = () => {
    if (!open) return;
    const playable = clonePack(open.draft);
    playable.questions = playable.questions.filter((q) => q.prompt.trim());
    setPreview(packGameTopic(playable, urls.current, "preview"));
  };

  if (preview) return <PreviewRun topic={preview} onClose={() => setPreview(null)} />;

  return (
    <div className="ed">
      <aside className="ed-side" aria-label={site ? "Topics" : "Your packs"}>
        <button type="button" className="btn btn--ghost btn--small ed-back" onClick={() => guard(onClose)}>
          ← Back to game
        </button>
        <h2 className="ed-side__title">{site ? "Topics" : "Your packs"}</h2>
        <div className="ed-side__tools">
          <button type="button" className="btn btn--primary btn--small" onClick={() => guard(() => setNewDialog(true))} disabled={busy}>New pack</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => guard(() => zipInput.current?.click())} disabled={busy}>Import ZIP…</button>
          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            hidden
            data-testid="zip-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importZip(f);
            }}
          />
        </div>
        {loadError && <p className="ed-status ed-status--error" role="alert">Could not read your packs: {loadError}</p>}
        {saved.failures.map((f) => (
          <p key={f.folder} className="ed-status ed-status--error">Could not read "{f.folder}": {f.message}</p>
        ))}
        {saved.packs.length === 0 && !open ? (
          <p className="ed-empty">{site ? "No topics yet. Start a new one or import a pack ZIP." : "No packs yet. Start a new one, copy a built-in topic, or import a pack ZIP."}</p>
        ) : (
          <ul className="ed-packs">
            {open && open.folder === null && (
              <li>
                <button type="button" className="ed-pack ed-pack--on" aria-current="true">
                  <span className="ed-pack__title">{open.draft.topic.title || (site ? "Untitled topic" : "Untitled pack")}</span>
                  <span className="ed-pack__meta">Not saved yet</span>
                </button>
              </li>
            )}
            {saved.packs.map((p) => {
              const c = countIssues(packIssues(p, saved.packs, presetIds));
              const isOpen = open?.folder === p.folder;
              const hidden = site && p.folder.startsWith("_");
              return (
                <li key={p.folder}>
                  <button
                    type="button"
                    className={`ed-pack${isOpen ? " ed-pack--on" : ""}`}
                    aria-current={isOpen ? "true" : undefined}
                    onClick={() => !isOpen && openPack(p)}
                  >
                    <span className="ed-pack__title">
                      {(isOpen ? open.draft.topic.title : p.pack.topic.title) || p.folder}
                      {isOpen && dirty && <span className="ed-dot ed-dot--dirty" aria-label="Unsaved changes" title="Unsaved changes" />}
                    </span>
                    <span className="ed-pack__meta">
                      {p.pack.questions.length} questions · {p.pack.images.filter(Boolean).length}/{STAGE_COUNT} images ·{" "}
                      {c.errors ? <span className="ed-bad">{c.errors} error{c.errors === 1 ? "" : "s"}</span> : hidden ? <span className="ed-bad">Hidden draft</span> : <span className="ed-good">Playable</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="ed-side__foot">
          <p className="muted">
            Saved in {location || "…"}
          </p>
          {store.openFolder && (
            <button type="button" className="link-btn" onClick={() => store.openFolder?.().catch((e: Error) => setStatus({ tone: "error", text: e.message }))}>
              Open packs folder
            </button>
          )}
        </div>
      </aside>

      <main className="ed-main">
        {!open ? (
          <div className="ed-welcome">
            <h1 className="ed-welcome__title">{site ? "Topic editor" : "Pack editor"}</h1>
            {site ? (
              <p className="muted">
                Pick a topic on the left to change its questions, answers, character or images, or start a new one. Each topic needs a question pool
                (at least 7, each run draws 7 at random), a character, and 11 stage images from 00 (start) to 10 (ending). Saving commits the change
                to the game's content on GitHub and the live site updates after the deploy. Topics with errors are saved as hidden drafts.
              </p>
            ) : (
              <p className="muted">
                A pack is one topic: a question pool (at least 7, each run draws 7 at random), a character, and 11 stage images from 00 (start) to 10 (ending).
                Saved packs with no errors show up on the topic list as "My pack". Export a pack as a ZIP to share it or to add it to the game's presets.
              </p>
            )}
            <div className="ed-row">
              <button type="button" className="btn btn--primary" onClick={() => setNewDialog(true)}>New pack</button>
              <button type="button" className="btn btn--ghost" onClick={() => zipInput.current?.click()}>Import ZIP…</button>
            </div>
            {status && <p className={`ed-status ed-status--${status.tone}`} role="status">{status.text}</p>}
          </div>
        ) : (
          <>
            <header className="ed-head">
              <div className="ed-head__title">
                <h1>{open.draft.topic.title || "Untitled pack"}</h1>
                <span className={`pill ${dirty ? "pill--dirty" : ""}`}>{open.folder === null ? "Not saved" : dirty ? "Unsaved changes" : "Saved"}</span>
                <span className={`pill ${counts.errors ? "pill--bad" : "pill--good"}`}>
                  {counts.errors ? `${counts.errors} error${counts.errors === 1 ? "" : "s"}` : "Playable"}
                </span>
              </div>
              <div className="ed-row">
                <button type="button" className="btn btn--primary btn--small" onClick={() => void save()} disabled={busy || (!dirty && open.folder !== null)} title="Ctrl+S">
                  Save
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={startPreview} disabled={!canPreview} title={canPreview ? "Play a run of this pack" : "Add a question with a prompt and answers first"}>
                  Preview run
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => void exportZip()} disabled={busy}>Export ZIP</button>
                <button type="button" className="btn btn--danger btn--small" onClick={deletePack} disabled={busy}>Delete</button>
              </div>
            </header>
            {status && <p className={`ed-status ed-status--${status.tone}`} role="status">{status.text}</p>}
            <nav className="ed-tabs" role="tablist" aria-label="Pack sections">
              {TABS.map((t) => {
                const n =
                  t.id === "questions" ? open.draft.questions.length : t.id === "images" ? `${open.draft.images.filter(Boolean).length}/${STAGE_COUNT}` : t.id === "check" ? counts.errors + counts.warnings : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`ed-tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls="ed-panel"
                    className={`ed-tab${tab === t.id ? " ed-tab--on" : ""}${t.id === "check" && counts.errors ? " ed-tab--bad" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {n !== null && <span className="ed-tab__n">{n}</span>}
                  </button>
                );
              })}
            </nav>
            <div className="ed-panel" id="ed-panel" role="tabpanel" aria-labelledby={`ed-tab-${tab}`}>
              {tab === "topic" && <TopicForm draft={open.draft} isNew={open.folder === null} idLinked={open.idLinked} onChange={update} />}
              {tab === "questions" && (
                <QuestionsPanel
                  draft={open.draft}
                  selected={Math.min(question, Math.max(0, open.draft.questions.length - 1))}
                  onSelect={setQuestion}
                  onChange={update}
                  onImportCsv={(f) => void importCsv(f)}
                  onExportCsv={() => void exportCsv()}
                />
              )}
              {tab === "images" && (
                <ImagesPanel
                  draft={open.draft}
                  urls={urls.current}
                  onFiles={(files, stage) => void addImages(files, stage)}
                  onRemove={(stage) => update((d) => void (d.images[stage] = null))}
                />
              )}
              {tab === "check" && (
                <div className="ed-check">
                  <p className={counts.errors ? "ed-bad" : "ed-good"}>
                    {counts.errors
                      ? `${counts.errors} error${counts.errors === 1 ? "" : "s"} to fix before this pack can be played.`
                      : site
                        ? "Ready to play. Save it and it appears on the site after the next deploy."
                        : "Ready to play. Save it and it appears on the topic list."}
                    {counts.warnings > 0 && ` ${counts.warnings} warning${counts.warnings === 1 ? "" : "s"} (optional to fix).`}
                  </p>
                  <IssueList issues={issues} onGo={goToIssue} empty="No problems found." />
                  {open.importIssues.length > 0 && (
                    <div className="ed-card">
                      <div className="ed-row ed-row--between">
                        <h3 className="ed-card__title">From the last import</h3>
                        <button type="button" className="link-btn" onClick={() => setOpen((o) => (o ? { ...o, importIssues: [] } : o))}>Dismiss</button>
                      </div>
                      <p className="muted">Rows or files that couldn't be read were left out. Fix the source file and import again, or fix the pack here.</p>
                      <IssueList issues={open.importIssues} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {newDialog && (
        <Modal
          title="New pack"
          onClose={() => setNewDialog(false)}
          actions={<button type="button" className="btn btn--ghost" onClick={() => setNewDialog(false)}>Cancel</button>}
        >
          <p>{presets.length ? "Start from scratch, or copy a built-in topic and change it." : "Start from scratch, or import a pack ZIP from the side bar."}</p>
          <div className="ed-newlist">
            <button type="button" className="btn btn--primary" data-autofocus onClick={newBlank}>Blank pack</button>
            {presets.map((p) => (
              <button key={p.id} type="button" className="btn btn--ghost" onClick={() => void newFromPreset(p.id)}>Copy “{p.title}”</button>
            ))}
          </div>
        </Modal>
      )}

      {pending && (
        <Modal
          title={pending.title}
          onClose={() => setPending(null)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" data-autofocus onClick={() => setPending(null)}>Cancel</button>
              <button
                type="button"
                className={`btn ${pending.danger ? "btn--danger" : "btn--primary"}`}
                onClick={() => {
                  const run = pending.run;
                  setPending(null);
                  run();
                }}
              >
                {pending.confirm}
              </button>
            </>
          }
        >
          <p>{pending.body}</p>
        </Modal>
      )}
    </div>
  );
}

