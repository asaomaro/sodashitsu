# デスクトップ文書・残件の整合検証

基準: main ec5cca4735031d07eeb9a1ebaf16f16504b99500。2026-11-01、利用者の「必須残件だけに絞る」「文書の整合検証をして、本当の残件を整理」の指示に基づく。対象はremote-desktop/desktop-assistant/status、remote-work/plugin-cli、現在のcompletion台帳と対応する実装/試験。製品全体の不具合不在や、未接続実機の動作を保証する監査ではない。

## 判定基準

1. capability/option/実helperの対応があり既存生成試験があるものは実装済み。文書の「未対応」だけを根拠に未実装としない。
2. capabilityを提示しない、またはProviderが明示拒否する機能は未対応。未対応を実装済みに書き換えない。今回の必須対象から外すのは機能追加候補であり、実装を終えたという意味ではない。
3. 現行機能の利用に必要な配布・OS許可・実device/agentとの相互運用は確認待ちとして記録。生成試験やWSLを実Linux/macOS desktopの代用にしない。
4. 先の会話で列挙した12分野には意図的な権限制限と新機能候補を含んでいた。これを必須の12件や8〜16人週として数える根拠にはしない。現行実装の必須一覧R1〜R5と未対応候補U1〜U12をstatusに分離した。

## 修正した矛盾（20箇所の置換と案内追補）

| 番号 | 古い記述 | 現行実装に基づく修正・根拠 |
| --- | --- | --- |
| D01 | 管理者共有は画像/入力だけでfile/video/audio禁止 | protectedFiles/protectedVideo/protectedAudio、別のNode/通常ユーザーroleを案内。DesktopProvider/Relay、protected-files/protected-video/protected-audioの作業記録 |
| D02 | helperはPowerShell/CSの3ファイルを揃える | runtime-assets.mjsの閉じた依存一覧を参照し同版で揃える。windows-helper.ps1は追加CSも読む |
| D03 | Bの共有は同時1件 | 単独1窓と明示した共有最大8窓を区別。Providerのshared set/単独active/上限 |
| D04 | サインアウト接続は対象外 | 通常helperの対象外と、別の専用signin経路の存在を区別。signin経路の制限は維持 |
| D05 | file/plugin/native backendを製品全体で未提供 | agent権限を追加しない制限と、人のfile/通常plugin grant/native実験版を区別 |
| D06 | agent領域比較は未実装 | DesktopAgentAccess.refresh(region)/actの領域証拠とpointer限定を案内。全画面比較を既定のまま維持 |
| D07 | OS解像度変更はWindowsだけの説明 | 旧節をWindows物理1枚へ限定し、所有VMとmacOSの別条件を参照 |
| D08 | Linuxはモニター選択の記憶/復元なし | helperのrestore_token、Providerのorigin別単回/10分保持と一致させる。無条件自動復元とは書かない |
| D09 | Linux複数monitor/virtualが未実装 | 一覧/単独選択とPortal VIRTUALは実装済み。all/独立配信/物理OS modeとは区別 |
| D10 | 管理者共有workerはvideo非対応 | H.264/WSSの実証明を伴う共有videoと、通常ユーザーaudio/fileの別経路を案内 |
| D11 | 管理者画面の転送再開は非対応 | Node所有proof後のfile/checkpoint交渉と共通DesktopFilesを参照。再許可/明示再開を要する。実保護OSでの再開の成功とは扱わない |
| D12 | macOSの節名が通常画像のみ | 現行の通常共有へ改題 |
| D13 | macOS利用者は常に別helperを手動build | scripts/package.mjsがMac SDKへbinaryを同梱。ソースcheckoutのビルドと配布物の利用を区別 |
| D14 | macOSはvideo/audio/mic/rich clipboard/mode非対応 | ProviderCore/SettingsとMac helperの実装を参照し各権限付きの対応へ修正 |
| D15 | independentと仮想groupは一切併用不可 | owned VM＋個別物理のみの例外を案内。virtualPairCompatible/rosterとselected照合、両順序回帰 |
| D16 | 共有方式変更時は常に他viewerを全終了 | 通常全画面との切替条件へ限定。D15の例外を消さない |
| D17 | Mac text節にPNG/HTML/RTF非対応と記載 | text節と既存のrich clipboard実装・追加条件を接続 |
| D18 | Linux text節にPNG/HTML/RTF非対応と記載 | D17同様。file MIME非対応の制限は維持 |
| D19 | rich clipboard検証節が他のnative機能も未完了と読める | 検証対象の分離と、別節で実装済みの機能を区別 |
| D20 | nativeのOS mode/複数monitorが一括で残件 | shared自動調整/all/独立の未対応と、単独選択/Mac mode/Linux VIRTUALの実装済みを分離 |

追補: macOS OS modeの利用手順が独立節に存在しなかったため、DesktopSettings・Mac helper・PR363 design/生成試験と照合して追加した。UUID/mode/配置/回転、実ピクセル/論理倍率、元期限、入力解放→復元、現地変更の非上書き、実機未検証を明記する。

追補: Assistantの実機確認欄の独立ログイン起動を、現在のsoda管理有効化/停止/handoff確認へ修正。標準Whisperは明示選択の任意構成、直接音声はCodex、画像入力は設定したClaude/Codexであることは既存docと実装が整合しており変更しない。

追補: 設定画面へ返すDesktopNativePlatform.nativeDesktopSetupにも古い文言があった。Linuxの継続frame要件を新実画像待ち/静止維持の現行仕様へ、macOSの「マイク未対応」を明示した仮想出力への転送と追加許可へ修正。文字列以外の実行・権限・protocol・保存・process数は変更しない。

## 未対応範囲の根拠

U1〜U7: DesktopProviderCoreのnative capability、DesktopProvider.startのnative/共有拒否条件、Linux monitor_layout/Portal SelectSourcesとMac monitor allSupported、DesktopSettingsのOS別許可。新たに公開OS APIの不存在や実現不可能とは断定しない。

U8/U9: Providerのprotected拒否条件と専用signinの限定経路。意図的な権限制限であり、R2/R3で実装どおり拒否することも確認対象。

U10: DesktopProviderのnativeSelection/pointer証拠経路とRemoteDesktopWindowのWindows通常画面に限る表示条件。通常file転送を未実装扱いしない。

U11/U12: assistantChat会話型claude/codexとCodex音声のsession判定、AssistantSessions.audioTarget/CodexAudio。任意providerの公開API不在をこの実装から一般化しない。

remote-workのterminal-here双方向/終了/更新時再開不可、plugin-cliの通常grantと受信者固定CLIの使い分けは対応する実装・試験と照合し、今回追加の矛盾は確認しなかった。

## 本当の必須残件

現行statusのR1〜R5を正本とする。R1更新/R2通常接続/R3 Windows拡張/R4 nativeOS/R5 assistantの実機検証を未完了とする。監査時2026-11-01 00:28 UTCもsr-pcはmachine_unavailable。未接続の原因や更新後の成功を推測で記録しない。これらで検出したコード不具合は必須修正へ追加する。

過去のcompletion台帳はPR356〜369の段階実装記録として注記し、広い「複数monitor対応完了」を単独一覧/選択に具体化した。過去の生成試験の証拠は書き換えず、現在の正本への導線を追加する。

## 検証

文書の旧断定が残っていないこと、差分の空白、相対リンク/参照先、native設定の既存試験を確認する。文書/表示案内だけの差分のため、既存13,431件の全体試験や実device試験を再実行したとは扱わない。最終結果と独立crossは以下へ追記する。

### 実行結果

- 全workspace build / typecheck: 成功。最終の設定案内文変更後、server buildも成功。
- 既存のNativePlatform / Settings / Provider.monitors / Provider.virtual: 4ファイル・42件成功。実OS capture/input/音声deviceは使用しない。
- 変更Markdown 7ファイルの相対参照46箇所: 参照先欠落0。旧断定の検索と `git diff --check`: 成功。
- 独立cross review_transfer: 全差分/対応するsource照合。SDKとソースcheckoutの案内の区別をshouldとして確認し、設定案内も修正して再レビューでmust/shouldなし。

```text
 Test Files  4 passed (4)
      Tests  42 passed (42)
   Start at  09:30:55
   Duration  2.16s (transform 44%, tests 41%, import 15%)
```

```text
{'markdownFiles': 7, 'localTargetsChecked': 46, 'missing': []}
```
