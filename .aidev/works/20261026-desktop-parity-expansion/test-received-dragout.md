# 受信済みファイルの取り出し（実験）

通常/file checkpoint/folder ZIPの検証済みBlobをdefault offで窓内保持する。run開始時のopaque ticketを全await前に固定し、許可取消・optout・再許可・別instance・clear・unmountをまたぐ遅延結果を拒否。URL生成後にもticket/capacityを再検査。8件/合計100MiB、performance.nowによる5分期限と次回更新/操作時破棄、gesture時の再検査、private Blob URLのみの単一DownloadURL、明示再保存を追加。通常download用URLは既存のまま維持。実OS dropやExplorer画面内からの直接dragは未検証/未実装で、task13全体を完了にしない。

独立設計/taskcheck review_transferのmust（取消後の遅延再追加）は全await前のinstance固有ticketで修正し再点検通過。should（Date.now逆行で延長）はperformance.nowと逆行回帰へ変更し再点検通過。独立全体review_pointerに追加must/shouldなし。fact-check skillで一次資料を独立照合し、特定Shell/native hostを必須とする断定を設計候補へ弱めた。Blob URLの各OS保存互換は未確認として、UI/docsとも実験・未検証を維持。親も原文3箇所を開き直した。

source full build/typecheck、関連単体13件（元のDesktopFiles3件+新10件）、新browser6件を通過。file/checkpoint/folder checkpoint ZIP/volatile ZIP/暗号化/保持URL割当失敗時の通常受信の6経路で、DataTransfer生成値・private URLと非credential・実download再保存bytes一致・許可取消後のURL revokeをブラウザ側から確認。実OS保存の成功ではない。rootも新browser6件を1processで通過。

初回heldSHA単体fixtureはread_startのsizeをbytesと誤記してSHAまで届かなかったため、正しいbytesとSHA到達assertへ修正。initial browserは6件中allocation-failure1通過、他5件は試験のfetch(blobURL)が既存CSP connect-srcで拒否された。製品の通信許可を拡張せず、実再保存のdownload内容とrevoke観測へ直して最終6件通過。新componentは既存file panelのsummary操作を変更しないsectionとして追加した。

独立check WTはmain7ef6a1c2から全差分/新fileを適用しfresh build/smoke PASS。負例4件はunitが直接読むTSのticket identity・容量上限・期限・URL生成後epoch guardだけを個別に外し、期待したassert失敗を確認。finallyで毎回exact bytesへ復元・照合。browser用compiled artifactは変更せず、unit負例なので追加buildを要しない。以下は生出力。全体結果・既存転送browser・配備は後記。

## ticket negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-received-dragout-check

 ❯ |@sodashitsu/web| src/components/DesktopFiles.test.ts (5 tests | 1 failed | 4 skipped) 67ms
   × does not retain a delayed verified download across optout revocation 64ms

 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  04:46:37
   Duration  2.60s (transform 64%, import 18%, environment 15%, tests 3%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/DesktopFiles.test.ts > does not retain a delayed verified download across optout revocation
AssertionError: expected [ DOMWrapper{ …(3) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/components/DesktopFiles.test.ts:31:57
     29|     await wrapper.get('input[type="checkbox"]').setValue(true);
     30|     resolve(new Uint8Array(32).buffer);await flushPromises();
     31|     expect(wrapper.findAll("[data-received-download]")).toHaveLength(0…
       |                                                         ^
     32|     expect(create).toHaveBeenCalledTimes(mode==="grant"?0:1);expect(re…
     33|     expect(click).toHaveBeenCalledTimes(mode==="grant"?0:1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## capacity negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-received-dragout-check

 ❯ |@sodashitsu/web| src/desktop/receivedDownloads.test.ts (6 tests | 1 failed | 5 skipped) 33ms
   × bounds total retained bytes and count without evicting another export 29ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  04:46:41
   Duration  798ms (environment 80%, transform 11%, tests 5%, import 2%, worker 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/receivedDownloads.test.ts > bounds total retained bytes and count without evicting another export
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/desktop/receivedDownloads.test.ts:13:62
     11|   const f=fixture(),ticket=f.shelf.begin();
     12|   f.shelf.add(ticket,"large","large.bin",bytes(RECEIVED_DOWNLOAD_BYTES…
     13|   expect(()=>f.shelf.add(ticket,"over","over.bin",bytes(1))).toThrow("…
       |                                                              ^
     14|   expect(f.create).toHaveBeenCalledOnce();f.shelf.clear();
     15|   for(let i=0;i<8;i++)f.shelf.add(f.shelf.begin(),String(i),"empty",by…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## expiry negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-received-dragout-check

 ❯ |@sodashitsu/web| src/desktop/receivedDownloads.test.ts (6 tests | 1 failed | 5 skipped) 13ms
   × checks expiry at the gesture and renews only a live export 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  04:46:43
   Duration  676ms (environment 79%, transform 11%, worker 4%, import 3%, tests 3%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/receivedDownloads.test.ts > checks expiry at the gesture and renews only a live export
AssertionError: expected { key: 'a', name: 'a', …(3) } to be undefined

- Expected:
undefined

+ Received:
{
  "bytes": 1,
  "expires": 900999,
  "key": "a",
  "name": "a",
  "url": "blob:generated-1",
}

 ❯ src/desktop/receivedDownloads.test.ts:31:62
     29|   const f=fixture();f.shelf.add(f.shelf.begin(),"a","a",bytes(1));
     30|   f.advance(RECEIVED_DOWNLOAD_TTL-1);expect(f.shelf.take("a")).toBeDef…
     31|   f.advance(RECEIVED_DOWNLOAD_TTL);expect(f.shelf.take("a")).toBeUndef…
       |                                                              ^
     32|   expect(f.revoke).toHaveBeenCalledOnce();expect(f.changed.mock.calls.…
     33| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## allocation-epoch negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-received-dragout-check

 ❯ |@sodashitsu/web| src/desktop/receivedDownloads.test.ts (6 tests | 1 failed | 5 skipped) 15ms
   × keeps an existing export on allocation failure and revokes an allocation invalidated in flight 13ms

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  04:46:45
   Duration  642ms (environment 77%, transform 14%, import 4%, tests 4%, worker 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/receivedDownloads.test.ts > keeps an existing export on allocation failure and revokes an allocation invalidated in flight
AssertionError: expected { key: 'b', name: 'b', …(3) } to be undefined

- Expected:
undefined

+ Received:
{
  "bytes": 1,
  "expires": 301000,
  "key": "b",
  "name": "b",
  "url": "blob:late",
}

 ❯ src/desktop/receivedDownloads.test.ts:49:57
     47|   expect(f.shelf.take("a")?.url).toBe(first!.url);expect(f.revoke).not…
     48|   f.create.mockImplementationOnce(()=>{f.shelf.setActive(false);return…
     49|   expect(f.shelf.add(f.shelf.begin(),"b","b",bytes(1))).toBeUndefined(…
       |                                                         ^
     50|   expect(f.revoke.mock.calls.map(([url])=>url)).toEqual([first!.url,"b…
     51|   expect(f.changed.mock.calls.at(-1)![0]).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```


## 最終検証

source全体11994件/803files、root全体12056件/811filesは、それぞれ1回の全体runですべて通過。両方fresh build/typecheck、新browser6件もそれぞれ1processですべて通過。既存files/file checkpoints/folder checkpoints/folders browser27件が一つのprocessで通過し、source browser unique33件を検証。上記CSP観測の初回失敗と最終成功は区別する。独立check build/smoke PASS、負例4件の期待assert失敗とexact bytes復元、設計/taskcheck・全体review/追加差分再点検、外部主張fact-checkを通過。

今回server/protocol/Windows helperは無変更で、新protocol featureを交渉しないbrowser内機能。実OSのdrag/drop保存成功は未検証。B/OSのファイル/clipboard/音声設定やサービスを自動で変更していない。配備receiptは既存変更を保持するroot作業ツリーに追記する。
