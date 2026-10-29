# Clean stopped package upgrade verification

Public explicit Run fixes installed owner paths, actual primary administrator/user owner, retained owner mutex and a finite five-minute authority. It accepts old reviewed raw manifest SHA and new reviewed source SHA, never paths/commands for target service, secret credentials or legacy schema switches. The new source is inspected, never executed. Old fixed package is fully held; private parents/slot/admin/runtime are held, admin must be empty and an existing transition marker rejects.

Under the same immutable exclusive barrier, RunJournal.CleanBoundary accepts only initial or independent observed-stop complete. Missing/unknown/pending or unobserved stopped are rejected before service config changes or new initial writes. Closed source is copied to a fresh private stage, flushed and verified. The fixed existing service's complete Manual/stopped config is checked, changed only to Disabled after final clean proof, then complete Disabled/stopped config is inspected before durable marker. STOPPED PID is not interpreted.

Marker has 17 closed fields including owner, upgrade UUID, old/new manifest hashes, exact old runId+canonical boundary digest, new runId, barrier fingerprint, captured root directory identities and exact stage/archive names. Old code and old run journal no-delete handles are closed only while parent/barrier/Disabled/marker proof remains. Nonreplace moves recheck captured same root identity; old archived package and old journal are fully revalidated. All other slot contents/runtime/enrollment and immutable barrier remain intact. New initial is bound to new package/barrier and marker runId. Only after all final proofs is this exact marker removed and start type returned Manual; nothing is started.

Generated ordinary temporary files, actual native file handles/rename, machine DPAPI and immutable barrier plus fake SCM exercise both initial and fully observed complete upgrades. Sentinels represent identity/enrollment; no real identity or token is used. Negative cases include active service, admin pending, foreign/late marker, missing/unknown journal, valid pending, valid stopped lacking independent observation, scope loss after Disable, concurrent barrier and replaced directory identity. Fault injection after old code archive and old runs archive confirms Disabled/marker/archive/data retention, zero Manual changes and no new initial write. No rollback deletes partial files.

The first three source controls (Disable proof, Manual proof, empty admin) passed with byte restoration/positive rerun. Tests were then expanded to valid unclean states, directory identity and archive interruptions, with six source controls running. Final marker metadata was then strengthened to include stage name and new runId; these metadata-only changes have a separate final positive run and exact-head CI will rerun all controls. Do not count a mutation run that fails compilation/import/deadline or an unintended assertion as negative evidence.

Existing run-journal nine controls passed after adding CleanBoundary (26.99s). Other existing native product sources are unchanged, so reuse #289 13-group results/#290 recovery results. JS/protocol/bundle sources unchanged: reuse frozen #282 source12470/root12532/browser2 each/external build/smoke, no new full JS execution claimed. Public ValidateOnly compiled; final compile check will rerun after marker/test additions.

Actual public privileged Run/native ChangeServiceConfig/private ACL factory/SCM service/fixed installed files/SYSTEM/capture/input/audio/keys/trust/provider are NOT exercised or changed. Partial upgrade recovery, general runtime crash recovery and real deployment remain unfinished. No old-version compatibility or migration branch is implemented as requested by the user.

## Final local results and reviews

The six-control copied-source run exited0, with all intended assertions, exact byte restores and restored positive completion. The final 17-field metadata/newRunId positive run exited0. Final public ValidateOnly also exited0. Both independent source/correction/records reviews clear. Controls ran on the pre-final-metadata copy, so no claim is made that the local six-control run covered the later added metadata fields. Exact-head CI runs the final complete source.

## Extracted raw source-control output

```text
signin_upgrade_generated_initial_complete_preserved_archives_barrier_and_no_reset_passed
negative unobserved-stop
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unobserved stopped generation upgraded" ---> System.InvalidOperationException: Unobserved stopped generation upgraded
negative clean-boundary
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Pending generation upgraded" ---> System.InvalidOperationException: Pending generation upgraded
negative directory-identity
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Replaced directory identity was archived" ---> System.InvalidOperationException: Replaced directory identity was archived
negative disable-proof
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Unproved state disabled service" ---> System.InvalidOperationException: Unproved state disabled service
negative manual-proof
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Uncommitted state enabled service" ---> System.InvalidOperationException: Uncommitted state enabled service
negative admin-empty
System.Management.Automation.MethodInvocationException: "0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Pending admin upgraded" ---> System.InvalidOperationException: Pending admin upgraded
signin_upgrade_generated_initial_complete_preserved_archives_barrier_and_no_reset_passed
signin_upgrade_6_source_negative_controls_and_restore_passed
```
