# 接続ボタンからのWindows起動・接続: 独立点検

担当: resume_resize_design。実装編集・Windows操作・他worktree/main変更はしない。

## 設計の初回確認

server operatorが起動時に明示する固定argv JSON `SODA_VSCODE_CDP_COMMAND` を使い、認証済みviewerの既存WSだけからdiscover/connectする方式は妥当。ブラウザから任意のcommand/argv/CDP endpoint/profileを受けず、stdinの固定操作JSONだけを渡す。実行はshell:false。初回tokenをstdinだけで渡すone-shot接続により、ユーザーへのtoken表示や新しい永続資格を不要にする。

実装時に必要な境界として親へ通知した事項:

1. 設定をrepository/plugin提供値から自動有効化しない。operator明示の環境変数だけを使う。
2. launchConnectのtargetIdは、当該viewerの直近discover結果・epoch・TTLで照合する。helperも接続直前に同じIDのworkbenchを再列挙・検証し、候補消失時に別窓へfallbackしない。
3. cancel/timeoutで終了するのはこのrequest所有のhelper/bridgeだけ。既存VSCodeも新しく起動したVSCode本体もkillしない。専用profileの新規起動を使い、通常のVSCodeの終了/再起動や設定変更をしない。
4. tokenはstdinのみ、argv/stdout/stderr/logへ出さない。helper stderrや例外文面は秘密を含む可能性があるため、serverからは生で記録・返却せずgeneric errorにする。
5. cancel/epochで旧discover結果・旧launchのbridge接続を無効にする。token消費前の取消しは招待自体を消す。token消費後は所有bridgeのcleanupを待つ。
6. helperへ渡すSoda originは固定のserver-side接続先、またはadmit済みOriginを正規化して使う。raw Host/Forwarded Hostから生成しない。既存OriginPolicyはextraOrigins一致ならHostを問わず許すため、Host由来URLだと短命tokenを別の宛先へ送る経路になる。HTTPS信頼検証/HTTP loopback制限を維持する。
7. stdout量・候補数・文字列長・実行時間を制限し、固定schema以外の応答は拒否する。Code.exeやbridgeのログをhelper protocol stdoutへ混ぜない。
8. 1つの起動/接続処理を予約し、待機中の別viewerが奪えないようにする。接続済みcaptureの時間上限と、起動/handshakeのdeadlineを混同しない。

Windowsの--codeは固定のexeを使う案。code.cmdをshell:falseで動かすことを当然と仮定しない。WSLからWindows helperを呼ぶ場合も同じ固定argv＋stdin契約を使い、HTTP接続先の到達性は別途確認する。remote利用時の起動対象はserver側Windowsであり、閲覧端末ではない。

差分の実装と検証結果を待つ。

## 実装の独立レビュー

DesktopCdpLauncher / relay・protocol・compose / cdp-launcher / bridgeMain(signal) / Vue / manifest / unit・E2Eを確認した。

- 固定argvは起動時環境変数だけから読む。shell:falseで実行し、ブラウザはlaunch/列挙済みtargetへのlaunchConnectだけを送る。helperへのSoda originはoperator固定argvの--sodaで、rawHost/browser指定値を使わない。
- serverは1helperだけを所有。discoverはstdout上限32KiB、候補32件、id/titleの型・長さを検査し、正常exit後に結果を確定する。接続前helper終了もclosed promiseでviewer状態へ戻す。
- 候補はviewerごと60秒のTTLで保存し、操作ごとpairingEpochを進める。cancel後の遅延discoverや、別viewer/失効した候補を採用しない。
- helperは固定loopback CDPを再列挙して選択targetを確認し、bridgeMainも同じIDで再検証する。接続時に別targetへfallbackしない。
- discoverはECONNREFUSEDの場合だけoperator固定Code.exe/専用user-data-dirから新規起動する。他のHTTP/JSON異常で起動せず、既存VSCodeを終了しない。spawnはdetached/unrefで、cancel対象にCode.exe本体を含めない。
- tokenはserverが発行してstdin JSON→helper内のbridgeMain argv配列へ渡す。OSコマンドライン・viewer invitation・stdoutへ載せない。stderrはserverで破棄し、失敗はgeneric message。
- helper stdin EOFをAbortSignalへ接続し、one-shotの既存stopを通してcaptureの入力解放/fit解除を行う。resident登録/profileの永続資格を作らない。

### cleanup期限の指摘と修正再確認

初版はconnectでもEOF後5秒でhelperを強制killしたため、1CDP commandが5秒待つ状態ではviewport解除より先に終了し得た。親へ通知し、connectでは強制killせず、EOF後もcloseまでglobal所有slotを維持する変更を確認した。強制killはCDP overrideを作らないdiscoverだけに限定。指摘は解消。

EOFを無視する異常connect helperが存在するとslotを保持し続ける制約がある。cleanupを短縮して別共有へ進むより安全側の挙動であり、文書化を前提とする。WSL→Windowsの実プロセスEOF/終了の条件は実機検証範囲として区別する。

### 検証確認

独立実行: DesktopCdpLauncher.test / DesktopCdpRelay.test / scriptsのlauncher・resident・capture試験、**5ファイル68件合格**（`/tmp/vscode-cdp-launcher-independent.log`）。`git diff --check`合格。

親から新launcher E2E **1件合格8.4s**、Windows既存target1件discover/exit0の報告を受領。WindowsのVSCode新規起動は行っていないため、その動作や実Windows上のEOF cleanupを合格と主張しない。

コードに追加blocking指摘なし。必要なnegative control・復元後の最終build/typecheck/E2E結果は親の検証記録へ合わせて最終化する。

## 最新差分の再レビュー

- one-shot bridgeのopen/messageにstopped guardを追加した差分を確認。EOFで停止した後の遅延open/paired等から共有を再開しない。
- slow cleanup試験は接続helper cancel後に6秒分timerを進め、killが呼ばれないことを検査する。旧5秒killへ戻したnegativeはSIGKILLが1回呼ばれる期待どおりの失敗（`/tmp/cdp-launcher-cleanup-negative.log`）。元bytes復元後のlauncher unitは **6件合格**（`/tmp/cdp-launcher-cleanup-restored.log`）。両ログを独立に確認した。
- READMEはWindows直接/WSLの固定argv、server側Windowsを対象とすること、remoteURLと固定--soda、専用profileと通常profileの違い、connect helperのcleanupを打ち切らない制約を説明している。
- 親報告ではroot build/typecheck、対象72 unit合格。最終4 E2Eは旧3件合格・新launcherのfit復帰期待だけが800対1280で失敗した（`/tmp/cdp-launcher-final-e2e.log`を独立に確認）。source.setViewportSize(800)自体がPlaywrightのEmulation overrideであるため、clearでnative1280へ戻ることはcleanup失敗の証拠にならない。
- 新launcher試験は開始時にEmulation.clearDeviceMetricsOverrideし、native originalSizeを計測してfit→stop後そのobjectへ戻る期待に修正。これは他clientのoverrideを保存復元しない既知境界と一致する試験修正で、製品コードを緩めていない。該当1 E2Eの再実行結果を待つ。

最新差分に追加blocking指摘なし。`git diff --check`合格。

## busy表示・baseline修正の再確認

- launcherBusyをstatusへ追加し、停止後もhelperが閉じるまで起動ボタンを無効化、job.closedでstatusをbroadcastする差分を確認。serverのglobal slot拒否も維持する。start時はstatus(v)のみで他viewerへのbusy開始通知は即時でないが、操作権限を迂回する問題ではない。
- launcher E2Eは同じCDP sessionでset333→333を観測→clear→nativeサイズを採寸するよう修正された。他sessionであるPlaywrightのoverride所有問題を避ける、妥当な前提設定。該当E2E **1件合格9.1s**（`/tmp/cdp-launcher-native-baseline-e2e.log`）を独立に確認。
- 最終対象単体/統合は **6ファイル72件合格**（`/tmp/cdp-launcher-ready-units.log`）を独立に確認。
- Windows UIの最初の2回接続・停止ログはmanualCommandVisible=0だがopaque=falseだったため、それだけでは実画像描画の合格と扱わない旨を親へ通知。親が実frame/opaque pixel待ちを追加して検証予定。

製品コードに追加blocking指摘なし。最終4 E2EとWindows側の追加検証結果を待つ。

## 最終修正の再レビューと検証結果

job.closedの全status broadcastが失敗案内を直後に上書きする実ブラウザ不具合に対し、global busyだけを専用 `launcherState` メッセージで更新する修正を確認。start時にも全viewerへ通知し、Vueはbusyだけを変更するため、以前通知した「他viewerのbusy開始が遅れる」点も解消する。エラー文字列・接続状態・画像・操作権限へ触れない差分として妥当。

旧broadcastへ戻したnegativeはstatus回数8期待に9となる期待どおりの失敗（`/tmp/cdp-launcher-status-negative.log`）。親による正Relay snapshotとのexact cmp復元報告あり。復元後の **6ファイル72件合格**（`/tmp/cdp-launcher-release-units.log`）を独立に確認した。

新launcher E2Eは最終差分で **1件合格11.0s**（`/tmp/cdp-launcher-release-e2e.log`）。旧CDP3件は直前まとめで通過しており、最終差分はbusy専用更新のみ。最初のまとめを4件一発通過とは扱わず、baseline前提修正とstatus修正を検証記録に残す。root build合格の親報告を受領、root typecheckログの各Doneと、作業フォルダ外smoke **PASS**（`/tmp/cdp-launcher-smoke.log`）も確認した。

Windows実UIの再検証ログ `/tmp/cdp-launcher-windows-ui-final.log` は、2回とも **1799×1200・opaque=true・manualCommandVisible=0**。`/tmp/cdp-launcher-windows-ui.png` を独立目視し、Soda内に実Windows VSCodeの既存文書が描画されていることを確認した。親は同じtargetを再利用して接続/停止を行い、VSCode本体の再起動・新規起動を行っていないと報告。画像の初回opaque=falseを合格にせず、描画待ちを入れた結果と区別する。

WindowsのCode.exe新規起動パスは模擬unitだけの確認であり、実Windowsで新しいCodeプロセスを起動できたとは主張しない。Windows側既存targetのUI自動接続・画像表示・停止の実測とは分ける。

**最終判定: 通過。** 追加blocking指摘なし。最後の `git diff --check` 合格。raw negative2本・検証範囲・実機結果は `launcher-test-result.md` に保存されている。レビュー担当はWindows/live viewerを操作していない。
