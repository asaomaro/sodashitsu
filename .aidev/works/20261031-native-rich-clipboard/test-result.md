# 検証

settings配線追加前のfeature head c492eba6。pnpm build/typecheck成功。全体903ファイル13,094件pass（351.10秒）。関連5ファイル309件pass。Linux portable生成35件pass。macOS CIはビルドとself-test、既存12＋rich 5件の一時ソース負例が成功（run 41103033692、ログ末尾generated_negative_controls_pass）。最終headのCI/merge状態はPR #336を参照。

Linux local全体のEntry 2件はGstVideo GI namespace不足で失敗、Regionsの2件skip。変更前main相当3c3792c6のEntryも同じ2件が失敗することを一時ソースで確認した。CIのLinux jobは依存を導入して全件成功。

ブラウザE2Eは接続先のonline DOM待ちで停止し、clipboard操作へ到達しなかった。hash login→試験用cookie→hasFocus stub除去の切り分けでも同じ。変更前mainと同じtreeの6f52f5a9でも元specの同じonline DOM待ちで失敗。前段のWeb terminal smokeと同じく、この環境のbrowser起動後の既存問題として記録し、これ以上の試行は行わない。初期のE2E再試行の終了待ちと次の実行が約数秒重なりtrace artifactが衝突したため、そのartifactは根拠に使わない。最終単独のfocusログとmain単独ログで比較した。

実Portal／NSPasteboard、表示/入力/音声の実機操作は行っていない。検証は生成clipboard、fake DBus FD、native kernel、TS consumer、サーバ/ブラウザの試験用sourceに限定した。

## Linuxの負例（原bytesに一致して復元）

### offset

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopNativeRichClipboard.test.ts > uses the actual Python rich kernel with the TypeScript read/write wire consumer
AssertionError: expected { type: 'clipboard_rich_result', …(3) } to match object { ok: true, stage: 'chunk' }
(2 matching properties omitted from actual)

- Expected
+ Received

  {
-   "ok": true,
-   "stage": "chunk",
+   "ok": false,
+   "stage": "done",
  }

 ❯ read src/desktop/DesktopNativeRichClipboard.test.ts:48:18
     46|   while(offset<first.size!) {
     47|    bridge.fromViewer({type:"clipboard_rich",id,operation:"pull",offset…
     48|    expect(reply).toMatchObject({ok:true,stage:"chunk"});const piece=Bu…
       |                  ^
     49|    expect(reply.offset).toBe(offset);bytes.push(piece);
     50|   }
 ❯ src/desktop/DesktopNativeRichClipboard.test.ts:54:10

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### cancel

```text
FAIL: test_final_chunk_cancel_never_revives_after_bounded_cache_eviction (__main__.RichClipboard.test_final_chunk_cancel_never_revives_after_bounded_cache_eviction)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-native-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 477, in test_final_chunk_cancel_never_revives_after_bounded_cache_eviction
    self.assertFalse(witness())
AssertionError: True is not false

----------------------------------------------------------------------
Ran 1 test in 0.011s

FAILED (failures=1)
```


## CIのブラウザ試験で判明した設定配線

ローカルの既存DOM待ち問題と別に、CIでは共有画面まで到達しshared clipboard選択が現れず失敗した。DesktopSettingsがnative許可をconstructorでfalseに戻しsetで拒否、Web/TUIでも非表示だったため修正。両OSの保存/再open復元/OFF/command ceilingとWeb/TUIの回帰6件を追加。関連settings3ファイル32件pass。E2Eのrich API stubにreadも用意して実際のブラウザの能力判定を通す。最終全体の再実行結果とexact-head CIはPR #336に記録する。

### settings復元の負例

```text
FAIL  |@sodashitsu/server| src/desktop/DesktopSettings.test.ts > persists native linux-portal clipboard permission and enables only the clipboard launch ceiling
 FAIL  |@sodashitsu/server| src/desktop/DesktopSettings.test.ts > persists native macos-sck clipboard permission and enables only the clipboard launch ceiling
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopSettings.test.ts:177:127
    175|  await settings.set({...off,enabled:true,allowClipboard:true});
    176|  expect(configure.mock.calls.at(-1)![0]).toMatchObject({nativePlatform…
    177|  const restored=await DesktopSettings.open({...options,nativePlatform}…
       |                                                                                                                               ^
    178|  expect(configure.mock.calls.at(-1)![0]?.allowClipboard).toBe(true);
    179|  await restored.set({...off,enabled:true});expect(configure.mock.calls…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
```
