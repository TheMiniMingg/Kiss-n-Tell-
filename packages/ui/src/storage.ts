/** localStorage wrapper that never throws (private mode, blocked storage, quota). */
const PREFIX = "knt:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the game still works, it just won't remember */
  }
}

export interface BestScore {
  score: number;
  won: boolean;
  at: number;
}

export const storage = {
  isAdultConfirmed: () => read<boolean>("adult-confirmed", false),
  confirmAdult: () => write("adult-confirmed", true),
  getSeen: (topicId: string) => {
    const v = read<unknown>(`seen:${topicId}`, []);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  },
  setSeen: (topicId: string, ids: string[]) => write(`seen:${topicId}`, ids),
  getBest: (topicId: string) => read<BestScore | null>(`best:${topicId}`, null),
  /** Saves and returns true when this is a new best. */
  recordScore: (topicId: string, score: number, won: boolean): boolean => {
    const prev = read<BestScore | null>(`best:${topicId}`, null);
    if (prev && prev.score >= score) return false;
    write(`best:${topicId}`, { score, won, at: Date.now() } satisfies BestScore);
    return true;
  },
};
