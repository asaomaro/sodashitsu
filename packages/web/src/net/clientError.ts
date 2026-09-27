import type { ErrorCode } from "@wtm/protocol";

/**
 * サーバの `client.error`（要求 id の無いフレームへの通知。design「WebSocket の通信」のイベント表）を、利用者に見せる
 * 日本語の文言にする（D107。統合 review ラウンド1 で発見：以前はサーバの英語の固定文 `message`——「malformed frame」
 * 等——をそのまま toast に出していた）。`message` は使わず `code`（design「エラーコード」）で引く。知らない code は
 * 汎用の文言にその code を添える（サーバが先に新しい code を足しても、何が起きたかの手がかりを残す）。
 *
 * 今のサーバが `client.error` で送るのは `invalid_params` だけ（`WsGateway.registerInvalidFrame`：解析できない JSON・
 * id／method の無い JSON・不正なバイナリ・INPUT 以外のバイナリ・1MB を超える INPUT）。この Web が送るフレームで実際に
 * 起きうるのは、1 回で 1MB を超える貼り付け（その INPUT はサーバが捨てる。design「大きすぎる入力（1MB 超）」）。
 */
const MESSAGES: Record<ErrorCode, string> = {
  invalid_params: "送った内容をサーバが受け付けませんでした（1 回の貼り付けが 1MB を超えた等）。その分は端末に届いていません。",
  unauthorized: "ログインが無効になったため、サーバが受け付けませんでした。",
  not_found: "対象が見つかりませんでした（既に閉じられた pane・tab 等）。",
  spawn_failed: "シェルを起動できませんでした。",
  internal: "サーバの内部でエラーが起きました。サーバのログを確かめてください。",
  // worktree（20260920-git-worktree-actions）。git の生の診断は見せず、種類ごとにここで日本語にする。
  not_a_git_repository: "この workspace は Git リポジトリではありません。",
  worktree_branch_in_use: "そのブランチは既に別の場所でチェックアウトされています。別の名前にしてください。",
  worktree_path_exists: "作成先のパスが既にあります。別のブランチ名にしてください。",
  worktree_no_commits: "このリポジトリにはまだコミットが 1 つもないため、worktree を作れません。",
  worktree_invalid_branch: "そのブランチ名は Git が受け付けません（空白などは使えません）。別の名前にしてください。",
  // **「作成」と言い切らない**——一覧の取得の失敗にも同じコードを使うので（`WorktreeService.list`）。
  worktree_failed: "worktree の操作に失敗しました。サーバのログを確かめてください。",
  // worktree の削除（20260924-worktree-remove）。`worktree_dirty` は通常 `sendWorktreeRemove`
  // （`ActionDispatcher.ts`）が catch して `--force` の確認へ進むため、ここへは通常来ない——
  // 防御的に登録しておく（想定外の経路で表に出た場合の保険）。
  worktree_dirty: "この worktree には未コミットの変更が残っています。",
  worktree_not_a_worktree: "この worktree は既に見つかりません。一覧を開き直しました。",
  worktree_is_main: "これはメインの作業ツリーのため削除できません。",
  // ロック済み worktree の削除（20260925-worktree-remove-locked）。`worktree_dirty` と同じ理由で
  // 防御的に登録（通常は `sendWorktreeRemove` が catch して `--force` の確認へ進む）。
  worktree_locked: "この worktree はロックされています。",
  // エージェントへの入力（20260926-agent-prompt-send-keys）。今は外部操作（wtmctl）だけが送る方式で、ブラウザには
  // 通常来ない——表が全 code の網羅を要求するので登録しておく（想定外の経路で表に出た場合の保険）。
  agent_not_found: "対象の pane・エージェントが見つかりませんでした（既に閉じられた・終了した等）。",
  agent_blocked: "エージェントが承認・質問の入力待ちのため、送りませんでした。",
  empty_agent_prompt: "送る内容が空です。",
  invalid_key: "知らないキーの名前が含まれていたため、何も送りませんでした。",
  agent_prompt_failed: "エージェントへの送信に失敗しました（端末が閉じた等）。",
  // エージェントの名前（20260926-agent-start-rename）。今は wtmctl agent rename だけが送る方式で、ブラウザには通常来ない。
  invalid_agent_name: "エージェントの名前は英小文字で始まり、英小文字・数字・-・_ の 1〜32 文字にしてください。",
  agent_name_taken: "その名前は別のエージェントが使っています。",
  // pane への直結（20260926-pane-direct-connect）。今は wtmctl pane attach だけが送る方式で、ブラウザには通常来ない——
  // 表が全 code の網羅を要求するので登録しておく。
  pane_attached: "この pane には既に別の端末が直結しています。",
  not_attached: "この pane に直結していません。",
  // エージェントの起動（20260926-agent-start）。今は wtmctl agent start だけが送る方式で、ブラウザには通常来ない。
  unsupported_agent_kind: "その種類のエージェントは起動できません。",
  invalid_agent_argument: "エージェントへの引数に制御文字が含まれるか、長すぎるため、何も送りませんでした。",
  invalid_agent_timeout: "起動を待つ時間が受け付ける範囲の外です。",
  agent_pane_not_found: "起動先の pane が見つかりませんでした。",
  agent_pane_busy: "起動先の pane でシェル以外のものが動いているため、何も送りませんでした。",
  unsupported_agent_shell: "起動先の pane のシェルには、まだ対応していません。",
  agent_start_input_failed: "エージェントの起動のための入力を送れませんでした（端末が閉じた等）。",
  // 独自コマンド（20260927-custom-command-keys）。
  command_not_found: "その独自コマンドはサーバの一覧にありません。設定を読み直してください（キー一覧の「設定を読み直す」）。",
  command_failed: "独自コマンドを起動できませんでした。サーバのログを確かめてください。",
  command_popup_open: "popup がすでに開いています。先に閉じてください。",
  command_busy: "裏で走っている独自コマンドが多すぎます。終わるのを待ってください。",
};

/**
 * `Connection` が投げるエラーから code を取り出す。**`code` プロパティを最優先で読む**
 * （20260925-connection-error-code。`Connection.ts` が `new Error(`<code>: <message>`)` の
 * `Error` に `code` をプロパティとしても付与している）。`.code` を持たない値（クライアント側
 * 合成のエラー等）は、従来どおり `<code>: <message>` の書式を正規表現でパースする
 * フォールバックに落ちる（decisions.md D4）。読めなければ null——呼ぶ側は汎用の文言に落とす。
 */
export function errorCodeOf(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /^([a-z_]+): /.exec(message)?.[1] ?? null;
}

export function clientErrorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code as ErrorCode] : `サーバでエラーが起きました（${code}）。`;
}
