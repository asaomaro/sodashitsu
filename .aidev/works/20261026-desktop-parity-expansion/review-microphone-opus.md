# マイクOpus独立レビュー

別コンテキスト2件（review_pointer/review_transfer）によるread-onlyの全差分レビューと修正再レビューを実施。

- must: DesktopOptions object refineで既存.pick()が実行時throw。除去してProvider側の条件検査を維持し、修正後browser5件を通過。
- should: 旧B capability/旧viewer featureの境界を直接試験。実WS Relay試験3件を追加し、options/ticket/readyの新field不在とPCMの継続、両対応時のOpus ACKを検証。型だけの修正を含め再読済み。
- 新test fixture終了とtemp削除の競合: 新testのfinallyでprovider.active解除（helper process close）を待つ。追加差分の独立再レビュー済み。

両レビューで追加mustなし。許可、codec混在拒否、期間・queue上限、遅延probe/encoder callback停止、helperへの未知option除去を確認。外部参照のfact-checkは同じフォルダの記録を参照。
