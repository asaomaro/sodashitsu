# 接続先を最大解像度にする

## 変更

仮想ディスプレイは追加せず、既存の対応モードから配信上限内の最大総画素数を選ぶ。同面積は幅が大きいものを選ぶ。窓のリサイズ・最大化・復帰・画面fitは接続先の解像度を下げず、再接続しない。設定名は「接続先を最大解像度にする」。OS変更の許可・初期off・設定非永続・終了時復元・再接続時の操作許可解除は維持。

## 検証

- Web build（vue-tsc含む）成功。
- E2E typecheck成功。
- 関連unit: 2ファイル・5件成功。
- E2E: 2件成功（13.2秒）。synthetic helperの最大1920×1080を、狭い窓・最大化・復帰でも維持。DOM/canvas寸法と実ブラウザ送信frameで、等倍・拡縮・クリック座標・再接続なし・許可解除・非永続を確認。
- review_view_maximizeの独立レビュー: 対象5ファイルに必須指摘なし。
- git diff --check成功。

## 負の対照

変更前の選択処理へ新しい最大解像度の期待を当て、1920×1080期待に1280×720が選ばれて失敗した。生出力:

```text
 FAIL  |@sodashitsu/web| src/desktop/display.test.ts > chooses the largest supported mode regardless of viewer size
AssertionError: expected { width: 1280, height: 720 } to deeply equal { width: 1920, height: 1080 }

- Expected
+ Received

  {
-   "height": 1080,
-   "width": 1920,
+   "height": 720,
+   "width": 1280,
  }

 ❯ src/desktop/display.test.ts:11:66
      9| ];
     10| it("chooses the largest supported mode regardless of viewer size", () …
     11|   expect(chooseDisplayMode(modes, { width: 1310, height: 800 })).toEqu…
       |                                                                  ^
     12|   expect(chooseDisplayMode(modes, { width: 700, height: 520 })).toEqua…
     13|   expect(chooseDisplayMode(modes, { width: 400, height: 250 })).toEqua…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  16:38:46
   Duration  902ms (environment 42%, transform 42%, import 14%, tests 1%)

```

ログは `/workspaces/sodashitsu-check-logs/20261018-desktop-max-resolution/`。
Windows実機のOS解像度はこの検証では変更せず、合成画面のみ使用。
