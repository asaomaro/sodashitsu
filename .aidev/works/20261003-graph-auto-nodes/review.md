# レビュー記録: 20261003-graph-auto-nodes

## タスク点検ログ

coding 工程のタスク単位の独立点検（委譲）で見つけ、その場で直した指摘。review 工程のラウンド指摘の件数には数えない。

- T2 [nit] `--machine <local 以外>` で caller が捨てられることを見るテストが cliArgs.test.ts に無い → 1 本足した（`--machine local` は残る） [conv:-]
- T2 [nit] 「古いサーバ相当」のテストが callerPaneId の無視までは見ない → 新旧どちらも strict でないスキーマで未知の項目が無視される範囲で足りるとして据え置き [conv:-]
- T3 [should] `forgetStart` の「その親の記録だけ消す」をテストが縛っていない（無条件削除に壊しても通る）→ 別の親の取り消しでは消えないテストに分けた [conv:regression-negative-control]
- T4 [nit] 競合の再試行のたびに skip ログが重複する → 採用した試行のぶんだけ出す [conv:-]
- T4 [nit] 再試行の間に closed／paneExists を見ていない → ループ先頭で見直す [conv:-]
- T4 [nit] 線が 0 本でもノードだけ足されることが設計に明記されていない → コメントに意図（別の監督役が居る子もグラフに見せる）を書いた [conv:-]
- T4 [nit] 上限の境界テスト（線 127+1・ノード 63+1）が無い → 足した（`>` を `>=` に壊すと落ちる） [conv:regression-negative-control]
- T5 [should] 受理の前に断られた `agent start` の `forgetStart` が、同じ親の先に受理された記録を消す → `accepted` のときだけ取り消す。専用のテストを足した [conv:regression-negative-control]
- T5 [should] lineage.test.ts の結び付きの検査が、呼び出し元と分割元を同じ pane にしていて弱い → 呼び出し元を別の pane にした [conv:regression-negative-control]
- T5 [nit] PaneOpRegistry.test.ts の追加が何も縛っていない → 外した [conv:-]
- T6 [should] AC5 後半（親への監督の知らせ）が結合で担保されていない → 親も偽の claude にして、知らせの入力が届くことを見る結合テストを足した（知らせの送信を壊すと落ちる） [conv:regression-negative-control]
- T6 [should] 「1 pane につき 1 回」の検査が `attempted` を外しても通る → 子のノードを外してから再検出しても戻らない形に直した [conv:regression-negative-control]
- T6 [nit] 負の確認の固定 sleep・CLI の結合が `opts.caller` を直接渡している → 名前付きの待ち（理由つき）・環境変数から `parseArgs` で caller を作る形にした [conv:e2e-observe-browser]
- T7 [should] docs/agent-graph.md「実機で未検証の項目」に自動載せが入っていない → 足した [conv:-]
- T7 [nit] 「最初に検出されたとき」が実装より広い／ログのレベルと `failed` が無い／SKILL.md の「載らないのは」が部分的 → 直した [conv:-]
- cross [nit] 親が素のシェルの pane でも載る → 仕様の範囲として docs に書いた [conv:-]
- cross [nit] `close()` の後に走っていた `attach` の `update` が例外になり得る → warn で握られるので害なし、据え置き [conv:-]

## ラウンド 1（HEAD = test-result の記録のコミット・作業全体の差分・委譲）

must 0・should 3・nit 3。安全（`callerPaneId` はサーバの権限判断・対象選択に使われない・`pane.sock` に載らない・ログに秘密や画面内容を出さない）・メモリ（`pane.closed` で消える・pane の ID は再利用されない）・競合と順序・互換性（`.strict()` でない・`pane.test.ts` の期待を緩めていない）・スタイルに問題は見つからなかった。

- [should] `callerPaneId` は検証できず、ログイン済みの接続が他の pane を親に名乗れる。自動で引かれた線は子の画面の末尾を親へ打ち込む経路になるが、文書に書かれていない — 根拠: AgentLineage.ts `valid()`・agent.ts `onAccepted` → `docs/agent-graph.md`「安全: 受け渡しはプロンプト注入になりうる」に、名乗りが検証できないこと・権限は増えないこと・意図しない線は外すこと・手掛かりはログの `graph.auto: added` を足した [conv:-]
- [should] 上限（ノード 64・線 128）に当たると利用者の手動操作も黙って塞がれるが、ログが info — 根拠: AgentLineage.ts の `skip("too_many_*")` → `too_many_nodes`・`too_many_links` を warn にした（単体テストで warn を確認）。文書の表にも書いた [conv:regression-negative-control]
- [should] `docs/agent-graph.md` の「載らない条件」に「素のシェルの pane でも載る」という載る話が混じっていた → 「載る条件」へ移した [conv:-]
- [nit] `created` に期限が無く、作った後数時間たって手で起動したエージェントも載る → 「載る条件」に一行足した（設計上の帰結）
- [nit] 「載らないこと」を確かめるテストが固定の待ち（300ms）に頼る → 検出を待った後の「載らない」の確認で、偽陽性側（見落とし）の弱さ。検出の完了は `typeClaude` で待ってあるので据え置き（負荷下の確認はしていない）
- [nit] AC6（承認待ちの知らせの実物）・AC13（古い版との実物）はコードの読みと単体で示した → `test-result.md` の未検証の穴に書いてある。据え置き

修正の後: `AgentLineage*`・`composeServer.lineage` の 52 件が通る。
