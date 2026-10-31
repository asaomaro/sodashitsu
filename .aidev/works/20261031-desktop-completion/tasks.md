# 全体の作業

- [x] 保護画面中のsodaユーザー権限によるファイル転送（PR356、main c63a409e、CI16ジョブ成功。両端への配布は最終段階）
- [x] Linux/macOS nativeのUDP・codec・動画の自動調整と転送解像度拡張（PR357–360、main 516355ac、各CI成功）
- [x] Linux/macOSの複数monitor・選択・OS解像度・仮想画面の利用可能なOS機構への対応（PR361–363、利用不可/未対応範囲はstatusに記載）
- [x] 保護画面と動画/音声、仮想画面とモニター/解像度の併用拡張と、必要な明示権限・source確認（PR364–367とvirtual-monitor-selection）
- [x] 暗号化プラグイン経路とデスクトップアシスタント/配布更新の残件を再点検し、実装の不足を解消（audit.md、追加修正の必要なし）
- [x] 最終独立cross、関係テスト・CI22成功、main統合、このPCのbuild/handoff・pane/served asset確認、不要worktree整理（integration.md）
- [ ] sr-pcのbuild/handoff・既存接続の確認（reverse接続がなくmachine_unavailable。実行可能になってから継続）

各段階の権限・状態/保存・protocol/source変更はtaskcheck対象。文書だけの差分は最後のcrossへまとめる。実機成功の代用に生成試験を用いない。
