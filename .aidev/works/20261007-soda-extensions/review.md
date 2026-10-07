# レビュー: soda 拡張・表示の面

実装（Sonnet の別エージェント）とは別のコンテキスト（Sonnet の別エージェント）で、読むだけの独立レビューを掛けた。PR ごとに記録する。

## PR1: サーバと sodactl（T1〜T7。静的な形式）

タスクごとの独立点検（★ T1・T2・T3・T4・T6）と、PR1 の全体の点検を、1 回のレビューにまとめた。

### 1 回目（165f88b...fd26e6c）

must 0・should 3・nit 5。判断は「マージしてよい」。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | `sodactl display events` が、`display.ready` の直後・最初の `wait` の登録の前に起きた出来事を落としうる | 直した（c341a5a。ready の前に `display.list` で `seq`・`epoch` を得て、最初の `wait` から `since` を付ける。時間に頼らない結合テストと負の確かめ） |
| should | 受け口 `pane.sock` は名乗る pane の id を検証しないので、同じ OS の利用者の別のプロセスが、ほかの pane の面を差し替え・操作の値を読める | docs に限界として書いた（c341a5a。`docs/sodactl.md`）。コードは変えない。接続元の pid からの逆引きは別の作業の候補 |
| should | 中身を渡さない `display set` が、標準入力が端末でないときに空の面を成功させる | 直した（c341a5a。終了コード 2） |
| nit | 待ちの全体の上限 16 が pane をまたいで共有される | 見直した（c341a5a で 64、ca3a257 で 32） |
| nit | `display_busy` で `events` が黙って終わる | 直した（c341a5a。`display.end(busy)`） |
| nit | 大きさの事前の検査が `/ws` の 1 通より数バイト甘い | 直した（c341a5a。512 バイトの余裕） |
| nit | `--timeout` が最大約 1 秒長引く | 直した（c341a5a・ca3a257） |
| nit | 認証の前に溜める量が 64 接続 × 4 MiB に増えた | 直さない（10 秒の期限・同じ利用者だけ。test-result.md） |
| テスト | AC14 の負の対照が PR1 に無い | 取った（c341a5a。test-result.md） |

問題なしと確かめた点: 受け口の 5 操作は `ctx.paneId` だけを対象にし、引数の `paneId` は strict の schema が断る／`/ws` は既存の認証と権限の道を通る／上限の迂回（置き換え・待ち・出来事の列・閉じた pane の残骸・`display.get` の範囲）でメモリを使い切らせる経路は無い／入力の検査／ask・中継・handoff への影響。

### 2 回目（c341a5a の差分だけ）

前回の指摘はすべて直っている。must 0・should 1・nit 2。判断は「マージしてよい」。AC14 は、レビューの側で別の変異（`DisplayService.action` が出来事をほかの pane の列にも流す）を試し、既存のテストが落ちることを確かめた。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | 待ちの全体の上限 64 が、受け口の同時接続の上限 64 と同じで、`wait` が接続を占有し切ると、ほかの操作が `pane_socket_busy` になる | 直した（ca3a257。32 に） |
| nit | `--timeout 1000` ぴったりで、一度も聞かずに時間切れになりうる | 直した（ca3a257。必ず 1 回は聞く） |
| nit | `display.end` の理由 `busy` が docs に無い | 直した（ca3a257） |

ca3a257 は定数 1 つ・条件 2 行・docs の小さな差分で、監督のセッションが差分を読んで確かめた（別のコンテキストの再レビューは掛けていない）。

### 確かめたこと

- `pnpm build`・`pnpm typecheck`: エラー 0
- `pnpm test`（c341a5a）: 8416 件中 8413 件通過。失敗 3 件は `tui.integration.test.ts`（worktree のパスが長いと main でも落ちる。20261007-agent-hook-drift で切り分け済み）
- ca3a257 の後: protocol 347・server の display と panesocket 144・cli 927 件が通過（全体は流していない）
- `aidev smoke`（ca3a257）: pass（10 本。handoff の段に表示の面の確かめを含む）

### PR1 では確かめていないこと

- 画面（ブラウザ）での表示。PR1 に画面は無い（PR2）。
- Windows の実機（受け口の無い `/ws` の経路は、結合テストで代えた）。
