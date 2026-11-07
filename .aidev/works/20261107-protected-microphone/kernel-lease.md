# workerを跨ぐマイク排他の修正

rootの独立レビューにより、module内occupiedとDesktopProviderのresource/physicalHelpersはNode workerの寿命しか持たず、worker置換で旧user-microphone processがdeviceを退役中でも新module側のgateが初期化される不足を確認した。

通常/保護とも通るWindowsDesktopMicrophoneで、pipe実PID/peer検証後・sink生成前にLocal namespace + 現在の利用者SIDのkernel mutexをWaitOne(0)で取得する。endpointを名前に含めず、同利用者/Windows session内のone-ownerを保つ。別ユーザー/別sessionの権限を引き受けず、Global namespaceやACLの追加は行わない。既定token DACLで非昇格userが使う。

解放はsink.Disposeの正常完了後、取得したdevice thread自身で行う。sinkの終了不明なら明示Releaseせず、その音声を所有する自helper processを強制終了し、OSがdevice handlesを終える境界にする。abandoned自体は終了receiptとせず当startを拒否する。自作actorのmanaged finallyによる終了/例外/worker変更/process deathを対象とし、外部からの任意thread破壊は保証対象外。普通のcapture helperの強制終了は、そのprocessの画面/動画/共有窓も終了することを利用文書へ明記した。

# 実行した確認

`validate-microphone-lease.py --windows-temp <Windowsから見える自分のTemp> --negative-controls`

- 自作exeが非SYSTEMかつTokenElevation=0であることを各processでassertした。
- 私有のfixture用mutex名（Local + SIDというscopeは同じ）・生成sinkだけを使用。WASAPI endpoint、desktop/input/service、sr-pcには触らない。
- 通常overloadと保護peerGuard overloadの両方で、旧sink.Dispose待ちの間、同processの別device threadと別processの通常/保護startがfactoryを開けない。
- 正常Dispose完了後、旧processはまだ生存した状態で、次の明示startが両経路とも成功する。
- 旧所有processを自分自身で終了させ、keeperが保持したkernel objectのabandonedを新startが拒否する。旧processのphysical exitを確認した上で、その後の明示startが成功する。
- fake sink.Disposeの例外で、そのsinkを持つ自fixture processが強制終了し、新しいstartが取得できる。
- copied sourceからadmission guardを除くとSame-process normal contender acquired before old sink retirementで失敗。元bytesへ完全復元し、再コンパイル後の全確認が再成功。生ログはkernel-lease.log。production sourceは一度も置換せずSHA256不変をassertした。
- 既存の実共通host MTA/hash/実actor preflight、生成PCM/private pipe、fake SID/logon/WTSの7 guard負例とbyte exact復元も再成功。生ログはnative-after-lease.log。

実WASAPI virtual endpoint・実UACアプリ受信・sr-pcの配布/サービス更新は今回も未実施。root/別contextによる追加差分reviewの後に統合する。
