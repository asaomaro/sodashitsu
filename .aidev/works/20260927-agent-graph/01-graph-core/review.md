# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/protocol/src/graph.ts:10 NodeKey の型が string で、design のテンプレート文字列の型より緩い / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/protocol/src/graph.ts:136-146,176-182 GraphSchema だけでは kind と設定の組を確かめず、手で直した graph.json を受け入れる（読み込みで validate も通す） / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/protocol/src/graph.test.ts:124-127 METHOD_SCHEMAS の試験が鍵の存在だけで、結び付けたスキーマの同一性を見ない / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [should][conv:-] packages/client-core/src/graph/validate.ts:76 「{output}」だけの prompt（出力の受け渡しなし）が検証を通り、空の文面を送る / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/client-core/src/graph/message.ts:12-17 8 ビットの C1 の列（CSI U+009B・OSC U+009D）の中身が残る / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/client-core/src/graph/message.ts:48-49 画面が空で {output} が無いと末尾に空行が付く / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/client-core/src/graph/validate.ts:155,162 存在しない id の線は新規扱いなのに 128 本の上限を見ない / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/client-core/src/graph/ops.test.ts:142-167 rekey_node の重複・trigger 無しの add_link の試験が無い / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [should][conv:-] packages/server/src/composeServer.ts:648 終了で graph を flush した後も既存の接続から graph.update を受け、ロックを放した後に graph.json を書きうる（handoff は正しい順） / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/server/src/persist/GraphStore.ts:140 変化の無い pause/resume でも rev を進め、他の編集に不要な rev_conflict を起こす / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [must][conv:-] packages/web/src/notify/NotificationController.ts:314 グラフ画面を開いている間の OS 通知のクリックで端末がフォーカスを奪い、Esc も効かなくなる（modalOpen で分けていない） / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:37-46 背面の inert もフォーカスの閉じ込めも無く、Tab で背面の端末へ出てキーが効かなくなる / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/web/src/actions/ActionDispatcher.ts:255 「同じキーで閉じる」とコメントにあるが未実装（03） / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）
- [nit][conv:-] packages/web/src/store/view.ts:518-521 toggleGraph が本番で使われていない / 対応: 修正済（428f9aa・4149357・506c18b・59b38a2・7884bdf。ラウンド1）

## ラウンド 1（2026-09-28）
- [should][conv:-] packages/web/src/components/graph/GraphView.vue:21 showModal の top layer に Toast・ReconnectOverlay が隠れ押せない（切断・完了の知らせ・03 の上限の知らせが見えない） / 対応: 修正済（3407a82・9f57d6f・ab7de83。負の確認は test-result）
- [nit][conv:-] packages/client-core/src/graph/validate.ts:128-150 validateGraph が線の id の重複を断らない（remove_link・pause が 2 本に効く） / 対応: 修正済（3407a82・9f57d6f・ab7de83。負の確認は test-result）
- [nit][conv:-] packages/client-core/src/graph/validate.ts nextLinkId・線の id の数値が安全な整数を超えると丸められ id が重なる / 対応: 修正済（3407a82・9f57d6f・ab7de83。負の確認は test-result）
- [nit][conv:-] packages/server/src/composeServer.ts:568 session.json の 500ms のまとめと graph.json の即時の保存のずれで、落ちた後に存在しない pane のノードが次の pane に付く / 対応: 修正済（3407a82・9f57d6f・ab7de83。負の確認は test-result）
