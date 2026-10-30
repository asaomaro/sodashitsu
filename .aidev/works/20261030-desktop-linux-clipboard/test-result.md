# Linux text clipboard checks

## Source negatives (actual assertions)

### real-entry

```text
F
======================================================================
FAIL: test_real_main_accepts_clipboard_flag_before_dispatching_owned_stub (__main__.Entry.test_real_main_accepts_clipboard_flag_before_dispatching_owned_stub)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 420, in test_real_main_accepts_clipboard_flag_before_dispatching_owned_stub
    self.assertEqual(code,0);self.assertEqual(invoked,[("--allow-clipboard",)])
    ^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: 1 != 0

----------------------------------------------------------------------
Ran 1 test in 0.050s

FAILED (failures=1)

```

### original-budget

```text
F
======================================================================
FAIL: test_query_time_consumes_original_budget_before_io (__main__.Clipboard.test_query_time_consumes_original_budget_before_io)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 362, in test_query_time_consumes_original_budget_before_io
    h.scope.alive=alive;clip.submit(self.request(operation="write"));self.assertFalse(self.await_result(results)["ok"]);self.assertFalse(calls)
                                                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: True is not false

----------------------------------------------------------------------
Ran 1 test in 0.034s

FAILED (failures=1)

```

### read-after-select

```text
F
======================================================================
FAIL: test_revocation_after_pipe_readiness_performs_no_new_read (__main__.Clipboard.test_revocation_after_pipe_readiness_performs_no_new_read)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 391, in test_revocation_after_pipe_readiness_performs_no_new_read
    self.assertFalse(reads)
AssertionError: [3] is not false

----------------------------------------------------------------------
Ran 1 test in 0.052s

FAILED (failures=1)

```

### write-after-select

```text
F
======================================================================
FAIL: test_revocation_after_pipe_write_readiness_performs_no_new_write (__main__.Clipboard.test_revocation_after_pipe_write_readiness_performs_no_new_write)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 404, in test_revocation_after_pipe_write_readiness_performs_no_new_write
    self.assertEqual(done,[("SelectionWriteDone",(h.session,42,False))]);self.assertFalse(writes)
                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: [4] is not false

----------------------------------------------------------------------
Ran 1 test in 0.053s

FAILED (failures=1)

```

### final-publish

```text
F
======================================================================
FAIL: test_requires_os_and_human_grant_reads_real_owned_utf8_pipe (__main__.Clipboard.test_requires_os_and_human_grant_reads_real_owned_utf8_pipe)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 334, in test_requires_os_and_human_grant_reads_real_owned_utf8_pipe
    clip.control({"generation":3,"enabled":False});self.assertFalse(publication[-1]())
                                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: True is not false

----------------------------------------------------------------------
Ran 1 test in 0.029s

FAILED (failures=1)

```

### physical-busy

```text
F
======================================================================
FAIL: test_revoke_pending_read_retains_busy_until_physical_completion (__main__.Clipboard.test_revoke_pending_read_retains_busy_until_physical_completion)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/workspaces/sodashitsu-desktop-linux-clipboard/scripts/remote-desktop/test-linux-portal-helper.py", line 368, in test_revoke_pending_read_retains_busy_until_physical_completion
    clip.submit(self.request(id=2,generation=3));self.assertEqual(len(results),1);self.assertFalse(results[-1]["ok"]);self.assertTrue(clip.busy)
                                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError: 0 != 1

----------------------------------------------------------------------
Ran 1 test in 0.031s

FAILED (failures=1)

```
