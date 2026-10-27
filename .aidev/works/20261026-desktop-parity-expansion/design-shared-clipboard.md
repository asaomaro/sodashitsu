# 8J 通常共有sourceのclipboard

実装・検証中。

共有clipboardはsourceのOS clipboardを扱うため、画像・input・microphoneとは別の明示所有者を1窓だけ認める。既存の他窓の許可を奪わない。全窓で同じclipboard経路opt-inを選び、旧cohortのallowClipboard=falseを保つ。新viewer protocol/A/B capabilityとhelper ready proofを交渉する。保護/仮想/native-otherOSには転用しない。

既存helperのclipboard_control generationはsource共通である。各viewerのlocal generationをそのまま流すと衝突するので、source単調generationとlocal generationの対応を所有leaseに保持する。text idもsource単調idへ変換、resultは元viewer/local idへ戻す。他窓/失効済みの結果は配信しない。rich transactionは1owner1UUID、bounded retired IDと既存timeoutを維持。切断/許可解除はsource generationを進め、queued commitの権限を失効する。入力のcontrol ownerとは独立。

検査対象: old peer/default off、helper非対応、grant競合/解除/切断、text id衝突、rich cancel/遅い結果、source再起動、cursor/native/audioと同時、plain/encrypted2browser。生成clipboard workerだけ使用し、現在の利用者のOS clipboardを読み書きしない。taskcheckと独立レビュー必須。
