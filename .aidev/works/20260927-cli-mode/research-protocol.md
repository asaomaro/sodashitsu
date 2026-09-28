# 調査: 端末版（TUI）がブラウザと同じく `/ws` に繋ぐための事実（cli-mode）

調査日 2026-09-28・ブランチ feature/cli-mode（HEAD 28dd4da）。読み取りのみ。パスはリポジトリ直下からの相対。

## 索引

- R1 通信の全体（エンベロープ・バイナリフレーム・hello・購読・入力・大きさ・イベント・既読・マシン）
  - R1.1 経路と認証 / R1.2 JSON のエンベロープ / R1.3 バイナリフレーム / R1.4 hello と snapshot
  - R1.5 pane の購読とスクロールバック（serialize） / R1.6 入力 / R1.7 表示・大きさ・サイズ権限 / R1.8 直結（attach）
  - R1.9 イベント一覧 / R1.10 エージェント状態と `done` の既読 / R1.11 通知に関わるもの / R1.12 マシンの集約 `/ws?machine=`
  - R1.13 方式（method）の全一覧と TUI の要否
- R2 設定の置き場所（ブラウザの localStorage か、サーバか）
- R3 web の中で Node の TUI が使い回せる純粋な TS
- R4 sodactl の接続と `pane attach` の描き方（使い回せる部品）
- R5 配布・パッケージの置き場所と依存の向き
- R6 design への含意（事実から直接言えることだけ）

---

## R1 通信の全体

### R1.1 経路と認証

- `/ws` だけが WebSocket の経路。それ以外のパスは socket を破棄する（packages/server/src/ws/WsServerWs.ts:11, :109-111）。
- upgrade の順序: Origin/Host の検査 → 403（:115-116）→ 起動の途中は 503（:117-123）→ Cookie による認証、失敗なら 401（:124-128）→ `?machine=` の分岐（:130-148）→ ローカルの接続（:149-152）。
- 認証は **Cookie のセッションだけ**。`authorizeUpgrade` は `cookie` ヘッダからセッション id を取り出す（packages/server/src/auth/AuthService.ts:86-87）。Cookie の名前は session 名で変わる（AuthService.ts:23 `sessionCookieName`）。
- Cookie の取得は `POST /api/login`（token を送る）。HTTP の経路は `/api/login`・`/api/logout`・`/api/session` の 3 つだけ（packages/server/src/http/HttpServer.ts:93-95）。**設定を読み書きする HTTP の API は無い**。
- token はハッシュ（scrypt）でしか保存されない（AuthService.ts:127-130）。つまり**あとから token を読み出す手段は無く**、`soda serve` の起動時の表示（packages/server/src/main.ts:51-57, :100-111）か `soda token reset` でしか得られない。
- 前例: **認証済みとして扱うローカルの socket** がある。`bridge.sock`（状態ディレクトリの Unix ドメイン socket・0600、「繋げるのは状態ディレクトリを読める同じ利用者だけ」）。その上のチャネルは `/ws` の 1 接続と同じものとして `WsGateway` に渡る（packages/server/src/machine/BridgeEndpoint.ts:19-35、composeServer.ts:323-326, :547）。**Windows では置かない**（BridgeEndpoint.ts:24）。枠の形は `[type u8][channel u32 BE][length u32 BE][payload]`（packages/server/src/machine/bridgeFrames.ts:1-30）。Windows の named pipe を使う例は AgentReportSocket（packages/server/src/agent/AgentReportSocket.ts:43-49。Windows の権限の限定は未対応と明記）。
- WebSocket の設定: permessage-deflate は 1KB 以上（WsServerWs.ts:12, :63-67）、1 通の上限 4MB（:16）。OUTPUT は圧縮しない・SNAPSHOT/JSON は圧縮（packages/server/src/ws/WsGateway.ts:96-100）。
- セッションの失効（ログアウト等）で close コード 4401（WsGateway.ts:238-242）。

### R1.2 JSON のエンベロープ

- テキストのメッセージは 1 通 1 JSON。要求 `{id, method, params}`・成功 `{id, result}`・失敗 `{id, error:{code,message}}`（packages/protocol/src/messages.ts:748-764）。
- イベントは `{event, data}` で `id` を持たない（packages/protocol/src/events.ts:13-170、クライアント側の振り分けは packages/cli/src/wsClient.ts:125-137、packages/web/src/net/Connection.ts:319-348）。
- サーバの受け口: JSON を解釈できない・id/method が文字列でない → `client.error`（invalid_params）を返して数える、10 秒に 10 回を超えたら 1008 で閉じる（WsGateway.ts:171-190, :223-236, :13-14）。
- `client.detach` は応答の直後にサーバがその接続だけを閉じる（WsGateway.ts:186）。

### R1.3 バイナリフレーム（packages/protocol/src/frames.ts）

- 形式 `[型 u8][pane id の長さ u8][pane id（UTF-8）][本体]`（frames.ts:1-7）。
  - `0x01 OUTPUT` 本体 = PTY の出力の生バイト（サーバ→クライアント）（frames.ts:10, :27-35）
  - `0x02 SNAPSHOT` 本体 = cols u16 LE + rows u16 LE + serialize した文字列 UTF-8（サーバ→クライアント）（frames.ts:11, :37-49）
  - `0x03 INPUT` 本体 = 端末への入力バイト（クライアント→サーバ）（frames.ts:12, :50-58）
- `decodeFrame`（frames.ts:65-89）・`encodeInputFrame`（frames.ts:50-58）は純粋な関数で Node でもそのまま使える（protocol の依存は zod だけ。packages/protocol/package.json）。
- サーバは INPUT 以外の受信を不正として数える（WsGateway.ts:126-129）。INPUT は 1MB まで（:15, :130-136）。

### R1.4 hello と snapshot

- `client.hello` の params は `{protocol: 1, kind: "desktop"|"mobile"|"external"}`（messages.ts:19, :31-34）。結果は `{clientId, snapshot}`（messages.ts:36-39）。
- サーバは種別を記録し、サイズ権限の資格を見直して snapshot を返す（packages/server/src/surface/methods/client.ts:6-14）。
- `SessionSnapshot` = `{protocol, serverVersion, host, workspaces, tabs, panes, groups, focus, limits}`（packages/protocol/src/model.ts:207-217）。`limits.scrollbackLines` はサーバの上限（model.ts:192-194）。
- 主要な型: `Workspace`（model.ts:31-54。`activeTabId`・`groupId`・`git`・`autoLabel`・`tokens`）、`Tab`（model.ts:55-65。`layout`・`focusedPaneId`・`zoomedPaneId`・**`sizeOwnerClientId`**）、`LayoutNode`（model.ts:67-69。pane か `{split, dir, ratio, a, b}` の木）、`Pane`（model.ts:73-103。`cols/rows`・`busy`・`title`・`agent`・`tokens`）。
- ブラウザは socket が開いたら hello → `applySnapshot` → 状態を `open` にする（Connection.ts:267-279）。hello のたびにサーバは新しい clientId を振り、購読・表示・fit は接続ごと（Connection.ts:192-200 の説明）。
- 手順の順序（ブラウザ）: hello → `client.view` → （必要なら `client.fit`）→ `pane.subscribe`（packages/web/src/term/ViewSync.ts:44-58, :96-111, :152-156）。

### R1.5 pane の購読とスクロールバックの復元（serialize）

- `pane.subscribe {paneId, scrollbackLines}` → 結果 `{cols, rows}`（messages.ts:66-74）。サーバは購読を登録して fanout に繋ぐ（packages/server/src/surface/methods/subscribe.ts:6-20）。`pane.unsubscribe`（messages.ts:76、subscribe.ts:22-29）。
- 繋いだ直後の復元は**サーバのミラー（@xterm/headless 6.0.0 ＋ @xterm/addon-serialize 0.14.0）を serialize した SNAPSHOT**（packages/server/src/terminal/Mirror.ts:1-15, :33, :109-110, :196-197。依存は packages/server/package.json）。
- fanout の状態は buffering → live ⇄ stale（packages/server/src/terminal/OutputFanout.ts:14, :26）。購読で buffering に入り、ミラーの処理が追いついた時点で SNAPSHOT を送り、溜めた OUTPUT を続けて送って live（OutputFanout.ts:46-57, :108-121）。
- 流量制御: 送信バッファが 2MB を超えると stale にして出力を捨て（OutputFanout.ts:23, :64-88）、256KB を下回ったら SNAPSHOT からやり直す（OutputFanout.ts:24, :94-100）。drain は 50ms ごとの見回り（WsServerWs.ts:17, :189-200）。**TUI も「SNAPSHOT はいつでも再び届き、そのたびに画面を描き直す」前提が要る**（sodactl も同じ扱い: packages/cli/src/commands/attach.ts:204-210）。
- SNAPSHOT の中身は xterm.js の serialize の文字列（ANSI の列）。ブラウザは `\x1bc`（RIS）＋ text を xterm.js に書く（packages/web/src/net/ports.ts:77-81 の説明）。
- ブラウザが申告する行数は設定（`auto` か数）とサーバの上限から決める（packages/web/src/term/scrollback.ts:10-13, :55。main.ts:158）。

### R1.6 入力

- INPUT フレーム（R1.3）。応答（ack）は無い（wsClient.ts:45）。
- サーバは入力を受けると**その clientId をその pane の tab の「最後に操作した人」にしてサイズ権限を取らせる**（WsGateway.ts:139 → SizeAuthority.noteInteraction）。
- pane が読まずに溜まると捨てて `client.error {code:"input_queue_full", paneId}` を 2 秒に 1 回知らせる（WsGateway.ts:16-22, :140-146, :197-221）。
- 別の RPC 経路の入力: `agent.prompt`・`agent.send_keys`（messages.ts:498-514）。

### R1.7 表示・大きさ・サイズ権限（`client.view`・`client.fit`・`sizeOwnerClientId`）

- `client.view {workspaceId, tabId, visible:[{paneId, cols, rows}]}`（messages.ts:41-49）。1 辺 4096・面積 1,000,000 セル・4096 件まで（packages/protocol/src/terminalLimits.ts:10-31）。サーバは表示を記録して `onViewChanged`（client.ts:16-23）。
- `client.fit {enabled}`（messages.ts:51、client.ts:25-34）。
- サイズ権限の規則（packages/server/src/clients/SizeAuthority.ts:5-26）:
  - 権限を持てるのは `kind === "desktop"` か `client.fit` を有効にしたクライアントだけ（SizeAuthority.ts:54-57 `canDecideSize`）。**`external`（sodactl）は権限を取らない**。
  - 入力・フォーカス・レイアウト操作（`noteInteraction`）で取る（SizeAuthority.ts:69-80。呼び出し元は WsGateway.ts:139、surface/methods/tab.ts:28、agent.ts:72/109/142、command.ts:35）。
  - 誰も持たない tab は、最初に `client.view` を送った資格のあるクライアントが持つ（SizeAuthority.ts:81-100）。
  - 権限者が切断したら、その tab を見ていて最後に操作した別の資格者へ移る（SizeAuthority.ts:17-19）。
- 権限者の `client.view` の大きさで PTY が変わり、結果は `pane.size_changed {paneId, cols, rows}` で全員に配られる（events.ts:98-101）。ブラウザはこれを端末と store の両方へ流す（Connection.ts:339-345）。
- `Tab.sizeOwnerClientId` と自分の clientId の比較で「自分が決めているか」が分かる（web/src/store/session.ts:60 `hasSizeAuthority`、ports.ts:65-66）。
- → **TUI が F8（最後に操作した側の大きさ）に従うには hello を `desktop` で送る必要がある**（`external` では権限を取れない。SizeAuthority.ts:55-56）。

### R1.8 pane への直結（attach。sodactl 用）

- `pane.attach {paneId, cols, rows, takeover?}` → `{cols, rows}`、`pane.attach_resize`、`pane.detach`（messages.ts:85-112）。
- 直結中はその pane の大きさを所有者が決め、ブラウザのサイズ権限はその pane を動かさない（SizeAuthority.ts:23-26）。所有者の変化は `pane.attach_changed {paneId, clientId|null}`（events.ts:102-109）。
- 端末版の画面全体の用途には、pane ごとに 1 つの所有者という制約があるので `client.view`（tab 単位の権限）の方が素直（事実: attach は pane ごと・view は tab ごと）。

### R1.9 サーバのイベント一覧（packages/protocol/src/events.ts:144-168）

| イベント | data | 行 | TUI |
|---|---|---|---|
| workspace.created / updated | {workspace} | 17-24 | 必須 |
| workspace.closed | {workspaceId} | 25-28 | 必須 |
| workspace.order_changed | {workspaceIds} | 35-38 | 必須 |
| group.created / updated / deleted | {group} / {groupId} | 40-54 | 必須（サイドバー） |
| tab.created / updated / closed | {tab} / {tabId} | 55-66 | 必須 |
| layout.updated | {tab} | 67-70 | 必須 |
| pane.created / updated | {pane} | 71-78 | 必須 |
| pane.exited | {paneId, exitCode} | 79-82 | 必須 |
| pane.closed | {paneId, successorPaneId?} | 83-93 | 必須（後継の焦点） |
| pane.agent_status_changed | {paneId, agent} | 94-97 | 必須（状態・通知） |
| pane.size_changed | {paneId, cols, rows} | 98-101 | 必須 |
| pane.attach_changed | {paneId, clientId} | 106-109 | 任意（ブラウザは使わない。:104） |
| session.focus_changed | {focus} | 110-113 | 必須 |
| client.error | {code, message, paneId?} | 114-118 | 必須（知らせ） |
| agent_integration.changed | status | 120-123 | 設定画面を持つなら |
| machine.changed | {machines} | 126-129 | 必須（F10） |
| command.updated | CommandListResult | 131-134 | 独自コマンドを持つなら |
| command.popup_closed | {popupId, exitCode?} | 139-142 | 独自コマンドの popup を持つなら |

- イベントは全クライアントへ配られる（WsGateway.ts:106-109）。
- ブラウザの反映先: `StoreAdapter.applyEventToSession`（packages/web/src/store/StoreAdapter.ts:102-157）と、閉じたものの表示の修復 `repairView`（StoreAdapter.ts:76-100、packages/web/src/store/viewRepair.ts:37）。

### R1.10 エージェントの状態と `done` の既読

- サーバの状態は 4 つ（blocked/working/idle/unknown）。5 つ目の `done` は**クライアントが既読から導く**（model.ts:3-6）。
- `AgentInfo` は `instanceId`・`kind`・`state`・`completionSeq`（working→idle で +1）・`serverSeenSeq`・`verified`・`since`・`name?`（model.ts:114-134）。
- サーバの既読 `serverSeenSeq` は pane のフォーカスで `completionSeq` に揃う・メモリのみ（model.ts:123-124、packages/server/src/agent/AgentTracker.ts:120-122、AgentMonitor.ts:101-105）。
- ブラウザは **instanceId ごとの既読を localStorage `soda.seen.v1` に持ち**、記録が無ければ `serverSeenSeq` に落とす（packages/web/src/store/seen.ts:6-24, :50-52）。ブラウザごとに別々（seen.ts:36-38）。マシンごとの鍵 `m:<machineId>:<instanceId>`（seen.ts:27-33）。
- 導出と集約: `displayStateFor`（idle かつ completionSeq > seenSeq → done。seen.ts:77-82）、`aggregate`（優先度 blocked4>done3>working2>idle1>unknown0。seen.ts:67-74, :88-95）、既読を進める条件 `shouldMarkSeen` / `sweepMarkSeen`（seen.ts:97-124。main.ts:379 で pane の可視とウィンドウのフォーカスで呼ぶ）。
- → **既読はいまブラウザごと**。TUI とブラウザで `done` の既読を共有するなら、`serverSeenSeq`（サーバ側・全員共通だがフォーカスでしか進まない・再起動で消える）を使うか、新しい共有の仕組みが要る。

### R1.11 通知に関わるもの

- 通知専用のサーバイベントは無い。ブラウザが `pane.agent_status_changed` の前後（StoreAdapter.ts:140-147 `onAgentChanged(prev,next)`）と snapshot（StoreAdapter.ts:59-68 `onSnapshotApplied(first)`）から判定する。
- 規則は純粋な関数（packages/web/src/notify/policy.ts）: `notifyKeyOf`（:16）・`snapshotKeys`（:31）・`Audience {windowFocused, paneVisible}`（:39-44）・`NotifyPrefs {toast, desktop, sound}` 既定 `{true,false,false}`（:46-52）・`routesFor`（:71-75）・`shouldQueue`（:83-85）・`decide`（:98-100）・待ち行列最大 8 件 `enqueue/removeByKey/removeByPane`（:116-151）。
- 状態（判定済みの鍵・待ち行列・案内）は pinia の store（packages/web/src/store/notifications.ts:32-70）。ブラウザ API（Notification・AudioContext）は port の実装側（notify/DesktopNotifier.ts・ToneSound.ts・ports.ts）。
- `prefix+o` は Action `nextNotification`（packages/web/src/keys/actions.ts:71）。

### R1.12 マシンの集約（`/ws?machine=`）

- `?machine=<id|名前>` は認証の後に見る。無い・`local` は手元、不正は 400、知らない 404、未接続 503（WsServerWs.ts:21-41, :129-148）。中継でも手元の Cookie のセッションで失効を追う（:145-146）。
- 一覧は `machine.list`（messages.ts:447-449）と `machine.changed`（events.ts:125-129）。`MachineStatus {id, label, state, message}`（model.ts:174-184）。
- ブラウザの作り: 画面の接続は 1 本で行き先を替える（`wsUrlFor` packages/web/src/net/machineUrl.ts:1-10、`Connection.retarget` Connection.ts:151-170、手順 packages/web/src/actions/MachineSwitcher.ts:1-40）。選んでいないマシンは `kind:"external"` の軽い接続で snapshot とイベントだけ受ける（packages/web/src/net/MachineSummaryClient.ts:4-8）。id（w1・p1・a1）はマシンをまたいで衝突する（MachineSwitcher.ts:2-4）。
- sodactl も `--machine` で同じ経路を使う（packages/cli/src/wsClient.ts:210-227, :253-260）。

### R1.13 方式（method）の全一覧と TUI の要否（messages.ts:604-671、結果の型 :675-743）

| 群 | 方式 | TUI |
|---|---|---|
| 接続 | client.hello / client.view / client.fit / client.theme / client.detach | hello・view・theme は必須、detach は `prefix+q`（client.detach は画面の接続だけ切る。client.ts:50-54）、fit は不要（desktop なら資格あり） |
| 購読 | pane.subscribe / pane.unsubscribe | 必須 |
| 直結 | pane.attach / attach_resize / detach | 不要（R1.8） |
| workspace | create / rename / focus / close / move / move_to / report_metadata | report_metadata 以外は必須 |
| group | create / rename / delete / add_member / remove_member / toggle_collapsed | サイドバーのグループを扱うなら必須 |
| tab | create / rename / focus / close / move | 必須 |
| pane | split / close / focus / rename / focus_direction / swap / swap_with / move_to_edge / replace / move_to_tab / move_to_new_tab / zoom / resize / input.set / edit_scrollback | 必須（swap_with・move_to_*・replace はマウスのドラッグの拡張） |
| 画像 | pane.image.begin / chunk / commit / cancel | 端末で画像を取れるかは design（任意） |
| layout | layout.set_split_ratio | 必須（境界のドラッグ） |
| worktree | worktree.list / create / remove | 必須（herdr の機能） |
| エージェント | agent_integration.* / agent.prompt / send_keys / rename / start | 設定画面・名前変更の範囲で |
| その他 | server.sessions / machine.list / command.list / reload / run / popup_close | machine.list 必須、command.* は独自コマンドを持つなら |

- `client.theme {theme}` はサーバが色の問い合わせ（OSC 4/10/11/12）に答えるためだけに覚える・保存も配布もしない（messages.ts:54-59、client.ts:36-48）。答えるのは「最後に操作した人」のテーマ（packages/server/src/clients/answerPalette.ts、SizeAuthority.ts:72-74 の説明）。

---

## R2 設定の置き場所

**結論: 利用者の設定はすべてブラウザの `localStorage`（ブラウザごと）で、サーバには無い。** サーバに持つ（共有される）のはセッションの構成と、少数のサーバ全体の設定だけ。

### R2.1 ブラウザ側のキー

| キー | 置き場所 | 中身 | 根拠 |
|---|---|---|---|
| `soda.prefs.v1` | localStorage | 好みの設定の 1 つの JSON（下表）。読み書きは `readPrefs`/`writePrefs`（併合して書く）に集約 | packages/web/src/store/view.ts:52-85 |
| `soda.seen.v1` | localStorage | エージェントの既読（instanceId → seq） | store/seen.ts:6-24 |
| `soda.hint.prefixHelp.v1` | localStorage | キー一覧の案内を出した印 | store/view.ts:57-58 |
| `soda.themeBoot.v1` | localStorage | 最初の描画用のテーマの控え（`public/theme-boot.js` が読む） | packages/web/src/theme/ThemeController.ts:11-12 |
| `soda.view.v1`（リモートは `soda.view.v1:<machineId>`） | **sessionStorage**（タブごと） | 表示中の workspace/tab | store/view.ts:9-44 |

`soda.prefs.v1` の項目（書く場所）:

- キー割り当て `keys` = `{prefix?, bindings?, navigate?, commands}`（既定との差だけ）（packages/web/src/keys/keyPrefs.ts:17-38、store/settings.ts:416-425）。プリセットはコードの表（keys/presets.ts:16-46。`herdr-ctrl-alt` と `tmux`）を当てて `keys` に書く。
- テーマ `theme` / `themeAuto` / `themeLight` / `themeDark`（store/settings.ts:339-361、読み込み theme/themes.ts の `loadThemePrefs`）、色の上書き `themeOverrides`（store/settings.ts:447, :491-494）。
- 表示: `statusSymbols`・`keyboardLockInFullscreen`・`paneFrameThickness`・`paneAgentNameVisible`・`tabBarPosition`・`tabBarRight`・`tabBarRightSeparator`・`paneOuterBorders`・`paneBorders`・`paneGaps`（store/settings.ts:163-186, :216-316）、サイドバーの行 `sidebarRows`（store/settings.ts:196, :365-376）。
- 端末: `scrollback`（store/settings.ts:185, :322）。新しく開く場所 `newCwdPolicy` / `newCwdPath`（:187-188, :328-334）。
- 通知 `notify: {toast, desktop, sound}`・`notifyHintPending`・`notifyHintDone`（store/notifications.ts:20-30, :68-71, :121-126）。
- サイドバー `sidebarCollapsed`・`sidebarWidth`（px。160〜360、既定 240）（store/view.ts:101-121, :307-312, :536-551）、並び `agentSort`・`workspaceSort`（store/view.ts:90-129）、worktree 自動グループの折りたたみ `collapsedAutoGroups`（store/view.ts:131-142）。
- 初回案内 `onboarding`（store/onboarding.ts:8, :64）。
- 同じブラウザの別タブの変更への追従は `storage` の読み直し（store/settings.ts:435-464）。`reload_config` も localStorage を読み直すだけ（packages/web/src/actions/ActionDispatcher.ts:1212-1250）。

### R2.2 サーバ側（共有される）もの

- セッションの構成（workspace/tab/pane/layout/group。手動グループの折りたたみ `WorkspaceGroup.collapsed` はサーバで共有）（model.ts:196-205）。
- 独自コマンドの定義 `commands.json`（状態ディレクトリ。packages/server/src/commands/commandConfig.ts:12）。**キーの割り当てはブラウザごと**（docs/herdr-parity.md:35 の H12 ①）。
- マシン `machines.json`（packages/server/src/machine/MachineCatalog.ts:20）、公式フック連携 `integrations.json`（packages/server/src/persist/IntegrationFile.ts:36。store/agentIntegrations.ts:7 が「ブラウザごとではない」と明記）。
- テーマはサーバに「いま表示しているテーマ」を知らせるだけ（保存・配布なし。R1.13）。

→ **requirements F8/F11/AC11（設定の共有）は今の仕組みでは満たせない**。キー・テーマ・表示・通知・既読をサーバに置いて配る新しい仕組み（方式とイベント、`soda.prefs.v1` からの移し方）が design の論点になる。なお Web のサイドバー幅は px で、端末では桁になる（store/view.ts:101-121）。

---

## R3 web の中で Node の TUI が使い回せる純粋な TS

判定方法: packages/web/src の `.ts`（テスト以外）を、**実行時の import（`import type` を除く）を辿って** vue / pinia / @xterm に届くかで分けた（DOM のグローバルは別に数えた）。web は `noEmit`・`lib: DOM` のアプリで（packages/web/tsconfig.json）、ライブラリとしては出力されない。

### R3.1 そのまま使える（Vue/pinia/xterm に届かない・DOM 参照も無い）

- **keys/**: `actions.ts`（Mode・KeyInput・Action の型。「Vue にも DOM にも依存しない」:1-3）、`KeyRouter.ts`（prefix の状態機械。時計は注入、prefix の 3 秒の時間切れ :7, :9-13, :39-58）、`chord.ts`（chord の正規形・`parseChord`・`prefixBytes` 等。`KeyboardEventLike` は形だけの interface :18-33）、`keymap.ts`（`resolveKeymap`・予約キー :28-83, :201）、`bindings.ts`（ACTIONS の表）、`keyPrefs.ts`（保存形式の読み書き）、`assign.ts`、`presets.ts`、`navigateKeys.ts`・`navigateKeymap.ts`、`NavigateMode.ts`・`CopyMode.ts`・`ResizeMode.ts`、`commandKeys.ts`。`KeyInputController.ts` は xterm を型だけで参照するが clipboard（navigator）を使う。
- **net/**: `Connection.ts`（再接続・hello・振り分け。`createWebSocket`・`fetchImpl` を注入できる :20-31。既定は global の WebSocket）、`MachineSummaryClient.ts`、`ports.ts`（「Vue と Pinia を import しない（規則 4）」:4-6）、`clientError.ts`・`machineUrl.ts`・`retryAfter.ts`・`InputGate.ts`。ただし**ブラウザは Cookie を自動で付ける前提**なので、Node では Cookie ヘッダを付けられる WebSocket（`ws`）を注入する必要がある（sodactl は `ws` にヘッダを渡している: packages/cli/src/wsClient.ts:228）。
- **notify/**: `policy.ts`（routesFor 等）、`describe.ts`。
- **store/** の純粋な部品: `viewRepair.ts`、`workspaceGrouping.ts`（サイドバーの行の組み立て `groupedWorkspaceRows` :92 等）、`workspaceOrder.ts`、`paneName.ts`。
- **sidebar/rowLayout.ts**（行のトークンの規則）、**tabbar/tabBarRight.ts**、**layout/paneChrome.ts**。
- **term/**: `layoutOrder.ts`（`depthFirstPaneIds`・`neighborPaneId`）、`scrollback.ts`、`popupSize.ts`、`CommandPopupSession.ts`、`resizeThrottle.ts`、`paneDragZone.ts`、`ImagePaster.ts`、`theme.ts`（xterm は型だけ）、`QueryFilter.ts`（xterm は型だけ）。
- **theme/**: `themes.ts`（名前の解決 `resolveTheme`・ラベル）、`uiTokens.ts`、`themeOverrides.ts`（DOM 参照 1 箇所）。配色そのものは protocol の `TERMINAL_PALETTES`・`THEME_NAMES`（packages/protocol/src/theme.ts:10-36, :60-81, :329）。
- **actions/MachineSwitcher.ts**（ports 越し）。

### R3.2 小さな切り出しで使えるもの

- `store/stateIndicator.ts`・`store/agentOrder.ts`・`sidebar/resolveRows.ts` は、純粋な定数 `STATE_PRIORITY` を pinia の store ファイル `store/seen.ts` から import しているため pinia に届く（stateIndicator.ts:2、agentOrder.ts:2、resolveRows.ts:2）。`seen.ts` の `STATE_PRIORITY`・`displayStateFor`・`aggregate`・`sweepMarkSeen`（seen.ts:67-124）は純粋なので、別ファイルへ移せば全部純粋になる。
- `store/view.ts` の `readPrefs`/`writePrefs` や各 `load*`（純粋な読み込み関数）は pinia の store と同居（view.ts:52-142）。

### R3.3 Vue/pinia/DOM に結びついているもの（TUI では作り直し）

- `store/session.ts`（セッションのモデル。pinia。`applySnapshot`・`workspaceUpserted`…`sessionFocusChanged` :9-115）。`StoreAdapter.ts`（イベントを各 store に当てる。pinia :1-157）。ただし中身は Map への upsert/delete だけで、`StorePort`（ports.ts:57-70）の実装を Node 側で書き直すのは小さい。
- `actions/ActionDispatcher.ts`（1273 行・Action → RPC と画面操作。pinia と多数の store・TerminalRegistry・clipboard に依存 :1-36）。**操作の中身（どの Action がどの RPC を呼ぶか）は TUI でも同じだが、今の形のままは使えない**。
- `store/settings.ts`・`store/view.ts`・`store/notifications.ts`・`store/seen.ts`（pinia＋localStorage）、`notify/NotificationController.ts`、`theme/ThemeController.ts`、`term/TerminalRegistry.ts`・`ViewSync.ts`（DOM の要素の大きさを測る :28）・`MouseBridge.ts`・`RendererPool.ts`、`mobile/*`、全 `.vue`。

---

## R4 sodactl（packages/cli）の接続と `pane attach`

### R4.1 接続（使い回せる）

- `connect(url, cookie, machine?)`: `ws` で `/ws`（`?machine=`）へ、`cookie`・`origin`・`host` ヘッダを付けて開く。401→`AuthError`、`--machine` の 404/503 → `RpcFailure`（packages/cli/src/wsClient.ts:210-273）。
- `WsSodaClient`: 1 つの message ハンドラで応答を id で振り分け、イベント・OUTPUT・SNAPSHOT をコールバックへ（wsClient.ts:84-138）。要求の時間切れ 10 秒（:62, :140-161）。`hello()` は **`kind:"external"` 固定**（:163-166）→ TUI はサイズ権限のため `desktop` を渡せるようにする必要がある（R1.7）。`pause/resume` で受信を止めてサーバの流量制御に任せられる（:52-58）。**自動の再接続は無い**（Web の Connection.ts には 1 秒からの倍々の再接続がある: Connection.ts:39-41, :367-418）。
- 認証: `POST /api/login` で Cookie を得る（packages/cli/src/httpAuth.ts:1-26）。Cookie は `~/.sodactl/session.json`（0600・origin ごと・token は保存しない）（packages/cli/src/session.ts:5-27, :90-102）。キャッシュ → 401 なら 1 回だけ token で再ログイン（packages/cli/src/withSession.ts:22-43）。**token が無ければ使えない**（withSession.ts:33-39）。
- 接続先の既定: `--url` → `SODACTL_URL` → `SODA_SERVER_URL` → `http://127.0.0.1:7780`（packages/cli/src/cliArgs.ts:61, :228-235）。

### R4.2 `sodactl pane attach` の描き方（packages/cli/src/commands/attach.ts）

- 端末の抽象 `AttachTerminal`（isTTY・size・setRawMode・write・onInput・onResize・onSignal）と Node の実装 `processTerminal()`（attach.ts:19-94。SIGHUP 後の EIO を無視 :50-52、SIGTERM/SIGHUP を切り離し扱い :85-92）。
- 手順: hello（external）→ `pane.attach`（手元の大きさ、`clampTerminalSize`）→ raw モード＋代替画面 `ENTER_SCREEN` → `pane.subscribe {scrollbackLines: 0}` → 以後 OUTPUT をそのまま書く（attach.ts:162-244）。
- **pane のバイトを素通しで手元の端末に書く**方式（仮想端末で合成しない）。SNAPSHOT のたびに持ち越しを捨てて描き直す（attach.ts:197-213）。書く前に端末への問い合わせを取り除く `TerminalQueryFilter`（答えるのはサーバのミラーだけ。packages/cli/src/attachOutput.ts:1-143）。
- 終わるときに pane が変えたモードを戻す `RESTORE_SCREEN`（色・カーソル・スクロール領域・マウス・フォーカス・bracketed paste・キーパッド、最後に代替画面を出る。attach.ts:35-45, :245-259）。
- `Ctrl+B q` の切り離しは**バイト列の小さなフィルタ** `AttachKeyFilter`（`Ctrl+B Ctrl+B` で `Ctrl+B` を 1 つ送る・分割された読み取りにも対応。packages/cli/src/attachKeys.ts:1-34）。`pane.detach` を送ってから終わる（attach.ts:175-183）。奪われた・pane の終了・切断の扱い（attach.ts:139-160, :185-196）。
- 使い回せる部品: `AttachTerminal`/`processTerminal`（raw・resize・シグナル）、`RESTORE_SCREEN`、`TerminalQueryFilter`、`connect`/`WsSodaClient`。**多 pane の画面には素通しは使えない**（pane ごとに領域へ描く必要がある）ので、pane ごとに端末の状態（画面のセル）を持つ仕組みが要る。サーバは既に `@xterm/headless` と serialize を Node で使っている（Mirror.ts:1-15、packages/server/package.json）＝ Node で動く前例。

---

## R5 配布・パッケージの置き場所と依存の向き

- パッケージと bin: `@sodashitsu/server` の bin `soda` → `./dist/main.js`（packages/server/package.json）、`@sodashitsu/cli` の bin `sodactl` → `./dist/main.js`（packages/cli/package.json）。どちらも `private: true`（公開しない）。
- 配布は**リポジトリをビルドして `dist/main.js` を PATH に置く**運用（docs/migrate-from-wtm.md:36、docs/tls-setup.md:8-16、docs/verification.md:17-19）。Node >= 24（package.json `engines`）。
- web は server が `../../web/dist` を静的に配る（packages/server/src/composeServer.ts:106-109）。third_party もリポジトリ直下から読む（composeServer.ts:111-114）＝ **server の実行はリポジトリの配置に依存**。
- 依存の向き（tsconfig の references と package.json）:
  - protocol ← server・web・cli・e2e（protocol は何にも依存しない。依存は zod だけ）
  - cli → protocol（`ws` を使う）。server は devDependency（結合テスト用）だけ（packages/cli/package.json、packages/cli/tsconfig.json）
  - e2e → protocol・server
  - web → protocol のみ（packages/web/tsconfig.json:11）
  - **server は cli・web を import しない**（packages/server/tsconfig.json:9 は protocol だけ）
- `soda` を引数なしで起動すると今は help（packages/server/src/cliArgs.ts:38-49）。F1 はここを変える（AC19 の「移行の説明」）。
- 置き場所の選択肢に関わる事実:
  - server パッケージに入れる: `soda` の入口（main.ts:132-149 の分岐）に足すだけで起動できる。server は既に `@xterm/headless`・`ws` を持つ（package.json）。ただし server のコードと同居し、web の純粋な TS を使うには server → web の依存が新しく生まれる（今は無い）。
  - cli パッケージに入れる: 接続・認証・attach の部品が既にある（R4）が、`soda`（server の bin）から起動するには server → cli の依存か、別の bin の仕組みが要る。
  - 新しいパッケージ（例: `@sodashitsu/tui`）: protocol と、web から切り出した純粋な TS（R3.1）に依存させられる。web は `noEmit`・DOM の lib なので、共有するには**純粋な部分を別パッケージ（例: 共有のクライアントの核）に移すか、TUI 側から web の .ts をビルドに含める**ことになる（web の tsconfig は emit しない: packages/web/tsconfig.json:4-6）。

---

## R6 design への含意（上の事実から直接言えることだけ）

1. **接続の形はブラウザと同じで足りる**: hello（`desktop`）→ view → subscribe → INPUT。OUTPUT は生バイト、復元は SNAPSHOT（serialize の ANSI）で、SNAPSHOT は再接続・流量制御の回復でいつでも再び届く（R1.4〜R1.7）。
2. **ローカルの自動接続の認証が無い**: token はハッシュでしか残らず、Cookie を得るには token が要る（R1.1・R4.1）。「同じ利用者だけが繋げる」自動接続には、`bridge.sock` と同じ「0600 の socket なら認証済み」（Linux/WSL）と、Windows の方法（named pipe の権限は未対応と明記: AgentReportSocket.ts:44-46）が design の論点。
3. **設定・既読の共有は新しい仕組みが要る**: 今はすべてブラウザの localStorage（R2）。
4. **サイズ権限**: `external` だと取れない。`desktop` なら入力・フォーカスで取り、F8 の規則にそのまま乗る（R1.7）。
5. **使い回し**: keys/・notify/policy・レイアウトの辿り方・サイドバーの行の組み立て・テーマの名前解決・Connection は純粋（R3.1）。session の store・ActionDispatcher・設定の store は pinia に結びついており作り直しか切り出しが要る（R3.3）。
6. **端末の描画**: sodactl の attach は 1 pane の素通しで、多 pane には使えない。pane ごとの仮想端末（Node で動く `@xterm/headless` の前例あり）で合成して描く形が要る（R4.2）。
