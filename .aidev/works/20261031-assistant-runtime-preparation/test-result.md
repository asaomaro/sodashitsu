# 検証

- 生成ZIP/stream download/private HTTPS/immutable cache: 3 files / 44 tests pass。
- private HTTPSは既存のtest CAを使いTLS検証を維持。headers未到着とbody途中の取消が、所有client socketのclose後にのみsettleすることを確認。
- Cacheはprivate temp内の生成データのみ。GUI/実runtimeは実行しない。未使用時root resolverは呼ばず、取消中は実処理退役まで次のprepareを拒否、公開前のpermission失効はstagingを回収する。
- 負例: private copyでunknown cache全件検査と公開後のidentity照合だけを除去。対象2件は正常版2pass→除去版2件とも「promise resolved instead of rejecting」で失敗。元sourceは変更しない。raw logs /tmp/soda-cache-negative-{positive,failure}.log。
- official Linux x64 / macOS arm64 / Windows x64 ZIPは固定bytes/SHAと全entryのCRC・内部linksを検証してprivate tempへ展開するデータ検証のみ。バイナリを実行せず、production cache/OS policy/service等を変更しない。
- 初回typecheckはcli/dist未buildでE2Eの既存dist参照が不足。全体build後のtypecheckを正式結果とする。

全体build/typecheck pass。全体試験915 files / 13213 tests pass (361.73s, exit 0)。Web happy-domの既存fetch/終了時stderrはあるが失敗・未処理エラー件数はない。

公式3OSのrepository compiled実装による展開、Cache.prepare初回と検証済み再利用は全てpass（実行なし）。Linux72files、macOS274files/14内部links、Windows73files。

raw logs: /tmp/soda-assistant-runtime-{build,typecheck-final,all,focused-final}.log、/tmp/soda-official-repository-{linux,darwin,win32}.log、/tmp/soda-official-cache-{linux,darwin,win32}.log。hosted CIはPRで確認する。

## 最終cross delta

Cacheは13件（関連総数45件）になった。再利用の最後の非同期authority検査でreadyを実置換する回帰を追加しpass。private copyから再利用時のconfirmIdentityだけを除去すると、対象1件が「promise resolved instead of rejecting」で失敗。raw /tmp/soda-cache-return-{positive,negative}.log。初回公開もengine identityを検査する。deltaのserver build pass。

最終delta後に全体テストとtypecheckを再実行し、正式結果と最終hosted CIはPR本文およびmerge receiptへ記録する。先の13213件はdelta前の正式passであり、最終headの件数を意味しない。
