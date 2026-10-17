# 実 TUI の Antigravity 表示検証

記録時の整形: 生ログの行末の空白だけを除去した。

2026-10-17。ビルド済み server/TUI を node-pty の実 PTY（180×42）で起動し、@xterm/headless で画面の最終セルを読み取った。ソースのテスト用 Grid を直接呼ぶ検証ではない。

## 隔離と手順

- `/tmp/antigravity-tui-live.mjs` に検証スクリプトを作成。
- `/tmp/soda-agy-tui-*` に専用 state/session/HOME/bin を作り、空き localhost ポートを確保。
- `soda --state-dir <isolated> --session agytest` を node-pty で起動。
- 偽 agy だけを専用 PATH の先頭に登録。PTY の shell に `agy` と入力。exec -a agy で実プロセス検出を通し、同プロセス PID 付きの session/usage を本物の report socket に送る。
- E2E と同じ作成値（Gemini E2E、入力80,000/出力1,000/cacheRead4,000、context84,000/200,000=42%、quota25%、リセット2時間後）を使用。
- 端末内の statusline を確認し、マウス SGR を入力してサイドバーの「状況」を選択。状況画面に切り替わった端末セルを確認。
- finally で TUI を終了し、専用 serve.json の PID のサーバに SIGTERM。既存ユーザーの設定/認証・実 agy/API は使用していない。

## 確認できた表示

実画面の関係するセル（作った数値のみ）:

```text
Antigravity CLI · agy · idle · Gemini E2E · Context ▰▰▰▰▱▱▱▱▱▱ 42% · Antigravity CLI gemini-weekly ▰▰▰▱▱▱▱▱▱▱ 25% · 入力トークン 80000 · 出力トークン
1000 · Context 84000/200000

利用状況 · s:並び順 name · a:アカウント · h:セッション履歴 · ↑↓ / Enter:ペインへ · Esc:基本
─ アカウントの利用枠 ─
Antigravity CLI
  gemini-weekly: [###-------] 25.0% · リセット <2時間後の日時>
─ エージェント ─
○ Antigravity CLI
agy · Gemini E2E · 文脈内 — · —
文脈 [####------] 42.0%
```

コスト未取得は「—」であり、架空の USD/ゼロを表示しない。モデル・状態・文脈率・quota・解除日時と標準 statusline の内訳は実 PTY 上で正常。

## 発見した表示漏れ

最初の実行の「85,000トークン」期待は失敗した。Web が内訳から合計85kを作る同じ sample で TUI ダッシュボードは tokens.total だけを使うため「文脈内 —」だった。担当へ報告済み。修正/再検証は下に追記する。

生の画面（隔離サーバの認証 token は伏せた）: `/tmp/antigravity-tui-statusline.txt`、`/tmp/antigravity-tui-dashboard.txt`。

Windows/macOS、課金を伴う本物の model 応答・本物の quota 受信は未検証。

## 修正後の再検証

`UsageView.ts` に Web と同じ既知の token 内訳の合計 fallback を追加し、usageLines・dashboard 行・token 並べ替えへ適用。報告 total がある場合はそちらを優先。項目が一切無ければ undefined（—）、明示0は0を保持。basis はそのままで、文脈内を累計と言い換えない。

- 新規/強化テスト: Antigravity dashboard の1,234表示、agy/Bob の85,000表示・合計優先・未知と0・内訳合計による並べ替え。修正前3件失敗、修正後10件成功。
- TUI を再ビルドし、同じ実PTY手順を再実行。Antigravity dashboard の `agy · Gemini E2E · 文脈内 85,000 · —` を確認して成功。標準 statusline と42%/quota25%表示も引き続き成功。
- `/tmp/bob-tui-live.mjs` で Bob の実PTYも追加検証。専用 HOME の SQLite tasks テーブルに作った1行（contextTokens19,700、window270,000、cost0.118 Bobcoin、model premium-ide）だけを置き、偽 bob の実プロセス検出→session報告→本物の BobUsageAdapter 読取→TUI 描画を通した。statusline の7%・0.118 Bobcoin、dashboard の `bob · premium-ide · 文脈内 19,700 · 0.1180 Bobcoin` と7.3%を確認して成功。実 bob・利用者DBにはアクセスしていない。
- Bob画面は `/tmp/bob-tui-statusline.txt` と `/tmp/bob-tui-dashboard.txt`（隔離tokenは伏せ済み）。両PTYとも finally で専用サーバを停止。

### 修正前の生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity

 ❯ |@sodashitsu/tui| src/modes/UsageView.test.ts (10 tests | 3 failed) 75ms
   × renders Antigravity current usage and quota in the TUI without invented currency 14ms
   × shows known token subtotals for agy and sorts by them 3ms
   × shows known token subtotals for bob and sorts by them 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/UsageView.test.ts > renders Antigravity current usage and quota in the TUI without invented currency
AssertionError: expected ' 利用状況 · s:並び順 name · a:アカウント · h:セッショ…' to contain '文脈内 1,234'

- Expected
+ Received

- 文脈内 1,234
+  利用状況 · s:並び順 name · a:アカウント · h:セッション履歴 · ↑↓ / Enter:ペインへ · Esc:基本
+  ─ アカウントの利用枠 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+  Antigravity CLI · 2026/10/17 15:20:17
+    gemini-weekly: [###-------] 30.0% · リセット 2026/10/17 16:20:17
+  ─ エージェント ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
+  ○ Antigravity CLI · w1 / t1
+  agy · Gemini 3.5 Flash · 文脈内 — · —
+  文脈 [###-------] 25.0% · 更新 2026/10/17 15:20:17
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+
+  1 エージェント · 1 / 1

 ❯ src/modes/UsageView.test.ts:214:16
    212|   expect(text).toContain("Antigravity CLI"); expect(text).toContain("g…
    213|   expect(text).toContain("30.0%"); expect(text).toContain("Gemini 3.5 …
    214|   expect(text).toContain("文脈内 1,234");
       |                ^
    215|   expect(text).not.toContain("$0");
    216| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/tui| src/modes/UsageView.test.ts > shows known token subtotals for agy and sorts by them
AssertionError: expected 'agy / test-model · 文脈内\nトークン 合計 — / 入…' to contain 'トークン 合計 85,000'

- Expected
+ Received

- トークン 合計 85,000
+ agy / test-model · 文脈内
+ トークン 合計 — / 入力 80,000 / 出力 1,000
+ キャッシュ 読み 4,000 / 書き — · 推論 —
+ コスト —
+ コンテキスト [??????????] — · — / —
+ 更新 1970/1/1 9:00:00 · statusline

 ❯ src/modes/UsageView.test.ts:226:36
    224|   model.panes.set("p2", { ...pane, id: "p2", label: "zeta", agent: { .…
    225|   const u = { paneId: "p1", kind, model: "test-model", tokens: { basis…
    226|   expect(usageLines(u).join("\n")).toContain("トークン 合計 85,000");
       |                                    ^
    227|   expect(usageLines({ ...u, tokens: { basis: "context", input: 0 } }).…
    228|   expect(usageLines({ ...u, tokens: { basis: "context" } }).join("\n")…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/tui| src/modes/UsageView.test.ts > shows known token subtotals for bob and sorts by them
AssertionError: expected 'bob / test-model · 文脈内\nトークン 合計 — / 入…' to contain 'トークン 合計 85,000'

- Expected
+ Received

- トークン 合計 85,000
+ bob / test-model · 文脈内
+ トークン 合計 — / 入力 80,000 / 出力 1,000
+ キャッシュ 読み 4,000 / 書き — · 推論 —
+ コスト —
+ コンテキスト [??????????] — · — / —
+ 更新 1970/1/1 9:00:00 · statusline

 ❯ src/modes/UsageView.test.ts:226:36
    224|   model.panes.set("p2", { ...pane, id: "p2", label: "zeta", agent: { .…
    225|   const u = { paneId: "p1", kind, model: "test-model", tokens: { basis…
    226|   expect(usageLines(u).join("\n")).toContain("トークン 合計 85,000");
       |                                    ^
    227|   expect(usageLines({ ...u, tokens: { basis: "context", input: 0 } }).…
    228|   expect(usageLines({ ...u, tokens: { basis: "context" } }).join("\n")…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 7 passed (10)
   Start at  15:20:15
   Duration  2.02s (transform 82%, import 13%, tests 4%)


```

### 修正後の生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-antigravity


 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  15:20:27
   Duration  1.65s (transform 80%, import 16%, tests 4%)


```

### 実PTY成功出力

```text
{"result":"passed","dir":"/tmp/soda-agy-tui-PJ1Pxl","statusline":"/tmp/antigravity-tui-statusline.txt","dashboard":"/tmp/antigravity-tui-dashboard.txt","checks":["model Gemini E2E","context 42%","quota 25%","tokens 85,000","no paid API"]}
{"result":"passed","dir":"/tmp/soda-agy-tui-ujdfRV","statusline":"/tmp/bob-tui-statusline.txt","dashboard":"/tmp/bob-tui-dashboard.txt","checks":["model premium-ide","context 7.3%","0.1180 Bobcoin","tokens 19,700","no paid API"]}

```
