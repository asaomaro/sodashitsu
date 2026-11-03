# Negative controls

修正部分を個別に戻して失敗を確認し、各回でSHA256一致によりバイト列を復元。ソースを使用するテストのみ。

## outside-background

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected

+ 'rgb(23, 36, 56)'
- 'rgba(0, 0, 0, 0)'
      ^

    at checkWindow (file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:246:68)
    at async file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:258:3 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: 'rgb(23, 36, 56)',
  expected: 'rgba(0, 0, 0, 0)',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1

```

復元: byte-identical。

## restore-disconnected-display

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (47 tests | 1 failed | 46 skipped) 1182ms
   × revokes transparent-window resize gestures and restores removed-display windows inside the current display 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > revokes transparent-window resize gestures and restores removed-display windows inside the current display
AssertionError: expected 2700 to be less than or equal to 1920
 ❯ src/main.test.ts:1670:89
    1668|  settings.setBounds({x:2100,y:100,width:600,height:600});await fixture…
    1669|  displays.mockReturnValue([{id:1,workArea:{x:0,y:0,width:1920,height:1…
    1670|  const b=settings.getBounds();expect(b.x).toBeGreaterThanOrEqual(0);ex…
       |                                                                                         ^
    1671| });
    1672| it("isolates the compact panel shell from remote contents and closes c…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 46 skipped (47)
   Start at  12:18:58
   Duration  1.43s (tests 89%, transform 9%, import 2%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/main.test.ts -t revokes transparent-window resize

```

復元: byte-identical。

## disposed-view-reference

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (47 tests | 1 failed | 46 skipped) 1419ms
   × isolates the compact panel shell from remote contents and closes child renderers 32ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > isolates the compact panel shell from remote contents and closes child renderers
TypeError: Cannot read properties of undefined (reading 'isDestroyed')
 ❯ MockWindow.<anonymous> src/main.ts:824:26
    822|   win.on("closed", () => {
    823|     localWindows.delete(shellId);panelViews.delete(win);
    824|     if(!view.webContents.isDestroyed())view.webContents.close();
       |                          ^
    825|     if (panel === win) panel = null;
    826|     if (responsePanel === win) responsePanel = null;
 ❯ MockWindow.destroy src/main.test.ts:94:10
 ❯ MockWindow.close src/main.test.ts:87:16
 ❯ src/main.test.ts:1681:8

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 46 skipped (47)
   Start at  12:19:00
   Duration  1.74s (tests 89%, transform 9%, import 2%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/main.test.ts -t isolates the compact panel shell

```

復元: byte-identical。
