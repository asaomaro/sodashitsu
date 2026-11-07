# Codex現在状態の読み取り補足

正式な親recordの所属がEOFまで確認できた子だけを、同ユーザーの既存App Server Unix WebSocketへread-only照合する。新CLI/daemon/model/turnを起動しない。既存CodexAudioのJSONL proxy経路は今回まだ変更しない。

## 調査と根拠

- 導入CLI0.166.0/既存daemon0.167.0。生成schemaのThreadStatus/ThreadActiveFlag/ThreadReadParamsを照合。
- [公式Protocol](https://learn.chatgpt.com/docs/app-server#protocol)はstdio=JSONL、Unix socket=HTTPUpgradeによるWebSocketを明記。
- 初期の既存proxyへのJSONL initializeは応答0でtimeoutした。根拠確認前のJSONL直結probeも1回行ってしまい、応答無しでcloseされた。read/turn/resumeは送信せず終了。rootへ報告し追加送信を止め、daemon/PID/public snapshotの正常応答をread-only確認した。これらを正常取得の証拠にはしない。
- 公式framing確認後、隔離HOME・認証/設定コピー無し・専用Unix listenerを使ったWebSocket initialize/loaded/readが成功。任意の生成UUIDはmissingとして拒否された。production daemonのPIDmetadata不変、fixture process/socketを終了。
- root承認後の正式WebSocket1connectionで、既存readerの私有instanceがEOFまで確認した正式startedproof3子を照合。before/afterの公開scope、所有socket/daemonの一致、親・3子のloaded/active・空activeFlagsを確認。本文/ID/pathは保存せず readonly-status-receipt.jsonへ非内容metadataだけ保存。モデルターン0。

## 固定差分の検証

- 専用worktree/node24/専用依存。base975ff22bと、root指定5f99d378のcherry-pick f5a4ccde。catchupの失敗後pending=false・Service拒否guardを保持。
- 関連4files76tests pass（tests.log）。scope/EOF/append/replace/forget/close、API失敗時所属保持、activeflags/notLoaded/idle、readonlymethods、loaded/child/frame上限、binary/malformed拒否、PIDgeneration/permissions/abort/quota/timeoutを検査。
- 旧Readerだけへ戻して、新EOF状態補足の回帰がfailすることを確認（negative.log）、固定Readerへbyteexact復元（restoration.json）。
- 新WS helperのtextframe拒否を最後に追加したため、その後のbuild/tests/typecheckを最終結果とした。追加fixtureを最終型検査の開始後に入れていない。
- server project build exit0（build.log）、server typecheckはテストfixtureを含む（typecheck.log）。全体CIはrootが統合後に1回だけ実施する。
- 正常な自作UnixWS fixtureの照合は約39ms（fixture-timing.json）。productionの通常latency保証ではない。製品は全体1500ms/request1000ms、最大2WS・同親重複拒否なので20秒poll blockingを作らない。

同サイズ変更の回帰で同一metadata tickを観測したためns精度のBigIntStats比較へ変更し、fixtureはutimesで変更を明示した。任意の同サイズ・同metadataを保つin-place破壊を全履歴再hash無しで検知する保証はしない。providerのappend/rotateに対するEOF/terminal/世代境界と区別する。

Windows等の現在状態transportは未対応でunknownを維持する。U8/sr-pc/音声/UAC/利用者pane操作は行わない。製品public snapshotの状態はroot統合・反映後に確認する。

root承認後、固定2bcd41abのcompiled Reader/helperそのものをprivate Nodeプロセスで1connection限定のread-only実照合した。親EOF113calls（4MiB/call）後、所属3・working3、public scope不変、正式started証明あり、状態API65.08ms/総8561.32ms。モデルターン0、自WSとReaderをcloseしプロセス正常終了。非内容receiptはfinal-helper-actual.json。製品公開snapshotは統合反映後に確認する。
