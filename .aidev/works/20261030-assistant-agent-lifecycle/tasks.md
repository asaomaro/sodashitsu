# 作業

- [x] native installation UUIDを親の所有app管理へ伝える
- [x] disableで専用agentの停止を要求し、idle所有確認後に閉じる
- [x] 停止markerを独立保存、ensure/input/adoptと復元の両方で拒否
- [x] 仕事継続・foreign actor保護・fresh argv証明後の停止
- [x] idle drainの世代・回収・dirty再走・終了境界競合を検証
- [x] 全体独立レビュー2件と修正差分再レビュー、残指摘なし
- [x] 関連4ファイル46テスト、9件の意図した修正前AssertionErrorを確認
- [ ] 最終build/typecheck/全体試験・CI・PR・merge

後続: agent自身への画像/音声直接依頼の経路。音声対応はmodel/CLIにより異なるため未対応時に別サービスへ暗黙送信しない。
