# 資源準備の途中結果

- GUI build:host成功。生成20項目/約668KiB、license同梱追加後も生成成功。
- server単体buildでGUI compile/bundleまで成功。
- node_modulesのないprivate fixtureでNodeのsyntax検査、synthetic Electron拒否startup、preloadの固定surfaceと全manifest entryのbytes/SHAを検証して1件成功。
- 初回fixtureはVMにCommonJS exportsを用意しておらずReferenceErrorになり、実際のCommonJS wrapperと同じexports/moduleを用意して修正。これは製品コードの失敗ではない。
- 全体build最終成功。関連bundle1件とpackaged21資源/6variantの検証成功。全体typecheck成功、全体912ファイル・13,169件すべて成功（352.08秒）。CI/PRは次段階。

ログ: /tmp/soda-unified-assistant-server-build.log、/tmp/soda-unified-assistant-bundle-test.log。実GUI/OS入力/録音/agentを起動していない。

## 隔離配布fixture: inventory-positive

```text

```

## 隔離配布fixture: inventory-negative

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Missing expected rejection.
    at async file:///tmp/soda-host-inventory-negative-gm4kmcz8/runner.mjs:1:432 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: /Unlisted/,
  operator: 'rejects',
  diff: 'simple'
}

Node.js v24.15.0

```

## 隔離配布fixture: variant-positive

```text

```

## 隔離配布fixture: variant-negative

```text
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Missing expected rejection.
    at async file:///tmp/soda-host-inventory-negative-gm4kmcz8/runner.mjs:1:2141 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: /variant/,
  operator: 'rejects',
  diff: 'simple'
}

Node.js v24.15.0

```

隔離copyの正常2件はexit0、closed tree検査/tuple重複検査を除いた各負例はNode assertのMissing expected rejectionでexit1。元verifier SHA256 254a525431d30739365a81864659c7b551f20d7816bf9a43f0bc91d075c218e5が終了後一致。private copyのみを変更し製品sourceは変更していない。

全体ログ: /tmp/soda-unified-assistant-all.log、/tmp/soda-unified-assistant-typecheck.log。配布stagingはno-install/no-archiveで行い、生成物を実行せず21資源と6variantを検証した。
