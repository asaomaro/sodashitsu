# 検証

最新main 2b74a445後のbuild成功。実配布生成後、106資源・217参照の閉包とsource/package byte一致を確認。helperの取得・入力・音声・SCM/driver・信頼変更は実行しない。

private別fixtureで修正後pass→inventoryからSigninAclPolicyだけ除去してfail、同byteのsymlinkに差替えてfail→両方をバイト一致で復元してpass。

負例の生出力（抜粋）:

```
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: SigninAdminStorage.ps1 requires missing SigninAclPolicy.ps1
    at file:///tmp/soda-sdk-negative-2zi6ntqa/scripts/remote-desktop/verify-runtime-assets.mjs:37:11 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: true,
  operator: '==',
  diff: 'simple'
}
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Resource is not a regular file: /tmp/soda-sdk-negative-2zi6ntqa/scripts/remote-desktop/SigninAclPolicy.ps1
    at regularBytes (file:///tmp/soda-sdk-negative-2zi6ntqa/scripts/remote-desktop/verify-runtime-assets.mjs:14:40)
    at async Promise.all (index 0)
    at async file:///tmp/soda-sdk-negative-2zi6ntqa/scripts/remote-desktop/verify-runtime-assets.mjs:32:14 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
```

3OS CIと最終main反映はPR記録に追記する。
