# Assistant-only ask-form integration

Final inspection found the native read-only socket did not subscribe to forms and advertised external kind. With no ordinary Soda browser, AskService returned unavailable. Implemented desktop hello plus renderer:assistant subscription, bounded metadata-only notices, exact opaque form id links and open-only current form validation. Forms remain answered by the existing Web AskController/AskService exactly-once path; native never fetches media or answers via terminal input. Only detected agent panes count as displayable for the native subscriber; normal shells still return unavailable with native alone.

Pointer taskcheck found and correction-reviewed two issues: an older initial subscription snapshot overwriting a newer opened event, and ordinary shell forms waiting without a display path. Event merge plus closed tombstones and assistant subscriber eligibility fix both. Subscription completion retains the original10s absolute handshake deadline. Pending forms never rebind to replacement agents. Each native targeted panel open gets a fresh query so an existing same-origin panel creates a new document and reinitializes its guard/form target.

Focused positive:102 tests in6 files PASS before final full verification. Tests use fake adapters/generated sockets and memory AskService, without actual desktop/agents/media. Six intended negative controls produced runtime assertion failures; source bytes were restored in finally and checked equal. The navigation control initially used a wrong matcher (all18 skipped), which was rejected as invalid evidence and rerun with the actual test name. Only the corrected output is below.

## Negative control: browser

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts (14 tests | 1 failed | 13 skipped) 60ms
   × subscribes as a form-capable browser without fetching media or writing input 59ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeConnection.test.ts > subscribes as a form-capable browser without fetching media or writing input
AssertionError: expected 'external' to be 'desktop' // Object.is equality

Expected: "desktop"
Received: "external"

 ❯ src/noticeConnection.test.ts:384:53
    382|   await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    383|   f.socket.emit("open");
    384|   expect(JSON.parse(f.socket.sent[0]!).params.kind).toBe("desktop");
       |                                                     ^
    385|   f.socket.message({ id: "assistant-hello", result: { snapshot: f.snap…
    386|   f.socket.message({ id: "assistant-shared", result: { notices: [] } }…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  17:10:00
   Duration  742ms (transform 69%, import 22%, tests 9%)


```

## Negative control: snapshot

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts (12 tests | 1 failed | 11 skipped) 13ms
   × preserves a pushed new form against an older subscribe snapshot 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/noticeFeed.test.ts > preserves a pushed new form against an older subscribe snapshot
AssertionError: expected [] to deeply equal [ ObjectContaining{…} ]

- Expected
+ Received

- [
-   ObjectContaining {
-     "key": "ask:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
-     "kind": "question",
-   },
- ]
+ []

 ❯ src/noticeFeed.test.ts:210:26
    208|   f.feed.event({ event: "ask.opened", data: { askId, paneId: f.ids.pan…
    209|   f.feed.questions({ asks: [] });
    210|   expect(f.feed.notices).toEqual([
       |                          ^
    211|     expect.objectContaining({ key: `ask:${askId}`, kind: "question" }),
    212|   ]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 11 skipped (12)
   Start at  17:10:02
   Duration  688ms (transform 76%, import 22%, tests 2%, worker 1%)


```

## Negative control: subscriber

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/ask/AskService.test.ts (44 tests | 1 failed | 43 skipped) 9ms
   × does not leave a shell form waiting with an assistant-only subscriber 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/ask/AskService.test.ts > does not leave a shell form waiting with an assistant-only subscriber
AssertionError: expected undefined to match object { status: 'unavailable' }

- Expected:
{
  "status": "unavailable",
}

+ Received:
undefined

 ❯ src/ask/AskService.test.ts:956:45
    954|  const {asks}=setup({browsers:["assistant"],assistantPanes:["p1"]});as…
    955|  const result=track(asks.open("shell",{paneId:"p2",spec:SPEC,timeoutMs…
    956|  try{await settle();expect(result.result()).toMatchObject({status:"una…
       |                                             ^
    957|  finally{asks.dispose();await result.done;}
    958| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 43 skipped (44)
   Start at  17:10:03
   Duration  690ms (transform 75%, import 23%, tests 2%)


```

## Negative control: source

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/assistant/SourceTarget.test.ts (7 tests | 1 failed | 6 skipped) 8ms
   × opens only a live form and never turns a form notice into terminal input 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/SourceTarget.test.ts > opens only a live form and never turns a form notice into terminal input
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/assistant/SourceTarget.test.ts:149:70
    147|   const ctx = { clientId: "test", sink: {} as any },
    148|     params = { source: f.source, key };
    149|   expect((await surface.invoke(ctx, "assistant.source", params)).ok).t…
       |                                                                      ^
    150|   expect(
    151|     (await surface.invoke(ctx, "assistant.reply", { ...params, text: "…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  17:10:04
   Duration  1.07s (transform 81%, import 18%, tests 1%)


```

## Negative control: form

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/web| src/store/ask.test.ts (7 tests | 1 failed | 6 skipped) 25ms
   × assistant form links show exactly the requested form, with no fallback after closure 24ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/store/ask.test.ts > assistant form links show exactly the requested form, with no fallback after closure
AssertionError: expected 'other' to be 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // Object.is equality

Expected: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
Received: "other"

 ❯ src/store/ask.test.ts:96:30
     94|     const s = useAskStore();
     95|     s.replaceAll([ask("other", ids[0]), ask(ids[3]!, ids[0])]);
     96|     expect(s.current?.askId).toBe(ids[3]);
       |                              ^
     97|     s.remove(ids[3]!);
     98|     expect(s.current).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  17:10:06
   Duration  1.13s (transform 67%, import 17%, environment 13%, tests 2%)


```

## Negative control: navigation

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (18 tests | 1 failed | 17 skipped) 866ms
   × routes a remote notice reply through its registered machine and revokes it without local fallback 115ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > routes a remote notice reply through its registered machine and revokes it without local fallback
AssertionError: expected '' not to be '' // Object.is equality
 ❯ src/main.test.ts:1012:32
    1010|   await fixture.handlers.get("assistant:source-open")!(local,{noticeId…
    1011|   const secondUrl = new URL(fixture.windows.at(-1)!.url);
    1012|   expect(secondUrl.search).not.toBe(firstUrl.search);
       |                                ^
    1013|   expect(new URLSearchParams(secondUrl.hash.slice(1)).get("assistantAs…
    1014|   await fixture.handlers.get("assistant:save")!(event, {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  17:10:24
   Duration  1.02s (tests 91%, transform 7%, import 2%)


```


## Final positive and distribution receipts

- Full build/types PASS: `/tmp/soda-assistant-ask-build.log`, `/tmp/soda-assistant-ask-types.log`.
- Full runtime890 files /12,931 tests PASS,354.46s: `/tmp/soda-assistant-ask-all-tests.log`.
- Generated keyboard/DOM UI PASS: `/tmp/soda-assistant-ask-ui.log`.
- Windows unsigned zip PASS: `/tmp/soda-assistant-ask-pack.log`;15 native/UI files plus2 protocol schema files byte-equal tested build. No executable installed/launched.
- Final read-only independent delta review: no additional must. Minor positive-test suggestion retained renderer:assistant and passed all44 AskService tests (`/tmp/soda-assistant-ask-role-positive.log`). Only that test and a relocated comment follow the full run. No production behavior change followed full verification.
- Exact head CI/merge receipts are in PR321.
