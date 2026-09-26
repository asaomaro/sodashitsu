# 調査: 名前付き session の残り（画面での表示と切り替え・ポートの記憶・環境変数の既定）

発火の条件（protocol.md「4.5」）: 利用者が操作する部品（session の一覧のダイアログ）を作る／未検証の既存挙動
（Cookie・ダイアログのフォーカス・pane の環境）に依存する。

## 調査の問い

- Q1: ダイアログ（一覧から選ぶ）の確立したパターンは何か。開く・確定・取り消し・キーボード・フォーカスの行き先を、
  外の規範とこの PJ の既存のダイアログがどう決めているか。
- Q2: ダイアログを開いている間のキーは、pane の端末・プレフィックス・navigate モードへ漏れないか（既存の仕組み）。
- Q3: 同じホスト名の別ポートの session で Cookie は衝突するか。Cookie の名前に session の名前を使えるか。
- Q4: サーバの名前・一覧をブラウザへ渡す既存の経路（hello の結果・方式の登録）と、一覧を開く前にサーバへ聞く既存の形。
- Q5: ポートの記録を置く・読む既存の部品（原子的な書き込み・ロックの持ち主）と、起動の順序のどこで書けるか。
- Q6: pane の環境の既存の扱い（`WTM_*` の管理）と、herdr の `HERDR_SESSION` の扱い。
- Q7: 待ち受けのホスト（全インタフェース・ループバック・特定のアドレス）ごとに、別のブラウザのタブから届く URL の決め方。

## 判明した事実

- F1（Q1・外の規範）:
  - WAI-ARIA APG「Dialog (Modal) Pattern」: 開くとダイアログの中の要素へフォーカスを移す／Tab・Shift+Tab はダイアログの中で
    巡回／Esc で閉じる／閉じると**開いた要素（invoking element）へ**フォーカスを戻す（出典: APG の Dialog (Modal) Pattern の
    Keyboard Interaction・Focus management。記憶による。この環境からは取得していない）。
  - HTML の `<dialog>` の `showModal()`: 外側を不活性（inert）にし、Esc で `cancel` イベント、閉じると開く前にフォーカスの
    あった要素へ戻す（HTML Living Standard の dialog 要素の節。記憶による）。
  - 一覧から 1 つを選ぶ部品の例: tmux の `choose-tree`（`prefix s`。session の一覧で ↑↓／j/k で移り Enter で選び、q／Esc で抜ける）、
    VS Code の Quick Pick（↑↓・Enter・Esc）。どれも「↑↓ で移る・Enter で確定・Esc で取り消し」で一致する（記憶による）。
- F2（Q1・既存のダイアログ）: 一覧から選ぶダイアログは `GroupPickerDialog.vue`・`WorktreeOpenDialog.vue`・`GotoPicker.vue` が
  同じ形（`GroupPickerDialog.vue:6-13` のコメント）：ネイティブの `<dialog>` を `showModal()`（`:28-31`）し、`role="listbox"` の
  `<ul tabindex="-1">` にフォーカス（`:31`）、`<dialog>` の `@keydown` で ↑↓・j/k 移動／Enter 確定／Esc 取り消し（`:66-89`）、
  `@cancel` を抑えて自前で閉じ（`:61-64`）、`@click.self`（背景のクリック）で閉じる（`:98`）、項目のクリックで選んで確定（`:52-55`）。
  上端で ↑ を押すと末尾へ回る（`WorktreeOpenDialog.test.ts` の「上端で ↑ を押すと末尾へ回る」）。閉じるボタンは持たない。
- F3（Q1・フォーカスの戻り）: `view.closeDialog()`（`store/view.ts:367-372`）は開く前の pane（`preDialogFocusPaneId`）を
  `focusedPaneId` に戻す。`openDialogWithContext`（`:352-356`）が開く時点の pane を覚える。ネイティブの `<dialog>` の `close()` は
  別に、開く前のフォーカスの要素へ戻す（F1）。Settings 等の他のダイアログもこの形（`SettingsDialog.vue:116-120`）。
- F4（Q2）: ダイアログが開いている間は `main.ts:267-270` が `KeyRouter` を `"dialog"` モードにし、`main.ts:278-283` の window の
  keydown は `view.openDialog` があれば何もしない（プレフィックス・navigate へ渡さない）。`showModal()` の間は外が inert なので
  xterm の textarea にフォーカスは無い（F1）。サイドバーのボタンは Enter/Space を `onButtonKeydown`（`Sidebar.vue:205-209`）で
  window へ二重に渡さない（20260925-focus-trapped-keybindings）。
- F5（Q3）: Cookie の名前は固定の `wtm_session`（`packages/server/src/auth/AuthService.ts:9` `SESSION_COOKIE_NAME`）で、
  `Path=/`・Domain 属性なし（`:200-205` `buildSetCookieHeader`）。Cookie はポートで分かれない（RFC 6265 8.5「Cookies do not provide
  isolation by port」。記憶による）ので、同じホスト名の別ポートの session は同じ Cookie を上書きし合う。読むのは
  `parseSessionIdFromCookie`（`:182-198`）で、名前が一致する最初の 1 つ。Cookie の名前は RFC 6265 の token（区切り文字
  `()<>@,;:\"/[]?={}`・空白・制御文字以外）で、session の名前の文字（ASCII 英数字と `.` `_` `-`。`namedSession.ts:21-30`
  `sessionNameProblem`）はすべて token に入る。
- F6（Q4）: hello の結果は `ClientHelloResult { clientId, snapshot }`（`packages/protocol/src/messages.ts:30-33`）で、`snapshot.host` は
  `HostInfo { os, windowsBuild, hostname }`（`packages/protocol/src/model.ts:130-134`）。サーバは `composeServer.ts:153` で作り、
  `SessionModel.buildSnapshot`（`packages/server/src/session/SessionModel.ts:884-896`）がそのまま載せる。ブラウザは
  `store/session.ts` の `applySnapshot` で `host` を持ち、タイトルは `main.ts:298-303`（`{hostname}: {workspace}`、欠ければ `wtm`）。
  スモーク（`packages/server/src/smoke.ts:144`）がこのタイトルを完全一致で確かめる。
  方式は `surface.register(名前, { schema, handler })`（例 `surface/methods/agentIntegration.ts:12-15`）を `registerAllMethods`
  （`surface/methods/index.ts`）で登録し、params のスキーマと結果の型は protocol の `messages.ts` の表（`:540`・`:600` 付近）に並ぶ。
  「サーバへ聞いてから開く」ダイアログは `ActionDispatcher.openWorktree`（`web/src/actions/ActionDispatcher.ts:251-262`）：
  `conn.request` の結果を `openDialogWithContext` の文脈に載せ、失敗は `view.toast`。hello のたびの処理は
  `Connection.onOpened`（`web/src/net/Connection.ts:165-170`）。
- F7（Q5）: 原子的な書き込み `writeFileAtomic`（`packages/server/src/persist/atomicFile.ts:9-24`。0600・一時ファイル＋rename）。
  ロックの持ち主は `StateDirLock.inspect()`（`namedSession.ts:59` の `entryFor` が使う。持ち主の `pid` と、別のホストなら
  `otherHost`）。一覧は `listSessions(base)`（`namedSession.ts:79-93`。既定を先頭に、`sessions/` の下の規則に合う
  ディレクトリを名前順）。起動の順序は `composeServer.ts` の `listen()`：ロック（0.）→ auth（0'）→ 待ち受け（1.）→
  pane の URL（1'。`:289-290` で実際に待ち受けたポートを読む）→ token（2.）→ 復元（3.）。オプションは `composeServer.ts:105`
  の `resolveServeOptions(rawArgs)`（同期。`config.ts:120-175`）で決まり、名前付きの状態ディレクトリは `resolveSessionStateDir`。
  `composeServer` は async なので、`resolveServeOptions` の後に記録を読める。
- F8（Q6）: pane の環境は `buildPaneEnv`（`packages/server/src/session/paneEnv.ts:30-49`）：サーバの環境から
  `PANE_ENV_DROPPED`（`:15-21`。`WTMCTL_*`・`WTM_PANE_ID`・`WTM_SERVER_URL`・`WTM_AGENT_REPORT_SOCKET`）を落とし（win32 は
  大文字小文字を区別しない）、管理する値を入れる。呼ぶのは `SessionService.ts:1052`、値は opts（`serverUrlForPanes`。`:110`・`:182`）。
  herdr: `HERDR_SESSION` は CLI の既定の session（`scratchpad/herdr/src/session.rs:10`・`:84-88`。`--session` が優先・`default` は
  既定・規則外は誤り `:486-492`）。`--session` を付けるとサーバのプロセスの `HERDR_SESSION` をその名前にする（`:478`）。pane の
  起動（`src/pane.rs`）は `HERDR_SESSION` を外さない（`env_remove` は `WT_SESSION` 等だけ。`:99`・`:149-171`）ので pane が引き継ぐ。
  docs は「Select a named session for CLI commands」（`docs/versions/0.9.1/website/src/content/docs/cli-reference.mdx:536`）。
- F9（Q7）: 全インタフェースで待ち受けたサーバは、このマシンの全アドレスとホスト名を Host として許す（`auth/OriginPolicy.ts`
  `allowedHostPorts`）。常に `localhost`・`127.0.0.1`・`::1` を許し、特定のアドレスで待ち受けたならそのアドレスも許す。
  `--origin` の名前は、そのサーバに付けた分だけ。ループバック・全インタフェースの判定は `util/net.ts:18-26`
  （`isLoopbackHost`・`isWildcardHost`）、URL のホスト部は `formatUrlHost`（`:109-112`）。いずれも server パッケージの中にあり、
  web からは使えない（web は `@wtm/protocol` だけに依存する）。
- F10（Q4・起動の表示）: `startupLines`（`packages/server/src/startupBanner.ts:27-53`）は名前付き session の行
  `wtm: session <名前>（状態ディレクトリ: …）` を出す。待ち受けの失敗の案内は `bindFailureHint`→`listenFailureHint`
  （`config.ts`。`EADDRINUSE` の文言は `--port` と `--session` を案内する）で、`main.ts:77-84` が `ConfigError` にする。
  `main.ts` は読み込むと起動する（単体テストできない。`cliArgs.ts:16-19` のコメント）。

## 影響範囲

- server: `config.ts`（オプションに session の根・ポートの出所）、`cliArgs.ts`（`WTM_SESSION` の適用）、`main.ts`、`composeServer.ts`
  （記録の読み書き・Cookie の名前・一覧の方式の依存）、`auth/AuthService.ts`（Cookie の名前）、`persist/`（記録のファイル）、
  `persist/namedSession.ts`（一覧に開くための情報）、`session/paneEnv.ts`・`SessionService.ts`（`WTM_SESSION`）、
  `surface/methods/`（新しい方式）、`startupBanner.ts`。
- protocol: `model.ts`（`HostInfo` に名前）、`messages.ts`（方式の params・結果）。
- web: `store/session.ts`、`main.ts`（タイトル・hello のたびの一覧）、`components/Sidebar.vue`（入口）、新しいダイアログ、
  `store/view.ts`（`DialogContext`）、`actions/ActionDispatcher.ts`、`App.vue`。
- docs: `docs/herdr-parity.md` H33・`docs/tls-setup.md`・`docs/verification.md`。

## 実現性 / リスク

- すべて既存の部品の延長で作れる（新しい依存ライブラリは要らない）。
- **Cookie**: 名前付き session の Cookie の名前を変えても、既定の session の名前は変わらないので既存のログインは保たれる。
  ブラウザはポートを問わず同じホスト名の全 Cookie を送るので、各サーバは他の session の Cookie も受け取る（今も同じ）。
  読むのは自分の名前だけにする。
- **スモークのタイトル**（F6）は既定の session で起動するので、既定の session のタイトルを変えなければ壊れない。
- **happy-dom**（web の vitest の環境。`packages/web/vitest.config.ts:7`）で `<dialog>` の `open` を確かめている既存のテストがある
  （`GroupPickerDialog.test.ts:112`）。ネイティブのフォーカスの戻り（F1）までは確かめられない（未検証の穴として残す）。
- `window.open(url, "_blank", "noopener,noreferrer")` は利用者の操作（クリック・Enter）の中で呼べばポップアップとして止められない
  （ブラウザの一般的な挙動。記憶による・実機では未確認）。

## 実装アンカー

- A1: Cookie の名前（`packages/server/src/auth/AuthService.ts:9` `SESSION_COOKIE_NAME`・`:182` `parseSessionIdFromCookie`・`:200` `buildSetCookieHeader`・`:207` `buildClearCookieHeader`）
- A2: Cookie を読む他の経路（`packages/server/src/http/HttpServer.ts:137`・`:158` が `auth.parseSessionIdFromCookie` を呼ぶ。`authorizeUpgrade` は `AuthService.ts:65`）
- A3: オプションの解決（`packages/server/src/config.ts:120` `resolveServeOptions`・`ServeOptions` `:16-36`）
- A4: CLI の引数（`packages/server/src/cliArgs.ts:30` `parseArgs`）と実行（`packages/server/src/main.ts:121` `main`・`:25` `runServe`）
- A5: 組み立てと起動の順序（`packages/server/src/composeServer.ts:105` `resolveServeOptions` の呼び出し・`:110` `DefaultAuthService`・`:153` `HostInfo`・`:264-331` `listen()`・`:289-290` 待ち受けたポート）
- A6: 一覧（`packages/server/src/persist/namedSession.ts:79` `listSessions`・`:59` `entryFor`）
- A7: pane の環境（`packages/server/src/session/paneEnv.ts:15` `PANE_ENV_DROPPED`・`:30` `buildPaneEnv`・`SessionService.ts:1052`）
- A8: 方式の登録（`packages/server/src/surface/methods/index.ts` `registerAllMethods`・`deps.ts` `MethodDeps`）と protocol の表（`packages/protocol/src/messages.ts:540`・`:600` 付近）
- A9: 起動の表示（`packages/server/src/startupBanner.ts:27` `startupLines`）と待ち受けの失敗の案内（`config.ts` `listenFailureHint`・`main.ts:77-84`）
- A10: ブラウザの session のストア（`packages/web/src/store/session.ts` `applySnapshot`）・タイトル（`packages/web/src/main.ts:297-303`）
- A11: 一覧のダイアログの手本（`packages/web/src/components/GroupPickerDialog.vue` 全体）とそのテスト（`GroupPickerDialog.test.ts`）
- A12: サーバへ聞いてから開く（`packages/web/src/actions/ActionDispatcher.ts:251` `openWorktree`）・`DialogContext`（`packages/web/src/store/view.ts:170-215`）
- A13: サイドバーの見出しとボタン（`packages/web/src/components/Sidebar.vue:380-387`・`:205` `onButtonKeydown`）
- A14: hello のたびの処理（`packages/web/src/net/Connection.ts:165` `onOpened`。`main.ts` がつなぐ）

## 実装時の注意

- `HostInfo` は `exactOptionalPropertyTypes`（`tsconfig.base.json:9`）の下にある。省略可能な項目を足すなら、無いときは項目ごと
  入れない（`undefined` を入れると型の誤り）。
- `main.ts` は単体テストできない（F10）。`WTM_SESSION` の適用や案内の組み立ては、テストできる別の関数（`cliArgs.ts` 等）に置く。
- 名前付きでない起動の表示（`startupLines`）・案内（`listenFailureHint`）の文言は既存のテストが完全一致で見ているものがある。
  名前付き・記録したポートのときだけ行を足す。
- `SESSION_COOKIE_NAME` は他のテスト・e2e が参照しうる（定数は残す）。
- `web` は `server` の `util/net.ts` を使えない（F9）。ブラウザ側のホストの判定は web に小さく持つ。

## design への申し送り

- ダイアログは F2 の既存の形（listbox・↑↓/j/k・Enter・Esc・背景のクリック）に揃え、AC-I1 の「閉じるボタン」を足す
  （APG・F1 の規範に合う。既存のダイアログは持たないが、足しても形は崩れない）。フォーカスの戻り（AC-I4）は、既存の
  `closeDialog`（開く前の pane）ではなく**開いたボタン**が正しい（APG・F1）——サイドバーのボタンから開くダイアログなので、
  開く前の pane を `focusedPaneId` に戻す処理が働いても値が変わらなければ端末はフォーカスを奪わない（F3）かを design で詰める。
- AC-I3 の「Tab（または ↑↓）」は既存の形の ↑↓ で満たす（listbox の中は ↑↓。Tab はダイアログの中の閉じるボタンと一覧の間を移る）。
- 名前を hello の結果のどこに載せるか（`HostInfo` に省略可能な項目、が最小）。
- 記録のファイルの名前・形（pid とホスト名を持たせて、ロックの持ち主と突き合わせる）。
- 既定の session で入口を出す条件（F1）のための一覧を、hello のたびに 1 回取る（`onOpened`）。
