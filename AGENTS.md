# AGENTS.md

このリポジトリで作業する AI エージェント・開発者への案内。

製品名は **Sodashitsu（操舵室）**。サーバのコマンドは `soda`、外部操作の CLI は `sodactl`、パッケージは `@sodashitsu/*`。

- 開発の進め方（要件 → 設計 → 実装 → テスト → レビュー → 着地）の記録は `.aidev/works/` にある。
- 利用者向けの手順は `docs/`（TLS の設定・3 OS と実機での検証・herdr との対応・独自コマンドの設定ファイル・旧名 wtm からの移行 `docs/migrate-from-wtm.md`）。

## コーディング規約の条項

下のブロックは aidev が管理する索引（`.aidev/conventions/` の条項への入口）。本文は各条項のファイルにある。

<!-- aidev:conventions -->
- E2E を書く・直すとき → .aidev/conventions/e2e-observe-browser.md
- 不具合を直して回帰テストを足すとき → .aidev/conventions/regression-negative-control.md
<!-- /aidev:conventions -->
