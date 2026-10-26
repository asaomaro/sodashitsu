# 第3段階: multiple monitor selection/composite

B local allowMonitorsとhelper local -AllowMonitorsの両ceiling、A/B/helperのprotocol/capability/ready opt-in。通常画面だけでmetadataを返し、旧peerへ新fieldを送らない。要求したtargetをhelper readyで照合し、無視された場合に違う画面で操作を開始しない。secureでは専用認証画面を使い選択を無効にする。

Native EnumDisplayMonitorsでfresh device IDsとprimaryを取得し、EnumDisplaySettingsEx currentのphysical boundsを使う。GetScaleFactorForMonitorで表示倍率を読み取る。既存helperのsystem-DPI awarenessではGetDpiForMonitorがsystem DPIを返すため、別monitorの倍率をそのAPIで代用しない（[GetScaleFactorForMonitor](https://learn.microsoft.com/en-us/windows/win32/api/shellscalingapi/nf-shellscalingapi-getscalefactorformonitor)、[GetDpiForMonitor](https://learn.microsoft.com/en-us/windows/win32/api/shellscalingapi/nf-shellscalingapi-getdpiformonitor)）。OSのDPI設定を変更しない。

single/allのimmutable geometry snapshotを作り、ID/bounds/primary/scaleが変われば停止する。allはphysical unionをGDI取得（single allはDXGI可）、source OS resolutionは変えない。16outputs/32768edge/40M pixels bound。allの範囲が大きくてもsingleは使う。DXGIはoutputごとのduplicationなので複数GPU合成は後続であり、この段階で実装済みと扱わない（[DuplicateOutput remarks](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgioutput1-duplicateoutput)）。

入力共通Applyで実Emit直前のtopology fenceを実行し、main queue内の待つ処理の後も検査する。取得したsnapshotをpointerのvirtual boundsへ再利用し1inputの列挙は1回。OS topologyの更新とSendInputをOS側で原子的にlockするAPIではなく、観測した変更から先の停止を保証する。gapのdown/moveを送らず、upは持っているボタンの解放に使う。TSとC#はties-to-evenで同じpixelを選ぶ。

viewer切替はrelease→connect、各grantとmaximum display要求を解除。typed topology_changedはconnect世代に保持し、oncloseでdisplay失敗fallbackへ進めず手動の既定source再開を提示する。Source変更でagent操作も既存のshare終了経路から失効。

fake geometry/native production Apply+queueをmemory endpointsで試験し、A down→slow clipboard相当でtopology変更→B入力拒否+A up、1enum/inputを確認。OSをcapture/input/変更しない。readonly probeは別scriptでactual topologyだけを読む。全OS backendや全remote app機能との同等性は主張しない。

前段: #213 clipboard/#214 fileはmainにmergeしA/B反映済み。#214はB HEAD1ebdc94a/clean/build後2026-10-26T05:25:27.854Z handoff complete確認、Aはdirty rootを3way保全しbuild/typecheck/関連/smoke後7panes保持handoff。
