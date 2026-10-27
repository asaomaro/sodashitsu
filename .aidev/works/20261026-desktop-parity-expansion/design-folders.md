# 13B フォルダ送信とZIP受信

送信は新規フォルダに階層/空dirを作り、既存FileTransferで各fileを検証・非上書き公開する。フォルダ全体のatomic置換はしない。同名既存フォルダには混ぜず、利用者が保存名を替える。取消/失敗/失効で未完成fileと空の作成dirを回収し、転送完了済みfileや利用者が追加したfileは削除しない。フォルダはこの窓内のpause/resumeのみで、再読込後のcheckpoint再開は今段階に含めない。

受信は明示選択したdirをB内のprivate tempへZIP（store方式）にし、既存bulk laneで取得。snapshot中のdir/file変更、symlink/非通常file/外部pathは拒否。ZIPとsourceは全体100MiB以内、1000entries、深さ32、manifest48KiB、workerごと最大2jobs・idle60秒。処理/各await後にgrant/epoch/rootとgroup取消を再検査。公開直前の取消を同期でfenceへ反映する。

pickerはshowDirectoryPicker、D&DはwebkitEntryを列挙しempty dirも送る。送信前に同じportable name/path/親dir/重複/上限を両端で検査。ZIP受信はブラウザの保存先へ渡し、Bにはarchiveを公開しない。通常/複数viewer/暗号化で新viewer protocol+A/B capabilityが揃った場合だけ有効。旧peer/管理者共有では無効。taskcheckと独立全体review必須。

参考: RustDeskのfile列挙とempty dir列挙を分ける構造（コード複製なし） https://github.com/rustdesk/rustdesk/blob/master/libs/base/src/fs.rs 。ZIPはfflateのstreaming ZipPassThrough API https://github.com/101arrowz/fflate#usage を利用し、ZIP header/CRCを独自実装しない。実desktop/clipboard/音声/driverを操作せず、生成フォルダと一時領域だけで試験する。
