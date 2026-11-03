# Negative controls

修正を個別に戻して回帰確認が失敗することを検証し、各回でバイト列のSHA256一致を確認して復元。直接ソースを使用するブラウザ確認。

## nested-notification-scroll

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: single content scroll 400x640
+ actual - expected

  {
    conversationDoesNotScroll: true,
    fits: true,
    frameFits: true,
+   nested: [
+     'notices'
+   ],
-   nested: [],
    outerScrolls: true
  }

    at file:///workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:772:12 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: {
    fits: true,
    frameFits: true,
    outerScrolls: true,
    nested: [ 'notices' ],
    conversationDoesNotScroll: true
  },
  expected: {
    fits: true,
    frameFits: true,
    outerScrolls: true,
    nested: [],
    conversationDoesNotScroll: true
  },
  operator: 'deepStrictEqual',
  diff: 'simple'
}

Node.js v24.15.0
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1

```

復元: byte-identical。

## textarea-full-height

```text

> @sodashitsu/desktop-assistant@0.1.0 verify:ui /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant
> node scripts/verify-ui.mjs

PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

ExpectError: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
    at captureRawStack (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js:8588:17)
    at callMatcherAsStep (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13310:57)
    at Object.toBe (/workspaces/sodashitsu-main-live-assistant-agents/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/matchers/expect.js:13302:23)
    at /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant/scripts/verify-ui.mjs:694:102 {
  matcherResult: {
    pass: false,
    message: 'expect(received).toBe(expected) // Object.is equality\n' +
      '\n' +
      'Expected: true\n' +
      'Received: false\n' +
      '\n' +
      'Call Log:\n' +
      '- Timeout 5000ms exceeded while waiting on the predicate',
    name: 'toBe'
  }
}

Node.js v24.15.0
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/desktop-assistant@0.1.0 verify:ui: `node scripts/verify-ui.mjs`
Exit status 1

```

復元: byte-identical。
