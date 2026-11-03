# デスクトップのメディア入力・通知吹き出し

## 要件と実装

- OCRにPNGファイルD&Dと画像clipboard貼り付け（Ctrl+V/⌘V）を追加。画面・ウィンドウ選択UIを削除。既存のネイティブclipboardボタンとPNG選択は継続。
- 音声ファイルD&Dを追加。選択後に処理先を確認して開始する。読取中の非表示・最小化・設定や会話変更は送信しない。tools専用IPCでbounded bytesだけを渡す。
- 通知は実際の幅で自然な高さを測りrevision付きIPCでリサイズ。作業領域を上限とし、長文は省略案内と全文へのボタンを出す。内部スクロールなし。
- 尻尾を回転した矩形から重ねた三角形へ変更し、枠との接続点の突起を除去。

## 検証

- desktop-assistant: 30ファイル・240テスト通過。
- server起動/配布管理: 3ファイル・25テスト通過。
- Chromium生成UI: D&D・clipboard・明示送信・context変更取消・通知自然高要求・長文省略と拡大時の全文表示を検証。
- pnpm build / pnpm typecheck。
- 内蔵host: 40 resources / 6 runtime variants、実行せず配布物整合確認。
- 独立レビューと修正の再レビューはreview.md。negative-controls.mdに修正前の失敗と復元SHA256。

## 範囲

実OSのD&D/clipboard、音声認識エンジンやモデルの認識品質は生成UI検証の対象外。既存のcapture backendは互換用に残すがUIからは呼ばない。
