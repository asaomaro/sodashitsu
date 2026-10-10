import { isForkSessionId, isValidAgentName, type AgentInfo, type ForkUnavailableReason, type Pane } from "@sodashitsu/protocol";
import { hasControlChar } from "./agentStart.js";

/**
 * エージェントの fork（20261009-agent-fork）の、状態を持たない部品。fork できるかの確かめ・名前の決め方・最初の知らせの文面。
 */

/** fork できるときの、元の pane の情報。`sessionId` は UUID の形と確かめたものだけ（A7）。 */
export type Forkable =
  { ok: true; pane: Pane; agent: AgentInfo; sessionId: string } | { ok: false; reason: ForkUnavailableReason };

/**
 * 元の pane のエージェントを fork できるか。Claude Code で、フックが報告した会話の id（`agentSession`）が UUID の形のときだけ。
 * 会話の id は**この pane の記録だけ**から引く（プロセスの引数・更新の時刻から推さない。F3）。
 */
export function checkForkable(pane: Pane | undefined): Forkable {
  if (!pane) return { ok: false, reason: "pane_not_found" };
  const agent = pane.agent;
  if (!agent) return { ok: false, reason: "no_agent" };
  if (agent.kind !== "claude") return { ok: false, reason: "not_claude" };
  const ref = pane.agentSession;
  if (!ref || ref.kind !== "claude") return { ok: false, reason: "no_session_id" };
  if (!isForkSessionId(ref.sessionId)) return { ok: false, reason: "bad_session_id" };
  return { ok: true, pane, agent, sessionId: ref.sessionId };
}

/** `--resume <id> --fork-session`。引数の引用は `buildStartLine`（固定の表の実行ファイルと、単一引用符で包む既存の関数）に任せる。 */
export function forkArgs(sessionId: string): string[] {
  return ["--resume", sessionId, "--fork-session"];
}

/** 新しいエージェントの名前の候補（`<元の名前>-fork`、`-fork-2`、…）。元に名前が無ければ `fork-<pane id の先頭>`。書式（32 文字まで）に収める。 */
export function forkNameCandidates(sourceName: string | undefined, sourcePaneId: string): string[] {
  const base = sourceName && isValidAgentName(sourceName) ? sourceName : `fork-${sourcePaneId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase() || "pane"}`;
  const make = (suffix: string): string => {
    const head = base.slice(0, Math.max(1, 32 - suffix.length));
    return `${head}${suffix}`;
  };
  const out: string[] = [];
  const first = sourceName && isValidAgentName(sourceName) ? "-fork" : "";
  out.push(make(first));
  for (let i = 2; i <= 99; i++) out.push(make(`${first || "-f"}-${i}`));
  return out.filter(isValidAgentName);
}

/**
 * 文面に埋めるパスが、そのまま打ち込んでよい形か（制御文字・行の区切り〔U+2028/2029〕・長さ）。さらに、文面の囲み（バッククォート）を崩すもの、
 * 見た目だけ入れ替える文字（双方向の制御・ゼロ幅）を断る（R6）。
 */
export const NOTE_PATH_MAX = 1000;
const NOTE_PATH_VISUAL_TRICKS = /[`\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
export function isSafeNotePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= NOTE_PATH_MAX &&
    !hasControlChar(path) &&
    !NOTE_PATH_VISUAL_TRICKS.test(path) &&
    ![...path].some((c) => c.codePointAt(0) === 0x2028 || c.codePointAt(0) === 0x2029)
  );
}

/**
 * 最初の知らせの文面（新しい worktree のとき）。会話の中の絶対のパスは元のフォルダを指したままなので、元のフォルダを書き換えないように伝える。
 * パスはバッククォートで囲み、指示とパスを区別させる。
 */
export function forkNoteText(newDir: string, sourceDir: string): string {
  return `このセッションは、fork されました。作業フォルダは \`${newDir}\` です。元のフォルダ \`${sourceDir}\` のファイルは、変更しないでください（これまでの会話に出てくる絶対のパスは、元のフォルダを指しています。作業フォルダの同じ場所のファイルを使ってください）。`;
}
