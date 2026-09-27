/** design.md「WebSocket の通信」のエラーコード。 */
export type ErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_params"
  | "spawn_failed"
  | "internal"
  // worktree（20260920-git-worktree-actions）。**種類ごとに分けるのは、web が code から日本語を引くため**
  // （D107：サーバの message は利用者に見せない）。git の生の診断はサーバのログにだけ残す。
  | "not_a_git_repository"
  | "worktree_branch_in_use"
  | "worktree_path_exists"
  | "worktree_no_commits"
  | "worktree_invalid_branch"
  | "worktree_failed"
  // worktree の削除（20260924-worktree-remove）。
  | "worktree_dirty"
  | "worktree_not_a_worktree"
  | "worktree_is_main"
  // ロック済み worktree の削除（20260925-worktree-remove-locked）。`--force` を1回渡しても
  // 解決しない（git は `-f -f` を要求する）ため、`worktree_dirty` とは別の種類として分ける。
  | "worktree_locked"
  // エージェントへの入力（20260926-agent-prompt-send-keys）。名前は herdr の code に揃える。
  | "agent_not_found"
  | "agent_blocked"
  | "empty_agent_prompt"
  | "invalid_key"
  | "agent_prompt_failed"
  // エージェントの名前（20260926-agent-start-rename）。herdr と同じ code。
  | "invalid_agent_name"
  | "agent_name_taken"
  // エージェントの起動（20260926-agent-start）。unsupported_agent_shell 以外は herdr と同じ code。
  | "unsupported_agent_kind"
  | "invalid_agent_argument"
  | "invalid_agent_timeout"
  | "agent_pane_not_found"
  | "agent_pane_busy"
  | "unsupported_agent_shell"
  | "agent_start_input_failed"
  // pane への直結（20260926-pane-direct-connect）。名前は herdr の理由文（already has an attached client）に対応させる。
  | "pane_attached"
  | "not_attached"
  // 独自コマンド（20260927-custom-command-keys）。command_not_found・command_failed は herdr と同じ code。
  | "command_not_found"
  | "command_failed"
  | "command_popup_open"
  | "command_busy";

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export class RpcError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RpcError";
  }
  toProtocolError(): ProtocolError {
    return { code: this.code, message: this.message };
  }
}
