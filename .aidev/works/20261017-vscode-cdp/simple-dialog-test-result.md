# VSCode内の簡易フォルダー選択

ユーザーが方式1（files.simpleDialog.enable）を選択し、設定変更を許可。Windows親CodeプロセスPID39424が --user-data-dir C:\Users\makku\AppData\Local\Temp\soda-vscode-cdp-fit-test --remote-debugging-port=9222 で動作し、workbench target 2025A8ADAA4E71E7708E4246270D6DB2 がibmi-dokubakoを開いていることを確認。

User/settings.jsonは存在せずnamed profile設定も無かったため、同プロファイルのUser/settings.jsonをexclusive createで作り、files.simpleDialog.enable=trueだけを保存。標準WindowsプロファイルやPJ/workspaceの設定・未コミットファイルは変更していない。VSCode起動/終了/再起動なし。

検証: 選択targetへCDPでbringToFront→Ctrl+K/Ctrl+O。Accessibility.getFullAXTreeがFolder path - Open Folderを返し、Page.captureScreenshotにもVSCode内のフォルダー一覧とpath欄が描画された。画像を目視確認。Escで閉じ、フォルダーの切り替えは行っていない。プロダクトへの任意CDP実行経路は追加せず、Windows一時フォルダの診断scriptだけを使用。

診断script: %TEMP%\soda-vscode-cdp-bridge\check-simple-folder.mjs
画像: 同フォルダsimple-folder-check.png（既存ソース等が含まれ得るため公開しない）。

元へ戻す場合は同settingsのfiles.simpleDialog.enableをfalseにするか、その項目を削除する。現在fileはこの項目だけだが、将来の別設定が追加された場合はfile全体を削除しない。
