# 決定の記録: 画面の様式（20261008-ui-style）

## PR1a・PR1b の実装で、設計と違えた点・見つけた穴

| # | 事項 | 決定 |
| :- | :- | :- |
| E1 | 端末を隠す方法（D12 は `mask`） | `.xterm` は pane より大きい（840×840。親が切っている）ので、`mask` は隣のサイドバーまで覆う。`page.screenshot` の `style` で `.xterm { visibility: hidden }`（配置は変わらない） |
| E2 | 画素の比較に `pngjs`・`pixelmatch` を足さない | E2E の依存に無い。Playwright 同梱の Chromium の canvas で比べる（lockfile は変わらない） |
| E3 | 撮る画面の幅 | 1700×900（1280 では、表示の面の左のパネルが「端末の最小」で自動でたたまれ、4 つの側が撮れない） |
| E4 | 同じコミットどうしで揺れた差の原因と対処 | ①サイドバーの workspace の行（作業フォルダが detached HEAD だと git の枝が出ない）→ git の外の一時フォルダに workspace を作る ②設定「拡張」の置き場所（サーバの一時フォルダ名）→ `.ext-path` を隠す ③グラフのノードの初めの置き場所が pane の UUID の順で決まる → `graph.update` で決まった場所へ置く |
| E5 | `uiStyle` の `theme-boot.js` での扱い | 控えの `uiStyle` が `"modern"` のときだけ `data-ui-style` を当てる。それ以外（無い・壊れている・知らない値）は何もしない。テーマの組が壊れていても様式は当てる（互いに独立）。`ThemeController` は、動いている間は `classic`・`modern` のどちらも属性に書く |
| E6 | vitest の既定では CSS が空に置き換わる（`?raw` も空） | `packages/web/vitest.config.ts` の `test.css.include` に `uiStyle.css` だけを入れる（`uiStyle.test.ts` が中身を検査するため） |
| E7 | **T8 の「クラシックは `origin/main` との差が 0」の例外（設計の見落とし）** | 設定の画面に、ラジオ「画面の様式」を足す（T7）ので、設定ダイアログの画像のうち、この項目の下にある部分・スクロールバーのつまみが変わる（32 枚中 10 枚。差の画像で、差は追加したラジオ・その下へずれた内容・つまみだけと確認）。**これは、機能の追加そのもの**で、避けられない。ほかの 22 枚は差 0。モダンを選んでも（`UI_STYLE=modern`）、差の枚数・画素数は classic とまったく同じ（どの部品も、まだトークンを読まないため） |
