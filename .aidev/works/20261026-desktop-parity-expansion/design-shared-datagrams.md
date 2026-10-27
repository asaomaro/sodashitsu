# 8C: 複数viewerの独立UDPとWSS復帰

shared-nativeに追加でshared-datagramsのprotocol/cap/optionを積で交渉。旧8B peer/browserにはnativeDatagrams/sharedDatagramsを送らず、WS/WSS動画を維持する。Bは直接要求のsharedNative/nativeDatagrams/ローカルNative ceilingも検査する。

viewer別の既存NativeVideo/NativeDatagramsがRTC/DTLS・連番/信用枠・入力鮮度・timeout・WSS fallbackを保持する。source encoderは一つ。keyframe回復要求は現在のconsumer UUIDを照合してsource UUIDへ写し、そのconsumerだけfuture-key待ちにする。全consumer合計100ms間隔でforce keyframeを抑制し、他viewerのpending/control/保持入力へ影響させない。古いIDは無視する。

helper側nativeDatagrams ceilingはviewer固有要求から切り離し、shared source＋ローカルNative許可へ正規化する。画像onlyを先に開始しても後からUDP参加できる。shared encoderのrate/解像度は現段階で不変、AとBがmedia.settings.adaptiveをfalseに固定する。単独の自動調整は維持。

必須点検: protocol/cap gate、source/helper設定一致、perviewer datagram ACK/ID/timeout、force-keyの現在性/合計上限、非ownerのfallback teardownと保持入力。生成画像と実browser/Node UDP datachannelで試験するが、OS画面・OS入力・service/driver変更はしない。
