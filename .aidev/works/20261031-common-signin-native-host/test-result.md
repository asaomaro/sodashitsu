# 検証

build/typecheck成功。配布生成後106資源・203参照・byte一致。専用Windows private TempでSDKをcompileし、1個のPEとRouter entrypointをReflectionOnlyLoad(byte[])で検査。不正roleと空nonceの2負例は別子processで失敗を確認し、sourceをbyte一致で復元。生成stageは削除した。

実測の生出力:

```
signin_native_compiled_staging_only
signin_native_negative_pass unknown-role
signin_native_negative_pass empty-nonce
signin_native_single_image_generated_pass

```

SCM/実service/worker main/取得/入力/driver/信頼変更は実行していない。Node focused 5ファイル66件成功。旧2PE inventoryへ戻す別private JS fixtureは1失敗、バイト一致で復元後成功。全体・CIは実行中。

追加manifest負例の生出力:

```
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected

  [
+   'DesktopSigninService.exe',
+   'DesktopSigninWorker.exe'
-   'DesktopSigninNative.exe'
  ]

    at file:///workspaces/sodashitsu-common-signin-host/[eval1]:1:154 {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: [ 'DesktopSigninService.exe', 'DesktopSigninWorker.exe' ],
  expected: [ 'DesktopSigninNative.exe' ],
  operator: 'deepStrictEqual',
  diff: 'simple'
}

Node.js v24.15.0

```
