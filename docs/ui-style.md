# 画面の様式（クラシック／モダン）

ブラウザ版の設定の節「表示」の、ラジオ「画面の様式」で選ぶ（再読み込みは要らない。同じ利用者の別のブラウザにも反映される）。値は共有の設定の `uiStyle`（`"classic"` か `"modern"`。無い・読めない値は `classic`）。

- **クラシック**: いまの見た目。何も変わらない（比べる道具で、画素まで同じことを確かめている。`docs/verification.md`「画面の見た目を、変更の前後で画素まで比べる」）。
- **モダン**: 角を丸く、行・押せる部品の高さと左右の余白にゆとりを持たせ、pane の間のすき間を広げる。**色と文字（`font-family`）は、様式で変えない**。

## いまの段階でモダンが変えるもの（PR1c・PR2）

| 所 | モダンの値（**仮置き**） | 決めてある場所 |
| :- | :- | :- |
| 角（小・中・大） | 6・8・12px（クラシックは 3・4・6px） | `packages/web/src/styles/uiStyle.css` |
| pane の間・外周のすき間（設定「pane の枠・隙間の太さ」の 3 段） | 細い 4px・既定 8px・太い 12px（クラシックは 2・4・6px） | `packages/web/src/store/settings.ts` の `PANE_FRAME_THICKNESS_PX_BY_STYLE` |
| pane の枠（選択の強調・薄い枠・ドロップ候補）の角 | 大きい角（12px） | `uiStyle.css` の `--soda-shape-pane-radius` |
| サイドバーの行・tab・「＋」・画面の切り替え・サイドバーの下のボタン | 行 36px・押せる部品 32px 以上・左右の余白 12px | `uiStyle.css` の `--soda-shape-row-h`・`-control-h`・`-pad-x` |

- 数値は、**`uiStyle.css` の 1 か所と、太さの表の 1 か所**に集めてある（後から変えやすい）。クラシックでは、高さ・余白・pane の枠の角のトークンを**定義しない**（部品の側が `var(--名前, 今の値)` の形で読むので、未定義＝今の値）。
- **いまある 4 つの設定（pane の枠の表示・隙間・隙間の太さ・外周の枠）は、モダンでも、今と同じ意味で効く**（太さの値だけが、様式の表で替わる）。
- 端末の桁と行は、すき間・高さの分だけ変わる（箱が変わるため）。様式を切り替えると、端末の大きさが変わった知らせが 1 回ずつ送られて落ち着く。分割の比率・端末の文字の大きさは変わらない。

## 対象外（モダンでも、クラシックのまま）

- 端末版（`soda`。画面の様式の設定を読まず、設定の画面にも出さない。保存された値は、知らない項目として保つ）。
- 端末の中身（xterm の描画・文字）。
- 表示の面（`sodactl display`）の枠の中（`DisplayFrame`・印「スクリプト」・`public/display-view/*`。モダンでは、外側の見出し・帯の行〔`DisplayPanelHead`・`PaneBands`・`DisplayTray`〕も、いまは変えない。高さが配置の計算に使われているため。PR3 以降で扱う）。
- モバイルの 1 列の画面の骨組み（`MobileShell`。pane の枠が無いので、すき間も無い）。
- 重なる部品（ダイアログ・メニュー・トースト）の高さ・余白・影、グラフの画面（PR3・PR4）。

## 開発者向け

- E2E をモダンで流す: `UI_STYLE_E2E=modern`（`packages/e2e/src/support/fixtures.ts`。localStorage の設定の読み出しに `uiStyle: "modern"` を足す）。ただし、クラシックの値（太さ 4・6・2px）を直に確かめる spec（`appearance-settings.spec.ts` の太さの項）は、モダンでは値が違って落ちる。
- 絵を撮る: `UI_STYLE_PR2_SHOTS_DIR=<dir>`（`ui-style-pr2-shots.spec.ts`。端末の文字を隠さない・偽のエージェントの画面つき。クラシックとモダンの細い・既定・太いを、暗い・明るいで）。比較用の画像は `ui-style-shots.spec.ts`（端末の文字を隠す）。
- 設計と決定: `.aidev/works/20261008-ui-style/`（`design.md` 追補 01・`decisions.md`）。
