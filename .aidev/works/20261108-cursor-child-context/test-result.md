# Cursor終了子の保存済み文脈量の検証

12464121(契約/formatter)→2258713f(provider)→f32c86e3(close後P2修正)→c164863a(TUI test-only)。実モデル/利用者会話変更/実Windows操作なし。既存利用者hook更新なし。

70関連unit、生成fake Cursorのreal SessionStart/Stop hookIPC＋認証済みWebSocket history_usage公開API1、TUI履歴dialog35testsが成功。CLI名はown fakeを解決することを確認後に起動しており、provider/モデルは起動しない。Source class Cursor子DB、文脈量/上限/率のみでtokens/cost/observedAt無し、active数/親usageに加算しない。

初期225serverbuild0。独立レビューでFD.closeのawait中DBだけ更新すると旧数字を返すP2を指摘、actualdeferredclose+newrootで旧1fail（late-close-negative.log）を再現。f32は閉鎖後にもnamespace/全file ns/WAL/currentをFD無しで照合してfailclosed。最終f32serverbuild0・変更16source/test strict型0・追加TUItest対象型0。compiled production server modulesによる別Node/ownSQLite/Stop/history_usage fixtureも0（compiled-check）。初回usage前/既読後のDB-only新rootを旧entryに転用しない。

負例はoldbase9fail、sealguard除去2fail、old225close境界1fail、protobuf missing-usedをdefault0へ補完1fail。durable scratchの8runtime bytes/SHAをfinallyで完全復元し70pass＋公開API1pass（restoration.json/各rawlog）。decodedrootのpresence/uint32/max0/duplicate/wire/size/hash/view拒否、DB/WAL変更、birth/parent scope/close/late結果破棄を確認。

生成実Chrome DOM2テーマ/390pxで、終了子のhasTranscript=falseでもcontext graph/sourceを表示し消費・費用・観測時刻を捏造しない、unknown sourceのrows/graph無し、currentfallback/control/send0を確認。One Light画像を目視。finallyでownChrome/Vite終了。compiled/単体/APIのtempDB/workerもownのみclose/cleanup、全repo test/buildは流していない。

installed source schemaと生成DBの結合確認であり、実managed childDBの取得実測ではない。現在一覧・子消費/費用・他provider/directの残件はremaining.mdへ保持。独立reviewerがmapping/guard/close後P2解消を読取済み、最終証跡照合待ち。
