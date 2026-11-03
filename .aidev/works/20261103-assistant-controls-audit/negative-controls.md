# Negative control

接続ビュー追加の配色指定だけを修正前へ戻し、実SFCの属性とCSSを読むChromium検証を実行。「connection-view action is not gold」で失敗。Vue配布物を使わないsource検証なので再ビルドは不要。修正済みソースへバイト一致で復元。

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: sodashitsu-assistant: connection-view action is not gold
+ actual - expected

+ 'rgb(228, 223, 208)'
- 'rgb(201, 166, 79)'
        ^

    at file:///workspaces/sodashitsu-main-live-assistant-agents/packages/e2e/scripts/verify-assistant-controls.mjs:56:37 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'rgb(228, 223, 208)',
  expected: 'rgb(201, 166, 79)',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0

```
復元SHA256: 2fc031ee78d0a9a008a5c9e694e114bb4ba7a9bb740544b50f179c42a0ea091e
