# 検証結果

- TUI 全体: 38ファイル、590件成功（/tmp/parity-tui-final2.log）。typecheck・build成功。
- Web 全体: 3509件中、旧UI期待に依存する18件が失敗。該当5ファイルを更新し、324件すべて成功（/tmp/parity-web-units-final.log）。その他178ファイルは全体実行で成功。Web build成功。
- 実ブラウザ: ui-style-layout・pane-actionsの26件を実行。22件成功、4件は旧セレクター等を更新し、対象12件を再実行して全件成功。通知ベル・分割・最大化・復元・閉じる・情報、キーボードの新規／メニュー／タブ移動を確認。グループの作成・出入りをキーボードで確認。
- E2E typecheck、変更したTUI製品コードのESLint、git diff --check成功。
- 最終状態でUsageModelとTuiApp.controlsの8件成功。
- Windowsの実機端末描画は未確認。TUIは実際のTuiAppを起動し、端末描画とマウス／キー入力をテスト用端末で検証。

- 最終実ブラウザ追加検証: グラフ専用切り替えとマウスによるグループ作成・移動の2件成功（/tmp/parity-entrances-final.log）。

## 回帰テストの陰性対照

各修正だけを一時的に外し失敗を確認。復元後にcmpで一致を確認した。生の出力を以下に記録する。

### ペイン更新でアカウント初期値が消える競合

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/tui

 ❯ src/model/UsageModel.test.ts (4 tests | 1 failed | 3 skipped) 1064ms
   × ペインだけの先着差分でもsnapshotのアカウントを取り込む 1062ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/model/UsageModel.test.ts > ペインだけの先着差分でもsnapshotのアカウントを取り込む
AssertionError: expected [] to deeply equal [ { kind: 'codex', …(5) } ]

- Expected
+ Received

- [
-   {
-     "accountKey": "a",
-     "asOf": 1,
-     "kind": "codex",
-     "label": "account",
-     "source": "rollout",
-     "windows": [],
-   },
- ]
+ []

 ❯ src/model/UsageModel.test.ts:75:195


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  16:13:06
   Duration  2.04s (tests 55%, transform 38%, import 7%)

undefined
/workspaces/sodashitsu/packages/tui:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/model/UsageModel.test.ts -t ペインだけの先着
```

### より新しい初期値を古いイベントが上書きする競合

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/tui

 ❯ src/model/UsageModel.test.ts (5 tests | 1 failed | 4 skipped) 1073ms
   × 後着snapshotの時刻がさらに新しいときはsnapshotを採用する 1071ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/model/UsageModel.test.ts > 後着snapshotの時刻がさらに新しいときはsnapshotを採用する
AssertionError: expected 100 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 100

 ❯ src/model/UsageModel.test.ts:100:306


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  16:20:41
   Duration  2.52s (tests 45%, transform 43%, import 11%)

undefined
/workspaces/sodashitsu/packages/tui:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/model/UsageModel.test.ts -t 後着snapshot
```

### 狭いサイドバーのボタン重なり

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/tui

 ❯ src/app/TuiApp.controls.test.ts (3 tests | 1 failed | 2 skipped) 111ms
   × 幅10のサイドバーでもベルは新規と重ならず、短い画面でもペイン一覧へ移れる 108ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.controls.test.ts > 幅10のサイドバーでもベルは新規と重ならず、短い画面でもペイン一覧へ移れる
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/app/TuiApp.controls.test.ts:141:52
    139|       const a = buttons[i]!,
    140|         b = buttons[j]!;
    141|       expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
       |                                                    ^
    142|     }
    143|   const bell = buttons.find((b) => b.action === "bell")!;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  16:21:15
   Duration  2.30s (transform 77%, import 18%, tests 5%)

undefined
/workspaces/sodashitsu/packages/tui:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/app/TuiApp.controls.test.ts -t 幅10
```

### アカウント表示でペイン一覧が押し出される

```text

 RUN  v5.0.1 /workspaces/sodashitsu/packages/tui

 ❯ src/app/TuiApp.controls.test.ts (3 tests | 1 failed | 2 skipped) 168ms
   × 幅10のサイドバーでもベルは新規と重ならず、短い画面でもペイン一覧へ移れる 167ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.controls.test.ts > 幅10のサイドバーでもベルは新規と重ならず、短い画面でもペイン一覧へ移れる
AssertionError: expected ' 基本  … │ 1:t1   +                    …' to contain 'worker'

- Expected
+ Received

- worker
+  基本  … │ 1:t1   +                                                                   session: work
+  ▾ Spaces│ 利用状況 · s:並び順 name · a:アカウント · ↑↓ / Enter:ペインへ · Esc:基本
+    ○ w1  │ account0 · 2026/10/11 16:23:51
+      w2  │   週: 20.0%
+ ─ ▾ Ag… ─│ account1 · 2026/10/11 16:23:51
+  ○ w1 t1↓│   週: 20.0%
+  ＋ ⋯  🔔│ account2 · 2026/10/11 16:23:51
+        « │ 1 エージェント · 1 / 1

 ❯ src/app/TuiApp.controls.test.ts:150:28
    148|   await vi.waitFor(() => expect(h.app.usage.status).toBe("ready"));
    149|   h.app.renderNow();
    150|   expect(await h.screen()).toContain("worker");
       |                            ^
    151|   h.io.type("\r");
    152|   expect(h.app.ui.screen).toBe("base");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  16:23:49
   Duration  2.44s (transform 74%, import 18%, tests 7%)

undefined
/workspaces/sodashitsu/packages/tui:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/app/TuiApp.controls.test.ts -t 幅10
```
