# 検証

関連82件通過、追加設定/同期/skill対象テスト通過。全体型チェックとビルド通過。実ブラウザで共有設定受信の反映漏れを捕捉し、prefsApplyと設定初期化を修正。実行中の全体テストで前の通知testコマンドのskill案内不足1件を捕捉し、案内追記とskillテストの再実行で修正確認。

## 負の対照

いずれも該当条件だけ修正前へ戻して失敗を確認し、最終ファイルとバイト一致で復元してからビルド。

```text
FAIL  |@sodashitsu/web| src/components/DisplayParts.test.ts > PaneBands（edge あり） > その側の帯だけ・帯の行にトレイ・行ごとの［⋮］［×］は keepfocus・アプリの部分は data-display-chrome
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/components/DisplayParts.test.ts:314:71
    312|     ]);
    313|     expect(top.find("[data-display-tray]").exists()).toBe(true); // トレ…
    314|     expect(top.find("[data-pane-band] [data-display-tray]").exists()).…
       |                                                                       ^
    315|     expect(top.find("[data-display-tray-row] [data-display-tray]").exi…
    316|     for (const sel of [

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.dockedViews.test.ts > renders band content on the first row and hides its name through shared settings
AssertionError: expected '                         │↕ Statuslin…' to contain 'FIRSTROW'

Expected: "FIRSTROW"
Received: "                         │↕ Statusline                                                                       [⋮] [-] [×]"

 ❯ src/app/TuiApp.dockedViews.test.ts:527:52
    525|     return (await h.screen()).split("\n")[r.y]!;
    526|   };
    527|   await vi.waitFor(async () => expect(await row()).toContain("FIRSTROW…
       |                                                    ^
    528|   expect(await row()).toContain("Statusline");
    529|   h.ws.event("prefs.changed", { prefs: { viewTitleVisible: false }, re…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

```text
FAIL  |@sodashitsu/tui| src/app/DockedViews.test.ts > keeps empty band and panel content inside one-cell frames
AssertionError: expected 8 to be less than or equal to 6
 ❯ src/app/DockedViews.test.ts:94:27
     92|           c = content(r, view("v", placement));
     93|         expect(c.x).toBeGreaterThanOrEqual(r.x);
     94|         expect(c.x + c.w).toBeLessThanOrEqual(r.x + r.w);
       |                           ^
     95|         expect(c.y).toBeGreaterThanOrEqual(r.y);
     96|         expect(c.y + c.h).toBeLessThanOrEqual(r.y + r.h);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## 最終確認

全体:10622件通過、1件失敗は通知testコマンドのskill案内不足。案内追記後、skillを含む設定/同期の対象138件が通過。修正後Web E2E6件通過（実ブラウザで専用行と共有設定を観測）。スクリーンショット /tmp/band-tray-separated.png を目視確認。全体型チェック・ビルド・git diff --check通過。

handoffで8実PTYを継続し反映。Web再読み込み/TUI切り離し再起動が必要。
