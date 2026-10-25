# 独立レビュー

`/root/review_transfer`が実装と別のコンテキストでearly点検と最終の差分全体を確認。

- early点検でCODECAPI_AVLowLatencyModeはVT_BOOLが必要と指摘。UI4ではなくVT_BOOL/VARIANT_TRUEへ修正し、両Windowsで出力を確認した。
- 最終点検では旧peer交渉、通常画面限定、hardware-only列挙、sample/buffer/event/activation解放、1枚のdecode/draw ACK、stopped/late frame close、画像policy復元・keyframe・release、BT.709一致を確認。
- sr-pcで追加したoutput-type再交渉・新HaveOutput待ちの差分も点検。finallyで旧sample/event/bufferを解放してからtype変更し、入力を再送せず新しい出力creditを消費、候補/回数/ヘッダ/packetを制限する点を確認。
- 最終production差分に未解決の指摘なし。実画面性能は未測定と記録し、通常画面guardを維持する。

レビュー側では重いbuild/testを重複実行していない。追加fixtureのみのE2E再実行と記録を揃えて着地する。
