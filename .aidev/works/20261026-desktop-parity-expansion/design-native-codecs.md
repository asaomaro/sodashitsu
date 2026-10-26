# 第5段階: native codec negotiation

範囲: H.264(既定)/H.264 4:4:4/HEVC/AV1の選択、A/B/helper/browserの明示opt-inと実bitstream/header/decoder能力の確認、非対応時のH.264復帰。既存H264 viewerへ未知field/codec/channelsを送らない。GPU MFT候補の登録だけをencoding利用可能と表示しない。

初期実機queryは登録metadataのみ（画面/入力/clipboard/OS modeに触れない）。A/BともAYUV入力のhardware H264 candidate=0、NV12 HEVC/AV1 candidate>0だが、encodeVerified=false。実際のMF type設定/生成sample encode/codec header/ブラウザdecodeが通るまでは対応済み扱いしない。

新しいnative codec subprotocol/cap/options/helper-readyを積で交渉。video requestのcodecは旧Bへ送らずdefault H264。helperがinput/output subtypeとprofileを実際に設定し、codec stringはSPS/sequence headerから取る。H264 444はAYUV input+High444 profile+実SPS chroma_format_idc=3が必要。NV12 420を444と表示しない。HEVCはAnnex-B VPS/SPS/PPSからprofile/tier/levelを得る。AV1は低overhead OBUのsequence headerからprofile/level/tier/bitdepthを得る。fixed codec値やソフトウェアencoderの暗黙選択を避ける。

既存window/ACK/seq/resolution barrierは継承。packet timestamp/keyフレームの有限access unitは共通だが、new codec用UDP channelは新protocol限定とする。resizeでcodec familyは変えず、実headerのprofile/level変化は既存format ACKを使う。音声clock/mute/peerを正常resizeで維持。ブラウザisConfigSupportedと実decodeの失敗はrequest-bound fallbackへ戻し、同じ非対応codecを再試行するloopを作らない。

検証はgenerated color/texture/PCMとfake endpointsのみ。実MFT encoderと実ブラウザdecoderの成功/非対応を分けて記録。利用者の実desktop/input/clipboardやOS設定変更を自動試験しない。

資料（一次資料、2026-10-26確認）:
- https://learn.microsoft.com/en-us/windows/win32/medfound/h-264-video-encoder
- https://learn.microsoft.com/en-us/windows/win32/medfound/h-265---hevc-video-encoder
- https://learn.microsoft.com/en-us/windows/win32/medfound/video-subtype-guids
- https://www.w3.org/TR/webcodecs-hevc-codec-registration/
- https://www.w3.org/TR/webcodecs-av1-codec-registration/
- https://aomediacodec.github.io/av1-spec/

独立設計レビューで確定: HEVCはdescriptionなしAnnex-B AUに必要VPS/SPS/PPSとIDR/CRA/BLA random access条件を含める。AV1はlow-overhead OBU単一temporal unit、sequence headerとshow_existing_frame=0/frame_type=KEY_FRAME/show_frame=1をbitstreamで検査する。MFT clean-pointだけではkeyにしない。media typeにだけあるheader/length prefix入力を正規化し、resize後とUDP欠損→decoder reset→keyの実decodeも検査する。header/decoder設定が変わる場合もformat ACK対象。H264復帰はuser request連番＋media idに結び、同一要求で1回まで、新encoder/id/必要ならpeerを作り旧idをretire、保持入力release・再送なし。UIは要求codecと実codec/復帰理由を区別する。

初期実encode検査（A/生成bitmap）: H264/HEVCは4frameとforced random access成功、HEVC actual=hev1.1.6.L63.B0。H264444はhardware AYUV候補なし、AV1は登録候補ありだが低遅延encoder出力がstallし未対応として扱う。MF AV1 output profileはWinSDK eAVEncAV1VProfile_Main_420_8=1であり、bitstream seq_profile=0と混同しない（Microsoft win32metadata codecapi.h確認）。候補を対応済み表示しない理由を実例で記録。
