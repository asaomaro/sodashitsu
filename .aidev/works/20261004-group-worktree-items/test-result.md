# テスト結果: サイドバーの項目・グループ・worktree グループ

対象のコミット: b5d8b9d（origin/main の PR #80 までを取り込み、独立レビュー 3 回の指摘を直した後）。Node 24。作業フォルダの外の worktree で流した。

| 項目 | 結果 |
|---|---|
| `pnpm build`・`pnpm typecheck` | 通過 |
| `pnpm test`（全パッケージ） | 405 files・7708 件中 7707 件通過。落ちた 1 件は `composeServer.lineage.integration.test.ts`（実 PTY・偽の claude。この作業が触っていない）で、単独で 2 回流すと 2 回とも 11 件すべて通過（全体を並列で流したときの負荷による揺れ）。1 つ前のコミットでは、実装のセッションの実行で 7707 件すべて通過 |
| `pnpm lint` | 22 errors（`main` と同じ数） |
| E2E `workspace-groups.spec.ts`・`workspace-auto-label.spec.ts` | 33 件すべて通過。1 つ前のコミットでは `subagents.spec.ts` も合わせて 42 件すべて通過 |
| E2E `workspace-tab-pane.spec.ts` | `:305`（pane を作った直後の入力。D99）の 1 件が落ちる。`origin/main` でも 5 回中 5 回落ちるので、この作業の退行ではない（decisions.md D46） |
| `aidev smoke` | pass（10 本） |

## AC との対応

AC ごとの実装とテストの場所は review.md と、独立レビューの被覆の一覧（`review-findings-01.md` を出したレビュー）。AC19（追補 A: ＋新規が worktree グループに入らない）は、「グループなし」を上に並べ替えた形・linked worktree が 2 つ以上の形を含めて、モデル・画面とサーバの一致・E2E の 3 層で見ている。

## 自動で確かめていないこと（実機。`docs/verification.md`）

- Windows ネイティブでの `repoKey`・`worktreeKey` の形。
- git 2.31 未満の実物（偽の出力の単体テストで見ている）。
- 8 つのテーマでの見え方（B3）・端末版の記号の幅（T4）。
- 再起動をまたぐ「次の代表」は、代表が閉じたときに作った順で決まる（持ち始めた順はメモリだけ。D42）。
