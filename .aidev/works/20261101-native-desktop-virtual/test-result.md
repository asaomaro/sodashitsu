# 生成検証

- build/typecheck成功。Node/settings/UI/TUI/Provider monitor回帰60件成功。
- Linux Portal 72件成功。仮想source未対応・許可/feature欠落・physical source誤応答・session close・serial/論理size・restore非利用を確認。実OSを使わないGVariant/connection/pipelineの生成試験。
- Browser 2件成功。仮想ready後にUDP/WSSの実canvas描画、同streamの1280→960解像度、Opusの出力/エネルギー増分、Control入力ACK維持を確認。音声は仮想MediaStreamDestinationへ送りスピーカーには出さない。
- 独立taskcheck/cross済み。Windows unlockLeaseのnative誤生成mustを修正し、生成設定のfield不在回帰と差分再レビューで解消。全体テストは最終統合時に行い、関係しない全suiteの二重実行を避ける。

## 負例の生出力

一時コピー上でsource type4拘束、AvailableSourceTypes bit4、nativeのWindows lease生成禁止を壊して意図したassertion失敗を確認し、復元後成功。製品source/生成moduleはbytes不変。

```text
NEGATIVE virtual-source
F
======================================================================
FAIL: test_wrong_source_response_closes_the_owned_session_without_opening_pipewire (__main__.PortalProtocol.test_wrong_source_response_closes_the_owned_session_without_opening_pipewire)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-monitor-negative-9s2fzfxd/test-linux-portal-helper.py", line 297, in test_wrong_source_response_closes_the_owned_session_without_opening_pipewire
    self.assertTrue(self.helper.closed);self.assertIsNone(self.fake_fd);self.assertTrue(any(call[0]=="Close" and call[1]==session for call in self.calls))
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: False is not true

----------------------------------------------------------------------
Ran 1 test in 0.011s

FAILED (failures=1)

RESTORED virtual-source
.
----------------------------------------------------------------------
Ran 1 test in 0.111s

OK

NEGATIVE available-bit
F
======================================================================
FAIL: test_portal_must_advertise_virtual_support_before_creating_session (__main__.PortalProtocol.test_portal_must_advertise_virtual_support_before_creating_session)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-monitor-negative-9s2fzfxd/test-linux-portal-helper.py", line 287, in test_portal_must_advertise_virtual_support_before_creating_session
    with self.assertRaises(module.NativeFailure) as error:self.create_virtual()
AssertionError: NativeFailure not raised

----------------------------------------------------------------------
Ran 1 test in 0.012s

FAILED (failures=1)

RESTORED available-bit
.
----------------------------------------------------------------------
Ran 1 test in 0.010s

OK

production source unchanged SHA256 e370d75bbe5e80e1dfb31b464da2e96b5c7cd12bc27596707a352194b0716693
NEGATIVE Windows lease
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: native virtual permission must not launch Windows lease
+ actual - expected

+ [
+   'generated-only',
+   '-UnlockLease',
+   '-AllowVirtualDisplay'
+ ]
- undefined

    at file:///tmp/soda-native-lease-negative-ybYBDY/check.mjs:1:331
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)
    at async node:internal/modules/esm/loader:639:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: [ 'generated-only', '-UnlockLease', '-AllowVirtualDisplay' ],
  expected: undefined,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0

RESTORED Windows lease
native permission has no Windows lease

production generated module unchanged SHA256 647d7121054782e2e0f6e88d7ecf1a634f0037d239da17f81503952846230ab5

```

CIのMacで既存checkpoint replay試験が5000ms上限を超過したため、このファイル生成/fsyncを繰り返す試験だけMac上限を30sへ変更。Linux5s/Windows120sは維持し、policy/replayのassertionは変更なし。対象33件はローカル再実行成功。製品のタイムアウトは変更していない。
