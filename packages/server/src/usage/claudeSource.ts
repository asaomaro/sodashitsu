import { lstat, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { isNotFound, lstatRegular, realRootsOf, underRoot } from "../agent/safeFile.js";
import { SUBAGENT_FILES_MAX } from "./claudeScan.js";

/**
 * Claude Code の会話の記録のファイルの場所を、**サーバが決める**（20261010-agent-usage の AC2）。受け取るのは会話の id（`pane.agentSession`。フックの報告から
 * `SessionService` が受け入れたもの）と、フックの報告の `transcript_path`（**信用しない**）だけ。
 *
 * 決まり: 実体のパスが記録の根（`~/.claude/projects`・`CLAUDE_CONFIG_DIR` の `projects`）の**直下の 1 段（プロジェクトのフォルダ）の中**で、名前が
 * `<会話の id>.jsonl`。リンクでない通常のファイルで、リンクが 1 つ。フックの報告の場所が合わなければ、根の下を会話の id の名前で探す（上限つき）。
 */

/** 会話の id の形（英数・`_`・`-`。フォルダ・ファイルの名前に使うので、これだけを通す）。 */
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const PROJECT_DIRS_MAX = 5000;

export function claudeRoots(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string[] {
  const roots = [join(home, ".claude", "projects")];
  const cfg = env["CLAUDE_CONFIG_DIR"];
  if (typeof cfg === "string" && cfg !== "" && isAbsolute(cfg)) roots.push(join(cfg, "projects"));
  return roots;
}

/** 候補の場所（フックの報告）を確かめる。合えば実体のファイルのパス。 */
async function verifyCandidate(candidate: string, sessionId: string, realRoots: readonly string[]): Promise<string | null> {
  if (!isAbsolute(candidate) || candidate.includes("\0") || basename(candidate) !== `${sessionId}.jsonl`) return null;
  let realDir: string;
  try {
    realDir = await realpath(dirname(candidate));
  } catch {
    return null;
  }
  const root = underRoot(realDir, realRoots);
  if (root === null) return null;
  if (realDir.slice(root.length + 1).split(sep).length !== 1) return null; // `<根>/<プロジェクト>` の 1 段だけ
  const file = join(realDir, `${sessionId}.jsonl`);
  return (await lstatRegular(file)) === "ok" ? file : null;
}

/**
 * 根の下を、会話の id の名前で探す（上限つき）。**同じ id が複数のプロジェクトにあるとき（cwd をまたいで再開すると複製ができる）は、更新の時刻が新しいほう**
 * （20261010-agent-usage の R2）。上限（`PROJECT_DIRS_MAX`）を超えるフォルダがあると、残りは探さない（R6。記録の無い、と同じ扱い）。
 */
async function searchRoots(sessionId: string, realRoots: readonly string[]): Promise<string | null> {
  let budget = PROJECT_DIRS_MAX;
  let best: { file: string; mtime: number } | null = null;
  for (const root of realRoots) {
    let names: string[];
    try {
      names = await readdir(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (budget-- <= 0) return best?.file ?? null;
      if (name.includes(sep) || name === "." || name === "..") continue;
      const file = join(root, name, `${sessionId}.jsonl`);
      let st;
      try {
        st = await lstat(file);
      } catch {
        continue;
      }
      if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) continue;
      // 実体のフォルダが根の直下であることを、もう一度（リンクのフォルダを通らない）。
      const dir = await realpath(dirname(file)).catch(() => null);
      if (dir === null || underRoot(dir, [root]) === null || dir.slice(root.length + 1).split(sep).length !== 1) continue;
      if (best === null || st.mtimeMs > best.mtime) best = { file: join(dir, `${sessionId}.jsonl`), mtime: st.mtimeMs };
    }
  }
  return best?.file ?? null;
}

export interface ClaudeFiles {
  main: string;
  /** サブエージェントの記録（`<id>/subagents/agent-*.jsonl`）。上限で切ったら `truncated`。 */
  subagents: string[];
  truncated: boolean;
}

/** 主の記録の場所。見つからない・形が合わないなら null。 */
export async function locateClaudeMain(sessionId: string, candidate: string | undefined, roots: readonly string[]): Promise<string | null> {
  if (!SESSION_ID_RE.test(sessionId)) return null;
  const realRoots = await realRootsOf(roots);
  if (realRoots.length === 0) return null;
  if (candidate !== undefined) {
    const ok = await verifyCandidate(candidate, sessionId, realRoots);
    if (ok !== null) return ok;
  }
  return searchRoots(sessionId, realRoots);
}

/** サブエージェントの記録（主の記録の隣の `<id>/subagents/`）。フォルダの実体が、組み立てた場所と一致するときだけ。 */
export async function locateClaudeSubagents(mainFile: string, sessionId: string, roots: readonly string[]): Promise<{ files: string[]; truncated: boolean }> {
  const dir = join(dirname(mainFile), sessionId, "subagents");
  const realRoots = await realRootsOf(roots);
  let realDir: string;
  try {
    realDir = await realpath(dir);
  } catch (err) {
    if (isNotFound(err)) return { files: [], truncated: false };
    return { files: [], truncated: false };
  }
  if (realDir !== dir || underRoot(realDir, realRoots) === null) return { files: [], truncated: false };
  let names: string[];
  try {
    names = await readdir(realDir);
  } catch {
    return { files: [], truncated: false };
  }
  const files: string[] = [];
  let truncated = false;
  for (const n of names.sort()) {
    if (!/^agent-[A-Za-z0-9_-]{1,128}\.jsonl$/.test(n)) continue;
    if (files.length >= SUBAGENT_FILES_MAX) {
      truncated = true;
      break;
    }
    const f = join(realDir, n);
    if ((await lstatRegular(f)) === "ok") files.push(f);
  }
  return { files, truncated };
}
