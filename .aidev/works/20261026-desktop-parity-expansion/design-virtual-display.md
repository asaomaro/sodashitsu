# 第6段階: 仮想display / headless

利用者の全項目対応指示を継続。現状の最大解像度変更や既存monitor選択だけを仮想display対応とは扱わない。

Microsoft IDD/IddCxがWindowsの正式な仮想monitor基盤。driverはSession0のUMDFで動き、接続/切断・mode・swapchainを扱う。SDK sampleはproduction-readyではなく、driver signingと配布を別途必要とする。

必要な製品境界:

- ドライバー未導入、導入済みだが停止/権限不足、利用可能、現在共有でlease中を区別する。登録情報だけをcapture成功としない。
- 共有開始前に利用者が仮想画面の作成を明示選択する。ローカル設定にallowVirtualDisplay ceiling、通常capture/input/display-modeの許可とは別にする。サインアウト/secure desktopは第7段階の境界で、今回自動越境しない。
- 一時monitorはshare owner/session/lease idと結ぶ。自分が追加したmonitorだけを破棄し、既存monitor・外部管理アプリの設定を全置換しない。process終了・切断・期限切れ時のguardianで回収し、再接続時の古いleaseを再利用しない。
- active topology確認後にのみ既存monitor選択/capture経路へ接続。起動前headless（no active target）でもcapability取得と明示lease作成は可能にする。実monitorの切替・追加は入力解除/新世代/再承認が必要。
- パッケージの取得・信頼/署名確認と管理者による導入は明示操作。test signing/証明書store変更を自動実行しない。driver導入済みとコードだけの対応を区別する。
- 生成fake driver/monitor topologyでlease競合、作成途中の取消、異常終了、外部変更、monitor消失、headless→readyとcapture failure rollbackを試験する。自動試験で実機のdriver導入/OS表示設定を変更しない。

比較調査:

- Microsoft sampleは単一monitorとframe処理の例。導入/動的monitor管理をそのまま製品完成品としない。
- VirtualDrivers/MttのSETDISPLAYCOUNTは全体個数操作のため、他appのmonitorを消す懸念がある。leaseで追加/削除の所有権を保証できない実装は採らない。
- virtual-display-rsのState/Notifyは全体stateを扱い、並行管理appの変更を失う恐れがある。read/modify/writeだけでは十分でない。

一次資料（2026-10-26）:
- https://learn.microsoft.com/en-us/windows-hardware/drivers/display/indirect-display-driver-model-overview
- https://learn.microsoft.com/en-us/samples/microsoft/windows-driver-samples/indirect-display-driver-sample/
- https://github.com/MolotovCherry/virtual-display-rs （driver-ipc/core.rsを参照、MIT。取り込みなし）
- https://github.com/VirtualDrivers/Virtual-Display-Driver （比較対象、取り込みなし）

未完了: driver/API選定、署名/配布の具体化、adapter実装、Node/Protocol/UI integration、試験/独立レビュー/実機検証。設計だけで第6段階を完了にしない。

独立設計点検で追加: SwDeviceLifetimeHandleが監視するのはbroker側の作成handle。client/helper crashだけでは、brokerがhandleを保持したままなら回収されない。brokerは認証済みclientのprocess handle（PIDだけでなくcreation time/session）・pipe断・lease期限を監視しcloseする。非同期作成取消/timeout後callbackでもdeviceを公開しない。SwDeviceCreate S_OK/callback成功、PnP driver起動、active monitor検出、capture readyを別段階とする。callback前後の所有権移動とcloseを一度だけ行う状態機械をfakeで検証する。

次の実装候補: Sodashitsu専用のIDD packageと独立instanceを使い、SwDeviceLifetimeHandleのまま保持する。SwDeviceCreateはAdministrator権限を必要とするため、ローカルに明示導入する保護brokerの認証/ACL設計を先行する。通常viewer経由でdriver導入や任意hardware IDを指定させない。新規署名済みdriverの配布とWDK buildを整える必要があり、現AではWDK/msbuild未検出。未署名driverを自動導入して検査しない。

作成deviceとcapture targetの同一性: callbackの実PnP instance IDを起点に、そのdeviceのdriver interface arrivalと配下monitor interfaceを確認し、QueryDisplayConfig adapter LUID/target ID/monitorDevicePathへ対応付ける。DISPLAYnの増分やEDID/friendly nameだけを根拠に選択しない。外部appが同時にmonitorを追加するfakeを必須にする。lease cancelはcreated/callback/device-started/monitor-arrived/active/capture-readyの各段階で検査する。

設計独立レビュー: review_transferが上記寿命監視・PnP対応付けの2must修正を再点検し、設計指摘解消。driver/broker/API/UIと実機captureは未実装/未検証。

前段第5段階の着地: PR #218 main 29e691b5。rootの既存変更を3way/hash guardで保持して30files反映、build/typecheck・関連109件・smoke成功。Bはmain clean/pnpm build後handoff完了2026-10-26T11:30:13.381Zをfresh execで確認。Aは9 panesを保持してhandoff完了。実機のcapture/OS入力試験は実行していない。
