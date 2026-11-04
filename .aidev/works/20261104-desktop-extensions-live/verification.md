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
