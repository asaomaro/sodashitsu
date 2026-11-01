# 統合前検証

- 全体build: PASS（最終production修正後）。
- 全体typecheck: PASS。新規test fixtureの設定既定値と返却値型を修正し、独立再レビュー済み。
- 全体Vitest: 947 files passed / 1 skipped、13,549 tests passed / 1 skipped、400.87秒。
- 修正箇所の集中検証: 3 files / 100 tests PASS。音声fixture修正後の再検証: 2 files / 9 tests PASS。
- E2E: assistant-response.spec.tsとresource-monitor.spec.ts、5 tests PASS。
- smoke: 標準ブラウザでは端末textarea表示でtimeout（以前のmain検証記録にも同症状）。Chromium 1223の実行ファイルのみを指定し、同じassertion・一時サーバを用いた再確認はPASS。ブラウザ入力→PTY往復、初回案内とfocus復帰を確認。
- 回帰negative control: フォーム優先ID、tools閉じた後の表示状態、persona準備中の画像取消の3件とも修正を戻すとFAIL、復元後PASS。
- 全体テスト中のhappy-dom非同期通信stderrは記録されるが、テスト失敗・未処理エラー集計なし。

ローカル検証ログ: /tmp/soda-assistant-merge-{build-final,typecheck2,all-tests,fixes,voice-fixtures,e2e,smoke2}.log。

追加の実機検証: Windows DirectMLのCORE 0.17.0 / 0.17.1を実行。最終独立レビューで0.17.0のcancellable synthesisもgpu:true、24kHz mono WAVとして確認した。設定窓・toolsのWindows表示検証は各作業記録参照。
