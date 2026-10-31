# リモートデスクトップの開発状況

2026-11-01時点。Windows/WSL経路とLinux/macOS native実験版を区別します。「実装済み」は実機・実ドライバー・実サービスを組み合わせた動作確認の完了を意味しません。段階実装の作業記録に残る古い「後続」「未完了」は、現在の残件一覧として使いません。

| 範囲 | 実装状況 |
| --- | --- |
| Windows通常共有 | 画像/差分、GPU動画・codec交渉、適応調整、キー/マウス、画質保存を実装 |
| 複数viewer/monitor | 共有sourceとviewer別待機、排他操作、モニター別の独立取得・圧縮・別窓を実装 |
| 転送 | 単一ファイル・フォルダー/ZIP、切断/再読込/サーバー再起動後の明示再開を実装 |
| Explorer直接ドラッグ | 専用のブラウザPC helperと明示したファイル許可によるWindows向け実験機能を実装 |
| clipboard/音声 | text/PNG/HTML/RTFの対応範囲、システム音声、マイク転送と局所encoder停滞の有限復帰を実装 |
| 暗号化/agent | viewerおよび受信者固定agentの暗号化、CLI/MCP/modelを実装。通常grant用のプラグインAPI・operation例を追加 |
| 保護画面/仮想画面 | 別の許可・scopeで実装。仮想画面は複数viewer・動画/音声/転送/マイクとの併用を追加。管理者アプリ/UAC画面中の別許可フォルダー転送も実装。管理者アプリ/UACではH.264動画と通常ユーザー音声の単独/共有sourceを追加。signin/lockcoverの動画・音声は対象外 |
| 専用signinサービス | runtime、鍵・登録管理、初回導入、更新、記録に一致する限定復旧を実装。一般の異常終了の自動修復は提供しない |
| agentの領域確認 | Windows通常共有・Linux Portal・macOS SCKで明示regionと領域内pointer限定の変更確認を実装。LinuxはGstVideo GIが必要で、新しい実画素を待つ。省略時は全画面一致 |
| Linux/macOS native | 画像・H.264/追加codec交渉・UDP優先/WSS復帰・動画の自動調整・転送解像度、入力・領域確認・最大8viewer共有と個別file許可、Linux/macOSのシステム音声・仮想出力へのマイク転送とtext/PNG/HTML/RTF clipboardを扱う実験版。Windowsと同等の機能範囲ではない |

## 今回の追加実装と対応範囲

- native動画のUDP・追加codec・FPS/bitrate・転送解像度の自動調整を実装（PR357–360）。
- Linux Portal/macOS SCKのmonitor一覧・明示選択、承認済みsourceの再接続、Linux PortalのVIRTUAL source作成、macOSの公開APIによる物理OS解像度変更を実装（PR361–363）。
- Windows管理者アプリ/UAC画面のH.264動画と、通常ユーザー権限の別actorによるシステム音声を、単独/複数viewerで実装（PR364–365、367）。SYSTEM workerで音声を取得しない。
- Windows所有仮想画面のOS解像度と共有サイズの一致を実装（PR366）。所有画面のmonitor一覧、明示した個別物理monitorへの閲覧再接続と、別窓の所有仮想groupとの併用を追加。allや所有仮想自身への二重取得は拒否する。
- 暗号化CLIを組み込むプラグインは既存の受信者固定CLIを使用し、独立した鍵・許可・停止処理を管理する。通常grant用ホストAPIは受信者固定grantを拒否する。APIを暗号化用として扱わない。

Linux Portalには汎用の物理OS解像度変更APIを、macOSには公開された汎用仮想monitor作成APIを、この製品から提供していません。nativeの全monitor合成や複数monitorの同時独立source、Windows固有の保護画面をnativeへ移植する機能もありません。これらは今回実装した単一sourceのmonitor選択とは異なる未対応機能であり、Windowsとの完全同等を示すものではありません。

## 配布・運用と実機確認

署名済み仮想画面ドライバーの配布、実DriverStore/専用サービスの導入、実OSの許可・signin/UAC・複数GPU/monitor・実通話/音声/Explorerの確認は別作業です。生成画像・メモリ入出力・コンパイル・CIの成功だけで完了とはしません。サービス導入・信頼設定・ドライバー登録や現地の入力を自動試験で実行しません。
