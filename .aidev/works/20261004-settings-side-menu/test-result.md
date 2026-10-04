# テスト結果: 設定画面にサイドメニュー（節の一覧）を付ける

対象のコミット: db9f09a（origin/main の PR #78 までを取り込んだ後）。Node 24。

| 項目 | 結果 |
|---|---|
| `pnpm build`・`pnpm typecheck` | 通過 |
| `pnpm test`（全パッケージ） | 390 files・7080 件すべて通過 |
| `pnpm lint` | 22 errors（`main` と同じ数。この作業で増えていない） |
| E2E `settings-menu.spec.ts`（新規 23 件） | 2 回続けて全件通過 |
| E2E 設定を開く 8 つの spec ＋ `settings-menu.spec.ts` | 12 件失敗。変更前の記録（decisions.md D5）の「別の原因」の 12 件と同じ。変更前は 15 件で、減った 3 件は「5 節」の期待を直した分（D9） |
| `aidev smoke`（作業フォルダの外の worktree） | pass（10 本） |

## AC との対応

AC1〜AC8・AC11・AC-I1〜I5 は `settings-menu.spec.ts` と `SettingsDialog.test.ts`・`sectionSpy.test.ts`、AC9 は既存の E2E の比較（D5・D9）と「5 節」の期待の修正、AC10 は `docs/verification.md`。AC ごとの実装とテストの場所は review.md。

## 自動で確かめていないこと（実機。`docs/verification.md`）

- Firefox・Safari での固定（sticky）と、`<select>` にフォーカスがあるときの `Alt+PageDown`。
- 明暗のテーマでの見え方・タッチ・ブラウザの拡大・読み上げ・文字を大きくしたときの本文の列。
- `Alt+PageDown` を端末の操作に割り当てた状態でのキーの漏れ（仕組みは `main.ts` の `modalOpen` の判定で確かめた。E2E は無い）。
