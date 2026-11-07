# Native Grok TUI initial SessionStart

Installed Grok 1.0.77 was started in an own PTY with no initial prompt or input. An unprivileged user/network namespace exposed only loopback; own temporary HOME/GROK_HOME/config/data and synthetic authentication were used. The only configured hook ran the actual Sodashitsu agent-hook-report asset into an own Unix socket, not production's socket or any existing pane.

Observed metadata: one report, kind grok, UUID present, agentPid exactly the owned TUI process PID. Input bytes zero, inference requests zero, external model calls zero. No --no-leader flag was added to the TUI. The process group was terminated after observing the report, CLI exited 0, and own socket/PTY/stub/temp directories were closed/removed. A final /proc cwd check found zero remaining processes under the owned probe prefix.

This establishes that the installed normal TUI can emit the first PID-bearing report itself. The generated real AgentMonitor/SessionService regression verifies that this single report can settle to the corresponding detected instance after the order fix. These are separate observations; the probe did not connect an actual user's conversation to production or run a real model, and it does not assert behavior of a differently configured shared leader session.

The checked-in probe derives the repository asset path relative to this document and uses Node 24's explicit local path. This path-only portability adjustment was made after the observed run; the original run used the same asset from the dedicated worktree. No product code changed after its final source checks.
