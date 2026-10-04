# AGENTS.md

このリポジトリで作業する AI エージェント・開発者への案内。

製品名は **Sodashitsu（操舵室）**。サーバのコマンドは `soda`、外部操作の CLI は `sodactl`、パッケージは `@sodashitsu/*`。

- 開発の進め方（要件 → 設計 → 実装 → テスト → レビュー → 着地）の記録は `.aidev/works/` にある。
- 利用者向けの手順は `docs/`（TLS の設定・3 OS と実機での検証・herdr との対応・独自コマンドの設定ファイル・旧名 wtm からの移行 `docs/migrate-from-wtm.md`）。
- 端末版（引数なしの `soda`）の使い方は `docs/tui.md`、機能の扱いの一覧は `docs/tui-parity.md`。
- pane の中のプログラムが利用者に質問のフォームを出す `sodactl ask`（どのブラウザに出るか・結果の JSON・終了コード・上限）は `docs/sodactl.md`「質問のフォーム」。
- pane の中の `sodactl ask` がログインなしで使う、ログイン不要の受け口 `pane.sock`（使われる条件・`/ws` へ落ちる条件・安全の境界・載せてよい操作の条件と登録の仕方）は `docs/sodactl.md`「ログイン不要の受け口（pane.sock）」。
- `sodactl ask` の画面の部品 `<ask-form>`（ask-form と同じ部品を `third_party/ask-form/` に無改変で写したもの。写し直す手順・替えるたびに確かめること・定義の項目を足すときに直す場所）は `docs/sodactl.md`「画面の部品と同期」と `third_party/ask-form/README.md`。
- ブラウザ版の端末のファイルのリンクとドロップ（同じマシンかの判定・開き方・送ったファイルの置き場所）は `docs/file-links.md`。
- エージェントの連携のグラフ（画面・線の種類・上限と一時停止・受け渡しの注意・別のマシン）は `docs/agent-graph.md`、`sodactl graph` は `docs/sodactl.md`。
- エージェントが動かしているサブエージェントの件数と一覧（フックの導入と更新・仕組み・対象外と制約）は `docs/agent-graph.md`「サブエージェントの件数と一覧」「サブエージェントの表示の仕組みと制約」、`sodactl agent get` の `subagents` は `docs/sodactl.md`。

## コーディング規約の条項

下のブロックは aidev が管理する索引（`.aidev/conventions/` の条項への入口）。本文は各条項のファイルにある。

<!-- aidev:conventions -->
- E2E を書く・直すとき → .aidev/conventions/e2e-observe-browser.md
- 不具合を直して回帰テストを足すとき → .aidev/conventions/regression-negative-control.md
<!-- /aidev:conventions -->
