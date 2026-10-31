# Linux Portalの一時仮想画面

公開PortalのAvailableSourceTypes VIRTUAL(bit4)を利用する。local allowVirtualDisplayと明示features/virtualDisplayの積でのみ開始し、SelectSources types=4/multiple=false、単一source_type4/serial v6を要求する。物理sourceや別APIへfallbackしない。OSがstream size/logical sizeを提供できない場合はunsupportedで閉じる限定対応。OSの実生成・許可・DPI確認は別途必要。

物理monitor一覧/ID/restoreと混在させない。virtualではpersist0、restore token取出し/公開なし。従来のSession Close・pipeline NULL・FD close・ログインsource失効処理を使い、許可されたvirtual sessionの終了で解放する。動画/UDP/追加codec/自動転送解像度/音声/microphone/file/clipboardは各既存の明示許可条件を維持する。sharedVirtualはまだ開かない。

macOSは公開Portalを持たないためこのAPIを許可しない。Windows専用unlockLease常駐起動もnativeでは生成しない（独立レビュー指摘を修正）。OSが未対応の場合は通常画面やWindowsサービスへ代替しない。

公式根拠: [XDG ScreenCast API](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)のAvailableSourceTypes、Start streamsとSession lifecycle。Windows用driver/serviceとは別のOS機構。

permission/source変更はtaskcheck対象、差分全体crossと修正再点検を別コンテキストで行う。
