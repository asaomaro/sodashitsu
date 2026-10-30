# 作業

- [x] ZIP/フォルダー配置、排他・atomic参照・前版rollback
- [x] CLIと有効時の終了確認付き切替、無効時の非起動
- [x] 関連テストと利用文書
- [ ] 関連テスト最終確認・build/typecheck/全体テスト
- [ ] 独立レビュー（保存/プロセス状態/ZIP境界を対象）と指摘対応
- [ ] PR・main反映

## 次段階の残件

- [ ] 音声連携: Claude Codeの/voiceは提供元STTから入力欄へ入れる機能。Codexの実インストールから生成したexperimental app-server TurnStart UserInputにはaudio/localAudioが存在する。既存の検証済み専用セッションへ、同じmodel/effortを変えずに送るadapter・chunk保存・明示UI・取消を次段階で実装する。通常CLIのhelpに音声フラグがないことだけで非対応としない。
- [ ] リモートデスクトップのnative動画・音声・clipboard等と保護/仮想画面の併用拡充を段階化
- [ ] Windows GUI/WSL親終了/実エージェント/音声の実機確認（本環境のコード検証とは別）
- [ ] 残件実装後、接続元/sr-pcの稼働版・helper起動エラーを確認し、接続問題を解消する（ユーザー追加指示）。rootの未コミット作業は保護する。
