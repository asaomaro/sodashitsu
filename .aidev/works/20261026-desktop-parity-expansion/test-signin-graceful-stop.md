# 7B4c3 verification

Native parent supplies one private anonymous stdin read handle to the fixed child, with stdout/stderr NUL; inherited handle list remains exactly3. Parent write handle is noninheritable and retained/closed with the owned process/job. Only one fixed 12-byte ASCII signin_stop newline record is written. No commands/credentials/paths/desktop input are accepted.

TryGraceful waits at most10s and requires exact process exit0 plus Job Active0 before the deadline. Clean and forced flags are separate; disposed handles refuse proof and force Stop cannot later become clean. Host natural exit also requires Job-zero, not just Node exit0. On graceful failure it still force-stops the job, keeps package/runtime leases through confirmed Job-zero and reports service ExitCode1; stop thread waits up to25s for the10+8s graceful/force budgets. No stop receipt or administrative authority is implied yet.

Installed main uses the actual Entry lifecycle with strict parent-frame validation. Invalid/truncated/repeated/error/EOF-before-frame input aborts and remains nonclean even if readonly cleanup succeeds. Claimed administration errors/unknown mutation outcomes propagate. Normal readonly outer cancellation may finish after all owners/pending reads settle; earlier internal failures and unconfirmed teardown remain nonclean/unsafe. A prior read timer firing after parent stop does not create a new internal failure.

Related47 PASS: StopSignal10, Entry4, Runtime23, Startup10. Eight actual source controls: frame prefix, EOF, failure latch, listener detach, readonly abort, readonly old-timer race, admin nonclean and installed Entry nonclean guard; intended AssertionErrors, exact bytes restored, positive suite47 PASS. Actual generated ordinary Node child exits after cleanup pauses stdin; generated Node24/no-addons stdin validator covers normal/wrong/truncated/extra records and is added to Windows Node CI before package build. No privileged Main called.

Generated native child scenarios cover cooperative success, exit7 refusal, hung child timeout, surviving descendant refusal and force→graceful misclassification refusal. Thirteen native source controls PASS with intended assertions and byte restoration, including previous host controls. Initial job-accounting control now trips earlier cooperative Active0 assertion; expected intended assertion was updated and rerun. Initial force-classification mutant removed the only graceful-field read and failed compiler warning rather than assertion; use an explicitly incorrect expression that still reads the field, then require runtime assertion. Neither initial failed control is counted.

Native review found force-stop being reused as clean and success beyond elapsed deadline; fixed clean/forced state and final deadline guard, then natural-exit Job-zero too. JS review found readonly read abort escaping as failure, then an old-timer race masking normal cancellation; fixed only the normal readonly branch with actual Entry→Startup→Cycle integration and a fake-clock stop4s/timer5s/read-settle6s regression. Pending reads remain owned until settlement; failure to settle rejects/unsafe. Admin unknown writes are never suppressed. Independent taskchecks and delta reviews clear; final records/whole cross follow.

Final verification results are recorded below; final delivery confirmation remains pending. No real SYS/service entry, protected desktop/input/audio devices, user keys/trust, certificates or installed service setup. B's separate ordinary-server build/handoff is tracked independently and cannot validate this dedicated uninstalled service.

Final native host compile/staging/generated13 controls PASS; worker compilation/generated27 controls PASS. Build/typecheck/builtin bundle PASS after Entry extraction. Independent final whole cross (native/JS/validator/records) clear. Generated stdin validator has an idempotent fixture callback to keep multiple end/error events from duplicating its output; the product abort itself is idempotent. Whole source/root/browser/external results are recorded below; final delivery confirmation remains pending.

Source control prefix: AssertionError: expected "vi.fn()" to be called at least once

Source control eof: AssertionError: expected "vi.fn()" to be called at least once

Source control failed: AssertionError: expected false to be true // Object.is equality

Source control detach: AssertionError: expected 1 to be +0 // Object.is equality

Source control readonly-stop: AssertionError: promise rejected "Error: Signin runtime is unavailable" instead of resolving

Source control readonly-timer: AssertionError: promise rejected "Error: Signin runtime is unavailable" instead of resolving

Source control admin-nonclean: AssertionError: promise resolved "'admin'" instead of rejecting

Source control entry: AssertionError: promise resolved "'normal'" instead of rejecting

## Final product verification

Product8e81e541 source build/type/builtin bundle PASS; source whole12,470/836 single PASS322.36s. Guarded root16 files (all base-match/new, no custom overlap) build/type/bundle PASS and whole12,532/844 single PASS323.24s. Browser source2 PASS12.8s, root2 PASS8.0s. External frozen8e81e541 install/build/bundle/smoke PASS and clean. Product Windows CI both PASS: protected40784338250/job123153644681 and Node40784338824/job123153646491, including generated no-addons Node stdin validator. Native host13 and worker27 controls PASS; independent final cross and revisions clear. Final documentation CI/main confirmation follows. No actual privileged service/desktop action; ordinary server deployment/reconnect is a separate record.
