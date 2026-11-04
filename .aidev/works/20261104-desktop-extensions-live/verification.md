# Windows拡張機能・別経路の対応記録

2026-11-04、sr-pcの1701bfb4で確認。個人の画面・clipboardの内容・PINは記録しない。

## 実環境

- 物理モニター1台。Windows論理1536×960、native1920×1200、125%。
- Sodashitsuの署名済み仮想IDDは未導入。リポジトリ内のdriver buildはunsignedであり、そのまま実機に導入できる配布物ではない。
- 仮想audio cable未導入。物理speaker/microphoneのみ。VB-Audio公式のPack45を隔離した所有者プロファイル下へ取得・展開し、x64 installerとWindows10用catalog/sysの署名Validを確認した。まだ実行していない。
- ロック解除/保護画面共用サービスはRunning。

## ブラウザで観測した結果

- 実ロック状態から再度PIN解除、session_unlocked後の通常画面を確認。
- 通常画面でGPU H.264を要求。ブラウザcanvasのdata-video-framesが0→164→400→889、要求/実codecともH.264。描画実測31.3fps（1回の観測）。native映像1280×800。
- システム音声を要求し、音声を再生を押した後、UIが「システム音声: 再生中」。実音声の波形照合・聴感確認は未実施で、完全な実音声検証とは扱わない。
- 最大解像度のON/OFFで閲覧専用に再接続。元のモードが既に最大のため、実モードが変化したことと復元の確認は未完了。
- 管理者画面を共有するとsecureDesktop=true、status=管理者画面・閲覧中、実frame取得。操作するでcontrol enabled=true。
- 実UAC要求が表示された際、従来のDefault共有が状態変更エラーで停止。明示再接続後、実UAC確認画面を閲覧（frames10以上、errors=[]）。承認は利用者へ依頼しており、自動で承認しない。

## Windows側検査

以下を独立PowerShellプロセスで実行してすべてexit0。生成データやfake OSを使う検査であり、実driver/音声/clipboard/Explorerの確認とは区別する。

- validate-monitors.ps1
- validate-display-lease.ps1
- validate-rich-clipboard.ps1
- validate-audio.ps1
- validate-microphone.ps1
- validate-native-drag-worker.ps1
- validate-native-drag-pump.ps1
- validate-explorer-selection-worker.ps1
- validate-virtual-broker.ps1
- validate-virtual-package.ps1
- validate-protected-worker.ps1

## サインアウト後の専用接続

sr-pcでpnpm build:signin成功。実owner SIDを固定してDesktopSigninNative.exeをコンパイルし、隔離stageにNode24・bundle・固定資材をコピー。buildSigninPackageでmanifest生成。

- manifest SHA256: d04c20d73caf378a69a1ecbf7f6b6124753f3254faf8f4fe0fb2e2c1d52103e0
- revision: 00c37ed5-a227-4dfd-8cc8-f15249875dd4
- install-signin-service.ps1 -ValidateOnly成功: validated=true, startsService=false, writesInstalledState=false。

実導入のUAC承認を依頼済み。初回試行は承認待ちのままリモートexecの30秒期限となったため、180秒の期限で再準備した。サービス導入/登録/開始/実サインアウトはまだ完了とは扱わない。

## 解像度guardianの実機不具合と修正

元のnative1920×1200を記憶し、対応モード1600×900を一時適用した後、ブラウザの最大解像度を有効化。guardianの起動に失敗しUIに「Bの解像度を変更できませんでした」と表示された。テスト用の独立ガードで元の1920×1200へ復元済み。

原因はNativeDriver.Arm内の別PowerShellがHostだけをコンパイルし、Hostが参照するUnlockとSystem.ServiceProcessを読み込んでいなかったこと。同じsource directoryの2ファイルとassembly参照を追加した。

新しいvalidate-display-guardian.ps1は実guardianの開始/終了だけを検査し、ゼロ寸法targetにより親異常終了時も実画面にApplyしない。sr-pcの隔離stageで元コードの失敗と修正後成功を同じ検査で確認した。CRLFをLFへ正規化してからstageの全ファイルSHA256を手元のソースと照合した。ログはguardian-negative.json/guardian-positive.json。個人プロファイル名のパス部分のみ匿名化。

review_resource_monitorによるsource/test差分の独立レビューで必須指摘なし。

## 修正反映後の実解像度・clipboard検証

caaddccdをsr-pcへgit pullで反映（CSは共有ごとに再コンパイルされるため、この修正にserver再起動は不要）。対応モード1600×900へ一時変更し、明示再接続後に最大解像度をON。実モード1920×1200への変更と実frame13以上・errorsなしを確認。OFFで元の1600×900へ復元したことを別processで観測し、テスト終了時は元々の1920×1200へ戻した。display-live-positive.jsonのmaximumApplied/lowerRestoredは両方true。テスト用ガードが最後に元々のモードへ戻す間は、新共有の構成検査が拒否する場合があるため、その後明示再接続する。

clipboardは元データを別のSTA processのメモリーに保持し、生成テキストのB→browser→B転送を照合。roundtrip=true, restored=true。続いて2×2 PNGとテキストをBから読み、browserのclipboardで実PNG寸法とテキスト一致を確認。browserから3×2 PNG・HTML表・テキストをBへ送信し、B側OS clipboardで寸法と表マーカーを照合。richRoundtrip=true, restored=true。元clipboardは復元済み、実内容はログ/ファイルへ保存していない。

手元のWindows/WSLでDesktopNativeBinary.prepare/close成功（nativeDragPrepared=true）。これは実ExplorerのOLEドロップ成功とは区別する。

専用signinサービスの実導入はWindowsからoperation canceled by userとなり未実施。承認なしで再試行しない。VB-CABLEは署名確認とstageまでで、実行・導入・既定デバイス変更・再起動はしていない。

## ファイル・音声・複数窓

Downloads/Sodashitsu-RemoteFilesを作成して共有rootへ設定（既存個人folder全体は共有しない）。既存許可を保持し、後で保護画面中の同folder転送も別に許可した。

- ブラウザから生成したsoda-live-test-20261104.txt（28bytes）を送信。Bの実ファイルSHA256=a50ce4e07e607de8a5655fdd514d4df4dd80d01eb54c1db3c6cb36a5b723fb69、ブラウザの転送表示は完了。
- 同ファイルをbrowserへダウンロードし、生成Blobの内容が元のテスト文字列と一致した。
- ブラウザの「このPCで直接ドラッグを準備」から実native helperへ接続し「Explorerへの直接ドラッグが有効です」を確認。実ExplorerへのOLEドロップは未確認。
- Bでメモリー上に生成した440Hz/1秒PCMをSoundPlayerで再生。browserの実AudioBufferSourceNode.startで26buffer、非ゼロ振幅と再生中表示を確認。生音声は保存せず、buffers/peakRms/hzAtPeakだけ集計。端末の音響特性と聴感・無劣化性の保証とは区別する。
- 表示モニターallへの切替と実frameを確認。その後、共有sourceの「選択モニターを別窓で開く」を利用し、2つのbrowser DOMでframes63/33→206/174へ更新、errors=[]。第1窓操作中は第2窓の操作取得がfalse、第1窓で明示解放後に第2窓が操作中となることを確認し解放。実物理1画面での確認であり、複数の物理monitorや混在DPIは未確認。

## 管理者共有中の転送・動画

allowProtectedFilesを別に有効化。実保護Default共有（管理者画面・閲覧中、secureDesktop=true）で生成soda-protected-test-20261104.txtを送信。33bytes、SHA256=a42d82617d03698b310f0884409c13b61343f95a5f45e2f25fc967ed219ee6b1。browserの完了表示・errors=[]と実ファイルを照合。SYSTEM workerへ任意ファイルパスを渡さず、通常利用者の専用rootを使う経路。

同共有でH.264を要求し、browserのdata-video-frames=97以上、1280×800の実描画、errors=[]を確認。音声は要求・ミュートreadyまでで、この保護共有では音声波形の照合はしていない。実UAC承認/取消の入力と、昇格アプリ個別の操作は未確認。共有と転送を明示終了した。

修正後のvalidate-display-lease.ps1も成功（display-tests-positive.json）。

## 保護動画の停止時エラー

実保護DefaultのH.264を389frame描画した後、動画・音声を停止を押すとmedia_unavailableが返り「Bのメディア補助画面と共有許可を確認してください」と表示された。停止自体は実行されていた。

DesktopNativeVideo.fromViewerは停止後falseを返すため、Provider保護経路から通常companionの拒否へfallthroughしていた。readyかつprotectedVideoActiveの明示停止は通常停止と同様に早期returnし、secureではcompanionへ渡さない。開始許可やcodec/audio制限は変更しない。

Default/UACの実Provider+Relay検査で、native_stopは1回、重複停止も誤エラーなし、画像継続を確認。修正前だけへ戻すと両ケースがmedia_unavailableにより失敗（protected-stop-negative.txt）。修正版を元のSHA256に戻して関連3ファイルを検査。source/testと最終文書の独立点検で必須指摘なし。

関連3ファイル329テスト、pnpm build、pnpm typecheckがすべて成功。生成した転送テストファイル2件はSHA256一致を確認して削除し、専用転送folder設定だけを保持した。
