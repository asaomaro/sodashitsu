# 公開URLでも同じPCのWebプレビューhelperを自動起動

利用者は、同一LAN内のWindows BをWSL AのSodashitsuへ委譲し、AのWindows側ブラウザから公開HTTPS URLで操作している。デスクトップ共有の許可originを維持するため、localhost URLへの切替は解決にならない。従来のlocalSettings guardは公開URL経由ではfalseになる。

直接localhost接続の既存起動は維持する。公開URL経由では、認証済みcontroller接続が接続先machineのpreview.viewersから対象viewerのparent originを取得し、操作元PCに固定HTMLだけの短命loopback listenerを作る。APIはrandom localhost originとURL、probe idだけを返し、秘密を返さない。browserがiframeを実際にロードすると、そのHTMLがparent originへのpostMessageで秘密を渡す。ブラウザはsource・origin・id・秘密の型を検査して、同controller接続でproof付き起動を要求する。

- 秘密32bytes、30秒・一回限り。owner/controller接続、machine、viewer、probe idへ束縛。
- 127.0.0.1 bindに加えてrandom *.localhost:portのHost完全一致が必須。任意portのpreview upstream経由ではHostが127.0.0.1に置換され、秘密を読めない。
- HTMLは固定postMessageのみ。CSPはnonce scriptと正確なframe-ancestors、no-store/no-referrer。コマンド・任意URL・app originの変更は受け付けない。
- proof消費とhelper起動予約の間にawaitを置かず、stopが予約を取り消せるようにする。
- 古い非同期probe処理はentry同一性でcleanupし、stop→再起動後の新probeを閉じない。
- browser timeout25秒。異なるPC・到達不可・LNA拒否・旧serverでは従来のbrowser-PC CLI案内へ戻る。タブ終了・接続終了・サーバ終了でlistenerと途中の接続を回収する。
- 同時probeは全体32、owner2。接続待ちも上限に含める。既存helperの全体32、owner8は維持。

検証は実TLS HTTPS親画面と実HTTP/WS逆proxyを持つ一時環境で行う。公開hostnameはtestブラウザだけでloopbackへ解決する。自己署名証明書の許容とLNA grantはtestcontext限定。Windows/WSLの利用者ブラウザと実Cloudflare経路は別途実機確認が必要。
