// Pure evidence validation. Missing evidence is never a successful stop or UAC receive.
export function evaluateB(v){
 const issues=[];const require=(ok,label)=>{if(!ok)issues.push(label);};
 require(v.scenario==='B','scenario');for(const key of ['preLockToneStreak','preLockToneWallMs','captureBufferFrames','quietFrames','quietWallMs','postQuietToneFrames','afterRestoreQuietFrames','afterRestoreQuietWallMs'])require(typeof v[key]==='number'&&Number.isFinite(v[key]),'numeric-'+key);require(v.generatedOnly===true&&v.rawAudioStored===false,'generated-only');require(v.cadenceOk===true,'generated-cadence');
 require(v.scopeStable===true&&v.receiverNormal===true&&v.actorNormal===true,'same-owner-normal-scope');
 require(v.nativeSource?.backend==='windows-gdi'&&v.nativeSource?.mode==='elevated-default'&&v.nativeSource?.synthetic===false,'actual-native-default');
 require(v.baselineOk===true&&v.preLockToneStreak>=40&&v.preLockToneWallMs>=780,'pre-lock-audio');
 require(Number.isFinite(v.nativeLockAtMs)&&v.lockState===0,'actual-lock');
 require(Number.isFinite(v.finalToneGeneratedAtMs)&&v.finalToneGeneratedAtMs-v.nativeLockAtMs>=500,'lock-before-generated-end');
 require(v.resourceEpochObserved===true&&v.resourceEpochInvalidated===true&&v.epochInvalidationReason==='channel-terminal-or-closed','exact-resource-epoch');
 require(v.actorPhysicalRetired===true&&v.staleEpochAccepted===false,'actor-retirement');
 require(Number.isInteger(v.captureBufferFrames)&&v.captureBufferFrames>0&&v.captureBufferFrames<=48000,'capture-buffer');
 require(Number.isFinite(v.quietStartAtMs)&&v.quietStartAtMs>=v.nativeLockAtMs&&v.quietStartAtMs-v.nativeLockAtMs<=2500+v.captureBufferFrames/48,'bounded-drain');
 require(v.quietFrames>=100&&v.quietWallMs>=1980&&v.postQuietToneFrames===0,'actual-quiet');
 require(v.restoredUnlocked===true&&v.restoredDefault===true,'fresh-restore');
 require(v.oldStreamProbeAttempted===true&&(v.oldStreamClosed===true||v.oldStreamRejected===true)&&v.oldTicketReplayRejected===true&&v.oldStreamReactivated===false&&v.oldActorReappeared===false&&v.afterRestoreQuietFrames>=100&&v.afterRestoreQuietWallMs>=1980,'old-stream-not-restored');
 require(v.cleanupConfirmed===true,'cleanup');return{ok:issues.length===0,issues,nativeDesktopEpochKnown:false,epochBasis:'resource-grant',renderBufferMeasured:false};
}
export function evaluateC(v){
 const issues=[];const require=(ok,label)=>{if(!ok)issues.push(label);};
 require(v.scenario==='C'&&v.generatedOnly===true&&v.rawAudioStored===false,'generated-only');
 require(v.receiverNormal===true&&v.actorNormal===true&&v.scopeStable===true,'same-owner-normal-scope');
 require(v.ownUacRequestProven===true&&v.nativeSource?.backend==='windows-gdi'&&v.nativeSource?.mode==='elevated-uac'&&v.nativeSource?.secureDesktop===true&&v.nativeSource?.protectedMicrophone===true&&v.nativeSource?.synthetic===false,'actual-owned-uac-source');
 require(v.baselineOk===true&&v.receiverOk===true&&v.cadenceOk===true,'received-six-seconds');
 require(v.ownPromptResolved===true&&v.ownNoopRetired===true&&v.restoredDefault===true&&v.restoredUnlocked===true,'own-prompt-recovery');
 require(v.cleanupConfirmed===true,'cleanup');return{ok:issues.length===0,issues};
}
export function receiverScope(self,owner,scenario){return['B','C'].includes(scenario)&&self.system===false&&owner.system===false&&self.elevated===false&&owner.elevated===false&&typeof self.owner==='string'&&self.owner.length>0&&self.owner===owner.owner&&typeof self.logon==='string'&&self.logon.length>0&&self.logon===owner.logon&&self.session>0&&self.session===owner.session&&self.active===self.session&&owner.active===owner.session&&(scenario==='B'?[0,1].includes(self.lock)&&[0,1].includes(owner.lock):self.lock===1&&owner.lock===1);}
