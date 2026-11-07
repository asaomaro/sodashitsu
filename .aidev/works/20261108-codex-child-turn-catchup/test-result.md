# Codex子ターン設定の継続取得（2026-11-08）

固定base: 0ee709d0。実装・テストを固定して検査。Node 24.22.2。

- 関連13 suites / 196 tests pass: restored.log（全体テストの重複実行なし）。
- 旧実装・対象guardの負例4 fail、IO失敗分離の負例1 fail。生出力はnegative-control.log / io-negative-control.log。固定snapshotへcmp完全一致復元後196 pass。
- server全体noEmit（test含む）exit0、専用worktree内runtime emit exit0。共有node_modulesを経由したmain dist上書きなし。
- actual-metadata.log: 認証済み公開snapshotの同一parent/instance/子所属を前後照合し、別Nodeのreadonly FDで3子を取得。最大80poll/170秒、1poll2秒間隔。19poll/38.206秒で3子すべてEOF、model=gpt-6.1-sol/effort=medium各3、invalid0。実会話本文・id・記録path保存なし。model呼出し0、private cache close済み。
- 自作70MiB級2file、巨大JSON行、UTF8/chunk/重複key/偽header、append優先、欠測clear、replace/truncate/ns同size rewrite、startedAt、scope/旧epoch取消、公平64子、metadata IO障害時所属維持を確認。

実機初回診断で公式world_stateの未対応を検出しunknownで停止。installed manifestはCodex 0.166.0。正式rust-v0.166.0のRolloutItemWireを照合してturn用途だけknown非turn rootを追加。subagent抽出用途のguardは変更していない。

一次資料:
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/history/src/rollout_payload.rs
- https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/protocol.rs

独立レビューはrootが別contextで実施。未反映の段階では本番表示の成功を主張しない。
