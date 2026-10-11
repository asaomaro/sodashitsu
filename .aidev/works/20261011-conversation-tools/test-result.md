# 検証記録

## 完了した確認

- pnpm build、pnpm typecheck: 通過。
- 会話窓・過去一覧・プラグインCLI/モバイル専用面、ask-formモバイル、設定メニューのE2E: 28件通過。残った2件（設定テストの端末フォーカス位置、canvas描画時のfont検査対象）を直して個別実行2件通過。製品修正後にアイコンE2E再実行1件通過。
- モバイル保存復元: SessionServiceの既存perspective保存復元テストにmobileDisplayを追加して通過。
- Webフォント関連: 38件通過。TUIはBMP/補助領域のNerd Font文字をpane解析→grid→差分出力→外側端末まで維持する検証1件通過。
- ConversationService: Codexのresume前のリンク拒否含む4件通過。
- 作業フォルダ外のdetached worktreeをcwdとして、今回のビルド済みsmoke.jsを実行: smoke: PASS。worktreeは終了後に削除。
- skill-creator quick_validate.py: sodactl skill valid。
- git diff --check: 通過。

## 全体テスト最終結果

`pnpm exec vitest run --maxWorkers=4`: 10,481件成功、1件はsuite初期化時のビルド鮮度検査で停止（整形がbuildの後に行われたConversationService/SummaryService）。577ファイル中576ファイル成功。再ビルド後に `soda.pty.integration.test.ts` だけを再実行し1件成功（本物のPTYで起動・描画・入力・終了・復元を確認）。全体の再実行は重複を避け、該当テストのみ検証した。計10,482件を確認。

最終独立レビュー通過、`pnpm build` 再実行通過、`git diff --check` 通過。利用者既存のTabViews.vue/TabViews.test.ts/.claudeは保持。コミット・PR・マージは未実施。

## 初回失敗の整理

設定画面の節追加で既存の節数/キーの位置の期待値が古くなったため更新。TUIでは既存節の位置を維持するため新しい節を末尾に追加。paneInfoの既定ヘッダーボタンの期待値を能力表に合わせる。並列全体実行時のExtensionProcess.real.test CPU比率テストは単独で7件通過。

## 回帰テストの負の対照（生の出力）

修正箇所だけを戻して失敗を確認し、ファイル内容をバイト単位で復元確認した。フォントE2Eは修正を外した状態で再ビルドして実行し、復元後にも再ビルド・E2E通過を確認。

### negative-notice-merge.log

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/web

 ❯ src/notify/NotificationController.test.ts (108 tests | 1 failed | 107 skipped) 17ms
   ❯ shared notification state (2)
     × never revives resolved notifications from an older deferred response 15ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/notify/NotificationController.test.ts > shared notification state > never revives resolved notifications from an older deferred response
AssertionError: expected [ { key: 'done:a1:1', …(7) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/notify/NotificationController.test.ts:1634:48
    1632|   h.c.onSharedNotification({notices:[{key,paneId:"p1",status:"resolved…
    1633|   h.c.onSharedNotification({notices:[{key,paneId:"p1",status:"deferred…
    1634|   expect(useNotificationsStore(pinia).history).toHaveLength(0);expect(…
       |                                                ^
    1635|  });
    1636|  it("rechecks shared decisions after nextTick and cancels old-machine …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 107 skipped (108)
   Start at  19:48:00
   Duration  1.21s (transform 69%, import 16%, environment 13%, tests 1%)

undefined
/workspaces/sodashitsu/packages/web:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/notify/NotificationController.test.ts -t never revives resolved

```

### negative-machine-delivery.log

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/tui

 ❯ src/notify/notify.test.ts (14 tests | 1 failed | 13 skipped) 8ms
   ❯ NotificationController（web と同じ判定） (8)
     × マシンを切り替えると予約済みの完了配送を無効化する 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/notify/notify.test.ts > NotificationController（web と同じ判定） > マシンを切り替えると予約済みの完了配送を無効化する
AssertionError: expected [ { key: 'done:a3:1', …(5) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/notify/notify.test.ts:197:127
    195|   });
    196|   it("マシンを切り替えると予約済みの完了配送を無効化する",async()=>{
    197|     const s=setup();s.change("p3",{state:"idle",completionSeq:1});s.n.…
       |                                                                                                                               ^
    198|   });
    199|   it("作業再開済みの先送り完了通知は復元しない",()=>{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  19:48:01
   Duration  1.38s (transform 82%, import 17%, tests 1%)

undefined
/workspaces/sodashitsu/packages/tui:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/notify/notify.test.ts -t マシンを切り替えると予約済み

```

### negative-codex-link.log

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/server

 ❯ src/conversation/ConversationService.test.ts (4 tests | 1 failed | 3 skipped) 18ms
   × refuses a linked Codex record before returning its path for resume 17ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/conversation/ConversationService.test.ts > refuses a linked Codex record before returning its path for resume
AssertionError: promise resolved "'/tmp/soda-conversation-test-nbQfRH/pr…'" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
"/tmp/soda-conversation-test-nbQfRH/projects/codex/sessions/2026/10/11/rollout-2026-10-11T00-00-00-11111111-1111-4111-8111-111111111111.jsonl"

 ❯ src/conversation/ConversationService.test.ts:87:44
     85|   await symlink(f.file, join(records, `rollout-2026-10-11T00-00-00-${i…
     86|   const service = new ConversationService(() => undefined, { codexHome…
     87|   await expect(service.locate("codex", id)).rejects.toThrow();
       |                                            ^
     88| });
     89|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  20:14:44
   Duration  509ms (transform 74%, import 21%, tests 4%, worker 1%)

undefined
/workspaces/sodashitsu/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/conversation/ConversationService.test.ts -t refuses a linked Codex

```

### negative-font-glyphs.log

```text

Running 1 test using 1 worker

(node:1374785) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-11T11:16:56.677Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-11T11:16:56.678Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-eV7ugG/commands.json","count":0}
  ✘  1 src/specs/terminal-fonts.spec.ts:3:1 › browser terminal loads bundled Nerd Font icons without changing ordinary text (1.4s)


  1) src/specs/terminal-fonts.spec.ts:3:1 › browser terminal loads bundled Nerd Font icons without changing ordinary text

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      23 |     };
      24 |   });
    > 25 |   expect(result.loaded).toBe(true);
         |                         ^
      26 |   expect(result.iconDifferences).toEqual([true, true, true, true, true]);
      27 |   expect(result.ordinaryUnchanged).toBe(true);
      28 | });
        at /workspaces/sodashitsu/packages/e2e/src/specs/terminal-fonts.spec.ts:25:25

    Error Context: test-results/terminal-fonts-browser-ter-6db8c-hout-changing-ordinary-text/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/terminal-fonts-browser-ter-6db8c-hout-changing-ordinary-text/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/terminal-fonts-browser-ter-6db8c-hout-changing-ordinary-text/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/terminal-fonts.spec.ts:3:1 › browser terminal loads bundled Nerd Font icons without changing ordinary text
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test terminal-fonts.spec.ts

```
