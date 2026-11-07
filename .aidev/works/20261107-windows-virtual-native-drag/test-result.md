# U10生成検証記録

実IDD・実Explorer dropは未実施。署名driver返却物待ち。sr-pcは操作していない。

## 検査範囲

- protocol option/capability/readyのvirtualNativeDragとfeature bit14。公開readyはfiles/resourceFences/virtualDisplayを要求し、secure/cover/virtualMonitorsを拒否。
- server/shared/relay: private virtualNativeDragProof/nativePointerProofを公開しない。旧host/旧viewer/未optin拒否、共有source排他、再接続時の証明非再利用。
- file lane: 仮想単独/共有を含む生成COPY。実selection/pathsはfixtureに置換し、root・grant・file lease・resource解放ACK・読取り・取消は本体を使う。
- local Windows csc.exe直呼出しによるmemory-only検査。通常physical witnessに加え所有virtual11条件。native capture/input/OS session切替/driver/service/trust操作なし。PowerShell/ExecutionPolicy変更なし。実装はvalidate-virtual-native-drag.py。

## native正例・負例・復元

旧virtual拒否guardへ戻した場合、新しいokケースが失敗する。monitor scope checkを除いた場合、layout-changedケースが失敗する。変異は一時folderのコピーだけに適用、repo source不変・byte-exact復元後再成功。

```text
desktop_native_pointer_generated_applied_down_epoch_coordinates_policy_and_failure_passed
{"type":"monitor_topology_changed"}
desktop_owned_virtual_native_pointer_11_memory_checks_passed
desktop_native_pointer_generated_applied_down_epoch_coordinates_policy_and_failure_passed
System.InvalidOperationException: Virtual native pointer guard: ok
   �ꏊ SodaDesktopHost.VerifyVirtualNativePointerWitness()
   �ꏊ SodaPointerWitnessChecks.Main()
negative_old_virtual_admission_failed_as_expected
desktop_native_pointer_generated_applied_down_epoch_coordinates_policy_and_failure_passed
System.InvalidOperationException: Virtual native pointer guard: layout-changed
   �ꏊ SodaDesktopHost.VerifyVirtualNativePointerWitness()
   �ꏊ SodaPointerWitnessChecks.Main()
negative_missing_monitor_scope_failed_as_expected
byte_exact_restore_sha256=0c42d61014ddfa7d2021d18bae3503e08db20227a2f2994fccece1449163a5e3
desktop_native_pointer_generated_applied_down_epoch_coordinates_policy_and_failure_passed
{"type":"monitor_topology_changed"}
desktop_owned_virtual_native_pointer_11_memory_checks_passed
```

## 型検査と関連回帰

production server参照build (`pnpm exec tsc -b packages/server`) exit0。
初回server test型検査でreadyMessageのundefined可能性を検出し、既存poll後のnon-null assertionへ修正。再検査exit0。runtime sourceは変更していない。
protocol 20tests pass。最終関連10suite/534tests pass（98.48秒）、全体testは実施していない。


## server旧版負例とexact復元

Providerだけをmain868へ戻し、新しい仮想単独/共有readyとfile COPYの4casesを実行。4fail/exit1。現Providerをbyte-exact復元してcmp一致を確認後、同じ4casesがpass/exit0。protocol/distを使う依存部分は現版を維持してProvider本体の旧拒否経路を検査した。負例生出力は [negative-old-provider.txt](negative-old-provider.txt)。

```text
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 325 skipped (329)
   Start at  15:13:36
   Duration  5.74s (tests 72%, transform 23%, import 5%)

```

復元後:

```text
 RUN  v5.0.1 /workspaces/sodashitsu-virtual-native-drag


 Test Files  1 passed (1)
      Tests  4 passed | 325 skipped (329)
   Start at  15:13:42
   Duration  3.24s (tests 52%, transform 39%, import 8%)

```

関連回帰:

```text


 Test Files  10 passed (10)
      Tests  534 passed (534)
   Start at  15:11:17
   Duration  98.48s (tests 93%, transform 5%, import 2%)

```
