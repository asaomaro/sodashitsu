# 接続ボタンからのVSCode・bridge起動

利用者の「試してみて」で実装・実機検証を許可。既存VSCode終了/再起動なし。対象は当該Sodashitsuサーバー側のWindows（直接またはWSL interop）。リモート接続先のサーバーも対象とする。中央Sodaから接続済みmachineを選ぶ経路は今回の自動起動とは別の中継実装が必要（利用形態を確認中）。

- server起動時SODA_VSCODE_CDP_COMMANDを固定argv JSONで設定。shell:false、browserはコマンド/パス/URL/許可を指定不可。pluginやrepo設定を自動実行元にしない。
- native認証済みviewerの既存cookie/Origin境界にlaunch/launchConnectのみ追加。helperへstdin JSONでtokenを内部受渡し。Soda originはWindows helperの固定--sodaで指定しHost由来URLを使わない。
- discoverはCDP loopbackの既存workbenchを列挙。connection refused時だけ--code EXE --user-data-dir専用profileを使いCode.exe起動。既存window/sessionは終了しない。候補が1つなら接続、複数なら明示選択。
- discover結果を当該viewerのepoch/60秒TTLに保存、connectはその集合に照合。helperも直前に同一workbench IDを再検証し、別windowへのfallbackなし。
- server全体でhelper1つ。process stdout制限/deadline/cancelを管理。stop/disconnect/logout/server終了でstdinEOF→AbortSignal→既存CdpCapture.stop。強制終了はCDP操作前のdiscover helperのみ。connect helperは既存cleanupを完了するまで所有slotを保持し、5秒で強制終了しない。Code.exe本体はkillしない。
- 自動接続はone-shot bridgeを毎回内部起動するため、token表示/コピー/保存資格不要。従来の手動登録resident方式は併存。毎接続閲覧から開始、操作/fitは既存の明示許可を維持。
- Windows直接はnode.exe、WSLはWindows側node.exeを固定command先頭へ設定する。同じdesktop sessionに到達できるユーザー権限が前提。未設定環境は従来手動接続のみ。

独立点検対象: process所有/寿命、target/epoch/認証、token非漏洩、取消し・復元。実機では既存testprofileのVSCodeを再利用し新しいCode.exeは起動しない。起動分岐はunitで検査する。

helperのbusy変化は専用launcherStateで全viewerへ送る。接続失敗のstatusを直後の汎用statusで消さない。
