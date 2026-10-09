# レビューの記録: agent-resume-lost

## 独立レビュー（実装とは別のエージェント。差分全体）
- 判断: マージしてよい。止める指摘なし。
- S1（記録だけ）: `decisions.md` E3。
- S2: `session.beginShutdown()` を `await control.beginClosing()` の前へ移した（5da9550）。
- S3: 統合テスト (a'') を追加。`AGENT_GONE_GRACE_MS = 0` にすると落ちることを確かめた（否定の対照）。
- N1 は記録（E4）、N3・N4（ログの間引きの細部）は見送り（E5）。

## 着地の前に流したもの（main の取り込み後。Node 24）
- `resumeLost.integration` 7/7、`stopSmoke` ok、`handoffSmoke` ok、起動確認（smoke）PASS。
- `pnpm test` の全体: 9736 通過・1 落ち（web の `GraphView.test.ts` の 1 件。今回は web に触れていない。単独では 2 回とも通る。負荷による揺れ）。

## 残ること
- 実際の Codex・WSL の停止で同じ道を通ったかは、再現できる範囲（偽のエージェントと実際のサーバ）で確かめた。WSL の再起動そのものは試していない。
- エージェントを終了して 10 秒より前にサーバを止めた pane は、次の起動で再開されることがある（受け入れる。文書に記載）。
