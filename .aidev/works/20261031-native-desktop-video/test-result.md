# 検証

- pnpm build / pnpm typecheck 成功。
- Linux portal生成59件成功。GstVideo typelibは開発環境の/tmpに展開した既存パッケージを使用し、OS設定や実デバイスに接続していない。
- Linux native video flow生成21件中20成功、実software encode/decode 1件はローカル依存不足でskip。CIでは必要パッケージを導入する既存ジョブで実施する。
- Node DesktopNativeAudio 9件成功。同一capability再送、旧処理退役後の生成PCM復帰、接続後再送停止、source失効を確認。
- Provider単体6件成功。
- ブラウザ8組はLinux/macOS×単独/共有×UDP/WSS。生成H264画素と生成音声のみ。UDP切断後の新ACKと描画増分を確認する。ローカルChromium1243の既知の停止を避け、SODA_E2E_CHROMIUM_PATHでインストール済1217を指定。CIは標準ブラウザ。
- 負例の生出力はnegative-control.txt。元Linux実装で意図した3 assertion失敗→復元3成功、元Node音声実装で意図した1 assertion失敗→復元成功。元ソースのバイトは変化していない。

全体テストは925ファイル・13350件成功、実行中に追加した音声2件は旧モジュールが読み込まれたため失敗。ソース固定後の音声ファイル9件再実行は成功。強化したブラウザ8件も成功。生成helperを実nativeと同じ重複bootstrap無視に揃えた。

CIで既知のWindows checkpoint replay単体試験がhosted profileのACLに依存して失敗したため、このpolicy-generation単体に限りWindows ACL/DPAPI境界を生成adapterへ置換。実ACL/DPAPIの専用検証ジョブと製品の許可条件は変更しない。

macOS生成compile/self-test・CIは進行中。実OS画面/音声取得・操作の成功とは扱わない。
