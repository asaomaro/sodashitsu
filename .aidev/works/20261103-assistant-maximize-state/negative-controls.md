# Negative controls

各修正だけを戻し、対応する回帰確認が失敗することを検証。各回でbyte-identicalに復元。ソースを使う確認のみ。

## maximized-drag-state

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (48 tests | 1 failed | 47 skipped) 1102ms
   × restores every maximized assistant window on drag, updates its icon state, and allows immediate resizing 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > restores every maximized assistant window on drag, updates its icon state, and allows immediate resizing
AssertionError: expected { x: 100, y: 80, width: 1920, …(1) } to match object { width: 500, height: 500 }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "height": 500,
-   "width": 500,
+   "height": 1040,
+   "width": 1920,
  }

 ❯ src/main.test.ts:1698:27
    1696|   await expect(resize(local,{phase:"start",handle:"se"})).rejects.toTh…
    1697|   cursor.mockReturnValue({x:600,y:100});const maximum=win.getBounds();…
    1698|   expect(win.getBounds()).toMatchObject({width:500,height:500});
       |                           ^
    1699|   expect(win.webContents.send).toHaveBeenCalledWith("assistant:window-…
    1700|   expect(await state(local)).toMatchObject({maximized:false});

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 47 skipped (48)
   Start at  12:35:15
   Duration  1.36s (tests 87%, transform 11%, import 2%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/main.test.ts -t restores every maximized assistant window

```

復元: byte-identical。

## maximize-restore-icons

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path')
Expected: 2
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path') with timeout 5000ms
  - waiting for getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path')
    14 × locator resolved to 0 elements
       - unexpected value "0"

    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toHaveCount (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at checkWindow (/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:256:112)
    at async file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:269:3 {
  matcherResult: {
    actual: 0,
    expected: 2,
    message: 'expect(locator).toHaveCount(expected) failed\n' +
      '\n' +
      "Locator:  getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path')\n" +
      'Expected: 2\n' +
      'Received: 0\n' +
      'Timeout:  5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toHaveCount" getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path') with timeout 5000ms\n` +
      "  - waiting for getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path')\n" +
      '    14 × locator resolved to 0 elements\n' +
      '       - unexpected value "0"\n',
    name: 'toHaveCount',
    pass: false,
    log: [
      `  - Expect "toHaveCount" getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path') with timeout 5000ms`,
      "  - waiting for getByRole('button', { name: '元のサイズに戻す', exact: true }).locator('svg path')",
      '    14 × locator resolved to 0 elements',
      '       - unexpected value "0"'
    ],
    timeout: 5000,
    ariaSnapshot: undefined
  }
}

Node.js v24.15.0
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1

```

復元: byte-identical。
