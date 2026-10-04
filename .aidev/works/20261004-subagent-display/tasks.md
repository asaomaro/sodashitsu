# タスク: エージェントが起動しているサブエージェントを表示する

## 実装方針

design.md のとおり、下から積む。実物の確認（T1）→ 型（T2）→ スクリプト（T3）→ 受け口（T4）→ 数える部品（T5・T18）→ `SessionService` と配線（T6）→ インストーラと設定（T7・T19・T8）→ 共有の純関数と操作（T9）→ ブラウザ版（T10・T20・T11・T12）→ 端末版（T13）→ `sodactl`（T14）→ 統合（T15）→ E2E（T16・T21）→ 文書（T17）。

**全タスク共通**
- **何が正か**: 決まりの本文は design.md（「インターフェース / データ構造」「振る舞いの詳細」「テストの方針」）。フックの実際の動きは research.md「実物で確かめたこと」（F-H1〜F-H16）。判断の理由は `decisions.md`。
- **用語**: 報告（フックのスクリプトが受け口へ送る 1 行の JSON）、対応づけ（実行前の報告の説明を、次の起動の報告に付ける）、突き合わせ（作業の終わりの報告で、一覧を動いているものに合わせる）、検出（サーバが pane の中のエージェントを見つけること。`instanceId` が付く）。
- パッケージ間の import は `dist` 経由。`protocol`・`client-core` を変えたら `pnpm build` してから下流を見る。server は tui を参照するので、tui の型エラーは server のビルドを止める。
- `exactOptionalPropertyTypes` が有効なので、省略時はキーごと省く。`SessionModel` は副作用なし（イベントは `SessionService`）。
- 各タスクの完了で `pnpm build`・`pnpm typecheck` と該当パッケージのテストが通ること。回帰テストを足したら、実装の該当行を一時的に壊して落ちることを確かめ、**落ちたときの生の出力**を `review.md`（無ければ作る）の「タスク点検ログ」に貼る（条項 `regression-negative-control`）。E2E は条項 `e2e-observe-browser` に従う。
- **利用者の Claude Code の設定（`~/.claude/settings.json`）と、動いている 7780 のサーバには触れない。**インストーラのテストは、一時の HOME・一時の設定ファイルで行う。実物の Claude Code での確認は `claude -p … --settings <一時の設定ファイル>` で行う（利用者の設定を書き換えない）。
- **子プロセスの環境変数を必ず消す**: テストや確認で起動する子プロセス（フックのスクリプト・偽の `claude`・実物の `claude -p`・`soda`・`sodactl`）には、親から継いだ `SODA_PANE_ID`・`SODA_AGENT_REPORT_SOCKET`・`SODA_PANE_SOCKET`・`SODA_SERVER_URL` を渡さない（消してから、テストが要る値だけを明示して入れる）。この実装のセッション自身が 7780 のサーバの pane の中で動いているので、継いだままだと、テストの報告が利用者のサーバに届く。
- **ほかの作業との重なり**: `Sidebar.vue`・tui の `sidebar.ts`・キーの数を数えるテストは、別の作業（`20261004-group-worktree-items`。先に main へ入る見込み）も変える。変えるのはエージェントの行の中だけにし、行の並び・グループの描画には触れない。操作の数の期待は、その時点の main の値に 1 を足す形で直す。`SettingsDialog.vue` は `20261004-settings-side-menu` も変える（T8）。
- 設計と違う判断・確かめた事実は `decisions.md` に足す（D の番号の続き）。Node は 24。

## チェックリスト

- [x] T1: 実物の確認（製品コードは変えない）——design「依拠する既存の事実」の未確認を、`claude -p … --settings <一時の設定>` で確かめて `decisions.md` に残す: (1) `SessionEnd` の入力と発火の時機（`claude -p` の終わり。`/clear` は対話が要るので、確かめられなければ未確認のまま残す）、(2) design の表のとおりに同期・非同期を混ぜたとき、実行前 → 起動の対の順序が保たれるか、(3) フック 1 回の所要（同期のフックで Agent ツールの呼び出しとターンの終わりが何 ms 遅れるか。スクリプトが何もしないで終わる場合〔pane の外〕と、socket へ送る場合）、(4) matcher `Agent|Task` が `TaskCreate` 等に当たるか、(5) スクリプトが無い・失敗する状態でのエージェントの見え方（エラーが画面に出るか）。**結果が design と食い違う**（例: 混ぜると順序が崩れる・`SessionEnd` が無い）**なら、止まって知らせる**
      対象: `.aidev/works/20261004-subagent-display/research.md`（「実物で確かめたこと」の手順）、`decisions.md`
      依存: なし
      AC: AC1, AC9, AC12
- [x] T2: プロトコル——`SubagentInfo`・`AgentInfo.subagents?`、連携の状態の `needsUpdate?`。型のテスト（あれば）と、既存の型の利用箇所が通ること
      対象: `packages/protocol/src/model.ts`（`AgentInfo`。:114-134 付近）、`packages/protocol/src/messages.ts`（`agent_integration.status` の結果の型。:652-681 付近）
      依存: なし
      AC: AC13
- [x] T3: フックのスクリプト——`hook_event_name` で報告の種類を分ける（design「報告の電文」）。`type` つきは `kind === "claude"` のときだけ／`PreToolUse` は `tool_name` が Agent・Task のときだけ（ほかは何も送らない）／切り詰め（説明 200・種類 64）／`Stop` の `running`（`type === "subagent"` かつ `status === "running"`・128 文字を超える ID は飛ばす・64 件までで `truncated`）／`prompt`・`last_assistant_message` を送らない／知らないイベント・`hook_event_name` の無い入力は今までどおり。今の決まり（環境変数が無ければ何もしない・stdout に書かない・非ゼロで終わらない・接続 1 秒・stdin 2 秒）を保つ。単体テスト（イベントごとの電文・送らないもの・切り詰め・今までの 4 件）と壊して落ちる確認
      対象: `packages/server/assets/agent-hook-report.cjs`、`packages/server/assets/agent-hook-report.test.ts`
      依存: T1
      AC: AC1, AC5, AC12, AC13
- [x] T4: 受け口——電文を `AgentReport`（種類つき）に解釈する。上限を 32768 文字にし、サーバ側でも切り詰め・上限（説明 200・種類 64・ID 128・`running` 64 件）を掛ける。知らない `type` は捨てる。切り詰めで `running` を 64 件に削ったときは、受け口の側でも `truncated: true` を立てる（スクリプトが立てていなくても。突き合わせで「外す」を止めるため）。handler の型を `(report: AgentReport) => void` に変え、既存の 4 件のテストと `composeServer` の呼び出しを合わせる（この時点では `type: "session"` だけを今までどおり処理し、ほかは捨てる）。単体テストと壊して落ちる確認
      対象: `packages/server/src/agent/AgentReportSocket.ts`（`MAX_LINE_BYTES`・`handleLine`・`isReportPayload`・`AgentReportHandler`）、`AgentReportSocket.test.ts`、`packages/server/src/composeServer.ts:646-654`
      依存: T2
      AC: AC12, AC13
- [x] T5: `SubagentTracker`（新規）——design「振る舞いの詳細 › `SubagentTracker`」の全部: `pending`（最新の 1 件・10 秒・種類の一致）／256 件の上限（ログは pane ごとに 1 回）／`subagent_stop` と `stopped`（64 件・60 秒）／`agent_stop` の突き合わせ（外す・足す・`stopped` にあるものは足し直さない・`truncated` は足すだけ）／`session_end`。配るところは T18（この時点では、今の一覧を返す読み取りの関数まで）。時計を差し込める形にする。単体テスト（上の各項目）と壊して落ちる確認
      対象: `packages/server/src/agent/SubagentTracker.ts`（新規）、`SubagentTracker.test.ts`（新規）、手本は `packages/server/src/graph/AgentLineage.ts`（bus を購読して pane ごとにメモリで持つ形）
      依存: T4
      AC: AC1, AC2, AC5, AC8, AC16, AC17
- [x] T6: `SessionService` と配線——`setAgentSubagents(paneId, subagents | undefined): boolean`（検出されていれば差し替えて配る）、`updatePaneRuntime` の引き継ぎ（同じ `instanceId` の間、同じ参照のまま）、`sameAgent` に `subagents` の参照の比較。`composeServer` で `SubagentTracker` を作り、受け口の `type` つきの報告（`kind === "claude"` だけ）を渡し、停止で `close`。`agent` を保存していないことを確かめる。単体テスト（周期の更新・`renameAgent` で落ちない・入れ替わりで消える・検出が無いと false）と壊して落ちる確認
      対象: `packages/server/src/session/SessionService.ts`（`updatePaneRuntime` :1023-1068・`renameAgent`・`sameAgent` :1485-1499）、`packages/server/src/composeServer.ts:646-654`（受け口の配線）と停止の並び、`packages/server/src/session/SessionService.test.ts`
      依存: T18
      AC: AC1, AC7, AC15
- [x] T7: インストーラ——`HookSpec` に追加のエントリ（claude だけ: `PreToolUse`・`SubagentStart`・`Stop` は同期で `timeout: 5`、`SubagentStop`・`SessionEnd` は `async: true`）。`status()` の `needsUpdate`（エントリの不足・スクリプトの違い。同梱が読めないときは false。追加のエントリを持たない kind は常に false）。`install()` は足りない分だけ足す（スクリプトを写し直す・既にあるものは重ねない・利用者のほかのフックを保つ・経路が配列でなければ断る）。`uninstall()` は T19。単体テスト（一時の HOME。旧版の導入済み → `needsUpdate` → 更新／既存のフックを保つ／`SessionStart` だけ手で消した状態／ほかの 7 種／同梱が読めない／経路が配列でない／既存の「既に導入済みです」）と壊して落ちる確認
      対象: `packages/server/src/agent/AgentIntegrationInstaller.ts`（`HookSpec` :26-36・`HOOK_SPECS` :96-168・`status`／`install` :219-262）、`AgentIntegrationInstaller.test.ts:36-125, :136-269`
      依存: T2, T3
      AC: AC9, AC10
- [x] T8: 設定画面（ブラウザ版・端末版）——連携の行に、`needsUpdate` のとき「更新が必要」と［更新］（`agent_integration.install` を呼ぶ）。説明の文言を直す（Claude Code はフックが 6 つ入ること・サブエージェントの表示に使うこと・更新と削除は、その後に起動した Claude Code から効くこと）。単体テスト。**別の作業（`20261004-settings-side-menu`）も `SettingsDialog.vue` を変えるので、変えるのは「エージェント連携」の節の中だけにする**
      対象: `packages/web/src/components/SettingsDialog.vue:358-388, :926-968`、`packages/web/src/store/agentIntegrations.ts`、`packages/web/src/actions/ActionDispatcher.ts:632-646`、`packages/web/src/components/SettingsDialog.test.ts`、`packages/tui/src/settings/sections.ts:591-651`
      依存: T19
      AC: AC9, AC10, AC14
- [x] T9: 共有の純関数と操作——経過時間の文言（秒・分・時間。負は 0 秒）と「ほか n 件」、`{machineId, paneId}` からエージェントの情報を引く関数の**型**を `client-core` に置く（実体は画面ごと。web は T10 でストアに作る〔サイドバーは `machines.selectedId` のマシン、グラフはノードのマシン〕。tui は T13）。操作 `show_subagents`（既定のキーなし）を `actions.ts`・`bindings.ts` に足し、web と tui の dispatcher に受け口を置く（動きは T10・T13。型検査を通すため）。設定の「キー」の一覧とキー一覧に出す。既存のテストの期待（操作の数）を直す
      対象: `packages/client-core/src/agent/`（新しい純関数の置き場。`stateIndicator.ts` の隣）、`packages/client-core/src/keys/actions.ts`・`bindings.ts`（`defaults: []` の操作の手本）、`packages/web/src/actions/ActionDispatcher.ts`、`packages/tui/src/actions/TuiDispatcher.ts`、キーの設定の一覧（web の `KeySettings`・tui の `keySection.ts`）とそのテスト
      依存: T2
      AC: AC4, AC-I3
- [x] T10: ブラウザ版のサイドバー——エージェントの行の 1 行目の右端に件数のボタン（1 件以上のとき。アイコン＋数・読み上げ用の名前。`pointerdown`・`click` を行へ伝えない。畳んだサイドバーでは出さない。行の高さを変えない）。`view.dialogContext` の種類 `subagents`（`machineId`・`paneId`）と `SubagentListDialog.vue`（題・各行・「ほか n 件」・0 件の文言・10 秒ごとの経過時間・上下キーでスクロール・背景のクリック／`Esc`／［閉じる］で閉じる・対象が居なくなった／入れ替わった／pane が閉じたら閉じる）。`{machineId, paneId}` からエージェントの情報を引く関数の実体をストアに作る（T9 の型）。閉じたときのフォーカスと操作 `show_subagents` は T20。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/Sidebar.vue:190-206, :546-567`（エージェントの行）、`packages/web/src/components/SubagentListDialog.vue`（新規。手本は `ConfirmDialog.vue` の `<dialog>` の形）、`packages/web/src/store/view.ts:285-286, :502-523`（`DialogContext`・`closeDialog`）、`packages/web/src/App.vue:62-93`（ダイアログの置き場）、`packages/web/src/actions/ActionDispatcher.ts`、`packages/web/src/components/Sidebar.test.ts`
      依存: T6, T9
      AC: AC1, AC2, AC5, AC17, AC-I1, AC-I2, AC-I5
- [x] T11: ブラウザ版のグラフ——ノードのエージェントの行の右に件数のボタン（`tabindex="-1"`。ノードの大きさは変えない。別のマシンのノードは要約から件数を引く。読み取り専用のモバイルのグラフでは数だけで、押せない）。グラフの中の一覧 `SubagentPanel.vue`（`HistoryPanel` と同じ横のパネル。開く入口はボタンのクリックと、ノードを選んでいるときのキー `s`〔既存のノードのキーと重ならないことを確かめる〕。`escape()` の段に足す。閉じるとノードへフォーカスが戻る。対象が居なくなったら閉じる）。ボタンの `pointerdown`・`click` がノードの選択・ドラッグ・線の作成を始めない。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/graph/GraphNode.vue:83-130`、`packages/web/src/components/graph/GraphView.vue:1120-1163, :1376-1408`（キーと `escape()`）、`packages/web/src/components/graph/HistoryPanel.vue`（手本）、`packages/web/src/store/graph.ts:54-70, :319-360`（`GraphNodeInfo`）、`packages/web/src/store/machines.ts:36-45`（要約）、`packages/client-core/src/graph/geometry.ts:10-11`（大きさは変えない）
      依存: T20
      AC: AC3, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [x] T12: 別のマシンのエージェントの引き方の確認——選んでいるマシンのエージェントの行（サイドバー）と、選んでいないマシンのノード（グラフ）で、件数と一覧が `{machineId, paneId}` から正しく引けること（pane の ID が衝突する 2 つのマシンで取り違えない）。新しい画面×古いサーバ（`subagents` が無い）で何も出ず、ほかの表示が変わらないこと。単体テスト（ストアの 2 つのマシン）と壊して落ちる確認
      対象: `packages/web/src/store/machines.ts:36-45, :161-173`、`packages/web/src/store/graph.ts:319-360`、`packages/web/src/store/session.ts`、手本は `packages/server/src/machine/machines.integration.test.ts`（2 つの `soda serve` の統合テスト）
      依存: T11
      AC: AC3, AC6, AC13
- [x] T13: 端末版——エージェントの行の末尾に `⤷n`（1 件以上。記号の幅が崩れるなら別の記号にして `decisions.md` に残す）と、その桁範囲のクリックの当たり判定。一覧の overlay（`NotificationList` と同じ形。上下で読む・`Esc` で閉じる・対象が居なくなったら閉じる）。操作 `show_subagents` の動き（既定のキーは無い。キーボードだけの道筋は、pane のメニューをキーで開いて項目を選ぶ、または利用者が設定でキーを割り当てる。この道筋を単体テストで通す）と、pane のメニューの項目「サブエージェントの一覧」（1 件以上のとき）。単体テストと壊して落ちる確認
      対象: `packages/tui/src/render/chrome/sidebar.ts:177-212`（エージェントの行。桁範囲の当たり判定の手本は `sort`・`toggleX`）、`packages/tui/src/modes/NotificationList.ts`・`modes/overlay.ts`・`OverlayHost.ts`、`packages/tui/src/model/UiState.ts`、`packages/tui/src/modes/ContextMenu.ts`、`packages/tui/src/app/TuiApp.ts`、`packages/tui/src/actions/TuiDispatcher.ts`、`packages/tui/src/input/mouse.ts`
      依存: T6, T9
      AC: AC6, AC-I1, AC-I3, AC-I4, AC-I5
- [x] T14: `sodactl`——`AgentView.subagents`（`AgentInfo.subagents` が無ければ `null`。あれば `{count, items}` で、各項目は `{id, type, description, background, startedAt}`。分からない値は `null`）。単体テスト
      対象: `packages/cli/src/agentStatus.ts:41-74`、`packages/cli/src/commands/agent.ts:52-65`、`packages/cli/src/agentStatus.test.ts`
      依存: T2
      AC: AC11
- [x] T15: 統合テスト——実物のスクリプトを子プロセスで起動（stdin にフックの入力・環境変数に `SODA_PANE_ID` と受け口のパス）→ 実 socket → `SubagentTracker` → `SessionService` → bus の `pane.agent_status_changed` と snapshot。場面: 起動 → 終了／実行前の報告つき（説明が付く）／作業の終わりの突き合わせ（外す・残る・足す）／セッションの終了／検出より前の報告と最初の検出／エージェントの入れ替わり／2 つの接続に同じ件数・読み込み直し（新しい接続の snapshot に載る）／同じ内容の報告でイベントが増えない・20 件を続けても 100 ミリ秒に 1 回まで／古い形の電文（`type` なし）で会話の再開が今までどおり／サーバのログに説明の中身が出ない。壊して落ちる確認
      対象: `packages/server/src/`（新規の `*.integration.test.ts`。手本は `composeServer.lineage.integration.test.ts`〔実 PTY の偽 `claude` で検出を作る〕と `packages/server/assets/agent-hook-report.test.ts`）
      依存: T6, T3
      AC: AC1, AC7, AC8, AC12, AC13, AC15, AC16
- [ ] T16: E2E（実物の Claude Code は使わない）——偽の `claude` を pane で動かして検出させ、テスト側から `agent-report.sock` へ電文を送る。ブラウザで観測: 件数が出る・増減する・消える／ボタンを押しても pane へ移らない／一覧（各行・経過時間・0 件の文言・「ほか n 件」）／`Tab` → `Enter` → 上下 → `Esc` とフォーカスの戻り先／対象が居なくなると閉じる／短い説明に HTML を書いても動かない。グラフと、キー・ホイールの漏れは T21。偽の `claude` とテストの電文は、テストが立てたサーバの `stateDir` の `agent-report.sock` だけに送る（環境変数から受け口を拾わない）。観測を壊して落ちる確認。2 回続けて同じ結果
      対象: `packages/e2e/src/specs/subagents.spec.ts`（新規）、手本は `packages/e2e/src/specs/agent-detection.spec.ts`（偽のエージェントの検出）・`ask-form-index.spec.ts`（フォーカスとキーの見方）、`packages/e2e/src/support/appServer.ts`（`stateDir`）
      依存: T20, T15
      AC: AC1, AC2, AC4, AC12, AC17, AC-I1, AC-I2, AC-I3, AC-I4
- [ ] T17: 文書——`docs/agent-graph.md`（件数と一覧・グラフのノード・キー `s`）、`docs/sodactl.md`（`agent list`／`get` の `subagents`・フック連携の報告）、`docs/tui.md`・`docs/tui-parity.md`（件数・一覧・`show_subagents`）、`docs/machines.md`（別のマシンはそのマシンに導入が要る）、`docs/migrate-from-wtm.md`（フックの記述）、`docs/verification.md`（実機の手順: 実物の Claude Code での一巡〔前面・バックグラウンド・並行〕・導入と更新・Windows。自動テストで確かめた範囲と分ける）、`packages/cli/skills/sodactl/SKILL.md`。対象外と制約（Claude Code だけ・チームメイトや Workflow は専用の表示なし・再起動で消える・0 件と「分からない」を画面では区別しない・上限・更新は起動し直した後から効く・強制終了されたセッションの分は残りうる）を書く。`skill.test.ts` が通ること
      対象: `docs/agent-graph.md`、`docs/sodactl.md:344-424, :555-563`、`docs/tui.md:29, :165`、`docs/tui-parity.md`、`docs/machines.md`、`docs/migrate-from-wtm.md:17, :81`、`docs/verification.md:326-355`、`packages/cli/skills/sodactl/SKILL.md`、`packages/cli/src/skill.test.ts`
      依存: T21, T8, T13, T14
      AC: AC14
- [x] T18: `SubagentTracker` の配る側——`{count, items: 先頭 64 件}`・同じ内容は配らない・最初の変化から 100 ミリ秒にまとめる・配れたときだけ記録／検出との順序（無し → X は配り直す・X → null と X → Y と `pane.closed` は捨ててタイマーも取り消す）。タイマーを差し込める形にする。単体テストと壊して落ちる確認
      対象: `packages/server/src/agent/SubagentTracker.ts`、`SubagentTracker.test.ts`
      依存: T5
      AC: AC1, AC7, AC15, AC16
- [x] T19: インストーラの削除と配布——`uninstall()` は全経路から除く（どの経路にも無いときだけ「未導入でした」）、スクリプトは何もしない中身に差し替える（T1 の (5) で害が無いと分かれば、今までどおり消す。どちらにしたかを `decisions.md` に残す）。`AgentIntegrationService` が `needsUpdate` を配る。**配布物の確認**: `scripts/package.mjs` が `packages/server/assets`（フックのスクリプト）を配布物に入れているかを確かめ、入っていなければ入れる（入れないと、配布した `soda` では同梱のスクリプトが読めず、導入も `needsUpdate` も働かない。今の導入がどう動いているかも確かめて `decisions.md` に残す）。単体テスト（全経路の削除・どの経路にも無い・サービスが `needsUpdate` を配る）と壊して落ちる確認
      対象: `packages/server/src/agent/AgentIntegrationInstaller.ts`（`uninstall`）、`AgentIntegrationService.ts:47-75`、`AgentIntegrationInstaller.test.ts`、`scripts/package.mjs`
      依存: T7
      AC: AC9, AC10
- [x] T20: ブラウザ版の一覧のフォーカスと操作——閉じたときのフォーカス（ボタン → 行〔`tabindex="-1"`〕→ 端末）、操作 `show_subagents` の動き（フォーカスのある pane のエージェントの一覧を開く。0 件・エージェントなしのときの動きは design のとおり）。単体テストと壊して落ちる確認
      対象: `packages/web/src/components/SubagentListDialog.vue`、`packages/web/src/components/Sidebar.vue`、`packages/web/src/actions/ActionDispatcher.ts`、`packages/web/src/store/view.ts`
      依存: T10
      AC: AC4, AC-I3, AC-I4
- [ ] T21: E2E（グラフと漏れ）——グラフのノードの件数とパネル（クリック・キー `s`・`Esc` の順・閉じた後のフォーカス）／サイドバーの一覧とグラフのパネルの上でのキー・ホイールが端末へ漏れない。観測を壊して落ちる確認。2 回続けて同じ結果
      対象: `packages/e2e/src/specs/subagents.spec.ts`（T16 に足す）
      依存: T16, T11, T12
      AC: AC3, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
