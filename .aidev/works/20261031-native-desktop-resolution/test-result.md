# 検証

build/typecheck成功。Linux41件中40成功・既存完全software decoder依存1skip。実Gst workerのH264/H264-444/HEVC/AV1各形式で、生成BGR→旧pipeline NULL退役→新サイズkey保持→format ACK→同ID/seq/gen継続→実SPS/sequence由来の64×36寸法を確認した。実OS capture/input/audioは使わない。開発用debは/tmpへ展開のみ。

Node関連27件、Relay全277件成功。Browser4件（Linux/macOS×UDP/WSS）はgen2 960×600の新しい描画画素・描画増分、同一ID、実Opus生成tone・同audio decoder/context/peer数、Control down/up ACKと操作grant継続を確認して成功。音は仮想streamへ接続する。初回WSSのpeer0期待は既存共通peer1を誤認したため、切替前後で増加しない検査とmedia_stream.datagrams経路検査へ修正。Shiftは生成helperがcapに含めないため、明示対応しているControlで検証した。これらを製品不具合とは扱わない。

private-copyで同stream再入・format fence・元deadlineを無効化した3負例は意図したassertionで失敗→復元成功。元source bytesは不変。rawはnegative-control.txt。

Macは生成controllerのACK drain/実退役完了/heldkey/baseSeq/gen/expiry/reentryと、実software VTの32角resize→decode色順を追加。新SDK/CI結果は進行中。増えた有限のnegative compile群に対しMac生成ジョブ全体のbudgetだけ20分へ変更し、各compile/self-testの上限は維持した。
