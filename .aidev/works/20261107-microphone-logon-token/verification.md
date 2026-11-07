# Native logon proof correction

Real sr-pc preflight found managed WindowsIdentity.Groups omitted the logon group (zero), while the same ordinary-user token's native TokenGroups contained exactly one. Actual WASAPI was not started; the PC remained locked throughout these checks.

Only WindowsUserMicrophoneRole.Read used this managed-group pattern among user audio roles. WindowsUserAudioRole has no matching implementation and was not changed. Microphone policy, identity/peer/session/elevation/lock guards, deadlines, physical retirement and kernel lease are unchanged.

The fixed role queries TokenGroups with bounded variable allocation (1MiB/3 attempts), validates group count/table, pointer range/alignment, SID revision/subauthority length, known flags and exactly one enabled canonical NT logon SID carrying SE_GROUP_LOGON_ID. Missing, ambiguous, malformed or unreadable facts fail closed.

Source/tests were fixed before the final native checks:

- sr-pc: actual user token and actual Role.Read logon field, plus same-logon proof against existing server PID16444, pass with generated28 boundary rejections and existing policy generated checks.
- Exact previous managed extraction restored in the private staged copy: regression exits1 with `Role facts lost native logon`. Fixed source staged back with identical SHA256 and recompiled: exit0. Raw receipts are in sr-pc-native.json.
- Local Windows: `python3 scripts/remote-desktop/validate-user-microphone.py --windows-temp <Windows-visible temp> --negative-controls` exits0, including real token checks, common-host role proof, generated PCM/peer checks, eight source negative controls, and byte-exact source restoration. Raw output in local-native.log.
- Python runner syntax compilation passed. No whole-repository tests duplicated.

sr-pc used only the normal-user remote exec route and isolated validator executables. No microphone endpoint, GUI, existing pane/app, lock/unlock, service, driver, trust, policy, production configuration or production server was changed. The owned fixture directory was removed and existing server PID16444 remained present (sr-pc-cleanup.json). The stage directory/source files were temporary copies, never production files. Independent review is coordinated by root before distribution.
