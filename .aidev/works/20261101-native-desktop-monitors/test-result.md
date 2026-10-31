# 生成検証

- Node/protocol/settings 45件、Provider生成helper loopback試験1件成功。
- Linux Portal 66件成功。GstVideo typelibは一時ディレクトリの既存生成試験用依存を指定。実Portal/画面/入力デバイスは未使用。
- Browser 4件成功（Linux/macOS × restore有無）。実canvas色、選択ID、論理640と実1280pixel、正規化pointer、private receiptの非公開と次helper configureを確認。ローカルでは既存Chromium1217を環境変数で指定。
- build/typecheck成功。全体Vitest: 926ファイル/13358件成功、1件skip・2件skip。PTYのdist時刻検査とRelayの一時フォルダー削除競合の2suite失敗。server強制再ビルド後の対象2suite再実行は278件成功。全体の二重実行はしていない。
- taskcheck/crossで追加mustなし。指摘されたprivate receipt経路を生成helperとbrowserで追加検証し、差分再点検で解消。

## 負例の生出力

一時コピーだけを変更し、ID一致条件・cache単回消費・origin分離を壊して失敗を確認後に復元成功。製品sourceと生成moduleのbytes不変を確認。

```text
NEGATIVE selected ID fallback
F
======================================================================
FAIL: test_selection_uses_stable_id_and_preserves_logical_geometry (__main__.MonitorRoster.test_selection_uses_stable_id_and_preserves_logical_geometry)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/tmp/soda-native-monitor-negative-iufpwy2j/test-linux-portal-helper.py", line 14, in test_selection_uses_stable_id_and_preserves_logical_geometry
    self.assertEqual(selected,"portal:DP-2");self.assertIs(stream,streams[1]);self.assertTrue(stable);self.assertEqual(records[0]["x"],-1280);self.assertEqual(records[0]["width"],1280)
    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: 'portal:DP-1' != 'portal:DP-2'
- portal:DP-1
?           ^
+ portal:DP-2
?           ^


----------------------------------------------------------------------
Ran 1 test in 0.001s

FAILED (failures=1)

RESTORED selected ID
.
----------------------------------------------------------------------
Ran 1 test in 0.000s

OK

production source unchanged SHA256 f3cbeb6b5f63623e3963255b04d196c0aa4a4ced8f3f15f4d0ef12231313b886
NEGATIVE single-use
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: grant consumed once
+ actual - expected

+ 'generated-private'
- undefined

    at file:///tmp/soda-monitor-cache-negative-xvfxIN/check.mjs:1:357
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)
    at async node:internal/modules/esm/loader:639:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'generated-private',
  expected: undefined,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0

RESTORED single-use
origin and single-use assertions passed

NEGATIVE origin
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: different controller cannot consume
+ actual - expected

+ 'generated-private'
- undefined

    at file:///tmp/soda-monitor-cache-negative-xvfxIN/check.mjs:1:205
    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)
    at async node:internal/modules/esm/loader:639:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'generated-private',
  expected: undefined,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0

RESTORED origin
origin and single-use assertions passed

production generated module unchanged SHA256 06168b7dd456e0fa98bd1e72cd2ef4f0a21b9f2133382c465fe67e5a409bc21b

```
