# 設計

- state-dir内のassistant-package.jsonにcurrent/previousを保存。既存のenabled保存とは独立。ローカルenv明示コマンドが優先。
- installはZIPを独立一時領域へ有限量だけ展開し、配布先/UUIDへ通常ファイルをコピーする。CLIのロック下で最後に参照ファイルをatomic renameする。前版と実行中ファイルは上書きしない。
- 更新/rollbackを同じサーバの既存fs.watchで検知。enabled時だけ配布設定を読み、commandが変わる場合にstopを待ってstartする。無効時は配布先のプローブや起動を行わない。
- ZIP: 圧縮512MiB、展開1GiB、10,000項目。fflate同期streamでワーカーなし。パス逸脱・Windows特殊名・case重複を拒否。リンクとして展開しない。フォルダーコピーはsymlinkと特殊ファイルを拒否し、fdのmetadataと実読取量を確認。
- receiptのSHA-256は内容の識別用で、配布元の署名ではない。インストールはローカル利用者の明示指定。自動DL/署名/ドライバー導入は別範囲。
- 起動中アプリと同じElectron appId/productNameによりuserDataを維持。新しい常駐プロセスは追加しない。
