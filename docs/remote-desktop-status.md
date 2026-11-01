# リモートデスクトップの開発状況

2026-11-01時点。Windows/WSL経路とLinux/macOS native実験版を区別します。「実装済み」は実機・実ドライバー・実サービスを組み合わせた動作確認の完了を意味しません。段階実装の作業記録は当時の検証証拠として保持し、現在の必須残件は本書の一覧を使います。未実装を実装済みに読み替えず、機能追加候補と実機確認を分けます。

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
| Linux/macOS native | 画像・H.264/追加codec交渉・UDP優先/WSS復帰・単独viewer動画の自動調整・転送解像度、入力・領域確認・最大8viewer共有と個別file許可、Linux/macOSのシステム音声・仮想出力へのマイク転送とtext/PNG/HTML/RTF clipboardを扱う実験版。Windowsと同等の機能範囲ではない |

## 今回の追加実装と対応範囲

- native動画のUDP・追加codecと、単独viewerのFPS/bitrate・転送解像度の自動調整を実装（PR357–360）。
- Linux Portal/macOS SCKのmonitor一覧・明示選択、承認済みsourceの再接続、Linux PortalのVIRTUAL source作成、macOSの公開APIによる物理OS解像度変更を実装（PR361–363）。
- Windows管理者アプリ/UAC画面のH.264動画と、通常ユーザー権限の別actorによるシステム音声を、単独/複数viewerで実装（PR364–365、367）。SYSTEM workerで音声を取得しない。
- Windows所有仮想画面のOS解像度と共有サイズの一致を実装（PR366）。所有画面のmonitor一覧、明示した個別物理monitorへの閲覧再接続と、別窓の所有仮想groupとの併用を追加。allや所有仮想自身への二重取得は拒否する。
- 暗号化CLIを組み込むプラグインは既存の受信者固定CLIを使用し、独立した鍵・許可・停止処理を管理する。通常grant用ホストAPIは受信者固定grantを拒否する。APIを暗号化用として扱わない。

この製品のLinux Portal backendは物理OS解像度変更を、macOS backendは仮想monitor作成を提供していません。未対応機能の実現可否をOS全体について断定するものではなく、拡張には方式と依存条件の調査が必要です。nativeの全monitor合成や複数monitorの同時独立source、Windows固有の保護画面をnativeへ移植する機能もありません。これらは今回実装した単一sourceのmonitor選択とは異なる未対応機能であり、Windowsとの完全同等を示すものではありません。

## 配布・運用と実機確認

署名済み仮想画面ドライバーの配布、実DriverStore/専用サービスの導入、実OSの許可・signin/UAC・複数GPU/monitor・実通話/音声/Explorerの確認は別作業です。生成画像・メモリ入出力・コンパイル・CIの成功だけで完了とはしません。サービス導入・信頼設定・ドライバー登録や現地の入力を自動試験で実行しません。

## 必須残件

必須は、実装済みとして案内する機能を実環境で使うための更新・検証と、そこで検出した不具合の修正です。新しい取得方式、対応OS、権限、providerを増やす開発は次節へ分けます。自動試験だけで実機項目を完了にせず、未検証だけを理由に未実装とも数えません。

| ID | 必須作業 | 現状・完了条件 |
| --- | --- | --- |
| R1 | sr-pcの更新 | 未完了。監査時も `machine_unavailable`。接続復帰後にローカル差分を保全してmainを反映し、build/handoff・既存pane保持を確認する。専用サービスも使う機能に応じて管理者が更新する |
| R2 | sr-pcとの通常接続・再接続・放置後の安定性確認 | 未完了。R1後に閲覧・操作・切断/再接続・放置/ロック復帰を実環境で確認し、再現した不具合を修正する。以前の版での成功を現版の確認に代用しない |
| R3 | Windows拡張機能の実機確認 | 未完了。実サービス/UAC/signin・仮想driver/monitor・解像度復元・実音声/マイク・clipboard/Explorerを、利用する設定と権限の範囲で確認する |
| R4 | Linux/macOS nativeの実機確認 | 未完了。対象デスクトップが現在利用できない。OSの許可/終了、monitor選択、Linux VIRTUAL、macOS mode復元、動画/音声/仮想出力へのマイク/clipboardを対応範囲で確認する。WSLや生成fixtureを実機の代わりにしない |
| R5 | デスクトップアシスタントの実機確認 | 未完了。このPCでenabled/runningの復帰は確認済みだが、実GUIの配置/DPI・通知/返答・会話/フォーム・画像/録音/モデル・無効化/再起動/スリープを組み合わせた検証は別。詳細は[アシスタント](desktop-assistant.md) |

文書と設定案内の既知の矛盾は今回修正しました。監査対象の実装・既存テストと文書の照合では、上記以外の必須コード修正を具体的な再現付きで確定していません。不具合が存在しないという保証ではありません。R2〜R5で見つかった不具合は必須修正へ追加し、再現条件・対象版・検証結果を残します。根拠と修正一覧は[整合検証記録](../.aidev/works/20261101-desktop-document-audit/findings.md)を参照してください。

## 未対応だが必須残件と分ける機能

次の12分野は機能をまとめた区分で、12個の不具合や工数ではありません。現在も未対応です。意図的な権限制限・新しいOS連携・provider追加を含むため、すべてを必須開発として数えません。実機の不足とOS API上の実現不可も同一視しません。

| ID | 未対応範囲 | 現行実装の根拠・区分 |
| --- | --- | --- |
| U1 | Linux/macOSの全monitor合成 | native monitor layoutは `allSupported:false`。単独sourceの明示選択とは別の機能追加 |
| U2 | Linux/macOSの複数monitor同時独立配信 | `independentMonitors` はWindows経路のみ。nativeは同じsourceを最大8viewerで共有する |
| U3 | native共有動画のFPS/帯域/転送解像度の自動調整 | `sharedRate/sharedResolution` をnativeで提示せず拒否する。単独動画の自動調整は実装済み |
| U4 | native独立カーソル・差分画像 | nativeは `cursor/deltas` を提示せず拒否する。画面内カーソルと全画像は利用できる |
| U5 | Linuxの物理OS解像度変更 | `displayResize` はWindows/macOS経路のみ。転送解像度の変更とは別で、方式調査が必要 |
| U6 | macOSの仮想monitor作成 | `virtualDisplay` はWindows/Linux Portal経路のみ。方式調査が必要 |
| U7 | Linux VIRTUALの複数viewer・物理source併用・OSサイズ指定 | Linux VIRTUALは単独source。`sharedVirtual` はWindows経路のみで、現在の権限/世代境界を保った追加設計が必要 |
| U8 | Windows管理者画面のUDP・追加codec・自動調整・マイク | 明示的に拒否する。現行のH.264/WSS・通常ユーザー音声・転送は実装済みで、この拒否を不具合とは扱わない |
| U9 | サインイン画面の音声・転送・clipboard・agent等 | 専用の120秒限定閲覧/許可した入力経路の対象外。通常画面の権限を流用して解禁しない |
| U10 | Explorer直接dragの他OS/仮想/保護画面への拡大 | Windows通常画面の専用経路に限定。通常の許可フォルダー転送とは別の機能追加 |
| U11 | Claude/Codex以外の会話記録を吹き出しへ表示 | 現在の吹き出し会話記録は2種類のみ。他のagentは専用端末へ展開する |
| U12 | Codex以外への任意音声fileのモデル入力 | 現在の直接音声送信実装はCodexのみ。任意のWhisper構成とCLI自体の音声機能は別。providerの統合方法の調査が必要 |

U1〜U8/U10の能力・拒否条件は[ProviderCore](../packages/server/src/desktop/DesktopProviderCore.ts)、[Provider](../packages/server/src/desktop/DesktopProvider.ts)、[native helper](../scripts/remote-desktop/linux-portal-helper.py)と[macOS helper](../scripts/remote-desktop/macos-desktop-helper.swift)で確認しました。U9は[サインアウト後の専用経路](remote-desktop.md#サインアウト後の接続専用サービス実機検証待ち)、U11/U12は[assistantChat](../packages/desktop-assistant/src/assistantChat.ts)、[AssistantSessions](../packages/server/src/assistant/AssistantSessions.ts)、[CodexAudio](../packages/server/src/assistant/CodexAudio.ts)で確認しました。
