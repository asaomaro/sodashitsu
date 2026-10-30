# B/G registered-machine notices

Remote notices use only authenticated hub `/ws?machine=<registered32hex>` routes, machine.list online entries (maximum8), readonly bounded feeds and separate fixed-method control sockets. Cookies/TLS/origin stay at the hub. Notice source retains its actual machine id; native reply selects that same private route and canonicalizes the remote server-local descriptor only after selecting it. Source opening rechecks hub/route/bubble/notice after waiting. No local fallback on a missing/offline route.

Expanded Web panels pin machine as well as workspace/pane/agent at startup and every input. Initial selection uses the existing MachineSwitcher; targeted remote panels alone keep MachineWiring enabled at narrow widths. Other mobile behavior is unchanged. Native setting can disable and close all remote monitors/routes.

Native+target guard117 tests PASS; additional focused33 tests PASS; full source build and native typecheck PASS. Generated main test proves remote reply goes to the remote mocked RPC with server-local descriptor, panel hash retains actual machine, and disabled route rejects instead of falling back. Socket tests check hub query URL; no actual SSH/remote agent/device or external network was used.

Taskcheck: no must. Whole review suggested maintaining the machine in narrow targeted panels; corrected with a MachineWiring regression and independently re-reviewed, no further must/should. Three valid negatives below failed routing, wrong-machine input and stale list assertions. Original source restored byte-for-byte. Final full integration follows F.

## soda-assistant-remote-negative-machine

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts (2 tests | 1 failed | 1 skipped) 11ms
   × never accepts matching pane UUIDs on the wrong machine 10ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/actions/assistantPanelGuard.test.ts > never accepts matching pane UUIDs on the wrong machine
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "agent": Object {
          "instanceId": "00000000-0000-4000-8000-000000000003",
        },
        "id": "00000000-0000-4000-8000-000000000001",
        "tabId": "t",
      },
      Object {
        "id": "t",
        "workspaceId": "00000000-0000-4000-8000-000000000002",
      },
    ]


Number of calls: 1

 ❯ src/actions/assistantPanelGuard.test.ts:58:236


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  15:37:12
   Duration  789ms (transform 61%, environment 21%, import 16%, tests 2%)
```

## soda-assistant-remote-negative-retired-list

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/remoteNotices.test.ts (2 tests | 1 failed | 1 skipped) 9ms
   × does not create remote sockets from a stale machine list or unregistered route 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/remoteNotices.test.ts > does not create remote sockets from a stale machine list or unregistered route
AssertionError: expected [ { options: { …(4) }, …(2) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ src/remoteNotices.test.ts:6:401


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  15:37:13
   Duration  660ms (transform 75%, import 23%, tests 2%)
```

## soda-assistant-remote-negative-route

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (15 tests | 1 failed | 14 skipped) 842ms
   × routes a remote notice reply through its registered machine and revokes it without local fallback 121ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > routes a remote notice reply through its registered machine and revokes it without local fallback
AssertionError: expected "vi.fn()" to be called with arguments: [ 'assistant.reply_key', …(1) ]

Number of calls: 0

 ❯ src/main.test.ts:899:117


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  15:37:10
   Duration  995ms (tests 91%, transform 7%, import 2%)
```
