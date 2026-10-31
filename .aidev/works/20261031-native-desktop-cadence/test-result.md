# 検証

pnpm build/typecheck成功。Linux portal生成59件成功。Linux native video生成26件中25成功・従来の完全software decode1件はローカル依存不足でskip。新しい実x264 encode→rate1200kbps/10fps→encodeは生成BGR画素だけを使い、同pipelineとcodecの継続を確認して成功。開発用debは/tmp展開のみでsystemを変更しない。

関連Node3ファイル23件成功。生成ブラウザ2件はLinux/macOSのnative経路について、媒体要求adaptive:true、低下したnative_rate、同ID/start1件/stop0件、描画画素と生成音声を確認して成功。実デバイス・実音声・OS入力なし。既知のローカルChromium1243停止を避け、インストール済1217を指定した。

上限チェックをprivate copyだけ1fps緩めた負例は意図したVideoFailure not raised assertionで失敗→復元成功。rawはnegative-control.txt。元ソースは不変。初回の負例ハーネスfixture欠落は証拠に数えていない。

macOSの実software rate変更/故障注入テストはCIへ。元上限・API非対応・VT失敗・source失効を成功と置き換えない。実機性能/OS許可は別確認。

CIで従来の単独readyにnativeCadenceを出さない期待が失敗。単独UIの交渉表示を追加した新仕様へ期待を更新し、両端proofありの時だけtrue、一方欠落時はfieldなしを確認。変更後Relay277件成功（/tmp/soda-native-cadence-relay.log）。独立delta reviewは追加指摘なし。
