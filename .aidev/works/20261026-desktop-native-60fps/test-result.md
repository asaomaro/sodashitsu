# 60fpsの確認

関連unit60件成功。新viewer headerの有無、helperだけrate非対応、画像fps10とnative60の独立、旧peerへのrate strip、未対応時legacy10fps維持を確認。build/typecheck成功。GPU生成fixtureの実browser canvas色・ACK・60fps要求値・画像fps≤30を確認して成功。native helper全体compile/既存pure回帰と、生成NV12の実hardware MFT60fpsで4frameのSPS/IDR・timestamp・小数deadlineを確認。実画面やOS入力は使わない。

## Negative

修正だけを戻し、nativeは再compileして60fps ctorの実行時拒否、Nodeはテストの実行時assertion失敗を確認。その後byte復元した。

- [native上限](negative-native.log): 『Native video limits』。
- [選択rate](negative-rate.log): 60fps要求が画像側10fpsへ戻ることを捕捉。
- [helper交渉](negative-helper.log): helper未確認で60fpsを返す退行を捕捉。

新headerがあってもhelperだけ非対応の回帰を追加。画像設定の表示を明示するレビュー提案にも対応。実際の描画fpsやWAN速度比を示す試験ではない。高RTT時の3枚ACK windowによる上限は今後のUDP経路で対応する。

追加確認: native-video/settings browser8件pass、実画面性能測定1件opt-in skip。生成GPU直接入力と従来memory入力を60fps media typeで各90frame、640×360/1280×800/1920×1200で確認し成功、helperの動画フルフレームCPU readback増分0。local GPU試験の平均encoder処理は約31msと変動し、60fps到達を示さない。既存1ms timerの別試験ではhighResolution=true、平均1.50msで成功。native60設定の受け入れと実到達性能を区別する。[GPU生ログ](gpu-60.log)。
