# 仕様: エージェントが起動しているサブエージェントを表示する

## 概要

Claude Code のフック（`PreToolUse`〔Agent〕・`SubagentStart`・`SubagentStop`・`Stop`・`SessionEnd`）を、今のフック連携と同じスクリプト・同じ受け口（`agent-report.sock`）で受ける。サーバの新しい部品 `SubagentTracker` が、pane とセッションごとに実行中のサブエージェントをメモリに持ち、結果を **`AgentInfo.subagents`**（エージェントの情報の新しい省略可能な項目）に載せる。配布は既存の `pane.agent_status_changed` に乗るので、ブラウザ版・端末版・別のマシンの要約・連携のグラフ・`sodactl` に、新しいイベントなしで届く。画面は、エージェントの行とグラフのノードに件数のボタンを出し、押すと一覧を開く。

## 設計方針

- **状態は `AgentInfo` に載せる**（research.md「設計判断に効く点」の (a)）。別のサービスと新しいイベントにすると、web・tui・別のマシンの要約（`SummaryPane.agent`）・グラフ・再接続時の初期値のすべてに受けを足すことになる。`subagents` だけが変わるイベントで誤動作する購読者は無い（`TriggerState`・`GraphEngine`・`AgentLineage`・通知・cli の待ちは、`instanceId`・`state`・`completionSeq` だけを見る。名前だけが変わるイベントという先例もある。design の点検で確認）。
- **数える部品はサーバの `SubagentTracker` に分ける**。`SessionService` には「この pane のエージェントの `subagents` を差し替える」入口 1 つだけを足す。
- **フックごとに同期・非同期を決める**:

  | フック | 動かし方 | 理由 |
  |---|---|---|
  | `PreToolUse`（Agent） | 同期 | 実行前 → 起動の報告が対になって順に届くようにする（research.md「F-H9」） |
  | `SubagentStart` | 同期 | 同上 |
  | `Stop` | 同期 | 次のターンの起動の報告より後に届くと、今起動したものを突き合わせで外してしまうため |
  | `SubagentStop` | 非同期（`async: true`） | 順序に頼らない（下の「最近終了した ID」で、遅れて届いても足し直さない） |
  | `SessionEnd` | 非同期 | 順序に頼らない |
  | `SessionStart` | 非同期（今のまま） | — |

  同期のフックは、Agent ツールの呼び出しとターンの終わりごとに node を 1 回起動する（pane の外の Claude Code でも起動し、環境変数が無いのですぐ終わる）。所要を実物で測る（非機能「ふだんは 0.3 秒以内」）。同期と非同期を混ぜたときに対の順序が保たれることも実物で確かめる。
- **報告の種類はスクリプトが決める**（フックの入力の `hook_event_name` を見る）。フックのコマンドは今と同じ `node "<script>" claude` の 1 つ（インストーラの目印の判定がそのまま使える）。
- **電文は今の形に項目を足すだけ**。`{paneId, kind, sessionId}` に `type` と中身を足す。`type` の無い電文は、今までどおりセッション ID の報告。古いサーバは `type` を知らず、3 項目が揃えばセッション ID の報告として扱う（同じセッション ID を上書きするだけ）。
- **上限はスクリプトとサーバの両方で掛ける**（受け口は名乗りを検証しないので、スクリプトの切り詰めだけに頼らない）。
- **導入済みの利用者の設定ファイルは、利用者が押すまで書き換えない**。状態に `needsUpdate` を足し、設定画面が「更新が必要」と出す。更新は、今の `install` の入口を「足りないものを足す」ように直して使う。
- **一覧の出し方は、置き場所ごとに既存の仕組みに合わせる**: サイドバーからは `view.dialogContext` の新しい種類（ほかのダイアログと同じ）。連携のグラフの中では、グラフの `<dialog>` の中に重ねる横のパネル（`HistoryPanel` と同じ形）——グラフの上で `view.dialogContext` を使うと、グラフ画面の文脈と戻り先が上書きされるため、既存のコードは意図して避けている（`GraphConfirm.vue:3-4`）。端末版は一覧の overlay。
- **代替案を退けた理由**: 独自トークンに載せる → 値が 80 文字の平らな文字列だけ・エージェント終了で消えない・グラフが読まない（research.md「F7」）／`PostToolUse` で ID と説明を揃える → 前面の実行では完了後にしか来ない（「F-H10」）／サイドバーの行の並びの設定（トークン）に件数を足す → 利用者が置かないと出ない。

## 対象範囲

- スクリプト: `packages/server/assets/agent-hook-report.cjs`・`agent-hook-report.test.ts`。
- サーバ: `packages/server/src/agent/AgentReportSocket.ts`・`AgentReportSocket.test.ts`・`SubagentTracker.ts`（新規）・`AgentIntegrationInstaller.ts`・`AgentIntegrationInstaller.test.ts`・`AgentIntegrationService.ts`、`packages/server/src/session/SessionService.ts`、`packages/server/src/composeServer.ts`。
- プロトコル: `packages/protocol/src/model.ts`（`SubagentInfo`・`AgentInfo.subagents?`）、`messages.ts`（連携の状態の `needsUpdate?`）。
- 共有: `packages/client-core/src/agent/`（経過時間の文言・「ほか n 件」の純関数）、`packages/client-core/src/keys/actions.ts`・`bindings.ts`（操作 `show_subagents`）。
- ブラウザ版: `Sidebar.vue`（エージェントの行）、新しい `SubagentListDialog.vue`、`store/view.ts`、`actions/ActionDispatcher.ts`、`components/graph/GraphNode.vue`・`GraphView.vue`・新しい `graph/SubagentPanel.vue`・`store/graph.ts`、`SettingsDialog.vue`（連携の節）。
- 端末版: `render/chrome/sidebar.ts`、一覧の overlay（新規）、`model/UiState.ts`、`modes/ContextMenu.ts`、`app/TuiApp.ts`、`actions/TuiDispatcher.ts`、`settings/sections.ts`。
- CLI: `packages/cli/src/agentStatus.ts`（`AgentView.subagents`）。
- 文書: `docs/agent-graph.md`・`docs/sodactl.md`・`docs/tui.md`・`docs/tui-parity.md`・`docs/machines.md`・`docs/verification.md`・`docs/migrate-from-wtm.md`（フック連携に触れている所）・`packages/cli/skills/sodactl/SKILL.md`。設定画面の説明の文言（ブラウザ版・端末版）。

## 依拠する既存の事実

出所は research.md（節名と file:line。`P` = `packages`）。

- フックの入力（research.md「F-H1」〜「F-H16」。Claude Code 2.1.289 で主エージェントが 3 回実行して確かめた）: `SubagentStart` は `agent_id`・`agent_type`・`session_id`。`SubagentStop` は `agent_id`。`PreToolUse`（Agent）は `tool_name: "Agent"`・`tool_input.{description, subagent_type, run_in_background}`。**`Stop` の `background_tasks` は `[{id, type, status, description, agent_type}]` で、動いているバックグラウンドのサブエージェントは `type: "subagent"`・`status: "running"`、`id` は `agent_id` と同じ値**（「F-H13」）。同期のフックでは、実行前 → 起動が対になって順に来る（「F-H9」）。フックのプロセスに `SODA_PANE_ID` が引き継がれる。`matcher: ""` で `SubagentStart`・`SubagentStop`・`Stop` が発火する（「F-H16」）。ID は観測した範囲で 17 文字。
- スクリプト（research.md「F1」。全文を読んで確認）: 引数は kind だけ、stdin から `session_id || sessionId` だけを使い、`{paneId, kind, sessionId}\n` を 1 接続で送る。stdout に書かない。接続 1 秒・stdin 2 秒で打ち切る。
- 受け口（research.md「F2」。読んで確認）: 接続の `end` で 1 回解釈、上限 `MAX_LINE_BYTES = 4096`、検査は 3 項目が文字列か、handler は `(paneId, kind, sessionId) => void`。`composeServer.ts:651` が `claude`・`codex` だけを通す。
- インストーラ（research.md「F3」。`status`・`install`・`uninstall` を読んで確認）: `HookSpec.entriesPath` は 1 本。claude は `hooks.SessionStart` に `{matcher:"startup|resume", hooks:[{type:"command", command:'node "<path>" claude', async:true}]}`。目印はコマンド文字列が `soda-agent-report.cjs` を含むこと。**導入済みなら `install()` は早期に戻る。`uninstall()` は `entriesPath` に自分のエントリが無いと「未導入でした」で戻り、あれば除いてスクリプトを消す。**
- `AgentInfo`（`P/protocol/src/model.ts:114-134`）、`sameAgent`（`SessionService.ts:1485-1499`）、名前の引き継ぎ（同じ `instanceId` の間だけ。`:1049-1051`）。`AgentMonitor` の 2 経路（`judge`・`markSeen`）はどちらも `updatePaneRuntime` を通る。`renameAgent` は `{...agent}` で写す（design の点検で確認）。`agent` は保存していない（`SessionFile.ts` は `agentSession` だけ）。
- 別のマシンの要約 `SummaryPane = {tabId, agent, label, title}`（`P/web/src/store/machines.ts:36-45`）。**pane の ID はマシンをまたいで衝突する**（`P/web/src/notify/NotificationController.ts` の `resetForMachineSwitch` の注記）。
- 画面: エージェントの行は `Sidebar.vue:546-567`（`tabindex` の無い `div`。行全体の click が `focusPane`。click しか無く、右クリック・ドラッグは無い）。グラフのノード `GraphNode.vue:99-130`（中のボタンは全部 `tabindex="-1"`。ノードの `Enter` は「pane へ」）。グラフ画面は自前の `<dialog>` と `escape()` の段（`GraphView.vue:1120-1163, :1376-1408`）。`modalOpen` の間、window の keydown は何もしない（`P/web/src/main.ts:465-470`）。`closeDialog()` が戻すのは `focusedPaneId` だけ（`store/view.ts:502-523`）。
- 端末版: 桁範囲の当たり判定（`sidebar.ts` の `sort`・`toggleX`）、既定のキーなしの操作（`bindings.ts` の `defaults: []`）、pane のメニュー（`modes/ContextMenu.ts`）、一覧の overlay（`modes/NotificationList.ts`・`UiState` の `notifications`）が実在する（design の点検で確認）。
- 設定画面の連携の節: `SettingsDialog.vue:358-388, :928-967`、端末版 `settings/sections.ts:591-651`（文言「押すと本製品のフックを入れます（状態の検出・セッションの再開に使います）」）。
- E2E の偽のエージェント: `packages/e2e/src/specs/agent-detection.spec.ts`（検出の仕組み）。
- **未確認**（タスクの中で実物で確かめる。結果を `decisions.md` に残す）:
  - `SessionEnd` のフックの入力と、いつ発火するか（`/clear`・終了・`claude -p` の終わり）。`/clear` でセッションの ID が変わるか。
  - 同期と非同期のフックを混ぜたとき、実行前 → 起動の対の順序が保たれるか。フック 1 回の所要。
  - 動いている Claude Code が、設定ファイルの変更（フックの追加・削除）をいつ読み直すか。スクリプトが無い・失敗する状態での見え方。
  - matcher `Agent|Task` が、`TaskCreate` 等の別のツールにも当たるか（当たってもスクリプトは `tool_name` を見て何も送らない）。
  - チームメイト・Workflow・入れ子のサブエージェントが `SubagentStart` を出すか。強制終了で `SubagentStop` が来るか。`background_tasks` の `type`・`status` のほかの値。
  - 配布物へのスクリプトの同梱（`scripts/package.mjs`）。

## インターフェース / データ構造

### 報告の電文（スクリプト → 受け口。1 接続に 1 行の JSON）

```jsonc
{"paneId","kind","sessionId"}                                                // セッションの開始（今のまま。type なし）
{…,"type":"subagent_pending","description"?, "agentType"?, "background"?}     // PreToolUse（tool_name が Agent か Task のときだけ）
{…,"type":"subagent_start","agentId","agentType"?}                           // SubagentStart
{…,"type":"subagent_stop","agentId"}                                         // SubagentStop
{…,"type":"agent_stop","running":[{"id","agentType"?,"description"?}], "truncated"?: true}   // Stop
{…,"type":"session_end"}                                                      // SessionEnd
```

- スクリプトは `hook_event_name` で分ける。`type` つきの報告を送るのは `kind === "claude"` のときだけ。`PreToolUse` で `tool_name` が Agent・Task でなければ**何も送らない**。知らないイベント・`hook_event_name` が無い入力は、今までどおりセッション ID の報告。
- 切り詰め（スクリプト）: `description` は 200 文字、`agentType` は 64 文字。`running` は `background_tasks` のうち `type === "subagent"` かつ `status === "running"` のものだけで、128 文字を超える `id` は飛ばし、**64 件まで**（超えたら `truncated: true`）。`prompt`・`last_assistant_message` は読まない・送らない。
- 受け口: 上限を 32768 文字にする（`running` 64 件 × 〔ID 128 + 種類 64 + 説明 200 + 構造〕が収まる）。**受け口でも同じ上限を掛ける**（`description` を 200・`agentType` を 64 に切る／`agentId` が 128 文字を超える電文は捨てる／`running` は 64 件まで・128 文字を超える ID の項目は飛ばす）。`type` が知らない値の電文は捨てる。

### プロトコル

```ts
interface SubagentInfo {
  id: string;
  type?: string;          // サブエージェントの種類。分からなければ項目なし
  description?: string;
  background?: boolean;   // 分からなければ項目なし
  startedAt: number;      // サーバが起動（または突き合わせ）の報告を受けた時刻（epoch ms）
}
interface AgentInfo {
  // …既存…
  /** 実行中のサブエージェント。報告を一度も受けていない検出では項目なし（＝分からない）。受けたことがあれば持つ（0 件なら count: 0）。
   *  items は起動した順で最大 64 件、count は実際の数。 */
  subagents?: { count: number; items: SubagentInfo[] };
}
// agent_integration.status の各 kind に needsUpdate?: boolean
```

### サーバ

```ts
type AgentReport =
  | { type: "session"; paneId; kind; sessionId }
  | { type: "subagent_pending"; paneId; kind; sessionId; description?; agentType?; background? }
  | { type: "subagent_start"; paneId; kind; sessionId; agentId; agentType? }
  | { type: "subagent_stop"; paneId; kind; sessionId; agentId }
  | { type: "agent_stop"; paneId; kind; sessionId; running: { id; agentType?; description? }[]; truncated: boolean }
  | { type: "session_end"; paneId; kind; sessionId };
type AgentReportHandler = (report: AgentReport) => void;

class SubagentTracker {   // packages/server/src/agent/SubagentTracker.ts（新規）
  constructor(deps: { bus; agentInstanceOf(paneId): string | null; publish(paneId, subagents | undefined): boolean; now(): number; setTimer; clearTimer; logger });
  report(r: Exclude<AgentReport, { type: "session" }>): void;
  close(): void;
}
// SessionService
setAgentSubagents(paneId, subagents: AgentInfo["subagents"] | undefined): boolean;   // 配れた（エージェントが検出されている）なら true
```

## 振る舞いの詳細

### `SubagentTracker`（メモリだけ）

- 状態: pane ごとに、(a) セッションごとの `items`（ID → `SubagentInfo`。起動した順）・`pending`（対応づけを待つ実行前の報告）・`stopped`（最近終了の報告を受けた ID。64 件・60 秒まで）、(b) 「報告を受けたことがある」印、(c) 最後に見た `instanceId`（無し／X）、(d) 最後に**配れた**値、(e) まとめ待ちのタイマー。
- `subagent_pending`: そのセッションの `pending` を**この 1 件だけにする**（古いものは捨てる。対で届くので、残っているのは起動に至らなかったもの）。
- `subagent_start`: `pending` があり、10 秒以内で、種類が一致する（どちらかに種類が無ければ一致とみなす）なら対応づけて取り出す。無ければ説明なし・`background` なし。pane の ID の合計が 256 件に達していたら数えない（ログに pane ごとに 1 回）。同じ ID が既にあれば何もしない。
- `subagent_stop`: その ID を外し、`stopped` に入れる。無くても `stopped` には入れる。
- `agent_stop`: `truncated` でなければ、そのセッションの `items` のうち `running` に無い ID を外す。`running` にあって `items` に無く、**`stopped` にも無い** ID を `{id, type, description, background: true, startedAt: 今}` で足す（256 件の上限に従う）。`truncated` のときは足すだけで、外さない。そのセッションの `pending` を空にする。
- `session_end`: そのセッションの状態を全部捨てる。
- どの報告でも、pane の「受けたことがある」印を立てる。
- **配る**: pane の全セッションの `items` を起動した順に並べ、`{count, items: 先頭 64 件}` を作る。最後に配れた値と中身が同じなら何もしない。違えば、**最初の変化から 100 ミリ秒後**に、その時点の値を `publish` する（待ちを延ばさない）。`publish` が true を返したときだけ「最後に配れた値」を更新する。
- **検出との順序**: bus の `pane.agent_status_changed` を購読し、pane ごとの「最後に見た `instanceId`」を保つ。
  - 無し → X（最初の検出。サーバの再起動・`soda handoff` の直後を含む）: 状態を**捨てず**、その場で配り直す（検出より前に届いた報告を失わない）。
  - X → null、X → Y: その pane の状態を全部捨て、まとめ待ちのタイマーも取り消す（古い一覧が新しい検出に付かない）。新しい検出は `subagents` を持たない（＝分からない）ところから始まる。
  - `pane.closed`: 全部捨てる。
- **対象の絞り込み**: `composeServer` の配線で、`type` つきの報告は `kind === "claude"` だけを `SubagentTracker` へ渡す。セッション ID の報告の絞り込み（`claude`・`codex`）は今のまま。

### `SessionService`

- `setAgentSubagents`: その pane にエージェントが検出されていれば、`agent` の `subagents` を差し替え（`undefined` なら外し）、`sameAgent` で変わっていれば `pane.agent_status_changed` を配って true。検出されていなければ何もせず false。
- `updatePaneRuntime`: 同じ `instanceId` の間、`subagents` を**同じ参照のまま**引き継ぐ（名前と同じ場所）。`sameAgent` は `subagents` を参照の一致（`===`）で比べる（周期の更新のたびに 64 件を比べない）。

### インストーラ

- `HookSpec` に、追加のエントリの一覧（イベントのキーの経路と、エントリの組み立て）を足す。claude だけが持つ:

  | 経路 | エントリ |
  |---|---|
  | `hooks.PreToolUse` | `{matcher: "Agent\|Task", hooks: [{type: "command", command, timeout: 5}]}` |
  | `hooks.SubagentStart` | `{matcher: "", hooks: [{type: "command", command, timeout: 5}]}` |
  | `hooks.Stop` | 同上 |
  | `hooks.SubagentStop` | `{matcher: "", hooks: [{type: "command", command, async: true}]}` |
  | `hooks.SessionEnd` | 同上 |

  `SessionStart` のエントリは今のまま。
- `status()`: `installed` は今までどおり（`SessionStart` に自分のエントリがある）。`needsUpdate` は、`installed` で、(a) 追加のエントリのどれかの経路に自分のエントリが無い、または (b) 追加のエントリを持つ kind で、写した先のスクリプトが無い・読めない・同梱のスクリプトと中身が違う。同梱のスクリプトが読めないときは `false`（押しても直らない「更新が必要」を出さない）。追加のエントリを持たない kind は常に `false`。
- `install()`: `installed` かつ `needsUpdate` でなければ「既に導入済みです」。それ以外は、スクリプトを写し直し、足りない経路にだけ自分のエントリを足す（既にあるものは重ねない。利用者のほかのフックは保つ）。経路の値が配列でないときは、何も変えずに断る（設定ファイルを解釈できない場合と同じ扱い）。
- `uninstall()`: **どの経路にも自分のエントリが無いときだけ**「未導入でした」。それ以外は、全経路から自分のエントリを除く。写したスクリプトは消さずに、**何もしない中身に差し替える**（動いている Claude Code が古いフックのまま、同期のフックで無いスクリプトを起動して失敗し続けるのを避ける。次の導入で本物に写し直す。「未確認」の 3 つ目を確かめ、害が無いと分かれば今までどおり消す）。

### 設定画面（ブラウザ版・端末版）

- 連携の行に、`needsUpdate` のとき「更新が必要」と［更新］（`agent_integration.install` を呼ぶ）を出す。
- 説明の文言を直す: Claude Code はフックが 6 つ入ること・サブエージェントの表示に使うこと・更新と削除は、その後に起動した Claude Code から効くこと。

### ブラウザ版

- **件数のボタン**: エージェントの行の 1 行目の右端に、`subagents.count >= 1` のときだけ出す（アイコン＋数。読み上げ用の名前「サブエージェント n 件を表示」）。`pointerdown`・`click` は行へ伝えない。畳んだサイドバーでは出さない。行の高さは変えない。
- **どのエージェントか**: pane の ID はマシンをまたいで衝突するので、一覧の対象は `{machineId, paneId}`（手元は `local`）で持つ。中身は、選んでいるマシンのものは session のストアから、そうでないものは要約（`SummaryPane.agent`）から引く（1 つの関数にまとめる）。
- **サイドバーからの一覧**: `view.dialogContext` に種類 `subagents`（`machineId`・`paneId`）を足し、`SubagentListDialog.vue`（ほかのダイアログと同じ `<dialog>` の形。背景のクリック・`Esc`・［閉じる］で閉じる）を開く。題は「サブエージェント — <pane の呼び名>」。各行は、種類・短い説明・経過時間・バックグラウンドの印。64 件を超えたら末尾に「ほか n 件」。0 件なら「実行中のサブエージェントはありません」（開いたまま）。経過時間は 10 秒ごとに進める。一覧は `tabindex` を持つ 1 つの領域で、上下キーでスクロールする。
  - ダイアログ自身が対象のエージェントを監視し、居なくなった・`instanceId` が変わった・pane が閉じたら閉じる。
  - **閉じたときのフォーカス**: 開いたボタンがまだあればボタン。無ければ、その行（行に `tabindex="-1"` を付ける）。行も無ければ端末（`closeDialog()` の今の動き）。
- **グラフのノード**: エージェントの行（`agentLine`）の右に、同じ件数のボタンを置く（ノードの大きさは変えない。`tabindex="-1"`）。別のマシンのノードは要約から件数を引く。読み取り専用のモバイルのグラフでは数だけを出し、押せない。
- **グラフの中の一覧**: グラフの `<dialog>` の中に重ねる横のパネル `SubagentPanel.vue`（`HistoryPanel` と同じ形）。開く入口は、ノードの件数のボタンのクリックと、ノードを選んでいるときのキー `s`（件数が 1 以上のとき。既存のノードのキーと重ならないことを確かめ、重なれば別のキーにして `decisions.md` に残す）。`escape()` の段に足す（`Esc` はまずパネルを閉じる）。閉じると、そのノードへフォーカスが戻る。
- **操作 `show_subagents`**: フォーカスしている pane のエージェントの一覧（サイドバーからの一覧と同じダイアログ）を開く。既定のキーなし・設定で割り当てられる。件数が 0・分からないときは何もしない。

### 端末版

- エージェントの行の末尾に `⤷n` を出す（1 件以上のとき。記号の幅が環境で崩れるなら別の記号にして `decisions.md` に残す）。その桁範囲のクリックで一覧を開く。
- キーボードの入口: 操作 `show_subagents`（ブラウザ版と同じ）と、pane のメニューの項目「サブエージェントの一覧」（1 件以上のとき）。
- 一覧は `NotificationList` と同じ形の overlay（上下で読む・`Esc` で閉じる）。対象のエージェントが居なくなったら閉じる。

### `sodactl`

- `AgentView.subagents`: `AgentInfo.subagents` が無ければ `null`。あれば `{count, items}` で、`items` の各要素は `{id, type: string | null, description: string | null, background: boolean | null, startedAt}`（項目の有無を揺らさない。写す関数を `agentStatus.ts` に置く）。

### 経過時間

- `startedAt`（サーバの時計）と画面の時計の差で出す。負になれば 0 秒。単位は秒（60 未満）・分・時間。純関数を `client-core` に置き、web と tui で共用する。

## ドメイン固有の考慮

- AGENTS.md の条項: E2E を書く → `e2e-observe-browser`。不具合の回帰テスト → `regression-negative-control`。
- フックはグローバルな設定に入るので、pane の外の Claude Code でも呼ばれる。環境変数が無ければ何もせず終わる（今のスクリプトの決まりのまま）。
- `Stop` のフックは、stdout に何かを返すとエージェントの停止を止められる。スクリプトは何も出力しないので、動きを変えない。
- 報告の名乗りは検証されない（research.md「F2」）。表示にだけ使う。短い説明は利用者のエージェントが書いた文で、画面には文字として出す。
- 別のマシンの要約にも `items`（最大 64 件）が載る。サーバは要約の接続を見分けられないので、削らない（100 ミリ秒のまとめで量は抑えられる。`decisions.md` に残す）。

## エラー処理 / 異常系

- 報告の送信の失敗: スクリプトは黙って終わる。
- 不正な電文（JSON でない・項目の型が違う・知らない `type`・長すぎる ID）: 捨てる（debug ログ。中身は出さない）。
- エージェントが検出される前の報告: `SubagentTracker` が持っておき、最初の検出で配る（上の「検出との順序」）。
- サーバの再起動・`soda handoff`: 空から始まる。知らない ID の終了は無視。`agent_stop` の突き合わせで、動いているバックグラウンドのものが説明・種類つきで戻る。
- 強制終了されたセッション（`SessionEnd`・`Stop` が来ない）: そのセッションの分は、pane のエージェントが居なくなる・入れ替わるまで残る（同じ pane の中で起動した別の `claude` を強制終了した場合に起きうる。既知の制約として文書に書く）。
- 上限の超過（256 件）: 数えない。ログに pane ごとに 1 回。
- `install()` の途中の失敗: 今までどおり何も変えずにメッセージを返す。

## テストの方針

- **単体**
  - スクリプト: イベントごとの電文・`prompt` と発言を送らない・切り詰め・Agent 以外の `PreToolUse` は何も送らない・`kind` が claude でなければ `type` つきを送らない・`running` の絞り込みと 64 件・環境変数が無ければ何もしない。
  - 受け口: `type` の解釈・上限（32768・200・64・128・64 件）・知らない `type`・既存の 4 件（handler の形が変わる）。
  - `SubagentTracker`（時計とタイマーを差し込む）: 対応づけ（最新の 1 件・10 秒・種類）・256 件・突き合わせ（外す・足す・`stopped` で足し直さない・`truncated`）・`session_end`・100 ミリ秒（最初の変化から）・検出前の報告と最初の検出・入れ替わりで捨てる・タイマーの取り消し。
  - `SessionService`: 引き継ぎ（周期の更新・`renameAgent` で落ちない）・`sameAgent`・検出が無いと false。
  - インストーラ: 旧版の導入済み → `needsUpdate` → 更新／利用者の既存の `PreToolUse` 等を保つ／全経路の削除／`SessionStart` だけ手で消した状態からの削除／スクリプトの差し替え／ほかの 7 種は `needsUpdate` が常に `false`／同梱が読めない／経路が配列でない。
  - 画面: 件数のボタン（1 件以上で出る・行へ伝えない）・一覧（並び・「ほか n 件」・0 件の文言・対象が居なくなると閉じる・フォーカスの戻り先）・`{machineId, paneId}` の引き方・`AgentView.subagents` の形・経過時間の文言。
- **統合**: 実物のスクリプトを子プロセスで起動（stdin にフックの入力）→ 実 socket → `SubagentTracker` → `SessionService` → bus の `pane.agent_status_changed`。ログに説明の中身が出ないこと。
- **E2E**（実物の Claude Code は使わない）: 偽の `claude`（`agent-detection.spec.ts` の検出の仕組み）を pane で動かし、テスト側から `agent-report.sock` へ電文を送って、ブラウザの件数・一覧・フォーカス・グラフのノードを観測する。
- **実機のみ**（`docs/verification.md`）: 実物の Claude Code での一巡（前面・バックグラウンド・並行）、導入と更新、Windows、「未確認」の各項目。
- 回帰テストを足したら、実装の該当行を壊して落ちることを確かめる（全タスク共通）。

## 受け入れ基準との対応

- AC1: 入力はフックの報告（`subagent_start`／`subagent_stop`）。`SubagentTracker` → `setAgentSubagents` → `pane.agent_status_changed` → エージェントの行のボタン。
- AC2: `items` の増減。0 件ではボタンを出さない。別の `claude` のセッションは同じ pane の合計に入る。
- AC3: グラフのノードは `{machineId, paneId}` から件数を引く（別のマシンは `SummaryPane.agent`）。ノードの大きさは変えない。
- AC4: 一覧がストアの `AgentInfo.subagents` を映す。経過時間は 10 秒ごと。0 件の文言。
- AC5: `pending` が無い `subagent_start` は説明なし。スクリプトと受け口が 200 文字に切る。
- AC6: 端末版も同じ `AgentInfo.subagents`。選んでいるマシンのエージェントは、そのマシンの snapshot とイベントをそのまま受ける。
- AC7: `SubagentTracker` が X → null・X → Y・`pane.closed` で捨てる。新しい検出は `subagents` を持たない。
- AC8: `agent_stop` の突き合わせ（無い ID を外す・`running` のものは残る）。
- AC9: インストーラの追加のエントリ（`SessionStart` を含めて 6 つのイベント）。`uninstall` は全経路から除く。設定はブラウザ版・端末版の両方。
- AC10: `status().needsUpdate`（エントリの不足・スクリプトの違い）。`install` が足りない分だけ足す。押すまで書き換えない。
- AC11: `AgentView.subagents`（`null` か `{count, items}`。項目は `null` で埋める）。
- AC12: スクリプトの決まり（黙って終わる・`prompt` と発言を送らない）。画面は文字として出す。ログに説明を出さない。
- AC13: `type` の無い電文は今までどおり。新しい電文は 3 項目を持つので、古いサーバはセッション ID の報告として扱う。`subagents`・`needsUpdate` は省略可能な項目。
- AC14: 文書（「対象範囲」の一覧）と設定画面の文言。
- AC15: `subagents` は `AgentInfo` に載るので snapshot で届く。同じ内容は配らない。最初の変化から 100 ミリ秒のまとめ。
- AC16: 知らない ID の終了は無視。`agent_stop` の `running` にあって無い ID を足す（最初の検出で配り直す）。
- AC17: 256 件の上限・表示 64 件と「ほか n 件」・`pending` の 10 秒。
- AC-I1: サイドバーはボタン（クリック・`Enter`／`Space`）でダイアログ、グラフはボタンのクリックと `s` で横のパネル、端末版は桁範囲のクリック・メニュー・`show_subagents`。閉じるのは `Esc`・外（背景）のクリック。
- AC-I2: 一覧は見るだけ。ボタンの `pointerdown`・`click` を行・ノードへ伝えない。
- AC-I3: ブラウザ版は `Tab` でボタンへ → `Enter` → 上下 → `Esc`（グラフはノードを選んで `s`）。端末版はメニューか `show_subagents` → 上下 → `Esc`。
- AC-I4: 閉じたときの戻り先の決まり（ボタン → 行 → 端末。グラフはノード）。対象が居なくなったら閉じる（ダイアログ・パネル・overlay 自身が監視）。
- AC-I5: ダイアログ・パネル・overlay がキー・ホイールを受ける。ボタンは行の高さを変えず、行・ノードの既存の操作に触れない。
