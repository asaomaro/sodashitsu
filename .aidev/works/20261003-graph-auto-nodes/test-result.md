# テスト結果: エージェントが起動したエージェントを連携のグラフに自動で載せる

対象: `feature/graph-auto-nodes` の HEAD。合格の根拠にした実行は **Node v24.15.0**（この環境の既定は v20.20.2。`engines` は 24 以上）。

## 実行したもの

- `pnpm build`（Node 24）— 終了コード 0。
- `pnpm typecheck`（Node 24）— 終了コード 0。
- `pnpm test`（全体。Node 24）— 389 ファイル・**6988 passed / 0 failed**・終了コード 0。
- `pnpm lint`（Node 24）— 終了コード 1・**22 errors。`main` と同じ件数**で、この work で足した・変えたファイルのものは無い（途中で出た `PaneOpRegistry.test.ts` の未使用の import は、そのファイルを `main` に戻して解消）。
- 起動確認（smoke。`aidev smoke` 10 本。Node 24・別のパスの worktree）— **pass**。
- 結合試験（実物の `composeServer`＋実 PTY の偽 `claude`）: `composeServer.lineage.integration.test.ts` 11 本、`agentStart.integration.test.ts` 5 本 — 2 回続けて同じ結果。
- 単体: `AgentLineage.test.ts`・`AgentLineage.attach.test.ts`（状態・購読・`attach` の判定とログの reason 全種・競合の再試行）、`surface/methods/lineage.test.ts`（4 つのハンドラ）、`cli/src/callerPane.test.ts`（送る条件）、`protocol/src/messages.test.ts`（スキーマ）。
- 陰性対照（`regression-negative-control`）: 実装を一時的に壊して落ちることを確かめた——`review.md` の「タスク点検ログ」に記録。主なもの: `attempted` を外す／`started` を優先しない／`pane.closed` で消さない／購読の try/catch を外す／重複・別の監督役・逆向き・上限の判定を外す／`rev_conflict` の再試行を壊す／`onAccepted` の外で記録する／`forgetStart` を外す／`accepted` の判定を外す／`callerPaneParam` が常に送る／親をエージェントにしない／監督の知らせの送信を壊す。
- **実物の Claude Code での一巡**（Node 24・別のポート 7791・使い捨ての状態ディレクトリ。7780 のサーバには触れていない）: 新しい版のサーバの pane の中で本物の `claude -p` に「この pane を分割し、`sodactl agent start` で別の claude を起動して質問し、答えを読んで」と頼んだ。結果: Claude は `pane split` → `agent start helper` → `agent prompt --wait` → `agent read` を自分で打ち、答え（2）を報告した。`graph show` は `nodes: local:p1, local:p2`、`l1: supervise p2→p1`、`l2: approval p2→p1（notify・40 行・上限 10）`、rev 1。ブラウザは付けていない（グラフ画面の表示は未確認）。終了後にサーバを止めた。

## 受け入れ基準ごとの判定

- AC1: pass — 結合: `pane.split`／`workspace.create`／`tab.create` の `callerPaneId` → 打ち込み・`agent start` の検出で子と親のノード。入れ替わりでも重ねて載らない。実物の Claude Code でも確認。
- AC2: pass — 結合: `agent start` を使わず `claude` を打ち込んだ pane でも載る。
- AC3: pass — 単体＋結合: 作った人より `agent start` を打った pane が親。
- AC4: pass — 結合・単体: 呼び出し元が分からない（手で作った pane・`callerPaneId` なし・`--machine`・pane の外・接続先違い）ときは何も載らず、ログも出ない。手で作った pane でも pane 内の `agent start` なら載る。
- AC5: pass — 結合: 子→親の監督の線。**親も偽の claude にして、監督の知らせの入力が親に届くこと**（子の pane ID と「監督役」を含む）まで見た。
- AC6: pass — 結合: 承認の代理の線が `notify`・40 行・上限 10。承認待ちの知らせは既存の `GraphEngine` の単体に頼る（今回の変更は線を足すだけ）。
- AC7: pass — 結合: 子を外すと戻らず、親を外すと別の子の検出で戻る。
- AC8: pass — 結合: 手で置いたノードの位置・線の設定・一時停止が変わらない。重複しない。別の監督役が居ると監督の線は引かず、ノードと承認の線は足す。新しいノードの配置は `addMissingNodeOps` の単体に頼る。
- AC9: pass — 結合（ノード 64）・単体（線 128・境界 63+1／127+1）: 超えるなら何も足さず、理由を記録する。
- AC10: pass — 結合: 親を閉じてから子を検出すると何も足さず rev も進まない（`parent_gone`）。単体: 検出前に子が閉じると記録が消える・再試行の間に閉じる。
- AC11: pass — 単体: 競合で `get()` からやり直す（最大 3 回）・それでも失敗するとログして諦める・例外を握る。ハンドラの単体: `pane.split` 等の結果に影響しない。
- AC12: pass — 結合: `graph.changed` が 2 接続の両方に rev 1 で 1 回だけ届く。何も足さないときは rev が進まない。
- AC13: pass — 単体: 旧形・未知の項目つきの params が通る。結合: 旧形の `pane.split` が従来どおり成功する。**実物の古い版との組み合わせは確かめていない**（コードの読みとスキーマの単体で示した）。
- AC14: pass — `docs/agent-graph.md`・`docs/sodactl.md`・`packages/cli/skills/sodactl/SKILL.md`・`docs/verification.md` を実装と 1 つずつ照合して点検した（`review.md` の T7）。`skill.test.ts` が通る。

## 失敗の証跡

このラウンドでは、この work に由来する失敗は発生していない。実装の途中で出た欠陥（受理の前に断られた `agent start` が先の記録を消す・再試行の間の閉じた pane の確認漏れ・skip ログの重複 ほか）は `review.md` の「タスク点検ログ」にある。

## 未検証の穴

- **ブラウザでのグラフ画面の表示**: 実物の Claude Code での一巡はサーバの `graph show` で見ただけ。ノードが画面に出ることは確かめていない（画面側のコードは変えていない）。グラフ画面の E2E は元から無い。
- **7780 の本物のサーバ**: この変更はまだ入っていない（入れ替えは `soda handoff` で可能）。
- **Windows**: `agent start` が非対応のため、打ち込み起動だけが対象。確かめていない。
- **別のマシン**: 対象外（`--machine` では名乗らない）。
- **古い版との組み合わせ**（古い `sodactl`×新しいサーバ、新しい `sodactl`×古いサーバ）の実物での確認。
- **承認待ちの知らせ**（子が承認待ちになって親へ知らせが出る）の実物の一巡。
- E2E 全体・`web` は変えていないので流していない。
