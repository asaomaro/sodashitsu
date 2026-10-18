# 実装計画

- [x] Windows DemandStart broker・SID/session/lease付きlocal-only IPC・protected installを実装（安全境界の独立点検）
- [x] Winlogon専用workerとSAS・解除時停止を実装（安全境界の独立点検）
- [x] Sodashitsu起動中lease・ローカル許可とWeb/TUI設定・起動optionを接続（保存/起動の独立点検）
- [x] プロトコルとlocked専用UI・agent拒否・解除後の閲覧再接続を実装（プロトコルの独立点検）
- [x] C# compile/self-testsとsynthetic sourceブラウザE2E/負の対照
- [x] 差分全体の独立レビュー・必要な修正と再レビュー
- [x] 導入/削除・制限・検証記録を文書化。実機導入は利用者によるBの管理者操作。

## 利用者環境で残る確認

- [ ] B側管理者による初回導入と、実際のロック画面への接続・Windows認証・解除・Soda終了時の停止（この作業では実機の設定変更/ロック/入力を行わない）。
