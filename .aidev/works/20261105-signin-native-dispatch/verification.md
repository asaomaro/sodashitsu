# 専用サインインサービスの82文字名とnative起動

## 実機の失敗

2026-11-04T14:57:27Z、利用者がUACを承認した設定処理で、initial/stoppedの確認とinitialize管理要求のprepareまでは成功した。続く管理モードのstartが失敗し、wrapperは停止した。trust/enroll/normal start/ackには進んでいない。結果は `live-start-failure.json`。

Application logのevent1026は `System.ArgumentException`、`ServiceBase.set_ServiceName` → `SodaDesktopSigninHost+Service..ctor` → Mainを示す。event1000もDesktopSigninNative.exeの0xe0434352、System7009/7000はSCM接続のtimeoutを示す。固定名 `SodaDesktopSignin-` + 64桁owner hashは82文字で、.NET ServiceBaseの80文字上限を超える。ServiceNameの設定はHost.Runより前。実要求の結果を確認できないため、鍵の初期化成功とは扱わず、pending要求とjournalを削除・再送しない。

## 修正

既存サービス名/stateを保ち、ServiceBaseの代わりにnative SCM dispatcherを使う。固定名だけを登録し、ServiceMainのargv[0]の完全一致とargc=1を要求する。MainのSYSTEM/64bit条件、Host.Run内のpackage/barrier、journal、子プロセスとJobの検査は維持する。

START_PENDING → RUNNING → Host.Run → 全cleanup完了後STOPPEDの順で、STOPPEDは一度だけ。stop/shutdownのhandlerはevent通知とSTOP_PENDINGだけで返り、最初の停止要求で25秒watchdogを開始する。cleanup後に取消し、超過やstatus報告失敗はFailFastで正常停止証拠を出さない。例外は1066/specific1とprocess exit1へ反映する。delegateはdispatcherが戻るまで保持する。

## 検証

Windowsのordinary accountでnative ABI、実82文字名、引数拒否、停止/自然終了/失敗、cleanupの順、停止後の再報告拒否、25秒watchdogの開始一回・取消・一度の発火を生成adapterで検査する。実SCMや実鍵は操作しない。

`windows-dispatch-checks.json`は正例・6変異負例・byte復元後正例。managed名前代入を戻す負例は同じ名前制限を再現して失敗する。最初のstop-event変異ではrunner内の例外が本体の安全なcatchで吸収され、検査が一般的な「runner failed」を返したため、fixtureが原因を保持して期待したassertへ結び付くよう修正した。初回の生ログは `windows-dispatch-first-checks.json` に保持した。

`windows-host-first-checks.json`は生成Host/child/Job検査の成功後、配布EXE用の旧CodeDomコンパイラーでdelegate型推論が失敗した記録。Funcの型を明示し、配布用結合sourceで競合するTimerのnamespaceも明示した（後者の失敗ログは `windows-host-second-checks.json`）。最終の `windows-host-checks.json` はHost/child/Job、worker/presence、実EXE生成とValidateOnlyの成功を示す。実配置の更新・pendingの扱い・SYSTEM再起動・trust/enroll・サインアウト実機検証は引き続き未完了。

独立レビューで停止全体の25秒期限の維持を指摘されて追加し、修正差分の再レビューは必須指摘なし。

参照: [ServiceBase.MaxNameLength](https://learn.microsoft.com/en-us/dotnet/api/system.serviceprocess.servicebase.maxnamelength)、[StartServiceCtrlDispatcherW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicectrldispatcherw)、[SetServiceStatus](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-setservicestatus)。

## 読み取り専用の実機状態

利用者承認の診断は2026-11-04T15:10:25Zに成功。サービスはManual/Stopped/PID0、controllerはstopped/pending。adminには元receiptと同じSHAのadmin.pendingだけ、runsにはintent.pendingだけ、runtimeは空、slotはこの3 directoryとquiescence.lockだけ。診断はcontroller statusとCIM、名前/サイズ/SHAのsnapshotであり、保持したprocess handleによるclean stop証拠ではない。記録は `live-readonly-inspection.json`。鍵/trust/enrollの成功、一般の異常終了からの復旧可能性は主張しない。
