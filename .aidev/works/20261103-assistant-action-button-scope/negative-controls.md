# Negative control

修正前f717c1d2の配色CSSだけに戻し、source CSSを使うChromium検証でサイドバー見出しの背景/角丸の退行を捕捉。修正済みCSSへバイト一致で復元。

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: sodashitsu-assistant: navigation/label section changed
+ actual - expected

  {
+   background: 'rgb(201, 166, 79)',
-   background: 'rgba(0, 0, 0, 0)',
    color: 'rgb(23, 36, 56)',
+   radius: '8px',
-   radius: '2px',
    shadow: 'none'
  }

    at file:///workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/scripts/verify-assistant-controls.mjs:32:118 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: {
    background: 'rgb(201, 166, 79)',
    color: 'rgb(23, 36, 56)',
    radius: '8px',
    shadow: 'none'
  },
  expected: {
    background: 'rgba(0, 0, 0, 0)',
    color: 'rgb(23, 36, 56)',
    radius: '2px',
    shadow: 'none'
  },
  operator: 'deepStrictEqual',
  diff: 'simple'
}

Node.js v24.15.0

```
復元SHA256: 04f8cad243342a79e5b2a603f3a9aea6d4fdc1f4fd67f81a74afccf85fc3f354
