# 環境再起動後の再開メモ

元session `01a147c6-2433-7641-985c-944bc1fae033` の永続履歴を読み、最後のWindows起動・画像・入力失敗・focus修正・メニュー/フォルダー選択/リサイズ質問まで照合済み。ユーザーによる再送は不要。

## 現在の状態

- 自worktree `/workspaces/sodashitsu-vscode-cdp` / `feature/vscode-cdp` の未コミット実装を継続。main・他worktreeは変更していない。
- 再開時、Linuxの一時サーバと/tmpスクリプトは消失。WindowsのNode v24.19.0と `%TEMP%\soda-vscode-cdp-bridge` は残っていたが、9222 listenerは無かった。
- 必要な実機検証のため、ユーザーへ分離した `soda-vscode-cdp-test-resume` user-data-dirでのVSCode起動を依頼中。こちらからWindowsの起動/終了・設定変更・接続口開放はしていない。
- リサイズの希望（Windows手動操作への追従 / Sodaから実ウィンドウ変更）も確認中。後者は未実装。

## 復元した一時サーバ

- 起動方法: `node scripts/vscode-cdp-dev.mjs`（既存buildが前提）。停止はCtrl+C。loopback限定、ポートは既定17883。
- 実行中PID: 39887。state root: `/tmp/soda-cdp-live-5dFaZI`。session `cdp-test`。
- 接続情報: `/tmp/soda-cdp-live-5dFaZI/connection.json`（0600、秘密のtokenを含む）。ログ: `/tmp/sodashitsu-cdp-live-server.log`。
- Windowsの `%TEMP%\soda-vscode-cdp-bridge\login-url.txt` を新しいログインURLへ更新。古いtokenは使わない。
- WindowsからHTTP 200、実ブラウザでアプリ表示/共有元を接続ボタンが有効/未接続表示を確認。スクリーンショット `/tmp/vscode-cdp-resume-ready.png`。

## 今回の追加と検証

- 再起動後もリポジトリから再作成できる、隔離検証サーバlauncherを追加。既存のstate/Windowsは変更せず、毎回新しい一時state・token・名前付きcookieを使う。
- 実Chromium pipeのE2Eへrendererサイズ1000x700/DPR2の変更後の画像寸法・比率・実画素・CSS入力座標を追加。Windows実ウィンドウのresizeとは区別。
- 初回はDPR2ならJPEGもCSS寸法より大きいという誤った期待で検査を失敗させた。実際のJPEGはCSS寸法を使う場合があり、DPR自体を元rendererで確認し、JPEGの新寸法/比率/画素と入力結果で判定するよう修正。製品のcapture実装は変更していない。
- 対象単体/統合20件合格、更新したE2E 2件合格（12.0s）、E2E typecheck・launcher syntax check・git diff --check合格。
- 全体試験は前回の記録を引き継ぐ（基準commitでも失敗する既存1件あり）。今回の差分に合わせた対象検証のみ再実行した。
- 独立レビュー担当 resume_review が別port17946で起動・認証204・秘密ファイル0600・ポート競合時exit1・SIGTERM exit0を確認。17883/Windowsには未接続。詳細 review.md。
- 別エージェント resume_resize_design が遠隔resizeを独立調査。成果は resize-design.md。対象HWNDのローカル追加選択・二重許可・DPI・非最大化などの境界を整理。実装/Win32操作はしていない。

実機の再接続とリサイズ確認は、ユーザーの起動を待って再開する。nativeフォルダーダイアログの共有は引き続き対象外で、簡易ダイアログへ自動変更しない。

## 後続の表示枠追従実装・現在の稼働状態

ユーザーが検証用VSCodeを起動し「SodashitsuのウィンドウサイズにVSCodeを表示させたい」と回答。Windows外枠変更ではなくCDP renderer viewportをSoda枠へ合わせる実装を追加。`--allow-input --allow-fit` とブラウザの［操作する］［表示領域に合わせる］で有効。実機の943x616→743x516追従、解除/停止で元1199x800復帰を確認。native dialogは対象外のまま。詳細 fit-test-result.md。

稼働中の最新サーバPID 62368、state `/tmp/soda-cdp-live-rqEGSD`、URL `http://127.0.0.1:17883`。古い段落のPID/stateは初回復元時の記録で、現在はこの値を使う。秘密のconnection.jsonは同state内、/tmp/sodashitsu-cdp-live-info.jsonにも0600の管理用コピーを置いた。Windowsのlogin-url.txtも更新済み。ブリッジ2ファイルは最新sourceと一致。

## 最新: 等倍表示と操作受付復帰

利用者の画像で操作するがdisabledのままになったため、direct appのnative surfaceへのtrusted pointerでFocusGuardを復帰する修正を追加。遠隔control許可は引き続き明示。canvas CSS寸法は元viewport寸法へ合わせ等倍化し、oversizeはscroll。表示: 等倍（1:1）のラベルを追加し、enabled=false・allowFit=false時の案内も表示。

検証用17883は再起動していない。最新web build配信をHTTP fetchで確認（dist/assets/index-D5fKV5pl.jsと配信bytes一致）。適用は利用者のブラウザ再読み込みと再接続が必要。既存viewerを奪う実機自動接続は実行していない。

## 最新: ホイール混雑停止の修正

Windows利用者のwheel操作で128件入力queue上限停止。viewer wheel32ms集約とhelper有限buffer/workerへ修正。単体24件/実Chromium CDP E2E2件合格、helper/viewer両negative有効・byte一致復元。Windowsの一時bridge2ファイルを最新sourceへコピー済。17883再起動/既存viewer介入なし、web再buildを配信。再読み込みと新tokenでの再接続が必要。Windows実機wheel再確認は利用者の次の操作で行う。詳細wheel-test-result.md。

毎回CLIは現PoCの仕様。自動再接続/恒久認証は未実装。次案はreconnection-design.md、Windows常駐設定/拡張導入は行っていない。

## 最新: 登録・常駐bridgeで毎回CLI不要化

ユーザーの「対応を進めて」で実装。初回 --remember、以後同じ認証済みSodaのdevice一覧→接続。共有停止はcleanup完了でidleへ、bridge自身は常駐。window target/allowInput/allowFitはWindows側保存policy。profile onlyでCLI再起動可、OS自動起動設定なし。secretはWindowsユーザーAppData、serverはhash-only registry。詳細reconnection-design.md/resident-test-result.md/resident-review.md。

17883検証サーバーをown PID62368のlauncher確認後SIGTERMし、同state `/tmp/soda-cdp-live-rqEGSD` を --state-root で引き継いで更新。新PID408537、exec session73390。sameToken=true/sameTab=trueを確認し、/tmp/sodashitsu-cdp-live-info.jsonを新PIDへ更新。Windows login-url.txtも同じtokenのものに更新。mainや別worktree/WindowsVSCodeには未操作。Windows一時folderへbridge3ファイルをcopy・bytes一致、Windows Node --checkも3件0。利用者はブラウザreload後、最初の一回だけ--remember入りcommandで登録する必要がある。その後は起動中bridgeを選び接続するだけ。

## 最新: 簡易フォルダー選択を有効化

ユーザーが方式1を選択。Windows検証用user-data-dir soda-vscode-cdp-fit-test/User/settings.json（元は無し）へfiles.simpleDialog.enable=trueだけを保存。既存VSCode再起動なし。実機Ctrl+K/Ctrl+OでFolder path - Open FolderをAX確認し、rendererスクリーンショットへフォルダー一覧が映ることを目視確認。Escでキャンセル、PJ切替/未コミット変更への操作なし。詳細simple-dialog-test-result.md。

## 最新: 共有画面の全画面化

利用者の「全画面化に対応して」に対応。native DesktopCdpViewに全画面/解除、Esc解除、切断自動解除を追加。fitオン時のsource renderer追従、オフ時の等倍を維持。iframe権限・認証・操作許可は変更なし。実CDP3E2E PASS、2negativeで期待失敗、独立再レビュー済み。詳細fullscreen-test-result.md/fullscreen-review.md。

17883 PID408537のサーバ・Windows bridge/VSCodeは再起動せず、最新webasset index-C_Pp_Bma.jsのHTTP bytes一致を確認。利用者はブラウザreload→接続→全画面。コミット/PRなし。

## 最新: ボタンからWindows VSCode・bridgeを起動/接続

利用者「試してみて」に対応。SODA_VSCODE_CDP_COMMAND固定argvで設定した場合だけ、nativeアプリに［VSCodeを起動・接続］。CDP既存workbenchは再利用、拒否時だけ専用profileのVSCodeを新規起動する分岐を実装。今回実機は既存targetの再利用だけで検証。one-shot bridgeを内部token/stdinで起動し、利用者のCLI/token入力不要。候補1つは自動、複数は選択。stopでbridgecleanupを待つ。Code本体を閉じない。

latest test server PID774856、URL17883/state /tmp/soda-cdp-live-rqEGSDは従来と同じ。state内launch-command.jsonを環境変数に渡して起動。WindowsTEMPへ4mjsコピー済。実ブラウザ→Windows既存Codeの2回connect/opaque image/stop確認。利用者はブラウザreload→［VSCodeを起動・接続］で試せる。秘密管理情報は/tmp/sodashitsu-cdp-live-info.json（0600、tokenを表示しない）。server log /tmp/cdp-launcher-live-release.log。launcher-test-result.md/launcher-review.md参照。

Windows直接server/remote別PC/実Code新規起動は未実機検証。remote側URLへアクセスする構成なら各Sodaに同じ設定が必要。中央Sodaから接続済みmachine選択の中継は今回未追加（利用形態の確認質問を出した）。元main/他worktree/PR/commitへ変更なし。

## 最新: 接続済みマシンからVSCode共有

利用者の「追加して」で実装。MachineHeaderの［VSCode］から対象別dialog、remoteは既存 /ws?machine=ID → MachineLinkの専用channel → Bの限定vscode.cdp RPC → Bのvirtualviewer/relay/helper。画像は当該connectionの個別eventのみ。cookie/bridge認証をGatewayで判定し接続寿命に束縛。remoteに手動inviteを出さず固定Bhelperから内部tokenを受渡し。plugin面もselectedmachine IDをkey/propで渡し切替時unmount。切断/失効/closeでcleanup、操作/fit継承なし。

最終rootbuild/typecheck、対象120unit/integration、5E2E(1.8m)、cwd外smoke PASS。orphan/誤machine2negative有効・cmp復元。記録remote-relay-design.md/remote-relay-test-result.md/remote-relay-review.md。

own liveA URL17883 PID852913 state /tmp/soda-cdp-live-rqEGSD は以前とsameToken/sameTab維持。own liveB URL17884 PID852912 state /tmp/soda-cdp-live-k3lSH7 を同PC内に追加し、Aで「検証用別Soda（同一PC）」(id a30eac5e77b221044d5d53c4c54eeefd)としてreverse接続。A/B双方のWindowshelper固定argvは各state/launch-command.json。B側--sodaはB自身17884。マシン一覧→Bdialog→Windows既存Codeの実画像1799x1200 opaque=true/stop/reconnect2回を確認、Windows入力/再起動/設定変更なし。親側main/別worktree/本物のremotePCへは変更なし。

A管理info /tmp/sodashitsu-cdp-live-info.json、B管理info /tmp/sodashitsu-cdp-remote-live-info.json は0600でtokenを含むため表示しない。B接続資格は一時Bstateの通常機構に保存。次の環境復旧時はA/B両stateとargvを使いtestlauncher --state-rootで戻せる。ユーザーはA17883をreload→マシン「検証用別Soda（同一PC）」横の［VSCode］→［VSCodeを起動・接続］。別PC実運用はA/Bを対応版へ更新しBに固定helperを設定する必要がある。未コミット・PRなし。
