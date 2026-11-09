// Pure reference/calibration for Receiver.cs. Frame arrays are ephemeral generated data.
export const LIMITS=Object.freeze({baselineMs:2000,baselineRms:10,baselineTone:10,minToneRms:4000,maxToneRms:7000,minToneMagnitude:6500,maxToneMagnitude:9500,minTotal:290,minWallMs:5700,minStreak:280,minStreakWallMs:5500,maxGapMs:60});
export function metrics(samples){
 if(samples.length!==960||!samples.every(Number.isFinite))throw Error('window-shape');
 let square=0,sin=0,cos=0,peak=0,clips=0;
 for(let n=0;n<960;n++){const v=samples[n],angle=2*Math.PI*997*n/48000;square+=v*v;sin+=v*Math.sin(angle);cos+=v*Math.cos(angle);peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>=32767)clips++;}
 return{rms:Math.sqrt(square/960),magnitude:2*Math.hypot(sin,cos)/960,peak,clips};
}
export class Detector {
 baseline=0;tone=0;firstTone;lastTone;previous;streak=0;streakStart=0;continuous=false;baselineBad=false;maxGap=0;discontinuities=0;maxLeftRms=0;maxRightRms=0;maxLeftTone=0;maxRightTone=0;clipped=0;
 continuity={captureFlagsObserved:false,maxStreakFrames:0,maxStreakWallMs:0,nonToneResetCount:0,brokenResetCount:0,gapResetCount:0,baselineBrokenWindows:0,baselineGapWindows:0,toneBrokenWindows:0,toneGapWindows:0,toneNonToneWindows:0,firstToneAtMs:null,lastToneAtMs:null,firstResetAtMs:null,lastResetAtMs:null,baselineDataFlags:0,baselineTimestampFlags:0,toneDataFlags:0,toneTimestampFlags:0,baselineSilentPackets:0,toneSilentPackets:0,resetObservations:[],resetObservationsOmitted:0,firstBaselineFlagAtMs:null,lastBaselineFlagAtMs:null,firstTonePhaseFlagAtMs:null,lastTonePhaseFlagAtMs:null};
 observeCaptureFlags(flags,wallMs,{baseline=false}={}){this.continuity.captureFlagsObserved=true;if(flags&2){if(baseline)this.continuity.baselineSilentPackets++;else this.continuity.toneSilentPackets++;}if(!(flags&5))return;const c=this.continuity;if(baseline){if(flags&1)c.baselineDataFlags++;if(flags&4)c.baselineTimestampFlags++;c.firstBaselineFlagAtMs??=wallMs;c.lastBaselineFlagAtMs=wallMs;}else{if(flags&1)c.toneDataFlags++;if(flags&4)c.toneTimestampFlags++;c.firstTonePhaseFlagAtMs??=wallMs;c.lastTonePhaseFlagAtMs=wallMs;}}
 accept(left,right,wallMs,{baseline=false,discontinuity=false}={}){
  if(!Number.isFinite(wallMs)||wallMs<0||this.previous!==undefined&&wallMs<this.previous)throw Error('wall-order');
  const l=metrics(left),r=metrics(right),gap=this.previous===undefined?0:wallMs-this.previous;this.previous=wallMs;this.maxGap=Math.max(this.maxGap,gap);if(discontinuity)this.discontinuities++;
  if(baseline){if(discontinuity)this.continuity.baselineBrokenWindows++;if(gap>60)this.continuity.baselineGapWindows++;this.baseline++;if(Math.max(l.rms,r.rms)>10||Math.max(l.magnitude,r.magnitude)>10)this.baselineBad=true;this.streak=0;return;}
  this.maxLeftRms=Math.max(this.maxLeftRms,l.rms);this.maxRightRms=Math.max(this.maxRightRms,r.rms);this.maxLeftTone=Math.max(this.maxLeftTone,l.magnitude);this.maxRightTone=Math.max(this.maxRightTone,r.magnitude);this.clipped+=l.clips+r.clips;
  const tone=l.rms>=4000&&l.rms<=7000&&l.magnitude>=6500&&l.magnitude<=9500&&l.clips===0;
  const c=this.continuity;if(!tone)c.toneNonToneWindows++;if(discontinuity)c.toneBrokenWindows++;if(gap>60)c.toneGapWindows++;
  if(this.streak>0&&(!tone||discontinuity||gap>60)){if(c.resetObservations.length<8)c.resetObservations.push({wallMs:wallMs,precedingStreakFrames:this.streak,precedingStreakWallMs:this.lastTone-this.streakStart,leftRms:l.rms,rightRms:r.rms,left997Magnitude:l.magnitude,right997Magnitude:r.magnitude,leftClips:l.clips,rightClips:r.clips,failureMask:(l.rms<4000?1:0)|(l.rms>7000?2:0)|(l.magnitude<6500?4:0)|(l.magnitude>9500?8:0)|(l.clips!==0?16:0)|(discontinuity?32:0)|(gap>60?64:0)});else c.resetObservationsOmitted++;if(!tone)c.nonToneResetCount++;if(discontinuity)c.brokenResetCount++;if(gap>60)c.gapResetCount++;c.firstResetAtMs??=wallMs;c.lastResetAtMs=wallMs;}
  if(!tone||discontinuity||gap>60){this.streak=0;if(!tone)return;}
  this.tone++;this.firstTone??=wallMs;this.lastTone=wallMs;if(this.streak++===0)this.streakStart=wallMs;
  if(this.streak>=280&&wallMs-this.streakStart>=5500)this.continuous=true;
  c.firstToneAtMs??=wallMs;c.lastToneAtMs=wallMs;if(this.streak>c.maxStreakFrames||this.streak===c.maxStreakFrames&&wallMs-this.streakStart>c.maxStreakWallMs){c.maxStreakFrames=this.streak;c.maxStreakWallMs=wallMs-this.streakStart;}
 }
 result(){const span=this.firstTone===undefined?0:this.lastTone-this.firstTone;return{ok:this.baseline>=90&&!this.baselineBad&&this.tone>=290&&span>=5700&&this.continuous&&this.clipped===0,baselineFrames:this.baseline,baselineBad:this.baselineBad,toneFrames:this.tone,toneWallSpanMs:span,continuousThresholdMet:this.continuous,maximumReadGapMs:this.maxGap,captureDiscontinuities:this.discontinuities,maxLeftRms:this.maxLeftRms,maxRightRms:this.maxRightRms,maxLeft997Magnitude:this.maxLeftTone,maxRight997Magnitude:this.maxRightTone,clipCount:this.clipped,continuity:{...this.continuity,resetObservations:this.continuity.resetObservations.map(v=>({...v})),...(!this.continuity.captureFlagsObserved?{baselineDataFlags:null,baselineTimestampFlags:null,toneDataFlags:null,toneTimestampFlags:null,baselineSilentPackets:null,toneSilentPackets:null}:{})},rawAudioStored:false};}
}
