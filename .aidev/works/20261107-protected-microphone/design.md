# U8 管理者画面のマイク転送

UAC/elevated Defaultだけを対象とする。signin/locked Winlogon、UDP、codec追加、自動品質調整は対象外。

ローカル設定allowProtectedMicrophoneはdefault deny。既存allowElevated・allowMicrophone・固定virtual render endpointと、両端protectedMicrophone featureを同時に要求。マイク開始は利用者の明示操作。旧端点は拒否/非表示とし、既存許可で自動的に管理者micを有効にしない。

SYSTEM workerへWASAPIやPCMを渡さない。固定role user-microphoneを通常ユーザー権限で起動し、自己・pipe peerの非SYSTEM/非昇格、SID/logon SID/session一致、同active consoleかつWTS unlockedを検証する。私有pipeの実client PID確認後にのみWASAPIを開く。scopeはlockで不可逆に失効、protected workerのsource epoch/connection/permission失効もparentのaliveとheartbeatへ伝搬する。

調製待ち45秒とnative起動2.5秒を分離。nonce、固定stream ID、heartbeat2秒、限定PCM48kHz mono20ms、従来のframeTTL/順序/容量を維持。停止後もnative closeとdevice thread退役receiptの両方まで共通mic排他gateを維持。不明な退役は閉じたままとする。

2段commit: actor/manager/生成検査、次に設定/protocol/relay/Provider/UI結合。権限・protocol・終了境界は壊れやすいため独立taskcheck/最終reviewをrootが調整する。sr-pc導入/サービス更新/表示変更/再起動は調整前に行わない。

# 検証

第1段: server 18件、client-core role 17件、Node24 tsc -b server成功。Windows csc.exeで自前fixtureを直接コンパイルし、偽identity/WTS事実・生成PCM/private pipe・in-memory sinkを検証した。実audio endpoint/保護worker/サービスは起動していない。

AllSigned相当のローカルPowerShellが新規ps1を拒否したため、ExecutionPolicyや署名検査を変更せず、通常のcsc.exeによる生成fixtureビルド経路を使用した。再現はvalidate-user-microphone.py --windows-temp <Windowsから見える一時folder> --negative-controls。生成ファイルのみ作成・削除する。

native-generated.logは7種のsource guard除去がそれぞれ該当assertで失敗し、byte exact復元後再成功する生ログ。negative.logはTS managerのretirement receipt待ちを除去した負例、restored.jsonは修正版をexact復元したSHA。positive.log/role-tests.logは修正版のテスト結果。


# 第2段の実装と検証

設定/protocol feature bit/Provider/Relay/Web/TUIを接続。サインイン/locked Winlogonや共有protected micへは広げない。通常micは従来の3秒開始待ち、protected actorだけ調製45秒とPCM開始のため元の開始時刻から最大50秒を許容する。starting通知で延長しない。SYSTEM helperへendpoint/PCMを渡さず、privileged readyのmic自己申告も拒否する。

actor監視は失効した瞬間にsinkを禁止し、親からの次のheartbeat/EOFで正常終了してdevice-thread retirement receiptを返す猶予を持つ。応答不能時は1.5秒で強制終了し、その場合は共通mic gateを自動解放しない。普通micの開始も同じgateを見る。

- protocol28件、server関連82件、普通/共有mic・保護画面を含むrelay72件成功。
- Web mic/共有画面32件、Web設定11件、TUI設定9件成功。
- server tsc -b・serverテスト含むtypecheck・Web vue-tsc成功。全体テストは重複実行せず、統合側に委ねる。
- native-final.log: ローカルWindowsの実共通hostで新roleのMTA、実actor preflight、不正hash拒否を確認。生成facts/private pipe/sinkと7 source負例・byte exact復元も成功。実audio endpointは開かない。
- assets.log: inventoryから作った生成SDKリソース束111件の元ソース一致・参照閉包215件を検査。完全なrelease packageのビルド/配布/実行ではない。
- forged-negative.log: privileged helperのmic権限偽装拒否を外すと該当結合テストが失敗。forged-restored.jsonは最終ソースのexact復元SHA。
- startup-negative.log: browserのprotected待ちを従来3秒へ戻すと期待した1件が失敗、復元後startup-positive.logは2件成功。startup-restored.jsonにexact復元SHA。

relay結合では通常user actorをin-memory sinkへ置き換え、実helper/実WebSocket/別mic ticketで制御配送とsource失効を確認した。実WASAPI再生・実UAC/Defaultアプリ受信・実ロック/epoch変化時の終了は未検証。sr-pc導入/サービス/表示/再起動は行っていない。詳細はdocs/protected-microphone.md。
