# I model-free scheduled reminders

Reminder is an explicit existing Scheduler action, not an agent prompt or command. At claim time its device UUID is copied to ScheduledRun.reminderDeviceId; listing and persistent ACK use this original identity even after the job changes or is deleted. Removal checks the current job type/device inside the same queued mutation. Native main injects the installation id. Read-only polls are bounded/single-flight/generation-checked; successful mutations invalidate pre-mutation polls and cause another read after retirement. Notices speak in the bubble without taking focus; mute keeps the pending messages available.

37 related source tests PASS (scheduler, assistant, native reminders), generated bubble UI PASS (save, literal verbal notice, ACK; no model send). Full source build succeeded after a test-only HTMLDialogElement this annotation correction. Final full verification follows all phases. No real agent, model, OS device or production scheduler was invoked.

Independent taskcheck found queue-external device validation for removal; moved to the atomic mutation and added a pending-save/removal regression. Whole review found historical run device attribution followed edited jobs; pinned it in run records and tested reassignment. Both independent correction reviews: no further must/should. Three valid negative controls failed the intended assertions; original source bytes restored in finally.

## soda-assistant-reminder-negative-late-poll

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/desktop-assistant| src/reminders.test.ts (3 tests | 1 failed | 2 skipped) 61ms
   × does not resurrect a pre-acknowledgement poll response 59ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/desktop-assistant| src/reminders.test.ts > does not resurrect a pre-acknowledgement poll response
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/reminders.test.ts:40:349


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  14:44:19
   Duration  176ms (tests 62%, transform 25%, import 10%, worker 3%)
```

## soda-assistant-reminder-negative-queued-remove

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/schedule/Scheduler.test.ts (9 tests | 1 failed | 8 skipped) 69ms
   × rechecks reminder device inside the queued removal transaction 68ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/schedule/Scheduler.test.ts > rechecks reminder device inside the queued removal transaction
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/schedule/Scheduler.test.ts:200:79


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  14:44:16
   Duration  689ms (transform 68%, import 19%, tests 12%, worker 1%)
```

## soda-assistant-reminder-negative-run-device

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-assistant-completion

 ❯ |@sodashitsu/server| src/schedule/Scheduler.test.ts (9 tests | 1 failed | 8 skipped) 82ms
   × pins past reminder runs to the execution device despite later job reassignment 81ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/schedule/Scheduler.test.ts > pins past reminder runs to the execution device despite later job reassignment
AssertionError: promise resolved "undefined" instead of rejecting

- Expected:
Error {
  "message": "rejected promise",
}

+ Received:
undefined

 ❯ src/schedule/Scheduler.test.ts:206:53


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  14:44:17
   Duration  766ms (transform 67%, import 21%, tests 12%)
```
