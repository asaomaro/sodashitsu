# 外周透過・コンパクトヘッダー・操舵室ビュー共通化

依頼: 会話窓と異なり枠線の外側に残る領域を除去。操舵室ビューも同じ外観へ揃え、ヘッダーを抑える。

- 前回残ったopaqueなネイティブ背景と8pxのbody余白が原因。背景を透明・余白0・native shadow無しとし、金枠の外側の角を透過する。見出し行30px、アイコン22px、副見出しは非表示。本文の内部スクロールは維持。
- Electron公式のtransparent window制限に従いnative resizable:false。枠の8方向のドラッグを、main側で採ったcursor・開始bounds・現在のdisplay workArea・token・30秒期限で処理する。最小化・非表示・blur・mainframe navigationで失効し、継続時の可視/最小化状態も再検証。最大化はworkAreaへのsetBoundsと保存Rectへの復元で行い、画面撤去後の復元は現在の作業領域へ補正する。
- 操舵室と専用応答popupは同じlocal panel.html shellで包む。shellはassistant-local、remoteはWebContentsView内のpersist:assistant-serverでpreload無し。remoteをlocalWindowsへ登録せず、shellのpanel roleもwindow-action/window-resizeだけ許可する。本文側にnative APIを渡さない。
- remoteは従来の同一接続先navigation/redirect制限を継続。shellとremoteのロード完了を待ち、navigation世代照合後に前面化してremoteへfocus/invalidateする。親の閉鎖時には作成時に保持したremote WebContentsを閉じる。破棄後にview.webContentsの参照が消えるケースも扱う。

一次資料: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles 、https://www.electronjs.org/docs/latest/api/web-contents-view 。同梱Electron45.1.0のAPI型と実ランタイムでも確認。

独立レビュー:
- review_resource_monitor: remote/local権限分離・遷移・ロード順・世代照合・child破棄を点検。remoteのfocus/保持したWebContentsによるcloseも追加再レビュー済み。必須指摘なし。
- review_bubble_resize: 副画面撤去後restoreと、resize gestureのmain側失効を指摘。修正・回帰追加後の再レビューで解消、残る必須指摘なし。
