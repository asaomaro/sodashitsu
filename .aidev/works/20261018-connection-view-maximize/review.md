# 独立レビュー

review_view_maximizeが全体差分と新規共通CSS/composable、プラグイン入力guardとのDOM所属を確認。

P2: デスクトップはTeleport移動でfocusがBODYへ落ち、最大化直後Escがsectionへ届かない。toggleMaximizeのnextTick後にsection/canvasへfocusを復元し、sectionをtabindex=-1へ。修正前のビルドで実ブラウザの追加Esc回帰が最大化classの残留を検知。修正版でPASS。

再レビューと結果確認後、指摘クローズ。追加の必須指摘なし。Webはiframe同一性と非アクティブ復帰、VSCodeはEsc down/up/repeatの抑止と通常Escape・権限・停止、PopoverのDOM所属維持を確認。

## 情報欄・映像領域の追加修正

同じ独立レビュアーが詳細の折り畳み・重ね表示、映像/iframe全面、1600×900対応モード選択、入力維持の差分を確認し、追加の必須指摘なし。実ブラウザ検証をもってクローズする。

standalone CDP E2Eで発見した入力formの位置についても再レビュー済み。`:where()`で汎用ルールの詳細度を下げ、formのabsolute/bottomが有効になる修正は適切との回答。位置を直接検査する負対照（期待842、実際95）で検知済み。

最終検証の7 E2Eとform負対照/修正後成功を受け、独立レビュアーがクローズ可と回答。追加の必須指摘なし。

## fit/クリック位置

review_view_maximizeがfit用canvas明示寸法・矩形からのnormalize・解像度追従との独立化を確認。browser E2EのPNGからのマーカー実測は実装式の写しではないと評価、必須指摘なし。

追加でBounds(native physical)とSystemInformation.VirtualScreen(DPI影響を受け得る)の混在を懸念として報告。入力の全体矩形も既存NativeDriver.Currentから読み直してunionする修正と、AbsolutePointerの境界検査/変換を再レビューし、必須指摘なし・クローズ可との回答。混在DPIの実入力を確認したものではない制限を記録。

## VSCodeのfit振動

fractional contentRectから整数寸法へ切り捨てる変更と、fit中のoverflow制御について独立レビュー済み。通常の1:1スクロールを維持し、サイズがバー出現で往復する原因へ対応しているとの評価。追加必須指摘なし。負対照の寸法超過と修正版3 E2E通過を確認してクローズ。
