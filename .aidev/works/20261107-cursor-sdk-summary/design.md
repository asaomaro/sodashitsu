# Optional Cursor local-SDK summary: minimum proposed design

Status: design only; no repository dependency, source implementation, login or real model request added.

## Product boundary

When existing summary settings select kind `cursor`, use a new per-call local-SDK worker only if the optional SDK and supported SDK credential are present. This is a distinct SDK-backed summary provider, not the installed cursor-agent process and not automatic CLI-login reuse. Existing other kinds and ordinary Cursor conversation launch are unchanged. No new global opt-in setting is needed beyond selecting Cursor for summary: missing auth returns a concise unavailable error explaining CURSOR_API_KEY or SDK-specific login, with no automatic fallback to unsafe CLI/cloud/tool-enabled processing.

Supported credentials: CURSOR_API_KEY, otherwise the existing SDK login credential using public FileCredentialStore.load(), expiry/backend checks and SDK precedence. No manual CLI/app OAuth/token extraction. No browser, Cursor.auth.login/logout, save/clear or normal settings writes. Document the public SDK login route as user-initiated; do not implement new login UI in this scope. Credential material is private memory and inherited/IPC input only, never argv, diagnostics, saved summaries, renderer or logs. Choose the normal SDK auth path from the server environment, never renderer-provided paths. Backend endpoint is the official SDK default; unrelated CURSOR_BACKEND_URL/website/plugin environment is not inherited.

## Execution contract

- Parent reuses existing SummaryService concurrency slots, check callback and closed state. Cursor nonempty sessionId is rejected; no create/resume against existing agent. Every call creates a separate owned Node24 worker and temp directory (0700), isolated HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG/cwd/store.
- Spawn process.execPath and a fixed compiled worker entry; secret and prompt cross bounded stdin/IPC, not argv. No shell or CLI resolver is involved. Sparse OS runtime environment, no SODA/pane/agent/socket/plugin configuration inheritance.
- Worker imports the optional public SDK lazily. Configure local HTTP defaults only as needed; no endpoint transport monkeypatch in production. Agent.create uses explicit selected model id, tools:[], disallowedTools:['mcp','task'], mcpServers:{}, agents:{}, local.settingSources:[], customTools:{}, JsonlLocalAgentStore(privateStore), fs:tempFs(), reportedWorkspacePath:'/repo', enableAgentRetries:false. No cloud object, no resume, no resource-provider/custom tool/executor overrides. Recreate every field every call.
- Read the public Run stream and terminal wait result. Accept only assistant text, ignore bounded non-content status/usage/thinking. Any tool_call, task, request requiring interaction, assistant content tool_use or nonempty system.tools fails closed and requests run.cancel. Never execute a callback/tool. Guard the result again at parent completion; return {text,sessionId:null} to existing schema validators.
- Initial effort must stay empty for Cursor unless the existing formal model catalog supplies a proven SDK model.params mapping. Do not infer SDK params from CLI model suffixes or launch wishes.
- Existing 120s deadline, 250ms source/access check, 512KiB total SDK stream/control/output budget, final text max128KiB and existing caller input bounds. Introduce explicit bounded worker bootstrap input, e.g.512KiB. Stream events and final result both count toward bounds, reject overflow/malformed/duplicate-final. No retries. Keep all diagnostics generic and bounded; SDK console/stderr must not be relayed verbatim because provider errors can include request input/credentials.
- Cancellation/shutdown/TTL/check failure sends owned cancel; worker attempts run.cancel and agent.close, then parent terminates owned tree using existing stop semantics. Parent waits for physical close before final success or temp cleanup. Reject late results; no settled job can publish later. Normal completion also closes handle and destroys private store/HOME. No summary session registry entry for ephemeral SDK ids.

## Test seam and what it proves

Use a narrow DI factory typed from public Agent.create / SDKAgent / Run signatures. Production injects actual @cursor/sdk; tests inject generated public handles only. Fake successful-text Run proves wrapper extraction, existing notification/usage/summary JSON validation and no auto-send. Fake tool_call / assistant.tool_use / task / nonempty tools proves **our wrapper's fail-closed rejection and owned cancellation**, not SDK/server refusal before any tool could execute. Include credentials absent/expired, SDK unavailable, timeout, output overflow, source change, close, malformed events, delayed successful result after cancellation and cleanup failures. No private protobuf fabrication or internal SDK imports.

Retain actual SDK mock evidence from proposal.md: real SDK request allowed-tools empty, public fs/source isolation, functional user/project sentinel controls. Runtime plugin activation, hostile server tool execution prevention and real model text success remain separately unverified; do not label fake DI tests as those SDK guarantees. For stronger SDK-side safety rely on fs + tools0 public contract and later supported public mock surface if exposed, not guessed gRPC framing.

## Minimum files and ownership

1. `packages/server/src/conversation/cursorSdkSummary.ts` new parent worker supervisor/auth/error adapter (+focused test).
2. `packages/server/src/conversation/cursorSdkSummaryWorker.ts` new public-SDK runner (+focused DI test). If a separate typed worker protocol is needed, a small private shared module; no public RPC/protocol change.
3. `packages/server/src/conversation/SummaryService.ts` one Cursor branch binding and existing running/close ownership integration; coordinate with backend owner before editing. Its broader Grok/Cursor changes must not be duplicated.
4. `packages/server/package.json` exact optional dependency @cursor/sdk1.3.1 plus root pnpm-lock.yaml. Type/build must support SDK absent at runtime with clean unavailable result; do not add transitive unpublished @anysphere packages.
5. Existing docs Cursor summary limitations/auth section plus one small evidence/design work entry. No model catalog, settings schema/UI, CLI conversation or native subagent changes.

## Dependency and distribution

Pin @cursor/sdk1.3.1 and registry integrity from proposal.md. Update pnpm9.15.9 lock with ignore-scripts, review lock diff and install in isolated environment. No normalrepo dependency change until root approval. User optional feature can remain missing safely; deployments that promise it must run frozen-lockfile install with platform optional dependencies present, not copy only compiled dist.

Node24.22.2 tested. Temp linux install49MiB/8packages with ignore-scripts, no sqlite dependency due private JSONL. Official win32-x64 optional platform package1.3.1 exists, unpacked10,817,657bytes, integrity sha512-hqYllGgY27eaq+w035PebKdoc/JswcrvOSNCniqq/nicLXgWdK5zdKiAs5MyWUr73HGGL1sK0aiE7WdxbIKKVw==. This proves published artifact availability, **not Windows runtime success**. Windows Node24 install/import/owned-worker/mock cancellation/cleanup needs a later coordinated fixture; do not operate sr-pc during backend ownership. SDK sandbox/search platform binaries are not used by tools0/tempFs, but retain supported optional package installation unless official support proves removal safe. SDK's lazy chunks must remain in node_modules; do not flatten worker into an unsupported single output or put SDK inside the desktop host bundle.

## Independent review boundaries

Apply taskcheck to parent ownership/auth/IPC/cancel and runner policy/event handling. Focused old-policy/guard negative controls with exact source restoration; no full-suite duplicates. Root or another implementation context reviews whole patch, particularly auth path only-read, no CLI-token fallback, tool events cannot succeed, source invalidation and physical-close-before-cleanup. Main integration builds/typechecks/tests once when scheduled by root.
