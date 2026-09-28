# テスト結果: 01-graph-core（型・保存・方式・開く操作）

## 実行したもの
- 7884bdf の上で `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 336 files / 5958 passed・exit 0（load average 10.8）
- レビューのラウンド 1 の修正（ab7de83）の後: `pnpm build`・`typecheck`・`test`（336 files / 5967 passed）いずれも exit 0（実装者の検証）
- E2E・負荷試験は依頼が無いので回していない。

## 受け入れ基準ごとの判定（01 の担う範囲）
- AC1: pass（`open_graph`〔prefix+a〕で web の `view.graphOpen` が開閉する試験・端末版は「グラフの画面はブラウザで開けます。」の知らせの試験）。画面の中身は 03。
- AC13: pass（`graph.json` の保存・rev・壊れたファイルの扱い・再起動後の復元の試験。`GraphStore`・実物のサーバの結合試験）。
- AC16: pass（`graph.update` の 7 つの操作・`rev_conflict`・`graph.changed` の配布の結合試験）。
- AC18: pass（一時停止・再開の方式。変化の無い一時停止・再開で rev を進めない試験）。`history` は 02 まで空。
- AC19: pass（未認証の拒否・`open_graph` の操作表の件数の試験〔client-core 57・web 45・tui 64〕）。
- 実行（発火）に関わる AC は 02 で判定する。

## 既知の未検証
- `composeServer` の終了で `GraphStore.close()` を呼ぶ行を `flush()` に戻しても落ちる試験が無い（GraphStore 単体の close 後の書き込み拒否は試験あり）。02 のエンジンの終了の試験で押さえる。

## 失敗の証跡

### 負の確認（点検の指摘の修正。修正前のコードで回帰テストが落ちることの生の出力）

```
=== g01 client-core: 修正前のコードで回帰テストが落ちる（生の出力。vitest run packages/client-core/src/graph） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/graph/message.test.ts > 8 ビットの C1 の列（g01 点検） > CSI（U+009B）は引数ごと、OSC（U+009D）は ST/BEL まで、DCS（U+0090）は ST まで落とす
AssertionError: expected 'a31mb0mc' to be 'abc' // Object.is equality

Expected: "abc"
Received: "a31mb0mc"

 ❯ src/graph/message.test.ts:38:50
     36| describe("8 ビットの C1 の列（g01 点検）", () => {
     37|   it("CSI（U+009B）は引数ごと、OSC（U+009D）は ST/BEL まで、DCS（U+0090）は ST まで落とす", …
     38|     expect(stripControl("a\u009B31mb\u009B0mc")).toBe("abc");
       |                                                  ^
     39|     expect(stripControl("a\u009D0;title\u0007b\u009D8;;http://x\u009Cc…
     40|     expect(stripControl("a\u009D0;t\u001B\\b")).toBe("ab");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  |@sodashitsu/client-core| src/graph/message.test.ts > buildTriggerText > 画面が空（""）で {output} が無ければ、末尾に空行を足さない
AssertionError: expected '見て\n\n' to be '見て' // Object.is equality

- Expected
+ Received

  見て
+
+

 ❯ src/graph/message.test.ts:65:40
     63|
     64|   it('画面が空（""）で {output} が無ければ、末尾に空行を足さない', () => {
     65|     expect(buildTriggerText("見て", "")).toBe("見て");
       |                                        ^
     66|   });
     67|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  |@sodashitsu/client-core| src/graph/validate.test.ts > validate の修正（20260927-agent-graph の g01 点検） > {output} を除くと空の文面は、受け渡しが無ければ empty_prompt（空の文面を送らない）
AssertionError: expected [] to deeply equal [ 'empty_prompt' ]

- Expected
+ Received

- [
-   "empty_prompt",
- ]
+ []

 ❯ src/graph/validate.test.ts:179:7
    177|         ),
    178|       ),
    179|     ).toEqual(["empty_prompt"]);
       |       ^
    180|     expect(
    181|       codes(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  |@sodashitsu/client-core| src/graph/validate.test.ts > validate の修正（20260927-agent-graph の g01 点検） > グラフに無い id の下書きは新しい線として 128 本の上限を見る
AssertionError: expected [] to include 'too_many_links'
 ❯ src/graph/validate.test.ts:202:90
    200|       ),
    201|     );
    202|     expect(codes(validateLink(full, { id: "l999", kind: "supervise", f…
       |                                                                                          ^
    203|       "too_many_links",
    204|     );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  2 failed | 3 passed (5)

=== g01 server GraphStore: 修正前のコードで回帰テストが落ちる（生の出力。vitest run packages/server/src/persist/GraphStore.test.ts）。close の試験は修正前には close が無いため TypeError で落ちる——書き込みを断る振る舞いは修正後に close の中の closed の判定を外して別に確かめる（下） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > 変化の無い pause・resume（既にその状態）は rev を進めず、知らせも保存もしない（g01 点検）
AssertionError: expected 4 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 4

 ❯ src/persist/GraphStore.test.ts:258:54
    256|     store.onChange((g) => seen.push(g.rev));
    257|     const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    258|     expect((await store.pause(undefined, "c2")).rev).toBe(3);
       |                                                      ^
    259|     expect((await store.pause("l1", "c2")).rev).toBe(3);
    260|     await store.resume("l1", "c2");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > close は待ち行列の書き込みを待ち、その後の書き込みは断ってファイルを変えない（ロックを放した後に書かない。g01 点検）
TypeError: store.close is not a function
 ❯ src/persist/GraphStore.test.ts:275:17
    273|     const store = await loaded(dir);
    274|     const pending = store.update(0, build, "c1");
    275|     await store.close();
       |                 ^
    276|     await expect(pending).resolves.toMatchObject({ rev: 1 });
    277|     const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/persist/GraphStore.test.ts > GraphStore > close は待ち行列の書き込みを待ち、その後の書き込みは断ってファイルを変えない（ロックを放した後に書かない。g01 点検）
AssertionError: promise resolved "{ rev: 2, paused: false, …(2) }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "links": [
+     {
+       "count": 0,
+       "from": "local:p1",
+       "id": "l1",
+       "kind": "trigger",
+       "limit": 10,
+       "paused": null,
+       "to": "local:p2",
+       "trigger": {
+         "on": "done",
+         "output": {
+           "lines": 80,
+         },
+         "prompt": "次の結果を確認して、続きの作業をしてください。
+
+ {output}",
+         "whenBusy": "wait",
+       },
+     },
+   ],
+   "nodes": [
+     {
+       "key": "local:p1",
+       "x": 20,
+       "y": 20,
+     },
+     {
+       "key": "local:p2",
+       "x": 240,
+       "y": 0,
+     },
+     {
+       "key": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee:p1",
+       "x": 480,
+       "y": 0,
+     },
+   ],
+   "paused": false,
+   "rev": 2,
  }

 ❯ src/persist/GraphStore.test.ts:278:85
    276|     await expect(pending).resolves.toMatchObject({ rev: 1 });
    277|     const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    278|     await expect(store.update(1, [{ op: "move_node", key: A, x: 20, y:…
       |                                                                                     ^
    279|     await expect(store.pause(undefined, "c1")).rejects.toBeInstanceOf(…
    280|     await expect(store.markLocalStale()).rejects.toBeInstanceOf(GraphS…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/persist/GraphStore.test.ts > GraphStore > 変化の無い pause・resume（既にその状態）は rev を進めず、知らせも保存もしない（g01 点検）
AssertionError: expected 4 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 4

 ❯ src/persist/GraphStore.test.ts:258:54
    256|     store.onChange((g) => seen.push(g.rev));
    257|     const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    258|     expect((await store.pause(undefined, "c2")).rev).toBe(3);
       |                                                      ^
    259|     expect((await store.pause("l1", "c2")).rev).toBe(3);
    260|     await store.resume("l1", "c2");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/persist/GraphStore.test.ts > GraphStore > 変化の無い pause・resume（既にその状態）は rev を進めず、知らせも保存もしない（g01 点検）
AssertionError: expected 4 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 4

 ❯ src/persist/GraphStore.test.ts:259:49
    257|     const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    258|     expect((await store.pause(undefined, "c2")).rev).toBe(3);
    259|     expect((await store.pause("l1", "c2")).rev).toBe(3);
       |                                                 ^
    260|     await store.resume("l1", "c2");
    261|     expect(store.get().rev).toBe(4);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/persist/GraphStore.test.ts > GraphStore > 変化の無い pause・resume（既にその状態）は rev を進めず、知らせも保存もしない（g01 点検）
AssertionError: expected 5 to be 4 // Object.is equality

- Expected
+ Received

- 4
+ 5

 ❯ src/persist/GraphStore.test.ts:262:50
    260|     await store.resume("l1", "c2");
    261|     expect(store.get().rev).toBe(4);
    262|     expect((await store.resume("l1", "c2")).rev).toBe(4); // 既に動いていて回数…
       |                                                  ^
    263|     await store.resume(undefined, "c2");
    264|     expect((await store.resume(undefined, "c2")).rev).toBe(5);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/persist/GraphStore.test.ts > GraphStore > 変化の無い pause・resume（既にその状態）は rev を進めず、知らせも保存もしない（g01 点検）
AssertionError: expected 6 to be 5 // Object.is equality

- Expected
+ Received

- 5
+ 6

 ❯ src/persist/GraphStore.test.ts:264:55
    262|     expect((await store.resume("l1", "c2")).rev).toBe(4); // 既に動いていて回数…
    263|     await store.resume(undefined, "c2");
    264|     expect((await store.resume(undefined, "c2")).rev).toBe(5);
       |                                                       ^
    265|     expect(seen).toEqual([4, 5]);
    266|     expect(before).not.toBe(await readFile(join(dir, GRAPH_FILE_NAME),…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

=== 変異（修正の箇所だけを戻す）: close の後の書き込みを断る判定を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: 全体の pause の変化なしの判定を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: 線の pause の変化なしの判定を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: 線の resume の変化なしの判定を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: 全体の resume の変化なしの判定を外す → exit 1 ===

=== g01 web NotificationController: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/notify/NotificationController.test.ts > NotificationController — 他の仕組みとの噛み合わせ > グラフ画面を開いている間にクリックされたら、焦点は『閉じたときに戻す先』だけ差し替える
AssertionError: 焦点は直接動かさない（グラフ画面からフォーカスを奪わない）: expected 'p1' to be 'p-other' // Object.is equality

Expected: "p-other"
Received: "p1"

 ❯ src/notify/NotificationController.test.ts:1047:65
    1045|
    1046|     expect(view.tabId, "表示する tab は移る").toBe("t1");
    1047|     expect(view.focusedPaneId, "焦点は直接動かさない（グラフ画面からフォーカスを奪わない）").toBe("…
       |                                                                 ^
    1048|     expect(view.graphOpen).toBe(true);
    1049|     view.closeGraph();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

=== 変異（修正の箇所だけを戻す）: グラフ画面の戻り先の差し替えを外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: modalOpen の判定を openDialog に戻す → exit 1 ===

=== g01 web GraphView: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/graph/GraphView.test.ts > GraphView（枠） > ネイティブの <dialog> を showModal で開く（背面を inert にして、Tab で背面の端末へ出られない。g01 点検）
AssertionError: expected 'DIV' to be 'DIALOG' // Object.is equality

Expected: "DIALOG"
Received: "DIV"

 ❯ src/components/graph/GraphView.test.ts:35:34
     33|     await nextTick();
     34|     const root = wrapper.find(".graph-view");
     35|     expect(root.element.tagName).toBe("DIALOG");
       |                                  ^
     36|     expect(showModal).toHaveBeenCalledTimes(1);
     37|     expect((root.element as HTMLDialogElement).open).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)

=== 変異（修正の箇所だけを戻す）: showModal を show に戻す（背面を inert にしない） → exit 1 ===

=== 変異（修正の箇所だけを戻す）: cancel の処理を外す → exit 1 ===

=== レビュー R1-1 web App: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/App.test.ts > App — グラフ画面を開いている間のトースト・再接続の表示 > トーストと再接続の表示はグラフ画面の dialog の中に出て、inert ではない。閉じたら元の場所へ戻る
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/App.test.ts:385:36
    383|     const toast = document.querySelector(".toast-list")!;
    384|     const overlay = document.querySelector(".reconnect-overlay")!;
    385|     expect(dialog.contains(toast)).toBe(true);
       |                                    ^
    386|     expect(dialog.contains(overlay)).toBe(true);
    387|     expect(toast.textContent).toContain("完了しました");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/web| src/App.test.ts > App — グラフ画面を開いている間のトースト・再接続の表示 > グラフ画面を開いたままログインし直して本体が作り直されても、dialog を開き直す（開いた状態とキーの dialog モードが食い違わない）
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/App.test.ts:407:85
    405|     await flushTicks(wrapper);
    406|     expect(view.graphOpen).toBe(true);
    407|     expect((document.querySelector("dialog.graph-view") as HTMLDialogE…
       |                                                                                     ^
    408|     wrapper.unmount();
    409|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)

=== 変異（修正の箇所だけを戻す）: Teleport を常に無効にする（dialog の外に置いたまま） → exit 1 ===

=== 変異（修正の箇所だけを戻す）: Teleport を常に有効にする（閉じても dialog の中） → exit 1 ===

=== 変異（修正の箇所だけを戻す）: watch の immediate を外す → exit 1 ===

=== レビュー R1-2・3 線の id: 修正前のコードで回帰テストが落ちる（生の出力。定数 GRAPH_LINK_ID_MAX が未定義のため undefined・NaN で落ちるものを含む。振る舞いは下の変異で別に確かめる） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/graph/ops.test.ts > applyGraphOps > 次の番号が安全な整数の範囲を超えるなら add_link を断る（01 のレビュー ラウンド 1）
AssertionError: expected 'l1' to be 'lundefined' // Object.is equality

Expected: "lundefined"
Received: "l1"

 ❯ src/graph/ops.test.ts:173:96
    171|       GRAPH_LINK_ID_MAX,
    172|     );
    173|     expect(ok(s1, [{ op: "add_link", kind: "supervise", from: A, to: B…
       |                                                                                                ^
    174|     const s2 = { ...s1, nextLinkId: GRAPH_LINK_ID_MAX + 1 };
    175|     expect(applyGraphOps(s2, [{ op: "add_link", kind: "supervise", fro…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/client-core| src/graph/validate.test.ts > 線の id（01 のレビュー ラウンド 1） > 同じ id の線が 2 本は duplicate_link_id（remove_link で両方消えない）
AssertionError: expected [] to deeply equal [ ObjectContaining{…} ]

- Expected
+ Received

- [
-   ObjectContaining {
-     "code": "duplicate_link_id",
-     "linkId": "l1",
-   },
- ]
+ []

 ❯ src/graph/validate.test.ts:223:20
    221|   it("同じ id の線が 2 本は duplicate_link_id（remove_link で両方消えない）", () => {
    222|     const issues = validateGraph(graph([link({ id: "l1" }), link({ id:…
    223|     expect(issues).toEqual([expect.objectContaining({ code: "duplicate…
       |                    ^
    224|   });
    225|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/client-core| src/graph/validate.test.ts > 線の id（01 のレビュー ラウンド 1） > id の番号が安全な整数の範囲を超える（次の番号が丸められて重なる）なら link_id_too_large
AssertionError: expected NaN to be 9007199254740991 // Object.is equality

- Expected
+ Received

- 9007199254740991
+ NaN

 ❯ src/graph/validate.test.ts:227:35
    225|
    226|   it("id の番号が安全な整数の範囲を超える（次の番号が丸められて重なる）なら link_id_too_large", () => {
    227|     expect(GRAPH_LINK_ID_MAX + 1).toBe(Number.MAX_SAFE_INTEGER);
       |                                   ^
    228|     expect(validateGraph(graph([link({ id: `l${GRAPH_LINK_ID_MAX}` })]…
    229|     expect(codes(validateGraph(graph([link({ id: `l${Number.MAX_SAFE_I…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > 壊れたファイル（線の id が重なる（01 のレビュー ラウンド 1））は退避して空から始める
 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > 壊れたファイル（線の id の番号が安全な整数を超える（01 のレビュー ラウンド 1））は退避して空から始める
AssertionError: expected 'string' to be 'object' // Object.is equality

Expected: "object"
Received: "string"

 ❯ src/persist/GraphStore.test.ts:232:41
    230|     await writeFile(join(dir, GRAPH_FILE_NAME), content);
    231|     const store = new GraphStore(dir);
    232|     expect(typeof (await store.load())).toBe("object");
       |                                         ^
    233|     expect(store.get()).toEqual({ rev: 0, paused: false, nodes: [], li…
    234|     expect((await readdir(join(dir, "graph-backups"))).length).toBe(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯


 Test Files  3 failed | 3 passed (6)

=== 変異（修正の箇所だけを戻す）: 線の id の重複の判定を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: id の番号の上限の判定を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: add_link の番号の使い切りの判定を外す → exit 0 ===
（落ちなかった）

 RUN  v5.0.1 /workspaces/sodashitsu/packages/client-core


 Test Files  5 passed (5)
      Tests  57 passed (57)
   Start at  20:58:01
   Duration  1.24s (transform 59%, import 34%, tests 5%, worker 2%)

（↑ ops の判定は、当てた後の validateGraph が同じ id を link_id_too_large で断るので重複していた——落ちないのはそのため。判定は ops から外し、validateGraph の 1 か所にした。ops の試験は validateGraph 経由で断られることを確かめている）

=== レビュー R1-4 stale（nextId 以上）: 修正前のコードで回帰テストが落ちる（生の出力） ===
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/composeServer.graph.integration.test.ts > composeServer: graph.*（20260927-agent-graph） > 読めた session.json より新しい pane（nextId 以上）を指す手元のノードは stale にする（session.json の保存の遅れ。01 のレビュー ラウンド 1）
AssertionError: expected [ …(3) ] to deeply equal [ …(3) ]

- Expected
+ Received

@@ -4,11 +4,10 @@
      "x": 0,
      "y": 0,
    },
    {
      "key": "local:p50",
-     "stale": true,
      "x": 240,
      "y": 0,
    },
    {
      "key": "dddddddddddddddddddddddddddddddd:p1",

 ❯ src/composeServer.graph.integration.test.ts:293:87
    291|     const second = await start(stateDir);
    292|     const b = await connect(second, await tokenLogin(second, first.tok…
    293|     expect(((await b.request("graph.get", {})).result as { nodes: unkn…
       |                                                                                       ^
    294|       { key: A, x: 0, y: 0 },
    295|       { key: "local:p50", x: 240, y: 0, stale: true },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/persist/GraphStore.test.ts > GraphStore > markLocalStale に条件を渡すと、その pane の手元のノードだけを無効にする（01 のレビュー ラウンド 1）
AssertionError: expected 2 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 2

 ❯ src/persist/GraphStore.test.ts:336:69
    334|     const store = await loaded(dir);
    335|     await store.update(0, build, "c1"); // local:p1・local:p2・リモートの p1
    336|     expect(await store.markLocalStale((paneId) => paneId === "p2")).to…
       |                                                                     ^
    337|     expect(store.get().nodes.map((n) => [n.key, n.stale === true])).to…
    338|       [A, false],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)

=== 変異（修正の箇所だけを戻す）: 読み込みの nextId 以上の無効化を外す → exit 1 ===

=== 変異（修正の箇所だけを戻す）: 境界を > にする（nextId ちょうどを見逃す）の代わりに全部を無効にする → exit 1 ===

=== 変異（修正の箇所だけを戻す）: markLocalStale の条件を無視する → exit 1 ===

=== 変異（修正の箇所だけを戻す）: 境界の >= を > にする（nextId ちょうどの pane を見逃す） → exit 1 ===
```
