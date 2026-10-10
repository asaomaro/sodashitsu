# tasks: agent-session-attribution

- [x] T1 要件・調査（AC7 の確かめを含む）
- [x] T2 フックのスクリプトが `agentPid` を足す（AC1）
- [x] T3 サーバの照合・保留・履歴・再開失敗の戻り・猶予の穴（AC1・AC2・AC4・AC5・AC9）★ 点検対象（サーバの状態・保存と復元）
- [x] T4 サブエージェントの報告に同じ確かめ（AC6）
- [x] T5 導入済みフックの「更新が必要」（AC8）
- [x] T6 結合テスト・否定の対照（件 B・daemon・AC6・AC9。直す前と同じ受け方に戻すと落ちる）
- [x] T7 docs（`docs/verification.md` の会話の再開）（AC8）
- [ ] T8 全体の確認（build・typecheck・単体・結合・handoff/stop smoke・起動確認）
