# 調査: `sodactl ask`（pane のプログラムからブラウザ版の画面へ質問のフォームを出す）

変更前のスナップショット（ブランチ `feature/sodactl-ask`・`main` の 1da98d6 から）。パスはリポジトリの根から。
調べ方: サーバ・CLI／保存した SSH のマシン／ブラウザの画面の 3 つを別のコンテキストに委譲し、根拠つきの結論だけを持ち帰った。
設計を左右する事実（F1・F2・F3・F6・F12・F20・F21）は、主のコンテキストで該当行を読み直して確かめた。
UI の規範（Q9）は主のコンテキストで書いた。

## 調査の問い

- Q1: 「フォームを出せるブラウザ」をサーバはどう見分けられるか（requirements 未確定 4）。端末版・sodactl・軽い接続を外せるか。
- Q2: 保存した SSH のマシンの pane から呼んだとき、手元のブラウザへ届くか（未確定 3）。
- Q3: サーバから特定のブラウザへ「出す／閉じる」を届ける既存の経路と、再接続での出し直しの先例（AC8・AC9・AC10）。
- Q4: 回答待ちを sodactl はどう待てるか（長い要求・時間切れ・Ctrl+C・切断の検知）。
- Q5: sodactl にコマンドを足す手順、呼び出し元の pane の特定、終了コード（AC5・AC6・AC14）。
- Q6: pane が閉じた・サーバが止まる・接続が切れた、をサーバのどこで拾えるか（AC5・AC10）。
- Q7: 大きさの上限の既存の書き方と値の目安、ログに内容が出る経路（未確定 5・AC13）。
- Q8: ブラウザの既存のダイアログの作り・状態の持ち方・キーの止め方・フォーカスの戻し方・モバイル（AC-I1〜AC-I5・未確定 9・10）。
- Q9: UI の規範（確立したパターン）と、対応指示の求める挙動との突き合わせ。
- Q10: 対象の pane が表示されていないブラウザへ知らせる既存の手段（未確定 1）。
- Q11: ask-form の定義の検査（`normalize()`）と画面の挙動（`form.html`）の正確な中身（AC3・未確定 6）。

## 判明した事実

### ブラウザの見分け（Q1）

- F1: **端末版（TUI）は `kind: "desktop"` で hello する**（`packages/tui/src/net/TuiNet.ts:119`）。`clientKind` は `desktop`/`mobile`/`external` の 3 つだけ
  （`packages/protocol/src/messages.ts:21`）。**kind だけでは、端末版とブラウザを区別できない**。
- F2: 接続は hello の前から `ClientRegistry` に既定の `desktop` で載る（`packages/server/src/clients/ClientRegistry.ts:62`、`packages/server/src/ws/WsGateway.ts:83`）。
  kind は `client.hello` で確定する（`packages/server/src/surface/methods/client.ts:9`）。hello 済みかの印は registry に無い。
- F3: `external` で繋ぐもの: sodactl（`packages/cli/src/wsClient.ts:165`）・ブラウザの軽い接続 `MachineSummaryClient`（`packages/client-core/src/net/MachineSummaryClient.ts:96`）・
  サーバ内のグラフ用の接続 `RemoteLinks`（`packages/server/src/graph/RemoteLinks.ts:101`）。グラフ実行の `GRAPH_CLIENT_ID` は registry に載らない（`packages/server/src/composeServer.ts:139, 321-330`）。
- F4: ブラウザの kind は `isCoarsePointer() ? "mobile" : "desktop"`（`packages/web/src/main.ts:67`）。
- F5: `ClientRegistry` は `list()` だけで kind 別の取得は無い（`ClientRegistry.ts:76-78`）。`ClientRecord` は id・kind・fit・`view`（workspaceId・tabId・visible の pane）・
  subscriptions・theme 等を持つ（`:19-37`）——**その接続がどの pane を表示しているかはサーバが知っている**（`view.visible`）。
- F5b: 独自コマンドの popup は「開けるのは desktop / mobile だけ・1 接続に 1 つ」を kind で判定している（`packages/server/src/commands/CommandService.ts:224-232`）。
  これは利用者の操作で開くもので、端末版も `desktop` として通る（端末版にも popup がある）。

### 保存した SSH のマシン（Q2）

- F6: リモートを表示中のブラウザの画面の接続は、手元のサーバが認証の後に中継へ渡し（`packages/server/src/ws/WsServerWs.ts:129-147`、`composeServer.ts:358-380`）、
  TEXT/BINARY は無加工でリモートへ届く（`packages/server/src/machine/MachineRelay.ts:90-105`）。リモートは各チャネルを 2 つめの `WsGateway` に渡し、`surface`・`clients`・`bus` は
  `/ws` 側と同じ実体（`packages/server/src/machine/BridgeEndpoint.ts:224`、`composeServer.ts:391-392`）。→ **リモートの `ClientRegistry` に、そのブラウザは desktop / mobile として載る**。
- F7: リモートのイベントは中継の接続にも同じに配られ、中継（リモート → ブラウザ）は JSON の TEXT と OUTPUT・SNAPSHOT を通す（`MachineRelay.ts:114-126`）。
- F8: リモートの pane の `SODA_SERVER_URL`・`SODA_PANE_ID` はリモートのサーバ自身の値（`packages/server/src/session/paneEnv.ts:65-66`）。リモートの sodactl はリモートのサーバへ直接つなぎ、
  認証は `~/.sodactl` の Cookie（`docs/sodactl.md:438-451`）——**リモートのマシンで `sodactl login` 済みが前提**（既存の sodactl と同じ）。
- F9: ブラウザがローカルを表示中のとき、リモートに居るのは `external` の軽い接続だけ（1 列の画面では軽い接続も無い。`packages/web/src/actions/MachineWiring.ts:58-60, 86-98, 115-121`）。
  軽い接続にも broadcast は届くが、知らないイベントは捨てる（`MachineWiring.ts:133-145`、`packages/web/src/store/machines.ts:130-175`）。
- F10: pane の id はマシンをまたいで衝突する。イベントにマシンの印は無く、画面の接続のイベント＝選択中のマシンのもの（`packages/client-core/src/net/Connection.ts:366-375`、
  `packages/web/src/store/StoreAdapter.ts:83`）。マシンの切り替えは「前の接続の close → 新しい hello」で、`view.resetForMachineSwitch()` がダイアログを捨てる
  （`packages/web/src/main.ts:353-357`、`packages/web/src/store/view.ts:439-441`）。
- F11: `sodactl --machine <local 以外>` は `caller` を捨てる（`packages/cli/src/cliArgs.ts:943-954`）。呼び出し元の pane が必須のコマンドとは両立しない。
- F11b: 名前付き session は状態ディレクトリ・ロック・ポート・`bridge.sock` が session ごと（`docs/tls-setup.md:424-446`、`packages/server/src/machine/bridgeCommand.ts:39`）。
  「その session のブラウザ」＝そのサーバの接続。
- F11c: 画面の JS は手元のサーバが配る。手元が古くリモートが新しいと、リモートはそのブラウザを数えるのにブラウザはイベントを知らない（版の違い。F1 と同じ対処で解ける）。

### サーバ → ブラウザの経路と出し直し（Q3）

- F12: `EventBus` は同期の subscribe / publish だけ（`packages/server/src/bus/EventBus.ts:9-23`）。`WsGateway` は**全イベントを全接続へ無条件に送る**（`WsGateway.ts:107-109`）。
  特定の接続へだけ送る既存の例は `client.error`（`WsGateway.ts:205-210, 232`。`WsGateway` が自分で `conn.sendText`）だけ。
- F13: bus に載せたものは `external` にも届く。`sodactl watch` はイベントの data をそのまま出力する（`packages/cli/src/commands/session.ts:35-42`）。
  **定義・回答をイベントに載せると、ほかの sodactl・軽い接続へ漏れる**。
- F14: 再接続での取り直しの先例: hello の結果は `{clientId, snapshot}` だけ（`messages.ts:37-40`）。ほかはブラウザが `Connection.onOpened` のたびに要求して取り直す
  （`command.list`: `packages/web/src/main.ts:273`・`packages/web/src/actions/ActionDispatcher.ts:302-307`、`graph.get`: `packages/web/src/store/graph.ts:119`、prefs: `main.ts:292`）。
  clientId は接続ごとに新しい（`Connection.ts:218-221`）。
- F15: **サーバ発で開くダイアログの先例は無い**（既存は全て利用者の操作で開く）。サーバ発で閉じる先例は popup: `command.popup_closed` を全員に配り、持ち主以外は無視
  （`packages/protocol/src/events.ts:136-143`、`StoreAdapter.ts:181-183`、`packages/web/src/store/commands.ts:27-33`、`packages/web/src/components/CommandPopup.vue:146-157`）。
- F16: popup の持ち主の管理（手本）: `popups: Map<PaneId, {clientId,…}>`・持ち主以外の操作は `not_found`・`onClientGone` で止める・`dispose()` で全部止める
  （`CommandService.ts:40-45, 63, 270-285`）。

### sodactl の待ち方（Q4）

- F17: **sodactl の要求は全て 10 秒固定で時間切れ**（`REQUEST_TIMEOUT_MS`。`packages/cli/src/wsClient.ts:62, 140-161`。上書きの口は無い。超えると `RpcFailure("timeout")`）。
  数分保留する RPC は既存に無い。
- F18: 既存の待つコマンドは、短い RPC の後に**イベントを CLI 側で見て待つ**（`agent wait`: `packages/cli/src/commands/agent.ts:91-125`、`agent prompt --wait`: `:198-308`、
  `agent start`: `packages/cli/src/commands/agentStart.ts:65-135`）。切断は `client.onClose` で `connection_closed`（`agent.ts:115`）——`WsSodaClient` は切断しても保留の要求を
  reject しない（`wsClient.ts:98-101`）。
- F19: SIGINT を受け止めるのは `pane control`（`packages/cli/src/commands/sessionStream.ts:96-105`）と `pane attach` だけ。ほかは既定の動作でプロセスが終わり、接続が閉じる。
- F20: サーバは切断を `conn.onClose` で知る: bus の購読解除 → `clients.unregister` → `onClientGone(clientId)`（`WsGateway.ts:155-168`）。配線は 2 か所
  （`/ws`: `composeServer.ts:383-388`、bridge: `:392-397`）。ping / heartbeat は見つからない——半開きの接続は検知されない（サーバ側の時間切れが要る）。
- F20b: サーバは 1 通ごとに独立に処理するので、保留中のハンドラが同じ接続のほかの要求を止めない（`WsGateway.ts:149-153, 171-190`）。
  client-core の `Connection.request` には時間切れが無く、切断で保留を全て reject する（`Connection.ts:203-215, 397-401`）。

### sodactl のコマンドの足し方・終了コード（Q5）

- F21: 終了コード: `CliUsageError` → stderr に `sodactl: <message>` と hint、exit 2。ほか → `classify` して stderr に `{"error":{"code","message"}}`、exit 1
  （`packages/cli/src/output.ts:94-128`）。**サーバの `invalid_params` は exit 1 になる**——定義の誤りを exit 2 にするには CLI 側の検査か写像が要る。
  成功は `printJson` で stdout に 1 行（`output.ts:10-12`）。
- F22: 足す場所: `USAGE_LINES`（`packages/cli/src/cliArgs.ts:25-66`）・`Command` union（`:167`）・`parseArgs` の case（`:339-384`）・`main.ts` の switch（`packages/cli/src/main.ts:74-138`。
  `never` で網羅を検査）・`printHelp`（`main.ts:28-64`）・`commands/<名前>.ts`。`--timeout` は `parseTimerMs`（上限 2^31-1。`cliArgs.ts:611-620`）。
- F23: SKILL.md の検査: 本文の `sodactl <語>` が `USAGE_LINES` に実在・`USAGE_LINES` の全コマンドが本文に出る（`packages/cli/src/skill.test.ts:70-81`）。
  smoke は `sodactl skill | cmp - packages/cli/skills/sodactl/SKILL.md`（`.aidev/config.yml` の 4 本目）。
- F24: 呼び出し元の pane: `SODA_PANE_ID` と `SODA_SERVER_URL` が両方あるときだけ `opts.caller`（`cliArgs.ts:301-310`）。接続先がその pane のサーバのときだけ id を返し
  （`packages/cli/src/selfGuard.ts:23-46`）、そうでなければ接続する前に `caller_pane_unknown`（exit 1。`packages/cli/src/paneTarget.ts:15-34`）。
- F25: stdin を EOF まで丸ごと読む既存のコマンドは無い（`pane control` は NDJSON を行ごと。`sessionStream.ts:53-107, 468-469`）。
- F26: 認証・Origin/Host は `withSession` → `connect`（`packages/cli/src/withSession.ts:15-45`、`wsClient.ts:216-229`）。未知の方式は `not_found`「unknown method」が即座に返る
  （`packages/server/src/surface/ControlSurface.ts:33`）——古いサーバへの `ask` は待たずに失敗する。

### pane の終わり・サーバの停止（Q6）

- F27: `pane.closed` は pane・tab・workspace・置き換え・worktree のどの閉じ方でも出る（`packages/server/src/session/SessionService.ts:467-477`）。シェルの終了は `pane.exited` の後に
  `closePane`（`:1131-1136`）。bus を購読して拾う手本は `MetadataService`（`packages/server/src/metadata/MetadataService.ts:80-83, 97-100`）。
- F28: `close()` は `terminals.dispose` → `wsServer.closeAll(1001)` → `httpServer.close` → finally で `commands.dispose()`・`metadata.dispose()`（`composeServer.ts:681-739`）。
  更新の引き継ぎ（handoff）は `closeAll(1012)` で、`close()` を通らない（`:436-441`）——待ちの後始末は `onClientGone` で起きる。

### 上限とログ（Q7）

- F29: `/ws` の 1 通は 4 MiB（`WsServerWs.ts:16, 66`）。超えると `ws` が接続ごと切る。上限の書き方の先例: バイト数の refine（`GRAPH_PROMPT_MAX_BYTES` 8 KiB: `packages/protocol/src/graph.ts:16, 126`、
  `PREFS_MAX_BYTES` 256 KiB と `jsonBytes`: `messages.ts:458, 551`）、件数・文字数（`METADATA_*`: `messages.ts:683-701`、`GRAPH_NODES_MAX` 等: `graph.ts:13-26`）。
- F30: `docs/sodactl.md:198-211`「サーバ側の上限」は表ではなく、太字の見出しで始まる箇条書き（`- **端末の大きさ**（…）: …`）。
- F31: 方式の呼び出しごとのログは無く、params を書く箇所も無い。`invalid_params` は zod の message をクライアントへ返すだけ（`ControlSurface.ts:34-37`）。
  **`RpcError` 以外の例外は method と stack をログに書く**（`:47`）——素の `Error` の message に内容を入れると残る。zod 4.6 の message に受け取った値は載らないが、path（質問の id を含みうる）と未知のキー名は載る。
- F32: 新しい `ErrorCode` は `packages/protocol/src/errors.ts:2-71` と、網羅の表 `packages/client-core/src/net/clientError.ts:14` の両方に足す。

### ブラウザの既存のダイアログ（Q8）

- F33: 共通の base は無く、各部品がネイティブ `<dialog>` + `showModal()` の同じ形を複製している（`packages/web/src/components/ConfirmDialog.vue:84-97` ほか）。
  Esc は `@cancel` で `preventDefault` して自前の `cancel()`（`NameDialog.vue:106-110`）。背景クリックは `@click.self="cancel"`、**付けていないのは Onboarding**（`OnboardingDialog.vue:226-231`）。
  フォーカスの閉じ込めは `showModal()` の inert 任せ。開いたときは最初の操作部品か、大きいものは見出し `tabindex="-1"`（`OnboardingDialog.vue:152-153, 232`）。
- F34: 状態は**単一の枠**（`openDialog`/`dialogContext`/`preDialogFocusPaneId`。`packages/web/src/store/view.ts:309-312`）。`openDialogWithContext` は上書き（`:480-484`）——
  同じ枠で開くと、開いている設定・確認を潰し、置き換えられた popup はコマンドを止める（`CommandPopup.vue:131-141`）。別枠の先例はグラフ画面
  （`graphOpen`/`preGraphFocusPaneId`。`:317-319`）で、`modalOpen = openDialog !== null || graphOpen`（`:323`）。
- F35: キーを止めるのは `modalOpen`: `keys.setMode(open ? "dialog" : "terminal")`（`packages/web/src/main.ts:420-423`）・`KeyRouter` は dialog で常に consume
  （`packages/client-core/src/keys/KeyRouter.ts:108-109`）・window の keydown は `if (view.modalOpen) return`（`main.ts:431-436`）。実際に端末へ届かない主因は、フォーカスがダイアログ内にあり背面が inert なこと。
  画像の貼り付けは端末要素の paste の capture（`packages/web/src/term/TerminalRegistry.ts:291-300`）なので、フォーカスがダイアログにあれば起きない。
- F36: `Ctrl/Cmd+Enter` はキーの割り当て（`packages/client-core/src/keys/bindings.ts`）に無い。部品内の先例は `ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)`
  （`packages/web/src/components/graph/LinkPanel.vue:252`）。IME は `if (ev.isComposing || ev.keyCode === 229) return`（`SettingsDialog.vue:274` ほか。Safari は 229 も要る）。
- F37: フォーカスの戻し: `focusPaneIfShown(ports, paneId)`（pane の tab が表示中でなければ何もせず false。`packages/web/src/actions/paneFocus.ts:14-19`）、`TerminalRegistry.focus`（`TerminalRegistry.ts:180-182`）。
  `TerminalPane` は `view.focusedPaneId` の**変化**でだけ `term.focus()` する（`TerminalPane.vue:62-68`）ので、同じ値へ戻すだけでは端末にフォーカスが戻らず、明示の `registry.focus` が要る
  （先例 `graph/GraphView.vue:1243-1245`）。モーダル中に `view.focusPane` を呼ぶと端末がフォーカスを奪う（`view.ts:486-493`）。
- F38: マウント: `.app-shell`（`v-else`）の中に全ダイアログが並ぶ（`packages/web/src/App.vue:85-104`）。ログイン・切り離しの間は `.app-shell` ごと unmount され、pinia の状態は残る（`App.vue:58-60`）。
  置き直しで開き直すのは watch に `{ immediate: true }` を付けた Onboarding（`OnboardingDialog.vue:159-162`）と GraphView だけ——**immediate が無いと、`modalOpen` だけ残ってキーを食う見えないダイアログになる**。
- F39: `showModal` を重ねると後から開いた方が上で、先の方は inert。Toast・ReconnectOverlay は `.app-shell` 内の `position: fixed`（`z-index` 950・900）で、top layer へ移すのはグラフ画面の間だけ
  （`App.vue:99-104`）——**ほかのモーダルの間は背面で inert になり、トーストの［移動］は押せない**。
- F40: モバイル: `MobileShell` は `.app-shell` の中で、同じダイアログ群が載る。焦点の pane 1 つだけを描く（`packages/web/src/mobile/MobileShell.vue:44-45`）ので、`focusedPaneId` を変えると表示の pane が変わる。
  ダイアログ内のスクロールは `max-height: calc(100% - 16px)`（`100vh` は iOS で不可）・sticky な題名行＋`scroll-padding-top`（`SettingsDialog.vue:957-993`）。Esc が無いので閉じるボタンが必須。
  画面のキーボードの高さ（`useVisualViewportHeight`）は `.mobile-shell` にだけ当てており、ダイアログでは使っていない（`packages/web/src/mobile/useVisualViewport.ts:19-36`）。
- F41: スタイル: テーマのトークン `--soda-menu-bg/-fg/-border`・`--soda-accent`・`--soda-error-fg`・`--soda-warn-fg`・`--soda-backdrop`（`App.vue:114-137`。正は `theme/uiTokens.ts`）。
  フォームの class は scoped で共有できない（`SettingsDialog.vue:1074-1104`）。CSP は `style-src 'self' 'unsafe-inline'`（`packages/server/src/http/HttpServer.ts:28-29`）でインラインの style は通る。
  **色の値を検証する既存の仕組みは無い**。
- F42: テスト: happy-dom の `showModal()` は `open` 属性を付けるだけ（top layer・inert・Esc→cancel・フォーカス復帰は無い）。単体は `mount(…, { attachTo: document.body })`・Esc は `trigger("cancel")`
  （`ConfirmDialog.test.ts:31-49, 85-91`）。フォーカスの閉じ込め・キーの漏れ・復帰は E2E（`packages/e2e/src/specs/keys-mouse-dialogs.spec.ts:19, 101`）。

### UI の規範（Q9）

確立したパターンを 3 つ並べ、対応指示（＝ `form.html` の挙動）と突き合わせる。

| 項目 | WAI-ARIA APG「Dialog (Modal)」 | HTML の `<dialog>.showModal()`（OS のモーダルに相当） | このリポジトリの既存のダイアログ | 対応指示（`form.html`） |
|---|---|---|---|---|
| 開く | 利用者の操作が起点。開いたらフォーカスを中へ（内容が長い・破壊的でなければ最初の操作部品、長ければ先頭の静的な要素） | 呼び出しで top layer へ。背面は inert | 利用者の操作。最初の部品か見出し（F33） | **サーバ発**（利用者の操作ではない）。`window.focus()` するだけ |
| 確定 | 規定なし（中のボタン） | `<form method=dialog>` の submit | ボタン・Enter（部品ごと） | 決定ボタン・`Ctrl/Cmd+Enter`・1 行の入力欄での Enter・質問 1 つなら選んだ時点 |
| 取り消し | `Esc` で閉じる | `Esc` → `cancel` イベント → 閉じる | `@cancel` を止めて自前の cancel（F33）・背景クリック（Onboarding を除く） | `Esc`・キャンセルボタン・ウィンドウを閉じる |
| キーボード | `Tab`/`Shift+Tab` は中で巡る。ラジオの組は矢印で移り `Space` で選ぶ（APG「Radio Group」）、チェックボックスは `Space` | 背面が inert なので中で巡る。ネイティブの radio/checkbox は APG どおり | ネイティブの部品任せ | ネイティブの radio/checkbox/text/textarea |
| フォーカスの戻り先 | **開く前にフォーカスのあった要素**へ（その要素が無ければ論理的な次の場所） | `close()` で、開く前の要素へ戻す | ネイティブ任せ。端末へは明示（F37） | 閉じるとターミナルへ戻る（OS のウィンドウ） |
| 題と名前 | `aria-modal`・`aria-labelledby`（題）・必要なら `aria-describedby` | 同左を自分で付ける | `aria-labelledby` | `<title>` と見出し |

食い違いと、採るべき側:

- **サーバ発で開く**（APG・既存と違う）。`form.html` も呼び出し側が開くので同じ性質。利用者が別の入力の途中（端末・ほかのダイアログ・IME の変換中）に
  フォーカスを奪うことになる。APG は「開いたらフォーカスを中へ」だが、**打っている途中のキーが質問の回答として効いてしまう**（例: 端末で打った `Space`・`Enter` がラジオの選択・確定になる）
  危険がこの画面に固有にある。→ design で「開いた直後の誤操作を防ぐ手当て」（最初のフォーカスを操作部品ではなく見出しに置く〔APG の「長い内容」の扱い・既存の Onboarding と同じ〕等）を決める。
- **フォーカスの戻り先**: APG・`<dialog>` は「開く前の要素」。対応指示は「その pane の端末」。質問を出した pane と、開く前にフォーカスのあった場所が違うとき
  （別の pane で作業中・設定のダイアログを開いていた）に食い違う。requirements の AC-I4 は「その pane が表示されていればその pane の端末、表示されていなければ開く前の場所」。
  → 開く前に別のダイアログが開いていた場合は「開く前の要素」（APG）にしないと、背面のダイアログの操作を壊す。design で場合分けを確定する。
- **背景クリックで閉じない**（AC-I1）。APG は規定せず、既存の多くは閉じるが、Onboarding の先例がある（F33）。選びかけの回答を守る理由が固有にあるので、閉じない側でよい。
- **1 行の入力欄での Enter で確定**（`form.html:248`。`input[type=text]` の Enter → submit）。requirements の AC-I2 に書いていない。IME の確定の Enter と紛れる（F36）。
  → `form.html` と揃えるなら IME の守りが要る。design で採否を決める（採らない場合は ask-form との違いとして docs に書く）。
- **質問 1 つなら選んだ時点で確定**（`form.html:239`）。APG のラジオは矢印で移ると同時に選択になるので、**矢印キーで移っただけで確定してしまう**（`form.html` は `change` で submit するので同じ挙動）。
  対応指示は「`form.html` と同じ」を求めるので揃えるが、キーボードの利用者には確定前に選び直せない。→ design で「`form.html` と同じ（change で確定）」か「クリック・`Space`/`Enter` でだけ確定」かを決める。

### 表示されていない pane への知らせ（Q10）

- F43: 通知の仕組み: 残るトースト＋［移動］（`packages/web/src/notify/NotificationController.ts:195-200`。型 `ToastAction`: `view.ts:196-199`）、`prefix+o` で通知の対象へ移る
  （`ActionDispatcher.ts:180-182`）。移動の本体はモーダル中なら「閉じた後の戻り先」を差し替える（`NotificationController.ts:308-321`）。表示外の pane へ移る
  `focusPaneAcrossViews` は private（`ActionDispatcher.ts:1061-1069`）。
- F44: pane が表示中かは `registry.isVisible`（reactive でない。`nextTick` の後に読む。`TerminalRegistry.ts:136-143`）。呼び名は `paneNameOf(pane, fallback)` =
  `label || agent.name || agent.label || title || "pane <id>"`（`packages/client-core/src/workspace/paneName.ts:11-13`）、場所つきは `describeTarget`（`packages/client-core/src/notify/describe.ts:31, 44`）。
- F45: サーバも、各接続が表示している pane を知っている（F5 の `view.visible`）。

### ask-form の正確な挙動（Q11）

出典は `/workspaces/public_docs/docs/ClaudeCode/skills/other/ask-form/`（別リポジトリ。行は調査時点）。

- F46: `normalize()`（`ask.py:54-89`）の検査: `questions` が空でない配列／各質問に `id`・`label`／`id` の重複なし／`type` は `single`/`multi`/`text`（既定 `single`）／
  `text` 以外は `options` が空でない配列／選択肢は文字列（→ `{value,label}`）か `value` を持つオブジェクト、`value` は文字列化、`label` の既定は `value`／`value` の重複なし／
  `multi` の `default` が文字列なら配列にする／`showIf` の各キーが実在する `id`。**「`showIf` が自分より上の質問を指す」は検査していない**（SKILL.md の「決まり」に書いてあるだけ）。
- F47: 回答の集め方（`form.html` の `collect()`・`visible()`・`missing()`・`valueOf()`）: 上から順に、`showIf` の各キーについて「その id が answers にあり、その値（配列なら要素）に
  欲しい値（配列ならどれか）が文字列として含まれる」ときだけ表示。隠れた質問は answers に入らない。`single` は未選択が未回答（常に必須）、`multi`・`text` は `required` のときだけ空が未回答。
  「その他」を選ぶと値は入力欄の文字列（trim。空なら未選択扱い）で、`custom` にその id が入る（`text` 型は `custom` に入らない）。`text` は trim した文字列。
  `note` は trim して空でなければ入る。未回答があれば確定せず、強調して最初の未回答へスクロール。
- F48: 質問の番号は表示中のものだけに振り直す。「その他」の入力欄に打つ・フォーカスすると「その他」が選ばれる。下部に「未回答 N 件／すべて回答済み」を出す。
  `minWidth` は選択肢の最小幅（px）、`colors` は選択肢に色の帯を出す、`recommended` は「おすすめ」の札。
- F49: 確かめ用の定義は `python3 /workspaces/public_docs/docs/ClaudeCode/skills/other/md-to-doc/generate.py <任意の.md> --ask-spec`（対応指示 5-3）。

## 影響範囲

- **protocol**: `messages.ts`（新しい方式）・`events.ts`（新しいイベント）・`errors.ts`・定義と上限の新しいファイル・`index.ts`。
- **server**: 新しいサービス（回答待ちの台帳）・`surface/methods/` の新しいファイルと `index.ts`/`deps.ts`・`composeServer.ts`（生成・登録・2 つの `onClientGone`・`close()`）。
  ブラウザを見分けるために `ClientRegistry` か hello に手が入る可能性（F1・F2）。
- **cli**: `cliArgs.ts`・`main.ts`・`commands/ask.ts`・`wsClient.ts`（時間切れ。F17）・`skills/sodactl/SKILL.md`・`skill.test.ts`。
- **client-core**: `clientError.ts`（網羅の表）。定義の検査・回答の集め方を web と cli で共有するなら置き場所の候補（protocol か client-core）。
- **web**: 新しいダイアログの部品・ストア・`view.ts` の `modalOpen`（F34・F35）・`StoreAdapter`（イベント）・`main.ts`（`onOpened` の取り直し・マシンの切り替え）・`App.vue`。
  追従が要る既存: `NotificationController.#focusEntry`・`StoreAdapter.applyViewRepair`・`view.resetForMachineSwitch`（モーダルの別枠が増えるため）。
- **tui**: 変えない（対象外）。ただし F1 のため、ブラウザを見分ける印を足しても端末版が今までどおり動くこと。
- **docs**: `docs/sodactl.md`・`docs/tui-parity.md`・`docs/verification.md`・`docs/machines.md`（リモートの pane での扱い）。
- PR #73（ファイルのリンクとドロップ。未マージ）と `messages.ts`・`errors.ts`・`clientError.ts`・`main.ts`・`composeServer.ts`・`deps.ts`・`index.ts` の同じ付近を触る——マージ順で衝突する。

## 実現性 / リスク

- 実現できる。新しい通信路は要らず、既存の `/ws` の方式とイベントで足りる。保存した SSH のマシンも、表示中のブラウザへは既存の中継でそのまま届く（F6・F7）。
- R1（F1）: kind だけで宛先を決めると、端末版だけがつながっているときに `unavailable` にならず、時間切れまで待つ（AC5 を満たせない）。ブラウザが「フォームを出せる」と名乗る印が要る。
- R2（F12・F13）: 定義・回答を bus に載せると、sodactl・軽い接続へ漏れる。宛先を絞って送る経路（`WsGateway` には `client.error` の先例しか無い）か、
  イベントには id だけを載せて中身は要求で取りに来させる形が要る。
- R3（F17）: 回答待ちを 1 つの長い要求にすると sodactl の 10 秒の時間切れに当たる。イベントで待つ既存の形に揃えるか、時間切れの上書きの口を足す。
- R4（F20）: 切断の検知は TCP の close 頼み。半開きの sodactl・固まったブラウザに備えて、サーバ側に時間切れが必須。
- R5（F34・F39）: 質問のダイアログとほかのモーダルの重なり。同じ枠で開くと既存のダイアログを潰す。別枠にすると top layer の重なり順・トーストが押せない問題が出る。
- R6（Q9）: サーバ発でフォーカスを奪うので、打っている途中のキーが回答として効く危険。
- R7（F21）: 定義の誤りを exit 2 にするには CLI 側で検査する（サーバの `invalid_params` は exit 1）。検査を 2 か所に持つなら、食い違わないよう同じ関数を共有する。
- R8（F31）: 内容をログに出さない——素の `Error` に内容を入れない・zod の path に質問の id が入る。
- R9（F38）: ログイン・切り離しからの復帰で、見えないのにキーを食うダイアログ。`immediate` と、接続ごとの取り直しで防ぐ。
- R10（F42）: フォーカスの閉じ込め・キーの漏れ・復帰は happy-dom で検証できない。E2E で見る。
- R11（F11c）: 版の違うブラウザ（手元のサーバが古い）。R1 の印で同時に解ける。

## 実装アンカー

- A1: 方式の追加（`packages/protocol/src/messages.ts:710-786` `METHOD_SCHEMAS`、`:790-` `MethodResultMap`）。
- A2: イベントの追加（`packages/protocol/src/events.ts:168-195` `ServerEvent`）。
- A3: エラーコード（`packages/protocol/src/errors.ts:2-71`、`packages/client-core/src/net/clientError.ts:14` `MESSAGES`）。
- A4: 上限の定数の置き方の手本（`packages/protocol/src/graph.ts:13-26`、`messages.ts:458, 551` `jsonBytes`）。
- A5: 回答待ちのサービスの手本（`packages/server/src/commands/CommandService.ts:40-45, 224-232, 270-285`——持ち主・`onClientGone`・`dispose`）と、bus で `pane.closed` を拾う手本
  （`packages/server/src/metadata/MetadataService.ts:80-83, 97-100`）。
- A6: 方式の登録（`packages/server/src/surface/methods/index.ts:27-46`、`deps.ts:19`）・生成と配線（`packages/server/src/composeServer.ts:297` 付近・`:338-357`・`:383-388`・`:392-397`・`close()` の finally `:721` 付近）。
- A7: 特定の接続へ送る既存の箇所（`packages/server/src/ws/WsGateway.ts:205-210`）と、全接続へ配る箇所（`:107-109`）。`MethodContext`（`packages/server/src/surface/ControlSurface.ts:9-13`）は clientId と sink を持つ。
- A8: 接続の種別と表示（`packages/server/src/clients/ClientRegistry.ts:19-37, 62, 76-78`、`packages/server/src/surface/methods/client.ts:6-24`）。
- A9: sodactl: `packages/cli/src/cliArgs.ts:25-66, 167, 301-310, 339-384, 611-620, 943-954`、`packages/cli/src/main.ts:28-64, 74-138`、`packages/cli/src/paneTarget.ts:15-34`、
  `packages/cli/src/wsClient.ts:62, 98-101, 140-166`、`packages/cli/src/output.ts:10-12, 94-128`、待ち方の手本 `packages/cli/src/commands/agent.ts:91-125`、SIGINT の手本 `packages/cli/src/commands/sessionStream.ts:96-105`。
- A10: SKILL.md と検査（`packages/cli/skills/sodactl/SKILL.md`、`packages/cli/src/skill.test.ts:22-36, 70-81`）。
- A11: web の状態（`packages/web/src/store/view.ts:309-323, 439-442, 480-521`）・イベント（`packages/web/src/store/StoreAdapter.ts:83, 96-110, 112-191`）・
  接続ごとの取り直し（`packages/web/src/main.ts:144-146, 273`）・キーのモード（`main.ts:420-436`）・マシンの切り替え（`main.ts:353-357`）・マウント（`packages/web/src/App.vue:85-104`）。
- A12: 部品の形の手本: `OnboardingDialog.vue`（背景クリックなし・見出しへフォーカス・`immediate`・寸法 `:336-346`）・`graph/LinkPanel.vue:244-256`（Ctrl/Cmd+Enter と IME）・
  `SessionSwitchDialog.vue:58-78`（元の場所へ戻す）・`graph/GraphView.vue:1243-1245`（`registry.focus`）・`SettingsDialog.vue:957-993`（スクロールと sticky）・`:1074-1104`（フォームの見た目）。
- A13: 呼び名と表示の判定（`packages/client-core/src/workspace/paneName.ts:11-13` `paneNameOf`、`packages/client-core/src/notify/describe.ts:31, 44`、`packages/web/src/actions/paneFocus.ts:14-19`、
  `packages/web/src/term/TerminalRegistry.ts:136-143, 180-182`）。
- A14: 通知（`packages/web/src/notify/NotificationController.ts:195-200, 308-321`、`packages/web/src/store/view.ts:196-199` `ToastAction`）。
- A15: テストの手本（単体 `packages/web/src/components/ConfirmDialog.test.ts:31-49, 85-91`・`SettingsDialog.test.ts:24-30`、E2E `packages/e2e/src/specs/keys-mouse-dialogs.spec.ts:19, 101`・
  `mobile.spec.ts`・`reconnect-restore.spec.ts`・`multi-client.spec.ts`、サーバの結合 `packages/server/src/image/imagePaste.integration.test.ts`、中継 `packages/server/src/machine/machines.integration.test.ts`）。
- A16: 色の値の検証（未特定 — 既存の仕組みは無い。新しく書く）。
- A17: stdin を丸ごと読む処理（未特定 — 既存のコマンドに無い。新しく書く。`processStreamIo`〔`packages/cli/src/commands/sessionStream.ts:53-107`〕が stdin の口の手本）。

## 実装時の注意

- `onClientGone` の配線は `/ws` と bridge の 2 か所（F20）。片方だけに足すと、中継越しのブラウザ・リモートの sodactl の切断で後始末が走らない。
- `USAGE_LINES` に `ask` を足すと、SKILL.md に `sodactl ask` が無い限り `skill.test.ts` が落ち、SKILL.md を変えると smoke の `cmp` の対象も変わる（F23）。
- `CliUsageError` の hint は既定で全コマンドの一覧（`cliArgs.ts:72-78, 98`）。定義の誤りには短い hint を渡す。
- モーダル中に `view.focusPane` を呼ばない（端末がフォーカスを奪う。F37）。閉じた後の端末へのフォーカスは `registry.focus` を明示する。
- `registry.isVisible` は reactive でない（`nextTick` の後に読む）。
- モバイルでは `focusedPaneId` を変えると表示の pane が変わる（F40）。
- 4 MiB を超える 1 通は接続ごと切られる（F29）。定義の上限はそれより十分小さくし、CLI 側でも送る前に測る。
- handoff（更新の引き継ぎ）は `close()` を通らず `closeAll(1012)`（F28）。sodactl 側は切断を `onClose` で拾わないと、保留の待ちが残る（F18）。
- E2E はブラウザの側で合否を見る（`.aidev/conventions/e2e-observe-browser.md`）。テストのクライアントに届いたイベントを、ブラウザに出た合図にしない。

## design への申し送り

事実から言えることと、design で決めること（requirements の未確定事項の番号）。

- （未確定 4・R1・R11）宛先は「kind が desktop / mobile」では足りない。**ブラウザが「質問を出せる」と名乗る印**が要る（hello の項目の追加か、質問を受ける旨の要求）。
  印の無い接続（端末版・古い画面・hello 前・軽い接続・sodactl）は数えない。
- （未確定 3）リモートの pane からの質問は、**そのマシンを表示中のブラウザには届く**。ローカルを表示中のブラウザ（軽い接続だけ）には届かない——その場合は `unavailable` にするのが、
  新しい中継を作らない最小の形。選んでいないマシンの質問まで出すなら、軽い接続を宛先に数える仕組みとマシン別の扱い（F10）が要り、範囲が広がる。`docs/machines.md` に書く。
- （R2・R3）中身（定義・回答）を bus に載せない。宛先を絞って送るか、イベントは id だけにして中身は要求で取らせる。再接続の出し直し（AC9）は「接続ごとに取り直す」既存の形（F14）と相性がよい。
  sodactl の待ち方は、イベントで待つ既存の形（F18）か、時間切れの上書き（F17）のどちらかに決める。
- （未確定 7）待っている間に宛先のブラウザが全て切れたとき（マシンの切り替えを含む。F10）: 再読み込みの出し直し（AC9）と両立させるには、すぐには返さず待つ必要がある。
  どれだけ待って `unavailable`／そのまま時間切れにするかを決める。
- （未確定 2）同じ pane の 2 つめ: 断る（新しい code）か、前を取り消すか。前の sodactl は別のプロセスで待っているので、取り消すなら前へ `cancelled` を返すことになる。
- （未確定 1・F39・F43・F45）表示されていない pane: その場で出す（どの pane かを題に出す。フォーカスの戻り先は開く前の場所）か、通知して移ってから出すか。
  サーバは各接続の表示中の pane を知っているが、最初の回答を採る要件（全部に出す）とは独立に決められる。モーダル中はトーストが押せない制約に注意。
- （未確定 5）上限の値。先例は 8 KiB（グラフのプロンプト）〜 256 KiB（prefs）。確かめ用の定義（8 問・13 件）が余裕で入り、4 MiB より十分小さい値にする。回答（自由入力・補足）にも上限を置く。
  `--timeout` の上限は `parseTimerMs`（2^31-1）が既存。
- （未確定 6・R7・F46）検査は CLI（exit 2 のため）とサーバ（信用しないため）の両方で、同じ関数を使う。`normalize()` に無い「`showIf` が上の質問を指す」を足すかを決める
  （足すと ask-form が通す定義を断ることになる——契約の違いとして docs に書く）。
- （未確定 8）`--pane` での指定は対応指示に無い。足さないなら `--machine` と同じく使い方の誤りにする（F11）。
- （未確定 9・R5・F34）Vue の部品として作り直すのが既存と揃う。状態は単一の枠ではなく別枠にし、`modalOpen` に含める。ほかのモーダルが開いているときに質問が来た場合・
  質問の上に既存のダイアログが開く場合（F39）の重なりと、フォーカスの戻り先（Q9）を決める。
- （未確定 10・F36）`Ctrl/Cmd+Enter` は既存の割り当てとぶつからない。IME は `isComposing || keyCode === 229` で守る。1 行の入力欄の Enter での確定・質問 1 つの即確定（Q9）の採否を決める。
- （Q9・R6）開いた直後の誤操作への手当て（最初のフォーカスの置き場所）を決める。
- （F41・A16）`colors` の検証の規則（受け付ける色の書き方）を決める。
- （F8）リモートの pane で使うには、そのマシンで `sodactl login` が要る——pane の環境に token を入れない方針のままなので、これは変えない。docs に書く。
- 契約（対応指示 2）は変えずに実現できる見込み。変える必要が出るとすれば、`form.html` と挙動を変える箇所（Enter・即確定・`showIf` の検査）だけ。
