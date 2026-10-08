# レビュー: 表示の面の配置と状態

実装とは別のエージェント（sodactl で別の pane に起動した Claude Code〔Sonnet〕）が、読むだけの独立レビューを掛けた。PR ごとに記録する。

## PR-A: 状態の記憶と既定・帯をたたむ・帯の上下・帯の行のボタン（T1〜T12）

タスクごとの独立点検（★ T1・T2・T3・T5・T6・T7・T8・T9）と、PR-A の全体の点検を、1 回のレビューにまとめた。実装は、Agent ツールのサブエージェント（Sonnet）が T1〜T12 を行い、レビューの指摘の修正は、sodactl で起動した別のエージェント（Sonnet）が引き継いだ。

### 1 回目（origin/main...4bb981b）

must 0・should 5・nit 7。判断は「直してから」。レビューの側で、`display-layout-state`（14 件）・既存の display の spec 7 本（64 件）・web の単体テスト（2028 件）を流して通ることを確かめ、自作の確かめ（知らせの重なり・細い pane・本物の押しっぱなし・iframe を DOM の中で動かす実測）を行った。

| 重さ | 指摘 | 対応 |
|---|---|---|
| should | 知らせが出ている最中に帯を「下に置く」と、測り直されず、帯の［⋮］［×］に重なる | 直した（6f7b021。割り付けの置き方の署名が変わると測り直す。E2E (8b)） |
| should | 細い pane（幅 179px・`script-html` の帯・たたんだパネル 3 つ）で、帯の行の固定の部品が押せない | 直した（6f7b021。帯の幅が下限〔スクリプトの帯 320px・ほか 140px〕を下回ったら自動でたたむ。記憶には書かない。E2E (13)） |
| should | 割り付けの変化でフォーカスのあった部品が消えるときの備え（D21 の 2）にテストが無い | 足した（4f9689c。(14a)(14b)） |
| should | キーの押しっぱなし（`ev.repeat`）が E2E で動いていない | 足した（4f9689c。(7)(c2)。本物の `keyboard.down`） |
| should | 枠（iframe）を動かさない守りが、テストで確かめきれていない | 強めた（4f9689c。(6) を `data-display-loads` の比較と `MutationObserver` に。(6b) を追加） |
| nit | `installKeepFocusRelease` に `isTrusted` の確認が無い／CSS の重複／端末版の設定が PR-A で効かない値を出す／複数のマシンで記憶が消える限界／E2E (12) の箱の確かめ | 直した（3cb8616・6f7b021・3efbc68・4f9689c） |

問題なしと確かめた点: 変えてはいけないファイル（`DisplayFrame.vue`・`DisplayScriptMark.vue`・`focusDrop.ts`・`focusOrigin.ts`・`focusGuard.ts`・`engageEntry.ts`・`frameMessages.ts`・`frameRegistry.ts`・`display-view/*`・`MobileShell.vue`）に差分が無い／本物の押下・押しっぱなしで、`activeElement` が `body` を通らず、`focus_steal` も遮断器も 0／プログラムが利用者の記憶に反して状態を変えられない／記憶はその画面だけ。

**実測で確かめられた設計の前提（U1）**: Chromium では、iframe を DOM の中で動かすと、同じ要素のまま `load` が 1 増える（並べ替えでも、親をまたぐ移動でも）。枠を動かさない設計は正しかった（decisions D23）。

### 2 回目（4bb981b..0f88b3b の差分だけ）

指摘はすべて直っている。must・should の新しい指摘は無し。判断は「マージしてよい」。レビューの側で、`display-layout-state`（21 件）・単体テスト（744 件）と、前回の再現・一時の spec 5 本を流した。

- 細い pane での自動のたたみ: 操作中のスクリプトの帯が、pane を狭めて自動でたたまれても、フォーカスは端末へ移り、`body` を通らず、`focus_steal` も遮断器も 0。幅が境目で揺れても（250ms ごとに 16 回）、`load` は常に 1。
- 強めた E2E (6)(6b) は、レビューの側の壊し方（割り付けが変わるたびに帯の並びを逆にする）で、3 本とも落ちた。
- nit: 下限が固定の値であることを docs に 1 行（監督のセッションが足した）／(6b) の落ちる場所が分かりにくい（直さない）。

### 確かめたこと

- `pnpm build`・`pnpm typecheck`: 通る
- `pnpm test`（0f88b3b）: 9130 件通過。失敗 4 件は、既知の `tui.integration.test.ts` の 3 件（作業フォルダの名前が長いと落ちる。別の作業 `20261008-main-e2e-failures` で直す）と、全体を流したときだけ揺れる `notifications.test.ts` の 1 件（単独では通る）
- E2E（0f88b3b。`--workers=1`）: display の 190 件通過・1 スキップ。`display-script-noreturn`（26）・`display-script-drop`（24）・`display-script-noreturn-mobile`（2）は単独ですべて通過
- `aidev smoke`（0f88b3b。監督のセッション）: pass（10 本）

### 確かめていないこと

- Firefox・Safari・スマホの実機。実測は Chromium だけ
- 文字を大きくした環境での、帯の下限（固定の値）
