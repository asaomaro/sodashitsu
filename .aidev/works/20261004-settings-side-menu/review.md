# レビュー記録

## タスク点検ログ

- T2 [should] `sectionAtScroll` で `tail`（= min(見えている高さ, 最大)）が 0 のとき `k0` が NaN／Infinity になる → `tail > 0` の分岐を足し、`viewHeight: 0` のテストを追加 [conv:-]
- T2 [should] `keepChosen` の `headerHeight` がテストで縛られていなかった → `scrollTop=10` で `headerHeight` を外すと落ちるテストを追加 [conv:-]
- T2 [nit] 線の定数 40 が未固定 → 節の上端が線のちょうど上／1px 下のテストを追加 [conv:-]
- T2 [nit] `inView` の境界（上端 −2px・下端の排他）が未検証 → 境界値のテストを追加 [conv:-]
