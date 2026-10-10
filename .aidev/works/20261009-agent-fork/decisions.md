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

## レビュー指摘の直し（2026-10-10。結果は `/workspaces/sodashitsu/.claude/briefs/agent-fork-fix-result.md`）

| # | 事項 | 決定 |
| :- | :- | :- |
| C1 | R1（#122 の猶予で残った古い会話 id が、フックの報告をしない別のエージェントに引き継がれる） | **直さない**。`SessionService` の側で別の作業 `fix/agent-session-attribution` が直すため、ここで触ると衝突する。fork 側の防御（報告の `instanceId` を持たせる）も入れていない。その作業が入るまで、この穴は残る。 |
| C2 | R2（手が空いたの判定が、確認の描かれる前の idle に頼る） | 知らせを送る前に、**入力欄が出ている証拠**を求める（`promptReady`）: 画面の末尾に `❯` の行があり、`esc to cancel`・`enter to confirm` が無い、**または**元と違う会話の id が報告された（フックは確認の後に走る）。settle（800 ms）は据え置き。証拠が出ないまま上限（10 分）になれば `timed_out`。否定の対照: 証拠の判定を外すと、結合テスト（確認が 6 秒後に描かれる版）が落ちる（確認済み）。 |
| C3 | R3（`follow` で場所を引き継げなかったときの死んだ分岐） | 死んだ `cwdFallback` の分岐を、「新しい pane の場所が、元の pane の場所と違えば止める（閉じる）」に替える。 |
| C4 | R4（abort 済みの signal） | `waitForAgent` は、中断済みなら即 `aborted`。`fork()` は、閉じた後は `fork_failed` で断る。 |
| C5 | R5（親の環境変数） | 文書の「安全と限界」に 1 項目を足し、`No conversation found` の理由の文面に `CLAUDE_CODE_*` を一言入れた。コードでの検出はしていない（文面だけ）。 |
| C6 | R6 シェルの入力待ち | 上限を 5 秒 → 15 秒（rc の重いシェルのため）。最低 2 秒（出力が無いとき）は据え置き。待つ間に pane が閉じられたら `fork_failed`（シェルの上限と取り違えない）。 |
| C7 | R6 知らせのパス | バッククォートと、双方向の制御・ゼロ幅・BOM を断る（囲みを崩す／見た目だけ入れ替える）。 |
| C8 | R6 全体の締め切り | 「手が空く」の再確認の繰り返しも含めて、待ちの上限は手順全体で 1 つ（noteWaitMs または readyWaitMs）。 |
| C9 | R6 matcher | 期待の値を**含む** matcher（`""` を含む）は「更新が必要」にしない。**利用者のフックと同じエントリの自分のフックは、［更新］でも直さない**（同じエントリの matcher を変えると、利用者のフックの動きが変わるため。手で分けるよう文書に書く）。 |
| C10 | R6 会話の id の読み直し | 起動の直前に、元の pane の会話の id を読み直す。替わっていれば新しい id で起動、無くなっていれば止める（`SOURCE_AGENT_CHANGED`）。 |
| C11 | テストの足し方 | 偽の `claude` に「入力欄なしの読み込みの画面 → 6 秒後に確認 → 答えたら報告」を足した（`late-block-*`）。入力欄の行は、通常の idle の画面にも入れた（本物の idle と同じ信号）。 |
