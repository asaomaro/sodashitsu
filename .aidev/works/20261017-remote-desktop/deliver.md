# リモートデスクトップ PR・merge

利用者が2026-10-17に「prしてmerge」と指示。feature/remote-desktop → main。`create-pr` / `conventional-commit` スキルを使用し、明示された提出・mergeの範囲で進める。

- d621ac67: リモートPC共有・操作・動画/音声/clipboard・agent API/MCP/モデル/CLI・解像度追従/等倍・最大化の実装と記録。
- 29b4053c: origin/main 576dbfbd（PR #172等）を取り込み。protocol/composeServer/MachineHeaderの競合は双方の機能を維持して解消。
- 725d69cc: 初回統合buildの型名衝突を解消。既存CDP公開APIを維持し、新規側だけRemoteDesktopInput/RemoteDesktopViewerMessageへ変更。
- 独立レビュー: review.mdのmain統合レビュー。修正後consumerも再点検済み、重大指摘なし。
- 全build・全typecheck PASS。全Vitestは695files・11,062tests PASS、既知agent.prompt delayMs不一致1件FAIL（前から起点で再現、対象コード差分0）。詳細はtest-result.md。
- PR: https://github.com/asaomaro/sodashitsu/pull/173
- 関連E2E15件PASS（1.7m）、隔離worktree cwdで最新build成果物のsmoke PASS。ログはtest-result.md。
- 検証結果と既知1件の失敗・実機の未検証項目をPR本文へ記載し、ユーザーが許可したmergeを実行する。最終merge状態とSHAは上記GitHub PRを参照。

共有main/他worktreeの既存作業には触れていない。検証用に新しい一時worktree /tmp/sodashitsu-desktop-delivery-smoke を作成した。環境install/Firewall/ポート/Funnel変更なし。実解像度切替・新規capture/input/audio/clipboard・外部model API呼出しなし。実機での未検証範囲はdocs/remote-desktop.mdとPR本文に明記。
