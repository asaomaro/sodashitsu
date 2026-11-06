# 独立レビュー

review_resource_monitorの別コンテキストで、Source/Runtime/readers/RequiredPathsの全差分、
monotonic期限補強、raw pipe切替、private SYSTEM fixtureとsetupを点検。最終必須指摘なし。
固定path・毎回のfresh検査・write拒否・私有pipe・上限・終了確認を維持。
120秒timerの指摘は既存Presenceが先にepochを終える関係を再確認して撤回された。
その既存2分境界自体の改善は本変更の範囲外として未完了に残している。

旧Runtime差替negativeの生ログと、旧Console.Out native failure、新rawpipe成功の
evidenceを保存。旧Runtimeはbyteexact復元。実機での本番サービス導入は未実施。

統合版も別contextで全差分再レビュー、mustなし。既存oneoff/固定共有分岐のguardを確認。
package path集合は変更せず、旧manifestからのstrict Upgradeを維持する構成にした。
統合版native最終fixtureは20秒継続＋3拒否ケース成功、runtime不変/Jobzero/task削除。


## 2026-11-07 cross-session native Job修正

独立review_resource_monitorで製品5files、fixture、各setupの固定hash/ACL/task/cleanupを点検。追加mustなし。
当初の全Job外条件は実機outer Jobに適合しないため、実Root handleでのHost非所属へ変更。
RootをbrokerへOpenさせる案はself-held handleによるkill-on-close妨害があるため採用しない。
最終native fixtureはRoot handleを持つGateだけがmembershipを照合し、明示親とworker双方のRoot非所属を確認。
positive task0、negativeは親属性のみ旧状態でCreateProcessAsUserWエラー5、source byteExact復元。
詳細と生出力はevidence/session-jobs-*。実サービス導入成功はまだ主張しない。


## Specific107 incidentと一回Boot workflow

review_resource_monitorがcase・生成tests・固定operator SDK/pins/ACL/once tasksを確認し必須指摘なし。
実caseはreadonly inspectの成功後にrecover一回だけを実行。結果unknown/cleanExitClaimed=false。
標準Upgradeの失敗条件を調べ、107を一般許可する変更は採用しなかった。
新critical SCMを保持するBoot Guard/標準toolsへの固定導線/鍵hash/once claim/BootTask ACLも独立点検済み。
実bootと実サービスの健全性は引き続き未検証。


## epoch取消と固定phase

11filesの独立reviewで必須指摘なし。native closedの最初の発火とhadProofだけを回復条件にし、
source自身のclose・own stop・未確認teardownを回復扱いしないことを確認。
phaseは既知値のみ、Hostが保持する終了childのstage107時だけ採用し、finally清掃後に報告。
負例の生出力と復元hashはevidenceへ保存。実1ba serviceの失敗がこのraceだけとはまだ断定しない。

## epoch修正版の新boot準備

review_resource_monitorで旧1ba→新6e27、source v4、Prior SCM1352、meta SHAと38 pinsの一致を独立確認。
必須指摘なし。新boot/Stopped1077/Specific0限定、標準Upgrade後start、once claim、鍵3hash、SY/BA ACLを維持。
未知/timeoutの結果は再利用しない。guardはconstructorを実行せずcompile-only成功。

## Broker pipe終了処理

review_resource_monitorで製品/実pipeテスト/validatorを独立点検、mustなし。
借用writerを先にDisposeする案はstdin threadとの競合があるため不採用。広い例外の握りつぶしは追加しない。
Windows native 28負例/復元を確認。実214停止がこの問題だけに由来するかは未確認。

## pump実導入準備

review_resource_monitorでPumpStartupCase・snapshot・receipt・17pinsを独立確認し必須指摘なし。
6e27の既知214もHost finallyでRoot+aggregate停止確認後にのみ報告されることを確認。
新Boot eced/operator a15bの38pins、固定元/先package、new critical SCM/1077条件も独立点検済み。
実サービスの起動観測ACKと長時間稼働・prelogin操作の成否は区別する。

## workerの共通pipe wrapper

review_resource_monitorで共通WithPipeText/Pump/Run、陰性とbyte復元の結果を再点検。必須指摘なし。
inactive return、Release→scope閉鎖→pipe閉鎖→読取thread joinは維持。workerの不要なFlush例外を除去する。

## readonly切り分けとpresenceのTarget分離

ConsoleFacts/Native launcherは固定sshd保持pin・個別/aggregate Job・固定readonly winexeのみResume。
入力/画面取得/desktop switch/実状態変更は追加しない。元のTask.RunEx拒否は再利用せず無効化。
独立レビューでprivate-copy不足と成功判定不足を指摘し、実行前に是正。実fixtureはtask0/Job0/handle復元を確認。
Target分離の安全点検では、Presenceにpixels/座標/inputがなく後続workerが独立target検証することを確認。
view/inputの初期と前後照合、native desktop/WTS/observer失効、既存期限は維持する。

## duplex pipe

review_resource_monitorで接続先/匿名token/PID認証/清掃を変えないAsynchronous指定と実duplex回帰を独立点検。
初版のbackpressureを除去し、server側出力読取が待機する中でclient入力なしに書込み完了することを確認する。
旧指定だけ戻す負例は、入力を与えて両threadを終了させた後に意図したassertionで失敗する。

## 登録originへの固定

review_resource_monitorでprovider側の登録済みURL固定を採用。Root側で公開URLを推測しない。
strict ws loopback hintは受け取るだけで接続先には使わず、canonical enrollment URL/CA/TLS検証/署名peer照合を維持。
独立点検の空query/fragment指摘を反映、両負例と復元hashが現sourceに一致することも確認。mustなし。

## 認証pairと準備heartbeat

review_resource_monitorが認証pair、部分成功拒否、期限とchord維持、後desktopへの救済なしを点検。33負例/復元も確認、mustなし。
準備heartbeatは破棄だけでnativeへ転送せず期限も延ばさない。stop即閉鎖/その他の早期指示拒否を維持する。
暗号化handshakeの実成功と画面取得成功は区別し、未取得画像やPIN検証を完了扱いしない。

## 許可ボタンのfocus release

review_resource_monitorが固定view-only probeの入力なし/画像非保存/停止証明とprivate setupを独立点検、mustなし。
実単独probeはReadyとframeを取得し正常終了。暗号化前後のtype-only観測ではgrant直後release、Readyなしを確認。
WorkerProcessの準備中release破棄は未保持キーに限定し、期限・schema・stopと準備後転送を保持。
最終独立レビュー必須指摘なし。旧WorkerProcessのみへ戻す負例とbyte exact復元の生記録を保存。
