# Negative control

各修正を一時的に戻して対応する確認が失敗することを検証し、毎回byte-identicalに復元。テストはsource CSS/TSを使い、ビルド済み成果物を変更しない。

## native-frame

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (45 tests | 1 failed | 44 skipped) 1018ms
   × limits native window controls to their own settings/tools main frame 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > limits native window controls to their own settings/tools main frame
AssertionError: expected { width: 520, height: 670, …(13) } to match object { frame: false, resizable: true, …(3) }
(16 matching properties omitted from actual)

- Expected
+ Received

  {
-   "frame": false,
+   "frame": true,
    "minHeight": 360,
    "minWidth": 360,
    "resizable": true,
    "show": true,
  }

 ❯ src/main.test.ts:1629:27
    1627|  const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("…
    1628|  const event={sender:settings.webContents,senderFrame:settings.webCont…
    1629|  expect(settings.options).toMatchObject({frame:false,resizable:true,sh…
       |                           ^
    1630|  const action=fixture.handlers.get("assistant:window-action")!;
    1631|  await action(event,"maximize");expect(settings.isMaximized()).toBe(tr…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 44 skipped (45)
   Start at  11:48:51
   Duration  1.27s (tests 87%, transform 11%, import 2%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/main.test.ts -t limits native window controls

```

復元: byte-identical。

## internal-scroll-style

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: settings has no page scrollbar
    at checkWindow (file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:244:14)
    at async file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:256:3 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.15.0
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1

```

復元: byte-identical。
