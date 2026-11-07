# 子effortの注記を省く

Scrollbar 52704cbf とまとめた確認・反映単位。製品変更は共通 subagentEffortLabel の text/title だけ。生成時/turn の basis と値の検証は保持し、親モデル・取得処理・フッターは変更しない。子モデル行には値だけ、title は effort と値だけを表示する。Web/TUI と情報内一覧に共通反映。利用者文書と既存期待を更新した。

- 既存 5 suites 260 tests pass。型の変更なし、共通 client-core build exit0。全体テスト重複なし。
- 実 Chromium/Vue fixture: Sidebar と情報内 inline 子一覧が low のみ、開始時/記録/現在設定の注記なし。親観測 tooltip/state aria/モデル・セッション同フォント/ヘッダー情報/4テーマを維持。実利用者pane・モデル送信なし。
- 旧 helper で client-core を再buildし、既存意味テスト 2 fail/4 pass、実 DOM も low（開始時）により fail。raw negative.txt / negative-browser.txt。
- 1 製品 source を cmp と SHA256 で byte-exact 復元し、再build後 6 tests と同 DOM が pass。restoration.json / restored*.txt。最初の 260 tests と最終 helper 6 tests は同一製品 source。

Scrollbar 側の 5テーマ×classic/modern、色不変、xterm slider/track・hidden維持の検証は ../20261107-scrollbar-size/test-result.md。小変更を追加したための重複全体検証は実施しない。
