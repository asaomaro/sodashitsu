# モニター別のブラウザ窓

- [x] 全体取得の共有とローカルclipを区別する設計、入力境界・許可・URL契約（taskcheck必須）。
- [x] strict非secret launch、認証済み専用ページ、明示popup、共有cohortと初期表示。
- [x] canvas/cursor同じviewport、fit/等倍、物理座標clamp、無効layout停止。
- [x] 単体/生成browser、独立taskcheck指摘の修正、全体build/typecheck/test。
- [x] 独立worktree build/smoke・負例のraw出力と復元、独立全体レビュー/修正再点検。
- [ ] PR/main統合とroot既存変更保持、両端build/handoff/receipt。

独立capture/encoder・OS実機のモニター操作試験は本段階で完了扱いにしない。
