# Claude subagent resume TTL

Scope: call existing pruneStopped at SubagentStart; keep the 60-second Stop-first guard. No timestamp protocol or current-idle inference. Native same-ID resume within TTL remains ambiguous and is documented. Official lifecycle reference: https://code.claude.com/docs/en/hooks#subagentstart

Node 24.22.2. Protocol dependency build exit 0. Focused SubagentTracker suite: 75 passed. Restoring only SubagentTracker.ts to base 8e29af85 makes both added regressions fail (73 passed / 2 failed); raw output in negative.txt. Fixed source restored byte-exact (SHA256 10fb348fde0db7c93144e942e36e403b0e6eabb6ed643730844fecf8b4064836), focused suite 75 passed (restored.txt). No production pane, new model turn, hook setting, or remote machine operation.

Independent review: requested from root after commit. Full repository tests intentionally not duplicated for this one-line change.
