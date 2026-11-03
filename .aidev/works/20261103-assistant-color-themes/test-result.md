# 隔離サーバE2E（未通過）

テーマ選択前の初期端末待ち。既存キーテーマテスト・新テーマテストともに同じ箇所で停止。2回で切り分けを止める。

```text

Running 2 tests using 1 worker

(node:90570) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-11-03T06:29:02.954Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-03T06:29:02.956Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-03T06:29:02.957Z","level":"info","msg":"agent manifest extended","kind":"muse","path":"muse-extra.toml","added":1}
{"ts":"2026-11-03T06:29:02.957Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-03T06:29:02.960Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-YCGp0s/commands.json","count":0}
  ✘  1 src/specs/theme-settings.spec.ts:197:1 › キーだけでテーマを選ぶと、画面の枠と開いている全ての端末の色がその場で替わる。自動の切替もキーで入れられ、閉じると端末へ戻り、選び直せば元に戻る（AC1・AC2・AC5・AC7・AC10・AC-I1〜AC-I4） (2.0m)
(node:94624) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-11-03T06:31:09.009Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-11-03T06:31:09.011Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-11-03T06:31:09.012Z","level":"info","msg":"agent manifest extended","kind":"muse","path":"muse-extra.toml","added":1}
{"ts":"2026-11-03T06:31:09.012Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-11-03T06:31:09.015Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-IScg9g/commands.json","count":0}
  ✘  2 src/specs/theme-settings.spec.ts:615:1 › 操舵室アシスタントの通常版とダーク版を選択し、保存とOSの明暗に追従する (1.0m)


  1) src/specs/theme-settings.spec.ts:197:1 › キーだけでテーマを選ぶと、画面の枠と開いている全ての端末の色がその場で替わる。自動の切替もキーで入れられ、閉じると端末へ戻り、選び直せば元に戻る（AC1・AC2・AC5・AC7・AC10・AC-I1〜AC-I4）

    Test timeout of 90000ms exceeded.

    TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
    Call log:
      - waiting for locator('.xterm-helper-textarea') to be visible


      93 |
      94 | async function waitForTerminal(page: Page, shown: () => string[]): Promise<void> {
    > 95 |   await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
         |              ^
      96 |   await expect.poll(shown, { timeout: 10_000 }).not.toEqual([]);
      97 | }
      98 |
        at waitForTerminal (/workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/theme-settings.spec.ts:95:14)
        at openBrowser (/workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/theme-settings.spec.ts:90:9)
        at /workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/theme-settings.spec.ts:203:13

    Error Context: test-results/theme-settings-キーだけでテーマを選ぶ-2f84f-2・AC5・AC7・AC10・AC-I1〜AC-I4）/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/theme-settings-キーだけでテーマを選ぶ-2f84f-2・AC5・AC7・AC10・AC-I1〜AC-I4）/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/theme-settings-キーだけでテーマを選ぶ-2f84f-2・AC5・AC7・AC10・AC-I1〜AC-I4）/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2) src/specs/theme-settings.spec.ts:615:1 › 操舵室アシスタントの通常版とダーク版を選択し、保存とOSの明暗に追従する ─────────────────

    Test timeout of 30000ms exceeded.

    Tearing down "appServer" exceeded the test timeout of 30000ms.

    TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
    Call log:
      - waiting for locator('.xterm-helper-textarea') to be visible


      93 |
      94 | async function waitForTerminal(page: Page, shown: () => string[]): Promise<void> {
    > 95 |   await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
         |              ^
      96 |   await expect.poll(shown, { timeout: 10_000 }).not.toEqual([]);
      97 | }
      98 |
        at waitForTerminal (/workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/theme-settings.spec.ts:95:14)
        at openBrowser (/workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/theme-settings.spec.ts:90:9)
        at /workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/src/specs/theme-settings.spec.ts:616:11

    Error Context: test-results/theme-settings-操舵室アシスタントの通常版とダーク版を選択し、保存とOSの明暗に追従する/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/theme-settings-操舵室アシスタントの通常版とダーク版を選択し、保存とOSの明暗に追従する/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/theme-settings-操舵室アシスタントの通常版とダーク版を選択し、保存とOSの明暗に追従する/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2 failed
    src/specs/theme-settings.spec.ts:197:1 › キーだけでテーマを選ぶと、画面の枠と開いている全ての端末の色がその場で替わる。自動の切替もキーで入れられ、閉じると端末へ戻り、選び直せば元に戻る（AC1・AC2・AC5・AC7・AC10・AC-I1〜AC-I4）
    src/specs/theme-settings.spec.ts:615:1 › 操舵室アシスタントの通常版とダーク版を選択し、保存とOSの明暗に追従する ──────────────────
undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test src/specs/theme-settings.spec.ts --grep 操舵室アシスタント|キーだけでテーマ

```
