# 独立レビュー

実装とは別コンテキストの review_view_maximize に設計・Windows安全境界・全体差分・修正差分を点検してもらった。

修正した指摘:

- CreateProcessAsUserのUnicodeとSTARTUPINFOを統一。
- 通常ユーザーからSYSTEMプロセスへPROCESS_ALL_ACCESSを要求せず、QUERY_LIMITED_INFORMATIONとSCMのPID/config/固定ImagePathで認証。
- worker未接続時に同期pipe待機が残らないよう、FILE_FLAG_OVERLAPPEDとWaitForConnectionAsyncのキャンセルを使用。Windows上の同実装pipeを使う150ms中断試験に成功。
- 管理者保護のfresh staging directoryへ既知exeだけを配置。既存containerのowner/ACL、未知sidecar、reparse pointを検査。sas.dllはSystem32限定。
- secure共有終了時に表示canvas、sourceCanvas、frame chain、入力、文字を破棄。
- WindowsIdentity.GroupsがSE_GROUP_LOGON_IDを除外するため、GetTokenInformation(TokenGroups)から明示取得。実Windowsで検証。
- Windows 7のlock flag反転を対象に入れないよう、Windows 10以降・64bit以外とバージョン取得失敗を拒否。
- 非コンソールhelperの文字コードAPI呼出しを、UTF-8標準streamのSetIn/SetOutへ変更。CreateNoWindowの実Windows試験で確認。
- コンパイラの一時ファイルも保護stageへ限定し、生成物の残留sidecarを拒否。
- Ctrl+Alt+Delの説明を通常共有とロック解除経路で整合させた。

再レビューの結果、追加必須指摘なし。LocalSystemサービスの導入、実際のロック画面の取得・認証・解除は未実施であり、自動試験の成功で代用しない。
