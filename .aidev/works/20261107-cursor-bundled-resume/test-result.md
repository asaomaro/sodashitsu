# Cursor bundled wrapper resume argv

The installed Linux cursor-agent launcher uses `exec -a "$0" "$NODE_BIN" [--use-system-ca] "$SCRIPT_DIR/index.js" "$@"`. Resume recognition now consumes only this exact optional switch and an absolute `cursor-agent/versions/<version>/index.js` path. A bundled node executable must share the entry's directory; the masked cursor-agent argv0 is also supported. Existing Windows node.exe/index.js behavior remains covered.

Arbitrary Node flags (--eval/--require/unknown), unrelated index.js, relative entry paths, dot-segment versions and another kind remain rejected. UUID resume grammar itself is unchanged. Fixtures do not execute a model or access user chats.

Frozen final checks: 3 files / 134 tests passed; targeted TypeScript check including ProcessMatcher tests with strict/exactOptional/noUnchecked and NodeNext completed exit 0; git diff --check 0. Full CI is owned by root, not repeated.

Negative control: restored only ProcessMatcher.ts to its parent, ran the four installed Linux wrapper cases, restored byte-exactly, then ran final fixed checks. Raw output:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-grok-cursor-conversations/packages/server

 ❯ src/agent/ProcessMatcher.test.ts (82 tests | 4 failed | 78 skipped) 11ms
   × reads the installed Linux Cursor bundled wrapper (masked=true, systemCA=true) 6ms
   × reads the installed Linux Cursor bundled wrapper (masked=true, systemCA=false) 1ms
   × reads the installed Linux Cursor bundled wrapper (masked=false, systemCA=true) 2ms
   × reads the installed Linux Cursor bundled wrapper (masked=false, systemCA=false) 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/agent/ProcessMatcher.test.ts > reads the installed Linux Cursor bundled wrapper (masked=true, systemCA=true)
 FAIL  src/agent/ProcessMatcher.test.ts > reads the installed Linux Cursor bundled wrapper (masked=true, systemCA=false)
AssertionError: expected undefined to be '12345678-abcd-ef01-2345-6789abcdef01' // Object.is equality

- Expected:
"12345678-abcd-ef01-2345-6789abcdef01"

+ Received:
undefined

 ❯ src/agent/ProcessMatcher.test.ts:231:129
    229|  const id="12345678-abcd-ef01-2345-6789abcdef01",root="/fixture/cursor…
    230|  const argv=[masked?"/fixture/bin/cursor-agent":root+"/node",...(ca?["…
    231|  const p={...proc(10,argv),ppid:1};expect(match(job(10,[p]))).toBe("cu…
       |                                                                                                                                 ^
    232| });
    233| it("does not strip unsafe or unrelated Cursor Node prefixes",()=>{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/agent/ProcessMatcher.test.ts > reads the installed Linux Cursor bundled wrapper (masked=false, systemCA=true)
 FAIL  src/agent/ProcessMatcher.test.ts > reads the installed Linux Cursor bundled wrapper (masked=false, systemCA=false)
AssertionError: expected null to be 'cursor' // Object.is equality

- Expected:
"cursor"

+ Received:
null

 ❯ src/agent/ProcessMatcher.test.ts:231:63
    229|  const id="12345678-abcd-ef01-2345-6789abcdef01",root="/fixture/cursor…
    230|  const argv=[masked?"/fixture/bin/cursor-agent":root+"/node",...(ca?["…
    231|  const p={...proc(10,argv),ppid:1};expect(match(job(10,[p]))).toBe("cu…
       |                                                               ^
    232| });
    233| it("does not strip unsafe or unrelated Cursor Node prefixes",()=>{

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 78 skipped (82)
   Start at  18:27:44
   Duration  254ms (transform 70%, import 18%, tests 8%, worker 3%)

undefined
/workspaces/sodashitsu-grok-cursor-conversations/packages/server:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run src/agent/ProcessMatcher.test.ts -t installed Linux Cursor bundled

```

Restoration receipt: negativeExit 1 / byteExactRestored True.
