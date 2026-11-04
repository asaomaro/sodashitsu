# リモートデスクトップの開発状況

2026-11-04更新（R1〜R3の実機確認を追記）。Windows/WSL経路とLinux/macOS native実験版を区別します。「実装済み」は実機・実ドライバー・実サービスを組み合わせた動作確認の完了を意味しません。段階実装の作業記録は当時の検証証拠として保持し、現在の全残件は本書のR1〜R5/U1〜U12を使います。優先度にかかわらず未完了項目を残し、実装・方式調査・権限設計・更新/実機確認を区別します。

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

## 全残件の数え方

これまで挙げた更新・検証と未対応12分野を合わせた管理単位は**17項目（更新・実機確認5項目、機能実装7分野、方式・連携調査3分野、権限設計2分野）**です。Uは複数のOSや機能を束ねる分野であり、17個の小修正や同じ工数のタスクという意味ではありません。前に「必須ではない」と分けたUも全残件に含め、取り消しや完了にはしません。

| 種類 | ID | 現在の状態 |
| --- | --- | --- |
| 更新・実機確認 | R1〜R5 | 未完了。接続先/端末/許可を用意して実装済み機能を確認する |
| 機能実装 | U1〜U4、U7、U10、U11 | 未実装または一部実装。既存の部分対応は各行で区別する |
| 方式・連携調査 | U5、U6、U12 | 対象機能は未実装。実現方法・依存条件・対応範囲を確定してから実装する |
| 権限設計 | U8、U9 | 現行実装は意図的に制限。拡張範囲と権限分離を設計する作業を残す |

「実装完了」は対象範囲のコード・必要な生成/結合試験・独立レビュー・main統合までです。実装後も実機確認が済むまでは「実装済み・実機待ち」と記録し、関連するRを閉じません。方式調査の完了だけでその機能を実装済みにしません。OS APIの不存在や実現不可能を、調査前に断定しません。

## 更新・実機確認の残件（R1〜R5）

以下は実装済みとして案内する機能を実環境で使うための作業と、そこで検出した不具合の修正です。Uの新機能を実装した場合も該当する検証範囲へ加えます。自動試験だけで実機項目を完了にせず、未検証だけを理由に未実装とも数えません。

| ID | 作業 | 現状・完了条件 |
| --- | --- | --- |
| R1 | sr-pcの更新 | 完了（2026-11-04、1701bfb4）。mainを反映しbuild/handoff、既存4paneの保持を確認。利用者のUAC承認でロック解除サービスも更新済み |
| R2 | sr-pcとの通常接続・再接続・放置後の安定性確認 | 一部確認済み（2026-11-04、1701bfb4）。通常画面の閲覧・マウス操作、実ロック画面からPIN解除、通常画面への自動再接続・操作を確認。cold leaseとWindows proxy終了コード取得の不具合を修正。長時間放置・反復接続の安定性確認は残る |
| R3 | Windows拡張機能の実機確認 | 一部確認済み（caaddccd）。実解像度変更/復元、H.264と音声buffer、text/PNG/HTMLのclipboard往復、ファイル送受信、同一monitorの2窓と操作排他、保護Default/UACの実画像、保護DefaultのH.264/ファイル転送を確認。仮想IDDの署名済み配布、物理複数monitor、仮想audio cable/マイク、実Explorer drop、昇格アプリ/UAC入力、専用signinサービスの導入承認/登録/実サインアウトは残る |
| R4 | Linux/macOS nativeの実機確認 | 未完了。対象デスクトップが現在利用できない。OSの許可/終了、monitor選択、Linux VIRTUAL、macOS mode復元、動画/音声/仮想出力へのマイク/clipboardを対応範囲で確認する。WSLや生成fixtureを実機の代わりにしない |
| R5 | デスクトップアシスタントの実機確認 | 未完了。このPCでenabled/runningの復帰は確認済みだが、実GUIの配置/DPI・通知/返答・会話/フォーム・画像/録音/モデル・無効化/再起動/スリープを組み合わせた検証は別。詳細は[アシスタント](desktop-assistant.md) |

文書と設定案内の既知の矛盾は今回修正しました。監査対象の実装・既存テストと文書の照合では、現行対応範囲について追加のコード不具合を具体的な再現付きで確定していません。不具合が存在しないという保証ではありません。R2〜R5で見つかった不具合は必須修正へ追加し、再現条件・対象版・検証結果を残します。根拠と修正一覧は[整合検証記録](../.aidev/works/20261101-desktop-document-audit/findings.md)を参照してください。

## 機能開発・調査・設計の残件（U1〜U12）

全て未完了です。「現行実装の根拠」は現在できない範囲を示し、残件から外す理由ではありません。意図的な制限を広げるU8/U9も含めますが、この一覧を更新しただけで機能や権限を有効にはしません。各機能の依存条件と停止時の境界を保って実装します。

| ID | 対象・種類 | 現行実装の根拠 | 残る対応と実装完了条件 |
| --- | --- | --- | --- |
| U1 | Linux/macOSの全monitor合成／機能実装 | native layoutは `allSupported:false`。一覧・単独選択は実装済み | OSで許可した複数sourceの合成、論理座標/実ピクセル/DPIと入力座標を対応付ける。構成・許可変更と取消で停止し、画面の取り違えがないことを検証する。実機合格はR4 |
| U2 | Linux/macOSの複数monitor同時独立配信／機能実装 | `independentMonitors` はWindowsのみ。同じnative sourceの最大8viewer共有は実装済み | monitor別の取得・encoder・待ち行列・窓を分離する。同じmonitorの共有、PC単位の操作/mic排他、上限・実退役・構成変更時停止を検証する。実機合格はR4 |
| U3 | native共有動画のFPS/帯域/転送解像度自動調整／機能実装 | nativeは `sharedRate/sharedResolution` を提示せず拒否。単独動画の自動調整は実装済み | 各viewerの要求と固定設定を集約して共通encoderを調整する。世代/ACK・途中参加・UDPからの復帰・音声継続・取消を共有sourceで検証する。実機合格はR4 |
| U4 | native独立カーソル・差分画像／機能実装 | nativeは `cursor/deltas` を提示せず拒否。画面内カーソルと全画像は利用可能 | カーソルの位置/形と差分矩形の経路をそれぞれ追加する。基準画像・DPI・再同期・遅いviewerの復帰・agent観測の鮮度を検証する。実機合格はR4 |
| U5 | Linuxの物理OS解像度変更／方式調査 | `displayResize` はWindows/macOSのみ。転送解像度調整とは別 | compositor/desktopごとの実現方法・依存・許可を調査し対応環境を明示する。その後、対象ID/元modeの確認・適用・現地変更を上書きしない復元を実装する。調査のみは機能完了にしない。実機合格はR4 |
| U6 | macOSの仮想monitor作成／方式調査 | `virtualDisplay` はWindows/Linux Portalのみ | 利用可能な仕組み・配布/署名/導入条件を調査し、サポートする方式を確定する。その後、自分が所有するdeviceだけの作成・選択・取消・削除を実装する。採用可能な方式が見つからなければ未実装のまま調査結果を残す。実機合格はR4 |
| U7 | Linux VIRTUALの複数viewer・物理source併用・OSサイズ指定／機能実装 | Linux VIRTUALは単独source。`sharedVirtual` はWindowsのみ | 共有する仮想sourceの所有と最後の利用者での解放、物理sourceとの識別、サイズ交渉を追加する。Portalが寸法指定を提供しない場合はその部分を未対応として残す。単独VIRTUALの既存機能を維持する。実機合格はR4 |
| U8 | Windows管理者画面のUDP・追加codec・自動調整・マイク／権限設計 | 現行は明示拒否。H.264/WSS・通常ユーザー音声・転送は実装済み | 4機能それぞれの利用目的とscope/actorを定義し、通常画面の権限を共用しない設計にする。採用範囲だけを明示交渉し、UAC/lock/session変更・失効・終了時の停止を実装/検証する。未採用の制限は記録を残す。実機合格はR3 |
| U9 | サインイン画面の音声・転送・clipboard・agent等／権限設計 | 現行は120秒限定の閲覧/許可した入力だけ | ログイン前に提供する機能と提供しない機能、受信者/利用者、許可元、保存先と寿命を定義する。実装対象はログイン後の経路と分離して検証する。制限を維持する項目は設計判断として明記し、設計決定と実装完了を区別する。実機合格はR3 |
| U10 | Explorer直接dragの他OS/仮想/保護画面への拡大／機能実装 | Windows通常画面の専用経路のみ。通常の許可フォルダー転送は実装済み | OS/画面種別ごとに対象fileの特定、許可root、実ドラッグの因果、受渡しと取消を設計/実装する。誤ったfile選択やroot外取得を拒否する。組合せごとに完了を記録し、通常file転送と混同しない。実機合格はR3/R4 |
| U11 | Claude/Codex以外の吹き出し会話／機能実装（一部対応） | Copilot CLI・Antigravity CLIを追加し4種類に対応。Bob Shellなど他agentは専用端末へ展開。追加2種類の実会話往復は未検証 | 追加対象agentを明示し、会話記録adapterと会話ID/対象paneの確認、表示/送信/復元を実装する。agentごとに互換性と試験結果を記録する。全agent対応とはまとめない。実機合格はR5 |
| U12 | Codex以外への任意音声fileのモデル入力／連携調査 | 直接音声送信の実装はCodexのみ。WhisperとCLI独自音声は別 | 対象CLI/providerの統合方法とモデル入力形式を確認する。利用可能な方式には既存専用sessionへの明示送信・取消/期限・対応外エラーを実装し、別AIへ自動送信しない。利用可能なAPIを確認できないagentは未対応のまま記録する。実機合格はR5 |

U1〜U8/U10の能力・拒否条件は[ProviderCore](../packages/server/src/desktop/DesktopProviderCore.ts)、[Provider](../packages/server/src/desktop/DesktopProvider.ts)、[native helper](../scripts/remote-desktop/linux-portal-helper.py)と[macOS helper](../scripts/remote-desktop/macos-desktop-helper.swift)で確認しました。U9は[サインアウト後の専用経路](remote-desktop.md#サインアウト後の接続専用サービス実機検証待ち)、U11/U12は[assistantChat](../packages/desktop-assistant/src/assistantChat.ts)、[AssistantSessions](../packages/server/src/assistant/AssistantSessions.ts)、[CodexAudio](../packages/server/src/assistant/CodexAudio.ts)で確認しました。

## 着手順と依存関係

1. **現行機能の確認**: R1→R2を先に行い、再現した不具合を修正する。R3〜R5は端末・OS許可・機器が利用できる範囲で進める。未接続端末や未提供のOSで検証したことにしない。
2. **既存sourceの性能・表示拡張**: U3/U4。複数sourceを増やす前に、共有encoder・画素/カーソル・鮮度の既存境界を維持して対応する。
3. **複数sourceと仮想画面**: U1/U2/U7。OS側の共有許可、安定したsource ID、同時sourceの寿命/停止を共通に設計する。U1の全体合成とU2の独立配信は別機能で、一方の実装だけで他方も完了にしない。
4. **別経路の拡大**: U10/U11。対象OS/画面/agentごとに分割し、既存経路を壊さず対応を増やす。
5. **先に方式・権限を確定する項目**: U5/U6/U8/U9/U12。調査や設計は他の実装と並行して進められる。採用範囲・導入条件が決まる前に、実装工数や実現可否を断定しない。

上記は着手順の案であり、下位項目を取り下げる意味ではありません。未実装12分野を一括で見積もった「8〜16人週」はこの一覧の確定工数として使いません。対象OS/agent/画面種別、採用方式と検証条件を分解した後に見積もります。今後の更新はR/UのIDを保ち、状態・実装済みの範囲・次の対応・検証結果を更新します。

2026-11-04のR1/R2の更新とロック解除の根拠は[実機検証記録](../.aidev/works/20261104-locked-desktop-unlock/verification.md)を参照してください。R3の他機能は、この確認で完了とは扱いません。

## Windows実機で追加確認した範囲（2026-11-04）

[拡張機能の実機記録](../.aidev/works/20261104-desktop-extensions-live/verification.md)に結果と復元手順を記載しています。解像度guardianの依存不足を修正し、対応モード1600×900から1920×1200への変更と元モードへの復元を確認しました。専用転送フォルダーとしてsr-pcのDownloads/Sodashitsu-RemoteFilesを設定しています。

| 残る項目 | 必要なもの・現在の準備 |
| --- | --- |
| 一時仮想画面 | Sodashitsu専用IDDの署名済み配布物。リポジトリ/CIのunsigned artifactを導入可能な配布物とは扱わない |
| マイク転送 | 仮想audio cable。VB-Audio公式Pack45のx64 installer/catalog/sysの署名は確認済み、導入/再起動は未実施。導入後は明示したrender IDだけを転送先へ設定する |
| サインアウト後の専用接続 | 専用bundle/Native host/manifestを生成してValidateOnly成功。実導入UACはキャンセルとして返った。承認後の導入・鍵/trust・別machine登録・起動・実サインアウト検証が必要 |
| 複数monitor / Explorer drop | 2台以上の実monitor・混在DPIの確認、Windowsブラウザと実Explorer間のOLE drop。1画面の2窓共有と補助プログラム準備成功だけでは完了にしない |

マイク用配布物の取得元・導入条件は[VB-Audio公式](https://vb-audio.com/Cable/)で確認しました。再起動を伴うdriver導入は、動作中の利用者sessionへの影響を確認してから行います。

2026-11-04の最終確認では、PIN認証を成立させるキー入力とdesktop遷移の間で入力解放の確認が取れず、再接続を安全に拒否する事象も確認しました。原因候補・復旧条件は同実機記録に残しています。この残件を解消したとは扱いません。

認証workerの単独Enterと文字入力のdown/upを同じWindows入力要求にまとめる修正を追加し、Windows上で生成scopeの正例・3負例・復元後正例と既存の安全境界検査が成功しました。[検証記録](../.aidev/works/20261104-authentication-input/verification.md)に実装範囲を記載しています。インストール済み補助サービスの管理者更新と、その後の実ロック解除はまだ必要です。
