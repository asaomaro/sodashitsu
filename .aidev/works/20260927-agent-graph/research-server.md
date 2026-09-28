# agent-graph 事前調査（サーバ側）

対象: `/workspaces/sodashitsu`（ブランチ feature/agent-graph, c1d01b7）。パスは `packages/` からの相対で書く。
要件: `.aidev/works/20260927-agent-graph/requirements.md`。

---

## 1. pane ID の寿命（workspace / tab ID も）

### 採番の場所

- ID は「種類ごとに単調増加する整数に接頭辞を付けた文字列」。`w1`/`t1`/`p1`/`s1`（split）/`a1`（エージェントのインスタンス）/`g1`（グループ）。`protocol/src/ids.ts:1-34`（`formatId` は `:21`、`IdKind` は `:16`）。
- 採番は `SessionModel.nextId(kind)` だけ。カウンタは `nextIdCounters`。`server/src/session/SessionModel.ts:96-105`。
  - workspace・tab・pane を作るとき: `SessionModel.ts:195-197`（reserveWorkspace）、`:260-261`（reserveTab）。split は `reserveNextPaneId`（`SessionService.ts:653`）。
  - エージェントのインスタンス ID も同じカウンタ（`a`）。`SessionService.allocateAgentInstanceId()`（`SessionService.ts:269-275`）。`AgentMonitor` の tracker が呼ぶ（`AgentMonitor.ts:160`）。
- カウンタは `session.json` の `nextId` に保存され（`persist/SessionFile.ts:53-57`, `:128`）、復元で引き継ぐ（`SessionService.ts:1242` → `SessionModel.setNextIdCounters` `SessionModel.ts:111-114`）。

### pane の移動（pane.move_* / D&D）

- **pane ID は変わらない**。どの移動も「既存の pane をそのまま運ぶ。新しい pane は作らない」。
  - `moveToTab`: `SessionModel.ts:624-652`。`this.panes.set(paneId, { ...pane, tabId: targetTabId })`（`:638`）。新しく採番するのは split の ID（`s`）だけ（`:637`）。
  - `moveToNewTab`: `SessionModel.ts:655-691`。**tab ID は新しく採番する**（`:667` `nextId("t")`）。pane ID はそのまま（`:676`）。
  - `moveToEdge`（同じ tab の中の D&D 分割）: `SessionModel.ts:753-775`。pane ID はそのまま。
  - `swapPaneWith`・`swapPane`: レイアウトの入れ替えだけ（`SessionModel.ts:733-751`, `:722-731`）。
- 例外: **`replacePane`（名前ラベルを pane の中央へドロップ）はドロップ先の pane を閉じる**。ドロップ先の ID は消え、`pane.closed`（`successorPaneId` 付き）が出る。`SessionModel.ts:777-806`、`SessionService.ts:906-915`。
- 移動したときのイベント: `pane.updated`（`tabId` が変わった pane）→ `layout.updated` ／ `tab.closed` ／ `workspace.closed`。`SessionService.ts:925-945`（moveToTab）、`:954-970`（moveToNewTab）。
- 移動元の tab が空になったら閉じる（`closeEmptyTabShell`、`SessionModel.ts:596-622`）。**tab・workspace の ID は移動で消えることがある**。消えた tab の ID は再利用されない（カウンタは戻らない）。
- RPC の入口: `surface/methods/pane.ts:105-145`（`pane.move_to_edge`・`pane.replace`・`pane.move_to_tab`・`pane.move_to_new_tab`）。

### サーバの再起動（レイアウトの復元）

- **`session.json` を読めれば、保存した ID をそのまま使う**（「id は払い出さない」）。`SessionModel.restoreWorkspace` `SessionModel.ts:927-981`、`restoreGroup` `:983-987`。
- ただし pane の中のプロセスは新しく起動する（`restorePaneProcess` `SessionService.ts:1369-1386`）。
  - シェルを起動できなければ pane は残るが `status: 'failed'`（`:1377-1380`）。
  - すぐ終了すれば pane は閉じる（`:1382-1385`）。
  - 自動再開が有効で会話の参照があれば、`claude --resume` 等を打ち込む（`:1386`, `:1396-1401`）。
  - つまり **pane ID は同じでも、エージェントは別のもの**（新しい `instanceId`。次の §2）。
- **落とし穴**: `session.json` が無い・壊れているときは、新しく始めて **ID を 1 から採番し直す**。コメントにも「新しく始める起動では pane の id を採番し直す」とある（`composeServer.ts:543-548`）。壊れた `session.json` は `session-backups/` へ退避する（`persist/atomicFile.ts:36-58`）。**graph.json が古い `p3` を指したまま残ると、新しい別の `p3` に線が付いてしまう。**
- 復元は bus にイベントを出さない（`composeServer.ts:580-581` のコメント）。`/ws` は復元が終わってから受け付ける（`wsServer.setReady(true)` `:582`）。`agentMonitor.start()` も復元の後（`:562`）。

### `soda handoff`（更新時の引き継ぎ）

- 古い版は、poller を止める → pane の読み取りを止める → `session.json` を保存 → `handoff.json` を書く → execve、の順に進む（`handoff/HandoffController.ts:12-16`, `:193-207`）。止める poller は `agentMonitor.stop()` と `machines.stop()`（`composeServer.ts:366-372`）。
- 新しい版は同じ `session.json` から復元し、PTY を pane ID で対応づけて引き取る（`HandoffPane.paneId` `handoff/HandoffManifest.ts:21-30`、`session.restore(..., { adopted })` `composeServer.ts:541`、`SessionService.ts:1270-1278`）。**pane・tab・workspace の ID も、プロセスもそのまま続く。**
- ただし `AgentTracker` はメモリの中だけにあるので、新しいプロセスでは作り直しになる（`AgentMonitor.ts:60`, `:157-163`）。**同じエージェントのプロセスでも、引き継いだ後は新しい `instanceId`、`completionSeq=0`、3 秒の猶予（`unknown`）から始まる**（§2）。

### まとめ（design への含意）

| 出来事 | pane ID | tab/workspace ID | エージェント instanceId |
|---|---|---|---|
| pane の移動（move_to_tab / move_to_edge / swap） | 同じ | 移動元が空になれば消える | 同じ |
| move_to_new_tab | 同じ | 新しい tab ID | 同じ |
| pane.replace | ドロップ先は消える（`pane.closed`） | 同じ | ドロップ先のものは消える |
| 再起動（session.json 正常） | 同じ | 同じ | 新しい（プロセスも新しい） |
| 再起動（session.json 無し・壊れ） | **1 から振り直し（衝突の危険）** | 同様 | 新しい |
| soda handoff | 同じ | 同じ | 新しい（プロセスは同じ） |

→ ノードは pane ID（＋マシン）で持てばよい。tab・workspace は持たない。「session.json を復元できなかった起動」だけは別に扱う必要がある。`composeServer` は `loaded.kind !== "ok"` を知っている（`:533-549`）。そのときグラフの手元のノードをまとめて無効にする、などの対処が要る。

---

## 2. エージェントの状態機械

### 状態の型

- サーバが判定するのは 4 状態: `AgentState = "blocked" | "working" | "idle" | "unknown"`。`protocol/src/model.ts:3-4`。
- `done` はサーバの状態ではなく、表示用の値として導く: `state === 'idle' && completionSeq > seenSeq`（`model.ts:5-6`）。
- `AgentInfo` は `instanceId`・`kind`・`label`・`state`・`completionSeq`・`serverSeenSeq`・`verified`・`since`・`name?` を持つ（`model.ts:114-138`）。

### 判定の周期（`agent/AgentMonitor.ts`）

- 心拍は 100ms（`HEARTBEAT_MS = FAST_RECHECK_INTERVAL_MS`、`:24-27`）。pane ごとに、自分の間隔が来たときだけ判定する。
  - 出力があった pane: 500ms（`ACTIVE_INTERVAL_MS`、`:21`）
  - 出力が無い pane: 1000ms（`IDLE_INTERVAL_MS`、`:23`）
  - 起動直後の猶予中・working→idle の保留中: 100ms（`:25`, `:137-141`）
- 1 周期の流れ: 前面ジョブ → `ProcessMatcher.match` → マニフェストの `evaluate`（画面の下 60 行・OSC タイトル・進捗）→ `tracker.update` → `session.updatePaneRuntime`（`:166-193`）。前面ジョブを調べるのは最大 2 秒で打ち切る（`:34`, `:198-209`）。
- 判定する pane は毎回 `session.snapshot().panes` から取り直す。消えた pane の tracker は捨てる（`:108-120`）。
- 開始は `listen()` の中で、復元の後（`composeServer.ts:562`）。停止は `stop()`。handoff のときも止める（`composeServer.ts:369`）。
- どのルールにも合わない画面は `idle` になる（`NO_MATCH_STATE = "idle"`、`agent/ManifestEngine.ts:32`, `:47`）。

### `AgentTracker`（`agent/AgentTracker.ts`）

- 新しいエージェントを検出したとき（`kind` が変わった・null から変わった）は、次のように初期化する（`:76-93`）。
  - 新しい `instanceId` を採番する（`allocateInstanceId`）
  - `state: "unknown"`、`completionSeq: 0`、`serverSeenSeq: 0`
  - `startupGraceUntil = now + 3000`（`STARTUP_GRACE_MS`、`:28`）
  - **この初期値はすぐ公開される**（`return this.info`）。
- **猶予の 3 秒の間は判定しない**（`:95-98`）。猶予が明けた最初の判定で、`unknown` から `idle`/`working`/`blocked` へ変わる。**つまり、起動したばかりのエージェントは「完了」を経ずに `unknown→idle` になる。**
- `working` から「素の」`idle`（visibleIdle と visibleBlocker がどちらも無い）への変化は保留する。3 回の再確認か 700ms まで待つ（`:29-31`, `:133-155`）。
- 状態・visible* のどれかが変わったときだけ公開する（`shouldPublish` `:159-166`）。安定した blocked を周期的に出し直す処理は省いている（`:157-158`）。
- **`completionSeq` は `working → idle` の変化のときだけ +1**（`:107`, `:112`）。
  - `working→blocked→idle`（blocked から直接 idle）では増えない。
  - `unknown→idle` でも増えない。
- 前面からエージェントが消えたら `null` を返す（終了。`:70-74`）。

### 既読（`serverSeenSeq`）と `done`

- `serverSeenSeq` はメモリの中だけにあり、再起動をまたがない（`model.ts:123-124`）。
- 更新するのは `session.focus_changed` を受けたときだけ。フォーカスされた pane の tracker について `serverSeenSeq = completionSeq` にする（`AgentMonitor.ts:81-83`, `:101-106`、`AgentTracker.markSeen` `:119-124`）。`focus_changed` は `SessionService.focusPane` 等が出す（`SessionService.ts:819-823`）。
  - **どのクライアントが pane をフォーカスしても `done` は消える**。
  - 既読を進めただけでも `pane.agent_status_changed` が出る（state は変わらない）。
- sodactl の `done` 判定: `idle && completionSeq > serverSeenSeq`（`cli/src/agentStatus.ts:26-29`）。
- ブラウザの `done` は、ブラウザ自身の既読（localStorage の `soda.seen.v1`）で導く（`web/src/store/seen.ts:1-60`、`displayStateFor` は client-core から再エクスポート `:68`）。
  - **`done` の見え方はブラウザ・サーバで一致しない**。

### イベント

- `pane.agent_status_changed { paneId, agent: AgentInfo | null }`（`protocol/src/events.ts:94-97`）。
- 出すのは `SessionService.updatePaneRuntime` の 1 か所だけ（`SessionService.ts:1014-1058`、publish は `:1050-1052`）。
  - `sameAgent`（`:1473-1487`）で中身が実際に変わったときだけ出す。
  - `renameAgent` も出す（`:1080`）。
- 名前の引き継ぎ（同じ instanceId の間だけ）と、`agent start` の予約の名前付けも `updatePaneRuntime` の中にある（`:1032-1045`）。

### 「A が done/idle/blocked になった」を 1 回だけ検出する方法（推奨）

- **購読先**: `EventBus` の `pane.agent_status_changed`（同期で、発行した順に届く。`bus/EventBus.ts:5-22`）。
  - 前の値は、グラフの実行係が pane ごとに自分で覚える（イベントに前の値は載っていない）。
  - `SessionService.getPane(id).agent` は発行の時点で既に新しい値になっている（`:1049` の後に publish）。
- **done（完了）**: 状態名ではなく **`(instanceId, completionSeq)` の増加**を縁（エッジ）にする。ブラウザの通知も同じ考え方で、鍵は `done:<instanceId>:<completionSeq>`（`client-core/src/notify/policy.ts:16-18`）。判定は `prev && next.completionSeq > prev.completionSeq`（`web/src/notify/NotificationController.ts:84`）。
  - こうすると `serverSeenSeq` の変化（フォーカス）では発火しない。
  - `idle` が続いても再発火しない。
  - 再起動・handoff で `completionSeq` が 0 に戻っても、`instanceId` が違うので取り違えない。
- **blocked**: `next.state === "blocked" && prev?.state !== "blocked"`（`NotificationController.ts:82`）。鍵は `blocked:<instanceId>:<since>`（`policy.ts:17`）。
  - ブラウザは blocked を 1 秒待ってから知らせる。その間に元へ戻れば知らせない（`BLOCKED_DELAY_MS` `NotificationController.ts:12-13`, `:160-167`）。**blocked は揺れうる**という前提がコードにある。
  - サーバ側の blocked にはヒステリシスが無い（`AgentTracker` の保留は working→idle だけ）。
- **idle**: 「`idle` へ変わった」の縁は、`unknown→idle`（起動・再起動・handoff の直後）でも立つ。
  - 誤発火しないよう、**`prev.instanceId === next.instanceId` かつ `prev.state !== "unknown"`** を条件に入れるのがよい。
  - done（working→idle）と idle を別の条件として扱うかは design で決める。
- **雑音のまとめ**:
  1. 新しい検出の直後は、少なくとも 3 秒 `unknown`。
  2. 再起動・handoff の後は、全エージェントが新しい instanceId・`completionSeq=0`・`unknown` から始まる。
  3. フォーカスで `serverSeenSeq` だけが変わるイベントが出る。
  4. rename だけのイベントが出る。
  5. blocked が一瞬出てすぐ戻ることがある。
  6. どのルールにも合わない画面は idle 扱い（working↔idle の揺れは 700ms×3 の保留で吸収）。
- **応答性**: 状態の変化から公開までは、最大で「判定の間隔 1s ＋ 保留 0.7s ＋ 前面ジョブの調査（最大 2s）」程度。bus は同期なので、公開から実行係に届くまでの遅れは実質 0。

---

## 3. sodactl agent prompt / wait / read / send-keys / start の実装と、サーバ内での再利用

### サーバの方式（`surface/methods/agent.ts`）

- **`agent.prompt`**（`:64-94`）
  - 本文が空なら `empty_agent_prompt`。
  - `requireAgent` でエージェントが無い・instanceId が違えば `agent_not_found`（`:27-45`）。
  - **blocked なら `agent_blocked` で断る**（`:71`, `:56-61`）。
  - 書き込みは `host.writeModal({ build, delayMs: AGENT_PROMPT_SUBMIT_DELAY_MS })`。`build` は書く直前にもう一度エージェントと blocked を確かめ、`[pastePayload(text, bracketedPaste), "\r"]` を返す（`:77-87`）。
  - **working は断らない**（working 中に送ると、エージェントの入力欄へ打ち込まれる）。
  - 本文の上限は 1MiB（`protocol/src/messages.ts:591`, `:598-603`）。
- **bracketed paste と 300ms の Enter**
  - `AGENT_PROMPT_SUBMIT_DELAY_MS = 300`（`agent/agentInput.ts:9-10`）。
  - `pastePayload` はモードが有効なら `ESC[200~…ESC[201~` で包み、本文の中の印は取り除く（`agentInput.ts:16-29`）。
  - `writeModal` の中身（`terminal/TerminalHost.ts:224-270`）: ミラーを flush する → モードを読んで `build` → 書き込み待ちの上限を超えれば `input_queue_full` → 各部分の間に `delayMs` を置いて書く。実行中に来た別の入力は後回しにする（`:10-21`, `:224-231`）。
- **`agent.send_keys`**（`:96-124`）
  - キーを全部確かめてから書く（`invalid_key`）。
  - **blocked でも書ける**（承認に答える経路）。書く直前に同じエージェントかを確かめる。
- **`agent.start`**（`:134-144`）: `AgentStarter.start(params, onAccepted)` へ任せる（`agent/AgentStarter.ts:53-`）。クラスなので、サーバの中から直接呼べる。
- **`agent wait`／`agent read` はサーバの方式が無い（CLI 側で組み立てている）**
  - wait: `client.hello` の snapshot と、その後の `pane.agent_status_changed`／`pane.closed` を CLI が追う（`cli/src/commands/agent.ts:86-167`、`judgeWait` `cli/src/agentStatus.ts:79-86`）。
  - `prompt --wait`: 送った後に working/blocked を 5 秒以内に観測することを求める（`PromptWait` `agentStatus.ts:88-116`、`commands/agent.ts:195-330`）。
  - read: `pane.subscribe` で SNAPSHOT のバイナリフレームを受け、`currentScreen`（代替画面の後ろだけ）と `lastLines`（末尾の空行を捨てて最後の N 行）で切り出す（`commands/agent.ts:169-185`、`commands/pane.ts:128-132`、`agentStatus.ts:118-134`）。

### サーバの中から呼べるか

- **`ControlSurface.invoke(ctx, name, params)` を内部から呼べる**（`surface/ControlSurface.ts:31-50`）。ctx は `{ clientId, sink }` だけ。
  - `WsGateway` も同じ関数を呼んでいる（`ws/WsGateway.ts` の handleText → `this.surface.invoke({ clientId, sink }, ...)`）。
  - `agent.prompt` の中の `sizeAuthority.noteInteraction(ctx.clientId, ...)` は、登録されていない clientId なら何もしない（`clients/SizeAuthority.ts:69-71`）。**内部用の clientId（例 `"graph"`）と、何もしない sink を渡せば、そのまま使える**。
  - 結果は `{ ok, result | error{code,message} }` で返り、`agent_blocked` 等の code で分岐できる。
- 方式の本体は `registerAgentMethods` の中のクロージャになっている。関数として取り出されてはいない（`agent.ts:63-145`）。
  - きれいにするなら、`requireAgent`／`requireSameAgent`／`pastePayload`／`writeModal` の組を `agent/` の関数（例 `promptAgent(deps, paneId, text, instanceId)`）へ移し、方式とグラフの両方から呼ぶ。
  - 最小でよければ `surface.invoke` を使う。
- **画面の末尾（出力の受け渡し）**: サーバの中なら SNAPSHOT を経ずに直接読める。
  - `terminals.get(paneId).mirror.bottomLines(n)`（`terminal/Mirror.ts:201-210`）。**アクティブなバッファ**（代替画面なら代替画面）の下から n 行を、ANSI 無しの平文で返す。これは判定にも使っているもの（`AgentMonitor.ts:180`）。
  - スクロールバックまで含めた平文は `mirror.plainText()`（`:212-228`、通常バッファ）。
  - CLI の `agent read` と同じ結果にしたいなら、`bottomLines` の末尾の空行を捨ててから N 行を取る（`lastLines` と同じ規則）。
  - 書き込みの直後はミラーへの反映が遅れる。`mirror.flush()` を待てば確実（`Mirror.ts:66-69`）。
- **内部のイベントバス**
  - `bus/EventBus.ts:9-23`。型付き・同期・発行した順に届く。`subscribe(fn) → Disposable`。
  - 購読者の例外は捕まえない（`publish` に try が無い）。**グラフの購読者は自分で try/catch すること**（投げると後続の購読者＝WS への配信が止まる）。
  - 既存の購読者: `AgentMonitor`（focus_changed、`AgentMonitor.ts:81-83`）、`WsGateway`（全イベントを全接続へ、`WsGateway.ts:106-109`）、`MetadataService` 等。

---

## 4. 永続化のパターン

| ファイル | 置き場所 | 書き方 | 読み込み | 変更の配布 |
|---|---|---|---|---|
| `session.json` | stateDir（session ごと） | `writeFileAtomic`（`persist/SessionFile.ts:150-152`）。`PersistScheduler` で 500ms まとめる（`session/PersistScheduler.ts:1-40`）。終了時は flush（`composeServer.ts:625`） | `listen()` の 3. で zod 検証。壊れていれば退避して新しく始める（`composeServer.ts:533-549`、`SessionFile.ts:141-148`） | 個々の変更のイベント（workspace.* 等） |
| `prefs.json` | stateDir | `PrefsStore.set` を 1 本の待ち行列に並べ（`persist/PrefsStore.ts:67-68`, `:126-128`）、`writeFileAtomic` の後に状態を差し替えて `onChange` を呼ぶ（`:102-129`）。`rev` は +1 | ロックを取った後、`listen()` の 0' で `load()`（`composeServer.ts:489-490`）。壊れていれば `prefs-backups/` へ退避して空から（`PrefsStore.ts:84-92`） | `prefs.onChange` → `bus.publish("prefs.changed", {prefs, rev, byClientId})`（`composeServer.ts:286-289`）→ WsGateway が全接続へ |
| `commands.json` | stateDir | 利用者が手で書く（サーバは書かない） | 起動時に `commands.reload()`（`composeServer.ts:273-274`）。読み直しは `command.reload` | `command.updated`（`commands/CommandService.ts:91-131`） |
| `machines.json` | **sessionRoot（名前付き session で共有）**（`composeServer.ts:262-266`） | `soda machine` が検証してから `writeFileAtomic`（`machine/MachineCatalog.ts:142-148`） | `MachineManager` が 1 秒ごとに stat（mtime・大きさ・inode）で変化を見て読み直す（`machine/MachineManager.ts:18-24`, `:46-53`, `:167-208`） | `machine.changed`（`composeServer.ts:269`） |

- **`writeFileAtomic`**（`persist/atomicFile.ts:9-24`）: 同じディレクトリの一時ディレクトリに書く → chmod 0600（Windows 以外）→ rename。
- **`readFileWithBackup`**（`:26-58`）: 無ければ `missing`。parse が投げたら `<name>-backups/<時刻>.json` へ退避して最新 3 件を残し、`corrupt` を返す。

### graph.json に勧める形

- 置き場所は **stateDir**（session ごと）。pane ID は session ごとの連番なので、sessionRoot に置いてはいけない。
- クラスは `PrefsStore` を手本にした `GraphStore` にする。
  - `load()` は `listen()` の中でロックを取った後に呼ぶ。`auth.initialize`／`prefs.load` の並び（`composeServer.ts:487-490`）。**`agentMonitor.start()` より前に**、実行係を bus に購読させておく。
  - 変更は 1 本の待ち行列に並べる。`writeFileAtomic` → 状態を差し替え → `rev+1` → `onChange` → `bus.publish({event:"graph.changed", data:{graph, rev, byClientId}})`。
  - 形の検証は zod（`SessionFile.ts` の方式）。`schema: 1` を持たせる。
- 配置のドラッグのように細かく続く変更は、`PersistScheduler` のように 500ms まとめるのもよい。ただし「ブラウザ間で即座に反映」（F13）のため、**イベントは保存を待たずに出す**か、`rev` で追いつかせる。
- 起動で `session.json` を復元できなかったら（`loaded.kind !== "ok"`、`composeServer.ts:543-549`）、手元の pane ID が振り直されている。**グラフの手元のノードを無効にする**。
  - 例: `session.json` に任意の `sessionUid` を足し、グラフにその値を控えて比べる。「optional 追加」方式（`SessionFile.ts:15-22`）で互換を保てる。
- 実行の履歴は大きくなりうる。graph.json と分けて、件数に上限のある別ファイル（またはメモリだけ）にする案がよい。
- handoff の前に保存を済ませる。`HandoffController` の `pausePollers`／`flushSession` に相当する口（`composeServer.ts:366-379`）へ、グラフの flush と実行係の停止を足す。

---

## 5. 複数ホスト（machine/）

### 構成

- `MachineManager`（`machine/MachineManager.ts:13-24`）が 1 台ごとの状態の唯一の持ち主。`machines.json` を 1 秒ごとに見て反映する。
- 有効なマシンごとに `MachineLink`（ssh の子 1 本＝1 回の試み）を作る（`:260-296`）。
- 切れたら 1s から倍々（最大 120s）で作り直す。60 秒以上 online が続いた後の切断なら、間隔を最初に戻す（`:18-24`, `:272-294`）。
- 状態は `connecting` → `online` → `reconnecting`／`attention`。`list()` と `machine.changed` で配る（`:146-151`, `:306-313`、`composeServer.ts:269`）。
- `MachineLink` は `ssh … soda bridge` を起動し、HELLO（版の確かめ）で online になる。1 本の上にチャネルを多重化する（`machine/MachineLink.ts:21-26`, `:224-245`）。`openChannel()` は online のときだけ、同時に 64 まで（`:358-372`）。
  - `LinkChannel` は `sendText`/`sendBinary`/`onText`/`onBinary`/`onClose` を持つ（`:224-233`）。
  - 切れると全チャネルを 1012 で閉じる（`:490`）。
- リモート側: `BridgeEndpoint`（0600 の Unix socket `bridge.sock`）が各チャネルを `WsConnection` として **2 つ目の `WsGateway`** に渡す（`composeServer.ts:339-347`、`machine/BridgeEndpoint.ts:13-19`）。**チャネル 1 本は `/ws` の 1 接続と同じもの**（`client.hello` から始まり、RPC・イベント・SNAPSHOT/OUTPUT が流れる）。
  - 受け口に繋がった接続は認証済みとして扱う（`BridgeEndpoint.ts:17`、`BRIDGE_SESSION_ID = "bridge"` `:26-27`）。
- 今の使い道は「ブラウザ／sodactl の `/ws?machine=<id|名前>` を 1 チャネルへ素通しで中継する」ことだけ（`composeServer.ts:314-331`、`machine/MachineRelay.ts:6-17`, `:43-53`）。中身は解釈しない。
  - `MachineRelay` は TEXT なら `{` 始まりだけ、BINARY なら OUTPUT/SNAPSHOT だけを通す。
- sodactl: `sodactl --machine <名前|id> <コマンド>` は、手元の `soda serve` の `/ws?machine=` 経由でリモートへ送る（`cli/src/cliArgs.ts:47-49`, `:95-98`, `:270-271`, `:680-715`）。`--current` とは併用できない（呼び出し元の pane はこのマシンのもの）。
  - → **手元の監督役は `sodactl --machine X agent prompt pN` でリモートの配下を操作できる**。
  - 逆向き（リモートの pane から手元へ）の経路は無い。bridge は手元→リモートの一方向。

### 手元のサーバが自分で RPC を呼ぶ・イベントを購読できるか

- **今は、サーバ自身が RPC の送り手になるコードは無い**（中継だけ）。
- ただし部品は揃っている: `MachineManager.route(selector)` で `link` を取り（`MachineManager.ts:153-165`）、`link.openChannel()` を開けば、それが **リモートの認証済みの `/ws` 1 接続**になる。
  - あとは `{"id","method":"client.hello","params":{"protocol":1,"kind":"external"}}` を送り、snapshot とイベント（`pane.agent_status_changed` を含む。リモートの WsGateway は全イベントを全接続へ配る、`WsGateway.ts:106-109`）を受けられる。
  - `agent.prompt`／`agent.send_keys` も同じチャネルで呼べる。
  - 画面の末尾は `pane.subscribe` → SNAPSHOT のバイナリフレームを decode する（CLI の `readPaneSnapshot` と同じ）。
- 手本になる実装: client-core の `MachineSummaryClient`（`client-core/src/net/MachineSummaryClient.ts:1-100`）。`kind: "external"` で hello し、snapshot とイベントだけを受ける軽い接続。`WebSocketLike` を注入でき（`client-core/src/net/Connection.ts:9-18`）、1s〜30s で繋ぎ直す。
  - server は client-core に直接は依存していない（`server/package.json:18-19` は protocol と tui だけ。tui は client-core に依存 `tui/package.json:24`）。
  - `LinkChannel` を `WebSocketLike` に合わせる小さな adapter を書けば再利用できる。
  - `MachineManager` には「online になった／切れた」をチャネルの外へ知らせる口が無い。今あるのは `onChanged` の一覧だけ（`:112-114`）。グラフ用の購読の持ち主は `machine.changed` を見て、チャネルを開き直す作りになる。
- **切れている間**: `route` は `offline`、`openChannel` は undefined（`MachineManager.ts:163`、`MachineLink.ts:359-361`）。イベントは失われる（貯める仕組みは無い）。
  - 繋ぎ直したら hello の snapshot で読み直すしかない。ブラウザの通知が「再接続の snapshot で、判定済みに無い鍵だけ知らせる」やり方を取っている（`NotificationController.ts:87-100`、`snapshotKeys` `policy.ts:31-36`）。
  - グラフも `(instanceId, completionSeq)` の鍵を覚えておけば、切断中の完了を 1 回だけ拾える。拾うか見送るかは design で決める（要件 AC14 は「見送って理由を履歴に」）。
  - リモートが再起動・handoff すると instanceId が変わる（§1・§2）。
- 手元の handoff の間は `machines.stop()` で ssh を全部閉じ、新しい版がまた繋ぐ（`composeServer.ts:370-376`）。

### リモートの pane ID の名前空間

- リモートの pane ID は、リモートのサーバの `p1…` そのまま。手元の ID と衝突する。サーバ側で付け替える仕組みは無い（中継は中身を解釈しない）。
- ブラウザはマシンを切り替えるとき、前のマシンの workspace・tab・pane を捨てる（`web/src/store/session.ts:46-` のコメント）。既読の鍵はローカル以外を `m:<machineId>:<instanceId>` にしている（`web/src/store/seen.ts:26-32`）。
- マシンの ID は 32 桁の 16 進の不透明な値で、名前を変えても変わらない（`machine/machineRules.ts:8-9`、`isMachineId` `:32-34`）。
  - → グラフのノードの鍵は **`(machineId | "local", paneId)`** がよい。
  - 同じ machineId のまま宛先（`target`）・リモートの session が変わると、MachineManager は繋ぎ直す（`MachineManager.ts:244-252`）。そのときは同じ `p3` が別の pane を指す。ノードを無効にするかは design で決める。

---

## 6. RPC の登録・イベントの配布・sodactl のコマンドの足し方

- **方式の定義（protocol）**
  - `protocol/src/messages.ts` の `METHOD_SCHEMAS`（例 `:761` agent.prompt、`:771` prefs.get、`:776` `MethodName`）に zod の params を足す。
  - 結果の型は `MethodResultMap`（`:836-846` 付近）に足す。
  - エラーの code は `protocol/src/errors.ts:2-` の `ErrorCode` に足す。
- **サーバの登録**
  - `surface/methods/<名前>.ts` に `registerXxxMethods(surface, deps)` を書く。任意の依存は `deps.xxx` が無ければ登録しない（例 `prefs.ts:10-28`、`deps.ts:32-66`）。
  - `surface/methods/index.ts:26-44` の `registerAllMethods` に 1 行足す。`MethodDeps` に依存を足す（`deps.ts`）。
  - `composeServer.ts:290-306` で依存を渡す。
  - `ControlSurface.register(name, {schema, handler})`（`surface/ControlSurface.ts:27-29`）。invoke は検証失敗を `invalid_params`、`RpcError` をその code、`NotFoundError` を `not_found`、それ以外を `internal` にする（`:31-50`）。
- **イベント**
  - `protocol/src/events.ts` に型を足し、`ServerEvent` の union（`:153-`）へ入れる（例 `PrefsChangedEvent` `:148-151`）。
  - サーバで `bus.publish(...)` すれば、`WsGateway` が全接続へ JSON で配る（`ws/WsGateway.ts:106-109`）。**リモートの bridge のチャネルにも届く**（2 つ目の WsGateway、`composeServer.ts:343-347`）。
  - 認証は `/ws` の upgrade で済んでいる（`auth.authorizeUpgrade`、`composeServer.ts:314`）。→ 方式・イベントとも「認証済みの接続だけ」が自然に成り立つ（AC18）。
  - hello の snapshot にグラフは入っていない（`surface/methods/client.ts:6-14`）。prefs と同じく `graph.get` を用意し、`rev` 付きのイベントで追いつかせる形になる。
- **sodactl**
  - `cli/src/cliArgs.ts` を 3 か所直す。
    - `USAGE_LINES` に 1 行足す（`:16-45`。agent 系は `:36-43`）。
    - `Command` の union に `{ kind: "graph-..." }` を足す（`:138-160` 付近）。
    - `parseArgs` の switch に語を足す（`:307-311`、例 `case "agent": return parseAgent(...)` と `parseAgent` `:558-`）。
  - `cli/src/main.ts:70-126` の switch で `run...` を呼ぶ。実装は `cli/src/commands/<名前>.ts`。`withSession`→`client.hello`→`client.request(...)`→`printJson` の形（例 `commands/agent.ts:60-64`）。
  - `sodactl help` の補足は `main.ts:30-56`。
- **skill ファイル**
  - `packages/cli/skills/sodactl/SKILL.md`（154 行。見出しは `:6-140`、最後に「## コマンドの一覧」`:140`）。
  - `sodactl skill` は、このファイルをそのまま出すだけ（`cli/src/skill.ts:1-21`）。サーバへは繋がない（`main.ts:69`）。
  - `cli/src/skill.test.ts:5-71` が **`USAGE_LINES` の全コマンドが SKILL.md に載っていること**を検査する。新しいコマンドは SKILL.md にも書かないとテストが落ちる。
  - `--machine` は前置きなので `USAGE_LINES` に入れない（`cliArgs.ts:47`）。

---

## 7. エージェント連携（フック・agent-report.sock）と、pane へ打ち込む以外の伝え方

- **agent-report.sock は一方向（エージェント → サーバ）**
  - 1 接続 1 メッセージの改行区切り JSON `{paneId, kind, sessionId}` を受けるだけ（`agent/AgentReportSocket.ts:1-40`）。用途は会話 ID の報告（再開用）。
  - 受けた値は `session.reportAgentSession` に渡る（`composeServer.ts:524-530`）。
- **フックは SessionStart だけ**
  - `AgentIntegrationInstaller` は各エージェントのグローバル設定の SessionStart に `node agent-hook-report.cjs <kind>` を登録する（`agent/AgentIntegrationInstaller.ts:86-160`、例 claude の `entriesPath: ["hooks","SessionStart"]` `:101`）。
  - スクリプトは `SODA_PANE_ID`／`SODA_AGENT_REPORT_SOCKET` が無ければ何もしない。**stdout には何も書かない**（SessionStart の stdout は Claude Code の会話コンテキストへ足されうるため）（`server/assets/agent-hook-report.cjs:4-15`, `:33-36`）。
  - ここから言えること: **SessionStart のフックの stdout で文脈を入れる技術的な口はあるが、今は意図して使っていない**。入るのは起動時だけで、動いているエージェントへ後から押し込むことはできない。
- **pane の環境変数**
  - `SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_AGENT_REPORT_SOCKET`・`SODA_SESSION` 等（`session/paneEnv.ts:7-27`）。
  - シェルを起動するときに決まり、後から変えられない。
- **独自トークン（`pane.report_metadata`）は外からサーバへの報告**（サイドバーの表示用）。エージェントへは届かない（`metadata/MetadataService.ts`、`composeServer.ts:276-277`）。
- **結論**: 動いているエージェントへ文章を渡す既存の手段は、**pane への入力（`agent.prompt` の bracketed paste＋Enter、`agent.send_keys`）だけ**。
  - 監督役への「知らせる」は、次のどれか（または組み合わせ）になる。
    - (a) prompt として送る。working の間は待つ・並べる。blocked には送れない。
    - (b) 監督役が自分で取りに行く。例: `sodactl graph show --mine` のような読み取りのコマンドと、skill ファイルの説明。
    - (c) 起動時の文脈として SessionStart のフックや環境に書き出す。起動時だけで、配下が変わっても知らせ直せない。
  - F6 の「配下の構成が変わったら知らせ直す」は、(a) か (b) でしか満たせない。
- **人への通常の通知**: ブラウザの `NotificationController` がブラウザの中で出す（`web/src/notify/NotificationController.ts:78-85`）。サーバは関わらない。承認待ちの代理でも、ブラウザを開いていれば今までどおり出る（F7 の「人への通常の通知」）。
