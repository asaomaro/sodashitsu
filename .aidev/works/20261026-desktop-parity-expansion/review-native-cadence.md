# native cadence independent review

review_transfer: A/B/helper gate・旧helper互換・source metrics・低cap境界を点検。recoveryでMath.floor(capacity)が現在FPSを下回る問題はMath.max(current, ...)で解消しFPS1/5境界回帰を追加。source metricsはprivate opt-inならwindow1でも送る、decode時間は対応するwindow3のみ。helperOptionsからprivate optionを除去。最終追加指摘なし。

review_pointer: FPS-onlyでもSetBitrateを呼びGPU encoderが失敗する問題を発見。VideoRate.Applyが現在bitrateを保持して値の変更時だけ呼び、setter成功後のみ状態をcommit。throwing setterによるFPS-only/recoveryと原子性チェックを追加。修正差分の再レビューで追加必須指摘なし。

resolution barrierはこのPRの実装対象外。design-native-adaptive.mdは次差分の設計記録であり、task4は未完了のまま。
