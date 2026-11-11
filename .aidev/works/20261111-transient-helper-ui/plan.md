# Server lifetime privileged helper: UI inventory / fixed contract

Base 23cf87712a556d9638e6fc1c7fd086cf3fd07684; owned worktree only. UI copy/flow contract fixed with backend; native implementation/build is separate. No Windows/service/desktop/input/build/model operations.

User intent: no Windows service installation; ordinary soda startup manages necessary privileged helper during server lifetime, explicit initial elevation only as needed, stops on soda shutdown. Root fixed one method: initial UAC prepares an on-demand SYSTEM Task definition; no automatic trigger, no service registration. Existing TaskRun is reused subsequently. Do not implement multiple selectable modes. Boot/Signin service is a separate pre-login feature and stays.

Existing UI: DesktopSettings.vue allowElevated/allowVirtualDisplay/allowUnlock explanatory paragraphs at95/97/100; RemoteDesktopWindow.vue elevated/virtual startup fallback at974/975; TUI settings/desktopSettings.ts3labels. Existing permissions and save behavior unchanged. setupMessage is already rendered in both Web/TUI and can carry backend setup status. No independent desktop-assistant desktop setting/install route found in src/assets; unrelated OCR/transcription/service text stays.

Shared copy: protocol/desktopProtected.ts desktopProtectedFailureMessage default includes install/update service; backend owns the code/schema decisions, UI may own only copy after agreement (legacy failure codes unchanged). server unlockFailure.ts and Relay startup copy are backend ownership.

Docs: remote-desktop.md active unlock install/uninstall/update procedure, UAC section, virtual driver integration and later protected media text need current-helper wording. Existing signin sections/desktop-signin-service.md must not be bulk-replaced. Historical evidence stays historical; no claim newly tested Task bootstrap before actual verification.

Minimal proposal: keep allow* permission controls/IDs, no added mode/settings. Explain helper runs only while the Soda server runs and initial Windows permission confirmation occurs on shared PC. Reuse setupMessage; add no new button unless backend formal authorization contract requires a local explicit preparation action. User-facing settings need not mention Task implementation internals. Document retained Task definition vs live helper lifetime accurately after choice.

Verification after fixed contract: meaningful settings/save regression for unchanged permissions and updated setup guidance, TUI labels, shared fixed error message. Old runtime negative and exact source restoration; generated browser only where useful. Final cross-context review mandatory. Backend performs final combined build once, no duplicate author wholebuild.


Fixed entry: powershell.exe -NoProfile -File .\scripts\remote-desktop\prepare-desktop-helper.ps1. OwnerSid optional for explicit normal-user binding; ValidateOnly compile/pure only and no UAC/registration/start; Uninstall only this Task/helper after server stop. Prepare never starts broker; permission re-save or server restart activates existing lease. Unprepared/cancelled still permits ordinary sharing. New namespace SodaDesktopRuntime is independent from old SodaDesktopUnlock; no automatic old service stop/delete. Boot/Signin preserved. Backend setupMessage includes resolved trusted Windows prepare path as display-only command, then permission-save guidance.

Lifetime wording is server lifetime, not TUI lifetime; noargs soda may leave server running after TUI exits. Docs link stop_server/manual serve Ctrl+C/supported session stop. Runtime controls/permissions unchanged, existing setupMessage reused, no launch button/RPC/field/mode.
