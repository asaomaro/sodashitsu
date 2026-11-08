# 検証結果

固定runtime: 844aec1a（base d631c935、契約b72/target9164+8d92+3e05/配線4f66/128枠fix844）。Node24.22.2。

- 7関連suites33tests pass（positive.log）。実Unix WebSocket + 自作child session_meta + 安全な実fd + 実ControlSurfaceの受付/target/重複ACKを検証。
- 実composeServerの新規ownstate/専用Node REPLにauthenticatedWSで接続し、登録RPCと未所有targetの拒否を確認。モデル/エージェント起動0、WslHostResourcesはmock、既存pane/設定/Windows無操作。これは実ユーザー子sendではない。
- protocol56suites593tests pass（protocol-regression.log）。server tsc-b/CLI build 0。最終全server test-inclusive型検査0（node --max-old-space-size=8192 ... tsc --noEmit -p packages/server/tsconfig.typecheck.json）。
- 初回型検査は既定heap OOM134。8GiB再試行で既存Grok fixture参照のCLI dist未生成2件のみ。CLI build後の最終型0。初期失敗をsource退行や合格として混同しない。全体test再実行なし。

負例は一時的な自分のworktreeだけ。各finallyで保存bytesへcmp相当で復元、SHA記録。negative-*.logは生出力。
1. d631の旧agent method登録→生成surface新RPC不在でfail。
2. direct能力の厳密true確認を外す→false/nullでfail。
3. current scope guard無効→親/参照/子終了の回帰fail。
4. request dedup無効→連打/未知配送の回帰fail。
5. loaded thread.path照合を外す→同UUID別recordでfail。
6. 旧4f66 service→127未知＋2並列/TTL後保持の新境界1fail。復元後33pass。

negative-restoration.jsonは最初の4負例時点、path-restoration.jsonはpath条件追加後、unknown-bound-restoration.jsonは最終service fix時点。最終全runtime SHAはreceipt.json。

独立review: rootが4f66全体を読取り、unknown entry上限P2を指摘。844のprepare/send予約制限と負例/復元を再レビューし指摘なし。UI接続は別担当、現在/終了子history・Cursor intake・子数値・Windows保護音声・正式署名IDDの残件はtasks.mdへ維持。
