# レビュー記録

## タスク点検ログ

- T2 [should] `sectionAtScroll` で `tail`（= min(見えている高さ, 最大)）が 0 のとき `k0` が NaN／Infinity になる → `tail > 0` の分岐を足し、`viewHeight: 0` のテストを追加 [conv:-]
- T2 [should] `keepChosen` の `headerHeight` がテストで縛られていなかった → `scrollTop=10` で `headerHeight` を外すと落ちるテストを追加 [conv:-]
- T2 [nit] 線の定数 40 が未固定 → 節の上端が線のちょうど上／1px 下のテストを追加 [conv:-]
- T2 [nit] `inView` の境界（上端 −2px・下端の排他）が未検証 → 境界値のテストを追加 [conv:-]
- T3 [must→誤検知] 題名の行の sticky が grid 化で効かなくなる疑い → 実 Chromium で CSS を写した `<dialog>` を 900px スクロールして実測（`dialog.scrollTop=882` のとき［閉じる］の上端は dialog の上端から 19px のまま、メニューも固定）。固定は保たれるので修正なし。E2E（T7）で実物でも確かめる [conv:-]
- T3 [nit] 767px 以下のブロックの `max-width` が基本ルールと二重 → `[open]` の詳細度で上書きされるため必要な書き方。修正なし [conv:-]
