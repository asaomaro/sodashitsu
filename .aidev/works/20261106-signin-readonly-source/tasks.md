# 期限を維持したreadonly workerの共有

- [x] epoch内に限定したprivate readonly worker、固定操作/4path/上限/timeout/abort/終了待ち。
- [x] 既存登録readerの検査を共通関数へ抽出し、oneoff readerも維持。
- [x] Runtimeのsource分岐と準備後5秒lease、全teardownの回帰テスト。
- [x] 旧Runtime差替でwarmup前のconnector起動を捕捉。生ログ保存、byteexact復元。
- [x] 関連6files/124tests、server build/typecheck、package staging validator、signin bundle build成功。
- [x] 独立レビュー。要求timeoutの受信時monotonic照合など追加差分も必須指摘なし。
- [x] native SYSTEM readonly fixtureで20.059秒継続、外側Abortまで有効。task削除/Jobzero/runtime不変。
- [x] 統合版native通常non-admin token拒否、unknown op/foreign ACL path/oversize line拒否。
- [x] 統合版も20秒継続+拒否3件成功（22.190秒）、task削除/Jobzero/runtime不変。
- [x] 実装最終レビュー、1f7aff4eでmain push。
- [ ] 既存鍵/viewer/enrollment/historyを保持してprotected package更新、サインイン前実接続と再起動検証。

初回fixtureのStateDir過剰escapeはJSON.stringifyへ修正。修正後もwarmup timeout。
第2回ではworkerのready行まで約0.8秒で到達するphase記録があり、親の受信を切り分け中。
両試行はtask削除/Jobzero/runtime不変を確認。成功とは扱わず、本番serviceへは未導入。


Windows PowerShellのConsole.Outによるready通知はstdin終了後まで届かなかった。
第3回のnative記録は受信16bytesが10.823秒/child終了10.890秒で、warmup timeoutを捕捉。
raw OpenStandardOutput UTF8 Write/FlushとOpenStandardInput strictUTF8 readerへ変更後、
第4回はwarmup599ms/初回登録982ms/status1021ms、次回登録13ms/status45ms。
生成presence/非通信endpointのreadonly検証であり、実サインイン接続の成功とは分ける。
既存Presenceの120秒epoch境界は今回緩和しておらず、長時間接続は別残件。


## 導入互換性を維持する統合

新PSファイルをRequiredPathsへ増やすと、旧b499 manifestがstrict Upgradeで読めなくなる。
旧検証やschemaは緩めず、新workerと共通読取を既存read-signin-enrollment.ps1に統合。
固定-ReadonlySource分岐のみ-StateDirを受け、従来oneoffは-StateDirを拒否して1回返却/終了。
package三つのリストはHEADと完全一致。最終System実機fixtureでも更新scriptの20秒継続/拒否3件を確認。


## Session間worker起動の修正（2026-11-07）

- [x] 実機のCreateProcessAsUserW Win32 5を固定stage診断で特定。
- [x] protected observed Host identityからの明示parentとHost保持aggregate/individual Jobを実装。
- [x] Root handleで自Host非所属を確認。Rootはbreakawayなし、anonymous、Hostのみ保持。
- [x] 正常/異常終了はRootとaggregate双方0確認を維持。
- [x] Windows native Host/RunSession/Worker既存checksとcompile/staging成功。
- [x] native suspended fixtureでcaller Root所属、指定親/worker Root非所属、2 Job所属、個別peer維持、全回収を実確認。
- [x] 親属性のみ旧状態へ戻すnegativeは同一fixtureでWin32 5により失敗。修正sourceをbyteExact復元。
- [x] 関連75 tests/server build成功。製品差分とfixture/setupの独立レビュー必須指摘なし。
- [ ] mainへ反映、現在の異常runを結果unknownのまま保存し、標準Upgradeで実導入。
- [ ] actual service HostBinding/長時間接続/通知/再起動前ログインなしの検証。

fixtureはOS動作検証用で、製品Host認証の成功とは分ける。固定sshdを保持handleで読取のみ確認して明示親にする。
全workerはCREATE_SUSPENDEDのまま、一度もResumeしない。__FIXTURE_ROOT__はreview済みprivate rootへstage時に固定する。
negativeのunchanged=falseは、意図した例外終了でverified markerを発行しなかったことを表す。鍵変更を表すものではない。
直後のreadonly snapshotはtask0/unchanged=true、runtime digest d583496c...を確認した。


## b38 Specific107固定caseと再起動準備

- [x] 現b38/c12/started digest・PID15588/creation/owned start receipt・SCM1360を固定。
- [x] retained process handle/不在87/別incarnationで元Host消滅を検査、生存/AccessDeniedを拒否。
- [x] 生成データ正例9分岐・識別/SCM/Host/中断/identity guardを確認。started digestのみ除去する負例で失敗、source byteExact復元。
- [x] caseとfixed operator setup独立レビュー、実inspect→recover成功。unknown保存・keys保持・started=false。
- [x] 新c55 packageを生成。1ba65bb0…、readonly Preview validated=true。
- [x] 標準Upgradeは旧SCM状態1066/107を拒否、before-marker/no transition/b38/initial維持を確認。拒否済taskは再使用しない。
- [x] 復旧用SSH Automatic、保守接続、通常agent1名idleを確認。完了済旧BootRecovery3件はdisable、既存logon/保守taskは維持。
- [x] fresh191 operatorとnew-critical-SCM/1077/manualの一回Boot workflowを準備し独立review。guard compile-only成功。
- [ ] 許可済の再起動を/fなしで行い、ログイン前のSSH/BootMaintenance/標準Upgrade/実サービス起動を確認。

固定case: runs-startup107-30f9b30c5bb8430ea8a52531764b4d45へ元runを保存。
標準UpgradeScmのExit0/1077条件は緩和しない。再起動でOS状態が1077へ戻ったことを実確認して進む。
Boot task c3efd99d901f43c7979ccbf358534579は15秒delay/12分上限、fresh191 Rootの標準toolだけを一回呼ぶ。
鍵3ファイルのhashはupgrade前後で確認する。成功receiptは起動観測ACKであり、実接続・長時間健全性の確認とは分ける。
再起動後の復旧経路は未検証であり、準備だけで成功としない。


## 実boot結果とepoch取消

- [x] 実rebootは/fなしで要求し、手元ログインなしでSSH再接続（新boot 2026-11-06T17:05:45.5Z/Session0/SID一致）。
- [x] 新SCM1352:134384583610655456を実確認。Boot task c3は標準Upgrade b38→1ba/起動観測ACK1回まで成功。
- [ ] 実serviceはその後再び1066/107で停止。run217a29bb...の結果はunknownであり、起動成功とはしない。
- [x] readonly snapshotでHost8104/creation・started digest・runtime d583…不変を確認。まだrun再利用なし。
- [x] native証明後のsource準備/初回read中のepoch喪失を、確認済みteardown後にfresh probeへ戻す修正。
- [x] source単独不正/未確認native終了は引き続き拒否。4追加tests、旧Runtimeのみ戻す負例2件失敗→byteExact復元。
- [x] 固定201..215/240の診断番号を追加し、text/paths/keysを出さず停止原因を伝播。旧Presenceのみ戻す負例4件失敗→復元。
- [x] 関連26files/465tests、server typecheck/build、native Host/RunSession/Worker checks成功。独立レビュー必須指摘なし。
- [ ] epoch修正版を標準更新して実serviceとprelogin接続を再検証。

新診断番号: 201 package/runtime、202 console、203 journal open、204 journal照合、205 Host pin、
206 parent handle、207 parent照合、208 aggregate open、209 aggregate照合、210 pipe、211 worker create、
212 connect待ち、213 pipe認証、214 pump、215終了行、240 Node entryのreject。
番号は失敗状態の説明だけで、正常終了や入力解放ACKを意味しない。Specific報告は従来同様全Job清掃後。

## epoch修正版の実導入（再開後）

- [x] 2a7b2032のWindows package v4を生成、manifest 6e27d59e…、readonly Preview validated=true。
- [x] ビルド用junctionは元リンクを退避し末尾区切りのみ修復。依存バージョンは変更しない。
- [x] 旧1ba/run217aの固定EpochStartupCaseを独立点検、inspect/recover各一回成功。unknown/keys保持/cleanExitClaimed=false、runs initial。
- [x] fresh8cad標準operator（旧1ba→新6e27）とBoot23bfを準備。Prior SCM1352を固定しguard compile-only/独立レビュー成功。
- [x] 完了済Boot c3を無効化、新Bootは未実行を確認。SSH Automatic/Running、対話ユーザー不在、SCM1066/107/Manualを確認して/fなし再起動要求。
- [ ] 新bootの標準更新・実サービス・prelogin接続を確認する。

Boot receiptの成功は起動観測ACKに限り、継続稼働や操作成功とは区別する。鍵・元runは保存する。

## 実6e27のSpecific214とpipe終了処理

- [x] 新boot 2026-11-06T18:19:22Z、SCM1268:134384627775760276。標準Upgrade 1ba→6e27、run8b7fbece…の起動観測ACKを一回取得。
- [ ] その後Specific214で停止。prelogin接続成功・継続健全とはしない。
- [x] Windows NamedPipeでpipe.Dispose後のleaveOpen StreamWriter.DisposeがObjectDisposedExceptionとなることを再現。MemoryStreamでは再現しない。
- [x] Broker Pumpのwriterを借用wrapperにし二重Flushを除去。Job0/pipe閉鎖/outboundJoin後terminalの条件は維持。
- [x] 実pipe回帰テスト、Disposeのみ戻す負例を含む28 controls、byte exact復元後再成功。独立レビュー必須指摘なし。
- [ ] 修正版packageを標準導入し実サービスを再検証。

## pump修正版44060の新boot

- [x] main 6b277690、Windows clean sourceからpackage44060f73…作成、native staging compile/read-only Preview成功。
- [x] 実6e27/run8b7fのreadonly snapshot不変。Specific214/Host5140/SCM1268/owned receiptを固定したPumpStartupCaseを独立点検。
- [x] inspect/recover各一回成功。元runをruns-startup214-4375c692f9714ff59299dc76e675f29bへunknownのまま保存、鍵保持、正常終了の主張なし。
- [x] Coreは診断名214→107を戻すと旧検証済Coreとbyte一致。
- [x] 新operator a15b/Boot ecedの全38pins/hash/old6e27→new44060/source/Prior1268を独立確認、guard compile-only成功。
- [x] 旧Boot23bf disable。SSH Automatic/Running、ユーザー不在、runs initial/transitionなしを確認し/fなし再起動要求。
- [ ] 新boot結果と長時間接続を確認。

## worker側の同じpipe終了処理

- [x] Runにも同じ閉鎖後Flush経路を確認。WithPipeTextを共通化しBroker/worker双方でpipe唯一所有と借用writerを維持。
- [x] 実NamedPipe回帰・共通helperのusingのみ戻す28controls・byte復元成功。独立レビュー必須指摘なし。
- [x] package44060実boot更新/startACK成功、newSCM1272:134384635154411000、Host13176/runf2ee03df…、Running0/0を継続観測。
- [ ] signin aliasはreconnecting。prelogin画面接続/通知は未検証。サービスRunningと接続成功を混同しない。

## a841実更新とreadonly切り分け

- [x] 73a088b4 package a84100a5…をreadonly Preview後、正常停止44060から標準Upgrade。待機側50秒の上限後に観測のみでtask0/receipt確認。再実行なし。
- [x] fresh453d start一回、run d54273a2… ACK、実Host10260 Running0/0。
- [x] readonly console fixture（GUI exe、入力/画面取得なし）を個別/aggregate Jobで実行。終了0/Job0/自身station/thread復元、task削除確認。
- [x] 実Session1/WTSConnected/emptyuser/QueryToken1008/SystemTcb/WinSta0/Winlogon/Candidate/Targetすべて確認。private非表示windowのWinEvent markerも成功。
- [ ] signin alias reconnectingの原因は継続調査。実Broker presence単独検査を準備。

元Task.RunExはArgumentExceptionで実行前拒否。一回claimを再利用せず無効化。
readonly console fixtureのtask上限は1分、子の上限は8秒。実行ファイル/親sshd実体を固定し、任意プログラムの入口はない。

## presenceの遅延とTarget分離

- [x] 実製品Brokerを固定presence専用・15秒heartbeatで検査、ctx1/pulse6/terminal1/exit0。capture/inputの起動なし。
- [x] fresh18秒の時間計測でfirstContext283ms/firstPulse5173ms/最大gap12959ms/2pulseを確認。JS側1000ms期限では継続できない。
- [x] 時間はPSの20ms polling時点。境界近傍の厳密判定とせず、今回の秒単位の差を観測する。
- [x] Consoleの単独candidate3ms/marker59ms/Target44ms。Targetだけが主因とはまだ断定しない。
- [x] PresenceのみInitialTarget/ReadScopeで物理target列挙・照合をしない。native WTS/desktop/observer/WM_DISPLAYCHANGEと1秒期限は保持。view/inputは従来の初期/前後target検証を維持。
- [x] 30 native controls成功、2追加負例でpresenceの初期/継続target参照の退行を捕捉しbyte復元。
- [ ] 実package更新後にpulse間隔・alias・画面を再確認。

最初の負例if(false)はCodeDomのwarning-as-errorでassertに届かなかったため無効とし、分岐削除へ直して再実行した。
検査setupは登録前の固定stage hash/privateコピーを独立点検し、missing copyの指摘を実行前に修正。

## 実ad9のpulseと同期pipe

- [x] d8694c18 package ad9fdc50…を標準更新、run2425c26d…のACK。Host11744 Running0/0、aliasは未接続。
- [x] Target分離後firstpulse1090msへ短縮。ただしmaxgap9130ms/18秒6pulse。主因が残ることを確認。
- [x] 実Nodeと同じ2秒heartbeatでも時刻[4099,8160,14214,16237,18065]、6秒gap。定期入力へ偏る出力を観測。
- [x] Windowsの同期client pipeでpending ReadFileがWriteFileを妨げることを、実duplex pipe/OS読取待機で回帰検証。
- [x] worker pipeのみAsynchronousへ変更、匿名token/PID認証/Scope/期限/清掃は維持。31 controls成功、Noneのみ戻す負例で意図assert失敗、byte復元。
- [ ] 修正版の標準導入と実pulse/alias/画面確認。

初版テストはserver出力読取なしのbackpressureを作ったため無効。server readを先に待機し、clientへの入力は独立出力判定後だけ送る形へ是正した。
実fixture終了とJob0/復元を確認し、検査失敗を製品成功扱いしない。

## 実a173とRootローカルorigin

- [x] 2562faafをWindowsでbuildしたa1736091…を標準更新、runba285fb1… ACK、Host2468 Running0/0。
- [x] presence初回614ms/最大gap443ms/18秒50pulseへ改善。f1 signin alias onlineを維持。
- [x] owned Browserの公開指紋8d0010…2686/Provider6c5823…95d5/required marker一致をreadonly確認。秘密鍵・pinのresetや移動なし。
- [ ] 実Browserは暗号化接続失敗。RootRelayがbrowser origin localhostをforwardする一方、Signinはenrolled origin完全一致のみという不一致を修正中。
- [x] strict loopback hintのみ登録済みURLへ正規化、接続にはclassified.paramsを使用。他origin・credentials/query/fragment・非canonical hint・別machine/roleは拒否。
- [x] 実socket fixtureでrawhint127:1ではなく登録済みfixtureへ暗号化handshake。467 tests/26files、server typecheck/build成功。
- [x] 旧Enrollmentのみ/旧Endpointのみ戻す負例それぞれ意図case失敗、byte exact復元。独立レビューmustなし、空?/＃も拒否追加。
- [ ] 修正版の実適用・画面表示・サインインを確認。

## 実4924と認証/準備待ち

- [x] e50d50ac package49241f17…を標準更新、run0481c2d0…のACK。owned Browserで暗号化接続が成立しsignin許可待ちまで確認。
- [ ] 閲覧grant後Ready前に終了、画像はまだ確認できていない。PIN未入力。
- [x] viewerは準備中も2秒heartbeatを送るがworker.send旧gateがReady前のheartbeatで閉鎖する経路を修正。10秒Ready期限内のheartbeatだけ無害に破棄、内部native beat継続、その他早期操作は拒否。
- [x] 旧workerprocessのみ戻した新caseが失敗、byte exact復元。
- [x] 認証完了がkeydownでdesktopを変える競合に対し、既存認証workerと同じUnicode各char/bareEnter/数字の2INPUT一括投入へ。直前権限検査/完全2件のみ成功/文字間再検査、通常chord維持。後desktopへの別呼出し救済はしない。
- [x] 失効・partial0/1・遷移中neutral・別keyup抑止・chord・TTL・target失効を生成dataで確認。実OS入力を出さず33controls/byte復元成功。
- [x] 関連474tests/26files、server typecheck/build成功。両差分独立レビューmustなし。
- [ ] 実パッケージ更新、画像とPINサインインを再検証。

## 37df実導入と許可ボタンのfocus release

- [x] c2e269f6 package37dfを標準Upgrade、task0/receipt確認。50秒待機上限後は観測だけで確認し再実行なし。
- [x] fresh start一回、run bc457577…の起動観測ACK。
- [x] 固定SYSTEM view-only probeはready681ms/frame762ms、1280x800、37256 bytes、18秒後exit0/terminal1/task削除。入力なし、画像保存なし。
- [x] 実ブラウザの暗号化前後でtypeと方向だけを観測。signin_grant直後の同時刻releaseを確認、ready前に切断。
- [x] native ready前はキーを保持していないためreleaseを破棄。期限/失効/schema不正は拒否、ready後は従来通り転送。
- [x] WorkerProcessのみ旧HEADへ戻す負例でfocus-release回帰が失敗、byte exact復元。
- [ ] 独立レビュー、標準更新後に実画像と入力を確認。

37df導入成功を画像配信成功としない。view-only単独取得とservice/browser経由を区別する。

## 17a1実画面とサインイン

- [x] 473 tests/型検査/server build成功、独立点検必須指摘なし。8542306dをmain push。
- [x] Windows buildでpackage17a1生成/readonly Preview成功。旧37dfは標準stopでjournal complete、標準Upgradeを一回実行しtask0/receipt確認。
- [x] fresh start一回、run3793c5c5…ACK。許可grant直後releaseがあっても実Ready/1280x800画素/描画ACK継続を確認。
- [x] 実ロック画面を目視、操作権取得後EnterでPIN画面へ。画面変更では専用接続が終わり、明示的な再接続/再許可が必要だった。
- [x] 初回の高速入力では認証拒否。二回目はペースを落としEnterを追加せず、OSの自動認証で通常desktopへ遷移。入力値・画像はrepoへ保存しない。
- [x] WMIでログインユーザーあり、通常machine online、既存2pane復帰、通常desktop画像を目視。既存serviceもrunning/observedを確認。
- [ ] 高速入力の拒否原因・画面遷移時の接続継続・長時間/反復/次回再起動の自律復帰は別残件。
- [ ] Windows通常serverの最新build/handoffと通知再確認。

検証helperのwait-readyは「閲覧中」完全一致で「サインイン画面・閲覧中」を見落としてtimeoutした。
実Ready/frame継続は別のtype-only trace/実bitmapで確認し、helperを末尾照合へ修正。製品のReady timeoutとは区別する。

## 通常server更新とWindows通知の再確認

- [x] 通常pnpm launcherはstoreのjunction検査で失敗。既存Corepackの9.15.9と一時shimを使い、依存/lock変更なしでWindows全体build成功。
- [x] source8542306dのhandoff成功。親18888と既存2pane IDを保持。wrapperのsamePaneIds失敗条件を独立点検で修正してから実行。
- [x] fresh専用root/17881/CDP17981のWindows native Electronで、自前fake agentの作業完了通知を確認。voice offでは1046ms、system voice on/quietFullscreen trueでは2551msでvisible/source一致。
- [x] 使用したのは自前検証エージェント。実モデル/他作業者/通常assistantのprefsは使わない。音声が実際に耳へ届いた証明ではなく、読み上げ設定下の通知window確認。
- [x] 認証server.stop後、専用2port待受0/ownedprocess0を確認し専用rootを削除。通常7780は維持。

別Windows PCで報告された固有設定/原因の確定とは分ける。今回sr-pc Windows nativeで当該通知は再現せず表示できた。

## 正常停止後のboot fallback

- [x] 事前stop complete限定のSYSTEM BootTriggerを準備。critical SCMの保持handle・固定System32パス・SYSTEM/session0・critical・creationを照合し、旧1272 instanceを拒否。
- [x] boot単位CreateNew claim後に標準control startだけを実行。unknown復旧・鍵変更・要求再送なし。timeoutは完了不明のまま保存。
- [x] SYBA root/16hash pins/boot trigger15秒/IgnoreNew/4分上限/flags18を独立点検。child compile-only成功、未実行/有効を確認。
- [x] 完了済Boot ecedのみ無効化。SSH Automatic/Runningと保守/logon task有効を確認。
- [x] 専用serviceを標準stopしてjournal completeを取得、通常agent idle/2paneを確認して/fなし再起動要求（exit0）。
- [ ] 新bootで手元ログインなしの起動・実画像・認証/通常復帰を確認する。

通常shutdown後の未観測stop/unknown journalを自動修復する機能ではない。
このfallbackの受入範囲は事前に標準stop completeを確認した管理された再起動。

## boot fallbackの実起動

- [x] 新boot 2026-11-06T20:58:31.5ZをSSHで確認、userPresent=false。新criticalSCM1340:134384723260061787。
- [x] 恒久BootTriggerが手動実行なしで一回成功、taskResult0/instances0、rune0eb64e9… observed ACK。
- [x] 保守・signin alias復帰、暗号化接続の実ロック画像とEnter操作でPIN画面への遷移を確認。
- [ ] 最初の接続失敗/Ready後終了が繰り返され、現在は安定性を切り分け中。新bootでのPIN認証/通常復帰はまだ確認していない。

検証helperが古いtabを残す可能性を除くため専用profileの既存tabを閉じるよう変更。
新tab作成前に全tabを閉じた最初の修正はview待機でtimeoutしたため、先に新tabを作成してから旧tabを閉じる順へ修正。
これを製品の修正とは数えない。view-only probeの初回は旧packageのNative hash pinで起動前拒否。
新17a1の実Native hash45e395cd…へ固定しfresh taskで再検査する。拒否済みtaskは削除、再利用しない。

## 新bootの接続断とネットワーク切り分け

- [x] hash pinを17a1 Nativeへ修正したfresh view-only probeはready659ms/frame735ms、1280x800/37877bytes、18秒/exit0/terminal/task削除。起動前拒否した旧pin試行とは分ける。
- [x] 全machineとSSHも同時に途切れた時点があり、Kernel-Power506 Reason12を確認。WOL送信後SSHへ再接続できたが因果を断定しない。
- [x] 4分だけSystemRequired/ExecutionRequiredを保持する検査を独立点検し実行。DISPLAY要求/電源設定変更なし。finally解除/doneを確認。
- [x] 保活中にも操舵室LAN192.168.0.95:443/7780への接続がSocket AccessDenied、NodeでもEACCES。省電力だけを原因としない。
- [x] ネットワーク/既定FW outboundはAllow。既存Codex offline block規則は別SID1003向け、SSHはowner1001でoffline restricted SIDもなし。これらの規則は変更しない。
- [x] Cato Networks VPN serviceとESETの存在を確認。原因確定ではなく、利用者へログイン前/LAN制限の有無を質問。VPN/保護機能の停止、例外追加、SSHのforward制限変更は行わない。
- [ ] 新bootのPIN認証/通常復帰と継続安定性は未確認。SSHの読取とservice running/observedは維持。

Power要求の意味はMicrosoft公式PowerSetRequest文書で確認。今回の一時保活は製品変更ではない。
https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-powersetrequest

追加readonly設定: CatoのローカルPreLoginは0、InitialAlwaysOn/ConnectOnBoot値は未設定。
クラウド側のAlways-On/LANポリシーの有無やESETの判断理由は、この情報だけでは分からない。

## 再開後の同bootサインイン成功（2026-11-07）

- [x] 新たな再起動や設定変更なしで、保守/signin aliasがonlineに復帰していた。同boot 20:58:31.5Z、未ログインを確認。
- [x] fresh暗号化接続の実ロック/PIN画面を目視し、許可済み入力で認証。利用者のWindows手元操作なしにuserPresent=trueへ遷移。
- [x] 通常操舵室の自動復帰・既存2pane・通常desktopの実画像を確認。signin aliasはログイン後にinactiveとなる。
- [x] Root443のTCPとGitHub DNSも成功。Windows Cgitは22647015へfast-forward更新。前の失敗原因を解消したとは断定しない。
- [x] 復帰後のheadless/UIA継続検証は下記の130秒で成功。

正常停止後の管理されたboot→サービス自動起動→未ログイン実画面→PIN認証→通常復帰の工程を同bootで確認できた。
途中に通信拒否と時間を空けた再試行があり、無停止/即時接続の成功とは区別する。

## 復帰後のheadlessと仮想マイク

- [x] 新しいWinExeの自前WinFormsを作成。remote headlessのUIA set_value/invokeとimage fallback成功、130秒後も同じfixtureを観測しrelease。expiresAt=0。値とclick数も実fixture側の記録と一致。
- [x] 初回のPSフォームではUI照合に失敗したため成功扱いせず、GUI専用exeのfreshフォームで検証。両fixtureは停止し、専用root除去を確認。
- [x] VB-Audio CABLEのInput/Output/16chがOS再起動後もPresent/OK、既知の固定render GUIDを確認。
- [x] マイク許可/endpointの2項目だけ新規backup後、一時的にCABLE Inputへ固定。既存wireで440Hz生成PCMを6秒300frame送信、ACK249、starting/running/stopped、errorなし。物理マイク未使用。
- [x] マイクの2項目は元の値と省略状態を復元し確認。他設定は最新値を保持。Default audio deviceやVPN/Firewallは変更しない。

busy時は中間frameを最新frameへ置き換え、期限切れframeにもACKを返すため、ACK数は300frame全ての再生/受音を証明しない。
CABLE Outputからの受音測定・実通話は残件。通常Windowsサーバーのheadless130秒とsignin workerの120秒境界を混同しない。


## 仮想capture側の受音測定（2026-11-07）

- [x] 既知のCABLE Output capture endpointだけを開く、20秒上限のWinExeを新規作成。所有者/host/session/非ロックを確認し、物理マイク・既定deviceへのfallbackなし。生PCMはRAMだけで零化。
- [x] 無音・997Hz正例・2000Hz負例、周波数を誤ったdetectorでの拒否を生成音で検査。初回compile後にロード済みnegative DLLの削除が失敗したため、fresh processで検証し直した。デバイス検査成功とは区別。
- [x] 初回実行はPCがロック中のためpreflightで停止。headlessもunauthorizedで拒否し、成功扱いにしない。通常経路でロック/PIN画面を実確認し、低速入力で解除、通常画面へ復帰。
- [x] 固定仮想renderへ997Hzを送信し、captureでbaseline99 chunks/peak0、信号24 chunks/peak magnitude8022を検出。20ms×24=約0.48秒の受音を確認。
- [ ] 同試行のsenderは途中でVirtual sink unavailableとなり終了。6秒の連続転送の成功ではなく、停止原因と再試行は残件。
- [x] 同じ既存Wasapi renderの単独経路に生成音300frameを送り、例外なし/約7.1秒で終了（修正したcounterで再測定）。仮想デバイス単独の成功だけで製品wireの途中停止を解消済みにしない。
- [x] 仮想mic2fieldsは元の値と省略状態へ復元。物理マイク・default device・VPN/Firewall設定は変更しない。

測定補助ソースはoperational/VirtualCable{Capture,Render}.cs。実ユーザー/host/session/endpoint固定の単発検証用で、製品へ導入する常駐プログラムではない。実通話・全frameの受音は未確認。


直接render補助の初版counterは、失効してWriteが送らずにreturnした場合もcountする不備が独立レビューで検出された。boolでReleaseBuffer(copied=true)の完了だけを返す形に修正し、300frame/7125msを再測定。これはWASAPI bufferへの書込であり、全frameのcapture受音の証明ではない。


## 通常headlessの12分継続（2026-11-07）

- [x] expiresAt=0の同一leaseを12分維持。45秒間隔で17回の実画像取得に成功、frameSeqは1→3505、最後にrelease成功。OS入力と画像保存なし。
- [x] この間に通信拒否/切断は再現せず。画像は各観測時点の鮮度条件で取得するが、全時間の映像連続性を測ったものではない。
- [ ] 長時間/反復/再起動前後全体の安定性と、過去のEACCES原因は未解決。通常headless12分の成功を専用signin120秒scopeの拡張と解釈しない。


製品wireの再試行もsent94/ACK76/starting→running→unavailableで停止した。captureはbaseline99/peak0、信号73chunks（約1.46秒）/peak magnitude8024。物理マイクなし、設定復元成功。初回だけの偶発として扱わず、製品経路の継続転送を未解決として残す。


## 実ブラウザUIでの仮想マイク再現

- [x] 生wireスクリプトはブラウザ実装と違いpending上限12/ACK期限を省略していたため、その途中停止だけでUIの不具合とは判定しない。
- [x] 通常ブラウザUIを実行し、Chromiumのfake media device/fileに997Hz生成WAVを固定。物理マイクは開かず、DOMの「マイク転送中」とブラウザ自身の送受信frameで判定した。
- [ ] 受音測定ありではsent68/ACK56/maxPending11で6秒時点のDOMが転送中ではなくなった。captureは57chunks（約1.14秒）の997Hzを検出。測定なしでもsent66/ACK54/maxPending12で同様に停止したため、capture負荷だけの現象とは扱わない。
- [x] sr-pc内loopbackの製品wireは300frame/ACK298/starting→running→stopped、errorなしで完走した。loopback初回は検証側のstart.machineId省略で接続不成立、修正後に測定。ネットワークを通るUI経路の成功とは区別。
- [x] 各試行後にmic設定を復元し、captureの所有process終了/専用root除去、ブラウザ終了を確認。
- [x] 中継元サーバーは5秒間に396 CPU ticks使用。15秒のCPU profileではnativeファイルIOとLinuxProcessInspectorの/proc走査などが観測された。音声停止の原因と断定しない。profileの生データはprivate一時領域だけ、repoは集計だけ。計測後にinspectorのlistenがなくなったことを確認。

実ブラウザの未解決停止を優先し、中継経路・ACK待ち・サーバー負荷を切り分ける。500ms等の既存期限を原因未確定のまま緩めない。
