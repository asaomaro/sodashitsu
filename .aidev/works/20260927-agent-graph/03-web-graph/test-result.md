# テスト結果: 03-web-graph（グラフ画面）

## 実行したもの
- 84ddb35 の上で `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 346 files / 6198 passed・exit 0（load average 6.0）
- レビューのラウンド 1 の修正（3dccf4c）の後: `pnpm build`・`typecheck`・`test`（346 files / 6214 passed）いずれも exit 0（実装者の検証）
- E2E（ブラウザ）・負荷試験は依頼が無いので回していない。部品の試験は happy-dom＋@vue/test-utils。

## 受け入れ基準ごとの判定（03 の担う範囲）
- AC1: pass（prefix+a・サイドバーのメニュー・モバイルの上部バーで開く。ノードに呼び名・エージェント・状態の印）。別のマシンの呼び名は 04。
- AC2: pass（ドラッグ・矢印で配置 → graph.update。ドラッグ中はサーバの値で上書きしない。ノードから pane へ）
- AC3: pass（ハンドルのドラッグ・接続モード c → LinkPanel → 保存・取り消しの確認・削除の確認）
- AC10: pass（graph.fired で線が光る・チップの回数・HistoryPanel・再接続で履歴を取り直す）
- AC11: pass（⏸ 上限の印とトースト。自分で上限を下げた保存では知らせない）
- AC12: pass（全体・線ごとの一時停止/再開）
- AC13: pass（無効なノードの表示・選び直し〔rekey_node〕・外すときの確認で消える線の本数）
- AC16: pass（graph.changed〔同じ rev も当てる〕・rev_conflict の作り直しと送り直し）
- AC20: pass（モバイルは閲覧と一時停止・再開だけ。編集の経路は止める）
- AC-I1〜I5: pass（Esc の段階の通し・同じキー〔割り当ての変更・直接キー〕で閉じる・保存/取り消し/確認・Tab と矢印・接続モード・フォーカスの戻り先・dialog モード）
- 実機のブラウザでの確認（ホイール・ピンチ・タッチでの線の選び方・フォーカスの枠・reduced-motion・シートの見た目）は未検証。

## 失敗の証跡

### 負の確認（点検の指摘の修正。修正前の再現〔P1〜P7〕・回帰テストが修正前に落ちる生の出力・変異の網羅）

```
# g03 負の確認（03-web-graph タスク点検の指摘の修正）

===== 修正前の再現（scratchpad/check-g03-b/probe.test.ts P1〜P7。2026-09-28 23:46:34） =====
P1 heading: 線: impl → reviewer（監督） confirm: false limit: 10
P2 prompt: "次の結果を確認して、続きの作業をしてください。\n\n{output}" confirm: false
P3 graphOpen: false
P4 confirm: true
P4 calls: [{"method":"graph.update","params":{"baseRev":1,"ops":[{"op":"remove_link","id":"l1"}]}}]
P5 sheet: true transform: translate(40px, 40px) scale(1)
P6 checklist: true panel: true
P7 [ 'local:p1', 'local:p2' ] [ 'local:p2', 'local:p1' ] active: BODY

===== F1 修正後（送り分けの規則・not_connected） (2026-09-28 23:47:41) =====
$ npx vitest run --root packages/web src/store/graphRouting.test.ts src/store/graph.test.ts
 Test Files  2 passed (2)
      Tests  18 passed (18)
exit=0

===== F1 変異: acceptsMainGraphEvent が常に真 (2026-09-28 23:47:56) =====
$ npx vitest run --root packages/web src/store/graphRouting.test.ts
     × 画面の接続の graph.* はローカルを向いているときだけ当て、hello のたびの取り直しもローカルのときだけ 120ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graphRouting.test.ts > graphRouting > 画面の接続の graph.* はローカルを向いているときだけ当て、hello のたびの取り直しもローカルのときだけ
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
exit=1

===== F1 変異: 常に画面の接続へ送る (2026-09-28 23:48:09) =====
$ npx vitest run --root packages/web src/store/graphRouting.test.ts
     × ローカルを向いていれば画面の接続、別のマシンならローカルの軽い接続へ送る 67ms
     × 軽い接続が無い・接続の側の失敗（code 無し）は not_connected。サーバのエラーの code はそのまま 11ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graphRouting.test.ts > graphRouting > ローカルを向いていれば画面の接続、別のマシンならローカルの軽い接続へ送る
AssertionError: expected 'main' to be 'summary' // Object.is equality
Expected: "summary"
Received: "main"
 FAIL  src/store/graphRouting.test.ts > graphRouting > 軽い接続が無い・接続の側の失敗（code 無し）は not_connected。サーバのエラーの code はそのまま
AssertionError: expected null to be 'not_connected' // Object.is equality
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
exit=1

===== F1 変異: code の無い失敗を not_connected にしない (2026-09-28 23:48:21) =====
$ npx vitest run --root packages/web src/store/graphRouting.test.ts
     × 軽い接続が無い・接続の側の失敗（code 無し）は not_connected。サーバのエラーの code はそのまま 26ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graphRouting.test.ts > graphRouting > 軽い接続が無い・接続の側の失敗（code 無し）は not_connected。サーバのエラーの code はそのまま
AssertionError: expected null to be 'not_connected' // Object.is equality
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
exit=1

===== F1 変異: not_connected の文言を外す (2026-09-28 23:48:34) =====
$ npx vitest run --root packages/web src/store/graph.test.ts
     × 接続が無い（not_connected）は「繋がっていません」の文言にする（サーバのエラーの文言にしない） 102ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graph.test.ts > store/graph（g03 点検） > 接続が無い（not_connected）は「繋がっていません」の文言にする（サーバのエラーの文言にしない）
AssertionError: expected 'サーバでエラーが起きました（not_connected）。' to be 'サーバに繋がっていません（繋ぎ直しを待っています）。' // Object.is equality
Expected: "サーバに繋がっていません（繋ぎ直しを待っています）。"
Received: "サーバでエラーが起きました（not_connected）。"
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
exit=1

===== F2 修正前（履歴の取り直し・自分の上限の変更・rev_conflict の後の取り直しの失敗） (2026-09-28 23:51:07) =====
$ npx vitest run --root packages/web src/store/graph.test.ts
     × 取り直し（再接続・マシンの切り替え）のとき、読んである履歴も取り直す（回数と履歴を食い違わせない） 10ms
     × 自分で上限を今の回数以下に下げた保存（D5-13）では「上限に達した」を知らせない。ほかの変化では知らせる 4ms
     × rev_conflict の後の取り直しに失敗したら、古い rev で送り直さずに失敗を返す 4ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graph.test.ts > store/graph（g03 点検 T1） > 取り直し（再接続・マシンの切り替え）のとき、読んである履歴も取り直す（回数と履歴を食い違わせない）
AssertionError: expected [ { method: 'graph.history', …(1) } ] to have a length of 2 but got 1
- Expected
+ Received
 FAIL  src/store/graph.test.ts > store/graph（g03 点検 T1） > 自分で上限を今の回数以下に下げた保存（D5-13）では「上限に達した」を知らせない。ほかの変化では知らせる
AssertionError: expected [ { id: 4, …(1) } ] to have a length of +0 but got 1
- Expected
+ Received
 FAIL  src/store/graph.test.ts > store/graph（g03 点検 T1） > rev_conflict の後の取り直しに失敗したら、古い rev で送り直さずに失敗を返す
AssertionError: expected { ok: false, reason: 'error', …(1) } to match object { ok: false, reason: 'error', …(1) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  3 failed | 15 passed (18)
exit=1

===== F2 修正後 (2026-09-28 23:51:33) =====
$ npx vitest run --root packages/web src/store/graph.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
exit=0

===== F2 変異: 取り直しで履歴を読み直さない (2026-09-28 23:51:43) =====
$ npx vitest run --root packages/web src/store/graph.test.ts
     × 取り直し（再接続・マシンの切り替え）のとき、読んである履歴も取り直す（回数と履歴を食い違わせない） 19ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graph.test.ts > store/graph（g03 点検 T1） > 取り直し（再接続・マシンの切り替え）のとき、読んである履歴も取り直す（回数と履歴を食い違わせない）
AssertionError: expected [ { method: 'graph.history', …(1) } ] to have a length of 2 but got 1
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
exit=1

===== F2 変異: 自分の上限の変更でも知らせる (2026-09-28 23:51:46) =====
$ npx vitest run --root packages/web src/store/graph.test.ts
     × 自分で上限を今の回数以下に下げた保存（D5-13）では「上限に達した」を知らせない。ほかの変化では知らせる 13ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graph.test.ts > store/graph（g03 点検 T1） > 自分で上限を今の回数以下に下げた保存（D5-13）では「上限に達した」を知らせない。ほかの変化では知らせる
AssertionError: expected [ { id: 4, …(1) } ] to have a length of +0 but got 1
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
exit=1

===== F2 変異: 取り直しの失敗でも送り直す (2026-09-28 23:51:48) =====
$ npx vitest run --root packages/web src/store/graph.test.ts
     × rev_conflict の後の取り直しに失敗したら、古い rev で送り直さずに失敗を返す 12ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/store/graph.test.ts > store/graph（g03 点検 T1） > rev_conflict の後の取り直しに失敗したら、古い rev で送り直さずに失敗を返す
AssertionError: expected { ok: false, reason: 'error', …(1) } to match object { ok: false, reason: 'error', …(1) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
exit=1

===== F3 修正前（ノードの DOM の順・Tab の順・越えたときのフォーカス） (2026-09-28 23:52:35) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t DOM|越えて
     × ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5） 80ms
     × 矢印で他のノードを越えても DOM が並べ替わらず、フォーカスがノードに残る（Esc で画面ごと閉じない。g03 点検 T5 must） 23ms
     × ドラッグで他のノードを越えてもフォーカスがノードに残る 23ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5）
AssertionError: expected [ 'local:p3', 'local:p1', 'local:p2' ] to deeply equal [ 'local:p2', 'local:p1', 'local:p3' ]
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > 矢印で他のノードを越えても DOM が並べ替わらず、フォーカスがノードに残る（Esc で画面ごと閉じない。g03 点検 T5 must）
AssertionError: expected [ 'local:p2', 'local:p1' ] to deeply equal [ 'local:p1', 'local:p2' ]
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > ドラッグで他のノードを越えてもフォーカスがノードに残る
AssertionError: expected null to be 'local:p2' // Object.is equality
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  3 failed | 35 skipped (38)
exit=1

===== F3 修正後 (2026-09-28 23:52:56) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts
 Test Files  1 passed (1)
      Tests  38 passed (38)
exit=0

===== F3 変異: DOM を読み順に並べ替える (2026-09-28 23:53:14) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t DOM|越えて
     × ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5） 124ms
     × 矢印で他のノードを越えても DOM が並べ替わらず、フォーカスがノードに残る（Esc で画面ごと閉じない。g03 点検 T5 must） 28ms
     × ドラッグで他のノードを越えてもフォーカスがノードに残る 24ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5）
AssertionError: expected [ 'local:p3', 'local:p1', 'local:p2' ] to deeply equal [ 'local:p2', 'local:p1', 'local:p3' ]
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > 矢印で他のノードを越えても DOM が並べ替わらず、フォーカスがノードに残る（Esc で画面ごと閉じない。g03 点検 T5 must）
AssertionError: expected [ 'local:p2', 'local:p1' ] to deeply equal [ 'local:p1', 'local:p2' ]
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > ドラッグで他のノードを越えてもフォーカスがノードに残る
AssertionError: expected null to be 'local:p2' // Object.is equality
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  3 failed | 35 skipped (38)
exit=1

===== F3 変異: ノードの Tab を自前で動かさない (2026-09-28 23:53:19) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t DOM|越えて
     × ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5） 128ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5）
AssertionError: expected [ 'local:p3', 'local:p3', 'local:p3' ] to deeply equal [ 'local:p1', 'local:p2', 'l1' ]
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 35 skipped (38)
exit=1

===== F3 変異: すべてのノードを tabindex=0 (2026-09-28 23:53:22) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t DOM|越えて
     × ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5） 119ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（キーボード・フォーカス・モバイル。03 T5） > ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5）
AssertionError: expected [ 'local:p2', 'local:p1', 'local:p3' ] to deeply equal [ 'local:p3' ]
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 35 skipped (38)
exit=1

===== F4 修正前（書きかけのパネル・線の押し方・モバイルの編集の経路。P1〜P6） (2026-09-28 23:55:52) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1） 118ms
     × 変更があるパネルのまま線（当たり）を押しても同じ確認を通る 46ms
     × 変更があるパネルのままノードの c → Enter でも確認を通る（P2） 56ms
     × 変更があるパネルのままノードの Enter は確認を通り、捨てれば pane へ移る（P3） 36ms
     × チェックリストを開いたままチップを押すとチェックリストを閉じるだけ（両方開かない。P6） 44ms
     × チップ・線から動かしたらパンで、パネルは開かない。動かずに離せば選ぶ 47ms
     × モバイル: 線に触れて動かせばパン（シートは出さない）、動かずに離せばシート（P5） 33ms
     × モバイル: 編集の経路（チップ・ノードの Delete、c、矢印）はすべて止める（P4） 39ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのまま線（当たり）を押しても同じ確認を通る
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのままノードの c → Enter でも確認を通る（P2）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのままノードの Enter は確認を通り、捨てれば pane へ移る（P3）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > チェックリストを開いたままチップを押すとチェックリストを閉じるだけ（両方開かない。P6）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > チップ・線から動かしたらパンで、パネルは開かない。動かずに離せば選ぶ
AssertionError: expected 'translate(40px, 40px) scale(1)' not to be 'translate(40px, 40px) scale(1)' // Object.is equality
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > モバイル: 線に触れて動かせばパン（シートは出さない）、動かずに離せばシート（P5）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > モバイル: 編集の経路（チップ・ノードの Delete、c、矢印）はすべて止める（P4）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  8 failed | 38 skipped (46)
exit=1

===== F4 修正後 (2026-09-28 23:57:03) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  63 passed (63)
exit=0

===== F4 変異: guardPanel が確認を通さずに進む (2026-09-28 23:57:25) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1） 227ms
     × 変更があるパネルのまま線（当たり）を押しても同じ確認を通る 69ms
     × 変更があるパネルのままノードの c → Enter でも確認を通る（P2） 70ms
     × 変更があるパネルのままノードの Enter は確認を通り、捨てれば pane へ移る（P3） 53ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1）
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのまま線（当たり）を押しても同じ確認を通る
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのままノードの c → Enter でも確認を通る（P2）
RangeError: Maximum call stack size exceeded
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのままノードの Enter は確認を通り、捨てれば pane へ移る（P3）
RangeError: Maximum call stack size exceeded
 Test Files  1 failed (1)
      Tests  4 failed | 4 passed | 38 skipped (46)
exit=1

===== F4 変異: チップでチェックリストを閉じない (2026-09-28 23:57:30) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
 Test Files  1 passed (1)
      Tests  8 passed | 38 skipped (46)
exit=0

===== F4 変異: モバイルでチップの Delete を止めない (2026-09-28 23:57:35) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × モバイル: 編集の経路（チップ・ノードの Delete、c、矢印）はすべて止める（P4） 58ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > モバイル: 編集の経路（チップ・ノードの Delete、c、矢印）はすべて止める（P4）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed | 38 skipped (46)
exit=1

===== F4 変異: 線に触れた瞬間に選ぶ (2026-09-28 23:57:40) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × モバイル: 線に触れて動かせばパン（シートは出さない）、動かずに離せばシート（P5） 62ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > モバイル: 線に触れて動かせばパン（シートは出さない）、動かずに離せばシート（P5）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed | 38 skipped (46)
exit=1

===== F4 変異: パンの後のチップの click を捨てない (2026-09-28 23:57:47) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × チップ・線から動かしたらパンで、パネルは開かない。動かずに離せば選ぶ 64ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > チップ・線から動かしたらパンで、パネルは開かない。動かずに離せば選ぶ
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed | 38 skipped (46)
exit=1

（上の「F4 変異: チップでチェックリストを閉じない」は置き換えの文字列が合わず変異が当たっていなかった——当たっていないので全件通過。下で当て直した）

===== F4 変異（当て直し）: チップでチェックリストを閉じない (2026-09-28 23:58:05) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × チェックリストを開いたままチップを押すとチェックリストを閉じるだけ（両方開かない。P6） 72ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > チェックリストを開いたままチップを押すとチェックリストを閉じるだけ（両方開かない。P6）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed | 38 skipped (46)
exit=1

===== F4 変異: 編集に戻っても予定（別の線を開く）を取りやめない (2026-09-28 23:58:18) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1） 163ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed | 38 skipped (46)
exit=1

===== F5 修正前（押しただけの reveal・チップの reveal・preventScroll） (2026-09-28 23:59:17) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 画面へ入れる
     × 押しただけ（動かさない）では画面へ入れる移動をしない（表示が跳ばない） 96ms
     × Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す 81ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（フォーカスと画面へ入れる。g03 点検） > 押しただけ（動かさない）では画面へ入れる移動をしない（表示が跳ばない）
AssertionError: expected 'translate(-840px, 40px) scale(1)' to be 'translate(40px, 40px) scale(1)' // Object.is equality
Expected: "translate(40px, 40px) scale(1)"
Received: "translate(-840px, 40px) scale(1)"
 FAIL  src/components/graph/GraphView.test.ts > GraphView（フォーカスと画面へ入れる。g03 点検） > Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す
AssertionError: expected "focus" to be called with arguments: [ { preventScroll: true } ]
Received:
 Test Files  1 failed (1)
      Tests  2 failed | 46 skipped (48)
exit=1

===== F5 修正後 (2026-09-28 23:59:39) =====
$ npx vitest run --root packages/web src/components/graph/
     × Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す 50ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（フォーカスと画面へ入れる。g03 点検） > Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す
AssertionError: expected 'translate(-720px, 40px) scale(1)' not to be 'translate(-720px, 40px) scale(1)' // Object.is equality
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 64 passed (65)
exit=1

（上の「F5 修正後」の 1 件の失敗は、試験の手順の誤り〔チップが既に画面に入った後で確かめていた〕。試験をホイールで外へ出してから確かめる形に直して取り直した）

===== F5 修正後（試験を直して取り直し） (2026-09-29 00:00:16) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  65 passed (65)
exit=0

===== F5 変異: 押しただけでもノードを画面へ入れる (2026-09-29 00:00:21) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 画面へ入れる
     × 押しただけ（動かさない）では画面へ入れる移動をしない（表示が跳ばない） 134ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（フォーカスと画面へ入れる。g03 点検） > 押しただけ（動かさない）では画面へ入れる移動をしない（表示が跳ばない）
AssertionError: expected 'translate(-840px, 40px) scale(1)' to be 'translate(40px, 40px) scale(1)' // Object.is equality
Expected: "translate(40px, 40px) scale(1)"
Received: "translate(-840px, 40px) scale(1)"
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 46 skipped (48)
exit=1

===== F5 変異: チップのフォーカスで画面へ入れない (2026-09-29 00:00:24) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 画面へ入れる
     × Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す 45ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（フォーカスと画面へ入れる。g03 点検） > Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す
AssertionError: expected 'translate(-720px, -4960px) scale(1)' not to be 'translate(-720px, -4960px) scale(1)' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 46 skipped (48)
exit=1

===== F5 変異: チップへ preventScroll なしで移す (2026-09-29 00:00:28) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 画面へ入れる
     × Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す 47ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（フォーカスと画面へ入れる。g03 点検） > Tab でチップへ移ったら、画面の外なら入れる。フォーカスは preventScroll で移す
AssertionError: expected "focus" to be called with arguments: [ { preventScroll: true } ]
Received:
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 46 skipped (48)
exit=1

===== F6 修正前（重なったノードの矢印の向き） (2026-09-29 00:01:03) =====
$ npx vitest run --root packages/client-core src/graph/geometry.test.ts
     × ノードが重なって縁の点が逆順になっても、印は元→先の向き（中心から中心）を向く 6ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/graph/geometry.test.ts > 重なったノードの線の先の印（g03 点検 T2 nit） > ノードが重なって縁の点が逆順になっても、印は元→先の向き（中心から中心）を向く
AssertionError: expected undefined to deeply equal { x: 1, y: +0 }
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
exit=1

===== F6 修正後 (2026-09-29 00:01:40) =====
$ npx vitest run --root packages/client-core src/graph/geometry.test.ts
 Test Files  1 passed (1)
      Tests  21 passed (21)
exit=0

===== F6 変異: 印の向きに dir を使わない (2026-09-29 00:01:42) =====
$ npx vitest run --root packages/client-core src/graph/geometry.test.ts
     × ノードが重なって縁の点が逆順になっても、印は元→先の向き（中心から中心）を向く 16ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/graph/geometry.test.ts > 重なったノードの線の先の印（g03 点検 T2 nit） > ノードが重なって縁の点が逆順になっても、印は元→先の向き（中心から中心）を向く
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
exit=1

===== F7 修正前（範囲外の値・delegate/notify の見分け・シートの再開の文言） (2026-09-29 00:02:43) =====
$ npx vitest run --root packages/web src/components/graph/LinkPanel.test.ts src/components/graph/GraphView.test.ts -t 範囲外|承認の代理は|シートの再開
     × 範囲外・空の上限や行数は黙って丸めず、検証のエラーとして見せて送らない 110ms
     × 承認の代理は「返答まで任せる」と「知らせるだけ」をチップの文字と線の見た目で分ける 191ms
     × モバイルのシートの再開は回数を 0 に戻すと示す 63ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（承認の代理の見分け・シートの文言。g03 点検） > 承認の代理は「返答まで任せる」と「知らせるだけ」をチップの文字と線の見た目で分ける
AssertionError: expected '承認 0/10' to be '承認・返答 0/10' // Object.is equality
Expected: "承認・返答 0/10"
Received: "承認 0/10"
 FAIL  src/components/graph/GraphView.test.ts > GraphView（承認の代理の見分け・シートの文言。g03 点検） > モバイルのシートの再開は回数を 0 に戻すと示す
AssertionError: expected '再開' to be '再開（回数を 0 に戻す）' // Object.is equality
Expected: "再開（回数を 0 に戻す）"
Received: "再開"
 FAIL  src/components/graph/LinkPanel.test.ts > LinkPanel（範囲外の値。g03 点検 T3 nit） > 範囲外・空の上限や行数は黙って丸めず、検証のエラーとして見せて送らない
AssertionError: expected [ [ { kind: 'trigger', …(4) } ] ] to be undefined
- Expected:
+ Received:
 Test Files  2 failed (2)
      Tests  3 failed | 55 skipped (58)
exit=1

===== F7 修正後 (2026-09-29 00:04:59) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  68 passed (68)
exit=0

===== F7 変異: 範囲外の検証を外す (2026-09-29 00:05:43) =====
$ npx vitest run --root packages/web packages/web/src/components/graph/LinkPanel.test.ts -t 範囲外
     × 範囲外・空の上限や行数は黙って丸めず、検証のエラーとして見せて送らない 397ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/LinkPanel.test.ts > LinkPanel（範囲外の値。g03 点検 T3 nit） > 範囲外・空の上限や行数は黙って丸めず、検証のエラーとして見せて送らない
AssertionError: expected [ [ { kind: 'trigger', …(4) } ] ] to be undefined
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
exit=1

===== F7 変異: 承認のラベルを 1 つに戻す (2026-09-29 00:06:03) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 承認の代理は
     × 承認の代理は「返答まで任せる」と「知らせるだけ」をチップの文字と線の見た目で分ける 703ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（承認の代理の見分け・シートの文言。g03 点検） > 承認の代理は「返答まで任せる」と「知らせるだけ」をチップの文字と線の見た目で分ける
AssertionError: expected '承認 0/10' to be '承認・返答 0/10' // Object.is equality
Expected: "承認・返答 0/10"
Received: "承認 0/10"
 Test Files  1 failed (1)
      Tests  1 failed | 49 skipped (50)
exit=1

===== F7 変異: delegate の線の見た目を外す (2026-09-29 00:06:24) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 承認の代理は
     × 承認の代理は「返答まで任せる」と「知らせるだけ」をチップの文字と線の見た目で分ける 133ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（承認の代理の見分け・シートの文言。g03 点検） > 承認の代理は「返答まで任せる」と「知らせるだけ」をチップの文字と線の見た目で分ける
AssertionError: expected [ 'graph-edge', 'graph-edge-approval' ] to include 'graph-edge-delegate'
 Test Files  1 failed (1)
      Tests  1 failed | 49 skipped (50)
exit=1

===== F7 変異: シートの再開の文言を戻す (2026-09-29 00:06:38) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t シートの再開
     × モバイルのシートの再開は回数を 0 に戻すと示す 127ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（承認の代理の見分け・シートの文言。g03 点検） > モバイルのシートの再開は回数を 0 に戻すと示す
AssertionError: expected '再開' to be '再開（回数を 0 に戻す）' // Object.is equality
Expected: "再開（回数を 0 に戻す）"
Received: "再開"
 Test Files  1 failed (1)
      Tests  1 failed | 49 skipped (50)
exit=1

===== F8 修正前（履歴の戻り先・Esc の段階の通し・割り当ての変更） (2026-09-29 00:07:13) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t Esc の段階・割り当て
     × パネルから開いた履歴を Esc で閉じると、フォーカスはパネルの「履歴」へ戻る（ツールバーへ行かない） 217ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > パネルから開いた履歴を Esc で閉じると、フォーカスはパネルの「履歴」へ戻る（ツールバーへ行かない）
AssertionError: expected 'graph-tool graph-history' to contain 'link-panel-history'
Expected: "link-panel-history"
Received: "graph-tool graph-history"
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 50 skipped (53)
exit=1

===== F8 修正後 (2026-09-29 00:07:34) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts
 Test Files  1 passed (1)
      Tests  53 passed (53)
exit=0

===== F8 変異: 履歴を閉じたら常にツールバーへ (2026-09-29 00:07:42) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t Esc の段階・割り当て
     × パネルから開いた履歴を Esc で閉じると、フォーカスはパネルの「履歴」へ戻る（ツールバーへ行かない） 245ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > パネルから開いた履歴を Esc で閉じると、フォーカスはパネルの「履歴」へ戻る（ツールバーへ行かない）
AssertionError: expected 'graph-tool graph-history' to contain 'link-panel-history'
Expected: "link-panel-history"
Received: "graph-tool graph-history"
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 50 skipped (53)
exit=1

===== F8 変異: Esc の段階で履歴をパネルより先に閉じる (2026-09-29 00:07:49) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t Esc の段階・割り当て
     × Esc の段階を通しで: パネル → 履歴 → 選択 → 画面（1 回で 1 段） 81ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > Esc の段階を通しで: パネル → 履歴 → 選択 → 画面（1 回で 1 段）
AssertionError: expected [ true, false ] to deeply equal [ false, true ]
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 50 skipped (53)
exit=1

===== F8 変異: prefix の後のキーを割り当ての表でなく固定の a で見る (2026-09-29 00:07:55) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t Esc の段階・割り当て
     × open_graph の割り当てを変えれば新しいキーで閉じ（古いキーでは閉じない）、直接のキーの割り当てでも閉じる 47ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > open_graph の割り当てを変えれば新しいキーで閉じ（古いキーでは閉じない）、直接のキーの割り当てでも閉じる
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 50 skipped (53)
exit=1

===== F8 変異: 直接のキーの open_graph で閉じない (2026-09-29 00:08:00) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t Esc の段階・割り当て
     × open_graph の割り当てを変えれば新しいキーで閉じ（古いキーでは閉じない）、直接のキーの割り当てでも閉じる 68ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（Esc の段階・割り当て・履歴の戻り先。g03 点検） > open_graph の割り当てを変えれば新しいキーで閉じ（古いキーでは閉じない）、直接のキーの割り当てでも閉じる
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 50 skipped (53)
exit=1

===== F9 修正前（無効なノードの選び直し・チェックリストの無効の注記） (2026-09-29 00:09:35) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts src/components/graph/PaneChecklist.test.ts -t 選び直し|同じ番号
     × 無効なノードと同じ鍵の今の pane の行は「載っている」と区別し、無効の注記を出す 68ms
     × 無効（stale）なノードの「選び直す」から pane を選ぶと rekey_node を送り（線は付け替わる）、選び直したノードへフォーカス 105ms
     × 無効なノードの r でも選び直しを開き、Esc は何も変えずに閉じてノードへ戻る。有効なノードには出さない 67ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（無効なノードの選び直し。g03 点検 T4） > 無効（stale）なノードの「選び直す」から pane を選ぶと rekey_node を送り（線は付け替わる）、選び直したノードへフォーカス
Error: Cannot call text on an empty DOMWrapper.
 FAIL  src/components/graph/GraphView.test.ts > GraphView（無効なノードの選び直し。g03 点検 T4） > 無効なノードの r でも選び直しを開き、Esc は何も変えずに閉じてノードへ戻る。有効なノードには出さない
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（無効なノードと同じ番号の pane。g03 点検 T4） > 無効なノードと同じ鍵の今の pane の行は「載っている」と区別し、無効の注記を出す
AssertionError: expected 'impl' to contain '無効'
Expected: "無効"
Received: "impl"
 Test Files  2 failed (2)
      Tests  3 failed | 57 skipped (60)
exit=1

===== F9 修正後 (2026-09-29 00:10:38) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  74 passed (74)
exit=0

===== F9 変異: チェックリストで無効の注記を出さない (2026-09-29 00:10:56) =====
$ npx vitest run --root packages/web src/components/graph/PaneChecklist.test.ts -t 同じ番号
     × 無効なノードと同じ鍵の今の pane の行は「載っている」と区別し、無効の注記を出す 49ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（無効なノードと同じ番号の pane。g03 点検 T4） > 無効なノードと同じ鍵の今の pane の行は「載っている」と区別し、無効の注記を出す
AssertionError: expected 'impl' to contain '無効'
Expected: "無効"
Received: "impl"
 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
exit=1

===== F9 変異: 選び直しを外すに置き換える（線を保たない） (2026-09-29 00:10:59) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 選び直し
     × 無効（stale）なノードの「選び直す」から pane を選ぶと rekey_node を送り（線は付け替わる）、選び直したノードへフォーカス 175ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（無効なノードの選び直し。g03 点検 T4） > 無効（stale）なノードの「選び直す」から pane を選ぶと rekey_node を送り（線は付け替わる）、選び直したノードへフォーカス
AssertionError: expected { method: 'graph.update', …(1) } to deeply equal { method: 'graph.update', …(1) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 53 skipped (55)
exit=1

===== F9 変異: 選び直すの入口を出さない (2026-09-29 00:11:05) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t 選び直し
     × 無効（stale）なノードの「選び直す」から pane を選ぶと rekey_node を送り（線は付け替わる）、選び直したノードへフォーカス 131ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（無効なノードの選び直し。g03 点検 T4） > 無効（stale）なノードの「選び直す」から pane を選ぶと rekey_node を送り（線は付け替わる）、選び直したノードへフォーカス
Error: Cannot call text on an empty DOMWrapper.
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 53 skipped (55)
exit=1

===== 修正後の再現（probe.test.ts P1〜P7。2026-09-29 00:12:32） =====
P1 heading: 線: impl → reviewer（トリガ） confirm: true limit: 5
P2 prompt: "long prompt typed" confirm: true
P3 graphOpen: true
P4 confirm: false
P4 calls: []
P5 sheet: false transform: translate(140px, 140px) scale(1)
P6 checklist: false panel: false
P7 [ 'local:p1', 'local:p2' ] [ 'local:p1', 'local:p2' ] active: local:p2

===== 全体の検証（2026-09-29 00:16:09） =====
pnpm build: exit=0 / pnpm typecheck: exit=0 / pnpm test: exit=0（346 ファイル・6198 件 通過）

######## レビュー ラウンド 1 の修正（2026-09-29 00:28:39） ########

===== 修正前の再現（scratchpad/check-g03review/probe.test.ts A〜E） =====
A after Esc: panel exists= true 線: impl → reviewer（監督）
B confirm still= true panel= true active= graph-node graph-node-selected
C l2 panel= 線: impl → reviewer（監督） saveDisabled= 
C resolve defined function 1
C after l1 save resolves: panel exists= false
C fail: panel= false toasts= 0
D rekey= true panel= true
D2 rekey= true checklist= true panel= false
E rekeyBtn= false invalid class= true
E picker= true [ 'local:p2' ]

===== R1 修正前（閉じたときの afterPanelClose・prefix） (2026-09-29 00:29:47) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R1
     × 「変更を捨てますか」の途中で画面を閉じたら、予定（別の線を開く）は開き直した後に効かない（probe A） 152ms
     × prefix を押したまま画面を閉じても、開き直した後の a で閉じない 39ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じたときの一時的な状態。レビュー R1） > 「変更を捨てますか」の途中で画面を閉じたら、予定（別の線を開く）は開き直した後に効かない（probe A）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じたときの一時的な状態。レビュー R1） > prefix を押したまま画面を閉じても、開き直した後の a で閉じない
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  2 failed | 55 skipped (57)
exit=1

===== R1 修正後 (2026-09-29 00:30:05) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts
 Test Files  1 passed (1)
      Tests  57 passed (57)
exit=0

===== R1 変異: 閉じるときに afterPanelClose を消さない (2026-09-29 00:30:10) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R1
     × 「変更を捨てますか」の途中で画面を閉じたら、予定（別の線を開く）は開き直した後に効かない（probe A） 155ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じたときの一時的な状態。レビュー R1） > 「変更を捨てますか」の途中で画面を閉じたら、予定（別の線を開く）は開き直した後に効かない（probe A）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 55 skipped (57)
exit=1

===== R1 変異: 閉じるときに prefix を戻さない (2026-09-29 00:30:13) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R1
     × prefix を押したまま画面を閉じても、開き直した後の a で閉じない 58ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じたときの一時的な状態。レビュー R1） > prefix を押したまま画面を閉じても、開き直した後の a で閉じない
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 55 skipped (57)
exit=1

===== R2 修正前（変更を捨てますかのモーダル） (2026-09-29 00:30:57) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R2
     × 確認はパネルの外（グラフ画面全体）に重なり、外へフォーカスが移っても確認へ戻す。Esc は確認を取り消して編集に戻る（probe B） 118ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（変更を捨てますかはグラフ画面全体でモーダル。レビュー R2） > 確認はパネルの外（グラフ画面全体）に重なり、外へフォーカスが移っても確認へ戻す。Esc は確認を取り消して編集に戻る（probe B）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 57 skipped (59)
exit=1

===== R2 修正後 (2026-09-29 00:31:39) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  78 passed (78)
exit=0

===== R2 変異: 確認の外へのフォーカスを戻さない (2026-09-29 00:32:11) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R2
     × 確認はパネルの外（グラフ画面全体）に重なり、外へフォーカスが移っても確認へ戻す。Esc は確認を取り消して編集に戻る（probe B） 117ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（変更を捨てますかはグラフ画面全体でモーダル。レビュー R2） > 確認はパネルの外（グラフ画面全体）に重なり、外へフォーカスが移っても確認へ戻す。Esc は確認を取り消して編集に戻る（probe B）
AssertionError: expected 'graph-node graph-node-selected' to be 'graph-confirm-cancel' // Object.is equality
Expected: "graph-confirm-cancel"
Received: "graph-node graph-node-selected"
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 57 skipped (59)
exit=1

===== R2 変異: 編集に戻っても予定を取りやめない (2026-09-29 00:32:14) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t g03 点検）
     × 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1） 139ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（書きかけのパネルと線の押し方。g03 点検） > 変更があるパネルのまま別のチップを押すと「変更を捨てますか」。編集に戻れば残り、捨てればその線を開く（P1）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed | 44 skipped (59)
exit=1

===== R3 修正前（保存の応答の当て先・閉じた後の失敗） (2026-09-29 00:32:47) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R3
     × 保存の応答待ちの間に別の線のパネルへ移っても、その保存中の印・応答は新しいパネルに当たらない（probe C） 128ms
     × 閉じた後に保存が失敗したらトーストで知らせる（パネルが無いので黙って消えない） 55ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（保存の応答は送ったときのパネルにだけ当てる。レビュー R3） > 保存の応答待ちの間に別の線のパネルへ移っても、その保存中の印・応答は新しいパネルに当たらない（probe C）
AssertionError: expected '' to be undefined
- Expected:
+ Received:
 FAIL  src/components/graph/GraphView.test.ts > GraphView（保存の応答は送ったときのパネルにだけ当てる。レビュー R3） > 閉じた後に保存が失敗したらトーストで知らせる（パネルが無いので黙って消えない）
AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string, or a weakset instead of a string
 Test Files  1 failed (1)
      Tests  2 failed | 59 skipped (61)
exit=1

===== R3 修正後 (2026-09-29 00:33:12) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  80 passed (80)
exit=0

===== R3 変異: 世代を見ずに今のパネルへ当てる (2026-09-29 00:33:31) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R3
     × 保存の応答待ちの間に別の線のパネルへ移っても、その保存中の印・応答は新しいパネルに当たらない（probe C） 148ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（保存の応答は送ったときのパネルにだけ当てる。レビュー R3） > 保存の応答待ちの間に別の線のパネルへ移っても、その保存中の印・応答は新しいパネルに当たらない（probe C）
Error: Cannot call text on an empty DOMWrapper.
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 59 skipped (61)
exit=1

===== R3 変異: 保存中の印を線ごとにしない (2026-09-29 00:33:34) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R3
     × 保存の応答待ちの間に別の線のパネルへ移っても、その保存中の印・応答は新しいパネルに当たらない（probe C） 133ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（保存の応答は送ったときのパネルにだけ当てる。レビュー R3） > 保存の応答待ちの間に別の線のパネルへ移っても、その保存中の印・応答は新しいパネルに当たらない（probe C）
AssertionError: expected '' to be undefined
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 59 skipped (61)
exit=1

===== R3 変異: 閉じた後の失敗を知らせない (2026-09-29 00:33:37) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R3
     × 閉じた後に保存が失敗したらトーストで知らせる（パネルが無いので黙って消えない） 67ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（保存の応答は送ったときのパネルにだけ当てる。レビュー R3） > 閉じた後に保存が失敗したらトーストで知らせる（パネルが無いので黙って消えない）
AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string, or a weakset instead of a string
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 59 skipped (61)
exit=1

===== R4 修正前（選び直し・チェックリスト・パネルの排他） (2026-09-29 00:34:02) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R4
     × 選び直しを開いたままチップ・線を押すと選び直しを閉じるだけ（パネルは開かない。probe D） 123ms
     × 選び直しを開いたまま「pane を載せる」でチェックリストだけにし、チェックリストを開いたままの r は選び直しだけにする（probe D2） 36ms
     × 変更があるパネルのまま「pane を載せる」は確認を通し、捨てればチェックリストを開く 52ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直し・チェックリスト・パネルは排他。レビュー R4） > 選び直しを開いたままチップ・線を押すと選び直しを閉じるだけ（パネルは開かない。probe D）
AssertionError: expected { rekey: true, checklist: false, …(1) } to deeply equal { Object (rekey, checklist, ...) }
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直し・チェックリスト・パネルは排他。レビュー R4） > 選び直しを開いたまま「pane を載せる」でチェックリストだけにし、チェックリストを開いたままの r は選び直しだけにする（probe D2）
AssertionError: expected { rekey: true, checklist: true, …(1) } to deeply equal { rekey: false, checklist: true, …(1) }
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直し・チェックリスト・パネルは排他。レビュー R4） > 変更があるパネルのまま「pane を載せる」は確認を通し、捨てればチェックリストを開く
AssertionError: expected { Object (rekey, checklist, ...) } to deeply equal { rekey: false, checklist: true, …(1) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  3 failed | 61 skipped (64)
exit=1

===== R4 修正後 (2026-09-29 00:34:16) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  83 passed (83)
exit=0

===== R4 変異: チップで選び直しを閉じない (2026-09-29 00:34:34) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R4
     × 選び直しを開いたままチップ・線を押すと選び直しを閉じるだけ（パネルは開かない。probe D） 115ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直し・チェックリスト・パネルは排他。レビュー R4） > 選び直しを開いたままチップ・線を押すと選び直しを閉じるだけ（パネルは開かない。probe D）
AssertionError: expected { rekey: true, checklist: false, …(1) } to deeply equal { Object (rekey, checklist, ...) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 61 skipped (64)
exit=1

===== R4 変異: チェックリストを開くとき選び直しを閉じない (2026-09-29 00:34:38) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R4
     × 選び直しを開いたまま「pane を載せる」でチェックリストだけにし、チェックリストを開いたままの r は選び直しだけにする（probe D2） 54ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直し・チェックリスト・パネルは排他。レビュー R4） > 選び直しを開いたまま「pane を載せる」でチェックリストだけにし、チェックリストを開いたままの r は選び直しだけにする（probe D2）
AssertionError: expected { rekey: true, checklist: true, …(1) } to deeply equal { rekey: false, checklist: true, …(1) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 61 skipped (64)
exit=1

===== R4 変異: チェックリストを開くときパネルの確認の後に開かない (2026-09-29 00:34:41) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R4
     × 変更があるパネルのまま「pane を載せる」は確認を通し、捨てればチェックリストを開く 71ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直し・チェックリスト・パネルは排他。レビュー R4） > 変更があるパネルのまま「pane を載せる」は確認を通し、捨てればチェックリストを開く
AssertionError: expected { Object (rekey, checklist, ...) } to deeply equal { rekey: false, checklist: true, …(1) }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 61 skipped (64)
exit=1

===== R5 修正前（別のマシンの無効なノードの r） (2026-09-29 00:35:13) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R5
     × 別のマシンの閉じた pane のノードは、ボタンも r も選び直しを開かない（probe E） 91ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直しは手元のノードだけ。レビュー R5） > 別のマシンの閉じた pane のノードは、ボタンも r も選び直しを開かない（probe E）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 64 skipped (65)
exit=1

===== R5 修正後 (2026-09-29 00:35:28) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  84 passed (84)
exit=0

===== R5 変異: 選び直しの条件から手元だけを外す (2026-09-29 00:35:43) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R5|選び直し
     × 別のマシンの閉じた pane のノードは、ボタンも r も選び直しを開かない（probe E） 32ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（選び直しは手元のノードだけ。レビュー R5） > 別のマシンの閉じた pane のノードは、ボタンも r も選び直しを開かない（probe E）
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed | 59 skipped (65)
exit=1

===== R6 修正前（チェックリストの差分を開いた時点と比べる） (2026-09-29 00:35:57) =====
$ npx vitest run --root packages/web src/components/graph/PaneChecklist.test.ts -t レビュー R6
     × 開いている間に他で足された・外されたノードを、適用で巻き戻さない（自分が変えた分だけを渡す） 56ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（開いた時点の写しと比べる。レビュー R6） > 開いている間に他で足された・外されたノードを、適用で巻き戻さない（自分が変えた分だけを渡す）
AssertionError: expected { …(2) } to deeply equal { add: [ 'local:p2' ], remove: [] }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
exit=1

===== R6 修正後 (2026-09-29 00:36:26) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  85 passed (85)
exit=0

===== R6 変異: 差分を今の載り方と比べる (2026-09-29 00:36:33) =====
$ npx vitest run --root packages/web src/components/graph/PaneChecklist.test.ts
     × 開いている間に他で足された・外されたノードを、適用で巻き戻さない（自分が変えた分だけを渡す） 16ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/PaneChecklist.test.ts > PaneChecklist（開いた時点の写しと比べる。レビュー R6） > 開いている間に他で足された・外されたノードを、適用で巻き戻さない（自分が変えた分だけを渡す）
AssertionError: expected { …(2) } to deeply equal { add: [ 'local:p2' ], remove: [] }
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
exit=1

===== R7 修正前（押しただけの reveal の残りの経路） (2026-09-29 00:36:49) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R7
     × パネルを開いている・接続モード・モバイルのときにノードを押しても（ブラウザの既定のフォーカスでも）表示が跳ばない 124ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（押しただけの reveal の残りの経路。レビュー R7） > パネルを開いている・接続モード・モバイルのときにノードを押しても（ブラウザの既定のフォーカスでも）表示が跳ばない
AssertionError: expected 'translate(-720px, 40px) scale(1)' to be 'translate(40px, 40px) scale(1)' // Object.is equality
Expected: "translate(40px, 40px) scale(1)"
Received: "translate(-720px, 40px) scale(1)"
 Test Files  1 failed (1)
      Tests  1 failed | 65 skipped (66)
exit=1

===== R7 修正後 (2026-09-29 00:37:01) =====
$ npx vitest run --root packages/web src/components/graph/
     × パネルを開いている・接続モード・モバイルのときにノードを押しても（ブラウザの既定のフォーカスでも）表示が跳ばない 26ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（押しただけの reveal の残りの経路。レビュー R7） > パネルを開いている・接続モード・モバイルのときにノードを押しても（ブラウザの既定のフォーカスでも）表示が跳ばない
AssertionError: expected 'translate(-80px, 40px) scale(1)' to be 'translate(40px, 40px) scale(1)' // Object.is equality
Expected: "translate(40px, 40px) scale(1)"
Received: "translate(-80px, 40px) scale(1)"
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 85 passed (86)
exit=1

（上の「R7 修正後」の 1 件の失敗は試験の場面の誤り: パネルを開いた状態で押すとパネルが閉じてフォーカスが線へ戻り〔AC-I4〕、その線を画面へ入れる移動が正しく起きていた。押しただけの経路を突く場面〔チェックリストを開いている〕に替えて取り直した）

===== R7 修正前（場面を替えた試験） (2026-09-29 00:37:39) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R7
     × チェックリストを開いている・モバイルのときにノードを押しても（ブラウザの既定のフォーカスでも）表示が跳ばない 101ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（押しただけの reveal の残りの経路。レビュー R7） > チェックリストを開いている・モバイルのときにノードを押しても（ブラウザの既定のフォーカスでも）表示が跳ばない
AssertionError: expected 'translate(-840px, 40px) scale(1)' to be 'translate(40px, 40px) scale(1)' // Object.is equality
Expected: "translate(40px, 40px) scale(1)"
Received: "translate(-840px, 40px) scale(1)"
 Test Files  1 failed (1)
      Tests  1 failed | 65 skipped (66)
exit=1

===== R7 修正後（取り直し） (2026-09-29 00:37:42) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  86 passed (86)
exit=0

===== R8 修正前（閉じた後のフォーカスの戻り先） (2026-09-29 00:38:30) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R8
     × チェックリストの適用の応答を待つ間・失敗・空の操作でも、フォーカスは「pane を載せる」に居る（body に落ちない） 109ms
     × 選び直しの応答を待つ間はそのノード、失敗してもそのノードに居る 38ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じた後のフォーカスの戻り先。レビュー R8） > チェックリストの適用の応答を待つ間・失敗・空の操作でも、フォーカスは「pane を載せる」に居る（body に落ちない）
AssertionError: expected '' to contain 'graph-add-panes'
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じた後のフォーカスの戻り先。レビュー R8） > 選び直しの応答を待つ間はそのノード、失敗してもそのノードに居る
AssertionError: expected null to be 'local:p1' // Object.is equality
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  2 failed | 66 skipped (68)
exit=1

===== R8 修正後 (2026-09-29 00:39:03) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  88 passed (88)
exit=0

===== R8 変異: 適用のすぐ後に「pane を載せる」へ移さない (2026-09-29 00:39:22) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R8
     × チェックリストの適用の応答を待つ間・失敗・空の操作でも、フォーカスは「pane を載せる」に居る（body に落ちない） 102ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じた後のフォーカスの戻り先。レビュー R8） > チェックリストの適用の応答を待つ間・失敗・空の操作でも、フォーカスは「pane を載せる」に居る（body に落ちない）
AssertionError: expected '' to contain 'graph-add-panes'
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 66 skipped (68)
exit=1

===== R8 変異: 失敗のとき戻さない (2026-09-29 00:39:25) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R8
 Test Files  1 passed (1)
      Tests  2 passed | 66 skipped (68)
exit=0

===== R8 変異: 選び直しの応答待ちの間にノードへ移さない (2026-09-29 00:39:29) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R8
     × 選び直しの応答を待つ間はそのノード、失敗してもそのノードに居る 48ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（閉じた後のフォーカスの戻り先。レビュー R8） > 選び直しの応答を待つ間はそのノード、失敗してもそのノードに居る
AssertionError: expected null to be 'local:p1' // Object.is equality
- Expected:
+ Received:
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 66 skipped (68)
exit=1

（上の「R8 変異: 失敗のとき戻さない」は通った——フォーカスは適用のすぐ後に「pane を載せる」へ移してあり、失敗のときの戻し直しは効いていない行だった。その行を消した〔コミットに含めた〕）

===== R8 修正後（効いていない行を消した後） (2026-09-29 00:39:43) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  88 passed (88)
exit=0

===== R10 修正前（表示の保存の間引き・nodeInfo の作り直し） (2026-09-29 00:40:15) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R10
     × パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く 90ms
     × ノードのドラッグの毎回にはノードの中身（nodeInfo）を作り直さない 54ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く
AssertionError: expected +0 to be 1 // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > ノードのドラッグの毎回にはノードの中身（nodeInfo）を作り直さない
AssertionError: expected [ Array(8) ] to have a length of +0 but got 8
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  2 failed | 68 skipped (70)
exit=1

（上の R10 の 1 件目の修正前の失敗は、試験が Storage.prototype を見張っていて happy-dom の localStorage の書き込みを数えていなかったため。localStorage そのものを見張る形に直して取り直す）

===== R10 修正前（取り直し） (2026-09-29 00:40:28) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R10
     × パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く 98ms
     × ノードのドラッグの毎回にはノードの中身（nodeInfo）を作り直さない 54ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > ノードのドラッグの毎回にはノードの中身（nodeInfo）を作り直さない
AssertionError: expected [ Array(8) ] to have a length of +0 but got 8
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  2 failed | 68 skipped (70)
exit=1

===== R10 修正後 (2026-09-29 00:41:02) =====
$ npx vitest run --root packages/web src/components/graph/
 Test Files  5 passed (5)
      Tests  90 passed (90)
exit=0

===== R10 変異: 表示を毎回すぐ書く (2026-09-29 00:41:22) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R10
     × パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く 91ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 68 skipped (70)
exit=1

===== R10 変異: 閉じるときに書かない (2026-09-29 00:41:25) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R10
     × パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く 97ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く
AssertionError: expected 1 to be 2 // Object.is equality
- Expected
+ Received
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 68 skipped (70)
exit=1

===== R10 変異: ノードの中身を位置に依存させる (2026-09-29 00:41:29) =====
$ npx vitest run --root packages/web src/components/graph/GraphView.test.ts -t レビュー R10
[Vue warn]: Invalid prop: type check failed for prop "info". Expected Object, got Undefined  
[Vue warn]: Invalid prop: type check failed for prop "info". Expected Object, got Undefined  
     × パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く 78ms
     × ノードのドラッグの毎回にはノードの中身（nodeInfo）を作り直さない 24ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > パン・ズームの毎回には localStorage に書かず、止まってから 1 回・閉じるときにすぐ書く
 FAIL  src/components/graph/GraphView.test.ts > GraphView（表示の保存の間引き・ノードの中身を位置に依存させない。レビュー R10） > ノードのドラッグの毎回にはノードの中身（nodeInfo）を作り直さない
TypeError: Cannot read properties of undefined (reading 'exists')
TypeError: Cannot read properties of undefined (reading 'exists')
TypeError: Cannot read properties of undefined (reading 'exists')
 Test Files  1 failed (1)
      Tests  2 failed | 68 skipped (70)
exit=1

===== 修正後の再現（probe.test.ts A〜E。2026-09-29 00:41:38） =====
stdout | probe.test.ts > g03review probes > A: 捨てる確認中に × で閉じると afterPanelClose が残り、次の画面で別のパネルを閉じると古い線が開く
A after Esc: panel exists= false 
B confirm still= false panel= true active= link-panel-on
C l2 panel= 線: impl → reviewer（監督） saveDisabled= undefined
C resolve defined function 1
 ✓ probe.test.ts > g03review probes > A: 捨てる確認中に × で閉じると afterPanelClose が残り、次の画面で別のパネルを閉じると古い線が開く 140ms
C after l1 save resolves: panel exists= true
C fail: panel= false toasts= 1
D rekey= false panel= false
D2 rekey= false checklist= true panel= false
E rekeyBtn= false invalid class= true
E picker= false []

===== 全体の検証（レビュー R1 の修正後。2026-09-29 00:45:04） =====
pnpm build: exit=0 / pnpm typecheck: exit=0 / pnpm test: exit=0（346 ファイル・6214 件 通過）
```
