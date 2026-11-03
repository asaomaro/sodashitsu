# Negative control

通知のgeometry実装だけをHEADに戻し、新しいテストを実行。修正前は要求高さ460に対し188を返して失敗。修正を戻しバイト一致を確認。

```text

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant

 ❯ |@sodashitsu/desktop-assistant| src/geometry.test.ts (8 tests | 1 failed) 15ms
   × places compact notices to the left and below chat without leaving negative or tiny work areas 5ms

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  14:22:34
   Duration  997ms (transform 75%, import 22%, tests 2%)

undefined
/workspaces/sodashitsu-main-live-assistant-agents/packages/desktop-assistant:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/geometry.test.ts

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/geometry.test.ts > places compact notices to the left and below chat without leaving negative or tiny work areas
AssertionError: expected 188 to be 460 // Object.is equality

- Expected
+ Received

- 460
+ 188

 ❯ src/geometry.test.ts:70:78
     68|  const tiny=noticeBounds(prefs,[{id:"secondary",workArea:{x:-240,y:-10…
     69|  expect(tiny).toEqual({x:-240,y:-96,width:240,height:176});
     70|  const tall=noticeBounds(prefs,displays,1,undefined,460);expect(tall.h…
       |                                                                              ^
     71|  const capped=noticeBounds(prefs,displays,1,undefined,4000);expect(cap…
     72| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

復元後SHA256: 1245d6d07afe00c4d05da4e5aa099f930e083d154fd48c8bb671c266f9beca84
