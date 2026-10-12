# 検証記録

標準ファイル/Gitビューとワークスペース選択履歴。build/typecheck通過。ブラウザE2Eは標準開発画面・追加先固定・ワークスペース往復の3件通過（/tmp/workspace-history-e2e.log）。

独立レビューは backend/履歴: review_summary_cache、Web/TUI: review_history_usage。指摘修正の再レビュー通過。

## 回帰テストの否定対照

literal pathspecを除く、未保存変更のガードを除く、古い差分応答の破棄を除く各ケースで対応テストが失敗。各ファイルは保存した元bytesへ復元し一致を確認。Gitの最初のテストは--relativeでも範囲を制限できたため失敗せず、特殊pathspec自体が解釈されない条件へ変更した。以下は変更後の生出力。

### git

```text
 FAIL  |@sodashitsu/server| src/workspace/WorkspaceTools.test.ts > Git graph and staged/working/commit diffs stay within a subfolder PJ
AssertionError: promise resolved "{ text: 'diff --git a/inner.txt b/in…' }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "text": "diff --git a/inner.txt b/inner.txt
+ index f05648e..765321a 100644
+ --- a/inner.txt
+ +++ b/inner.txt
+ @@ -1 +1 @@
+ -inner
+ +inner changed
+ ",
  }

 ❯ src/workspace/WorkspaceTools.test.ts:95:53
     93|   expect(status.files).toEqual([{ path: "inner.txt", status: " M" }]);
     94|   expect((await run("git-log")).text).toContain(commit);
     95|   await expect(run("git-diff", { path: ":(top)*" })).rejects.toThrow();
       |                                                     ^
     96|   const diff = await run("git-diff");
     97|   expect(diff.text).toContain("+inner changed");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### dirty

```text
 FAIL  |@sodashitsu/tui| src/modes/WorkspaceDialog.test.ts > terminal window browses a file, preserves newlines while editing and sends versioned save
AssertionError: expected [ [ 'workspace.tools', …(1) ], …(1) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/modes/WorkspaceDialog.test.ts:47:72
     45|   dialog.handlePaste("other");
     46|   dialog.handleKey(chordToKeyInput("Enter")!);
     47|   expect(request.mock.calls.filter(([, p]) => p.operation === "read"))…
       |                                                                        ^
     48|   dialog.handleKey(chordToKeyInput("Ctrl+s")!);
     49|   await tick();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### diff

```text
 FAIL  |@sodashitsu/web| src/components/WorkspaceView.test.ts > keeps the newest Git diff when old responses arrive after a staged selection
AssertionError: expected 'old working diff' to contain 'new staged diff'

Expected: "new staged diff"
Received: "old working diff"

 ❯ src/components/WorkspaceView.test.ts:30:43
     28|   responses[0]!({ text: "old working diff" });
     29|   await flushPromises();
     30|   expect(w.get(".workspace-code").text()).toContain("new staged diff");
       |                                           ^
     31|   expect(w.get(".workspace-code").text()).not.toContain("old working d…
     32|   w.unmount();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## ワークスペース選択履歴の否定対照

ViewHistory.rememberの2つの保存を除くと単体テストが失敗。復元後bytes一致を確認。Web/TUI storeのテストはビルド済client-coreを参照するため、この否定対照は直接importする単体テストで判定。

```text
 FAIL  |@sodashitsu/client-core| src/view/ViewHistory.test.ts > remembers local tab and pane per workspace, ignoring shared focus and rejecting removed/moved targets
AssertionError: expected 'a1' to be 'a2' // Object.is equality

Expected: "a2"
Received: "a1"

 ❯ src/view/ViewHistory.test.ts:25:37
     23|   history.remember("a", "a2", "p3", session);
     24|   history.remember("b", "b1", "p4", session);
     25|   expect(history.tab("a", session)).toBe("a2");
       |                                     ^
     26|   expect(history.pane("a2", session)).toBe("p3");
     27|   session.panes.delete("p3");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## 狭いTUIペイン名の退行を検出

追加ボタン導入時の失敗を既存T7画面テストで検出。agent操作の収納に余白を確保した後、同じテストが通過。失敗時の生出力:

```text
 FAIL  |@sodashitsu/tui| src/app/t7.test.ts > T7 の画面 > H23：枠の名前は paneAgentNameVisible が入のときだけエージェント名
AssertionError: expected ' ▾ Spaces     開いた順   │┌─ ○ Cl… [i][+]…' to contain 'Claude'

Expected: "Claude"
Received: " ▾ Spaces     開いた順   │┌─ ○ Cl… [i][+][↘][%][✓][│][─][□][×]┐┌─ pane p2 ──────────[+][│][─][□][×]┐"

 ❯ src/app/t7.test.ts:331:17
    329|     h.app.renderNow();
    330|     top = (await h.screen()).split("\n")[1]!;
    331|     expect(top).toContain("Claude");
       |                 ^
    332|   });
    333|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


```

## 最終結果

- pnpm build: 通過（/tmp/workspace-tools-build-final.log）
- pnpm typecheck: 通過（/tmp/workspace-tools-types-final.log）
- 全体: 594ファイル、10,538テスト全件通過。実PTY起動テストも含む（/tmp/workspace-tools-all.log）。
- E2E: 標準開発/検索/Grep行へスクロール/編集/Git/モバイル幅、追加先固定、別クライアントfocus変更を挟むワークスペース往復の3件通過（/tmp/workspace-history-e2e.log）。
- 独立レビューと修正差分の再レビュー通過。
