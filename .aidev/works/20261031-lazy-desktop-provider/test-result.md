# 検証

build/typecheck成功。対象38→40件、実生成helper relayとコンパイル済みcompose import graphも成功。最新deltaのLazy12件成功。全体試験と3OS CIは実行中。

別のprivate worktreeで修正箇所を戻すと12成功→6失敗/6成功となり、切断取消、暗号rootのepoch、永続dispose、失敗時drain、失効失敗のbind拒否を検出。元ソースとバイト一致で復元。

負例の生出力（抜粋）:

```
⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > cancels a held first load on clientGone
 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > cancels a held first load on release
AssertionError: promise resolved "{ started: true }" instead of rejecting

- Expected
+ Received

- Error {
-   "message": "rejected promise",
+ {
+   "started": true,
  }

 ❯ src/desktop/LazyDesktopProvider.test.ts:25:160


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > keeps the cold encrypted root epoch stable through endpoint-only initialization
RpcError: Desktop sharing is disabled or changing
 ❯ LazyDesktopProvider.unavailable src/desktop/LazyDesktopProvider.ts:35:31
     33|   if(this.provider)this.provider.configure(config);else if(this.saved)…
     34|  }
     35|  private unavailable(){return new RpcError('unauthorized','Desktop sha…
       |                               ^
     36|  private usable(){return !!this.config&&!this.suspended&&!this.holds&&…
     37|  private binding(){return createHash('sha256').update(JSON.stringify({…
 ❯ LazyDesktopProvider.starting src/desktop/LazyDesktopProvider.ts:59:131
 ❯ src/desktop/LazyDesktopProvider.test.ts:32:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/8]⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > cold dispose invalidates persisted generations before any subsequent use
AssertionError: expected '919b9386-37e2-44b0-a2fe-131810868fa5' not to be '919b9386-37e2-44b0-a2fe-131810868fa5' // Object.is equality
 ❯ src/desktop/LazyDesktopProvider.test.ts:47:108
     45|  const old=new DesktopTransferStore({directory,binding:scope}),load=vi…
     46|  try{const before=await old.generation();provider.enableSavedTransfers…
     47|   const current=new DesktopTransferStore({directory,binding:scope});ex…
       |                                                                                                            ^
     48|  }finally{await provider.suspendSavedTransfers();provider.dispose(true…
     49| },process.platform==='win32'?120000:10000);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > drains both cold registries after a policy failure, including a held retirement
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/LazyDesktopProvider.test.ts:59:65


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/8]⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > drains both cold registries after a policy failure, including a held retirement
Error: Promise returned by `expect(actual).rejects.toThrow()` was not awaited. This assertion is asynchronous and must be awaited; otherwise, it is not guaranteed to complete before the test finishes:

await expect(actual).rejects.toThrow()

 ❯ src/desktop/LazyDesktopProvider.test.ts:58:186


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/8]⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > drains both cold registries after a policy failure, including a held retirement
Error: Promise returned by `expect(actual).rejects.toThrow()` was not awaited. This assertion is asynchronous and must be awaited; otherwise, it is not guaranteed to complete before the test finishes:

await expect(actual).rejects.toThrow()

 ❯ src/desktop/LazyDesktopProvider.test.ts:57:160


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/8]⎯

 FAIL  |@sodashitsu/server| src/desktop/LazyDesktopProvider.test.ts > keeps a failed invalidation blocked instead of authorizing a later successful bind
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/desktop/LazyDesktopProvider.test.ts:67:113


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/8]⎯


 Test Files  1 failed (1)
      Tests  6 failed | 6 passed (12)
   Start at  16:52:44
   Duration  1.46s (transform 53%, tests 31%, import 16%)


```
