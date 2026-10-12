# 設計

DisplayBandGripをpanelと同じ0.75em/太字/最小高さ24px/左余白8px/gap4pxにする。ラベルの省略を維持。帯の操作ボタン列も0.75emとする。DOM比較では両方同時に描画しcomputed font-size/font-weight/min-height、SVGのwidth/height、コンテナからの左余白を比較する。
