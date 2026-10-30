# 設計

- 既存DesktopRichClipboardのread/begin/push/pull/commit/cancel wireをnative helperにも実装。4MiB bundle、text/HTML/RTF 512KiB、PNG 2MiB/4096辺/8百万pixel、chunk16KiBを維持。
- clipboard_controlの世代とOS/source許可、元の単一command期限（最大1500ms）、transaction60秒/idle5秒、cancel/replay、同時1transactionを検査する。読み取ったbytesの公開時にも元ticketとsource clipboard versionを再検査。
- LinuxはPortal Clipboardの同じremote-desktop session/FDでMIMEを扱い、macOSはNSPasteboardItemのstring/png/html/rtfを扱う。multi-itemやfile clipboardは追加しない。
- 書込みはinput ceilingに加え、転送開始からのclipboard version一致を検査。clear/set直前の権限・期限を検査する。無許可時/probe/self-testで実clipboardへアクセスしない。
- Portal API v1のSetSelection/SelectionRead/SelectionWrite/WriteDoneを参照（https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Clipboard.html）。NSPasteboard.PasteboardTypeのpng/html/rtf/stringとdata/setDataを参照（https://developer.apple.com/documentation/appkit/nspasteboard/pasteboardtype）。独自実装し、他アプリのソースをコピーしない。
- helper/parentの対応capを明示交渉。Portal backendが実際に許可した場合のみreadyでrichClipboardを返す。実OS/backendでの動作は生成検証と区別する。

- 公開待ちtransactionは最大32のメタデータで保持する。同じIDの取消と追跡evictionでそのobjectを不可逆失効し、古い取消で別IDを失効しない。各完了時にpayloadを解放する。MacのOS照合→fresh changeCount→最終時計/世代検査、clear後の自分のchangeCountへの限定移行を行う。
