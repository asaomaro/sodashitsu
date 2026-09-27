# 判断の記録（20260927-custom-command-keys）

## D1: 利用者の決定・着手の判定・profile・任意工程（2026-09-27・requirements）

- 背景: backlog `product-roadmap.md:54`「独自コマンドのキー: herdr の `[[keys.command]]`」を autonomous で進める（主エージェント経由の
  ユーザーの依頼。worktree `feature/custom-command-keys`、main 97affb8 から）。backlog の注記は「サーバで任意のコマンドを走らせる仕組みと、
  その権限の設計が要る」。依頼の時点で、利用者が次を決めている（主エージェントが伝えた決定をそのまま写す）:
  1. コマンドの定義は**サーバ側の設定ファイルだけ**（サーバの持ち主が書く。状態ディレクトリ・0600・読み直せる。herdr の config.toml と同じ位置づけ）。
     ブラウザは定義済みのコマンドを **id で呼ぶだけ**で、コマンドの文字列はブラウザからサーバへ渡らない。
  2. これらのコマンドのキーの割り当ては、**既存のブラウザの設定画面**（キーのカスタマイズ。ブラウザごと。既存の 34 操作と同じ）で行う。
  3. 種類は `popup`（タブの上の modal な浮いた端末。終わるまで全入力を受ける。幅・高さはセルか %）・`pane`（終われば閉じる一時的な拡大 pane。
     20260926-edit-scrollback の仕組みを使ってよい）・`shell`（切り離して裏で）。`plugin_action` は対象外（プラグインの仕組みが無い）→ backlog。
  4. コマンドへの環境変数（herdr の `HERDR_ACTIVE_PANE_ID` に当たる `WTM_ACTIVE_PANE_ID`・フォーカス中の pane の作業場所）、名前付き session
     （session ごとの状態ディレクトリの設定）、Windows を考える。
  5. 安全: 設定を厳しく検証（スキーマ・大きさの上限）、呼び出しは認証済みのクライアントだけ、id を検証、注入させない（コマンドの文字列は
     持ち主が書いたとおりにシェルへ渡す——それは意図どおり——が、ブラウザからの値は何も差し込まない）。
  6. popup の UI は相互作用の受け入れ基準（AC-I1〜AC-I5）を持つ。追加の機能は backlog の `[ ]` 行へ。
- 決定: profile は **full**（サーバでコマンドを走らせる新しい口＝安全面を含み、protocol・server・web の 3 層にまたがる）。
  herdr の一次資料（`configuration.mdx` の「Custom command keybindings」、`src/app/custom_commands.rs`・`src/app/popup.rs`・`src/popup_size.rs`・
  `src/config/keybinds.rs` の `CustomCommandKeybind`・`src/platform/linux.rs` の `raw_command_argv`）は主エージェントが直読し、requirements の表に
  出所つきで写した。**research は挟む**（`protocol.md`「4.5」の 5 条件のうち「利用者が操作する部品を作る」〔popup〕と「影響が横断的」〔protocol・
  server・web〕に当たる。popup の確立したパターン〔modal な浮いた端末の開閉・フォーカス・入力の独占〕と、既存コードの前提〔pane 以外の端末を
  WebSocket で流せるか・キーの表を動的な項目へ広げられるか〕を確かめる）。architecture は design の終わりに 4 条件で判定する。
- 理由・代替案: light は不可（振る舞いを大きく変え、共有モジュール〔キーの表・protocol〕に触る）。research を省く案は、popup の部品と
  既存の端末の配信の前提（`pane.subscribe` がモデルの pane だけを受ける等）を確かめずに design を書くことになり、手戻りが大きい。
- 影響: requirements の「利用者の決定」節に 1〜7 を写した。

## D2: 要件の段で決めたスコープの線引き（2026-09-27・requirements）

- 背景: herdr の popup は「セッションに対して modal」（1 つの TUI に 1 つ）。本製品は同じ session を複数のブラウザが同時に開ける。
- 決定: popup は**開いたブラウザにだけ出す**（ほかのブラウザには出さない）。開いたブラウザが切断したらコマンドを止める。ウィンドウの
  大きさの変化への追従・切断をまたいだ保持・他のブラウザへの表示・`wtmctl` のサブコマンド・自動の読み直し・設定ファイルの既定のキーは
  対象外とし backlog に残す。
- 理由・代替案: (a) 採用: 開いたブラウザに限る。大きさはそのブラウザの pane の領域から決まるので、他のブラウザに同じ大きさで出す意味が薄い。
  切断で止めないと、誰にも見えないプロセス（入力待ちのまま）が残り続ける。(b) 却下: 全ブラウザに出す（セッションに modal）。大きさの
  持ち主（サイズ権限）の規則を popup にも作る必要があり、今の work の大きさを超える。(c) 却下: 切断しても保つ。再接続したブラウザが popup を
  見つけ直す一覧・所有の引き継ぎが要る。
- 影響: AC5・F9。後続は backlog。

## D3: 設計の主な選択と architecture を挟む判定（2026-09-27・design）

- 背景: design で requirements の未確定事項（ファイル名・項目名）と、research の申し送り（popup の部品・端末の作り方・キーの表の広げ方）を決める。
  承認者のいない autonomous なので、方針の事前承認は取らず（`protocol-autonomous.md`「方針の事前承認」）、採否をここに残す。
- 決定: (1) `<stateDir>/commands.json`・zod の `z.strictObject`・id は持ち主が付ける（`^[a-z0-9][a-z0-9_-]{0,63}$`）。(2) Unix は `O_NOFOLLOW` で開いた fd の
  `fstat` で持ち主・権限・種類・大きさを検査し同じ fd から読む。(3) popup はモデルに入れない端末（`reserveNextPaneId` の id）で、要求した接続だけが持ち、
  `pane.subscribe` を広げて流す。(4) ブラウザの popup は `TerminalRegistry` の外の xterm.js と、ネイティブの `<dialog>` でない `role="dialog"` の枠。
  (5) `pane` 種は `editScrollback` から抜き出した `openZoomedCommandPane` を共有し、記録は別の Map。(6) キーの対象を `KeyTargetId = ActionId | command:<id>` に広げ、
  保存は `keys.commands`。(7) 新しい code 4 つ（`command_not_found`・`command_failed`・`command_popup_open`・`command_busy`）。
  architecture は**挟む**（`protocol.md`「4.5」の「モジュール間の境界を動かす」〔新しい `server/commands/` の係と、`WsGateway`→係・`SessionService` からの pane 種の
  依存の向き〕と「インターフェース／データモデルが複雑」〔protocol・保存の形・キーの表の型〕に当たる）。
- 理由・代替案: 退けた案は design.md「検討した代替案」（ブラウザがコマンドを送る口・TOML・不透明な id・隠れた pane・全ブラウザの popup・ネイティブの `<dialog>`・
  ファイルの監視）。
- 影響: tasks は architecture.md「tasks への申し送り」の順。

## D4: design の独立点検は 2 ラウンドで打ち切り（2026-09-27・design）

- 背景: design の doccheck はラウンド 1（11 件）・ラウンド 2（6 件：出所の番号の混在・`O_NOFOLLOW` の前提の出所・FIFO での停止・popup の購読の持ち主・
  `shell` 種の中の失敗・閉じた知らせの配り方）。上限（`maxDocCheckRounds` 2）に達した。
- 決定: ラウンド 2 の 6 件はその場で直した（FIFO は `O_NONBLOCK`、購読は持ち主だけ、INPUT は pane と同じく持ち主を見ない理由を書いた、`O_NOFOLLOW`・`O_NONBLOCK` は
  この worktree で実測）。3 巡目の点検は行わず、残りの疑問は 60 review に委ねる。
- 理由・代替案: 直した差分は小さく局所的。INPUT に持ち主の確認を足す案は、pane の INPUT も誰でも書ける既存の設計（`SizeAuthority.ts:24-27`）と食い違う境界を
  popup にだけ作ることになるので採らない。
- 影響: review で popup の購読・入力の境界を見る。

## D5: architecture の独立点検（2026-09-27・architecture）

- 背景: ラウンド 1 で 7 件（web の popup の持ち主の食い違い・starting の間に閉じる経路・切断の遷移・図に無い部品・細部）。
- 決定: その場で直した。開いている popup の持ち主は `CommandPopupSession`（`store/commands` は一覧・問題・閉じた控えだけ）。starting の間の閉じるは控えて、
  成功の応答が来たら `command.popup_close` を送る。切断ではブラウザ側で要求を送らずに閉じる。図に無い配線は本文に列挙した。2 巡目は行わない（直しは局所的）。
- 影響: T11 のテストに starting の間の閉じる・切断を入れる。

## D6: Windows の起動の形を `/d /s /c "<command>"` にした（2026-09-27・coding T3）

- 背景: requirements F7・AC11・design は herdr に合わせ `<ComSpec> /d /c <command>` としていた。T3 の独立点検で、cmd.exe は `/s` が無いと外側の `"` の外し方の
  規則が入力で変わり、`"C:\Program Files\x.exe" "arg"` のような書き方が壊れると指摘された。
- 決定: Node の `shell: true` と同じ `<ComSpec> /d /s /c "<command>"`（裏での実行は `windowsVerbatimArguments`）。AC11 は「`/d /c` の系統で、文字列をそのまま
  渡す」の意図を保った変更として扱う。
- 理由・代替案: herdr のまま（引用なし）にする案は、持ち主が書いた引用符が意図どおりにならない。どちらも Windows の実機で確かめられない（未検証の穴）。
  popup・pane 種は node-pty に argv の配列で渡すので、node-pty が引数を引用し直す——`"<command>"` の要素が二重に引用される恐れがある。これも Windows の
  実機で確かめられず、docs と test-result に未検証の穴として書く。
- 影響: docs/custom-commands.md の Windows の節。

## D7: 停止時の popup の後始末は `finally` にも置き、`finally` だけの経路は単体では確かめない（2026-09-27・coding T6）

- 背景: T6 の点検で、`close()` の `finally` の `commands.dispose()` を消しても、通常の停止では `wsServer.closeAll` → `onClientGone` で popup が止まるので
  テストが落ちないと指摘された。
- 決定: `finally` の `commands.dispose()` は残す（`try` の途中で投げたときの保険。`disposeScrollbackEditors` と同じ扱い）。テストは「つながったまま `close()` すると
  popup が止まる」だけにし、`finally` だけの経路は確かめない（`close()` の途中を投げさせる差し替えの口が無く、そのために口を足すのは過剰）。
- 影響: 負の確認（test）では `onClientGone` の配線と `finally` の両方を壊したときに落ちることを見る。

## D8: 起動確認は既存の smoke（`dist/smoke.js`）に独自コマンドの popup の往復を足す（2026-09-27・coding）

- 背景: この work はサーバの新しい入口（状態ディレクトリの `commands.json` の読み込み・`command.*` の要求・popup の端末）を足す。`aidev-50-test`「3.2」は
  新しい入口には起動確認を足すか、足さない理由を書くことを求める。
- 決定: `smokeCommands` の 1 本目（`pnpm -s build && pnpm -s smoke`）が走らせる `packages/server/src/smoke.ts` に、状態ディレクトリへ `commands.json`（0600）を置いて
  起動し、`command.list`（文字列が載らない）→ `command.run`（popup の `cat`）→ `pane.subscribe` → 入力の往復 → `command.popup_close` を足した。新しい行は足さない
  （同じサーバの起動の中で確かめられ、起動を増やさない）。
- 理由・代替案: 別の行（`node -e` で起動）を足す案は、サーバの起動・ログイン・WebSocket の往復を書き直すことになり重複する。

## D9: Windows の PTY には 1 本のコマンドラインで渡す（2026-09-27・review ラウンド 1 の差し戻し）

- 背景: review ラウンド 1 の must。D6 で `"<command>"` を要素に持つ配列にしたが、popup・pane 種は node-pty に配列で渡すので、node-pty 1.2.0-beta.15 の
  `argsToCommandLine`（`windowsPtyAgent.js`）が要素の中の `"` を `\"` に書き換え、`cmd.exe /d /s /c \"lazygit\"` になって起動できない。D6 で「実機で未検証」と
  した恐れは、node-pty の関数の出力から確定できた。
- 決定: `PtySpawnOptions.args`・`CreatePaneOptions.args`・`openCommandPane` の `args` を `string[] | string` にし、Windows では `ptyArgs` が 1 本の文字列
  （`/d /s /c "<command>"`）にする（node-pty は文字列ならそのまま `<file> <args>` につなぐ）。Unix は配列のまま。裏での実行（`child_process.spawn` の
  `windowsVerbatimArguments`）は変えない。テストは node-pty の `argsToCommandLine` 自体に通して形を確かめる。
- 理由・代替案: 引用せずに要素として渡す案は、node-pty が空白を含む要素を `"…"` で包み、中の `"` を `\"` にするので同じく壊れる。
- 影響: Windows の実機での起動は依然として未検証の穴（コマンドラインの形だけは確定）。
