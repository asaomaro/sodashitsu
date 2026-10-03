# 仕様: エージェントが起動したエージェントを連携のグラフに自動で載せる

## 概要

pane の中の `sodactl` が、pane を作る操作と `agent start` に**呼び出し元の pane の ID**（`callerPaneId`）を添える。サーバは「誰が作ったか／誰が起動したか」を pane ごとにメモリへ覚え、
その pane でエージェントが**最初に検出された**とき、グラフへノード・監督の線・承認の代理の線を**1 回の `graph.update`** で足す。
足す部品は新しい `AgentLineage`（`packages/server/src/graph/AgentLineage.ts`）。`GraphEngine`・画面・`graph.*` の RPC は変えない（線が足されれば既存の規則で監督役への知らせ・承認の代理が動く）。

## 設計方針

- **呼び出し元はクライアント（sodactl）が名乗る**。サーバの `MethodContext` は `clientId` しか持たず、pane を作った人は分からないため。名乗りは**グラフに載せる関係の記録にだけ**使い、他の判断（権限・対象の許可）には使わない。
  認証済みの接続（ログイン済みの `/ws`）でだけ届く（`pane.sock` には載せない。`pane.sock` の操作は `ask.open` だけで、これらの操作は載っていない）。サーバは名乗られた pane が実在することだけ確かめ、実在しなければ黙って無視する（エラーにしない）。
- **載せる契機は「エージェントの検出」**（`pane.agent_status_changed` で `agent` が非 null）。起動の方法（`agent start`・打ち込み）に依らない。`bus` の購読だけで済み、`SessionService.updatePaneRuntime` は触らない。
- **親の決め方**: `agent start` を打った pane（`noteStarted`）が、pane を作った pane（`noteCreated`）に勝つ。どちらも無ければ載せない。
- **1 pane につき 1 回**: 載せる処理を始めた pane の ID を `attempted` に入れ、以後その pane の検出では動かさない（入れ替わり・再検出でも 2 回目は無い）。
- **グラフへの書き込みは 1 回の `GraphStore.update(baseRev, ops, "graph")`**。組み立ては `addMissingNodeOps`（`client-core`）を流用し、重複・上限・監督役の取り合いは**組み立て前に自分で判定して外す**（ops は全か無かで、1 つでも不正だと全体が落ちるため）。
  `rev_conflict` は `get()` からやり直し、最大 3 回。
- **代替案を退けた理由**:
  - `agent.start` の予約（`agentLaunches`）に親を載せる案 → 打ち込みの起動を拾えず、`SessionService` の肥大化を招く。
  - 作った時点でノードを載せる案 → 検出前に pane が閉じるとノードだけ残る。
  - 外した判断の印（拒否リスト）を `graph.json` に持つ案 → 子は毎回新しい pane で戻らず、親の再追加が煩わしければ別 work（requirements 未確定事項）。

## 対象範囲

- `packages/protocol/src/messages.ts` — `WorkspaceCreateParams`・`TabCreateParams`・`PaneSplitParams`・`AgentStartParams` に省略可能な `callerPaneId`。
- `packages/cli/src/commands/` の該当コマンド（`pane split`・`workspace create`・`tab create`・`agent start`）と `cliArgs`/`selfGuard` — `selfPaneId(opts)` が確認できたときだけ `callerPaneId` を送る。
- `packages/server/src/graph/AgentLineage.ts`（新規）と単体テスト。
- `packages/server/src/surface/methods/{pane,workspace,tab,agent}.ts`・`methods/deps.ts` — 記録の呼び出し。
- `packages/server/src/composeServer.ts` — 構築・配線・終了時の停止。
- 文書: `docs/agent-graph.md`・`docs/sodactl.md`・`packages/cli/skills/sodactl/SKILL.md`・`docs/verification.md`。
- 変えない: `GraphEngine`・`GraphStore` の公開 API・`graph.*` の RPC・web の画面。

## 依拠する既存の事実

- グラフの型・上限: `packages/protocol/src/graph.ts` の `GRAPH_NODES_MAX=64`・`GRAPH_LINKS_MAX=128`、`GraphLink{kind:"trigger"|"supervise"|"approval", from, to, approval?, limit, count, paused}`。向きは supervise/approval とも `from`=配下（子）・`to`=監督役（親）（調査報告 §1。`graph.ts` を確認済みと報告）。
- 更新の入口: `GraphStore.update(baseRev, ops, byClientId)`（`packages/server/src/persist/GraphStore.ts:140`）。`baseRev` が違えば `GraphRevConflictError`（同 :30）、当てられなければ `GraphInvalidError`（同 :41）。`get()` は複製を返す（同 :135）。
- ops と検証: `applyGraphOps`（`packages/client-core/src/graph/ops.ts:40`）、`addMissingNodeOps`（同 :147。既にあるキーは飛ばし、空いている位置に置く）。検査: `validateGraph`（`validate.ts`）が `duplicate_link`・`supervisor_taken`（配下 1 つにつき supervise・approval 各 1 つの監督役まで）・`too_many_*` を返す。
- 承認の代理の既定: `defaultApprovalConfig()`＝`{mode:"notify", lines:40}`、`LINK_LIMIT_DEFAULT=10`（`packages/client-core/src/graph/defaults.ts`）。
- 検出のイベント: `SessionService.updatePaneRuntime`（`packages/server/src/session/SessionService.ts:1023`）が、エージェントの中身が変わったとき `bus.publish({event:"pane.agent_status_changed", data:{paneId, agent}})`（:1060 付近）。`pane.closed` も bus のイベント（`LocalAgentPort.ts:34` が購読している）。
- 呼び出し元の確認: `selfPaneId(opts)`（`packages/cli/src/selfGuard.ts:39`）は、`SODA_PANE_ID` があり接続先が `SODA_SERVER_URL` と一致したときだけ pane ID を返す。`--machine`（local 以外）では caller は破棄される（`cliArgs.ts:1020-1026`）。
- 作った pane の ID: `PaneSplitResult.pane`、`WorkspaceCreateResult.pane`、`TabCreateResult.pane`（`packages/protocol/src/messages.ts:155-159, 227-230, 256-258`）。
- ハンドラ: `surface.register("pane.split"…)`（`methods/pane.ts:23`）、`workspace.create`（`methods/workspace.ts:14`）、`tab.create`（`methods/tab.ts:6`）、`agent.start`（`methods/agent.ts:137`。`deps.agentStarter` があるときだけ登録）。`MethodContext` は `clientId` のみ。
- 互換性: スキーマは zod の `z.object`（`strict` でない）なので、古いサーバは未知の項目を無視する（**未確認**: 実物の古い版では確かめない。コードの読みと、項目を足さない旧クライアントのテストで示す）。
- テストの手本: `packages/cli/src/agentStart.integration.test.ts`（偽の `claude` を実 PTY で検出させる）、`packages/server/src/composeServer.graph.integration.test.ts`（`graph.update` と配信）、`GraphEngine.test.ts`（偽の store・時計）。

## インターフェース / データ構造

プロトコル（4 つの Params に同じ項目）:

```ts
/** 呼び出し元の pane（pane の中の sodactl が名乗る）。グラフの自動載せの関係の記録にだけ使う。実在しなければ無視する。 */
callerPaneId: paneId.optional()
```

`AgentLineage`（`packages/server/src/graph/AgentLineage.ts`）:

```ts
interface AgentLineageDeps {
  bus: EventBus;                       // pane.agent_status_changed / pane.closed を購読
  store: Pick<GraphStore, "get" | "update">;
  paneExists(paneId: string): boolean; // session.model に実在（親・子の確認）
  logger: Logger;
  retries?: number;                    // 既定 3（競合のやり直し）
}
class AgentLineage {
  noteCreated(childPaneId: string, callerPaneId: string | undefined): void; // 作った pane（弱い関係）
  noteStarted(paneId: string, callerPaneId: string | undefined): void;      // agent start（強い関係。noteCreated に勝つ）
  forgetStart(paneId: string, callerPaneId: string): void;                   // 書き込みの失敗で、その親の noteStarted だけを取り消す
  close(): void;                                                              // 購読を外す。以後は何もしない
}
```

状態（メモリのみ）: `created: Map<paneId, parentPaneId>`、`started: Map<paneId, parentPaneId>`、`attempted: Set<paneId>`。`pane.closed` でその pane の ID を 3 つから消す（親としての値は消さない——親が閉じたら載せる側で弾く）。

載せる処理 `attach(childId, parentId)`（検出の購読から非同期に 1 回）:

1. 親・子とも `paneExists`、親≠子でなければ終わる。親が無いときは `parent_gone` をログする（F6）。子が `attach` の途中で閉じていた（`child_gone`）ときは何もログしない（F7。検出の前に閉じた場合は `pane.closed` で記録が消え、`attach` に至らない）。
2. 最大 `retries` 回: `g = store.get()` → キー `local:<parent>`・`local:<child>` で ops を組む。
   - ノード: `addMissingNodeOps(g, [親, 子])`。追加後のノード数が 64 を超えるなら、何も足さずログして終わる（F4）。
   - 親のノード、または子のキーが既に載っているノードが `stale` なら何も足さずログ（`parent_stale`／`child_stale`。F6。`session.json` が読めず pane の ID を振り直した起動で、古い stale ノードと新しい pane の ID が衝突しうるため）。
   - 線: `supervise`（from=子, to=親）と `approval`（from=子, to=親, `defaultApprovalConfig()`〔notify・40 行〕, `LINK_LIMIT_DEFAULT`〔10〕。どちらも `client-core` の `defaults.ts` から import し、既定が変わっても追従する）。次のどれかなら**その線だけ**外す: 同じ kind・from・to が既にある、同じ kind・from の別の線（別の監督役）がある、同じ kind で逆向き（from=親, to=子）の線がある（相互の監督を作らない。`reverse_link`）。追加後の線の数が 128 を超えるなら、何も足さずログ。
   - ops が空なら終わる（`update` を呼ばない＝rev は進まない）。
   - `store.update(g.rev, ops, "graph")`。`GraphRevConflictError` なら次の回へ。`GraphInvalidError` ならログして終わる。
3. 失敗は呼び出し元へ伝えない（例外を握り、ログ）。**購読の入口（`pane.agent_status_changed`・`pane.closed` のハンドラ）も try/catch で包む**（同期の例外が他の購読者や `updatePaneRuntime` に影響しないように）。

## 振る舞いの詳細

- **記録の呼び出し**:
  - `pane.split`: `splitPane` の結果の `pane.id` に対し `noteCreated(result.pane.id, params.callerPaneId)`。`workspace.create`・`tab.create` も結果の `pane.id`。
  - `agent.start`: `starter.start(params, onAccepted)` の `onAccepted`（検査を全部通って予約した直後・書き込みの前に呼ばれ、拒否された要求では呼ばれない。`agent/AgentStarter.ts:62-63,115`）の中で、既存の `sizeAuthority.noteInteraction` と並べて `noteStarted(params.paneId, params.callerPaneId)` を呼ぶ。`agent_pane_busy` 等で断られた要求は記録しない。書き込み（`writeModal`）が失敗して `start` が投げたときだけ `forgetStart(params.paneId, 呼んだ親)`（その親の記録のときだけ消し、並行する別の `agent start` の記録は消さない）。
  - どれも `callerPaneId` が無い・実在しない・対象と同じなら何もしない。
- **検出の購読**: `pane.agent_status_changed` で `agent !== null` かつ `attempted` に無い pane について、親 = `started.get(id) ?? created.get(id)`。親があれば `attempted.add(id)` して `queueMicrotask`（応答の後）で `attach`。親が無ければ `attempted` に入れない（後で `agent start` が来た別のきっかけに備える。ただし 2 回目の検出で親が分かった場合は載せる）。
- **配置**: `addMissingNodeOps` の既存規則。2 つ足すときは親が先（親→子の順に並ぶ）。
- **利用者が外した子**: `attempted` により加え直さない（サーバが生きている間）。サーバの再起動で `attempted` は消えるが、`created`／`started` も消えるので親が分からず載らない（再起動をまたいで加え直さない）。
- **利用者が外した親**: 次の新しい子の検出で親のノードが加え直される（AC7）。そのとき親の既存の線は外されているので、新しい子の線だけが足される。
- **別のマシン**: `--machine` では sodactl が `callerPaneId` を送らない。サーバは local の pane しか見ない。
- **ログ**: `logger.info("graph.auto: added", {child, parent, nodes, links})`、スキップは `logger.info("graph.auto: skipped", {child, parent, reason})`（`reason`: `parent_gone`・`parent_stale`・`child_stale`・`reverse_link`・`duplicate_link`・`supervisor_taken`・`too_many_nodes`・`too_many_links`・`conflict`・`invalid`）。失敗は `warn`。
- **互換**: 古い `sodactl` は `callerPaneId` を送らない（`noteX(undefined)` は何もしない）。古いサーバは未知の項目を無視する。

## ドメイン固有の考慮

- AGENTS.md の指す条項: E2E を書く・直すとき → `e2e-observe-browser`、不具合の回帰テスト → `regression-negative-control`。この work はサーバ・CLI の統合テストが中心で、グラフ画面の E2E は既存に無い（`docs/agent-graph.md`）。画面への反映は `graph.changed` の配信を統合テストで見る。
- 承認の代理は**知らせるだけ**（`notify`）に固定する。「返答まで任せる」を自動では選ばない（`docs/agent-graph.md` の注意）。
- pane の ID は再利用されない前提（`RemoteAgentPort.ts:180` のコメント）なので、`attempted`・`created`・`started` のキーは pane の ID でよい。

## エラー処理 / 異常系

- `callerPaneId` が不正な形（空文字）: スキーマで `min(1)` により `invalid_params`（古い sodactl は送らないので影響なし）。実在しない ID: 黙って無視。
- `graph.update` の失敗（`GraphInvalidError`・保存の失敗）: ログのみ。`pane.split`・`agent start` の応答には影響しない（検出の購読の中、応答の後に動くため）。
- `attach` の途中でサーバが止まる／`close()`: 以後の購読は何もせず、実行中の更新は待たない（`GraphStore.flush` が残りを保存）。
- Windows: `AgentLineage` は `bus` と `GraphStore` だけを使い、`pane.sock`・`/proc` に依存しない。ただし `agent.start` 自体は win32 で `unsupported_agent_shell`（`AgentStarter.ts`）なので、Windows のサーバで自動載せの対象になるのは `pane split` 等で作った pane に打ち込みで起動した場合になる。
- 引き継ぎ（`soda handoff`）: 新しい版が起動し直すので、メモリの記録は消える（引き継ぎの前に作った pane は載らない）。仕様として文書に書く。

## 受け入れ基準との対応

- AC1: 入力は `pane.split`／`workspace.create`／`tab.create`／`agent.start` の `callerPaneId`（sodactl が `selfPaneId` で確認して送る）と、`pane.agent_status_changed`。`noteStarted`／`noteCreated` → 検出 → `attach` が子・親のノードを足す。`attempted` が 2 回目を防ぐ。
- AC2: 購読は検出の事実だけを見るので、打ち込みで起動した場合も同じ経路。親は `created`（`pane split` の呼び出し元）。
- AC3: 親 = `started ?? created`。`agent start` を打った pane が勝つ。
- AC4: 呼び出し元が分からない（`callerPaneId` なし）なら `noteX` は何もせず、`attach` に至らない。`--machine` は CLI が送らない。
- AC5: `attach` が `supervise`（子→親）を足す。親への知らせは既存の `GraphEngine.reconcileSupervisors`。
- AC6: `attach` が `approval`（子→親、`notify`・40・10）を足す。承認待ちの知らせは既存の `TriggerState`／`GraphEngine`。
- AC7: 子は `attempted` で戻らない。親は次の新しい子のときノードが無ければ `addMissingNodeOps` が足す。
- AC8: 既存のノード・線は ops で触らない（追加のみ）。重複・別の監督役の線は組み立て前に外す。配置は `addMissingNodeOps`。
- AC9: 追加後の件数が上限を超えるなら ops を空にしてログ。部分的には足さない。
- AC10: `paneExists`・`stale` の検査。検出前に子が閉じると `pane.closed` で記録を消し、検出は来ない。
- AC11: `rev_conflict` で `get()` からやり直し（最大 3 回）。失敗は握ってログ。`attach` は非同期（`queueMicrotask`）で動き、例外を握るので、応答を待たせず失敗を伝えない。検出はポーリング（500ms〜1s）由来で応答より後に来るので、順序の問題も無い。
- AC12: `graph.changed` は既存の `graph.onChange` が配る。ops が空なら `update` を呼ばず rev は進まない。
- AC13: 項目は省略可能。古い sodactl／古いサーバの組み合わせをテストで示す（旧形の params で `pane.split` が成功する）。
- AC14: 文書 4 点を更新する。
