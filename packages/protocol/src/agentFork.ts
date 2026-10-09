/**
 * エージェントの fork（会話を引き継いだエージェントを、別の pane・別の worktree に起こす。20261009-agent-fork）の共有の型。
 * `agent.fork` が受け取るのは「どの pane のエージェントを」「同じフォルダか、新しい worktree か」「ブランチ名」「最初の知らせを送るか」だけ。
 * **会話の id・起動するコマンドの文字列は受け取らない**（会話の id はサーバが pane の `agentSession` から引き、起動は固定の表から）。
 */

/** 会話の id（Claude Code の UUID）の形。fork に使えるのはこの形だけ（名前・パス・コマンド行に化ける文字を通さない。A7）。 */
export const FORK_SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isForkSessionId(id: string): boolean {
  return FORK_SESSION_ID_RE.test(id);
}

/** fork できない理由の種類。`agent.fork_preview` の `reason` と、`agent.fork` の `fork_unavailable` のメッセージの先頭の語。 */
export type ForkUnavailableReason =
  /** pane が無い。 */
  | "pane_not_found"
  /** その pane にエージェントが居ない。 */
  | "no_agent"
  /** Claude Code ではない（今は Claude Code だけ）。 */
  | "not_claude"
  /** 会話の id が分からない（フックを入れていない・フックを入れる前に起動した）。 */
  | "no_session_id"
  /** 会話の id が UUID の形でない。 */
  | "bad_session_id"
  /** 前面がシェルだけの pane を作れない／シェルが POSIX 系でない（fish・pwsh など）／Windows のサーバ。 */
  | "unsupported_shell";

/** 最初の知らせの状態。`off`＝送らない選択、`skipped`＝送れない（理由つき）、`pending`＝手が空いたら送る予定、`sent`、`timed_out`＝待ちが切れた。 */
export type ForkNoteStatus = "off" | "skipped" | "pending" | "sent" | "timed_out";

/** 進み具合の段階（`agent.fork_progress`）。 */
export type ForkStage =
  | "pane_created" // 新しい pane（と、worktree のときは worktree・workspace）ができた
  | "launched" // 起動のコマンドを打ち込んだ
  | "detected" // 新しい pane でエージェントが検出された
  | "ready" // エージェントの手が空いた
  | "note" // 最初の知らせの状態が変わった（`noteStatus`）
  | "done" // 終わり
  | "failed"; // 失敗（`code`・`message`・`created`）

export interface ForkCreated {
  /** 作った worktree のパス（worktree のとき）。失敗しても残る。 */
  worktreePath?: string;
  workspaceId?: string;
  paneId?: string;
}
