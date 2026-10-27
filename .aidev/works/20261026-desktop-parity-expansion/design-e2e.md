# Task10: 全laneのE2E

実装前の境界: 通常のWSSは中継Aで復号できる。UDPのDTLSだけを全経路E2Eとは扱わない。現行agent API/MCP/model/CLIはAがimage/inputを扱うので、そのまま全lane暗号化を主張しない。

信頼するendpointはBのowner processと、A側browserまたは明示許可されたagent client。ブラウザJSは配信元を信頼する必要があり、中継が次回配信するJS自体を書き換える攻撃をこの実装で防げるとはしない。信頼済みクライアント配布/固定は別境界として明示する。

10A: 共通暗号状態機械。WebCryptoのP-256 ECDSA identity、ephemeral ECDH、HKDF-SHA256、AES-256-GCM。peer fingerprintを呼出し側が独立にpinした値と完全比較する。TOFUを自動承認しない。両identity/ephemeral/nonce/role/sessionを署名transcriptに束縛し、片方のhelloだけに署名しない。秘密は中継へ送らない。lane/direction別に鍵を分け、session transcript hashとgeneration/counter/laneをAADに含める。未認証packetでreplay windowを進めず、並行decryptの重複も一度だけ受理。終了後の未完了crypto結果を公開しない。

10B: endpoint鍵の保存/独立fingerprint確認、B設定の失効と再許可。中継上の通常のmachine tokenだけではidentity pinにしない。確認前はdesktop content/inputを送らない。public key交換の暗黙信頼を導入しない。

10C: parent/control、画像、動画（WSS/UDP）、cursor、system audio、mic、clipboard、filesを同じ認証済みsessionへ結び、暗号payloadを中継するだけにする。旧peerとの安全な拒否/明示従来経路を区別。中継にprivate key/共有secret/平文をログ・保存しない。owner/session/epoch変更で全laneを失効する。

10D: agent recipientを人がbrowserから明示許可。CLI/MCP/modelの実行clientを別endpointとして認証し、observe/inputをendpoint内で復号する。中継Aがimageを返す現行APIはE2E grantでは拒否する。modelへ渡す操作はtrusted endpoint clientの責務とし、relayのモデル実行を勝手にtrusted endpoint扱いしない。

10E: 多viewerは個別recipient/key/replay/permission。共通encoderの圧縮出力をrecipientごとに暗号化し、他viewerの鍵は渡さない。protected owner/logon/epochとsignin agentの鍵は別scope。service workerで一般NodeをSYSTEMとして起こさない。

受け入れは全laneで中継wireに既知plaintext/秘密が含まれない、pin不一致/改竄/replay/role変更/世代変更/再接続/未許可agent/停止中のqueueを拒否する生成検証。browserとNodeの実WebCrypto相互運用も確認。全lane実経路が通るまではtask10を完了扱いしない。

一次資料: W3C Web Cryptography API https://www.w3.org/TR/webcrypto/ 、RFC5869 https://datatracker.ietf.org/doc/html/rfc5869 、Node WebCrypto公式API。第三者実装はコピーしない。独立暗号レビューと範囲ごとの小さいPRを必須とする。
