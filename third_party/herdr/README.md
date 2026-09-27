# herdr の判定ルール（取り込み）

このディレクトリの `agent-detection/*.toml`（23 ファイル）は、herdr（https://github.com/herdrdev/herdr）の
エージェント状態判定ルールを**無改変で**取り込んだものです。

- 取得元コミット: `da6bcd5969779bfe0396bcf89a8025d4375d611e`（2026-09-18 時点の `master`。herdr 0.9.1 相当）
- 取得元パス: `distribution/agent-detection/*.toml`
- 取得日: 2026-09-18
- ライセンス: Apache License 2.0（`LICENSE` を同梱。herdr は 0.8.0 で AGPL-3.0-or-later から
  Apache-2.0 に変更している。詳細は `.aidev/works/20260918-web-terminal-multiplexer/research.md` F12.1）
- 変更点: なし（無改変で取り込み）。本製品はこれらのファイルをそのまま読み込んで判定ルールとして使う
  （`@sodashitsu/server` の `agent/ManifestStore`）。ルールの記法は各ファイルの内容を参照。
- 帰属表示: ルートの `NOTICE` を参照。

判定ルールを更新するときは、herdr の該当コミットのハッシュをこの README に書き足すこと。

## 判定の実行部とテストの一部を TypeScript へ移植（02-agent-detection）

上記の toml（データ）に加えて、herdr の判定エンジン・前面プロセス識別・状態遷移のヒステリシスの
**実装（Rust）** の一部を TypeScript へ移植した（同じ `da6bcd5969779bfe0396bcf89a8025d4375d611e`
コミット）。こちらは無改変ではなく、TypeScript として書き直している（Apache-2.0 4(b) の
「変更したファイルである旨の告知」に当たる。各ファイルの冒頭コメントに移植元の herdr 側のパスを記す）。

| 本製品のファイル | 移植元（herdr, `da6bcd5`） |
|---|---|
| `packages/server/src/agent/ManifestStore.ts` | `src/detect/manifest.rs`（読み込み・検証・コンパイル） |
| `packages/server/src/agent/ManifestEngine.ts` | `src/detect/manifest.rs`（`region()`・`compiled_gate_matches()`・`evaluate_loaded_manifest()`） |
| `packages/server/src/agent/ProcessMatcher.ts` | `src/detect/mod.rs`（`normalized_process_name`・`identify_agent_in_job` 等） |
| `packages/server/src/agent/agents.ts` | `src/detect/mod.rs`（`lookup_agent`・`agent_label`） |
| `packages/server/src/agent/AgentTracker.ts` | `src/pane/agent_detection.rs`（起動猶予・working→idle の保留） |
| `packages/server/src/agent/regexConvert.ts` | （herdr のコードの移植ではなく、herdr の判定ルールが使う Rust `regex` 構文を実測して起こした変換規則） |
| `packages/server/src/git/worktree.ts` | `src/worktree.rs`（`generated_branch_slug`・`parse_worktree_list_porcelain`） |
| `packages/protocol/src/worktreePath.ts` | `src/worktree.rs`（`branch_to_path_slug`・`default_checkout_path`） |
| `packages/tui/src/render/Screen.ts` | `src/protocol/render_ansi.rs`（差分描画の手順：同期出力・全角の右隣の無効化・CUP の省略・最後のカーソル。20260927-cli-mode） |
| `packages/tui/src/input/decode.ts` | `src/raw_input.rs`（方針に倣った：ESC 単独の時間切れ・マウス中の長い待ち・ブラケットペーストの判定。20260927-cli-mode） |
| `packages/tui/src/input/encode.ts` | `src/input/encode.rs`（DECCKM に合わせたカーソルキーの付け替え。20260927-cli-mode） |

テストの一部（`ManifestEngine.test.ts`・`ProcessMatcher.test.ts`・`AgentTracker.test.ts`・
`packages/server/src/git/worktree.test.ts`・`packages/protocol/src/worktreePath.test.ts`）にも、
herdr 側のテストケース（fixture・期待値）を本製品の型に書き換えて移植したものを含む。
各ファイルの冒頭コメントと、該当 `describe` の見出しに移植元の herdr 側の関数名を記す。

判断の経緯は `.aidev/works/20260918-web-terminal-multiplexer/decisions.md` の D5・D34・D45〜D50。
worktree の移植（作成先とブランチ名の規則）は `.aidev/works/20260920-git-worktree-actions/`——
**herdr と同じ場所に同じ名前で作られる**ことを狙って、規則をそのまま移した。
