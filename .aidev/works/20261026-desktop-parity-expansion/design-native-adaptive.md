# 第4段階 design: native video FPS/resolution adaptation

三者protocol/capability/helper-ready opt-inのnativeAdaptiveだけ有効。既存media settings.adaptiveがfalseなら自動変更しない。OS解像度・image/agent snapshotのサイズ・input/grantsを変更しない。元のuser max FPS/width/height/bitrateを越えない。ACK/損失・buffer・capture/convert/encode/decode時間からhysteresis/cooldown付きでFPS/bitrate、CPU/decodeや輻輳が継続したときにvideo sizeを選ぶ。

FPSはencoder media typeのuser maxを維持したままcapture cadenceだけ変更する。resolutionはGPU NV12 outputをimage readbackと独立のサイズにする。encoderをdispose→有限のsurface lease回収待ち→NV12 output再作成。draw ACKとMFT tracked sample leaseの返却を混同しない。期限内に返却されないpoolは解放/再利用しない。旧poolを1個だけcapture所有で保持し、解像度変更後は独立bitmapによるmemory inputへ落とす。新たなpoolを追加しない。旧poolの返却/解放は通常のcapture disposeの所有権に従う。GDI fallbackは独立video bitmapへ縮小し、image bitmap/OS modeは維持する。

## 小さい差分に分ける

まずnativeCadence（A/B capability・options・helper readyのopt-in）でFPS/bitrate変更を着地させる。viewer wire/decoder/UDP peer/音声は変更しない。既存adaptive=falseは無効。旧helperには新コマンドを送らない。以下のnativeAdaptive resolution barrierは次の差分で実装し、完了まではtask 4を未完了とする。

## 変更のbarrier

1. B controllerはprivate native_profile(id,next generation,width,height,fps,bitrate)をhelperへ送る。helperは新しいframeの作成を止め、既存windowのACKがすべて戻るまで待つ（requestとACKの間に既に作られたframeもdrain）。
2. helperは新encoder/resourcesを作り最初のIDRを内部生成して最大512KiBの1枚だけ保持し、SPSから実codecを得たnative_profile_applied(id,generation,baseSeq,width,height,fps,bitrate,codec)を出す。新payloadはまだ送らない。seqは全generationで単調増加しresetしない。
3. Bはpending空/baseSeq一致/希望profile一致を検証し、同じsession id・new generation・baseSeqのmedia_streamを送る。既存audioとUDP peerは維持する。
4. viewerはvideo decoderとdatagram受け口だけをnew generation/baseSeqへ切替。旧seq<=baseSeqのlate fragmentsを無視する。format ACKを送るまではhelperからnew payloadが来ないため、UDPがformat WSSを追い越して旧decoderへ入るraceを防ぐ。
5. Bはauthenticated format ACKを検査してprivate native_profile_resumeを送る。helperは保持したkey/SPSからnew generationを始める。format ACKは同時1件のpending (id,generation,baseSeq)と厳密照合しdrawACK/入力鮮度には使わない。3秒deadline/失敗ではimagesへfallbackし、stale gen/frame/ACKを適用しない。

media_streamのbaseSeqとnative_frameのgenerationはfeature opt-in時だけ。A relayもgeneration単調性/pending空を検証。WSSのsequenceはbaseSeqから、UDP assemblerはbufferをclearしてnext=baseSeq+1/noticeSeq=baseSeq/key-requiredへ切り替える。Frame idsを再利用しないためlate UDP packetはold seqとして捨てられる。audioは別のgeneration1/clockを維持し、再同意/再ミュート/peer再接続を起こさない。

局所時刻: BのACK RTTにはpropagationが含まれる。raw RTTだけで無限にFPS/bitrateを落とさず、windowからの実効rate・source/decode cost・loss/bufferと持続条件を使う。最低rate/sizeと回復の上限・cooldownを設ける。

検証: generated H264 fixtures/texture/PCMとmemory endpointsだけ。profileのdrain中old frames、formatより早いUDP、late old packet、fake支援cap非対応、ACK期限、audio continuity、source snapshot/input/grants保持を検査。実OS capture/input/clipboard/解像度変更は自動実行しない。

reviewで明示した必須条件: A relayのaudio generation/seqをvideoから分離し、video generation 2後もWSS/UDP両方でOpus payloadのdecode出力を確認する。切替でaudio owner/mute/seqをresetしない。viewerの旧decoder init/output/errorはformat epoch/decoder identityで隔離する。正常barrier 3秒を映像stale監視2秒が妨げないよう、明示的な有期限barrier state中のみ映像監視を待機する。入力鮮度2秒は延長しない。stop/設定変更/失敗はpendingを失効させ、遅いapplied/resume/format ACKから復活しない。正常切替ではaudio/peerを維持、barrier失敗時の最終images fallbackはaudio/peer停止を伴う（例外をUI/docsで明示）。FPS/bitrateのみではbarrier/世代変更/encoder再作成を行わない。

## 実装で確定した境界

- DesktopNativeFrameNoticeは世代uintを許可するが、A/Bは交渉したcurrent generationとの一致を毎回検査する。旧viewerへ新世代や未知fieldを送らない。
- transport sentAt/ACK RTTとinput freshAtを分離。保持IDRは切替待機で古くなるため、最初のframeのfreshAtだけ保守的にbarrier開始を継承。2.8秒でformat ACK→100ms後draw ACKでもACK timeoutしない。保持IDRで鮮度を延ばさず、その後のfresh frameで復帰する。
- native開始時のConfigureVideoOutput/encoder作成はTryCreateNativeVideoの同じtry内。1279×800など奇数サイズの失敗はnative_video_stoppedへ戻し、共有全体を終えない。
- resolution controllerは2秒かつ8 ACK以上の評価が3回続く処理過負荷またはloss/queueで段階縮小、8回余裕が続けば回復。上限1/.75/.5、最小幅min(640,initial)、偶数寸法と縦横比を保持。raw RTTを解像度の信号にしない。実サイズは初期native frameから固定する。
- GPU検査は生成textureだけ。1280×800→960×600で新SPS/IDRを作り、使用中poolのresize timeoutで再利用しないこと、image側の寸法不変を確認する。実ユーザーのdesktop capture/input/mode変更は行わない。
