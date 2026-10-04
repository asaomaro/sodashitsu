# 調査: サブエージェントの起動・終了をフックで受け取る（20261004-subagent-display）

## 実物で確かめたこと（主エージェントが実行。Claude Code 2.1.289・2026-10-04）

隔離した設定（`claude -p … --settings <一時の settings.json>`。利用者の設定は変えていない）に、`SubagentStart`・`SubagentStop`・`PreToolUse`（matcher `Agent|Task`）・`PostToolUse`（同）・`Stop` のフックを置き、stdin の JSON を記録した。Agent ツールで general-purpose のサブエージェントを 2 つ（前面 1・バックグラウンド 1）起動させた。

- F-H1 **`SubagentStart`**: 項目は `agent_id`・`agent_type`・`cwd`・`hook_event_name`・`prompt_id`・`session_id`・`transcript_path`。**短い説明（description）は入っていない。**前面でもバックグラウンドでも発火する。
- F-H2 **`SubagentStop`**: `agent_id`・`agent_type`・`agent_transcript_path`・`last_assistant_message`・`background_tasks`（`[{id, type:"subagent", status, …}]`）・`session_crons`・`stop_hook_active`・`session_id`・`prompt_id` ほか。`agent_id` は `SubagentStart` と同じ値。前面・バックグラウンドの両方で 1 回ずつ発火した。
- F-H3 **`PreToolUse`（Agent）**: `tool_name: "Agent"`・`tool_use_id`・`tool_input`（`description`・`prompt`・`subagent_type`・`run_in_background`）・`session_id`・`prompt_id`。**`agent_id` は入っていない。**発火の順は `PreToolUse` → `SubagentStart`（同じ `prompt_id`）。
- F-H4 **`PostToolUse`（Agent）**: 前面の実行では完了後に発火し、`tool_response` に `agentId`・`agentType`・`status: "completed"`・`totalDurationMs` 等。`tool_input` も入る（`description` と `agentId` が同じ電文に揃う）。バックグラウンドの実行の `PostToolUse` は、記録が別のフックの書き込みと混ざって読めなかった（**未確認**: 起動直後に発火し `agentId` を含むと推測されるが、確かめ直す）。
- F-H5 **`Stop`**: `background_tasks`（その時点で動いているバックグラウンドのタスクの一覧）を含む。
- F-H6 **環境変数**: フックのプロセスに `SODA_PANE_ID` が引き継がれていた（pane の中で動かした `claude` のフック）。
- F-H7 フックは並行して走る（複数のフックが同じファイルへ同時に書くと混ざった）。報告は 1 回の書き込みで送る必要がある。
- F-H8 ツール名は `Agent`（matcher `Agent|Task` で拾えた。`Task` という名前のツール呼び出しは観測していない）。

## 公式ドキュメントで確かめたこと（委譲。claude-code-guide）

- `SubagentStart`（サブエージェントが起動したとき）・`SubagentStop`（終わったとき）・`TaskCreated`・`TaskCompleted`・`TeammateIdle` がフックのイベントとして載っている（https://code.claude.com/docs/en/hooks-guide.md）。`SubagentStart`／`SubagentStop` の matcher はエージェントの種類（`general-purpose`・`Explore`・`Plan`・独自の名前）。
- 設定の形は `{"hooks": {"<Event>": [{"matcher": "…", "hooks": [{"type": "command", "command": "…", "async": …, "timeout": …}]}]}}`。`async: true` は応答を待たせない。
- **文書では未確認**: 強制終了・クラッシュのときに `SubagentStop`／`SessionEnd` が発火するか。Workflow ツールのエージェントに固有のフック（`Workflow` のツール呼び出しとして `PreToolUse`／`PostToolUse` で拾う）。ほかのエージェント（Codex・Cursor・Gemini 等）のサブエージェントのフック。

## 表示に使える最小の組み合わせ

- 件数: `SubagentStart` で +1、`SubagentStop` で −1（`agent_id` で対応づける）。
- 短い説明と種類: `PreToolUse`（Agent）の `tool_input.description`・`subagent_type`・`run_in_background` を、直後の `SubagentStart` に順序で対応づける（同じ `session_id`・`prompt_id`。対応づけに失敗しても件数は正しい）。
- 取りこぼしの後始末: エージェントが居なくなった・入れ替わったら一覧を消す。`Stop` の `background_tasks` で動いているものと突き合わせて直す余地がある。

## 既存の実装（委譲の調査。HEAD 2bef742。読んだだけで実行はしていない。`P` = `packages`）

### F1 フックのスクリプト
- 本体は `P/server/assets/agent-hook-report.cjs`（68 行）。`soda-agent-report.cjs` は、導入時にエージェントの hooks ディレクトリへ写した先の名前（`P/server/src/agent/AgentIntegrationInstaller.ts:15`）。
- 起動の形は `node "<hooksDir>/soda-agent-report.cjs" <kind>`。引数は kind だけ（:36）。`SODA_PANE_ID`・`SODA_AGENT_REPORT_SOCKET`（:34-35）のどちらか・kind が無ければ何もせず終わる（:37）。
- stdin を全部読んで JSON にし、2 秒で打ち切る（:19-31）。使うのは `session_id || sessionId` だけ（:46）。**`hook_event_name` は見ていない。`session_id` が無いと何も送らない（:50）。**
- 送るのは 1 接続に 1 行の `{paneId, kind, sessionId}\n`（:53-55）。接続は 1 秒で諦める（:59-62）。stdout に書かず、非ゼロでも終わらない（:13-14, :66-68）。
- 配り方: `P/server/src/composeServer.ts:143-144` が `../assets/agent-hook-report.cjs` を解決し、`install()` が `copyFile`（`AgentIntegrationInstaller.ts:238`）。**未確認**: 配布物への同梱（`scripts/package.mjs`）。

### F2 受け口 `P/server/src/agent/AgentReportSocket.ts`
- パス: Unix は `<stateDir>/agent-report.sock`、Windows は `\\.\pipe\soda-agent-report-<hash16>`（`P/server/src/config.ts:83-89`）。権限 `chmod 0600`（:44-50。Windows は限定なし）。
- 電文: 接続の `end` で 1 回だけ解釈（:34）。返事は書かない。上限 `MAX_LINE_BYTES = 4096`（:21。比べているのは文字数 :29）。同時接続の上限・待ちの時限は無い。
- 検査: `paneId`・`kind`・`sessionId` が string かだけ（:106-110）。handler の型は `(paneId, kind, sessionId) => void` に固定（:19）。
- pane の確かめ: socket 側には無い。`SessionService.reportAgentSession` が pane の実在を見るだけ（`P/server/src/session/SessionService.ts:1181-1183`）。名乗った pane を信じる（同じ OS の利用者の範囲）。
- **`composeServer.ts:651` が `kind === "claude" || kind === "codex"` で絞っている**（ほかの 6 種の報告は捨てられる。意図か取り残しかは未確認）。起動は復元より前（:646-654）、close は :739, :768。
- 環境変数は全 pane に入れる（`SessionService.ts:1167-1175`、`P/server/src/session/paneEnv.ts:72-75`）。

### F3 インストーラ `AgentIntegrationInstaller.ts`
- `HookSpec`（:26-36）: kind ごとに `configFile`・`hooksDir`・`binName`・`entriesPath`・`buildEntry`・`isOurs`。**`entriesPath` は 1 本だけ（SessionStart 相当の 1 イベント）。**
- claude（:97-104）: `$CLAUDE_CONFIG_DIR||~/.claude/settings.json` の `hooks.SessionStart` に `{matcher:"startup|resume", hooks:[{type:"command", command:'node "<path>" claude', async:true}]}`（:87-89, :16）。
- 目印: コマンド文字列が `soda-agent-report.cjs` を含むか（:15, :59-78）。install・uninstall・status の全部がこれで判定。
- 壊さない仕組み: 読めない JSON は書かずに断る（:170-185, :232, :252）、`setPath` が他のキーを保つ（:49-56）、配列へ追記して `writeFileAtomic`（:241-243）、uninstall は自分のエントリだけ除く（:257-260）。
- **導入済みなら `install()` は :235 で早期に戻る**（スクリプトの写し直しもエントリの追加もしない）。`status()`（:219-225）は `{cliDetected, installed}`。
- サービス `AgentIntegrationService.ts`（8 kind の status :47-53、`agent_integration.changed` :55-75）。RPC `agent_integration.status|install|uninstall|set_auto_resume`（`P/server/src/surface/methods/agentIntegration.ts:11-30`、`P/protocol/src/messages.ts:652-681`）。
- 入口: web `P/web/src/components/SettingsDialog.vue:358-388, :928-967`（説明文に「フックが1件だけ追加」）、tui `P/tui/src/settings/sections.ts:591-651`。sodactl には無い。

### F4 報告を受けた後の流れ
- `composeServer.ts:650-652` → `SessionService.reportAgentSession`（:1181-1188）→ `SessionModel.setAgentSession`（:861-866）→ `persist.touch()`。**イベントは出ない。**`session.json` に保存（`P/server/src/persist/SessionFile.ts:22, :91`）。用途は再起動後の会話の再開だけ。

### F5 エージェントの情報の型
- `AgentInfo`（`P/protocol/src/model.ts:114-134`）: `instanceId`・`kind`・`label`・`state`・`completionSeq`・`serverSeenSeq`・`verified`・`since`・`name?`。`Pane` 側（:89-97）: `agent`・`agentSession`・`tokens?`。
- `pane.agent_status_changed {paneId, agent}`（`P/protocol/src/events.ts:95-98`）。発行元 `SessionService.ts:1060`（`updatePaneRuntime`）・`:1088`。`sameAgent`（:1485-1499）が 9 項目を比べて変わったときだけ出す——**`AgentInfo` に項目を足すなら `sameAgent` にも足す。**
- 購読者: `P/server/src/graph/LocalAgentPort.ts:32`・`RemoteAgentPort.ts:190, :210`・`AgentLineage.ts:75`、web `StoreAdapter.ts:156`・`store/machines.ts:168`、tui `SessionModel.ts:190`・`MachinesModel.ts:153`、cli `agent.ts:138, :270`・`agentStart.ts:119`。
- 掃除（`SessionService.ts:1023-1068`）: 名前は同じ `instanceId` の間だけ引き継ぐ（:1049-1051）。`agent` が null になったら `agentSession` を消す（:1056-1057）。別の `instanceId` への入れ替わりでは消さない。
- `sodactl agent list/get` は snapshot から `AgentView` を作る（`P/cli/src/agentStatus.ts:41-74`、`commands/agent.ts:52-65`）。

### F6 画面
- web のサイドバーの agents の区画: `P/web/src/components/Sidebar.vue:546-567`（材料は :190-206）。行は `div.sidebar-row`（:553）で全体の click が `focusPane`。**行の中に押せる部品は無く、専用の行コンポーネントも無い。**トークンは `resolveAgentLines`（`P/client-core/src/sidebar/resolveRows.ts:107-131, :153-156`）。`ResolvedToken` は 4 種（:17-22）。組み込みのトークンの表は `P/client-core/src/sidebar/rowLayout.ts:62-83`、既定の並び :86-92、設定画面 `SidebarRowsSettings.vue`・tui `settings/sidebarRowsItems.ts`。畳んだときは状態の印だけ（:555-557）。
- グラフのノード `P/web/src/components/graph/GraphNode.vue`（項目 :83-127）。**大きさは 200×80 に固定**（`P/client-core/src/graph/geometry.ts:10-11`。線の経路の計算と共有）。`GraphNodeInfo` は `P/web/src/store/graph.ts:54-70, :319-`。親は `GraphView.vue:1521`。モバイルは `MobileGraphSheet.vue`。
- モバイル `P/web/src/mobile/PanePicker.vue:45-55, :101-110`。
- tui `P/tui/src/render/chrome/sidebar.ts:177-212`（同じ `resolveAgentLines`。当たり判定は行ごとに `{kind:"agent", paneId}` :27, :209）。
- **一覧を出す部品**: web に popover・tooltip は無い。近いのは `ContextMenu.vue`・グラフの横のパネル `HistoryPanel.vue`／`LinkPanel.vue`・`MobileGraphSheet.vue`・各 Dialog。tui は `modes/overlay.ts`・`OverlayHost.ts`・一覧の実例 `modes/NotificationList.ts`。

### F7 独自トークン（`pane.report_metadata`）に載せられるか
- 値は 80 文字の平らな文字列だけ、掃除は `pane.closed`・`workspace.closed` のときだけ（`P/server/src/metadata/MetadataService.ts:80-83`）、利用者が設定で `$名前` を置かないと出ない、グラフのノードは tokens を読まない、別のマシンの要約 `SummaryPane` は tokens を持たない（`P/web/src/store/machines.ts:32-41`）、入口は `/ws`（ログインが要る）。**載せにくい。**
- 先例: `P/server/src/graph/AgentLineage.ts:59-95`（bus を購読して pane ごとにメモリだけで持つ）。

### F8 別のマシン
- 中継は中身を解釈しない。pane の `SODA_AGENT_REPORT_SOCKET` はその pane を動かすサーバのものなので、報告はリモートのサーバへ届く（コードからの推論。実機は未確認）。フックの導入もリモートの HOME に要る。
- 選んだマシンはリモートの snapshot とイベントをそのまま受ける。選んでいないマシンは要約 `SummaryPane = {tabId, agent, label, title}`（`machines.ts:32-41, :161-173`）だけ。**`AgentInfo` に載せた情報は agent のイベントで届く。新しいイベントの種別は、`machines.ts`・tui の `MachinesModel.ts`・`RemoteAgentPort.ts` に受けを足さないと届かない。**

### F9 テストと文書
- `AgentReportSocket.test.ts`（4 件）、`AgentIntegrationInstaller.test.ts`（claude・codex :36-125、6 種 :136-269）、`P/server/assets/agent-hook-report.test.ts`（4 件）、`SessionService.test.ts:1803-1880`。**フック → socket → SessionService を通す統合テストと E2E は無い。**
- 文書: `docs/verification.md:326-355`、`docs/sodactl.md:555-563`、`docs/tui.md:29, :165`、`docs/migrate-from-wtm.md:17, :81`。`docs/machines.md` にフック連携の記述は無い。

### F10 ほかのエージェント
- 8 種とも、イベント名をキーにした配列なので、構造の上では別のイベントを足せる（`HOOK_SPECS` :96-168）。各 CLI にサブエージェント相当のイベントがあるかは未確認。6 種は実機で未検証で、報告は `composeServer.ts:651` で捨てられている。

## 設計判断に効く点

- **状態の置き場**: (a) `AgentInfo` に項目を足す（既存の配布・別のマシンの要約・グラフ・端末版にそのまま乗る。`sameAgent`・`AgentView` の更新が要る）／(b) 別のサービスと新しいイベント（独立するが、web・tui・別のマシンの要約・snapshot に受けを足す）。どちらも、agent が null・別の `instanceId` になったときの掃除を新設する。
- **導入済みの利用者に新しいフックが入らない**（`install()` の早期の戻り。`status()` は SessionStart のエントリだけで「導入済み」）。部分導入の検出と入れ直しが要る。写した先の古いスクリプトも更新されない。
- **順序**: claude のエントリは `async: true` で並行に走る。`PreToolUse` の説明と直後の `SubagentStart` を順序で対応づけると取り違えうる。
- **取りこぼし**: サーバの再起動・`soda handoff`・強制終了で `SubagentStop` が来ないと件数が残る。掃除の契機は agent が null になる・`pane.closed`。`Stop` の `background_tasks` で突き合わせる余地。
- **画面**: 行の中の押せる部品と一覧は web・tui とも新設。グラフのノードは 200×80 固定の中に入れる。
- 設定画面の文言「フックが1件だけ追加」・`docs/verification.md:330`・インストーラのテストの期待が変わる。
- 名乗りは検証されない（同じ利用者なら件数を偽れる。既存の sessionId と同じ信頼の範囲）。

## 実装アンカー

- A1 スクリプト: `P/server/assets/agent-hook-report.cjs`・`agent-hook-report.test.ts`。
- A2 受け口: `P/server/src/agent/AgentReportSocket.ts`・`composeServer.ts:646-654`。
- A3 インストーラ: `AgentIntegrationInstaller.ts:26-36, :87-104, :219-260`、`AgentIntegrationService.ts`。
- A4 型と配布: `P/protocol/src/model.ts:114-134`、`SessionService.ts:1023-1068, :1485-1499`、`P/cli/src/agentStatus.ts:41-74`。
- A5 画面: `Sidebar.vue:190-206, :546-567`、`resolveRows.ts`・`rowLayout.ts`、`GraphNode.vue`・`store/graph.ts:54-70`、tui `sidebar.ts:177-212`、`NotificationList.ts`。
- A6 設定と文書: `SettingsDialog.vue:928-967`、tui `settings/sections.ts:591-651`、`docs/verification.md:326-355`。
