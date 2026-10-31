# 検証

修正前main aff7b142の共有接続はsecureDesktop/lockScreenCover readyを無条件拒否。sr-pc(ロック中)実診断で単独readyを確認、sharedではready前の即終了を再現。private copyでpoolのみ修正前へ戻す負例は新2例とも本来のready assertion失敗、元bytesを変更せず現行2pass。生成helperのみで実Provider許可OFF/ONとphysical marker非送信、入力所有者、cover入力/画素拒否、状態切替の世代終了を検証。全体・CI・両端main反映は後続で記録。

## 負例と復元（生出力）

```text
before 1 
 RUN  v5.0.1 /workspaces/sodashitsu-shared-lockscreen

 ❯ ../../tmp/soda-lock-negative-dzpo69qm/pool.test.ts (81 tests | 2 failed | 79 skipped) 10ms
   × shares the locally permitted Windows lock source with one input owner: cover=true 8ms
   × shares the locally permitted Windows lock source with one input owner: cover=false 1ms

 Test Files  1 failed (1)
      Tests  2 failed | 79 skipped (81)
   Start at  18:20:41
   Duration  1.03s (transform 79%, import 20%, tests 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ../../tmp/soda-lock-negative-dzpo69qm/pool.test.ts > shares the locally permitted Windows lock source with one input owner: cover=true
 FAIL  ../../tmp/soda-lock-negative-dzpo69qm/pool.test.ts > shares the locally permitted Windows lock source with one input owner: cover=false
AssertionError: expected { type: 'configure', …(3) } to not have property "allowSharedUnlock"

- Expected:
undefined

+ Received:
true

 ❯ ../../tmp/soda-lock-negative-dzpo69qm/pool.test.ts:428:35
    426|  const f=fixture(),a=f.join("locked",unlockConfiguration),b=f.join("lo…
    427|  try{
    428|   expect(f.child.commands[0]).not.toHaveProperty("allowSharedUnlock");
       |                                   ^
    429|   f.child.send({...lockedReady,...(cover?{lockScreenCover:true}:{})});…
    430|   expect(a.session.requestControl!(true)).toBe(true);a.send({type:"con…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


restored 0 
 RUN  v5.0.1 /workspaces/sodashitsu-shared-lockscreen


 Test Files  1 passed (1)
      Tests  2 passed | 79 skipped (81)
   Start at  18:20:42
   Duration  1.04s (transform 77%, import 21%, tests 2%)


```
