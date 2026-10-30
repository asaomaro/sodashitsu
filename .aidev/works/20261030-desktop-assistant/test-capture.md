# D4 explicit display/window still capture

Native source enumeration requests thumbnailSize0 and fetchWindowIcons=false. No pixels reach the preview until an explicit source approval. One owner/token/source30s lease grants the current visible bubble main frame a single video-only display request with active user gesture; microphone/camera permissions remain separate. The selected source is consumed once. Renderer gets one frame, bounds/encodes PNG, stops tracks before submission and uses OCR preview/crop/confirmation. Cancelled late streams and bitmaps are released; native hide/expiry destroys the active capture window even if its renderer cannot respond.

104 native tests PASS; native build/typecheck PASS;400x640 generated UI PASS. Screen/OS permissions/real Canvas behavior remain real-device verification. This WSL headless browser synchronously stalled in the real Canvas encode probe and exited124 at the30s watchdog. Removed temporary console diagnostics and used explicit fake ImageCapture/canvas boundaries returning a known generated PNG for the UI test. This proves UI flow, not real capture/Canvas. No actual screen/media/clipboard/model was accessed.

Independent taskcheck and whole source review: no must/should. Three valid negative controls below failed owner/deadline assertions and the UI stop-before-submit check; original source bytes restored and positive tests rerun. Whole full-source integration checks follow remaining phases.

## soda-assistant-capture-negative-expiry

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/captureLease.test.ts (2 tests | 1 failed | 1 skipped) 6ms
   × grants only one selected source to its owner once and expires absolutely 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/captureLease.test.ts > grants only one selected source to its owner once and expires absolutely
AssertionError: expected [Function] to throw an error
 ❯ src/captureLease.test.ts:6:302


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  14:53:23
   Duration  140ms (transform 70%, import 17%, tests 9%, worker 4%)
```

## soda-assistant-capture-negative-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/captureLease.test.ts (2 tests | 1 failed | 1 skipped) 5ms
   × grants only one selected source to its owner once and expires absolutely 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/captureLease.test.ts > grants only one selected source to its owner once and expires absolutely
AssertionError: expected [Function] to throw an error
 ❯ src/captureLease.test.ts:6:124


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  14:53:23
   Duration  123ms (transform 61%, import 22%, tests 11%, worker 6%)
```

## soda-assistant-capture-negative-stop-before-submit

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-desktop-assistant-completion/packages/desktop-assistant
> node scripts/verify-ui.mjs

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(locator).toContainText(expected) failed

Locator: locator('#capture-status')
Expected substring: "画面を取得しました"
Received string:    "capture must stop before submission"
Timeout: 5000ms

Call log:
  - Expect "toContainText" locator('#capture-status') with timeout 5000ms
  - waiting for locator('#capture-status')
    14 × locator resolved to <p role="status" id="capture-status">capture must stop before submission</p>
       - unexpected value "capture must stop before submission"

    at captureRawStack (/workspaces/sodashitsu-desktop-assistant-completion/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-desktop-assistant-completion/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toContainText (/workspaces/sodashitsu-desktop-assistant-completion/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-desktop-assistant-completion/packages/desktop-assistant/scripts/verify-ui.mjs:353:49 {
  matcherResult: {
    name: 'toContainText',
    expected: '画面を取得しました',
    message: 'expect(locator).toContainText(expected) failed\n' +
      '\n' +
      "Locator: locator('#capture-status')\n" +
      'Expected substring: "画面を取得しました"\n' +
      'Received string:    "capture must stop before submission"\n' +
      'Timeout: 5000ms\n' +
      '\n' +
      'Call log:\n' +
      `  - Expect "toContainText" locator('#capture-status') with timeout 5000ms\n` +
      "  - waiting for locator('#capture-status')\n" +
      '    14 × locator resolved to <p role="status" id="capture-status">capture must stop before submission</p>\n' +
      '       - unexpected value "capture must stop before submission"\n',
    pass: false,
    actual: 'capture must stop before submission',
    log: [
      `  - Expect "toContainText" locator('#capture-status') with timeout 5000ms`,
      "  - waiting for locator('#capture-status')",
      '    14 × locator resolved to <p role="status" id="capture-status">capture must stop before submission</p>',
      '       - unexpected value "capture must stop before submission"'
    ],
    timeout: 5000,
    ariaSnapshot: '- status: capture must stop before submission'
  }
}

Node.js v24.15.0
/workspaces/sodashitsu-desktop-assistant-completion/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1
```
