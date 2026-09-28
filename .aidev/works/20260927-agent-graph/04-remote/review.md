# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/web/src/main.ts:362 requestPaneFocus が pane の存在・表示中の tab を確かめず焦点を当て、切り替えの間に閉じた・移った pane で画面とサーバの焦点がずれる / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:983・packages/web/src/store/graph.ts:362 切れたマシンのノードが未接続の印なく最後の状態を出し、Enter で画面が閉じるだけで何も起きない / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/PaneChecklist.vue:53・RekeyPicker.vue:40 別のマシンを見ている間の節・候補（同じ pane id が両方にある）の試験が無い（nodeKey のマシンを戻す変異が通る） / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/RekeyPicker.vue:40 切れているマシンの古い要約の pane が印なしで選び直しの候補に出る / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/PaneChecklist.vue:53-70 画面が向いているマシンの節は切れても「（未接続）」が付かず、切り替えの途中はノードが一時的に無効と出る / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/PaneChecklist.vue:96 手元の軽い接続が一度も繋がっていないと手元の節が黙って消える / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [must][conv:-] packages/server/src/graph/RemoteLinks.ts:70 hello の応答と同じ塊で後ろに来たイベントを up が偽のあいだ捨て、完了を取りこぼす（scratchpad/check-g04-server/sameChunk.test.ts） / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [should][conv:-] packages/server/src/graph/linkChannelSocket.ts:294 リモートの CLOSE の code を素通しし、4401 で繋ぎ直しが止まったままになる（storm.test.ts） / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [should][conv:-] packages/server/src/graph/linkChannelSocket.ts:295・RemoteLinks.ts:177 チャネルがすぐ開くので間隔が 0 に戻り、hello を断るリモートへ 1 秒おきに永遠に繋ぎ直す（storm.test.ts） / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [nit][conv:-] packages/client-core/src/net/Connection.ts:158,184 disconnect の後の retarget で stopped が戻らない・待ち中の disconnect が状態を通知しない / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [nit][conv:-] packages/server/src/graph/RemoteAgentPort.ts:147 期限切れの読み取りへの遅い SNAPSHOT が次の読み取りを終わらせる / 対応: 修正済（4befbea・dde0912。ラウンド1）
- [nit][conv:-] packages/server/src/graph/GraphEngine.ts:583 リモートの監督役への知らせの途中の切断（connection_closed）は送り直さず、繋ぎ直しても知らせ直さない（意図なら decisions に） / 対応: 修正済（4befbea・dde0912。ラウンド1）

## ラウンド 1（2026-09-29）
- [should][conv:-] packages/server/src/graph/GraphEngine.ts:495,536 「作業中とみなす」を送り始めに張り送る時点で張り直さないため、リモートの末尾の読み取り（最長約 10 秒）の間に切れて同じ先へ 2 通送る / 対応: 修正済（d4ec376・a66c75e。負の確認は test-result）
- [nit][conv:-] packages/server/src/graph/RemoteLinks.ts:75-77 snapshot を取ってから hello の応答までに出たイベントも捨て、閉じた pane・古い呼び名が残る（D7-14 の前提の書き直し） / 対応: 修正済（d4ec376・a66c75e。負の確認は test-result）
- [nit][conv:-] packages/web/src/components/graph/PaneChecklist.vue:87 切れたマシンの古い要約の pane を載せられる（RekeyPicker と不揃い） / 対応: 修正済（d4ec376・a66c75e。負の確認は test-result）
- [nit][conv:-] packages/web/src/store/graph.ts:382 マシンの切り替えの 1 回の描画でノードが一瞬 ⚠ 無効と出る / 対応: 修正済（d4ec376・a66c75e。負の確認は test-result）
