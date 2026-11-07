# Physical/logical CPU display

Scope: CPU metadata/format only. Preserve all other footer fields and existing settings. No Windows machine operation.

- [x] Add backward-compatible optional physicalCpuCount to SystemResources; cpuCount remains logical. Shared formatter renders physical/logical コア, unknown explicitly —. Protocol taskcheck required.
- [x] Linux explicit online package/core/sibling topology; Windows fixed hidden CIM metadata probe. Async coalesced cache, no SMT assumption. Metadata/cache taskcheck required.
- [x] Related parser/cache/protocol/Web/TUI tests; negative old-format and metadata missing controls; exact restoration.
- [x] Build/type checks and current Linux metadata-only observation; Windows generated executor fixture is not Windows actual verification.
- [x] Separate-context final review. No new runtime/UI beyond CPU.

Primary sources: https://cdn.kernel.org/doc/html/latest/admin-guide/cputopology.html ; https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-processor . CPU topology is the OS-visible topology; WSL/VM reports guest, not undisclosed host Windows hardware.
