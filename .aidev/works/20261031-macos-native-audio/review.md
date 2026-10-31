# PCM kernel 独立task review（途中）

review_transferがpure Float32 conversion/CMSampleBuffer unsafe境界/framer/生成tests/build/selftest/negative concat/workflowをread-onlyで点検。初回shouldは実CMSampleBuffer経路の生成試験不足で、実CoreMedia sampleをplanar/interleavedで作る正例とrate/channel/短いbufferの拒否を追加し、delta点検で解消。追加must/shouldなし。

SDKコンパイルと実行はhosted CI待ち。SCK audio source/Unix transport/Settings/ready未実装のため、音声機能完成とは扱わない。実capture/録音/再生は未実施。
