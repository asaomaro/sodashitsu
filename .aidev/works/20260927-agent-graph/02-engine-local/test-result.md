# テスト結果: 02-engine-local（手元の pane での実行）

## 実行したもの
- 1ce14a2 の上で `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 340 files / 6088 passed・exit 0（load average 0.3）
- レビューのラウンド 1 の修正（84797f4）の後: `pnpm build`・`typecheck`・`test`（340 files / 6094 passed）いずれも exit 0（実装者の検証）
- E2E・負荷試験は依頼が無いので回していない。

## 受け入れ基準ごとの判定（02 の担う範囲・手元の pane）
- AC4: pass（完了の鍵で 1 回だけ送る。TriggerState の変化の列の試験・実物のサーバの結合試験。サーバだけで動き、ブラウザの接続なし）
- AC5: pass（whenBusy wait/skip・busy_timeout・target_absent・blocked の見送りと履歴の理由。単体・結合）
- AC6: pass（折り返しをつないだ論理行の末尾 N 行が {output} に入る。結合試験で先の pane に届いた内容を確認）
- AC7: pass（監督役への知らせ・配下の変化で知らせ直し・2 秒のまとめ・続けて 2 通送らない。単体・結合）
- AC8: 部分的に pass（delegate の文面と材料が監督役に届く結合試験）。監督役が sodactl send-keys で答えて解ける一巡は 05 の統合試験で確かめる。
- AC9: pass（notify は知らせだけで、元は承認待ちのまま。人への通知は既存の経路のまま）
- AC10: 部分的に pass（graph.fired の配布・graph.history の履歴 50 件・新しい順）。画面の表示は 03。
- AC11: pass（上限で paused:"limit"・上限を回数以下に下げたらその場で一時停止・並行の送信で超えない）。利用者への知らせの表示は 03。
- AC12: pass（全体・線ごとの一時停止中は見送り。送る直前にも見直す）
- 別のマシンのノードは 04 まで machine_unavailable（D5）。

## 既知の懸念
- 結合試験のファイルは約 26 秒（実時間の見回り・cat の起動待ち・handoff の往復）。
- 送った直後の先を最長 5 秒「作業中」とみなす（D5）。状態を変えないエージェントでは最長 5 秒遅れる。

## 失敗の証跡

### 負の確認（修正前のコードで落ちる生の出力・変異の網羅）

```
# 02-engine-local の負の確認（変異の網羅。scratchpad/mutate.py で行の削除・記号の置き換えを 1 つずつ行い、試験が落ちるかを見た）

## 1 回目（試験を足す前）

=== 変異の網羅: src/graph/TriggerState.ts（試験 src/graph/TriggerState.test.ts）===
生き残り L43 [行を消す] private settings: TriggerSettings;
生き残り L47 [行を消す] private blockedSince: number | null = null;
生き残り L49 [行を消す] private blockedHandled = false;
生き残り L49 [false → true] private blockedHandled = false;
生き残り L50 [行を消す] private target: AgentInfo | null = null;
生き残り L60 [true → false] this.observeSource(initial.source, initial.at, true);
生き残り L74 [行を消す] return this.resolveWaiting(input.at);
生き残り L76 [?? → ||] return this.checkBlockedHold(input.at) ?? this.resolveWaiting(input.at);
生き残り L83 [行を消す] return null;
生き残り L86 [行を消す] input satisfies never;
生き残り L87 [行を消す] return null;
生き残り L96 [行を消す] this.blockedHandled = false;
生き残り L96 [false → true] this.blockedHandled = false;
生き残り L104 [行を消す] this.blockedSince = agent.state === "blocked" ? at : null;
生き残り L106 [行を消す] return null;
生き残り L108 [! を外す] if (agent.completionSeq > this.baseline!.completionSeq) {
生き残り L115 [行を消す] this.blockedHandled = false;
生き残り L119 [行を消す] this.blockedHandled = false;
生き残り L119 [false → true] this.blockedHandled = false;
生き残り L121 [行を消す] if (initial) return null;
生き残り L136 [行を消す] this.waitingSince = null;
生き残り L141 [行を消す] this.waitingSince = null;
生き残り L144 [行を消す] this.waitingSince = null;
生き残り L147 [行を消す] this.waitingSince = null;
生き残り L151 [行を消す] this.waitingSince = null;
結果: 変異 113 件・試験が落とした 88 件・生き残り 25 件


## 2 回目（試験を足し、コードを簡単にした後）
=== 変異の網羅: src/graph/TriggerState.ts（試験 src/graph/TriggerState.test.ts）===
生き残り L43 [行を消す] private settings: TriggerSettings;
生き残り L47 [行を消す] private blockedSince: number | null = null;
生き残り L49 [行を消す] private blockedHandled = false;
生き残り L49 [false → true] private blockedHandled = false;
生き残り L50 [行を消す] private target: AgentInfo | null = null;
生き残り L74 [行を消す] return this.resolveWaiting(input.at);
生き残り L76 [?? → ||] return this.checkBlockedHold(input.at) ?? this.resolveWaiting(input.at);
生き残り L83 [行を消す] return null;
生き残り L86 [行を消す] input satisfies never;
生き残り L87 [行を消す] return null;
生き残り L103 [行を消す] return null;
生き残り L106 [行を消す] if (completed)
結果: 変異 99 件・試験が落とした 87 件・生き残り 12 件

--- TriggerState の生き残りの判定（2 回目の網羅の後。1 回目の生き残りのうち、試験の抜けは試験を足し、重複した代入・使わない引数はコードを簡単にして消した）---
L43/47/49/50（フィールドの初期値・宣言を消す）: コンストラクタが observeSource・target の代入で必ず上書きする（元が null でも blockedSince を null にする）→ 同値の変異。
L74（target の return を消す）: 次の tick の枝へ落ちる。checkBlockedHold は blocked の回の判定で、target の知らせで動いても結果は同じ → 同値。
L76（?? → ||）: 決定は null かオブジェクト（常に真）なので同じ → 同値。
L83/86/87（config・default の return を消す）: default の return null へ落ちる → 同値。
L103（入れ替わりの枝の return null を消す）: 続きの判定は completed=false・blocked の回は handled 済み／blockedSince=null で必ず null → 同値。
L106（if (completed) を消して基準を常に更新）: 同じ instanceId で completionSeq は減らない（AgentTracker は増やすだけ）ので同値。

## SupervisorNotifier 1 回目

=== 変異の網羅: src/graph/SupervisorNotifier.ts（試験 src/graph/SupervisorNotifier.test.ts）===
生き残り L21 [行を消す] private signature: string;
生き残り L22 [行を消す] private supervisor: AgentInfo | null;
生き残り L23 [行を消す] private paused: boolean;
生き残り L25 [行を消す] private dirtyAt: number | null;
生き残り L48 [行を消す] this.signature = input.signature;
生き残り L65 [行を消す] input satisfies never;
結果: 変異 38 件・試験が落とした 32 件・生き残り 6 件

## SupervisorNotifier 2 回目（「変わった後の顔ぶれを覚える」の試験を足した後）

=== 変異の網羅: src/graph/SupervisorNotifier.ts（試験 src/graph/SupervisorNotifier.test.ts）===
生き残り L21 [行を消す] private signature: string;
生き残り L22 [行を消す] private supervisor: AgentInfo | null;
生き残り L23 [行を消す] private paused: boolean;
生き残り L25 [行を消す] private dirtyAt: number | null;
生き残り L65 [行を消す] input satisfies never;
結果: 変異 38 件・試験が落とした 33 件・生き残り 5 件
--- 判定: L21〜25（フィールドの宣言）はコンストラクタで必ず代入する → 同値。L65（satisfies never）は型だけの検査で実行時の意味が無い → 同値。

## LocalAgentPort 1 回目

=== 変異の網羅: src/graph/LocalAgentPort.ts（試験 src/graph/LocalAgentPort.test.ts）===
生き残り L14 [行を消す] bus: { subscribe(fn: (e: ServerEvent) => void): Disposable };
生き残り L18 [行を消す] invoke(method: "agent.prompt", params: { paneId: PaneId; text: string }): Promise<InvokeResult>;
生き残り L43 [?? → ||] return this.deps.session.getPane(paneId)?.agent ?? null;
生き残り L54 [|| → &&] if (host === undefined || pane === undefined) return "";
生き残り L59 [> → >=] while (end > 0 && raw[end - 1]!.trim() === "") end--;
生き残り L59 [! を外す] while (end > 0 && raw[end - 1]!.trim() === "") end--;
結果: 変異 37 件・試験が落とした 31 件・生き残り 6 件

## LocalAgentPort 2 回目（全部が空行の画面・pane の記録の無い端末の試験を足した後）

=== 変異の網羅: src/graph/LocalAgentPort.ts（試験 src/graph/LocalAgentPort.test.ts）===
生き残り L14 [行を消す] bus: { subscribe(fn: (e: ServerEvent) => void): Disposable };
生き残り L18 [行を消す] invoke(method: "agent.prompt", params: { paneId: PaneId; text: string }): Promise<InvokeResult>;
生き残り L43 [?? → ||] return this.deps.session.getPane(paneId)?.agent ?? null;
生き残り L59 [! を外す] while (end > 0 && raw[end - 1]!.trim() === "") end--;
結果: 変異 37 件・試験が落とした 33 件・生き残り 4 件
--- 判定: L14・L18 は interface の型の行（実行時に無い）、L43 の ?? → || は左が null か AgentInfo（オブジェクト）なので同じ、L59 の ! は TS の非 null 表明（実行時に無い）→ いずれも同値。

## GraphEngine 1 回目（試験 29 件の時点）

=== 変異の網羅: src/graph/GraphEngine.ts（試験 src/graph/GraphEngine.test.ts）===
生き残り L3 [行を消す] type Graph,
生き残り L4 [行を消す] type GraphLink,
生き残り L5 [行を消す] type GraphNode,
生き残り L6 [行を消す] type LinkRun,
生き残り L7 [行を消す] type ServerEvent,
生き残り L16 [行を消す] type GraphPaneInfo,
生き残り L25 [行を消す] type SupervisorDecision,
生き残り L40 [行を消す] get(): Graph;
生き残り L41 [行を消す] onChange(fn: (graph: Graph, byClientId: string | null) => void): Disposable;
生き残り L42 [行を消す] recordRun(linkId: string): Promise<{ limitReached: boolean } | null>;
生き残り L46 [行を消す] publish(event: ServerEvent): void;
生き残り L47 [行を消す] now(): number;
生き残り L49 [行を消す] setInterval?(fn: () => void, ms: number): { clear(): void };
生き残り L80 [行を消す] if (parsed === null) return null;
生き残り L92 [行を消す] private subs: Disposable[] = [];
生き残り L93 [行を消す] private timer: { clear(): void } | null = null;
生き残り L94 [行を消す] private graph: Graph | null = null;
生き残り L97 [行を消す] private running = false;
生き残り L104 [行を消す] this.generation++;
生き残り L104 [++ → --] this.generation++;
生き残り L109 [?? → ||] const every = this.deps.setInterval ?? defaultInterval;
生き残り L116 [行を消す] if (!this.running) return;
生き残り L118 [++ → --] this.generation++;
生き残り L120 [行を消す] this.subs = [];
生き残り L122 [行を消す] this.timer = null;
生き残り L123 [行を消す] for (const rt of this.links.values()) rt.state.cancel();
生き残り L125 [行を消す] this.supervisors.clear();
生き残り L126 [行を消す] this.graph = null;
生き残り L134 [?? → ||] : [...(this.history.get(linkId) ?? [])];
生き残り L151 [行を消す] if (!this.running) return;
生き残り L157 [行を消す] if (link.kind === "supervise") continue;
生き残り L163 [行を消す] rt.state.cancel(); // 消えた・無効になった線の待ちは黙って取り消す
生き残り L164 [行を消す] this.links.delete(id);
生き残り L167 [=== → !==] if (!graph.links.some((l) => l.id === id)) this.history.delete(id);
生き残り L185 [行を消す] from === null ||
生き残り L185 [|| → &&] from === null ||
生き残り L186 [行を消す] to === null ||
生き残り L197 [行を消す] existing.link = link;
生き残り L201 [行を消す] existing?.state.cancel();
生き残り L208 [?? → ||] target: to.port?.status(to.paneId) ?? null,
生き残り L209 [行を消す] at,
生き残り L213 [行を消す] return rt;
生き残り L227 [?? → ||] on: trigger?.on ?? "blocked",
生き残り L228 [行を消す] whenBusy: trigger?.whenBusy ?? "wait",
生き残り L228 [?? → ||] whenBusy: trigger?.whenBusy ?? "wait",
生き残り L236 [行を消す] if (link.kind !== "supervise") continue;
生き残り L237 [?? → ||] const list = bySupervisor.get(link.to) ?? [];
生き残り L245 [行を消す] this.supervisors.delete(key);
生き残り L249 [=== → !==] links.map((l) => ({ key: l.from, stale: nodes.get(l.from)?.stale === true })),
生き残り L255 [行を消す] key,
生き残り L289 [&& → ||] if (sv.end.port === port && sv.end.paneId === e.paneId) {
生き残り L313 [! を外す] const target = to.port!;
生き残り L318 [! を外す] if (from.port!.status(from.paneId)?.state !== "blocked") {
生き残り L320 [行を消す] linkId: link.id,
生き残り L321 [行を消す] at: this.deps.now(),
生き残り L327 [! を外す] const config = link.approval!;
生き残り L328 [! を外す] const tail = await from.port!.tail(from.paneId, config.lines);
生き残り L331 [! を外す] const trigger = link.trigger!;
生き残り L333 [! を外す] trigger.output === null ? null : await from.port!.tail(from.paneId, trigger.output.lines);
生き残り L336 [行を消す] if (gen !== this.generation) return;
生き残り L346 [行を消す] if (gen !== this.generation) return;
生き残り L354 [行を消す] if (gen !== this.generation) return;
生き残り L354 [!== → ===] if (gen !== this.generation) return;
生き残り L356 [行を消す] linkId: link.id,
生き残り L357 [行を消す] error: err instanceof Error ? err.message : String(err),
生き残り L364 [?? → ||] const nodes = new Map((this.graph?.nodes ?? []).map((n) => [n.key, n]));
生き残り L373 [! を外す] await sv.end.port!.prompt(sv.end.paneId, text);
生き残り L374 [行を消す] if (gen !== this.generation) return;
生き残り L379 [行を消す] if (gen !== this.generation) return;
生き残り L382 [行を消す] err instanceof AgentPortError &&
生き残り L382 [&& → ||] err instanceof AgentPortError &&
生き残り L383 [=== → !==] (err.code === "agent_blocked" || err.code === "agent_not_found")
生き残り L400 [行を消す] linkId,
生き残り L401 [行を消す] at,
生き残り L410 [?? → ||] const name = end.port?.paneName(end.paneId) ?? `pane ${end.paneId}`;
生き残り L411 [?? → ||] const agent = end.port?.status(end.paneId) ?? null;
生き残り L415 [?? → ||] kind: agent?.kind ?? null,
生き残り L423 [?? → ||] const list = this.history.get(run.linkId) ?? [];
生き残り L425 [> → >=] if (list.length > GRAPH_HISTORY_PER_LINK) list.splice(0, list.length - GRAPH_HISTORY_PER_LINK);
生き残り L436 [行を消す] error: err instanceof Error ? (err.stack ?? err.message) : String(err),
生き残り L436 [?? → ||] error: err instanceof Error ? (err.stack ?? err.message) : String(err),
生き残り L443 [行を消す] const t = setInterval(fn, ms);
生き残り L444 [行を消す] t.unref?.();
生き残り L445 [行を消す] return { clear: () => clearInterval(t) };
結果: 変異 356 件・試験が落とした 272 件・生き残り 84 件

## GraphEngine 2 回目（抜けの試験 15 件を足し、使わない処理〔start の generation・stop の二重の判定・消した線の cancel・reconcile の running の判定・SupervisorRuntime.key・endOf の null〕を消した後。型だけの行を網羅の対象から外した）

=== 変異の網羅: src/graph/GraphEngine.ts（試験 src/graph/GraphEngine.test.ts）===
生き残り L42 [行を消す] recordRun(linkId: string): Promise<{ limitReached: boolean } | null>;
生き残り L79 [! を外す] const parsed = parseNodeKey(key)!;
生き残り L91 [行を消す] private subs: Disposable[] = [];
生き残り L92 [行を消す] private timer: { clear(): void } | null = null;
生き残り L93 [行を消す] private graph: Graph | null = null;
生き残り L96 [行を消す] private running = false;
生き残り L107 [?? → ||] const every = this.deps.setInterval ?? defaultInterval;
生き残り L115 [++ → --] this.generation++; // 送っている途中の結果を捨てる印
生き残り L117 [行を消す] this.subs = [];
生き残り L119 [行を消す] this.timer = null;
生き残り L130 [?? → ||] : [...(this.history.get(linkId) ?? [])];
生き残り L152 [行を消す] if (link.kind === "supervise") continue;
生き残り L176 [false → true] return false;
生き残り L195 [?? → ||] target: to.port?.status(to.paneId) ?? null,
生き残り L196 [行を消す] at,
生き残り L214 [?? → ||] on: trigger?.on ?? "blocked",
生き残り L215 [?? → ||] whenBusy: trigger?.whenBusy ?? "wait",
生き残り L224 [?? → ||] const list = bySupervisor.get(link.to) ?? [];
生き残り L236 [=== → !==] links.map((l) => ({ key: l.from, stale: nodes.get(l.from)?.stale === true })),
生き残り L299 [! を外す] const target = to.port!;
生き残り L304 [! を外す] if (from.port!.status(from.paneId)?.state !== "blocked") {
生き残り L313 [! を外す] const config = link.approval!;
生き残り L314 [! を外す] const tail = await from.port!.tail(from.paneId, config.lines);
生き残り L317 [! を外す] const trigger = link.trigger!;
生き残り L319 [! を外す] trigger.output === null ? null : await from.port!.tail(from.paneId, trigger.output.lines);
生き残り L341 [行を消す] linkId: link.id,
生き残り L342 [行を消す] error: err instanceof Error ? err.message : String(err),
生き残り L349 [?? → ||] const nodes = new Map((this.graph?.nodes ?? []).map((n) => [n.key, n]));
生き残り L357 [! を外す] await sv.end.port!.prompt(sv.end.paneId, text);
生き残り L366 [行を消す] err instanceof AgentPortError &&
生き残り L394 [?? → ||] const name = end.port?.paneName(end.paneId) ?? `pane ${end.paneId}`;
生き残り L395 [?? → ||] const agent = end.port?.status(end.paneId) ?? null;
生き残り L399 [?? → ||] kind: agent?.kind ?? null,
生き残り L407 [?? → ||] const list = this.history.get(run.linkId) ?? [];
生き残り L409 [> → >=] if (list.length > GRAPH_HISTORY_PER_LINK) list.splice(0, list.length - GRAPH_HISTORY_PER_LINK);
生き残り L420 [行を消す] error: err instanceof Error ? (err.stack ?? err.message) : String(err),
生き残り L420 [?? → ||] error: err instanceof Error ? (err.stack ?? err.message) : String(err),
生き残り L428 [行を消す] t.unref?.();
結果: 変異 318 件・試験が落とした 280 件・生き残り 38 件

=== 変異（試験を足した後の確認）: reconcile の監督の線の除外を外す → exit 1 ===

=== 変異（試験を足した後の確認）: 無効・元が別のマシンの線を生きているとする（return false → true） → exit 1 ===
--- GraphEngine の生き残りの判定（2 回目の 38 件。L152・L176 は試験を足して上のとおり落ちるようにした。残り 36 件はいずれも同値）:
- 型だけ・TS の表明: L42（interface のメソッドの宣言）、L79・L299・L304・L313・L314・L317・L319・L357 の `!`。
- フィールドの宣言・初期値と停止の片付け: L91〜96（start で必ず代入）、L115（++ → --。値が変わりさえすれば途中の結果を捨てる）、L117・L119（start で差し替える）。
- `??` → `||`: 左が null/undefined かオブジェクト・空でない文字列・関数（L107・L130・L195・L214・L215・L224・L349・L394・L395・L399・L407・L420）。
- L196（初めの状態の at）: 最初に見た値が blocked のときの blockedSince にだけ使い、その回は handled 済みで時刻を読まない。
- L236（=== → !==）: 無効の印を全部反転しても署名の変化の有無は同じ。
- L341・L342・L420（ログの中身）: 振る舞いを変えない。
- L366（`err instanceof AgentPortError &&` を消す）: AgentPortError でない値の code は undefined で、条件は同じく偽。
- L409（> → >=）: 50 件ちょうどのとき 0 件を切るだけ。
- L428（unref）: プロセスの終了を妨げないためだけ（試験では観測できない）。

## composeServer の配線（結合試験 composeServer.graph.integration.test.ts。01 で未検証だった「終了で graph.close() を呼ぶ行」を含む）

=== 変異: 終了の graph.close() を graph.flush() に戻す（01 の未検証の行） → exit 1 ===

=== 変異: listen の graphEngine.start() を消す → exit 1 ===

=== 変異: 終了の graphEngine.stop() を消す → exit 0 ===
（落ちなかった）
（↑ 終了の graphEngine.stop() を消しても落ちない: 終了の後は接続が閉じ・graph.json は閉じた保存が断るので、止め忘れた実行の動き〔メモリの履歴・bus への graph.fired〕を外から観測できない。GraphEngine.stop の振る舞いは単体試験〔GraphEngine.test.ts の stop の試験〕で確かめている。残った懸念として報告する）

# g02 点検の修正（タスク点検 18 件）

=== T1 TriggerState: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/graph/TriggerState.test.ts > TriggerState — 承認待ちの回と待ち（g02 点検） > 待つ間に元が承認待ちを抜けたら、承認の待ちは resolved で取り消す（次の回で改めて動く）
AssertionError: expected null to deeply equal { kind: 'skip', reason: 'resolved' }

- Expected:
{
  "kind": "skip",
  "reason": "resolved",
}

+ Received:
null

 ❯ src/graph/TriggerState.test.ts:330:86
    328|     s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0…
    329|     expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS })).toEqual({ …
    330|     expect(s.handle({ kind: "source", agent: agent("a1", 0, "working")…
       |                                                                                      ^
    331|       kind: "skip",
    332|       reason: "resolved",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/server| src/graph/TriggerState.test.ts > TriggerState — 承認待ちの回と待ち（g02 点検） > 元が居なくなっても承認の待ちは resolved で取り消す
AssertionError: expected null to deeply equal { kind: 'skip', reason: 'resolved' }

- Expected:
{
  "kind": "skip",
  "reason": "resolved",
}

+ Received:
null

 ❯ src/graph/TriggerState.test.ts:348:65
    346|     s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0…
    347|     s.handle({ kind: "tick", at: BLOCKED_HOLD_MS });
    348|     expect(s.handle({ kind: "source", agent: null, at: 2000 })).toEqua…
       |                                                                 ^
    349|       kind: "skip",
    350|       reason: "resolved",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/server| src/graph/TriggerState.test.ts > TriggerState — 承認待ちの回と待ち（g02 点検） > on を done から blocked に変えたとき、続いている承認待ちの回は基準（動かない）。次の回から動く
AssertionError: expected { kind: 'send' } to be null

- Expected:
null

+ Received:
{
  "kind": "send",
}

 ❯ src/graph/TriggerState.test.ts:377:53
    375|     s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0…
    376|     expect(s.handle({ kind: "config", settings: BLOCKED })).toBeNull();
    377|     expect(s.handle({ kind: "tick", at: 100_000 })).toBeNull();
       |                                                     ^
    378|     s.handle({ kind: "source", agent: agent("a1", 0, "working"), at: 1…
    379|     s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 1…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)

=== T1 TriggerState 修正後の変異の網羅 ===

=== 変異の網羅: src/graph/TriggerState.ts（試験 src/graph/TriggerState.test.ts）===
生き残り L43 [行を消す] private settings: TriggerSettings;
生き残り L47 [行を消す] private blockedSince: number | null = null;
生き残り L49 [行を消す] private blockedHandled = false;
生き残り L49 [false → true] private blockedHandled = false;
生き残り L50 [行を消す] private target: AgentInfo | null = null;
生き残り L77 [?? → ||] return this.checkBlockedHold(input.at) ?? this.checkTimeout(input.at);
生き残り L87 [行を消す] return null;
生き残り L90 [行を消す] input satisfies never;
生き残り L91 [行を消す] return null;
生き残り L107 [行を消す] return null;
生き残り L110 [行を消す] if (completed)
生き残り L175 [行を消す] if (this.blockedSince !== null) this.blockedHandled = true;
生き残り L175 [!== → ===] if (this.blockedSince !== null) this.blockedHandled = true;
結果: 変異 120 件・試験が落とした 107 件・生き残り 13 件
--- 判定: L43〜L110 は前回と同じ同値の変異（前回の記録を参照）。L175（待ちから送ったときに回を処理済みにする）は依頼どおり足した念のための揃え: 承認の待ちは元が blocked を抜けると resolved で消えるので、待ちから送る時点の回は発火した回と同じで、印は発火の時点で既に付いている → 同値（外しても観測できない）。

=== T3 折り返しの行: 修正前のコードで回帰テストが落ちる（生の出力。lastLogicalLines が無いので TypeError。bottomLines は画面の行で数えるので、同じ入力で折り返した行が 2 行に分かれる——下の変異で振る舞いを別に確かめる） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/terminal/Mirror.test.ts > XtermMirror — lastLogicalLines（20260927-agent-graph の受け渡し） > 折り返した行は 1 行につなぎ、末尾の空行を除いてから最後の N 行を返す
TypeError: mirror.lastLogicalLines is not a function
 ❯ src/terminal/Mirror.test.ts:82:19
     80|     const mirror = new XtermMirror(10, 6, 1000);
     81|     await writeAndWait(mirror, "first\r\n" + "0123456789ABCDEFGHIJ-lon…
     82|     expect(mirror.lastLogicalLines(2)).toEqual(["0123456789ABCDEFGHIJ-…
       |                   ^
     83|     expect(mirror.lastLogicalLines(10)).toEqual(["first", "0123456789A…
     84|     mirror.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/terminal/Mirror.test.ts > XtermMirror — lastLogicalLines（20260927-agent-graph の受け渡し） > スクロールバックに押し出された行も数える。何も無ければ空
TypeError: mirror.lastLogicalLines is not a function
 ❯ src/terminal/Mirror.test.ts:89:19
     87|   it("スクロールバックに押し出された行も数える。何も無ければ空", async () => {
     88|     const mirror = new XtermMirror(10, 3, 1000);
     89|     expect(mirror.lastLogicalLines(3)).toEqual([]);
       |                   ^
     90|     await writeAndWait(mirror, "a\r\nb\r\nc\r\nd\r\ne");
     91|     expect(mirror.lastLogicalLines(4)).toEqual(["b", "c", "d", "e"]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)

=== T3 変異（修正の箇所だけを戻す・壊す）: 折り返しをつなぐ条件を外す（画面の行で数える） → exit 1 ===

=== T3 変異（修正の箇所だけを戻す・壊す）: 末尾の空行を数えるようにする → exit 1 ===

=== T3 変異（修正の箇所だけを戻す・壊す）: 右端の空白を残す → exit 0 ===
（落ちなかった）

=== T3 変異（修正の箇所だけを戻す・壊す）: 数える上限を外す（out.length < n） → exit 1 ===

=== T3 変異（修正の箇所だけを戻す・壊す）: 最初の行（y = 0）を読まない → exit 1 ===
（↑ 右端の空白を落とす置き換えは translateToString(true) が既に落としているので重複だった。コードから消した）

=== T4 should（上限を回数以下に下げる）client-core ops: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/graph/ops.test.ts > applyGraphOps > update_link で上限を回数以下に下げたら paused: limit にする（既に止まっている線・上限が回数より大きい線は変えない。g02 点検）
AssertionError: expected { id: 'l1', kind: 'supervise', …(5) } to match object { limit: 5, count: 5, paused: 'limit' }
(4 matching properties omitted from actual)

- Expected
+ Received

  {
    "count": 5,
    "limit": 5,
-   "paused": "limit",
+   "paused": null,
  }

 ❯ src/graph/ops.test.ts:199:7
    197|     expect(
    198|       ok(base(5, null), [{ op: "update_link", id: "l1", limit: 5 }]).g…
    199|     ).toMatchObject({ limit: 5, count: 5, paused: "limit" });
       |       ^
    200|     expect(
    201|       ok(base(5, null), [{ op: "update_link", id: "l1", limit: 3 }]).g…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

=== T4 should ops の変異: 上限の一時停止を付ける行を消す → exit 1 ===

=== T4 should ops の変異: >= を > にする（ちょうど回数の上限を見逃す） → exit 1 ===

=== T4 should ops の変異: paused === null の条件を外す（利用者の一時停止を上書き） → exit 1 ===

=== T4 nit（rev の上昇・user→limit の上書き）GraphStore: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > recordRun は rev を上げない（回数は rev の対象外。他の画面の graph.update を rev_conflict にしない）が、保存して知らせる（g02 点検）
AssertionError: expected 2 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 2

 ❯ src/persist/GraphStore.test.ts:372:29
    370|     store.onChange((g) => seen.push([g.rev, g.links[0]!.count]));
    371|     await store.recordRun("l1");
    372|     expect(store.get().rev).toBe(1);
       |                             ^
    373|     expect(seen).toEqual([[1, 1]]);
    374|     // 回数を数えた後でも、同じ rev を見ていた画面の変更は通る

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > recordRun は利用者の一時停止を上限の一時停止で上書きしない（送っている途中に止められた。g02 点検）
AssertionError: expected { id: 'l1', kind: 'trigger', …(6) } to match object { count: 1, paused: 'user' }
(10 matching properties omitted from actual)

- Expected
+ Received

  {
    "count": 1,
-   "paused": "user",
+   "paused": "limit",
  }

 ❯ src/persist/GraphStore.test.ts:386:34
    384|     await store.pause("l1", "c1");
    385|     expect(await store.recordRun("l1")).toEqual({ limitReached: true }…
    386|     expect(store.get().links[0]).toMatchObject({ count: 1, paused: "us…
       |                                  ^
    387|   });
    388|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)

=== T4 GraphStore の変異: recordRun で rev を上げる（bumpRev: false → true） → exit 1 ===

=== T4 GraphStore の変異: 既に止まっている線でも limit を付ける（paused === null を外す） → exit 1 ===

## T4・T2 GraphEngine の修正箇所の変異（修正を 1 つずつ戻す）

=== 変異: T2: 線の送り始めに先を作業中とみなさない → exit 1 ===

=== 変異: T2: 監督の知らせの送り始めに監督役を作業中とみなさない → exit 0 ===
（落ちなかった）

=== 変異: T2: 作業中とみなす期限が来ても本物の状態に戻さない → exit 1 ===

=== 変異: T4: 送る直前の見直しを外す → exit 1 ===

=== 変異: T4: 消えた線でも見送りを記録する → exit 1 ===

=== 変異: T4: 見直しで上限（count >= limit）を見ない → exit 1 ===

=== 変異: T4: 見直しで線の利用者の一時停止を見ない → exit 1 ===

=== 変異: T4: 送信中の線に重ねて送る → exit 1 ===

=== 変異: T4: 監督役へ送信中の知らせを送り直しに回さない → exit 1 ===

=== 変異: T4: graph.fired を同期で配る → exit 1 ===

=== 変異: T4: 同じ時刻の履歴を連番で並べない → exit 1 ===

=== 変異（試験を足した後）: T2: 監督の知らせの送り始めに監督役を作業中とみなさない → exit 1 ===

## T5 composeServer の配線の変異（結合試験 composeServer.graph.integration.test.ts。前回は落とせなかった終了の stop と handoff の pause/resume を含む）

=== 変異: 終了の graphEngine.stop() を消す → exit 1 ===

=== 変異: handoff の pausePollers の graphEngine.stop() を消す → exit 1 ===

=== 変異: handoff の resumePollers の graphEngine.start() を消す → exit 1 ===

=== 変異: 終了の graph.close() を graph.flush() に戻す → exit 1 ===

=== 変異: listen の graphEngine.start() を消す → exit 1 ===

# 02 レビュー ラウンド 1 の修正（3 件）

=== 修正前のコードで回帰テストが落ちる（生の出力。「みなしを外す」「失敗は数えない」の 2 件は逆向きの守りで、修正前から通る） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/graph/GraphEngine.test.ts > GraphEngine — 履歴・開始と停止 > stop で購読・見回りを止め、待ちは黙って取り消す（履歴を足さない）。送っている途中の結果は履歴に残さない（届いた分の回数は数える）
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 ❯ src/graph/GraphEngine.test.ts:602:31
    600|     await flush();
    601|     expect(t.runs()).toHaveLength(before);
    602|     expect(t.store.recordRun).toHaveBeenCalledTimes(1); // 止めた後に届いた 1 …
       |                               ^
    603|     t.engine.stop(); // 二度目は何もしない
    604|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/server| src/graph/GraphEngine.test.ts > GraphEngine — レビュー ラウンド 1 の修正 > 同じ先を待つ 2 本の線は、先の 1 回の idle の知らせで 1 通だけ送り、もう 1 本は待ち続ける
AssertionError: expected [ [ 'p2', '見て: 結果の末尾' ], …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/GraphEngine.test.ts:1069:28
    1067|     t.port.set("p2", agent("b1", 1, "idle"));
    1068|     await flush();
    1069|     expect(t.port.prompts).toHaveLength(1);
       |                            ^
    1070|     // 先が 1 通目を片付けたら 2 通目
    1071|     t.port.set("p2", agent("b1", 1, "working"));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/server| src/graph/GraphEngine.test.ts > GraphEngine — レビュー ラウンド 1 の修正 > 監督の知らせと承認の代理が監督役の 1 回の idle の知らせで揃っても、1 通だけ送る
AssertionError: expected [ [ 'p3', …(1) ], [ 'p3', …(1) ] ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/GraphEngine.test.ts:1097:28
    1095|     t.port.set("p3", agent("s1", 1, "idle"));
    1096|     await flush();
    1097|     expect(t.port.prompts).toHaveLength(1);
       |                            ^
    1098|   });
    1099|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/server| src/graph/GraphEngine.test.ts > GraphEngine — レビュー ラウンド 1 の修正 > 作業中とみなしている先の、idle のままの知らせ（既読・名前の変更）では、みなしを外さない
AssertionError: expected [ [ 'p2', '見て: 結果の末尾' ], …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/graph/GraphEngine.test.ts:1109:28
    1107|     t.done(2);
    1108|     await flush();
    1109|     expect(t.port.prompts).toHaveLength(1);
       |                            ^
    1110|     expect(t.runs().at(-1)).toMatchObject({ result: "waiting" });
    1111|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  |@sodashitsu/server| src/graph/GraphEngine.test.ts > GraphEngine — レビュー ラウンド 1 の修正 > 送っている途中に止めても、届いた送信は回数に数える（履歴は残さない）。閉じた保存が断っても投げない
AssertionError: expected "vi.fn()" to be called with arguments: [ 'l1' ]

Number of calls: 0

 ❯ src/graph/GraphEngine.test.ts:1140:31
    1138|     t.port.finish();
    1139|     await flush();
    1140|     expect(t.store.recordRun).toHaveBeenCalledWith("l1");
       |                               ^
    1141|     expect(t.store.graph.links[0]).toMatchObject({ count: 1, paused: "…
    1142|     expect(t.runs()).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  1 failed (1)

=== レビュー R1 の変異（修正を戻す）: 1: 先への入力に作業中のみなしを反映しない（線） → exit 1 ===

=== レビュー R1 の変異（修正を戻す）: 1: 監督役への入力に作業中のみなしを反映しない → exit 1 ===

=== レビュー R1 の変異（修正を戻す）: 2: 本物の知らせならいつでもみなしを外す → exit 1 ===

=== レビュー R1 の変異（修正を戻す）: 2: completionSeq の増加でみなしを外さない → exit 1 ===

=== レビュー R1 の変異（修正を戻す）: 2: 状態の変化でみなしを外さない → exit 1 ===

=== レビュー R1 の変異（修正を戻す）: 2: 入れ替わりでみなしを外さない → exit 1 ===

=== レビュー R1 の変異（修正を戻す）: 3: 止めた後に届いた送信を数えない（元の形） → exit 1 ===
```
