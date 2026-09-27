# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/cli/src/cliArgs.ts `parseMachinePrefixed` pane の外で `--machine m pane … --current` を打つと、内側の解釈の「--current requires WTM_PANE_ID (run inside a wtm pane)」が先に出て誤誘導になる / 対応: 修正済（T1・ラウンド1。pane のコマンドで `--current` があれば先に --machine の理由で断る）
- [nit][conv:-] packages/cli/src/cliArgs.ts `parsePaneTarget` `--pane` を 2 回書くと後の値が黙って使われる（既存の `parseFlags` の値フラグ共通の後勝ち） / 対応: 許容（decisions.md D5。全フラグ共通の既存の挙動で、`--pane` だけ変えると一貫しない）
- [nit][conv:-] packages/cli/src/paneTarget.ts:15 新規ファイルが prettier を通っていない / 対応: 修正済（T2・ラウンド1。新規 2 ファイルと HEAD で整形済みの 3 ファイルに prettier --write）
- [nit][conv:-] packages/cli/src/commands/pane.test.ts AC9 のテストの題は current も「明示の ID なら通る」だが split しか確かめていない / 対応: 修正済（T3・ラウンド1。current の明示の ID を 1 行足した）
- [nit][conv:-] packages/cli/src/commands/pane.ts:6 import の並び / 対応: 修正済（T3・ラウンド1）
- [should][conv:-] packages/cli/src/smoke.ts 在 pane の手順で呼び出し元の pane がフォーカスの pane でもあり、フォーカスに落ちる実装でも通る（判別力が無い） / 対応: 修正済（T5・ラウンド1。先に別の workspace を作ってフォーカスを移し、最後に閉じる）
- [nit][conv:-] packages/cli/src/smoke.ts `pane current` の tabId を独立した値と照合していない / 対応: 修正済（T5・ラウンド1。`workspace create` の `tab.id` と比べる）
- [should][conv:-] packages/cli/src/paneCurrent.integration.test.ts 移動の成否（`{ok:false}` も truthy）と移動先の tabId を確かめていない / 対応: 修正済（T4・ラウンド1。`ok: true` と応答の `tab.id` との一致を見る）
- [nit][conv:-] packages/cli/src/paneCurrent.integration.test.ts AC6 で呼び出し元とフォーカスの pane を見分けていない / 対応: 修正済（T4・ラウンド1。移動後に別の workspace を作ってフォーカスを外し、`focused: false` も見る）
- [nit][conv:-] packages/cli/src/paneCurrent.integration.test.ts:20 `quiet` の doc コメントが隣のテストとそろっていない / 対応: 修正済（T4・ラウンド1）
- [should][conv:-] docs/wtmctl.md・SKILL.md・paneTarget.ts の文面 `caller_pane_unknown` の回避策として `--pane "$WTM_PANE_ID"` を無条件に勧め、別のサーバなら無関係な pane を操作させてしまう / 対応: 修正済（T6・ラウンド1。同じサーバだと分かるときだけ明示し、そうでなければ WTMCTL_URL・--url を外す、に。エラー文面・help も）
- [nit][conv:-] packages/cli/skills/wtmctl/SKILL.md:56 「対象は必ず ID かエージェントの名前で指す」が `--current` と字面で矛盾 / 対応: 修正済（T6・ラウンド1）
- [nit][conv:-] docs/wtmctl.md・docs/herdr-parity.md herdr の `pane input --right-click` を「コマンド自体が無い」に数えると wtmctl の `pane input` と取り違える / 対応: 修正済（T6・ラウンド1）
- [nit][conv:-] docs/herdr-parity.md H41 が別 tab への移動を「対象外のまま」と書いたままで H39 の記述と食い違う / 対応: 修正済（T6・ラウンド1。20260924-pane-move-cross-tab で入ったことを追記）
- [nit][conv:-] packages/cli/src/paneTarget.ts・docs/wtmctl.md（cross） `WTM_SERVER_URL` が無いときも「WTM_SERVER_URL につなぐ」を勧めていて従えない / 対応: 修正済（cross・ラウンド1。unset のときは --pane だけを示す）
- [nit][conv:-] packages/cli/src/main.ts:51（cross） help が「--machine とは使えません」と local の例外を落としている / 対応: 修正済（cross・ラウンド1）

## ラウンド 1（2026-09-27）
- [nit][conv:-] packages/cli/src/cliArgs.ts:710 `--machine` と `--current` の断りが 2 か所にあり後段は届かない / 対応: 修正済（防御の分岐であることをコメントで明示。負の確認 M15 の生存と同じ理由）
- [nit][conv:-] packages/cli/skills/wtmctl/SKILL.md:48 「自分の pane には --current を付ける」と例の `pane current`（--current 無し）が食い違う / 対応: 修正済（例に --current を付けた）
（must・should なし。nit のみで終了）
