# 判断の記録（20260927-rename-sodashitsu）

## D1: 着手の判定・profile・利用者の決定（2026-09-27・requirements）

- 背景: 主エージェント経由の利用者の依頼で、製品名を改める（autonomous・backlog 項目なし）。worktree `feature/rename-sodashitsu`、main b69303f から。
  利用者が決めたこと（依頼文のまま記録する）:
  - 新しい製品名は **Sodashitsu（操舵室）**。サーバのコマンドは `soda`、CLI は `sodactl`。GitHub のリポジトリは後で（主のセッションが）`sodashitsu` に改名する——
    docs ではリポジトリ・製品の名前に `sodashitsu` を使う。
  - 利用者は本人ひとりなので、**アプリには後方互換を一切置かない**: `wtm`/`wtmctl` の別名、古い環境変数・cookie 名・localStorage のキー・ディレクトリの読み取り、
    アプリ内の一度きりの移行、のどれも作らない。
  - 代わりに、利用者が一度だけ実行する**移行スクリプト**（`scripts/migrate-from-wtm.sh`＝POSIX sh、`scripts/migrate-from-wtm.bat`＝Windows cmd）を置く。
    古いサーバが動いていれば何もせず断る・移動先があれば断る（上書きしない）、状態ディレクトリ・`~/.wtmctl`・`~/.wtm/worktrees` を移し（worktree は `git worktree repair`）、
    エージェント連携の hook 設定を書き換える（書き換える前にバックアップ）、`--dry-run`、2 回目は何もしないか綺麗に断る。
  - E2E と負荷テストは走らせない（利用者の指示）。
- 決定: profile は full（全パッケージ・docs・状態ディレクトリの配置を変え、利用者の実データを動かすスクリプトを新しく足すため light ではない）。
  research は挟む（`protocol.md`「4.5」の「影響が横断的」に当たる。全モジュールと docs にまたがる改名で、置き換えの順序と例外を事前に洗い出さないと
  機械的な置換で壊す——例: `~/.wtm/worktrees` は `.soda` ではなく `.sodashitsu` にする、pnpm-lock の integrity に `wtm` の並びが偶然含まれる）。
- 理由・代替案: 移行をアプリの中で行う案は利用者の決定で却下（古い名前を読むコードが残り続ける）。
- 影響: requirements の対象外に「アプリの後方互換」を明記する。

## D2: 移行スクリプトの範囲を依頼より少し広げる／狭める判断（2026-09-27・design）

- 背景: 依頼は「状態ディレクトリ・`~/.wtmctl`・`~/.wtm/worktrees`（と repair）・hook の設定」の移行。research で、名前を変えるだけでは効かない所が 3 つ見つかった
  （research F4.4・F5.2・F5.4）。
- 決定:
  - (a) hook のスクリプト（各エージェントの `hooks/wtm-agent-report.cjs`）は、名前を変えるだけでなく**同梱の新しい版に置き換える**。写してある古い版は
    `WTM_PANE_ID` を読むので、名前を変えた後のサーバ（`SODA_PANE_ID` を渡す）では黙って何もしなくなる。依頼文の「古い hook のスクリプトのパス（古い状態ディレクトリの中）」は
    実際には状態ディレクトリではなく各エージェントの `hooks/` の下だった（`AgentIntegrationInstaller.ts:191,238`）ので、そちらを対象にする。
  - (b) `~/.sodactl/session.json` にキャッシュした cookie の名前（`wtm_session=`）を `soda_session=` に書き換える（CLI のログインを保つ。安い）。
  - (c) worktree を移したら、保存したレイアウト（`session.json`）の中の `$HOME/.wtm/worktrees` を新しいパスに書き換える（しないと workspace・pane の cwd が消えた場所を指す）。
  - (d) 手で入れた skill（`~/.claude/skills/wtmctl`）は変えず、`注意:` で入れ直しを案内するだけ（中身は `sodactl skill` の出力で、スクリプトは作れない）。
  - (e) `--state-dir`・`--worktree-dir` の既定と違う場所（docs の例の `~/.local/state/wtm-lan` 等）はスクリプトの対象にせず、docs に手で移す手順を書く。
  - (f) `XDG_STATE_HOME` が空文字のときは未設定と同じに扱う（アプリの `??` は空文字を使い、相対パスになる。移行でそれを真似る意味は無い）。
- 理由・代替案: (a) を名前の変更だけにする案は、移行の後にエージェントの状態の報告が黙って止まる（利用者が気づきにくい）ので却下。(e) を引数で受ける案は、
  利用者が既定と違う場所を使っているかをスクリプトが知れず、docs の手順で足りる（利用者本人ひとり）ので見送った。
- 影響: design の計画の表に (a)〜(c) を入れた。architecture は挟まない（`protocol.md`「4.5」の 4 条件: モジュールの境界・責務は動かない、新しい構造の判断は無い、
  データモデルは変えない、design は tasks に分解できる粒度）。

## D3: 移行スクリプトのテストの置き場（2026-09-27・design）

- 決定: `scripts/migrate-from-wtm.test.ts` に置き、ルートの `vitest.config.ts` の `projects` に `scripts` を足す（`scripts/vitest.config.ts`）。
- 理由・代替案: `packages/server` の中に置く案は、リポジトリの道具（`scripts/`）のテストをサーバのパッケージに結びつけるので見送った。
  `scripts/` の TypeScript は各パッケージの `typecheck` の対象外になる（型検査はされず、vitest の変換だけ通る）——テストの中身は単純な spawn とファイルの読み書きなので許容する。

## D4: T10（起動確認）は test 工程で消化する（2026-09-27・tasks）

- 決定: `tasks.md` の T10（`aidev smoke`。AC17）は coding では行わず test 工程で消化する（`aidev-50-test`「3.2」）。coding の承認時に未チェックで残る。

## D5: scripts/ のテストも型検査する（D3 の「型検査の対象外」を改める）（2026-09-27・coding）

- 背景: T5 の点検で、`scripts/migrate-from-wtm.test.ts` が `packages/server` の TS を import しているのに型検査されないと指摘された。
- 決定: `scripts/tsconfig.json`（`module: ESNext`・`moduleResolution: Bundler`・noEmit）を足し、ルートの `typecheck` を
  `pnpm -r --filter=./packages/* run typecheck && tsc -p scripts/tsconfig.json` にする。
- 理由・代替案: D3 で許容した穴は安く塞げた。ルートの package.json は `type: module` でないので NodeNext だと `import.meta` が CJS 扱いで弾かれる——Bundler にした。
- 影響: `pnpm -s typecheck` が scripts/ も見る（型の誤りを入れた確かめで終了コード 2）。

## D6: `.bat` のメッセージは英語（ASCII）にする（2026-09-27・coding）

- 背景: cmd.exe はバッチファイルをコンソールのコードページで読むので、UTF-8 の日本語の行は表示が崩れ、行の解釈も壊れうる。`.bat` はこの環境で実行して確かめられない。
- 決定: `.bat` のメッセージ・コメントは ASCII（英語）にし、改行は CRLF（`.gitattributes` に `*.bat text eol=crlf`）。`.sh` のメッセージは日本語のまま。
- 理由・代替案: `chcp 65001` で UTF-8 にする案は、確かめられない環境で壊れる要素を増やすので見送った。
- 影響: docs に「`.bat` のメッセージは英語」と書いた。テストの文言の突き合わせは `.sh` だけ。

## D7: `.bat` の出力の細部は `.sh` と揃えきらない（2026-09-27・coding）

- 背景: T7 の点検で、`.bat` の予定の行が移動前のパスを出す・ロックの行の空白を除かない、と指摘された（nit）。
- 決定: 許容する。動作（検査・手順・終了コード）は揃っており、ずれは表示と、アプリが空白を書かないロックの読み方だけ。実行して確かめられない `.bat` に分岐を足すほうが危ない。
- 影響: docs は `.bat` を未検証と書いている。

## D8: 独自コマンドの `WTM_` の書き換えと、Claude Code の会話の記録の扱い（2026-09-27・coding〔cross 点検・review ラウンド 1〕）

- 背景: cross 点検で、`commands.json` のコマンドの文字列が `$WTM_ACTIVE_PANE_CWD` 等を参照していると移行の後に空になると指摘された。review ラウンド 1 で、worktree を移すと
  Claude Code の会話の記録（`~/.claude/projects/<cwd 由来の名前>/`）が古い名前のまま残り、自動再開（`claude --resume`。`resumeCommand.ts:24`）が会話を見つけられないと指摘された。
- 決定:
  - `commands.json`（状態ディレクトリと `sessions/*/`）の `WTM_` を `SODA_` に書き換える（バックアップつき。sh・bat・docs・テスト）。`wtm`・`wtmctl` のコマンド名は、
    利用者の文字列の中の語を機械的に判別できないので書き換えず、docs で案内する。
  - Claude Code の projects のディレクトリは動かさず、`*-wtm-worktrees-*` に当たるものを `注意:` で知らせ、docs に手で名前を変える手順を書く。
    ディレクトリの名前の付け方は Claude Code の内部の規則（未確認の実装の詳細）で、スクリプトが推測して動かすと会話の記録を壊しうるため。
  - 途中で止まった（終了コード 3）後の再実行で新しい置き場に残る `wtm-*` は、docs で手当てを案内する（スクリプトは直さない）。
- 影響: design の計画の表に「独自コマンド」を足した。

## デバッグ D1: review の原因究明を省いた（2026-09-27T15:02:12Z）
- 背景: review の差し戻しが 3 回（上限 3）。
- 決定: 原因究明（aidev debug start）の委譲を省いた。
- 理由: 原因は特定済み: 3 回とも docs/migrate-from-wtm.md 手順 7 の手動の mv の例（ラウンド 2・3 は直前の修正に由来）。コード・テストに差し戻しは無い。最終の修正は OS に依らない [ ! -e ] && mv に一本化
