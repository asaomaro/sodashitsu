# Electron内の操舵室からリモートデスクトップを別窓へ開く

## 原因と変更

MachineHeaderは/desktop-viewをwindow.openしていたが、アシスタントのremote WebContentsViewは新規窓要求を全件denyしていた。タブの有無ではなく、この明示拒否が原因。

同一サーバーの/desktop-view・queryなし・最大8192文字のJSON hash（machineId/labelの型と長さを確認）だけを、アシスタントが作る独立BrowserWindowとWebContentsViewへ渡す。native window.open自体はdenyを維持。操舵室mainと応答replyのsingletonを上書きせず、desktopから開くmonitor窓も同じ経路を使う。

remote viewはsandbox/contextIsolation有効、Node/preloadなし。既存persist:assistant-server partitionで認証を共有し、外部サイトや任意の操舵室ページをpopup許可しない。各viewerの共有/操作許可は従来どおり取り直す。専用窓のcloseでremote contentsを閉じる。閉じた窓のhandlerは新しい窓を作らない。共通のローカルshellによる移動・最大化・resize・閉じる操作を再利用。

## 検証

- アシスタント全体281テスト成功（tests.txt）、package build/typecheck成功。
- main.tsだけ旧版へ戻すと別窓生成の回帰テストが失敗（negative.txt）。元の修正版のSHA256へ復元。
- 旧main.tsを再buildした実Electronでも同じ生成server検証が失敗（electron-negative.txt）。sourceのバイト一致を確認して修正版を再buildし、実Electron検証が成功（electron-positive.txt）。
- 実検査はWSLgのElectron main/renderer、生成HTTP server、一時userDataを使用。app.getPathも一時userDataと一致することをassert。生成ページ上のwindow.openから別窓・nested窓が開き、HttpOnly cookieが共有され、remote window.assistantはundefinedであることをDOMで確認。親の操舵室維持、childrendererの終了も確認。
- 外部popupの拒否は全BrowserWindowとWebContentsのID集合を前後比較する。検査は本番サーバー/agent/実デスクトップ取得やOS入力を使わない。
- review_resource_monitorによるsource/test差分の独立レビューで必須指摘なし。E2Eの外部窓検出を全ID集合へ改善し、一時profile assertとfinally回収を追加。改善後と文書の再点検も指摘なし。

実Windows上のウィンドウマネージャー/DPIと、各remote desktop機能の実機検証は、本Electron生成検証の合格とは区別する。
