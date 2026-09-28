# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/web/src/store/graph.ts:144,161 再接続・マシン切り替えで履歴を取り直さず、回数と履歴が食い違う / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/main.ts:121-146 グラフのイベントの当て先・graphPort の送り先・接続のたびの取り直しの規則に試験が無い（条件を反転しても落ちない） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/main.ts:137-139 再接続中・送信中の切断で not_connected の code が付かず internal の文言になる / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/store/graph.ts:127-135 自分で上限を下げた保存（D5-13）でも「上限に達したので止めました」が出る / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/store/graph.ts:199-202,349 rev_conflict の後の load() の失敗でも古い baseRev で 3 回送り直す・reset() が未使用 / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:124,1178 ノードの DOM 順が y→x の並べ替えで、ドラッグ・矢印の移動中に要素が動きフォーカスが落ちる（Esc で画面ごと閉じる） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphEdge.vue:56・GraphView.vue:369 線・チップの pointerdown が書きかけのパネルの確認を通らず入力が消える／モバイルで線からパンを始められない / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/client-core/src/graph/geometry.ts:117-118 ノードが重なると線の先の印が逆を向く / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:203-206,247 押しただけで reveal が走り表示が跳ぶ / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [must][conv:-] packages/web/src/components/graph/GraphView.vue:369-372,749-757 書きかけの変更があっても別の線・チップを押すと確認なしにパネルが作り直され変更が消える（scratchpad/check-g03-b/probe.test.ts P1） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:808-812,822-825 変更がある間もノードの c → Enter で新しい線のパネルに差し替わる（P2） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:826-829 変更がある間のノードの Enter が確認なしに画面を閉じて pane へ移る（P3） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/LinkPanel.vue:149,158,167 範囲外の上限・行数を黙って丸める（500→100、空→10） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/linkText.ts:22-25・MobileGraphSheet.vue:73-77 承認の代理の delegate/notify が見た目で分からない / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.test.ts:457-500 変更がある状態での別のチップ・線・c+Enter・Enter の試験が無い / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/PaneChecklist.vue:37-52・decisions D6-9 無効（stale）のノードが同じ鍵の新しい pane の「載っている」行として出て注記も無く、線を保って選び直す入口（rekey_node）が画面にも CLI にも無い / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:749-757 チェックリストを開いたままチップを押すと両方開く（P6） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:723-726 パネルから開いた履歴を Esc で閉じるとフォーカスがツールバーへ行く / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.test.ts:556-706 stale と同じ鍵の pane のチェックリストの表示の試験が無い / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [must][conv:-] packages/web/src/components/graph/GraphView.vue:124,834-841 矢印で他のノードを越えると DOM が並べ替わりフォーカスが body へ落ち、Esc で画面ごと閉じる（P7。T2 の should と同根） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:792-803 狭い画面（モバイル扱い）でチップの Delete で線を削除できる（P4） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphEdge.vue:56・GraphView.vue:369-372 モバイルで線の当たりに触れた瞬間にシートが開きパン・ピンチできない（P5。T2 の should と同根） / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:207-209 Tab でチップにフォーカスしても画面の外なら reveal されない・focus() に preventScroll が無い / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/MobileGraphSheet.vue:89-95 シートの「再開」が回数を 0 に戻すことを示さない / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）
- [nit][conv:-] packages/web/src/components/graph/GraphView.test.ts:350-366,720-752 Esc の段階の通しと、割り当てを変えた・directMap の open_graph で閉じる試験が無い / 対応: 修正済（b33ad3b・e27699e・59cbcec・a970ee3・e7c6cb1・0f6d353・25d456e・3fc2db3・9e853d7。ラウンド1）

## ラウンド 1（2026-09-29）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:577-584,610-618,1106-1118 guardPanel の afterPanelClose が画面を閉じても残り、開き直した後に無関係なパネル・画面の閉じ方に効く（scratchpad/check-g03review/probe.test.ts A） / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [should][conv:-] packages/web/src/components/graph/LinkPanel.vue:197-199,410,423 「変更を捨てますか」がパネルの中にしか重ならず、外を押すとキーで抜け出せない（B） / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:634-668 保存の応答が別の線のパネルに当たる・閉じた後の保存の失敗が知らされない（C） / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:427-435,742-749 選び直しを開いたままチップ・線・「pane を載せる」で部品が 2 つ開く（D・D2） / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:1026・GraphNode.vue:93 別のマシンの無効なノードで r を押すと手元の pane に付け替わる（E） / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [should][conv:-] packages/web/src/components/graph/PaneChecklist.vue:103-104,121-125 差分を今の onGraph と作るので、開いている間の他での追加・除去を巻き戻す / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:228-232,247-268 早めに return する経路で押しただけの reveal が残る / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:780-806,849-864 パネル類を閉じた後の応答待ち・失敗でフォーカスが body に落ちる / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:1106-1118,1163-1170 閉じる処理で prefixArmed を戻さない / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [nit][conv:-] packages/web/src/components/graph/GraphView.vue:87-93 パン・ズームの毎フレームで localStorage に書く・ドラッグの毎フレームで nodeInfo を作り直す / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
- [nit][conv:-] packages/web/src/components/graph/GraphView.test.ts 上の件を突く試験が無い / 対応: 修正済（bd36078・418ab56・f7dd4d6・ed611ec・4a6c296・0478d27・d5658ad・af34e39・f7d0710。負の確認は test-result）
