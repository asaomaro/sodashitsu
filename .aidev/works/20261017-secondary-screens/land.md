# main統合前の確認（2026-10-17）

ユーザーから、Tailscale Funnelの作業前にここまでをmainへ統合する指示。既存PR #168を先にmerge。追加機能は独立worktreeからPR #169。

- 最終差分のbuild/typecheck成功。実シェル・Chromiumのsmoke成功。再ビルド後のsoda実端末起動テスト成功（1件）。
- 全体テスト: 669ファイル、10868成功、25失敗、1skip。別途起動テスト1suiteがdist鮮度検査で失敗。
- 25失敗のうちTUI21件は、上部ボタン折り返し閾値変更による一覧位置の変化。閾値23を維持し、狭い幅では「他 ▾」へ短縮。既存4ファイル＋controlsの5ファイル79件成功。修正差分は独立再レビュー済み。
- Web Appの旧ボタン期待を6画面・その他へ更新。独立再レビュー済み。App/GraphViewの2ファイル102件成功（GraphViewの時間超過は単独再実行で解消）。
- グラフ性能は単独再実行で3件成功。全体並列実行の負荷下だけ時間超過。
- agent.promptの1000ms期待はmain baselineでも同じ1件失敗。別作業のagentInput修正は含めない。
- main baselineでTUIの既存21件は成功することを確認した。baseline全6ファイルは97成功、既知agent.prompt1失敗。
- 実行ログ: /tmp/delegation-land-{tests,tui-check,tui-fixed,web-check,baseline,server-check,build,typecheck,smoke}.log。

## TUIの修正前の失敗（負の対照）

修正前に既存テストを実行して失敗し、上記修正後に同じテストが成功。テスト自体の期待は変更しない。TS直接実行。

```text
 FAIL  |@sodashitsu/tui| src/app/TuiApp.view.test.ts > TuiApp：大きさの申告と描画の予約（AC2・AC11） > 描画は変化をまとめて最短 16ms 間隔。画面にサイドバーの workspace と tab バーが出る
AssertionError: expected ' ▾ Spaces     開いた順   ││              …' to contain 'w1'

Expected: "w1"
Received: " ▾ Spaces     開いた順   ││                         ││                         │"

 ❯ src/app/TuiApp.view.test.ts:81:27
     79|       expect(outer.text()).toContain("w2");
     80|     });
     81|     expect(outer.line(2)).toContain("w1");
       |                           ^
     82|     expect(outer.line(0)).toContain("t1");
     83|     // 同じ tick の多数の変化は 1 回の描画にまとまる。

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/21]⎯
```
