# 決定の記録: エージェントの fork

`requirements.md`・`design.md`（追補 01）の上に積む決定。依頼者は追補を書かないので、ここに記録する。

## T0 の事実（2026-10-10。Claude Code 2.1.296。詳細は `research.md` の末尾）

- 対話中の実セッションを、別の端末から `--resume <id> --fork-session` で fork できる（元は止まらず、新しい id で、会話を覚えている）。
- 普通の新しいフォルダでは信頼の確認が出る。元のリポジトリの worktree では出なかった（元が信頼済みのとき）。A8（確認で止まったら、手が空くまで知らせを送らない）は必要なまま。
- `/clear` は新しい id・`source: "clear"`。fork は新しい id・`source: "fork"`。`/compact` は**同じ id**・`source: "compact"`。
- 導入するフックの matcher `startup|resume` は、`fork`・`clear`・`compact` を拾わない。**「fork した側の `agentSession` は自動で正しくなる」という設計の前提は、matcher を直さないと成り立たない。**

## T0b の決定（依頼者の判断。2026-10-10）

| # | 事項 | 決定 |
| :- | :- | :- |
| B1 | matcher | Claude Code の `SessionStart` の matcher を `startup|resume|fork|clear|compact` にする（`AgentIntegrationInstaller` の `CLAUDE_SESSION_START_MATCHER`）。Codex の matcher は変えない（実機で確かめていない）。**空の matcher にはしない**（知らない `source` を黙って拾わないため） |
| B2 | 理由 | `/clear` の後に古い id のまま、は、fork だけでなく、いまの「再起動の後の再開」でも、消した会話を再開してしまう、もともとの不具合。直す価値がある |
| B3 | `compact` | id が変わらない（同じ id の再報告）。害が無いので入れる |
| B4 | 導入済みの利用者 | `status` が「更新が必要」を出し、［更新］で matcher だけ直る（利用者のほかのフックは保つ）。入れ直すまでは、孫の fork・fork の後の再開・`/clear` の後の正しい再開は、効かない（文書に書く） |
| B5 | 受け口 | フックのスクリプト・受け口は変えない（matcher が拾う `source` だけが届く）。知らない `source` の報告は、matcher の段階で来ない。PR6a（サブエージェントの別の worktree）がスクリプトとその版を触るので、衝突したら両方を残す |
| B6 | テスト | インストーラ（新規の matcher・matcher だけ古い導入済みの更新）と、結合テスト `composeServer.hookSource.integration.test.ts`（実物のインストーラが書いた設定の matcher を通して、実物のフックのスクリプトで報告 → `clear`・`fork` で会話の id が替わる）。否定の対照: matcher を `startup|resume` に戻すと、結合テストが落ちる（確認済み） |
