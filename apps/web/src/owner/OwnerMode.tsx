import { Editor, loadAllPacks, type LoadResult } from "@kiss-n-tell/editor";
import "@kiss-n-tell/editor/editor.css";
import { Modal } from "@kiss-n-tell/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, editApi, type SessionInfo } from "./api.js";
import "./owner.css";
import { SiteSettings } from "./SiteSettings.js";
import { SiteStore } from "./siteStore.js";

type Tab = "topics" | "site";

/**
 * The website's owner mode: unlock with the password (checked on the server),
 * then edit the game's topics and the site's text and links. Saves are commits
 * to the repo, which redeploys the site.
 */
export default function OwnerMode({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    editApi.session().then(setSession, (e: Error) => setError(e.message));
  }, [attempt]);

  if (error) {
    return (
      <OwnerCard title="Edit site" onClose={onClose}>
        <p role="alert">{error}</p>
        <button type="button" className="btn btn--primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      </OwnerCard>
    );
  }
  if (!session) {
    return (
      <OwnerCard title="Edit site" onClose={onClose}>
        <p className="muted" aria-busy="true">Checking…</p>
      </OwnerCard>
    );
  }
  if (!session.configured) {
    return (
      <OwnerCard title="Edit mode is off" onClose={onClose}>
        <p>The site owner hasn't set an edit password on the server (EDIT_PASSWORD), so editing is turned off.</p>
      </OwnerCard>
    );
  }
  if (!session.unlocked) {
    return <Unlock onClose={onClose} onUnlocked={() => setSession({ ...session, unlocked: true })} />;
  }
  if (!session.github) {
    return (
      <OwnerCard title="Saving isn't set up yet" onClose={onClose} onLock={() => editApi.lock().finally(() => setAttempt((a) => a + 1))}>
        <p>
          You're unlocked, but the server has no GITHUB_TOKEN, so it can't read or save the game's content. Add a GitHub token that can write to{" "}
          <b>{session.repo}</b> as GITHUB_TOKEN in the Vercel project's environment variables, redeploy, and come back.
        </p>
      </OwnerCard>
    );
  }
  return <Workspace session={session} onClose={onClose} onLocked={() => setAttempt((a) => a + 1)} />;
}

function OwnerCard({ title, onClose, onLock, children }: { title: string; onClose: () => void; onLock?: () => void; children: ReactNode }) {
  return (
    <div className="gate owner-gate">
      <div className="gate__card" role="dialog" aria-modal="true" aria-labelledby="owner-title">
        <div className="logo logo--small" aria-hidden="true">Kiss N Tell</div>
        <h1 id="owner-title" className="gate__title">{title}</h1>
        {children}
        <div className="gate__actions">
          {onLock && <button type="button" className="btn btn--ghost" onClick={onLock}>Lock</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Back to game</button>
        </div>
      </div>
    </div>
  );
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const min = Math.ceil(seconds / 60);
  return min < 90 ? `${min} minutes` : `${Math.ceil(min / 60)} hours`;
}

function Unlock({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, setTick] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Count down while locked out.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);
  const waitLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password || waitLeft > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await editApi.unlock(password);
      setPassword("");
      onUnlocked();
    } catch (err) {
      const a = err as ApiError;
      if (a.status === 429 && typeof a.data.retryAfter === "number") {
        setLockedUntil(Date.now() + a.data.retryAfter * 1000);
        setMessage(null);
      } else if (a.status === 401) {
        const left = typeof a.data.remaining === "number" ? a.data.remaining : null;
        setMessage(`Wrong password.${left !== null ? ` ${left} ${left === 1 ? "try" : "tries"} left before a lockout.` : ""}`);
      } else setMessage(a.message);
      setPassword("");
      setTimeout(() => input.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerCard title="Owner login" onClose={onClose}>
      <form className="owner-unlock" onSubmit={(e) => void submit(e)}>
        <p className="gate__text">Enter the edit password to change topics, questions, images and the site's text and links.</p>
        <label className="ed-field__label" htmlFor="owner-password">Password</label>
        <input
          ref={input}
          id="owner-password"
          className="ed-input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          disabled={waitLeft > 0}
          onChange={(e) => setPassword(e.target.value)}
        />
        {waitLeft > 0 ? (
          <p className="ed-status ed-status--error" role="alert">Too many wrong passwords. Try again in {formatWait(waitLeft)}.</p>
        ) : (
          message && <p className="ed-status ed-status--error" role="alert">{message}</p>
        )}
        <button type="submit" className="btn btn--primary btn--wide" disabled={busy || !password || waitLeft > 0}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </OwnerCard>
  );
}

function Workspace({ session, onClose, onLocked }: { session: SessionInfo; onClose: () => void; onLocked: () => void }) {
  const store = useMemo(() => new SiteStore(editApi, { repo: session.repo, branch: session.branch }), [session.repo, session.branch]);
  const [tab, setTab] = useState<Tab>("topics");
  const [loaded, setLoaded] = useState<LoadResult>({ packs: [], failures: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoaded(await loadAllPacks(store));
      setLoadError(null);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) return onLocked(); // session expired
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [store, onLocked]);

  useEffect(() => void reload(), [reload]);

  // Warn before the tab closes with unsaved work (topics or site settings).
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  /** Ask before dropping unsaved work. */
  const guard = (text: string, run: () => void) => (dirty ? setConfirm({ text, run }) : run());

  const lock = () =>
    guard("Lock and drop your unsaved changes?", () => {
      void editApi.lock().finally(onLocked);
    });

  return (
    <div className="owner">
      <nav className="owner-bar" aria-label="Owner mode">
        <span className="owner-bar__name">Owner mode</span>
        <div className="owner-bar__tabs" role="tablist">
          {(["topics", "site"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`owner-bar__tab${tab === t ? " owner-bar__tab--on" : ""}`}
              onClick={() => t !== tab && guard("Switch and drop your unsaved changes?", () => { setDirty(false); setTab(t); })}
            >
              {t === "topics" ? "Topics & questions" : "Site text & links"}
            </button>
          ))}
        </div>
        <div className="owner-bar__end">
          <span className="owner-bar__repo muted" title="Saves are commits to this branch">{session.branch}</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={lock}>Lock</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => guard("Leave and drop your unsaved changes?", onClose)}>Back to game</button>
        </div>
      </nav>
      {tab === "topics" ? (
        loading ? (
          <div className="owner-page"><p className="muted" aria-busy="true">Loading topics from GitHub…</p></div>
        ) : (
          <Editor
            store={store}
            variant="site"
            saved={loaded}
            loadError={loadError}
            presets={[]}
            reload={reload}
            onClose={onClose}
            onDirtyChange={setDirty}
          />
        )
      ) : (
        <SiteSettings store={store} onDirtyChange={setDirty} />
      )}
      {confirm && (
        <Modal
          title="Unsaved changes"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" data-autofocus onClick={() => setConfirm(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  const run = confirm.run;
                  setConfirm(null);
                  setDirty(false);
                  run();
                }}
              >
                Discard changes
              </button>
            </>
          }
        >
          <p>{confirm.text}</p>
        </Modal>
      )}
    </div>
  );
}
