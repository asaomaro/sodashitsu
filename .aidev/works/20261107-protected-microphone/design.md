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
