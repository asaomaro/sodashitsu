# テスト結果: ask-form 1.3.0（質問ごとの自由記述）を取り込む

## 実行したもの
- `pnpm typecheck` — エラー 0
- `pnpm test`（`pnpm build` の後。リポジトリ直下。Node 24） — 389 files / 7018 tests passed / 0 failed / 0 skipped
- ask 関連の E2E 5 本（`cd packages/e2e && pnpm exec playwright test src/specs/ask-form.spec.ts src/specs/ask-form-mobile.spec.ts src/specs/ask-form-index.spec.ts src/specs/ask-form-extras.spec.ts src/specs/ask-form-comments.spec.ts`） — 73 passed / 0 failed / 0 skipped（既存 4 本は修正後に 2 回、新しい spec は 2 回続けて同じ結果。最後に 5 本まとめて 1 回）
- `node scripts/sync-ask-form.mjs --check` — 一致（`--check --from /workspaces/public_docs` も T1 で一致）
- `aidev coverage` — AC 15 件すべて design・tasks に対応（gaps=0）

## 受け入れ基準ごとの判定
- AC1: pass — `SOURCE.json` が `12a13b2`・1.3.0、`--check --from` が一致。差分の安全の確認は decisions.md D5
- AC2: pass — E2E「各質問の下に…ボタンがあり…」（開閉・文言・text に無い）・モバイルの件（タップで開いて書く）
- AC3: pass — E2E「comments: false…」「質問が 1 つだけ…」、単体（normalizeAskSpec・askCommentable）
- AC4: pass — E2E「端から端まで」「表示条件…」「何も書かなければ…」（sodactl の stdout の JSON と、ブラウザが送った ask.answer の数）、枠・サーバ・受け口・中継越しのテスト
- AC5: pass — `ask.fixtures.test.ts` の normalize.json の全例（自由記述の 2 例を含む）
- AC6: pass — 同 collect.json の全例（自由記述の 1 例を含む。実装前に落ちることを確認済み）
- AC7: pass — `checkAskAnswer`・`AskService` の単体、`/ws` 越しの統合（10001 文字・付けられない質問・合計の超過は invalid_params で質問は残る。空白だけは落ちる）、`AskAnswerParams` の 10000／10001
- AC8: pass — E2E「HTML を書いても動かず…」（`<script>`・`<img onerror>`。閉じて開き直しても要素にならず、結果に文字のまま入る）、ログに中身が出ない統合テスト
- AC9: pass — comments を送らない回答の既存テスト全部、`sodactl ask` が結果を作り直さないことの確認（decisions.md D7・ask.test.ts）
- AC10: pass — docs/sodactl.md・SKILL.md・verification.md・machines.md・third_party/ask-form/README.md を更新（独立点検で実物と突き合わせ済み。`skill.test.ts` が通る）
- AC-I1: pass — E2E（aria-expanded・読み上げ用の名前・クリック／Enter／Space）
- AC-I2: pass — E2E（欄の中の Enter は改行で ask.answer 0 件／Ctrl+Enter で 1 件／Esc で ask.cancel 1 件）
- AC-I3: pass — E2E（Tab → Enter で開く → 書く → Ctrl+Enter）
- AC-I4: pass — E2E（開いた後・開き直し・キーで閉じた後のフォーカス／目次・Alt+PageDown・未回答への移動は欄へ行かない）
- AC-I5: pass — E2E（欄の上のキー・ホイールが pane へ漏れない／高さ: 上限未満では増えて戻る・絞り込みと showIf では変わらない・上限では収まり欄が見える）、枠の単体

## 失敗の証跡
このラウンドでは、この work の変更が原因の失敗は発生していない。次の 1 件は **この work と無関係の、実行した場所に依る失敗**（`main` の 96efb87 をこの作業フォルダで実行しても同じく失敗する）:

`aidev smoke` を作業フォルダ `/workspaces/sodashitsu-wt/ask-form-comments` で実行（1 本目 `pnpm -s build && pnpm -s smoke` の Web の段で失敗。HEAD でも、96efb87 〔この work の前〕でも同じ）:

```
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke: FAIL locator.click: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.xterm-helper-textarea')[22m
[2m    - locator resolved to <textarea tabindex="0" autocorrect="off" spellcheck="false" autocapitalize="off" aria-multiline="false" aria-label="Terminal input" class="xterm-helper-textarea"></textarea>[22m
...
}
smoke: fail (exit 1, 10 本)
```

同じコミット（96efb87 と、この work の HEAD の両方）を別のフォルダ（作業フォルダの外に作った git worktree）で実行すると pass した（下）。失敗は、pane の枠の端（`.pane-frame-edge`）が端末の入力欄のクリックを遮る、というもの（作業フォルダの名前〔パス〕が pane の枠に出ることと関係があるように見えるが、原因は調べていない。ask とは無関係）。

## 起動確認（smoke）
作業フォルダでは上のとおり、この work と無関係に失敗する。そこで、この work の HEAD（6089d80）を作業フォルダの外の git worktree にチェックアウトして `aidev smoke` を実行した（出力の要点。全文は長いので `smoke:`・`smoke(web):`・コマンドの行だけ）:

```
smoke: 20261004-ask-form-comments
$ pnpm -s build && pnpm -s smoke
smoke: starting server on 127.0.0.1:44223 (state dir /tmp/soda-smoke-7fGDsT)
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("my-notePC: smoke"。H14/AC4）
smoke(web): typed into pane p2
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS
$ pnpm --filter @sodashitsu/cli run smoke
smoke(cli): temp server state dir /tmp/sodactl-smoke-state-crjnqC, sandboxed HOME /tmp/sodactl-smoke-home-EbTGN1
smoke(cli): server listening on http://127.0.0.1:37195
smoke(cli): sodactl workspace create ok (pane p2)
smoke(cli): sodactl pane run ok (no --token needed; cached session reused)
smoke(cli): sodactl pane read ok (echo round trip confirmed)
smoke(cli): sodactl snapshot ok
smoke(cli): sodactl pane current / pane split (caller pane, not the focused one) ok (tab t2)
smoke(cli): sodactl ask (unavailable without a browser / bad spec → 2 / outside a pane) ok
smoke(cli): sodactl ask without a login ok (pane socket → unavailable / derived from SODA_AGENT_REPORT_SOCKET / bad spec → 2; without the socket → unauthenticated)
smoke(cli): sodactl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): sodactl agent list ok (no agents)
smoke(cli): sodactl agent rename ok (named, resolved by name, cleared)
smoke(cli): sodactl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): sodactl agent send-keys ok (the RPC accepted the keys)
smoke(cli): sodactl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): sodactl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): sodactl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): sodactl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
$ SODACTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/sodactl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && SODA_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { SODA_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
$ node packages/server/dist/handoffSmoke.js
$ node packages/server/dist/stopSmoke.js
$ node packages/server/dist/machineSmoke.js
$ d=$(mktemp -d) && mkdir -p "$d/home/.wtmctl" && env -i PATH="$PATH" HOME="$d/home" XDG_STATE_HOME="$d/state" sh scripts/migrate-from-wtm.sh >"$d/out" && grep -q '^済み: CLI のキャッシュを移す' "$d/out" && test -d "$d/home/.sodactl" && env -i PATH="$PATH" HOME="$d/home" XDG_STATE_HOME="$d/state" sh scripts/migrate-from-wtm.sh | grep -q '移すものがありません'; rc=$?; rm -rf "$d"; exit $rc
$ node scripts/tui-pty-verify.mjs
tui-pty-verify: OK
smoke: pass (exit 0, 10 本)
```

この work は新しい入口（サブコマンド・オプション）を足していないので、`smokeCommands` は足さない（定義の項目と結果の項目が増えただけ）。

## 未検証の穴（skip / 環境不足）
- 実機のスマートフォン（iOS Safari・Android Chrome。画面のキーボードで欄が隠れないか）・Firefox・Safari・別のマシンのブラウザ（ループバックでない接続）・保存した SSH のマシンの実機・ask-form 本体（`ask.py` のウィンドウ）との同じ定義での突き合わせは、実物では確かめていない（`docs/verification.md` に手順を足した）。モバイルは Playwright の iPhone 13 エミュレーションのみ。
- 中継先（保存したマシン）の `soda` が古い場合は、付けない指定が効かず書いた文が落ちる（`docs/machines.md` に書いた。検証していない。decisions.md D3）。
- `aidev smoke` は作業フォルダでは失敗する（この work と無関係。上）。別のフォルダでは pass。
- `pnpm lint` の 22 errors と E2E 全体の既知の 18 件は `main` でも同じ（今回は実行していない）。
