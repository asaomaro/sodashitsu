# 検証（entry段階）

- 初期のbuild成功。metadata分離後のbuildで移した定数のimport漏れを検出・修正した。server/cliを再build済み。
- 関連entry/controller/packageの22件成功（entry7件を含む）。機能の実起動・録音・OS入力・service/driver変更はしていない。
- 旧entry2ファイルだけを復元し、buildし直した負例: 7件中5件が失敗、2件成功。終了後にbyte一致で元へ戻し、両packageを再buildした。

## 負例の生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-assistant-settings

 ❯ |@sodashitsu/cli| src/entryLoading.test.ts (7 tests | 5 failed) 3872ms
   × packages/server/dist/main.js help never loads optional feature implementations 849ms
   × packages/cli/dist/main.js help never loads optional feature implementations 498ms
   × skill selects only its command module without starting desktop, preview or work-agent implementations 432ms
   × assistant status reads only metadata while disabled 838ms
   × an unavailable server implementation cannot break an unrelated help command 257ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > packages/server/dist/main.js help never loads optional feature implementations
AssertionError: expected [ …(79) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantLaunchController.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/ManagedAssistant.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantPackageState.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantEnabledState.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantPackage.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantZip.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/WorkerPtyBackend.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/WindowsServerSupervisor.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/NodePtyBackend.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/AdoptedPtyProcess.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/nodePtyNative.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/socketReading.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/composeServer.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantDisabledDevices.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantAudioUploads.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/CodexAudio.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeHelpers.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/bridgeRpc.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopSettings.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativePlatform.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopFiles.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeFiles.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeSources.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/desktopFilePaths.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopFolders.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopFolderSnapshot.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopCompanion.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopRelay.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopAgentAccess.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/unlockFailure.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopCursorStream.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopVideoLanes.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopEndpointService.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopEndpointDrain.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopEndpointStore.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopEndpointBackplane.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopEndpointAgentRpc.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopEndpointRelay.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopProvider.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativePcmPath.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopAudioPipes.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeSelection.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopWindowsPowerShell.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopPointerWitness.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopInteractiveOwner.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopResourceChannel.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopFolderCheckpoints.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopTransferStore.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopFileCheckpoints.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopMicrophone.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopRichClipboard.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopSharedCapture.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopSharedClipboard.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopSharedAudio.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeAudio.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopPcmStream.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopSharedNative.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeVideo.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeResolution.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeQuality.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopNativeDatagrams.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopInputAcks.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopUnlockLease.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopCdpLauncher.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopCdpRelay.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopCdpPeer.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/DesktopCdpDevices.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/pty/shellCwdTracking.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantApps.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantAudioMethods.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/SourceTarget.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/preview/ManagedPreviewHelpers.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/preview/LocalPreviewProbe.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/VscodeSharingSettings.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/desktop/BundledVscodeLauncher.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/preview/PreviewService.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/preview/PreviewStreams.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantSessions.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/savedBinding.js",
+ ]

 ❯ src/entryLoading.test.ts:24:19


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > packages/cli/dist/main.js help never loads optional feature implementations
AssertionError: expected [ …(30) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/desktopNativeHelper.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/desktopIdentity.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/workAgent.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentTerminal.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/attach.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentRun.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentIo.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentMcp.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/exec.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/work.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/desktop.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/machineDelegation.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/preview.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/sessionTools.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/pluginApp.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/ext.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agent.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/pane.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/workspace.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentUsage.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentIntegrations.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentFork.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentStart.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/ask.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/display.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/graph.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/sessionStream.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/tab.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/session.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/pluginPackage.js",
+ ]

 ❯ src/entryLoading.test.ts:24:19


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > skill selects only its command module without starting desktop, preview or work-agent implementations
AssertionError: expected [ …(30) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/desktopNativeHelper.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/desktopIdentity.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/workAgent.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentTerminal.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/attach.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentRun.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentIo.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/workAgentMcp.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/exec.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/work.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/desktop.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/machineDelegation.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/preview.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/sessionTools.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/pluginApp.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/ext.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agent.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/pane.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/workspace.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentUsage.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentIntegrations.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentFork.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/agentStart.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/ask.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/display.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/graph.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/sessionStream.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/tab.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/commands/session.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/cli/dist/pluginPackage.js",
+ ]

 ❯ src/entryLoading.test.ts:29:125
     27|  const result=await execute("packages/cli/dist/main.js",["skill"]);exp…
     28|  expect(result.modules.some(url=>url.endsWith("/packages/cli/dist/skil…
     29|  expect(result.modules.filter(url=>/\/packages\/cli\/dist\/(?:commands…
       |                                                                                                                             ^
     30| });
     31|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > assistant status reads only metadata while disabled
AssertionError: expected [ …(8) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantLaunchController.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/ManagedAssistant.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantPackage.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantZip.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/composeServer.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantAudioUploads.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/CodexAudio.js",
+   "file:///workspaces/sodashitsu-assistant-settings/packages/server/dist/assistant/AssistantSessions.js",
+ ]

 ❯ src/entryLoading.test.ts:35:241


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  |@sodashitsu/cli| src/entryLoading.test.ts > an unavailable server implementation cannot break an unrelated help command
AssertionError: 
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^
Error: generated unavailable feature module
    at load (file:///tmp/soda-entry-load-vLPEC7/loader.mjs:2:144)
    at nextLoad (node:internal/modules/esm/hooks:785:28)
    at AsyncLoaderHooksOnLoaderHookWorker.load (node:internal/modules/esm/hooks:410:26)
    at MessagePort.handleMessage (node:internal/modules/esm/worker:251:24)
    at [nodejs.internal.kHybridDispatch] (node:internal/event_target:843:20)
    at MessagePort.<anonymous> (node:internal/per_context/messageport:23:28)

Node.js v24.15.0
: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ load ../../../../tmp/soda-entry-load-vLPEC7/loader.mjs:2:144
 ❯ execute src/entryLoading.test.ts:17:77
     15|  try {
     16|   const code=await new Promise<number|null>((resolve,reject)=>{child.o…
     17|   expect(timeout,"entry did not terminate").toBe(false);expect(code,er…
       |                                                                             ^
     18|   return {output,errors,modules:(await readFile(log,"utf8")).trim().sp…
     19|  }finally {clearTimeout(timer);child.kill();await rm(directory,{recurs…
 ❯ src/entryLoading.test.ts:44:15

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  1 failed (1)
      Tests  5 failed | 2 passed (7)
   Start at  09:32:45
   Duration  3.99s (tests 99%, transform 1%)


```

全体build/typecheck成功。全体試験は905ファイル・13132件成功（353.57秒）。独立最終レビュー2名とworkflow delta点検で追加指摘なし。PR/CI/main着地はこの記録時点で未完了。

ログ: `/tmp/soda-lazy-entry-all.log`、`/tmp/soda-lazy-entry-typecheck.log`。
