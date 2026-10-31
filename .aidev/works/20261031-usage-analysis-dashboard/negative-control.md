# Review fixes: negative control

Only an isolated copy was mutated; the shared review tree was unchanged.

## Isolated unchanged source (positive control)

```text

 RUN  v5.0.1 /tmp/soda-usage-negative-4xfnq6jj


 Test Files  1 passed | 28 skipped (29)
      Tests  2 passed | 624 skipped (626)
   Start at  10:02:58
   Duration  2.42s (transform 75%, import 24%, worker 1%)

  Transform  transforming modules took 15.52s · 75% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
Exit: 0

## Remove reset-event timestamp distinction (negative control)

```text

 RUN  v5.0.1 /tmp/soda-usage-negative-4xfnq6jj

 ❯ src/usage/usageHistory.test.ts (7 tests | 1 failed | 6 skipped) 31ms
   × keeps valid events after cumulative reset even if their totals match a previous generation 29ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/usage/usageHistory.test.ts > keeps valid events after cumulative reset even if their totals match a previous generation
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 ❯ src/usage/usageHistory.test.ts:72:24
     70|   ));
     71|   const result = await f.reader.read(range);
     72|   expect(result.calls).toBe(2); expect(result.totals.total).toBe(240);…
       |                        ^
     73| });
     74| it("retains a physical scan limit independently from the four-entry ca…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 28 skipped (29)
      Tests  1 failed | 625 skipped (626)
   Start at  10:03:01
   Duration  2.15s (transform 76%, import 22%, worker 1%)

  Transform  transforming modules took 14.50s · 76% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
Exit: 1

## Remove physical scan admission limit (negative control)

```text

 RUN  v5.0.1 /tmp/soda-usage-negative-4xfnq6jj

 ❯ src/usage/usageHistory.test.ts (7 tests | 1 failed | 6 skipped) 47ms
   × retains a physical scan limit independently from the four-entry cache 45ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/usage/usageHistory.test.ts > retains a physical scan limit independently from the four-entry cache
AssertionError: expected [ { status: 'fulfilled', …(1) }, …(7) ] to have a length of 2 but got 8

- Expected
+ Received

- 2
+ 8

 ❯ src/usage/usageHistory.test.ts:78:57
     76|   const requests = Array.from({length: 8}, (_, day) => f.reader.read({…
     77|   const results = await Promise.allSettled(requests);
     78|   expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2…
       |                                                         ^
     79|   expect(results.filter(r => r.status === "rejected")).toHaveLength(6);
     80|   await expect(f.reader.read({from:"2026-10-10",to:"2026-10-31"})).res…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 28 skipped (29)
      Tests  1 failed | 625 skipped (626)
   Start at  10:03:04
   Duration  2.17s (transform 77%, import 22%, worker 1%)

  Transform  transforming modules took 14.95s · 77% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```
Exit: 1

Source matches restored isolated copy (SHA256): True
