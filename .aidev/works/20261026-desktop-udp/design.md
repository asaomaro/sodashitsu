# Native H264 UDP経路

新viewer header/A/B capability/helper ready（通常画面のみ）で交渉し、nativeメディア依頼時だけweriftをdynamic importする。既定iceServers=[]でライブラリのpublic STUN既定値を使わず、Bの明示設定だけを渡す。認証済み親WSSでoffer/answer/candidateを運び、ICE/DTLS/SCTPのpeer lifetimeを共有・idへ固定する。OS入力・操作許可・agent・clipboardは親FIFOに残す。

映像DCはunordered/maxRetransmits0、ACK/keyframeのみのcontrol DCはordered/reliable。両方open後だけencoder開始。fragment最大16KiB、access unit最大512KiB、3枚credit。browserは形状metadata後、完全なUDP frameをWSS noticeより先でも描画できる。後続seqから丸ごと失われたframeのgapも判定し、150msでdrop、以後deltaはdropしてIDRを要求。再assemblyは最大3枚、重複矛盾・長さ・reserved・seqを検査。keyframe要求は250msに1回。

Bはpending最古seqのdirect ACKだけ受け付け、noticeと検証済みACKを同じ有界WSS metadata FIFOへ順に置いてからhelper creditを解放する。Aは同じ3枚ledgerを検査。dropped ACKはcreditのみ解放し、A/Bとも描画鮮度を延長しない。parentからのUDP ACKや非UDP dropped ACKを拒否。ブラウザで失われたframe以前に復号待ちのframeも順にdropし、decoderを作り直してIDRから復旧する。

handshake8秒/中断/描画2秒停滞/最古pending2.5秒で、一度だけ新id/encoder/SPSのWSSへ切り替える。encoder開始後の切替ではprivate resetがviewer/agent操作許可を解除し、保持入力を再送しない。開始前の失敗は既存の操作を解除しない。切替前idを最大32件保持して遅いsignal/fallbackを消費し、Aも旧metadataを既存retire/requestedNative guardで破棄する。明示stop・親失効・secure transitionでpeer/decoder/timer/queueを解放する。

ACKの実測待ち/破棄を使い、1秒以上・8ACK以上でビットレートを20%減または10%増（128kbps～依頼上限）。C#のencoder所有threadでICodecAPIを呼び、ForceKeyFrameはVT_UI4=1、mean bitrateもuint32。非対応ドライバーはnativeを終了しWSSの新encoderで継続する。

werift 0.25.2のDCEP encodingがunordered bitを上書きするため、pinしたpnpm patchをESM/CJS双方へ適用する。browserの実DC条件検査は緩めず、元の依存へ戻すruntime negativeも行う。詳細はpatches/README.md。

生成H264の実browser canvas・UDP候補/空ICE設定・WSS payloadなし・直接ACK・故障/全欠損/停止・キー保持中revokeを検証する。native generated pixelsでは強制IDR/bitrate変更を確認。unitはfragment bounds/gap、freshness/order、stale timer、retire races、旧peer/secureを確認し、runtime negativeと独立レビューを行う。実WAN/NAT/TURN到達率・改善率は別測定とする。
