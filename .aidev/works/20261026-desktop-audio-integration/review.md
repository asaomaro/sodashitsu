# 独立レビュー

- review_transfer: optional C# reflectionとbounded stop、Node sourceの所有者/許可、A/B/header/helperの合意、専用audio経路、旧peer互換を確認。最初のレビューで修正必須なし。
- review_pointer: UIの初期mute/async resume/stop/resource/queueを点検。WSS malformed音声例外の局所化、optional audio DCがvideo開始を待たせる問題を指摘。audioChunk内catchとvideo/controlのみのopen条件へ修正し、回帰テスト追加。再レビューで指摘解消・追加の修正必須なし。
- 生成音声を実Chromiumで復号して、出力timestampが入力より1us小さくなる挙動と、packet欠落後のrawOpus sampleclockのずれを検出。sample1個分(21us)内照合と不連続時decoder更新へ修正し独立再レビュー通過。遅い旧outputはidentity guardで閉じ、新pendingを消費しない。
- 実音声取得やOS入力をレビュー/試験で実行していない。

- 最終のorigin/main差分レビューでも追加の製品コード指摘なし。試験helperのsocket backpressureで未送信seqを消費する点を指摘され、上限確認を更新より前に移し、実socket pauseの正例・負例で検証した。
