# Phase 1 verification

No Windows/prod execution, elevation, service/Task update, installed helper change, screen capture or OS input was performed.

- `git diff --check`: passed.
- Existing `verify-runtime-assets.mjs` against a fresh temporary SDK made by copying exactly the closed runtime inventory: passed, raw output:

```json
{"runtimeResources":111,"localReferences":214,"sourceBytesMatch":true,"macBinaryChecked":false,"helperExecution":false}
```

  `prepare-desktop-helper.ps1` is included; the deleted installer and both new `*Checks.cs` are excluded. Runtime include closure is checked by the existing verifier, including PowerShell references.
- Existing `DesktopSettings.test.ts`, using the unchanged installed dependency tree and a temporary one-project vitest config (root workspace config attempted to initialize missing unrelated web dependencies): passed:

```text
 Test Files  1 passed (1)
      Tests  39 passed (39)
   Start at  22:02:50
   Duration  2.80s (tests 56%, transform 35%, import 9%)
```

- Windows C#/.NET Framework source compilation and generated validators: pending designated operator. Linux has no C#/PowerShell compiler. No success is claimed for these.
- No new mirror tests were added for the cleanup. Existing generated policy/pipe/host tests are preserved in repo-only partial sources and their ten direct compilation consumers include them. Existing peer-policy test was updated to remove its obsolete SCM expectations.
- Independent review: pending integration reviewer.
