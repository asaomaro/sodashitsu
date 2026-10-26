# 第2段階: desktop file UI

B local-only設定でfileRootを明示承認する。clipboard/inputの許可を流用しない。親共有に紐付く専用双方向WS/ticketをcapability/protocol opt-in後だけ発行し、通常画面・heartbeat・Bの現在設定・viewer grantを検査。server-only files optionをhelperへ渡さず、旧peerへ未知fieldを送らない。

既存FileTransferを再利用し、root内相対path、通常ファイル/親実体検査、64KiB chunk/100MiB/40server entries、SHA-256全体再検査、linkによるno-overwrite公開を使う。statusを後方互換で追加して同一share内のpause/resumeを実装。接続をまたぐresume、Explorerからの直接D&D、フォルダ転送は未対応とUI/docsで通知する。

取消IDは受付時点でsticky失効。root確認await後と最終lstat/fd.stat await後・OS link呼出し直前の同期fenceを使う。内部abort/cleanupはユーザーの読書き権限と分離し、grant=false/closeはepoch/deadを即更新。60秒でexpired metadata/handles/temporaryを片付ける。

browserは8jobs/100history/100MiB bounded。通常要求1件＋control専用wire slotを持ち、queueは通常16/control18件の有限枠。control満杯・送信不能・応答timeoutは専用laneを閉じB grant/worker失効を保証。UIのkeepaliveは逐次・重複intervalなし。解除はabort群より先に送る。一覧結果にはfolder/世代を結び付け、現在の入力欄から別ファイルへすり替わらない。公開commitが始まった後は取消ボタンを出さず、保存結果が不明なら自動再送しない。

検証は生成ファイルとprivate TEMP folderのみ。ユーザーのclipboard/input/captureや既存ファイルには触れない。実ファイルbackendのhash中・最後のfd.stat中でabortを注入し、公開されないことを確認。browser D&D/保存bytes/download/同名拒否/pause/resume/5paused keepalive/revokeの操作結果をDOM・browser framesで観測する。

第1段階はPR #213/main b69eabf3にmerge済み。Aはdirty rootを3way/hash確認で保持しbuild/typecheck/関連89tests/smoke後handoff、7panes保持。Bはb69eabf3/clean/build後2026-10-26T04:39:14.786Z handoff completeをread-onlyログ確認。
