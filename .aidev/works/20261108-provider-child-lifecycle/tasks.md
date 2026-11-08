# Tasks

- [x] 全起動/連携kindと既存7kind取得経路の突合
- [ ] Claudeの中断/完了から同ID再開する順序proofの確定（無証明なら制約を固定）
- [x] Muse terminal child binding再開境界の確定
- [x] Copilot/Grok/AGY/Cursorの正式再開・失効境界を既存/必要生成回帰で確認
- [ ] 確定bugのみ最小別commit/旧source負例/byte exact復元/必要型
- [ ] 独立差分review（root/backend）

壊れやすいtaskcheck対象: hook順序・新proof・provider fold/observer・scope失効。文書だけの変更は最終crossへまとめる。既存Cursor(b)sourceは別tree固定、変更しない。

Muse2fixはruntime eb1d44ac/04b4050bへ分割。2旧source各1fail→byteExact復元→8suites192PASS/対象strict型0。test-result.md参照。独立review最終証跡照合を依頼、Claude順序proofは未完のまま。

Claude順序proofの限定調査はaudit.mdへ結論を固定。全例外のrun順序を正式に証明できず、既存60秒内resumeの未解決制約として保持する。監査完了と製品制約解消を混同しない。根拠の無いflag/time/progress本文によるguard解除は実装しない。
