# UAC reconnect integration

Source base production1006e829. Six reviewed commits cherry-picked without conflict: backend22d30c3b/2ac40711/3ac08572 and Weba3a98813/1d42133c/f3351eae. Integrated source05900d5494eebcf74d66f482a3d4aac2c6df98b9. Entire server/scripts Git trees match backend author, entire Web tree matches UI author; other five package trees match production1006. Changed-source Git blob and byte SHA map committed.

No duplicate build or full suite. All seven package dist inventories copied and fully byte-matched with explicit origins: server author1868files (reviewed full map), Web author37files (reviewed index asset verified), production CLI228/client-core364/desktop-assistant152/protocol300/TUI412. All maps committed. External smoke worktree receives identical seven package artifacts, independently hashed again before completion.

Exactly one external smoke at /workspaces/sodashitsu-uac-reconnect-smoke, detached05900d5494, with private isolated XDG state/config/cache/data/runtime and own ephemeral server/PTYs. Actual Chromium login/hello/pane/input/custom popup/onboarding flow PASS, exit0 in5.685s. Temporary dependency symlinks removed after check. Production server/main/audio integration and all Windows operations unchanged. C# compilation/installed helper update/actual UAC recovery remain Root-only gates.
