# remote-desktop側の差分・減色方式の転用調査

2026-10-17。利用者の情報を受け、/workspaces/sodashitsu-remote-desktop (feature/remote-desktop) の未コミット実装を読み取り確認。相手worktreeの変更・プロセス操作なし。この記録時点では移植・実装なし。相手も開発中なので採用時に最新版とレビュー結果を再確認する。

## 確認済み

- scripts/remote-desktop/WindowsDesktopHost.cs: 生Bitmapを縮小し、RGB565/RGB332/16階調grayへ任意減色、64px tile比較と矩形結合、部分PNG/全面JPEG/unchanged、30秒ごとのfull、変更60%以上または8矩形超でfull。減色は標準画像圧縮前でpacked wire formatではない。
- packages/protocol/src/desktop.ts: binary画像パケット、baseSeq/size/contentIdを検査するDesktopFrameChain。
- packages/web/src/desktop/render.ts: 全patchの復号/サイズ検証後にcanvasへ適用。current世代確認とbitmap解放。
- 設定UI/計測/単体・E2E・Windows比較記録も存在する。実測を本CDP実装の成果として扱わない。
- .aidev/works/20261017-remote-desktop/windows-delta-comparison.json: Windows実機1台loopback、専用texture画面、1280x800 JPEG65 target10fps、各5秒1回、初回full除外。小領域更新19.144→0.505Mbps、静止17.254→0.00175Mbps。dense15.329→9.583Mbpsは送信更新数も32→20へ減少。CDPの通常VSCodeで同じ削減率を保証しない。

## CDPへの転用境界

現CDPはNode標準APIのみでbase64 JPEGを受け取りJSON/WSS転送。上記C#はGDI生Bitmap比較であり、そのまま差し替えられない。PNG screencast等から送信元側で復号・差分抽出・減色・再圧縮するadapterが必要。JPEG復号比較では圧縮に由来する変化が差分を広げうる（未測定の懸念）。ブラウザ受信後だけの減色は回線帯域を減らさない。

差分の基準は直前に取得したフレームではなく、viewerが保持する送信済みbaseと一致させる。現CDPのlatest1枚集約/ACK/fit世代/停止取消しへ統合し、resize・再接続・base欠落で必ずfullへ戻す。全画面画像と部分画像の上限・矩形境界・圧縮解凍後寸法・buffer上限・古い世代の描画破棄を維持する。現在の認証・target限定・操作/fit明示許可は流用対象から分けて維持。

## 推奨する次段階（設計案）

1. 相手側のbinary frame/chain/render/計測を共通化できる境界を合わせる。サーバ全体・Windows全画面capture/inputはコピーしない。
2. 本CDPのfps/imagebytes/wirebytes/描画ACK時間を先に測る。静止/入力/scroll/全面更新、equal/fit/fullscreen、CPUを同条件で比較。
3. CDP画像adapterの小PoCで復号・差分・減色のCPUと文字可読性、PNG取得とJPEG取得を比較。依存追加やWindowshelperの必要性を判断。
4. 効果がある場合のみbinary/差分/選択式減色を段階導入。通常はフルカラーを維持し減色は利用者選択。

これは読み取り調査に基づく移植案であり、取り込み済みではない。
