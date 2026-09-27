# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/tui/src/settings/SettingsWriter.ts:37-38 prefs.set の失敗（上限超え）で変更を捨てる（D10 は localOnly で残す） / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [should][conv:-] packages/tui/src/settings/keySection.ts:78 キーの衝突の検査に独自コマンドを含めず、独自コマンドがあっても「ありません」と出す / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [should][conv:-] packages/tui/src/settings/sections.ts:623 空の入力が 0 として通り、0x40・1e2 も通る / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [nit][conv:-] packages/tui/src/settings/keySection.ts:283 上書きが無くても「既定に戻す」を出す / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
- [nit][conv:-] packages/tui/src/settings/SettingsWriter.ts:48 tui の節を丸ごと送り、失敗した A が B の要求に乗って保存される / 対応: 修正済（1ca74f6。ラウンド1。負の確認 9 本）
