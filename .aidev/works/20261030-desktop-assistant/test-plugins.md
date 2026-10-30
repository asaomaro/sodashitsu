# E character assets / plugin UI / plugin operations

Existing bundle manifests optionally declare assistantCharacters (id/name/PNG file in the closed hashed files list). Native import inspects only that package through an owned settings file picker, shows a5min opaque preview token and commits only on explicit import. No bundle entry/install/enable is executed by this path. PNG canonical base64,128KiB and1024x1024 bounds;16 packs/32 characters/8MiB catalog; atomic serialized write and corrupt-storage preservation. Readonly portrait output is literal PNG or a built-in fallback. Character/UI/action capability switches are separate and default off.

Approved running in-scope extensions may advertise assistant:true pane views and registered assistant:true operations. Catalog/action messages pin device+agent+extension run. Views reuse existing tab.add_view and isolated script-html controls, operations reuse correlated PluginOperations. Native UI has no arbitrary RPC/path/shell, plugin UI receives no native preload, and results are literal/editable then explicitly imported into the common editor. The dedicated private workspace intentionally does not inherit arbitrary project contents or approvals; global assistant plugins are the normal installation scope, while project-specific views remain available through their exact source terminal expansion.

145 related runtime tests /24 files PASS, full source build PASS, native typecheck PASS before final annotations, generated browser UI PASS. Tests use generated bundles, throw-if-executed entry bytes, fake registered extensions, memory sessions, fake Electron and PNG/media boundaries. No actual plugin process, OS device or model is invoked.

Independent taskcheck found app-open could present UI after its permission was revoked during RPC; current capability is now checked after awaiting and a regression covers it. It also suggested clearing stale catalog controls after a failed refresh; fixed and browser verified. Whole review suggested resetting open bubble portraits when custom-character display is disabled; key now includes display permission and the native generated import/revoke test confirms immediate fallback. Correction reviews found no further must/should. Four valid negative controls below failed intended assertions; source restored byte-for-byte and positives rerun.

## soda-assistant-plugin-negative-asset-dimensions

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/characters.test.ts (3 tests | 1 failed | 2 skipped) 9ms
   × rejects oversized and executable assets without launching an entry 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/characters.test.ts > rejects oversized and executable assets without launching an entry
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ src/characters.test.ts:8:160


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  15:13:11
   Duration  203ms (import 49%, transform 39%, tests 9%, worker 3%)
```

## soda-assistant-plugin-negative-operation-advertisement

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/assistant/AssistantApps.test.ts (2 tests | 1 failed | 1 skipped) 10ms
   × uses only in-scope running registered assistant views and actions 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/assistant/AssistantApps.test.ts > uses only in-scope running registered assistant views and actions
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/assistant/AssistantApps.test.ts:17:110


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  15:13:12
   Duration  1.24s (transform 82%, import 17%, tests 1%)
```

## soda-assistant-plugin-negative-portrait-fallback

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (14 tests | 1 failed | 13 skipped) 704ms
   × imports only previewed PNG assets and falls back immediately when character permission is revoked 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > imports only previewed PNG assets and falls back immediately when character permission is revoked
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/main.test.ts:764:173


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  15:13:15
   Duration  856ms (tests 90%, transform 7%, import 2%)
```

## soda-assistant-plugin-negative-revoked-view

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/main.test.ts (14 tests | 1 failed | 13 skipped) 641ms
   × keeps plugin actions behind explicit capability and revokes pending view opens 20ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/main.test.ts > keeps plugin actions behind explicit capability and revokes pending view opens
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/main.test.ts:750:159


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  15:13:14
   Duration  785ms (tests 90%, transform 7%, import 2%)
```
