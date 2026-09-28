# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/server/src/graph/TriggerState.ts:127-129,153-156 on:"blocked" の前の回（ep1）の待ちが次の回（ep2）に残り、待ちから送っても ep2 に処理済みの印が付かず同じ ep2 で再発火する（承認の知らせが 2 回。scratchpad/check-g02-pure/probe.test.ts） / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/TriggerState.ts:77-84,119-122 on:done→on:blocked に変えると、変える前から続く blocked の回で次の tick に発火（新規の線なら動かない D5-5 と不揃い） / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/TriggerState.test.ts 「待つ間の tick は、先が空いていれば送る」の題と中身が合わず、tick から resolveWaiting の送信・absent に行く分岐は到達不能で試験も無い / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/TriggerState.test.ts 30 分後に target 経由で busy_timeout になる道の試験が無い / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/SupervisorNotifier.ts:75-80 監督の知らせと承認の代理が同じ tick で両方 send になり、監督役へ 2 つの prompt が続けて送られる（GraphEngine 側で直す） / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/LocalAgentPort.ts:97-100 bottomLines は画面の行で数え、折り返した長い行（パス・URL）が {output} で途中改行される / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [should][conv:-] packages/server/src/graph/GraphEngine.ts:203-218・packages/server/src/persist/GraphStore.ts:196 limit を count 以下に下げても paused が付かず、上限を超えて 1 回送る / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/GraphEngine.ts:296-323 送信の await の間の線の削除・一時停止を見直さない / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/GraphEngine.ts:286,337 同じ線の送信が並ぶと count が上限を超える / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/persist/GraphStore.ts:196 送信中の利用者の一時停止が上限で "limit" に上書きされる / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/GraphEngine.ts:105,283-285,411 同期の bus で graph.fired が原因の状態の変化より先に届く / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/graph/GraphEngine.ts:131 同じミリ秒の履歴が新しい順にならない / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/persist/GraphStore.ts:188-202 発火のたびに rev が上がり他の画面の graph.update が rev_conflict になる（03 への申し送り） / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [should][conv:regression-negative-control] packages/server/src/composeServer.graph.integration.test.ts:626-638 graphEngine.stop() の行・handoff の pause/resume を消しても落ちない / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [should][conv:-] packages/server/src/composeServer.graph.integration.test.ts:480,570 固定の sleep(300) の後に count・paused を読む（負荷でフレーク） / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:regression-negative-control] packages/server/src/composeServer.graph.integration.test.ts:620-621 stale の試験がノードの stale:true を見ていない / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.graph.integration.test.ts:463,473 GRAPH_RESULT_OK が tty のエコーでも入り、200 文字で切られて環境によって落ちる / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.graph.integration.test.ts:563-566 送った文面が本物の bash で実行され、バッククォートがコマンド置換として走る / 対応: 修正済（6b5133d・dfe31d3・12a76db・3f5f6b7・1ce14a2。ラウンド1）

## ラウンド 1（2026-09-28）
- [should][conv:-] packages/server/src/graph/GraphEngine.ts:290-304,326-331 onStatus の経路では「作業中とみなす」が効かず、同じ先への待ちの線 2 本・監督の知らせと承認の代理が同じ idle で 2 通続けて送られる（scratchpad/check-g02review/probe.test.ts） / 対応: 修正済（84797f4。負の確認は test-result）
- [should][conv:-] packages/server/src/graph/GraphEngine.ts:292 idle のままの知らせ（既読・名前の変更）で「作業中とみなす」が消え、5 秒以内に 2 通目を送る / 対応: 修正済（84797f4。負の確認は test-result）
- [nit][conv:-] packages/server/src/graph/GraphEngine.ts:393-394 送信中に stop（引き継ぎ）が入ると届いた送信を数えず、引き継ぎの失敗後に上限 1 の線が 2 回送る / 対応: 修正済（84797f4。負の確認は test-result）
