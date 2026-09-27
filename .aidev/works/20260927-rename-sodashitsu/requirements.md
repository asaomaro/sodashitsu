# 要件: 製品名を Sodashitsu（操舵室）に改める（`wtm`→`soda`・`wtmctl`→`sodactl`）と、一度きりの移行スクリプト

## 背景 / 課題

製品は `web-tn-multiplexer`（略称・コマンド名 `wtm`、CLI `wtmctl`）という仮の名前のまま育ってきた。利用者は製品名を
**Sodashitsu（操舵室）** に改め、サーバのコマンドを `soda`、CLI を `sodactl` にすると決めた（decisions D1）。
名前はコマンド・パッケージ名・環境変数・cookie・localStorage・CSS 変数・状態ディレクトリ・ロックのファイル・CLI のキャッシュ・worktree の既定の置き場・
エージェント連携の hook のファイル・docs に散らばっている（`git grep -i wtm` で `.aidev/works` を除き 421 ファイル・約 3000 箇所）。

利用者は本人ひとりなので、アプリに後方互換は置かない。その代わり、手元にある古い名前の状態（状態ディレクトリ・CLI のキャッシュ・worktree・
エージェントの hook 設定）を新しい名前へ一度だけ移すスクリプトが要る。移し方を誤ると、動いているサーバの状態を壊す・既にある新しい状態を上書きする・
worktree の git のリンクが切れる・エージェントの hook が黙って効かなくなる（hook のスクリプトは古い環境変数 `WTM_PANE_ID` を読むので、名前を変えた後の
サーバが渡す `SODA_PANE_ID` では何もしない）。

## 目的 / ゴール

- 利用者が目にする・打つ名前（コマンド・CLI・環境変数・ヘルプ・エラーの接頭辞・ページのタイトル・docs）が、すべて Sodashitsu / `soda` / `sodactl` に揃っている状態。
- コードとリポジトリの中に古い名前が残っていない状態（例外は開発の記録 `.aidev/works/**` と、移行スクリプト・そのテスト・移行の案内の中の意図した言及、
  `pnpm-lock.yaml` の integrity の値に偶然含まれる文字の並びだけ。AC5）。
- 利用者が移行スクリプトを一度実行し、ブラウザで一度ログインし直すだけで、サーバ側と手元のファイルに持つ状態——今までのレイアウト・認証（token）・
  名前付き session・カスタムコマンド・マシン・CLI のログイン・worktree・エージェント連携——がそのまま使える状態。
  ブラウザの localStorage に持つ好み（配色・キー割り当て・サイドバーの行・通知の入切・案内済みの印・既読の印・ヒントの表示済み）は既定に戻る。
  戻したい利用者は、docs の devtools のスニペットで古いキーから新しいキーへ写せる（アプリは写さない）。タブごとの表示位置（sessionStorage）は移さない。
- 移行スクリプトが、古いサーバが動いているとき・移動先が既にあるときに何も変えずに断り、2 回目の実行では何も変えずに「移すものが無い」と報告する状態。

## ユーザーストーリー

- US1: 利用者として、コマンド・CLI・画面・docs で新しい名前だけを見たい。なぜなら、名前が混ざると打つコマンドと読む説明が食い違うから。（受け入れ: AC1, AC2, AC3, AC4, AC5）
- US2: 利用者として、スクリプトを一度実行するだけで今までの状態を新しい名前の置き場へ移したい。なぜなら、手で移すと worktree の git のリンクや
  エージェントの hook の書き換えを取りこぼすから。（受け入れ: AC6, AC7, AC8, AC9, AC10）
- US3: 利用者として、移行スクリプトが自分の状態を壊さないと信じたい。なぜなら、動いているサーバの状態や既にある新しい状態を上書きされると取り戻せないから。
  （受け入れ: AC11, AC12, AC13, AC14, AC18）
- US4: 利用者として、移行の手順（スクリプト・ログインし直し・任意の localStorage の移し替え）を日本語の docs で知りたい。なぜなら、アプリは古い名前を
  読まないので、何をすればよいかを一か所で確かめたいから。（受け入れ: AC15）
- US5: 開発者（AI エージェントを含む）として、ビルド・型検査・テスト・起動確認が新しい名前のまま通ってほしい。なぜなら、改名で壊れた経路を着地前に見つけたいから。（受け入れ: AC16, AC17）

## スコープ

### 対象

- パッケージ名 `@wtm/*`→`@sodashitsu/*`（workspace のルートの名前も）、bin `wtm`→`soda`・`wtmctl`→`sodactl`、`pnpm-lock.yaml` の作り直し。
- 環境変数 `WTM_*`→`SODA_*`・`WTMCTL_*`→`SODACTL_*`（pane に渡すもの・CLI が読むもの・smoke と e2e が読むものすべて）。
- cookie 名 `wtm_session`/`wtm_session_<名前>`→`soda_session`/`soda_session_<名前>`、localStorage のキー `wtm.*`→`soda.*`、CSS 変数 `--wtm-*`→`--soda-*`、
  window に置くテスト用のグローバル（`__wtm…`）。
- 状態ディレクトリの名前 `web-tn-multiplexer`→`sodashitsu`、ロック `wtm.lock`→`soda.lock`、クリップボード画像のファイル名 `wtm-image-*`→`soda-image-*`、
  一時ディレクトリ・名前付きパイプの接頭辞、`~/.wtmctl`→`~/.sodactl`、worktree の既定の置き場 `~/.wtm/worktrees`→`~/.sodashitsu/worktrees`。
- エージェント連携の hook のファイル名 `wtm-agent-report*`→`soda-agent-report*`、リモートのマシンで動かすコマンド `wtm bridge`→`soda bridge`（と接続の目印）。
- CLI の出力の接頭辞（`wtm:`・`wtmctl:`）・ヘルプ・使い方、ページのタイトル、コード中の識別子（例: `WtmClient`）、テストの一時ディレクトリの接頭辞。
- agent skill のディレクトリ `packages/cli/skills/wtmctl`→`sodactl` と中身、`docs/wtmctl.md`→`docs/sodactl.md`。
- AGENTS.md・docs/*・LICENSE/NOTICE・`third_party` の説明・`.aidev/config.yml`（smoke のコマンド）・`.aidev/backlog/*.md` の現行の名前。
- 移行スクリプト `scripts/migrate-from-wtm.sh`（POSIX sh）と `scripts/migrate-from-wtm.bat`（Windows cmd）、その統合テスト、移行の docs（日本語）。

### 対象外

- **アプリの後方互換**（古いコマンドの別名・古い環境変数/cookie/localStorage/ディレクトリの読み取り・アプリ内の移行）。利用者の決定（decisions D1）。
- GitHub のリポジトリの改名（主のセッションが後で行う）、移行スクリプトを利用者の本物の HOME で実行すること。
- `.aidev/works/**`（開発の記録。当時の名前のまま残す）。
- `--state-dir`・`--worktree-dir` で既定と違う場所を指定している状態の移行（スクリプトは既定の場所だけを扱い、docs で案内する）。
- ブラウザの localStorage・cookie の自動の移し替え（アプリは行わない。docs に任意の手順として devtools のスニペットを載せる）。
- Windows での `.bat` の実行確認（この環境に cmd が無い。未検証と docs に記す）、E2E・負荷テストの実行（利用者の指示）。

## 機能要件

- 名前の対応は D1 と `research.md` の対応表（design で確定する）のとおり（一つの古い名前に一つの新しい名前）。
- 移行スクリプト（`.sh`）は次を行う。対象はすべて既定の場所で、`XDG_STATE_HOME`・`HOME`・エージェントの設定の場所の環境変数
  （`CLAUDE_CONFIG_DIR`・`CODEX_HOME`・`DEVIN_CONFIG_DIR`）を、アプリと同じ規則で読む。
  1. 事前の検査（何も変えない）: 古い状態ディレクトリ（と `sessions/*/`）のロックの持ち主が動いていれば断る。**移す元がある項目について**、その移動先
     （新しい状態ディレクトリ・CLI のキャッシュ・worktree の置き場、名前を変える hook のファイル、バックアップ）が既にあれば断る。
     移す元が無い項目は検査も移動もせず飛ばす（だから移行を終えた後の 2 回目は、何も変えずに「移すものが無い」と報告して終了コード 0 で終わる）。
  2. 状態ディレクトリを移し、その中（`sessions/*/` を含む）の古い名前のファイル（ロック・クリップボード画像）の名前を変える。
  3. `~/.wtmctl` を `~/.sodactl` へ移す（キャッシュした cookie の名前も新しい名前へ）。
  4. `~/.wtm/worktrees` を `~/.sodashitsu/worktrees` へ移し、移した各 worktree で `git worktree repair` を実行する。保存したレイアウトの中の古い worktree の
     パスも新しいパスへ書き換える。
  5. エージェント連携の hook（claude・codex・cursor・copilot・devin・factory・grok・qwen）の設定ファイルの古い名前を新しい名前へ書き換え、
     古い名前の hook のファイル（スクリプトと copilot/grok の設定ファイル）の名前を変える。書き換える・名前を変える前に `<ファイル>.bak-wtm-migration` へ写す。
     hook のスクリプトは新しい環境変数を読む同梱の版に置き換える。本製品以外の hook のエントリ・設定の他の項目は変えない。
  6. `--dry-run` は予定だけを表示して何も変えない。最後に、行ったこと（または予定）の一覧を表示する。
- 移行スクリプト（`.bat`）は `.sh` と同じ手順を cmd（文字列の置換だけ PowerShell）で行う。
- docs（日本語）に移行の手順を書く: スクリプトの実行（`--dry-run`）・ブラウザで一度ログインし直す（cookie 名が変わる）・任意で devtools のスニペットで localStorage のキーを移す・
  `--state-dir`/`--worktree-dir` で既定と違う場所を使っている場合の手動の移し方・`.bat` が Windows で未検証であること。

## 非機能要件 / 制約

- 移行スクリプトは、検査で断るときに何一つ変えない（ディレクトリもバックアップも作らない）。
- 移行スクリプトは既存のファイルを上書きしない（バックアップの名前が既にあるときも断る）。
- 移行スクリプトの統合テストは一時的な HOME・XDG のディレクトリだけを使い、利用者の本物の状態に触れない。
- 安全のための検査には、変異で確かめた負の対照を付ける（`.aidev/conventions/regression-negative-control.md`）。
- prettier は新しいファイルか HEAD で整形済みのファイルだけに当てる。E2E・負荷テストは走らせない。

## 完了条件 (受け入れ基準)

- [ ] AC1: サーバの bin は `soda`、CLI の bin は `sodactl`、パッケージは `@sodashitsu/*` で、`pnpm-lock.yaml` がそれに合わせて作り直されている。
- [ ] AC2: アプリ（server・cli・web・protocol・e2e・hook のスクリプト）が読み書きする環境変数・cookie・localStorage のキー・CSS 変数・状態ディレクトリ・ロック・
  画像のファイル名・`~/.sodactl`・worktree の既定の置き場・hook のファイル名・`soda bridge` が新しい名前で、古い名前を読むコードが無い。
- [ ] AC3: CLI の出力の接頭辞・ヘルプ・ページのタイトル・agent skill（`packages/cli/skills/sodactl`）が新しい名前を使う。
- [ ] AC4: AGENTS.md・docs・LICENSE/NOTICE・`.aidev/config.yml`・`.aidev/backlog` の現行の記述が新しい名前を使う（`docs/sodactl.md`）。
- [ ] AC5: `git grep -i -E 'wtm|web-tn-multiplexer'` の当たりが `.aidev/works/**`・移行スクリプトとそのテスト・移行の docs の意図した言及
  （と pnpm-lock の integrity の偶然の並び）だけである。
- [ ] AC6: 移行スクリプトは既定の状態ディレクトリ（`XDG_STATE_HOME` を尊重）を `sodashitsu` へ移し、`sessions/*/` を含む古い名前のファイル（`wtm.lock`・`wtm-image-*`）の名前を変える。
- [ ] AC7: 移行スクリプトは `~/.wtmctl` を `~/.sodactl` へ移し、キャッシュした cookie の名前を新しい名前にする。
- [ ] AC8: 移行スクリプトは `~/.wtm/worktrees` を `~/.sodashitsu/worktrees` へ移し、各 worktree で `git worktree repair` を実行して、元の repo から
  `git worktree list` が新しいパスを示し worktree の中で git が使える。保存したレイアウトの古い worktree のパスも書き換わる。
- [ ] AC9: 移行スクリプトは 8 種のエージェントの hook 設定（`CLAUDE_CONFIG_DIR`・`CODEX_HOME`・`DEVIN_CONFIG_DIR` を尊重）の古い名前を新しい名前へ書き換え、
  古い名前の hook のファイルの名前を変え、hook のスクリプトを新しい環境変数を読む版にし、書き換える前のファイルを `<ファイル>.bak-wtm-migration` に残す。
  本製品以外のエントリは変えない。
- [ ] AC10: `--dry-run` は予定を表示し、何も変えない（実行の前後でファイルの木が同じ）。実行の最後に行ったことの一覧が出る。
- [ ] AC11: 古い状態ディレクトリか `sessions/*/` のロックの持ち主が動いていれば、終了コード 0 以外で断り、何も変えない。
- [ ] AC12: 移す元がある項目の移動先（新しい状態ディレクトリ・`~/.sodactl`・`~/.sodashitsu/worktrees`・名前を変える先の hook のファイル・バックアップ）が既にあれば、
  終了コード 0 以外で断り、何も変えない。
- [ ] AC13: 移行を終えた後の 2 回目の実行は、何も変えずに「移すものが無い」と報告する（終了コード 0）。
- [ ] AC14: AC11・AC12 の検査は負の対照（検査を壊すとテストが落ちる）を変異で確かめてある。
- [ ] AC15: docs（日本語）に移行の手順（スクリプトの実行・`--dry-run`・ログインし直し・任意の localStorage のスニペット・既定と違う場所の手動の移行・`.bat` が Windows で未検証であること）がある。
- [ ] AC16: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test` が通る。
- [ ] AC17: `aidev smoke`（`.aidev/config.yml` の新しい名前のコマンド）が通る。
- [ ] AC18: `scripts/migrate-from-wtm.bat` があり、`.sh` と同じ検査（動いているサーバ・移動先の存在）と手順（状態ディレクトリ・CLI のキャッシュ・worktree・hook・`--dry-run`・一覧）を
  持つことが読み合わせで確かめてある（Windows での実行は未検証）。

## 未確定事項 / 確認したいこと

- コード中の識別子（`WtmClient` 等）の新しい名前、表示名（`Sodashitsu`）とコマンド名（`soda`）の使い分け → design で決める。
- 移行スクリプトのテストを vitest から sh を起動する形にするか → design で決める。
