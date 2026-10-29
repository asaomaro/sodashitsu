# Agent-to-human takeover verification
## Scope and baseline

Original remote-desktop-agent.spec.ts:112 expected操作中 but saw閲覧中 on prior main tree (b93bb96a/main5047699f) and Linux-idle work. Same-member input resource cleanup was still pending when a new explicit controltrue arrived. No further baseline repetitions. Generated helper/input only; no actual OS input, clipboard, service/driver/trust changes or live A/B handoff.
## Positive checks

- Owner/UI23 tests passed1.96s: member-bound pending receipt, confirmed release remains strict, finite deadline, focusout cancels pending input authority, blocked cancellation closes owner socket, late grant ignored. Provider additional5 cases cover changed/dead/unready/ceiling/foreign-source intent. Real shared relay regression refuses another member while allowing only the original viewer after exact cleanup.
- Original previously failing browser spec2/2 PASS17.8s after the fix. New actual browser shared repeat, cancel→replace and focusout-before-ACK3/3 PASS13.8s. Private generated fixture holds exact resource cleanup until an owned marker is written; actual DOM/grant frames/input evidence determine success.
- Initial new shared fixture2 timeouts came from toggling the already-open info panel closed before checking a hidden checkbox. Correcting fixture sequencing passed both; these timeouts are not counted as negative controls.
- Final restored build/force/types/whole/browser/root/CI/clean receipts follow.
## Independent review

Pointer and transfer reviews required same-member ownership, normal acquire after exact completion, shared per-request FIFO responses, pending UI blur cancellation and rejection of late grants. Those changes and source/role/cancel/deadline boundaries passed correction review. Final frozen/source/root and records reviews follow.
## UI protocol correction

The broad21 browser run first passed20 and failed the existing encrypted raw-takeover case. It sends controltrue through the actual endpoint socket without UI.send, so a rule requiring UI.pending/current for every true rejected a valid uncancelled protocol grant. Added explicit local cancellation state: fresh requests reset it; all relinquish/focusout sets it even for untracked requests; failure/rejection cancels; late true after cancellation is refused. Unit7 passed2.13s and corrected raw browser passed6.2s. Added a direct untracked request→focusout→late true regression. The first intermediate whole suite857files/12728tests passed405.55s; final frozen rerun includes the additional correction/regression and is recorded separately.

## Actual production-source negative controls

Nine distinct actual production mutations, intended runtime assertion failures and exact restoration. Browser controls rebuilt server output in mutation and restoration. Final UI correction controls were rerun and added protocol-grant/untracked-focus cases. No compile/import/blanket timeout counted. Local logs under `.cache/agent-takeover/`.

### negative-blur-cancel

```text
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > cancels pending human control on focusout and rejects its late grant, backpressure=false
AssertionError: expected [ { type: 'start', …(2) }, …(2) ] to deep equally contain { type: 'control', enabled: false }

- Expected:
{
  "enabled": false,
  "type": "control",
}

+ Received:
[
  {
    "machineId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "options": {
      "adaptive": false,
      "deltas": true,
      "features": true,
      "fps": 10,
      "image": {
```

### negative-cancel-backpressure

```text
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > cancels pending human control on focusout and rejects its late grant, backpressure=true
AssertionError: expected "vi.fn()" to be called at least once
 ❯ src/components/RemoteDesktopAgent.test.ts:28:35


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 5 skipped (7)
   Start at  05:57:20
   Duration  1.92s (transform 74%, import 13%, environment 9%, tests 4%)

```

### negative-late-grant

```text
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > cancels pending human control on focusout and rejects its late grant, backpressure=false
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > cancels pending human control on focusout and rejects its late grant, backpressure=true
AssertionError: expected '操作中' to be '閲覧中' // Object.is equality

Expected: "閲覧中"
Received: "操作中"

 ❯ src/components/RemoteDesktopAgent.test.ts:29:178


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 5 skipped (7)
   Start at  05:57:18
   Duration  1.85s (transform 70%, import 15%, environment 8%, tests 6%)

```

### negative-protocol-grant

```text
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > accepts protocol grants before cancellation and after a fresh request, while rejecting cancelled grants
AssertionError: expected '閲覧中' to be '操作中' // Object.is equality

Expected: "操作中"
Received: "閲覧中"

 ❯ src/components/RemoteDesktopAgent.test.ts:35:94


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  05:57:23
   Duration  1.85s (transform 73%, import 13%, environment 9%, tests 5%)

```

### negative-same-member

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopInteractiveOwner.test.ts > exposes a releasing identity only to its original member without weakening confirmed release
AssertionError: expected { source: {}, …(2) } to be undefined

- Expected:
undefined

+ Received:
{
  "epoch": "66475d2c-db6b-4d53-bfc7-a8942d860be2",
  "id": "3938b7fe-4594-4a42-8992-d8591e8d1dd7",
  "source": {},
}

 ❯ src/desktop/DesktopInteractiveOwner.test.ts:37:347


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### negative-same-source

```text
 FAIL  |@sodashitsu/server| src/desktop/DesktopProvider.takeover.test.ts > does not resume a queued control after its source changes
AssertionError: expected "applyControl" to not be called at all, but actually been called 1 times

Received:

  1st applyControl call:

    Array [
      Object {
        "allowInput": true,
        "control": false,
        "dead": false,
        "process": Object {
          "resourceChannel": Object {},
        },
        "ready": true,
      },
      true,
    ]
```

### negative-shared-fifo

```text
    Error: expect(locator).toHaveText(expected) failed

    Locator:  locator('[data-remote-desktop]').locator('[data-desktop-status]')
    Expected: "操作中"
    Received: "閲覧中"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveText" locator('[data-remote-desktop]').locator('[data-desktop-status]') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').locator('[data-desktop-status]')
        14 × locator resolved to <span data-v-03c2f1ae="" data-desktop-status="">閲覧中</span>
           - unexpected value "閲覧中"


      29 |   await writeFile(marker,"generated release");await expect.poll(async()=>(await entries()).some(value=>value.type==="resource_fence_done"&&value.resource==="control")).toBe(true);
      30 |   if(mode==="blur"){await expect.poll(()=>received.filter(v=>!v).length).toBeGreaterThanOrEqual(2);await expect(status).toHaveText("閲覧中");expect(await page.locator("#takeover-outside").evaluate(el=>el===document.activeElement)).toBe(true);}
    > 31 |   else{await expect(status).toHaveText("操作中");await canvas.focus();await canvas.press("a");await expect.poll(async()=>readFile(record,"utf8").catch(()=>"")).toContain('"code":"KeyA"');}
         |                             ^
      32 |  }finally{await writeFile(marker,"generated cleanup");await page.goto("about:blank").catch(()=>{});await provider.close();await rm(dir,{recursive:true,force:true});}
```

### negative-takeover-cleanup

```text
    Error: expect(locator).toHaveText(expected) failed

    Locator:  locator('[data-remote-desktop]').locator('[data-desktop-status]')
    Expected: "操作中"
    Received: "閲覧中"
    Timeout:  5000ms

    Call log:
      - Expect "toHaveText" locator('[data-remote-desktop]').locator('[data-desktop-status]') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').locator('[data-desktop-status]')
        14 × locator resolved to <span data-v-03c2f1ae="" data-desktop-status="">閲覧中</span>
           - unexpected value "閲覧中"


      110 |     await expect(agent.request("desktop.agent.act", params)).rejects.toThrow();
      111 |     await view.getByRole("button", { name: "操作を引き取る", exact: true }).click();
    > 112 |     await expect(view.locator("[data-desktop-status]")).toHaveText("操作中");
          |                                                         ^
      113 |     await expect(
```

### negative-untracked-focus

```text
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopAgent.test.ts > refuses a protocol grant after focusout even when its request bypassed UI tracking
AssertionError: expected '操作中' to be '閲覧中' // Object.is equality

Expected: "閲覧中"
Received: "操作中"

 ❯ src/components/RemoteDesktopAgent.test.ts:42:302


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  05:57:26
   Duration  1.84s (transform 73%, import 13%, environment 10%, tests 4%)

```
