# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/server/src/persist/PrefsStore.ts:105 onChange の例外で保存済みの set が失敗に見える / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/persist/PrefsStore.ts:93 端末ごとの項目も passthrough で保存されうる / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/serveShutdown.ts:63 server.stop でもログが「soda session stop」と言う / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [must][conv:-] packages/web/src/actions/PrefsSync.ts:95-99 自分の set の往復中に他の changed を当てると、自分の echo を捨てて手元が古い値のまま残る / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/web/src/actions/PrefsSync.ts:116 接続中に失敗した set が pending に戻り、再接続で新しい値を古い値で上書きする / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/web/src/actions/PrefsSync.ts:55-57 rev 0 の移行でサーバの結果（他が先に保存した鍵）を反映しない / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/web/src/store/prefsApply.ts:34-79 applyPrefsToStores にテストが無い / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/server/src/auth/LocalLogin.ts:12,67-74 同じマシンの判定は手元の中継（ssh -L・リバースプロキシ・ポート転送）の後ろでは効かないのに、コメントと D2 が「別のマシンからは通らない」と言い過ぎ / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/http/HttpServer.ts:165,178 local-login の失敗が /api/login と同じ回数制限に数わるので、同じマシンの他の利用者が締め出せる（/api/login と同じ露出） / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/auth/LocalLogin.ts:67-74 --host 127.0.0.2 だと送り元が 127.0.0.1 になり正しい手元の接続を断る / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/server/src/launch/findOrStart.ts:135 同時の初回起動で負けた側が serve.out を読んで捨て、勝った側の token の行も消える / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/server/src/launch/findOrStart.ts:146 時間切れの分岐で serve.out を空にせず token が残り、tail で token を出す / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/server/src/launch/findOrStart.ts:233-243 local-login の 401/403 を 50ms ごとに繰り返し回数制限に掛かる（design は読み直して 1 回だけやり直す） / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/server/src/launch/spawnDetached.ts:114 cmd.exe のメタ文字（& | < > ^ ( )）を引用しない / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/launch/spawnDetached.ts:147 WMI 経路の >> は O_APPEND でなく truncate 後の書き込み位置 / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:276-278 読むと空にするの間の出力が消える / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/launch/spawnDetached.ts:151-152 psQuote が U+2018〜201B を扱わない / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:133 最後の試行で「使用中」なら持ち主へ繋がずに失敗 / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/protocol/src/errors.ts:65 新しいエラーコード server_busy・server_stop_unsupported が design/decisions に無い / 対応: 修正済（errors.ts のコメント・decisions D8）
- [should][conv:-] packages/protocol/src/messages.ts:485-515 SharedPrefs の各項目が z.unknown で型の情報が無い（design は web の Prefs を使うと書いた） / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/protocol/src/messages.ts:521 DEVICE_LOCAL_PREF_KEYS を境界で強制していない（PrefsStore の指摘と同じ） / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts:1091 remove_worktree が部分一致で対象を選び、サーバは完全一致でしか閉じない / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts:233 open_worktree が linked worktree でも一覧を開く（herdr は止めて案内する） / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/web/src/components/ConfirmDialog.vue:115 closeOnCancel が --force の確認・失敗の後に引き継がれない / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/client-core/src/keys/bindings.test.ts:62 コメントの件数（12→17）と stop_server の「herdr と同じく」が古い・不正確 / 対応: 修正済（c8d1378・f7c91b3。ラウンド1）
- [nit][conv:-] packages/client-core/src/keys/bindings.ts:442 swap_with_focused のキーの意味が decisions に無い / 対応: 修正済（decisions D7 の 2.）
- [should][conv:regression-negative-control!] packages/server/src/launch/findOrStart.test.ts:166-170 同時起動の token の回帰テストが直す前のコードでも通る（負の確認が効いていない） / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [should][conv:-] packages/server/src/launch/findOrStart.ts:165-168 待ちの途中で Ctrl-C すると token が serve.out に残り、以後どの soda も読まない・次の起動で古い行が混ざる / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:136-140 同時起動で token が両方の端末に出うる / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:130,212-274 準備完了の条件が「起動の行が書かれた」ことを含まず暗黙の順序に頼る / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [nit][conv:-] packages/server/src/launch/spawnDetached.ts:152,154 特別な文字だけの引数の末尾の \ ・/v:off が無い / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [must][conv:-] packages/web/src/actions/PrefsSync.ts:72-78 移行の set の返事待ちの間の変更が送られない / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [must][conv:-] packages/web/src/actions/PrefsSync.ts:72-73,86-88 移行の set が失敗すると takePending で取り出した変更を捨てる / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [should][conv:-] packages/web/src/actions/PrefsSync.ts:86-88 移行の set が invalid_params（上限超え）だと黙って synced=false のまま以後同期しない / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [should][conv:-] packages/web/src/actions/PrefsSync.ts:155-160 invalid_params で断られた値が次の他者の changed で戻り、知らせの文言と食い違う / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [should][conv:regression-negative-control!] packages/web/src/actions/PrefsSync.test.ts:231-249 失敗の後の成功の順序の回帰テストが検査を外しても通る / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）
- [should][conv:regression-negative-control] packages/web/src/actions/PrefsSync.test.ts:82-318 変異の網羅で、テストの無い競合の守りが 5 つ / 対応: 修正済（99188a8・4af8b72。ラウンド2。変異の網羅 PrefsSync 25・launch 8 がすべて新しいテストで落ちることを確認）

## ラウンド 1（2026-09-27）
- [should][conv:-] packages/server/src/launch/findOrStart.ts:225-247 更新前の soda serve（local-auth.json を書かない）が動いていると 15 秒待って誤った案内を出す・古い版の検出が効かない / 対応: 修正済（9508f77・1dea1c6。負の確認済み）
- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts:1119-1123 stop_server がマシンを選んでいると遠くのサーバを止め、確認の文言がどれを止めるか言わない / 対応: 修正済（9508f77・1dea1c6。負の確認済み）
- [should][conv:-] packages/server/src/auth/AuthService.ts:150-162 soda の起動ごとにセッションが増え、期限切れも消えず auth.json が増え続ける / 対応: 修正済（9508f77・1dea1c6。負の確認済み）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:157-162 時間切れの分岐で起動していない側も serve.out を空にし token を出しうる / 対応: 修正済（9508f77・1dea1c6。負の確認済み）
- [nit][conv:-] packages/web/src/actions/PrefsSync.ts:167-174 上限超えの扱いが design の表（知らせて捨てる）と違い decisions に無い / 対応: 修正済（decisions D10）
- [nit][conv:-] packages/server/src/persist/PrefsStore.ts:99-104 D3 の「最初に繋いだブラウザの値」と実装（項目ごとに後勝ち）が違う / 対応: 修正済（decisions D10）
- [nit][conv:-] packages/server/src/cliArgs.ts:52-53 端末の無い soda（スクリプト・ssh host soda）が裏でサーバを起動する / 対応: 修正済（9508f77・1dea1c6。負の確認済み）

## ラウンド 2（2026-09-27）
- [should][conv:regression-negative-control!] .aidev/works/20260927-cli-mode/02-server/test-result.md:10-13 差し戻しの修正の負の確認の生の出力が記録に無い / 対応: 修正済（test-result.md に生の出力を貼った）
- [nit][conv:-] packages/server/src/launch/findOrStart.ts:233-245 新しい版で local-auth.json の書き込みに失敗した場合も「古い版」と案内し、起動した側の token を見せない / 対応: 許容（書き込みの失敗はサーバ側で warn。まれな場合で、案内の文言に「local-auth.json が無い」ことを含めれば足りる——06 の docs に書く）
- [nit][conv:-] packages/server/src/launch/placeholderEntry.ts:17-23 /ws の確かめに失敗した経路でログアウトしない / 対応: 許容（仮の入口は 03 の T6 で端末版に置き換わる）
- [nit][conv:-] packages/server/src/launch/placeholderEntry.ts:62 端末版（03）が /api/logout を送る作業がタスクに無い / 対応: 修正済（03 の tasks.md の T6 に追加）
- [nit][conv:-] packages/server/src/launch/tuiCommand.ts:25-32 端末の無い素の soda の終了コードが 0→2 に変わったことが docs の対象に無い / 対応: 修正済（06 の tasks に申し送り〔decisions D11〕）
