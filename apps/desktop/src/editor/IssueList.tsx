import type { Issue } from "@kiss-n-tell/engine";

export type EditorTab = "topic" | "questions" | "images" | "check";

/** Which tab (and question) an issue belongs to, from its "where". */
export function issueTarget(issue: Issue): { tab: EditorTab; questionId?: string } {
  const q = /\/ question (.+)$/.exec(issue.where);
  if (q) return { tab: "questions", questionId: q[1] };
  if (/\/ images$/.test(issue.where) || /^character$/.test(issue.where)) return { tab: "images" };
  if (/\/ character /.test(issue.where) || issue.where.startsWith("character/")) return { tab: "topic" };
  if (issue.where.startsWith("questions.csv")) return { tab: "questions" };
  if (/questions/.test(issue.message) || /same prompt|Duplicate question id/.test(issue.message)) return { tab: "questions" };
  return { tab: "topic" };
}

export function IssueList({ issues, onGo, empty }: { issues: Issue[]; onGo?: (issue: Issue) => void; empty?: string }) {
  if (issues.length === 0) return empty ? <p className="ed-ok">{empty}</p> : null;
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return (
    <ul className="ed-issues">
      {sorted.map((i, n) => (
        <li key={n} className={`ed-issue ed-issue--${i.level}`}>
          <span className="ed-issue__level">{i.level === "error" ? "Error" : "Warning"}</span>
          <span className="ed-issue__msg">
            {i.message}
            <span className="ed-issue__where">{i.where}</span>
          </span>
          {onGo && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onGo(i)}>
              Show
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function countIssues(issues: readonly Issue[]) {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) i.level === "error" ? errors++ : warnings++;
  return { errors, warnings };
}
