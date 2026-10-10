# tasks: codex-multi-pane

- [x] T1 確かめ（AC1）: 手がかり 1〜4 を実物で（research.md）
- [x] T2 `codexSession.ts`（引数・終了の文言・記録の先頭）＋単体
- [x] T3 `TerminalHost.lastSubmitAt`（Enter の書き込みの時刻）
- [x] T4 `AgentMonitor`/`ProcessMatcher`: 前面のプロセスの引数の id を `setFrontAgent` に載せる
- [x] T5 `SessionService`: 常駐の報告の pane の決め方（first-turn / sole-codex）・引数・終了の文言・検算 ★ 点検対象（AC2・AC4。サーバの状態・保存と復元）
- [x] T6 結合テスト（複数 pane・同時・外の Codex・引数・終了の文言・復元）・否定の対照
- [x] T7 docs（`docs/verification.md` の Codex の節）
- [ ] T8 全体の確認（build・typecheck・server の全体・smoke。重い試験は合図の後）
