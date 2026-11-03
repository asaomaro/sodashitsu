# Negative control

配色CSSの修正だけをHEADへ戻し、source CSSを直接使うChromium検証を実行。サイドバーlabelの背景/文字/角が変わり失敗することを確認。修正ファイルへバイト一致で復元。

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
復元SHA256: 5d5ff682a372c3a2b1c60793d4775344a661cf12565817d7569b91867fbc8114
