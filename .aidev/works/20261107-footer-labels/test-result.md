# 共通フッターの表示ラベル

承認policy / 承認mode / 権限mode の表示を「承認モード」に統一。provider固有の値・出典tooltipは保持。利用制限と解除日時の account.label prefix を削除（全kind共通、5h/週/その他）。agent名欄・モデル・色・グラフ・並び・取得処理は変更なし。

Web PaneStatusline.vue と TUI PaneStatuslines.ts は同じ statuslineSegments を使用。既存Web DOM・TUI Gridテストで承認ラベル/出典/選択の挙動を確認。文字列置換のみなのでブラウザ実機起動は不要。

Node24。最終ソース固定後 protocol27 / Web DOM5 / TUI7件成功、protocol noEmit型検査 exit0。テストは専用一時configで対象を限定、protocolソースaliasでmainのdistを変更せず検証。初回rootconfigは未リンクWeb依存の読込でsetup失敗し、専用configへ切替。8kindの制限6fieldをparameterize。

回帰負例: statusline.tsだけHEAD版へ戻すとprotocol10/Web1/TUI1件失敗。保存した修正版へ復元しcmp一致、3セットと型検査を再実行成功。以下は負例と最終成功の生出力。

## negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-footer-label-compact

 ❯ packages/protocol/src/statusline.test.ts (27 tests | 10 failed) 28ms
   × independently selects cross-session weekly cost and exact rate-limit reset dates 6ms
   × formats observed effort and distinct approval/permission values with source and scope, never sandbox 3ms
   × omits redundant provider prefixes from all claude limit fields 1ms
   × omits redundant provider prefixes from all codex limit fields 1ms
   × omits redundant provider prefixes from all muse limit fields 1ms
   × omits redundant provider prefixes from all agy limit fields 1ms
   × omits redundant provider prefixes from all copilot limit fields 1ms
   × omits redundant provider prefixes from all bob limit fields 0ms
   × omits redundant provider prefixes from all grok limit fields 2ms
   × omits redundant provider prefixes from all cursor limit fields 1ms

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/protocol/src/statusline.test.ts > independently selects cross-session weekly cost and exact rate-limit reset dates
AssertionError: expected 'Claude 5h解除 2026/10/16 03:04' to be '5h解除 2026/10/16 03:04' // Object.is equality

Expected: "5h解除 2026/10/16 03:04"
Received: "Claude 5h解除 2026/10/16 03:04"

 ❯ packages/protocol/src/statusline.test.ts:172:65
    170|   expect(result.find((s) => s.field === "weeklyCost")?.text).toBe("今週 …
    171|   expect(result.find((s) => s.field === "cost")?.text).toBe("$1.000");
    172|   expect(result.find((s) => s.field === "fiveHourReset")?.text).toBe(
       |                                                                 ^
    173|     "5h解除 2026/10/16 03:04",
    174|   );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/10]⎯

 FAIL  packages/protocol/src/statusline.test.ts > formats observed effort and distinct approval/permission values with source and scope, never sandbox
AssertionError: expected [ 'effort high', …(3) ] to deeply equal [ 'effort high', …(3) ]

- Expected
+ Received

  [
    "effort high",
-   "承認モード on-request",
-   "承認モード promptUnmatched",
-   "承認モード plan",
+   "承認policy on-request",
+   "承認mode promptUnmatched",
+   "権限mode plan",
  ]

 ❯ packages/protocol/src/statusline.test.ts:247:84
    245|  const settings=loadStatuslineSettings({fields:{effort:true,approval:t…
    246|  const result=statuslineSegments(pane,usage,[],settings);
    247|  expect(result.filter(s=>s.field==="effort"||s.field==="approval").map…
       |                                                                                    ^
    248|  expect(result[0]!.title).toContain("ターンの記録 / rollout / 1970-01-01T00:…
    249|  expect(result.some(s=>s.text.includes("workspace-write")||s.text.incl…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/10]⎯

 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all claude limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all codex limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all muse limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all agy limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all copilot limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all bob limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all grok limit fields
 FAIL  packages/protocol/src/statusline.test.ts > omits redundant provider prefixes from all cursor limit fields
AssertionError: expected [ 'Provider 5h 25%', …(5) ] to deeply equal [ '5h 25%', '週 25%', '日 25%', …(3) ]

- Expected
+ Received

  [
-   "5h 25%",
-   "週 25%",
-   "日 25%",
-   "5h解除 2026/10/16 03:04",
-   "日解除 2026/10/16 03:04",
-   "週解除 2026/10/16 03:04",
+   "Provider 5h 25%",
+   "Provider 週 25%",
+   "Provider 日 25%",
+   "Provider 5h解除 2026/10/16 03:04",
+   "Provider 日解除 2026/10/16 03:04",
+   "Provider 週解除 2026/10/16 03:04",
  ]

 ❯ packages/protocol/src/statusline.test.ts:273:156


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/10]⎯


 Test Files  1 failed (1)
      Tests  10 failed | 17 passed (27)
   Start at  22:32:40
   Duration  240ms (transform 59%, tests 24%, import 14%, worker 2%)

```

## web-negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-footer-label-compact

 ❯ packages/web/src/components/StatuslineExecutionSettings.test.ts (2 tests | 1 failed) 64ms
   × shows observed execution settings and their source in real footer DOM without launch preferences 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/web/src/components/StatuslineExecutionSettings.test.ts > shows observed execution settings and their source in real footer DOM without launch preferences
AssertionError: expected '⋮ effort high · 承認policy on-request ·…' to contain '承認モード on-request'

Expected: "承認モード on-request"
Received: "⋮ effort high · 承認policy on-request · Codex · codex · idle"

 ❯ packages/web/src/components/StatuslineExecutionSettings.test.ts:34:62
     32|  const w=mount(PaneStatusline,{props:{paneId:"p"},global:{plugins:[pin…
     33|  try{
     34|   expect(w.text()).toContain("effort high");expect(w.text()).toContain…
       |                                                              ^
     35|   expect(w.findAll("span[title]").some(x=>x.attributes("title")?.inclu…
     36|   settings.statuslineSettings=loadStatuslineSettings({fields:{effort:f…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 4 passed (5)
   Start at  22:33:34
   Duration  1.66s (transform 67%, import 17%, environment 11%, tests 3%)

  Transform  transforming modules took 2.06s · 67% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

## tui-negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-footer-label-compact

 ❯ packages/tui/src/app/PaneStatuslines.test.ts (7 tests | 1 failed) 22ms
   × renders observed effort/approval in terminal cells and respects independent hidden settings 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/tui/src/app/PaneStatuslines.test.ts > renders observed effort/approval in terminal cells and respects independent hidden settings
AssertionError: expected ' ⋮ effort high · 承認policy on-request …' to contain '承認モード on-request'

Expected: "承認モード on-request"
Received: " ⋮ effort high · 承認policy on-request · Codex · codex · i↕                                                             "

 ❯ packages/tui/src/app/PaneStatuslines.test.ts:156:82


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
   Start at  22:33:36
   Duration  1.49s (transform 81%, import 18%, tests 2%)

```

## restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-footer-label-compact


 Test Files  1 passed (1)
      Tests  27 passed (27)
   Start at  22:33:38
   Duration  220ms (transform 62%, tests 18%, import 17%, worker 3%)

```

## web-restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-footer-label-compact


 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  22:33:38
   Duration  1.92s (transform 68%, import 18%, environment 11%, tests 3%)

  Transform  transforming modules took 2.44s · 68% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

## tui-restored

```text

 RUN  v5.0.1 /workspaces/sodashitsu-footer-label-compact


 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  22:33:40
   Duration  1.63s (transform 81%, import 17%, tests 1%)

```
