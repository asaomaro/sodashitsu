# 非選択マシンの行の形

MachineRowsの行にもSidebarの通常行と同じshape-row-inset/radius/h/pad-xを適用。buttonの幅はinset分を除外してはみ出しを防ぐ。compactはmargin0/全幅を維持。キーボードfocusも内側のaccent枠とする。

- Chromiumで全19テーマ×3段階、modern/classicの両方についてlocal/remote行のradius/左右余白/幅が同じことを検証し成功。
- 修正SFCだけHEADへ戻した負例でremote row shape differsとして失敗、negative-control.txtへ原文保存。修正はbytes同一で復元。
- Web Vite build成功。review_bubble_resize独立レビュー完了、指摘なし。
- 稼働Webで実リモート行をhoverし、local/remoteともradius8px/inset6pxで一致することを確認。Webは画面再読込で適用。
