# 専用runtime 接続

- [x] 最小bridge/connectorと取消/再接続境界を設計。
- [x] finite bridgeとTLS connector（taskcheck必須）。
- [x] 実socket/生成record、境界負例と復元、関係するテスト。
- [ ] main/bundle、専用sealed viewer/worker、登録取消/UIへの統合を続ける。
- [ ] 独立build/smoke/cross、PR/main/root反映。

全経路が接続されるまで7Bを完了扱いにしない。
