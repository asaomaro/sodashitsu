# Native microphone final aggregate diagnostics

Base f6579383. Product changes are internal only:WindowsDesktopMicrophone/WindowsUserMicrophoneRole and DesktopProtectedMicrophone. No public mic/RPC/UI schema changes. Allowed/Alive/expiry evaluation order and count,wire expiry150ms native bound,100ms packet expiry,60ms wait,capacity/headroom/stop/zeroization and public stop status order remain. Counters record the original decisions only. maxReadInterarrivalMs uses one monotonic stamp per complete packet,first excluded. maxWriteMs reuses the existing Write stopwatch.

## Contract

version1 plus capacityKnown/capacityFrames(nullable),eight count fields(packetReadCount,entryExpiredCount,writeAttempts,pcmCommitCount,paddingZeroCount,prefixFrames,writeExpiryRejectedCount,silentReleaseCount),maxWriteMs(nullable),maxReadInterarrivalMs(nullable),saturated. Counts0..Int32.MaxValue saturate without wrap;time invalid/outside0..100000 marks saturated. Nullablecapacity is unknown until a successfully constructed native sink supplies capacity960..48000. maxWrite is null forzero attempts;read interval null before2completepackets. Commit means successful ReleaseBuffer after PCM copy,not downstream playback proof. Prefix is counted only on that successful commit.

Role snapshots only after Dispose/join. The existing closed core(type/id/nonce) accepts old3keys or new4keys with stats;unknown envelope keys/core mismatch remain rejected. Invalid/unknown stats drop metadata while the same exact core still supplies its original retirement receipt. No extra permission/retirement success is inferred from stats.

Provider freezes valid scalar stats,retains at most1stream only after child physical close,preparation/binary retirement and resource release. Getter requires exact accepted ID/no active stream,30s TTL;next accepted start clears. Saturated/missing/invalid/live/uncertain is undefined,never zero. Public stop ACK and resources cleanup behavior remain unchanged.

## Evidence

- Old provider/native/role substituted individually from f657:each selected regression command exit1;rawnegative logs committed. Source bytes were durably saved under git-common recovery and restored finally.
- restoration.json records all3 old/new SHA and byteExact=true.
- Restored provider12cases PASS and source-bound native8+existingheadroom5=13 PASS. These generated branch/arithmetic tests translate only exact native source constructs;they are NOT actual C#/COM execution.
- Changed production/test TypeScript strict check exit0 (exactOptionalPropertyTypes/noUncheckedIndexedAccess included).
- Existing WindowsMicrophoneRenderChecks.cs additionally reflects only internal Statistics (no microphone instance) to verify14snapshot properties,unknown nullable,packetcount/firstreadnull/interarrival,counterincrease/saturation,finite/invalid duration handling. Existing success5field JSON unchanged. Actual C#compile/pure remains Root gate,not claimed here.
- Production server build completed once at sourceHEAD eb47add505d098d7ca0c76c673a3ce510e273aed:tsc-b,assistant-host bundle and prune all exit0 on Node24.22.2/8GiB in214.513s.1869server artifacts are sealed in server-dist-sha256.json(mapSHA ee4ffb45950491e3716b4d6fd126558cb73a1c7afb527005888178ce11620cdc). Compared with existing main-live dist:4 ProtectedMic outputs changed plus1 declarationmap-only difference in unchanged ResourceProcesses source;no added/deleted artifacts. No duplicate full repository tests.
- Independent final source review of eb47 completed:no must/should findings;7fixed sourceSHA/3negative byteExact/25restored checks/strict0 independently verified. Final productionbuild artifact receipt submitted for independent evidence closure. Author Windows/native/COM/audio/model execution0.

## Deployment

Fresh normal-user role DLL is compiled from these NativeMic+Role sources with the existing source-SHA/preflight route;SYSTEM service unchanged. Combined server parser+new C#assets must deploy together. Root must freshcompile A8/3+BC12/7 and the existing3source render-check wrapper using newpins;oldbins fail their raw source receipts. Fixture observer/newdiagnostic receipt and reader are separate UI-owned work;these files are not edited here. NewNative normalizedSHA is recorded in source-sha256.json.
