# 新仕様への置換台帳

- [x] Web: 子選択→専用会話窓、親の情報から会話本文/導線を撤去
- [x] Web: 親への依頼を下書き→明示checked送信、既存guard維持
- [x] Web: 最終関連検証/負例完全復元
- [ ] Web: 独立レビュー
- [x] TUI: 子選択→専用会話、情報から履歴導線撤去/親下書き→checked明示送信
- [ ] TUI: 独立レビュー
- [ ] 正式send能力: 対応子だけdirect入力、非対応はreadonly/親依頼
- [ ] 終了子history: 新子会話側の入口（backend契約連携）
- [ ] 子usage: 自身の正式値だけを情報/会話画面へ表示（backend契約連携）

旧「情報ウィンドウ内に子会話」タスクは削除せず上記へ置換。取得provider追加/追跡/子usage等の別担当残件は継続。

## 追加依頼（元の残件を維持）

- [x] 小UI群: iframe/display scrollbarの共通テーマ伝播、mode toggleの間隔、指定theme表示名、bell feature適用漏れをまとめる
- [x] 状況画面（Web DashboardView/TUI UsageDashboard候補）の親子一覧をagents一覧と同じ表示・子会話選択へ揃える（親usageへ二重加算しない）

状況runtime9c98b169/scrollbar再review13617b22、theme aeea2e39はroot独立reviewで指摘解消済み。正式direct・終了子history・子usageの未完は上の通り保持する。
