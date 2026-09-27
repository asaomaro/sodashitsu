# 判断の記録（20260927-caller-pane-default）

## D1: 実行三層（full）と範囲——`pane current` と `pane split` の対象の省略・`--pane`・`--current` だけを herdr に合わせて足し、workspace／tab の ID の環境変数は足さない

- **背景**: backlog 項目（`.aidev/backlog/product-roadmap.md` の「エージェント自動化: 呼び出し元の pane を既定の対象にする——herdr の `--current`・
  `pane split` の対象の省略・`pane current`、`HERDR_WORKSPACE_ID`/`HERDR_TAB_ID` 相当の環境変数（pane の移動で古くなる点の扱いを含む）」。
  出典 20260926-agent-skill-file の decisions D1）。herdr の一次資料（`/workspaces/web-tn-multiplexer/scratchpad/herdr`。以下 herdr）を主エージェントが直読した結果:
  - `--current` を受けるのは pane の 11 コマンドだけ（`docs/versions/0.9.1/website/src/content/docs/cli-reference.mdx:206-218`: `pane current`・`layout`・
    `process-info`・`neighbor`・`edges`・`focus`・`resize`・`zoom`・`input`・`split`・`swap`）。`pane close`・`read`・`send-text`・`run`・`report-metadata`・
    `agent *`・`tab *`・`workspace *` は受けない（同 `:219-260`・`:305`・`:333-337`）。
  - `pane split` は位置引数・`--pane ID`・`--current` のどれでも対象を指せ、**省略すると `HERDR_PANE_ID` があれば呼び出し元、無ければフォーカスの pane**。
    `--current` は `HERDR_PANE_ID` が無ければ誤り（`cli-reference.mdx:226-230`・`src/cli/pane.rs:630-667` の `parse_pane_split_args`、誤りの文面は
    `--current requires HERDR_PANE_ID`）。
  - `pane current [--pane ID|--current]` は、`HERDR_PANE_ID`（`--pane` があればそれ）の pane の情報を返し、どちらも無ければフォーカスの pane
    （`src/cli/pane.rs:100-139`・`src/app/api/panes.rs:144-156`）。無い pane は `pane_not_found`（`src/app/api/panes.rs:2990-3002`）。返す `PaneInfo` は
    `pane_id`・`workspace_id`・`tab_id`・`focused`・`cwd` 等（`src/api/schema/panes.rs:527-557`）。
  - `--machine`（別のマシン）のときは呼び出し元の pane を使わない（`src/cli/target.rs:203-210` の `caller_pane_id` が None。`cli-reference.mdx:84`
    「`--current` cannot refer to the caller's local pane」）。
  - pane の環境には `HERDR_WORKSPACE_ID`・`HERDR_TAB_ID` も入るが、**起動時の値のまま**で、`pane move` の後も古い値が残る
    （`cli-reference.mdx:238`。herdr は別 workspace への移動で pane ID 自体が変わるので、古い ID を別名として残して `--current` を解決し続ける）。
  本製品の現状（直読）:
  - pane の環境は `WTM_PANE_ID`・`WTM_SERVER_URL` 等（`packages/server/src/session/paneEnv.ts:57-78` の `buildPaneEnv`）。workspace・tab の ID は入れない。
  - pane の移動（`pane.move_to_tab`・`pane.move_to_new_tab`）は **pane の ID を変えず** `tabId` だけを変える（`packages/server/src/session/SessionService.ts:926-975`。
    `pane.updated` で同じ pane を配る）。したがって `WTM_PANE_ID` は移動で古くならないが、workspace・tab の ID を環境に入れると移動で古くなる。
  - サーバ全体のフォーカス（`SessionSnapshot.focus`＝`{workspaceId, tabId, paneId} | null`。`packages/protocol/src/model.ts:186-216`）が snapshot にある。
  - wtmctl の `pane split` は `<paneId>` が必須（`packages/cli/src/cliArgs.ts:344-354`）で、`pane current` は無い。skill は `"$WTM_PANE_ID"` を明示し、
    自分の tab は `snapshot` を `jq` で引かせている（`packages/cli/skills/wtmctl/SKILL.md:45-50`・`:74`・`:88`）。
- **決定**:
  - 三層判定は **full**（CLI の引数の形と既定の対象の決め方を変え、同じサーバかの判定・`--machine` との組み合わせ・自分の pane の歯止めとの関係の判断を含む。
    docs・skill・smoke に波及する）。
  - 範囲: (1) `wtmctl pane current [--pane <paneId>|--current]`（今の workspace・tab をサーバに問い合わせて返す）、(2) `wtmctl pane split` の対象を
    `[<paneId>|--pane <paneId>|--current]` にし、省略時は呼び出し元の pane（pane の外ならフォーカスの pane）、(3) `--machine` との組み合わせ、
    (4) skill・`docs/wtmctl.md`・`docs/herdr-parity.md`（H39）・smoke の更新。
  - **`WTM_WORKSPACE_ID`・`WTM_TAB_ID` の環境変数は足さない**。代わりに `pane current` で今の値を得る（D2）。
  - herdr で `--current` を受ける残りの 9 コマンド（`layout`・`process-info`・`neighbor`・`edges`・`focus`・`resize`・`zoom`・`input --right-click`・`swap`）は、
    **コマンド自体が wtmctl に無い**ので本 work の対象外（それぞれのコマンドを足すときに `--current` も足す）。
- **理由・代替案**:
  - 代替案 A「`--current` を wtmctl の全 pane コマンドに足す」: herdr に無い拡張で、しかも `pane close`・`input`・`run`・`attach`・`control` は自分の pane を
    `self_target` で必ず断るので、`--current` を足しても常に失敗するだけになる。herdr に合わせて `pane current`・`pane split` に絞る。
  - 代替案 B「herdr と同じく `WTM_WORKSPACE_ID`・`WTM_TAB_ID` を pane の環境に入れ、古くなる点を文書に書く」: D2。
- **影響**: `pane split` の `<paneId>` が省略可になる（既存の書き方はそのまま通る）。`USAGE_LINES`（help・skill の食い違いの検査が見る）に `pane current` が増える。

## D2: `WTM_WORKSPACE_ID`・`WTM_TAB_ID` を足さない——pane の移動で古くなった値が、利用者の別の workspace を黙って操作させる

- **背景**: backlog 項目は「`HERDR_WORKSPACE_ID`/`HERDR_TAB_ID` 相当の環境変数（pane の移動で古くなる点の扱いを含む）」。D1 の直読のとおり、本製品では
  pane を別の tab・workspace へ移せ（ブラウザの名前ラベルのドラッグ・`pane.move_to_tab`・`pane.move_to_new_tab`）、そのとき pane の ID は変わらず tab・workspace だけが変わる。
  環境変数はプロセスの起動時に決まり、後から書き換えられない。
- **決定**: 環境変数は足さない。呼び出し元の今の workspace・tab は `wtmctl pane current`（`.pane.workspaceId`・`.pane.tabId`）でサーバに問い合わせる。
  skill の「自分の位置」はこれに書き換える。
- **理由・代替案**:
  - 具体的な破綻例: エージェントが w1 の t1 の pane p3 で起動した（`WTM_WORKSPACE_ID=w1`）。利用者が p3 をドラッグで w2 の新しい tab へ移した。エージェントが
    `wtmctl tab create --workspace "$WTM_WORKSPACE_ID"` を打つと、**利用者が今は別の作業に使っている w1** に tab が増える（w1 を閉じていれば `not_found`）。
    `wtmctl pane current` なら w2 が返る。herdr は古くなることを文書に書いて済ませているが、環境変数は `printf` 1 つで読めてしまい、古いかどうかを
    読む側が判断する手段が無い。
  - 代替案「足して、古くなる点を docs・skill に書く」: herdr のスクリプトの移植性は上がるが、上の破綻を防げない。移植のために必要になったら
    backlog の後続項目として足す（deliver で `[ ]` として残す）。
- **影響**: herdr の `HERDR_WORKSPACE_ID`・`HERDR_TAB_ID` を使うスクリプトは、`wtmctl pane current | jq -r .pane.workspaceId` 等に書き換える必要がある（docs の herdr との違いに書く）。

## D3: research 工程は挟まない

- **背景**: requirements 終了時の research の発火条件（protocol「4.5」の 5 条件）の自己評価。
- **決定**: 挟まない。
- **理由・代替案**: 依拠する既存の挙動（pane の環境・pane の移動で ID が変わらないこと・`snapshot.focus`・`self_target` の同じサーバの判定・`--machine` の caller の除去）と
  herdr の一次資料は D1 で主エージェントが直読済み。変更は CLI（`packages/cli`）と docs だけで横断的でなく、利用者が操作する画面部品も作らない。技術的な未確定も無い。
- **影響**: design の「依拠する既存の事実」は D1 の直読を出所にする。

## D4: architecture 工程は挟まない

- **背景**: design 終了時の architecture の発火条件（protocol「4.5」の 4 条件）の自己評価。
- **決定**: 挟まない。
- **理由・代替案**: モジュール境界は動かさない（`packages/cli` の中で新しい `paneTarget.ts` を足し、既存の `selfGuard.ts` の関数を export するだけ。依存の向きは既存どおり）。
  データモデルは `PaneTarget` の 3 種類の和だけで、tasks に直接分解できる粒度まで design に書いた。
- **影響**: なし。

## D5: 同じ `--pane` の重複は後勝ちのまま（taskcheck T1 の指摘）

- **背景**: `pane split --pane p2 --pane p4` は p4 になる。design は「対象の指定が 2 つ以上なら誤り」としたが、これは種類の違う指定（位置引数・`--pane`・`--current`）の組み合わせの話。
- **決定**: 同じ値フラグの重複は、既存の `parseFlags`（`packages/cli/src/cliArgs.ts` の `outValues.set`）の全フラグ共通の後勝ちのままにする。
- **理由・代替案**: `--pane` だけ重複を誤りにすると、`--url`・`--label` 等と挙動が割れる。取り違えの主因（位置引数と `--current` の併用等）は誤りにしてある。
- **影響**: なし（docs には書かない。既存の全フラグと同じ）。
