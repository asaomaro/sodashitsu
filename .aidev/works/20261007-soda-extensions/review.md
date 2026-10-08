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

## PR2: 画面（T8〜T22。静的な形式）

タスクごとの独立点検（★ T8・T9・T11）と、PR2 の全体の点検を、1 回のレビューにまとめた。レビューの側が、実ブラウザ（Chromium）で、`packages/web/public` を配る小さなサーバと、本物と同じ sandbox・CSP・MessageChannel の手順の親ページを自作し、悪意のある入力を約 20 種通して観測した（CSP を外した対照つき）。

### 1 回目（origin/main...fd8cfb8）

must 0・should 3・nit。判断は「直してから」。枠の隔離は破れなかった。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | 取り除きの DOM clobbering: `<form on…><input name=attributes>` で、form の属性が 1 つも消えない（CSP だけが止めていて、二重の守りが一重） | 直した（3ef8501。要素のメソッド・getter をプロトタイプ経由に。E2E (11) の 12 種。直す前で 4 種が落ちる） |
| should | `<img name=createElement>` の後、次の `render` が失敗して古い中身で固まる | 直した（3ef8501。`document` の側もプロトタイプ経由に。描画の全体を try で囲み、失敗を親へ知らせる。E2E (12)） |
| should | E2E の (7)(8)（フォーカスを奪い続ける中身）が、中身が取り除かれて一度も動かず、空振り。「取り除きと CSP の両方を外すと落ちる」対照が無い | 直した（3ef8501。面の出現・更新でアプリがフォーカスを動かさないことを測る形に作り直し。対照 (b)(c)(d) を記録。奪取への備えは PR3 の範囲と明記） |
| nit | `fetchOnce` が大きさを確かめない／接続が切れたときフォーカスが body に落ちる／題に書字方向を変える文字／モバイルの `prefix+i` がトーストになる／docs | 直した（3ef8501） |
| 見た目 | 右上の初回の案内が、帯・パネルの見出しに重なる | 直さない（既存の知らせの置き場所。4 秒で消え、クリックを通す。消すまで残る知らせは見出しに重なる） |

範囲の外で分かったこと: ask の `packages/web/public/ask-view/markdown.js` の取り除きにも、同じ種類の穴がある（`<form><input name="remove"></form>` で `el.remove()` が TypeError）。閉じる側に倒れ（ソースの文字の表示へ落ちる）、実行・移動には至らない。別の作業の候補（低）。

### 2 回目（3ef8501 の差分だけ）

前回の指摘は直っている（観測の道具を直した版に流し直し、CSP を外した版でも漏れ 0）。window の側の clobbering への対策が要らないことも、入力を通して確かめた。新しい should 1 件。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | 退行: `focusFirst` が、控えた `HTMLElement.prototype.focus` を SVG の要素（`<use href>` など）に `call` して `Illegal invocation`。インライン SVG のある面で `prefix+i` が効かない | 直した（e085172。HTML と SVG の `focus` を使い分け、要素ごとに try して、実際に移った要素で止める。E2E `display-flows` (16)。直す前で落ちる） |
| 確認 | `display-mobile.spec.ts` の確認が 2 行消えていた | 戻した（e085172。うっかり） |

作り直した (7)(8) は、レビューの側は読んで判断しただけで、実装を壊して落ちることまでは試していない。

e085172 は 18 行の差分で、監督のセッションが差分を読んで確かめた（別のコンテキストの再レビューは掛けていない）。

### 確かめたこと

- `pnpm build`・`pnpm typecheck`: エラー 0
- `pnpm test`（3ef8501）: 8515 件中 8512 件通過。失敗 3 件は `tui.integration.test.ts`（worktree のパスが長いと main でも落ちる）
- E2E（e085172。監督のセッションが流した）: display の 5 つの spec で 46 件すべて通過
- 既存の E2E（fd8cfb8）: 93 件通過・5 件失敗。4 件は main でも落ちる（`key-bindings:632`・`:699`・`workspace-tab-pane:305`・`mobile:189`）。1 件（`mobile:77`）は、起動時の通信が 1 本増えて時機がずれたことで落ち、テストの待ち方を直した（弱めていないことをレビューで確認）
- `aidev smoke`（e085172）: pass（10 本）
- 実測した前提: `MessagePort` を不透明 origin の枠へ渡せる／`frame.evaluate` が `script-src 'self'` の枠で動く／`allow-forms` で `submit` のイベントだけが起き送信は起きない／marked が Markdown の中の HTML を通す／枠が移ると 2 回目の `load` が起きる

### PR2 では確かめていないこと

- 実機（iOS Safari・Android Chrome）と、Firefox・Safari。実測は Chromium だけ（`docs/display.md`・`docs/verification.md` に明記）。
- スクリプトが動く形式（PR3）。PR2 では「この画面では出せません」と出る。
