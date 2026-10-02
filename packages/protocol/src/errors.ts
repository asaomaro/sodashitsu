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
  | "command_busy"
  // 独自トークンの報告（20260927-sidebar-row-tokens）。herdr と同じ code。
  | "invalid_metadata_source"
  | "invalid_metadata_ttl"
  | "invalid_metadata_token"
  | "metadata_token_limit"
  | "metadata_sequence_source_limit"
  // クリップボードの画像の貼り付け（20260927-clipboard-image-paste。herdr には code が無い——本製品の追加）。
  | "invalid_image"
  | "image_too_large"
  | "image_upload_busy"
  | "image_upload_rate_limited"
  | "image_upload_expired"
  | "image_store_failed"
  // 端末のファイルのリンクとドロップ（`file.ts`）。
  | "file_not_found"
  | "file_unreadable"
  | "file_too_large"
  | "file_open_unavailable"
  | "file_open_refused"
  | "file_open_failed"
  | "invalid_file"
  | "file_upload_busy"
  | "file_upload_expired"
  | "file_store_failed"
  // 入力の書き込み待ちの上限（20260927-server-size-input-limits）。pane のプログラムが入力を読まず、サーバに溜まった入力が上限に達した。
  // herdr は "pty input queue is full"（`pane_send_failed`）。
  | "input_queue_full"
  // サーバの停止（`server.stop`。20260927-cli-mode）。design の表に無い本製品の追加で、制御の socket の止める指示（`soda session stop`）の返事の
  // `reason`（`busy`・`unsupported`。`handoff/HandoffSocket.ts` の `StopReply`）をそのまま RPC の code にしたもの:
  // - `server_busy`: 更新の引き継ぎ（`soda handoff`）の最中なので止めない（引き継ぎと停止を並んで走らせない）。少し待てば通る。
  // - `server_stop_unsupported`: 止める手順を登録していない組み立て（smoke・テスト等。`ComposedServer.onStopRequest` を呼んでいない）。`soda serve` では起きない。
  | "server_busy"
  | "server_stop_unsupported"
  // 連携のグラフ（20260927-agent-graph）。`graph.update` の `baseRev` が今の rev と違う（他のブラウザ・sodactl が先に変えた）。最新を取り直して作り直す。
  | "rev_conflict";

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
