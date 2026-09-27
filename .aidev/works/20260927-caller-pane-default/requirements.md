# 要件: 呼び出し元の pane を既定の対象にする（`wtmctl pane current`・`pane split` の対象の省略・`--pane`・`--current`）

## 背景 / 課題

pane の中で動くエージェントは、自分の pane の ID を `WTM_PANE_ID` で知っている（20260926-agent-skill-file）。しかし今の wtmctl は:

- `pane split` に対象の pane ID が必須で、skill は毎回 `"$WTM_PANE_ID"` を展開して渡させている。herdr は対象を省けば呼び出し元の pane を分け、
  `--current` で明示もできる（decisions.md D1）。herdr 用の手順・スクリプトがそのまま読み替えられない。
- 自分が今どの workspace・tab に居るかを知るには、`snapshot` 全体を取って `jq` で自分の pane を探し、tab から workspace を引くしかない。
  herdr は `pane current` 1 つで返す。
- herdr は workspace・tab の ID を環境変数（`HERDR_WORKSPACE_ID`・`HERDR_TAB_ID`）で渡すが、pane を別の tab・workspace へ移すと古くなる。
  本製品でも pane は移せる（ID は変わらず tab・workspace だけが変わる）ので、同じものを入れると古い値で利用者の別の workspace を操作させうる（decisions.md D2）。

## 目的 / ゴール

- pane の中のエージェントが、自分の pane の ID を展開して渡さなくても、自分の pane を分けられる状態（herdr と同じ書き方で）。
- pane の中のエージェントが、コマンド 1 つで「自分の pane が**今**どの workspace・tab に居るか」を得られ、pane が移された後でも古い値を掴まない状態。
- 呼び出し元の pane を暗黙に使う操作が、**別のサーバ・別のマシンの同じ ID の pane を誤って対象にしない**状態（分からないときは推測せず断る）。
- 自分の pane の歯止め（`self_target`）の効き方が変わらない状態。

（`.aidev/charter.md` はこの PJ に無い。）

## ユーザーストーリー

- US1: pane の中で動くコーディングエージェントとして、`wtmctl pane split --direction right` だけで自分の隣に pane を作りたい。なぜなら、herdr と同じ手順で書け、
  ID の展開し忘れ・取り違えが起きないから。（受け入れ: AC1, AC2, AC3, AC4）
- US2: pane の中のエージェントとして、自分が今居る workspace・tab の ID をコマンド 1 つで知りたい。なぜなら、同じ workspace に tab を足す等を、
  pane が移された後でも正しい場所に対して行えるから。（受け入れ: AC5, AC6, AC7, AC8）
- US3: 利用者として、pane の中の wtmctl が別のサーバや別のマシン（`--machine`）へつないでいるときに、手元の pane の ID を使って無関係な pane を
  分けたり調べたりしてほしくない。なぜなら、ID はサーバごとに別で、同じ ID が別の pane を指すから。（受け入れ: AC9, AC10, AC11）
- US4: pane の外で wtmctl を使う利用者（スクリプト）として、対象を省いた `pane split`・`pane current` が herdr と同じくフォーカスの pane を対象にしてほしい。
  なぜなら、herdr の手順をそのまま使えるから。（受け入れ: AC12, AC13）
- US5: 利用者・エージェントとして、使い方（help・skill・docs）で新しい書き方と、workspace・tab の ID を環境変数で渡さない理由を知りたい。
  なぜなら、古くなる値に頼る手順を書かずに済むから。（受け入れ: AC15, AC16, AC17）
- US6: 利用者として、呼び出し元の pane を既定の対象にしても、自分の pane を閉じる・入力する等の歯止め（`self_target`）が今までどおり効いてほしい。
  なぜなら、書き方が楽になったことで自分の pane を壊す操作が通るようになっては困るから。（受け入れ: AC14）

## スコープ

### 対象

- `wtmctl pane current [--pane <paneId>|--current]`（新規）。
- `wtmctl pane split [<paneId>|--pane <paneId>|--current] --direction right|down [--ratio N]`（対象の省略・`--pane`・`--current`）。
- 呼び出し元の pane を使ってよいか（pane の中か・同じサーバか・`--machine` か）の判定。
- skill（`packages/cli/skills/wtmctl/SKILL.md`）・`docs/wtmctl.md`・`docs/herdr-parity.md`（H39）・help・smoke の更新。

### 対象外

- `WTM_WORKSPACE_ID`・`WTM_TAB_ID` の環境変数（decisions.md D2。`pane current` で代える）。
- herdr で `--current` を受けるが wtmctl にコマンドが無いもの（`pane layout`・`process-info`・`neighbor`・`edges`・`focus`・`resize`・`zoom`・`input --right-click`・`swap`）。
- herdr で `--current` を受けないコマンド（`pane close`・`read`・`run`・`report-metadata`・`tab`・`workspace`・`agent`）への `--current` の追加。
- `self_target` の「同じサーバか」をサーバの識別子で確かめる改善（別の backlog 項目）。本 work は今の URL の比較をそのまま使う。
- サーバ・プロトコル・web の変更（snapshot の既存の情報だけで足りる）。

## 機能要件

- FR1: `pane split` は対象を位置引数・`--pane <paneId>`・`--current` のどれか 1 つで受ける。2 つ以上なら使い方の誤り。
- FR2: 対象を省いた `pane split`・`pane current` は、pane の中（`WTM_PANE_ID` がある）なら呼び出し元の pane、pane の外ならサーバのフォーカスの pane を対象にする。
- FR3: `--current` は呼び出し元の pane を対象にし、`WTM_PANE_ID` が無ければ使い方の誤り。
- FR4: 呼び出し元の pane を使う（`--current`・pane の中での省略）とき、接続先がその pane のサーバだと確かめられなければ、推測せずに断る
  （確かめ方は `self_target` と同じ——接続先の URL と pane の環境の `WTM_SERVER_URL` の origin を比べ、ループバックの名前は同じとみなす。
  `WTM_SERVER_URL` が無ければ確かめられない）。
- FR5: `--machine <名前|id>`（`local` 以外）では、`--current` は使い方の誤り、省略はそのマシンのフォーカスの pane。`--machine local` は手元のサーバそのものなので、
  `--machine` が無いときと同じく呼び出し元の pane を使う。
- FR6: `pane current` は対象の pane の情報（**サーバに問い合わせた今の** `tabId` を含む）に、今の workspace の ID と、フォーカスの pane か を加えて JSON（`{"pane": {...}}`）で出す。対象の pane が無ければ
  `not_found`、フォーカスの pane が無ければ `not_found`。
- FR7: `self_target` の対象・効き方は変えない（`pane split`・`pane current` は歯止めの対象外のまま）。

## 非機能要件 / 制約

- 既存の書き方（`pane split <paneId> --direction …`）の結果は変わらない（後方互換）。
- サーバ・プロトコルは変えない。
- `USAGE_LINES` と skill のコマンドの一覧の食い違いの検査（`skill.test.ts`）を通す。

## 完了条件 (受け入れ基準)

- [ ] AC1: pane の中（`WTM_PANE_ID`・`WTM_SERVER_URL` があり接続先が同じサーバ）で `pane split --direction right` を打つと、呼び出し元の pane が分かれる（`pane.split` の `paneId` が `WTM_PANE_ID`）。
- [ ] AC2: `pane split --current --direction down` と `pane split --pane p2 --direction down` と `pane split p2 --direction down` がそれぞれ呼び出し元・p2・p2 を分ける。
- [ ] AC3: `pane split` に位置引数・`--pane`・`--current` のうち 2 つ以上を渡すと使い方の誤り（終了コード 2）で、何も送らない。
- [ ] AC4: `--current` を `WTM_PANE_ID` の無い環境で渡すと使い方の誤り（終了コード 2。`WTM_PANE_ID` が要ると分かる文面）。
- [ ] AC5: pane の中で `pane current` を打つと、呼び出し元の pane の情報と `workspaceId`・`tabId`・`focused` が JSON（`{"pane": {...}}`）で出る。
- [ ] AC6: pane を別の tab・workspace へ移した後に `pane current` を打つと、移動後の `tabId`・`workspaceId` が出る（起動時の値ではない）。
- [ ] AC7: `pane current --pane p2` は p2 の情報を出す。存在しない pane なら `not_found`（終了コード 1）。
- [ ] AC8: `pane current` は読み取りだけで、pane・tab・workspace を変えない（`pane.split` 等の変更系の RPC を送らない）。
- [ ] AC9: pane の中で、接続先が `WTM_SERVER_URL` と同じサーバだと確かめられないとき（別の origin の `--url`／`WTMCTL_URL`・`WTM_SERVER_URL` が無い）、`--current` と
  対象を省いた `pane split`・`pane current` は何も送らずに断る（終了コード 1、`caller_pane_unknown`。対象を明示すれば通る）。
- [ ] AC10: `--machine <名前>`（`local` 以外）で `--current` を渡すと使い方の誤り（終了コード 2）。対象を省くとそのマシンのフォーカスの pane が対象になる（手元の `WTM_PANE_ID` を使わない）。
- [ ] AC11: `--machine local` では pane の中と同じく呼び出し元の pane を使う。
- [ ] AC12: pane の外（`WTM_PANE_ID` が無い）で対象を省いた `pane split`・`pane current` は、サーバのフォーカスの pane（`snapshot.focus.paneId`）を対象にする。
- [ ] AC13: フォーカスの pane が無い（`snapshot.focus` が null）とき、対象を省いた `pane split`・`pane current` は `not_found`（終了コード 1）で何も変えない。
- [ ] AC14: `self_target` の対象コマンド・効き方が変わらない（既存の歯止めのテストが通る）。`pane split --current`・対象を省いた `pane split` は自分の pane を分けてよい（断らない）。
- [ ] AC15: `wtmctl help`（`USAGE_LINES`）・skill・`docs/wtmctl.md` に新しい書き方があり、skill の手順が `pane split --current`（か省略）と `pane current` を使う。
  skill の一覧と `USAGE_LINES` の食い違いの検査が通る。
- [ ] AC16: docs に、workspace・tab の ID を環境変数で渡さない理由（pane の移動で古くなる）と代わりの `pane current`、herdr との違いが書かれ、`docs/herdr-parity.md` の H39 が更新されている。
- [ ] AC17: ビルド済みの wtmctl を子プロセスとして、pane の中の環境（`WTM_PANE_ID`・`WTM_SERVER_URL`）を与えて打つと、`pane current` がその pane の tab・workspace を返し、
  対象を省いた `pane split` がその pane を分ける（smoke）。

## 未確定事項 / 確認したいこと

- なし（`pane current` の出力は既存の `Pane` の camelCase に足す形〔herdr の `PaneInfo` の snake_case とは違う〕、確かめられないときは code
  `caller_pane_unknown`・終了コード 1 と、ここで決めた。細部は design）。
